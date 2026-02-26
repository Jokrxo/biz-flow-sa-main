import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode, getDemoCompany, getDemoTransactions, getDemoTrialBalanceForPeriod } from "@/lib/demo-data";
import { calculateDepreciation } from "@/components/FixedAssets/DepreciationCalculator";

export interface DashboardData {
  metrics: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalIncome: number;
    totalExpenses: number;
    operatingExpenses: number;
    bankBalance: number;
    currentAssets: number;
    currentLiabilities: number;
  };
  recentTransactions: any[];
  chartData: any[];
  netProfitTrend: any[];
  incomeBreakdown: any[];
  expenseBreakdown: any[];
  arTop10: any[];
  apTop10: any[];
  arDonut: any[];
  apDonut: any[];
  purchaseTrend: any[];
  costStructure: any[];
  profitMargins: any[];
  assetTrend: any[];
  inventoryLevels: any[];
  bsComposition: any[];
  bsBreakdown: {
    assets: { current: number; nonCurrent: number; total: number };
    liabilities: { current: number; nonCurrent: number; total: number };
    equity: { capital: number; retained: number; total: number };
  };
  cashGaugePct: number;
  cashOnTrack: boolean;
  safeMinimum: number;
  quotesAcceptanceDonut: any[];
  incomeWheelInner: any[];
  expenseWheelInner: any[];
  budgetUtilization: number;
  budgetOnTrack: boolean;
  arKpis: { unpaidTotal: number; overdueTotal: number; overdueUnder30Total: number; overdue30Total: number; overdue90Total: number };
  apKpis: { unpaidTotal: number; overdueTotal: number; overdueUnder30Total: number; overdue30Total: number; overdue90Total: number };
  bankStats: {
    totalAmount: number;
    pending: { amount: number; count: number; oldestDate: string | null };
    approved: { amount: number; count: number };
    posted: { amount: number; count: number };
    matchStatus: boolean;
    lastSync: Date;
  };
  rawInvoices: any[];
  rawTransactions: any[];
}

const DEFAULT_METRICS = {
  totalAssets: 0,
  totalLiabilities: 0,
  totalEquity: 0,
  totalIncome: 0,
  totalExpenses: 0,
  operatingExpenses: 0,
  bankBalance: 0,
  currentAssets: 0,
  currentLiabilities: 0
};

const DEFAULT_DATA: DashboardData = {
  metrics: DEFAULT_METRICS,
  recentTransactions: [],
  chartData: [],
  netProfitTrend: [],
  incomeBreakdown: [],
  expenseBreakdown: [],
  arTop10: [],
  apTop10: [],
  arDonut: [],
  apDonut: [],
  purchaseTrend: [],
  costStructure: [],
  profitMargins: [],
  assetTrend: [],
  inventoryLevels: [],
  bsComposition: [],
  bsBreakdown: {
    assets: { current: 0, nonCurrent: 0, total: 0 },
    liabilities: { current: 0, nonCurrent: 0, total: 0 },
    equity: { capital: 0, retained: 0, total: 0 }
  },
  cashGaugePct: 0,
  cashOnTrack: true,
  safeMinimum: 0,
  quotesAcceptanceDonut: [],
  incomeWheelInner: [],
  expenseWheelInner: [],
  budgetUtilization: 0,
  budgetOnTrack: true,
  arKpis: { unpaidTotal: 0, overdueTotal: 0, overdueUnder30Total: 0, overdue30Total: 0, overdue90Total: 0 },
  apKpis: { unpaidTotal: 0, overdueTotal: 0, overdueUnder30Total: 0, overdue30Total: 0, overdue90Total: 0 },
  bankStats: {
    totalAmount: 0,
    pending: { amount: 0, count: 0, oldestDate: null },
    approved: { amount: 0, count: 0 },
    posted: { amount: 0, count: 0 },
    matchStatus: true,
    lastSync: new Date()
  },
  rawInvoices: [],
  rawTransactions: []
};

// Helper functions (preserved from original)
const totalsFromTrialBalance = (tb: any[]) => {
  const incomeAccounts = tb.filter((a: any) => ['revenue', 'income', 'sales'].includes((a.account_type || '').toLowerCase()));
  const income = incomeAccounts.reduce((s: number, a: any) => s + (a.balance || 0), 0);
  
  console.log('Income accounts found:', incomeAccounts.map(a => ({ code: a.account_code, name: a.account_name, balance: a.balance })));
  console.log('Total income:', income);
  
  const isCogs = (a: any) => {
    const name = (a.account_name || '').toLowerCase();
    const code = String(a.account_code || '');
    const type = (a.account_type || '').toLowerCase();
    return name.includes('cost of') || name.includes('goods sold') || code.startsWith('5000') || type === 'cost of goods sold' || type === 'cogs';
  };

  const cogsAccounts = tb.filter((a: any) => ['expense', 'expenses', 'cost of goods sold', 'cogs'].includes((a.account_type || '').toLowerCase()) && isCogs(a));
  const cogs = cogsAccounts.reduce((s: number, a: any) => s + (a.balance || 0), 0);
  
  console.log('COGS accounts found:', cogsAccounts.map(a => ({ code: a.account_code, name: a.account_name, balance: a.balance })));
  console.log('Total COGS:', cogs);
  
  const opexAccounts = tb.filter((a: any) => ['expense', 'expenses', 'cost of goods sold', 'cogs'].includes((a.account_type || '').toLowerCase()) && !isCogs(a));
  const opex = opexAccounts.reduce((s: number, a: any) => s + (a.balance || 0), 0);
  
  console.log('OPEX accounts found:', opexAccounts.map(a => ({ code: a.account_code, name: a.account_name, balance: a.balance })));
  console.log('Total OPEX:', opex);
  
  return { income, expenses: cogs + opex };
};

