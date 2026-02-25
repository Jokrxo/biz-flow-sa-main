/**
 * Loan Management Utilities
 * IFRS/IAS compliant calculation functions for loan amortization,
 * interest accrual, and repayment schedules
 */

import type {
  Loan,
  LoanPayment,
  AmortizationSchedule,
  AmortizationEntry,
  LoanMetrics,
  LoanAgingReport,
  LoanSummaryReport,
  InterestAccrualProjection,
  PaymentFrequency,
  LoanStatus,
} from '@/types/loans';

/**
 * Calculate monthly payment using PMT formula
 * PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
 * 
 * @param principal - Loan principal amount
 * @param annualRate - Annual interest rate (as decimal, e.g., 0.12 for 12%)
 * @param termMonths - Loan term in months
 * @returns Monthly payment amount
 */
export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  termMonths: number
): number {
  if (termMonths <= 0) return principal;
  if (annualRate === 0) return principal / termMonths;
  
  const monthlyRate = annualRate / 12;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return principal * (monthlyRate * factor) / (factor - 1);
}

/**
 * Calculate payment for different frequencies
 */
export function calculatePaymentByFrequency(
  principal: number,
  annualRate: number,
  termMonths: number,
  frequency: PaymentFrequency
): number {
  const monthlyPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
  
  switch (frequency) {
    case 'monthly':
      return monthlyPayment;
    case 'quarterly':
      return monthlyPayment * 3;
    case 'annually':
      return monthlyPayment * 12;
    case 'bullet':
      return 0; // Balloon payment - interest only during term
    default:
      return monthlyPayment;
  }
}

/**
 * Generate full amortization schedule using IFRS effective interest method
 * 
 * @param loan - Loan object with all details
 * @returns Complete amortization schedule
 */
export function generateAmortizationSchedule(loan: Loan): AmortizationSchedule {
  const entries: AmortizationEntry[] = [];
  let balance = loan.principal;
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  
  const monthlyRate = loan.interest_rate / 12;
  const totalPeriods = loan.term_months;
  
  // Calculate scheduled payment
  let scheduledPayment = loan.monthly_repayment 
    ? loan.monthly_repayment 
    : calculateMonthlyPayment(loan.principal, loan.interest_rate, loan.term_months);
  
  // Generate entries for each period
  for (let period = 1; period <= totalPeriods && balance > 0.01; period++) {
    const paymentDate = addMonths(new Date(loan.start_date), period);
    
    // Interest portion for this period (IFRS effective interest method)
    const interestPortion = balance * monthlyRate;
    
    // Principal portion
    let principalPortion = scheduledPayment - interestPortion;
    
    // Handle final payment (may be different)
    if (principalPortion > balance) {
      principalPortion = balance;
      scheduledPayment = interestPortion + principalPortion;
    }
    
    // Update balance
    balance -= principalPortion;
    if (balance < 0) balance = 0;
    
    // Update cumulative totals
    cumulativeInterest += interestPortion;
    cumulativePrincipal += principalPortion;
    
    entries.push({
      period,
      payment_date: paymentDate.toISOString().split('T')[0],
      payment_amount: roundCurrency(scheduledPayment),
      interest_portion: roundCurrency(interestPortion),
      principal_portion: roundCurrency(principalPortion),
      remaining_balance: roundCurrency(balance),
      cumulative_interest: roundCurrency(cumulativeInterest),
      cumulative_principal: roundCurrency(cumulativePrincipal),
      is_paid: false, // Will be updated based on actual payments
    });
  }
  
  return {
    loan_id: loan.id,
    entries,
    total_interest: roundCurrency(cumulativeInterest),
    total_principal: roundCurrency(loan.principal),
    total_payments: roundCurrency(cumulativeInterest + cumulativePrincipal),
    effective_interest_rate: loan.interest_rate,
  };
}

/**
 * Calculate interest portion for a specific period (IPMT)
 */
export function calculateInterestPortion(
  balance: number,
  annualRate: number,
  period: number = 1
): number {
  const monthlyRate = annualRate / 12;
  return balance * monthlyRate;
}

/**
 * Calculate principal portion for a specific period (PPMT)
 */
export function calculatePrincipalPortion(
  payment: number,
  balance: number,
  annualRate: number
): number {
  const interestPortion = calculateInterestPortion(balance, annualRate);
  return payment - interestPortion;
}

