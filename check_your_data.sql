-- Check your specific user data and company assignment
-- Run this to see your current user context and company

-- Get your current user ID
SELECT 'CURRENT USER:' as info, auth.uid() as user_id;

-- Check your profile and company assignment
SELECT 'YOUR PROFILE:' as info, 
  p.id, 
  p.user_id, 
  p.company_id, 
  p.full_name,
  c.name as company_name
FROM public.profiles p
LEFT JOIN public.companies c ON p.company_id = c.id
WHERE p.user_id = auth.uid();

-- Check if you have fixed assets for your company
SELECT 'YOUR ASSETS:' as info, 
  status, 
  COUNT(*) as count
FROM public.fixed_assets fa
WHERE fa.company_id = (
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
)
GROUP BY status;

-- Check your chart of accounts
SELECT 'YOUR ACCOUNTS:' as info, 
  account_code, 
  account_name, 
  account_type
FROM public.chart_of_accounts ca
WHERE ca.company_id = (
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
)
AND account_code IN ('6100', '1590')
ORDER BY account_code;