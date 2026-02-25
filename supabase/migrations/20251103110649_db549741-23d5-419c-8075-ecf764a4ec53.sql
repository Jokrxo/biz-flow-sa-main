-- ================================================================
-- FIX SECURITY DEFINER VIEW ISSUE
-- ================================================================

-- Drop the problematic security definer view
DROP VIEW IF EXISTS public.trial_balance_secure;

-- The materialized view will remain internal (service_role only)
-- Access will be through secure functions instead

-- Create a secure function to get trial balance for current user's company
CREATE OR REPLACE FUNCTION public.get_trial_balance_for_company()
RETURNS TABLE(
  company_id UUID,
  account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  normal_balance TEXT,
  total_debits NUMERIC,
  total_credits NUMERIC,
  balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Get user's company
  v_company_id := get_user_company(auth.uid());
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User not associated with any company';
  END IF;
  
  -- Return trial balance for user's company
  RETURN QUERY
  SELECT 
    tb.company_id,
    tb.account_id,
    tb.account_code,
    tb.account_name,
    tb.account_type,
    tb.normal_balance,
    tb.total_debits,
    tb.total_credits,
    tb.balance
  FROM trial_balance_live tb
  WHERE tb.company_id = v_company_id;
END;
$$;