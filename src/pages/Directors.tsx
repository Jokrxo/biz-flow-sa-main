import React, { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { transactionsApi } from "@/lib/transactions-api";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";
import { 
  Users, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  History, 
  Plus, 
  Search,
  MoreHorizontal,
  FileText,
  BarChart3,
  Percent
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

export default function Directors() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isDateLocked } = useFiscalYear();
  const [companyId, setCompanyId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);

  // Dialog States
  const [addLoanOpen, setAddLoanOpen] = useState(false);
  const [loanDirection, setLoanDirection] = useState<'to_director' | 'from_director'>('to_director');
  const [loanAmount, setLoanAmount] = useState("");
  const [loanDate, setLoanDate] = useState(new Date().toISOString().slice(0, 10));
  const [loanBankId, setLoanBankId] = useState("");
  const [loanDesc, setLoanDesc] = useState("");
  const [banks, setBanks] = useState<any[]>([]);
  
  const [stats, setStats] = useState({
    totalLoansToDirectors: 0,
    totalLoansFromDirectors: 0,
    netPosition: 0
  });

  useEffect(() => {
    const init = async () => {
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        fetchData(profile.company_id);
        fetchBanks(profile.company_id);
      }
    };
    init();
  }, [user, refreshKey]);

  const fetchBanks = async (cid: string) => {
    const { data } = await supabase.from('bank_accounts').select('*').eq('company_id', cid);
    if (data) setBanks(data);
  };

  const fetchData = async (cid: string) => {
    setLoading(true);
    try {
      // Fetch transactions with reference starting with DIR-
      const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .eq('company_id', cid)
        .like('reference_number', 'DIR-%')
        .order('transaction_date', { ascending: false });
      
      if (txs) {
        setTransactions(txs);
        
        // Calculate stats
        let toDirector = 0;
        let fromDirector = 0;
        
        // This is a simplified calculation. 
        // Ideally we check the ledger entries to see if it hit an Asset (Loan to Director) or Liability (Loan from Director).
        // For now, we can infer from the description or we can fetch ledger entries.
        // Let's fetch ledger entries for these transactions to be accurate.
        
        const txIds = txs.map(t => t.id);
        if (txIds.length > 0) {
          const { data: leds } = await supabase
            .from('ledger_entries')
            .select('transaction_id, debit, credit, account_id')
            .in('transaction_id', txIds);
            
          const { data: accounts } = await supabase
            .from('chart_of_accounts')
            .select('id, account_type, account_name')
            .in('id', (leds || []).map(l => l.account_id));
            
          const accountMap = new Map(accounts?.map(a => [a.id, a]));
          
          txs.forEach(t => {
            const tLeds = leds?.filter(l => l.transaction_id === t.id) || [];
            // Check if it's a loan TO director (Asset Debit) or FROM director (Liability Credit/Asset Debit (Bank))
            
            // Logic:
            // Loan TO Director: Bank Credit, Director Loan (Asset) Debit
            // Loan FROM Director: Bank Debit, Director Loan (Liability) Credit
            
            // We can also check the transaction type if we stored it, but we usually rely on account types.
            
            let isToDirector = false;
            let isFromDirector = false;
            
            tLeds.forEach(l => {
              const acc = accountMap.get(l.account_id);
              if (!acc) return;
              const name = (acc.account_name || '').toLowerCase();
              
              if (name.includes('director')) {
                if (l.debit > 0 && (acc.account_type === 'asset' || acc.account_type === 'current_asset')) {
                   isToDirector = true;
                   toDirector += Number(l.debit);
                } else if (l.credit > 0 && (acc.account_type === 'liability' || acc.account_type === 'long_term_liability')) {
                   isFromDirector = true;
                   fromDirector += Number(l.credit);
                }
              }
            });
          });
        }
        
        setStats({
          totalLoansToDirectors: toDirector,
          totalLoansFromDirectors: fromDirector,
          netPosition: toDirector - fromDirector // Positive means Directors owe company
        });
      }
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to fetch data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLoan = async () => {
    if (isDateLocked(loanDate)) {
      setAddLoanOpen(false);
      setIsLockDialogOpen(true);
      return;
    }

    if (!loanAmount || !loanBankId) {
      toast({ title: "Missing fields", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    try {
      const ref = `DIR-${Date.now().toString().slice(-6)}`;
      const amount = parseFloat(loanAmount);
      
      // We need to find or create the correct Director Loan account
      let loanAccountId = "";
      
      // Determine account type and name based on direction
      // To Director -> Asset (Director Loan Receivable)
      // From Director -> Liability (Director Loan Payable)
      
      const isToDirector = loanDirection === 'to_director';
      const accountType = isToDirector ? 'asset' : 'liability'; // or long_term_liability
      const searchName = isToDirector ? 'Director Loan Receivable' : 'Director Loan Payable';
      
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('company_id', companyId)
        .eq('account_type', accountType)
        .ilike('account_name', `%${searchName}%`);
        
      if (accounts && accounts.length > 0) {
        loanAccountId = accounts[0].id;
      } else {
        // Create account
        const { data: newAccount, error } = await supabase
          .from('chart_of_accounts')
          .insert({
            company_id: companyId,
            account_name: searchName,
            account_type: accountType,
            account_code: isToDirector ? '1250' : '2550', // Example codes
            is_active: true
          })
          .select()
          .single();
          
        if (error) throw error;
        loanAccountId = newAccount.id;
      }

      if (isToDirector) {
        // Company lending to Director
        // Dr Director Loan (Asset)
        // Cr Bank
        await transactionsApi.postLoanAdvanced({
          date: loanDate,
          amount,
          reference: ref,
          bankAccountId: loanBankId,
          loanLedgerAccountId: loanAccountId,
          description: loanDesc || `Loan to Director`
        });
      } else {
        // Company borrowing from Director
        // Dr Bank
        // Cr Director Loan (Liability)
        // Note: postLoanReceived might need adjustment or we use generic post
        // Using postLoanReceived from API which usually handles: Dr Bank, Cr Loan Liability
        await transactionsApi.postLoanReceived({
          date: loanDate,
          amount,
          reference: ref,
          bankAccountId: loanBankId,
          loanType: 'long', // Default to long term for director loans usually
          loanLedgerAccountId: loanAccountId,
          description: loanDesc || `Loan from Director`
        });
      }

      toast({ title: "Success", description: "Director transaction recorded" });
      setAddLoanOpen(false);
      setRefreshKey(prev => prev + 1);
      
      // Reset form
      setLoanAmount("");
      setLoanDesc("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <SEO title="Directors Transactions | Rigel Business" description="Manage director loans and transactions" />
      <FinancialYearLockDialog open={isLockDialogOpen} onOpenChange={setIsLockDialogOpen} />
      
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Directors Transactions</h1>
            <p className="text-muted-foreground">Manage loans and transactions with directors</p>
          </div>
          <Button onClick={() => setAddLoanOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Transaction
          </Button>
        </div>

        {/* Metrics */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loans TO Directors</CardTitle>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R {stats.totalLoansToDirectors.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Company assets (Receivables)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loans FROM Directors</CardTitle>
              <ArrowDownLeft className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R {stats.totalLoansFromDirectors.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Company liabilities (Payables)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Position</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.netPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                R {Math.abs(stats.netPosition).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.netPosition >= 0 ? 'Directors owe Company' : 'Company owes Directors'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transactions List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Transaction History</h2>
              <p className="text-sm text-slate-500">Recent transactions involving directors</p>
            </div>
          </div>

          <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white rounded-xl">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow className="border-b border-slate-200 hover:bg-transparent">
                    <TableHead className="w-32 pl-6 font-semibold text-slate-700">Date</TableHead>
                    <TableHead className="w-32 font-semibold text-slate-700">Reference</TableHead>
                    <TableHead className="min-w-[300px] font-semibold text-slate-700">Description</TableHead>
                    <TableHead className="w-32 font-semibold text-slate-700">Status</TableHead>
                    <TableHead className="text-right w-40 font-semibold text-slate-700 pr-6">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <History className="h-8 w-8 mb-2 opacity-50" />
                          <p>No director transactions found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx) => (
                      <TableRow key={tx.id} className="group hover:bg-slate-50 transition-colors border-slate-100">
                        <TableCell className="pl-6 text-slate-600 font-medium text-sm">
                          {format(new Date(tx.transaction_date), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="text-slate-600 text-sm font-mono">
                          {tx.reference_number}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-800 text-sm">{tx.description || '-'}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${
                            tx.status === 'posted' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                              : 'bg-amber-50 text-amber-700 border-amber-100'
                          }`}>
                            {tx.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-medium font-mono text-sm pr-6">
                          R {Number(tx.total_amount).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>

      {/* Add Transaction Dialog */}
      <Dialog open={addLoanOpen} onOpenChange={setAddLoanOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="flex flex-col items-center text-center">
            <img src="/logo.png" alt="Rigel Business" className="h-12 w-auto mb-2" />
            <DialogTitle>Record Director Transaction</DialogTitle>
            <DialogDescription>Record a new loan or repayment involving a director.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <Select value={loanDirection} onValueChange={(v: any) => setLoanDirection(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="to_director">Loan TO Director (Money out)</SelectItem>
                  <SelectItem value="from_director">Loan FROM Director (Money in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Amount (R)</Label>
                <Input type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bank Account</Label>
              <Select value={loanBankId} onValueChange={setLoanBankId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((bank) => (
                    <SelectItem key={bank.id} value={bank.id}>
                      {bank.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={loanDesc} onChange={(e) => setLoanDesc(e.target.value)} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter className="flex-col sm:justify-center gap-2">
            <div className="flex w-full justify-end gap-2">
              <Button variant="outline" onClick={() => setAddLoanOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateLoan}>Record Transaction</Button>
            </div>
            <div className="w-full text-center mt-4 border-t pt-4">
              <p className="text-xs text-muted-foreground font-medium">
                © {new Date().getFullYear()} Rigel Business. All rights reserved.
              </p>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
