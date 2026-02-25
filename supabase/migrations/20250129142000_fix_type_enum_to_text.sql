-- Fix for Type Enum Mismatch: Convert type column to text and standardize values

-- 1. Remove default value (if any)
ALTER TABLE "public"."tasks" ALTER COLUMN "type" DROP DEFAULT;

-- 2. Convert column to text
ALTER TABLE "public"."tasks" ALTER COLUMN "type" TYPE text USING type::text;

-- 3. Standardize existing data
-- Fix any potential plural values or typos
UPDATE "public"."tasks" SET type = 'transaction' WHERE type = 'transactions';
UPDATE "public"."tasks" SET type = 'allocation' WHERE type = 'allocations';

-- 4. Drop existing check constraint if it exists
ALTER TABLE "public"."tasks" DROP CONSTRAINT IF EXISTS tasks_type_check;

-- 5. Add strict check constraint matching the application types
ALTER TABLE "public"."tasks" ADD CONSTRAINT tasks_type_check 
  CHECK (type IN ('system', 'assigned', 'recurring', 'transaction', 'allocation'));

-- 6. No specific default needed, but could add one if desired
