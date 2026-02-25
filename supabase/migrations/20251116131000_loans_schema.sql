create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  reference text not null,
  loan_type text not null check (loan_type in ('short','long')),
  principal numeric(14,2) not null,
  interest_rate numeric(7,4) not null,
  start_date date not null,
  term_months int not null,
  monthly_repayment numeric(14,2),
  status text not null default 'active' check (status in ('active','completed','closed')),
  outstanding_balance numeric(14,2) not null,
  created_at timestamptz default now(),
  unique(company_id, reference)
);

create table if not exists public.loan_payments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  payment_date date not null,
  amount numeric(14,2) not null,
  principal_component numeric(14,2) not null,
  interest_component numeric(14,2) not null,
  created_at timestamptz default now()
);

alter table public.loans enable row level security;
alter table public.loan_payments enable row level security;

create policy loans_select on public.loans
for select using (company_id = public.get_user_company(auth.uid()));
create policy loan_payments_select on public.loan_payments
for select using (exists (select 1 from public.loans l where l.id = loan_payments.loan_id and l.company_id = public.get_user_company(auth.uid())));