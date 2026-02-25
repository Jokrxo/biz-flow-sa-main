-- Debug script using your actual company ID from your profile
-- This will show exactly what's happening with your data

-- Get your company ID first
WITH my_company AS (
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
)
SELECT 'Running diagnostics for company:' as info, 
       mc.company_id,
       c.name as company_name
FROM my_company mc
LEFT JOIN public.companies c ON c.id = mc.company_id;

-- Now run the debug depreciation function with your company ID
WITH my_company AS (
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
)
SELECT * FROM public.post_monthly_depreciation_debug(
  (SELECT company_id FROM my_company LIMIT 1), 
  CURRENT_DATE
);