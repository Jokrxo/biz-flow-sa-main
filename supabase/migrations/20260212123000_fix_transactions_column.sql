-- Fix 'reference' column usage in transactions table (should be 'reference_number')

-- Drop functions using wrong column
DROP FUNCTION IF EXISTS public.post_pay_run_finalize(uuid);
DROP FUNCTION IF EXISTS public.post_pay_run_pay(uuid, numeric);
DROP FUNCTION IF EXISTS public.post_statutory_remit(uuid, text, numeric, text);
DROP FUNCTION IF EXISTS public.post_pay_run_pay_v2(uuid, numeric, uuid);

-- Recreate functions with correct column 'reference_number'

CREATE OR REPLACE FUNCTION public.post_pay_run_finalize(_pay_run_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_company uuid;
  v_tx_id uuid;
  bank_id uuid;
  wages_payable_id uuid;
  paye_id uuid;
  uif_id uuid;
  sdl_id uuid;
  wages_exp_id uuid;
  uif_exp_id uuid;
  sdl_exp_id uuid;
  v_total_gross numeric;
  v_total_net numeric;
  v_total_paye numeric;
  v_total_uif_emp numeric;
  v_total_uif_er numeric;
  v_total_sdl_er numeric;
BEGIN
  select company_id into v_company from public.pay_runs where id = _pay_run_id;
  if v_company is null then raise exception 'pay_run not found'; end if;

  select id into wages_payable_id from public.chart_of_accounts where company_id = v_company and account_code = '2105' and account_type = 'liability' limit 1;
  select id into paye_id           from public.chart_of_accounts where company_id = v_company and account_code = '2300' and account_type = 'liability' limit 1;
  select id into uif_id            from public.chart_of_accounts where company_id = v_company and account_code = '2310' and account_type = 'liability' limit 1;
  select id into sdl_id            from public.chart_of_accounts where company_id = v_company and account_code = '2320' and account_type = 'liability' limit 1;
  select id into wages_exp_id      from public.chart_of_accounts where company_id = v_company and account_code = '5000' and account_type = 'expense' limit 1;
  select id into uif_exp_id        from public.chart_of_accounts where company_id = v_company and account_code = '5100' and account_type = 'expense' limit 1;
  select id into sdl_exp_id        from public.chart_of_accounts where company_id = v_company and account_code = '5110' and account_type = 'expense' limit 1;

  select coalesce(sum(gross),0), coalesce(sum(net),0), coalesce(sum(paye),0), coalesce(sum(uif_emp),0), coalesce(sum(uif_er),0), coalesce(sum(sdl_er),0)
  into v_total_gross, v_total_net, v_total_paye, v_total_uif_emp, v_total_uif_er, v_total_sdl_er
  from public.pay_run_lines where pay_run_id = _pay_run_id;

  insert into public.transactions(company_id, user_id, reference_number, description, transaction_date, status)
  values (v_company, auth.uid(), _pay_run_id::text, 'Payroll Finalization', now()::date, 'pending')
  returning id into v_tx_id;

  -- Salaries expense and liabilities (net + deductions)
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values
    (v_tx_id, wages_exp_id, v_total_gross, 0, 'Payroll gross', 'approved'),
    (v_tx_id, wages_payable_id, 0, v_total_net, 'Net wages payable', 'approved'),
    (v_tx_id, paye_id, 0, v_total_paye, 'PAYE payable', 'approved'),
    (v_tx_id, uif_id, 0, v_total_uif_emp, 'UIF payable (employee)', 'approved');

  -- Employer contributions
  if v_total_uif_er > 0 then
    insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
    values (v_tx_id, uif_exp_id, v_total_uif_er, 0, 'UIF employer expense', 'approved'),
           (v_tx_id, uif_id, 0, v_total_uif_er, 'UIF payable (employer)', 'approved');
  end if;

  if v_total_sdl_er > 0 then
    insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
    values (v_tx_id, sdl_exp_id, v_total_sdl_er, 0, 'SDL expense', 'approved'),
           (v_tx_id, sdl_id, 0, v_total_sdl_er, 'SDL payable', 'approved');
  end if;

  -- Ensure account IDs are not null before creating entries
  if wages_payable_id is null or paye_id is null or uif_id is null or wages_exp_id is null then
    raise exception 'One or more required accounts (Wages Payable, PAYE, UIF, Wages Expense) not found';
  end if;

  -- Mirror to ledger
  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  select v_company, account_id, debit, credit, now()::date, false, v_tx_id, description from public.transaction_entries where transaction_id = v_tx_id;

  -- Now update to posted to trigger ledger posting
  update public.transactions set status = 'posted' where id = v_tx_id;

  update public.pay_runs set status = 'finalized' where id = _pay_run_id;
END;$$;

CREATE OR REPLACE FUNCTION public.post_pay_run_pay(_pay_run_id uuid, _amount numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_company uuid; v_tx_id uuid; bank_id uuid; wages_payable_id uuid; BEGIN
  select company_id into v_company from public.pay_runs where id = _pay_run_id;
  select id into bank_id from public.chart_of_accounts where company_id = v_company and account_code = '1100' and account_type = 'asset' limit 1;
  select id into wages_payable_id from public.chart_of_accounts where company_id = v_company and account_code = '2105' and account_type = 'liability' limit 1;
  
  if bank_id is null then raise exception 'Bank account (1100) not found'; end if;
  if wages_payable_id is null then raise exception 'Wages Payable account (2105) not found'; end if;

  insert into public.transactions(company_id, user_id, reference_number, description, transaction_date, status)
  values (v_company, auth.uid(), _pay_run_id::text, 'Payroll Payment', now()::date, 'pending') returning id into v_tx_id;
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values (v_tx_id, wages_payable_id, _amount, 0, 'Pay net wages', 'approved'), (v_tx_id, bank_id, 0, _amount, 'Pay net wages', 'approved');
  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  select v_company, account_id, debit, credit, now()::date, false, v_tx_id, description from public.transaction_entries where transaction_id = v_tx_id;
  update public.transactions set status = 'posted' where id = v_tx_id;
  update public.pay_runs set status = 'paid' where id = _pay_run_id;
END;$$;

CREATE OR REPLACE FUNCTION public.post_statutory_remit(_company_id uuid, _type text, _amount numeric, _reference text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_tx_id uuid; bank_id uuid; acct_id uuid; v_desc text; BEGIN
  select id into bank_id from public.chart_of_accounts where company_id = _company_id and account_code = '1100' and account_type = 'asset' limit 1;
  if _type = 'paye' then
    select id into acct_id from public.chart_of_accounts where company_id = _company_id and account_code = '2300' and account_type = 'liability' limit 1;
    v_desc := 'PAYE remittance';
  elsif _type = 'uif' then
    select id into acct_id from public.chart_of_accounts where company_id = _company_id and account_code = '2310' and account_type = 'liability' limit 1;
    v_desc := 'UIF remittance';
  elsif _type = 'sdl' then
    select id into acct_id from public.chart_of_accounts where company_id = _company_id and account_code = '2320' and account_type = 'liability' limit 1;
    v_desc := 'SDL remittance';
  else
    raise exception 'unknown statutory type';
  end if;
  
  if bank_id is null then raise exception 'Bank account (1100) not found'; end if;
  if acct_id is null then raise exception 'Liability account for % not found', _type; end if;

  insert into public.transactions(company_id, user_id, reference_number, description, transaction_date, status)
  values (_company_id, auth.uid(), coalesce(_reference, 'STAT'), v_desc, now()::date, 'pending') returning id into v_tx_id;
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values (v_tx_id, acct_id, _amount, 0, v_desc, 'approved'), (v_tx_id, bank_id, 0, _amount, v_desc, 'approved');
  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  select _company_id, account_id, debit, credit, now()::date, false, v_tx_id, description from public.transaction_entries where transaction_id = v_tx_id;
  update public.transactions set status = 'posted' where id = v_tx_id;
END;$$;

CREATE OR REPLACE FUNCTION public.post_pay_run_pay_v2(_pay_run_id uuid, _amount numeric, _bank_account_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE 
  v_company uuid; 
  v_tx_id uuid; 
  wages_payable_id uuid; 
BEGIN
  select company_id into v_company from public.pay_runs where id = _pay_run_id;
  
  -- Find Wages Payable Account (Liability)
  select id into wages_payable_id from public.chart_of_accounts 
  where company_id = v_company and account_code = '2105' and account_type = 'liability' limit 1;
  
  if wages_payable_id is null then
    raise exception 'Wages Payable account (2105) not found';
  end if;

  -- Create Transaction
  insert into public.transactions(company_id, user_id, reference_number, description, transaction_date, status)
  values (v_company, auth.uid(), _pay_run_id::text, 'Payroll Payment', now()::date, 'pending') 
  returning id into v_tx_id;

  -- Create Entries
  -- Debit Wages Payable (Decrease Liability)
  -- Credit Bank (Decrease Asset)
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values 
    (v_tx_id, wages_payable_id, _amount, 0, 'Pay net wages', 'approved'), 
    (v_tx_id, _bank_account_id, 0, _amount, 'Pay net wages', 'approved');

  -- Create Ledger Entries
  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  select v_company, account_id, debit, credit, now()::date, false, v_tx_id, description 
  from public.transaction_entries where transaction_id = v_tx_id;

  update public.transactions set status = 'posted' where id = v_tx_id;

  -- Update Run Status
  update public.pay_runs set status = 'paid' where id = _pay_run_id;
END;$$;
