-- CREATE_MISSING_TABLES.sql
-- Creates only the tables that are MISSING from the database

-- Check and create chart_of_accounts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chart_of_accounts') THEN
    CREATE TABLE chart_of_accounts (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
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
    DROP POLICY IF EXISTS "coa_all_access" ON chart_of_accounts;
    CREATE POLICY "coa_all_access" ON chart_of_accounts FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created chart_of_accounts table';
  ELSE
    RAISE NOTICE 'chart_of_accounts already exists';
  END IF;
END $$;

-- Check and create ledger_entries
DO $$
BEGIN
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
    DROP POLICY IF EXISTS "ledger_all_access" ON ledger_entries;
    CREATE POLICY "ledger_all_access" ON ledger_entries FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Created ledger_entries table';
  ELSE
    RAISE NOTICE 'ledger_entries already exists';
  END IF;
END $$;

-- Check and create profiles
DO $$
BEGIN
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
  ELSE
    RAISE NOTICE 'profiles already exists';
  END IF;
END $$;

-- Check and create app_settings
DO $$
BEGIN
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
    RAISE NOTICE 'app_settings already exists';
  END IF;
END $$;

-- Check and create loans
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loans') THEN
    CREATE TABLE loans (
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
    RAISE NOTICE 'Created loans table';
  ELSE
    RAISE NOTICE 'loans already exists';
  END IF;
END $$;

-- Check and create loan_payments
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'loan_payments') THEN
    CREATE TABLE loan_payments (
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
    RAISE NOTICE 'Created loan_payments table';
  ELSE
    RAISE NOTICE 'loan_payments already exists';
  END IF;
END $$;

-- Check and create tasks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    CREATE TABLE tasks (
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
    RAISE NOTICE 'Created tasks table';
  ELSE
    RAISE NOTICE 'tasks already exists';
  END IF;
END $$;

-- Check and create suppliers (may already exist based on your list)
DO $$
BEGIN
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
  ELSE
    RAISE NOTICE 'suppliers already exists';
  END IF;
END $$;

-- Check and create customers (may already exist based on your list)
DO $$
BEGIN
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
    RAISE NOTICE 'customers already exists';
  END IF;
END $$;

-- Insert basic chart of accounts for existing companies
DO $$
DECLARE v_company_id UUID;
BEGIN
  -- Get first company
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  IF v_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id = v_company_id) THEN
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
      (v_company_id, '6100', 'Depreciation Expense', 'expense', 'debit', true, true);
    RAISE NOTICE 'Inserted basic chart of accounts';
  END IF;
END $$;

SELECT 'CREATE_MISSING_TABLES completed! Check the notices above for what was created.' as result;
