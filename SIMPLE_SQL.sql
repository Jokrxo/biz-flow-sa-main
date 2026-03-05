-- SIMPLE VERSION - Only creates tables that don't depend on missing tables
-- Run this first to check what exists

-- Check which tables exist (run this query first):
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- If companies doesn't exist, this is a fresh database - just add basic columns if customers exists
DO $$
BEGIN
  -- Only add columns if customers table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS balance NUMERIC DEFAULT 0;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  -- Only add columns if app_settings exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fiscal_year_start DATE DEFAULT '03-01';
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fiscal_default_year INTEGER DEFAULT 2024;
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS fiscal_lock_year INTEGER;
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS financial_year_closed_date DATE;
  END IF;
END $$;

-- Create loans table (standalone, no foreign key dependencies if companies doesn't exist)
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
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
  company_id UUID,
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

-- Create community tables (standalone)
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

-- Enable RLS
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

SELECT 'Basic tables created. Check which tables exist in your database.' as result;
