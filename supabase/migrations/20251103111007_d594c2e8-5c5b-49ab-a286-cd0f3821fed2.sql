-- ================================================================
-- PHASE 3: PRODUCTION TAX MODULE - VAT/PAYE AUTOMATION
-- ================================================================

-- 1. Create tax_periods table for period management
CREATE TABLE IF NOT EXISTS public.tax_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL, -- 'vat', 'paye', 'income_tax'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open, closed, submitted, locked
  submission_date DATE,
  submitted_by UUID REFERENCES auth.users(id),
  vat_input_total NUMERIC DEFAULT 0,
  vat_output_total NUMERIC DEFAULT 0,
  vat_payable NUMERIC DEFAULT 0,
  paye_total NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by UUID REFERENCES auth.users(id),
  
  CONSTRAINT valid_period_type CHECK (period_type IN ('vat', 'paye', 'income_tax')),
  CONSTRAINT valid_period_status CHECK (status IN ('open', 'closed', 'submitted', 'locked')),
  CONSTRAINT valid_period_dates CHECK (period_end >= period_start)
);

CREATE INDEX idx_tax_periods_company ON public.tax_periods(company_id);
CREATE INDEX idx_tax_periods_dates ON public.tax_periods(period_start, period_end);
CREATE INDEX idx_tax_periods_type ON public.tax_periods(period_type);

ALTER TABLE public.tax_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tax periods in their company"
  ON public.tax_periods FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage tax periods"
  ON public.tax_periods FOR ALL
  USING (
    has_role(auth.uid(), 'administrator'::app_role, company_id) 
    OR has_role(auth.uid(), 'accountant'::app_role, company_id)
  );

-- 2. Add VAT fields to transactions table
ALTER TABLE public.transactions 
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_inclusive BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tax_period_id UUID REFERENCES public.tax_periods(id),
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC DEFAULT 0;

