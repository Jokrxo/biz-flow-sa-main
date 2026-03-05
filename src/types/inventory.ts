/**
 * ============================================================================
 * INVENTORY & COGS TYPES - IFRS/SA GAAP Compliant
 * ============================================================================
 * Defines types for Cost of Goods Sold configuration supporting:
 * - Perpetual and Periodic inventory systems
 * - FIFO and Weighted Average Cost methods
 * - LIFO is PROHIBITED for South African / IFRS compliance
 * ============================================================================
 */

/**
 * Inventory system types supported
 * - perpetual: Real-time COGS posting on every sale
 * - periodic: COGS calculated only at period-end
 */
export type InventorySystem = 'perpetual' | 'periodic';

/**
 * Costing methods supported (IFRS/SA GAAP compliant)
 * - fifo: First In, First Out (DEFAULT)
 * - weighted_average: Weighted Average Cost
 * - lifo: PROHIBITED in South Africa (US GAAP only)
 */
export type CostingMethod = 'fifo' | 'weighted_average';

/**
 * Company COGS Configuration
 * Stored in company_config table
 */
export interface CompanyCOGSConfig {
  id?: string;
  company_id: string;
  inventory_system: InventorySystem;
  costing_method: CostingMethod;
  markup_percentage?: number;
  cogs_account_id?: string;
  period_locked: boolean;
  period_locked_date?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Inventory Item for detailed tracking
 */
export interface InventoryItem {
  id: string;
  company_id: string;
  name: string;
  sku?: string;
  description?: string;
  current_quantity: number;
  unit_cost?: number;
  average_cost?: number;
  reorder_level?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * FIFO Layer for perpetual FIFO tracking
 */
export interface FIFOLayer {
  id: string;
  inventory_item_id: string;
  company_id: string;
  batch_reference?: string;
  quantity: number;
  remaining_quantity: number;
  unit_cost: number;
  total_cost: number;
  purchase_date: string;
  expiry_date?: string;
  created_at?: string;
}

/**
 * Inventory Transaction types
 */
export type InventoryTransactionType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'transfer';

/**
 * Inventory Transaction Record
 */
export interface InventoryTransaction {
  id: string;
  company_id: string;
  inventory_item_id: string;
  transaction_type: InventoryTransactionType;
  reference_type?: string;
  reference_id?: string;
  quantity: number;
  unit_cost?: number;
  total_cost?: number;
  cogs_amount?: number;
  transaction_date: string;
  notes?: string;
  created_at?: string;
  created_by?: string;
}

/**
 * Period End Inventory Record (for periodic system)
 */
export interface PeriodEndInventory {
  id: string;
  company_id: string;
  period_year: number;
  period_month: number;
  beginning_inventory: number;
  total_purchases: number;
  ending_inventory: number;
  cogs_amount: number;
  cogs_journal_id?: string;
  calculated_at?: string;
  calculated_by?: string;
  notes?: string;
}

/**
 * COGS Calculation Result
 */
export interface COGSCalculationResult {
  cogsAmount: number;
  unitCost: number;
  method: CostingMethod;
  calculationDate: string;
}

/**
 * FIFO Cost Extraction Result
 */
export interface FIFOCostResult {
  unitCost: number;
  totalCost: number;
  remainingQty: number;
}

/**
 * Periodic COGS Calculation Input
 */
export interface PeriodicCOGSInput {
  beginningInventory: number;
  totalPurchases: number;
  endingInventory: number;
}

/**
 * Periodic COGS Calculation Result
 */
export interface PeriodicCOGSResult {
  cogsAmount: number;
  formula: string;
  calculationDate: string;
}

/**
 * COGS Journal Entry Line
 */
export interface COGSJournalEntry {
  account_id: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * COGS Posting Result
 */
export interface COGSPostingResult {
  success: boolean;
  cogsAmount: number;
  journalEntryId?: string;
  error?: string;
}

/**
 * Validation result for COGS operations
 */
export interface COGSValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
