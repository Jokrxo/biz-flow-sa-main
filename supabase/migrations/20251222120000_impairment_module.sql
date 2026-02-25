begin;

-- 1. Settings Table
create table if not exists public.impairment_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  ecl_rate_0_30 numeric not null default 0.01,
  ecl_rate_31_60 numeric not null default 0.05,
  ecl_rate_61_90 numeric not null default 0.20,
  ecl_rate_90_plus numeric not null default 0.50,
  discount_rate numeric not null default 0.10,
  sicr_threshold_days integer not null default 30,
  pd_stage1 numeric not null default 0.02,
  pd_stage2 numeric not null default 0.15,
  pd_stage3 numeric not null default 0.90,
  lgd_percent numeric not null default 0.50,
  macro_overlay numeric not null default 0.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uniq_impairment_settings_company unique (company_id)
);

-- Ensure the unique constraint exists if table was already created without it
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'uniq_impairment_settings_company') then
    alter table public.impairment_settings add constraint uniq_impairment_settings_company unique (company_id);
  end if;
end $$;

-- Add missing columns if they don't exist (idempotent)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'ecl_rate_0_30') then
    alter table public.impairment_settings add column ecl_rate_0_30 numeric not null default 0.01;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'ecl_rate_31_60') then
    alter table public.impairment_settings add column ecl_rate_31_60 numeric not null default 0.05;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'ecl_rate_61_90') then
    alter table public.impairment_settings add column ecl_rate_61_90 numeric not null default 0.20;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'ecl_rate_90_plus') then
    alter table public.impairment_settings add column ecl_rate_90_plus numeric not null default 0.50;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'discount_rate') then
    alter table public.impairment_settings add column discount_rate numeric not null default 0.10;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'sicr_threshold_days') then
    alter table public.impairment_settings add column sicr_threshold_days integer not null default 30;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'pd_stage1') then
    alter table public.impairment_settings add column pd_stage1 numeric not null default 0.02;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'pd_stage2') then
    alter table public.impairment_settings add column pd_stage2 numeric not null default 0.15;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'pd_stage3') then
    alter table public.impairment_settings add column pd_stage3 numeric not null default 0.90;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'lgd_percent') then
    alter table public.impairment_settings add column lgd_percent numeric not null default 0.50;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'impairment_settings' and column_name = 'macro_overlay') then
    alter table public.impairment_settings add column macro_overlay numeric not null default 0.00;
  end if;
end $$;

create index if not exists idx_impairment_settings_company on public.impairment_settings(company_id);

-- Trigger for updated_at
create or replace function public.update_impairment_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_update_impairment_settings_updated_at on public.impairment_settings;
create trigger trg_update_impairment_settings_updated_at
  before update on public.impairment_settings
  for each row execute function public.update_impairment_settings_updated_at();

-- 2. Calculations Table
create table if not exists public.impairment_calculations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  calc_type text not null check (calc_type in ('receivables','assets','inventory')),
  period_end_date date not null,
  params jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null default 'preview' check (status in ('preview','posted')),
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_impairment_calculations_company_type_period
  on public.impairment_calculations(company_id, calc_type, period_end_date desc);

-- Unique index to prevent duplicate postings
create unique index if not exists uniq_impairment_calculations_company_type_period_posted
on public.impairment_calculations(company_id, calc_type, period_end_date)
where status = 'posted';

-- 3. Postings Link Table
create table if not exists public.impairment_postings (
  id uuid primary key default gen_random_uuid(),
  calculation_id uuid not null references public.impairment_calculations(id) on delete cascade,
  company_id uuid not null,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  posted_by uuid null,
  posted_at timestamptz not null default now(),
  unique (company_id, calculation_id, transaction_id)
);

-- 4. Period Locks Table
create table if not exists public.impairment_locks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  module text not null check (module in ('receivables','assets','inventory')),
  period_end_date date not null,
  locked boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, module, period_end_date)
);

-- RLS Policies
alter table public.impairment_settings enable row level security;
alter table public.impairment_calculations enable row level security;
alter table public.impairment_postings enable row level security;
alter table public.impairment_locks enable row level security;

-- Drop policies if they exist before creating them to avoid "policy already exists" errors
drop policy if exists impairment_settings_all on public.impairment_settings;
create policy impairment_settings_all on public.impairment_settings
  for all using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = impairment_settings.company_id));

drop policy if exists impairment_settings_select on public.impairment_settings;
create policy impairment_settings_select on public.impairment_settings
  for select using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = impairment_settings.company_id));

