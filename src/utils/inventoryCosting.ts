/**
 * ============================================================================
 * INVENTORY COSTING UTILITIES - IFRS/SA GAAP Compliant
 * ============================================================================
 * Implements FIFO and Weighted Average Cost methods
 * LIPO is PROHIBITED for South African / IFRS compliance
 * Supports both Perpetual and Periodic inventory systems
 * ============================================================================
 */

import { supabase } from '@/lib/supabase';
import type {
  InventoryItem,
  FIFOLayer,
  InventoryTransaction,
  CostingMethod,
  InventorySystem,
  COGSCalculationResult,
  FIFOCostResult,
  PeriodicCOGSInput,
  PeriodicCOGSResult,
  COGSPostingResult,
  COGSValidationResult,
  CompanyCOGSConfig,
} from '@/types/inventory';

/**
 * ============================================================================
 * FIFO (First In, First Out) COSTING
 * ============================================================================
 * Assumes oldest inventory items are sold first
 * Default method for IFRS/SA GAAP compliance
 * ============================================================================
 */

/**
 * Calculate FIFO cost for a given quantity from available layers
 * @param layers - Array of FIFO layers (must be sorted by purchase date)
 * @param quantity - Quantity to extract
 * @returns FIFO cost calculation result
 */
export function calculateFIFOCost(layers: FIFOLayer[], quantity: number): FIFOCostResult {
  let remainingQty = quantity;
  let totalCost = 0;
  let resultUnitCost = 0;

  // Sort layers by purchase date (oldest first)
  const sortedLayers = [...layers].sort(
    (a, b) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime()
  );

  for (const layer of sortedLayers) {
    if (remainingQty <= 0) break;

    if (layer.remaining_quantity >= remainingQty) {
      totalCost += remainingQty * layer.unit_cost;
      resultUnitCost = layer.unit_cost;
      remainingQty = 0;
    } else {
      totalCost += layer.remaining_quantity * layer.unit_cost;
      resultUnitCost = layer.unit_cost;
      remainingQty -= layer.remaining_quantity;
    }
  }

  return {
    unitCost: resultUnitCost,
    totalCost: Math.round(totalCost * 100) / 100,
    remainingQty,
  };
}

/**
 * Consume FIFO layers for a sale
 * Updates remaining quantities in layers
 * @param itemId - Inventory item ID
 * @param quantity - Quantity being sold
 * @returns COGS calculation result
 */
export async function consumeFIFOLayers(
  itemId: string,
  quantity: number
): Promise<COGSCalculationResult> {
  // Fetch FIFO layers for the item
  const { data: layers, error } = await supabase
    .from('fifo_layers')
    .select('*')
    .eq('inventory_item_id', itemId)
    .gt('remaining_quantity', 0)
    .order('purchase_date', { ascending: true });

  if (error || !layers || layers.length === 0) {
    throw new Error('No FIFO layers available for this item');
  }

  const result = calculateFIFOCost(layers as FIFOLayer[], quantity);

  if (result.remainingQty > 0) {
    throw new Error(`Insufficient inventory. Short by ${result.remainingQty} units`);
  }

  // Update FIFO layers (consume from oldest first)
  let qtyToConsume = quantity;
  for (const layer of layers) {
    if (qtyToConsume <= 0) break;

    const consumeQty = Math.min(layer.remaining_quantity, qtyToConsume);
    
    await supabase
      .from('fifo_layers')
      .update({ remaining_quantity: layer.remaining_quantity - consumeQty })
      .eq('id', layer.id);

    qtyToConsume -= consumeQty;
  }

  // Create inventory transaction record
  await supabase.from('inventory_transactions').insert({
    inventory_item_id: itemId,
    transaction_type: 'sale',
    quantity,
    unit_cost: result.unitCost,
    total_cost: result.totalCost,
    cogs_amount: result.totalCost,
    transaction_date: new Date().toISOString().split('T')[0],
  });

  return {
    cogsAmount: result.totalCost,
    unitCost: result.unitCost,
    method: 'fifo',
    calculationDate: new Date().toISOString(),
  };
}

/**
 * ============================================================================
 * WEIGHTED AVERAGE COSTING
 * ============================================================================
 * Calculates average cost of all units in inventory
 * Alternative method for IFRS/SA GAAP compliance
 * ============================================================================
 */

/**
 * Calculate weighted average cost from inventory transactions
 * @param itemId - Inventory item ID
 * @returns Weighted average cost per unit
 */
export async function calculateWeightedAverageCost(itemId: string): Promise<number> {
  const { data: transactions, error } = await supabase
    .from('inventory_transactions')
    .select('quantity, total_cost')
    .eq('inventory_item_id', itemId)
    .eq('transaction_type', 'purchase');

  if (error || !transactions || transactions.length === 0) {
    return 0;
  }

  const totalQuantity = transactions.reduce((sum, t) => sum + (t.quantity || 0), 0);
  const totalCost = transactions.reduce((sum, t) => sum + (t.total_cost || 0), 0);

  if (totalQuantity === 0) return 0;

  return Math.round((totalCost / totalQuantity) * 10000) / 10000;
}

