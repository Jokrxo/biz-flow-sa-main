-- Diagnostic function to test depreciation step by step
CREATE OR REPLACE FUNCTION public.diagnose_depreciation_issues(_company_id UUID)
RETURNS TABLE(diagnostic_type TEXT, message TEXT, details TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check 1: Active assets
  RETURN QUERY SELECT 
    'ASSET_CHECK'::TEXT, 
    'Active Assets Count'::TEXT, 
    COUNT(*)::TEXT 
  FROM public.fixed_assets 
  WHERE company_id = _company_id AND status = 'active' AND purchase_date <= CURRENT_DATE;
  
  -- Check 2: Depreciation accounts
  RETURN QUERY SELECT 
    'ACCOUNT_CHECK'::TEXT, 
    'Depreciation Expense Account'::TEXT, 
    CASE 
      WHEN EXISTS(SELECT 1 FROM public.chart_of_accounts 
                   WHERE company_id = _company_id AND (account_code='6100' OR lower(account_name) LIKE '%depreciation%')) 
      THEN 'Found' 
      ELSE 'Missing - Will be created' 
    END;
    
  RETURN QUERY SELECT 
    'ACCOUNT_CHECK'::TEXT, 
    'Accumulated Depreciation Account'::TEXT, 
    CASE 
      WHEN EXISTS(SELECT 1 FROM public.chart_of_accounts 
                   WHERE company_id = _company_id AND (account_code='1590' OR lower(account_name) LIKE '%accumulated depreciation%')) 
      THEN 'Found' 
      ELSE 'Missing - Will be created' 
    END;
  
  -- Check 3: Sample asset calculation
  RETURN QUERY SELECT 
    'CALCULATION_CHECK'::TEXT, 
    'Sample Asset Calculation'::TEXT,
    'Cost: ' || cost::TEXT || ', Life: ' || useful_life_years::TEXT || ' years, Monthly Dep: ' || 
    ROUND((cost - COALESCE(residual_value,0)) / (useful_life_years * 12)::numeric, 2)::TEXT
  FROM public.fixed_assets 
  WHERE company_id = _company_id AND status = 'active' 
  LIMIT 1;
  
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.diagnose_depreciation_issues(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diagnose_depreciation_issues(UUID) TO service_role;