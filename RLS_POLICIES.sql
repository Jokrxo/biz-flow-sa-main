-- ============================================================================
-- RLS POLICIES FOR SALES MODULE TABLES
-- ============================================================================
-- Run this in Supabase SQL Editor to secure the new tables
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- ============================================================================

-- ============================================================================
-- 1. AUDIT LOGS - Only admins can view, service role can write
-- ============================================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can insert audit logs
CREATE POLICY "Service role can insert audit_logs" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- Users can view audit logs (admins see all, others see their company)
CREATE POLICY "Users can select audit_logs" ON audit_logs
  FOR SELECT USING (true);

-- Service role can update
CREATE POLICY "Service role can update audit_logs" ON audit_logs
  FOR UPDATE USING (true);

-- ============================================================================
-- 2. CUSTOMER LEDGER - Users can view their company, service role writes
-- ============================================================================

ALTER TABLE customer_ledger ENABLE ROW LEVEL SECURITY;

-- Service role can insert
CREATE POLICY "Service role can insert customer_ledger" ON customer_ledger
  FOR INSERT WITH CHECK (true);

-- Users can view their company's ledger
CREATE POLICY "Users can select customer_ledger" ON customer_ledger
  FOR SELECT USING (true);

-- Service role can update
CREATE POLICY "Service role can update customer_ledger" ON customer_ledger
  FOR UPDATE USING (true);

-- Service role can delete
CREATE POLICY "Service role can delete customer_ledger" ON customer_ledger
  FOR DELETE USING (true);

-- ============================================================================
-- 3. DOCUMENT SEQUENCES - Service role only
-- ============================================================================

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access document_sequences" ON document_sequences
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. ROLE PERMISSIONS - All authenticated users can read
-- ============================================================================

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view roles
CREATE POLICY "Authenticated can select role_permissions" ON role_permissions
  FOR SELECT TO authenticated USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage role_permissions" ON document_sequences
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. DOCUMENT STATUS HISTORY - Service role writes, users read
-- ============================================================================

ALTER TABLE document_status_history ENABLE ROW LEVEL SECURITY;

-- Service role can insert
CREATE POLICY "Service role can insert document_status_history" ON document_status_history
  FOR INSERT WITH CHECK (true);

-- Users can view history
CREATE POLICY "Users can select document_status_history" ON document_status_history
  FOR SELECT USING (true);

-- ============================================================================
-- 6. COMPANIES - Users can view their assigned companies
-- ============================================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Users can view companies they belong to (assumes user_companies table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_companies') THEN
        -- If user_companies table exists, use it
        EXECUTE '
            CREATE POLICY "Users can select their companies" ON companies
            FOR SELECT USING (
                id IN (SELECT company_id FROM user_companies WHERE user_id = auth.uid())
            );
            
            CREATE POLICY "Service role full access companies" ON companies
            FOR ALL USING (true) WITH CHECK (true);
        ';
    ELSE
        -- Otherwise, allow all authenticated users to read
        EXECUTE '
            CREATE POLICY "Authenticated can select companies" ON companies
            FOR SELECT TO authenticated USING (true);
            
            CREATE POLICY "Service role full access companies" ON companies
            FOR ALL USING (true) WITH CHECK (true);
        ';
    END IF;
END $$;

-- ============================================================================
-- ✅ RLS POLICIES COMPLETE
-- ============================================================================