/**
 * Post COGS using weighted average method
 * @param itemId - Inventory item ID
 * @param quantity - Quantity being sold
 * @returns COGS calculation result
 */
export async function postWeightedAverageCOGS(
  itemId: string,
  quantity: number
): Promise<COGSCalculationResult> {
  const unitCost = await calculateWeightedAverageCost(itemId);
  const totalCost = Math.round(unitCost * quantity * 100) / 100;

  // Update inventory item
  const { data: item } = await supabase
    .from('inventory_items')
    .select('current_quantity')
    .eq('id', itemId)
    .single();

  if (!item) {
    throw new Error('Inventory item not found');
  }

  const newQuantity = item.current_quantity - quantity;
  const newAverageCost = await calculateWeightedAverageCost(itemId);

  await supabase
    .from('inventory_items')
    .update({
      current_quantity: newQuantity,
      average_cost: newAverageCost,
    })
    .eq('id', itemId);

  // Create inventory transaction
  await supabase.from('inventory_transactions').insert({
    inventory_item_id: itemId,
    transaction_type: 'sale',
    quantity,
    unit_cost: unitCost,
    total_cost: totalCost,
    cogs_amount: totalCost,
    transaction_date: new Date().toISOString().split('T')[0],
  });

  return {
    cogsAmount: totalCost,
    unitCost,
    method: 'weighted_average',
    calculationDate: new Date().toISOString(),
  };
}

/**
 * ============================================================================
 * PERIODIC INVENTORY SYSTEM
 * ============================================================================
 * COGS calculated only at period-end
 * Formula: COGS = Beginning Inventory + Purchases - Ending Inventory
 * ============================================================================
 */

/**
 * Calculate COGS using periodic method
 * @param input - Beginning inventory, purchases, and ending inventory values
 * @returns COGS calculation result
 */
export function calculatePeriodicCOGS(input: PeriodicCOGSInput): PeriodicCOGSResult {
  const { beginningInventory, totalPurchases, endingInventory } = input;
  
  const cogsAmount = beginningInventory + totalPurchases - endingInventory;
  
  if (cogsAmount < 0) {
    throw new Error('COGS cannot be negative. Check your inventory values.');
  }

  const formula = `COGS = ${beginningInventory} + ${totalPurchases} - ${endingInventory} = ${cogsAmount}`;

  return {
    cogsAmount: Math.round(cogsAmount * 100) / 100,
    formula,
    calculationDate: new Date().toISOString(),
  };
}

/**
 * Get total purchases for a period from inventory transactions
 * @param companyId - Company ID
 * @param year - Period year
 * @param month - Period month
 * @returns Total purchase amount
 */
export async function getPeriodPurchases(
  companyId: string,
  year: number,
  month: number
): Promise<number> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12 
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  const { data: transactions, error } = await supabase
    .from('inventory_transactions')
    .select('total_cost')
    .eq('company_id', companyId)
    .eq('transaction_type', 'purchase')
    .gte('transaction_date', startDate)
    .lt('transaction_date', endDate);

  if (error || !transactions) {
    return 0;
  }

  return transactions.reduce((sum, t) => sum + (t.total_cost || 0), 0);
}

/**
 * ============================================================================
 * MARKUP FALLBACK (for perpetual without detailed tracking)
 * ============================================================================
 */

/**
 * Calculate COGS from markup percentage
 * @param invoiceAmount - Total invoice amount (sales revenue)
 * @param markupPercentage - Markup percentage (e.g., 30 for 30%)
 * @returns Calculated COGS amount
 */
export function calculateCOGSFromMarkup(invoiceAmount: number, markupPercentage: number): number {
  // COGS = Revenue / (1 + Markup%)
  // Example: 30% markup means cost is 100, selling price is 130
  // COGS = 130 / 1.30 = 100
  const cogs = invoiceAmount / (1 + markupPercentage / 100);
  return Math.round(cogs * 100) / 100;
}

/**
 * ============================================================================
 * MAIN COGS POSTING FUNCTION
 * ============================================================================
 * Routes to appropriate method based on company configuration
 * ============================================================================
 */

/**
 * Post COGS entry based on company configuration
 * @param companyId - Company ID
 * @param itemId - Inventory item ID (optional for markup fallback)
 * @param quantity - Quantity being sold
 * @param invoiceAmount - Total invoice amount (for markup fallback)
 * @param referenceType - Reference type (invoice, quote, etc.)
 * @param referenceId - Reference ID
 * @returns COGS posting result
 */
