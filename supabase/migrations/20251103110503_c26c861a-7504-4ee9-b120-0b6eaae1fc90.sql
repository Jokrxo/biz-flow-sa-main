-- ================================================================
-- PHASE 1: AFS POSTING ENGINE - CORE FOUNDATION
-- ================================================================

-- 1. Create ledger_entries table (production-grade general ledger)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  reference_id TEXT NOT NULL, -- Links to source transaction reference
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  entry_type TEXT NOT NULL DEFAULT 'standard', -- standard, adjustment, closing, tax
  posted_by UUID REFERENCES auth.users(id),
  posted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_reversed BOOLEAN DEFAULT FALSE,
  reversed_by UUID REFERENCES auth.users(id),
  reversed_at TIMESTAMP WITH TIME ZONE,
  audit_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT ledger_debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  ),
  CONSTRAINT ledger_valid_entry_type CHECK (
    entry_type IN ('standard', 'adjustment', 'closing', 'tax', 'vat', 'paye', 'opening_balance')
  )
);

CREATE INDEX idx_ledger_company ON public.ledger_entries(company_id);
CREATE INDEX idx_ledger_transaction ON public.ledger_entries(transaction_id);
CREATE INDEX idx_ledger_account ON public.ledger_entries(account_id);
CREATE INDEX idx_ledger_date ON public.ledger_entries(entry_date);
CREATE INDEX idx_ledger_reference ON public.ledger_entries(reference_id);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ledger entries in their company"
  ON public.ledger_entries FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage ledger entries"
  ON public.ledger_entries FOR ALL
  USING (
    has_role(auth.uid(), 'administrator'::app_role, company_id) 
    OR has_role(auth.uid(), 'accountant'::app_role, company_id)
  );

-- 2. Create materialized view for real-time trial balance
CREATE MATERIALIZED VIEW IF NOT EXISTS public.trial_balance_live AS
SELECT 
  le.company_id,
  le.account_id,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.normal_balance,
  SUM(le.debit) as total_debits,
  SUM(le.credit) as total_credits,
  CASE 
    WHEN coa.normal_balance = 'debit' THEN SUM(le.debit - le.credit)
    ELSE SUM(le.credit - le.debit)
  END as balance
FROM public.ledger_entries le
JOIN public.chart_of_accounts coa ON coa.id = le.account_id
WHERE le.is_reversed = FALSE
GROUP BY le.company_id, le.account_id, coa.account_code, coa.account_name, coa.account_type, coa.normal_balance;

CREATE UNIQUE INDEX idx_trial_balance_live_unique ON public.trial_balance_live(company_id, account_id);
CREATE INDEX idx_trial_balance_live_company ON public.trial_balance_live(company_id);

