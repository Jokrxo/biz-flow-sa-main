/**
 * Loan Management API Service
 * Provides API methods for loan operations, repayments, and amortization
 */

import { supabase } from '@/integrations/supabase/client';
import type {
  Loan,
  LoanPayment,
  LoanFormData,
  RepaymentFormData,
  LoanFilters,
  LoanMetrics,
  LoanAgingReport,
  LoanSummaryReport,
  AmortizationSchedule,
  LoanHistoryEntry,
  InterestAccrualProjection,
} from '@/types/loans';
import {
  generateAmortizationSchedule,
  calculateLoanMetrics,
  generateLoanAgingReport,
  generateLoanSummaryReport,
  calculateInterestProjections,
  determineLoanStatus,
} from '@/utils/loanUtils';

// ==================== Loan CRUD Operations ====================

/**
 * Fetch all loans for a company
 */
export async function fetchLoans(companyId: string, filters?: LoanFilters): Promise<Loan[]> {
  let query = supabase
    .from('loans')
    .select('*')
    .eq('company_id', companyId)
    .order('start_date', { ascending: false });

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters?.type && filters.type !== 'all') {
    query = query.eq('loan_type', filters.type);
  }

  const { data, error } = await query;

  if (error) throw error;

  let loans = (data || []) as Loan[];

  // Apply search filter client-side
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    loans = loans.filter(
      (loan) =>
        loan.reference.toLowerCase().includes(searchLower) ||
        loan.lender_name.toLowerCase().includes(searchLower)
    );
  }

  return loans;
}

/**
 * Fetch a single loan by ID
 */
export async function fetchLoanById(loanId: string): Promise<Loan | null> {
  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .eq('id', loanId)
    .single();

  if (error) throw error;
  return data as Loan;
}

/**
 * Create a new loan
 */