export async function postCOGS(
  companyId: string,
  itemId: string | null,
  quantity: number,
  invoiceAmount: number,
  referenceType: string,
  referenceId: string
): Promise<COGSPostingResult> {
  try {
    // Fetch company COGS configuration
    const { data: config } = await supabase
      .from('company_settings')
      .select('inventory_system, costing_method, markup_percentage')
      .eq('company_id', companyId)
      .single();

    const inventorySystem: InventorySystem = config?.inventory_system || 'perpetual';
    const costingMethod: CostingMethod = config?.costing_method || 'fifo';
    const markupPercentage = config?.markup_percentage;

    // Periodic system - don't post COGS at sale time
    if (inventorySystem === 'periodic') {
      return {
        success: true,
        cogsAmount: 0,
        error: 'Periodic inventory system - COGS calculated at period-end',
      };
    }

    // Perpetual system - calculate COGS
    let cogsAmount = 0;

    // Use detailed inventory tracking if itemId provided
    if (itemId) {
      if (costingMethod === 'fifo') {
        const result = await consumeFIFOLayers(itemId, quantity);
        cogsAmount = result.cogsAmount;
      } else {
        const result = await postWeightedAverageCOGS(itemId, quantity);
        cogsAmount = result.cogsAmount;
      }
    } else if (markupPercentage !== null && markupPercentage !== undefined) {
      // Use markup fallback
      cogsAmount = calculateCOGSFromMarkup(invoiceAmount, markupPercentage);
    } else {
      // No item and no markup - cannot calculate COGS
      return {
        success: false,
        cogsAmount: 0,
        error: 'No inventory item or markup percentage configured',
      };
    }

    // Create journal entry for COGS
    // Note: This would integrate with your existing journal entry system
    // Dr COGS (5000), Cr Inventory
    
    return {
      success: true,
      cogsAmount,
    };
  } catch (error) {
    return {
      success: false,
      cogsAmount: 0,
      error: error instanceof Error ? error.message : 'Unknown error calculating COGS',
    };
  }
}

/**
 * ============================================================================
 * VALIDATION FUNCTIONS
 * ============================================================================
 */

/**
 * Validate COGS configuration
 * @param config - Company COGS configuration
 * @returns Validation result
 */
export function validateCOGSConfig(config: Partial<CompanyCOGSConfig>): COGSValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // LIFO validation - prohibited for SA/IFRS (type already prevents this)
  if (config.costing_method === 'lifo' as CostingMethod) {
    errors.push('LIFO is prohibited under IFRS / SA GAAP. Use FIFO or Weighted Average.');
  }

  // Markup validation
  if (config.markup_percentage !== undefined) {
    if (config.markup_percentage < 0) {
      errors.push('Markup percentage cannot be negative');
    }
    if (config.markup_percentage > 500) {
      warnings.push('Markup percentage seems unusually high (>500%)');
    }
  }

  // Period lock check
  if (config.period_locked && !config.period_locked_date) {
    errors.push('Period is locked but no lock date specified');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if inventory quantity would go negative
 * @param itemId - Inventory item ID
 * @param quantity - Quantity to check
 * @returns Validation result
 */
export async function checkNegativeInventory(
  itemId: string,
  quantity: number
): Promise<COGSValidationResult> {
  const { data: item } = await supabase
    .from('inventory_items')
    .select('current_quantity')
    .eq('id', itemId)
    .single();

  if (!item) {
    return {
      isValid: false,
      errors: ['Inventory item not found'],
      warnings: [],
    };
  }

  const wouldBeNegative = item.current_quantity - quantity < 0;

  if (wouldBeNegative) {
    return {
      isValid: false,
      errors: ['This sale would result in negative inventory'],
      warnings: ['Consider enabling negative inventory with admin override'],
    };
  }

  return {
    isValid: true,
    errors: [],
    warnings: [],
  };
}

/**
 * ============================================================================
 * DASHBOARD HELPER FUNCTIONS
 * ============================================================================
 */

/**
 * Get COGS data for dashboard display
 * @param companyId - Company ID
 * @param startDate - Period start date
 * @param endDate - Period end date
 * @returns Dashboard COGS data
 */
export async function getDashboardCOGS(
  companyId: string,
  startDate: string,
  endDate: string
): Promise<{ totalCOGS: number; method: string; system: string }> {
  // Get company config
  const { data: config } = await supabase
    .from('company_config')
    .select('inventory_system, costing_method')
    .eq('company_id', companyId)
    .single();

  const inventorySystem: InventorySystem = config?.inventory_system || 'perpetual';
  const costingMethod: CostingMethod = config?.costing_method || 'fifo';

  let totalCOGS = 0;

  if (inventorySystem === 'perpetual') {
    // Sum COGS from inventory transactions
    const { data: transactions } = await supabase
      .from('inventory_transactions')
      .select('cogs_amount')
      .eq('company_id', companyId)
      .eq('transaction_type', 'sale')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    totalCOGS = (transactions || []).reduce((sum, t) => sum + (t.cogs_amount || 0), 0);
  } else {
    // Periodic - get from period-end records
    const startYear = new Date(startDate).getFullYear();
    const startMonth = new Date(startDate).getMonth() + 1;

    const { data: periodEnd } = await supabase
      .from('period_end_inventory')
      .select('cogs_amount')
      .eq('company_id', companyId)
      .eq('period_year', startYear)
      .eq('period_month', startMonth)
      .single();

    totalCOGS = periodEnd?.cogs_amount || 0;
  }

  return {
    totalCOGS: Math.round(totalCOGS * 100) / 100,
    method: costingMethod,
    system: inventorySystem,
  };
}
