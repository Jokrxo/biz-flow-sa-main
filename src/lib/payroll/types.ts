export type EmploymentType = "permanent" | "contract" | "intern" | "casual";
export type SalaryType = "monthly" | "weekly" | "hourly";

export type EarningType =
  | "basic_salary"
  | "overtime_1_5"
  | "overtime_2"
  | "bonus"
  | "commission"
  | "travel_allowance"
  | "subsistence_allowance"
  | "cellphone_allowance"
  | "company_car"
  | "low_interest_loan"
  | "medical_fringe";

export type DeductionType =
  | "paye"
  | "uif_emp"
  | "sdl_er"
  | "medical_aid"
  | "pension_fund"
  | "retirement_annuity"
  | "union_fees"
  | "garnishee"
  | "loan";

export interface EmployeePayload {
  company_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  id_number?: string | null;
  tax_number?: string | null;
  employment_type?: EmploymentType | null;
  start_date?: string | null;
  department?: string | null;
  bank_name?: string | null;
  bank_branch_code?: string | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
  salary_type?: SalaryType | null;
  hourly_rate?: number | null;
  monthly_salary?: number | null;
  status?: "active" | "terminated" | null;
}

export interface EarningsPayload {
  pay_run_id: string;
  employee_id: string;
  type: EarningType;
  hours?: number | null;
  rate?: number | null;
  amount?: number | null;
}

export interface DeductionsPayload {
  pay_run_id: string;
  employee_id: string;
  type: DeductionType;
  amount: number;
}

export interface ProcessPayload {
  company_id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  pay_run_id?: string | null;
}

export interface PayrollResult {
  gross: number;
  net: number;
  paye: number;
  uif_emp: number;
  uif_er: number;
  sdl_er: number;
  employer_contrib: number;
}

export interface PayslipJSON {
  period_start: string;
  period_end: string;
  employee_id: string;
  employee_name: string;
  gross: number;
  taxable_income: number;
  earnings: Array<{ type: string; amount: number }>;
  deductions: Array<{ type: string; amount: number }>;
  contributions: Array<{ type: string; amount: number }>;
  paye: number;
  uif_emp: number;
  uif_er: number;
  sdl_er: number;
  net: number;
}