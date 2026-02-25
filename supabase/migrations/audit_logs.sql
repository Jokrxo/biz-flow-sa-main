-- Create audit_logs table and triggers to record transaction inserts/deletes per company

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid null,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  description text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_company_created on public.audit_logs(company_id, created_at desc);

-- Helper to get actor user id
create or replace function public._audit_actor() returns uuid as $$
begin
  return auth.uid();
end;
$$ language plpgsql stable;

-- Generic audit functions per table (capture INSERT/UPDATE/DELETE)
create or replace function public.audit_transactions() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    coalesce(public._audit_actor(), case when tg_op = 'DELETE' then old.user_id else new.user_id end),
    tg_op,
    'transactions',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(
      case
        when tg_op = 'UPDATE' and (old.status is distinct from new.status) then
          coalesce((case when old.status is null then '' else old.status end) || ' → ' || (case when new.status is null then '' else new.status end), '')
        else (case when tg_op = 'DELETE' then old.description else new.description end)
      end,
      ''
    )
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_chart_of_accounts() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'chart_of_accounts',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce((case when tg_op = 'DELETE' then old.account_code else new.account_code end) || ' - ' || (case when tg_op = 'DELETE' then old.account_name else new.account_name end), '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_loans() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'loans',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(case when tg_op = 'DELETE' then old.reference else new.reference end, '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_loan_payments() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then (select company_id from public.loans where id = (case when tg_op = 'DELETE' then old.loan_id else new.loan_id end)) else (select company_id from public.loans where id = new.loan_id) end,
    public._audit_actor(),
    tg_op,
    'loan_payments',
    case when tg_op = 'DELETE' then old.id else new.id end,
    'Payment ' || coalesce(to_char(case when tg_op = 'DELETE' then old.amount else new.amount end, 'FM999999990.00'), '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_employees() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'employees',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce((case when tg_op = 'DELETE' then old.first_name else new.first_name end) || ' ' || (case when tg_op = 'DELETE' then old.last_name else new.last_name end), '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_pay_runs() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'pay_runs',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(to_char(case when tg_op = 'DELETE' then old.period_start else new.period_start end, 'YYYY-MM-DD') || ' - ' || to_char(case when tg_op = 'DELETE' then old.period_end else new.period_end end, 'YYYY-MM-DD'), '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_pay_run_lines() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    (select company_id from public.pay_runs where id = (case when tg_op = 'DELETE' then old.pay_run_id else new.pay_run_id end)),
    public._audit_actor(),
    tg_op,
    'pay_run_lines',
    case when tg_op = 'DELETE' then old.id else new.id end,
    'Employee ' || coalesce(case when tg_op = 'DELETE' then old.employee_id else new.employee_id end::text, '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_customers() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'customers',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(case when tg_op = 'DELETE' then old.name else new.name end, '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_suppliers() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'suppliers',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(case when tg_op = 'DELETE' then old.name else new.name end, '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_items() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'items',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(case when tg_op = 'DELETE' then old.name else new.name end, (case when tg_op = 'DELETE' then old.description else new.description end), '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_invoices() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'invoices',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(
      case
        when tg_op = 'UPDATE' and (old.status is distinct from new.status) then
          (coalesce(old.invoice_number, '') || ' status ' || coalesce(old.status, '') || ' → ' || coalesce(new.status, ''))
        else coalesce(case when tg_op = 'DELETE' then old.invoice_number else new.invoice_number end, '')
      end,
      ''
    )
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_quotes() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'quotes',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(case when tg_op = 'DELETE' then old.quote_number else new.quote_number end, '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_purchase_orders() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'purchase_orders',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(
      case
        when tg_op = 'UPDATE' and (old.status is distinct from new.status) then
          (coalesce(old.po_number, '') || ' status ' || coalesce(old.status, '') || ' → ' || coalesce(new.status, ''))
        else coalesce(case when tg_op = 'DELETE' then old.po_number else new.po_number end, '')
      end,
      ''
    )
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

-- Journal processing: transaction_entries and ledger_entries
create or replace function public.audit_transaction_entries() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    (select company_id from public.transactions where id = (case when tg_op = 'DELETE' then old.transaction_id else new.transaction_id end)),
    public._audit_actor(),
    tg_op,
    'transaction_entries',
    case when tg_op = 'DELETE' then old.id else new.id end,
    'Entry ' || coalesce(case when tg_op = 'DELETE' then old.description else new.description end, '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_ledger_entries() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'ledger_entries',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(case when tg_op = 'DELETE' then old.description else new.description end, '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_bank_accounts() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'bank_accounts',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(case when tg_op = 'DELETE' then old.account_name else new.account_name end, '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

create or replace function public.audit_fixed_assets() returns trigger as $$
begin
  insert into public.audit_logs(company_id, user_id, action, entity, entity_id, description)
  values (
    case when tg_op = 'DELETE' then old.company_id else new.company_id end,
    public._audit_actor(),
    tg_op,
    'fixed_assets',
    case when tg_op = 'DELETE' then old.id else new.id end,
    coalesce(case when tg_op = 'DELETE' then old.description else new.description end, '')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer;

-- Triggers
drop trigger if exists trg_audit_transactions on public.transactions;
create trigger trg_audit_transactions after insert or update or delete on public.transactions for each row execute function public.audit_transactions();

drop trigger if exists trg_audit_coa on public.chart_of_accounts;
create trigger trg_audit_coa after insert or update or delete on public.chart_of_accounts for each row execute function public.audit_chart_of_accounts();

drop trigger if exists trg_audit_loans on public.loans;
create trigger trg_audit_loans after insert or update or delete on public.loans for each row execute function public.audit_loans();

drop trigger if exists trg_audit_loan_payments on public.loan_payments;
create trigger trg_audit_loan_payments after insert or update or delete on public.loan_payments for each row execute function public.audit_loan_payments();

drop trigger if exists trg_audit_employees on public.employees;
create trigger trg_audit_employees after insert or update or delete on public.employees for each row execute function public.audit_employees();

drop trigger if exists trg_audit_pay_runs on public.pay_runs;
create trigger trg_audit_pay_runs after insert or update or delete on public.pay_runs for each row execute function public.audit_pay_runs();

drop trigger if exists trg_audit_pay_run_lines on public.pay_run_lines;
create trigger trg_audit_pay_run_lines after insert or update or delete on public.pay_run_lines for each row execute function public.audit_pay_run_lines();

drop trigger if exists trg_audit_customers on public.customers;
create trigger trg_audit_customers after insert or update or delete on public.customers for each row execute function public.audit_customers();

drop trigger if exists trg_audit_suppliers on public.suppliers;
create trigger trg_audit_suppliers after insert or update or delete on public.suppliers for each row execute function public.audit_suppliers();

drop trigger if exists trg_audit_items on public.items;
create trigger trg_audit_items after insert or update or delete on public.items for each row execute function public.audit_items();

drop trigger if exists trg_audit_invoices on public.invoices;
create trigger trg_audit_invoices after insert or update or delete on public.invoices for each row execute function public.audit_invoices();

drop trigger if exists trg_audit_quotes on public.quotes;
create trigger trg_audit_quotes after insert or update or delete on public.quotes for each row execute function public.audit_quotes();

drop trigger if exists trg_audit_pos on public.purchase_orders;
create trigger trg_audit_pos after insert or update or delete on public.purchase_orders for each row execute function public.audit_purchase_orders();

drop trigger if exists trg_audit_banks on public.bank_accounts;
create trigger trg_audit_banks after insert or update or delete on public.bank_accounts for each row execute function public.audit_bank_accounts();

drop trigger if exists trg_audit_fixed_assets on public.fixed_assets;
create trigger trg_audit_fixed_assets after insert or update or delete on public.fixed_assets for each row execute function public.audit_fixed_assets();

drop trigger if exists trg_audit_transaction_entries on public.transaction_entries;
create trigger trg_audit_transaction_entries after insert or update or delete on public.transaction_entries for each row execute function public.audit_transaction_entries();

drop trigger if exists trg_audit_ledger_entries on public.ledger_entries;
create trigger trg_audit_ledger_entries after insert or update or delete on public.ledger_entries for each row execute function public.audit_ledger_entries();

-- Row Level Security: company-unique reads
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_company_read on public.audit_logs;
create policy audit_logs_company_read on public.audit_logs
  for select using (exists (
    select 1 from public.profiles p where p.user_id = auth.uid() and p.company_id = public.audit_logs.company_id
  ));
