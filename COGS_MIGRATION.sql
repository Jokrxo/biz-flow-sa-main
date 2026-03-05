-- ============================================================================
-- COGS / INVENTORY CONFIGURATION MIGRATION
-- ============================================================================
-- Implements IFRS/SA GAAP compliant Cost of Goods Sold
-- Supports Perpetual and Periodic inventory systems
-- FIFO and Weighted Average Cost methods (LIFO prohibited)
-- ============================================================================

-- ============================================================================
-- 1. ADD COLUMNS TO COMPANY_CONFIG (if table exists)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_config') THEN
        -- Inventory System: perpetual | periodic
        ALTER TABLE company_config ADD COLUMN IF NOT EXISTS inventory_system VARCHAR(20) DEFAULT 'perpetual';
        
        -- Costing Method: fifo | weighted_average (LIFO is prohibited for SA/IFRS)
        ALTER TABLE company_config ADD COLUMN IF NOT EXISTS costing_method VARCHAR(20) DEFAULT 'fifo';
        
        -- Fixed Markup Percentage (fallback for perpetual without detailed tracking)                         
        ALTER TABLE company_config ADD COLUMN IF NOT EXISTS markup_percentage DECIMAL(5,2);
        
        -- COGS Account ID reference
        ALTER TABLE company_config ADD COLUMN IF NOT EXISTS cogs_account_id UUID REFERENCES chart_of_accounts(id);
        
        -- Period Lock (prevent method changes mid-period)
        ALTER TABLE company_config ADD COLUMN IF NOT EXISTS period_locked BOOLEAN DEFAULT false;
        ALTER TABLE company_config ADD COLUMN IF NOT EXISTS period_locked_date DATE;
    END IF;
END $$;

-- ============================================================================
-- 2. ADD is_cogs FLAG TO CHART_OF_ACCOUNTS
-- ============================================================================

ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS is_cogs BOOLEAN DEFAULT false;

