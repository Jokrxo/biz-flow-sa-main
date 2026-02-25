import { createEmployee, updateEmployee, deleteEmployee, listEmployees } from "../models/employeeModel";
import { upsertEarning, removeEarning } from "../models/earningsModel";
import { upsertDeduction, removeDeduction } from "../models/deductionsModel";
import { processPayroll } from "../services/payrollService";
import { generatePayslipPDF } from "../models/payslipModel";

export const Employees = {
  create: createEmployee,
  update: updateEmployee,
  delete: deleteEmployee,
  list: listEmployees,
};

export const Earnings = {
  upsert: upsertEarning,
  remove: removeEarning,
};

export const Deductions = {
  upsert: upsertDeduction,
  remove: removeDeduction,
};

export const Payroll = {
  process: processPayroll,
  payslipPDF: generatePayslipPDF,
};