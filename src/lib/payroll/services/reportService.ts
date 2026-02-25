import { supabase } from "@/integrations/supabase/client";

export const getEMP201 = async (company_id: string, period_start: string, period_end: string) => {
  const { data: runs } = await supabase.from("pay_runs" as any).select("id").eq("company_id", company_id).gte("period_start", period_start).lte("period_end", period_end);
  const ids = (runs || []).map((r: any) => r.id);
  if (!ids.length) return { paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 };
  const { data: lines } = await supabase.from("pay_run_lines" as any).select("paye,uif_emp,uif_er,sdl_er").in("pay_run_id", ids);
  const paye = +(lines || []).reduce((s: number, l: any) => s + Number(l.paye || 0), 0).toFixed(2);
  const uif_emp = +(lines || []).reduce((s: number, l: any) => s + Number(l.uif_emp || 0), 0).toFixed(2);
  const uif_er = +(lines || []).reduce((s: number, l: any) => s + Number(l.uif_er || 0), 0).toFixed(2);
  const sdl_er = +(lines || []).reduce((s: number, l: any) => s + Number(l.sdl_er || 0), 0).toFixed(2);
  return { paye, uif_emp, uif_er, sdl_er };
};

export const getEMP501 = async (company_id: string, year_start: string, year_end: string) => {
  const { data: runs } = await supabase.from("pay_runs" as any).select("id").eq("company_id", company_id).gte("period_start", year_start).lte("period_end", year_end);
  const ids = (runs || []).map((r: any) => r.id);
  const { data: lines } = await supabase.from("pay_run_lines" as any).select("gross,net,paye,uif_emp,uif_er,sdl_er").in("pay_run_id", ids);
  const totals = (lines || []).reduce((acc: any, l: any) => ({
    gross: acc.gross + Number(l.gross || 0),
    net: acc.net + Number(l.net || 0),
    paye: acc.paye + Number(l.paye || 0),
    uif_emp: acc.uif_emp + Number(l.uif_emp || 0),
    uif_er: acc.uif_er + Number(l.uif_er || 0),
    sdl_er: acc.sdl_er + Number(l.sdl_er || 0),
  }), { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 });
  Object.keys(totals).forEach(k => totals[k] = +totals[k].toFixed(2));
  return totals;
};

export const getIRP5 = async (company_id: string, employee_id: string, year_start: string, year_end: string) => {
  const { data: runs } = await supabase.from("pay_runs" as any).select("id").eq("company_id", company_id).gte("period_start", year_start).lte("period_end", year_end);
  const ids = (runs || []).map((r: any) => r.id);
  const { data: lines } = await supabase.from("pay_run_lines" as any).select("gross,net,paye,uif_emp,uif_er,sdl_er,details").in("pay_run_id", ids).eq("employee_id", employee_id);
  const totals = (lines || []).reduce((acc: any, l: any) => ({
    gross: acc.gross + Number(l.gross || 0),
    net: acc.net + Number(l.net || 0),
    paye: acc.paye + Number(l.paye || 0),
    uif_emp: acc.uif_emp + Number(l.uif_emp || 0),
    uif_er: acc.uif_er + Number(l.uif_er || 0),
    sdl_er: acc.sdl_er + Number(l.sdl_er || 0),
    details: acc.details,
  }), { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0, details: [] });
  Object.keys(totals).forEach(k => { if (k !== "details") totals[k] = +totals[k].toFixed(2); });
  return totals;
};