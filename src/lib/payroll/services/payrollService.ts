import { supabase } from "@/integrations/supabase/client";
import { calculatePAYE } from "../services/taxService";

export type ProcessInput = { 
  company_id: string; 
  employee_id: string; 
  period_start: string; 
  period_end: string; 
  pay_run_id?: string | null;
  overrideGross?: number; // Added to support direct gross input from UI
};

export const processPayroll = async (input: ProcessInput) => {
  const { data: line } = await supabase.from("pay_run_lines" as any).select("id, details, gross").eq("pay_run_id", input.pay_run_id).eq("employee_id", input.employee_id).maybeSingle() as any;
  
  const det = (line as any)?.details || { earnings: [], deductions: [], employer: [] };
  const earnings = Array.isArray(det.earnings) ? det.earnings : [];
  let deductions = Array.isArray(det.deductions) ? det.deductions : [];
  const employer = Array.isArray(det.employer) ? det.employer : [];

  // Use overrideGross if provided, otherwise sum earnings, otherwise use existing gross from line
  let gross = input.overrideGross !== undefined 
    ? input.overrideGross 
    : earnings.length > 0 
      ? +(earnings.reduce((s: number, e: any) => s + Number(e.amount || 0), 0).toFixed(2))
      : Number((line as any)?.gross || 0);

  // If we have an overrideGross and no earnings, initialize details with a Basic Salary entry
  if (input.overrideGross !== undefined && earnings.length === 0) {
    det.earnings = [{ name: "Basic Salary", amount: input.overrideGross }];
  }

  const taxableAllowances = +(earnings.filter((e: any) => ["travel_allowance","subsistence_allowance","cellphone_allowance"].includes(String(e.type))).reduce((s: number, e: any) => s + Number(e.amount || 0) * (String(e.type) === "travel_allowance" ? 0.8 : 1), 0).toFixed(2));
  const fringeBenefits = +(earnings.filter((e: any) => ["company_car","low_interest_loan","medical_fringe"].includes(String(e.type))).reduce((s: number, e: any) => s + Number(e.amount || 0), 0).toFixed(2));

  const { data: emp } = await supabase.from("employees" as any).select("id, tax_number, id_number, medical_aid_members").eq("id", input.employee_id).maybeSingle() as any;

  const { data: deductionItems } = await supabase
    .from("pay_items" as any)
    .select("id, name, type")
    .eq("company_id", input.company_id)
    .eq("type", "deduction");

  const deductionIds = (deductionItems || []).map((i: any) => i.id);
  if (deductionIds.length) {
    const { data: empDeductions } = await supabase
      .from("employee_pay_items" as any)
      .select("pay_item_id, amount")
      .eq("employee_id", input.employee_id)
      .in("pay_item_id", deductionIds);

    const details = (empDeductions || []).map((row: any) => {
      const item = (deductionItems || []).find((i: any) => i.id === row.pay_item_id);
      return {
        type: item?.name || String(row.pay_item_id),
        amount: +(Number(row.amount || 0).toFixed(2)),
      };
    });

    det.deductions = details;
    deductions = details;
  }
  
  const tax = await calculatePAYE(
    input.company_id, 
    { 
      tax_number: emp?.tax_number, 
      id_number: emp?.id_number, 
      medical_aid_members: emp?.medical_aid_members 
    }, 
    { 
      period_start: input.period_start, 
      period_end: input.period_end, 
      gross, 
      taxableAllowances, 
      fringeBenefits 
    }
  );

  const totalDeductions = +(deductions.reduce((s: number, d: any) => s + Number(d.amount || 0), 0).toFixed(2));
  const net = +(gross - tax.paye - tax.uif_emp - totalDeductions).toFixed(2);
  const employer_contrib = +(employer.reduce((s: number, e: any) => s + Number(e.amount || 0), 0).toFixed(2));
  
  const payload = { 
    gross, 
    net, 
    paye: tax.paye, 
    uif_emp: tax.uif_emp, 
    uif_er: tax.uif_er, 
    sdl_er: tax.sdl_er, 
    employer_contrib, 
    details: det 
  } as any;

  if (line?.id) {
    const upd = await supabase.from("pay_run_lines" as any).update(payload as any).eq("id", line.id);
    if (upd.error) throw upd.error;
  } else if (input.pay_run_id) {
    const ins = await supabase.from("pay_run_lines" as any).insert({ pay_run_id: input.pay_run_id, employee_id: input.employee_id, ...payload } as any);
    if (ins.error) throw ins.error;
  }
  return payload;
};
