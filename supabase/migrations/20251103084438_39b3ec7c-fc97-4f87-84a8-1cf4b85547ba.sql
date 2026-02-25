-- Create budgets table
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_name TEXT NOT NULL,
  budget_year INTEGER NOT NULL,
  budget_month INTEGER CHECK (budget_month >= 1 AND budget_month <= 12),
  category TEXT NOT NULL,
  budgeted_amount NUMERIC NOT NULL DEFAULT 0,
  actual_amount NUMERIC NOT NULL DEFAULT 0,
  variance NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'completed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, budget_year, budget_month, category)
);

-- Create budget_periods table for yearly/quarterly budgets
CREATE TABLE IF NOT EXISTS public.budget_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_name TEXT NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_budget NUMERIC NOT NULL DEFAULT 0,
  total_actual NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_name)
);

-- Enable RLS
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_periods ENABLE ROW LEVEL SECURITY;

-- RLS Policies for budgets
CREATE POLICY "Users can view budgets in their company" ON public.budgets
  FOR SELECT USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage budgets" ON public.budgets
  FOR ALL USING (
    has_role(auth.uid(), 'administrator'::app_role, company_id) OR 
    has_role(auth.uid(), 'accountant'::app_role, company_id)
  );

-- RLS Policies for budget_periods
CREATE POLICY "Users can view budget periods in their company" ON public.budget_periods
  FOR SELECT USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage budget periods" ON public.budget_periods
  FOR ALL USING (
    has_role(auth.uid(), 'administrator'::app_role, company_id) OR 
    has_role(auth.uid(), 'accountant'::app_role, company_id)
  );

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_budgets_company_id ON public.budgets(company_id);
CREATE INDEX IF NOT EXISTS idx_budgets_year_month ON public.budgets(budget_year, budget_month);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON public.budgets(category);
CREATE INDEX IF NOT EXISTS idx_budget_periods_company_id ON public.budget_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_budget_periods_dates ON public.budget_periods(start_date, end_date);

-- Add trigger for updated_at
CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_budget_periods_updated_at
  BEFORE UPDATE ON public.budget_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update budget actual amounts from expenses
CREATE OR REPLACE FUNCTION public.update_budget_actuals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update actual amounts based on expenses
  UPDATE public.budgets b
  SET 
    actual_amount = COALESCE((
      SELECT SUM(e.amount)
      FROM public.expenses e
      WHERE e.company_id = b.company_id
        AND e.category = b.category
        AND EXTRACT(YEAR FROM e.expense_date) = b.budget_year
        AND EXTRACT(MONTH FROM e.expense_date) = b.budget_month
        AND e.status = 'approved'
    ), 0),
    variance = b.budgeted_amount - COALESCE((
      SELECT SUM(e.amount)
      FROM public.expenses e
      WHERE e.company_id = b.company_id
        AND e.category = b.category
        AND EXTRACT(YEAR FROM e.expense_date) = b.budget_year
        AND EXTRACT(MONTH FROM e.expense_date) = b.budget_month
        AND e.status = 'approved'
    ), 0);
END;
$$;