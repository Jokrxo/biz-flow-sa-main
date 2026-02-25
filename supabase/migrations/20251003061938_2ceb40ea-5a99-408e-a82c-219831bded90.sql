-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view suppliers in their company"
ON suppliers FOR SELECT
USING (company_id = get_user_company(auth.uid()));

CREATE POLICY "Administrators and accountants can manage suppliers"
ON suppliers FOR ALL
USING (
  has_role(auth.uid(), 'administrator'::app_role, company_id) OR 
  has_role(auth.uid(), 'accountant'::app_role, company_id)
);

-- Trigger for updated_at
CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();