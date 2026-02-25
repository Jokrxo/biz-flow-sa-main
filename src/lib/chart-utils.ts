
import { SupabaseClient } from "@supabase/supabase-js";
import { SA_CHART_OF_ACCOUNTS } from "./chart-of-accounts";

export const initializeChartOfAccounts = async (supabase: SupabaseClient) => {
  try {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (!profile?.company_id) return;

    // Check if accounts already exist
    const { data: existing } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, is_vat_applicable, is_tax_deductible")
      .eq("company_id", profile.company_id);

    const existingMap = new Map(existing?.map(a => [a.account_code, a]));
    
    const newAccounts: typeof SA_CHART_OF_ACCOUNTS = [];
    const updates: { id: string; is_vat_applicable: boolean; is_tax_deductible: boolean }[] = [];

    for (const saAccount of SA_CHART_OF_ACCOUNTS) {
      const existingAcc = existingMap.get(saAccount.code);
      if (existingAcc) {
         // Check if update needed
         const currentVat = existingAcc.is_vat_applicable || false;
         const currentTax = existingAcc.is_tax_deductible || false;
         const newVat = saAccount.is_vat_applicable || false;
         const newTax = saAccount.is_tax_deductible || false;

         if (currentVat !== newVat || currentTax !== newTax) {
             updates.push({
                 id: existingAcc.id,
                 is_vat_applicable: newVat,
                 is_tax_deductible: newTax
             });
         }
      } else {
         newAccounts.push(saAccount);
      }
    }

    if (newAccounts.length === 0 && updates.length === 0) {
      return { status: 'up_to_date' };
    }

    if (newAccounts.length > 0) {
      const accountsToInsert = newAccounts.map(acc => ({
          company_id: profile.company_id,
          account_code: acc.code,
          account_name: acc.name,
          account_type: acc.type,
          is_active: true,
          is_vat_applicable: acc.is_vat_applicable,
          is_tax_deductible: acc.is_tax_deductible,
      }));

      const { error } = await supabase
          .from("chart_of_accounts")
          .insert(accountsToInsert);

      if (error) throw error;
    }

    if (updates.length > 0) {
      await Promise.all(updates.map(update => 
          supabase.from("chart_of_accounts").update({
              is_vat_applicable: update.is_vat_applicable,
              is_tax_deductible: update.is_tax_deductible
          }).eq("id", update.id)
      ));
    }

    return { 
        status: 'updated', 
        added: newAccounts.length, 
        updated: updates.length 
    };
  } catch (error) {
    console.error("Failed to initialize chart of accounts:", error);
    return { status: 'error', error };
  }
};
