-- Add notes column to transactions table
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add other useful columns that might be missing
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS payment_method TEXT;

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.companies(id);

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.companies(id);

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS transaction_type TEXT;

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.bank_accounts(id);
