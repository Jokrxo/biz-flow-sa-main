-- Restrict DELETE on protected accounts and refine RLS policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'chart_of_accounts' 
      AND policyname = 'Administrators and accountants can manage accounts'
  ) THEN
    EXECUTE 'DROP POLICY "Administrators and accountants can manage accounts" ON public.chart_of_accounts';
  END IF;
END
$$;

CREATE POLICY "Accounts select for company"
  ON public.chart_of_accounts FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Accounts insert by managers"
  ON public.chart_of_accounts FOR INSERT
  WITH CHECK (
    (has_role(auth.uid(), 'administrator'::app_role, company_id) OR has_role(auth.uid(), 'accountant'::app_role, company_id))
    AND company_id = get_user_company(auth.uid())
  );

CREATE POLICY "Accounts update by managers"
  ON public.chart_of_accounts FOR UPDATE
  USING (
    (has_role(auth.uid(), 'administrator'::app_role, company_id) OR has_role(auth.uid(), 'accountant'::app_role, company_id))
    AND company_id = get_user_company(auth.uid())
  )
  WITH CHECK (
    (has_role(auth.uid(), 'administrator'::app_role, company_id) OR has_role(auth.uid(), 'accountant'::app_role, company_id))
    AND company_id = get_user_company(auth.uid())
  );

CREATE POLICY "Accounts delete restricted"
  ON public.chart_of_accounts FOR DELETE
  USING (
    (has_role(auth.uid(), 'administrator'::app_role, company_id) OR has_role(auth.uid(), 'accountant'::app_role, company_id))
    AND company_id = get_user_company(auth.uid())
    AND is_protected = FALSE
  );