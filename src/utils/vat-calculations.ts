import { supabase } from "@/integrations/supabase/client";

interface CalculateVatResult {
  vatPeriodId: string;
  outputVat: number;
  inputVat: number;
  vatPayable: number;
  vatRefundable: number;
  zeroRatedTotal: number;
  exemptTotal: number;
  status: string;
}

export async function calculateVatPeriod(vatPeriodId: string): Promise<CalculateVatResult> {
  // 1️⃣ Resolve VAT Period ONCE
  const { data: period, error: periodError } = await supabase
    .from('tax_periods')
    .select('id, period_start, period_end, status, company_id')
    .eq('id', vatPeriodId)
    .single();

  if (periodError) throw new Error(`Failed to fetch VAT period: ${periodError.message}`);
  if (!period) throw new Error("VAT period not found");
  
  // Pre-condition: VAT period status must NOT be CLOSED
  if (period.status === 'closed') {
    throw new Error("Cannot calculate VAT for a closed period");
  }

  // 2️⃣ Load Transactions
  // Fetch transactions in date range OR explicitly linked to this period
  // Note: Supabase .or() with .and() filters can be tricky.
  // We use a raw query-like approach or fetch both sets and merge, but simpler to use .or()
  
  // Logic: company_id = X AND status IN (...) AND ( (date >= start AND date <= end) OR tax_period_id = period.id )
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('transaction_type, vat_amount, total_amount, vat_rate, vat_inclusive, base_amount, transaction_date, tax_period_id')
    .eq('company_id', period.company_id)
    .in('status', ['approved', 'posted', 'pending'])
    .or(`and(transaction_date.gte.${period.period_start},transaction_date.lte.${period.period_end}),tax_period_id.eq.${period.id}`);

  if (txError) throw new Error(`Failed to fetch transactions: ${txError.message}`);

  // 3️⃣ Calculate Totals (Single Pass)
  let outputVat = 0;
  let inputVat = 0;
  let zeroRatedTotal = 0;
  let exemptTotal = 0; // Currently treating 0-rate as zero-rated, assuming no explicit exempt flag yet

  (transactions || []).forEach((t: any) => {
    const type = String(t.transaction_type || '').toLowerCase();
    
    // Ignore NO_VAT (assuming vat_rate is null or check logic)
    // If vat_rate is null, we assume NO_VAT. 
    // If vat_rate is 0, it's Zero Rated or Exempt.
    if (t.vat_rate === null || t.vat_rate === undefined) return;

    const isIncome = ['income', 'sales', 'receipt'].includes(type);
    const isPurchase = ['expense', 'purchase', 'bill', 'product_purchase'].includes(type);
    
    // Simplified VAT calculation logic (should match what was used in UI)
    const rate = Number(t.vat_rate || 0);
    const total = Number(t.total_amount || 0);
    const base = Number(t.base_amount || 0);
    const inclusive = Boolean(t.vat_inclusive);
    let vat = Number(t.vat_amount || 0);

    // If vat amount is 0 but rate > 0, calculate it (fallback)
    if (vat === 0 && rate > 0) {
       if (inclusive) {
          const net = base > 0 ? base : total / (1 + rate / 100);
          vat = total - net;
        } else {
          vat = total - (base > 0 ? base : total);
        }
    }

    if (rate === 0) {
      // Accumulate value for zero-rated/exempt
      // Since we can't distinguish easily without a specific flag, we sum up total amounts
      zeroRatedTotal += total; 
      // exemptTotal remains 0 for now as per current schema limitation
    } else {
      if (isIncome) outputVat += Math.max(0, vat);
      if (isPurchase) inputVat += Math.max(0, vat);
    }
  });

  // 4️⃣ Determine Net VAT (Input - Output)
  const netVat = inputVat - outputVat;
  
  let vatPayable = 0;
  let vatRefundable = 0;

  if (netVat > 0) {
    // Input > Output = Refundable (Receivable)
    vatPayable = 0;
    vatRefundable = netVat;
  } else {
    // Output >= Input = Payable
    vatPayable = Math.abs(netVat);
    vatRefundable = 0;
  }

  // 5️⃣ Snapshot & Persist Results
  // Store calculated values directly on the VAT period record
  const { error: updateError } = await supabase
    .from('tax_periods')
    .update({
      vat_input_total: inputVat,
      vat_output_total: outputVat,
      vat_payable: vatPayable, // Standard definition: Amount Due to SARS
      updated_at: new Date().toISOString()
    })
    .eq('id', vatPeriodId);

  if (updateError) throw new Error(`Failed to persist VAT calculations: ${updateError.message}`);

  // 📌 OUTPUT
  return {
    vatPeriodId,
    outputVat,
    inputVat,
    vatPayable,
    vatRefundable,
    zeroRatedTotal,
    exemptTotal,
    status: period.status
  };
}
