-- Phase 1: Accounting Foundation Enhancements (Fixed)

-- 1. Add missing columns to bank_accounts
ALTER TABLE bank_accounts 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ZAR',
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 2. Add missing columns to chart_of_accounts
ALTER TABLE chart_of_accounts
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS normal_balance TEXT DEFAULT 'debit';

-- Update normal_balance based on account_type (using lowercase)
UPDATE chart_of_accounts
SET normal_balance = CASE
  WHEN account_type IN ('asset', 'expense') THEN 'debit'
  WHEN account_type IN ('liability', 'equity', 'revenue') THEN 'credit'
  ELSE 'debit'
END
WHERE normal_balance = 'debit' OR normal_balance IS NULL;

-- 3. Create Opening Balance Equity account for each company if it doesn't exist
INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, is_system, normal_balance, is_active)
SELECT 
  c.id,
  '3900',
  'Opening Balance Equity',
  'equity',
  true,
  'credit',
  true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa
  WHERE coa.company_id = c.id 
  AND coa.account_code = '3900'
);

-- 4. Create function to handle opening balance posting
CREATE OR REPLACE FUNCTION handle_bank_account_opening_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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

  -- Create transaction header for opening balance
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
    'posted',
    'opening_balance',
    'Opening Balance'
  )
  RETURNING id INTO v_transaction_id;

  -- Create double-entry ledger entries: Dr Bank / Cr Opening Balance Equity
  INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
  VALUES
    (v_transaction_id, v_bank_account_id, NEW.opening_balance, 0, 'Opening Balance - Debit', 'posted'),
    (v_transaction_id, v_opening_balance_equity_id, 0, NEW.opening_balance, 'Opening Balance - Credit', 'posted');

  RETURN NEW;
END;
$$;

-- 5. Create trigger for bank account opening balance
DROP TRIGGER IF EXISTS bank_account_opening_balance_trigger ON bank_accounts;
CREATE TRIGGER bank_account_opening_balance_trigger
  AFTER INSERT ON bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION handle_bank_account_opening_balance();

-- 6. Create trial balance summary view
CREATE OR REPLACE VIEW trial_balance_summary AS
SELECT 
  coa.company_id,
  coa.id as account_id,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.normal_balance,
  COALESCE(SUM(te.debit), 0) as total_debits,
  COALESCE(SUM(te.credit), 0) as total_credits,
  CASE 
    WHEN coa.normal_balance = 'debit' THEN COALESCE(SUM(te.debit) - SUM(te.credit), 0)
    ELSE COALESCE(SUM(te.credit) - SUM(te.debit), 0)
  END as balance
FROM chart_of_accounts coa
LEFT JOIN transaction_entries te ON te.account_id = coa.id
LEFT JOIN transactions t ON t.id = te.transaction_id AND t.status IN ('posted', 'approved')
WHERE coa.is_active = true
GROUP BY coa.company_id, coa.id, coa.account_code, coa.account_name, coa.account_type, coa.normal_balance
ORDER BY coa.account_code;