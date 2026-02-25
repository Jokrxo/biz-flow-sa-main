-- Diagnostic script to identify depreciation issues
-- Run this in your Supabase SQL editor to see what's happening

-- First, let's get your company ID
SELECT 'Your Company ID:' as info, id, name 
FROM public.companies 
LIMIT 1;

-- Check if you have active fixed assets
SELECT 'Active Assets:' as info, COUNT(*) as count
FROM public.fixed_assets 
WHERE status = 'active' AND purchase_date <= CURRENT_DATE;

-- Check your depreciation accounts
SELECT 'Depreciation Accounts:' as info, account_code, account_name, account_type, id
FROM public.chart_of_accounts 
WHERE (account_code IN ('6100', '1590') 
       OR lower(account_name) LIKE '%depreciation%')
ORDER BY account_code;

-- Test the diagnostic function (replace <YOUR_COMPANY_ID> with your actual company ID)
-- SELECT * FROM public.diagnose_depreciation_issues('<YOUR_COMPANY_ID>');

-- Test the debug function (replace <YOUR_COMPANY_ID> with your actual company ID)  
-- SELECT * FROM public.post_monthly_depreciation_debug('<YOUR_COMPANY_ID>', CURRENT_DATE);