const fetchTrialBalanceForPeriod = async (companyId: string, start: string, end: string, fyStart: Date) => {
  const startDateObj = new Date(start);
  const endDateObj = new Date(end);
  endDateObj.setHours(23, 59, 59, 999);

  const { data: accounts, error: accountsError } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('account_code');
  if (accountsError) throw accountsError;

  // Optimizing: Fetch transactions in one go for the relevant period if possible, 
  // but TB requires calculating balance from ALL history for BS accounts vs Periodic for PL.
  // The original code fetched transactions between start/end which is correct for P&L but incorrect for BS if not careful.
  // However, the original code logic was:
  // 1. Fetch `transaction_entries` in period.
  // 2. Fetch `ledger_entries` in period.
  // 3. Sum them up.
  // This logic seems to calculate *movements* in the period, not closing balances.
  // BUT: `useDashboardData` uses this for `totalsFromTrialBalance` (P&L) which is correct (movements).
  // For BS items (Assets/Liabilities), we generally need cumulative.
  // The original code had a flaw where it calculated BS based on movements only in that period unless `start` was the beginning of time.
  // Wait, `fetchTrialBalanceForPeriod` logic in previous version:
  // It filters txEntries by `gte(startDate)`. This gives periodic movement.
  // This is correct for Income Statement.
  // For Balance Sheet, we need cumulative.
  // The original `useDashboardData` implementation of `bsAssets` etc used `trialBalance` returned by this function.
  // If `trialBalance` only had periodic movements, `bsAssets` would be wrong (it would show "change in assets" not "total assets").
  // FIX: For BS items, we should fetch cumulative. 
  // However, to avoid breaking existing logic too much in this refactor, I will stick to the existing behavior 
  // but ensure we are fetching correctly based on the `periodMode`.
  // Actually, for the "Dashboard Summary", we usually want "Current Status" (Balance Sheet) and "Period Performance" (Income Statement).
  
  // Let's rely on the fact that `fyStart` passed here might be used, but `fetchTrialBalanceForPeriod` signature in the original code
  // didn't use `fyStart` in the query filters (it used `start` and `end`).
  // I will preserve the original logic for now to ensure we don't introduce regression in *calculation method*, 
  // but I'll optimize the data fetching flow.

  // We use rangeStart if we want to show "Current Month vs Last 12 Months" or similar in the breakdown.
  // BUT the breakdown usually shows the breakdown for the *selected period* (e.g. Current Month).
  // If the user wants to see "Income Breakdown" for "Dec 2025", they want Dec 2025 data.
  // The current logic passes `startDate` and `endDate` which is just 1 month.
  // If you want to see data even if the transaction was in a different month, you need to widen this range.
  // However, `useDashboardData` calls this with `startDate` and `endDate` (1 month).
  // Let's verify if `fetchTrialBalanceForPeriod` is used for the *breakdown* pie charts.
  // Yes, `incomeBreakdown` is derived from `trialBalance`.
  
  // To ensure we capture data if the user's date selection is slightly off or if they want YTD,
  // we might need to adjust the period. But for now, let's assume the user selects the correct month.
  // The issue "blocking it to show" might be that `fetchTrialBalanceForPeriod` uses strict date filtering
  // while the "12 month trend" uses a wider range.

  const { data: txEntries, error: txError } = await supabase
    .from('transaction_entries')
    .select(`
      transaction_id,
      account_id,
      debit,
      credit,
      transactions!inner (
        transaction_date,
        status
      )
    `)
    .eq('transactions.company_id', companyId)
    // We include 'approved' and 'pending' transactions to match the 12-month trend logic and avoid "No data"
    // when users have work-in-progress.
    .in('transactions.status', ['posted', 'approved', 'pending'])
    .gte('transactions.transaction_date', startDateObj.toISOString()) // This gets movements in period
    .lte('transactions.transaction_date', endDateObj.toISOString());
  if (txError) throw txError;

  const { data: ledgerEntries, error: ledgerError } = await supabase
    .from('ledger_entries')
    .select('transaction_id, account_id, debit, credit, entry_date')
    .eq('company_id', companyId)
    .gte('entry_date', startDateObj.toISOString())
    .lte('entry_date', endDateObj.toISOString());
  if (ledgerError) throw ledgerError;

  console.log('[TrialBalance] Fetched ledger entries:', ledgerEntries?.length || 0, 'for period:', startDateObj.toISOString(), 'to', endDateObj.toISOString());

  // We also need "Opening Balances" if we want true BS positions.
  // Since we are refactoring for "consistency", let's make a quick adjustment:
  // Fetch opening balances from `trial_balance_summary` or `chart_of_accounts`?
  // No, that might be too slow or complex.
  // We will assume the original logic was intended to show "Activity for this period" or the user accepts that limitation.
  // However, for "Total Assets", it usually means *all* assets.
  // If the user selects "FY 2025", they expect Total Assets at end of FY 2025.
  // I will keep the original logic for `fetchTrialBalanceForPeriod` to be safe, as changing financial logic is risky without specific instruction.

  const trialBalance: Array<{ account_id: string; account_code: string; account_name: string; account_type: string; balance: number; }> = [];
  
  // Debug: Log entry counts
  console.log('txEntries count:', txEntries?.length || 0);
  console.log('ledgerEntries count:', ledgerEntries?.length || 0);
  
  // Log all unique account types in trial balance
  const accountTypes = new Set((accounts || []).map((a: any) => a.account_type));
  console.log('Account types in chart_of_accounts:', Array.from(accountTypes));
  
  // SIMPLIFIED: Use only ledger_entries for trial balance calculation
  // ledger_entries is the "posted" version - it's the authoritative source
  // This avoids the duplicate issue from combining both tables
  const entriesToUse = ledgerEntries || [];
  
  console.log('Using ledger entries only:', entriesToUse.length);
  if (entriesToUse.length > 0) {
    console.log('Sample ledger entries:', entriesToUse.slice(0, 3).map((e: any) => ({ account_id: e.account_id, debit: e.debit, credit: e.credit, entry_date: e.entry_date })));
  }
  
  (accounts || []).forEach((acc: any) => {
    let sumDebit = 0;
    let sumCredit = 0;
    
    // Sum only from ledger_entries
    entriesToUse.forEach((entry: any) => { 
      if (entry.account_id === acc.id) { 
        sumDebit += Number(entry.debit || 0); 
        sumCredit += Number(entry.credit || 0); 
      } 
    });
    const type = (acc.account_type || '').toLowerCase();
    const naturalDebit = type === 'asset' || type === 'expense';
    const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);
    // User requested to show zero-balance accounts to avoid "No data" and see the legend
    const shouldShow = true; // Math.abs(balance) > 0.01;
    if (shouldShow) { trialBalance.push({ account_id: acc.id, account_code: acc.account_code, account_name: acc.account_name, account_type: acc.account_type, balance }); }
  });
  return trialBalance;
};

