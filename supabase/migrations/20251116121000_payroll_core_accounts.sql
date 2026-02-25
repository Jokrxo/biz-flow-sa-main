-- Seed payroll accounts per company
create or replace function public.ensure_payroll_accounts(_company_id uuid)
returns void language plpgsql as $$
begin
  -- Expenses
  perform 1 from public.chart_of_accounts where company_id = _company_id and account_code = '5000';
  if not found then
    insert into public.chart_of_accounts(company_id, account_code, account_name, account_type, is_protected)
    values (_company_id, '5000', 'Salaries & Wages', 'expense', true);
  end if;

  perform 1 from public.chart_of_accounts where company_id = _company_id and account_code = '5100';
  if not found then
    insert into public.chart_of_accounts(company_id, account_code, account_name, account_type, is_protected)
    values (_company_id, '5100', 'UIF Employer Expense', 'expense', true);
  end if;

  perform 1 from public.chart_of_accounts where company_id = _company_id and account_code = '5110';
  if not found then
    insert into public.chart_of_accounts(company_id, account_code, account_name, account_type, is_protected)
    values (_company_id, '5110', 'SDL Expense', 'expense', true);
  end if;

  -- Liabilities
  perform 1 from public.chart_of_accounts where company_id = _company_id and account_code = '2105';
  if not found then
    insert into public.chart_of_accounts(company_id, account_code, account_name, account_type, is_protected)
    values (_company_id, '2105', 'Wages Payable', 'liability', true);
  end if;

  perform 1 from public.chart_of_accounts where company_id = _company_id and account_code = '2300';
  if not found then
    insert into public.chart_of_accounts(company_id, account_code, account_name, account_type, is_protected)
    values (_company_id, '2300', 'PAYE Payable', 'liability', true);
  end if;

  perform 1 from public.chart_of_accounts where company_id = _company_id and account_code = '2310';
  if not found then
    insert into public.chart_of_accounts(company_id, account_code, account_name, account_type, is_protected)
    values (_company_id, '2310', 'UIF Payable', 'liability', true);
  end if;

  perform 1 from public.chart_of_accounts where company_id = _company_id and account_code = '2320';
  if not found then
    insert into public.chart_of_accounts(company_id, account_code, account_name, account_type, is_protected)
    values (_company_id, '2320', 'SDL Payable', 'liability', true);
  end if;
end;$$;