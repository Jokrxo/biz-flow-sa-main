/**
 * Calculates depreciation for fixed assets using straight-line method
 */

export interface DepreciationResult {
  annualDepreciation: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  monthsDepreciated: number;
}

export const calculateDepreciation = (
  cost: number,
  purchaseDate: string,
  usefulLifeYears: number,
  currentDate: Date = new Date()
): DepreciationResult => {
  const p = new Date(purchaseDate);
  const startMonthOffset = p.getDate() > 15 ? 1 : 0;
  const startMonth = new Date(p.getFullYear(), p.getMonth() + startMonthOffset, 1);
  const curMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const diffMonths = (curMonth.getFullYear() - startMonth.getFullYear()) * 12 + (curMonth.getMonth() - startMonth.getMonth());
  const monthsDepreciated = Math.max(0, diffMonths);
  const annualDepreciation = cost / usefulLifeYears;
  const monthlyDepreciation = annualDepreciation / 12;
  const accumulatedDepreciation = Math.min(monthlyDepreciation * monthsDepreciated, cost);
  const netBookValue = cost - accumulatedDepreciation;
  return { annualDepreciation, accumulatedDepreciation, netBookValue, monthsDepreciated };
};

export const updateAssetDepreciation = async (
  supabase: any,
  assetId: string,
  accumulatedDepreciation: number
) => {
  const { error } = await supabase
    .from("fixed_assets")
    .update({ accumulated_depreciation: accumulatedDepreciation })
    .eq("id", assetId);
  
  if (error) throw error;
};

export const calculateTotalPPEAsOf = async (
  supabase: any,
  companyId: string,
  date: string
): Promise<number> => {
  const { data: assets, error } = await supabase
    .from("fixed_assets")
    .select("*")
    .eq("company_id", companyId)
    .neq('status', 'draft');

  if (error) throw error;
  if (!assets) return 0;

  const asOfDate = new Date(date);
  let totalNBV = 0;

  assets.forEach((asset: any) => {
    // If purchased after the reporting date, it's not an asset yet
    if (asset.purchase_date > date) return;

    // If disposed before the reporting date, it's no longer an asset
    const isDisposed = asset.status === 'disposed' || asset.status === 'sold' || asset.status === 'scrapped';
    if (isDisposed && asset.disposal_date && asset.disposal_date <= date) return;

    const res = calculateDepreciation(
      Number(asset.cost),
      asset.purchase_date,
      Number(asset.useful_life_years),
      asOfDate
    );
    
    // Safety check: if purchase date > current date handled in calc? 
    // In calc function above: if currentDate < purchase, NBV is cost (modified logic needed?)
    // Actually, if purchase_date > date, we returned 0 in the loop above.
    
    totalNBV += res.netBookValue;
  });

  return totalNBV;
};

export const calculateAccumulatedDepreciationAsOf = async (
  supabase: any,
  companyId: string,
  date: string
): Promise<number> => {
  const { data: assets, error } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('company_id', companyId)
    .neq('status', 'draft');

  if (error) throw error;
  if (!assets) return 0;

  const asOfDate = new Date(date);
  let totalAccumulated = 0;

  (assets || []).forEach((asset: any) => {
    if (String(asset.purchase_date || '') > date) return;
    const statusStr = String(asset.status || '').toLowerCase();
    const isDisposed = statusStr === 'disposed' || statusStr === 'sold' || statusStr === 'scrapped';
    if (isDisposed && asset.disposal_date && String(asset.disposal_date) <= date) return;

    const res = calculateDepreciation(
      Number(asset.cost || 0),
      String(asset.purchase_date || ''),
      Number(asset.useful_life_years || 0),
      asOfDate
    );
    totalAccumulated += Math.min(Number(res.accumulatedDepreciation || 0), Number(asset.cost || 0));
  });

  return totalAccumulated;
};

export const calculateDepreciationExpenseForPeriod = async (
  supabase: any,
  companyId: string,
  periodStart: string,
  periodEnd: string
): Promise<number> => {
  const { data: assets, error } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('company_id', companyId)
    .neq('status', 'draft');

  if (error) throw error;
  if (!assets) return 0;

  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd);
  let totalExpense = 0;

  (assets || []).forEach((asset: any) => {
    const purchase = new Date(String(asset.purchase_date || ''));
    if (purchase.getTime() > endDate.getTime()) return;

    let endCap = endDate;
    const statusStr = String(asset.status || '').toLowerCase();
    const isDisposed = statusStr === 'disposed' || statusStr === 'sold' || statusStr === 'scrapped';
    if (isDisposed && asset.disposal_date) {
      const disp = new Date(String(asset.disposal_date));
      if (disp.getTime() < endCap.getTime()) endCap = disp;
    }

    const endRes = calculateDepreciation(
      Number(asset.cost || 0),
      String(asset.purchase_date || ''),
      Number(asset.useful_life_years || 0),
      endCap
    );
    const startRes = calculateDepreciation(
      Number(asset.cost || 0),
      String(asset.purchase_date || ''),
      Number(asset.useful_life_years || 0),
      startDate
    );

    const expense = Math.max(0, Number(endRes.accumulatedDepreciation || 0) - Number(startRes.accumulatedDepreciation || 0));
    totalExpense += expense;
  });

  return totalExpense;
};
