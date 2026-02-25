-- Ensure core accounts exist and cannot be deleted
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.ensure_core_accounts(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_delete_protected_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_protected THEN
    RAISE EXCEPTION 'Cannot delete protected account % (%)', OLD.account_name, OLD.account_code;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_protected_accounts ON public.chart_of_accounts;
CREATE TRIGGER trg_prevent_delete_protected_accounts
  BEFORE DELETE ON public.chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_protected_accounts();

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.ensure_core_accounts(c.id);
  END LOOP;
END;
$$;