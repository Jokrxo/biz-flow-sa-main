-- Fix security warnings by setting search_path on functions
DROP FUNCTION IF EXISTS public.check_duplicate_transaction(UUID, UUID, DATE, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.auto_classify_transaction(TEXT);

-- Recreate check_duplicate_transaction with search_path
CREATE OR REPLACE FUNCTION public.check_duplicate_transaction(
  _company_id UUID,
  _bank_account_id UUID,
  _transaction_date DATE,
  _total_amount NUMERIC,
  _description TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE company_id = _company_id
      AND (bank_account_id = _bank_account_id OR (_bank_account_id IS NULL AND bank_account_id IS NULL))
      AND transaction_date = _transaction_date
      AND total_amount = _total_amount
      AND description ILIKE '%' || _description || '%'
  );
END;
$$;

-- Recreate auto_classify_transaction with search_path
CREATE OR REPLACE FUNCTION public.auto_classify_transaction(_description TEXT)
RETURNS TABLE(transaction_type TEXT, category TEXT)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Income classification
  IF _description ~* '(deposit|income|revenue|sales|payment received|receipt)' THEN
    RETURN QUERY SELECT 'Income'::TEXT, 'Revenue'::TEXT;
  -- Expense classification
  ELSIF _description ~* '(fuel|petrol|diesel|gas station)' THEN
    RETURN QUERY SELECT 'Expense'::TEXT, 'Fuel & Transport'::TEXT;
  ELSIF _description ~* '(salary|wage|payroll|staff)' THEN
    RETURN QUERY SELECT 'Expense'::TEXT, 'Salaries & Wages'::TEXT;
  ELSIF _description ~* '(rent|lease)' THEN
    RETURN QUERY SELECT 'Expense'::TEXT, 'Rent & Lease'::TEXT;
  ELSIF _description ~* '(utility|utilities|electricity|water)' THEN
    RETURN QUERY SELECT 'Expense'::TEXT, 'Utilities'::TEXT;
  ELSIF _description ~* '(office|stationery|supplies)' THEN
    RETURN QUERY SELECT 'Expense'::TEXT, 'Office Expenses'::TEXT;
  -- Asset classification
  ELSIF _description ~* '(equipment|machinery|vehicle|computer|furniture)' THEN
    RETURN QUERY SELECT 'Asset'::TEXT, 'Fixed Assets'::TEXT;
  -- Liability classification
  ELSIF _description ~* '(loan|debt|payable|credit)' THEN
    RETURN QUERY SELECT 'Liability'::TEXT, 'Liabilities'::TEXT;
  -- Default to Expense
  ELSE
    RETURN QUERY SELECT 'Expense'::TEXT, 'General Expense'::TEXT;
  END IF;
END;
$$;