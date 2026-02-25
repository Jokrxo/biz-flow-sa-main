-- Add sent tracking column to invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sent_at DATE NULL;