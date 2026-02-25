-- Ensure tasks table columns exist
alter table "public"."tasks" add column if not exists "company_id" uuid;
alter table "public"."tasks" add column if not exists "title" text;
alter table "public"."tasks" add column if not exists "description" text;
alter table "public"."tasks" add column if not exists "type" text;
alter table "public"."tasks" add column if not exists "module" text;
alter table "public"."tasks" add column if not exists "assigned_to" uuid references auth.users(id);
alter table "public"."tasks" add column if not exists "due_date" date;
alter table "public"."tasks" add column if not exists "status" text default 'todo';
alter table "public"."tasks" add column if not exists "period_label" text;
alter table "public"."tasks" add column if not exists "financial_year_label" text;
alter table "public"."tasks" add column if not exists "link" text;
alter table "public"."tasks" add column if not exists "link_label" text;
alter table "public"."tasks" add column if not exists "created_at" timestamp with time zone default now();
alter table "public"."tasks" add column if not exists "updated_at" timestamp with time zone default now();

-- Ensure constraints (optional, but good to be sure)
-- We can't easily add constraints if data exists that violates them, but for new table it's fine.
-- Skipping strict constraints update to avoid errors on existing data.

-- Enable RLS
alter table "public"."tasks" enable row level security;

-- Drop existing policies to ensure clean slate
drop policy if exists "Users can view tasks of their company" on "public"."tasks";
drop policy if exists "Users can insert tasks for their company" on "public"."tasks";
drop policy if exists "Users can update tasks of their company" on "public"."tasks";
drop policy if exists "Users can delete tasks of their company" on "public"."tasks";

-- Recreate policies with robust subquery
create policy "Users can view tasks of their company"
on "public"."tasks"
for select
to authenticated
using (
  company_id in (select company_id from profiles where user_id = auth.uid())
);

create policy "Users can insert tasks for their company"
on "public"."tasks"
for insert
to authenticated
with check (
  company_id in (select company_id from profiles where user_id = auth.uid())
);

create policy "Users can update tasks of their company"
on "public"."tasks"
for update
to authenticated
using (
  company_id in (select company_id from profiles where user_id = auth.uid())
);

create policy "Users can delete tasks of their company"
on "public"."tasks"
for delete
to authenticated
using (
  company_id in (select company_id from profiles where user_id = auth.uid())
);

-- Grant permissions (often needed if table was created by postgres user)
grant all on table "public"."tasks" to authenticated;
grant all on table "public"."tasks" to service_role;