-- 3. Function to validate fundamental accounting equation
CREATE OR REPLACE FUNCTION public.validate_accounting_equation(_company_id UUID)
RETURNS TABLE(
  is_valid BOOLEAN,
  total_assets NUMERIC,
  total_liabilities NUMERIC,
  total_equity NUMERIC,
  difference NUMERIC,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assets NUMERIC;
  v_liabilities NUMERIC;
  v_equity NUMERIC;
  v_diff NUMERIC;
BEGIN
  -- Calculate total assets
  SELECT COALESCE(SUM(balance), 0) INTO v_assets
  FROM trial_balance_live
  WHERE company_id = _company_id
    AND account_type = 'asset';
  
  -- Calculate total liabilities
  SELECT COALESCE(SUM(balance), 0) INTO v_liabilities
  FROM trial_balance_live
  WHERE company_id = _company_id
    AND account_type = 'liability';
  
  -- Calculate total equity
  SELECT COALESCE(SUM(balance), 0) INTO v_equity
  FROM trial_balance_live
  WHERE company_id = _company_id
    AND account_type = 'equity';
  
  -- Check if Assets = Liabilities + Equity
  v_diff := v_assets - (v_liabilities + v_equity);
  
  RETURN QUERY SELECT
    (ABS(v_diff) < 0.01) as is_valid,
    v_assets,
    v_liabilities,
    v_equity,
    v_diff,
    CASE 
      WHEN ABS(v_diff) < 0.01 THEN 'Accounting equation balanced'
      ELSE 'ERROR: Assets (' || v_assets || ') ≠ Liabilities (' || v_liabilities || ') + Equity (' || v_equity || ') | Difference: ' || v_diff
    END as error_message;
END;
$$;

-- 4. Auto-posting engine: Create ledger entries from transaction_entries
CREATE OR REPLACE FUNCTION public.post_transaction_to_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction RECORD;
  v_entry RECORD;
  v_total_debits NUMERIC := 0;
  v_total_credits NUMERIC := 0;
  v_validation RECORD;
BEGIN
  -- Get transaction details
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = NEW.id;
  
  -- Only post if status is 'posted' or 'approved'
  IF NEW.status NOT IN ('posted', 'approved') THEN
    RETURN NEW;
  END IF;
  
  -- Check if already posted to ledger
  IF EXISTS (
    SELECT 1 FROM ledger_entries 
    WHERE transaction_id = NEW.id 
    AND is_reversed = FALSE
  ) THEN
    RETURN NEW; -- Already posted
  END IF;
  
  -- Validate that transaction_entries exist and are balanced
  SELECT 
    COALESCE(SUM(debit), 0) as total_debit,
    COALESCE(SUM(credit), 0) as total_credit
  INTO v_total_debits, v_total_credits
  FROM transaction_entries
  WHERE transaction_id = NEW.id;
  
  -- Check if debits equal credits
  IF ABS(v_total_debits - v_total_credits) > 0.01 THEN
    RAISE EXCEPTION 'Transaction % is not balanced: Debits (%) ≠ Credits (%)', 
      NEW.id, v_total_debits, v_total_credits;
  END IF;
  
  -- If no entries, cannot post
  IF v_total_debits = 0 AND v_total_credits = 0 THEN
    RAISE EXCEPTION 'Transaction % has no transaction entries', NEW.id;
  END IF;
  
  -- Post each transaction_entry to ledger_entries
  FOR v_entry IN 
    SELECT * FROM transaction_entries WHERE transaction_id = NEW.id
  LOOP
    -- Post debit entry
    IF v_entry.debit > 0 THEN
      INSERT INTO ledger_entries (
        company_id,
        transaction_id,
        account_id,
        reference_id,
        entry_date,
        description,
        debit,
        credit,
        entry_type,
        posted_by,
        audit_notes
      ) VALUES (
        v_transaction.company_id,
        NEW.id,
        v_entry.account_id,
        COALESCE(v_transaction.reference_number, 'TXN-' || NEW.id),
        v_transaction.transaction_date,
        COALESCE(v_entry.description, v_transaction.description),
        v_entry.debit,
        0,
        COALESCE(v_transaction.transaction_type, 'standard'),
        v_transaction.user_id,
        'Auto-posted from transaction ' || NEW.id
      );
    END IF;
    
    -- Post credit entry
    IF v_entry.credit > 0 THEN
      INSERT INTO ledger_entries (
        company_id,
        transaction_id,
        account_id,
        reference_id,
        entry_date,
        description,
        debit,
        credit,
        entry_type,
        posted_by,
        audit_notes
      ) VALUES (
        v_transaction.company_id,
        NEW.id,
        v_entry.account_id,
        COALESCE(v_transaction.reference_number, 'TXN-' || NEW.id),
        v_transaction.transaction_date,
        COALESCE(v_entry.description, v_transaction.description),
        0,
        v_entry.credit,
        COALESCE(v_transaction.transaction_type, 'standard'),
        v_transaction.user_id,
        'Auto-posted from transaction ' || NEW.id
      );
    END IF;
  END LOOP;
  
  -- Refresh trial balance
  REFRESH MATERIALIZED VIEW CONCURRENTLY trial_balance_live;
  
  -- Validate accounting equation
  SELECT * INTO v_validation
  FROM validate_accounting_equation(v_transaction.company_id);
  
  IF NOT v_validation.is_valid THEN
    -- Log error but don't block (for now - can be made stricter)
    RAISE WARNING 'AFS Posting Warning for transaction %: %', 
      NEW.id, v_validation.error_message;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for auto-posting
DROP TRIGGER IF EXISTS trigger_post_transaction_to_ledger ON public.transactions;
CREATE TRIGGER trigger_post_transaction_to_ledger
  AFTER INSERT OR UPDATE OF status ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION post_transaction_to_ledger();

-- 5. Function to refresh AFS cache (to be called after posting)
CREATE OR REPLACE FUNCTION public.refresh_afs_cache(_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Refresh trial balance
  REFRESH MATERIALIZED VIEW CONCURRENTLY trial_balance_live;
  
  -- Log refresh
  RAISE NOTICE 'AFS cache refreshed for company %', _company_id;
END;
$$;

-- 6. Add updated_at trigger to ledger_entries
CREATE TRIGGER update_ledger_entries_updated_at
  BEFORE UPDATE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();