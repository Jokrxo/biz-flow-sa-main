-- Fix transaction_entries table: Add status column if missing
-- This fixes the issue where code tries to insert status but column doesn't exist

-- Add status column if it doesn't exist
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
    
    -- Add CHECK constraint for valid status values
    ALTER TABLE public.transaction_entries
    ADD CONSTRAINT transaction_entries_status_check 
    CHECK (status IN ('pending', 'allocated', 'deleted', 'approved'));
    
    -- Set default for existing records
    UPDATE public.transaction_entries 
    SET status = 'pending' 
    WHERE status IS NULL;
  END IF;
END $$;

-- Ensure the status column is NOT NULL after setting defaults
DO $$
BEGIN
  -- First update any null values
  UPDATE public.transaction_entries 
  SET status = 'pending' 
  WHERE status IS NULL;
  
  -- Then make it NOT NULL if it's still nullable
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

-- Ensure the CHECK constraint exists (drop and recreate to ensure it's correct)
ALTER TABLE public.transaction_entries 
DROP CONSTRAINT IF EXISTS transaction_entries_status_check;

ALTER TABLE public.transaction_entries
ADD CONSTRAINT transaction_entries_status_check 
CHECK (status IN ('pending', 'allocated', 'deleted', 'approved'));

-- Also ensure transactions table has correct status constraint
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_status_check;

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_status_check 
CHECK (status IN ('pending', 'approved', 'rejected', 'posted'));
