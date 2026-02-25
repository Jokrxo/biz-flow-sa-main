-- Ensure client-side inserts into ledger_entries pass RLS for user's company
-- and allow admin/accountant to manage with proper WITH CHECK

-- Enable RLS (safe to re-run)
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Authenticated users may INSERT ledger entries for their own company
DROP POLICY IF EXISTS "Users can insert ledger entries in their company" ON public.ledger_entries;
CREATE POLICY "Users can insert ledger entries in their company"
  ON public.ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()));

-- Ensure admin/accountant manage policy permits INSERT/UPDATE/DELETE via WITH CHECK
ALTER POLICY "Administrators and accountants can manage ledger entries"
  ON public.ledger_entries
  WITH CHECK (
    public.has_role(auth.uid(), 'administrator'::app_role, company_id)
    OR public.has_role(auth.uid(), 'accountant'::app_role, company_id)
  );

-- Optional: tighten UPDATE for authenticated users to their company only
-- Uncomment if required by app logic
-- DROP POLICY IF EXISTS "Users can update ledger entries in their company" ON public.ledger_entries;
-- CREATE POLICY "Users can update ledger entries in their company"
--   ON public.ledger_entries
--   FOR UPDATE
--   TO authenticated
--   USING (company_id = public.get_user_company(auth.uid()))
--   WITH CHECK (company_id = public.get_user_company(auth.uid()));

-- Note: The server-side trigger post_transaction_to_ledger() remains SECURITY DEFINER
-- and can post entries regardless of client role, when transactions are approved/posted.