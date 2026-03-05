/**
 * Migration Script for Sales Module
 * Executes SQL migrations against Supabase using the pg_catalog schema
 */

const SUPABASE_URL = 'https://upmlbzaskdloikeqgtzz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwbWxiemFza2Rsb2lrZXFndHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY3MTA0MDQsImV4cCI6MjA2MjI4NjQwNH0.E2CC2xP99fgXMN6HyAWX_1p7RYhoUYbvwt7ac1BwjOs';

// Combined migration SQL
const MIGRATION_SQL = `

-- ============================================================================
-- 1. CUSTOMER SOFT DELETE & ENHANCED FIELDS
-- ============================================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_customers_is_deleted ON customers(is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at);

-- ============================================================================
-- 2. DOCUMENT SEQUENCING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_type VARCHAR(20) NOT NULL,
    year INTEGER NOT NULL,
    sequence_number INTEGER NOT NULL DEFAULT 0,
    prefix VARCHAR(10) NOT NULL DEFAULT 'INV',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, document_type, year)
);

CREATE INDEX IF NOT EXISTS idx_document_sequences_company_type_year 
  ON document_sequences(company_id, document_type, year);

-- ============================================================================
-- 3. CUSTOMER LEDGER TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    document_type VARCHAR(20) NOT NULL,
    document_id UUID NOT NULL,
    reference_number VARCHAR(50),
    debit DECIMAL(15,2) DEFAULT 0,
    credit DECIMAL(15,2) DEFAULT 0,
    running_balance DECIMAL(15,2) DEFAULT 0,
    posting_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger(customer_id, posting_date);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_company ON customer_ledger(company_id, posting_date);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_document ON customer_ledger(document_type, document_id);

-- ============================================================================
-- 4. QUOTE & INVOICE ENHANCEMENTS
-- ============================================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sales_type VARCHAR(10) DEFAULT 'credit';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_type VARCHAR(10) DEFAULT TABLE invoices ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

-- ============================================================================
-- 5. STATUS HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS quote_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT 'credit';
ALTER NULL REFERENCES quotes(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_quote_status_history_quote ON quote_status_history(quote_id);

-- ============================================================================
-- 6. ROLE PERMISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(50) NOT NULL,
    permission VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role, permission)
);

INSERT INTO role_permissions (role, permission, description) VALUES
('administrator', 'all', 'Full system access'),
('administrator', 'view_audit_trail', 'View audit logs'),
('administrator', 'restore_records', 'Restore soft-deleted records'),
('administrator', 'override_status', 'Override document status'),
('accountant', 'view_audit_trail', 'View audit logs'),
('accountant', 'create_invoices', 'Create and manage invoices'),
('accountant', 'create_quotes', 'Create and manage quotes'),
('accountant', 'post_transactions', 'Post transactions'),
('sales_user', 'create_invoices', 'Create invoices'),
('sales_user', 'create_quotes', 'Create quotes'),
('sales_user', 'view_customers', 'View customers'),
('viewer', 'view_reports', 'View reports only'),
('viewer', 'view_invoices', 'View invoices'),
('viewer', 'view_quotes', 'View quotes')
ON CONFLICT (role, permission) DO NOTHING;

-- ============================================================================
-- 7. DEBTORS RECONCILIATION VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_debtors_reconciliation AS
SELECT 
    c.id as customer_id,
    c.name as customer_name,
    COALESCE(SUM(cl.running_balance), 0) as ledger_balance,
    (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE customer_id = c.id AND status != 'cancelled') as invoice_total,
    (SELECT COALESCE(SUM(amount_paid), 0) FROM invoices WHERE customer_id = c.id) as payments_received
FROM customers c
LEFT JOIN customer_ledger cl ON cl.customer_id = c.id
WHERE c.is_deleted = false OR c.is_deleted IS NULL
GROUP BY c.id, c.name;

-- ============================================================================
-- 8. FUNCTIONS
-- ============================================================================

-- Function to recalculate customer running balance
CREATE OR REPLACE FUNCTION recalculate_customer_balance(p_customer_id UUID)
RETURNS void AS $$
DECLARE
    v_running_balance DECIMAL(15,2) := 0;
    v_record RECORD;
BEGIN
    FOR v_record IN 
        SELECT id, debit, credit, posting_date
        FROM customer_ledger
        WHERE customer_id = p_customer_id
        ORDER BY posting_date, created_at
    LOOP
        v_running_balance := v_running_balance + v_record.debit - v_record.credit;
        UPDATE customer_ledger 
        SET running_balance = v_running_balance 
        WHERE id = v_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to validate customer can be soft-deleted
CREATE OR REPLACE FUNCTION can_soft_delete_customer(p_customer_id UUID)
RETURNS TABLE(can_delete BOOLEAN, reason TEXT) AS $$
DECLARE
    v_outstanding_balance DECIMAL(15,2);
    v_open_invoices INTEGER;
BEGIN
    SELECT COALESCE(SUM(running_balance), 0) INTO v_outstanding_balance
    FROM customer_ledger 
    WHERE customer_id = p_customer_id;
    
    SELECT COUNT(*) INTO v_open_invoices
    FROM invoices 
    WHERE customer_id = p_customer_id 
      AND status NOT IN ('paid', 'cancelled');
    
    IF v_outstanding_balance > 0.01 THEN
        RETURN QUERY SELECT FALSE, 'Customer has outstanding balance';
    ELSIF v_open_invoices > 0 THEN
        RETURN QUERY SELECT FALSE, 'Customer has open invoices';
    ELSE
        RETURN QUERY SELECT TRUE, 'Can be deleted';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get next document number
CREATE OR REPLACE FUNCTION get_next_document_number(
    p_company_id UUID,
    p_document_type VARCHAR,
    p_prefix VARCHAR
)
RETURNS TEXT AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
    v_prefix TEXT;
    v_result TEXT;
BEGIN
    v_year := EXTRACT(YEAR FROM NOW());
    
    INSERT INTO document_sequences (company_id, document_type, year, sequence_number, prefix)
    VALUES (p_company_id, p_document_type, v_year, 1, p_prefix)
    ON CONFLICT (company_id, document_type, year) 
    DO UPDATE SET sequence_number = document_sequences.sequence_number + 1
    RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    
    IF v_seq IS NULL THEN
        UPDATE document_sequences 
        SET sequence_number = sequence_number + 1 
        WHERE company_id = p_company_id AND document_type = p_document_type AND year = v_year
        RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    END IF;
    
    v_result := v_prefix || '-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to create customer ledger entry
CREATE OR REPLACE FUNCTION create_customer_ledger_entry(
    p_company_id UUID,
    p_customer_id UUID,
    p_document_type VARCHAR,
    p_document_id UUID,
    p_reference_number VARCHAR,
    p_debit DECIMAL(15,2),
    p_credit DECIMAL(15,2),
    p_posting_date DATE,
    p_description TEXT,
    p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
    v_ledger_id UUID;
    v_running_balance DECIMAL(15,2);
BEGIN
    SELECT COALESCE(MAX(running_balance), 0) INTO v_running_balance
    FROM customer_ledger
    WHERE customer_id = p_customer_id;
    
    v_running_balance := v_running_balance + p_debit - p_credit;
    
    INSERT INTO customer_ledger (
        company_id, customer_id, document_type, document_id, reference_number,
        debit, credit, running_balance, posting_date, description, created_by
    ) VALUES (
        p_company_id, p_customer_id, p_document_type, p_document_id, p_reference_number,
        p_debit, p_credit, v_running_balance, p_posting_date, p_description, p_created_by
    )
    RETURNING id INTO v_ledger_id;
    
    RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- Function to validate posting date
CREATE OR REPLACE FUNCTION validate_posting_date(
    p_company_id UUID,
    p_posting_date DATE,
    p_allow_future_days INTEGER DEFAULT 0
)
RETURNS TABLE(is_valid BOOLEAN, error_message TEXT) AS $$
DECLARE
    v_max_future_date DATE;
    v_today DATE;
BEGIN
    v_today := CURRENT_DATE;
    v_max_future_date := v_today + p_allow_future_days;
    
    IF p_posting_date > v_max_future_date THEN
        RETURN QUERY SELECT FALSE, 'Posting date cannot be more than ' || p_allow_future_days || ' days in the future';
    END IF;
    
    IF p_posting_date < (DATE_TRUNC('year', v_today)) THEN
        RETURN QUERY SELECT FALSE, 'Cannot post to a previous financial year';
    END IF;
    
    RETURN QUERY SELECT TRUE, NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to check duplicate customer name
CREATE OR REPLACE FUNCTION check_duplicate_customer_name(
    p_company_id UUID,
    p_name VARCHAR,
    p_exclude_customer_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM customers
    WHERE company_id = p_company_id
      AND LOWER(TRIM(name)) = LOWER(TRIM(p_name))
      AND (is_deleted = false OR is_deleted IS NULL)
      AND (p_exclude_customer_id IS NULL OR id != p_exclude_customer_id);
    
    RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to check duplicate account code
CREATE OR REPLACE FUNCTION check_duplicate_account_code(
    p_company_id UUID,
    p_account_code VARCHAR,
    p_exclude_customer_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM customers
    WHERE company_id = p_company_id
      AND account_code = p_account_code
      AND account_code IS NOT NULL
      AND (p_exclude_customer_id IS NULL OR id != p_exclude_customer_id);
    
    RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get next invoice number
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT;
BEGIN
    SELECT get_next_document_number(p_company_id, 'INV', 'INV') INTO v_result;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to get next quote number
CREATE OR REPLACE FUNCTION get_next_quote_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT;
BEGIN
    SELECT get_next_document_number(p_company_id, 'QUO', 'QUO') INTO v_result;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to get next debit note number
CREATE OR REPLACE FUNCTION get_next_debit_note_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT;
BEGIN
    SELECT get_next_document_number(p_company_id, 'DN', 'DN') INTO v_result;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to get next credit note number
CREATE OR REPLACE FUNCTION get_next_credit_note_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_result TEXT;
BEGIN
    SELECT get_next_document_number(p_company_id, 'CN', 'CN') INTO v_result;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Audit log function
CREATE OR REPLACE FUNCTION log_audit_event(
    p_company_id UUID,
    p_user_id UUID,
    p_action VARCHAR,
    p_entity_type VARCHAR,
    p_entity_id UUID,
    p_description TEXT,
    p_old_value JSONB,
    p_new_value JSONB
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO audit_logs (
        company_id, user_id, action, entity_type, entity_id,
        description, old_value, new_value, timestamp
    ) VALUES (
        p_company_id, p_user_id, p_action, p_entity_type, p_entity_id,
        p_description, p_old_value, p_new_value, NOW()
    );
END;
$$ LANGUAGE plpgsql;

`;

