-- RPCs to post Sent and Paid invoices to ledger with exact accounts
CREATE OR REPLACE FUNCTION public.post_invoice_sent(
  _invoice_id UUID,
  _post_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  ar_id UUID;
  rev_id UUID;
  vat_id UUID;
  tx_id UUID;
  v_subtotal NUMERIC;
  v_tax NUMERIC;
  v_total NUMERIC;
  v_user UUID;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = _invoice_id;
  IF inv IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  PERFORM ensure_core_accounts(inv.company_id);
  SELECT id INTO ar_id FROM chart_of_accounts WHERE company_id = inv.company_id AND account_code = '1200' AND account_type = 'asset' LIMIT 1;
  SELECT id INTO rev_id FROM chart_of_accounts WHERE company_id = inv.company_id AND account_code = '4000' AND account_type = 'revenue' LIMIT 1;
  SELECT id INTO vat_id FROM chart_of_accounts WHERE company_id = inv.company_id AND account_code IN ('2200','2210') AND account_type = 'liability' LIMIT 1;

  IF ar_id IS NULL OR rev_id IS NULL THEN
    RAISE EXCEPTION 'Core accounts missing (AR 1200 or Revenue 4000)';
  END IF;

  v_subtotal := COALESCE(inv.subtotal, 0);
  v_tax := COALESCE(inv.tax_amount, 0);
  v_total := COALESCE(inv.total_amount, 0);

  SELECT auth.uid() INTO v_user;
  IF v_user IS NULL THEN
    SELECT user_id INTO v_user FROM profiles WHERE company_id = inv.company_id LIMIT 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM transactions 
    WHERE company_id = inv.company_id 
      AND reference_number = inv.invoice_number
      AND description ILIKE 'Invoice % sent%'
  ) THEN
    RETURN; -- already posted
  END IF;

  INSERT INTO transactions (company_id, user_id, transaction_date, description, reference_number, total_amount, status)
  VALUES (
    inv.company_id,
    v_user,
    COALESCE(_post_date, inv.invoice_date),
    'Invoice ' || inv.invoice_number || ' sent to ' || COALESCE(inv.customer_name, 'customer'),
    inv.invoice_number,
    v_total,
    'posted'
  ) RETURNING id INTO tx_id;

  INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
  VALUES
    (tx_id, ar_id, v_total, 0, 'Invoice ' || inv.invoice_number, 'approved'),
    (tx_id, rev_id, 0, v_subtotal, 'Invoice ' || inv.invoice_number, 'approved');
  IF vat_id IS NOT NULL AND v_tax > 0 THEN
    INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
    VALUES (tx_id, vat_id, 0, v_tax, 'Invoice ' || inv.invoice_number || ' VAT', 'approved');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_invoice_paid(
  _invoice_id UUID,
  _payment_date DATE,
  _bank_account_id UUID,
  _amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  ar_id UUID;
  bank_id UUID;
  tx_id UUID;
  v_user UUID;
  outstanding NUMERIC;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = _invoice_id;
  IF inv IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  PERFORM ensure_core_accounts(inv.company_id);
  SELECT id INTO ar_id FROM chart_of_accounts WHERE company_id = inv.company_id AND account_code = '1200' AND account_type = 'asset' LIMIT 1;
  SELECT id INTO bank_id FROM chart_of_accounts WHERE company_id = inv.company_id AND account_code = '1100' AND account_type = 'asset' LIMIT 1;
  IF ar_id IS NULL OR bank_id IS NULL THEN
    RAISE EXCEPTION 'Core accounts missing (AR 1200 or Bank 1100)';
  END IF;

  IF _bank_account_id IS NULL THEN
    RAISE EXCEPTION 'Bank account is required';
  END IF;

  SELECT auth.uid() INTO v_user;
  IF v_user IS NULL THEN
    SELECT user_id INTO v_user FROM profiles WHERE company_id = inv.company_id LIMIT 1;
  END IF;

  outstanding := GREATEST(0, COALESCE(inv.total_amount,0) - COALESCE(inv.amount_paid,0));
  IF _amount IS NULL OR _amount <= 0 OR _amount > outstanding THEN
    RAISE EXCEPTION 'Invalid payment amount';
  END IF;

  IF EXISTS (
    SELECT 1 FROM transactions 
    WHERE company_id = inv.company_id 
      AND reference_number = inv.invoice_number
      AND description ILIKE 'Invoice % payment%'
      AND total_amount = _amount
  ) THEN
    RETURN; -- already posted
  END IF;

  INSERT INTO transactions (company_id, user_id, transaction_date, description, reference_number, total_amount, status, bank_account_id)
  VALUES (
    inv.company_id,
    v_user,
    COALESCE(_payment_date, inv.invoice_date),
    'Invoice ' || inv.invoice_number || ' payment',
    inv.invoice_number,
    _amount,
    'posted',
    _bank_account_id
  ) RETURNING id INTO tx_id;

  INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
  VALUES
    (tx_id, bank_id, _amount, 0, 'Payment ' || inv.invoice_number, 'approved'),
    (tx_id, ar_id, 0, _amount, 'Payment ' || inv.invoice_number, 'approved');

  PERFORM update_bank_balance(_bank_account_id, _amount, 'add');

  UPDATE invoices
  SET amount_paid = COALESCE(inv.amount_paid,0) + _amount,
      status = CASE WHEN (COALESCE(inv.amount_paid,0) + _amount) >= COALESCE(inv.total_amount,0) THEN 'paid' ELSE 'sent' END,
      paid_at = COALESCE(_payment_date, inv.paid_at)
  WHERE id = _invoice_id;
END;
$$;