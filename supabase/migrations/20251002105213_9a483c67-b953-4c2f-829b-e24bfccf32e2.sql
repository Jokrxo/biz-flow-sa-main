-- Create bank_accounts table
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for bank_accounts
CREATE POLICY "Administrators and accountants can manage bank accounts"
ON public.bank_accounts
FOR ALL
USING (has_role(auth.uid(), 'administrator'::app_role, company_id) OR has_role(auth.uid(), 'accountant'::app_role, company_id));

CREATE POLICY "Users can view bank accounts in their company"
ON public.bank_accounts
FOR SELECT
USING (company_id = get_user_company(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_bank_accounts_updated_at
BEFORE UPDATE ON public.bank_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();