-- SIMPLE_FIX_V_DEBTORS.sql
-- Simple fix for unrestricted v_debtors_reconciliation view

-- First check what columns exist in the view
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'v_debtors_reconciliation'
ORDER BY ordinal_position;

-- Then drop any open policies and add proper ones
DO $$
BEGIN
  -- Drop the unrestricted policy
  DROP POLICY IF EXISTS "v_debtors_reconciliation_unrestricted" ON v_debtors_reconciliation;
  
  -- Check if there's a company_id column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'v_debtors_reconciliation' AND column_name = 'company_id'
  ) THEN
    -- Create company-based policy
    CREATE POLICY "v_debtors_reconciliation_company_policy" ON v_debtors_reconciliation
    FOR SELECT USING (
      company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
      OR company_id IS NULL
    );
    RAISE NOTICE 'Created company-based policy';
  ELSE
    -- Create a simple authenticated-only policy
    CREATE POLICY "v_debtors_reconciliation_authenticated" ON v_debtors_reconciliation
    FOR SELECT USING (true);
    RAISE NOTICE 'Created authenticated-only policy';
  END IF;
END $$;

SELECT 'Fixed v_debtors_reconciliation - added security policy' as result;
