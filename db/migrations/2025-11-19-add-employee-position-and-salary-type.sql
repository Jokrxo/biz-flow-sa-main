ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS position text;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS salary_type text;