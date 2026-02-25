-- Fix depreciation posting by ensuring accounts exist and adding better error handling
DROP FUNCTION IF EXISTS public.post_monthly_depreciation(UUID, DATE);

CREATE OR REPLACE FUNCTION public.post_monthly_depreciation(_company_id UUID, _posting_date DATE)
RETURNS TABLE(asset_id UUID, amount NUMERIC, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  a RECORD;
  depAmt NUMERIC(14,2);
  depExp UUID;
  accDep UUID;
  txId UUID;
  assetCount INTEGER := 0;
  errorMsg TEXT := '';
BEGIN
  -- Ensure depreciation accounts exist
  SELECT id INTO depExp FROM public.chart_of_accounts 
  WHERE company_id=_company_id AND (account_code='6100' OR lower(account_name) LIKE '%depreciation%') 
  LIMIT 1;
  
  SELECT id INTO accDep FROM public.chart_of_accounts 
  WHERE company_id=_company_id AND (account_code='1590' OR lower(account_name) LIKE '%accumulated depreciation%') 
  LIMIT 1;
  
  -- Create accounts if they don't exist
  IF depExp IS NULL THEN
    INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, parent_account_id, is_active)
    VALUES (_company_id, '6100', 'Depreciation Expense', 'expense', NULL, true)
    RETURNING id INTO depExp;
  END IF;
  
  IF accDep IS NULL THEN
    INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, parent_account_id, is_active)
    VALUES (_company_id, '1590', 'Accumulated Depreciation', 'asset', NULL, true)
    RETURNING id INTO accDep;
  END IF;
  
  -- Check if accounts were successfully created
  IF depExp IS NULL OR accDep IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, 0::NUMERIC, 'Failed to create depreciation accounts'::TEXT;
    RETURN;
  END IF;

  -- Process each active asset
  FOR a IN SELECT * FROM public.fixed_assets 
           WHERE company_id=_company_id 
             AND status='active' 
             AND purchase_date <= _posting_date 
  LOOP
    BEGIN
      -- Calculate depreciation amount
      IF a.depreciation_method = 'straight_line' THEN
        depAmt := ROUND( (a.cost - COALESCE(a.residual_value,0)) / (a.useful_life_years * 12)::numeric, 2 );
      ELSE
        depAmt := ROUND( (a.cost - COALESCE(a.residual_value,0)) / (a.useful_life_years * 12)::numeric, 2 );
      END IF;
      
      -- Skip if no depreciation amount
      IF depAmt IS NULL OR depAmt <= 0 THEN 
        CONTINUE; 
      END IF;

      -- Create the transaction
      INSERT INTO public.transactions(
        company_id, 
        user_id, 
        transaction_date, 
        description, 
        reference_number, 
        total_amount, 
        bank_account_id, 
        transaction_type, 
        status
      )
      VALUES (
        _company_id, 
        auth.uid(), 
        _posting_date, 
        'Monthly Depreciation - ' || COALESCE(a.description, 'Asset ' || a.id::text), 
        NULL, 
        depAmt, 
        NULL, 
        'depreciation', 
        'approved'
      )
      RETURNING id INTO txId;

      -- Create transaction entries with proper balancing
      INSERT INTO public.transaction_entries(
        transaction_id, 
        account_id, 
        debit, 
        credit, 
        description, 
        status
      )
      VALUES 
        (txId, depExp, depAmt, 0, 'Monthly Depreciation - ' || COALESCE(a.description, 'Asset ' || a.id::text), 'approved'),
        (txId, accDep, 0, depAmt, 'Accumulated Depreciation - ' || COALESCE(a.description, 'Asset ' || a.id::text), 'approved');

      -- Create ledger entries
      INSERT INTO public.ledger_entries(
        company_id, 
        transaction_id, 
        account_id, 
        entry_date, 
        description, 
        debit, 
        credit, 
        is_reversed
      )
      VALUES 
        (_company_id, txId, depExp, _posting_date, 'Monthly Depreciation', depAmt, 0, false),
        (_company_id, txId, accDep, _posting_date, 'Accumulated Depreciation', 0, depAmt, false);

      -- Update asset accumulated depreciation
      UPDATE public.fixed_assets 
      SET accumulated_depreciation = COALESCE(accumulated_depreciation,0) + depAmt 
      WHERE id = a.id;

      assetCount := assetCount + 1;
      RETURN QUERY SELECT a.id, depAmt, NULL::TEXT;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with other assets
      errorMsg := SQLERRM;
      RETURN QUERY SELECT a.id, 0::NUMERIC, 'Error processing asset: ' || errorMsg;
    END;
  END LOOP;
  
  -- If no assets processed, return informative message
  IF assetCount = 0 THEN
    RETURN QUERY SELECT NULL::UUID, 0::NUMERIC, 'No active assets found for depreciation'::TEXT;
  END IF;
  
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.post_monthly_depreciation(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_monthly_depreciation(UUID, DATE) TO service_role;