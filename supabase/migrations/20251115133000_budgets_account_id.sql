-- Add account_id to budgets and index for annual/monthly queries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'budgets' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE public.budgets ADD COLUMN account_id UUID REFERENCES public.chart_of_accounts(id);
  END IF;
END $$;

-- Adjust unique constraint to include account_id when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'budgets_company_year_month_category_key'
  ) THEN
    ALTER TABLE public.budgets DROP CONSTRAINT budgets_company_year_month_category_key;
  END IF;
  -- Create a flexible unique index via partials is complex; use a broader unique constraint covering account_id when set
  CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_company_year_month_account
  ON public.budgets(company_id, budget_year, budget_month, account_id);
END $$;

-- Helpful index for year queries
CREATE INDEX IF NOT EXISTS idx_budgets_company_year ON public.budgets(company_id, budget_year);

-- Harden RLS for budgets: enforce company_id on all writes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'budgets' AND polname = 'Users can view budgets in their company'
  ) THEN
    EXECUTE 'DROP POLICY "Users can view budgets in their company" ON public.budgets';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'budgets' AND polname = 'Administrators and accountants can manage budgets'
  ) THEN
    EXECUTE 'DROP POLICY "Administrators and accountants can manage budgets" ON public.budgets';
  END IF;
END $$;

-- SELECT: scoped to company
CREATE POLICY "Users can view budgets in their company" ON public.budgets
  FOR SELECT USING (company_id = public.get_user_company(auth.uid()));

-- INSERT: only managers, must match company
CREATE POLICY "Budgets insert by managers" ON public.budgets
  FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company(auth.uid()) AND (
      public.has_role(auth.uid(), 'administrator', company_id) OR
      public.has_role(auth.uid(), 'accountant', company_id)
    )
  );

-- UPDATE: only managers, must match company
CREATE POLICY "Budgets update by managers" ON public.budgets
  FOR UPDATE
  USING (
    company_id = public.get_user_company(auth.uid()) AND (
      public.has_role(auth.uid(), 'administrator', company_id) OR
      public.has_role(auth.uid(), 'accountant', company_id)
    )
  )
  WITH CHECK (
    company_id = public.get_user_company(auth.uid()) AND (
      public.has_role(auth.uid(), 'administrator', company_id) OR
      public.has_role(auth.uid(), 'accountant', company_id)
    )
  );

-- DELETE: only managers, must match company
CREATE POLICY "Budgets delete by managers" ON public.budgets
  FOR DELETE
  USING (
    company_id = public.get_user_company(auth.uid()) AND (
      public.has_role(auth.uid(), 'administrator', company_id) OR
      public.has_role(auth.uid(), 'accountant', company_id)
    )
  );