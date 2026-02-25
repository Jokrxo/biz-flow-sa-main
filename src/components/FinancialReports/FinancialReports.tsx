import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  FileText, 
  Download,
  Calendar,
  TrendingUp,
  BarChart3,
  PieChart,
  Activity,
  Loader2,
  Printer,
  Mail
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { exportFinancialReportToExcel, exportFinancialReportToPDF } from "@/lib/export-utils";
import type { FinancialReportLine } from "@/lib/export-utils";
import { useFiscalYear } from "@/hooks/use-fiscal-year";

export const FinancialReports = () => {
  const [loading, setLoading] = useState(true);
  const [profitLossData, setProfitLossData] = useState<FinancialReportLine[]>([]);
  const [balanceSheetData, setBalanceSheetData] = useState<FinancialReportLine[]>([]);
  const [cashFlowData, setCashFlowData] = useState<FinancialReportLine[]>([]);
  const [activeReport, setActiveReport] = useState<'pl' | 'bs' | 'cf'>('pl');
  const [companyName, setCompanyName] = useState<string>('');
  const { toast } = useToast();
  const { selectedFiscalYear, getFiscalYearDates } = useFiscalYear();

  async function generateCashFlow(companyId: string) {
    try {
      const fy = typeof selectedFiscalYear === 'number' ? selectedFiscalYear : new Date().getFullYear();
      const { startStr: periodStart, endStr: periodEnd } = getFiscalYearDates(fy);

      const { data, error } = await supabase
        .rpc('generate_cash_flow', {
          _company_id: companyId,
          _period_start: periodStart,
          _period_end: periodEnd
        });

      if (error) throw error;

      if (data && data.length > 0) {
        const cf = data[0];
        const startDateObj = new Date(periodStart);
        const endDateObj = new Date(periodEnd);
        endDateObj.setHours(23, 59, 59, 999);
        const prevFy = fy - 1;
        const { startStr: prevStart, endStr: prevEnd } = getFiscalYearDates(prevFy);
        const buildTrialBalance = async (start: string, end: string) => {
          const { data: accounts } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code, account_name, account_type')
            .eq('company_id', companyId)
            .eq('is_active', true)
            .order('account_code');
          const { data: txEntries } = await supabase
            .from('transaction_entries')
            .select(`transaction_id, account_id, debit, credit, description, transactions!inner ( transaction_date )`)
            .eq('transactions.company_id', companyId)
            .gte('transactions.transaction_date', start)
            .lte('transactions.transaction_date', end)
            .not('description', 'ilike', '%Opening balance (carry forward)%');
          const { data: ledgerEntries } = await supabase
            .from('ledger_entries')
            .select('transaction_id, account_id, debit, credit, entry_date, description')
            .eq('company_id', companyId)
            .gte('entry_date', start)
            .lte('entry_date', end)
            .not('description', 'ilike', '%Opening balance (carry forward)%');
          const trial: Array<{ id: string; code: string; name: string; type: string; balance: number }> = [];
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
            const type = String(acc.account_type || '').toLowerCase();
            const naturalDebit = type === 'asset' || type === 'expense';
            const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);
            trial.push({ id: acc.id, code: acc.account_code, name: acc.account_name, type: acc.account_type, balance });
          });
          return trial;
        };
        const tbCurr = await buildTrialBalance(periodStart, periodEnd);
        const tbPrev = await buildTrialBalance(prevStart, prevEnd);
        const sum = (arr: any[]) => arr.reduce((s, x) => s + Number(x.balance || 0), 0);
        const lowerCurr = tbCurr.map(a => ({ account_id: a.id, account_code: String(a.code || ''), account_name: String(a.name || '').toLowerCase(), account_type: String(a.type || '').toLowerCase(), balance: Number(a.balance || 0) }));
        const lowerPrev = tbPrev.map(a => ({ account_id: a.id, account_code: String(a.code || ''), account_name: String(a.name || '').toLowerCase(), account_type: String(a.type || '').toLowerCase(), balance: Number(a.balance || 0) }));
        const revenueBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'revenue' || a.account_type === 'income'));
        const cogsBal = (arr: any[]) => sum(arr.filter(a => (String(a.account_code || '')).startsWith('50') || a.account_name.includes('cost of')));
        const opexBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'expense' && !((String(a.account_code || '')).startsWith('50') || a.account_name.includes('cost of'))).filter(a => !a.account_name.includes('vat')));
        const depAmortBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'expense' && (a.account_name.includes('depreciation') || a.account_name.includes('amortisation') || a.account_name.includes('amortization'))));
        const impairmentBal = (arr: any[]) => sum(arr.filter(a => a.account_name.includes('impairment')));
        const profitDisposalBal = (arr: any[]) => sum(arr.filter(a => (a.account_code === '9500') || (a.account_name.includes('gain on sale') || a.account_name.includes('disposal gain'))));
        const lossDisposalBal = (arr: any[]) => sum(arr.filter(a => (a.account_code === '9600') || (a.account_name.includes('loss on sale') || a.account_name.includes('disposal loss'))));
        const financeCostsBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'expense' && (a.account_name.includes('finance cost') || a.account_name.includes('interest expense'))));
        const interestIncomeBal = (arr: any[]) => sum(arr.filter(a => (a.account_type === 'revenue' || a.account_type === 'income') && a.account_name.includes('interest')));
        const fxUnrealisedBal = (arr: any[]) => sum(arr.filter(a => a.account_name.includes('unrealised') && (a.account_name.includes('foreign exchange') || a.account_name.includes('fx') || a.account_name.includes('currency'))));
        const provisionsMoveBal = (arr: any[]) => sum(arr.filter(a => (a.account_type === 'liability' || a.account_type === 'expense') && a.account_name.includes('provision')));
        const fairValueAdjBal = (arr: any[]) => sum(arr.filter(a => a.account_name.includes('fair value')));
        const otherNonCashBal = (arr: any[]) => sum(arr.filter(a => a.account_name.includes('non-cash') || a.account_name.includes('non cash')));
        const receivablesBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'asset' && (a.account_name.includes('receivable') || a.account_name.includes('debtors') || a.account_name.includes('accounts receivable'))).filter(a => !a.account_name.includes('vat')));
        const inventoriesBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'asset' && (a.account_name.includes('inventory') || a.account_name.includes('stock'))));
        const payablesBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'liability' && (a.account_name.includes('payable') || a.account_name.includes('creditors') || a.account_name.includes('accounts payable'))).filter(a => !a.account_name.includes('vat')).filter(a => !a.account_name.includes('loan')));
        const profitBeforeTaxCurr = revenueBal(lowerCurr) - (cogsBal(lowerCurr)) - opexBal(lowerCurr);
        const adjustmentsCurr = depAmortBal(lowerCurr) + impairmentBal(lowerCurr) - profitDisposalBal(lowerCurr) + lossDisposalBal(lowerCurr) + financeCostsBal(lowerCurr) - interestIncomeBal(lowerCurr) + fxUnrealisedBal(lowerCurr) + provisionsMoveBal(lowerCurr) + fairValueAdjBal(lowerCurr) + otherNonCashBal(lowerCurr);
        const receivablesChangeCurr = receivablesBal(lowerCurr) - receivablesBal(lowerPrev);
        const inventoriesChangeCurr = inventoriesBal(lowerCurr) - inventoriesBal(lowerPrev);
        const payablesChangeCurr = payablesBal(lowerCurr) - payablesBal(lowerPrev);
        const workingCapitalCurr = -receivablesChangeCurr + -inventoriesChangeCurr + payablesChangeCurr;
        const { data: purchRows } = await supabase
          .from('transactions')
          .select('total_amount, status')
          .eq('company_id', companyId)
          .eq('transaction_type', 'asset_purchase')
          .gte('transaction_date', periodStart)
          .lte('transaction_date', periodEnd)
          .in('status', ['approved','posted','pending']);
        const { data: procRows } = await supabase
          .from('transactions')
          .select('total_amount, status')
          .eq('company_id', companyId)
          .eq('transaction_type', 'asset_disposal')
          .gte('transaction_date', periodStart)
          .lte('transaction_date', periodEnd)
          .in('status', ['approved','posted','pending']);
        const { data: accounts } = await supabase
          .from('chart_of_accounts')
          .select('id, account_name, account_type')
          .eq('company_id', companyId);
        const accMap = new Map<string, { name: string; type: string }>((accounts || []).map((a: any) => [String(a.id), { name: String(a.account_name || ''), type: String(a.account_type || '') }]));
        const { data: assetPurchaseEntries } = await supabase
          .from('transaction_entries')
          .select(`transaction_id, account_id, debit, credit, transactions!inner ( transaction_date, transaction_type, company_id )`)
          .eq('transactions.company_id', companyId)
          .eq('transactions.transaction_type', 'asset_purchase')
          .gte('transactions.transaction_date', periodStart)
          .lte('transactions.transaction_date', periodEnd);
        const byTx = new Map<string, any[]>();
        (assetPurchaseEntries || []).forEach((e: any) => {
          const tid = String(e.transaction_id || '');
          if (!byTx.has(tid)) byTx.set(tid, []);
          byTx.get(tid)!.push(e);
        });
        let loanFinancedAcq = 0;
        byTx.forEach((rows) => {
          const hasLoanCredit = rows.some((r: any) => {
            const acc = accMap.get(String(r.account_id || ''));
            const t = String(acc?.type || '').toLowerCase();
            const n = String(acc?.name || '').toLowerCase();
            return Number(r.credit || 0) > 0 && t === 'liability' && (n.includes('loan') || n.includes('borrow'));
          });
          if (hasLoanCredit) {
            const assetDebit = rows.filter((r: any) => {
              const acc = accMap.get(String(r.account_id || ''));
              const t = String(acc?.type || '').toLowerCase();
              const n = String(acc?.name || '').toLowerCase();
              const isPpe = t === 'asset' && (n.includes('property') || n.includes('plant') || n.includes('equipment') || n.includes('machinery') || n.includes('vehicle'));
              const isInt = t === 'asset' && (n.includes('intangible') || n.includes('software') || n.includes('patent') || n.includes('goodwill'));
              return Number(r.debit || 0) > 0 && (isPpe || isInt);
            }).reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
            loanFinancedAcq += assetDebit;
          }
        });
        const sumAmt = (arr: any[] | null | undefined) => (arr || []).reduce((s: number, t: any) => s + Math.max(0, Number(t.total_amount || 0)), 0);
        const ppePurchases = sumAmt(purchRows);
        const ppeProceeds = sumAmt(procRows);
        const operatingAdjusted = (profitBeforeTaxCurr + adjustmentsCurr + workingCapitalCurr) - loanFinancedAcq;
        const financingAdjusted = (cf.financing_activities || 0) + loanFinancedAcq;
        const netChangeDisplay = operatingAdjusted + (cf.investing_activities || 0) + financingAdjusted;
        const cfData: FinancialReportLine[] = [
          { account: 'CASH FLOWS FROM OPERATING ACTIVITIES', amount: 0, type: 'header' },
          { account: 'Profit before tax', amount: profitBeforeTaxCurr, type: 'income' },
          { account: 'Depreciation and amortisation', amount: depAmortBal(lowerCurr), type: 'expense' },
          { account: 'Impairment losses / reversals', amount: impairmentBal(lowerCurr), type: 'expense' },
          { account: 'Profit on disposal of assets', amount: -Math.abs(profitDisposalBal(lowerCurr)), type: 'income' },
          { account: 'Loss on disposal of assets', amount: Math.abs(lossDisposalBal(lowerCurr)), type: 'expense' },
          { account: 'Finance costs', amount: financeCostsBal(lowerCurr), type: 'expense' },
          { account: 'Interest income', amount: -Math.abs(interestIncomeBal(lowerCurr)), type: 'income' },
          { account: 'Unrealised foreign exchange differences', amount: fxUnrealisedBal(lowerCurr), type: 'expense' },
          { account: 'Movements in provisions', amount: provisionsMoveBal(lowerCurr), type: 'expense' },
          { account: 'Fair value adjustments', amount: fairValueAdjBal(lowerCurr), type: 'expense' },
          { account: 'Other non-cash items', amount: otherNonCashBal(lowerCurr), type: 'expense' },
          { account: 'Changes in working capital:', amount: workingCapitalCurr, type: 'header' },
          { account: '(Increase)/Decrease in trade receivables', amount: -receivablesChangeCurr, type: 'expense' },
          { account: '(Increase)/Decrease in inventories', amount: -inventoriesChangeCurr, type: 'expense' },
          { account: 'Increase/(Decrease) in trade payables', amount: payablesChangeCurr, type: 'income' },
          { account: 'Total changes in working capital', amount: workingCapitalCurr, type: 'subtotal' },
          { account: 'Cash generated from operations', amount: profitBeforeTaxCurr + adjustmentsCurr + workingCapitalCurr, type: 'subtotal' },
          { account: 'Net cash from operating activities', amount: operatingAdjusted, type: 'subtotal' },
          { account: '', amount: 0, type: 'spacer' },
          { account: 'CASH FLOWS FROM INVESTING ACTIVITIES', amount: 0, type: 'header' },
          { account: 'Purchase of property, plant and equipment', amount: -(Math.abs(ppePurchases) + Math.abs(loanFinancedAcq)), type: 'expense' },
          { account: 'Proceeds from disposal of property, plant and equipment', amount: ppeProceeds, type: 'income' },
          { account: 'Net cash from investing activities', amount: cf.investing_activities || 0, type: 'subtotal' },
          { account: '', amount: 0, type: 'spacer' },
          { account: 'CASH FLOWS FROM FINANCING ACTIVITIES', amount: 0, type: 'header' },
          { account: 'Proceeds from borrowings', amount: loanFinancedAcq, type: 'income' },
          { account: 'Net cash from financing activities', amount: financingAdjusted, type: 'subtotal' },
          { account: '', amount: 0, type: 'spacer' },
          { account: 'Net change in cash and cash equivalents', amount: netChangeDisplay, type: 'subtotal' },
          { account: '', amount: 0, type: 'spacer' },
          { account: 'Cash and cash equivalents at beginning of period', amount: cf.opening_cash || 0, type: 'asset' },
          { account: 'Net change in cash and cash equivalents', amount: netChangeDisplay, type: 'asset' },
          { account: 'Cash and cash equivalents at end of period', amount: cf.closing_cash || 0, type: 'final' },
        ];
        setCashFlowData(cfData);
      }
    } catch (error) {
      console.error('Error generating cash flow:', error);
      toast({ title: 'Error', description: 'Failed to generate cash flow statement', variant: 'destructive' });
    }
  }

  const loadFinancialData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();
      if (!profile?.company_id) return;

      const { data: company, error } = await supabase
        .from('companies')
        .select('company_name')
        .eq('id', profile.company_id)
        .single();
      if (!error && company) setCompanyName((company as any).company_name);

      const fy = typeof selectedFiscalYear === 'number' ? selectedFiscalYear : new Date().getFullYear();
      const { startStr: periodStart, endStr: periodEnd } = getFiscalYearDates(fy);
      const trialBalancePeriod = await fetchTrialBalanceForPeriod(profile.company_id, periodStart, periodEnd);
      const trialBalanceAsOfEnd = await fetchTrialBalanceCumulativeToEnd(profile.company_id, periodEnd);
      generateProfitLoss(trialBalancePeriod);
      generateBalanceSheet(trialBalanceAsOfEnd);
      await generateCashFlow(profile.company_id);
    } catch (error) {
      console.error('Error loading financial data:', error);
      toast({ title: "Error", description: "Failed to load financial reports", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast, selectedFiscalYear, getFiscalYearDates]);
  useEffect(() => { loadFinancialData(); }, [loadFinancialData]);


  const generateProfitLoss = (trialBalance: any[]) => {
    // Group by account type - use trial balance balances directly
    const income = trialBalance.filter(a => a.account_type.toLowerCase() === 'revenue' || a.account_type.toLowerCase() === 'income');
    const expenses = trialBalance.filter(a => a.account_type.toLowerCase() === 'expense');

    const plData: FinancialReportLine[] = [];

    // Calculate total income - use balance from trial balance directly
    let totalIncome = 0;
    income.forEach(account => {
      // For revenue accounts, balance is already calculated correctly
      const accountTotal = account.balance || 0;
      if (Math.abs(accountTotal) > 0.01) {
        plData.push({
          account: account.account_name,
          amount: accountTotal,
          type: 'income'
        });
        totalIncome += accountTotal;
      }
    });

    plData.push({
      account: 'Total Income',
      amount: totalIncome,
      type: 'subtotal'
    });

    // Calculate total expenses - use balance from trial balance directly
    let totalExpenses = 0;
    expenses.forEach(account => {
      // For expense accounts, balance is already calculated correctly
      const accountTotal = account.balance || 0;
      if (Math.abs(accountTotal) > 0.01) {
        plData.push({
          account: account.account_name,
          amount: accountTotal,
          type: 'expense'
        });
        totalExpenses += accountTotal;
      }
    });

    plData.push({
      account: 'Total Expenses',
      amount: totalExpenses,
      type: 'subtotal'
    });

    // Net Profit
    plData.push({
      account: 'Net Profit / (Loss)',
      amount: totalIncome - totalExpenses,
      type: 'final'
    });

    setProfitLossData(plData);
  };

  const generateBalanceSheet = (trialBalance: any[]) => {
    // Helper to categorize
    const isNonCurrentAsset = (a: any) => {
      const type = String(a.account_type || '').toLowerCase();
      const code = String(a.account_code || '');
      return type === 'fixed asset' || code.startsWith('2');
    };
    const isNonCurrentLiability = (a: any) => {
      const type = String(a.account_type || '').toLowerCase();
      const code = String(a.account_code || '');
      return type === 'long term liability' || code.startsWith('4');
    };

    // Filter main categories
    const allAssets = trialBalance.filter(a => a.account_type.toLowerCase() === 'asset');
    
    const normalizeName = (name: string) => name.toLowerCase()
      .replace(/accumulated/g, '')
      .replace(/depreciation/g, '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const accumulatedRows = allAssets.filter(a => (a.account_name || '').toLowerCase().includes('accumulated'));
    
    const nbvFor = (assetRow: any) => {
      const base = normalizeName(assetRow.account_name || '');
      const related = accumulatedRows.filter((ad: any) => {
        const adBase = normalizeName(ad.account_name || '');
        return adBase.includes(base) || base.includes(adBase);
      });
      const accTotal = related.reduce((sum: number, r: any) => sum + (r.balance || 0), 0);
      return (assetRow.balance || 0) - accTotal;
    };

    // Process Assets
    const processedAssets = allAssets
      .filter(a => !(a.account_name || '').toLowerCase().includes('accumulated')) // Filter out accumulated rows as they are merged
      .filter(a => {
        const name = String(a.account_name || '').toLowerCase();
        const code = String(a.account_code || '');
        const isInventory = name.includes('inventory');
        const isPrimaryInventory = code === '1300';
        return !isInventory || isPrimaryInventory;
      })
      .map(a => ({
        ...a,
        displayAmount: nbvFor(a)
      }))
      .filter(a => Math.abs(a.displayAmount) > 0.01);

    const nonCurrentAssets = processedAssets.filter(isNonCurrentAsset);
    const currentAssets = processedAssets.filter(a => !isNonCurrentAsset(a));

    const liabilities = trialBalance.filter(a => a.account_type.toLowerCase() === 'liability');
    const nonCurrentLiabilities = liabilities.filter(isNonCurrentLiability);
    const currentLiabilities = liabilities.filter(a => !isNonCurrentLiability(a));

    const equity = trialBalance.filter(a => a.account_type.toLowerCase() === 'equity');

    const bsData: FinancialReportLine[] = [];

    // --- ASSETS ---
    bsData.push({ account: 'Assets', amount: 0, type: 'main-header' });

    // Non-Current Assets
    bsData.push({ account: 'Non-Current Assets', amount: 0, type: 'sub-header' });
    let totalNonCurrentAssets = 0;
    nonCurrentAssets.forEach(a => {
      bsData.push({ account: a.account_name, amount: a.displayAmount, type: 'asset' });
      totalNonCurrentAssets += a.displayAmount;
    });
    bsData.push({ account: 'Total Non-Current Assets', amount: totalNonCurrentAssets, type: 'sub-total' });

    // Current Assets
    bsData.push({ account: 'Current Assets', amount: 0, type: 'sub-header' });
    let totalCurrentAssets = 0;
    currentAssets.forEach(a => {
      bsData.push({ account: a.account_name, amount: a.displayAmount, type: 'asset' });
      totalCurrentAssets += a.displayAmount;
    });
    bsData.push({ account: 'Total Current Assets', amount: totalCurrentAssets, type: 'sub-total' });

    // Total Assets
    const totalAssets = totalNonCurrentAssets + totalCurrentAssets;
    bsData.push({ account: 'Total Assets', amount: totalAssets, type: 'main-total' });

    bsData.push({ account: '', amount: 0, type: 'spacer' });

    // --- EQUITY AND LIABILITIES ---
    bsData.push({ account: 'Equity and Liabilities', amount: 0, type: 'main-header' });

    // Owners Equity
    bsData.push({ account: 'Owners Equity', amount: 0, type: 'sub-header' });
    let totalEquity = 0;
    equity.forEach(a => {
      if (Math.abs(a.balance) > 0.01) {
        bsData.push({ account: a.account_name, amount: a.balance, type: 'equity' });
        totalEquity += a.balance;
      }
    });
    bsData.push({ account: 'Total Owners Equity', amount: totalEquity, type: 'sub-total' });

    // Non-Current Liabilities
    bsData.push({ account: 'Non-Current Liabilities', amount: 0, type: 'sub-header' });
    let totalNonCurrentLiabilities = 0;
    nonCurrentLiabilities.forEach(a => {
      if (Math.abs(a.balance) > 0.01) {
        bsData.push({ account: a.account_name, amount: a.balance, type: 'liability' });
        totalNonCurrentLiabilities += a.balance;
      }
    });
    bsData.push({ account: 'Total Non-Current Liabilities', amount: totalNonCurrentLiabilities, type: 'sub-total' });

    // Current Liabilities
    bsData.push({ account: 'Current Liabilities', amount: 0, type: 'sub-header' });
    let totalCurrentLiabilities = 0;
    currentLiabilities.forEach(a => {
      if (Math.abs(a.balance) > 0.01) {
        bsData.push({ account: a.account_name, amount: a.balance, type: 'liability' });
        totalCurrentLiabilities += a.balance;
      }
    });
    bsData.push({ account: 'Total Current Liabilities', amount: totalCurrentLiabilities, type: 'sub-total' });

    // Total Equity and Liabilities
    const totalEquityAndLiabilities = totalEquity + totalNonCurrentLiabilities + totalCurrentLiabilities;
    bsData.push({ account: 'Total Equity and Liabilities', amount: totalEquityAndLiabilities, type: 'main-total' });

    setBalanceSheetData(bsData);
  };

  // moved above

  const handleExportPDF = () => {
    const data = activeReport === 'pl' ? profitLossData : activeReport === 'bs' ? balanceSheetData : cashFlowData;
    const reportName = activeReport === 'pl' ? 'Profit & Loss Statement' : activeReport === 'bs' ? 'Balance Sheet' : 'Cash Flow Statement';
    const filename = activeReport === 'pl' ? 'profit_loss' : activeReport === 'bs' ? 'balance_sheet' : 'cash_flow';
    
    exportFinancialReportToPDF(data, reportName, new Date().toLocaleDateString('en-ZA'), filename);
    toast({
      title: "Success",
      description: "Report exported to PDF successfully"
    });
  };

  const handleExportExcel = () => {
    const data = activeReport === 'pl' ? profitLossData : activeReport === 'bs' ? balanceSheetData : cashFlowData;
    const reportName = activeReport === 'pl' ? 'Profit & Loss' : activeReport === 'bs' ? 'Balance Sheet' : 'Cash Flow';
    const filename = activeReport === 'pl' ? 'profit_loss' : activeReport === 'bs' ? 'balance_sheet' : 'cash_flow';
    
    exportFinancialReportToExcel(data, reportName, filename);
    toast({
      title: "Success",
      description: "Report exported to Excel successfully"
    });
  };

  const getCurrentData = () => {
    return activeReport === 'pl' ? profitLossData : activeReport === 'bs' ? balanceSheetData : cashFlowData;
  };

  const getStats = () => {
    if (profitLossData.length === 0) {
      return { income: 0, expenses: 0, profit: 0, margin: 0 };
    }

    const totalIncome = profitLossData.find(d => d.type === 'subtotal' && d.account === 'Total Income')?.amount || 0;
    const totalExpenses = profitLossData.find(d => d.type === 'subtotal' && d.account === 'Total Expenses')?.amount || 0;
    const netProfit = profitLossData.find(d => d.type === 'final')?.amount || 0;
    const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    return { income: totalIncome, expenses: totalExpenses, profit: netProfit, margin };
  };

  const stats = getStats();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-muted rounded mb-2"></div>
          <div className="h-4 w-96 bg-muted rounded"></div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="card-professional">
              <CardContent className="p-4 animate-pulse">
                <div className="h-4 w-24 bg-muted rounded mb-2"></div>
                <div className="h-6 w-32 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="card-professional">
          <CardHeader>
            <div className="h-6 w-48 bg-muted rounded animate-pulse"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 animate-pulse">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-5 w-full bg-muted rounded"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Financial Reports</h1>
          <p className="text-muted-foreground mt-1">
            View comprehensive financial statements based on your transactions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={loadFinancialData}>
            <Activity className="h-4 w-4" />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="card-professional">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Income</p>
                <p className="text-xl font-bold">R {stats.income.toLocaleString('en-ZA')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-xl font-bold">R {stats.expenses.toLocaleString('en-ZA')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-xl font-bold ${stats.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  R {stats.profit.toLocaleString('en-ZA')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <PieChart className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Profit Margin</p>
                <p className="text-xl font-bold">{stats.margin.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Card className="card-professional">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Financial Statements
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant={activeReport === 'pl' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveReport('pl')}
              >
                <TrendingUp className="h-4 w-4 mr-2" />
                P&L
              </Button>
              <Button
                variant={activeReport === 'bs' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveReport('bs')}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Balance Sheet
              </Button>
              <Button
                variant={activeReport === 'cf' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveReport('cf')}
              >
                <Activity className="h-4 w-4 mr-2" />
                Cash Flow
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeReport === 'bs' ? (
            <div className="font-sans text-slate-800 p-2 sm:p-4 bg-white min-h-[600px]">
              <div className="flex flex-col sm:flex-row justify-between items-start mb-6">
                <div>
                  <h1 className="text-2xl font-normal text-slate-700 mb-2">Balance Sheet Report</h1>
                  <h2 className="text-xl text-slate-600 mb-4">{companyName || 'My Company'}</h2>
                  <div className="text-sm text-slate-500">Run At Date: {new Date().toLocaleDateString('en-GB')}</div>
                </div>
                <Button className="bg-[#0070ad] hover:bg-[#005a8d] text-white mt-4 sm:mt-0">Show Report Options</Button>
              </div>

              <div className="flex gap-2 mb-6">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-700" onClick={handleExportPDF}><FileText className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-700" onClick={handleExportExcel}><Download className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-700"><FileText className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-700"><Printer className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-700"><Mail className="h-4 w-4" /></Button>
              </div>

              <div className="w-full text-right text-xs text-slate-500 mb-2 border-b pb-1">
                {new Date().toLocaleDateString('en-GB')}
              </div>

              <div className="w-full">
                {balanceSheetData.map((item, index) => {
                  if (item.type === 'main-header') {
                    return <div key={index} className="text-[#0070ad] font-bold text-sm mt-4 mb-2">{item.account}</div>;
                  }
                  if (item.type === 'sub-header') {
                    return <div key={index} className="text-[#0070ad] font-bold text-xs mt-2 mb-1 pl-4">{item.account}</div>;
                  }
                  if (item.type === 'asset' || item.type === 'liability' || item.type === 'equity') {
                    return (
                      <div key={index} className="flex justify-between text-xs py-1 pl-8 border-b border-dotted border-slate-200 hover:bg-slate-50">
                        <span className="text-slate-600">{item.account}</span>
                        <span className="text-slate-800">R {item.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    );
                  }
                  if (item.type === 'sub-total') {
                    return (
                      <div key={index} className="flex justify-between text-xs font-bold py-2 pl-4 border-t border-b border-slate-300 mt-1 mb-2 bg-slate-50/50">
                        <span className="text-slate-700">{item.account}</span>
                        <span className="text-slate-800">R {item.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    );
                  }
                  if (item.type === 'main-total') {
                    return (
                      <div key={index} className="flex justify-between text-sm font-bold py-2 border-t-2 border-b-2 border-[#0070ad] mt-2 mb-4 text-[#0070ad]">
                        <span>{item.account}</span>
                        <span>R {item.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    );
                  }
                  if (item.type === 'spacer') {
                    return <div key={index} className="h-4"></div>;
                  }
                  return null;
                })}
              </div>
            </div>
          ) : (
            getCurrentData().length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No financial data available. Create transactions to generate reports.</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold">Account</TableHead>
                      <TableHead className="text-right font-semibold">Amount (ZAR)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getCurrentData().map((item, index) => {
                      if (item.type === 'spacer') {
                        return <TableRow key={index}><TableCell colSpan={2} className="h-4"></TableCell></TableRow>;
                      }
                      if (item.type === 'header') {
                        return (
                          <TableRow key={index} className="bg-muted/50">
                            <TableCell colSpan={2} className="font-bold text-lg">{item.account}</TableCell>
                          </TableRow>
                        );
                      }
                      return (
                        <TableRow 
                          key={index} 
                          className={`${
                            item.type === 'subtotal' || item.type === 'total' || item.type === 'final' 
                              ? 'bg-muted/30 font-medium' 
                              : ''
                          }`}
                        >
                          <TableCell 
                            className={`${
                              item.type === 'total' || item.type === 'final' ? 'font-bold' : ''
                            } ${
                              item.type === 'expense' || item.type === 'asset' || item.type === 'liability' || item.type === 'equity' 
                                ? 'pl-8' 
                                : ''
                            }`}
                          >
                            {item.account}
                          </TableCell>
                          <TableCell 
                            className={`text-right font-mono ${
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
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              
              <div className="flex justify-between items-center mt-6 pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Generated on: {new Date().toLocaleDateString('en-ZA')}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2" onClick={handleExportPDF}>
                    <Download className="h-4 w-4" />
                    Export PDF
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={handleExportExcel}>
                    <Download className="h-4 w-4" />
                    Export Excel
                  </Button>
                </div>
              </div>
            </>
          )
          )}
        </CardContent>
      </Card>

    </div>
  );
};

async function fetchTrialBalanceForPeriod(companyId: string, start: string, end: string) {
  const startDateObj = new Date(start);
  const startISO = startDateObj.toISOString();
  const endDateObj = new Date(end);
  endDateObj.setHours(23, 59, 59, 999);
  const endISO = endDateObj.toISOString();

  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('account_code');

  const { data: txEntries } = await supabase
    .from('transaction_entries')
    .select(`transaction_id, account_id, debit, credit, description, transactions!inner ( transaction_date, status, company_id )`)
    .eq('transactions.company_id', companyId)
    .eq('transactions.status', 'posted')
    .gte('transactions.transaction_date', startISO)
    .lte('transactions.transaction_date', endISO)
    .not('description', 'ilike', '%Opening balance (carry forward)%');

  const { data: ledgerEntries } = await supabase
    .from('ledger_entries')
    .select('transaction_id, account_id, debit, credit, entry_date, description')
    .eq('company_id', companyId)
    .gte('entry_date', startISO)
    .lte('entry_date', endISO)
    .not('description', 'ilike', '%Opening balance (carry forward)%');

  const ledgerTxIds = new Set<string>((ledgerEntries || []).map((e: any) => String(e.transaction_id || '')));
  const filteredTxEntries = (txEntries || []).filter((e: any) => !ledgerTxIds.has(String(e.transaction_id || '')));

  const trial: Array<{ account_id: string; account_code: string; account_name: string; account_type: string; balance: number }> = [];
  (accounts || []).forEach((acc: any) => {
    let sumDebit = 0;
    let sumCredit = 0;
    filteredTxEntries?.forEach((entry: any) => { if (entry.account_id === acc.id) { sumDebit += Number(entry.debit || 0); sumCredit += Number(entry.credit || 0); } });
    ledgerEntries?.forEach((entry: any) => { if (entry.account_id === acc.id) { sumDebit += Number(entry.debit || 0); sumCredit += Number(entry.credit || 0); } });
  const t = String(acc.account_type || '').toLowerCase();
  const naturalDebit = t === 'asset' || t === 'expense';
  const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);
  const isInventory = String(acc.account_name || '').toLowerCase().includes('inventory');
  const isPrimaryInventory = String(acc.account_code || '') === '1300';
  const shouldShow = Math.abs(balance) > 0.01 && (!isInventory || isPrimaryInventory);
  if (shouldShow) trial.push({ account_id: acc.id, account_code: acc.account_code, account_name: acc.account_name, account_type: acc.account_type, balance });
  });
  return trial;
}

async function fetchTrialBalanceCumulativeToEnd(companyId: string, end: string) {
  const endDateObj = new Date(end);
  endDateObj.setHours(23, 59, 59, 999);
  const endISO = endDateObj.toISOString();

  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('account_code');

  const { data: txEntries } = await supabase
    .from('transaction_entries')
    .select(`transaction_id, account_id, debit, credit, description, transactions!inner ( transaction_date, status, company_id )`)
    .eq('transactions.company_id', companyId)
    .eq('transactions.status', 'posted')
    .lte('transactions.transaction_date', endISO)
    .not('description', 'ilike', '%Opening balance (carry forward)%');

  const { data: ledgerEntries } = await supabase
    .from('ledger_entries')
    .select('transaction_id, account_id, debit, credit, entry_date, description')
    .eq('company_id', companyId)
    .lte('entry_date', endISO)
    .not('description', 'ilike', '%Opening balance (carry forward)%');

  const ledgerTxIds = new Set<string>((ledgerEntries || []).map((e: any) => String(e.transaction_id || '')));
  const filteredTxEntries = (txEntries || []).filter((e: any) => !ledgerTxIds.has(String(e.transaction_id || '')));

  const trial: Array<{ account_id: string; account_code: string; account_name: string; account_type: string; balance: number }> = [];
  (accounts || []).forEach((acc: any) => {
    let sumDebit = 0;
    let sumCredit = 0;
    filteredTxEntries?.forEach((entry: any) => { if (entry.account_id === acc.id) { sumDebit += Number(entry.debit || 0); sumCredit += Number(entry.credit || 0); } });
    ledgerEntries?.forEach((entry: any) => { if (entry.account_id === acc.id) { sumDebit += Number(entry.debit || 0); sumCredit += Number(entry.credit || 0); } });
  const t = String(acc.account_type || '').toLowerCase();
  const naturalDebit = t === 'asset' || t === 'expense';
  const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);
  const isInventory = String(acc.account_name || '').toLowerCase().includes('inventory');
  const isPrimaryInventory = String(acc.account_code || '') === '1300';
  const shouldShow = Math.abs(balance) > 0.01 && (!isInventory || isPrimaryInventory);
  if (shouldShow) trial.push({ account_id: acc.id, account_code: acc.account_code, account_name: acc.account_name, account_type: acc.account_type, balance });
  });
  return trial;
}
