import { supabase } from "@/integrations/supabase/client";

export type EmployeeInput = {
  company_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  id_number?: string | null;
  tax_number?: string | null;
  employment_type?: string | null;
  start_date?: string | null;
  department?: string | null;
  bank_name?: string | null;
  bank_branch_code?: string | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
  salary_type?: string | null;
  hourly_rate?: number | null;
  monthly_salary?: number | null;
  status?: string | null;
};

export const createEmployee = async (payload: EmployeeInput) => {
  const attempt = await supabase
    .from("employees" as any)
    .insert({
      company_id: payload.company_id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.email ?? null,
      id_number: payload.id_number ?? null,
      tax_number: payload.tax_number ?? null,
      employment_type: payload.employment_type ?? null,
      start_date: payload.start_date ?? null,
      department: payload.department ?? null,
      bank_name: payload.bank_name ?? null,
      bank_branch_code: payload.bank_branch_code ?? null,
      bank_account_number: payload.bank_account_number ?? null,
      bank_account_type: payload.bank_account_type ?? null,
      salary_type: payload.salary_type ?? null,
      hourly_rate: payload.hourly_rate ?? null,
      monthly_salary: payload.monthly_salary ?? null,
      status: payload.status ?? null,
      active: payload.status ? payload.status.toLowerCase() === "active" : true,
    } as any)
    .select("*")
    .single();
  if (!attempt.error) return attempt.data;
  const msg = String(attempt.error.message || "").toLowerCase();
  const fallback = await supabase
    .from("employees" as any)
    .insert({
      company_id: payload.company_id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.email ?? null,
      id_number: payload.id_number ?? null,
      tax_number: payload.tax_number ?? null,
      start_date: payload.start_date ?? null,
      bank_name: payload.bank_name ?? null,
      bank_branch_code: payload.bank_branch_code ?? null,
      bank_account_number: payload.bank_account_number ?? null,
      bank_account_type: payload.bank_account_type ?? null,
      salary_type: payload.salary_type ?? null,
      active: true,
    } as any)
    .select("*")
    .single();
  if (fallback.error) throw fallback.error;
  return fallback.data;
};

export const updateEmployee = async (id: string, payload: Partial<EmployeeInput>) => {
  const res = await supabase
    .from("employees" as any)
    .update({
      first_name: payload.first_name,
      last_name: payload.last_name,
      email: payload.email,
      id_number: payload.id_number,
      tax_number: payload.tax_number,
      employment_type: payload.employment_type,
      start_date: payload.start_date,
      department: payload.department,
      bank_name: payload.bank_name,
      bank_branch_code: payload.bank_branch_code,
      bank_account_number: payload.bank_account_number,
      bank_account_type: payload.bank_account_type,
      salary_type: payload.salary_type,
      hourly_rate: payload.hourly_rate,
      monthly_salary: payload.monthly_salary,
      status: payload.status,
      active: payload.status ? String(payload.status).toLowerCase() === "active" : undefined,
    } as any)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (res.error) throw res.error;
  return res.data;
};

export const deleteEmployee = async (id: string) => {
  const res = await supabase.from("employees" as any).delete().eq("id", id);
  if (res.error) throw res.error;
  return true;
};

export const getEmployee = async (id: string) => {
  const { data, error } = await supabase.from("employees" as any).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
};

export const listEmployees = async (company_id: string) => {
  const { data, error } = await supabase.from("employees" as any).select("*").eq("company_id", company_id).order("first_name", { ascending: true });
  if (error) throw error;
  return data || [];
};