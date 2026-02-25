-- Add index on transactions date for faster period filters
CREATE INDEX IF NOT EXISTS idx_transactions_company_date
  ON public.transactions(company_id, transaction_date);

-- Optional: single-column index if company_id is already covered elsewhere
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date
  ON public.transactions(transaction_date);