begin;
alter table public.tasks enable row level security;
alter table public.tasks force row level security;
create policy tasks_select_company on public.tasks for select using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = tasks.company_id));
create policy tasks_insert_company on public.tasks for insert with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = tasks.company_id));
create policy tasks_update_company on public.tasks for update using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = tasks.company_id));
create policy tasks_delete_company on public.tasks for delete using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = tasks.company_id));
create index if not exists idx_tasks_company_id on public.tasks(company_id);
with dups as (
  select id from (
    select id,
           row_number() over (
             partition by company_id, title, due_date, type, module
             order by id
           ) as rn
    from public.tasks
  ) t
  where t.rn > 1
)
delete from public.tasks where id in (select id from dups);
create unique index if not exists uniq_tasks_company_key on public.tasks(company_id, title, due_date, type, module);
commit;
