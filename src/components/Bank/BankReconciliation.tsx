import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ReconciledReportDialog } from "./ReconciledReportDialog";
import { CheckCircle2, XCircle, RefreshCw, Save, Calculator, Calendar, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  current_balance: number;
  opening_balance: number;
}

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  reference_number: string | null;
  total_amount: number;
  status: string;
  bank_account_id: string;
  transaction_type?: string;
}

interface ReconciliationProps {
  bankAccounts: BankAccount[];
  initialBankId?: string | null;
}

export const BankReconciliation = ({ bankAccounts, initialBankId }: ReconciliationProps) => {
  const { toast } = useToast();
  const [selectedBank, setSelectedBank] = useState(initialBankId || "");
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (initialBankId) {
      setSelectedBank(initialBankId);
    }
  }, [initialBankId]);
  const [loading, setLoading] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  
  // UI State
  const [statementBalance, setStatementBalance] = useState<number>(0);
  const [fromDate, setFromDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd"));
  const [showCleared, setShowCleared] = useState(false);
  const [clearedTxs, setClearedTxs] = useState<Set<string>>(new Set());
  
  // Calculated Totals
  const [priorClearedTotal, setPriorClearedTotal] = useState(0);

  const bankAccount = useMemo(() => 
    bankAccounts.find(b => b.id === selectedBank), 
  [bankAccounts, selectedBank]);

  useEffect(() => {
    if (selectedBank && bankAccount) {
       setStatementBalance(bankAccount.current_balance);
    }
  }, [selectedBank, bankAccount]);

  useEffect(() => {
    if (selectedBank) {
      loadTransactions();
    }
  }, [selectedBank, fromDate, toDate]); // Removed showCleared dependency as we now fetch differently

  const loadTransactions = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Prior Cleared Total (Sum of all approved transactions BEFORE the fromDate)
      // Note: This assumes 'approved' means cleared.
      // EXCLUDE opening balance transactions to avoid double counting
      const { data: priorData, error: priorError } = await supabase
        .from("transactions")
        .select("total_amount")
        .eq("bank_account_id", selectedBank)
        .eq("status", "approved")
        .lt("transaction_date", fromDate)
        .neq("transaction_type", "opening_balance") // Exclude opening balance
        .not("description", "ilike", "%opening balance%"); // Safety check for description

      if (priorError) throw priorError;
      
      const priorTotal = (priorData || []).reduce((sum, tx) => sum + tx.total_amount, 0);
      setPriorClearedTotal(priorTotal);

      // 2. Fetch Visible Transactions
      // We want:
      // a) ALL pending transactions up to toDate (regardless of fromDate)
      // b) Approved transactions within the date range (fromDate to toDate)
      // EXCLUDE opening balance transactions
      
      const { data: pendingData, error: pendingError } = await supabase
        .from("transactions")
        .select("*")
        .eq("bank_account_id", selectedBank)
        .eq("status", "pending")
        .lte("transaction_date", toDate)
        .neq("transaction_type", "opening_balance")
        .not("description", "ilike", "%opening balance%")
        .order("transaction_date", { ascending: false });
        
      if (pendingError) throw pendingError;

      const { data: approvedData, error: approvedError } = await supabase
        .from("transactions")
        .select("*")
        .eq("bank_account_id", selectedBank)
        .eq("status", "approved")
        .gte("transaction_date", fromDate)
        .lte("transaction_date", toDate)
        .neq("transaction_type", "opening_balance")
        .not("description", "ilike", "%opening balance%")
        .order("transaction_date", { ascending: false });

      if (approvedError) throw approvedError;

      // Combine and sort
      const combined = [...(pendingData || []), ...(approvedData || [])].sort((a, b) => 
        new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
      );

      setTransactions(combined);
      
      // Auto-select already approved transactions in the view (visual only, they are already in priorTotal if before date)
      // Wait, approvedData are in the range. They should be considered "cleared" in the current view logic?
      // Actually, if they are "approved", they are ALREADY cleared.
      // So they should contribute to the "Cleared Balance".
      // But my UI logic adds "currentSessionClearedTotal" based on `clearedTxs` set.
      // So I should pre-fill `clearedTxs` with the IDs of the loaded approved transactions.
      
      const preSelected = new Set((approvedData || []).map(t => t.id));
      setClearedTxs(preSelected);

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCleared = (txId: string) => {
    // Prevent unticking if it was already approved in DB? 
    // Usually you can un-reconcile. 
    // For now, allow toggling.
    const newCleared = new Set(clearedTxs);
    if (newCleared.has(txId)) {
      newCleared.delete(txId);
    } else {
      newCleared.add(txId);
    }
    setClearedTxs(newCleared);
  };

  const handleSelectAll = () => {
    const allIds = transactions.map(t => t.id);
    setClearedTxs(new Set(allIds));
  };

  const handleDeselectAll = () => {
    setClearedTxs(new Set());
  };

  // Calculations
  const currentSessionClearedTotal = useMemo(() => {
    // Sum of all transactions currently in the 'clearedTxs' set
    // Note: This includes the 'approvedData' we loaded and pre-selected
    return transactions
      .filter(t => clearedTxs.has(t.id))
      .reduce((sum, t) => sum + t.total_amount, 0);
  }, [transactions, clearedTxs]);

  // Cleared Balance = Opening Balance + Prior Cleared + Current Session Cleared
  const clearedBalance = useMemo(() => {
    const opening = bankAccount?.opening_balance || 0;
    return opening + priorClearedTotal + currentSessionClearedTotal;
  }, [bankAccount, priorClearedTotal, currentSessionClearedTotal]);

  const difference = useMemo(() => {
    // Difference = Statement Balance (Target) - Cleared Balance (Actual)
    return statementBalance - clearedBalance;
  }, [statementBalance, clearedBalance]);

  const handleFinishReconciliation = async () => {
    if (Math.abs(difference) > 0.01) {
      toast({ 
        title: "Out of Balance", 
        description: `Cannot finish. Difference is ${difference.toFixed(2)}`, 
        variant: "destructive" 
      });
      return;
    }

    try {
      setLoading(true);
      
      // 1. Transactions to Approve (In clearedTxs but status is pending)
      const toApprove = transactions.filter(t => clearedTxs.has(t.id) && t.status === 'pending').map(t => t.id);
      
      // 2. Transactions to Un-Approve (Not in clearedTxs but status was approved)
      // (This handles user unticking a previously approved transaction)
      const toUnApprove = transactions.filter(t => !clearedTxs.has(t.id) && t.status === 'approved').map(t => t.id);

      if (toApprove.length > 0) {
        const { error } = await supabase
          .from("transactions")
          .update({ status: 'approved' })
          .in("id", toApprove);
        if (error) throw error;
      }

      if (toUnApprove.length > 0) {
        const { error } = await supabase
          .from("transactions")
          .update({ status: 'pending' })
          .in("id", toUnApprove);
        if (error) throw error;
      }

      toast({ title: "Success", description: "Reconciliation updated successfully" });
      loadTransactions(); // Refresh

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow-sm border">
      <div className="flex flex-row justify-between items-start">
        <div className="flex flex-col space-y-2">
          <h2 className="text-2xl font-semibold text-[#0070ad]">Bank Account Matcher</h2>
          <p className="text-sm text-muted-foreground">Match your system transactions with your bank statement.</p>
        </div>
        <Button variant="outline" onClick={() => setShowReportDialog(true)} className="gap-2">
          <FileText className="h-4 w-4" /> Reconciled Report
        </Button>
      </div>

      {/* Top Controls Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-gray-50/50 p-6 rounded-md border">
        {/* Column 1: Account Selection */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Financial Institution Account</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Select Account..." />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.bank_name} - {account.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-between items-center text-sm p-2 bg-white rounded border">
            <span className="text-muted-foreground">System Balance:</span>
            <span className="font-mono font-medium">
              {bankAccount ? bankAccount.current_balance.toFixed(2) : "0.00"}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm p-2 bg-blue-50/50 rounded border border-blue-100">
            <span className="text-muted-foreground text-blue-800">Opening Balance:</span>
            <span className="font-mono font-medium text-blue-800">
              {bankAccount ? bankAccount.opening_balance.toFixed(2) : "0.00"}
            </span>
          </div>
        </div>

        {/* Column 2: Dates */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Period From</Label>
              <div className="relative">
                <Input 
                  type="date" 
                  value={fromDate} 
                  onChange={(e) => setFromDate(e.target.value)} 
                  className="bg-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Period To</Label>
              <div className="relative">
                <Input 
                  type="date" 
                  value={toDate} 
                  onChange={(e) => setToDate(e.target.value)} 
                  className="bg-white"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            * Displaying all uncleared items up to Period To, and cleared items within range.
          </p>
        </div>

        {/* Column 3: Balances */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Ending Statement Balance</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500 text-sm">R</span>
              <Input 
                type="number" 
                value={statementBalance} 
                onChange={(e) => setStatementBalance(parseFloat(e.target.value) || 0)} 
                className="pl-8 bg-white text-right font-mono"
              />
            </div>
          </div>
          
          <div className="space-y-2 pt-1">
             <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Reconciled Balance:</span>
                <span className="font-mono">{clearedBalance.toFixed(2)}</span>
             </div>
             <div className="flex justify-between items-center pt-2 p-2 bg-blue-50/50 rounded border border-blue-100">
               <span className="text-sm font-medium text-blue-800">Difference</span>
               <span className={cn(
                 "font-mono font-bold",
                 Math.abs(difference) < 0.01 ? "text-green-600" : "text-red-600"
               )}>
                 {difference.toFixed(2)}
               </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="border rounded-md overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader className="bg-slate-700 border-b border-slate-800 sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-[120px] font-semibold text-white">Reference</TableHead>
                <TableHead className="w-[120px] font-semibold text-white">Date</TableHead>
                <TableHead className="font-semibold text-white">Entity / Description</TableHead>
                <TableHead className="w-[150px] font-semibold text-white">Transaction Category</TableHead>
                <TableHead className="w-[80px] text-center font-semibold text-white">Cleared</TableHead>
                <TableHead className="w-[120px] text-right font-semibold text-white">Amount</TableHead>
                <TableHead className="w-[200px] font-semibold text-white">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No transactions found for the selected period.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id} className={cn(
                    "hover:bg-blue-50/30 transition-colors",
                    clearedTxs.has(tx.id) && "bg-blue-50/20"
                  )}>
                    <TableCell className="font-mono text-xs">{tx.reference_number || "-"}</TableCell>
                    <TableCell className="text-sm">{format(new Date(tx.transaction_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="font-medium">{tx.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{tx.transaction_type || "Standard"}</TableCell>
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={clearedTxs.has(tx.id)}
                        onCheckedChange={() => handleToggleCleared(tx.id)}
                      />
                    </TableCell>
                    <TableCell className={cn(
                      "text-right font-mono text-sm",
                      tx.total_amount < 0 ? "text-red-600" : "text-green-600"
                    )}>
                      {tx.total_amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate">
                      <Badge variant={tx.status === 'approved' ? 'default' : 'secondary'} className="text-[10px]">
                        {tx.status === 'approved' ? 'Cleared' : 'Pending'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Footer / Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSelectAll}>Select All</Button>
          <Button variant="outline" size="sm" onClick={handleDeselectAll}>Deselect All</Button>
        </div>

        <div className="flex items-center gap-8 bg-gray-50 px-6 py-3 rounded-md border">
           <div className="text-right">
             <p className="text-xs text-muted-foreground">Prior Cleared Total</p>
             <p className="font-mono font-medium">{priorClearedTotal.toFixed(2)}</p>
           </div>
           <div className="h-8 w-px bg-gray-300"></div>
           <div className="text-right">
             <p className="text-xs text-muted-foreground">Reconciled Balance</p>
             <p className="font-mono font-medium text-blue-600">{clearedBalance.toFixed(2)}</p>
           </div>
        </div>

        <Button 
          className="bg-[#0070ad] hover:bg-[#005a8d] min-w-[150px]"
          onClick={handleFinishReconciliation}
          disabled={loading}
        >
          {loading ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Finalize Match
        </Button>
      </div>

      {/* ReconciledReportDialog moved to BankManagement */}
      <ReconciledReportDialog 
        isOpen={showReportDialog} 
        onClose={setShowReportDialog} 
        bankAccounts={bankAccounts}
        initialBankId={selectedBank}
      />
    </div>
  );
};
