import { supabase } from "@/integrations/supabase/client";

export interface FinancialMetrics {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalIncome: number;
  totalExpenses: number;
  bankBalance: number;
  currentAssets: number;
  currentLiabilities: number;
}

export const fetchCompanyFinancialMetrics = async (
  companyId: string, 
  startDate?: Date, 
  endDate?: Date
): Promise<FinancialMetrics> => {
  const now = new Date();
  const startOfYear = startDate ? startDate.toISOString() : new Date(now.getFullYear(), 0, 1).toISOString();
  // If no endDate provided, default to end of today
  const endOfPeriod = endDate ? endDate.toISOString() : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  // 1. Get Chart of Accounts to map IDs to Types
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_type, account_name, account_code')
    .eq('company_id', companyId);

  if (!accounts) return {
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    totalIncome: 0,
    totalExpenses: 0,
    bankBalance: 0,
    currentAssets: 0,
    currentLiabilities: 0
  };

  const typeMap = new Map<string, string>();
  const codeMap = new Map<string, string>();
  const bankAccountIds = new Set<string>();

  accounts.forEach((acc: any) => {
    typeMap.set(acc.id, acc.account_type.toLowerCase());
    codeMap.set(acc.id, acc.account_code);
    
    if (acc.account_type.toLowerCase() === 'asset' && 
       (acc.account_name.toLowerCase().includes('bank') || acc.account_code === '1100')) {
      bankAccountIds.add(acc.id);
    }
  });

  // 2. Get Ledger Entries (All time for Balance Sheet, YTD for P&L)
  const { data: entries } = await supabase
    .from('ledger_entries')
    .select('account_id, debit, credit, entry_date')
    .eq('company_id', companyId);

  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;
  let totalIncome = 0; // YTD
  let totalExpenses = 0; // YTD
  let bankBalance = 0;
  let currentAssets = 0;
  let currentLiabilities = 0;

  (entries || []).forEach((entry: any) => {
    const type = typeMap.get(entry.account_id) || '';
    const code = codeMap.get(entry.account_id) || '';
    const debit = Number(entry.debit || 0);
    const credit = Number(entry.credit || 0);
    const date = entry.entry_date;

    // Balance Sheet (As of End Date)
    if (date <= endOfPeriod) {
      if (type === 'asset') {
        const val = debit - credit;
        totalAssets += val;
        if (bankAccountIds.has(entry.account_id)) {
          bankBalance += val;
        }
        // Simple heuristic for current assets: Code starts with 1
        if (code.startsWith('1')) {
          currentAssets += val;
        }
      } else if (type === 'liability') {
        const val = credit - debit;
        totalLiabilities += val;
        // Simple heuristic for current liabilities: Code starts with 2
        if (code.startsWith('2')) {
          currentLiabilities += val;
        }
      } else if (type === 'equity') {
        totalEquity += (credit - debit);
      }
    }

    // Income Statement (Period Range)
    if (date >= startOfYear && date <= endOfPeriod) {
      if (type === 'revenue' || type === 'income') {
        totalIncome += (credit - debit);
      } else if (type === 'expense') {
        totalExpenses += (debit - credit);
      }
    }
  });

  // Recalculate Equity: Assets - Liabilities (Standard Accounting Equation)
  const calculatedEquity = totalAssets - totalLiabilities;

  return {
    totalAssets,
    totalLiabilities,
    totalEquity: calculatedEquity,
    totalIncome,
    totalExpenses,
    bankBalance,
    currentAssets,
    currentLiabilities
  };
};
