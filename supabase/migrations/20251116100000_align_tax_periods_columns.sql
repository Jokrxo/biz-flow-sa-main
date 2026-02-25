-- Align tax_periods column names and update VAT settlement function
DO $$
BEGIN
  -- Ensure start_date/end_date columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tax_periods' AND column_name='start_date'
  ) THEN
    ALTER TABLE public.tax_periods ADD COLUMN start_date DATE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tax_periods' AND column_name='end_date'
  ) THEN
    ALTER TABLE public.tax_periods ADD COLUMN end_date DATE;
  END IF;

  -- Copy values from legacy columns if present
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tax_periods' AND column_name='period_start'
  ) THEN
    UPDATE public.tax_periods SET start_date = COALESCE(start_date, period_start);
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tax_periods' AND column_name='period_end'
  ) THEN
    UPDATE public.tax_periods SET end_date = COALESCE(end_date, period_end);
  END IF;

  -- Ensure period_name exists (optional)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tax_periods' AND column_name='period_name'
  ) THEN
    ALTER TABLE public.tax_periods ADD COLUMN period_name TEXT;
    UPDATE public.tax_periods
      SET period_name = COALESCE(period_name, TO_CHAR(COALESCE(start_date, CURRENT_DATE), 'FMMonth YYYY'));
  END IF;

  -- Helpful indexes
  CREATE INDEX IF NOT EXISTS idx_tax_periods_company ON public.tax_periods(company_id);
  CREATE INDEX IF NOT EXISTS idx_tax_periods_dates ON public.tax_periods(start_date, end_date);
END $$;

-- Replace VAT settlement function to use start_date/end_date consistently
DROP FUNCTION IF EXISTS public.settle_vat_period(uuid);
CREATE FUNCTION public.settle_vat_period(_tax_period_id UUID)
RETURNS TABLE (
  ok BOOLEAN,
  vat_input NUMERIC,
  vat_output NUMERIC,
  vat_payable NUMERIC,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_input NUMERIC := 0;
  v_output NUMERIC := 0;
  v_payable NUMERIC := 0;
BEGIN
  SELECT * INTO v_period FROM public.tax_periods WHERE id = _tax_period_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 'Tax period not found'::TEXT;
    RETURN;
  END IF;

  -- Compute VAT Input (debits) within date window
  SELECT COALESCE(SUM(e.debit - e.credit), 0) INTO v_input
  FROM public.transaction_entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  JOIN public.chart_of_accounts coa ON coa.id = e.account_id
  WHERE t.company_id = v_period.company_id
    AND t.transaction_date >= COALESCE(v_period.start_date, v_period.period_start)
    AND t.transaction_date <= COALESCE(v_period.end_date, v_period.period_end)
    AND t.status IN ('approved','posted')
    AND (
      LOWER(coa.account_name) LIKE '%vat input%' OR
      LOWER(coa.account_name) LIKE '%vat receivable%' OR
      coa.account_code = '1210'
    );

  -- Compute VAT Output (credits) within date window
  SELECT COALESCE(SUM(e.credit - e.debit), 0) INTO v_output
  FROM public.transaction_entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  JOIN public.chart_of_accounts coa ON coa.id = e.account_id
  WHERE t.company_id = v_period.company_id
    AND t.transaction_date >= COALESCE(v_period.start_date, v_period.period_start)
    AND t.transaction_date <= COALESCE(v_period.end_date, v_period.period_end)
    AND t.status IN ('approved','posted')
    AND (
      LOWER(coa.account_name) LIKE '%vat output%' OR
      LOWER(coa.account_name) LIKE '%vat payable%' OR
      coa.account_code = '2200'
    );

  v_payable := GREATEST(0, v_output - v_input);

  UPDATE public.tax_periods
    SET vat_input_total = v_input,
        vat_output_total = v_output,
        vat_payable = v_payable
    WHERE id = _tax_period_id;

  RETURN QUERY SELECT TRUE, v_input, v_output, v_payable, 'OK'::TEXT;
END;
$$;