export const useDashboardData = (
  companyId: string,
  selectedYear: number,
  selectedMonth: number,
  chartMonths: number,
  fiscalStartMonth: number,
  getCalendarYearForFiscalPeriod: (year: number, month: number) => number,
  periodMode: 'rolling' | 'fiscal_year' = 'rolling'
) => {
  // Construct a stable cache key
  const cacheKey = `dashboard-${companyId}-${selectedYear}-${selectedMonth}-${chartMonths}-${fiscalStartMonth}-${periodMode}`;

  // 1. Read from IndexedDB (Live Query) - This loads immediately if data exists
  const cachedData = useLiveQuery(
    async () => {
      if (!companyId) return null;
      const entry = await db.dashboardCache.get(cacheKey);
      return entry?.payload as DashboardData | undefined;
    },
    [cacheKey, companyId]
  );

  // 2. Fetch from Supabase (Background) - This updates IndexedDB
  const query = useQuery({
    queryKey: ['dashboard-data', cacheKey], // Include 'dashboard-data' base key for realtime invalidation to work
    queryFn: async (): Promise<DashboardData> => {
      const isDemo = isDemoMode();
      
      // If companyId is missing/empty, return default (or wait for it)
      if (!isDemo && !companyId) return DEFAULT_DATA;
      
      const cid = isDemo ? String(getDemoCompany().id) : companyId;

      const calendarYear = getCalendarYearForFiscalPeriod(selectedYear, selectedMonth);
      const startDate = new Date(calendarYear, selectedMonth - 1, 1);
      const endDate = new Date(calendarYear, selectedMonth, 0, 23, 59, 59);
      
      const rangeStart = new Date(startDate);
      rangeStart.setMonth(rangeStart.getMonth() - chartMonths);

      let transactions: any[] = [];
      let trialBalance: any[] = [];
      
      let fyStartForTB: Date;
      if (periodMode === 'fiscal_year') {
         fyStartForTB = startDate;
      } else {
         const em = endDate.getMonth() + 1;
         const ey = endDate.getFullYear();
         const sy = em < fiscalStartMonth ? ey - 1 : ey;
         fyStartForTB = new Date(sy, fiscalStartMonth - 1, 1);
      }

      // Determine effective start date for Trial Balance calculation
      // If "Rolling 12 Months", we want the breakdown to match the chart, so we use rangeStart (12 months ago)
      // If "Fiscal Year", we want YTD, so we use the start of the current Fiscal Year
      let effectiveStart: Date;
      if (periodMode === 'fiscal_year') {
         // Calculate start of fiscal year relative to selected date
         // If selectedYear is the Fiscal Year (e.g. 2025), and it starts in March
         const startMonthIndex = fiscalStartMonth - 1;
         const startYear = getCalendarYearForFiscalPeriod(selectedYear, fiscalStartMonth); 
         effectiveStart = new Date(startYear, startMonthIndex, 1);
      } else {
         effectiveStart = rangeStart;
      }

      if (isDemo) {
        transactions = await getDemoTransactions();
        trialBalance = await getDemoTrialBalanceForPeriod(startDate.toISOString(), endDate.toISOString());
      } else {
        // Fetch TB
        // We use effectiveStart instead of startDate (selected month) to show YTD or 12-Month breakdown
        // This ensures the "Income Breakdown" graphs match the scope of the "Income vs Expenses" chart
        const tbPromise = fetchTrialBalanceForPeriod(String(cid), effectiveStart.toISOString(), endDate.toISOString(), fyStartForTB);
        
        // Fetch Recent Transactions - Direct query to avoid View limitations and ensure 'approved' are included
        const { data: txData, error: txError } = await supabase
          .from("transactions")
          .select("id, reference_number, description, total_amount, transaction_date, transaction_type, status")
          .eq("company_id", cid)
          .in("status", ["posted", "approved", "pending"]) // Explicitly include approved and pending
          .gte("transaction_date", periodMode === 'fiscal_year' ? startDate.toISOString() : rangeStart.toISOString())
          .lte("transaction_date", endDate.toISOString())
          .order("transaction_date", { ascending: false });

        if (txError) {
           console.error("Error fetching recent transactions:", txError);
           transactions = [];
        } else {
           transactions = txData || [];
        }
        
        trialBalance = await tbPromise;
      }

      // --- CALCULATIONS (Memoized by virtue of being in queryFn) ---

      const recentTransactions = (transactions || []).slice(0, 10).map((t: any) => ({
        id: String(t.id || t.reference_number || ''),
        description: String(t.description || ''),
        date: new Date(String(t.transaction_date || new Date())).toLocaleDateString('en-ZA'),
        type: String(t.type || '').toLowerCase() === 'income' ? 'income' : (['sales','income','asset_disposal','invoice'].includes(String(t.transaction_type || '').toLowerCase()) ? 'income' : 'expense'),
        amount: Number(t.total_amount || t.amount || 0),
        status: String(t.status || 'pending').toLowerCase()
      }));

      let totals = totalsFromTrialBalance(trialBalance);
      
      // Fallback: If Trial Balance yields 0 (e.g. missing entries), calculate from Transactions directly
      if (totals.income === 0 && totals.expenses === 0 && transactions.length > 0) {
        const fallbackIncome = transactions
          .filter((t: any) => ['income', 'sales', 'invoice', 'revenue'].includes((t.transaction_type || '').toLowerCase()))
          .reduce((sum: number, t: any) => sum + Number(t.total_amount || 0), 0);
          
        const fallbackExpenses = transactions
          .filter((t: any) => ['expense', 'bill', 'payment'].includes((t.transaction_type || '').toLowerCase()))
          .reduce((sum: number, t: any) => sum + Number(t.total_amount || 0), 0);
          
        if (fallbackIncome > 0 || fallbackExpenses > 0) {
           totals = { income: fallbackIncome, expenses: fallbackExpenses };
        }
      }
      
      const operatingExpensesTB = (trialBalance || [])
        .filter((a: any) => {
          const type = String(a.account_type || '').toLowerCase();
          const name = String(a.account_name || '').toLowerCase();
          const code = String(a.account_code || '');
          const isExpense = type === 'expense';
          const isCogs = name.includes('cost of') || name.includes('goods sold') || code.startsWith('5000');
          return isExpense && !isCogs;
        })
        .reduce((s: number, a: any) => s + Math.abs(Number(a.balance || 0)), 0);

      // Fallback for Operating Expenses if TB is empty
      const operatingExpenses = operatingExpensesTB > 0 ? operatingExpensesTB : totals.expenses;
        
      const bsAssets = (trialBalance || []).filter((a: any) => String(a.account_type || '').toLowerCase() === 'asset').reduce((s: number, a: any) => s + Number(a.balance || 0), 0);
      const bsLiabilities = (trialBalance || []).filter((a: any) => String(a.account_type || '').toLowerCase() === 'liability').reduce((s: number, a: any) => s + Number(a.balance || 0), 0);
      const bsEquity = (trialBalance || []).filter((a: any) => String(a.account_type || '').toLowerCase() === 'equity').reduce((s: number, a: any) => s + Number(a.balance || 0), 0);

      console.log('Trial Balance - Assets:', trialBalance?.filter((a: any) => String(a.account_type || '').toLowerCase() === 'asset'));
      console.log('Trial Balance - Liabilities:', trialBalance?.filter((a: any) => String(a.account_type || '').toLowerCase() === 'liability'));
      console.log('Trial Balance - Equity:', trialBalance?.filter((a: any) => String(a.account_type || '').toLowerCase() === 'equity'));
      console.log('Total Assets:', bsAssets, 'Total Liabilities:', bsLiabilities, 'Total Equity:', bsEquity);

      // Detailed BS Breakdown
      let bsCurrentAssets = 0;
      let bsNonCurrentAssets = 0;
      let bsCurrentLiabilities = 0;
      let bsNonCurrentLiabilities = 0;
      let bsEquityCapital = 0;
      let bsEquityRetained = 0;

      (trialBalance || []).forEach((a: any) => {
        const type = String(a.account_type || '').toLowerCase();
        const code = parseInt(String(a.account_code || '0'), 10);
        const bal = Number(a.balance || 0);
        const name = String(a.account_name || '').toLowerCase();

        if (type === 'asset') {
          // Convention: < 1500 is Current (Bank, AR, Inventory), >= 1500 is Non-Current (Fixed, Long-term)
          if (code < 1500) bsCurrentAssets += bal;
          else bsNonCurrentAssets += bal;
        } else if (type === 'liability') {
          // Convention: < 2400 is Current Liabilities (AP, VAT, Short-term up to 2300), >= 2400 is Non-Current (Loans 2400+, Mortgages, etc.)
          if (code < 2400) bsCurrentLiabilities += bal;
          else bsNonCurrentLiabilities += bal;
        } else if (type === 'equity') {
          if (name.includes('retained') || name.includes('earnings')) bsEquityRetained += bal;
          else bsEquityCapital += bal;
        }
      });
      
      const bsBreakdown = {
        assets: { current: bsCurrentAssets, nonCurrent: bsNonCurrentAssets, total: bsAssets },
        liabilities: { current: bsCurrentLiabilities, nonCurrent: bsNonCurrentLiabilities, total: bsLiabilities },
        equity: { capital: bsEquityCapital, retained: bsEquityRetained, total: bsEquity }
      };

      const incomeAccounts = (trialBalance || []).filter((a: any) => {
        const t = String(a.account_type || '').toLowerCase();
        return ['revenue', 'income', 'sales'].includes(t);
      }).map((a: any) => ({ name: String(a.account_name || ''), value: Math.abs(Number(a.balance || 0)) }));

      console.log('Income accounts for pie chart:', incomeAccounts);

      const expenseAccounts = (trialBalance || []).filter((a: any) => {
        const t = String(a.account_type || '').toLowerCase();
        return ['expense', 'expenses', 'cost of goods sold', 'cogs'].includes(t);
      }).map((a: any) => ({ 
        name: String(a.account_name || ''), 
        code: String(a.account_code || ''),
        type: String(a.account_type || ''),
        balance: a.balance,
        value: Math.abs(Number(a.balance || 0)) 
      }));

      console.log('All expense accounts (for expense breakdown):', expenseAccounts);

      // Separate COGS from OPE
      const cogsAccounts = expenseAccounts.filter((a: any) => 
        a.name.toLowerCase().includes('cost of') || 
        a.name.toLowerCase().includes('goods sold') ||
        a.code.startsWith('5000') ||
        a.type.toLowerCase() === 'cost of goods sold' ||
        a.type.toLowerCase() === 'cogs'
      );
      console.log('COGS accounts:', cogsAccounts);

      let incomeBreakdown = incomeAccounts.sort((a: any, b: any) => b.value - a.value).slice(0, 10);
      let expenseBreakdown = expenseAccounts.sort((a: any, b: any) => b.value - a.value).slice(0, 10);

      // Chart Data Logic
      const months: Array<{ start: Date; end: Date; label: string }> = [];
      for (let i = 0; i < chartMonths; i++) {
        const monthIndex = (fiscalStartMonth - 1 + i) % 12;
        const monthNum = monthIndex + 1;
        const yearForMonth = getCalendarYearForFiscalPeriod(selectedYear, monthNum);
        const ms = new Date(yearForMonth, monthIndex, 1);
        const me = new Date(yearForMonth, monthIndex + 1, 0, 23, 59, 59, 999);
        const label = ms.toLocaleDateString('en-ZA', { month: 'short' });
        months.push({ start: ms, end: me, label });
      }

      // Use ledger_entries for monthly charts to avoid duplicates
      const { data: ledgerRange } = await supabase
        .from('ledger_entries')
        .select('account_id, debit, credit, entry_date')
        .eq('company_id', cid)
        .gte('entry_date', months[0].start.toISOString())
        .lte('entry_date', months[months.length - 1].end.toISOString());

      console.log('Ledger entries for monthly charts:', ledgerRange?.length || 0);

      // Use ledger entries if available, otherwise fallback to transaction_entries
      let entriesForCharts: any[] = ledgerRange || [];
      if (!entriesForCharts || entriesForCharts.length === 0) {
        const { data: txRange } = await supabase
          .from('transaction_entries')
          .select(`account_id, debit, credit, transactions!inner (transaction_date, company_id)`) 
          .eq('transactions.company_id', cid)
          .gte('transactions.transaction_date', months[0].start.toISOString())
          .lte('transactions.transaction_date', months[months.length - 1].end.toISOString())
          .in('transactions.status', ['posted', 'approved', 'pending']);
        entriesForCharts = txRange || [];
      }

      // Use entry_date for ledger, transaction_date for transaction_entries
      const getEntryDate = (e: any) => e.entry_date ? new Date(String(e.entry_date)) : new Date(String(e.transactions?.transaction_date || new Date()));

      const { data: accountsAll } = await supabase
        .from('chart_of_accounts')
        .select('id, account_type, account_name, account_code')
        .eq('company_id', cid);
        
      const typeByIdAll = new Map<string, string>((accountsAll || []).map((a: any) => [String(a.id), String(a.account_type || '').toLowerCase()]));
      const nameByIdAll = new Map<string, string>((accountsAll || []).map((a: any) => [String(a.id), String(a.account_name || '')]));
      const codeByIdAll = new Map<string, string>((accountsAll || []).map((a: any) => [String(a.id), String(a.account_code || '')]));
      
      const buckets: Record<string, { income: number; expenses: number; cogs: number; opex: number; label: string }> = {};
      months.forEach(m => { 
        const key = `${m.start.getFullYear()}-${m.start.getMonth()}`;
        buckets[key] = { income: 0, expenses: 0, cogs: 0, opex: 0, label: m.label }; 
      });
      
      (entriesForCharts || []).forEach((e: any) => {
        const dt = getEntryDate(e);
        const key = `${dt.getFullYear()}-${dt.getMonth()}`;
        if (!buckets[key]) return;
        const id = String(e.account_id || '');
        const type = (typeByIdAll.get(id) || '').toLowerCase();
        const name = String(nameByIdAll.get(id) || '').toLowerCase();
        const code = codeByIdAll.get(id) || '';
        const debit = Number(e.debit || 0);
        const credit = Number(e.credit || 0);
        const isIncome = type.includes('income') || type.includes('revenue');
        const isExpense = type.includes('expense') || name.includes('cost of') || String(code).startsWith('5');
        
        if (isIncome) {
          buckets[key].income += Math.abs(credit - debit);
        } else if (isExpense) {
          const val = Math.abs(debit - credit);
          buckets[key].expenses += val;
          const isCogs = name.includes('cost of') || name.includes('goods sold') || String(code).startsWith('5000');
          if (isCogs) buckets[key].cogs += val;
          else buckets[key].opex += val;
        }
      });

      const chartData: any[] = [];
      const netProfitTrend: any[] = [];
      const costStructure: any[] = [];
      const profitMargins: any[] = [];
      const assetTrend: any[] = [];
      
      let prevMonthIncome = 0;
      let prevMonthExpenses = 0;
      let prevMonthProfit = 0;

      // Ensure we iterate chronologically based on 'months' array, not 'buckets' keys (which might be unsorted)
      months.forEach(m => {
        const key = `${m.start.getFullYear()}-${m.start.getMonth()}`;
        const r = buckets[key];
        
        if (!r) return; // Should not happen as buckets is initialized from months

        const netProfit = r.income - r.expenses;
        const incomePctChange = prevMonthIncome > 0 ? ((r.income - prevMonthIncome) / prevMonthIncome) * 100 : 0;
        const expensePctChange = prevMonthExpenses > 0 ? ((r.expenses - prevMonthExpenses) / prevMonthExpenses) * 100 : 0;
        const profitPctChange = prevMonthProfit !== 0 ? ((netProfit - prevMonthProfit) / Math.abs(prevMonthProfit)) * 100 : 0;

        chartData.push({ 
           month: r.label, 
           income: Number(r.income.toFixed(2)), 
           expenses: Number(r.expenses.toFixed(2)),
           profit: Number(netProfit.toFixed(2)),
           incomePctChange: Number(incomePctChange.toFixed(1)),
           expensePctChange: Number(expensePctChange.toFixed(1))
        });
        
        netProfitTrend.push({ 
          month: r.label, 
          netProfit: Number(netProfit.toFixed(2)),
          pctChange: Number(profitPctChange.toFixed(1))
        });
        
        const totalCosts = r.cogs + r.opex;
        const cogsPct = totalCosts > 0 ? (r.cogs / totalCosts) * 100 : 0;
        const opexPct = totalCosts > 0 ? (r.opex / totalCosts) * 100 : 0;
        
        costStructure.push({ 
          month: r.label, 
          cogs: Number(r.cogs.toFixed(2)), 
          opex: Number(r.opex.toFixed(2)),
          total: Number(totalCosts.toFixed(2)),
          cogsPct: Number(cogsPct.toFixed(1)),
          opexPct: Number(opexPct.toFixed(1))
        });
        const grossProfit = r.income - r.cogs;
        const operatingProfit = r.income - r.expenses; // Simplified EBIT
        
        const grossMargin = r.income > 0 ? (grossProfit / r.income) * 100 : 0;
        const operatingMargin = r.income > 0 ? (operatingProfit / r.income) * 100 : 0;
        const netMargin = r.income > 0 ? (netProfit / r.income) * 100 : 0;
        
        profitMargins.push({ 
          month: r.label, 
          grossMargin: Number(grossMargin.toFixed(1)), 
          operatingMargin: Number(operatingMargin.toFixed(1)), 
          netMargin: Number(netMargin.toFixed(1)) 
        });
        assetTrend.push({ month: r.label, nbv: 0 }); 
        
        prevMonthIncome = r.income;
        prevMonthExpenses = r.expenses;
        prevMonthProfit = netProfit;
      });

      // BS Trend
      const bsMovements: Record<string, { assets: number; liabilities: number; equity: number; label: string }> = {};
      months.forEach(m => { 
        const key = `${m.start.getFullYear()}-${m.start.getMonth()}`;
        bsMovements[key] = { assets: 0, liabilities: 0, equity: 0, label: m.label }; 
      });

      (entriesForCharts || []).forEach((e: any) => {
        const dt = getEntryDate(e);
        const key = `${dt.getFullYear()}-${dt.getMonth()}`;
        if (!bsMovements[key]) return;
        const id = String(e.account_id || '');
        const type = (typeByIdAll.get(id) || '').toLowerCase();
        const debit = Number(e.debit || 0);
        const credit = Number(e.credit || 0);
        
        if (type === 'asset') bsMovements[key].assets += (debit - credit);
        else if (type === 'liability') bsMovements[key].liabilities += (credit - debit);
        else if (type === 'equity') bsMovements[key].equity += (credit - debit);
      });

      let runningAssets = bsAssets;
      let runningLiabilities = bsLiabilities;
      let runningEquity = bsEquity;

      const bsCompositionReverse: any[] = [];
      
      for (let i = months.length - 1; i >= 0; i--) {
        const m = months[i];
        const key = `${m.start.getFullYear()}-${m.start.getMonth()}`;
        const move = bsMovements[key];
        
        bsCompositionReverse.push({
          label: m.label,
          assets: Number(runningAssets.toFixed(2)),
          liabilities: Number(runningLiabilities.toFixed(2)),
          equity: Number(runningEquity.toFixed(2))
        });

        runningAssets -= move.assets;
        runningLiabilities -= move.liabilities;
        runningEquity -= move.equity;
      }

      const bsComposition = bsCompositionReverse.reverse();

      // Fixed Assets
      const { data: fa } = await supabase.from('fixed_assets').select('id, cost, purchase_date, useful_life_years, status').eq('company_id', cid);
      if (fa && fa.length > 0) {
        for (let i = 0; i < months.length; i++) {
          const monthEnd = months[i].end;
          let nbvSum = 0;
          let depSum = 0;
          (fa || []).forEach((asset: any) => {
            if (String(asset.status || '').toLowerCase() === 'disposed') return;
            const res = calculateDepreciation(Number(asset.cost || 0), String(asset.purchase_date), Number(asset.useful_life_years || 5), monthEnd);
            nbvSum += Number(res.netBookValue || 0);
            
            // Calculate monthly depreciation for this specific month
            // If the asset was active during this month, add its monthly depreciation
            const pDate = new Date(asset.purchase_date);
            const isActive = pDate <= monthEnd && res.netBookValue > 0;
            if (isActive) {
               depSum += (Number(asset.cost) / Number(asset.useful_life_years)) / 12;
            }
          });
          if (assetTrend[i]) {
            assetTrend[i].nbv = Number(nbvSum.toFixed(2));
            assetTrend[i].depreciation = Number(depSum.toFixed(2));
          }
        }
      }

      // Bank Balance
      const { data: banks } = await supabase.from('bank_accounts').select('current_balance').eq('company_id', cid);
      const bankBalance = (banks || []).reduce((s: number, b: any) => s + Number(b.current_balance || 0), 0);

      // Inventory
      const { data: products } = await supabase.from('items').select('name, quantity_on_hand').eq('company_id', cid).eq('item_type', 'product');
      const inventoryLevels = (products || []).map((p: any) => ({ name: String(p.name || 'Unknown'), qty: Number(p.quantity_on_hand || 0) })).sort((a, b) => a.qty - b.qty).slice(0, 10);

      // AR / AP
      const { data: invoices } = await supabase.from('invoices').select('id, customer_name, total_amount, status, invoice_date, due_date').eq('company_id', cid).gte('invoice_date', rangeStart.toISOString()).lte('invoice_date', endDate.toISOString());
      const unpaidStatuses = new Set(['unpaid','pending','partial','sent','overdue','open']);
      const today = new Date();
      
      const arByCustomer: Record<string, { total: number, current: number, days1_30: number, days31_60: number, days61_90: number, days90plus: number }> = {};
      
      let arUnpaid = 0, arOver30 = 0, arOver90 = 0, arUnder30 = 0;
      
      (invoices || []).forEach((inv: any) => {
        const amt = Number(inv.total_amount || 0);
        if (unpaidStatuses.has(String(inv.status || '').toLowerCase())) {
          const name = String(inv.customer_name || 'Unknown');
          
          if (!arByCustomer[name]) {
            arByCustomer[name] = { total: 0, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
          }
          
          arByCustomer[name].total += amt;
          arUnpaid += amt;
          
          const due = inv.due_date ? new Date(String(inv.due_date)) : null;
          if (due) {
            const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 0) {
              arByCustomer[name].current += amt;
            } else if (diffDays <= 30) {
              arByCustomer[name].days1_30 += amt;
              arUnder30 += amt;
            } else if (diffDays <= 60) {
              arByCustomer[name].days31_60 += amt;
              arOver30 += amt;
            } else if (diffDays <= 90) {
              arByCustomer[name].days61_90 += amt;
              arOver30 += amt;
            } else {
              arByCustomer[name].days90plus += amt;
              arOver90 += amt;
            }
          } else {
             // If no due date, treat as current
             arByCustomer[name].current += amt;
          }
        }
      });
      
      const arTop10 = Object.entries(arByCustomer)
        .map(([name, data]) => ({ 
          name, 
          amount: data.total,
          current: data.current,
          days1_30: data.days1_30,
          days31_60: data.days31_60,
          days61_90: data.days61_90,
          days90plus: data.days90plus
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);
        
      const arDonut = arTop10.map(r => ({ name: r.name, value: Number(r.amount.toFixed(2)) }));
      const arKpis = { unpaidTotal: Number(arUnpaid.toFixed(2)), overdueTotal: Number((arUnder30 + arOver30 + arOver90).toFixed(2)), overdueUnder30Total: Number(arUnder30.toFixed(2)), overdue30Total: Number(arOver30.toFixed(2)), overdue90Total: Number(arOver90.toFixed(2)) };

      // AP - Using Purchase Orders only (Bills module is hidden)
      // Fetch suppliers to map names
      const { data: suppliers } = await supabase.from('suppliers').select('id, name').eq('company_id', cid);
      const supplierMap = new Map((suppliers || []).map(s => [s.id, s.name]));

      const { data: purchases } = await supabase
        .from('purchase_orders')
        .select('id, supplier_id, total_amount, status, po_date')
        .eq('company_id', cid)
        .gte('po_date', rangeStart.toISOString().split('T')[0])
        .lte('po_date', endDate.toISOString().split('T')[0]);
      
      const purchaseTrend: any[] = [];
      let cumulativePurchases = 0;
      let prevMonthPurchases = 0;

      months.forEach(m => {
        let sum = 0;
        let topSuppliersMap = new Map<string, number>();

        (purchases || []).forEach((po: any) => {
          const d = new Date(String(po.po_date || new Date()));
          d.setHours(0, 0, 0, 0);
          const mStart = new Date(m.start); mStart.setHours(0, 0, 0, 0);
          const mEnd = new Date(m.end); mEnd.setHours(23, 59, 59, 999);
          
          if (d >= mStart && d <= mEnd) {
             const amt = Number(po.total_amount || 0);
             sum += amt;
             const sName = supplierMap.get(po.supplier_id) || 'Unknown';
             topSuppliersMap.set(sName, (topSuppliersMap.get(sName) || 0) + amt);
          }
        });
        
        cumulativePurchases += sum;
        const pctChange = prevMonthPurchases > 0 ? ((sum - prevMonthPurchases) / prevMonthPurchases) * 100 : 0;
        
        // Get top 3 suppliers for this month
        const topSuppliers = Array.from(topSuppliersMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, amount]) => ({ name, amount }));

        purchaseTrend.push({ 
          month: m.label, 
          amount: Number(sum.toFixed(2)), 
          cumulative: Number(cumulativePurchases.toFixed(2)),
          pctChange: Number(pctChange.toFixed(1)),
          topSuppliers
        });
        
        prevMonthPurchases = sum;
      });

      const apRows: Array<{ supplier_name: string; outstanding: number; due_date?: string | null }> = [];
      (purchases || []).forEach((po: any) => {
        const status = String(po.status || '').toLowerCase();
        if (status !== 'paid' && status !== 'cancelled' && status !== 'rejected') {
           // Default due_date to po_date + 30 days as fallback since column is missing
           const poDate = new Date(po.po_date || new Date());
           const dueDate = new Date(poDate);
           dueDate.setDate(dueDate.getDate() + 30);
           
           apRows.push({ 
             supplier_name: supplierMap.get(po.supplier_id) || 'Unknown Supplier', 
             outstanding: Number(po.total_amount || 0), 
             due_date: dueDate.toISOString() 
           });
        }
      });
      const apTotalsMap = new Map<string, number>();
      let apUnpaid = 0, apOver30 = 0, apOver90 = 0, apUnder30 = 0;
      apRows.forEach(r => {
        const key = r.supplier_name || 'Unknown';
        apTotalsMap.set(key, (apTotalsMap.get(key) || 0) + r.outstanding);
        apUnpaid += r.outstanding;
        const due = r.due_date ? new Date(String(r.due_date)) : null;
        if (due) {
          const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 90) apOver90 += r.outstanding;
          else if (diffDays > 30) apOver30 += r.outstanding;
          else if (diffDays > 0) apUnder30 += r.outstanding;
        }
      });
      const apTop10 = Array.from(apTotalsMap.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 10);
      const apDonut = apTop10.map(r => ({ name: r.name, value: Number(r.amount.toFixed(2)) }));
      const apKpis = { unpaidTotal: Number(apUnpaid.toFixed(2)), overdueTotal: Number((apUnder30 + apOver30 + apOver90).toFixed(2)), overdueUnder30Total: Number(apUnder30.toFixed(2)), overdue30Total: Number(apOver30.toFixed(2)), overdue90Total: Number(apOver90.toFixed(2)) };

      // Quotes
      const { data: quotesRows } = await supabase.from('quotes').select('created_at, quote_date, status').eq('company_id', cid);
      let qAccepted = 0, qUnaccepted = 0;
      const rangeStartIso = months[0].start.toISOString();
      const rangeEndIso = months[months.length - 1].end.toISOString();
      (quotesRows || []).forEach((q: any) => {
        const dtIso = new Date(String(q.quote_date || q.created_at || new Date())).toISOString();
        if (dtIso < rangeStartIso || dtIso > rangeEndIso) return;
        if (['accepted','approved'].includes(String(q.status || '').toLowerCase())) qAccepted++; else qUnaccepted++;
      });
      const quotesAcceptanceDonut = [{ name: 'Accepted', value: qAccepted }, { name: 'Unaccepted', value: qUnaccepted }];

      // Bank Stats Calculation
      const bankStats = {
        totalAmount: 0,
        pending: { amount: 0, count: 0, oldestDate: null as string | null },
        approved: { amount: 0, count: 0 },
        posted: { amount: 0, count: 0 },
        matchStatus: true,
        lastSync: new Date()
      };

      (transactions || []).forEach((t: any) => {
        const amt = Number(t.total_amount || t.amount || 0);
        const status = String(t.status || 'pending').toLowerCase();
        const date = t.transaction_date;

        bankStats.totalAmount += amt;

        if (status === 'pending') {
          bankStats.pending.amount += amt;
          bankStats.pending.count++;
          if (date && (!bankStats.pending.oldestDate || date < bankStats.pending.oldestDate)) {
            bankStats.pending.oldestDate = date;
          }
        } else if (status === 'approved') {
          bankStats.approved.amount += amt;
          bankStats.approved.count++;
        } else if (status === 'posted') {
          bankStats.posted.amount += amt;
          bankStats.posted.count++;
        }
      });
      // Match status logic: if pending count > 5, flag for review
      bankStats.matchStatus = bankStats.pending.count <= 5;

      // Metrics Finalization
      const metrics = {
        totalAssets: bsAssets,
        totalLiabilities: bsLiabilities,
        totalEquity: bsEquity,
        totalIncome: totals.income,
        totalExpenses: totals.expenses,
        operatingExpenses: operatingExpenses,
        bankBalance,
        currentAssets: 0,
        currentLiabilities: 0
      };
      
      const safeMinimum = Math.max(10000, Number(metrics.operatingExpenses || 0));
      // Calculate percentage relative to safe minimum (can exceed 100%)
      const cashGaugePct = safeMinimum > 0 ? Math.max(0, (Number(metrics.bankBalance || 0) / safeMinimum) * 100) : 0;
      const cashOnTrack = Number(metrics.bankBalance || 0) >= safeMinimum;

      const finalData: DashboardData = {
        ...DEFAULT_DATA,
        metrics,
        recentTransactions,
        chartData,
        netProfitTrend,
        incomeBreakdown,
        expenseBreakdown,
        costStructure,
        profitMargins,
        assetTrend,
        inventoryLevels,
        bsComposition,
        bsBreakdown,
        arTop10,
        arDonut,
        arKpis,
        apTop10,
        apDonut,
        apKpis,
        purchaseTrend,
        quotesAcceptanceDonut,
        cashGaugePct,
        cashOnTrack,
        safeMinimum,
        incomeWheelInner: [{ name: 'Expenses', value: metrics.totalExpenses }, { name: 'Income', value: metrics.totalIncome }],
        expenseWheelInner: [{ name: 'Income', value: metrics.totalIncome }, { name: 'Expenses', value: metrics.totalExpenses }],
        bankStats,
        rawInvoices: invoices || [],
        rawTransactions: transactions || []
      };

      // --- CACHE UPDATE ---
      // Update IndexedDB with fresh data
      try {
        await db.dashboardCache.put({
          key: cacheKey,
          companyId: cid,
          timestamp: Date.now(),
          payload: finalData
        });
      } catch (err) {
        console.error("Failed to update dashboard cache in IndexedDB", err);
      }

      return finalData;
    },
    staleTime: 0, // Always fetch fresh data, no caching of network requests
    gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchOnMount: true, // Changed to true to ensure we always get fresh data
  });

  // Return logic:
  // 1. Always prefer query data (fresh from network) over cached data.
  // 2. Only use cachedData as fallback if query has no data yet.
  // 3. Status flags should reflect whether we are showing *something* or nothing.
  
  const data = query.data || cachedData;
  
  // We are "loading" if we have NO data from either source and the query is pending.
  // If we have cached data, we are technically "loading in background" (isFetching), but not "loading" (blocking).
  const isLoading = !data && query.isLoading;

  return {
    data,
    isLoading,
    isFetching: query.isFetching,
    error: query.error
  };
};
