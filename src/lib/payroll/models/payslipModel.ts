import { supabase } from "@/integrations/supabase/client";
import { buildPayslipPDF, addLogoToPDF } from "../payslip-export";

export type PayslipRequest = { pay_run_id: string; employee_id: string };

export const generatePayslipPDF = async (req: PayslipRequest) => {
  const { data: run } = await supabase.from("pay_runs" as any).select("*").eq("id", req.pay_run_id).maybeSingle();
  const { data: line } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", req.pay_run_id).eq("employee_id", req.employee_id).maybeSingle();
  if (!run || !line) throw new Error("Missing pay run data");
  const { data: emp } = await supabase.from("employees" as any).select("first_name,last_name").eq("id", req.employee_id).maybeSingle();
  const employee_name = emp ? `${emp.first_name} ${emp.last_name}` : req.employee_id;
  const slip = { period_start: run.period_start, period_end: run.period_end, employee_name, gross: line.gross, net: line.net, paye: line.paye, uif_emp: line.uif_emp, uif_er: line.uif_er, sdl_er: line.sdl_er, details: line.details } as any;
  const { data: company } = await supabase.from("companies").select("name,email,phone,address,tax_number,vat_number,logo_url").limit(1).maybeSingle();
  const doc = buildPayslipPDF(slip, (company as any) || { name: "Company" });
  const logoDataUrl = await fetch((company as any)?.logo_url || "").then(r => r.ok ? r.blob() : null).then(b => b ? new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b as any); }) : null).catch(() => null);
  if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
  return doc;
};