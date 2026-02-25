/**
 * Shared Financial Data Fetching Utility
 * 
 * This module provides a single source of truth for fetching financial data
 * used by all financial statements (Balance Sheet, Income Statement, Cash Flow).
 * 
 * Key Features:
 * - Consistent filtering: status = 'posted', date range, active accounts only
 * - Excludes opening balance entries to prevent incorrect calculations
 * - Prevents double-counting: excludes transaction_entries that have matching ledger_entries
 * - Supports both period movement (Income Statement) and cumulative (Balance Sheet) views
 * 
 * IFRS/GAAP Considerations:
 * - Revenue recognition: Income Statement shows revenue from invoices, not receipts
 * - Receipts (Dr Bank, Cr AR) only affect Balance Sheet
 * - Only posted transactions are included for accurate financial reporting
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Types for financial data
 */
export interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

export interface TransactionEntry {
  transaction_id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string;
  status: string;
  transaction_date?: string;
}

export interface LedgerEntry {
  transaction_id: string;
  account_id: string;
  debit: number;
  credit: number;
  entry_date: string;
  description: string;
}

export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  debit: number;
  credit: number;
  balance: number;
}

/**
 * Consolidated fetch function for trial balance within a date range
 * Used for: Income Statement (period movements)
 * 
 * @param companyId - The company ID
 * @param startDate - Start of period (ISO string)
 * @param endDate - End of period (ISO string)
 */
export async function fetchTrialBalanceForPeriod(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<TrialBalanceRow[]> {
  const startDateObj = new Date(startDate);
  const startISO = startDateObj.toISOString();
  
  const endDateObj = new Date(endDate);
  endDateObj.setHours(23, 59, 59, 999);
  const endISO = endDateObj.toISOString();

  // Fetch all active accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('account_code');

  if (accountsError) throw accountsError;

  // Fetch transaction entries within period (posted only)
  // Excludes opening balance entries
  const { data: txEntries, error: txError } = await supabase
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
    .not('description', 'ilike', '%Opening balance (carry forward)%');

  if (txError) throw txError;

  // Fetch ledger entries within period
  // Excludes opening balance entries
  const { data: ledgerEntries, error: ledgerError } = await supabase
    .from('ledger_entries')
    .select('transaction_id, account_id, debit, credit, entry_date, description')
    .eq('company_id', companyId)
    .gte('entry_date', startISO)
    .lte('entry_date', endISO)
    .not('description', 'ilike', '%Opening balance (carry forward)%');

  if (ledgerError) throw ledgerError;

  return processTrialBalance(accounts, txEntries, ledgerEntries);
}

/**
 * Consolidated fetch function for cumulative trial balance as of a date
 * Used for: Balance Sheet (cumulative balances)
 * 
 * @param companyId - The company ID
 * @param endDate - End date for cumulative balance (ISO string)
 */
export async function fetchTrialBalanceAsOf(
  companyId: string,
  endDate: string
): Promise<TrialBalanceRow[]> {
  const endDateObj = new Date(endDate);
  endDateObj.setHours(23, 59, 59, 999);
  const endISO = endDateObj.toISOString();

  // Fetch all active accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('account_code');

  if (accountsError) throw accountsError;

  // Fetch ALL transaction entries up to end date (posted only)
  // Excludes opening balance entries
  const { data: txEntries, error: txError } = await supabase
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
    .not('description', 'ilike', '%Opening balance (carry forward)%');

  if (txError) throw txError;

  // Fetch ALL ledger entries up to end date
  // Excludes opening balance entries
  const { data: ledgerEntries, error: ledgerError } = await supabase
    .from('ledger_entries')
    .select('transaction_id, account_id, debit, credit, entry_date, description')
    .eq('company_id', companyId)
    .lte('entry_date', endISO)
    .not('description', 'ilike', '%Opening balance (carry forward)%');

  if (ledgerError) throw ledgerError;

  return processTrialBalance(accounts, txEntries, ledgerEntries);
}

/**
 * Process raw data into trial balance format
 * Applies consistent logic:
 * - Filters out transaction_entries that have corresponding ledger_entries (prevents double-counting)
 * - Calculates debit/credit balances based on account type
 * 
 * @param accounts - Chart of accounts data
 * @param txEntries - Transaction entries (raw Supabase response)
 * @param ledgerEntries - Ledger entries
 */
function processTrialBalance(
  accounts: Account[] | null,
  txEntries: any[] | null,
  ledgerEntries: LedgerEntry[] | null
): TrialBalanceRow[] {
  if (!accounts) return [];

  // Create set of transaction IDs from ledger entries to avoid double-counting
  const ledgerTxIds = new Set<string>(
    (ledgerEntries || []).map((e) => String(e.transaction_id || ''))
  );

  // Filter out transaction entries that have corresponding ledger entries
  const filteredTxEntries = (txEntries || []).filter(
    (e) => !ledgerTxIds.has(String(e.transaction_id || ''))
  );

  const trialBalance: TrialBalanceRow[] = [];

  (accounts || []).forEach((acc: Account) => {
    let sumDebit = 0;
    let sumCredit = 0;

    // Sum transaction entries for this account
    filteredTxEntries?.forEach((entry: TransactionEntry) => {
      if (entry.account_id === acc.id) {
        sumDebit += Number(entry.debit || 0);
        sumCredit += Number(entry.credit || 0);
      }
    });

    // Sum ledger entries for this account
    ledgerEntries?.forEach((entry: LedgerEntry) => {
      if (entry.account_id === acc.id) {
        sumDebit += Number(entry.debit || 0);
        sumCredit += Number(entry.credit || 0);
      }
    });

    // Calculate balance based on account type
    // Asset and Expense accounts: Debit is positive (natural debit)
    // Liability, Equity, and Income accounts: Credit is positive (natural credit)
    const type = (acc.account_type || '').toLowerCase();
    const naturalDebit = type === 'asset' || type === 'expense';
    const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);

    // Only include accounts with non-zero balances (with small threshold to avoid floating point issues)
    if (Math.abs(balance) > 0.01) {
      trialBalance.push({
        account_id: acc.id,
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        debit: sumDebit,
        credit: sumCredit,
        balance,
      });
    }
  });

  return trialBalance;
}

