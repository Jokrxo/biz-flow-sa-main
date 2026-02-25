-- Create bills table for supplier invoices
CREATE TABLE IF NOT EXISTS public.bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  bill_number TEXT NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, bill_number)
);

-- Create bill_items table
CREATE TABLE IF NOT EXISTS public.bill_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bills
CREATE POLICY "Users can view bills in their company" ON public.bills
  FOR SELECT USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage bills" ON public.bills
  FOR ALL USING (
    has_role(auth.uid(), 'administrator'::app_role, company_id) OR 
    has_role(auth.uid(), 'accountant'::app_role, company_id)
  );

-- RLS Policies for bill_items
CREATE POLICY "Users can view bill items in their company" ON public.bill_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bills 
      WHERE bills.id = bill_items.bill_id 
      AND bills.company_id = get_user_company(auth.uid())
    )
  );

CREATE POLICY "Administrators and accountants can manage bill items" ON public.bill_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.bills 
      WHERE bills.id = bill_items.bill_id 
      AND (
        has_role(auth.uid(), 'administrator'::app_role, bills.company_id) OR 
        has_role(auth.uid(), 'accountant'::app_role, bills.company_id)
      )
    )
  );

-- RLS Policies for expenses
CREATE POLICY "Users can view expenses in their company" ON public.expenses
  FOR SELECT USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage expenses" ON public.expenses
  FOR ALL USING (
    has_role(auth.uid(), 'administrator'::app_role, company_id) OR 
    has_role(auth.uid(), 'accountant'::app_role, company_id)
  );

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_bills_company_id ON public.bills(company_id);
CREATE INDEX IF NOT EXISTS idx_bills_supplier_id ON public.bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(status);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company_id ON public.expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses(user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();