-- Add paid tracking columns to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_at DATE NULL,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0 NOT NULL;

-- Optional: ensure status values if you use partially_paid in UI (no strict constraint added)
-- You can add a CHECK later if desired.