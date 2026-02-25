-- Fix search path for auto_classify_transaction
CREATE OR REPLACE FUNCTION public.auto_classify_transaction(_description text)
RETURNS TABLE(transaction_type text, category text)
LANGUAGE plpgsql
SET search_path TO 'public'
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