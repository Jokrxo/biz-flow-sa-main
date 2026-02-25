-- Add additional company fields for tax and business information
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS business_type TEXT,
ADD COLUMN IF NOT EXISTS tax_number TEXT,
ADD COLUMN IF NOT EXISTS vat_number TEXT;