import { SupabaseClient } from "@supabase/supabase-js";

// --- For FixedAssetsPage.tsx ---

export const calculateDepreciation = (cost: number, purchaseDate: string, usefulLifeYears: number, asOfDate?: Date) => {
  // Simple straight-line from purchase date to asOfDate (or now)
  const start = new Date(purchaseDate);
  const end = asOfDate || new Date();
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { accumulatedDepreciation: 0, annualDepreciation: 0, monthlyDepreciation: 0, netBookValue: cost };
  }

  const diffTime = end.getTime() - start.getTime();
  // If asset purchased in future relative to asOfDate, depreciation is 0
  if (diffTime < 0) {
      return { accumulatedDepreciation: 0, annualDepreciation: 0, monthlyDepreciation: 0, netBookValue: cost };
  }

  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  const yearsPassed = diffDays / 365.25;
  
  const annualDep = usefulLifeYears > 0 ? cost / usefulLifeYears : 0;
  let accumulated = annualDep * yearsPassed;
  
  if (accumulated > cost) accumulated = cost;
  
  const netBookValue = cost - accumulated;

  return {
    accumulatedDepreciation: accumulated,
    annualDepreciation: annualDep,
    monthlyDepreciation: annualDep / 12,
    netBookValue
  };
};

export const updateAssetDepreciation = async (supabase: SupabaseClient, assetId: string, accumulatedDepreciation: number) => {
  try {
    const { error } = await supabase
      .from('fixed_assets')
      .update({ accumulated_depreciation: accumulatedDepreciation })
      .eq('id', assetId);
    if (error) throw error;
  } catch (error) {
    console.error('Error updating asset depreciation:', error);
    throw error;
  }
};

// --- For GAAPFinancialStatements.tsx ---

export const calculateTotalPPEAsOf = async (supabase: SupabaseClient, companyId: string, date: string): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from('fixed_assets')
      .select('cost, purchase_date, status')
      .eq('company_id', companyId)
      .lte('purchase_date', date)
      .neq('status', 'disposed');

    if (error) {
      console.error('Error calculating PPE:', error);
      return 0;
    }

    return data?.reduce((sum, asset) => sum + (Number(asset.cost) || 0), 0) || 0;
  } catch (e) {
    console.error('Exception in calculateTotalPPEAsOf:', e);
    return 0;
  }
};

export const calculateDepreciationExpenseForPeriod = async (supabase: SupabaseClient, companyId: string, startDate: string, endDate: string): Promise<number> => {
  // We'll approximate by calculating depreciation for all active assets for this period.
  try {
     const { data, error } = await supabase
      .from('fixed_assets')
      .select('cost, purchase_date, useful_life_years, status')
      .eq('company_id', companyId)
      .neq('status', 'disposed'); 

     if (error || !data) return 0;

     let totalExpense = 0;
     const start = new Date(startDate);
     const end = new Date(endDate);
     
     for (const asset of data) {
        if (!asset.useful_life_years || asset.useful_life_years <= 0) continue;
        const purchase = new Date(asset.purchase_date);
        if (purchase > end) continue; // purchased after period

        // Calculate overlap of asset life with period
        const dailyDep = asset.cost / (asset.useful_life_years * 365.25);
        
        // Effective start for this period
        const effectiveStart = purchase > start ? purchase : start;
        const effectiveDays = (end.getTime() - effectiveStart.getTime()) / (1000 * 3600 * 24);
        
        if (effectiveDays > 0) {
            totalExpense += dailyDep * effectiveDays;
        }
     }
     return totalExpense;
  } catch (e) {
      return 0;
  }
};

export const calculateAccumulatedDepreciationAsOf = async (supabase: SupabaseClient, companyId: string, date: string): Promise<number> => {
   try {
    const { data, error } = await supabase
      .from('fixed_assets')
      .select('accumulated_depreciation')
      .eq('company_id', companyId)
      .neq('status', 'disposed');

    if (error) return 0;
    return data?.reduce((sum, asset) => sum + (Number(asset.accumulated_depreciation) || 0), 0) || 0;
  } catch (e) {
    return 0;
  }
};
