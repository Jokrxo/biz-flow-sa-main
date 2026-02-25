import { Employees, Earnings, Deductions, Payroll } from "./controllers/payrollController";
import { getEMP201, getEMP501, getIRP5 } from "./services/reportService";
import { validateEmployeeInput, validateEarningInput, validateDeductionInput } from "./validators";
import { buildPayslipJSON } from "./payslip-json";
import { EmployeePayload, EarningsPayload, DeductionsPayload, ProcessPayload } from "./types";

export const postEmployees = async (payload: EmployeePayload) => { validateEmployeeInput(payload); return Employees.create(payload as any); };
export const putEmployees = async (id: string, payload: Partial<EmployeePayload>) => { return Employees.update(id, payload as any); };
export const deleteEmployees = async (id: string) => { return Employees.delete(id); };
export const getEmployees = async (company_id: string) => { return Employees.list(company_id); };

export const postEarnings = async (payload: EarningsPayload) => { validateEarningInput(payload); const mult = payload.type === "overtime_1_5" ? 1.5 : payload.type === "overtime_2" ? 2 : 1; return Earnings.upsert({ ...payload, multiplier: mult } as any); };
export const deleteEarnings = async (pay_run_id: string, employee_id: string, type: string) => { return Earnings.remove(pay_run_id, employee_id, type); };

export const postDeductions = async (payload: DeductionsPayload) => { validateDeductionInput(payload); return Deductions.upsert(payload as any); };
export const deleteDeductions = async (pay_run_id: string, employee_id: string, type: string) => { return Deductions.remove(pay_run_id, employee_id, type); };

export const postPayrollProcess = async (payload: ProcessPayload) => { return Payroll.process(payload as any); };
export const postPayrollPayslip = async (pay_run_id: string, employee_id: string) => { return buildPayslipJSON(pay_run_id, employee_id); };

export const getReportsEmp201 = async (company_id: string, period_start: string, period_end: string) => { return getEMP201(company_id, period_start, period_end); };
export const getReportsEmp501 = async (company_id: string, year_start: string, year_end: string) => { return getEMP501(company_id, year_start, year_end); };
export const getReportsIrp5 = async (company_id: string, employee_id: string, year_start: string, year_end: string) => { return getIRP5(company_id, employee_id, year_start, year_end); };