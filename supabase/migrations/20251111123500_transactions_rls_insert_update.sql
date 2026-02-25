-- Add RLS policies to allow company users to insert and update transactions
-- and transaction_entries, constrained to their company

-- Transactions: allow insert by authenticated users in their company
DROP POLICY IF EXISTS "Users can insert transactions in their company" ON public.transactions;
CREATE POLICY "Users can insert transactions in their company"
ON public.transactions
FOR INSERT
WITH CHECK (company_id = public.get_user_company(auth.uid()));

-- Transactions: allow update by authenticated users in their company
DROP POLICY IF EXISTS "Users can update transactions in their company" ON public.transactions;
CREATE POLICY "Users can update transactions in their company"
ON public.transactions
FOR UPDATE
USING (company_id = public.get_user_company(auth.uid()))
WITH CHECK (company_id = public.get_user_company(auth.uid()));

-- Transaction entries: allow insert by authenticated users in their company
DROP POLICY IF EXISTS "Users can insert transaction entries in their company" ON public.transaction_entries;
CREATE POLICY "Users can insert transaction entries in their company"
ON public.transaction_entries
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_entries.transaction_id
      AND t.company_id = public.get_user_company(auth.uid())
  )
);

-- Transaction entries: allow update by authenticated users in their company
DROP POLICY IF EXISTS "Users can update transaction entries in their company" ON public.transaction_entries;
CREATE POLICY "Users can update transaction entries in their company"
ON public.transaction_entries
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_entries.transaction_id
      AND t.company_id = public.get_user_company(auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_entries.transaction_id
      AND t.company_id = public.get_user_company(auth.uid())
  )
);