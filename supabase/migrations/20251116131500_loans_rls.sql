create policy loans_insert on public.loans
for insert with check (company_id = public.get_user_company(auth.uid()));

create policy loans_update on public.loans
for update using (company_id = public.get_user_company(auth.uid()))
with check (company_id = public.get_user_company(auth.uid()));

create policy loan_payments_insert on public.loan_payments
for insert with check (exists (select 1 from public.loans l where l.id = loan_payments.loan_id and l.company_id = public.get_user_company(auth.uid())));

create policy loan_payments_update on public.loan_payments
for update using (exists (select 1 from public.loans l where l.id = loan_payments.loan_id and l.company_id = public.get_user_company(auth.uid())))
with check (exists (select 1 from public.loans l where l.id = loan_payments.loan_id and l.company_id = public.get_user_company(auth.uid())));