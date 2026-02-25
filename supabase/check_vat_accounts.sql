-- Check if VAT accounts exist
SELECT account_code, account_name, account_type, is_active 
FROM public.chart_of_accounts 
WHERE account_code IN ('1210', '2200', '2210')
ORDER BY account_code;

-- If the VAT accounts don't exist, run this to create them:
-- VAT Input/Receivable account (for purchases/expenses)
INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_protected)
SELECT id, '1210', 'VAT Input / Receivable', 'asset', 'debit', true, true
FROM public.companies
ON CONFLICT (company_id, account_code)
DO UPDATE SET
  account_name = EXCLUDED.account_name,
  account_type = EXCLUDED.account_type,
  normal_balance = EXCLUDED.normal_balance,
  is_active = true,
  is_protected = true;

-- VAT Output/Payable account (for sales/revenue)  
INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_protected)
SELECT id, '2200', 'VAT Payable / Output', 'liability', 'credit', true, true
FROM public.companies
ON CONFLICT (company_id, account_code)
DO UPDATE SET
  account_name = EXCLUDED.account_name,
  account_type = EXCLUDED.account_type,
  normal_balance = EXCLUDED.normal_balance,
  is_active = true,
  is_protected = true;

-- VAT Control account (for VAT settlements)
INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_protected)
SELECT id, '2210', 'VAT Control', 'liability', 'credit', true, true
FROM public.companies
ON CONFLICT (company_id, account_code)
DO UPDATE SET
  account_name = EXCLUDED.account_name,
  account_type = EXCLUDED.account_type,
  normal_balance = EXCLUDED.normal_balance,
  is_active = true,
  is_protected = true;