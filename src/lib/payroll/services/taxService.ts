import { supabase } from "@/integrations/supabase/client";

export type PeriodData = { period_start: string; period_end: string; gross: number; taxableAllowances?: number; fringeBenefits?: number };

export const getCompanyTaxSettings = async (company_id: string, effectiveDate?: string) => {
  const { data } = await supabase.from("payroll_settings" as any).select("tax_config").eq("company_id", company_id).maybeSingle() as any;
  const cfg = (data?.tax_config as any) || null;
  
  // If we have a custom config in DB, use it
  if (cfg) return cfg;

  // Otherwise, fallback to statutory rates based on the effective date
  const year = new Date(effectiveDate || new Date()).getFullYear();
  const month = new Date(effectiveDate || new Date()).getMonth() + 1; // 1-indexed

  // SARS Tax Year runs from March to February. 
  // e.g. Tax Year 2025 is Mar 2024 to Feb 2025.
  const sarsYear = (month >= 3) ? year + 1 : year;

  if (sarsYear >= 2026) {
    // 2026 Tax Year (1 Mar 2025 - 28 Feb 2026) - Placeholder/Expected
    return {
      brackets: [
        { up_to: 237100, rate: 0.18, base: 0 }, 
        { up_to: 370500, rate: 0.26, base: 42678 }, 
        { up_to: 512800, rate: 0.31, base: 77362 }, 
        { up_to: 673000, rate: 0.36, base: 121475 }, 
        { up_to: 857900, rate: 0.39, base: 179147 }, 
        { up_to: 1817000, rate: 0.41, base: 251258 }, 
        { up_to: null, rate: 0.45, base: 644489 } 
      ], 
      rebates: { primary: 17235, secondary: 9444, tertiary: 3145 }, 
      medical_credits: { main: 364, first_dependent: 364, additional: 246 },
      uif_cap: 17712, 
      sdl_rate: 0.01 
    };
  }

  // Default: 2025 Tax Year (1 Mar 2024 - 28 Feb 2025) Tables
  return { 
    brackets: [
      { up_to: 237100, rate: 0.18, base: 0 }, 
      { up_to: 370500, rate: 0.26, base: 42678 }, 
      { up_to: 512800, rate: 0.31, base: 77362 }, 
      { up_to: 673000, rate: 0.36, base: 121475 }, 
      { up_to: 857900, rate: 0.39, base: 179147 }, 
      { up_to: 1817000, rate: 0.41, base: 251258 }, 
      { up_to: null, rate: 0.45, base: 644489 } 
    ], 
    rebates: { primary: 17235, secondary: 9444, tertiary: 3145 }, 
    medical_credits: { main: 364, first_dependent: 364, additional: 246 },
    uif_cap: 17712, 
    sdl_rate: 0.01 
  };
};

export const annualize = (gross: number, periodDays: number) => {
  const daysInYear = 365;
  return +(gross * (daysInYear / Math.max(1, periodDays))).toFixed(2);
};

export const deannualize = (annualTax: number, periodDays: number) => {
  const daysInYear = 365;
  return +(annualTax * (Math.max(1, periodDays) / daysInYear)).toFixed(2);
};

const getAgeFromID = (idNumber?: string | null, refDate: Date = new Date()) => {
  if (!idNumber || idNumber.length !== 13) return 0;
  let year = parseInt(idNumber.substring(0, 2));
  const month = parseInt(idNumber.substring(2, 4)) - 1;
  const day = parseInt(idNumber.substring(4, 6));
  const currentYearShort = parseInt(String(refDate.getFullYear()).slice(-2));
  const fullYear = year <= currentYearShort ? 2000 + year : 1900 + year;
  const birthDate = new Date(fullYear, month, day);
  let age = refDate.getFullYear() - birthDate.getFullYear();
  const m = refDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < birthDate.getDate())) { age--; }
  return age;
};

export const calculatePAYE = async (company_id: string, employee: { tax_number?: string | null; id_number?: string | null; medical_aid_members?: number }, period: PeriodData) => {
  const cfg = await getCompanyTaxSettings(company_id, period.period_end);
  const periodDays = Math.max(1, (new Date(period.period_end).getTime() - new Date(period.period_start).getTime()) / (1000 * 60 * 60 * 24) + 1);
  const taxable = Number(period.gross || 0) + Number(period.taxableAllowances || 0) + Number(period.fringeBenefits || 0);
  const annualTaxable = annualize(taxable, periodDays);
  
  // Tax Calculation
  let annualTax = 0;
  for (let i = 0; i < cfg.brackets.length; i++) {
      const b = cfg.brackets[i];
      const cap = b.up_to ?? Infinity;
      if (annualTaxable <= cap) {
          const prevLimit = i === 0 ? 0 : (cfg.brackets[i-1].up_to || 0);
          const amountInBracket = annualTaxable - prevLimit;
          annualTax = b.base + (amountInBracket * b.rate);
          break;
      }
  }

  // Age Rebates
  const age = getAgeFromID(employee.id_number, new Date(period.period_end));
  let totalRebate = (cfg.rebates?.primary || 0);
  if (age >= 65) totalRebate += (cfg.rebates?.secondary || 0);
  if (age >= 75) totalRebate += (cfg.rebates?.tertiary || 0);

  // Medical Tax Credits
  const members = employee.medical_aid_members || 0;
  let monthlyMTC = 0;
  if (members > 0) {
    monthlyMTC += (cfg.medical_credits?.main || 0);
    if (members > 1) monthlyMTC += (cfg.medical_credits?.first_dependent || 0);
    if (members > 2) monthlyMTC += (cfg.medical_credits?.additional || 0) * (members - 2);
  }
  const annualMTC = monthlyMTC * 12;

  const annualAfterRebate = Math.max(0, annualTax - totalRebate - annualMTC);
  const paye = deannualize(annualAfterRebate, periodDays);
  
  // UIF & SDL should be based on total taxable remuneration
  // UIF cap is MONTHLY (currently R17,712 per month)
  // If the period is less than a month, we should probably pro-rate the cap, but standard practice is often per pay run if monthly.
  // Assuming period is monthly or equivalent for now. 
  
  const uifBase = Math.min(taxable, Number(cfg.uif_cap || 17712));
  const uif_emp = +(uifBase * 0.01).toFixed(2);
  const uif_er = +(uifBase * 0.01).toFixed(2);
  const sdl_er = +(taxable * Number(cfg.sdl_rate || 0.01)).toFixed(2);
  return { paye, uif_emp, uif_er, sdl_er, medical_tax_credit: monthlyMTC };
};