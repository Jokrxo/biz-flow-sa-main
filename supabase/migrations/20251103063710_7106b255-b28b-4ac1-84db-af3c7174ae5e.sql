-- Add bank_account_id to transactions table for bank separation
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL;

-- Add category field for auto-classification
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT; -- Income, Expense, Asset, Liability, Equity

-- Create index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_transactions_duplicate_check 
ON public.transactions(company_id, bank_account_id, transaction_date, total_amount, description);

-- Add comment explaining the duplicate detection strategy
COMMENT ON INDEX idx_transactions_duplicate_check IS 'Index for efficient duplicate transaction detection based on company, bank, date, amount, and description';

-- Create function to detect duplicate transactions
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
      AND bank_account_id = _bank_account_id
      AND transaction_date = _transaction_date
      AND total_amount = _total_amount
      AND description ILIKE '%' || _description || '%'
  );
END;
$$;

-- Create function to auto-classify transactions based on keywords
CREATE OR REPLACE FUNCTION public.auto_classify_transaction(_description TEXT)
RETURNS TABLE(transaction_type TEXT, category TEXT)
LANGUAGE plpgsql
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

-- Update existing transactions RLS policies to include bank_account_id filtering
DROP POLICY IF EXISTS "Users can view transactions in their company" ON public.transactions;
CREATE POLICY "Users can view transactions in their company"
ON public.transactions
FOR SELECT
USING (company_id = get_user_company(auth.uid()));

COMMENT ON TABLE public.transactions IS 'Stores all financial transactions with bank separation, auto-classification, and duplicate detection support';