drop policy if exists impairment_calculations_all on public.impairment_calculations;
create policy impairment_calculations_all on public.impairment_calculations
  for all using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = impairment_calculations.company_id));

drop policy if exists impairment_calculations_select on public.impairment_calculations;
create policy impairment_calculations_select on public.impairment_calculations
  for select using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = impairment_calculations.company_id));

drop policy if exists impairment_postings_all on public.impairment_postings;
create policy impairment_postings_all on public.impairment_postings
  for all using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = impairment_postings.company_id));

drop policy if exists impairment_postings_select on public.impairment_postings;
create policy impairment_postings_select on public.impairment_postings
  for select using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = impairment_postings.company_id));

drop policy if exists impairment_locks_all on public.impairment_locks;
create policy impairment_locks_all on public.impairment_locks
  for all using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = impairment_locks.company_id));

drop policy if exists impairment_locks_select on public.impairment_locks;
create policy impairment_locks_select on public.impairment_locks
  for select using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = impairment_locks.company_id));

-- 5. Helper Functions
create or replace function public.impairment_get_company() returns uuid as $$
declare v_company uuid;
begin
  select company_id into v_company from public.profiles where user_id = auth.uid();
  if v_company is null then raise exception 'No company for user'; end if;
  return v_company;
end;
$$ language plpgsql security definer;

create or replace function public.ensure_account(_company_id uuid, _type text, _name text, _code text, _normal_balance text default null) returns uuid as $$
declare v_id uuid;
begin
  select id into v_id from public.chart_of_accounts
  where company_id = _company_id and lower(account_type) = lower(_type) and (lower(account_name) like lower('%' || _name || '%') or account_code = _code) limit 1;
  if v_id is null then
    insert into public.chart_of_accounts(company_id, account_code, account_name, account_type, is_active, normal_balance)
    values (_company_id, _code, _name, _type, true, coalesce(_normal_balance, case when lower(_type) in ('revenue','liability','equity') then 'credit' else 'debit' end))
    returning id into v_id;
  end if;
  return v_id;
end;
$$ language plpgsql security definer;

-- 6. Settings Functions
create or replace function public.impairment_get_settings(_period_end date default null) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare v_row public.impairment_settings;
begin
  select * into v_row from public.impairment_settings where company_id = v_company;
  if v_row.id is null then
    insert into public.impairment_settings(company_id) values (v_company) returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$ language plpgsql security definer;

create or replace function public.impairment_update_settings(_settings jsonb) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare v_row public.impairment_settings;
begin
  insert into public.impairment_settings(
    company_id, ecl_rate_0_30, ecl_rate_31_60, ecl_rate_61_90, ecl_rate_90_plus,
    discount_rate, sicr_threshold_days, pd_stage1, pd_stage2, pd_stage3, lgd_percent, macro_overlay
  ) values (
    v_company,
    coalesce((_settings->>'ecl_rate_0_30')::numeric, 0.01),
    coalesce((_settings->>'ecl_rate_31_60')::numeric, 0.05),
    coalesce((_settings->>'ecl_rate_61_90')::numeric, 0.20),
    coalesce((_settings->>'ecl_rate_90_plus')::numeric, 0.50),
    coalesce((_settings->>'discount_rate')::numeric, 0.10),
    coalesce((_settings->>'sicr_threshold_days')::int, 30),
    coalesce((_settings->>'pd_stage1')::numeric, 0.02),
    coalesce((_settings->>'pd_stage2')::numeric, 0.15),
    coalesce((_settings->>'pd_stage3')::numeric, 0.90),
    coalesce((_settings->>'lgd_percent')::numeric, 0.50),
    coalesce((_settings->>'macro_overlay')::numeric, 0.00)
  )
  on conflict (company_id) do update set
    ecl_rate_0_30 = excluded.ecl_rate_0_30,
    ecl_rate_31_60 = excluded.ecl_rate_31_60,
    ecl_rate_61_90 = excluded.ecl_rate_61_90,
    ecl_rate_90_plus = excluded.ecl_rate_90_plus,
    discount_rate = excluded.discount_rate,
    sicr_threshold_days = excluded.sicr_threshold_days,
    pd_stage1 = excluded.pd_stage1,
    pd_stage2 = excluded.pd_stage2,
    pd_stage3 = excluded.pd_stage3,
    lgd_percent = excluded.lgd_percent,
    macro_overlay = excluded.macro_overlay
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$ language plpgsql security definer;

-- 7. Lock Functions
create or replace function public.impairment_get_lock(_module text, _period_end date) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare v_locked boolean := false;
begin
  select locked into v_locked from public.impairment_locks where company_id = v_company and module = _module and period_end_date = _period_end;
  return jsonb_build_object('locked', coalesce(v_locked, false));
