-- Add column to track number of medical aid members (Main member + dependents)
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS medical_aid_members INTEGER DEFAULT 0;
