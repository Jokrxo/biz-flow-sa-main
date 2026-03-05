-- Sales Module Comprehensive Enhancements
-- Implements: Soft Delete, Sequential Numbering, Customer Ledger, Audit Trail, RBAC

-- ============================================================================
-- 1. CUSTOMER SOFT DELETE & ENHANCED FIELDS
-- ============================================================================

-- Add soft delete fields to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15,2) DEFAULT 0;

-- Add indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_customers_is_deleted ON customers(is_deleted) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at);

-- Add unique constraints for duplicate prevention
-- First, check if we need to clean up existing duplicates
-- This will fail if duplicates exist, which is intentional
ALTER TABLE customers ADD CONSTRAINT idx_customers_company_name_unique 
  UNIQUE (company_id, LOWER(TRIM(name)));

-- ============================================================================
-- 2. DOCUMENT SEQUENCING TABLE (Multi-type support)
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    document_type VARCHAR(20) NOT NULL, -- INV, QUO, DN, CN
    year INTEGER NOT NULL,
    sequence_number INTEGER NOT NULL DEFAULT 0,
    prefix VARCHAR(10) NOT NULL DEFAULT 'INV',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, document_type, year)
);

CREATE INDEX IF NOT EXISTS idx_document_sequences_company_type_year 
  ON document_sequences(company_id, document_type, year);

-- Function to get next document number with row locking
CREATE OR REPLACE FUNCTION get_next_document_number(
    p_company_id UUID,
    p_document_type VARCHAR,
    p_prefix VARCHAR
)
RETURNS TEXT AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
    v_result TEXT;
    v_locked_sequence RECORD;
BEGIN
    v_year := EXTRACT(YEAR FROM NOW());
    
    -- Use SELECT FOR UPDATE to prevent race conditions
    SELECT * INTO v_locked_sequence
    FROM document_sequences
    WHERE company_id = p_company_id 
      AND document_type = p_document_type 
      AND year = v_year
    FOR UPDATE;
    
    IF NOT FOUND THEN
        -- Create new sequence
        INSERT INTO document_sequences (company_id, document_type, year, sequence_number, prefix)
        VALUES (p_company_id, p_document_type, v_year, 1, p_prefix)
        RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    ELSE
        -- Increment existing sequence
        UPDATE document_sequences
        SET sequence_number = sequence_number + 1,
            updated_at = NOW()
        WHERE company_id = p_company_id 
          AND document_type = p_document_type 
          AND year = v_year
        RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    END IF;
    
    v_result := v_prefix || '-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. CUSTOMER LEDGER TABLE (Running Balance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    document_type VARCHAR(20) NOT NULL, -- INV, PAY, DN, CN, ADJ
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

-- ============================================================================
-- 4. INVOICE & QUOTE ENHANCEMENTS
-- ============================================================================

-- Add sequential number to quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sales_type VARCHAR(10) DEFAULT 'credit'; -- cash or credit
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

-- Add sequential number to debit_notes and credit_notes if they exist
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS reference_invoice_id UUID REFERENCES invoices(id);
ALTER TABLE debit_notes ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS reference_invoice_id UUID REFERENCES invoices(id);
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

-- Add adjustment reason to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sales_type VARCHAR(10) DEFAULT 'credit';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

-- ============================================================================
-- 5. STATUS HISTORY TABLES
-- ============================================================================

-- Quote status history
CREATE TABLE IF NOT EXISTS quote_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_quote_status_history_quote ON quote_status_history(quote_id);

-- ============================================================================
-- 6. ENHANCED AUDIT LOGS
-- ============================================================================

-- Update audit_logs table with more fields
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS old_value JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_value JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);

-- Enhanced index for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_composite 
  ON audit_logs(company_id, entity_type, entity_id, timestamp DESC);

-- ============================================================================
-- 7. RBAC - USER ROLES ENHANCEMENT
-- ============================================================================

-- Add new roles if they don't exist in the user_roles table
-- SalesUser and Viewer roles need to be supported by the application

-- Create role_permissions table for granular permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(50) NOT NULL,
    permission VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role, permission)
);

-- Insert default permissions
INSERT INTO role_permissions (role, permission, description) VALUES
-- Administrator - full access
('administrator', 'all', 'Full system access'),
('administrator', 'view_audit_trail', 'View audit logs'),
('administrator', 'restore_records', 'Restore soft-deleted records'),
('administrator', 'override_status', 'Override document status'),
-- Accountant
('accountant', 'view_audit_trail', 'View audit logs'),
('accountant', 'create_invoices', 'Create and manage invoices'),
('accountant', 'create_quotes', 'Create and manage quotes'),
('accountant', 'post_transactions', 'Post transactions'),
-- SalesUser
('sales_user', 'create_invoices', 'Create invoices'),
('sales_user', 'create_quotes', 'Create quotes'),
('sales_user', 'view_customers', 'View customers'),
-- Viewer
('viewer', 'view_reports', 'View reports only'),
('viewer', 'view_invoices', 'View invoices'),
('viewer', 'view_quotes', 'View quotes')
ON CONFLICT (role, permission) DO NOTHING;

-- ============================================================================
-- 8. FINANCIAL PERIOD VALIDATION
-- ============================================================================

-- Add locked period tracking if not exists
ALTER TABLE companies ADD COLUMN IF NOT EXISTS locked_periods JSONB DEFAULT '[]';

-- ============================================================================
-- 9. ORPHAN TRANSACTION PREVENTION
-- ============================================================================

-- Add foreign key constraints for customer_ledger
ALTER TABLE customer_ledger 
  ADD CONSTRAINT fk_customer_ledger_customer 
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;

-- ============================================================================
-- 10. DEBTORS CONTROL RECONCILIATION VIEW
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
WHERE c.is_deleted = false
GROUP BY c.id, c.name;

-- ============================================================================
-- Helper function to validate customer can be soft-deleted
-- ============================================================================

CREATE OR REPLACE FUNCTION can_soft_delete_customer(p_customer_id UUID)
RETURNS TABLE(can_delete BOOLEAN, reason TEXT) AS $$
DECLARE
    v_outstanding_balance DECIMAL(15,2);
    v_open_invoices INTEGER;
    v_linked_notes INTEGER;
BEGIN
    -- Check outstanding balance
    SELECT COALESCE(SUM(running_balance), 0) INTO v_outstanding_balance
    FROM customer_ledger 
    WHERE customer_id = p_customer_id;
    
    -- Check open invoices
    SELECT COUNT(*) INTO v_open_invoices
    FROM invoices 
    WHERE customer_id = p_customer_id 
      AND status NOT IN ('paid', 'cancelled');
    
    -- Check linked debit/credit notes
    SELECT COUNT(*) INTO v_linked_notes
    FROM (
        SELECT id FROM debit_notes WHERE customer_id = p_customer_id AND status = 'active'
        UNION ALL
        SELECT id FROM credit_notes WHERE customer_id = p_customer_id AND status = 'active'
    ) AS linked;
    
    IF v_outstanding_balance > 0.01 THEN
        RETURN QUERY SELECT FALSE, 'Customer has outstanding balance';
    ELSIF v_open_invoices > 0 THEN
        RETURN QUERY SELECT FALSE, 'Customer has open invoices';
    ELSIF v_linked_notes > 0 THEN
        RETURN QUERY SELECT FALSE, 'Customer has linked debit/credit notes';
    ELSE
        RETURN QUERY SELECT TRUE, 'Can be deleted';
    END IF;
END;
$$ LANGUAGE plpgsql;
