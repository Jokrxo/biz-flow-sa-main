-- Update cash flow function to include Fixed Deposits and Investment Assets in investing activities
CREATE OR REPLACE FUNCTION public.generate_cash_flow(_company_id UUID, _period_start DATE, _period_end DATE)
RETURNS TABLE(
  operating_activities NUMERIC,
  investing_activities NUMERIC,
  financing_activities NUMERIC,
  net_cash_flow NUMERIC,
  opening_cash NUMERIC,
  closing_cash NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_net_profit NUMERIC;
  v_depreciation NUMERIC;
  v_receivables_change NUMERIC;
  v_payables_change NUMERIC;
  v_operating NUMERIC;
  v_investing NUMERIC;
  v_financing NUMERIC;
  v_opening_cash NUMERIC;
  v_closing_cash NUMERIC;
BEGIN
  SELECT COALESCE(
    (SELECT SUM(te.credit - te.debit)
     FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     JOIN chart_of_accounts coa ON coa.id = te.account_id
     WHERE t.company_id = _company_id
       AND t.transaction_date BETWEEN _period_start AND _period_end
       AND coa.account_type = 'Income'
       AND t.status = 'posted')
    -
    (SELECT SUM(te.debit - te.credit)
     FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     JOIN chart_of_accounts coa ON coa.id = te.account_id
     WHERE t.company_id = _company_id
       AND t.transaction_date BETWEEN _period_start AND _period_end
       AND coa.account_type = 'Expense'
       AND t.status = 'posted'),
    0
  ) INTO v_net_profit;

  SELECT COALESCE(SUM(te.debit), 0) INTO v_depreciation
  FROM transaction_entries te
  JOIN transactions t ON t.id = te.transaction_id
  JOIN chart_of_accounts coa ON coa.id = te.account_id
  WHERE t.company_id = _company_id
    AND t.transaction_date BETWEEN _period_start AND _period_end
    AND coa.account_name ILIKE '%depreciation%'
    AND t.status = 'posted';

  SELECT COALESCE(
    (SELECT SUM(te.debit - te.credit)
     FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     JOIN chart_of_accounts coa ON coa.id = te.account_id
     WHERE t.company_id = _company_id
       AND t.transaction_date BETWEEN _period_start AND _period_end
       AND coa.account_name ILIKE '%receivable%'
       AND t.status = 'posted'),
    0
  ) INTO v_receivables_change;

  SELECT COALESCE(
    (SELECT SUM(te.credit - te.debit)
     FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     JOIN chart_of_accounts coa ON coa.id = te.account_id
     WHERE t.company_id = _company_id
       AND t.transaction_date BETWEEN _period_start AND _period_end
       AND coa.account_name ILIKE '%payable%'
       AND t.status = 'posted'),
    0
  ) INTO v_payables_change;

  v_operating := v_net_profit + v_depreciation - v_receivables_change + v_payables_change;

  -- Investing Activities: include Fixed Assets, Fixed Deposits and Investment Assets
  SELECT COALESCE(
    (SELECT SUM(te.debit - te.credit)
     FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     JOIN chart_of_accounts coa ON coa.id = te.account_id
     WHERE t.company_id = _company_id
       AND t.transaction_date BETWEEN _period_start AND _period_end
       AND (
         coa.account_name ILIKE '%fixed asset%'
         OR coa.account_name ILIKE '%fixed deposit%'
         OR coa.account_name ILIKE '%investment%'
       )
       AND coa.account_type = 'Asset'
       AND t.status = 'posted'),
    0
  ) * -1 INTO v_investing;

  SELECT COALESCE(
    (SELECT SUM(te.credit - te.debit)
     FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     JOIN chart_of_accounts coa ON coa.id = te.account_id
     WHERE t.company_id = _company_id
       AND t.transaction_date BETWEEN _period_start AND _period_end
       AND (coa.account_name ILIKE '%loan%' OR coa.account_name ILIKE '%capital%')
       AND t.status = 'posted'),
    0
  ) INTO v_financing;

  SELECT COALESCE(
    (SELECT SUM(te.debit - te.credit)
     FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     JOIN chart_of_accounts coa ON coa.id = te.account_id
     WHERE t.company_id = _company_id
       AND t.transaction_date < _period_start
       AND (coa.account_name ILIKE '%cash%' OR coa.account_name ILIKE '%bank%')
       AND coa.account_type = 'Asset'
       AND t.status = 'posted'),
    0
  ) INTO v_opening_cash;

  v_closing_cash := v_opening_cash + v_operating + v_investing + v_financing;

  RETURN QUERY SELECT 
    v_operating,
    v_investing,
    v_financing,
    (v_operating + v_investing + v_financing),
    v_opening_cash,
    v_closing_cash;
END;
$$;
