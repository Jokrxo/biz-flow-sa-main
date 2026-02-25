-- Check fixed assets status and details
SELECT 
  id,
  description,
  cost,
  purchase_date,
  useful_life_years,
  accumulated_depreciation,
  status,
  depreciation_method,
  residual_value,
  company_id
FROM public.fixed_assets 
WHERE status = 'active' 
ORDER BY purchase_date DESC;