-- Work / Tasks module schema migration
-- Focus: accounting-aware tasks for Administration
-- Constraints: UI/UX only for app logic; backend here defines structure without automation

-- Enums for consistency
create type public.task_type_enum as enum ('system', 'assigned', 'recurring');
create type public.task_status_enum as enum ('todo', 'in_progress', 'review', 'completed');
create type public.task_module_enum as enum ('GL', 'Payroll', 'VAT', 'Assets');
create type public.recurrence_frequency_enum as enum ('monthly', 'quarterly');

-- Updated-at trigger helper
create or replace function public.set_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Main tasks table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text,
  type public.task_type_enum not null default 'assigned',
  module public.task_module_enum not null,
  assigned_to_user_id uuid references public.profiles(user_id) on delete set null,
  due_date date not null,
  status public.task_status_enum not null default 'todo',
  period_label text not null,            -- e.g. 'January 2026' or 'Q1 FY 2025/26'
  financial_year_label text not null,    -- e.g. 'FY 2025/26'
  recurrence_frequency public.recurrence_frequency_enum,
  linked_module_record_id uuid,          -- optional pointer to a record in linked module
  system_generated boolean not null default false,
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tasks_set_timestamp
before update on public.tasks
for each row
execute procedure public.set_timestamp();

-- Indexes for performance and filtering
create index if not exists tasks_company_id_idx on public.tasks(company_id);
create index if not exists tasks_assigned_to_user_id_idx on public.tasks(assigned_to_user_id);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_module_idx on public.tasks(module);
create index if not exists tasks_due_date_idx on public.tasks(due_date);
create index if not exists tasks_type_idx on public.tasks(type);

-- Minimal RLS setup (optional): keep disabled by default unless app enables globally
-- Supabase often has RLS enabled; these policies assume profiles hold company_id mapping
alter table public.tasks enable row level security;

-- Allow authenticated users to read tasks for their company
create policy tasks_select_same_company
on public.tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id = public.tasks.company_id
  )
);

-- Allow inserting tasks for user's company (UI may be admin-only; adjust later)
create policy tasks_insert_same_company
on public.tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id = public.tasks.company_id
  )
);

-- Allow updating tasks only if same company; finer controls (ownership/roles) can be added later
create policy tasks_update_same_company
on public.tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id = public.tasks.company_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id = public.tasks.company_id
  )
);

-- Allow delete (optional): restricted to same company
create policy tasks_delete_same_company
on public.tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.company_id = public.tasks.company_id
  )
);

-- Seed examples (optional, commented out; enable if needed)
-- insert into public.tasks (company_id, title, type, module, due_date, status, period_label, financial_year_label, system_generated)
-- select c.id, 'January 2026 bank reconciliation not completed', 'system', 'GL', date '2026-02-05', 'todo', 'January 2026', 'FY 2025/26', true
-- from public.companies c
-- limit 1;
