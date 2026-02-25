import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Download, RefreshCw } from "lucide-react";

interface Row {
  date: string;
  type: "PO" | "Payment" | "Deposit" | "Bill" | "Invoice" | "Debit Note";
  reference: string;
  description: string;
  debit: number; // increase liability
  credit: number; // reduce liability
}

export const SupplierStatement = ({ supplierId, supplierName, open, onOpenChange }: { supplierId: string; supplierName: string; open: boolean; onOpenChange: (v: boolean) => void }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState<string>(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  async function loadStatement() {
    if (!supplierId) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setRows([]); setOpeningBalance(0); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const companyId = (profile as any)?.company_id;
      if (!companyId) { setRows([]); setOpeningBalance(0); return; }

      // Fetch processed Purchase Orders (Invoices)
        const { data: pos } = await supabase
          .from('purchase_orders')
          .select('po_number, po_date, total_amount, supplier_id, status, notes')
          .eq('company_id', companyId)
          .eq('supplier_id', supplierId)
          .in('status', ['sent', 'processed', 'partially_paid', 'paid']);

      // Fetch Bills (Invoices)
      const { data: bills } = await supabase
          .from('bills')
          .select('bill_number, bill_date, total_amount, supplier_id, status, notes')
          .eq('company_id', companyId)
          .eq('supplier_id', supplierId)
          .neq('status', 'Draft');
        
      const poRefs = new Set([
        ...(pos || []).map((p: any) => String(p.po_number || '')),
        ...(bills || []).map((b: any) => String(b.bill_number || ''))
      ]);
      
      // Fetch payments, deposits and refunds
      const { data: transAll } = await supabase
        .from('transactions')
        .select('reference_number, transaction_date, total_amount, transaction_type, status, description, supplier_id')
        .eq('company_id', companyId)
        .in('transaction_type', ['payment', 'deposit', 'refund']);

      const relevantTrans = (transAll || []).filter((t: any) => {
        // Include if linked via explicit supplier_id (newest and most accurate)
        if (t.supplier_id === supplierId) return true;

        // Include if linked to a PO
        if (t.reference_number && poRefs.has(t.reference_number)) return true;
        
        // Include if linked via ID in reference (new format)
        if (t.reference_number && t.reference_number.includes(supplierId)) return true;

        // Include if fuzzy match on description (for unallocated deposits/payments)
        if (t.description?.toLowerCase().includes(supplierName.toLowerCase())) return true;
        
        return false;
      });

      const openingPOs = (pos || []).filter((p: any) => p.po_date < startDate).reduce((s: number, p: any) => s + Number(p.total_amount || 0), 0);
      const openingBills = (bills || []).filter((b: any) => b.bill_date < startDate).reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);
      
      const openingPay = relevantTrans.filter((t: any) => t.transaction_date < startDate && t.status !== 'rejected').reduce((s: number, t: any) => s + Number(t.total_amount || 0), 0);
      
      // Opening Balance = (Sum of Processed POs + Bills) + (Sum of Payments/Deposits/Refunds)
      // Payments are negative, so adding them reduces the balance
      setOpeningBalance((openingPOs + openingBills) + openingPay);

      const posInRange = (pos || []).filter((p: any) => p.po_date >= startDate && p.po_date <= endDate).map((p: any) => ({
        date: p.po_date,
        type: 'Invoice' as const, // Display as Invoice since it's processed
        reference: String(p.po_number || ''),
        description: p.notes ? `${p.notes} (${p.status})` : `Invoice ${p.po_number} (${p.status})`,
        debit: Number(p.total_amount || 0),
        credit: 0,
      }));

      const billsInRange = (bills || []).filter((b: any) => b.bill_date >= startDate && b.bill_date <= endDate).map((b: any) => ({
        date: b.bill_date,
        type: 'Invoice' as const,
        reference: String(b.bill_number || ''),
        description: b.notes ? `${b.notes} (${b.status})` : `Bill ${b.bill_number} (${b.status})`,
        debit: Number(b.total_amount || 0),
        credit: 0,
      }));
      
      const transInRange = relevantTrans.filter((t: any) => t.transaction_date >= startDate && t.transaction_date <= endDate && t.status !== 'rejected').map((t: any) => ({
        date: t.transaction_date,
        type: (t.transaction_type === 'refund' ? 'Debit Note' : (t.transaction_type === 'deposit' ? 'Deposit' : 'Payment')) as Row['type'],
        reference: String(t.reference_number || ''),
        description: t.description || (t.transaction_type === 'refund' ? 'Debit Note' : (t.transaction_type === 'deposit' ? 'Deposit' : 'Payment')),
        debit: 0,
        credit: Math.abs(Number(t.total_amount || 0)),
      }));
      const combined = [...posInRange, ...billsInRange, ...transInRange].sort((a, b) => a.date.localeCompare(b.date));
      setRows(combined);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadStatement();
  }, [open, supplierId, startDate, endDate]);

  const closingBalance = useMemo(() => {
    const movement = rows.reduce((s, r) => s + r.debit - r.credit, 0);
    return openingBalance + movement;
  }, [rows, openingBalance]);

  function downloadCSV() {
    const header = ['Date','Type','Reference','Description','Debit','Credit'];
    const lines = rows.map(r => [r.date, r.type, r.reference, r.description, r.debit.toFixed(2), r.credit.toFixed(2)]);
    const csv = [header, ...lines].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Supplier_Statement_${supplierName}_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>Supplier Statement • {supplierName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="text-sm font-medium">Period Selection</div>
            <div className="flex flex-1 items-center gap-2 w-full sm:w-auto">
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full sm:w-auto" />
              <span className="text-muted-foreground">-</span>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full sm:w-auto" />
              <Button variant="outline" size="icon" onClick={loadStatement} disabled={loading}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={downloadCSV} disabled={loading}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center px-2">
              <div className="text-sm text-muted-foreground">Opening Balance</div>
              <div className="font-mono font-medium">R {openingBalance.toFixed(2)}</div>
            </div>
            
            <div className="rounded-md border">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Loading statement...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transactions in this period</TableCell>
                      </TableRow>
                    ) : (
                      rows.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{r.date}</TableCell>
                          <TableCell>{r.type}</TableCell>
                          <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                          <TableCell className="text-muted-foreground">{r.description}</TableCell>
                          <TableCell className="text-right font-mono text-sm">R {r.debit.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">R {r.credit.toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
            
            <div className="flex justify-between items-center px-4 py-3 bg-muted/30 rounded-lg font-medium">
              <div>Closing Balance</div>
              <div className="font-mono text-lg">R {closingBalance.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
