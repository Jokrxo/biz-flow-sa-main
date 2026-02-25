-- Fix Security Definer View issue
-- Recreate trial_balance_summary view with security_invoker=on to respect RLS policies

DROP VIEW IF EXISTS trial_balance_summary;

CREATE VIEW trial_balance_summary 
WITH (security_invoker=on)
AS
SELECT 
  coa.company_id,
  coa.id as account_id,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.normal_balance,
  COALESCE(SUM(te.debit), 0) as total_debits,
  COALESCE(SUM(te.credit), 0) as total_credits,
  CASE 
    WHEN coa.normal_balance = 'debit' THEN COALESCE(SUM(te.debit) - SUM(te.credit), 0)
    ELSE COALESCE(SUM(te.credit) - SUM(te.debit), 0)
  END as balance
FROM chart_of_accounts coa
LEFT JOIN transaction_entries te ON te.account_id = coa.id
LEFT JOIN transactions t ON t.id = te.transaction_id AND t.status IN ('posted', 'approved')
WHERE coa.is_active = true
GROUP BY coa.company_id, coa.id, coa.account_code, coa.account_name, coa.account_type, coa.normal_balance
ORDER BY coa.account_code;