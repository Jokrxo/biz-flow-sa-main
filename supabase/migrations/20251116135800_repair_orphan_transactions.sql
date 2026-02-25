CREATE OR REPLACE FUNCTION public.repair_orphan_transactions(_company_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t RECORD;
DECLARE cnt INTEGER := 0;
DECLARE bank UUID;
DECLARE income UUID;
DECLARE expense UUID;
BEGIN
  SELECT id INTO bank FROM chart_of_accounts WHERE company_id=_company_id AND account_type='asset' AND lower(account_name) LIKE '%bank%' LIMIT 1;
  SELECT id INTO income FROM chart_of_accounts WHERE company_id=_company_id AND account_type='income' LIMIT 1;
  SELECT id INTO expense FROM chart_of_accounts WHERE company_id=_company_id AND account_type='expense' LIMIT 1;

  FOR t IN
    SELECT * FROM transactions tx
    WHERE tx.company_id=_company_id AND NOT EXISTS (
      SELECT 1 FROM transaction_entries te WHERE te.transaction_id = tx.id
    )
  LOOP
    IF bank IS NULL THEN CONTINUE; END IF;
    IF t.total_amount IS NULL THEN CONTINUE; END IF;

    IF t.total_amount >= 0 THEN
      IF income IS NULL THEN CONTINUE; END IF;
      INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
      VALUES (t.id, bank, t.total_amount, 0, COALESCE(t.description,'Auto-generated'), 'approved'),
             (t.id, income, 0, t.total_amount, COALESCE(t.description,'Auto-generated'), 'approved');
    ELSE
      IF expense IS NULL THEN CONTINUE; END IF;
      INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
      VALUES (t.id, expense, ABS(t.total_amount), 0, COALESCE(t.description,'Auto-generated'), 'approved'),
             (t.id, bank, 0, ABS(t.total_amount), COALESCE(t.description,'Auto-generated'), 'approved');
    END IF;

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;