/**
 * Update amortization schedule with a repayment
 * Handles early payments and additional payments
 */
export function updateScheduleWithRepayment(
  schedule: AmortizationSchedule,
  payment: LoanPayment
): AmortizationSchedule {
  const entries = [...schedule.entries];
  let remainingPayment = payment.amount;
  
  for (let i = 0; i < entries.length && remainingPayment > 0; i++) {
    const entry = entries[i];
    
    if (entry.is_paid) continue;
    
    // First apply to interest, then principal
    const interestDue = entry.payment_amount - entry.principal_portion;
    let interestPaid = Math.min(remainingPayment, interestDue);
    let principalPaid = remainingPayment - interestPaid;
    
    // Update entry
    entry.interest_portion = interestPaid;
    entry.principal_portion = Math.min(principalPaid, entry.remaining_balance);
    entry.remaining_balance = Math.max(0, entry.remaining_balance - principalPaid);
    entry.is_paid = true;
    
    remainingPayment -= (interestPaid + entry.principal_portion);
    
    // If there's remaining payment, apply to subsequent periods
    if (remainingPayment > 0) {
      for (let j = i + 1; j < entries.length; j++) {
        const futureEntry = entries[j];
        const reduction = Math.min(remainingPayment, futureEntry.remaining_balance);
        futureEntry.remaining_balance -= reduction;
        remainingPayment -= reduction;
        
        if (remainingPayment <= 0) break;
      }
    }
  }
  
  // Recalculate cumulative totals
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  
  for (const entry of entries) {
    if (entry.is_paid) {
      cumulativeInterest += entry.interest_portion;
      cumulativePrincipal += entry.principal_portion;
      entry.cumulative_interest = roundCurrency(cumulativeInterest);
      entry.cumulative_principal = roundCurrency(cumulativePrincipal);
    }
  }
  
  return {
    ...schedule,
    entries,
    total_interest: roundCurrency(cumulativeInterest),
    total_principal: roundCurrency(cumulativePrincipal),
  };
}

/**
 * Calculate interest accrual for a specific date
 * Used for monthly accrual entries
 */
export function computeInterestAccrual(
  loan: Loan,
  asOfDate: Date = new Date()
): number {
  const startDate = new Date(loan.start_date);
  const monthsElapsed = monthsBetween(startDate, asOfDate);
  
  if (monthsElapsed <= 0) return 0;
  
  // Calculate based on outstanding balance
  const monthlyRate = loan.interest_rate / 12;
  const accruedInterest = loan.outstanding_balance * monthlyRate * monthsElapsed;
  
  return roundCurrency(accruedInterest);
}

/**
 * Calculate projected interest for financial statements
 */
export function calculateInterestProjections(loan: Loan): InterestAccrualProjection {
  const monthlyInterest = loan.outstanding_balance * (loan.interest_rate / 12);
  const quarterlyInterest = monthlyInterest * 3;
  const annualInterest = monthlyInterest * 12;
  
  // Calculate next payment date
  const nextPaymentDate = calculateNextPaymentDate(loan);
  
  return {
    loan_id: loan.id,
    reference: loan.reference,
    monthly_interest: roundCurrency(monthlyInterest),
    quarterly_interest: roundCurrency(quarterlyInterest),
    annual_interest: roundCurrency(annualInterest),
    next_payment_date: nextPaymentDate.toISOString().split('T')[0],
  };
}

/**
 * Calculate loan metrics for dashboard
 */
