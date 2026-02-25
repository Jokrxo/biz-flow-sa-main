import { EmployeePayload, EarningsPayload, DeductionsPayload } from "./types";

export const validateEmployeeInput = (p: EmployeePayload) => {
  if (!p.company_id) throw new Error("company_id required");
  if (!p.first_name) throw new Error("first_name required");
  if (!p.last_name) throw new Error("last_name required");
  if (p.salary_type && !["monthly","weekly","hourly"].includes(String(p.salary_type))) throw new Error("invalid salary_type");
  if (p.hourly_rate != null && Number(p.hourly_rate) < 0) throw new Error("hourly_rate must be >= 0");
  if (p.monthly_salary != null && Number(p.monthly_salary) < 0) throw new Error("monthly_salary must be >= 0");
  return true;
};

export const validateEarningInput = (e: EarningsPayload) => {
  if (!e.pay_run_id) throw new Error("pay_run_id required");
  if (!e.employee_id) throw new Error("employee_id required");
  if (!e.type) throw new Error("type required");
  if (e.hours != null && Number(e.hours) < 0) throw new Error("hours must be >= 0");
  if (e.rate != null && Number(e.rate) < 0) throw new Error("rate must be >= 0");
  if (e.amount != null && Number(e.amount) < 0) throw new Error("amount must be >= 0");
  return true;
};

export const validateDeductionInput = (d: DeductionsPayload) => {
  if (!d.pay_run_id) throw new Error("pay_run_id required");
  if (!d.employee_id) throw new Error("employee_id required");
  if (!d.type) throw new Error("type required");
  if (Number(d.amount) < 0) throw new Error("amount must be >= 0");
  return true;
};