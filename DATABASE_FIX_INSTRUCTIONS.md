# Database Transaction Fix Instructions

## Problem
Transactions are failing because the `transaction_entries` table is missing the `status` column that the application code expects.

## Solution
Two migration files have been created to fix this issue:

1. `supabase/migrations/20250104000000_fix_transaction_entries_status.sql`
   - Adds the `status` column to `transaction_entries` table if it doesn't exist
   - Adds proper CHECK constraints for valid status values
   - Ensures the column is NOT NULL with a default value of 'pending'

2. `supabase/migrations/20250104000001_fix_transaction_validation.sql`
   - Adds validation helper functions

## How to Apply the Fix

### Option 1: Using Supabase CLI (Recommended)
```bash
# Navigate to your project directory
cd C:\Users\sinet\.cursor\biz-flow-sa

# Link to your Supabase project (if not already linked)
npx supabase link --project-ref YOUR_PROJECT_REF

# Apply the migrations
npx supabase db push
```

### Option 2: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy the contents of `supabase/migrations/20250104000000_fix_transaction_entries_status.sql`
4. Paste and run it in the SQL Editor
5. Repeat for `supabase/migrations/20250104000001_fix_transaction_validation.sql`

### Option 3: Manual SQL Execution
Run these SQL commands in your Supabase SQL Editor:

```sql
-- Fix transaction_entries table: Add status column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'transaction_entries' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.transaction_entries 
    ADD COLUMN status TEXT DEFAULT 'pending';
    
    ALTER TABLE public.transaction_entries
    ADD CONSTRAINT transaction_entries_status_check 
    CHECK (status IN ('pending', 'allocated', 'deleted', 'approved'));
    
    UPDATE public.transaction_entries 
    SET status = 'pending' 
    WHERE status IS NULL;
  END IF;
END $$;

-- Ensure status is NOT NULL
DO $$
BEGIN
  UPDATE public.transaction_entries 
  SET status = 'pending' 
  WHERE status IS NULL;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'transaction_entries' 
    AND column_name = 'status'
    AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.transaction_entries 
    ALTER COLUMN status SET NOT NULL;
  END IF;
END $$;

-- Ensure CHECK constraint exists
ALTER TABLE public.transaction_entries 
DROP CONSTRAINT IF EXISTS transaction_entries_status_check;

ALTER TABLE public.transaction_entries
ADD CONSTRAINT transaction_entries_status_check 
CHECK (status IN ('pending', 'allocated', 'deleted', 'approved'));

-- Fix transactions table status constraint
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_status_check 
CHECK (status IN ('pending', 'approved', 'rejected', 'posted'));
```

## Verification
After applying the fix, verify by running:

```sql
-- Check if status column exists
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'transaction_entries'
  AND column_name = 'status';

-- Should return: status | text | NO | 'pending'::text
```

## What This Fixes
- ✅ Adds missing `status` column to `transaction_entries` table
- ✅ Ensures proper CHECK constraints for valid status values
- ✅ Sets default value for existing records
- ✅ Fixes transaction insertion errors
- ✅ Aligns database schema with application code expectations

## Next Steps
After applying the migration:
1. Test creating a new transaction
2. Verify transaction entries are created successfully
3. Check that transactions can be approved/posted
