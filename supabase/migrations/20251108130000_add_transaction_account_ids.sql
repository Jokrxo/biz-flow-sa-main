-- ================================================================
-- Add debit_account_id and credit_account_id to transactions table
-- ================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS debit_account_id UUID REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS credit_account_id UUID REFERENCES public.chart_of_accounts(id);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_debit_account ON public.transactions(debit_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_credit_account ON public.transactions(credit_account_id);