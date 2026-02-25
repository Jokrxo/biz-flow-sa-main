create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  theme text not null default 'light',
  date_format text not null default 'DD/MM/YYYY',
  fiscal_year_start int not null default 1,
  enable_notifications boolean not null default true,
  enable_auto_backup boolean not null default false,
  language text not null default 'en',
  updated_at timestamptz default now(),
  unique(company_id)
);

alter table public.app_settings enable row level security;

create policy app_settings_select on public.app_settings
for select using (company_id = public.get_user_company(auth.uid()));

create policy app_settings_insert on public.app_settings
for insert with check (company_id = public.get_user_company(auth.uid()));

create policy app_settings_update on public.app_settings
for update using (company_id = public.get_user_company(auth.uid()))
with check (company_id = public.get_user_company(auth.uid()));