import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { exportFinancialReportToExcel, exportFinancialReportToPDF } from "@/lib/export-utils";
import type { FinancialReportLine } from "@/lib/export-utils";
import { AccountDrilldown } from "./AccountDrilldown";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { 
  FileText, 
  Download, 
  TrendingUp, 
  BarChart3, 
  Activity,
  Loader2,
  Calendar,
  Eye,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { isDemoMode, getDemoTrialBalanceForPeriod as demoTBPeriod, getDemoTrialBalanceAsOf as demoTBAsOf } from "@/lib/demo-data";
import { financialReportsCache } from "@/services/financialReportsCache";
import { SageLoadingOverlay } from "./SageLoadingOverlay";

export const EnhancedFinancialReports = () => {
  const cachedSettings = useMemo(() => financialReportsCache.getViewSettings(), []);

  const initialData = useMemo(() => {
    if (cachedSettings?.companyId && cachedSettings?.periodStart && cachedSettings?.periodEnd) {
      return financialReportsCache.get(cachedSettings.companyId, 'enhanced_report', cachedSettings.periodStart, cachedSettings.periodEnd);
    }
    return null;
  }, []);

  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [activeReport, setActiveReport] = useState<'pl' | 'bs' | 'cf' | 'tb'>(() => 
    (cachedSettings?.activeTab as any) || 'pl'
  );
  const [periodStart, setPeriodStart] = useState(() => {
    return cachedSettings?.periodStart || `${new Date().getFullYear()}-01-01`;
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    return cachedSettings?.periodEnd || new Date().toISOString().split('T')[0];
  });
  // Track if user is actively changing filters - used to force cache refresh
  const [isFilterChanging, setIsFilterChanging] = useState(false);
  // Track filter changes to force cache refresh
  useEffect(() => {
    setIsFilterChanging(true);
  }, [periodStart, periodEnd]);

  // Reset filter changing flag after data loads
  useEffect(() => {
    if (!loading && isFilterChanging) {
      setIsFilterChanging(false);
    }
  }, [loading, isFilterChanging]);
  const { selectedFiscalYear, getFiscalYearDates, fiscalStartMonth, lockFiscalYear } = useFiscalYear();
  const [companyId, setCompanyId] = useState<string | null>(() => 
    cachedSettings?.companyId || financialReportsCache.getLastCompanyId() || null
  );
  const [reportData, setReportData] = useState<{
    profitLoss: any[];
    balanceSheet: any[];
    cashFlow: any[];
    trialBalance: any[];
  }>(() => initialData || { profitLoss: [], balanceSheet: [], cashFlow: [], trialBalance: [] });
  const [fallbackCOGS, setFallbackCOGS] = useState<number>(0);
  const [vatNet, setVatNet] = useState<number>(0);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true);
  
  const [drilldownAccount, setDrilldownAccount] = useState<{
    id: string;
    name: string;
    code: string;
  } | null>(null);

  const { toast } = useToast();

  // Save view settings whenever they change
  useEffect(() => {
    financialReportsCache.saveViewSettings({
      companyId,
      activeTab: activeReport,
      periodStart,
      periodEnd
    });
  }, [companyId, activeReport, periodStart, periodEnd]);

  const loadFinancialData = useCallback(async () => {
    try {
      let currentCompanyId = companyId;

      if (!currentCompanyId) {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (profile?.company_id) {
            currentCompanyId = profile.company_id;
            setCompanyId(currentCompanyId);
        }
      }
      
      if (!currentCompanyId) return;

      // Try to load from cache first to show immediate results
      // Cache key includes company and period, but NOT activeReport because we fetch/store all reports at once
      // When filters are actively changing, bypass cache to get fresh data
      const cached = financialReportsCache.get(currentCompanyId, 'enhanced_report', periodStart, periodEnd, isFilterChanging);
      let cachedLoaded = false;
      if (cached && !isFilterChanging) {
        setReportData(cached);
        cachedLoaded = true;
        setLoading(false);
      }
      
      if (!cachedLoaded) setLoading(true);

      const housekeeping = (async () => {
        try { await (supabase as any).rpc('backfill_invoice_postings', { _company_id: currentCompanyId }); } catch {}
        try {
          const { count: nullTxCount } = await supabase
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', currentCompanyId)
            .is('transaction_date', null);
          if ((nullTxCount || 0) > 0) {
            toast({ title: 'Missing transaction dates detected', description: `${nullTxCount} transaction(s) have no date and were excluded from period reports. Please update their dates for accurate reporting.`, variant: 'default' });
          }
        } catch {}
      })();
      const demo = isDemoMode();
      const [trialBalancePeriod, cumulativeTB, openingAssets, cogsFallback] = demo ? [
        demoTBPeriod(periodStart, periodEnd),
        demoTBAsOf(periodEnd),
        [],
        0
      ] : await Promise.all([
        fetchTrialBalanceForPeriod(currentCompanyId, periodStart, periodEnd),
        fetchTrialBalanceCumulativeToEnd(currentCompanyId, periodEnd),
        supabase
          .from('fixed_assets')
          .select('cost, accumulated_depreciation, status, description')
          .eq('company_id', currentCompanyId)
          .then(res => res.data),
        calculateCOGSFromInvoices(currentCompanyId, periodStart, periodEnd),
      ]) as [any[], any[], any[], number];

      await housekeeping;
      setFallbackCOGS(cogsFallback || 0);
      let openingPpeNbv = 0;
      try {
        openingPpeNbv = (openingAssets || [])
          .filter((a: any) => String(a.status || 'active').toLowerCase() !== 'disposed')
          .filter((a: any) => String(a.description || '').toLowerCase().includes('[opening]'))
          .reduce((sum: number, a: any) => sum + Math.max(0, Number(a.cost || 0) - Number(a.accumulated_depreciation || 0)), 0);
      } catch {}
      const pl = generateProfitLoss(trialBalancePeriod as any[] || []);
      const bs = generateBalanceSheet(cumulativeTB as any[] || [], openingPpeNbv);
      
      const newReportData = { profitLoss: pl, balanceSheet: bs, cashFlow: [], trialBalance: trialBalancePeriod as any[] || [] };
      setReportData(newReportData);
      
      // Update cache
      financialReportsCache.set(currentCompanyId, 'enhanced_report', periodStart, periodEnd, newReportData);
      
      setLoading(false);
      const cf = demo ? [] : await generateCashFlow(currentCompanyId);
      
      setReportData(prev => {
        const updated = { ...prev, cashFlow: cf };
        financialReportsCache.set(currentCompanyId, 'enhanced_report', periodStart, periodEnd, updated);
        return updated;
      });

      try {
        const { data: v } = await supabase.rpc('validate_trial_balance' as any, {
          _company_id: currentCompanyId,
          _period_start: periodStart,
          _period_end: periodEnd,
        });
        const res = Array.isArray(v) ? v[0] : null;
        if (res && res.is_balanced === false) {
          toast({ title: 'Trial balance not balanced', description: `Difference: ${Number(res.difference || 0).toFixed(2)}`, variant: 'destructive' });
        }
      } catch {}
    } catch (error: any) {
      console.error('Error loading financial data:', error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [periodStart, periodEnd, selectedFiscalYear, toast, companyId, isFilterChanging]);
  useEffect(() => { loadFinancialData(); }, [periodStart, periodEnd, loadFinancialData]);

  const refreshCurrentReport = useCallback(async (background = false) => {
    try {
      if (!companyId) {
        if (!background) await loadFinancialData();
        return;
      }
      if (!background) setRefreshing(true);
      // If background refresh, we just want to update the data silently
      // But we should check if we need to fetch EVERYTHING or just the active one
      // For simplicity, fetch everything in background to keep cache fresh
      
      if (background) {
         // Fetch all critical data in background
         const [tb, cumulativeTB, openingAssets] = await Promise.all([
            fetchTrialBalanceForPeriod(companyId, periodStart, periodEnd),
            fetchTrialBalanceCumulativeToEnd(companyId, periodEnd),
            supabase
            .from('fixed_assets')
            .select('cost, accumulated_depreciation, status, description')
            .eq('company_id', companyId)
            .then(res => res.data),
         ]);
         
         let openingPpeNbv = 0;
         try {
            openingPpeNbv = (openingAssets || [])
            .filter((a: any) => String(a.status || 'active').toLowerCase() !== 'disposed')
            .filter((a: any) => String(a.description || '').toLowerCase().includes('[opening]'))
            .reduce((sum: number, a: any) => sum + Math.max(0, Number(a.cost || 0) - Number(a.accumulated_depreciation || 0)), 0);
         } catch {}
         
         const pl = generateProfitLoss(tb as any[] || []);
         const bs = generateBalanceSheet(cumulativeTB as any[] || [], openingPpeNbv);
         
         // Update state and cache
         setReportData(prev => {
             const next = { ...prev, profitLoss: pl, balanceSheet: bs, trialBalance: tb as any[] || [] };
             financialReportsCache.set(companyId, 'enhanced_report', periodStart, periodEnd, next);
             return next;
         });
         
         // Fetch Cashflow separately if needed, or just let it be lazy
         const cf = await generateCashFlow(companyId);
         setReportData(prev => {
             const next = { ...prev, cashFlow: cf };
             financialReportsCache.set(companyId, 'enhanced_report', periodStart, periodEnd, next);
             return next;
         });
         
         return;
      }

      if (activeReport === 'tb') {
        const tb = await fetchTrialBalanceForPeriod(companyId, periodStart, periodEnd);
        setReportData(prev => {
           const next = { ...prev, trialBalance: tb as any[] || [] };
           financialReportsCache.set(companyId, 'enhanced_report', periodStart, periodEnd, next);
           return next;
        });
      } else if (activeReport === 'pl') {
        const tb = await fetchTrialBalanceForPeriod(companyId, periodStart, periodEnd);
        const pl = generateProfitLoss(tb as any[] || []);
        setReportData(prev => {
            const next = { ...prev, profitLoss: pl, trialBalance: tb as any[] || [] };
            financialReportsCache.set(companyId, 'enhanced_report', periodStart, periodEnd, next);
            return next;
        });
      } else if (activeReport === 'bs') {
        const [cumulativeTB, openingAssets] = await Promise.all([
          fetchTrialBalanceCumulativeToEnd(companyId, periodEnd),
          supabase
            .from('fixed_assets')
            .select('cost, accumulated_depreciation, status, description')
            .eq('company_id', companyId)
            .then(res => res.data),
        ]);
        let openingPpeNbv = 0;
        try {
          openingPpeNbv = (openingAssets || [])
            .filter((a: any) => String(a.status || 'active').toLowerCase() !== 'disposed')
            .filter((a: any) => String(a.description || '').toLowerCase().includes('[opening]'))
            .reduce((sum: number, a: any) => sum + Math.max(0, Number(a.cost || 0) - Number(a.accumulated_depreciation || 0)), 0);
        } catch {}
        const bs = generateBalanceSheet(cumulativeTB || [], openingPpeNbv);
        setReportData(prev => {
            const next = { ...prev, balanceSheet: bs };
            financialReportsCache.set(companyId, 'enhanced_report', periodStart, periodEnd, next);
            return next;
        });
      } else if (activeReport === 'cf') {
        const cf = await generateCashFlow(companyId);
        setReportData(prev => {
            const next = { ...prev, cashFlow: cf };
            financialReportsCache.set(companyId, 'enhanced_report', periodStart, periodEnd, next);
            return next;
        });
      }
    } catch (error: any) {
      console.error('Error refreshing report:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  }, [activeReport, companyId, periodStart, periodEnd, toast, loadFinancialData]);

  const autoRefreshTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!companyId) return;
    if (!isAutoRefreshEnabled) return;
    const ch = (supabase as any).channel('enhanced_fin_auto_refresh');
    const schedule = () => {
      if (autoRefreshTimer.current) {
        clearTimeout(autoRefreshTimer.current);
      }
      toast({ title: 'Data changed', description: 'Refreshing current report' });
      autoRefreshTimer.current = window.setTimeout(() => {
        refreshCurrentReport(true);
      }, 1200);
    };
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `company_id=eq.${companyId}` }, schedule);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_entries', filter: `company_id=eq.${companyId}` }, schedule);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'fixed_assets', filter: `company_id=eq.${companyId}` }, schedule);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `company_id=eq.${companyId}` }, schedule);
    ch.subscribe();
    return () => {
      try { (supabase as any).removeChannel(ch); } catch {}
      if (autoRefreshTimer.current) {
        clearTimeout(autoRefreshTimer.current);
        autoRefreshTimer.current = null;
      }
    };
  }, [companyId, activeReport, periodStart, periodEnd, isAutoRefreshEnabled]);

  useEffect(() => {
    const fy = typeof selectedFiscalYear === 'number' ? selectedFiscalYear : new Date().getFullYear();
    const { startStr, endStr } = getFiscalYearDates(fy);
    setPeriodStart(startStr);
    setPeriodEnd(endStr);
  }, [selectedFiscalYear, getFiscalYearDates]);



  // Fetch period-specific trial balance using transaction_entries joined to transactions.date within range (posted only)
  const fetchTrialBalanceForPeriod = async (companyId: string, start: string, end: string) => {
    const startDateObj = new Date(start);
    const startISO = startDateObj.toISOString();
    const endDateObj = new Date(end);
    endDateObj.setHours(23, 59, 59, 999);
    const endISO = endDateObj.toISOString();

    const [accountsRes, txRes, ledgerRes] = await Promise.all([
      supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('account_code'),
      supabase
        .from('transaction_entries')
        .select(`
          transaction_id,
          account_id,
          debit,
          credit,
          description,
          transactions!inner (
            transaction_date,
            status,
            company_id
          )
        `)
        .eq('transactions.company_id', companyId)
        .eq('transactions.status', 'posted')
        .gte('transactions.transaction_date', startISO)
        .lte('transactions.transaction_date', endISO)
        .not('description', 'ilike', '%Opening balance (carry forward)%'),
      supabase
        .from('ledger_entries')
        .select('transaction_id, account_id, debit, credit, entry_date, description')
        .eq('company_id', companyId)
        .gte('entry_date', startISO)
        .lte('entry_date', endISO)
        .not('description', 'ilike', '%Opening balance (carry forward)%'),
    ]);
    const accounts = (accountsRes as any).data;
    const accountsError = (accountsRes as any).error;
    if (accountsError) throw accountsError;
    const txEntries = (txRes as any).data;
    const txError = (txRes as any).error;
    if (txError) throw txError;
    const ledgerEntries = (ledgerRes as any).data;
    const ledgerError = (ledgerRes as any).error;
    if (ledgerError) throw ledgerError;

    const trialBalance: Array<{ account_id: string; account_code: string; account_name: string; account_type: string; balance: number; }> = [];

    const ledgerTxIds = new Set<string>((ledgerEntries || []).map((e: any) => String(e.transaction_id || '')));
    const filteredTxEntries = (txEntries || []).filter((e: any) => !ledgerTxIds.has(String(e.transaction_id || '')));

    (accounts || []).forEach((acc: any) => {
      let sumDebit = 0;
      let sumCredit = 0;

      filteredTxEntries?.forEach((entry: any) => {
        if (entry.account_id === acc.id) {
          sumDebit += Number(entry.debit || 0);
          sumCredit += Number(entry.credit || 0);
        }
      });

      ledgerEntries?.forEach((entry: any) => {
        if (entry.account_id === acc.id) {
          sumDebit += Number(entry.debit || 0);
          sumCredit += Number(entry.credit || 0);
        }
      });

      const type = (acc.account_type || '').toLowerCase();
      const naturalDebit = type === 'asset' || type === 'expense';
      const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);

      

      const isInventoryName = (acc.account_name || '').toLowerCase().includes('inventory');
      const isPrimaryInventory = acc.account_code === '1300';
      const shouldShow = Math.abs(balance) > 0.01 && (!isInventoryName || isPrimaryInventory);
      if (shouldShow) {
        trialBalance.push({
          account_id: acc.id,
          account_code: acc.account_code,
          account_name: acc.account_name,
          account_type: acc.account_type,
          balance
        });
      }
    });

    return trialBalance;
  };

  // Fetch cumulative trial balance up to end date (posted only) for Balance Sheet carry-forward
  const fetchTrialBalanceCumulativeToEnd = async (companyId: string, end: string) => {
    const endDateObj = new Date(end);
    endDateObj.setHours(23, 59, 59, 999);
    const endISO = endDateObj.toISOString();

    const [accountsRes, txRes, ledgerRes] = await Promise.all([
      supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('account_code'),
      supabase
        .from('transaction_entries')
        .select(`
          transaction_id,
          account_id,
          debit,
          credit,
          description,
          transactions!inner (
            transaction_date,
            status,
            company_id
          )
        `)
        .eq('transactions.company_id', companyId)
        .eq('transactions.status', 'posted')
        .lte('transactions.transaction_date', endISO)
        .not('description', 'ilike', '%Opening balance (carry forward)%'),
      supabase
        .from('ledger_entries')
        .select('transaction_id, account_id, debit, credit, entry_date, description')
        .eq('company_id', companyId)
        .lte('entry_date', endISO)
        .not('description', 'ilike', '%Opening balance (carry forward)%'),
    ]);
    const accounts = (accountsRes as any).data;
    const accountsError = (accountsRes as any).error;
    if (accountsError) throw accountsError;
    const txEntries = (txRes as any).data;
    const txError = (txRes as any).error;
    if (txError) throw txError;
    const ledgerEntries = (ledgerRes as any).data;
    const ledgerError = (ledgerRes as any).error;
    if (ledgerError) throw ledgerError;

    const trialBalance: Array<{ account_id: string; account_code: string; account_name: string; account_type: string; balance: number; }> = [];

    const ledgerTxIds = new Set<string>((ledgerEntries || []).map((e: any) => String(e.transaction_id || '')));
    const filteredTxEntries = (txEntries || []).filter((e: any) => !ledgerTxIds.has(String(e.transaction_id || '')));

    (accounts || []).forEach((acc: any) => {
      let sumDebit = 0;
      let sumCredit = 0;

      filteredTxEntries?.forEach((entry: any) => {
        if (entry.account_id === acc.id) {
          sumDebit += Number(entry.debit || 0);
          sumCredit += Number(entry.credit || 0);
        }
      });

      ledgerEntries?.forEach((entry: any) => {
        if (entry.account_id === acc.id) {
          sumDebit += Number(entry.debit || 0);
          sumCredit += Number(entry.credit || 0);
        }
      });

      const type = (acc.account_type || '').toLowerCase();
      const naturalDebit = type === 'asset' || type === 'expense';
      const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);

      

      const isInventoryName = (acc.account_name || '').toLowerCase().includes('inventory');
      const isPrimaryInventory = acc.account_code === '1300';
      const shouldShow = Math.abs(balance) > 0.01 && (!isInventoryName || isPrimaryInventory);
      if (shouldShow) {
        trialBalance.push({
          account_id: acc.id,
          account_code: acc.account_code,
          account_name: acc.account_name,
          account_type: acc.account_type,
          balance
        });
      }
    });

    return trialBalance;
  };

  const calculateCOGSFromInvoices = async (companyId: string, start: string, end: string) => {
    try {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_date, sent_at, status')
        .eq('company_id', companyId)
        .in('status', ['sent','paid','approved','posted']);
      const startDt = new Date(start);
      const endDt = new Date(end);
      endDt.setHours(23,59,59,999);
      const inPeriod = (inv: any) => {
        const dStr = inv.sent_at || inv.invoice_date;
        if (!dStr) return false;
        const d = new Date(dStr);
        return d >= startDt && d <= endDt;
      };
      const ids = (invoices || []).filter(inPeriod).map((i: any) => i.id);
      if (!ids.length) return 0;
      const { data: items } = await supabase
        .from('invoice_items')
        .select('invoice_id, description, quantity, unit_price, item_type')
        .in('invoice_id', ids as any)
        .eq('item_type', 'product');
      const onlyProducts = items || [];
      let total = 0;
      const { data: prodByName } = await supabase
        .from('items')
        .select('name, cost_price')
        .eq('company_id', companyId)
        .eq('item_type', 'product');
      const catalog = (prodByName || []).map((p: any) => ({ name: String(p.name || '').toLowerCase().trim(), cost: Number(p.cost_price || 0) }));
      onlyProducts.forEach((it: any) => {
        const desc = String(it.description || '').toLowerCase().trim();
        let cp = 0;
        const exact = catalog.find(c => c.name === desc);
        if (exact) cp = exact.cost;
        else {
          const contains = catalog.find(c => desc.includes(c.name) || c.name.includes(desc));
          if (contains) cp = contains.cost;
        }
        if (!cp || cp <= 0) cp = Number(it.unit_price || 0);
        const qty = Number(it.quantity || 0);
        total += (cp * qty);
      });
      return total;
    } catch {
      return 0;
    }
  };

  const generateProfitLoss = (trialBalance: any[]): any[] => {
    const data: any[] = [];
    
    // Revenue Section - use trial balance balances directly
    data.push({ type: 'header', account: 'REVENUE', amount: 0, accountId: null });
    const revenue = trialBalance.filter(a => 
      a.account_type.toLowerCase() === 'revenue' || 
      a.account_type.toLowerCase() === 'income'
    );
    
    let totalRevenue = 0;
    const pinnedSales = revenue.find(acc => (acc.account_code || '').toString() === '4000');
    const pinnedGain = revenue.find(acc => (acc.account_code || '').toString() === '4800');
    const restRev = revenue.filter(acc => {
      const code = (acc.account_code || '').toString();
      return code !== '4000' && code !== '4900';
    });
    const orderedRev = [pinnedSales, pinnedGain, ...restRev].filter(Boolean) as any[];
    orderedRev.forEach(acc => {
      // Use balance from trial balance directly
      const total = acc.balance || 0;
      if (Math.abs(total) > 0.01) {
        data.push({ 
          type: 'income', 
          account: acc.account_name, 
          amount: total,
          accountId: acc.account_id,
          accountCode: acc.account_code
        });
        totalRevenue += total;
      }
    });
    data.push({ type: 'subtotal', account: 'Total Revenue', amount: totalRevenue, accountId: null });

    // Cost of Sales - use trial balance balances directly
    data.push({ type: 'spacer', account: '', amount: 0, accountId: null });
    data.push({ type: 'header', account: 'COST OF SALES', amount: 0, accountId: null });
    const cogs = trialBalance.filter(a => 
      (String(a.account_code || '')).startsWith('50') || 
      a.account_name.toLowerCase().includes('cost of') || 
      ['9500','9600'].includes(String(a.account_code || ''))
    );
    const totalCOGSFromTB = cogs.reduce((sum, acc) => sum + (acc.balance || 0), 0);
    const cogsValue = totalCOGSFromTB > 0 ? totalCOGSFromTB : fallbackCOGS;
    const pinnedGainCOGS = trialBalance.find(acc => (acc.account_code || '').toString() === '9500');
    const pinnedLossCOGS = trialBalance.find(acc => (acc.account_code || '').toString() === '9600');
    const restCOGS = cogs.filter(acc => {
      const code = (acc.account_code || '').toString();
      return code !== '9500' && code !== '9600';
    });
    
    let totalCOGS = 0;
    // Always show pinned lines
    data.push({ type: 'expense', account: 'Gain on Sale of Assets', amount: -(pinnedGainCOGS?.balance || 0), accountId: pinnedGainCOGS?.account_id || null, accountCode: '9500' });
    data.push({ type: 'expense', account: 'Loss on Sale of Assets', amount: (pinnedLossCOGS?.balance || 0), accountId: pinnedLossCOGS?.account_id || null, accountCode: '9600' });
    totalCOGS += (-(pinnedGainCOGS?.balance || 0)) + (pinnedLossCOGS?.balance || 0);

    restCOGS.forEach(acc => {
      // Use balance from trial balance directly
      const total = acc.balance || 0;
      if (Math.abs(total) > 0.01) {
        data.push({ 
          type: 'expense', 
          account: acc.account_name, 
          amount: total,
          accountId: acc.account_id,
          accountCode: acc.account_code
        });
        totalCOGS += total;
      }
    });
    if (cogs.length === 0) {
      data.push({ type: 'expense', account: 'Cost of Sales', amount: cogsValue, accountId: null, accountCode: '5000' });
      totalCOGS = cogsValue;
    }
    data.push({ type: 'subtotal', account: 'Total Cost of Sales', amount: totalCOGS, accountId: null });
    data.push({ type: 'subtotal', account: 'Gross Profit', amount: totalRevenue - totalCOGS, accountId: null });

    // Operating Expenses - use trial balance balances directly
    data.push({ type: 'spacer', account: '', amount: 0, accountId: null });
    data.push({ type: 'header', account: 'OPERATING EXPENSES', amount: 0, accountId: null });
    const opex = trialBalance.filter(a => 
      (String(a.account_type || '').toLowerCase() === 'expense') && 
      !((String(a.account_code || '')).startsWith('50') || a.account_name.toLowerCase().includes('cost of'))
    );
    const pinnedLoss = opex.find(acc => (acc.account_code || '').toString() === '6980');
    const restOpex = opex.filter(acc => (acc.account_code || '').toString() !== '6900');
    const orderedOpex = [pinnedLoss, ...restOpex].filter(Boolean) as any[];
    
    let totalOpex = 0;
    orderedOpex.forEach(acc => {
      // Use balance from trial balance directly
      const total = acc.balance || 0;
      if (Math.abs(total) > 0.01) {
        data.push({ 
          type: 'expense', 
          account: acc.account_name, 
          amount: total,
          accountId: acc.account_id,
          accountCode: acc.account_code
        });
        totalOpex += total;
      }
    });
    data.push({ type: 'subtotal', account: 'Total Operating Expenses', amount: totalOpex, accountId: null });
    
    const netProfit = totalRevenue - totalCOGS - totalOpex;
    data.push({ type: 'spacer', account: '', amount: 0, accountId: null });
    data.push({ type: 'final', account: 'Net Profit / (Loss)', amount: netProfit, accountId: null });

    return data;
  };

  const generateBalanceSheet = (trialBalance: any[], openingPpeNbv: number = 0): any[] => {
    const data: any[] = [];

    // ASSETS
    data.push({ type: 'header', account: 'ASSETS', amount: 0, accountId: null });
    
    // 1. Non-current Assets (NBV)
    data.push({ type: 'subheader', account: 'Non-current Assets', amount: 0, accountId: null });
    const fixedAssetsAll = trialBalance.filter(a => 
      a.account_type.toLowerCase() === 'asset' && 
      parseInt(a.account_code || '0') >= 1500
    );
    const normalizeName = (name: string) => String(name || '').toLowerCase()
      .replace(/accumulated/g, '')
      .replace(/depreciation/g, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const accDepRows = fixedAssetsAll.filter(a => String(a.account_name || '').toLowerCase().includes('accumulated'));
    const nonCurrentAssets = fixedAssetsAll.filter(a => !String(a.account_name || '').toLowerCase().includes('accumulated'));
    const nbvFor = (assetRow: any) => {
      const base = normalizeName(assetRow.account_name);
      const related = accDepRows.filter(ad => {
        const adBase = normalizeName(ad.account_name);
        return adBase.includes(base) || base.includes(adBase);
      });
      const accTotal = related.reduce((sum, r) => sum + Number(r.balance || 0), 0);
      const nbv = Number(assetRow.balance || 0) - accTotal;
      return nbv < 0 ? 0 : nbv;
    };
    const totalFixedAssets = nonCurrentAssets.reduce((sum, acc) => sum + nbvFor(acc), 0) + openingPpeNbv;
    data.push({ type: 'asset', account: 'Property, Plant & Equipment', amount: totalFixedAssets, accountId: null });
    data.push({ type: 'subtotal', account: 'Total Non-current Assets', amount: totalFixedAssets, accountId: null });

    // 2. Current Assets
    data.push({ type: 'subheader', account: 'Current Assets', amount: 0, accountId: null });
    const currentAssets = trialBalance.filter(a => 
      a.account_type.toLowerCase() === 'asset' && 
      parseInt(a.account_code || '0') < 1500 &&
      !String(a.account_name || '').toLowerCase().includes('vat') &&
      !['1210','2110','2210'].includes(String(a.account_code || ''))
    );
    
    const vatReceivable = trialBalance
      .filter(a => a.account_type.toLowerCase() === 'asset' && (String(a.account_name || '').toLowerCase().includes('vat input') || String(a.account_name || '').toLowerCase().includes('vat receivable')))
      .reduce((sum, a) => sum + Number(a.balance || 0), 0);
    
    let totalCurrentAssets = 0;
    let bankOverdraft = 0;
    const bankPinned = currentAssets.find(acc => (acc.account_code || '').toString() === '1100');
    const arPinned = currentAssets.find(acc => (acc.account_code || '').toString() === '1200');
    const restCA = currentAssets.filter(acc => {
      const code = (acc.account_code || '').toString();
      return code !== '1100' && code !== '1200';
    });
    const orderedCA = [bankPinned, arPinned, ...restCA].filter(Boolean) as any[];
    const isCashBank = (acc: any) => {
      const name = String(acc.account_name || '').toLowerCase();
      const code = String(acc.account_code || '');
      return code === '1100' || name.includes('bank') || name.includes('cash');
    };
    orderedCA.forEach(acc => {
      const total = Number(acc.balance || 0);
      if (isCashBank(acc) && total < 0) {
        bankOverdraft += Math.abs(total);
        return;
      }
      if (Math.abs(total) > 0.01) {
        data.push({ type: 'asset', account: acc.account_name, amount: total, accountId: acc.account_id, accountCode: acc.account_code });
        totalCurrentAssets += total;
      }
    });
    if (vatReceivable >= 0) {
      data.push({ type: 'asset', account: 'VAT Receivable', amount: vatReceivable, accountId: null, accountCode: '1210' });
      totalCurrentAssets += vatReceivable;
    }
    data.push({ type: 'subtotal', account: 'Total Current Assets', amount: totalCurrentAssets, accountId: null });
    
    // Total Assets
    data.push({ type: 'total', account: 'TOTAL ASSETS', amount: totalCurrentAssets + totalFixedAssets, accountId: null, color: 'text-emerald-700' });

    // LIABILITIES
    data.push({ type: 'spacer', account: '', amount: 0, accountId: null });
    data.push({ type: 'header', account: 'LIABILITIES', amount: 0, accountId: null });
    
    const vatPayable = trialBalance
      .filter(a => a.account_type.toLowerCase() === 'liability' && String(a.account_name || '').toLowerCase().includes('vat'))
      .reduce((sum, a) => sum + Number(a.balance || 0), 0);

    const allLiabilities = trialBalance.filter(a => a.account_type.toLowerCase() === 'liability' && !(String(a.account_name || '').toLowerCase().includes('vat') || ['2100','2200'].includes(String(a.account_code || ''))));
    
    // Non-Current Liabilities
    data.push({ type: 'subheader', account: 'Non-current Liabilities', amount: 0, accountId: null });
    const nonCurrentLiabilities = allLiabilities.filter(a => {
        const code = parseInt(a.account_code || '0');
        const name = (a.account_name || '').toLowerCase();
        return code >= 2500 || name.includes('long term') || name.includes('mortgage');
    });
    let totalNonCurrentLiab = 0;
    nonCurrentLiabilities.forEach(acc => {
        const total = acc.balance || 0;
        if (Math.abs(total) > 0.01) {
            data.push({ type: 'liability', account: acc.account_name, amount: total, accountId: acc.account_id, accountCode: acc.account_code });
            totalNonCurrentLiab += total;
        }
    });
    data.push({ type: 'subtotal', account: 'Total Non-current Liabilities', amount: totalNonCurrentLiab, accountId: null });

    // Current Liabilities
    data.push({ type: 'subheader', account: 'Current Liabilities', amount: 0, accountId: null });
    const currentLiabilities = allLiabilities.filter(a => {
        const code = parseInt(a.account_code || '0');
        const name = (a.account_name || '').toLowerCase();
        return !(code >= 2500 || name.includes('long term') || name.includes('mortgage'));
    });
    let totalCurrentLiab = 0;
    currentLiabilities.forEach(acc => {
        const total = acc.balance || 0;
        if (Math.abs(total) > 0.01) {
            data.push({ type: 'liability', account: acc.account_name, amount: total, accountId: acc.account_id, accountCode: acc.account_code });
            totalCurrentLiab += total;
        }
    });
    if (bankOverdraft > 0.01) {
      data.push({ type: 'liability', account: 'Bank Overdraft', amount: bankOverdraft, accountId: null, accountCode: '1100-od' });
      totalCurrentLiab += bankOverdraft;
    }
    data.push({ type: 'liability', account: 'VAT Payable', amount: vatPayable, accountId: null, accountCode: '2200' });
    totalCurrentLiab += vatPayable;
    data.push({ type: 'subtotal', account: 'Total Current Liabilities', amount: totalCurrentLiab, accountId: null });
    
    // Recompute totals after equity adjustment
    // Use single declaration later to avoid redeclaration issues

    // EQUITY
    data.push({ type: 'spacer', account: '', amount: 0, accountId: null });
    data.push({ type: 'header', account: 'EQUITY', amount: 0, accountId: null });
    
    const equity = trialBalance.filter(a => a.account_type.toLowerCase() === 'equity');
    let totalEquity = 0;
    equity.forEach(acc => {
      const total = acc.balance || 0;
      if (Math.abs(total) > 0.01) {
        data.push({ 
          type: 'equity', 
          account: acc.account_name, 
          amount: total,
          accountId: acc.account_id,
          accountCode: acc.account_code
        });
        totalEquity += total;
      }
    });
    // Synthetic retained earnings adjustment to balance the statement
    const totalAssets = totalCurrentAssets + totalFixedAssets;
    const totalLiabilities = totalNonCurrentLiab + totalCurrentLiab;
    const equityAdjustment = totalAssets - (totalLiabilities + totalEquity);
    if (Math.abs(equityAdjustment) > 0.01) {
      data.push({ type: 'equity', account: 'Retained Earnings (adjusted)', amount: equityAdjustment, accountId: null, accountCode: 'RE-adjust' });
      totalEquity += equityAdjustment;
    }
    data.push({ type: 'subtotal', account: 'Total Equity', amount: totalEquity, accountId: null });
    
    // Total Liab & Equity
    data.push({ type: 'final', account: 'TOTAL LIABILITIES & EQUITY', amount: totalLiabilities + totalEquity, accountId: null, color: 'text-purple-700' });

    // Validation
    const totalLiabEquity = totalLiabilities + totalEquity;
    const isBalanced = Math.abs(totalAssets - totalLiabEquity) < 0.1; // Allow small rounding diff
    
    data.push({ type: 'spacer', account: '', amount: 0, accountId: null });
    data.push({ 
      type: 'balance_check', 
      account: isBalanced ? 'Statement is Balanced' : 'Statement is Unbalanced', 
      amount: totalAssets - totalLiabEquity, 
      accountId: null,
      isBalanced 
    });

    return data;
  };

  const generateCashFlow = async (companyId: string): Promise<any[]> => {
    try {
      const { data, error } = await supabase.rpc('generate_cash_flow', {
        _company_id: companyId,
        _period_start: periodStart,
        _period_end: periodEnd
      });
      if (!error && data && data.length > 0) {
        const cf = data[0];
        return [
          { type: 'header', account: 'OPERATING ACTIVITIES', amount: 0, accountId: null },
          { type: 'income', account: 'Net cash from operating activities', amount: cf.operating_activities || 0, accountId: null },
          { type: 'spacer', account: '', amount: 0, accountId: null },
          { type: 'header', account: 'INVESTING ACTIVITIES', amount: 0, accountId: null },
          { type: 'expense', account: 'Net cash from investing activities', amount: cf.investing_activities || 0, accountId: null },
          { type: 'spacer', account: '', amount: 0, accountId: null },
          { type: 'header', account: 'FINANCING ACTIVITIES', amount: 0, accountId: null },
          { type: 'income', account: 'Net cash from financing activities', amount: cf.financing_activities || 0, accountId: null },
          { type: 'spacer', account: '', amount: 0, accountId: null },
          { type: 'subtotal', account: 'Net Increase in Cash', amount: cf.net_cash_flow || 0, accountId: null },
          { type: 'asset', account: 'Opening Cash Balance', amount: cf.opening_cash || 0, accountId: null },
          { type: 'final', account: 'Closing Cash Balance', amount: cf.closing_cash || 0, accountId: null },
        ];
      }
    } catch {}
    try {
      const { data: entries } = await supabase
        .from('transaction_entries')
        .select(`debit, credit, account_id, transactions!inner (transaction_date, status, company_id), chart_of_accounts!inner (account_type, account_name)`)
        .eq('transactions.company_id', companyId)
        .eq('transactions.status', 'posted')
        .gte('transactions.transaction_date', periodStart)
        .lte('transactions.transaction_date', periodEnd) as any;
      const inPeriod = (d: string) => new Date(d) >= new Date(periodStart) && new Date(d) <= new Date(periodEnd);
      let income = 0; let expense = 0; let depreciation = 0; let recvChange = 0; let payChange = 0; let investing = 0; let financing = 0;
      (entries || []).forEach((e: any) => {
        if (String(e.transactions?.company_id || '') !== String(companyId)) return;
        const posted = String(e.transactions?.status || '').toLowerCase() === 'posted';
        if (!posted) return;
        const dateStr = String(e.transactions?.transaction_date || '');
        if (!inPeriod(dateStr)) return;
        const type = String(e.chart_of_accounts?.account_type || '');
        const name = String(e.chart_of_accounts?.account_name || '').toLowerCase();
        const debit = Number(e.debit || 0); const credit = Number(e.credit || 0);
        if (type.toLowerCase() === 'income') income += (credit - debit);
        else if (type.toLowerCase() === 'expense') { expense += (debit - credit); if (name.includes('depreciation')) depreciation += debit; }
        if (name.includes('receivable')) recvChange += (debit - credit);
        if (name.includes('payable')) payChange += (credit - debit);
        if (type.toLowerCase() === 'asset' && (name.includes('fixed asset') || name.includes('fixed deposit') || name.includes('investment'))) investing += (debit - credit);
        if (name.includes('loan') || name.includes('capital')) financing += (credit - debit);
      });
      const operating = income - expense + depreciation - recvChange + payChange;
      const { data: pre } = await supabase
        .from('transaction_entries')
        .select(`debit, credit, transactions!inner (transaction_date, status, company_id), chart_of_accounts!inner (account_type, account_name)`)
        .eq('transactions.company_id', companyId)
        .eq('transactions.status', 'posted')
        .lt('transactions.transaction_date', periodStart) as any;
      let openingCash = 0;
      (pre || []).forEach((e: any) => {
        if (String(e.transactions?.company_id || '') !== String(companyId)) return;
        const posted = String(e.transactions?.status || '').toLowerCase() === 'posted';
        if (!posted) return;
        const d = new Date(String(e.transactions?.transaction_date || ''));
        if (!(d < new Date(periodStart))) return;
        const type = String(e.chart_of_accounts?.account_type || '').toLowerCase();
        const name = String(e.chart_of_accounts?.account_name || '').toLowerCase();
        if (type === 'asset' && (name.includes('cash') || name.includes('bank'))) openingCash += Number(e.debit || 0) - Number(e.credit || 0);
      });
      const closingCash = openingCash + operating + (-1 * investing) + financing;
      return [
        { type: 'header', account: 'OPERATING ACTIVITIES', amount: 0, accountId: null },
        { type: 'income', account: 'Net cash from operating activities', amount: operating, accountId: null },
        { type: 'spacer', account: '', amount: 0, accountId: null },
        { type: 'header', account: 'INVESTING ACTIVITIES', amount: 0, accountId: null },
        { type: 'expense', account: 'Net cash from investing activities', amount: (-1 * investing), accountId: null },
        { type: 'spacer', account: '', amount: 0, accountId: null },
        { type: 'header', account: 'FINANCING ACTIVITIES', amount: 0, accountId: null },
        { type: 'income', account: 'Net cash from financing activities', amount: financing, accountId: null },
        { type: 'spacer', account: '', amount: 0, accountId: null },
        { type: 'subtotal', account: 'Net Increase in Cash', amount: operating + (-1 * investing) + financing, accountId: null },
        { type: 'asset', account: 'Opening Cash Balance', amount: openingCash, accountId: null },
        { type: 'final', account: 'Closing Cash Balance', amount: closingCash, accountId: null },
      ];
    } catch {
      return [];
    }
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    const data = activeReport === 'pl' ? reportData.profitLoss : 
                 activeReport === 'bs' ? reportData.balanceSheet : 
                 reportData.cashFlow;
    
    const reportName = activeReport === 'pl' ? 'Income Statement' : 
                       activeReport === 'bs' ? 'Statement of Financial Position' : 
                       'Cash Flow Statement';
    const isFiscal = (fiscalStartMonth || 1) !== 1;
    
    const fyLabel = isFiscal && typeof selectedFiscalYear === 'number' ? `FY_${selectedFiscalYear}` : '';
    const filename = `${reportName.toLowerCase().replace(/ /g, '_')}_${fyLabel ? fyLabel + '_' : ''}${periodStart}_to_${periodEnd}`;

    if (format === 'pdf') {
      exportFinancialReportToPDF(
        data.map(d => ({ account: d.account, amount: d.amount, type: d.type })), 
        fyLabel ? `${reportName} (${fyLabel})` : reportName, 
        `${periodStart} to ${periodEnd}`, 
        filename
      );
    } else {
      exportFinancialReportToExcel(
        data.map(d => ({ account: d.account, amount: d.amount, type: d.type })), 
        fyLabel ? `${reportName} (${fyLabel})` : reportName, 
        filename
      );
    }
    
    toast({ title: "Success", description: `Report exported to ${format.toUpperCase()}` });
  };

  const handleRowClick = (item: any) => {
    if (item.accountId) {
      setDrilldownAccount({
        id: item.accountId,
        name: item.account,
        code: item.accountCode
      });
    }
  };

  const getCurrentData = () => {
    return activeReport === 'pl' ? reportData.profitLoss : 
           activeReport === 'bs' ? reportData.balanceSheet : 
           reportData.cashFlow;
  };

  return (
    <div className="space-y-6 relative min-h-[600px]">
      {loading && (
        <SageLoadingOverlay 
          message="Updating Financial Report..." 
          progress={undefined} 
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Annual Financial Statements</h1>
          <p className="text-muted-foreground mt-1">GAAP-compliant financial statements with drill-down capability</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border">
            <Label className="text-xs">Auto Refresh</Label>
            <Switch checked={isAutoRefreshEnabled} onCheckedChange={setIsAutoRefreshEnabled} />
          </div>
          <Button variant="outline" onClick={() => refreshCurrentReport(false)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Period Selection
          </CardTitle>
      <div className="mt-3 flex flex_wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={lockFiscalYear}
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                setPeriodStart(start.toISOString().split('T')[0]);
                setPeriodEnd(end.toISOString().split('T')[0]);
              }}
            >
              This Month
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={lockFiscalYear}
              onClick={() => {
                const now = new Date();
                const q = Math.floor(now.getMonth() / 3); // 0-based quarter
                const qStartMonth = q * 3;
                const start = new Date(now.getFullYear(), qStartMonth, 1);
                const end = new Date(now.getFullYear(), qStartMonth + 3, 0);
                setPeriodStart(start.toISOString().split('T')[0]);
                setPeriodEnd(end.toISOString().split('T')[0]);
              }}
            >
              This Quarter
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={false}
              onClick={() => {
                const fy = typeof selectedFiscalYear === 'number' ? selectedFiscalYear : new Date().getFullYear();
                const { startStr, endStr } = getFiscalYearDates(fy);
                setPeriodStart(startStr);
                setPeriodEnd(endStr);
              }}
            >
              Fiscal Year
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={lockFiscalYear}
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), 0, 1);
                const end = new Date(now.getFullYear(), 11, 31);
                setPeriodStart(start.toISOString().split('T')[0]);
                setPeriodEnd(end.toISOString().split('T')[0]);
              }}
            >
              This Year
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Period Start</Label>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label>Period End</Label>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeReport} onValueChange={(v) => setActiveReport(v as any)}>
        <TabsList className="grid w-full grid-cols-4 max-w-3xl">
          <TabsTrigger value="pl">
            <TrendingUp className="h-4 w-4 mr-2" />
            Income Statement
          </TabsTrigger>
          <TabsTrigger value="bs">
            <BarChart3 className="h-4 w-4 mr-2" />
            Balance Sheet
          </TabsTrigger>
          <TabsTrigger value="tb">
            <FileText className="h-4 w-4 mr-2" />
            Trial Balance
          </TabsTrigger>
          <TabsTrigger value="cf">
            <Activity className="h-4 w-4 mr-2" />
            Cash Flow
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeReport}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  {activeReport === 'pl' ? 'Income Statement' : 
                   activeReport === 'bs' ? 'Statement of Financial Position' : 
                   activeReport === 'tb' ? 'Trial Balance' :
                   'Cash Flow Statement'}
                </CardTitle>
                <div className="flex gap-2">
                  {activeReport !== 'tb' && (
                  <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  )}
                  {activeReport !== 'tb' && (
                  <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
                    <Download className="h-4 w-4 mr-2" />
                    Excel
                  </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeReport === 'tb' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.trialBalance.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No financial data for the selected period</TableCell></TableRow>
                    ) : (
                      reportData.trialBalance.map((acc: any, index: number) => {
                        const type = (acc.account_type || '').toLowerCase();
                        const naturalDebit = type === 'asset' || type === 'expense';
                        const debit = naturalDebit ? (acc.balance || 0) : 0;
                        const credit = !naturalDebit ? (acc.balance || 0) : 0;
                        return (
                          <TableRow key={`${acc.account_id}-${index}`} onClick={() => setDrilldownAccount({ id: acc.account_id, name: acc.account_name, code: acc.account_code })} className="cursor-pointer">
                            <TableCell>{acc.account_code}</TableCell>
                            <TableCell>{acc.account_name}</TableCell>
                            <TableCell className="text-right font-mono">{debit ? `R ${debit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : ''}</TableCell>
                            <TableCell className="text-right font-mono">{credit ? `R ${credit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : ''}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              ) : getCurrentData().length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No financial data for the selected period
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount (ZAR)</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getCurrentData().map((item, index) => {
                      if (item.type === 'spacer') {
                        return <TableRow key={index}><TableCell colSpan={3} className="h-4"></TableCell></TableRow>;
                      }
                      if (item.type === 'header') {
                        return (
                          <TableRow key={index} className="bg-muted/50">
                            <TableCell colSpan={3} className="font-bold text-lg">{item.account}</TableCell>
                          </TableRow>
                        );
                      }
                      if (item.type === 'subheader') {
                        return (
                          <TableRow key={index}>
                            <TableCell colSpan={3} className="font-semibold text-sm pl-4">{item.account}</TableCell>
                          </TableRow>
                        );
                      }
                      if (item.type === 'balance_check') {
                        return (
                          <TableRow key={index} className={item.isBalanced ? "bg-emerald-50/50" : "bg-red-50/50"}>
                            <TableCell colSpan={3} className="py-4">
                                <div className="flex items-center justify-center gap-2 font-bold">
                                    {item.isBalanced ? (
                                        <div className="flex items-center gap-2 text-emerald-700">
                                            <div className="h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200">
                                                <CheckCircle2 className="h-4 w-4" />
                                            </div>
                                            <span>Statement is Balanced</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-red-700">
                                             <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center border border-red-200">
                                                <AlertTriangle className="h-4 w-4" />
                                            </div>
                                            <span>Statement is Unbalanced (Diff: R {item.amount.toFixed(2)})</span>
                                        </div>
                                    )}
                                </div>
                            </TableCell>
                          </TableRow>
                        );
                      }
                      return (
                        <TableRow 
                          key={index}
                          className={`${
                            item.type === 'subtotal' || item.type === 'total' || item.type === 'final' 
                              ? 'bg-muted/30 font-medium' 
                              : item.accountId ? 'cursor-pointer hover:bg-muted/20' : ''
                          }`}
                          onClick={() => handleRowClick(item)}
                        >
                          <TableCell 
                            className={`${
                              item.type === 'total' || item.type === 'final' ? 'font-bold' : ''
                            } ${
                              ['expense', 'asset', 'liability', 'equity'].includes(item.type) ? 'pl-8' : ''
                            } ${
                              item.color ? item.color : ''
                            }`}
                          >
                            {item.account}
                          </TableCell>
                          <TableCell 
                            className={`text-right font-mono ${
                              item.color ? item.color + ' font-bold' :
                              item.type === 'income' || item.type === 'subtotal' || item.type === 'total' 
                                ? 'text-primary font-bold' 
                                : item.type === 'final'
                                ? item.amount >= 0 ? 'text-primary font-bold' : 'text-destructive font-bold'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {item.type === 'expense' ? '(' : ''}
                            R {Math.abs(item.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                            {item.type === 'expense' ? ')' : ''}
                          </TableCell>
                          <TableCell>
                            {item.accountId && <Eye className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                Period: {new Date(periodStart).toLocaleDateString('en-ZA')} to {new Date(periodEnd).toLocaleDateString('en-ZA')}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {drilldownAccount && (
        <AccountDrilldown
          open={!!drilldownAccount}
          onOpenChange={(open) => !open && setDrilldownAccount(null)}
          accountId={drilldownAccount.id}
          accountName={drilldownAccount.name}
          accountCode={drilldownAccount.code}
        />
      )}
    </div>
  );
};
