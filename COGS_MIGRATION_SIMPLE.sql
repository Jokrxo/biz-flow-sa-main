-- ============================================================================
-- COGS / INVENTORY CONFIGURATION MIGRATION - SIMPLE VERSION
-- ============================================================================
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Create inventory_items table
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    description TEXT,
    current_quantity DECIMAL(15,3) DEFAULT 0,
    unit_cost DECIMAL(15,4),
    average_cost DECIMAL(15,4),
    reorder_level DECIMAL(15,3),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create fifo_layers table
CREATE TABLE IF NOT EXISTS fifo_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    company_id UUID,
    batch_reference VARCHAR(100),
    quantity DECIMAL(15,3) NOT NULL,
    remaining_quantity DECIMAL(15,3) NOT NULL,
    unit_cost DECIMAL(15,4) NOT NULL,
    total_cost DECIMAL(15,2) NOT NULL,
    purchase_date DATE NOT NULL,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create inventory_transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    quantity DECIMAL(15,3) NOT NULL,
    unit_cost DECIMAL(15,4),
    total_cost DECIMAL(15,2),
    cogs_amount DECIMAL(15,2),
    transaction_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- 4. Create period_end_inventory table
CREATE TABLE IF NOT EXISTS period_end_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    beginning_inventory DECIMAL(15,2) NOT NULL,
    total_purchases DECIMAL(15,2) NOT NULL,
    ending_inventory DECIMAL(15,2) NOT NULL,
    cogs_amount DECIMAL(15,2) NOT NULL,
    cogs_journal_id UUID,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    calculated_by UUID,
    notes TEXT,
    UNIQUE(company_id, period_year, period_month)
);

-- 5. Create company_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    inventory_system VARCHAR(20) DEFAULT 'perpetual',
    costing_method VARCHAR(20) DEFAULT 'fifo',
    markup_percentage DECIMAL(5,2),
    period_locked BOOLEAN DEFAULT false,
    period_locked_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id)
);

-- 6. Enable RLS on new tables
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fifo_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_end_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
CREATE POLICY "Service role inventory_items" ON inventory_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role fifo_layers" ON fifo_layers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role inventory_transactions" ON inventory_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role period_end_inventory" ON period_end_inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role company_settings" ON company_settings FOR ALL USING (true) WITH CHECK (true);

-- ✅ MIGRATION COMPLETE
