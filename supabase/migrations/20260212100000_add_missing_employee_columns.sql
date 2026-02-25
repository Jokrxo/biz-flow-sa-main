-- Add missing columns to employees table to match the UI form
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS position text,
ADD COLUMN IF NOT EXISTS department text,
ADD COLUMN IF NOT EXISTS payroll_number text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS paye_registered boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS uif_registered boolean DEFAULT false;
