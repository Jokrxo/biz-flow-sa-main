import { supabase } from "@/integrations/supabase/client";
import { PayslipJSON } from "./types";

export const buildPayslipJSON = async (pay_run_id: string, employee_id: string): Promise<PayslipJSON> => {
  const { data: run } = await supabase.from("pay_runs" as any).select("*").eq("id", pay_run_id).maybeSingle();
  const { data: line } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", pay_run_id).eq("employee_id", employee_id).maybeSingle();
  const { data: emp } = await supabase.from("employees" as any).select("first_name,last_name").eq("id", employee_id).maybeSingle();
  const name = emp ? `${emp.first_name} ${emp.last_name}` : employee_id;
  const det = (line?.details as any) || {};
  const earnings = Array.isArray(det.earnings) ? det.earnings : [];
  const deductions = Array.isArray(det.deductions) ? det.deductions : [];
  const employer = Array.isArray(det.employer) ? det.employer : [];
  const taxableIncome = Number(line?.gross || 0);
  return {
    period_start: String(run?.period_start || ""),
    period_end: String(run?.period_end || ""),
    employee_id,
    employee_name: name,
    gross: Number(line?.gross || 0),
    taxable_income: taxableIncome,
    earnings: earnings.map((e: any) => ({ type: String(e.type), amount: Number(e.amount || 0) })),
    deductions: deductions.map((d: any) => ({ type: String(d.type), amount: Number(d.amount || 0) })),
    contributions: employer.map((c: any) => ({ type: String(c.type), amount: Number(c.amount || 0) })),
    paye: Number(line?.paye || 0),
    uif_emp: Number(line?.uif_emp || 0),
    uif_er: Number(line?.uif_er || 0),
    sdl_er: Number(line?.sdl_er || 0),
    net: Number(line?.net || 0),
  };
};