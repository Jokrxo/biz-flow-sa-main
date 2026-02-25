-- Fix for Enum Mismatch: Convert status column to text and standardize values

-- 1. Remove default value temporarily to avoid type issues
ALTER TABLE "public"."tasks" ALTER COLUMN "status" DROP DEFAULT;

-- 2. Convert column to text (handles existing Enum or Text types)
ALTER TABLE "public"."tasks" ALTER COLUMN "status" TYPE text USING status::text;

-- 3. Standardize existing data (Fix potential mismatches)
-- If there are any 'pending_approved' (maybe confusingly named previously), map them to 'pending_approval'
UPDATE "public"."tasks" SET status = 'pending_approval' WHERE status = 'pending_approved';
UPDATE "public"."tasks" SET status = 'todo' WHERE status = 'to_do';

-- 4. Drop existing check constraint if it exists
ALTER TABLE "public"."tasks" DROP CONSTRAINT IF EXISTS tasks_status_check;

-- 5. Add strict check constraint matching the application types
ALTER TABLE "public"."tasks" ADD CONSTRAINT tasks_status_check 
  CHECK (status IN ('todo', 'in_progress', 'review', 'completed', 'pending_approval'));

-- 6. Restore default value
ALTER TABLE "public"."tasks" ALTER COLUMN "status" SET DEFAULT 'todo';
