-- Add loan-related accounts to chart of accounts
CREATE OR REPLACE FUNCTION public.ensure_loan_accounts(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Loan accounts (liabilities)
  INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, is_active, is_protected)
  VALUES
    (_company_id, '2300', 'Loans Payable - Short Term', 'liability', true, true),
    (_company_id, '2400', 'Loans Payable - Long Term', 'liability', true, true),
    (_company_id, '5100', 'Interest Expense', 'expense', true, true),
    (_company_id, '2305', 'Loan Interest Payable', 'liability', true, true)
  ON CONFLICT (company_id, account_code)
  DO UPDATE SET
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    is_active = true,
    is_protected = true;
END;
$$;

-- Add loan accounts to existing companies
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.ensure_loan_accounts(c.id);
  END LOOP;
END;
$$;

-- Update the ensure_core_accounts function to also include loan accounts
CREATE OR REPLACE FUNCTION public.ensure_core_accounts(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Basic core accounts
  INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, is_active, is_protected)
  VALUES
    (_company_id, '1000', 'Cash', 'asset', true, true),
    (_company_id, '1100', 'Bank', 'asset', true, true),
    (_company_id, '1200', 'Accounts Receivable', 'asset', true, true),
    (_company_id, '4000', 'Sales Revenue', 'revenue', true, true)
  ON CONFLICT (company_id, account_code)
  DO UPDATE SET
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    is_active = true,
    is_protected = true;
  
  -- Also ensure loan accounts exist
  PERFORM public.ensure_loan_accounts(_company_id);
END;
$$;