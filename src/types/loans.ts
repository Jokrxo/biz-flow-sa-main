/**
 * Loan Management Type Definitions
 * IFRS/IAS compliant loan types and interfaces
 */

// Loan Types
export type LoanType = 'short' | 'long';
export type LoanCategory = 'external' | 'internal_director' | 'internal_member';
export type LoanStatus = 'active' | 'completed' | 'overdue' | 'pending' | 'written_off';
export type PaymentFrequency = 'monthly' | 'quarterly' | 'annually' | 'bullet';
export type InterestType = 'fixed' | 'variable';
export type DirectorLoanDirection = 'to_director' | 'from_director';

// Core Loan Interface
export interface Loan {
  id: string;
  company_id: string;
  reference: string;
  loan_type: LoanType;
  category: LoanCategory;
  principal: number;
  interest_rate: number;
  interest_type: InterestType;
  start_date: string;
  term_months: number;
  payment_frequency: PaymentFrequency;
  monthly_repayment: number | null;
  status: LoanStatus;
  outstanding_balance: number;
  original_balance: number;
  lender_name: string;
  lender_id?: string;
  bank_account_id?: string;
  loan_account_id?: string;
  collateral?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// Loan Payment Interface
export interface LoanPayment {
  id: string;
  loan_id: string;
  payment_date: string;
  amount: number;
  principal_component: number;
  interest_component: number;
  balance_after: number;
  payment_type: 'scheduled' | 'early' | 'additional' | 'balloon';
  reference?: string;
  notes?: string;
  created_at?: string;
}

// Amortization Schedule Entry
export interface AmortizationEntry {
  period: number;
  payment_date: string;
  payment_amount: number;
  interest_portion: number;
  principal_portion: number;
  remaining_balance: number;
  cumulative_interest: number;
  cumulative_principal: number;
  is_paid: boolean;
}

// Full Amortization Schedule
export interface AmortizationSchedule {
  loan_id: string;
  entries: AmortizationEntry[];
  total_interest: number;
  total_principal: number;
  total_payments: number;
  effective_interest_rate?: number;
}

// Loan History Entry
export interface LoanHistoryEntry {
  id: string;
  loan_id: string;
  action_date: string;
  action_type: 'created' | 'payment' | 'interest_posted' | 'status_change' | 'adjustment' | 'amortization_update';
  description: string;
  amount?: number;
  balance_after?: number;
  user_id?: string;
  metadata?: Record<string, any>;
  runningBalance?: number;
}

// Director Loan Details
export interface DirectorLoan {
  id: string;
  loan_id: string;
  director_name: string;
  director_id?: string;
  direction: DirectorLoanDirection;
  tax_implications?: string;
  imputed_interest_rate?: number;
}

// Loan Report Types
export interface LoanAgingReport {
  loan_id: string;
  reference: string;
  lender_name: string;
  current: number;
  days_30: number;
  days_60: number;
  days_90_plus: number;
  total_outstanding: number;
  days_overdue: number;
}

export interface LoanSummaryReport {
  total_loans: number;
  active_loans: number;
  completed_loans: number;
  overdue_loans: number;
  total_principal: number;
  total_outstanding: number;
  total_interest_accrued: number;
  total_interest_paid: number;
  by_category: {
    external: number;
    internal_director: number;
    internal_member: number;
  };
  by_type: {
    short_term: number;
    long_term: number;
  };
}

export interface InterestAccrualProjection {
  loan_id: string;
  reference: string;
  monthly_interest: number;
  quarterly_interest: number;
  annual_interest: number;
  next_payment_date: string;
}

// Loan Form Data
export interface LoanFormData {
  reference: string;
  loan_type: LoanType;
  category: LoanCategory;
  lender_name: string;
  lender_id?: string;
  principal: number;
  interest_rate: number;
  interest_type: InterestType;
  start_date: string;
  term_months: number;
  payment_frequency: PaymentFrequency;
  monthly_repayment?: number;
  bank_account_id?: string;
  loan_account_id?: string;
  collateral?: string;
  notes?: string;
  director_name?: string;
  director_id?: string;
  direction?: DirectorLoanDirection;
}

// Repayment Form Data
export interface RepaymentFormData {
  loan_id: string;
  payment_date: string;
  amount: number;
  payment_type: 'scheduled' | 'early' | 'additional' | 'balloon';
  allocate_to_interest: number;
  allocate_to_principal: number;
  reference?: string;
  notes?: string;
}

// Filter Options
export interface LoanFilters {
  search?: string;
  status?: LoanStatus | 'all';
  type?: LoanType | 'all';
  category?: LoanCategory | 'all';
  lender?: string;
  date_from?: string;
  date_to?: string;
}

// Navigation Types
export interface LoanNavItem {
  label: string;
  href: string;
  icon?: string;
  description?: string;
}

// Export Options
export type ExportFormat = 'pdf' | 'csv' | 'excel';

export interface ExportOptions {
  format: ExportFormat;
  include_amortization: boolean;
  include_history: boolean;
  date_range?: {
    from: string;
    to: string;
  };
  selected_loans?: string[];
}

// Business Ownership Configuration
export type BusinessOwnershipForm = 
  | 'sole_proprietorship' 
  | 'partnership' 
  | 'private_company' 
  | 'public_company' 
  | 'close_corporation'
  | 'trust';

export interface BusinessConfig {
  ownership_form: BusinessOwnershipForm;
  company_name: string;
  registration_number?: string;
  tax_number?: string;
}

// Loan Metrics for Dashboard
export interface LoanMetrics {
  total_outstanding: number;
  total_principal: number;
  total_interest_accrued: number;
  upcoming_repayments: {
    count: number;
    total_amount: number;
    next_date: string;
  };
  overdue_amount: number;
  active_loans_count: number;
  completed_loans_count: number;
}
