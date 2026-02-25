-- ================================================================
-- FIX SECURITY WARNINGS FROM POSTING ENGINE MIGRATION
-- ================================================================

-- 1. Add RLS to materialized view trial_balance_live
-- Since materialized views can't have RLS directly, we'll create a secure view on top
CREATE OR REPLACE VIEW public.trial_balance_secure AS
SELECT * FROM public.trial_balance_live
WHERE company_id = get_user_company(auth.uid());

-- Grant access to the secure view
GRANT SELECT ON public.trial_balance_secure TO authenticated;

-- 2. Revoke direct access to materialized view from API
REVOKE ALL ON public.trial_balance_live FROM anon, authenticated;
GRANT SELECT ON public.trial_balance_live TO service_role;

-- 3. Update all functions to have explicit search_path (already done in previous migration, but ensuring)
-- The functions already have SET search_path = public, so this is already covered