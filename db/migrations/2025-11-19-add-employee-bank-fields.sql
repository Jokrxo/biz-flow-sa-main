-- Add bank-related columns to employees table (South Africa alignment)
-- Safe to run multiple times due to IF NOT EXISTS

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_name text;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_branch_code text;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_account_number text;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_account_type text;

-- Optional indexes for quick filtering/search (safe if they already exist)
CREATE INDEX IF NOT EXISTS idx_employees_bank_name ON employees (bank_name);
CREATE INDEX IF NOT EXISTS idx_employees_bank_account_number ON employees (bank_account_number);