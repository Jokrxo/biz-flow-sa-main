-- Function to initialize default Chart of Accounts for a new company
CREATE OR REPLACE FUNCTION public.initialize_company_coa(_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Assets
  INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type, is_active) VALUES
  (_company_id, '1000', 'Cash', 'Asset', true),
  (_company_id, '1100', 'Bank', 'Asset', true),
  (_company_id, '1200', 'Accounts Receivable', 'Asset', true),
  (_company_id, '1500', 'Fixed Assets', 'Asset', true),
  
  -- Liabilities
  (_company_id, '2000', 'Accounts Payable', 'Liability', true),
  (_company_id, '2100', 'Loans Payable', 'Liability', true),
  
  -- Equity
  (_company_id, '3000', 'Owner''s Capital', 'Equity', true),
  (_company_id, '3100', 'Retained Earnings', 'Equity', true),
  
  -- Income
  (_company_id, '4000', 'Sales Revenue', 'Income', true),
  (_company_id, '4100', 'Service Income', 'Income', true),
  
  -- Expenses
  (_company_id, '5000', 'Rent Expense', 'Expense', true),
  (_company_id, '5100', 'Utilities Expense', 'Expense', true),
  (_company_id, '5200', 'Salaries Expense', 'Expense', true),
  (_company_id, '5300', 'Depreciation Expense', 'Expense', true);
END;
$$;

-- Function to auto-initialize CoA when a new company is created
CREATE OR REPLACE FUNCTION public.handle_new_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Initialize Chart of Accounts for the new company
  PERFORM public.initialize_company_coa(NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger to automatically initialize CoA on company creation
DROP TRIGGER IF EXISTS on_company_created ON public.companies;
CREATE TRIGGER on_company_created
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_company();

-- Function to validate trial balance
CREATE OR REPLACE FUNCTION public.validate_trial_balance(_company_id UUID, _period_start DATE, _period_end DATE)
RETURNS TABLE(is_balanced BOOLEAN, total_debits NUMERIC, total_credits NUMERIC, difference NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_debits NUMERIC;
  v_total_credits NUMERIC;
  v_difference NUMERIC;
BEGIN
  SELECT 
    COALESCE(SUM(te.debit), 0),
    COALESCE(SUM(te.credit), 0)
  INTO v_total_debits, v_total_credits
  FROM public.transaction_entries te
  JOIN public.transactions t ON t.id = te.transaction_id
  WHERE t.company_id = _company_id
    AND t.transaction_date BETWEEN _period_start AND _period_end
    AND t.status = 'posted';
  
  v_difference := v_total_debits - v_total_credits;
  
  RETURN QUERY SELECT 
    (ABS(v_difference) < 0.01) as is_balanced,
    v_total_debits,
    v_total_credits,
    v_difference;
END;
$$;

-- Function to generate cash flow data
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
  -- Calculate net profit (Income - Expenses)
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
  
  -- Calculate depreciation
  SELECT COALESCE(SUM(te.debit), 0) INTO v_depreciation
  FROM transaction_entries te
  JOIN transactions t ON t.id = te.transaction_id
  JOIN chart_of_accounts coa ON coa.id = te.account_id
  WHERE t.company_id = _company_id
    AND t.transaction_date BETWEEN _period_start AND _period_end
    AND coa.account_name ILIKE '%depreciation%'
    AND t.status = 'posted';
  
  -- Calculate receivables change (simplified)
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
  
  -- Calculate payables change (simplified)
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
  
  -- Operating Activities = Net Profit + Depreciation - Receivables Change + Payables Change
  v_operating := v_net_profit + v_depreciation - v_receivables_change + v_payables_change;
  
  -- Investing Activities (Fixed Assets purchases/sales)
  SELECT COALESCE(
    (SELECT SUM(te.debit - te.credit)
     FROM transaction_entries te
     JOIN transactions t ON t.id = te.transaction_id
     JOIN chart_of_accounts coa ON coa.id = te.account_id
     WHERE t.company_id = _company_id
       AND t.transaction_date BETWEEN _period_start AND _period_end
       AND coa.account_name ILIKE '%fixed asset%'
       AND t.status = 'posted'),
    0
  ) * -1 INTO v_investing;
  
  -- Financing Activities (Loans and Capital)
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
  
  -- Opening cash (sum of all bank/cash before period)
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
  
  -- Closing cash
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