-- 3. Function to calculate VAT amounts
CREATE OR REPLACE FUNCTION public.calculate_vat_amounts(
  _total_amount NUMERIC,
  _vat_rate NUMERIC,
  _vat_inclusive BOOLEAN
)
RETURNS TABLE(
  base_amount NUMERIC,
  vat_amount NUMERIC,
  total_amount NUMERIC
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base NUMERIC;
  v_vat NUMERIC;
  v_total NUMERIC;
BEGIN
  IF _vat_inclusive THEN
    -- Total includes VAT: Base = Total / (1 + VAT%), VAT = Total - Base
    v_base := _total_amount / (1 + (_vat_rate / 100));
    v_vat := _total_amount - v_base;
    v_total := _total_amount;
  ELSE
    -- Total excludes VAT: VAT = Total * VAT%, Total = Base + VAT
    v_base := _total_amount;
    v_vat := _total_amount * (_vat_rate / 100);
    v_total := v_base + v_vat;
  END IF;
  
  RETURN QUERY SELECT v_base, v_vat, v_total;
END;
$$;

-- 4. Function to auto-post VAT entries
CREATE OR REPLACE FUNCTION public.post_vat_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vat_input_account UUID;
  v_vat_output_account UUID;
  v_vat_calculated RECORD;
BEGIN
  -- Only process if VAT rate > 0 and transaction is approved
  IF NEW.vat_rate IS NULL OR NEW.vat_rate = 0 OR NEW.status NOT IN ('approved', 'posted') THEN
    RETURN NEW;
  END IF;
  
  -- Calculate VAT amounts
  SELECT * INTO v_vat_calculated
  FROM calculate_vat_amounts(NEW.total_amount, NEW.vat_rate, COALESCE(NEW.vat_inclusive, FALSE));
  
  -- Update transaction with calculated amounts
  UPDATE transactions
  SET 
    base_amount = v_vat_calculated.base_amount,
    vat_amount = v_vat_calculated.vat_amount
  WHERE id = NEW.id;
  
  -- Get VAT accounts
  -- VAT Input (asset/debit) for purchases/expenses
  SELECT id INTO v_vat_input_account
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND (account_name ILIKE '%VAT Input%' OR account_name ILIKE '%VAT Receivable%')
    AND is_active = TRUE
  LIMIT 1;
  
  -- VAT Output (liability/credit) for sales/revenue
  SELECT id INTO v_vat_output_account
  FROM chart_of_accounts
  WHERE company_id = NEW.company_id
    AND (account_name ILIKE '%VAT Output%' OR account_name ILIKE '%VAT Payable%' OR account_code = '2200')
    AND is_active = TRUE
  LIMIT 1;
  
  -- Create VAT Input account if not exists (for purchases)
  IF v_vat_input_account IS NULL THEN
    INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_system)
    VALUES (NEW.company_id, '1210', 'VAT Input / Receivable', 'asset', 'debit', TRUE, TRUE)
    RETURNING id INTO v_vat_input_account;
  END IF;
  
  -- Create VAT Output/Payable account if not exists (for sales)
  IF v_vat_output_account IS NULL AND EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = NEW.company_id AND account_code = '2200') THEN
    SELECT id INTO v_vat_output_account FROM chart_of_accounts WHERE company_id = NEW.company_id AND account_code = '2200';
  ELSIF v_vat_output_account IS NULL THEN
    INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_system)
    VALUES (NEW.company_id, '2200', 'VAT Payable / Output', 'liability', 'credit', TRUE, TRUE)
    RETURNING id INTO v_vat_output_account;
  END IF;
  
  -- Post VAT ledger entries based on transaction type
  IF NEW.transaction_type IN ('expense', 'purchase', 'bill') THEN
    -- For purchases: Dr VAT Input (asset increases)
    INSERT INTO ledger_entries (
      company_id, transaction_id, account_id, reference_id, entry_date,
      description, debit, credit, entry_type, posted_by, audit_notes
    ) VALUES (
      NEW.company_id, NEW.id, v_vat_input_account, 
      COALESCE(NEW.reference_number, 'VAT-' || NEW.id),
      NEW.transaction_date,
      'VAT Input on ' || NEW.description,
      v_vat_calculated.vat_amount, 0, 'vat', NEW.user_id,
      'Auto-posted VAT input from transaction ' || NEW.id
    );
  ELSIF NEW.transaction_type IN ('income', 'sale', 'invoice') THEN
    -- For sales: Cr VAT Output (liability increases)
    INSERT INTO ledger_entries (
      company_id, transaction_id, account_id, reference_id, entry_date,
      description, debit, credit, entry_type, posted_by, audit_notes
    ) VALUES (
      NEW.company_id, NEW.id, v_vat_output_account,
      COALESCE(NEW.reference_number, 'VAT-' || NEW.id),
      NEW.transaction_date,
      'VAT Output on ' || NEW.description,
      0, v_vat_calculated.vat_amount, 'vat', NEW.user_id,
      'Auto-posted VAT output from transaction ' || NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for VAT posting
DROP TRIGGER IF EXISTS trigger_post_vat_entries ON public.transactions;
CREATE TRIGGER trigger_post_vat_entries
  AFTER INSERT OR UPDATE OF status, vat_rate ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION post_vat_entries();

-- 5. Function to settle VAT for a period
CREATE OR REPLACE FUNCTION public.settle_vat_period(_tax_period_id UUID)
RETURNS TABLE(
  success BOOLEAN,
  vat_input NUMERIC,
  vat_output NUMERIC,
  vat_payable NUMERIC,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_input_total NUMERIC := 0;
  v_output_total NUMERIC := 0;
  v_payable NUMERIC := 0;
  v_vat_input_account UUID;
  v_vat_output_account UUID;
  v_sars_payable_account UUID;
  v_transaction_id UUID;
BEGIN
  -- Get period details
  SELECT * INTO v_period FROM tax_periods WHERE id = _tax_period_id;
  
  IF v_period IS NULL THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 'Tax period not found'::TEXT;
    RETURN;
  END IF;
  
  IF v_period.status = 'locked' THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 'Period is locked'::TEXT;
    RETURN;
  END IF;
  
  -- Get VAT Input total
  SELECT COALESCE(SUM(debit - credit), 0) INTO v_input_total
  FROM ledger_entries le
  JOIN chart_of_accounts coa ON coa.id = le.account_id
  WHERE le.company_id = v_period.company_id
    AND le.entry_date BETWEEN v_period.period_start AND v_period.period_end
    AND (coa.account_name ILIKE '%VAT Input%' OR coa.account_name ILIKE '%VAT Receivable%')
    AND le.entry_type = 'vat'
    AND le.is_reversed = FALSE;
  
  -- Get VAT Output total
  SELECT COALESCE(SUM(credit - debit), 0) INTO v_output_total
  FROM ledger_entries le
  JOIN chart_of_accounts coa ON coa.id = le.account_id
  WHERE le.company_id = v_period.company_id
    AND le.entry_date BETWEEN v_period.period_start AND v_period.period_end
    AND (coa.account_name ILIKE '%VAT Output%' OR coa.account_name ILIKE '%VAT Payable%' OR coa.account_code = '2200')
    AND le.entry_type = 'vat'
    AND le.is_reversed = FALSE;
  
  -- Calculate payable: Output - Input (positive = owe SARS, negative = refund due)
  v_payable := v_output_total - v_input_total;
  
  -- Update period
  UPDATE tax_periods
  SET 
    vat_input_total = v_input_total,
    vat_output_total = v_output_total,
    vat_payable = v_payable,
    status = 'closed',
    updated_at = NOW()
  WHERE id = _tax_period_id;
  
  -- Get accounts for settlement entry
  SELECT id INTO v_vat_input_account FROM chart_of_accounts 
  WHERE company_id = v_period.company_id AND (account_name ILIKE '%VAT Input%' OR account_name ILIKE '%VAT Receivable%') LIMIT 1;
  
  SELECT id INTO v_vat_output_account FROM chart_of_accounts 
  WHERE company_id = v_period.company_id AND (account_name ILIKE '%VAT Output%' OR account_code = '2200') LIMIT 1;
  
  -- Get or create SARS Payable account
  SELECT id INTO v_sars_payable_account FROM chart_of_accounts
  WHERE company_id = v_period.company_id AND account_name ILIKE '%SARS%' AND account_type = 'liability' LIMIT 1;
  
  IF v_sars_payable_account IS NULL THEN
    INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_system)
    VALUES (v_period.company_id, '2210', 'SARS Payable', 'liability', 'credit', TRUE, TRUE)
    RETURNING id INTO v_sars_payable_account;
  END IF;
  
  -- Create settlement transaction
  INSERT INTO transactions (
    company_id, user_id, transaction_date, description, reference_number,
    total_amount, transaction_type, category, status
  ) VALUES (
    v_period.company_id, auth.uid(), v_period.period_end,
    'VAT Settlement for period ' || v_period.period_start || ' to ' || v_period.period_end,
    'VAT-SETTLE-' || _tax_period_id,
    ABS(v_payable), 'vat', 'VAT Settlement', 'approved'
  ) RETURNING id INTO v_transaction_id;
  
  -- Post settlement entries
  IF v_payable > 0 THEN
    -- Owe SARS: Dr VAT Output, Cr SARS Payable
    INSERT INTO ledger_entries (company_id, transaction_id, account_id, reference_id, entry_date, description, debit, credit, entry_type, posted_by)
    VALUES 
      (v_period.company_id, v_transaction_id, v_vat_output_account, 'VAT-SETTLE-' || _tax_period_id, v_period.period_end, 'VAT Output Settlement', v_payable, 0, 'vat', auth.uid()),
      (v_period.company_id, v_transaction_id, v_sars_payable_account, 'VAT-SETTLE-' || _tax_period_id, v_period.period_end, 'SARS VAT Payable', 0, v_payable, 'vat', auth.uid());
  ELSE
    -- Refund due: Dr SARS Receivable, Cr VAT Input
    INSERT INTO ledger_entries (company_id, transaction_id, account_id, reference_id, entry_date, description, debit, credit, entry_type, posted_by)
    VALUES 
      (v_period.company_id, v_transaction_id, v_sars_payable_account, 'VAT-SETTLE-' || _tax_period_id, v_period.period_end, 'SARS VAT Receivable', ABS(v_payable), 0, 'vat', auth.uid()),
      (v_period.company_id, v_transaction_id, v_vat_input_account, 'VAT-SETTLE-' || _tax_period_id, v_period.period_end, 'VAT Input Settlement', 0, ABS(v_payable), 'vat', auth.uid());
  END IF;
  
  RETURN QUERY SELECT 
    TRUE,
    v_input_total,
    v_output_total,
    v_payable,
    'VAT period settled successfully'::TEXT;
END;
$$;

-- 6. Add triggers for updated_at
CREATE TRIGGER update_tax_periods_updated_at
  BEFORE UPDATE ON public.tax_periods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();