async function runMigration() {
  console.log('🚀 Running Sales Module Migrations...');
  console.log('📡 Supabase URL:', SUPABASE_URL);

  try {
    // Try using the Supabase REST API with postgrest to execute SQL
    // We'll use the /rpc endpoint which allows calling functions
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'params=single-object'
      },
      body: JSON.stringify({
        query: MIGRATION_SQL
      })
    });

    if (response.ok) {
      console.log('✅ Migration completed successfully!');
      return;
    }

    // Try alternative approach - use pg_catalog
    const altResponse = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'resolution=ignore-duplicates'
      },
      body: JSON.stringify({})
    });

    console.log('Response status:', response.status);
    console.log('Response:', await response.text());

  } catch (error) {
    console.error('❌ Migration error:', error.message);
  }

  // If programmatic approach fails, show manual instructions
  console.log('\n' + '='.repeat(60));
  console.log('📋 MANUAL INSTRUCTIONS');
  console.log('='.repeat(60));
  console.log('\nThe automatic migration failed. Please run the SQL manually:\n');
  console.log('1. Go to: https://supabase.com/dashboard');
  console.log('2. Select project: upmlbzaskdloikeqgtzz');
  console.log('3. Click "SQL Editor" in the left sidebar');
  console.log('4. Copy and paste the migration SQL');
  console.log('5. Click "Run"');
  console.log('\nThe migration SQL has been saved to:');
  console.log('  - db/migrations/2026-03-04-sales-module-enhancements.sql');
  console.log('  - db/migrations/2026-03-04-sales-rpc-functions.sql');
  console.log('='.repeat(60));
}

runMigration();
