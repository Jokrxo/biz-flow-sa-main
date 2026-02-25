import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Printer, Download, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface BankReportDialogProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
}

export function BankReportDialog({ isOpen, onClose }: BankReportDialogProps) {
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [cashMovementData, setCashMovementData] = useState<any[]>([]);
  const [cashFlowData, setCashFlowData] = useState<{inflows: any[], outflows: any[], totalIn: number, totalOut: number}>({ inflows: [], outflows: [], totalIn: 0, totalOut: 0 });
  const [companyName, setCompanyName] = useState("");
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.company_id) return;

      // Get Company Name
      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("id", profile.company_id)
        .single();
      if (company) setCompanyName(company.name);

      // Get Bank Accounts
      const { data: bankAccounts } = await supabase
        .from("bank_accounts")
        .select("id, account_name, opening_balance, created_at")
        .eq("company_id", profile.company_id);
        
      if (bankAccounts) setBanks(bankAccounts);

      // Helper to calculate transaction effect on bank balance
      const getTransactionEffect = (tx: any) => {
        const amt = Number(tx.total_amount) || 0;
        const type = (tx.transaction_type || '').toLowerCase();
        
        // Explicit Transfers (usually signed correctly in BankManagement, but let's be safe)
        if (type === 'transfer_in') return Math.abs(amt);
        if (type === 'transfer_out') return -Math.abs(amt);
        
        // Known Inflows (Always Positive effect)
        const inflowTypes = [
            'deposit', 'income', 'sales', 'receipt', 
            'loan_received', 'director_loan_payment_received', 
            'director_loan_interest_received', 'equity', 'opening_balance'
        ];
        if (inflowTypes.some(t => type.includes(t))) return Math.abs(amt);

        // Known Outflows (Always Negative effect)
        const outflowTypes = [
            'expense', 'payment', 'purchase', 'bill', 
            'loan_repayment', 'loan_interest', 'liability', 
            'payroll', 'withdrawal', 'fee', 'tax', 'vat'
        ];
        if (outflowTypes.some(t => type.includes(t))) return -Math.abs(amt);

        // Fallback: Use the sign of the amount if type is ambiguous (e.g. 'journal', 'adjustment')
        // Assuming if it's stored negative, it's an outflow.
        return amt;
      };

      // Filter banks if a specific bank is selected
      const filteredBanks = selectedBankId === "all" 
        ? bankAccounts 
        : bankAccounts.filter((b: any) => b.id === selectedBankId);

      if (filteredBanks) {
        const movementData = await Promise.all(filteredBanks.map(async (bank: any) => {
          // Opening Balance (Transactions before startDate)
          // Note: Bank Account 'opening_balance' field is the balance at 'created_at'.
          // We need to sum all transactions up to startDate.
          
          // Get transactions before startDate
          const { data: prevTx } = await supabase
            .from("transactions")
            .select("total_amount, transaction_type")
            .eq("bank_account_id", bank.id)
            .lt("transaction_date", startDate);
            
          const prevTxSum = prevTx?.reduce((sum, tx) => sum + getTransactionEffect(tx), 0) || 0;
          const balanceBwd = Number(bank.opening_balance) + prevTxSum;

          // Get transactions within period
          const { data: periodTx } = await supabase
            .from("transactions")
            .select("total_amount, transaction_type")
            .eq("bank_account_id", bank.id)
            .gte("transaction_date", startDate)
            .lte("transaction_date", endDate);

          let cashReceived = 0;
          let cashPaidOut = 0;
          let transfers = 0;

          periodTx?.forEach(tx => {
            const effect = getTransactionEffect(tx);
            const type = (tx.transaction_type || '').toLowerCase();

            if (type.includes('transfer')) {
                transfers += effect;
            } else {
                if (effect > 0) cashReceived += effect;
                else cashPaidOut += Math.abs(effect);
            }
          });

          const balanceCwd = balanceBwd + cashReceived - cashPaidOut + transfers;

          return {
            id: bank.id,
            name: bank.account_name,
            balanceBwd,
            cashReceived,
            cashPaidOut,
            transfers,
            balanceCwd
          };
        }));
        setCashMovementData(movementData);
      }

      // --- Cash Flow Report Data ---
      // Get all transactions in period
      let query = supabase
        .from("transactions")
        .select("*")
        .eq("company_id", profile.company_id)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate);
      
      if (selectedBankId !== "all") {
        query = query.eq("bank_account_id", selectedBankId);
      }

      const { data: allTx } = await query;

      const inflowsMap = new Map<string, number>();
      const outflowsMap = new Map<string, number>();
      let totalIn = 0;
      let totalOut = 0;

      allTx?.forEach(tx => {
        const amt = Number(tx.total_amount) || 0;
        const type = (tx.transaction_type || '').toLowerCase();
        
        // Determine category and direction
        let category = "Other Movements";
        let isInflow = false;

        // Categorization Logic
        if (['invoice_payment', 'receipt', 'sales', 'income'].some(t => type.includes(t))) {
            category = "Customer Receipts";
            isInflow = true;
        } else if (['deposit', 'equity', 'opening'].some(t => type.includes(t))) {
            category = "Account Receipts / Capital";
            isInflow = true;
        } else if (['loan_received', 'director_loan'].some(t => type.includes(t)) && !type.includes('repayment')) {
            category = "Loans Received";
            isInflow = true;
        } else if (['bill_payment', 'purchase', 'payment', 'expense'].some(t => type.includes(t))) {
            category = "Supplier / Expense Payments";
            isInflow = false;
        } else if (['payroll'].some(t => type.includes(t))) {
            category = "Payroll / Salaries";
            isInflow = false;
        } else if (['liability', 'tax', 'vat', 'sars'].some(t => type.includes(t))) {
            category = "Tax / Liability Payments";
            isInflow = false;
        } else if (['loan_repayment', 'loan_interest'].some(t => type.includes(t))) {
            category = "Loan Repayments";
            isInflow = false;
        } else if (type.includes('transfer')) {
            category = "Transfers";
            // Check direction based on type or sign
            if (type === 'transfer_in') isInflow = true;
            else if (type === 'transfer_out') isInflow = false;
            else isInflow = amt > 0;
        } else {
            // Fallback
            isInflow = amt > 0;
        }

        const absAmt = Math.abs(amt);
        if (isInflow) {
          inflowsMap.set(category, (inflowsMap.get(category) || 0) + absAmt);
          totalIn += absAmt;
        } else {
          outflowsMap.set(category, (outflowsMap.get(category) || 0) + absAmt);
          totalOut += absAmt;
        }
      });

      setCashFlowData({
        inflows: Array.from(inflowsMap.entries()).map(([k, v]) => ({ category: k, amount: v })),
        outflows: Array.from(outflowsMap.entries()).map(([k, v]) => ({ category: k, amount: v })),
        totalIn,
        totalOut
      });

    } catch (error) {
      console.error("Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, startDate, endDate, selectedBankId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <DialogTitle className="text-xl font-bold">Banking Reports</DialogTitle>
              <p className="text-sm text-muted-foreground">{companyName}</p>
            </div>
            <div className="flex items-center gap-2">
               <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" /> Print
               </Button>
               <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" /> Export
               </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row items-end gap-4 py-4 bg-muted/20 p-4 rounded-lg mb-4">
          <div className="grid gap-1.5 w-full sm:w-auto">
             <Label>Bank Account</Label>
             <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                <SelectTrigger className="w-full sm:w-[200px] bg-white">
                   <SelectValue placeholder="All Banks" />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value="all">All Banks</SelectItem>
                   {banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                   ))}
                </SelectContent>
             </Select>
          </div>

          <div className="grid gap-1.5 w-full sm:w-auto">
            <Label htmlFor="start-date">Start Date</Label>
            <Input 
              id="start-date" 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-white" 
            />
          </div>
          <div className="grid gap-1.5 w-full sm:w-auto">
            <Label htmlFor="end-date">End Date</Label>
            <Input 
              id="end-date" 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-white"
            />
          </div>
          <Button onClick={fetchData} variant="secondary" className="mb-[1px]">
             <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
             Refresh
          </Button>
        </div>

        <Tabs defaultValue="movement" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="movement">Cash Movement Report</TabsTrigger>
            <TabsTrigger value="flow">Cash Flow Statement</TabsTrigger>
          </TabsList>
          
          <TabsContent value="movement" className="space-y-4">
            <div className="rounded-md border bg-white">
               <div className="p-4 border-b bg-slate-50">
                  <h3 className="font-semibold text-lg text-slate-800">Cash Movement Report</h3>
                  <p className="text-sm text-muted-foreground">Period: {format(new Date(startDate), 'dd/MM/yyyy')} - {format(new Date(endDate), 'dd/MM/yyyy')}</p>
               </div>
               {loading ? (
                 <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
               ) : (
                 <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100 hover:bg-slate-100">
                      <TableHead className="font-bold text-slate-700">Bank Account</TableHead>
                      <TableHead className="text-right font-bold text-slate-700">Balance B/Forward</TableHead>
                      <TableHead className="text-right font-bold text-slate-700">Cash Received</TableHead>
                      <TableHead className="text-right font-bold text-slate-700">Cash Paid Out</TableHead>
                      <TableHead className="text-right font-bold text-slate-700">Total Transfers</TableHead>
                      <TableHead className="text-right font-bold text-slate-700">Balance C/Forward</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashMovementData.length === 0 ? (
                       <TableRow><TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No data available for this period.</TableCell></TableRow>
                    ) : (
                       <>
                       {cashMovementData.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right">R {row.balanceBwd.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right text-emerald-600">R {row.cashReceived.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right text-rose-600">R {row.cashPaidOut.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">R {row.transfers.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right font-bold">R {row.balanceCwd.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                       ))}
                       <TableRow className="bg-slate-50 font-bold border-t-2">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right">R {cashMovementData.reduce((a, b) => a + b.balanceBwd, 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">R {cashMovementData.reduce((a, b) => a + b.cashReceived, 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">R {cashMovementData.reduce((a, b) => a + b.cashPaidOut, 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">R {cashMovementData.reduce((a, b) => a + b.transfers, 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">R {cashMovementData.reduce((a, b) => a + b.balanceCwd, 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                       </TableRow>
                       </>
                    )}
                  </TableBody>
                </Table>
               )}
            </div>
          </TabsContent>

          <TabsContent value="flow" className="space-y-4">
             <div className="rounded-md border bg-white p-6">
                <div className="mb-6 border-b pb-4">
                   <h3 className="font-semibold text-lg text-slate-800">Cash Flow Statement</h3>
                   <p className="text-sm text-muted-foreground">{companyName}</p>
                   <p className="text-sm text-muted-foreground">Date Range: {format(new Date(startDate), 'dd/MM/yyyy')} → {format(new Date(endDate), 'dd/MM/yyyy')}</p>
                </div>
                
                {loading ? (
                   <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : (
                   <div className="space-y-8 max-w-4xl mx-auto">
                      {/* Inflows */}
                      <div className="space-y-2">
                         <h4 className="font-bold text-[#0070ad] text-sm uppercase tracking-wide border-b pb-1">Inflows</h4>
                         {cashFlowData.inflows.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2 italic">No inflows recorded</p>
                         ) : (
                            cashFlowData.inflows.map((item, idx) => (
                               <div key={idx} className="flex justify-between text-sm py-1 border-b border-dashed border-slate-100">
                                  <span>{item.category}</span>
                                  <span>R {item.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                               </div>
                            ))
                         )}
                         <div className="flex justify-between font-bold pt-2 bg-blue-50/50 p-2 rounded">
                            <span>Total Inflow of Money</span>
                            <span className="text-[#0070ad]">R {cashFlowData.totalIn.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                         </div>
                      </div>

                      {/* Outflows */}
                      <div className="space-y-2">
                         <h4 className="font-bold text-rose-600 text-sm uppercase tracking-wide border-b pb-1">Outflows</h4>
                         {cashFlowData.outflows.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2 italic">No outflows recorded</p>
                         ) : (
                            cashFlowData.outflows.map((item, idx) => (
                               <div key={idx} className="flex justify-between text-sm py-1 border-b border-dashed border-slate-100">
                                  <span>{item.category}</span>
                                  <span>R -{item.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                               </div>
                            ))
                         )}
                         <div className="flex justify-between font-bold pt-2 bg-rose-50/50 p-2 rounded">
                            <span>Total Outflow of Money</span>
                            <span className="text-rose-600">R -{cashFlowData.totalOut.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                         </div>
                      </div>

                      {/* Net */}
                      <div className="flex justify-between font-bold text-lg pt-4 border-t-2 border-slate-200 mt-4">
                         <span>Net Money In / Out</span>
                         <span className={(cashFlowData.totalIn - cashFlowData.totalOut) >= 0 ? "text-emerald-600" : "text-rose-600"}>
                            R {(cashFlowData.totalIn - cashFlowData.totalOut).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                         </span>
                      </div>
                   </div>
                )}
             </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
