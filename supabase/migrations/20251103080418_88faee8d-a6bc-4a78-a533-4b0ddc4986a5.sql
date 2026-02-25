-- Fix search path for check_duplicate_transaction
CREATE OR REPLACE FUNCTION public.check_duplicate_transaction(_company_id uuid, _bank_account_id uuid, _transaction_date date, _total_amount numeric, _description text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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