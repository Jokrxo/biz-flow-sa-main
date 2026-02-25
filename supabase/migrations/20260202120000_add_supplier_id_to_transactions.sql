ALTER TABLE transactions ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);

CREATE INDEX IF NOT EXISTS idx_transactions_supplier_id ON transactions(supplier_id);
