-- Phase 1: Auto Chart of Accounts Generator + Enhanced System

-- 1. Enhanced Auto CoA Initialization Function
CREATE OR REPLACE FUNCTION initialize_company_coa(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check if CoA already exists for this company
  IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = _company_id) THEN
    RETURN; -- CoA already initialized
  END IF;

  -- ASSETS (1000-1999)
  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, is_system, normal_balance, is_active) VALUES
  (_company_id, '1000', 'Cash on Hand', 'asset', true, 'debit', true),
  (_company_id, '1100', 'Bank Accounts', 'asset', true, 'debit', true),
  (_company_id, '1200', 'Accounts Receivable', 'asset', true, 'debit', true),
  (_company_id, '1300', 'Inventory', 'asset', false, 'debit', true),
  (_company_id, '1400', 'Prepaid Expenses', 'asset', false, 'debit', true),
  (_company_id, '1500', 'Fixed Assets - Equipment', 'asset', false, 'debit', true),
  (_company_id, '1510', 'Fixed Assets - Vehicles', 'asset', false, 'debit', true),
  (_company_id, '1520', 'Fixed Assets - Property', 'asset', false, 'debit', true),
  (_company_id, '1600', 'Accumulated Depreciation', 'asset', true, 'credit', true),
  
  -- LIABILITIES (2000-2999)
  (_company_id, '2000', 'Accounts Payable', 'liability', true, 'credit', true),
  (_company_id, '2100', 'Accrued Expenses', 'liability', true, 'credit', true),
  (_company_id, '2200', 'VAT Payable', 'liability', true, 'credit', true),
  (_company_id, '2300', 'Loans Payable - Short Term', 'liability', false, 'credit', true),
  (_company_id, '2400', 'Loans Payable - Long Term', 'liability', false, 'credit', true),
  (_company_id, '2500', 'Salaries Payable', 'liability', true, 'credit', true),
  
  -- EQUITY (3000-3999)
  (_company_id, '3000', 'Owner''s Capital', 'equity', true, 'credit', true),
  (_company_id, '3100', 'Retained Earnings', 'equity', true, 'credit', true),
  (_company_id, '3200', 'Current Year Earnings', 'equity', true, 'credit', true),
  (_company_id, '3900', 'Opening Balance Equity', 'equity', true, 'credit', true),
  
  -- INCOME/REVENUE (4000-4999)
  (_company_id, '4000', 'Sales Revenue', 'revenue', true, 'credit', true),
  (_company_id, '4100', 'Service Revenue', 'revenue', true, 'credit', true),
  (_company_id, '4200', 'Interest Income', 'revenue', false, 'credit', true),
  (_company_id, '4300', 'Other Income', 'revenue', false, 'credit', true),
  (_company_id, '4900', 'Sales Discounts', 'revenue', false, 'debit', true),
  
  -- EXPENSES (5000-5999)
  (_company_id, '5000', 'Cost of Goods Sold', 'expense', true, 'debit', true),
  (_company_id, '5100', 'Salaries & Wages', 'expense', true, 'debit', true),
  (_company_id, '5200', 'Rent Expense', 'expense', true, 'debit', true),
  (_company_id, '5300', 'Utilities Expense', 'expense', true, 'debit', true),
  (_company_id, '5400', 'Insurance Expense', 'expense', false, 'debit', true),
  (_company_id, '5500', 'Office Supplies', 'expense', true, 'debit', true),
  (_company_id, '5600', 'Depreciation Expense', 'expense', true, 'debit', true),
  (_company_id, '5700', 'Fuel & Transport', 'expense', true, 'debit', true),
  (_company_id, '5800', 'Marketing & Advertising', 'expense', false, 'debit', true),
  (_company_id, '5900', 'Professional Fees', 'expense', false, 'debit', true),
  (_company_id, '5950', 'Bank Charges', 'expense', true, 'debit', true),
  (_company_id, '5980', 'Miscellaneous Expense', 'expense', false, 'debit', true);
  
END;
$$;

-- 2. Update handle_new_company trigger to use enhanced CoA
CREATE OR REPLACE FUNCTION handle_new_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Initialize Chart of Accounts for the new company
  PERFORM initialize_company_coa(NEW.id);
  RETURN NEW;
END;
$$;

