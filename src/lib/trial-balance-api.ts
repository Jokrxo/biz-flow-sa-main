import { supabase } from './supabase';
import type { TrialBalance, TrialBalanceCreate, TrialBalanceUpdate } from '@/types/trial-balance';

export const trialBalanceApi = {
  // Get all trial balances for current user
  getAll: async (): Promise<TrialBalance[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) throw new Error('Company not found');
    const { data, error } = await supabase
      .from('trial_balances')
      .select('*')
      .eq('company_id', companyId)
      .order('account_code', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  // Create new trial balance entry
  create: async (entry: TrialBalanceCreate): Promise<TrialBalance> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) throw new Error('Company not found');

    const { data, error } = await supabase
      .from('trial_balances')
      .insert({
        ...entry,
        company_id: companyId,
        user_id: user.id,
        debit: entry.debit || 0,
        credit: entry.credit || 0,
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Update trial balance entry
  update: async (id: string, updates: TrialBalanceUpdate): Promise<TrialBalance> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) throw new Error('Company not found');

    const { data, error } = await supabase
      .from('trial_balances')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Delete trial balance entry
  delete: async (id: string): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) throw new Error('Company not found');

    const { error } = await supabase
      .from('trial_balances')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    
    if (error) throw error;
  },

  // Get trial balance summary
  getSummary: async () => {
    const entries = await trialBalanceApi.getAll();
    const totalDebits = entries.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredits = entries.reduce((sum, entry) => sum + entry.credit, 0);
    
    return {
      entries,
      totalDebits,
      totalCredits,
      isBalanced: totalDebits === totalCredits,
      difference: totalDebits - totalCredits,
    };
  },
};