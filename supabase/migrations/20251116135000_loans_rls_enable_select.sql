-- Harden loans and loan_payments with RLS and SELECT policies to prevent data leaks
DO $$
BEGIN
  -- Enable RLS
  ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.loan_payments ENABLE ROW LEVEL SECURITY;

  -- Drop duplicate policies if they exist to avoid conflicts
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='loans' AND policyname='loans_select') THEN
    EXECUTE 'DROP POLICY loans_select ON public.loans';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='loan_payments' AND policyname='loan_payments_select') THEN
    EXECUTE 'DROP POLICY loan_payments_select ON public.loan_payments';
  END IF;

  -- SELECT policies: only loans/loan_payments for current user's company
  CREATE POLICY loans_select ON public.loans
    FOR SELECT USING (company_id = public.get_user_company(auth.uid()));

  CREATE POLICY loan_payments_select ON public.loan_payments
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.loans l
        WHERE l.id = public.loan_payments.loan_id
          AND l.company_id = public.get_user_company(auth.uid())
      )
    );

  -- Optional: DELETE restricted to company managers (consistent with insert/update policies defined earlier)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='loans' AND policyname='loans_delete') THEN
    CREATE POLICY loans_delete ON public.loans
      FOR DELETE USING (company_id = public.get_user_company(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='loan_payments' AND policyname='loan_payments_delete') THEN
    CREATE POLICY loan_payments_delete ON public.loan_payments
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.loans l
          WHERE l.id = public.loan_payments.loan_id
            AND l.company_id = public.get_user_company(auth.uid())
        )
      );
  END IF;
END $$;