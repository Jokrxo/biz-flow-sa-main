-- CHECK_VIEW_POLICIES.sql
-- Check and fix all policies on the view

-- Check what policies exist on the view
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'v_debtors_reconciliation';

-- Check if RLS is enabled on the view
SELECT 
  relname,
  relrowsecurity
FROM pg_class
WHERE relname = 'v_debtors_reconciliation';

-- Remove ALL policies on the view
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'v_debtors_reconciliation' LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || pol.policyname || ' ON v_debtors_reconciliation';
    RAISE NOTICE 'Dropped policy: %', pol.policyname;
  END LOOP;
  
  -- Also try to drop any policy with "unrestricted" in the name
  DROP POLICY IF EXISTS "v_debtors_reconciliation_unrestricted" ON v_debtors_reconciliation;
END $$;

-- The issue might be that views don't support RLS in the same way
-- Let's just ensure no policies exist now
SELECT 'All policies removed from v_debtors_reconciliation view' as result;

-- If you still see "unrestricted", it might be cached in the UI
-- Run this to verify:
-- SELECT * FROM pg_policies WHERE tablename = 'v_debtors_reconciliation';
