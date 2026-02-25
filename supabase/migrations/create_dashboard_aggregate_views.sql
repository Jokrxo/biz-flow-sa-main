create or replace view public.dashboard_monthly_income_totals as
select
  t.company_id,
  date_trunc('month', t.transaction_date::timestamptz)::date as month_start,
  sum(t.total_amount)::numeric as total_amount
from public.transactions t
where lower(coalesce(t.transaction_type, '')) in ('income', 'sales', 'asset_disposal', 'invoice')
group by t.company_id, date_trunc('month', t.transaction_date::timestamptz);

create or replace view public.dashboard_monthly_expense_totals as
select
  t.company_id,
  date_trunc('month', t.transaction_date::timestamptz)::date as month_start,
  sum(t.total_amount)::numeric as total_amount
from public.transactions t
where lower(coalesce(t.transaction_type, '')) not in ('income', 'sales', 'asset_disposal', 'invoice')
group by t.company_id, date_trunc('month', t.transaction_date::timestamptz);

create or replace view public.dashboard_expense_totals_by_category as
select
  t.company_id,
  date_trunc('month', t.transaction_date::timestamptz)::date as month_start,
  coalesce(nullif(btrim(t.category), ''), 'Uncategorized') as category,
  sum(t.total_amount)::numeric as total_amount
from public.transactions t
where lower(coalesce(t.transaction_type, '')) not in ('income', 'sales', 'asset_disposal', 'invoice')
group by t.company_id, date_trunc('month', t.transaction_date::timestamptz), coalesce(nullif(btrim(t.category), ''), 'Uncategorized');

create or replace view public.dashboard_recent_transactions as
select
  t.company_id,
  t.id,
  t.reference_number,
  t.description,
  t.total_amount,
  t.transaction_date,
  t.transaction_type,
  t.status
from public.transactions t;

create index if not exists idx_transactions_company_date on public.transactions(company_id, transaction_date desc);
create index if not exists idx_transactions_company_type_date on public.transactions(company_id, transaction_type, transaction_date desc);
create index if not exists idx_transactions_company_category_date on public.transactions(company_id, category, transaction_date desc);

