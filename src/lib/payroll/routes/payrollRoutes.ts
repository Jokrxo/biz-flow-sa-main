import { Employees, Earnings, Deductions, Payroll } from "../controllers/payrollController";
import { getEMP201, getEMP501, getIRP5 } from "../services/reportService";

export const routes = {
  post_employee_create: Employees.create,
  post_employee_update: Employees.update,
  post_employee_delete: Employees.delete,
  get_employees: Employees.list,
  post_earnings_upsert: Earnings.upsert,
  post_earnings_remove: Earnings.remove,
  post_deductions_upsert: Deductions.upsert,
  post_deductions_remove: Deductions.remove,
  post_payroll_process: Payroll.process,
  post_payroll_payslip_pdf: Payroll.payslipPDF,
  get_reports_emp201: getEMP201,
  get_reports_emp501: getEMP501,
  get_reports_irp5: getIRP5,
};