-- ============================================================================
-- 3. CREATE INVENTORY_ITEMS TABLE (for detailed tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_inventory_items_company ON inventory_items(company_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON inventory_items(sku);

-- ============================================================================
-- 4. CREATE FIFO LAYERS TABLE (for perpetual FIFO tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fifo_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    batch_reference VARCHAR(100),
    quantity DECIMAL(15,3) NOT NULL,
    remaining_quantity DECIMAL(15,3) NOT NULL,
    unit_cost DECIMAL(15,4) NOT NULL,
    total_cost DECIMAL(15,2) NOT NULL,
    purchase_date DATE NOT NULL,
    expiry_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_layers_item ON fifo_layers(inventory_item_id, remaining_quantity);

-- ============================================================================
-- 5. CREATE INVENTORY_TRANSACTIONS TABLE (for perpetual tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL, -- purchase, sale, adjustment, return
    reference_type VARCHAR(50), -- invoice, quote, etc
    reference_id UUID,
    quantity DECIMAL(15,3) NOT NULL,
    unit_cost DECIMAL(15,4),
    total_cost DECIMAL(15,2),
    cogs_amount DECIMAL(15,2), -- COGS posted for sales
    transaction_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item ON inventory_transactions(inventory_item_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_reference ON inventory_transactions(reference_type, reference_id);

-- ============================================================================
-- 6. CREATE PERIOD_END_INVENTORY TABLE (for periodic system)
-- ============================================================================

CREATE TABLE IF NOT EXISTS period_end_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    beginning_inventory DECIMAL(15,2) NOT NULL,
    total_purchases DECIMAL(15,2) NOT NULL,
    ending_inventory DECIMAL(15,2) NOT NULL,
    cogs_amount DECIMAL(15,2) NOT NULL,
    cogs_journal_id UUID, -- reference to journal entry
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    calculated_by UUID REFERENCES auth.users(id),
    notes TEXT,
    UNIQUE(company_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_period_end_inventory_company ON period_end_inventory(company_id, period_year, period_month);

-- ============================================================================
-- 7. ENABLE RLS ON NEW TABLES
-- ============================================================================

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fifo_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_end_inventory ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role inventory_items" ON inventory_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role fifo_layers" ON fifo_layers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role inventory_transactions" ON inventory_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role period_end_inventory" ON period_end_inventory FOR ALL USING (true) WITH CHECK (true);

-- Authenticated users can read
CREATE POLICY "Authenticated inventory_items" ON inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated fifo_layers" ON fifo_layers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated inventory_transactions" ON inventory_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated period_end_inventory" ON period_end_inventory FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 8. CREATE COGS HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate weighted average cost
CREATE OR REPLACE FUNCTION calculate_weighted_average_cost(p_item_id UUID)
RETURNS DECIMAL(15,4) AS $$
DECLARE
    v_total_cost DECIMAL(15,2);
    v_total_quantity DECIMAL(15,3);
BEGIN
    SELECT COALESCE(SUM(total_cost), 0), COALESCE(SUM(quantity), 0)
    INTO v_total_cost, v_total_quantity
    FROM inventory_transactions
    WHERE inventory_item_id = p_item_id AND transaction_type = 'purchase';
    
    IF v_total_quantity > 0 THEN
        RETURN v_total_cost / v_total_quantity;
    END IF;
    
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get FIFO cost for a sale quantity
CREATE OR REPLACE FUNCTION get_fifo_cost(p_item_id UUID, p_quantity DECIMAL(15,3))
RETURNS TABLE(unit_cost DECIMAL(15,4), total_cost DECIMAL(15,2), remaining_qty DECIMAL(15,3)) AS $$
DECLARE
    v_remaining DECIMAL(15,3) := p_quantity;
    v_unit_cost DECIMAL(15,4);
    v_total_cost DECIMAL(15,2) := 0;
    v_layer RECORD;
    v_result_unit_cost DECIMAL(15,4);
BEGIN
    FOR v_layer IN 
        SELECT id, remaining_quantity, unit_cost
        FROM fifo_layers
        WHERE inventory_item_id = p_item_id AND remaining_quantity > 0
        ORDER BY purchase_date ASC
    LOOP
        IF v_remaining <= 0 THEN
            EXIT;
        END IF;
        
        IF v_layer.remaining_quantity >= v_remaining THEN
            v_total_cost := v_total_cost + (v_remaining * v_layer.unit_cost);
            v_remaining := 0;
            v_result_unit_cost := v_layer.unit_cost;
        ELSE
            v_total_cost := v_total_cost + (v_layer.remaining_quantity * v_layer.unit_cost);
            v_remaining := v_remaining - v_layer.remaining_quantity;
            v_result_unit_cost := v_layer.unit_cost;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_result_unit_cost, v_total_cost, v_remaining;
END;
$$ LANGUAGE plpgsql;

-- Function to post COGS for perpetual inventory
CREATE OR REPLACE FUNCTION post_cogs_entry(
    p_company_id UUID,
    p_item_id UUID,
    p_quantity DECIMAL(15,3),
    p_reference_type VARCHAR,
    p_reference_id UUID,
    p_costing_method VARCHAR,
    p_transaction_date DATE
)
RETURNS TABLE(cogs_amount DECIMAL(15,2), unit_cost DECIMAL(15,4)) AS $$
DECLARE
    v_unit_cost DECIMAL(15,4);
    v_total_cost DECIMAL(15,2);
    v_cogs_amount DECIMAL(15,2);
BEGIN
    IF p_costing_method = 'fifo' THEN
        -- Get FIFO cost
        SELECT unit_cost, total_cost INTO v_unit_cost, v_total_cost
        FROM get_fifo_cost(p_item_id, p_quantity);
        
        -- Update FIFO layers
        UPDATE fifo_layers
        SET remaining_quantity = remaining_quantity - p_quantity
        WHERE inventory_item_id = p_item_id AND remaining_quantity > 0
        ORDER BY purchase_date ASC
        LIMIT 1;
    ELSE
        -- Weighted average
        v_unit_cost := calculate_weighted_average_cost(p_item_id);
        v_total_cost := p_quantity * v_unit_cost;
    END IF;
    
    v_cogs_amount := v_total_cost;
    
    -- Insert inventory transaction
    INSERT INTO inventory_transactions (
        company_id, inventory_item_id, transaction_type, reference_type, reference_id,
        quantity, unit_cost, total_cost, cogs_amount, transaction_date
    ) VALUES (
        p_company_id, p_item_id, 'sale', p_reference_type, p_reference_id,
        p_quantity, v_unit_cost, v_total_cost, v_cogs_amount, p_transaction_date
    );
    
    -- Update inventory item quantity
    UPDATE inventory_items
    SET current_quantity = current_quantity - p_quantity,
        average_cost = calculate_weighted_average_cost(id)
    WHERE id = p_item_id;
    
    RETURN QUERY SELECT v_cogs_amount, v_unit_cost;
END;
$$ LANGUAGE plpgsql;

-- Function to check if period is locked
CREATE OR REPLACE FUNCTION is_period_locked(p_company_id UUID, p_year INTEGER, p_month INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_locked BOOLEAN;
    v_lock_date DATE;
BEGIN
    SELECT period_locked, period_locked_date INTO v_locked, v_lock_date
    FROM company_config
    WHERE company_id = p_company_id
    LIMIT 1;
    
    IF v_locked AND v_lock_date IS NOT NULL THEN
        IF MAKE_DATE(p_year, p_month, 1) <= v_lock_date THEN
            RETURN true;
        END IF;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ✅ COGS MIGRATION COMPLETE
-- ============================================================================
