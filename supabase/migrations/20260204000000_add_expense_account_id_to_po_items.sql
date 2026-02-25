-- Add expense_account_id to purchase_order_items
ALTER TABLE public.purchase_order_items 
ADD COLUMN IF NOT EXISTS expense_account_id uuid REFERENCES public.chart_of_accounts(id);
