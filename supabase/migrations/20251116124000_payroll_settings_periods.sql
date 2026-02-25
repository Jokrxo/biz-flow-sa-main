create table if not exists public.payroll_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  tax_brackets jsonb,
  pension_rules jsonb,
  uif_percent numeric(5,2) default 1.00,
  sdl_percent numeric(5,2) default 1.00,
  overtime_rules jsonb,
  allowances jsonb,
  created_at timestamptz default now(),
  unique(company_id)
);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  year int not null,
  month int not null check (month between 1 and 12),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('draft','open','closed')),
  created_at timestamptz default now(),
  unique(company_id, year, month)
);

alter table public.payroll_settings enable row level security;
alter table public.payroll_periods enable row level security;

create policy payroll_settings_select on public.payroll_settings
for select using (company_id = public.get_user_company(auth.uid()));
create policy payroll_periods_select on public.payroll_periods
for select using (company_id = public.get_user_company(auth.uid()));