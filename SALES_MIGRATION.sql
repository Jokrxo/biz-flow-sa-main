-- ============================================================================
-- SALES MODULE MIGRATION - For unified documents table structure
-- ============================================================================
-- Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- Copy and paste this entire file, then click "Run"
-- ============================================================================

-- Your current documents table has: id, user_id, document_type, document_number, customer_id, issue_date

-- ============================================================================
-- 0. CREATE COMPANIES TABLE IF NOT EXISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 1. ENHANCE DOCUMENTS TABLE (unified for quotations, invoices, credit notes)
-- ============================================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sales_type VARCHAR(10) DEFAULT 'credit';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS posting_date DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE INDEX IF NOT EXISTS idx_documents_is_deleted ON documents(is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_documents_type_status ON documents(document_type, status);

-- ============================================================================
-- 2. ENHANCE CUSTOMERS TABLE (if it exists)
-- ============================================================================

-- Check if customers table exists, then add columns
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50);
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15,2) DEFAULT 0;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_terms INTEGER DEFAULT 30;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
        
        CREATE INDEX IF NOT EXISTS idx_customers_is_deleted ON customers(is_deleted) WHERE is_deleted = false;
    END IF;
END $$;

-- ============================================================================
-- 3. DOCUMENT SEQUENCING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
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
-- 4. CUSTOMER LEDGER TABLE (for running balance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL,
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
-- 5. DOCUMENT STATUS HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_document_status_history_document ON document_status_history(document_id);

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
-- 7. AUDIT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    description TEXT,
    old_value JSONB,
    new_value JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id, timestamp);

-- ============================================================================
-- 8. DEBTORS RECONCILIATION VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_debtors_reconciliation AS
SELECT 
    c.id as customer_id,
    c.name as customer_name,
    COALESCE(SUM(cl.running_balance), 0) as ledger_balance,
    (SELECT COALESCE(SUM(total_amount), 0) FROM documents WHERE customer_id = c.id AND document_type = 'invoice' AND status != 'cancelled') as invoice_total,
    (SELECT COALESCE(SUM(paid_amount), 0) FROM documents WHERE customer_id = c.id AND document_type = 'invoice') as payments_received
FROM customers c
LEFT JOIN customer_ledger cl ON cl.customer_id = c.id
WHERE c.is_deleted = false OR c.is_deleted IS NULL
GROUP BY c.id, c.name;

-- ============================================================================
-- 9. HELPER FUNCTIONS
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

-- Wrapper functions for document types
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_company_id UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN get_next_document_number(p_company_id, 'invoice', 'INV');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_next_quote_number(p_company_id UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN get_next_document_number(p_company_id, 'quotation', 'QUO');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_next_credit_note_number(p_company_id UUID)
RETURNS TEXT AS $$
BEGIN
    RETURN get_next_document_number(p_company_id, 'credit_note', 'CN');
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

-- ============================================================================
-- ✅ MIGRATION COMPLETE
-- ============================================================================
