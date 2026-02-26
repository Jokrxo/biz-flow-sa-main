import { supabase } from '@/integrations/supabase/client';
import { emitDashboardCacheInvalidation } from '@/stores/dashboardCache';

export interface TransactionRow {
  id: string;
  company_id: string;
  user_id: string;
  transaction_date: string; // date
  reference_number: string | null;
  description: string;
  total_amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

async function getUserCompanyId(): Promise<string> {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.company_id) throw new Error('No company associated with user');
  return data.company_id as string;
}

export async function validateTransactionDate(companyId: string, date: string): Promise<void> {
  const { data: app } = await supabase
    .from('app_settings')
    .select('financial_year_closed_date, fiscal_year_start')
    .eq('company_id', companyId)
    .maybeSingle();

  // 1. Check against manual closed date
  if (app?.financial_year_closed_date) {
    if (date <= app.financial_year_closed_date) {
      throw new Error(`Period Closed: Transactions on or before ${app.financial_year_closed_date} cannot be modified.`);
    }
  }

  // 2. Check against auto-calculated previous fiscal year
  if (app?.fiscal_year_start) {
    const fiscalStartMonth = Number(app.fiscal_year_start);
    if (fiscalStartMonth >= 1 && fiscalStartMonth <= 12) {
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      let startYear = currentYear;
      
      // If we are before the start month in the calendar year, the fiscal year started in the previous calendar year
      if (currentMonth < fiscalStartMonth) {
        startYear = currentYear - 1;
      }
      
      // Start of current FY: e.g. 2025-03-01
      const startOfCurrentFY = new Date(Date.UTC(startYear, fiscalStartMonth - 1, 1));
      const startOfCurrentFYStr = startOfCurrentFY.toISOString().split('T')[0];

      // If transaction date is BEFORE current fiscal year start, it belongs to a previous (closed) year.
      if (date < startOfCurrentFYStr) {
         // Exception: Opening Balances are often dated on the first day or just before. 
         // However, strict rule: "PREVIEWS YEAR MEANING WILL BE LOCKED".
         // Typically, one can post on the first day of current FY. 
         // So if date < startOfCurrentFYStr, it is locked.
         throw new Error('This transaction was processed outside of the financial year setup. Please make sure the financial year has been set up correctly. To do this go to Settings.');
      }
    }
  }
}

