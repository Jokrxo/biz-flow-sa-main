-- Add validation function to check transaction balance before insertion
CREATE OR REPLACE FUNCTION public.validate_transaction_balance(
  _debit_total NUMERIC,
  _credit_total NUMERIC
)
RETURNS TABLE(
  is_valid BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_diff NUMERIC;
BEGIN
  v_diff := ABS(_debit_total - _credit_total);
  
  IF v_diff > 0.01 THEN
    RETURN QUERY SELECT 
      FALSE,
      format('Transaction is not balanced: Debits (%s) ≠ Credits (%s). Difference: %s', 
        _debit_total, _credit_total, v_diff);
  ELSE
    RETURN QUERY SELECT TRUE, NULL::TEXT;
  END IF;
END;
$$;

-- Fix transaction entry validation to allow zero amounts for entries that are part of balanced transactions
-- The CHECK constraint should allow entries where debit=0 OR credit=0, but both can't be >0 or both can't be 0
-- However, for balanced transactions, some entries might have zero on one side

-- Ensure transaction_entries has proper constraint (already exists, but ensure it's correct)
-- This constraint already exists: check_debit_or_credit CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
-- But we need to allow entries where one is 0 and the other is also 0 for flexibility in complex transactions

-- Actually, the constraint is fine - each entry must have either debit > 0 OR credit > 0
-- The balance check is at the transaction level, not entry level

-- Note: Balance validation is handled by the post_transaction_to_ledger trigger
-- which checks balance before posting to ledger_entries