/**
 * Helper function to categorize accounts for financial statements
 */
export function categorizeAccounts(trialBalance: TrialBalanceRow[]) {
  const assets = trialBalance.filter(
    (r) => r.account_type.toLowerCase() === 'asset'
  );
  const liabilities = trialBalance.filter(
    (r) => r.account_type.toLowerCase() === 'liability'
  );
  const equity = trialBalance.filter(
    (r) => r.account_type.toLowerCase() === 'equity'
  );
  const revenue = trialBalance.filter(
    (r) => r.account_type.toLowerCase() === 'revenue' || r.account_type.toLowerCase() === 'income'
  );
  const expenses = trialBalance.filter(
    (r) => r.account_type.toLowerCase() === 'expense'
  );

  return { assets, liabilities, equity, revenue, expenses };
}

/**
 * Calculate totals for a category
 */
export function calculateCategoryTotals(accounts: TrialBalanceRow[]) {
  return accounts.reduce((sum, acc) => sum + acc.balance, 0);
}

/**
 * Debug helper - logs raw fetched entries (development only)
 * Can be used to diagnose data fetching issues
 */
export function logFetchedData(
  companyId: string,
  startDate: string,
  endDate: string
) {
  if (process.env.NODE_ENV === 'development') {
    console.log('=== Financial Data Fetch Debug ===');
    console.log('Company ID:', companyId);
    console.log('Period:', startDate, 'to', endDate);
    console.log('Filters applied:');
    console.log('  - status = posted');
    console.log('  - is_active = true');
    console.log('  - Excludes: Opening balance entries');
    console.log('  - Prevents double-counting via ledger_entry check');
  }
}

export default {
  fetchTrialBalanceForPeriod,
  fetchTrialBalanceAsOf,
  categorizeAccounts,
  calculateCategoryTotals,
  logFetchedData,
};
