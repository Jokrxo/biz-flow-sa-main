CREATE OR REPLACE FUNCTION public.post_monthly_depreciation(_company_id UUID, _posting_date DATE)
RETURNS TABLE(asset_id UUID, amount NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a RECORD;
DECLARE depAmt NUMERIC(14,2);
DECLARE depExp UUID;
DECLARE accDep UUID;
DECLARE txId UUID;
BEGIN
  SELECT id INTO depExp FROM public.chart_of_accounts WHERE company_id=_company_id AND (account_code='6100' OR lower(account_name) LIKE '%depreciation%') LIMIT 1;
  SELECT id INTO accDep FROM public.chart_of_accounts WHERE company_id=_company_id AND (account_code='1590' OR lower(account_name) LIKE '%accumulated depreciation%') LIMIT 1;
  IF depExp IS NULL OR accDep IS NULL THEN
    PERFORM public.ensure_asset_accounts(_company_id);
    SELECT id INTO depExp FROM public.chart_of_accounts WHERE company_id=_company_id AND account_code='6100' LIMIT 1;
    SELECT id INTO accDep FROM public.chart_of_accounts WHERE company_id=_company_id AND account_code='1590' LIMIT 1;
  END IF;

  FOR a IN SELECT * FROM public.fixed_assets WHERE company_id=_company_id AND status='active' AND purchase_date <= _posting_date LOOP
    IF a.depreciation_method = 'straight_line' THEN
      depAmt := ROUND( (a.cost - COALESCE(a.residual_value,0)) / (a.useful_life_years * 12)::numeric, 2 );
    ELSE
      depAmt := ROUND( (a.cost - COALESCE(a.residual_value,0)) / (a.useful_life_years * 12)::numeric, 2 );
    END IF;
    IF depAmt IS NULL OR depAmt <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.transactions(company_id, user_id, transaction_date, description, reference_number, total_amount, bank_account_id, transaction_type, status)
    VALUES (_company_id, auth.uid(), _posting_date, 'Monthly Depreciation - ' || a.description, NULL, depAmt, NULL, 'depreciation', 'approved')
    RETURNING id INTO txId;

    INSERT INTO public.transaction_entries(transaction_id, account_id, debit, credit, description, status)
    VALUES (txId, depExp, depAmt, 0, 'Monthly Depreciation', 'approved'),
           (txId, accDep, 0, depAmt, 'Accumulated Depreciation', 'approved');

    INSERT INTO public.ledger_entries(company_id, transaction_id, account_id, entry_date, description, debit, credit, is_reversed)
    VALUES (_company_id, txId, depExp, _posting_date, 'Monthly Depreciation', depAmt, 0, false),
           (_company_id, txId, accDep, _posting_date, 'Accumulated Depreciation', 0, depAmt, false);

    UPDATE public.fixed_assets SET accumulated_depreciation = COALESCE(accumulated_depreciation,0) + depAmt WHERE id=a.id;
    RETURN QUERY SELECT a.id, depAmt;
  END LOOP;
END;
$$;