export async function createLoan(loanData: LoanFormData, companyId: string): Promise<Loan> {
  const { data, error } = await supabase
    .from('loans')
    .insert({
      company_id: companyId,
      reference: loanData.reference,
      loan_type: loanData.loan_type,
      category: loanData.category,
      principal: loanData.principal,
      interest_rate: loanData.interest_rate,
      interest_type: loanData.interest_type || 'fixed',
      start_date: loanData.start_date,
      term_months: loanData.term_months,
      payment_frequency: loanData.payment_frequency || 'monthly',
      monthly_repayment: loanData.monthly_repayment,
      status: 'active',
      outstanding_balance: loanData.principal,
      original_balance: loanData.principal,
      lender_name: loanData.lender_name,
      lender_id: loanData.lender_id,
      bank_account_id: loanData.bank_account_id,
      loan_account_id: loanData.loan_account_id,
      collateral: loanData.collateral,
      notes: loanData.notes,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Loan;
}

/**
 * Update an existing loan
 */
export async function updateLoan(loanId: string, updates: Partial<Loan>): Promise<Loan> {
  const { data, error } = await supabase
    .from('loans')
    .update(updates)
    .eq('id', loanId)
    .select()
    .single();

  if (error) throw error;
  return data as Loan;
}

/**
 * Delete a loan (soft delete by marking as completed)
 */
export async function deleteLoan(loanId: string): Promise<void> {
  const { error } = await supabase
    .from('loans')
    .update({ status: 'completed' })
    .eq('id', loanId);

  if (error) throw error;
}

// ==================== Repayment Operations ====================

/**
 * Fetch all payments for a loan
 */
export async function fetchLoanPayments(loanId: string): Promise<LoanPayment[]> {
  const { data, error } = await supabase
    .from('loan_payments')
    .select('*')
    .eq('loan_id', loanId)
    .order('payment_date', { ascending: false });

  if (error) throw error;
  return (data || []) as LoanPayment[];
}

/**
 * Fetch all payments for a company
 */
export async function fetchAllPayments(companyId: string): Promise<LoanPayment[]> {
  const { data: loans } = await supabase
    .from('loans')
    .select('id')
    .eq('company_id', companyId);

  if (!loans || loans.length === 0) return [];

  const loanIds = loans.map((l) => l.id);

  const { data, error } = await supabase
    .from('loan_payments')
    .select('*')
    .in('loan_id', loanIds)
    .order('payment_date', { ascending: false });

  if (error) throw error;
  return (data || []) as LoanPayment[];
}

/**
 * Record a loan repayment
 */
export async function recordRepayment(
  repaymentData: RepaymentFormData,
  companyId: string
): Promise<LoanPayment> {
  // Get current loan to calculate allocation
  const loan = await fetchLoanById(repaymentData.loan_id);
  if (!loan) throw new Error('Loan not found');

  // Calculate principal and interest components if not provided
  let principalComponent = repaymentData.allocate_to_principal;
  let interestComponent = repaymentData.allocate_to_interest;

  if (!principalComponent && !interestComponent) {
    // Auto-calculate based on outstanding balance
    const monthlyRate = loan.interest_rate / 12;
    interestComponent = loan.outstanding_balance * monthlyRate;
    principalComponent = repaymentData.amount - interestComponent;
  }

  const balanceAfter = Math.max(0, loan.outstanding_balance - principalComponent);

  // Create payment record
  const { data, error } = await supabase
    .from('loan_payments')
    .insert({
      loan_id: repaymentData.loan_id,
      payment_date: repaymentData.payment_date,
      amount: repaymentData.amount,
      principal_component: principalComponent,
      interest_component: interestComponent,
      balance_after: balanceAfter,
      payment_type: repaymentData.payment_type || 'scheduled',
      reference: repaymentData.reference,
      notes: repaymentData.notes,
    })
    .select()
    .single();

  if (error) throw error;

  // Update loan outstanding balance
  await updateLoan(repaymentData.loan_id, {
    outstanding_balance: balanceAfter,
    status: balanceAfter === 0 ? 'completed' : 'active',
  });

  return data as LoanPayment;
}

// ==================== Amortization ====================

/**
 * Generate amortization schedule for a loan
 */
export async function generateLoanAmortization(loanId: string): Promise<AmortizationSchedule> {
  const loan = await fetchLoanById(loanId);
  if (!loan) throw new Error('Loan not found');

  // Get payments to mark which periods are paid
  const payments = await fetchLoanPayments(loanId);
  const schedule = generateAmortizationSchedule(loan);

  // Mark paid entries based on actual payments
  payments.forEach((payment) => {
    const entry = schedule.entries.find(
      (e) => e.payment_date === payment.payment_date
    );
    if (entry) {
      entry.is_paid = true;
    }
  });

  return schedule;
}

// ==================== Reports & Analytics ====================

/**
 * Get comprehensive loan metrics for dashboard
 */
export async function getLoanMetrics(companyId: string): Promise<LoanMetrics> {
  const loans = await fetchLoans(companyId);
  const payments = await fetchAllPayments(companyId);

  // Update loan statuses based on payment history
  const updatedLoans = loans.map((loan) => {
    const loanPayments = payments.filter((p) => p.loan_id === loan.id);
    const status = determineLoanStatus(loan, loanPayments);
    return { ...loan, status };
  });

  return calculateLoanMetrics(updatedLoans, payments);
}

/**
 * Generate loan aging report
 */
export async function getLoanAgingReport(companyId: string): Promise<LoanAgingReport[]> {
  const loans = await fetchLoans(companyId);
  const payments = await fetchAllPayments(companyId);

  return generateLoanAgingReport(loans, payments);
}

/**
 * Generate loan summary report
 */
export async function getLoanSummaryReport(companyId: string): Promise<LoanSummaryReport> {
  const loans = await fetchLoans(companyId);
  const payments = await fetchAllPayments(companyId);

  return generateLoanSummaryReport(loans, payments);
}

/**
 * Get interest accrual projections for all loans
 */
export async function getInterestProjections(
  companyId: string
): Promise<InterestAccrualProjection[]> {
  const loans = await fetchLoans(companyId, { status: 'active' });

  return loans.map((loan) => calculateInterestProjections(loan));
}

// ==================== History ====================

/**
 * Fetch loan history
 */
export async function fetchLoanHistory(loanId: string): Promise<LoanHistoryEntry[]> {
  // For now, generate history from payments
  // In a full implementation, there would be a separate loan_history table
  const payments = await fetchLoanPayments(loanId);
  const loan = await fetchLoanById(loanId);

  if (!loan) return [];

  const history: LoanHistoryEntry[] = [
    {
      id: `init-${loan.id}`,
      loan_id: loan.id,
      action_date: loan.start_date,
      action_type: 'created',
      description: `Loan created: ${loan.reference}`,
      amount: loan.principal,
      balance_after: loan.principal,
    },
  ];

  // Add payment history
  payments.forEach((payment) => {
    history.push({
      id: payment.id,
      loan_id: loan.id,
      action_date: payment.payment_date,
      action_type: 'payment',
      description: `Payment received: ${payment.reference || 'N/A'}`,
      amount: payment.amount,
      balance_after: payment.balance_after,
    });
  });

  return history.sort(
    (a, b) => new Date(b.action_date).getTime() - new Date(a.action_date).getTime()
  );
}

// ==================== Export Functions ====================

/**
 * Export loans to CSV
 */
export async function exportLoansToCSV(companyId: string): Promise<string> {
  const loans = await fetchLoans(companyId);
  const payments = await fetchAllPayments(companyId);

  const headers = [
    'Reference',
    'Type',
    'Category',
    'Lender',
    'Principal',
    'Interest Rate',
    'Term (Months)',
    'Start Date',
    'Outstanding Balance',
    'Status',
    'Total Interest Paid',
  ];

  const rows = loans.map((loan) => {
    const loanPayments = payments.filter((p) => p.loan_id === loan.id);
    const totalInterest = loanPayments.reduce((sum, p) => sum + p.interest_component, 0);

    return [
      loan.reference,
      loan.loan_type === 'short' ? 'Short-term' : 'Long-term',
      loan.category,
      loan.lender_name,
      loan.principal.toString(),
      (loan.interest_rate * 100).toFixed(2) + '%',
      loan.term_months.toString(),
      loan.start_date,
      loan.outstanding_balance.toString(),
      loan.status,
      totalInterest.toFixed(2),
    ];
  });

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  return csvContent;
}

/**
 * Export amortization schedule to CSV
 */
export async function exportAmortizationToCSV(loanId: string): Promise<string> {
  const schedule = await generateLoanAmortization(loanId);

  const headers = [
    'Period',
    'Payment Date',
    'Payment Amount',
    'Interest Portion',
    'Principal Portion',
    'Remaining Balance',
    'Cumulative Interest',
    'Cumulative Principal',
    'Status',
  ];

  const rows = schedule.entries.map((entry) => [
    entry.period.toString(),
    entry.payment_date,
    entry.payment_amount.toFixed(2),
    entry.interest_portion.toFixed(2),
    entry.principal_portion.toFixed(2),
    entry.remaining_balance.toFixed(2),
    entry.cumulative_interest.toFixed(2),
    entry.cumulative_principal.toFixed(2),
    entry.is_paid ? 'Paid' : 'Pending',
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  return csvContent;
}

/**
 * Export amortization schedule to Excel-compatible array
 */
export async function exportAmortizationToExcel(loanId: string): Promise<any[]> {
  const schedule = await generateLoanAmortization(loanId);
  
  const headers = [
    'Period',
    'Payment Date',
    'Payment Amount',
    'Interest Portion',
    'Principal Portion',
    'Remaining Balance',
    'Cumulative Interest',
    'Cumulative Principal',
    'Status',
  ];

  const rows = schedule.entries.map((entry) => ({
    'Period': entry.period,
    'Payment Date': entry.payment_date,
    'Payment Amount': entry.payment_amount,
    'Interest Portion': entry.interest_portion,
    'Principal Portion': entry.principal_portion,
    'Remaining Balance': entry.remaining_balance,
    'Cumulative Interest': entry.cumulative_interest,
    'Cumulative Principal': entry.cumulative_principal,
    'Status': entry.is_paid ? 'Paid' : 'Pending',
  }));

  return [headers, ...rows];
}

/**
 * Export all loans to Excel-compatible array
 */
export async function exportLoansToExcel(companyId: string): Promise<any[]> {
  const loans = await fetchLoans(companyId);
  const payments = await fetchAllPayments(companyId);

  const headers = [
    'Reference',
    'Type',
    'Category',
    'Lender',
    'Principal',
    'Interest Rate',
    'Term (Months)',
    'Start Date',
    'Outstanding Balance',
    'Status',
    'Total Interest Paid',
  ];

  const rows = loans.map((loan) => {
    const loanPayments = payments.filter((p) => p.loan_id === loan.id);
    const totalInterest = loanPayments.reduce((sum, p) => sum + p.interest_component, 0);

    return {
      'Reference': loan.reference,
      'Type': loan.loan_type === 'short' ? 'Short-term' : 'Long-term',
      'Category': loan.category,
      'Lender': loan.lender_name,
      'Principal': loan.principal,
      'Interest Rate': loan.interest_rate * 100,
      'Term (Months)': loan.term_months,
      'Start Date': loan.start_date,
      'Outstanding Balance': loan.outstanding_balance,
      'Status': loan.status,
      'Total Interest Paid': totalInterest,
    };
  });

  return [headers, ...rows];
}

// ==================== Integration with Accounting ====================

/**
 * Post loan received transaction (from transactionsApi)
 * This is a wrapper that integrates with the existing transactions API
 */
export async function postLoanReceivedTransaction(
  loanId: string,
  bankAccountId: string,
  date: string,
  reference: string
): Promise<void> {
  const loan = await fetchLoanById(loanId);
  if (!loan) throw new Error('Loan not found');

  // Import from existing transactions API
  const { transactionsApi } = await import('@/lib/transactions-api');
  
  await transactionsApi.postLoanReceived({
    date,
    amount: loan.principal,
    reference,
    bankAccountId,
    loanType: loan.loan_type,
    loanLedgerAccountId: loan.loan_account_id,
    description: `Loan received: ${loan.reference}`,
  });
}

/**
 * Post loan repayment transaction
 */
export async function postLoanRepaymentTransaction(
  loanId: string,
  bankAccountId: string,
  date: string,
  amount: number
): Promise<void> {
  const { transactionsApi } = await import('@/lib/transactions-api');
  
  await transactionsApi.postLoanRepayment({
    loanId,
    date,
    bankAccountId,
    amountOverride: amount,
  });
}

/**
 * Post interest payment transaction
 */
export async function postInterestPaymentTransaction(
  loanId: string,
  bankAccountId: string,
  date: string,
  amount?: number
): Promise<void> {
  const { transactionsApi } = await import('@/lib/transactions-api');
  
  await transactionsApi.postLoanInterest({
    loanId,
    date,
    bankAccountId,
    amountOverride: amount,
  });
}
