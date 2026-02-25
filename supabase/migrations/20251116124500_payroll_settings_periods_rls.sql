create policy payroll_settings_insert on public.payroll_settings
for insert with check (company_id = public.get_user_company(auth.uid()));

create policy payroll_settings_update on public.payroll_settings
for update using (company_id = public.get_user_company(auth.uid()))
with check (company_id = public.get_user_company(auth.uid()));

create policy payroll_periods_insert on public.payroll_periods
for insert with check (company_id = public.get_user_company(auth.uid()));

create policy payroll_periods_update on public.payroll_periods
for update using (company_id = public.get_user_company(auth.uid()))
with check (company_id = public.get_user_company(auth.uid()));