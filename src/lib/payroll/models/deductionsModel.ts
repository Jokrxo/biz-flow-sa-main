import { supabase } from "@/integrations/supabase/client";

export type DeductionInput = {
  pay_run_id: string;
  employee_id: string;
  type: string;
  amount: number;
};

export const upsertDeduction = async (input: DeductionInput) => {
  const { data } = await supabase.from("pay_run_lines" as any).select("id, details").eq("pay_run_id", input.pay_run_id).eq("employee_id", input.employee_id).maybeSingle();
  const base = data || { id: null, details: {} } as any;
  const det = base.details || {};
  const arr = Array.isArray(det.deductions) ? det.deductions : [];
  const idx = arr.findIndex((e: any) => String(e.type) === String(input.type));
  const next = { type: input.type, amount: +(Number(input.amount || 0).toFixed(2)) };
  if (idx >= 0) arr[idx] = next; else arr.push(next);
  det.deductions = arr;
  if (!base.id) {
    const ins = await supabase.from("pay_run_lines" as any).insert({ pay_run_id: input.pay_run_id, employee_id: input.employee_id, gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0, details: det } as any);
    if (ins.error) throw ins.error;
    return true;
  }
  const upd = await supabase.from("pay_run_lines" as any).update({ details: det } as any).eq("id", base.id);
  if (upd.error) throw upd.error;
  return true;
};

export const removeDeduction = async (pay_run_id: string, employee_id: string, type: string) => {
  const { data } = await supabase.from("pay_run_lines" as any).select("id, details").eq("pay_run_id", pay_run_id).eq("employee_id", employee_id).maybeSingle();
  if (!data) return true;
  const det = data.details || {};
  const arr = Array.isArray(det.deductions) ? det.deductions : [];
  const next = arr.filter((e: any) => String(e.type) !== String(type));
  det.deductions = next;
  const upd = await supabase.from("pay_run_lines" as any).update({ details: det } as any).eq("id", data.id);
  if (upd.error) throw upd.error;
  return true;
};