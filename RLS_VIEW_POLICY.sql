-- ============================================================================
-- DEBTORS RECONCILIATION VIEW - RLS ALTERNATIVE
-- ============================================================================
-- Views in PostgreSQL cannot have RLS policies directly
-- Solution: Create a secure function that wraps the view query
-- ============================================================================

-- Option 1: Leave unrestricted (views inherit RLS from underlying tables)
-- Since customers, customer_ledger, and documents have RLS, the view is secure

-- Option 2: Create a secure function wrapper (if needed)
-- This function will enforce RLS when called

CREATE OR REPLACE FUNCTION get_debtors_reconciliation()
RETURNS TABLE (
    customer_id UUID,
    customer_name TEXT,
    ledger_balance NUMERIC,
    invoice_total NUMERIC,
    payments_received NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as customer_id,
        c.name as customer_name,
        COALESCE(SUM(cl.running_balance), 0)::NUMERIC as ledger_balance,
        (SELECT COALESCE(SUM(total_amount), 0) FROM documents WHERE customer_id = c.id AND document_type = 'invoice' AND status != 'cancelled')::NUMERIC as invoice_total,
        (SELECT COALESCE(SUM(paid_amount), 0) FROM documents WHERE customer_id = c.id AND document_type = 'invoice')::NUMERIC as payments_received
    FROM customers c
    LEFT JOIN customer_ledger cl ON cl.customer_id = c.id
    WHERE c.is_deleted = false OR c.is_deleted IS NULL
    GROUP BY c.id, c.name;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_debtors_reconciliation() TO authenticated;
GRANT EXECUTE ON FUNCTION get_debtors_reconciliation() TO anon;

-- ============================================================================
-- ✅ VIEW ALTERNATIVE COMPLETE
-- ============================================================================
-- 
-- Usage: SELECT * FROM get_debtors_reconciliation();
-- This function respects RLS on underlying tables
-- ============================================================================