end;
$$ language plpgsql security definer;

create or replace function public.impairment_set_lock(_module text, _period_end date, _locked boolean) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare v_row public.impairment_locks;
begin
  insert into public.impairment_locks(company_id, module, period_end_date, locked)
  values (v_company, _module, _period_end, _locked)
  on conflict (company_id, module, period_end_date) do update set locked = excluded.locked
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$ language plpgsql security definer;

-- 8. Receivables Functions
create or replace function public.impairment_preview_receivables(_period_end date) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare set_row record;
declare inv_row record;
declare total_outstanding numeric := 0;
declare total_expected_loss numeric := 0;
declare items jsonb := '[]'::jsonb;
declare outstanding numeric;
declare days_overdue integer;
declare bucket text;
declare rate numeric;
declare stage text;
declare pd numeric;
declare lgd numeric;
declare overlay numeric;
declare expected_loss numeric;
begin
  select * into set_row from public.impairment_settings where company_id = v_company;
  if set_row.company_id is null then
    perform public.impairment_update_settings('{}'::jsonb);
    select * into set_row from public.impairment_settings where company_id = v_company;
  end if;

  for inv_row in
    select i.id, i.invoice_number, i.total_amount, coalesce(i.amount_paid,0) as amount_paid, i.due_date, i.status
    from public.invoices i
    where i.company_id = v_company
  loop
    outstanding := greatest(0, coalesce(inv_row.total_amount,0) - coalesce(inv_row.amount_paid,0));
    days_overdue := case when inv_row.due_date is null then 0 else greatest(0, (_period_end - inv_row.due_date)) end;
    bucket := case when days_overdue <= 30 then '0-30' when days_overdue <= 60 then '31-60' when days_overdue <= 90 then '61-90' else '90+' end;
    
    rate := case when bucket = '0-30' then coalesce(set_row.ecl_rate_0_30, 0.01)
                 when bucket = '31-60' then coalesce(set_row.ecl_rate_31_60, 0.05)
                 when bucket = '61-90' then coalesce(set_row.ecl_rate_61_90, 0.20)
                 else coalesce(set_row.ecl_rate_90_plus, 0.50) end;
                 
    stage := case when days_overdue >= 90 or lower(coalesce(inv_row.status,'')) = 'overdue' then 'stage3'
                  when days_overdue > coalesce(set_row.sicr_threshold_days, 30) then 'stage2'
                  else 'stage1' end;
                  
    pd := case when stage = 'stage1' then coalesce(set_row.pd_stage1, 0.02)
               when stage = 'stage2' then coalesce(set_row.pd_stage2, 0.15)
               else coalesce(set_row.pd_stage3, 0.90) end;
               
    lgd := coalesce(set_row.lgd_percent, 0.50);
    overlay := coalesce(set_row.macro_overlay, 0.00);
    
    expected_loss := round(outstanding * rate * (1 + overlay), 2);
    
    total_outstanding := total_outstanding + outstanding;
    total_expected_loss := total_expected_loss + expected_loss;
    
    items := items || jsonb_build_array(jsonb_build_object(
      'id', inv_row.id,
      'invoice_number', inv_row.invoice_number,
      'outstanding', outstanding,
      'days_overdue', days_overdue,
      'bucket', bucket,
      'rate', rate,
      'stage', stage,
      'pd', pd,
      'lgd', lgd,
      'expected_loss', expected_loss
    ));
  end loop;
  
  return jsonb_build_object('summary', jsonb_build_object('total_outstanding', total_outstanding, 'total_expected_loss', total_expected_loss), 'items', items);
end;
$$ language plpgsql security definer;

