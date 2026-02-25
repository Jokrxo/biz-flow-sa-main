-- Migration to fix payroll posting by ensuring all required accounts exist
-- And to update the posting functions to auto-create accounts if missing

-- 1. Function to ensure an account exists
CREATE OR REPLACE FUNCTION public.ensure_account_exists(
  _company_id UUID, 
  _code TEXT, 
  _name TEXT, 
  _type TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Check if exists
  SELECT id INTO v_id FROM public.chart_of_accounts 
  WHERE company_id = _company_id AND account_code = _code;
  
  -- If not, create it
  IF v_id IS NULL THEN
    INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, is_active)
    VALUES (_company_id, _code, _name, _type, true)
    RETURNING id INTO v_id;
  END IF;
  
  RETURN v_id;
END;
$$;

-- 2. Update post_pay_run_finalize to use ensure_account_exists
CREATE OR REPLACE FUNCTION public.post_pay_run_finalize(_pay_run_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_company uuid; v_tx_id uuid; 
  wages_payable_id uuid; paye_id uuid; uif_id uuid; sdl_id uuid; 
  wages_exp_id uuid; uif_exp_id uuid; sdl_exp_id uuid;
  v_total_gross numeric; v_total_net numeric; v_total_paye numeric; 
  v_total_uif_emp numeric; v_total_uif_er numeric; v_total_sdl_er numeric;
BEGIN
  select company_id into v_company from public.pay_runs where id = _pay_run_id;
  if v_company is null then raise exception 'pay_run not found'; end if;

  -- Ensure accounts exist (aligned to Rigel SA payroll mapping)
  wages_payable_id := public.ensure_account_exists(v_company, '2510', 'Accrued Salaries', 'liability');
  paye_id := public.ensure_account_exists(v_company, '2315', 'PAYE (Tax Payable)', 'liability');
  uif_id := public.ensure_account_exists(v_company, '2210', 'UIF Payable', 'liability');
  sdl_id := public.ensure_account_exists(v_company, '2220', 'SDL Payable', 'liability');
  wages_exp_id := public.ensure_account_exists(v_company, '6000', 'Salaries & Wages', 'expense');
  uif_exp_id := public.ensure_account_exists(v_company, '6021', 'Employer UIF Expense', 'expense');
  sdl_exp_id := public.ensure_account_exists(v_company, '6022', 'Employer SDL Expense', 'expense');

  select coalesce(sum(gross),0), coalesce(sum(net),0), coalesce(sum(paye),0), coalesce(sum(uif_emp),0), coalesce(sum(uif_er),0), coalesce(sum(sdl_er),0)
  into v_total_gross, v_total_net, v_total_paye, v_total_uif_emp, v_total_uif_er, v_total_sdl_er
  from public.pay_run_lines where pay_run_id = _pay_run_id;

  insert into public.transactions(company_id, user_id, reference_number, description, transaction_date, status)
  values (v_company, auth.uid(), _pay_run_id::text, 'Payroll Finalization', now()::date, 'pending')
  returning id into v_tx_id;

  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values
    (v_tx_id, wages_exp_id, v_total_gross, 0, 'Payroll gross', 'approved'),
    (v_tx_id, wages_payable_id, 0, v_total_net, 'Net wages payable', 'approved'),
    (v_tx_id, paye_id, 0, v_total_paye, 'PAYE payable', 'approved'),
    (v_tx_id, uif_id, 0, v_total_uif_emp, 'UIF payable (employee)', 'approved');

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

  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  select v_company, account_id, debit, credit, now()::date, false, v_tx_id, description from public.transaction_entries where transaction_id = v_tx_id;

  update public.transactions set status = 'posted' where id = v_tx_id;
  update public.pay_runs set status = 'finalized' where id = _pay_run_id;
END;$$;

-- 3. Update post_pay_run_pay to use ensure_account_exists
CREATE OR REPLACE FUNCTION public.post_pay_run_pay(_pay_run_id uuid, _amount numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_company uuid; v_tx_id uuid; bank_id uuid; wages_payable_id uuid; BEGIN
  select company_id into v_company from public.pay_runs where id = _pay_run_id;
  
  bank_id := public.ensure_account_exists(v_company, '1100', 'Bank', 'asset');
  wages_payable_id := public.ensure_account_exists(v_company, '2510', 'Accrued Salaries', 'liability');

  insert into public.transactions(company_id, user_id, reference_number, description, transaction_date, status)
  values (v_company, auth.uid(), _pay_run_id::text, 'Payroll Payment', now()::date, 'pending') returning id into v_tx_id;
  
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values (v_tx_id, wages_payable_id, _amount, 0, 'Pay net wages', 'approved'), (v_tx_id, bank_id, 0, _amount, 'Pay net wages', 'approved');
  
  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  select v_company, account_id, debit, credit, now()::date, false, v_tx_id, description from public.transaction_entries where transaction_id = v_tx_id;
  
  update public.transactions set status = 'posted' where id = v_tx_id;
  update public.pay_runs set status = 'paid' where id = _pay_run_id;
END;$$;

-- 4. Update post_statutory_remit to use ensure_account_exists
CREATE OR REPLACE FUNCTION public.post_statutory_remit(_company_id uuid, _type text, _amount numeric, _reference text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_tx_id uuid; bank_id uuid; acct_id uuid; v_desc text; BEGIN
  bank_id := public.ensure_account_exists(_company_id, '1100', 'Bank', 'asset');
  
  if _type = 'paye' then
    acct_id := public.ensure_account_exists(_company_id, '2315', 'PAYE (Tax Payable)', 'liability');
    v_desc := 'PAYE remittance';
  elsif _type = 'uif' then
    acct_id := public.ensure_account_exists(_company_id, '2210', 'UIF Payable', 'liability');
    v_desc := 'UIF remittance';
  elsif _type = 'sdl' then
    acct_id := public.ensure_account_exists(_company_id, '2220', 'SDL Payable', 'liability');
    v_desc := 'SDL remittance';
  else
    raise exception 'unknown statutory type';
  end if;
  
  insert into public.transactions(company_id, user_id, reference_number, description, transaction_date, status)
  values (_company_id, auth.uid(), coalesce(_reference, 'STAT'), v_desc, now()::date, 'pending') returning id into v_tx_id;
  
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values (v_tx_id, acct_id, _amount, 0, v_desc, 'approved'), (v_tx_id, bank_id, 0, _amount, v_desc, 'approved');
  
  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  select _company_id, account_id, debit, credit, now()::date, false, v_tx_id, description from public.transaction_entries where transaction_id = v_tx_id;
  
  update public.transactions set status = 'posted' where id = v_tx_id;
END;$$;

-- 5. Update post_pay_run_pay_v2 to use ensure_account_exists
CREATE OR REPLACE FUNCTION public.post_pay_run_pay_v2(_pay_run_id uuid, _amount numeric, _bank_account_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE 
  v_company uuid; 
  v_tx_id uuid; 
  wages_payable_id uuid; 
  bank_gl_id uuid;
BEGIN
  select company_id into v_company from public.pay_runs where id = _pay_run_id;
  
  -- Get the GL accounts
  wages_payable_id := public.ensure_account_exists(v_company, '2510', 'Accrued Salaries', 'liability');
  bank_gl_id := public.ensure_account_exists(v_company, '1100', 'Bank', 'asset');

  -- Create Transaction (link to specific bank account if column exists)
  -- Note: We try to insert bank_account_id, but if the column doesn't exist in some versions, we might need dynamic SQL.
  -- Assuming column exists based on 20250104 migration.
  insert into public.transactions(company_id, user_id, reference_number, description, transaction_date, status, bank_account_id)
  values (v_company, auth.uid(), _pay_run_id::text, 'Payroll Payment', now()::date, 'pending', _bank_account_id) 
  returning id into v_tx_id;

  -- Create Entries using GL Account IDs (NOT bank_account_id)
  insert into public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
  values 
    (v_tx_id, wages_payable_id, _amount, 0, 'Pay net wages', 'approved'), 
    (v_tx_id, bank_gl_id, 0, _amount, 'Pay net wages', 'approved');

  insert into public.ledger_entries(company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  select v_company, account_id, debit, credit, now()::date, false, v_tx_id, description 
  from public.transaction_entries where transaction_id = v_tx_id;

  update public.transactions set status = 'posted' where id = v_tx_id;
  update public.pay_runs set status = 'paid' where id = _pay_run_id;
END;$$;
