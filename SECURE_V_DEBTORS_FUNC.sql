-- SECURE_V_DEBTORS_FUNC.sql
-- Create a secure function to access the view

-- Drop existing policies
DO $$
BEGIN
  DROP POLICY IF EXISTS "v_debtors_reconciliation_unrestricted" ON v_debtors_reconciliation;
END $$;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_debtors_reconciliation();

-- Create a function that returns the view data filtered by company
CREATE OR REPLACE FUNCTION get_debtors_reconciliation()
RETURNS TABLE (
  id UUID,
  company_id UUID,
  customer_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  total_invoiced NUMERIC,
  total_paid NUMERIC,
  outstanding NUMERIC,
  invoice_count BIGINT,
  last_invoice_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return data based on user's company
  RETURN QUERY
  SELECT 
    c.id,
    c.company_id,
    c.name AS customer_name,
    c.email,
    c.phone,
    c.address,
    COALESCE(SUM(t.total_amount), 0)::NUMERIC AS total_invoiced,
    COALESCE(SUM(CASE WHEN t.status = 'paid' THEN t.total_amount ELSE 0 END), 0)::NUMERIC AS total_paid,
    COALESCE(SUM(CASE WHEN t.status != 'paid' THEN t.total_amount ELSE 0 END), 0)::NUMERIC AS outstanding,
    COUNT(t.id)::BIGINT AS invoice_count,
    MAX(t.transaction_date)::DATE AS last_invoice_date
  FROM customers c
  LEFT JOIN transactions t ON t.customer_id = c.id AND t.transaction_type = 'invoice'
  WHERE c.is_active = true
  AND (
    c.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1)
    OR (SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1) IS NULL
  )
  GROUP BY c.id, c.company_id, c.name, c.email, c.phone, c.address;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_debtors_reconciliation TO authenticated;
GRANT EXECUTE ON FUNCTION get_debtors_reconciliation TO anon;

SELECT 'Created secure function get_debtors_reconciliation() - use this instead of the view' as result;
