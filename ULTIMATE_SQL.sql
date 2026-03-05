-- ULTIMATE FIX - Creates ALL missing tables including chart_of_accounts
-- Run this in Supabase SQL Editor - it handles all dependencies

DO $$
BEGIN
  -- Create companies table first (if it doesn't exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'companies') THEN
    CREATE TABLE companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "companies_all_access" ON companies;
    CREATE POLICY "companies_all_access" ON companies FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created companies table';
  END IF;
END $$;

DO $$
BEGIN
  -- Create chart_of_accounts table (if it doesn't exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chart_of_accounts') THEN
    CREATE TABLE chart_of_accounts (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      account_code TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense', 'income')),
      parent_account_id UUID REFERENCES chart_of_accounts(id),
      normal_balance TEXT DEFAULT 'debit' CHECK (normal_balance IN ('debit', 'credit')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_system BOOLEAN DEFAULT false,
      is_protected BOOLEAN DEFAULT false,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "chart_of_accounts_all_access" ON chart_of_accounts;
    CREATE POLICY "chart_of_accounts_all_access" ON chart_of_accounts FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created chart_of_accounts table';
  END IF;
END $$;

DO $$
BEGIN
  -- Create transactions table (if it doesn't exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
    CREATE TABLE transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      transaction_date DATE NOT NULL,
      description TEXT,
      reference_number TEXT,
      total_amount DECIMAL(15,2) DEFAULT 0,
      transaction_type TEXT,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "transactions_all_access" ON transactions;
    CREATE POLICY "transactions_all_access" ON transactions FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created transactions table';
  END IF;
END $$;

DO $$
BEGIN
  -- Create ledger_entries table (if it doesn't exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ledger_entries') THEN
    CREATE TABLE ledger_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      account_id UUID REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
      debit DECIMAL(15,2) NOT NULL DEFAULT 0,
      credit DECIMAL(15,2) NOT NULL DEFAULT 0,
      entry_date DATE NOT NULL,
      description TEXT,
      is_reversed BOOLEAN DEFAULT false,
      transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "ledger_entries_all_access" ON ledger_entries;
    CREATE POLICY "ledger_entries_all_access" ON ledger_entries FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created ledger_entries table';
  END IF;
END $$;

DO $$
BEGIN
  -- Create customers table (if it doesn't exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    CREATE TABLE customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      balance NUMERIC DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "customers_all_access" ON customers;
    CREATE POLICY "customers_all_access" ON customers FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created customers table';
  ELSE
    -- Add missing columns if table exists
    BEGIN
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS balance NUMERIC DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  -- Create suppliers table (if it doesn't exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'suppliers') THEN
    CREATE TABLE suppliers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      balance NUMERIC DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "suppliers_all_access" ON suppliers;
    CREATE POLICY "suppliers_all_access" ON suppliers FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created suppliers table';
  END IF;
END $$;

DO $$
BEGIN
  -- Create profiles table (if it doesn't exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    CREATE TABLE profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      company_id UUID REFERENCES companies(id),
      role TEXT DEFAULT 'user',
      full_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "profiles_all_access" ON profiles;
    CREATE POLICY "profiles_all_access" ON profiles FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created profiles table';
  END IF;
END $$;

DO $$
BEGIN
  -- Create app_settings table (if it doesn't exist)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
    CREATE TABLE app_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
      fiscal_year_start DATE DEFAULT '03-01',
      fiscal_default_year INTEGER DEFAULT 2024,
      fiscal_lock_year INTEGER,
      financial_year_closed_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "app_settings_all_access" ON app_settings;
    CREATE POLICY "app_settings_all_access" ON app_settings FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created app_settings table';
  ELSE
    -- Add missing columns
    BEGIN
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fiscal_year_start DATE DEFAULT '03-01';
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fiscal_default_year INTEGER DEFAULT 2024;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fiscal_lock_year INTEGER;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
    BEGIN
      ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS financial_year_closed_date DATE;
    EXCEPTION WHEN duplicate_column THEN NULL;
    END;
  END IF;
END $$;

-- Create loans table
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  reference VARCHAR(100),
  loan_type VARCHAR(20),
  principal DECIMAL(15,2),
  interest_rate DECIMAL(5,4),
  start_date DATE,
  term_months INTEGER,
  monthly_repayment DECIMAL(15,2),
  status VARCHAR(20) DEFAULT 'active',
  outstanding_balance DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loans_all_access" ON loans;
CREATE POLICY "loans_all_access" ON loans FOR ALL USING (true) WITH CHECK (true);

-- Create loan_payments table
CREATE TABLE IF NOT EXISTS loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
  payment_date DATE,
  amount DECIMAL(15,2),
  principal_component DECIMAL(15,2),
  interest_component DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE loan_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loan_payments_all_access" ON loan_payments;
CREATE POLICY "loan_payments_all_access" ON loan_payments FOR ALL USING (true) WITH CHECK (true);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  assigned_to UUID,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_all_access" ON tasks;
CREATE POLICY "tasks_all_access" ON tasks FOR ALL USING (true) WITH CHECK (true);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_all_access" ON audit_logs;
CREATE POLICY "audit_logs_all_access" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

-- Create community tables
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS community_app_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_app_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_posts_all" ON community_posts;
DROP POLICY IF EXISTS "community_comments_all" ON community_comments;
DROP POLICY IF EXISTS "community_reactions_all" ON community_reactions;
DROP POLICY IF EXISTS "community_ratings_all" ON community_app_ratings;

CREATE POLICY "community_posts_all" ON community_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "community_comments_all" ON community_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "community_reactions_all" ON community_reactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "community_ratings_all" ON community_app_ratings FOR ALL USING (true) WITH CHECK (true);

-- Insert basic chart of accounts for demo company
DO $$
DECLARE v_company_id UUID;
BEGIN
  -- Create a default company if none exists
  INSERT INTO companies (name) VALUES ('Demo Company') RETURNING id INTO v_company_id;
  
  -- Insert basic chart of accounts
  INSERT INTO chart_of_accounts (company_id, account_code, account_name, account_type, normal_balance, is_active, is_system)
  VALUES 
    (v_company_id, '1000', 'Cash and Cash Equivalents', 'asset', 'debit', true, true),
    (v_company_id, '1100', 'Bank Accounts', 'asset', 'debit', true, true),
    (v_company_id, '1200', 'Accounts Receivable', 'asset', 'debit', true, true),
    (v_company_id, '1210', 'VAT Input / Receivable', 'asset', 'debit', true, true),
    (v_company_id, '1500', 'Inventory', 'asset', 'debit', true, true),
    (v_company_id, '1590', 'Accumulated Depreciation', 'asset', 'credit', true, true),
    (v_company_id, '2000', 'Accounts Payable', 'liability', 'credit', true, true),
    (v_company_id, '2100', 'Trade Creditors', 'liability', 'credit', true, true),
    (v_company_id, '2200', 'VAT Payable / Output', 'liability', 'credit', true, true),
    (v_company_id, '2210', 'SARS Payable', 'liability', 'credit', true, true),
    (v_company_id, '2300', 'PAYE Payable', 'liability', 'credit', true, true),
    (v_company_id, '2310', 'UIF Payable', 'liability', 'credit', true, true),
    (v_company_id, '2320', 'SDL Payable', 'liability', 'credit', true, true),
    (v_company_id, '3000', 'Owners Equity', 'equity', 'credit', true, true),
    (v_company_id, '3900', 'Opening Balance Equity', 'equity', 'credit', true, true),
    (v_company_id, '4000', 'Sales Revenue', 'revenue', 'credit', true, true),
    (v_company_id, '4100', 'Other Income', 'revenue', 'credit', true, true),
    (v_company_id, '5000', 'Salaries & Wages', 'expense', 'debit', true, true),
    (v_company_id, '5100', 'UIF Employer Expense', 'expense', 'debit', true, true),
    (v_company_id, '5110', 'SDL Expense', 'expense', 'debit', true, true),
    (v_company_id, '5200', 'Rent Expense', 'expense', 'debit', true, true),
    (v_company_id, '5300', 'Utilities Expense', 'expense', 'debit', true, true),
    (v_company_id, '6000', 'Cost of Sales', 'expense', 'debit', true, true),
    (v_company_id, '6100', 'Depreciation Expense', 'expense', 'debit', true, true)
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Inserted basic chart of accounts for company: %', v_company_id;
END $$;

SELECT 'ULTIMATE FIX completed successfully! All tables created.' as result;
