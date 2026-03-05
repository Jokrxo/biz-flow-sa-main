-- Fix Missing RPC Functions for Customer and Loan Management

-- 1. Create log_audit_event function (for Customer audit trail)
CREATE OR REPLACE FUNCTION log_audit_event(
  p_user_id UUID,
  p_action TEXT,
  p_table_name TEXT,
  p_record_id UUID,
  p_changes JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, table_name, record_id, changes, created_at)
  VALUES (p_user_id, p_action, p_table_name, p_record_id, p_changes, NOW());
END;
$$;

-- 2. Create can_soft_delete_customer function
CREATE OR REPLACE FUNCTION can_soft_delete_customer(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT COALESCE(SUM(
    CASE WHEN te.credit > 0 THEN te.credit - te.debit
    ELSE te.debit - te.credit END
  ), 0) INTO v_balance
  FROM transaction_entries te
  JOIN transactions t ON t.id = te.transaction_id
  WHERE t.status = 'posted'
  AND te.account_id IN (
    SELECT id FROM chart_of_accounts 
    WHERE account_type = 'asset' 
    AND (LOWER(account_name) LIKE '%debtor%' OR LOWER(account_name) LIKE '%receivable%')
  );
  RETURN v_balance <= 0.01;
END;
$$;

-- 3. Create create_customer_ledger_entry function
CREATE OR REPLACE FUNCTION create_customer_ledger_entry(
  p_company_id UUID, p_customer_id UUID, p_account_id UUID,
  p_debit NUMERIC, p_credit NUMERIC, p_date DATE,
  p_description TEXT, p_reference TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_transaction_id UUID;
BEGIN
  INSERT INTO transactions (company_id, transaction_date, description, reference_number, total_amount, transaction_type, status)
  VALUES (p_company_id, p_date, p_description, p_reference, p_debit + p_credit, 'customer_entry', 'posted')
  RETURNING id INTO v_transaction_id;
  INSERT INTO ledger_entries (company_id, account_id, debit, credit, entry_date, is_reversed, transaction_id, description)
  VALUES (p_company_id, p_account_id, p_debit, p_credit, p_date, false, v_transaction_id, p_description);
  RETURN v_transaction_id;
END;
$$;

-- 4. Create recalculate_customer_balance function
CREATE OR REPLACE FUNCTION recalculate_customer_balance(p_customer_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_balance NUMERIC; v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM customers WHERE id = p_customer_id;
  SELECT COALESCE(SUM(
    CASE WHEN le.credit > 0 THEN le.credit - le.debit
    ELSE le.debit - le.credit END
  ), 0) INTO v_balance
  FROM ledger_entries le
  JOIN transactions t ON t.id = le.transaction_id
  WHERE t.status = 'posted'
  AND le.account_id IN (
    SELECT id FROM chart_of_accounts WHERE company_id = v_company_id AND account_type = 'asset' 
    AND (LOWER(account_name) LIKE '%debtor%' OR LOWER(account_name) LIKE '%receivable%')
  );
  UPDATE customers SET balance = v_balance, updated_at = NOW() WHERE id = p_customer_id;
  RETURN v_balance;
END;
$$;

-- 5. Create ensure_user_company_and_role function
CREATE OR REPLACE FUNCTION ensure_user_company_and_role(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_company_id UUID; v_role TEXT;
BEGIN
  SELECT company_id INTO v_company_id FROM profiles WHERE user_id = p_user_id;
  IF v_company_id IS NULL THEN
    INSERT INTO companies (name, created_at) VALUES ('My Company', NOW()) RETURNING id INTO v_company_id;
    UPDATE profiles SET company_id = v_company_id, role = 'admin' WHERE user_id = p_user_id;
  END IF;
  RETURN v_company_id;
END;
$$;

-- 6. Create get_next_invoice_number function
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_company_id UUID, p_prefix TEXT DEFAULT 'INV')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_year TEXT; v_count INTEGER; v_next_number TEXT;
BEGIN
  v_year := TO_CHAR(NOW(), 'YY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(reference_number FROM 4 FOR 6) AS INTEGER)), 0) + 1 INTO v_count
  FROM invoices WHERE company_id = p_company_id AND reference_number LIKE p_prefix || v_year || '%';
  v_next_number := p_prefix || v_year || LPAD(v_count::TEXT, 6, '0');
  RETURN v_next_number;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION log_audit_event TO authenticated;
GRANT EXECUTE ON FUNCTION can_soft_delete_customer TO authenticated;
GRANT EXECUTE ON FUNCTION create_customer_ledger_entry TO authenticated;
GRANT EXECUTE ON FUNCTION recalculate_customer_balance TO authenticated;
GRANT EXECUTE ON FUNCTION ensure_user_company_and_role TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_invoice_number TO authenticated;

-- Add missing columns to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS balance NUMERIC DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Add fiscal columns to app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fiscal_year_start DATE DEFAULT '03-01';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fiscal_default_year INTEGER DEFAULT 2024;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fiscal_lock_year INTEGER;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS financial_year_closed_date DATE;

-- Create missing tables
CREATE TABLE IF NOT EXISTS audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES auth.users(id), action TEXT NOT NULL, table_name TEXT, record_id UUID, changes JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_all_access" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS company_config (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE, inventory_system VARCHAR(20) DEFAULT 'perpetual', costing_method VARCHAR(20) DEFAULT 'fifo', UNIQUE(company_id));
ALTER TABLE company_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_config_all_access" ON company_config FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS period_end_inventory (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE, period_year INTEGER NOT NULL, period_month INTEGER NOT NULL, beginning_inventory DECIMAL(15,2) NOT NULL, total_purchases DECIMAL(15,2) NOT NULL, ending_inventory DECIMAL(15,2) NOT NULL, cogs_amount DECIMAL(15,2) NOT NULL, calculated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(company_id, period_year, period_month));
ALTER TABLE period_end_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "period_end_inventory_all_access" ON period_end_inventory FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS tasks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'pending', assigned_to UUID REFERENCES auth.users(id), due_date DATE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_all_access" ON tasks FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS loans (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID REFERENCES companies(id) ON DELETE CASCADE, reference VARCHAR(100), loan_type VARCHAR(20), principal DECIMAL(15,2), interest_rate DECIMAL(5,4), start_date DATE, term_months INTEGER, monthly_repayment DECIMAL(15,2), status VARCHAR(20) DEFAULT 'active', outstanding_balance DECIMAL(15,2), created_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loans_all_access" ON loans FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS loan_payments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), loan_id UUID REFERENCES loans(id) ON DELETE CASCADE, payment_date DATE, amount DECIMAL(15,2), principal_component DECIMAL(15,2), interest_component DECIMAL(15,2), created_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE loan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loan_payments_all_access" ON loan_payments FOR ALL USING (true) WITH CHECK (true);

-- Community tables
CREATE TABLE IF NOT EXISTS community_posts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES auth.users(id), title TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS community_comments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE, user_id UUID REFERENCES auth.users(id), content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS community_reactions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE, user_id UUID REFERENCES auth.users(id), reaction_type TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(post_id, user_id, reaction_type));
CREATE TABLE IF NOT EXISTS community_app_ratings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES auth.users(id), rating INTEGER CHECK (rating >= 1 AND rating <= 5), review TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id));

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_app_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_posts_all" ON community_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "community_comments_all" ON community_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "community_reactions_all" ON community_reactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "community_ratings_all" ON community_app_ratings FOR ALL USING (true) WITH CHECK (true);

SELECT 'Migration completed successfully' as result;
