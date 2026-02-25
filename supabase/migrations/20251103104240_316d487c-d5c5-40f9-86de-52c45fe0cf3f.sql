-- Fix status value in bank account opening balance trigger
-- Change from 'posted' to 'approved' to match the check constraint

CREATE OR REPLACE FUNCTION public.handle_bank_account_opening_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bank_account_id UUID;
  v_opening_balance_equity_id UUID;
  v_transaction_id UUID;
  v_user_id UUID;
BEGIN
  -- Only process if opening_balance > 0
  IF NEW.opening_balance IS NULL OR NEW.opening_balance = 0 THEN
    RETURN NEW;
  END IF;

  -- Get user_id from the session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM profiles
    WHERE company_id = NEW.company_id
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NEW; -- Skip if no user found
  END IF;

  -- Find Bank account in chart of accounts
  SELECT id INTO v_bank_account_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND account_type = 'asset'
    AND (account_name ILIKE '%bank%' OR account_code = '1100')
  LIMIT 1;

  -- If no bank account exists, create one
  IF v_bank_account_id IS NULL THEN
    INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, is_system, normal_balance, is_active)
    VALUES (NEW.company_id, '1100', 'Bank Accounts', 'asset', true, 'debit', true)
    RETURNING id INTO v_bank_account_id;
  END IF;

  -- Get Opening Balance Equity account
  SELECT id INTO v_opening_balance_equity_id
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND account_code = '3900'
  LIMIT 1;

  -- If Opening Balance Equity doesn't exist, create it
  IF v_opening_balance_equity_id IS NULL THEN
    INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, is_system, normal_balance, is_active)
    VALUES (NEW.company_id, '3900', 'Opening Balance Equity', 'equity', true, 'credit', true)
    RETURNING id INTO v_opening_balance_equity_id;
  END IF;

  -- Create transaction header for opening balance with 'approved' status
  INSERT INTO transactions (
    company_id,
    user_id,
    transaction_date,
    description,
    reference_number,
    total_amount,
    bank_account_id,
    status,
    transaction_type,
    category
  )
  VALUES (
    NEW.company_id,
    v_user_id,
    CURRENT_DATE,
    'Opening Balance for ' || NEW.bank_name || ' - ' || NEW.account_number,
    'OB-' || NEW.id,
    NEW.opening_balance,
    NEW.id,
    'approved',
    'opening_balance',
    'Opening Balance'
  )
  RETURNING id INTO v_transaction_id;

  -- Create double-entry ledger entries with 'approved' status
  INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
  VALUES
    (v_transaction_id, v_bank_account_id, NEW.opening_balance, 0, 'Opening Balance - Debit', 'approved'),
    (v_transaction_id, v_opening_balance_equity_id, 0, NEW.opening_balance, 'Opening Balance - Credit', 'approved');

  RETURN NEW;
END;
$function$;