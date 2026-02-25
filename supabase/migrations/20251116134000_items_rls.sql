-- Enable and configure RLS for items so purchases/PO can sync products
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- Allow users to read items for their company
CREATE POLICY "Items select for company"
  ON public.items FOR SELECT
  USING (company_id = get_user_company(auth.uid()));

-- Allow administrators and accountants to insert items for their company
CREATE POLICY "Items insert by managers"
  ON public.items FOR INSERT
  WITH CHECK (
    (has_role(auth.uid(), 'administrator'::app_role, company_id) OR has_role(auth.uid(), 'accountant'::app_role, company_id))
    AND company_id = get_user_company(auth.uid())
  );

-- Allow administrators and accountants to update items for their company
CREATE POLICY "Items update by managers"
  ON public.items FOR UPDATE
  USING (
    (has_role(auth.uid(), 'administrator'::app_role, company_id) OR has_role(auth.uid(), 'accountant'::app_role, company_id))
    AND company_id = get_user_company(auth.uid())
  )
  WITH CHECK (
    (has_role(auth.uid(), 'administrator'::app_role, company_id) OR has_role(auth.uid(), 'accountant'::app_role, company_id))
    AND company_id = get_user_company(auth.uid())
  );

-- Optional: prevent delete unless explicitly allowed elsewhere
CREATE POLICY "Items delete by managers"
  ON public.items FOR DELETE
  USING (
    (has_role(auth.uid(), 'administrator'::app_role, company_id) OR has_role(auth.uid(), 'accountant'::app_role, company_id))
    AND company_id = get_user_company(auth.uid())
  );