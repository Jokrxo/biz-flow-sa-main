-- Fix search_path for update_bank_balance function
CREATE OR REPLACE FUNCTION update_bank_balance(
  _bank_account_id UUID,
  _amount NUMERIC,
  _operation TEXT
)
RETURNS VOID AS $$
BEGIN
  IF _operation = 'add' THEN
    UPDATE bank_accounts
    SET current_balance = current_balance + _amount,
        updated_at = NOW()
    WHERE id = _bank_account_id;
  ELSIF _operation = 'subtract' THEN
    UPDATE bank_accounts
    SET current_balance = current_balance - _amount,
        updated_at = NOW()
    WHERE id = _bank_account_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';