export function calculateLoanMetrics(
  loans: Loan[],
  payments: LoanPayment[]
): LoanMetrics {
  const activeLoans = loans.filter(l => l.status === 'active');
  const completedLoans = loans.filter(l => l.status === 'completed');
  const overdueLoans = loans.filter(l => l.status === 'overdue');
  
  const totalOutstanding = loans.reduce((sum, l) => sum + l.outstanding_balance, 0);
  const totalPrincipal = loans.reduce((sum, l) => sum + l.principal, 0);
  
  // Calculate accrued interest from payments
  const totalInterestPaid = payments.reduce((sum, p) => sum + p.interest_component, 0);
  
  // Find upcoming repayments
  const today = new Date();
  const thirtyDaysFromNow = addMonths(today, 1);
  
  const upcomingRepayments = activeLoans.filter(loan => {
    const nextDate = calculateNextPaymentDate(loan);
    return nextDate <= thirtyDaysFromNow;
  });
  
  const upcomingTotal = upcomingRepayments.reduce(
    (sum, l) => sum + (l.monthly_repayment || 0), 
    0
  );
  
  const nextRepayment = upcomingRepayments.length > 0 
    ? calculateNextPaymentDate(upcomingRepayments[0])
    : today;
  
  // Calculate overdue amount
  const overdueAmount = overdueLoans.reduce(
    (sum, l) => sum + l.outstanding_balance, 
    0
  );
  
  return {
    total_outstanding: roundCurrency(totalOutstanding),
    total_principal: roundCurrency(totalPrincipal),
    total_interest_accrued: roundCurrency(totalInterestPaid),
    upcoming_repayments: {
      count: upcomingRepayments.length,
      total_amount: roundCurrency(upcomingTotal),
      next_date: nextRepayment.toISOString().split('T')[0],
    },
    overdue_amount: roundCurrency(overdueAmount),
    active_loans_count: activeLoans.length,
    completed_loans_count: completedLoans.length,
  };
}

/**
 * Generate loan aging report (similar to debtor aging)
 */
export function generateLoanAgingReport(
  loans: Loan[],
  payments: LoanPayment[]
): LoanAgingReport[] {
  const today = new Date();
  
  return loans.map(loan => {
    const daysOverdue = calculateDaysOverdue(loan);
    
    // Calculate aging buckets based on payment history
    let current = 0;
    let days30 = 0;
    let days60 = 0;
    let days90Plus = 0;
    
    // For simplicity, use outstanding balance and days overdue
    if (daysOverdue <= 0) {
      current = loan.outstanding_balance;
    } else if (daysOverdue <= 30) {
      days30 = loan.outstanding_balance;
    } else if (daysOverdue <= 60) {
      days60 = loan.outstanding_balance;
    } else {
      days90Plus = loan.outstanding_balance;
    }
    
    return {
      loan_id: loan.id,
      reference: loan.reference,
      lender_name: loan.lender_name,
      current: roundCurrency(current),
      days_30: roundCurrency(days30),
      days_60: roundCurrency(days60),
      days_90_plus: roundCurrency(days90Plus),
      total_outstanding: roundCurrency(loan.outstanding_balance),
      days_overdue: Math.max(0, daysOverdue),
    };
  });
}

/**
 * Generate comprehensive loan summary report
 */
export function generateLoanSummaryReport(
  loans: Loan[],
  payments: LoanPayment[]
): LoanSummaryReport {
  const activeLoans = loans.filter(l => l.status === 'active');
  const completedLoans = loans.filter(l => l.status === 'completed');
  const overdueLoans = loans.filter(l => l.status === 'overdue');
  
  const totalPrincipal = loans.reduce((sum, l) => sum + l.principal, 0);
  const totalOutstanding = loans.reduce((sum, l) => sum + l.outstanding_balance, 0);
  const totalInterestPaid = payments.reduce((sum, p) => sum + p.interest_component, 0);
  
  // Group by category
  const byCategory = {
    external: loans.filter(l => l.category === 'external').reduce((s, l) => s + l.outstanding_balance, 0),
    internal_director: loans.filter(l => l.category === 'internal_director').reduce((s, l) => s + l.outstanding_balance, 0),
    internal_member: loans.filter(l => l.category === 'internal_member').reduce((s, l) => s + l.outstanding_balance, 0),
  };
  
  // Group by type
  const byType = {
    short_term: loans.filter(l => l.loan_type === 'short').reduce((s, l) => s + l.outstanding_balance, 0),
    long_term: loans.filter(l => l.loan_type === 'long').reduce((s, l) => s + l.outstanding_balance, 0),
  };
  
  return {
    total_loans: loans.length,
    active_loans: activeLoans.length,
    completed_loans: completedLoans.length,
    overdue_loans: overdueLoans.length,
    total_principal: roundCurrency(totalPrincipal),
    total_outstanding: roundCurrency(totalOutstanding),
    total_interest_accrued: roundCurrency(totalInterestPaid),
    total_interest_paid: roundCurrency(totalInterestPaid),
    by_category: {
      external: roundCurrency(byCategory.external),
      internal_director: roundCurrency(byCategory.internal_director),
      internal_member: roundCurrency(byCategory.internal_member),
    },
    by_type: {
      short_term: roundCurrency(byType.short_term),
      long_term: roundCurrency(byType.long_term),
    },
  };
}

