import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileSpreadsheet, FileText, RefreshCw, Loader2, ChevronDown, ChevronUp, Filter, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useTablePersistence } from "@/hooks/use-table-persistence";
import type { TrialBalance } from "@/types/trial-balance";
import { AccountDrilldown } from "@/components/FinancialReports/AccountDrilldown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface TrialBalanceEntry {
  account_id?: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  category?: string; // Asset, Liability, Equity, Income, Expense
}

export const TrialBalanceAutoGenerate = () => {
  const { toast } = useToast();
  const { fiscalStartMonth, loading: fyLoading } = useFiscalYear();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [drillAccount, setDrillAccount] = useState<{ id: string; code: string; name: string } | null>(null);
  const [unallocatedTxCount, setUnallocatedTxCount] = useState<number | null>(null);

  useEffect(() => {
    async function fetchCompany() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    }
    fetchCompany();
  }, []);
  
  useEffect(() => {
    if (!companyId) return;
    const checkUnallocated = async () => {
      try {
        const { count, error } = await supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .in("status", ["pending", "unposted"]);
        if (!error) {
          setUnallocatedTxCount(typeof count === "number" ? count : 0);
        }
      } catch (e) {
        console.error("Failed to check unallocated transactions for trial balance", e);
      }
    };
    checkUnallocated();
  }, [companyId]);
  
  // Date filter state
  const [showOptions, setShowOptions] = useState(false);
  const [periodType, setPeriodType] = useState<'monthly' | 'annual'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [accountSearch, setAccountSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "assets" | "liabilities" | "equity" | "income" | "expenses">("all");

  const getCategoryFromCode = (code: string): string => {
    const firstDigit = code.charAt(0);
    const codeNum = parseInt(code, 10);
    
    if (firstDigit === '1') {
        if (codeNum < 1500) return 'Current Assets';
        return 'Non-current Assets';
    }
    if (firstDigit === '2') {
        if (codeNum < 2500) return 'Current Liabilities';
        return 'Non-current Liabilities';
    }

    switch (firstDigit) {
      case '3': return 'Equity';
      case '4': return 'Income';
      case '5': case '6': case '7': case '8': case '9': return 'Expenses';
      default: return 'Other';
    }
  };

  const AllocationStatusBanner = () => {
    if (unallocatedTxCount === null) return null;
    if (unallocatedTxCount > 0) {
      return (
        <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500" />
            <div>
              <AlertTitle className="text-sm font-semibold">Some transactions still need allocating</AlertTitle>
              <AlertDescription className="text-xs">
                There are {unallocatedTxCount} transactions that are not yet allocated. Until you
                finish allocating them, this report may not fully reflect your actual position.
              </AlertDescription>
            </div>
          </div>
        </Alert>
      );
    }
    return (
      <Alert className="mb-4 border-emerald-300 bg-emerald-50 text-emerald-900">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500" />
          <div>
            <AlertTitle className="text-sm font-semibold">All transactions are allocated</AlertTitle>
            <AlertDescription className="text-xs">
              All transactions are allocated and your report includes all transactions. If your AFS do not
              balance, please verify all the journals.
            </AlertDescription>
          </div>
        </div>
      </Alert>
    );
  };

  const fetchTrialBalanceData = useCallback(async (): Promise<TrialBalanceEntry[]> => {
    try {
      if (fyLoading) return [];

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      let cid = companyId;
      if (!cid) {
         const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
         cid = profile?.company_id || null;
      }

      if (!cid) throw new Error("Company profile not found");
      const companyIdToUse = cid;

      // Calculate end-of-period cutoff
      let endDate: Date;
      if (periodType === 'monthly') {
        // End of the selected month
        endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);
      } else {
        // End of the selected year
        endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
      }

      // Calculate fiscal year start date relative to the end date
      let fiscalStart: Date;
      const fyStartCandidate = new Date(endDate.getFullYear(), fiscalStartMonth - 1, 1);
      if (fyStartCandidate > endDate) {
         // Fiscal start is in the previous year
         fiscalStart = new Date(endDate.getFullYear() - 1, fiscalStartMonth - 1, 1);
      } else {
         fiscalStart = fyStartCandidate;
      }
      
      const fiscalStartISO = fiscalStart.toISOString();

      // Fetch all active accounts
      const { data: accounts, error: accountsError } = await supabase
        .from("chart_of_accounts")
        .select('account_code, account_name, id')
        .eq("company_id", companyIdToUse)
        .eq("is_active", true)
        .order("account_code");

      if (accountsError) throw accountsError;

      // Fetch transaction entries up to end of selected period
      const { data: txEntries, error: txError } = await supabase
        .from("transaction_entries")
        .select(`
          transaction_id,
          account_id,
          debit,
          credit,
          transactions!inner (
            transaction_date
          )
        `)
        .eq("transactions.company_id", companyIdToUse)
        .lte("transactions.transaction_date", endDate.toISOString());

      if (txError) throw txError;

      // Fetch ledger entries up to end of selected period
      const { data: ledgerEntries, error: ledgerError } = await supabase
        .from("ledger_entries")
        .select('transaction_id, account_id, debit, credit, entry_date')
        .eq("company_id", companyIdToUse)
        .lte("entry_date", endDate.toISOString());

      if (ledgerError) throw ledgerError;

      // Calculate balances for each account
      const trialBalanceData: TrialBalanceEntry[] = [];
      
      const ledgerTxIds = new Set<string>((ledgerEntries || []).map((e: any) => String(e.transaction_id || '')));
      const filteredTxEntries = (txEntries || []).filter((e: any) => !ledgerTxIds.has(String(e.transaction_id || '')));

      const pinnedCodes = new Set(['1100','3900']);
      
      // Track calculated Retained Earnings adjustment (Previous years' Net Profit)
      // This is the net of Income - Expenses for all transactions BEFORE the fiscal start date
      let retainedEarningsAdjustment = 0;

      // Helper to check date against fiscal start
      const isBeforeFiscalStart = (dateStr: string) => {
          return dateStr < fiscalStartISO;
      };

      accounts?.forEach(account => {
        let totalDebit = 0;
        let totalCredit = 0;
        
        const category = getCategoryFromCode(account.account_code);
        const isPnL = category === 'Income' || category === 'Expenses';

        // Sum transaction entries
        filteredTxEntries?.forEach((entry: any) => {
          if (entry.account_id === account.id) {
            const txDate = entry.transactions?.transaction_date;
            const isPrior = txDate && isBeforeFiscalStart(txDate);
            
            if (isPnL && isPrior) {
                // Accumulate to RE adjustment instead of account balance
                // Income (Credit) increases RE (Credit), Expense (Debit) decreases RE
                // So RE Adjustment += (Credit - Debit)
                retainedEarningsAdjustment += (Number(entry.credit || 0) - Number(entry.debit || 0));
            } else {
                totalDebit += entry.debit || 0;
                totalCredit += entry.credit || 0;
            }
          }
        });

        // Sum ledger entries
        ledgerEntries?.forEach((entry: any) => {
          if (entry.account_id === account.id) {
            const entryDate = entry.entry_date;
            const isPrior = entryDate && isBeforeFiscalStart(entryDate);

            if (isPnL && isPrior) {
                 retainedEarningsAdjustment += (Number(entry.credit || 0) - Number(entry.debit || 0));
            } else {
                 totalDebit += entry.debit || 0;
                 totalCredit += entry.credit || 0;
            }
          }
        });

        // Only include accounts with non-zero balances
        const isInventoryName = (account.account_name || '').toLowerCase().includes('inventory');
        const isPrimaryInventory = account.account_code === '1300';
        const isPinned = pinnedCodes.has(String(account.account_code || ''));

        // Calculate net balance
        const netBalance = totalDebit - totalCredit;
        const hasBalance = Math.abs(netBalance) > 0.01;

        const shouldShow = isPinned || (hasBalance && (!isInventoryName || isPrimaryInventory));
        
        if (shouldShow) {
          trialBalanceData.push({
            account_id: account.id,
            account_code: account.account_code,
            account_name: account.account_name,
            debit: netBalance > 0 ? netBalance : 0,
            credit: netBalance < 0 ? Math.abs(netBalance) : 0,
            category: category
          });
        }
      });

      // Add missing pinned accounts if they don't exist
      const has1100 = trialBalanceData.some(e => String(e.account_code) === '1100');
      let reAccount = trialBalanceData.find(e => String(e.account_code) === '3900' || e.account_name === 'Retained Earnings');
      
      if (!has1100) {
        trialBalanceData.push({ account_code: '1100', account_name: 'Bank', debit: 0, credit: 0, category: 'Assets' });
      }
      
      // Apply Retained Earnings Adjustment
      if (reAccount) {
          // Adjust existing account
          // If adjustment is positive, it's a Credit. If negative, it reduces Credit (or increases Debit).
          // We apply it to Credit side simply. Netting will happen if we want, but TB usually shows gross Debit/Credit or Net.
          // Here we have separate Debit/Credit columns. 
          // Best way: Net the adjustment into the existing balance.
          // Current Balance = Credit - Debit. New Balance = Current + Adjustment.
          const currentNet = reAccount.credit - reAccount.debit;
          const newNet = currentNet + retainedEarningsAdjustment;
          if (newNet >= 0) {
              reAccount.credit = newNet;
              reAccount.debit = 0;
          } else {
              reAccount.debit = Math.abs(newNet);
              reAccount.credit = 0;
          }
      } else if (Math.abs(retainedEarningsAdjustment) > 0.01) {
         // Create RE account if missing and we have an adjustment
         trialBalanceData.push({ 
             account_code: '3900', 
             account_name: 'Retained Earnings', 
             debit: retainedEarningsAdjustment < 0 ? Math.abs(retainedEarningsAdjustment) : 0, 
             credit: retainedEarningsAdjustment > 0 ? retainedEarningsAdjustment : 0, 
             category: 'Equity' 
         });
      } else if (!trialBalanceData.some(e => String(e.account_code) === '3900')) {
         // Ensure 3900 exists even if zero
         trialBalanceData.push({ account_code: '3900', account_name: 'Opening Balance Equity', debit: 0, credit: 0, category: 'Equity' });
      }

      trialBalanceData.sort((a, b) => String(a.account_code).localeCompare(String(b.account_code)));

      return trialBalanceData;
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      throw error;
    }
  }, [selectedMonth, selectedYear, periodType, toast, fiscalStartMonth, fyLoading, companyId]);

  // Generate cache key based on filter criteria (fallback key when company not yet resolved)
  const cacheKey = `trial_balance_${companyId || 'pending'}_${periodType}_${selectedYear}${
    periodType === 'monthly' ? `_${selectedMonth}` : ''
  }`;

  const { 
    data: entries, 
    loading, 
    refresh, 
    isSyncing 
  } = useTablePersistence<TrialBalanceEntry[]>(
    cacheKey,
    fetchTrialBalanceData,
    [],
    { enabled: !fyLoading }
  );

  const getTotals = (rows: TrialBalanceEntry[]) => {
    const totalDebits = rows.reduce((sum, e) => sum + e.debit, 0);
    const totalCredits = rows.reduce((sum, e) => sum + e.credit, 0);
    const difference = Math.abs(totalDebits - totalCredits);
    const isBalanced = difference < 0.01;
    return { totalDebits, totalCredits, difference, isBalanced };
  };

  const normalizeTrialBalanceEntries = (entries: TrialBalanceEntry[]): TrialBalance[] => {
    return entries.map(entry => ({
      id: entry.account_code,
      user_id: '',
      account_code: entry.account_code,
      account_name: entry.account_name,
      debit: entry.debit,
      credit: entry.credit,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
  };

  const handleExportExcel = () => {
    exportToExcel(normalizeTrialBalanceEntries(entries), `trial_balance_${periodType}_${selectedYear}`);
    toast({ title: "Success", description: "Trial balance exported to Excel" });
  };

  const handleExportPDF = () => {
    exportToPDF(normalizeTrialBalanceEntries(entries), `trial_balance_${periodType}_${selectedYear}`);
    toast({ title: "Success", description: "Trial balance exported to PDF" });
  };

  const visibleEntries = useMemo(() => {
    const term = accountSearch.trim().toLowerCase();
    return entries.filter(entry => {
      const name = entry.account_name.toLowerCase();
      const code = entry.account_code.toLowerCase();
      const cat = (entry.category || "").toLowerCase();

      const matchesSearch =
        !term || name.includes(term) || code.includes(term);

      let matchesCategory = true;
      switch (categoryFilter) {
        case "assets":
          matchesCategory = cat.includes("asset");
          break;
        case "liabilities":
          matchesCategory = cat.includes("liabilit");
          break;
        case "equity":
          matchesCategory = cat.includes("equity");
          break;
        case "income":
          matchesCategory = cat.includes("income");
          break;
        case "expenses":
          matchesCategory = cat.includes("expense");
          break;
        default:
          matchesCategory = true;
      }

      return matchesSearch && matchesCategory;
    });
  }, [entries, accountSearch, categoryFilter]);

  const totals = getTotals(visibleEntries);

  const getSource = (entry: TrialBalanceEntry) => {
    // Logic to determine source
    // 1100-1199 are usually Bank accounts
    if (entry.account_code.startsWith('11')) return 'Bank Account Balance';
    // System accounts like Retained Earnings
    if (entry.account_code === '3900' || entry.account_name === 'Retained Earnings') return 'System Account';
    // Default
    return 'Account Balance';
  };

  const formatDateRange = () => {
    if (periodType === "monthly") {
      const start = new Date(selectedYear, selectedMonth - 1, 1);
      const end = new Date(selectedYear, selectedMonth, 0);
      const startLabel = start.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const endLabel = end.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      return `${startLabel} -> ${endLabel}`;
    } else {
      const start = new Date(selectedYear, 0, 1);
      const end = new Date(selectedYear, 11, 31);
      const startLabel = start.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const endLabel = end.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      return `${startLabel} -> ${endLabel}`;
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4 mb-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span>Date Range:</span>
              <span className="text-foreground">{formatDateRange()}</span>
              {isSyncing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>
          </div>

          <Dialog open={showOptions} onOpenChange={setShowOptions}>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Trial Balance Filters</DialogTitle>
                <DialogDescription>
                  Choose the period for which you want to view the trial balance.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Period Type</label>
                  <Select value={periodType} onValueChange={(v: "monthly" | "annual") => setPeriodType(v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {periodType === "monthly" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Month</label>
                    <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(parseInt(v, 10))}>
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                          <SelectItem key={month} value={String(month)}>
                            {new Date(2000, month - 1).toLocaleString("default", { month: "long" })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Year</label>
                  <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v, 10))}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                        <SelectItem key={year} value={String(year)}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Account search</label>
                  <Input
                    value={accountSearch}
                    onChange={e => setAccountSearch(e.target.value)}
                    placeholder="Search by account code or name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Account category</label>
                  <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v as any)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="assets">Assets</SelectItem>
                      <SelectItem value="liabilities">Liabilities</SelectItem>
                      <SelectItem value="equity">Equity</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expenses">Expenses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="font-medium">Effective date range</div>
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    {formatDateRange()}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    const now = new Date();
                    setPeriodType("monthly");
                    setSelectedMonth(now.getMonth() + 1);
                    setSelectedYear(now.getFullYear());
                  }}
                >
                  Reset
                </Button>
                <Button onClick={() => setShowOptions(false)}>Apply Filters</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex gap-2 items-center mb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <Download className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={handleExportExcel}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              <span>Download Excel</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportPDF}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Download PDF</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setShowOptions(true)}
        >
          <Filter className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => refresh(true)}
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Trial Balance Table */}
      <div className="bg-white">
          <AllocationStatusBanner />
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center border rounded-md">
              <div className="bg-muted p-4 rounded-full mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No Data Available</h3>
              <p className="text-muted-foreground max-w-sm mt-2 text-sm">
                There are no transactions recorded for this period.
              </p>
            </div>
                      ) : (
            <div className="relative">
              <Table>
                <TableHeader className="bg-slate-700 border-b border-slate-800">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="text-xs font-semibold text-white h-9 uppercase tracking-wider pl-4 border-r border-slate-600">
                      Account Code
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-9 uppercase tracking-wider border-r border-slate-600">
                      Account Name
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-9 uppercase tracking-wider border-r border-slate-600">
                      Category
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-9 uppercase tracking-wider border-r border-slate-600">
                      Source
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-9 uppercase tracking-wider text-right border-r border-slate-600">
                      Debit
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-9 uppercase tracking-wider text-right pr-4">
                      Credit
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEntries.map((entry, index) => (
                    <TableRow
                      key={entry.account_code}
                      className={`
                        border-b border-border/40
                        ${index % 2 === 0 ? 'bg-white' : 'bg-slate-100'}
                        hover:bg-muted/10 transition-colors
                      `}
                    >
                      <TableCell
                        className="py-2 pl-4 text-sm text-foreground/90 font-mono border-r border-slate-200"
                      >
                        {entry.account_code}
                      </TableCell>
                      <TableCell
                        className="py-2 text-sm text-foreground/90 font-medium border-r border-slate-200 cursor-pointer"
                        onClick={() => {
                          if (!entry.account_id) return;
                          setDrillAccount({
                            id: entry.account_id,
                            code: entry.account_code,
                            name: entry.account_name,
                          });
                        }}
                      >
                        {entry.account_name}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground border-r border-slate-200">
                        {entry.category || 'Other'}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground border-r border-slate-200">
                        {getSource(entry)}
                      </TableCell>
                      <TableCell className="text-right py-2 text-sm tabular-nums text-foreground/80 border-r border-slate-300">
                        {entry.debit > 0 ? `R ${entry.debit.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}` : ''}
                      </TableCell>
                      <TableCell className="text-right py-2 pr-4 text-sm tabular-nums text-foreground/80">
                        {entry.credit > 0 ? `R ${entry.credit.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}` : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Grand Totals Row */}
                  <TableRow className="bg-muted/20 hover:bg-muted/20 border-t-2 border-border font-bold">
                    <TableCell colSpan={4} className="pl-4 py-3 text-sm">Total</TableCell>
                    <TableCell className="text-right py-3 text-sm tabular-nums text-foreground">
                      {totals.totalDebits > 0 && `R ${totals.totalDebits.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`}
                    </TableCell>
                    <TableCell className="text-right py-3 pr-4 text-sm tabular-nums text-foreground">
                      {totals.totalCredits > 0 && `R ${totals.totalCredits.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`}
                    </TableCell>
                  </TableRow>
                  
                  {/* Balance Check Row */}
                  {!totals.isBalanced && (
                     <TableRow className="bg-red-50 hover:bg-red-50 border-t border-red-200">
                        <TableCell colSpan={4} className="pl-4 py-2 text-red-600 text-xs font-medium uppercase tracking-wide">
                           Difference
                        </TableCell>
                        <TableCell colSpan={2} className="text-right py-2 pr-4 text-red-600 text-sm font-bold tabular-nums">
                           R {totals.difference.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                        </TableCell>
                     </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
      </div>
      {drillAccount && (
        <AccountDrilldown
          open={!!drillAccount}
          onOpenChange={(open) => {
            if (!open) setDrillAccount(null);
          }}
          accountId={drillAccount.id}
          accountCode={drillAccount.code}
          accountName={drillAccount.name}
        />
      )}
    </div>
  );
};
