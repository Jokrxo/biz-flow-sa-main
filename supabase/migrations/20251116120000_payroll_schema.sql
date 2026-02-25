-- Payroll schema
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  first_name text not null,
  last_name text not null,
  email text,
  id_number text,
  tax_number text,
  bank_name text,
  bank_branch_code text,
  bank_account_number text,
  bank_account_type text,
  salary_type text check (salary_type in ('monthly','hourly')),
  uif_covered boolean default true,
  pension_rate numeric(6,3),
  medical_aid_amount numeric(12,2),
  start_date date,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.pay_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  code text not null,
  name text not null,
  type text not null check (type in ('earning','deduction','employer')),
  taxable boolean default true,
  created_at timestamptz default now(),
  unique(company_id, code)
);

create table if not exists public.employee_pay_items (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  pay_item_id uuid not null references public.pay_items(id) on delete cascade,
  amount numeric(12,2),
  rate numeric(12,4),
  unit text,
  created_at timestamptz default now(),
  unique(employee_id, pay_item_id)
);

create table if not exists public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','finalized','paid')),
  created_at timestamptz default now()
);

create table if not exists public.pay_run_lines (
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid not null references public.pay_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  gross numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  paye numeric(12,2) not null default 0,
  uif_emp numeric(12,2) not null default 0,
  uif_er numeric(12,2) not null default 0,
  sdl_er numeric(12,2) not null default 0,
  details jsonb,
  created_at timestamptz default now(),
  unique(pay_run_id, employee_id)
);

-- Indexes
create index if not exists idx_employees_company on public.employees(company_id);
create index if not exists idx_pay_items_company on public.pay_items(company_id);
create index if not exists idx_pay_runs_company on public.pay_runs(company_id);
create index if not exists idx_pay_runs_period on public.pay_runs(period_start, period_end);

-- RLS
alter table public.employees enable row level security;
alter table public.pay_items enable row level security;
alter table public.employee_pay_items enable row level security;
alter table public.pay_runs enable row level security;
alter table public.pay_run_lines enable row level security;

create policy employees_select on public.employees
for select using (company_id = public.get_user_company(auth.uid()));
create policy pay_items_select on public.pay_items
for select using (company_id = public.get_user_company(auth.uid()));
create policy employee_pay_items_select on public.employee_pay_items
for select using (exists (
  select 1 from public.employees e
  where e.id = employee_pay_items.employee_id
  and e.company_id = public.get_user_company(auth.uid())
));
create policy pay_runs_select on public.pay_runs
for select using (company_id = public.get_user_company(auth.uid()));
create policy pay_run_lines_select on public.pay_run_lines
for select using (exists (
  select 1 from public.pay_runs r
  where r.id = pay_run_lines.pay_run_id
  and r.company_id = public.get_user_company(auth.uid())
));