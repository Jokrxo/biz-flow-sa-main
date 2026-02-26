-- Ensure core accounts exist for all companies
-- This ensures Revenue (4000) and Accounts Receivable (1200) exist

-- Function to ensure core accounts exist
CREATE OR REPLACE FUNCTION public.ensure_core_accounts(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Basic core accounts
  INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_protected)
  VALUES
    (_company_id, '1000', 'Cash', 'asset', 'debit', true, true),
    (_company_id, '1100', 'Bank', 'asset', 'debit', true, true),
    (_company_id, '1200', 'Accounts Receivable', 'asset', 'debit', true, true),
    (_company_id, '4000', 'Sales Revenue', 'revenue', 'credit', true, true),
    (_company_id, '5000', 'Cost of Sales', 'expense', 'debit', true, true)
  ON CONFLICT (company_id, account_code)
  DO UPDATE SET
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    normal_balance = EXCLUDED.normal_balance,
    is_active = true,
    is_protected = true;
  
  -- Ensure VAT accounts exist
  PERFORM public.ensure_vat_accounts(_company_id);
  
  -- Ensure loan accounts exist
  PERFORM public.ensure_loan_accounts(_company_id);
END;
$$;

-- Run for all existing companies
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.ensure_core_accounts(c.id);
  END LOOP;
END;
$$;
