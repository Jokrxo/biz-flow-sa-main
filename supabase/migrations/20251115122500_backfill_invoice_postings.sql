-- Backfill postings for existing invoices into transactions and transaction_entries
CREATE OR REPLACE FUNCTION public.backfill_invoice_postings(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  inv RECORD;
  v_user_id UUID;
  ar_id UUID;
  rev_id UUID;
  vat_id UUID;
  bank_id UUID;
  tx_id UUID;
  v_subtotal NUMERIC;
  v_tax NUMERIC;
  v_total NUMERIC;
  v_pay NUMERIC;
BEGIN
  -- Resolve accounts by standard codes; create if missing
  PERFORM ensure_core_accounts(_company_id);

  SELECT id INTO ar_id FROM chart_of_accounts WHERE company_id = _company_id AND account_code = '1200' LIMIT 1;
  SELECT id INTO rev_id FROM chart_of_accounts WHERE company_id = _company_id AND account_code = '4000' LIMIT 1;
  SELECT id INTO vat_id FROM chart_of_accounts WHERE company_id = _company_id AND account_code IN ('2200','2210') LIMIT 1;
  SELECT id INTO bank_id FROM chart_of_accounts WHERE company_id = _company_id AND account_code = '1100' LIMIT 1;

  -- Find a user in the company to attribute postings
  SELECT user_id INTO v_user_id FROM profiles WHERE company_id = _company_id LIMIT 1;

  FOR inv IN SELECT * FROM invoices WHERE company_id = _company_id LOOP
    v_subtotal := COALESCE(inv.subtotal, 0);
    v_tax := COALESCE(inv.tax_amount, 0);
    v_total := COALESCE(inv.total_amount, 0);
    v_pay := COALESCE(inv.amount_paid, 0);

    -- Revenue/Receivable posting when invoice was sent
    IF (inv.status = 'sent' OR inv.sent_at IS NOT NULL) THEN
      IF NOT EXISTS (
        SELECT 1 FROM transactions 
        WHERE company_id = _company_id 
          AND reference_number = inv.invoice_number 
          AND description ILIKE 'Invoice % sent%'
      ) THEN
        INSERT INTO transactions (company_id, user_id, transaction_date, description, reference_number, total_amount, status)
        VALUES (
          _company_id,
          v_user_id,
          COALESCE(inv.sent_at, inv.invoice_date),
          'Invoice ' || inv.invoice_number || ' sent to ' || COALESCE(inv.customer_name, 'customer'),
          inv.invoice_number,
          v_total,
          'posted'
        )
        RETURNING id INTO tx_id;

        IF tx_id IS NOT NULL THEN
          INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
          VALUES
            (tx_id, ar_id, v_total, 0, 'Invoice ' || inv.invoice_number, 'approved'),
            (tx_id, rev_id, 0, v_subtotal, 'Invoice ' || inv.invoice_number, 'approved');
          IF vat_id IS NOT NULL AND v_tax > 0 THEN
            INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
            VALUES (tx_id, vat_id, 0, v_tax, 'Invoice ' || inv.invoice_number || ' VAT', 'approved');
          END IF;
        END IF;
      END IF;
    END IF;

    -- Payment posting when amount_paid > 0
    IF v_pay > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM transactions 
        WHERE company_id = _company_id 
          AND reference_number = inv.invoice_number 
          AND description ILIKE 'Invoice % payment%'
      ) THEN
        INSERT INTO transactions (company_id, user_id, transaction_date, description, reference_number, total_amount, status)
        VALUES (
          _company_id,
          v_user_id,
          COALESCE(inv.paid_at, inv.invoice_date),
          'Invoice ' || inv.invoice_number || ' payment',
          inv.invoice_number,
          v_pay,
          'posted'
        )
        RETURNING id INTO tx_id;

        IF tx_id IS NOT NULL THEN
          INSERT INTO transaction_entries (transaction_id, account_id, debit, credit, description, status)
          VALUES
            (tx_id, bank_id, v_pay, 0, 'Payment ' || inv.invoice_number, 'approved'),
            (tx_id, ar_id, 0, v_pay, 'Payment ' || inv.invoice_number, 'approved');
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;