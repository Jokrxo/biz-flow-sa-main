import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { emitDashboardCacheInvalidation } from "@/stores/dashboardCache";
import { useToast } from "@/hooks/use-toast";
import { validateTransactionDate } from "@/lib/transactions-api";

interface TaxPeriod {
  id: string;
  company_id: string;
  period_name: string;
  period_type: string;
  start_date?: string;
  end_date?: string;
  period_start?: string;
  period_end?: string;
  vat_input_total?: number;
  vat_output_total?: number;
  vat_payable?: number;
  status: string;
}

export const TaxReturns = () => {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<TaxPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [settleId, setSettleId] = useState<string>("");
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; bank_name: string; account_name: string }>>([]);
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [settlementNet, setSettlementNet] = useState<number>(0);
  const [settlementLabel, setSettlementLabel] = useState<string>("");

  const [form, setForm] = useState({
    period_type: "vat",
    period_name: "",
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    end_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10)
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);
      await loadPeriods(profile.company_id);
      const channel = (supabase as any)
        .channel("tax-returns")
        .on("postgres_changes", { event: "*", schema: "public", table: "tax_periods" }, () => loadPeriods(profile.company_id))
        .subscribe();
      return () => { (supabase as any).removeChannel(channel) };
    };
    init();
  }, []);

  const loadPeriods = async (cid: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("tax_periods")
      .select("id, company_id, period_name, period_type, start_date, end_date, period_start, period_end, vat_input_total, vat_output_total, vat_payable, status")
      .eq("company_id", cid)
      .order("start_date", { ascending: false });
    setPeriods((data || []) as any);
    setLoading(false);
  };

  const createPeriod = async () => {
    try {
      if (!companyId) return;
      const payload = {
        company_id: companyId,
        period_name: form.period_name || `${new Date(form.start_date).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}`,
        period_type: form.period_type,
        start_date: form.start_date,
        end_date: form.end_date,
        status: "open"
      } as any;
      payload.status = "open";
      const { error } = await supabase.from("tax_periods").insert(payload);
      if (error) {
        const payloadAlt = {
          company_id: companyId,
          period_name: payload.period_name,
          period_type: payload.period_type,
          period_start: form.start_date,
          period_end: form.end_date,
          status: "open"
        } as any;
        const { error: err2 } = await supabase.from("tax_periods").insert(payloadAlt);
        if (err2) {
          payloadAlt.status = "open";
          const { error: err3 } = await supabase.from("tax_periods").insert(payloadAlt);
          if (err3) throw err3;
        }
      }
      try {
        const { data: recent } = await supabase
          .from("tax_periods")
          .select("id")
          .eq("company_id", companyId)
          .eq("period_type", form.period_type)
          .order("created_at", { ascending: false })
          .limit(1);
        const newId = (recent && recent[0]?.id) ? String(recent[0].id) : "";
        if (newId) await computePeriod(newId);
      } catch {}
      toast({ title: "Success", description: "Tax period created" });
      setCreateOpen(false);
      await loadPeriods(companyId);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const computePeriod = async (id: string) => {
    try {
      const { data, error } = await supabase.rpc("settle_vat_period", { _tax_period_id: id });
      if (error) {
        const period = periods.find(p => p.id === id);
        if (!period) throw error;
        const start = String((period.start_date || period.period_start || '')).slice(0, 10);
        const end = String((period.end_date || period.period_end || '')).slice(0, 10);
        const { data: entries } = await supabase
          .from("transaction_entries")
          .select("debit, credit, transactions!inner(transaction_date, company_id, status), chart_of_accounts(account_name, account_code)")
          .eq("transactions.company_id", companyId)
          .gte("transactions.transaction_date", start)
          .lte("transactions.transaction_date", end)
          .in("transactions.status", ["pending","approved","posted"]);
        let output = 0, input = 0;
        (entries || []).forEach((e: any) => {
          const name = String(e.chart_of_accounts?.account_name || "").toLowerCase();
          const code = String(e.chart_of_accounts?.account_code || "");
          const debit = Number(e.debit || 0);
          const credit = Number(e.credit || 0);
          const isVatOut = name.includes("vat output") || name.includes("vat payable") || code === "2200";
          const isVatIn = name.includes("vat input") || name.includes("vat receivable") || code === "1210" || name.includes("vat") && !isVatOut;
          if (isVatOut) output += Math.max(0, credit - debit);
          if (isVatIn) input += Math.max(0, debit - credit);
        });
        const net = input - output;
        await supabase.from("tax_periods").update({ vat_input_total: input, vat_output_total: output, vat_payable: net }).eq("id", id);
      }
      toast({ title: "Computed", description: "VAT totals updated" });
      await loadPeriods(companyId);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const fileReturn = async (id: string) => {
    try {
      const { error } = await supabase.from("tax_periods").update({ status: "closed" }).eq("id", id);
      if (error) throw error;
      toast({ title: "Filed", description: "Tax return marked as filed" });
      await loadPeriods(companyId);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openSettlement = async (id: string) => {
    setSettleId(id);
    const { data } = await supabase
      .from("bank_accounts")
      .select("id, bank_name, account_name")
      .eq("company_id", companyId);
    setBankAccounts((data || []) as any);
    const period = periods.find(p => p.id === id);
    const net = Number(period?.vat_payable || 0);
    const label = net > 0 ? 'Payable' : net < 0 ? 'Refundable' : 'Settled';
    setSettlementNet(Math.abs(net));
    setSettlementLabel(label);
    setBankDialogOpen(true);
  };

  const postSettlement = async () => {
    try {
      if (!settleId || !bankAccountId) { toast({ title: "Select bank account", variant: "destructive" }); return; }
      const period = periods.find(p => p.id === settleId);
      if (!period) return;
      const amount = Number(period.vat_payable || 0);
      const total = Math.abs(amount);
      if (!(total > 0)) { toast({ title: 'No Amount', description: 'Net VAT is zero for this period', variant: 'destructive' }); return; }

      // Resolve bank ledger account (chart_of_accounts asset)
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_name, account_type, account_code, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true);
      const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
      const pickBank = () => {
        const byCode = list.find(a => a.type === 'asset' && a.code === '1100');
        if (byCode) return byCode.id;
        const byName = list.find(a => a.type === 'asset' && (a.name.includes('bank') || a.name.includes('cash')));
        return byName?.id || '';
      };
      let bankLedgerId = pickBank();
      if (!bankLedgerId) {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true })
          .select('id')
          .single();
        bankLedgerId = (created as any)?.id || '';
      }
      const { data: vatOut } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", companyId)
        .or("account_code.eq.2200,account_name.ilike.%VAT Payable%,account_name.ilike.%VAT Output%")
        .limit(1);
      const { data: vatIn } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", companyId)
        .or("account_code.eq.1210,account_name.ilike.%VAT Input%,account_name.ilike.%VAT Receivable%")
        .limit(1);
      const vatPayableId = (vatOut && vatOut[0]?.id) || (vatIn && vatIn[0]?.id) || null;
      if (!vatPayableId) { toast({ title: "VAT account missing", description: "Create VAT accounts in Chart of Accounts", variant: "destructive" }); return; }

      const isPayment = amount > 0;
      const txnDesc = isPayment ? `VAT Settlement Payment ${period.period_name}` : `VAT Refund ${period.period_name}`;

      await validateTransactionDate(companyId, paymentDate);

      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          company_id: companyId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          transaction_date: paymentDate,
          description: txnDesc,
          reference_number: `VAT-${period.id}`,
          total_amount: total,
          bank_account_id: bankAccountId,
          transaction_type: "expense",
          status: "pending"
        })
        .select("id")
        .single();
      if (txErr) throw txErr;

      const entries = isPayment ? [
        { transaction_id: tx.id, account_id: vatPayableId, debit: total, credit: 0, description: txnDesc, status: "approved" },
        { transaction_id: tx.id, account_id: bankLedgerId, debit: 0, credit: total, description: txnDesc, status: "approved" }
      ] : [
        { transaction_id: tx.id, account_id: bankLedgerId, debit: total, credit: 0, description: txnDesc, status: "approved" },
        { transaction_id: tx.id, account_id: vatPayableId, debit: 0, credit: total, description: txnDesc, status: "approved" }
      ];
      const { error: entErr } = await supabase.from("transaction_entries").insert(entries as any);
      if (entErr) throw entErr;
      const { error: updErr } = await supabase.from("transactions").update({ status: "approved" }).eq("id", tx.id);
      if (updErr) throw updErr;

      emitDashboardCacheInvalidation(companyId);

      toast({ title: "Settlement recorded", description: `${settlementLabel}: R ${total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` });
      setBankDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const exportCsv = () => {
    const header = ["Period","Start","End","VAT Input","VAT Output","Net Payable","Status"];
    const lines = periods.map(p => [p.period_name, p.start_date, p.end_date, Number(p.vat_input_total || 0).toFixed(2), Number(p.vat_output_total || 0).toFixed(2), Number(p.vat_payable || 0).toFixed(2), p.status]);
    const csv = [header.join(','), ...lines.map(l => l.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tax-returns.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><FileCheck className="h-5 w-5 text-primary" /> Tax Returns</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(true)}>Create Period</Button>
            <Button variant="outline" onClick={exportCsv}>Export</Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-muted-foreground">Loading tax periods…</div>
        ) : periods.length === 0 ? (
          <div className="py-6 text-muted-foreground">No periods. Create a VAT period to begin.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">VAT Input</TableHead>
                <TableHead className="text-right">VAT Output</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map(p => {
                const net = Number(p.vat_payable || 0);
                const nameDisplay = p.period_name || new Date(p.start_date).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{nameDisplay}</TableCell>
                    <TableCell>{(p.start_date || p.period_start || '')} → {(p.end_date || p.period_end || '')}</TableCell>
                    <TableCell className="text-right">R {Number(p.vat_input_total || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">R {Number(p.vat_output_total || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className={`text-right ${net > 0 ? 'text-primary' : 'text-muted-foreground'}`}>R {net.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'closed' ? 'secondary' : 'default'}>{p.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => computePeriod(p.id)}>Compute</Button>
                        <Button size="sm" variant="outline" onClick={() => openSettlement(p.id)}>Record {net >= 0 ? 'Payment' : 'Refund'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => fileReturn(p.id)}>File</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create VAT Period</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm">Type</label>
              <Select value={form.period_type} onValueChange={(v) => setForm({ ...form, period_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vat">VAT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm">Name</label>
              <Input value={form.period_name} onChange={(e) => setForm({ ...form, period_name: e.target.value })} placeholder="e.g. November 2025" />
            </div>
            <div>
              <label className="text-sm">Start</label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label className="text-sm">End</label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createPeriod}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record VAT Settlement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm">Bank Account</label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(b => (<SelectItem key={b.id} value={b.id}>{b.bank_name} • {b.account_name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm">Date</label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="text-sm text-muted-foreground">Net VAT: R {settlementNet.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} — {settlementLabel}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankDialogOpen(false)}>Cancel</Button>
            <Button onClick={postSettlement}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
