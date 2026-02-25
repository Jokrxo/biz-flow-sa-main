-- Fix function search path for handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    default_company_id UUID;
BEGIN
    -- Create or get default company
    INSERT INTO public.companies (name, code) 
    VALUES ('Default Company', 'DEFAULT')
    ON CONFLICT (code) DO NOTHING;
    
    SELECT id INTO default_company_id 
    FROM public.companies 
    WHERE code = 'DEFAULT';
    
    -- Insert user profile
    INSERT INTO public.profiles (user_id, company_id, first_name, last_name, email)
    VALUES (
        NEW.id,
        default_company_id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NEW.email
    );
    
    -- Assign default role (accountant for new users)
    INSERT INTO public.user_roles (user_id, company_id, role)
    VALUES (NEW.id, default_company_id, 'accountant');
    
    RETURN NEW;
END;
$$;

-- Add RLS policies for invoice_items
CREATE POLICY "Users can view invoice items in their company"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND i.company_id = get_user_company(auth.uid())
  )
);

CREATE POLICY "Accountants and administrators can manage invoice items"
ON public.invoice_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND (has_role(auth.uid(), 'administrator'::app_role, i.company_id) 
         OR has_role(auth.uid(), 'accountant'::app_role, i.company_id))
  )
);

-- Add RLS policies for quote_items
CREATE POLICY "Users can view quote items in their company"
ON public.quote_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND q.company_id = get_user_company(auth.uid())
  )
);

CREATE POLICY "Accountants and administrators can manage quote items"
ON public.quote_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
    AND (has_role(auth.uid(), 'administrator'::app_role, q.company_id) 
         OR has_role(auth.uid(), 'accountant'::app_role, q.company_id))
  )
);