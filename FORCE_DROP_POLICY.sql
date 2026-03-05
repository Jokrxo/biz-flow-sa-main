-- FORCE_DROP_POLICY.sql
-- Force drop ALL policies from v_debtors_reconciliation

-- Try to drop each known policy name
DROP POLICY IF EXISTS "v_debtors_reconciliation_unrestricted" ON v_debtors_reconciliation;
DROP POLICY IF EXISTS "v_debtors_reconciliation_select" ON v_debtors_reconciliation;
DROP POLICY IF EXISTS "v_debtors_reconciliation_all" ON v_debtors_reconciliation;
DROP POLICY IF EXISTS "v_debtors_reconciliation_company_policy" ON v_debtors_reconciliation;
DROP POLICY IF EXISTS "v_debtors_reconciliation_authenticated" ON v_debtors_reconciliation;

-- Get all policy names and drop them
SELECT 
  'DROP POLICY IF EXISTS "' || policyname || '" ON v_debtors_reconciliation;' as drop_sql
FROM pg_policies
WHERE tablename = 'v_debtors_reconciliation';

-- Execute each policy drop
DO $$
DECLARE
  pol text;
BEGIN
  FOR pol IN 
    SELECT 'DROP POLICY IF EXISTS "' || policyname || '" ON v_debtors_reconciliation' 
    FROM pg_policies 
    WHERE tablename = 'v_debtors_reconciliation'
  LOOP
    EXECUTE pol;
    RAISE NOTICE 'Dropped: %', pol;
  END LOOP;
END $$;

-- Verify no policies remain
SELECT 'Remaining policies:' as status;
SELECT policyname FROM pg_policies WHERE tablename = 'v_debtors_reconciliation';
