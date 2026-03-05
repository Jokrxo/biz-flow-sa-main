-- Invoice Enhancements Migration
-- 1. Add sequential numbering fields
-- 2. Add printed flag
-- 3. Add status history tracking

-- Add new columns to invoices table if they don't exist
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- Create invoice_sequences table to track invoice numbers per company
CREATE TABLE IF NOT EXISTS invoice_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    sequence_number INTEGER NOT NULL DEFAULT 0,
    prefix TEXT DEFAULT 'INV',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, year)
);

-- Create function to get next invoice number
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
    v_prefix TEXT;
    v_result TEXT;
BEGIN
    v_year := EXTRACT(YEAR FROM NOW());
    
    -- Get or create sequence for this company/year
    INSERT INTO invoice_sequences (company_id, year, sequence_number, prefix)
    VALUES (p_company_id, v_year, 1, 'INV')
    ON CONFLICT (company_id, year) 
    DO UPDATE SET sequence_number = invoice_sequences.sequence_number + 1
    RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    
    -- If the above didn't return (already existed), get the incremented value
    IF v_seq IS NULL THEN
        UPDATE invoice_sequences 
        SET sequence_number = sequence_number + 1 
        WHERE company_id = p_company_id AND year = v_year
        RETURNING sequence_number, prefix INTO v_seq, v_prefix;
    END IF;
    
    v_result := v_prefix || '-' || v_year || '-' || LPAD(v_seq::TEXT, 5, '0');
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Create invoice_status_history table
CREATE TABLE IF NOT EXISTS invoice_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    reason TEXT
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_invoice_sequences_company_year ON invoice_sequences(company_id, year);
CREATE INDEX IF NOT EXISTS idx_invoice_status_history_invoice ON invoice_status_history(invoice_id);