create or replace function public.impairment_post_receivables(_period_end date) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare v_user uuid := auth.uid();
declare v_locked boolean := false;
declare preview jsonb;
declare total numeric := 0;
declare allowance_id uuid;
declare expense_id uuid;
declare tx_id uuid;
declare calc_id uuid;
begin
  select locked into v_locked from public.impairment_locks where company_id = v_company and module = 'receivables' and period_end_date = _period_end;
  if coalesce(v_locked,false) then raise exception 'Period locked'; end if;
  preview := public.impairment_preview_receivables(_period_end);
  total := coalesce((preview->'summary'->>'total_expected_loss')::numeric, 0);
  allowance_id := public.ensure_account(v_company, 'asset', 'Allowance for Doubtful Accounts', '1360', 'credit');
  expense_id := public.ensure_account(v_company, 'expense', 'Bad Debt Expense', '6100', 'debit');
  insert into public.transactions(company_id, user_id, transaction_date, description, reference_number, total_amount, transaction_type, status)
  values (v_company, v_user, _period_end, 'Receivables Impairment', 'IMPR-AR-' || to_char(_period_end, 'YYYYMM'), total, 'journal', 'pending')
  returning id into tx_id;
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values (tx_id, expense_id, total, 0, 'Receivables impairment', 'approved'),
         (tx_id, allowance_id, 0, total, 'Receivables impairment', 'approved');
  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  values (v_company, expense_id, total, 0, _period_end, false, tx_id, 'Receivables impairment'),
         (v_company, allowance_id, 0, total, _period_end, false, tx_id, 'Receivables impairment');
  update public.transactions set status = 'posted' where id = tx_id;
  insert into public.impairment_calculations(company_id, calc_type, period_end_date, params, result, status, created_by)
  values (v_company, 'receivables', _period_end, '{}'::jsonb, preview, 'posted', v_user)
  returning id into calc_id;
  insert into public.impairment_postings(calculation_id, company_id, transaction_id, posted_by)
  values (calc_id, v_company, tx_id, v_user);
  return jsonb_build_object('total', total, 'transaction_id', tx_id, 'calculation_id', calc_id);
end;
$$ language plpgsql security definer;

-- 9. Assets Functions
create or replace function public.impairment_preview_assets(_period_end date, _params jsonb default '{}'::jsonb) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare total_impairment numeric := 0;
declare items jsonb := '[]'::jsonb;
declare fa_row record;
declare asset_id uuid;
declare carrying numeric;
declare recoverable numeric;
declare loss numeric;
begin
  for fa_row in
    select fa.id, fa.description, fa.cost, coalesce(fa.accumulated_depreciation,0) as accumulated_depreciation
    from public.fixed_assets fa
    where fa.company_id = v_company
  loop
    asset_id := fa_row.id;
    carrying := greatest(0, coalesce(fa_row.cost,0) - coalesce(fa_row.accumulated_depreciation,0));
    recoverable := coalesce((_params->'recoverables'->>asset_id::text)::numeric, carrying);
    loss := greatest(0, carrying - recoverable);
    total_impairment := total_impairment + loss;
    items := items || jsonb_build_array(jsonb_build_object(
      'asset_id', asset_id, 'description', fa_row.description,
      'carrying_amount', carrying, 'recoverable_amount', recoverable, 'impairment_loss', loss
    ));
  end loop;
  return jsonb_build_object('summary', jsonb_build_object('total_impairment', total_impairment, 'count', jsonb_array_length(items)), 'items', items);
end;
$$ language plpgsql security definer;

create or replace function public.impairment_post_assets(_period_end date, _params jsonb default '{}'::jsonb) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare v_user uuid := auth.uid();
declare v_locked boolean := false;
declare preview jsonb;
declare total numeric := 0;
declare contra_id uuid;
declare expense_id uuid;
declare tx_id uuid;
declare calc_id uuid;
begin
  select locked into v_locked from public.impairment_locks where company_id = v_company and module = 'assets' and period_end_date = _period_end;
  if coalesce(v_locked,false) then raise exception 'Period locked'; end if;
  preview := public.impairment_preview_assets(_period_end, _params);
  total := coalesce((preview->'summary'->>'total_impairment')::numeric, 0);
  contra_id := public.ensure_account(v_company, 'asset', 'Accumulated Impairment - PPE', '1590', 'credit');
  expense_id := public.ensure_account(v_company, 'expense', 'Impairment Loss - PPE', '6110', 'debit');
  insert into public.transactions(company_id, user_id, transaction_date, description, reference_number, total_amount, transaction_type, status)
  values (v_company, v_user, _period_end, 'Asset Impairment', 'IMPR-PPE-' || to_char(_period_end, 'YYYYMM'), total, 'journal', 'pending')
  returning id into tx_id;
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values (tx_id, expense_id, total, 0, 'Asset impairment', 'approved'),
         (tx_id, contra_id, 0, total, 'Asset impairment', 'approved');
  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  values (v_company, expense_id, total, 0, _period_end, false, tx_id, 'Asset impairment'),
         (v_company, contra_id, 0, total, _period_end, false, tx_id, 'Asset impairment');
  update public.transactions set status = 'posted' where id = tx_id;
  insert into public.impairment_calculations(company_id, calc_type, period_end_date, params, result, status, created_by)
  values (v_company, 'assets', _period_end, coalesce(_params,'{}'::jsonb), preview, 'posted', v_user)
  returning id into calc_id;
  insert into public.impairment_postings(calculation_id, company_id, transaction_id, posted_by)
  values (calc_id, v_company, tx_id, v_user);
  return jsonb_build_object('total', total, 'transaction_id', tx_id, 'calculation_id', calc_id);
