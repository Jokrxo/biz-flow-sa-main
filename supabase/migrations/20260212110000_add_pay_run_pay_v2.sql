create or replace function public.post_pay_run_pay_v2(_pay_run_id uuid, _amount numeric, _bank_account_id uuid)
returns void language plpgsql as $$
declare 
  v_company uuid; 
  v_tx_id uuid; 
  wages_payable_id uuid; 
begin
  select company_id into v_company from public.pay_runs where id = _pay_run_id;
  
  -- Find Wages Payable Account (Liability)
  select id into wages_payable_id from public.chart_of_accounts 
  where company_id = v_company and account_code = '2105' and account_type = 'liability' limit 1;
  
  if wages_payable_id is null then
    raise exception 'Wages Payable account (2105) not found';
  end if;

  -- Create Transaction
  insert into public.transactions(company_id, reference, description, transaction_date, status)
  values (v_company, _pay_run_id::text, 'Payroll Payment', now()::date, 'posted') 
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

  -- Update Run Status
  update public.pay_runs set status = 'paid' where id = _pay_run_id;
end;$$;
