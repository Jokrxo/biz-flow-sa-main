-- Fix for Enum Mismatch: Convert module column to text and standardize values

-- 1. Remove default value temporarily to avoid type issues
ALTER TABLE "public"."tasks" ALTER COLUMN "module" DROP DEFAULT;

-- 2. Convert column to text (handles existing Enum or Text types)
ALTER TABLE "public"."tasks" ALTER COLUMN "module" TYPE text USING module::text;

-- 3. Standardize existing data (Fix lowercase or singular values if any exist)
UPDATE "public"."tasks" SET module = 'Purchases' WHERE module ILIKE 'purchase%';
UPDATE "public"."tasks" SET module = 'Sales' WHERE module ILIKE 'sale%';
UPDATE "public"."tasks" SET module = 'Payroll' WHERE module ILIKE 'payroll';
UPDATE "public"."tasks" SET module = 'Assets' WHERE module ILIKE 'asset%';
UPDATE "public"."tasks" SET module = 'Banking' WHERE module ILIKE 'bank%';
UPDATE "public"."tasks" SET module = 'VAT' WHERE module ILIKE 'vat';
UPDATE "public"."tasks" SET module = 'GL' WHERE module ILIKE 'gl';

-- 4. Drop existing check constraint if it exists
ALTER TABLE "public"."tasks" DROP CONSTRAINT IF EXISTS tasks_module_check;

-- 5. Add strict check constraint matching the application types
ALTER TABLE "public"."tasks" ADD CONSTRAINT tasks_module_check 
  CHECK (module IN ('GL', 'Payroll', 'VAT', 'Assets', 'Sales', 'Purchases', 'Banking'));

-- 6. Restore default value (optional, but good practice)
ALTER TABLE "public"."tasks" ALTER COLUMN "module" SET DEFAULT 'GL';