-- 3. Enhanced Duplicate Detection Function
CREATE OR REPLACE FUNCTION check_duplicate_transaction(
  _company_id UUID,
  _bank_account_id UUID,
  _transaction_date DATE,
  _total_amount NUMERIC,
  _description TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tolerance NUMERIC := 0.01; -- Amount tolerance for duplicate detection
  v_date_range INTEGER := 3; -- Check within +/- 3 days
BEGIN
  -- Check for exact or near-duplicate transactions
  RETURN EXISTS (
    SELECT 1
    FROM transactions
    WHERE company_id = _company_id
      AND (
        -- Exact match on bank account
        (_bank_account_id IS NOT NULL AND bank_account_id = _bank_account_id)
        OR
        -- Or no bank account specified for either
        (_bank_account_id IS NULL AND bank_account_id IS NULL)
      )
      -- Date within tolerance range
      AND transaction_date BETWEEN (_transaction_date - v_date_range) AND (_transaction_date + v_date_range)
      -- Amount within tolerance
      AND ABS(total_amount - _total_amount) <= v_tolerance
      -- Description similarity (case-insensitive, partial match)
      AND (
        LOWER(description) = LOWER(_description)
        OR LOWER(description) LIKE '%' || LOWER(_description) || '%'
        OR LOWER(_description) LIKE '%' || LOWER(description) || '%'
      )
      -- Only check non-rejected transactions
      AND status != 'rejected'
  );
END;
$$;

-- 4. Transaction Validation Function
CREATE OR REPLACE FUNCTION validate_transaction_before_post(
  _company_id UUID,
  _debit_account_id UUID,
  _credit_account_id UUID,
  _debit_amount NUMERIC,
  _credit_amount NUMERIC
)
RETURNS TABLE(
  is_valid BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_debit_exists BOOLEAN;
  v_credit_exists BOOLEAN;
BEGIN
  -- Check if debit and credit accounts are the same
  IF _debit_account_id = _credit_account_id THEN
    RETURN QUERY SELECT false, 'Debit and credit accounts cannot be the same';
    RETURN;
  END IF;
  
  -- Check if both accounts exist and belong to the company
  SELECT EXISTS (
    SELECT 1 FROM chart_of_accounts 
    WHERE id = _debit_account_id AND company_id = _company_id AND is_active = true
  ) INTO v_debit_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM chart_of_accounts 
    WHERE id = _credit_account_id AND company_id = _company_id AND is_active = true
  ) INTO v_credit_exists;
  
  IF NOT v_debit_exists THEN
    RETURN QUERY SELECT false, 'Debit account does not exist or is inactive';
    RETURN;
  END IF;
  
  IF NOT v_credit_exists THEN
    RETURN QUERY SELECT false, 'Credit account does not exist or is inactive';
    RETURN;
  END IF;
  
  -- Check if debits equal credits
  IF ABS(_debit_amount - _credit_amount) > 0.01 THEN
    RETURN QUERY SELECT false, 'Debits must equal credits';
    RETURN;
  END IF;
  
  -- All validations passed
  RETURN QUERY SELECT true, 'Valid'::TEXT;
END;
$$;

-- 5. Function to get account suggestions based on transaction type
CREATE OR REPLACE FUNCTION get_account_suggestions(
  _company_id UUID,
  _transaction_element TEXT, -- 'expense', 'income', 'asset', 'liability', 'equity'
  _side TEXT -- 'debit' or 'credit'
)
RETURNS TABLE(
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  normal_balance TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Return accounts based on transaction element and which side (debit/credit)
  RETURN QUERY
  SELECT 
    coa.id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    coa.normal_balance
  FROM chart_of_accounts coa
  WHERE coa.company_id = _company_id
    AND coa.is_active = true
    AND (
      -- Expense transactions: Dr Expense / Cr Asset or Liability
      (_transaction_element = 'expense' AND _side = 'debit' AND coa.account_type = 'expense')
      OR (_transaction_element = 'expense' AND _side = 'credit' AND coa.account_type IN ('asset', 'liability'))
      
      -- Income transactions: Dr Asset / Cr Revenue
      OR (_transaction_element = 'income' AND _side = 'debit' AND coa.account_type = 'asset')
      OR (_transaction_element = 'income' AND _side = 'credit' AND coa.account_type = 'revenue')
      
      -- Asset purchase: Dr Asset / Cr Asset or Liability
      OR (_transaction_element = 'asset' AND _side = 'debit' AND coa.account_type = 'asset' AND coa.account_code >= '1500')
      OR (_transaction_element = 'asset' AND _side = 'credit' AND coa.account_type IN ('asset', 'liability'))
      
      -- Liability payment: Dr Liability / Cr Asset
      OR (_transaction_element = 'liability' AND _side = 'debit' AND coa.account_type = 'liability')
      OR (_transaction_element = 'liability' AND _side = 'credit' AND coa.account_type = 'asset')
      
      -- Equity/Capital: Dr Asset / Cr Equity
      OR (_transaction_element = 'equity' AND _side = 'debit' AND coa.account_type = 'asset')
      OR (_transaction_element = 'equity' AND _side = 'credit' AND coa.account_type = 'equity')
    )
  ORDER BY coa.account_code;
END;
$$;

-- 6. Add comments
COMMENT ON FUNCTION initialize_company_coa(UUID) IS 'Generates a comprehensive default Chart of Accounts for new companies with all standard accounts';
COMMENT ON FUNCTION check_duplicate_transaction(UUID, UUID, DATE, NUMERIC, TEXT) IS 'Enhanced duplicate detection with fuzzy matching on date, amount, and description';
COMMENT ON FUNCTION validate_transaction_before_post(UUID, UUID, UUID, NUMERIC, NUMERIC) IS 'Validates transaction entries before posting - checks account existence, debit=credit, and prevents same-account entries';
COMMENT ON FUNCTION get_account_suggestions(UUID, TEXT, TEXT) IS 'Returns appropriate account suggestions based on transaction element and debit/credit side';