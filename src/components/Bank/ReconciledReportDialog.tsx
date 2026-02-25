import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2, FileText, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ReconciledReportDialogProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  bankAccounts: any[];
  initialBankId?: string;
}

export function ReconciledReportDialog({ isOpen, onClose, bankAccounts, initialBankId }: ReconciledReportDialogProps) {
  const [selectedBankId, setSelectedBankId] = useState<string>(initialBankId || "");

  useEffect(() => {
    if (initialBankId) {
      setSelectedBankId(initialBankId);
    }
  }, [initialBankId]);
  const [startDate, setStartDate] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd")
  );
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<{
    openingBalance: number;
    closingBalance: number;
    transactions: any[];
    bankDetails: any;
  } | null>(null);

  const handleGenerateReport = async () => {
    if (!selectedBankId) return;

    setLoading(true);
    try {
      const bank = bankAccounts.find(b => b.id === selectedBankId);
      
      // 1. Calculate Opening Balance (Account Opening + All approved transactions BEFORE startDate)
      // EXCLUDE 'opening_balance' type transactions from the sum to avoid double counting if they are approved
      // (The Account Opening Balance is separate)
      
      const { data: priorTx } = await supabase
        .from("transactions")
        .select("total_amount, transaction_type")
        .eq("bank_account_id", selectedBankId)
        .eq("status", "approved")
        .lt("transaction_date", startDate)
        .neq("transaction_type", "opening_balance")
        .not("description", "ilike", "%opening balance%");

      const priorSum = (priorTx || []).reduce((sum, tx) => sum + Number(tx.total_amount), 0);
      const openingBalance = Number(bank.opening_balance) + priorSum;

      // 2. Fetch Transactions in Period
      const { data: periodTx } = await supabase
        .from("transactions")
        .select("*")
        .eq("bank_account_id", selectedBankId)
        .eq("status", "approved")
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .neq("transaction_type", "opening_balance")
        .not("description", "ilike", "%opening balance%")
        .order("transaction_date", { ascending: true });

      const transactions = periodTx || [];
      const periodSum = transactions.reduce((sum, tx) => sum + Number(tx.total_amount), 0);
      const closingBalance = openingBalance + periodSum;

      setReportData({
        openingBalance,
        closingBalance,
        transactions,
        bankDetails: bank
      });

    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!reportData) return;

    const doc = new jsPDF();
    const { bankDetails, openingBalance, closingBalance, transactions } = reportData;

    // Header
    doc.setFontSize(18);
    doc.setTextColor(0, 112, 173); // Brand Blue
    doc.text("Bank Reconciliation Report", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 28);

    // Bank Details
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Bank Account: ${bankDetails.bank_name} - ${bankDetails.account_name}`, 14, 40);
    doc.text(`Period: ${format(new Date(startDate), "dd/MM/yyyy")} to ${format(new Date(endDate), "dd/MM/yyyy")}`, 14, 46);

    // Summary Box
    doc.setDrawColor(200);
    doc.setFillColor(245, 247, 250);
    doc.rect(14, 55, 180, 25, 'FD');
    
    doc.setFontSize(10);
    doc.text("Opening Balance:", 20, 65);
    doc.text(`R ${openingBalance.toFixed(2)}`, 160, 65, { align: "right" });
    
    doc.text("Net Movement:", 20, 72);
    doc.text(`R ${(closingBalance - openingBalance).toFixed(2)}`, 160, 72, { align: "right" });

    doc.setFont("helvetica", "bold");
    doc.text("Closing Balance:", 20, 79);
    doc.text(`R ${closingBalance.toFixed(2)}`, 160, 79, { align: "right" });
    doc.setFont("helvetica", "normal");

    // Transactions Table
    const tableData = transactions.map(tx => [
      format(new Date(tx.transaction_date), "dd/MM/yyyy"),
      tx.description,
      tx.reference_number || "-",
      tx.transaction_type || "Standard",
      `R ${Number(tx.total_amount).toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: 90,
      head: [["Date", "Description", "Reference", "Type", "Amount"]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 112, 173], textColor: 255 },
      styles: { fontSize: 8 },
      columnStyles: {
        4: { halign: 'right' }
      }
    });

    doc.save(`Reconciliation_Report_${bankDetails.account_name}_${startDate}_${endDate}.pdf`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reconciled Report</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row gap-4 p-4 bg-muted/20 rounded-lg">
          <div className="grid gap-1.5 w-full md:w-1/3">
            <Label>Bank Account</Label>
            <Select value={selectedBankId} onValueChange={setSelectedBankId}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Select Bank" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 w-full md:w-1/4">
            <Label>From Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white" />
          </div>
          <div className="grid gap-1.5 w-full md:w-1/4">
            <Label>To Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-white" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleGenerateReport} disabled={!selectedBankId || loading} className="w-full md:w-auto">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Generate
            </Button>
          </div>
        </div>

        {reportData && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4 p-4 border rounded-md bg-slate-50">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Opening Balance</p>
                <p className="font-mono font-medium text-lg">R {reportData.openingBalance.toFixed(2)}</p>
              </div>
              <div className="text-center border-x border-slate-200">
                <p className="text-sm text-muted-foreground">Net Movement</p>
                <p className={`font-mono font-medium text-lg ${(reportData.closingBalance - reportData.openingBalance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  R {(reportData.closingBalance - reportData.openingBalance).toFixed(2)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Closing Balance</p>
                <p className="font-mono font-bold text-lg text-blue-700">R {reportData.closingBalance.toFixed(2)}</p>
              </div>
            </div>

            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-700 border-b border-slate-800">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="text-white">Date</TableHead>
                    <TableHead className="text-white">Description</TableHead>
                    <TableHead className="text-white">Reference</TableHead>
                    <TableHead className="text-white">Type</TableHead>
                    <TableHead className="text-right text-white">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No approved transactions found in this period.</TableCell>
                    </TableRow>
                  ) : (
                    reportData.transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{format(new Date(tx.transaction_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{tx.description}</TableCell>
                        <TableCell className="font-mono text-xs">{tx.reference_number}</TableCell>
                        <TableCell className="text-xs">{tx.transaction_type}</TableCell>
                        <TableCell className={`text-right font-mono ${tx.total_amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {tx.total_amount.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleDownloadPDF} className="bg-red-600 hover:bg-red-700">
                <Download className="mr-2 h-4 w-4" /> Download PDF Report
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
