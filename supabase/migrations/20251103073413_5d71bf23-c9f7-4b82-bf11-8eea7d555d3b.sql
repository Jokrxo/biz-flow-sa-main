-- Add RLS policies for account_categories table
-- This table links accounts to categories but has no direct company_id,
-- so we need to check ownership through the chart_of_accounts table

-- Allow users to view account categories for accounts in their company
CREATE POLICY "Users can view account categories in their company"
ON public.account_categories
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.chart_of_accounts
    WHERE chart_of_accounts.id = account_categories.account_id
      AND chart_of_accounts.company_id = public.get_user_company(auth.uid())
  )
);

-- Allow administrators and accountants to manage account categories
CREATE POLICY "Administrators and accountants can manage account categories"
ON public.account_categories
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.chart_of_accounts
    WHERE chart_of_accounts.id = account_categories.account_id
      AND (
        public.has_role(auth.uid(), 'administrator'::app_role, chart_of_accounts.company_id)
        OR public.has_role(auth.uid(), 'accountant'::app_role, chart_of_accounts.company_id)
      )
  )
);