-- Ensure fixed_assets schema supports proper depreciation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fixed_assets'
  ) THEN
    CREATE TABLE public.fixed_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      description TEXT NOT NULL,
      cost NUMERIC(14,2) NOT NULL,
      purchase_date DATE NOT NULL,
      useful_life_years INT NOT NULL,
      residual_value NUMERIC(14,2) NOT NULL DEFAULT 0,
      depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
      accumulated_depreciation NUMERIC(14,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      disposal_date DATE,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fixed_assets' AND column_name='residual_value'
  ) THEN
    ALTER TABLE public.fixed_assets ADD COLUMN residual_value NUMERIC(14,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fixed_assets' AND column_name='depreciation_method'
  ) THEN
    ALTER TABLE public.fixed_assets ADD COLUMN depreciation_method TEXT NOT NULL DEFAULT 'straight_line';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fixed_assets' AND column_name='accumulated_depreciation'
  ) THEN
    ALTER TABLE public.fixed_assets ADD COLUMN accumulated_depreciation NUMERIC(14,2) NOT NULL DEFAULT 0;
  END IF;

  ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fixed_assets' AND policyname='fixed_assets_select'
  ) THEN
    CREATE POLICY fixed_assets_select ON public.fixed_assets
      FOR SELECT USING (company_id = public.get_user_company(auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fixed_assets' AND policyname='fixed_assets_insert'
  ) THEN
    CREATE POLICY fixed_assets_insert ON public.fixed_assets
      FOR INSERT WITH CHECK (company_id = public.get_user_company(auth.uid()));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fixed_assets' AND policyname='fixed_assets_update'
  ) THEN
    CREATE POLICY fixed_assets_update ON public.fixed_assets
      FOR UPDATE USING (company_id = public.get_user_company(auth.uid()))
      WITH CHECK (company_id = public.get_user_company(auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_asset_accounts(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, is_active, is_protected)
  VALUES
    (_company_id, '1500', 'Fixed Assets', 'asset', true, true),
    (_company_id, '1590', 'Accumulated Depreciation', 'asset', true, true),
    (_company_id, '6100', 'Depreciation Expense', 'expense', true, true)
  ON CONFLICT (company_id, account_code)
  DO UPDATE SET account_name = EXCLUDED.account_name, account_type=EXCLUDED.account_type, is_active=true, is_protected=true;
END;
$$;

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.ensure_asset_accounts(c.id);
  END LOOP;
END $$;