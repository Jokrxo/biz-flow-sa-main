-- Add missing VAT accounts to chart of accounts
-- This migration ensures VAT accounts exist for proper tax reporting

-- Function to add VAT accounts for a company
CREATE OR REPLACE FUNCTION public.ensure_vat_accounts(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- VAT Input/Receivable account (for purchases/expenses)
  INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_protected)
  VALUES
    (_company_id, '1210', 'VAT Input / Receivable', 'asset', 'debit', true, true)
  ON CONFLICT (company_id, account_code)
  DO UPDATE SET
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    normal_balance = EXCLUDED.normal_balance,
    is_active = true,
    is_protected = true;

  -- VAT Output/Payable account (for sales/revenue)
  INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_protected)
  VALUES
    (_company_id, '2200', 'VAT Payable / Output', 'liability', 'credit', true, true)
  ON CONFLICT (company_id, account_code)
  DO UPDATE SET
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    normal_balance = EXCLUDED.normal_balance,
    is_active = true,
    is_protected = true;

  -- VAT Control account (optional, for VAT settlements)
  INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_protected)
  VALUES
    (_company_id, '2210', 'VAT Control', 'liability', 'credit', true, true)
  ON CONFLICT (company_id, account_code)
  DO UPDATE SET
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    normal_balance = EXCLUDED.normal_balance,
    is_active = true,
    is_protected = true;
END;
$$;

-- Update ensure_core_accounts to include VAT accounts
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
    (_company_id, '4000', 'Sales Revenue', 'revenue', 'credit', true, true)
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

-- Update existing companies with VAT accounts
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.ensure_vat_accounts(c.id);
  END LOOP;
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.chart_of_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.chart_of_accounts TO anon;