/**
 * Determine loan status based on payments and dates
 */
export function determineLoanStatus(loan: Loan, payments: LoanPayment[]): LoanStatus {
  if (loan.outstanding_balance <= 0) return 'completed';
  
  const lastPayment = payments
    .filter(p => p.loan_id === loan.id)
    .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())[0];
  
  if (!lastPayment) {
    // No payments made yet
    const daysSinceStart = daysBetween(new Date(loan.start_date), new Date());
    if (daysSinceStart > 30) return 'overdue';
    return 'active';
  }
  
  const daysSinceLastPayment = daysBetween(new Date(lastPayment.payment_date), new Date());
  
  if (daysSinceLastPayment > 90) return 'written_off';
  if (daysSinceLastPayment > 60) return 'overdue';
  if (daysSinceLastPayment > 30) return 'pending';
  
  return 'active';
}

/**
 * Filter loans based on criteria
 */
export function filterLoans(
  loans: Loan[],
  filters: {
    search?: string;
    status?: LoanStatus | 'all';
    type?: 'short' | 'long' | 'all';
    category?: string;
  }
): Loan[] {
  return loans.filter(loan => {
    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch = 
        loan.reference.toLowerCase().includes(searchLower) ||
        loan.lender_name.toLowerCase().includes(searchLower) ||
        (loan.notes && loan.notes.toLowerCase().includes(searchLower));
      if (!matchesSearch) return false;
    }
    
    // Status filter
    if (filters.status && filters.status !== 'all' && loan.status !== filters.status) {
      return false;
    }
    
    // Type filter
    if (filters.type && filters.type !== 'all' && loan.loan_type !== filters.type) {
      return false;
    }
    
    // Category filter
    if (filters.category && filters.category !== 'all' && loan.category !== filters.category) {
      return false;
    }
    
    return true;
  });
}

// ==================== Helper Functions ====================

/**
 * Add months to a date
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Calculate months between two dates
 */
function monthsBetween(startDate: Date, endDate: Date): number {
  const years = endDate.getFullYear() - startDate.getFullYear();
  const months = endDate.getMonth() - startDate.getMonth();
  return years * 12 + months;
}

/**
 * Calculate days between two dates
 */
function daysBetween(startDate: Date, endDate: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay);
}

/**
 * Calculate days overdue for a loan
 */
function calculateDaysOverdue(loan: Loan): number {
  if (!loan.monthly_repayment || loan.outstanding_balance <= 0) return 0;
  
  const nextPaymentDate = calculateNextPaymentDate(loan);
  const today = new Date();
  
  return daysBetween(nextPaymentDate, today);
}

/**
 * Calculate next payment date
 */
function calculateNextPaymentDate(loan: Loan): Date {
  const today = new Date();
  const startDate = new Date(loan.start_date);
  
  if (today <= startDate) return startDate;
  
  const monthsElapsed = monthsBetween(startDate, today);
  const nextPeriod = monthsElapsed + 1;
  
  return addMonths(startDate, nextPeriod);
}

/**
 * Round to 2 decimal places (currency)
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'ZAR'): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Format percentage for display
 */
export function formatPercentage(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * Validate loan data
 */
export function validateLoanData(data: Partial<Loan>): string[] {
  const errors: string[] = [];
  
  if (!data.reference?.trim()) {
    errors.push('Reference is required');
  }
  
  if (!data.principal || data.principal <= 0) {
    errors.push('Principal amount must be greater than 0');
  }
  
  if (data.interest_rate === undefined || data.interest_rate < 0) {
    errors.push('Interest rate is required');
  }
  
  if (!data.term_months || data.term_months <= 0) {
    errors.push('Term must be greater than 0');
  }
  
  if (!data.start_date) {
    errors.push('Start date is required');
  }
  
  if (!data.lender_name?.trim()) {
    errors.push('Lender name is required');
  }
  
  return errors;
}
