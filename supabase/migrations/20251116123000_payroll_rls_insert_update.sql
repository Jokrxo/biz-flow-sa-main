-- RLS INSERT/UPDATE policies for payroll tables

-- Employees
create policy employees_insert on public.employees
for insert with check (company_id = public.get_user_company(auth.uid()));

create policy employees_update on public.employees
for update using (company_id = public.get_user_company(auth.uid()))
with check (company_id = public.get_user_company(auth.uid()));

-- Pay Items
create policy pay_items_insert on public.pay_items
for insert with check (company_id = public.get_user_company(auth.uid()));

create policy pay_items_update on public.pay_items
for update using (company_id = public.get_user_company(auth.uid()))
with check (company_id = public.get_user_company(auth.uid()));

-- Employee Pay Items
create policy employee_pay_items_insert on public.employee_pay_items
for insert with check (exists (
  select 1 from public.employees e
  where e.id = employee_pay_items.employee_id
  and e.company_id = public.get_user_company(auth.uid())
));

create policy employee_pay_items_update on public.employee_pay_items
for update using (exists (
  select 1 from public.employees e
  where e.id = employee_pay_items.employee_id
  and e.company_id = public.get_user_company(auth.uid())
)) with check (exists (
  select 1 from public.employees e
  where e.id = employee_pay_items.employee_id
  and e.company_id = public.get_user_company(auth.uid())
));

-- Pay Runs
create policy pay_runs_insert on public.pay_runs
for insert with check (company_id = public.get_user_company(auth.uid()));

create policy pay_runs_update on public.pay_runs
for update using (company_id = public.get_user_company(auth.uid()))
with check (company_id = public.get_user_company(auth.uid()));

-- Pay Run Lines
create policy pay_run_lines_insert on public.pay_run_lines
for insert with check (exists (
  select 1 from public.pay_runs r
  where r.id = pay_run_lines.pay_run_id
  and r.company_id = public.get_user_company(auth.uid())
));

create policy pay_run_lines_update on public.pay_run_lines
for update using (exists (
  select 1 from public.pay_runs r
  where r.id = pay_run_lines.pay_run_id
  and r.company_id = public.get_user_company(auth.uid())
)) with check (exists (
  select 1 from public.pay_runs r
  where r.id = pay_run_lines.pay_run_id
  and r.company_id = public.get_user_company(auth.uid())
));