end;
$$ language plpgsql security definer;

-- 10. Inventory Functions
drop function if exists public.impairment_preview_inventory;
create or replace function public.impairment_preview_inventory(_period_end date, _params jsonb default '{}'::jsonb) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare total_write_down numeric := 0;
declare items jsonb := '[]'::jsonb;
declare pi_row record;
declare item_id uuid;
declare carrying numeric;
declare qty numeric;
declare nrv numeric;
declare nrv_total numeric;
declare write_down numeric;
begin
  for pi_row in
    select i.id as item_id, i.name, i.quantity_on_hand as qty, (coalesce(i.cost_price,0) * coalesce(i.quantity_on_hand,0)) as carrying_amount
    from public.items i
    where i.company_id = v_company and i.item_type = 'product'
  loop
    item_id := pi_row.item_id;
    carrying := coalesce(pi_row.carrying_amount,0);
    qty := coalesce(pi_row.qty,0);
    -- Default NRV to unit cost (which implies carrying amount) if not provided, effectively 0 write down
    if qty > 0 then
       -- Use a nested block for local variables to avoid syntax error
       declare 
         unit_cost numeric;
         unit_nrv numeric;
       begin
         unit_cost := carrying / qty;
         unit_nrv := coalesce((_params->'nrv'->>item_id::text)::numeric, unit_cost);
         nrv_total := unit_nrv * qty;
         write_down := greatest(0, carrying - nrv_total);
       end;
    else
       nrv_total := 0;
       write_down := 0;
    end if;

    total_write_down := total_write_down + write_down;
    items := items || jsonb_build_array(jsonb_build_object(
      'item_id', item_id, 'name', pi_row.name, 'qty', qty,
      'carrying_amount', carrying, 'nrv_total', nrv_total, 'write_down', write_down
    ));
  end loop;
  return jsonb_build_object('summary', jsonb_build_object('total_write_down', total_write_down, 'count', jsonb_array_length(items)), 'items', items);
end;
$$ language plpgsql security definer;

create or replace function public.impairment_post_inventory(_period_end date, _params jsonb default '{}'::jsonb) returns jsonb as $$
declare v_company uuid := public.impairment_get_company();
declare v_user uuid := auth.uid();
declare v_locked boolean := false;
declare preview jsonb;
declare total numeric := 0;
declare allowance_id uuid;
declare expense_id uuid;
declare tx_id uuid;
declare calc_id uuid;
begin
  select locked into v_locked from public.impairment_locks where company_id = v_company and module = 'inventory' and period_end_date = _period_end;
  if coalesce(v_locked,false) then raise exception 'Period locked'; end if;
  preview := public.impairment_preview_inventory(_period_end, _params);
  total := coalesce((preview->'summary'->>'total_write_down')::numeric, 0);
  allowance_id := public.ensure_account(v_company, 'asset', 'Inventory Allowance', '1520', 'credit');
  expense_id := public.ensure_account(v_company, 'expense', 'Inventory Write-down Expense', '6120', 'debit');
  insert into public.transactions(company_id, user_id, transaction_date, description, reference_number, total_amount, transaction_type, status)
  values (v_company, v_user, _period_end, 'Inventory Write-down', 'IMPR-INV-' || to_char(_period_end, 'YYYYMM'), total, 'journal', 'pending')
  returning id into tx_id;
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values (tx_id, expense_id, total, 0, 'Inventory write-down', 'approved'),
         (tx_id, allowance_id, 0, total, 'Inventory write-down', 'approved');
  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  values (v_company, expense_id, total, 0, _period_end, false, tx_id, 'Inventory write-down'),
         (v_company, allowance_id, 0, total, _period_end, false, tx_id, 'Inventory write-down');
  update public.transactions set status = 'posted' where id = tx_id;
  insert into public.impairment_calculations(company_id, calc_type, period_end_date, params, result, status, created_by)
  values (v_company, 'inventory', _period_end, coalesce(_params,'{}'::jsonb), preview, 'posted', v_user)
  returning id into calc_id;
  insert into public.impairment_postings(calculation_id, company_id, transaction_id, posted_by)
  values (calc_id, v_company, tx_id, v_user);
  return jsonb_build_object('total', total, 'transaction_id', tx_id, 'calculation_id', calc_id);
end;
$$ language plpgsql security definer;

commit;