export const transactionsApi = {
  getAll: async (): Promise<TransactionRow[]> => {
    const companyId = await getUserCompanyId();
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', companyId)
      .order('transaction_date', { ascending: false });
    if (error) throw error;
    return (data || []) as TransactionRow[];
  },
  postInvestmentBuy: async (opts: { accountId: string; symbol: string; quantity: number; price: number; fees?: number; date: string; bankAccountId: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0,10);
    await validateTransactionDate(companyId, postDate);
    const total = Number(opts.quantity || 0) * Number(opts.price || 0) + Number(opts.fees || 0);
    if (!(total > 0)) throw new Error('Invalid buy amount');
    const { data: accounts } = await supabase.from('chart_of_accounts').select('id, account_name, account_type, account_code, is_active').eq('company_id', companyId).eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => { const byType = list.filter(a => a.type === type.toLowerCase()); const byCode = byType.find(a => codes.includes(a.code)); if (byCode) return byCode.id; const byName = byType.find(a => names.some(n => a.name.includes(n))); return byName?.id || ''; };
    let bankId = pick('asset', ['1100'], ['bank','cash']);
    if (!bankId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true }).select('id').single(); bankId = (created as any)?.id || ''; }
    let investAssetId = pick('asset', ['1400'], ['investment','securities']);
    if (!investAssetId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '1400', account_name: 'Investment Assets', account_type: 'asset', is_active: true }).select('id').single(); investAssetId = (created as any)?.id || ''; }
    const { data: tx, error: txErr } = await supabase.from('transactions').insert({ company_id: companyId, user_id: user.id, transaction_date: postDate, description: `Buy ${opts.symbol}`, reference_number: `INV-${opts.accountId}`, total_amount: total, bank_account_id: opts.bankAccountId, transaction_type: 'asset', status: 'pending' }).select('id').single();
    if (txErr) throw txErr;
    const rows = [ { transaction_id: (tx as any).id, account_id: investAssetId, debit: total, credit: 0, description: 'Investment buy', status: 'approved' }, { transaction_id: (tx as any).id, account_id: bankId, debit: 0, credit: total, description: 'Investment buy', status: 'approved' } ];
    await supabase.from('transaction_entries').insert(rows);
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: (tx as any).id, description: r.description }));
    await supabase.from('ledger_entries').insert(ledgerRows as any);
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id);
    emitDashboardCacheInvalidation(companyId);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: total, _operation: 'subtract' }); } catch {}
    try { await supabase.from('investment_transactions' as any).insert({ account_id: opts.accountId, type: 'buy', trade_date: postDate, symbol: opts.symbol, quantity: opts.quantity, price: opts.price, total_amount: total, fees: opts.fees || 0 }); } catch {}
  },
  postInvestmentSell: async (opts: { accountId: string; symbol: string; quantity: number; price: number; fees?: number; date: string; bankAccountId: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0,10);
    await validateTransactionDate(companyId, postDate);
    const gross = Number(opts.quantity || 0) * Number(opts.price || 0);
    const total = Math.max(0, gross - Number(opts.fees || 0));
    if (!(total > 0)) throw new Error('Invalid sell amount');
    const { data: accounts } = await supabase.from('chart_of_accounts').select('id, account_name, account_type, account_code, is_active').eq('company_id', companyId).eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => { const byType = list.filter(a => a.type === type.toLowerCase()); const byCode = byType.find(a => codes.includes(a.code)); if (byCode) return byCode.id; const byName = byType.find(a => names.some(n => a.name.includes(n))); return byName?.id || ''; };
    let bankId = pick('asset', ['1100'], ['bank','cash']);
    if (!bankId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true }).select('id').single(); bankId = (created as any)?.id || ''; }
    let investAssetId = pick('asset', ['1400'], ['investment','securities']);
    if (!investAssetId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '1400', account_name: 'Investment Assets', account_type: 'asset', is_active: true }).select('id').single(); investAssetId = (created as any)?.id || ''; }
    let realizedGainId = pick('income', ['4300'], ['realized gain','capital gain']);
    if (!realizedGainId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '4300', account_name: 'Realized Gains', account_type: 'revenue', is_active: true }).select('id').single(); realizedGainId = (created as any)?.id || ''; }
    const { data: tx, error: txErr } = await supabase.from('transactions').insert({ company_id: companyId, user_id: user.id, transaction_date: postDate, description: `Sell ${opts.symbol}`, reference_number: `INV-${opts.accountId}`, total_amount: total, bank_account_id: opts.bankAccountId, transaction_type: 'income', status: 'pending' }).select('id').single();
    if (txErr) throw txErr;
    const rows = [ { transaction_id: (tx as any).id, account_id: bankId, debit: total, credit: 0, description: 'Investment sell', status: 'approved' }, { transaction_id: (tx as any).id, account_id: investAssetId, debit: 0, credit: total, description: 'Investment sell', status: 'approved' } ];
    await supabase.from('transaction_entries').insert(rows);
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: (tx as any).id, description: r.description }));
    await supabase.from('ledger_entries').insert(ledgerRows as any);
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id);
    emitDashboardCacheInvalidation(companyId);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: total, _operation: 'add' }); } catch {}
    try { await supabase.from('investment_transactions' as any).insert({ account_id: opts.accountId, type: 'sell', trade_date: postDate, symbol: opts.symbol, quantity: opts.quantity, price: opts.price, total_amount: total, fees: opts.fees || 0 }); } catch {}
  },
  postInvestmentDividend: async (opts: { accountId: string; amount: number; date: string; bankAccountId: string; symbol?: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0,10);
    await validateTransactionDate(companyId, postDate);
    const amt = Number(opts.amount || 0);
    if (!(amt > 0)) throw new Error('Invalid dividend amount');
    const { data: accounts } = await supabase.from('chart_of_accounts').select('id, account_name, account_type, account_code, is_active').eq('company_id', companyId).eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => { const byType = list.filter(a => a.type === type.toLowerCase()); const byCode = byType.find(a => codes.includes(a.code)); if (byCode) return byCode.id; const byName = byType.find(a => names.some(n => a.name.includes(n))); return byName?.id || ''; };
    let bankId = pick('asset', ['1100'], ['bank','cash']);
    if (!bankId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true }).select('id').single(); bankId = (created as any)?.id || ''; }
    let dividendIncomeId = pick('revenue', ['4205'], ['dividend']);
    if (!dividendIncomeId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '4205', account_name: 'Dividend Income', account_type: 'revenue', is_active: true }).select('id').single(); dividendIncomeId = (created as any)?.id || ''; }
    const { data: tx, error: txErr } = await supabase.from('transactions').insert({ company_id: companyId, user_id: user.id, transaction_date: postDate, description: `Dividend ${opts.symbol || ''}`.trim(), reference_number: `INV-${opts.accountId}`, total_amount: amt, bank_account_id: opts.bankAccountId, transaction_type: 'income', status: 'pending' }).select('id').single();
    if (txErr) throw txErr;
    const rows = [ { transaction_id: (tx as any).id, account_id: bankId, debit: amt, credit: 0, description: 'Dividend income', status: 'approved' }, { transaction_id: (tx as any).id, account_id: dividendIncomeId, debit: 0, credit: amt, description: 'Dividend income', status: 'approved' } ];
    await supabase.from('transaction_entries').insert(rows);
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: (tx as any).id, description: r.description }));
    await supabase.from('ledger_entries').insert(ledgerRows as any);
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id);
    emitDashboardCacheInvalidation(companyId);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: amt, _operation: 'add' }); } catch {}
    try { await supabase.from('investment_transactions' as any).insert({ account_id: opts.accountId, type: 'dividend', trade_date: postDate, symbol: opts.symbol || null, total_amount: amt }); } catch {}
  },
  postInvestmentInterest: async (opts: { accountId: string; amount: number; date: string; bankAccountId: string; symbol?: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0,10);
    await validateTransactionDate(companyId, postDate);
    const monthStart = new Date(postDate.slice(0,7) + '-01');
    const nextMonth = new Date(monthStart); nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthEnd = new Date(nextMonth); monthEnd.setDate(monthEnd.getDate() - 1);
    const monthStartStr = monthStart.toISOString().slice(0,10);
    const nextMonthStr = nextMonth.toISOString().slice(0,10);
    const monthEndStr = monthEnd.toISOString().slice(0,10);
    const { data: dupInt } = await supabase
      .from('investment_transactions' as any)
      .select('id')
      .eq('account_id', opts.accountId)
      .eq('type', 'interest')
      .gte('trade_date', monthStartStr)
      .lt('trade_date', nextMonthStr);
    if ((dupInt || []).length > 0) throw new Error('Interest for this month is already recorded');

    let amt = Number(opts.amount || 0);
    let isFD = false;
    let fdAssetId: string | null = null;
    let fdSymbol: string | null = null;
    // Detect Fixed Deposit position and derive rate/principal when amount not provided
    try {
      const { data: fdPos } = await supabase
        .from('investment_positions' as any)
        .select('account_id, symbol, instrument_type, avg_cost')
        .eq('account_id', opts.accountId)
        .eq('instrument_type', 'fixed_deposit')
        .limit(1);
      if (Array.isArray(fdPos) && fdPos.length > 0) {
        isFD = true;
        const pos = (fdPos as any)[0];
        const principal = Number(pos.avg_cost || 0);
        fdSymbol = String(pos.symbol || '');
        if (!(amt > 0) && principal > 0) {
          let rateDec = 0;
          const { data: fdBuy } = await supabase
            .from('investment_transactions' as any)
            .select('notes, symbol')
            .eq('account_id', opts.accountId)
            .eq('type', 'buy')
            .order('trade_date', { ascending: true })
            .limit(1);
          const notes = (Array.isArray(fdBuy) && fdBuy[0]) ? String((fdBuy[0] as any).notes || '') : '';
          const rateMatch = notes.match(/Rate\s+([0-9]+(?:\.[0-9]+)?)%/i);
          if (rateMatch) rateDec = parseFloat(rateMatch[1] || '0') / 100;
          if (rateDec > 0) amt = Number((principal * rateDec / 12).toFixed(2));
        }
      }
    } catch {}
    if (!(amt > 0)) throw new Error('Invalid interest amount');
    const { data: accounts } = await supabase.from('chart_of_accounts').select('id, account_name, account_type, account_code, is_active').eq('company_id', companyId).eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => { const byType = list.filter(a => a.type === type.toLowerCase()); const byCode = byType.find(a => codes.includes(a.code)); if (byCode) return byCode.id; const byName = byType.find(a => names.some(n => a.name.includes(n))); return byName?.id || ''; };
    let bankId = pick('asset', ['1100'], ['bank','cash']);
    if (!bankId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true }).select('id').single(); bankId = (created as any)?.id || ''; }
    if (isFD) {
      try {
        const { data: longInv } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', companyId)
          .eq('account_code', '1920')
          .eq('account_type', 'asset')
          .eq('is_active', true)
          .limit(1);
        fdAssetId = (Array.isArray(longInv) && longInv[0]?.id) ? String(longInv[0].id) : null;
        if (!fdAssetId) {
          const { data: created } = await supabase
            .from('chart_of_accounts')
            .insert({ company_id: companyId, account_code: '1920', account_name: 'Long-term Investments', account_type: 'asset', is_active: true })
            .select('id')
            .single();
          fdAssetId = (created as any)?.id || null;
        }
      } catch {}
    }
    let interestIncomeId = pick('revenue', ['4200'], ['interest income','interest']);
    if (!interestIncomeId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '4200', account_name: 'Interest Income', account_type: 'revenue', is_active: true }).select('id').single(); interestIncomeId = (created as any)?.id || ''; }
    const { data: tx, error: txErr } = await supabase.from('transactions').insert({ company_id: companyId, user_id: user.id, transaction_date: monthEndStr, description: `Interest ${fdSymbol || opts.symbol || ''}`.trim(), reference_number: `INV-${opts.accountId}`, total_amount: amt, bank_account_id: isFD ? null : opts.bankAccountId, transaction_type: 'income', status: 'pending' }).select('id').single();
    if (txErr) throw txErr;
    const rows = isFD && fdAssetId
      ? [ { transaction_id: (tx as any).id, account_id: fdAssetId, debit: amt, credit: 0, description: 'Fixed deposit accrued interest (capitalized)', status: 'approved' }, { transaction_id: (tx as any).id, account_id: interestIncomeId, debit: 0, credit: amt, description: 'Fixed deposit accrued interest (capitalized)', status: 'approved' } ]
      : [ { transaction_id: (tx as any).id, account_id: bankId, debit: amt, credit: 0, description: 'Interest income', status: 'approved' }, { transaction_id: (tx as any).id, account_id: interestIncomeId, debit: 0, credit: amt, description: 'Interest income', status: 'approved' } ];
    await supabase.from('transaction_entries').insert(rows);
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: monthEndStr, is_reversed: false, transaction_id: (tx as any).id, description: r.description }));
    await supabase.from('ledger_entries').insert(ledgerRows as any);
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id);
    emitDashboardCacheInvalidation(companyId);
    if (!isFD) { try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: amt, _operation: 'add' }); } catch {} }
    try { await supabase.from('investment_transactions' as any).insert({ account_id: opts.accountId, type: 'interest', trade_date: monthEndStr, symbol: fdSymbol || opts.symbol || null, total_amount: amt }); } catch {}
    if (isFD) {
      try {
        const { data: posList } = await supabase
          .from('investment_positions' as any)
          .select('id, market_value, current_price, avg_cost')
          .eq('account_id', opts.accountId)
          .eq('instrument_type', 'fixed_deposit')
          .limit(1);
        const pos = Array.isArray(posList) && posList[0] ? posList[0] as any : null;
        if (pos && typeof pos.id === 'string') {
          const newMv = Number(pos.market_value ?? pos.avg_cost ?? 0) + amt;
          await supabase
            .from('investment_positions' as any)
            .update({ market_value: newMv, current_price: newMv })
            .eq('id', pos.id);
        }
      } catch {}
    }
  },
  postInvestmentFee: async (opts: { accountId: string; amount: number; date: string; bankAccountId: string; description?: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0,10);
    await validateTransactionDate(companyId, postDate);
    const amt = Number(opts.amount || 0);
    if (!(amt > 0)) throw new Error('Invalid fee amount');
    const { data: accounts } = await supabase.from('chart_of_accounts').select('id, account_name, account_type, account_code, is_active').eq('company_id', companyId).eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => { const byType = list.filter(a => a.type === type.toLowerCase()); const byCode = byType.find(a => codes.includes(a.code)); if (byCode) return byCode.id; const byName = byType.find(a => names.some(n => a.name.includes(n))); return byName?.id || ''; };
    let bankId = pick('asset', ['1100'], ['bank','cash']);
    if (!bankId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true }).select('id').single(); bankId = (created as any)?.id || ''; }
    let feesExpId = pick('expense', ['5950'], ['brokerage','bank charges','fees']);
    if (!feesExpId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '5950', account_name: 'Bank Charges & Brokerage', account_type: 'expense', is_active: true }).select('id').single(); feesExpId = (created as any)?.id || ''; }
    const { data: tx, error: txErr } = await supabase.from('transactions').insert({ company_id: companyId, user_id: user.id, transaction_date: postDate, description: opts.description || 'Brokerage/Fees', reference_number: `INV-${opts.accountId}`, total_amount: amt, bank_account_id: opts.bankAccountId, transaction_type: 'expense', status: 'pending' }).select('id').single();
    if (txErr) throw txErr;
    const rows = [ { transaction_id: (tx as any).id, account_id: feesExpId, debit: amt, credit: 0, description: 'Fees', status: 'approved' }, { transaction_id: (tx as any).id, account_id: bankId, debit: 0, credit: amt, description: 'Fees', status: 'approved' } ];
    await supabase.from('transaction_entries').insert(rows);
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: (tx as any).id, description: r.description }));
    await supabase.from('ledger_entries').insert(ledgerRows as any);
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: amt, _operation: 'subtract' }); } catch {}
    try { await supabase.from('investment_transactions' as any).insert({ account_id: opts.accountId, type: 'fee', trade_date: postDate, total_amount: amt }); } catch {}
  },
  postFixedDepositOpen: async (opts: { name: string; amount: number; rate: number; termMonths: number; date: string; bankAccountId: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0,10);
    await validateTransactionDate(companyId, postDate);
    const amt = Number(opts.amount || 0);
    if (!(amt > 0)) throw new Error('Invalid amount');
    const { data: accounts } = await supabase.from('chart_of_accounts').select('id, account_name, account_type, account_code, is_active').eq('company_id', companyId).eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => { const byType = list.filter(a => a.type === type.toLowerCase()); const byCode = byType.find(a => codes.includes(a.code)); if (byCode) return byCode.id; const byName = byType.find(a => names.some(n => a.name.includes(n))); return byName?.id || ''; };
    let bankId = pick('asset', ['1100'], ['bank','cash']);
    if (!bankId) { const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true }).select('id').single(); bankId = (created as any)?.id || ''; }
    let fdAssetId = '';
    try {
      const { data: longInv } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('account_code', '1920')
        .eq('account_type', 'asset')
        .eq('is_active', true)
        .limit(1);
      fdAssetId = (longInv && longInv[0]?.id) ? String(longInv[0].id) : '';
    } catch {}
    if (!fdAssetId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1920', account_name: 'Long-term Investments', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      fdAssetId = (created as any)?.id || '';
    }
    const { data: tx, error: txErr } = await supabase.from('transactions').insert({ company_id: companyId, user_id: user.id, transaction_date: postDate, description: `Fixed Deposit Open ${opts.name}`, reference_number: `FD-${postDate}`, total_amount: amt, bank_account_id: opts.bankAccountId, transaction_type: 'asset', status: 'pending' }).select('id').single();
    if (txErr) throw txErr;
    const rows = [ { transaction_id: (tx as any).id, account_id: fdAssetId, debit: amt, credit: 0, description: 'Fixed deposit open', status: 'approved' }, { transaction_id: (tx as any).id, account_id: bankId, debit: 0, credit: amt, description: 'Fixed deposit open', status: 'approved' } ];
    const { error: entErr } = await supabase.from('transaction_entries').insert(rows);
    if (entErr) throw entErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: (tx as any).id, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: amt, _operation: 'subtract' }); } catch {}
    const { data: invAcct } = await supabase.from('investment_accounts' as any).insert({ company_id: companyId, name: opts.name, currency: 'ZAR', broker_name: 'Bank' }).select('id').single();
    const invAccountId = (invAcct as any)?.id || '';
    if (invAccountId) {
      await supabase.from('investment_positions' as any).insert({ account_id: invAccountId, symbol: `FD-${postDate}`, instrument_type: 'fixed_deposit', quantity: 1, avg_cost: amt, current_price: amt, market_value: amt, unrealized_gain: 0 });
      await supabase.from('investment_transactions' as any).insert({ account_id: invAccountId, type: 'buy', trade_date: postDate, symbol: `FD-${postDate}`, quantity: 1, price: amt, total_amount: amt, fees: 0, notes: `Rate ${(opts.rate*100).toFixed(2)}%, Term ${opts.termMonths}m` });
    }
    try { await supabase.rpc('refresh_afs_cache', { _company_id: companyId }); } catch {}
  },
  create: async (tx: { date: string; description: string; amount: number; reference?: string | null; status?: TransactionRow['status'] }): Promise<TransactionRow> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    await validateTransactionDate(companyId, tx.date);

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: tx.date,
        description: tx.description,
        total_amount: tx.amount,
        reference_number: tx.reference || null,
        status: tx.status || 'pending',
      })
      .select()
      .single();
    if (error) throw error;
    return data as TransactionRow;
  },
  delete: async (id: string): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: tx } = await supabase.from('transactions').select('transaction_date').eq('id', id).single();
    if (tx) {
      await validateTransactionDate(companyId, tx.transaction_date);
    }
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw error;
  },
  postInvoiceSentClient: async (inv: any, postDateStr?: string): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const postDate = postDateStr || inv.invoice_date || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, postDate);
    const subtotal = Number(inv.subtotal ?? inv.total_before_tax ?? 0);
    const taxAmount = Number(inv.tax_amount ?? inv.tax ?? 0);
    const total = Number(inv.total_amount ?? inv.total ?? subtotal + taxAmount);

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({
      id: a.id as string,
      name: String(a.account_name || '').toLowerCase(),
      type: String(a.account_type || '').toLowerCase(),
      code: String(a.account_code || ''),
    }));

    const findBy = (type: string, codes: string[], names: string[]): string | null => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      // Try exact match first, then try numeric match
      const byCode = byType.find(a => codes.includes(a.code) || codes.includes(String(a.code)));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k.toLowerCase())));
      return byName?.id || null;
    };

    // Find or create Accounts Receivable (1200)
    let arId = findBy('asset', ['1200'], ['receiv', 'accounts receiv']);
    if (!arId) {
      const { data: created } = await supabase.from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1200', account_name: 'Accounts Receivable', account_type: 'asset', is_active: true, normal_balance: 'debit' })
        .select('id').single();
      arId = (created as any)?.id || '';
    }

    // Find or create Sales Revenue (4000) - search for both 'income' and 'revenue' types
    let revId = findBy('income', ['4000'], ['revenue', 'sales']);
    if (!revId) revId = findBy('revenue', ['4000'], ['revenue', 'sales']);
    if (!revId) {
      const { data: created } = await supabase.from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '4000', account_name: 'Sales Revenue', account_type: 'income', is_active: true, normal_balance: 'credit' })
        .select('id').single();
      revId = (created as any)?.id || '';
    }

    let vatOutId = findBy('liability', ['2200','2100'], ['vat output', 'vat payable', 'output tax']);
    let cogsId = findBy('expense', ['5000'], ['cost of sales', 'cost of goods', 'cogs']);
    let inventoryId = findBy('asset', ['1300'], ['inventory', 'stock']);

    if (!arId || !revId) throw new Error('Failed to create core accounts: AR or Revenue');
    
    console.log('Found accounts:', { arId, revId, vatOutId, cogsId, inventoryId });
    console.log('Available accounts in database:', list.map(a => ({ code: a.code, name: a.name, type: a.type })));

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: postDate,
        description: `Invoice ${inv.invoice_number || inv.id} issued`,
        reference_number: inv.invoice_number || null,
        total_amount: total,
        transaction_type: 'sales',
        status: 'pending',
      })
      .select('id')
      .single();
    if (txErr) throw txErr;

    // Ensure VAT Output account exists if taxAmount > 0
    if (!vatOutId && taxAmount > 0) {
      try {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: '2200', account_name: 'VAT Output', account_type: 'liability', is_active: true })
          .select('id')
          .single();
        vatOutId = (created as any)?.id || vatOutId;
      } catch {}
    }

    const rows: Array<{ transaction_id: string; account_id: string; debit: number; credit: number; description: string; status: string }> = [
      { transaction_id: tx.id, account_id: arId, debit: total, credit: 0, description: 'Invoice issued', status: 'approved' },
      { transaction_id: tx.id, account_id: revId, debit: 0, credit: subtotal, description: 'Invoice issued', status: 'approved' },
    ];
    if (vatOutId && taxAmount > 0) {
      rows.push({ transaction_id: tx.id, account_id: vatOutId, debit: 0, credit: taxAmount, description: 'VAT on invoice', status: 'approved' });
    }

    // Compute COGS for product lines and post Dr COGS, Cr Inventory
    try {
      console.log('Starting COGS calculation for invoice:', inv.id);
      const { data: invItems } = await supabase
        .from('invoice_items')
        .select('description, quantity, unit_price, item_type, product_id')
        .eq('invoice_id', inv.id);
      console.log('Invoice items found:', invItems);
      
      const productIds = (invItems || [])
        .filter((it: any) => (String(it.item_type || '').toLowerCase() === 'product') && it.product_id)
        .map((it: any) => String(it.product_id));
      console.log('Product IDs found:', productIds);
      
      let totalCost = 0;
      if (productIds.length > 0) {
        const { data: prodInfos } = await supabase
          .from('items')
          .select('id, cost_price')
          .in('id', productIds as any);
        console.log('Product info found:', prodInfos);
        
        const costMap = new Map<string, number>();
        (prodInfos || []).forEach((p: any) => costMap.set(String(p.id), Number(p.cost_price || 0)));
        console.log('Cost map created:', Array.from(costMap.entries()));
        
        (invItems || []).forEach((it: any) => {
          const isProd = String(it.item_type || '').toLowerCase() === 'product';
          if (!isProd) return;
          let cp = costMap.get(String(it.product_id)) || 0;
          if (!cp || cp <= 0) cp = Number(it.unit_price || 0); // fallback to sales price when cost missing
          const qty = Number(it.quantity || 0);
          const itemCost = cp * qty;
          console.log(`Item: ${it.description}, Cost: ${cp}, Qty: ${qty}, Total: ${itemCost}`);
          totalCost += itemCost;
        });
        console.log('Total cost calculated from products:', totalCost);
      }
      // If product_id is not present, match by description/name
      if (totalCost === 0) {
        console.log('No cost found with product_id, trying name matching...');
        const names = (invItems || [])
          .filter((it: any) => String(it.item_type || '').toLowerCase() === 'product')
          .map((it: any) => String(it.description || ''))
          .filter(Boolean);
        console.log('Product names to search:', names);
        if (names.length > 0) {
          const { data: prodByName } = await supabase
            .from('items')
            .select('name, cost_price')
            .eq('company_id', companyId)
            .in('name', names as any)
            .eq('item_type', 'product');
          console.log('Products found by name:', prodByName);
          
          const costByName = new Map<string, number>();
          (prodByName || []).forEach((p: any) => costByName.set(String(p.name || ''), Number(p.cost_price || 0)));
          (invItems || []).forEach((it: any) => {
            if (String(it.item_type || '').toLowerCase() !== 'product') return;
            let cp = costByName.get(String(it.description || '')) || 0;
            if (!cp || cp <= 0) cp = Number(it.unit_price || 0);
            const qty = Number(it.quantity || 0);
            const itemCost = cp * qty;
            console.log(`Item by name: ${it.description}, Cost: ${cp}, Qty: ${qty}, Total: ${itemCost}`);
            totalCost += itemCost;
          });
          console.log('Total cost calculated from name matching:', totalCost);
        }
      }
      // Ensure accounts exist if we need to post COGS
      if (totalCost > 0) {
        if (!cogsId) {
          console.log('Creating COGS account 5000 for company:', companyId);
          const { data: created, error: cogsError } = await supabase
            .from('chart_of_accounts')
            .insert({ company_id: companyId, account_code: '5000', account_name: 'Cost of Sales', account_type: 'expense', is_active: true })
            .select('id')
            .single();
          if (cogsError) {
            console.error('Error creating COGS account:', cogsError);
          } else if (created) {
            cogsId = created.id;
            console.log('COGS account created with ID:', cogsId);
          }
        }
        if (!inventoryId) {
          console.log('Creating Inventory account 1300 for company:', companyId);
          const { data: created, error: invError } = await supabase
            .from('chart_of_accounts')
            .insert({ company_id: companyId, account_code: '1300', account_name: 'Inventory', account_type: 'asset', is_active: true })
            .select('id')
            .single();
          if (invError) {
            console.error('Error creating Inventory account:', invError);
          } else if (created) {
            inventoryId = created.id;
            console.log('Inventory account created with ID:', inventoryId);
          }
        }
        if (cogsId && inventoryId) {
          console.log('Adding COGS and Inventory entries to transaction:', { cogsId, inventoryId, totalCost });
          rows.push({ transaction_id: tx.id, account_id: cogsId, debit: totalCost, credit: 0, description: 'Cost of Goods Sold', status: 'approved' });
          rows.push({ transaction_id: tx.id, account_id: inventoryId, debit: 0, credit: totalCost, description: 'Inventory', status: 'approved' });
        } else {
          console.warn('COGS or Inventory account not found/created:', { cogsId, inventoryId });
        }
      }
    } catch (error) {
      console.error('Error in COGS calculation or account creation:', error);
    }

    console.log('Final transaction rows to be inserted:', rows);
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;

    const ledgerRows = rows.map(r => ({
      company_id: companyId,
      account_id: r.account_id,
      debit: r.debit,
      credit: r.credit,
      entry_date: postDate,
      is_reversed: false,
      transaction_id: tx.id,
      description: r.description,
    }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;

    await supabase
      .from('transactions')
      .update({ status: 'posted' })
      .eq('id', tx.id);
  },

  appendCOGSForInvoice: async (inv: any, postDateStr?: string): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = postDateStr || inv.invoice_date || new Date().toISOString().slice(0, 10);

    // Find existing transaction for this invoice
    const { data: tx } = await supabase
      .from('transactions')
      .select('id, transaction_type, status')
      .eq('company_id', companyId)
      .eq('reference_number', inv.invoice_number || null)
      .eq('transaction_type', 'sales')
      .maybeSingle();

    // Resolve accounts
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const findBy = (type: string, codes: string[], names: string[]): string | null => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || null;
    };
    let cogsId = findBy('expense', ['5000'], ['cost of sales', 'cost of goods', 'cogs']);
    let inventoryId = findBy('asset', ['1300'], ['inventory', 'stock']);

    // Compute COGS from invoice_items
    const { data: invItems } = await supabase
      .from('invoice_items')
      .select('description, quantity, item_type')
      .eq('invoice_id', inv.id);
    let totalCost = 0;
    const { data: allProducts } = await supabase
      .from('items')
      .select('name, cost_price')
      .eq('company_id', companyId)
      .eq('item_type', 'product');
    const catalog = (allProducts || []).map((p: any) => ({ name: String(p.name || '').toLowerCase().trim(), cost: Number(p.cost_price || 0) }));
    (invItems || []).forEach((it: any) => {
      if (String(it.item_type || '').toLowerCase() !== 'product') return;
      const desc = String(it.description || '').toLowerCase().trim();
      let cp = 0;
      const exact = catalog.find(c => c.name === desc);
      if (exact) cp = exact.cost;
      else {
        const contains = catalog.find(c => desc.includes(c.name) || c.name.includes(desc));
        if (contains) cp = contains.cost;
      }
      const qty = Number(it.quantity || 0);
      totalCost += (cp * qty);
    });

    if (totalCost <= 0) return;
    // Ensure accounts
    if (!cogsId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '5000', account_name: 'Cost of Sales', account_type: 'expense', is_active: true })
        .select('id')
        .single();
      cogsId = (created as any)?.id || cogsId;
    }
    if (!inventoryId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1300', account_name: 'Inventory', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      inventoryId = (created as any)?.id || inventoryId;
    }
    if (!cogsId || !inventoryId) return;

    // If no transaction found, fall back to full client posting
    if (!tx?.id) {
      await transactionsApi.postInvoiceSentClient(inv, postDate);
      return;
    }

    const rows = [
      { transaction_id: tx.id as string, account_id: cogsId, debit: totalCost, credit: 0, description: 'Cost of Goods Sold', status: 'approved' },
      { transaction_id: tx.id as string, account_id: inventoryId, debit: 0, credit: totalCost, description: 'Inventory', status: 'approved' },
    ];
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: tx.id as string, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id as string);
  },

  postInvoicePaidClient: async (inv: any, paymentDateStr: string, bankAccountId: string, amount: number): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const payDate = paymentDateStr || new Date().toISOString().slice(0, 10);
    const amt = Number(amount || inv.total_amount || 0);
    if (!amt || amt <= 0) throw new Error('Invalid payment amount');
    if (!bankAccountId) throw new Error('Bank account required');

    const { data: bankAcc } = await supabase
      .from('bank_accounts')
      .select('id, account_name')
      .eq('id', bankAccountId)
      .maybeSingle();

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({
      id: a.id as string,
      name: String(a.account_name || '').toLowerCase(),
      type: String(a.account_type || '').toLowerCase(),
      code: String(a.account_code || ''),
    }));

    const findBy = (type: string, codes: string[], names: string[]): string | null => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || null;
    };

    const arId = findBy('asset', ['1200'], ['receiv', 'accounts receiv']);
    if (!arId) throw new Error('Accounts Receivable account missing');

    const bankId = findBy('asset', ['1100'], ['bank', 'cash']);

    if (!bankId) throw new Error('Bank ledger account missing');

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: payDate,
        description: `Payment for invoice ${inv.invoice_number || inv.id}`,
        reference_number: inv.invoice_number || null,
        total_amount: amt,
        transaction_type: 'receipt',
        status: 'pending',
        bank_account_id: bankAccountId,
      })
      .select('id')
      .single();
    if (txErr) throw txErr;

    const rows: Array<{ transaction_id: string; account_id: string; debit: number; credit: number; description: string; status: string }> = [
      { transaction_id: tx.id, account_id: bankId, debit: amt, credit: 0, description: 'Invoice payment', status: 'approved' },
      { transaction_id: tx.id, account_id: arId, debit: 0, credit: amt, description: 'Invoice payment', status: 'approved' },
    ];

    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;

    const ledgerRows = rows.map(r => ({
      company_id: companyId,
      account_id: r.account_id,
      debit: r.debit,
      credit: r.credit,
      entry_date: payDate,
      is_reversed: false,
      transaction_id: tx.id,
      description: r.description,
    }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;

    await supabase
      .from('transactions')
      .update({ status: 'posted' })
      .eq('id', tx.id);

    try {
      await supabase.rpc('update_bank_balance', { _bank_account_id: bankAccountId, _amount: amt, _operation: 'add' });
    } catch {}
  },

  postLoanReceived: async (opts: { date: string; amount: number; reference: string; bankAccountId: string; loanType: 'short' | 'long'; loanLedgerAccountId?: string; description?: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    const amt = Number(opts.amount || 0);
    if (!amt || amt <= 0) throw new Error('Invalid loan amount');
    if (!opts.bankAccountId) throw new Error('Bank account required');

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({
      id: a.id as string,
      name: String(a.account_name || '').toLowerCase(),
      type: String(a.account_type || '').toLowerCase(),
      code: String(a.account_code || ''),
    }));
    const findBy = (type: string, codes: string[], names: string[]): string | null => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || null;
    };
    let bankLedgerId = findBy('asset', ['1100'], ['bank','cash']);
    if (!bankLedgerId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      bankLedgerId = (created as any)?.id || null;
    }
    let loanLedgerId = opts.loanLedgerAccountId || findBy('liability', [opts.loanType === 'long' ? '2400' : '2300'], ['loan']);
    if (!loanLedgerId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: opts.loanType === 'long' ? '2400' : '2300', account_name: opts.loanType === 'long' ? 'Long-term Loan' : 'Short-term Loan', account_type: 'liability', is_active: true })
        .select('id')
        .single();
      loanLedgerId = (created as any)?.id || null;
    }
    if (!bankLedgerId || !loanLedgerId) throw new Error('Required ledger accounts missing');

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: postDate,
        description: opts.description || `Loan received ${opts.reference}`,
        reference_number: opts.reference,
        total_amount: amt,
        transaction_type: 'loan_received',
        status: 'pending',
        bank_account_id: opts.bankAccountId,
      })
      .select('id')
      .single();
    if (txErr) throw txErr;

    const rows = [
      { transaction_id: tx.id as string, account_id: bankLedgerId, debit: amt, credit: 0, description: 'Loan received', status: 'approved' },
      { transaction_id: tx.id as string, account_id: loanLedgerId, debit: 0, credit: amt, description: 'Loan received', status: 'approved' },
    ];
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: tx.id as string, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id as string);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: amt, _operation: 'add' }); } catch {}
    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle();
      if ((profile as any)?.company_id) await supabase.rpc('refresh_afs_cache', { _company_id: (profile as any).company_id });
    } catch {}
  },
  postLoanAdvanced: async (opts: { date: string; amount: number; reference: string; bankAccountId: string; loanLedgerAccountId?: string; description?: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    const amt = Number(opts.amount || 0);
    if (!amt || amt <= 0) throw new Error('Invalid loan amount');
    if (!opts.bankAccountId) throw new Error('Bank account required');

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || '';
    };
    let bankLedgerId = pick('asset', ['1100'], ['bank','cash']);
    if (!bankLedgerId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      bankLedgerId = (created as any)?.id || '';
    }
    let loanAssetId = opts.loanLedgerAccountId || pick('asset', ['1200'], ['loan receivable','director loan']);
    if (!loanAssetId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1200', account_name: 'Loan Receivable', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      loanAssetId = (created as any)?.id || '';
    }
    if (!loanAssetId) throw new Error('Loan receivable ledger missing');

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: postDate,
        description: opts.description || `Loan advanced ${opts.reference}`,
        reference_number: opts.reference,
        total_amount: amt,
        transaction_type: 'loan_advanced',
        status: 'pending',
        bank_account_id: opts.bankAccountId,
      })
      .select('id')
      .single();
    if (txErr) throw txErr;

    const rows = [
      { transaction_id: tx.id as string, account_id: loanAssetId, debit: amt, credit: 0, description: 'Loan advanced', status: 'approved' },
      { transaction_id: tx.id as string, account_id: bankLedgerId, debit: 0, credit: amt, description: 'Loan advanced', status: 'approved' },
    ];
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: tx.id as string, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id as string);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: amt, _operation: 'subtract' }); } catch {}
    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle();
      if ((profile as any)?.company_id) await supabase.rpc('refresh_afs_cache', { _company_id: (profile as any).company_id });
    } catch {}
  },

  postLoanInterest: async (opts: { loanId: string; date?: string; bankAccountId: string; amountOverride?: number }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, postDate);
    if (!opts.bankAccountId) throw new Error('Bank account required');
    const { data: loan } = await supabase
      .from('loans')
      .select('id, reference, outstanding_balance, interest_rate')
      .eq('id', opts.loanId)
      .single();
    if (!loan) throw new Error('Loan not found');
    const monthStart = new Date(postDate.slice(0,7) + '-01');
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthStartStr = monthStart.toISOString().slice(0,10);
    const nextMonthStr = nextMonth.toISOString().slice(0,10);
    const monthEnd = new Date(nextMonth);
    monthEnd.setDate(monthEnd.getDate() - 1);
    const monthEndStr = monthEnd.toISOString().slice(0,10);
    const { data: interestDup } = await supabase
      .from('loan_payments')
      .select('id')
      .eq('loan_id', opts.loanId)
      .gte('payment_date', monthStartStr)
      .lt('payment_date', nextMonthStr)
      .gt('interest_component', 0);
    if ((interestDup || []).length > 0) throw new Error('Interest installment for this month is already recorded');
    const computed = Number(loan.outstanding_balance || 0) * Number(loan.interest_rate || 0) / 12;
    const amt = opts.amountOverride != null ? Number(opts.amountOverride) : computed;
    if (amt <= 0) throw new Error('Computed interest is zero');
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const findBy = (type: string, codes: string[], names: string[]): string | null => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || null;
    };
    let bankLedgerId = findBy('asset', ['1100'], ['bank','cash']);
    if (!bankLedgerId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      bankLedgerId = (created as any)?.id || null;
    }
    let interestExpenseId = findBy('expense', ['7800'], ['interest']);
    if (!interestExpenseId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '7800', account_name: 'Interest Expense', account_type: 'expense', is_active: true })
        .select('id')
        .single();
      interestExpenseId = (created as any)?.id || null;
    }
    if (!bankLedgerId || !interestExpenseId) throw new Error('Required ledger accounts missing');

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({ company_id: companyId, user_id: user.id, transaction_date: postDate, description: `Loan interest ${loan.reference}`, reference_number: loan.reference, total_amount: amt, transaction_type: 'loan_interest', status: 'pending', bank_account_id: opts.bankAccountId })
      .select('id')
      .single();
    if (txErr) throw txErr;
    const rows = [
      { transaction_id: tx.id as string, account_id: interestExpenseId, debit: amt, credit: 0, description: 'Loan interest', status: 'approved' },
      { transaction_id: tx.id as string, account_id: bankLedgerId, debit: 0, credit: amt, description: 'Loan interest', status: 'approved' },
    ];
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: tx.id as string, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id as string);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: amt, _operation: 'subtract' }); } catch {}
    try { await supabase.from('loan_payments').insert({ loan_id: opts.loanId, payment_date: monthEndStr, amount: amt, principal_component: 0, interest_component: amt }); } catch {}
  },

  postLoanRepayment: async (opts: { loanId: string; date?: string; bankAccountId: string; amountOverride?: number }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, postDate);
    if (!opts.bankAccountId) throw new Error('Bank account required');
    const { data: loan } = await supabase
      .from('loans')
      .select('id, reference, outstanding_balance, monthly_repayment, loan_type')
      .eq('id', opts.loanId)
      .single();
    if (!loan) throw new Error('Loan not found');
    const monthStart = new Date(postDate.slice(0,7) + '-01');
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthStartStr = monthStart.toISOString().slice(0,10);
    const nextMonthStr = nextMonth.toISOString().slice(0,10);
    const { data: principalDup } = await supabase
      .from('loan_payments')
      .select('id')
      .eq('loan_id', opts.loanId)
      .gte('payment_date', monthStartStr)
      .lt('payment_date', nextMonthStr)
      .gt('principal_component', 0);
    if ((principalDup || []).length > 0) throw new Error('Principal installment for this month is already recorded');
    const fallback = Number(loan.outstanding_balance || 0);
    const defaultAmt = Number(loan.monthly_repayment || 0) > 0 ? Number(loan.monthly_repayment) : fallback;
    const amt = opts.amountOverride != null ? Number(opts.amountOverride) : defaultAmt;
    if (amt <= 0) throw new Error('Computed repayment is zero');
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const findBy = (type: string, codes: string[], names: string[]): string | null => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || null;
    };
    let bankLedgerId = findBy('asset', ['1100'], ['bank','cash']);
    if (!bankLedgerId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      bankLedgerId = (created as any)?.id || null;
    }
    let loanLedgerId = findBy('liability', [loan.loan_type === 'long' ? '2400' : '2300'], ['loan']);
    if (!loanLedgerId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: loan.loan_type === 'long' ? '2400' : '2300', account_name: loan.loan_type === 'long' ? 'Long-term Loan' : 'Short-term Loan', account_type: 'liability', is_active: true })
        .select('id')
        .single();
      loanLedgerId = (created as any)?.id || null;
    }
    if (!bankLedgerId || !loanLedgerId) throw new Error('Required ledger accounts missing');

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({ company_id: companyId, user_id: user.id, transaction_date: postDate, description: `Loan repayment ${loan.reference}`, reference_number: loan.reference, total_amount: amt, transaction_type: 'loan_repayment', status: 'pending', bank_account_id: opts.bankAccountId })
      .select('id')
      .single();
    if (txErr) throw txErr;
    const rows = [
      { transaction_id: tx.id as string, account_id: loanLedgerId, debit: amt, credit: 0, description: 'Loan repayment', status: 'approved' },
      { transaction_id: tx.id as string, account_id: bankLedgerId, debit: 0, credit: amt, description: 'Loan repayment', status: 'approved' },
    ];
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: tx.id as string, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id as string);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: amt, _operation: 'subtract' }); } catch {}
    try {
      const newBalance = Math.max(0, Number(loan.outstanding_balance || 0) - amt);
      await supabase
        .from('loans')
        .update({ outstanding_balance: newBalance, status: newBalance === 0 ? 'completed' : 'active' })
        .eq('id', opts.loanId);
      await supabase.from('loan_payments').insert({ loan_id: opts.loanId, payment_date: postDate, amount: amt, principal_component: amt, interest_component: 0 });
    } catch {}
  },

  postLoanInstallmentAccrual: async (opts: { loanId: string; date?: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, postDate);

    const monthStart = new Date(postDate.slice(0,7) + '-01');
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthStartStr = monthStart.toISOString().slice(0,10);
    const nextMonthStr = nextMonth.toISOString().slice(0,10);

    const { data: existingAccruals } = await supabase
      .from('loan_payments')
      .select('id')
      .eq('loan_id', opts.loanId)
      .eq('amount', 0)
      .gte('payment_date', monthStartStr)
      .lt('payment_date', nextMonthStr)
      .gt('interest_component', 0);
    if ((existingAccruals || []).length > 0) {
      throw new Error('Installment for this month is already posted');
    }

    const { data: loan } = await supabase
      .from('loans')
      .select('id, reference, principal, outstanding_balance, interest_rate, term_months, monthly_repayment, loan_type')
      .eq('id', opts.loanId)
      .single();
    if (!loan) throw new Error('Loan not found');

    const annualRate = Number(loan.interest_rate || 0);
    const termMonths = Number(loan.term_months || 0);
    const principalAmount = Number(loan.principal || 0);
    const monthlyRate = annualRate / 12;

    let scheduled = 0;
    if (Number(loan.monthly_repayment || 0) > 0) {
      scheduled = Number(loan.monthly_repayment || 0);
    } else if (monthlyRate === 0 || termMonths <= 0) {
      scheduled = termMonths > 0 ? principalAmount / termMonths : principalAmount;
    } else {
      const r = monthlyRate;
      const n = termMonths;
      scheduled = (principalAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }
    if (!(scheduled > 0)) throw new Error('Installment amount is zero');

    const balance = Number(loan.outstanding_balance || 0);
    const interestPortion = monthlyRate > 0 ? balance * monthlyRate : 0;
    const capitalPortion = scheduled - interestPortion;
    if (!(capitalPortion > 0)) throw new Error('Capital portion is zero');

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({
      id: a.id as string,
      name: String(a.account_name || '').toLowerCase(),
      type: String(a.account_type || '').toLowerCase(),
      code: String(a.account_code || '')
    }));
    const findBy = (type: string, codes: string[], names: string[]): string | null => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || null;
    };

    let interestExpenseId = findBy('expense', ['7800'], ['interest']);
    if (!interestExpenseId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '7800', account_name: 'Interest Expense', account_type: 'expense', is_active: true })
        .select('id')
        .single();
      interestExpenseId = (created as any)?.id || null;
    }

    let interestPayableId = findBy('liability', ['2450'], ['interest payable', 'accrued interest']);
    if (!interestPayableId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '2450', account_name: 'Interest Payable', account_type: 'liability', is_active: true })
        .select('id')
        .single();
      interestPayableId = (created as any)?.id || null;
    }

    let longLoanId = findBy('liability', ['2400'], ['long-term loan', 'long term loan']);
    if (!longLoanId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '2400', account_name: 'Long-term Loan', account_type: 'liability', is_active: true })
        .select('id')
        .single();
      longLoanId = (created as any)?.id || null;
    }

    let currentPortionId = findBy('liability', ['2300'], ['short-term loan', 'short term loan', 'current portion']);
    if (!currentPortionId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '2300', account_name: 'Short-term Loan', account_type: 'liability', is_active: true })
        .select('id')
        .single();
      currentPortionId = (created as any)?.id || null;
    }

    if (!interestExpenseId || !interestPayableId || !longLoanId || !currentPortionId) {
      throw new Error('Required ledger accounts missing');
    }

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: postDate,
        description: `Accrue loan interest and reclass installment ${loan.reference}`,
        reference_number: loan.reference,
        total_amount: scheduled,
        transaction_type: 'loan_installment_accrual',
        status: 'pending',
        bank_account_id: null
      })
      .select('id')
      .single();
    if (txErr) throw txErr;

    const rows = [
      { transaction_id: tx.id as string, account_id: interestExpenseId, debit: interestPortion, credit: 0, description: 'Accrued loan interest', status: 'approved' },
      { transaction_id: tx.id as string, account_id: interestPayableId, debit: 0, credit: interestPortion, description: 'Accrued loan interest', status: 'approved' },
      { transaction_id: tx.id as string, account_id: longLoanId, debit: capitalPortion, credit: 0, description: 'Reclass current portion of long-term loan', status: 'approved' },
      { transaction_id: tx.id as string, account_id: currentPortionId, debit: 0, credit: capitalPortion, description: 'Reclass current portion of long-term loan', status: 'approved' }
    ];

    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({
      company_id: companyId,
      account_id: r.account_id,
      debit: r.debit,
      credit: r.credit,
      entry_date: postDate,
      is_reversed: false,
      transaction_id: tx.id as string,
      description: r.description
    }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id as string);
    try {
      await supabase.from('loan_payments').insert({
        loan_id: opts.loanId,
        payment_date: postDate,
        amount: 0,
        principal_component: capitalPortion,
        interest_component: interestPortion
      });
    } catch {}
    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle();
      if ((profile as any)?.company_id) await supabase.rpc('refresh_afs_cache', { _company_id: (profile as any).company_id });
    } catch {}
  },

  postDirectorLoanInstallmentAccrual: async (opts: { loanId: string; date?: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, postDate);

    const monthStart = new Date(postDate.slice(0,7) + '-01');
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthStartStr = monthStart.toISOString().slice(0,10);
    const nextMonthStr = nextMonth.toISOString().slice(0,10);

    const { data: existingAccruals } = await supabase
      .from('loan_payments')
      .select('id')
      .eq('loan_id', opts.loanId)
      .eq('amount', 0)
      .gte('payment_date', monthStartStr)
      .lt('payment_date', nextMonthStr)
      .gt('interest_component', 0);
    if ((existingAccruals || []).length > 0) {
      throw new Error('Installment for this month is already posted');
    }

    const { data: loan } = await supabase
      .from('loans')
      .select('id, reference, principal, outstanding_balance, interest_rate, term_months, monthly_repayment, loan_type')
      .eq('id', opts.loanId)
      .single();
    if (!loan) throw new Error('Loan not found');

    const annualRate = Number(loan.interest_rate || 0);
    const termMonths = Number(loan.term_months || 0);
    const principalAmount = Number(loan.principal || 0);
    const monthlyRate = annualRate / 12;

    let scheduled = 0;
    if (Number(loan.monthly_repayment || 0) > 0) {
      scheduled = Number(loan.monthly_repayment || 0);
    } else if (monthlyRate === 0 || termMonths <= 0) {
      scheduled = termMonths > 0 ? principalAmount / termMonths : principalAmount;
    } else {
      const r = monthlyRate;
      const n = termMonths;
      scheduled = (principalAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    }
    if (!(scheduled > 0)) throw new Error('Installment amount is zero');

    const balance = Number(loan.outstanding_balance || 0);
    const interestPortion = monthlyRate > 0 ? balance * monthlyRate : 0;
    const capitalPortion = scheduled - interestPortion;
    if (!(capitalPortion > 0)) throw new Error('Capital portion is zero');

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({
      id: a.id as string,
      name: String(a.account_name || '').toLowerCase(),
      type: String(a.account_type || '').toLowerCase(),
      code: String(a.account_code || '')
    }));
    const findBy = (type: string, codes: string[], names: string[]): string | null => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || null;
    };

    if (loan.loan_type === 'long') {
      let interestReceivableId = findBy('asset', ['1210'], ['interest receivable', 'accrued interest']);
      if (!interestReceivableId) {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: '1210', account_name: 'Interest Receivable - Director Loan', account_type: 'asset', is_active: true })
          .select('id')
          .single();
        interestReceivableId = (created as any)?.id || null;
      }

      let interestIncomeId = findBy('revenue', ['4200'], ['interest income', 'interest']);
      if (!interestIncomeId) {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: '4200', account_name: 'Interest Income', account_type: 'revenue', is_active: true })
          .select('id')
          .single();
        interestIncomeId = (created as any)?.id || null;
      }

      if (!interestReceivableId || !interestIncomeId) {
        throw new Error('Required ledger accounts missing for director loan asset');
      }

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          company_id: companyId,
          user_id: user.id,
          transaction_date: postDate,
          description: `Accrue director loan interest and reclass installment ${loan.reference}`,
          reference_number: loan.reference,
          total_amount: scheduled,
          transaction_type: 'director_loan_installment_accrual',
          status: 'pending',
          bank_account_id: null
        })
        .select('id')
        .single();
      if (txErr) throw txErr;

      const rows = [
        { transaction_id: tx.id as string, account_id: interestReceivableId, debit: interestPortion, credit: 0, description: 'Accrued director loan interest', status: 'approved' },
        { transaction_id: tx.id as string, account_id: interestIncomeId, debit: 0, credit: interestPortion, description: 'Accrued director loan interest', status: 'approved' }
      ];

      const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
      if (teErr) throw teErr;
      const ledgerRows = rows.map(r => ({
        company_id: companyId,
        account_id: r.account_id,
        debit: r.debit,
        credit: r.credit,
        entry_date: postDate,
        is_reversed: false,
        transaction_id: r.transaction_id,
        description: r.description
      }));
      const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
      if (leErr) throw leErr;
    } else {
      let interestExpenseId = findBy('expense', ['7800'], ['interest']);
      if (!interestExpenseId) {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: '7800', account_name: 'Interest Expense', account_type: 'expense', is_active: true })
          .select('id')
          .single();
        interestExpenseId = (created as any)?.id || null;
      }

      let interestPayableId = findBy('liability', ['2450'], ['interest payable', 'accrued interest']);
      if (!interestPayableId) {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: '2450', account_name: 'Interest Payable', account_type: 'liability', is_active: true })
          .select('id')
          .single();
        interestPayableId = (created as any)?.id || null;
      }

      if (!interestExpenseId || !interestPayableId) {
        throw new Error('Required ledger accounts missing for director loan');
      }

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          company_id: companyId,
          user_id: user.id,
          transaction_date: postDate,
          description: `Accrue director loan interest and reclass installment ${loan.reference}`,
          reference_number: loan.reference,
          total_amount: scheduled,
          transaction_type: 'director_loan_installment_accrual',
          status: 'pending',
          bank_account_id: null
        })
        .select('id')
        .single();
      if (txErr) throw txErr;

      const rows = [
        { transaction_id: tx.id as string, account_id: interestExpenseId, debit: interestPortion, credit: 0, description: 'Accrued director loan interest', status: 'approved' },
        { transaction_id: tx.id as string, account_id: interestPayableId, debit: 0, credit: interestPortion, description: 'Accrued director loan interest', status: 'approved' }
      ];

      const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
      if (teErr) throw teErr;
      const ledgerRows = rows.map(r => ({
        company_id: companyId,
        account_id: r.account_id,
        debit: r.debit,
        credit: r.credit,
        entry_date: postDate,
        is_reversed: false,
        transaction_id: r.transaction_id,
        description: r.description
      }));
      const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
      if (leErr) throw leErr;
    }

    await supabase.from('transactions').update({ status: 'posted' }).eq('reference_number', loan.reference).eq('transaction_date', postDate).eq('transaction_type', 'director_loan_installment_accrual');
    try {
      await supabase.from('loan_payments').insert({
        loan_id: opts.loanId,
        payment_date: postDate,
        amount: 0,
        principal_component: 0,
        interest_component: interestPortion
      });
    } catch {}
    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle();
      if ((profile as any)?.company_id) await supabase.rpc('refresh_afs_cache', { _company_id: (profile as any).company_id });
    } catch {}
  },

  postDirectorLoanInterestReceived: async (opts: { loanId: string; date?: string; bankAccountId: string; amountOverride?: number }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, postDate);
    if (!opts.bankAccountId) throw new Error('Bank account required');
    const { data: loan } = await supabase
      .from('loans')
      .select('id, reference, outstanding_balance, interest_rate')
      .eq('id', opts.loanId)
      .single();
    if (!loan) throw new Error('Loan not found');
    const monthStart = new Date(postDate.slice(0,7) + '-01');
    const nextMonth = new Date(monthStart); nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthStartStr = monthStart.toISOString().slice(0,10);
    const nextMonthStr = nextMonth.toISOString().slice(0,10);
    const monthEnd = new Date(nextMonth);
    monthEnd.setDate(monthEnd.getDate() - 1);
    const monthEndStr = monthEnd.toISOString().slice(0,10);
    const { data: interestDup } = await supabase
      .from('loan_payments')
      .select('id')
      .eq('loan_id', opts.loanId)
      .gte('payment_date', monthStartStr)
      .lt('payment_date', nextMonthStr)
      .gt('interest_component', 0);
    if ((interestDup || []).length > 0) throw new Error('Interest installment for this month is already recorded');
    const computed = Number(loan.outstanding_balance || 0) * Number(loan.interest_rate || 0) / 12;
    const amt = opts.amountOverride != null ? Number(opts.amountOverride) : computed;
    if (!(amt > 0)) throw new Error('Interest amount must be > 0');

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || '';
    };
    let bankLedgerId = pick('asset', ['1100'], ['bank','cash']);
    if (!bankLedgerId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      bankLedgerId = (created as any)?.id || '';
    }
    let interestIncomeId = pick('revenue', ['4200'], ['interest income','interest']);
    if (!interestIncomeId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '4200', account_name: 'Interest Income', account_type: 'revenue', is_active: true })
        .select('id')
        .single();
      interestIncomeId = (created as any)?.id || '';
    }

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: postDate,
        description: `Director loan interest received ${loan.reference}`,
        reference_number: loan.reference,
        total_amount: amt,
        transaction_type: 'director_loan_interest_received',
        status: 'pending',
        bank_account_id: opts.bankAccountId,
      })
      .select('id')
      .single();
    if (txErr) throw txErr;

    const rows = [
      { transaction_id: tx.id as string, account_id: bankLedgerId, debit: amt, credit: 0, description: 'Interest received', status: 'approved' },
      { transaction_id: tx.id as string, account_id: interestIncomeId, debit: 0, credit: amt, description: 'Interest received', status: 'approved' },
    ];
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: tx.id as string, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id as string);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: amt, _operation: 'add' }); } catch {}
    await supabase.from('loan_payments').insert({ loan_id: opts.loanId, payment_date: monthEndStr, amount: amt, principal_component: 0, interest_component: amt });
    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle();
      if ((profile as any)?.company_id) await supabase.rpc('refresh_afs_cache', { _company_id: (profile as any).company_id });
    } catch {}
  },

  postDirectorLoanPaymentReceived: async (opts: { loanId: string; date?: string; bankAccountId: string; amountOverride?: number }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    if (!opts.bankAccountId) throw new Error('Bank account required');
    const { data: loan } = await supabase
      .from('loans')
      .select('id, reference, outstanding_balance, interest_rate, term_months, principal, monthly_repayment')
      .eq('id', opts.loanId)
      .single();
    if (!loan) throw new Error('Loan not found');
    const monthStart = new Date(postDate.slice(0,7) + '-01');
    const nextMonth = new Date(monthStart); nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthStartStr = monthStart.toISOString().slice(0,10);
    const nextMonthStr = nextMonth.toISOString().slice(0,10);
    const { data: princDup } = await supabase
      .from('loan_payments')
      .select('id')
      .eq('loan_id', opts.loanId)
      .gte('payment_date', monthStartStr)
      .lt('payment_date', nextMonthStr)
      .gt('principal_component', 0);
    if ((princDup || []).length > 0) throw new Error('Principal installment for this month is already recorded');

    const rate = Number(loan.interest_rate || 0);
    const bal = Number(loan.outstanding_balance || 0);
    const monthlyInterest = bal * (rate / 12);
    const termMonths = Number(loan.term_months || 0);
    const monthlyRate = rate / 12;
    const principalAmount = Number(loan.principal || 0);
    const fallbackPayment = (monthlyRate === 0 || termMonths <= 0)
      ? (termMonths > 0 ? (principalAmount / termMonths) : principalAmount)
      : (principalAmount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
    const totalAmt = opts.amountOverride != null ? Number(opts.amountOverride) : (Number(loan.monthly_repayment || 0) > 0 ? Number(loan.monthly_repayment) : fallbackPayment);
    if (!(totalAmt > 0)) throw new Error('Repayment amount must be > 0');

    const interestComponent = Math.min(monthlyInterest, totalAmt);
    const principalComponent = Math.max(0, totalAmt - interestComponent);
    const newBalance = Math.max(0, bal - principalComponent);

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => {
      const byType = list.filter(a => a.type === type.toLowerCase());
      const byCode = byType.find(a => codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = byType.find(a => names.some(k => a.name.includes(k)));
      return byName?.id || '';
    };
    let bankLedgerId = pick('asset', ['1100'], ['bank','cash']);
    if (!bankLedgerId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1100', account_name: 'Bank - Current Account', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      bankLedgerId = (created as any)?.id || '';
    }
    let loanAssetId = pick('asset', ['1250','1450','1200'], ['loan receivable','director loan']);
    if (!loanAssetId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1200', account_name: 'Loan Receivable', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      loanAssetId = (created as any)?.id || '';
    }
    let interestIncomeId = pick('revenue', ['4200'], ['interest income','interest']);
    if (!interestIncomeId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '4200', account_name: 'Interest Income', account_type: 'revenue', is_active: true })
        .select('id')
        .single();
      interestIncomeId = (created as any)?.id || '';
    }

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: postDate,
        description: `Director loan payment received ${loan.reference}`,
        reference_number: loan.reference,
        total_amount: totalAmt,
        transaction_type: 'director_loan_payment_received',
        status: 'pending',
        bank_account_id: opts.bankAccountId,
      })
      .select('id')
      .single();
    if (txErr) throw txErr;

    const rows: Array<{ transaction_id: string; account_id: string; debit: number; credit: number; description: string; status: 'approved' }> = [
      { transaction_id: tx.id as string, account_id: bankLedgerId, debit: totalAmt, credit: 0, description: 'Payment received', status: 'approved' },
    ];
    if (principalComponent > 0) rows.push({ transaction_id: tx.id as string, account_id: loanAssetId, debit: 0, credit: principalComponent, description: 'Principal received', status: 'approved' });
    if (interestComponent > 0) rows.push({ transaction_id: tx.id as string, account_id: interestIncomeId, debit: 0, credit: interestComponent, description: 'Interest received', status: 'approved' });
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: tx.id as string, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id as string);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: opts.bankAccountId, _amount: totalAmt, _operation: 'add' }); } catch {}
    await supabase.from('loan_payments').insert({ loan_id: opts.loanId, payment_date: postDate, amount: totalAmt, principal_component: principalComponent, interest_component: interestComponent });
    await supabase.from('loans').update({ outstanding_balance: newBalance, status: newBalance === 0 ? 'completed' : 'active' }).eq('id', opts.loanId);
    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle();
      if ((profile as any)?.company_id) await supabase.rpc('refresh_afs_cache', { _company_id: (profile as any).company_id });
    } catch {}
  },
  postPurchaseSentClient: async (po: any, postDateStr?: string): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = postDateStr || po.po_date || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, postDate);
    const total = Number(po.total_amount || 0);
    const taxAmount = Number(po.tax_amount ?? 0);
    const subtotal = Number(po.subtotal ?? (total - taxAmount));
    const vatRate = subtotal > 0 && taxAmount > 0 ? Number(((taxAmount / subtotal) * 100).toFixed(2)) : 0;
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => {
      const byCode = list.find(a => a.type === type.toLowerCase() && codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = list.find(a => a.type === type.toLowerCase() && names.some(n => a.name.includes(n)));
      if (byName) return byName.id;
      const byType = list.find(a => a.type === type.toLowerCase());
      return byType?.id || '';
    };
    const inventoryId = pick('asset', ['1300'], ['inventory','stock']);
    const apId = pick('liability', ['2000'], ['accounts payable','payable']);
    let vatInId = pick('liability', ['2110','2210'], ['vat input','vat receivable','input tax']);
    if (!inventoryId || !apId) throw new Error('Inventory or Accounts Payable account missing');
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: postDate,
        description: `PO ${po.po_number || po.id} sent`,
        reference_number: po.po_number || null,
        total_amount: total,
        transaction_type: 'purchase',
        status: 'pending',
        vat_rate: vatRate > 0 ? vatRate : null,
        vat_amount: taxAmount > 0 ? taxAmount : null,
        base_amount: subtotal,
        vat_inclusive: taxAmount > 0,
      })
      .select('id')
      .single();
    if (txErr) throw txErr;
    // Ensure VAT Input account exists if taxAmount > 0
    if (!vatInId && taxAmount > 0) {
      try {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: '2110', account_name: 'VAT Input', account_type: 'liability', is_active: true })
          .select('id')
          .single();
        vatInId = (created as any)?.id || vatInId;
      } catch {}
    }

    const rows: Array<{ transaction_id: string; account_id: string; debit: number; credit: number; description: string; status: string }> = [
      { transaction_id: tx.id, account_id: inventoryId, debit: Math.max(0, subtotal), credit: 0, description: 'Inventory', status: 'approved' },
      { transaction_id: tx.id, account_id: apId, debit: 0, credit: Math.max(0, total), description: 'Accounts Payable', status: 'approved' },
    ];
    if (vatInId && taxAmount > 0) {
      rows.push({ transaction_id: tx.id, account_id: vatInId, debit: taxAmount, credit: 0, description: 'VAT Input', status: 'approved' });
    }
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: tx.id, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;

    await supabase
      .from('transactions')
      .update({ status: 'posted' })
      .eq('id', tx.id);
  },
  postPurchasePaidClient: async (po: any, paymentDateStr: string, bankAccountId: string, amount: number): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const payDate = paymentDateStr || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, payDate);
    const amt = Number(amount || po.total_amount || 0);
    if (!amt || amt <= 0) throw new Error('Invalid payment amount');
    if (!bankAccountId) throw new Error('Bank account required');
    const { data: bankAcc } = await supabase
      .from('bank_accounts')
      .select('id, company_id, account_name')
      .eq('id', bankAccountId)
      .maybeSingle();
    if (!bankAcc || bankAcc.company_id !== companyId) {
      throw new Error('Invalid bank account selection for this company');
    }
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => {
      const byCode = list.find(a => a.type === type.toLowerCase() && codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = list.find(a => a.type === type.toLowerCase() && names.some(n => a.name.includes(n)));
      if (byName) return byName.id;
      const byType = list.find(a => a.type === type.toLowerCase());
      return byType?.id || '';
    };
    const apId = pick('liability', ['2000'], ['accounts payable','payable']);
    const bankId = pick('asset', ['1100'], ['bank','cash']);
    if (!apId || !bankId) throw new Error('Accounts Payable or Bank account missing');
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({ company_id: companyId, user_id: user.id, transaction_date: payDate, description: `Payment for PO ${po.po_number || po.id}`, reference_number: po.po_number || null, total_amount: amt, base_amount: amt, transaction_type: 'payment', status: 'pending', bank_account_id: bankAccountId })
      .select('id')
      .single();
    if (txErr) throw txErr;
    const rows = [
      { transaction_id: tx.id, account_id: apId, debit: amt, credit: 0, description: 'Accounts Payable', status: 'approved' },
      { transaction_id: tx.id, account_id: bankId, debit: 0, credit: amt, description: 'Bank', status: 'approved' },
    ];
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: payDate, is_reversed: false, transaction_id: tx.id, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase
      .from('transactions')
      .update({ status: 'posted' })
      .eq('id', tx.id);
    try { await supabase.rpc('update_bank_balance', { _bank_account_id: bankAccountId, _amount: amt, _operation: 'subtract' }); } catch {}
  },
  postOpeningStock: async (opts: { productId: string; quantity: number; costPrice: number; date: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, postDate);
    const qty = Number(opts.quantity || 0);
    const cp = Number(opts.costPrice || 0);
    const total = qty * cp;
    if (!(qty > 0) || !(cp > 0)) throw new Error('Quantity and cost price must be > 0');

    const { data: product } = await supabase
      .from('items')
      .select('id, name, item_type, company_id')
      .eq('id', opts.productId)
      .maybeSingle();
    if (!product) throw new Error('Product not found');
    if (String((product as any).item_type || '').toLowerCase() !== 'product') throw new Error('Selected item is not a product');
    if ((product as any).company_id !== companyId) throw new Error('Product belongs to a different company');

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const list = (accounts || []).map(a => ({ id: a.id as string, name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
    const pick = (type: string, codes: string[], names: string[]) => {
      const byCode = list.find(a => a.type === type.toLowerCase() && codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = list.find(a => a.type === type.toLowerCase() && names.some(n => a.name.includes(n)));
      if (byName) return byName.id;
      const byType = list.find(a => a.type === type.toLowerCase());
      return byType?.id || '';
    };
    let inventoryId = pick('asset', ['1300'], ['inventory','stock']);
    if (!inventoryId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1300', account_name: 'Inventory', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      inventoryId = (created as any)?.id || '';
    }
    let openingEquityId = pick('equity', ['3100','3000'], ['opening','share capital','capital']);
    if (!openingEquityId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '3100', account_name: 'Share Capital', account_type: 'equity', is_active: true })
        .select('id')
        .single();
      openingEquityId = (created as any)?.id || '';
    }
    if (!inventoryId || !openingEquityId) throw new Error('Required ledger accounts missing');

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({ company_id: companyId, user_id: user.id, transaction_date: postDate, description: `Opening stock for ${String((product as any).name || '')}`, reference_number: `OPEN-STK-${(product as any).id}`, total_amount: total, transaction_type: 'opening_stock', status: 'pending' })
      .select('id')
      .single();
    if (txErr) throw txErr;

    const rows = [
      { transaction_id: (tx as any).id as string, account_id: inventoryId, debit: total, credit: 0, description: 'Opening stock', status: 'approved' },
      { transaction_id: (tx as any).id as string, account_id: openingEquityId, debit: 0, credit: total, description: 'Opening stock', status: 'approved' },
    ];
    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: (tx as any).id as string, description: r.description }));
    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;
    await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id as string);

    const { data: currentItem } = await supabase
      .from('items')
      .select('quantity_on_hand')
      .eq('id', opts.productId)
      .maybeSingle();
    const currentQty = Number((currentItem as any)?.quantity_on_hand || 0);
    const newQty = currentQty + qty;
    await supabase.from('items').update({ quantity_on_hand: newQty, cost_price: cp }).eq('id', opts.productId);
    try { const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle(); if ((profile as any)?.company_id) await supabase.rpc('refresh_afs_cache', { _company_id: (profile as any).company_id }); } catch {}
  },

  postInventoryAdjustment: async (opts: { productId: string; quantityChange: number; costPrice: number; date: string; reason: string }): Promise<void> => {
    const companyId = await getUserCompanyId();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const postDate = opts.date || new Date().toISOString().slice(0, 10);
    await validateTransactionDate(companyId, postDate);

    const qtyChange = Number(opts.quantityChange || 0);
    if (qtyChange === 0) throw new Error('Quantity change cannot be zero');

    const cp = Number(opts.costPrice || 0);
    if (cp <= 0) throw new Error('Cost price must be greater than zero to post adjustment value');

    const totalAmount = Math.abs(qtyChange * cp);

    const { data: product } = await supabase
      .from('items')
      .select('id, name, item_type, company_id, quantity_on_hand')
      .eq('id', opts.productId)
      .maybeSingle();
    
    if (!product) throw new Error('Product not found');
    if ((product as any).company_id !== companyId) throw new Error('Product belongs to a different company');

    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    
    const list = (accounts || []).map(a => ({ 
      id: a.id as string, 
      name: String(a.account_name || '').toLowerCase(), 
      type: String(a.account_type || '').toLowerCase(), 
      code: String(a.account_code || '') 
    }));

    const pick = (type: string, codes: string[], names: string[]) => {
      const byCode = list.find(a => a.type === type.toLowerCase() && codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = list.find(a => a.type === type.toLowerCase() && names.some(n => a.name.includes(n)));
      if (byName) return byName.id;
      // Removed fallback to any account of the type to prevent incorrect account usage (e.g. Rent instead of Loss)
      return '';
    };

    let inventoryId = pick('asset', ['1300'], ['inventory', 'stock']);
    if (!inventoryId) {
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1300', account_name: 'Inventory', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      inventoryId = (created as any)?.id || '';
    }

    let contraAccountId = '';
    
    if (qtyChange > 0) {
      // Increase Inventory -> Dr Inventory, Cr Gain
      // Use code 9962 for Gain
      contraAccountId = pick('revenue', ['9962'], ['inventory gain', 'stock surplus', 'gain']);
      
      // If account found but named "Foreign Exchange...", update it to "Inventory Gain"
      if (contraAccountId) {
         const acc = accounts?.find(a => a.id === contraAccountId);
         if (acc && acc.account_name && acc.account_name.toLowerCase().includes('foreign')) {
             await supabase.from('chart_of_accounts')
               .update({ account_name: 'Inventory Gain' })
               .eq('id', contraAccountId);
         }
      }

      if (!contraAccountId) {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: '9962', account_name: 'Inventory Gain', account_type: 'revenue', is_active: true })
          .select('id')
          .single();
        contraAccountId = (created as any)?.id || '';
      }
    } else {
      // Decrease Inventory -> Dr Loss, Cr Inventory
      // Use code 8975 for Loss
      contraAccountId = pick('expense', ['8975'], ['inventory loss', 'stock shrinkage', 'loss']);
      
      // If account found but named "Foreign Exchange...", update it to "Inventory Loss"
      if (contraAccountId) {
         const acc = accounts?.find(a => a.id === contraAccountId);
         if (acc && acc.account_name && acc.account_name.toLowerCase().includes('foreign')) {
             await supabase.from('chart_of_accounts')
               .update({ account_name: 'Inventory Loss' })
               .eq('id', contraAccountId);
         }
      }

      if (!contraAccountId) {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: '8975', account_name: 'Inventory Loss', account_type: 'expense', is_active: true })
          .select('id')
          .single();
        contraAccountId = (created as any)?.id || '';
      }
    }

    if (!inventoryId || !contraAccountId) throw new Error('Required ledger accounts missing');

    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        company_id: companyId,
        user_id: user.id,
        transaction_date: postDate,
        description: `Inventory Adjustment: ${opts.reason || 'Manual Adjustment'} - ${product.name}`,
        reference_number: `ADJ-${product.id}-${Date.now()}`,
        total_amount: totalAmount,
        transaction_type: 'inventory_adjustment',
        status: 'pending'
      })
      .select('id')
      .single();
    
    if (txErr) throw txErr;

    const rows = [];
    if (qtyChange > 0) {
      // Dr Inventory, Cr Gain
      rows.push({ transaction_id: (tx as any).id as string, account_id: inventoryId, debit: totalAmount, credit: 0, description: 'Inventory Increase', status: 'approved' });
      rows.push({ transaction_id: (tx as any).id as string, account_id: contraAccountId, debit: 0, credit: totalAmount, description: 'Inventory Gain', status: 'approved' });
    } else {
      // Dr Loss, Cr Inventory
      rows.push({ transaction_id: (tx as any).id as string, account_id: contraAccountId, debit: totalAmount, credit: 0, description: 'Inventory Loss', status: 'approved' });
      rows.push({ transaction_id: (tx as any).id as string, account_id: inventoryId, debit: 0, credit: totalAmount, description: 'Inventory Decrease', status: 'approved' });
    }

    const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
    if (teErr) throw teErr;

    const ledgerRows = rows.map(r => ({
      company_id: companyId,
      account_id: r.account_id,
      debit: r.debit,
      credit: r.credit,
      entry_date: postDate,
      is_reversed: false,
      transaction_id: (tx as any).id as string,
      description: r.description
    }));

    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
    if (leErr) throw leErr;

    await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id as string);

    // Update item quantity
    const currentQty = Number((product as any)?.quantity_on_hand || 0);
    const newQty = currentQty + qtyChange;
    await supabase.from('items').update({ quantity_on_hand: newQty }).eq('id', opts.productId);

    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle();
      if ((profile as any)?.company_id) await supabase.rpc('refresh_afs_cache', { _company_id: (profile as any).company_id });
    } catch {}
  },
};
