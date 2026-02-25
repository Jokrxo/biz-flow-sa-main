-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('administrator', 'accountant', 'manager');

-- Create companies table for multi-tenancy
CREATE TABLE public.companies (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user profiles table
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- Create user roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, company_id, role)
);

-- Create chart of accounts table
CREATE TABLE public.chart_of_accounts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    parent_account_id UUID REFERENCES public.chart_of_accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(company_id, account_code)
);

-- Create transactions table
CREATE TABLE public.transactions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    transaction_date DATE NOT NULL,
    reference_number TEXT,
    description TEXT NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transaction entries table (double-entry bookkeeping)
CREATE TABLE public.transaction_entries (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
    debit DECIMAL(15,2) NOT NULL DEFAULT 0,
    credit DECIMAL(15,2) NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT check_debit_or_credit CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

-- Update trial_balances table to work with new structure
CREATE TABLE public.trial_balances (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    debit DECIMAL(15,2) NOT NULL DEFAULT 0,
    credit DECIMAL(15,2) NOT NULL DEFAULT 0,
    period_start DATE,
    period_end DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create financial reports table
CREATE TABLE public.financial_reports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    report_type TEXT NOT NULL CHECK (report_type IN ('balance_sheet', 'income_statement', 'cash_flow', 'trial_balance')),
    report_name TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    report_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trial_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reports ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role, _company_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role = _role
        AND (CASE WHEN _company_id IS NULL THEN true ELSE company_id = _company_id END)
    )
$$;

-- Create function to get user's company
CREATE OR REPLACE FUNCTION public.get_user_company(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT company_id
    FROM public.profiles
    WHERE user_id = _user_id
    LIMIT 1
$$;

-- RLS Policies for companies
CREATE POLICY "Users can view their company" ON public.companies
    FOR SELECT USING (id = public.get_user_company(auth.uid()));

CREATE POLICY "Administrators can manage companies" ON public.companies
    FOR ALL USING (public.has_role(auth.uid(), 'administrator', id));

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles in their company" ON public.profiles
    FOR SELECT USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view roles in their company" ON public.user_roles
    FOR SELECT USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "Administrators can manage roles" ON public.user_roles
    FOR ALL USING (public.has_role(auth.uid(), 'administrator', company_id));

-- RLS Policies for chart_of_accounts
CREATE POLICY "Users can view accounts in their company" ON public.chart_of_accounts
    FOR SELECT USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage accounts" ON public.chart_of_accounts
    FOR ALL USING (
        public.has_role(auth.uid(), 'administrator', company_id) OR
        public.has_role(auth.uid(), 'accountant', company_id)
    );

-- RLS Policies for transactions
CREATE POLICY "Users can view transactions in their company" ON public.transactions
    FOR SELECT USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage transactions" ON public.transactions
    FOR ALL USING (
        public.has_role(auth.uid(), 'administrator', company_id) OR
        public.has_role(auth.uid(), 'accountant', company_id)
    );

-- RLS Policies for transaction_entries
CREATE POLICY "Users can view transaction entries in their company" ON public.transaction_entries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = transaction_entries.transaction_id
            AND t.company_id = public.get_user_company(auth.uid())
        )
    );

CREATE POLICY "Administrators and accountants can manage transaction entries" ON public.transaction_entries
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.transactions t
            WHERE t.id = transaction_entries.transaction_id
            AND (
                public.has_role(auth.uid(), 'administrator', t.company_id) OR
                public.has_role(auth.uid(), 'accountant', t.company_id)
            )
        )
    );

-- RLS Policies for trial_balances
CREATE POLICY "Users can view trial balances in their company" ON public.trial_balances
    FOR SELECT USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage trial balances" ON public.trial_balances
    FOR ALL USING (
        public.has_role(auth.uid(), 'administrator', company_id) OR
        public.has_role(auth.uid(), 'accountant', company_id)
    );

-- RLS Policies for financial_reports
CREATE POLICY "Users can view reports in their company" ON public.financial_reports
    FOR SELECT USING (company_id = public.get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage reports" ON public.financial_reports
    FOR ALL USING (
        public.has_role(auth.uid(), 'administrator', company_id) OR
        public.has_role(auth.uid(), 'accountant', company_id)
    );

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for timestamp updates
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_chart_of_accounts_updated_at BEFORE UPDATE ON public.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trial_balances_updated_at BEFORE UPDATE ON public.trial_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_financial_reports_updated_at BEFORE UPDATE ON public.financial_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default chart of accounts
INSERT INTO public.companies (name, code) VALUES ('Default Company', 'DEFAULT') ON CONFLICT (code) DO NOTHING;

-- Get the default company ID for inserting accounts
DO $$
DECLARE
    default_company_id UUID;
BEGIN
    SELECT id INTO default_company_id FROM public.companies WHERE code = 'DEFAULT';
    
    -- Insert basic chart of accounts
    INSERT INTO public.chart_of_accounts (company_id, account_code, account_name, account_type) VALUES
    (default_company_id, '1000', 'Cash and Cash Equivalents', 'asset'),
    (default_company_id, '1100', 'Accounts Receivable', 'asset'),
    (default_company_id, '1200', 'Inventory', 'asset'),
    (default_company_id, '1500', 'Fixed Assets', 'asset'),
    (default_company_id, '2000', 'Accounts Payable', 'liability'),
    (default_company_id, '2100', 'Short-term Loans', 'liability'),
    (default_company_id, '2500', 'Long-term Debt', 'liability'),
    (default_company_id, '3000', 'Owner''s Equity', 'equity'),
    (default_company_id, '3100', 'Retained Earnings', 'equity'),
    (default_company_id, '4000', 'Sales Revenue', 'revenue'),
    (default_company_id, '4100', 'Service Revenue', 'revenue'),
    (default_company_id, '5000', 'Cost of Goods Sold', 'expense'),
    (default_company_id, '5100', 'Operating Expenses', 'expense'),
    (default_company_id, '5200', 'Administrative Expenses', 'expense'),
    (default_company_id, '5300', 'Marketing Expenses', 'expense');
END $$;