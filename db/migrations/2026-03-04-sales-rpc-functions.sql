-- Additional RPC Functions for Sales Module

-- ============================================================================
-- RPC Function for Audit Logging
-- ============================================================================

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
        company_id,
        user_id,
        action,
        entity_type,
        entity_id,
        description,
        old_value,
        new_value,
        timestamp
    ) VALUES (
        p_company_id,
        p_user_id,
        p_action,
        p_entity_type,
        p_entity_id,
        p_description,
        p_old_value,
        p_new_value,
        NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to get next quote number
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_quote_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
    v_prefix TEXT;
    v_result TEXT;
BEGIN
    v_year := EXTRACT(YEAR FROM NOW());
    
    INSERT INTO document_sequences (company_id, document_type, year, sequence_number, prefix)
    VALUES (p_company_id, 'QUO', v_year, 1, 'QUO')
    ON CONFLICT (company_id, document_type, year) 
    DO UPDATE SET sequence_number = document_sequences.sequence_number + 1
    RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    
    IF v_seq IS NULL THEN
        UPDATE document_sequences 
        SET sequence_number = sequence_number + 1 
        WHERE company_id = p_company_id AND document_type = 'QUO' AND year = v_year
        RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    END IF;
    
    v_result := v_prefix || '-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to get next debit note number
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_debit_note_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
    v_prefix TEXT;
    v_result TEXT;
BEGIN
    v_year := EXTRACT(YEAR FROM NOW());
    
    INSERT INTO document_sequences (company_id, document_type, year, sequence_number, prefix)
    VALUES (p_company_id, 'DN', v_year, 1, 'DN')
    ON CONFLICT (company_id, document_type, year) 
    DO UPDATE SET sequence_number = document_sequences.sequence_number + 1
    RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    
    IF v_seq IS NULL THEN
        UPDATE document_sequences 
        SET sequence_number = sequence_number + 1 
        WHERE company_id = p_company_id AND document_type = 'DN' AND year = v_year
        RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    END IF;
    
    v_result := v_prefix || '-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to get next credit note number
-- ============================================================================

CREATE OR REPLACE FUNCTION get_next_credit_note_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
    v_prefix TEXT;
    v_result TEXT;
BEGIN
    v_year := EXTRACT(YEAR FROM NOW());
    
    INSERT INTO document_sequences (company_id, document_type, year, sequence_number, prefix)
    VALUES (p_company_id, 'CN', v_year, 1, 'CN')
    ON CONFLICT (company_id, document_type, year) 
    DO UPDATE SET sequence_number = document_sequences.sequence_number + 1
    RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    
    IF v_seq IS NULL THEN
        UPDATE document_sequences 
        SET sequence_number = sequence_number + 1 
        WHERE company_id = p_company_id AND document_type = 'CN' AND year = v_year
        RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    END IF;
    
    v_result := v_prefix || '-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to create customer ledger entry
-- ============================================================================

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
    -- Get current running balance
    SELECT COALESCE(MAX(running_balance), 0) INTO v_running_balance
    FROM customer_ledger
    WHERE customer_id = p_customer_id;
    
    -- Calculate new running balance
    v_running_balance := v_running_balance + p_debit - p_credit;
    
    -- Insert ledger entry
    INSERT INTO customer_ledger (
        company_id,
        customer_id,
        document_type,
        document_id,
        reference_number,
        debit,
        credit,
        running_balance,
        posting_date,
        description,
        created_by
    ) VALUES (
        p_company_id,
        p_customer_id,
        p_document_type,
        p_document_id,
        p_reference_number,
        p_debit,
        p_credit,
        v_running_balance,
        p_posting_date,
        p_description,
        p_created_by
    )
    RETURNING id INTO v_ledger_id;
    
    RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to validate posting date (prevent future dates and closed periods)
-- ============================================================================

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
    
    -- Check if date is in the future beyond threshold
    IF p_posting_date > v_max_future_date THEN
        RETURN QUERY SELECT FALSE, 'Posting date cannot be more than ' || p_allow_future_days || ' days in the future';
    END IF;
    
    -- Check if date is in a closed period (you can expand this logic)
    -- For now, just validate it's not too far in the past (within current financial year)
    IF p_posting_date < (DATE_TRUNC('year', v_today)) THEN
        RETURN QUERY SELECT FALSE, 'Cannot post to a previous financial year';
    END IF;
    
    RETURN QUERY SELECT TRUE, NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to check for duplicate customer name
-- ============================================================================

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
      AND is_deleted = false
      AND (p_exclude_customer_id IS NULL OR id != p_exclude_customer_id);
    
    RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function to check for duplicate account code
-- ============================================================================

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
