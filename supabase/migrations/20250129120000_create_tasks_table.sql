-- Create table if it doesn't exist
create table if not exists "public"."tasks" (
    "id" uuid not null default gen_random_uuid(),
    "company_id" uuid not null,
    "title" text not null,
    "description" text,
    "type" text not null check (type in ('system', 'assigned', 'recurring', 'transaction', 'allocation')),
    "module" text not null check (module in ('GL', 'Payroll', 'VAT', 'Assets', 'Sales', 'Purchases', 'Banking')),
    "assigned_to" uuid references auth.users(id),
    "due_date" date not null,
    "status" text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'completed', 'pending_approval')),
    "period_label" text,
    "financial_year_label" text,
    "link" text,
    "link_label" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    primary key (id)
);

-- Add columns if they don't exist (idempotent updates for existing table)
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'tasks' and column_name = 'link') then
        alter table "public"."tasks" add column "link" text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'tasks' and column_name = 'link_label') then
        alter table "public"."tasks" add column "link_label" text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'tasks' and column_name = 'financial_year_label') then
        alter table "public"."tasks" add column "financial_year_label" text;
    end if;
    if not exists (select 1 from information_schema.columns where table_name = 'tasks' and column_name = 'period_label') then
        alter table "public"."tasks" add column "period_label" text;
    end if;
    -- Add assigned_to if missing (unlikely but possible)
    if not exists (select 1 from information_schema.columns where table_name = 'tasks' and column_name = 'assigned_to') then
        alter table "public"."tasks" add column "assigned_to" uuid references auth.users(id);
    end if;
end $$;

-- Enable RLS
alter table "public"."tasks" enable row level security;

-- Recreate policies (drop first to avoid errors)
drop policy if exists "Users can view tasks of their company" on "public"."tasks";
drop policy if exists "Users can insert tasks for their company" on "public"."tasks";
drop policy if exists "Users can update tasks of their company" on "public"."tasks";
drop policy if exists "Users can delete tasks of their company" on "public"."tasks";

create policy "Users can view tasks of their company"
on "public"."tasks"
for select
to authenticated
using (
  (select company_id from profiles where user_id = auth.uid()) = company_id
);

create policy "Users can insert tasks for their company"
on "public"."tasks"
for insert
to authenticated
with check (
  (select company_id from profiles where user_id = auth.uid()) = company_id
);

create policy "Users can update tasks of their company"
on "public"."tasks"
for update
to authenticated
using (
  (select company_id from profiles where user_id = auth.uid()) = company_id
);

create policy "Users can delete tasks of their company"
on "public"."tasks"
for delete
to authenticated
using (
  (select company_id from profiles where user_id = auth.uid()) = company_id
);

-- Recreate indexes (IF NOT EXISTS is supported in recent Postgres, but creating safely via DO block or just relying on error ignore is common. Postgres 9.5+ supports IF NOT EXISTS)
create index if not exists tasks_company_id_idx on tasks(company_id);
create index if not exists tasks_assigned_to_idx on tasks(assigned_to);
