import { supabase, hasSupabaseEnv } from "@/integrations/supabase/client";

const uuid = () => {
  try { return crypto.randomUUID(); } catch {}
  const tpl = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return tpl.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const isDemoMode = () => {
  try { return localStorage.getItem('rigel_demo_mode') === 'true'; } catch { return false; }
};

const setDemoBackend = (backend: 'local' | 'supabase') => {
  try { localStorage.setItem('rigel_demo_backend', backend); } catch {}
};
const getDemoBackend = (): 'local' | 'supabase' => {
  try { return (localStorage.getItem('rigel_demo_backend') as any) || 'local'; } catch { return 'local'; }
};

export const enableDemoMode = async () => {
  try { localStorage.setItem('rigel_demo_mode', 'true'); } catch {}
  const canUseSupabase = hasSupabaseEnv;
  if (canUseSupabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await seedSupabaseDemo();
        setDemoBackend('supabase');
        return;
      }
    } catch {}
  }
  setDemoBackend('local');
  seedDemoData();
};

export const disableDemoMode = async () => {
  const backend = getDemoBackend();
  if (backend === 'supabase') {
    try {
      const cid = JSON.parse(String(localStorage.getItem('rigel_demo_company') || '{}'))?.id;
      if (cid) {
        await deleteSupabaseDemoCompany(String(cid));
      }
      try {
        const prev = String(localStorage.getItem('rigel_demo_prev_company_id') || '');
        localStorage.removeItem('rigel_demo_prev_company_id');
        if (prev) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('profiles')
              .update({ company_id: prev })
              .eq('user_id', user.id);
          }
        }
      } catch {}
    } catch {}
  }
  try {
    localStorage.removeItem('rigel_demo_mode');
    localStorage.removeItem('rigel_demo_backend');
    localStorage.removeItem('rigel_demo_company');
    localStorage.removeItem('rigel_demo_transactions');
    localStorage.removeItem('rigel_demo_trial_balance_period');
    localStorage.removeItem('rigel_demo_trial_balance_asof');
  } catch {}
};
export const getDemoCompany = () => {
  try {
    const existing = localStorage.getItem('rigel_demo_company');
    if (existing) return JSON.parse(existing);
  } catch {}
  const company = {
    id: 'demo-company',
    name: 'Stella Lumen Pty Ltd',
    email: 'info@stellalumen.example',
    phone: '+27 87 123 4567',
    address: '1 Demo Street, Cape Town, 8001',
    website: 'https://demo.stellalumen.example'
  };
  try { localStorage.setItem('rigel_demo_company', JSON.stringify(company)); } catch {}
  return company;
};
const randomAmount = (min: number, max: number) => Math.round((Math.random() * (max - min) + min) * 100) / 100;
const dateInLastMonths = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - Math.floor(Math.random() * months));
  d.setDate(Math.max(1, Math.floor(Math.random() * 28)));
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};
export const seedDemoData = () => {
  const expenses = Array.from({ length: 20 }).map((_, i) => ({
    id: `exp-${i + 1}`,
    type: 'expense',
    description: ['Rent','Utilities','Office Supplies','Travel','Meals','Marketing','Insurance','Maintenance'][i % 8],
    amount: randomAmount(500, 5000),
    transaction_date: dateInLastMonths(6),
    status: 'posted'
  }));
  const incomes = Array.from({ length: 20 }).map((_, i) => ({
    id: `inc-${i + 1}`,
    type: 'income',
    description: ['Product Sale','Service Fee','Consulting','Subscription','License','Training'][i % 6],
    amount: randomAmount(800, 12000),
    transaction_date: dateInLastMonths(6),
    status: 'posted'
  }));
  const transactions = [...expenses, ...incomes].sort((a, b) => (a.transaction_date > b.transaction_date ? -1 : 1));
  try { localStorage.setItem('rigel_demo_transactions', JSON.stringify(transactions)); } catch {}
  const tbPeriod = [
    { account_id: '4000', account_code: '4000', account_name: 'Sales Revenue', account_type: 'revenue', normal_balance: 'credit', total_debits: 0, total_credits: incomes.reduce((s, r) => s + r.amount, 0), balance: incomes.reduce((s, r) => s + r.amount, 0) },
    { account_id: '5000', account_code: '5000', account_name: 'Cost of Sales', account_type: 'expense', normal_balance: 'debit', total_debits: expenses.filter(e => ['Marketing','Travel','Meals'].includes(e.description)).reduce((s, r) => s + r.amount, 0), total_credits: 0, balance: expenses.filter(e => ['Marketing','Travel','Meals'].includes(e.description)).reduce((s, r) => s + r.amount, 0) },
    { account_id: '5600', account_code: '5600', account_name: 'Operating Expenses', account_type: 'expense', normal_balance: 'debit', total_debits: expenses.filter(e => !['Marketing','Travel','Meals'].includes(e.description)).reduce((s, r) => s + r.amount, 0), total_credits: 0, balance: expenses.filter(e => !['Marketing','Travel','Meals'].includes(e.description)).reduce((s, r) => s + r.amount, 0) }
  ];
  const tbAsOf = [
    { account_id: '1000', account_code: '1000', account_name: 'Cash and Bank', account_type: 'asset', normal_balance: 'debit', total_debits: 0, total_credits: 0, balance: Math.max(0, incomes.reduce((s, r) => s + r.amount, 0) - expenses.reduce((s, r) => s + r.amount, 0)) },
    { account_id: '1300', account_code: '1300', account_name: 'Inventory', account_type: 'asset', normal_balance: 'debit', total_debits: 0, total_credits: 0, balance: randomAmount(10000, 20000) },
    { account_id: '2100', account_code: '2100', account_name: 'VAT Payable', account_type: 'liability', normal_balance: 'credit', total_debits: 0, total_credits: 0, balance: randomAmount(1000, 3000) },
    { account_id: '3100', account_code: '3100', account_name: 'Retained Earnings', account_type: 'equity', normal_balance: 'credit', total_debits: 0, total_credits: 0, balance: Math.max(0, incomes.reduce((s, r) => s + r.amount, 0) - expenses.reduce((s, r) => s + r.amount, 0)) }
  ];
  try { localStorage.setItem('rigel_demo_trial_balance_period', JSON.stringify(tbPeriod)); } catch {}
  try { localStorage.setItem('rigel_demo_trial_balance_asof', JSON.stringify(tbAsOf)); } catch {}
};

const ensureCoa = async (companyId: string) => {
  const defs = [
    { code: '1100', name: 'Bank - Current Account', type: 'asset' },
    { code: '1200', name: 'Accounts Receivable', type: 'asset' },
    { code: '1300', name: 'Inventory', type: 'asset' },
    { code: '1400', name: 'Investment Assets', type: 'asset' },
    { code: '1920', name: 'Long-term Investments', type: 'asset' },
    { code: '2100', name: 'VAT Payable', type: 'liability' },
    { code: '2200', name: 'Bank Loan', type: 'liability' },
    { code: '3100', name: 'Retained Earnings', type: 'equity' },
    { code: '4000', name: 'Sales Revenue', type: 'income' },
    { code: '4200', name: 'Interest Income', type: 'income' },
    { code: '4205', name: 'Dividend Income', type: 'income' },
    { code: '5000', name: 'Cost of Sales', type: 'expense' },
    { code: '5600', name: 'Operating Expenses', type: 'expense' },
  ];
  const { data: existing } = await supabase
    .from('chart_of_accounts')
    .select('account_code')
    .eq('company_id', companyId);
  const have = new Set<string>((existing || []).map((r: any) => String(r.account_code)));
  const toCreate = defs.filter(d => !have.has(d.code)).map(d => ({ company_id: companyId, account_code: d.code, account_name: d.name, account_type: d.type, is_active: true }));
  if (toCreate.length > 0) { await supabase.from('chart_of_accounts').insert(toCreate); }
};

const getCoaId = async (companyId: string, code: string, fallback: { name: string; type: string }) => {
  const { data } = await supabase
    .from('chart_of_accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('account_code', code)
    .limit(1);
  const id = (Array.isArray(data) && data[0]?.id) ? String(data[0].id) : '';
  if (id) return id;
  const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: code, account_name: fallback.name, account_type: fallback.type, is_active: true }).select('id').single();
  return (created as any)?.id as string;
};

const insertPostedTransaction = async (companyId: string, userId: string, dateISO: string, description: string, type: 'income' | 'expense' | 'asset' | 'loan', amount: number, debitAccountId: string, creditAccountId: string, bankAccountId: string | null) => {
  const { data: tx } = await supabase
    .from('transactions')
    .insert({ company_id: companyId, user_id: userId, transaction_date: dateISO, description, reference_number: `DEMO-${Math.random().toString(36).slice(2,8).toUpperCase()}`, total_amount: amount, bank_account_id: bankAccountId, transaction_type: type, status: 'pending' })
    .select('id')
    .single();
  const txId = (tx as any)?.id as string;
  if (!txId) return;
  const rows = [
    { transaction_id: txId, account_id: debitAccountId, debit: amount, credit: 0, description, status: 'approved' },
    { transaction_id: txId, account_id: creditAccountId, debit: 0, credit: amount, description, status: 'approved' },
  ];
  await supabase.from('transaction_entries').insert(rows);
  const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: dateISO, is_reversed: false, transaction_id: txId, description: r.description }));
  await supabase.from('ledger_entries').insert(ledgerRows as any);
  await supabase.from('transactions').update({ status: 'posted' }).eq('id', txId);
};

const seedSupabaseDemo = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const companyId = uuid();
  await supabase.from('companies').insert({ id: companyId, name: 'Stella Lumen Pty Ltd', code: `DEMO-${companyId.slice(0,6).toUpperCase()}` });
  try { localStorage.setItem('rigel_demo_company', JSON.stringify({ id: companyId, name: 'Stella Lumen Pty Ltd' })); } catch {}
  try {
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .maybeSingle();
    try { localStorage.setItem('rigel_demo_prev_company_id', String(existingProfile?.company_id || '')); } catch {}
    await supabase
      .from('profiles')
      .update({ company_id: companyId })
      .eq('user_id', user.id);
    try {
      await supabase
        .from('user_roles')
        .upsert({ user_id: user.id, company_id: companyId, role: 'administrator' }, { onConflict: 'user_id,company_id' as any });
      await supabase
        .from('user_roles')
        .upsert({ user_id: user.id, company_id: companyId, role: 'accountant' }, { onConflict: 'user_id,company_id,role' as any });
    } catch {}
  } catch {}
  await ensureCoa(companyId);
  const bankCoaId = await getCoaId(companyId, '1100', { name: 'Bank - Current Account', type: 'asset' });
  const revenueCoaId = await getCoaId(companyId, '4000', { name: 'Sales Revenue', type: 'revenue' });
  const opexCoaId = await getCoaId(companyId, '5600', { name: 'Operating Expenses', type: 'expense' });
  const cogsCoaId = await getCoaId(companyId, '5000', { name: 'Cost of Sales', type: 'expense' });
  const loanCoaId = await getCoaId(companyId, '2200', { name: 'Bank Loan', type: 'liability' });
  const investAssetId = await getCoaId(companyId, '1400', { name: 'Investment Assets', type: 'asset' });
  const longInvestId = await getCoaId(companyId, '1920', { name: 'Long-term Investments', type: 'asset' });
  const interestIncomeId = await getCoaId(companyId, '4200', { name: 'Interest Income', type: 'revenue' });
  const dividendIncomeId = await getCoaId(companyId, '4205', { name: 'Dividend Income', type: 'revenue' });

  const { data: bankInsert } = await supabase
    .from('bank_accounts')
    .insert([
      { company_id: companyId, bank_name: 'Demo Bank 1', account_name: 'Main Account', account_number: `DEMO-${companyId.slice(0,6)}-001`, opening_balance: 50000, current_balance: 50000 },
      { company_id: companyId, bank_name: 'Demo Bank 2', account_name: 'Savings Account', account_number: `DEMO-${companyId.slice(0,6)}-002`, opening_balance: 25000, current_balance: 25000 },
      { company_id: companyId, bank_name: 'Demo Bank 3', account_name: 'Investment Account', account_number: `DEMO-${companyId.slice(0,6)}-003`, opening_balance: 100000, current_balance: 100000 },
      { company_id: companyId, bank_name: 'Demo Bank 4', account_name: 'Payroll Account', account_number: `DEMO-${companyId.slice(0,6)}-004`, opening_balance: 75000, current_balance: 75000 },
      { company_id: companyId, bank_name: 'Demo Bank 5', account_name: 'Reserve Account', account_number: `DEMO-${companyId.slice(0,6)}-005`, opening_balance: 150000, current_balance: 150000 },
    ])
    .select('id');
  const bankAccountIds: string[] = Array.isArray(bankInsert) ? bankInsert.map((b: any) => String(b.id)) : [];
  const bankAccountId = bankAccountIds[0] || null;

  const dates = Array.from({ length: 10 }).map((_, i) => dateInLastMonths(6));
  for (let i = 0; i < 10; i++) {
    const amtInc = randomAmount(800, 12000);
    await insertPostedTransaction(companyId, user.id, dates[i], 'Demo Sale', 'income', amtInc, bankCoaId, revenueCoaId, bankAccountId);
  }
  for (let i = 0; i < 10; i++) {
    const amtExp = randomAmount(500, 5000);
    const isCogs = i % 3 === 0;
    const expAcc = isCogs ? cogsCoaId : opexCoaId;
    await insertPostedTransaction(companyId, user.id, dates[i], isCogs ? 'Cost of Sales' : 'Operating Expense', 'expense', -amtExp, expAcc, bankCoaId, bankAccountId);
  }

  await supabase.from('fixed_assets').insert(
    Array.from({ length: 10 }).map((_, i) => ({
      company_id: companyId,
      description: ['Laptop','Office Furniture','Printer','Server','Monitor','Scanner','Projector','Desk','Chair','Phone'][i],
      cost: randomAmount(5000, 50000),
      purchase_date: new Date().toISOString().split('T')[0],
      useful_life_years: Math.floor(Math.random() * 5) + 3,
      status: 'active'
    }))
  );

  await insertPostedTransaction(companyId, user.id, new Date().toISOString().split('T')[0], 'Loan Drawdown', 'loan', 100000, bankCoaId, loanCoaId, bankAccountId);
  await insertPostedTransaction(companyId, user.id, new Date().toISOString().split('T')[0], 'Loan Repayment', 'loan', -5000, loanCoaId, bankCoaId, bankAccountId);

  try {
    await supabase.from('loans' as any).insert(
      Array.from({ length: 10 }).map(() => ({
        company_id: companyId,
        amount: randomAmount(10000, 200000),
        interest_rate: Math.round((Math.random() * (12 - 5) + 5) * 100) / 100,
        term_months: Math.floor(Math.random() * (60 - 12 + 1)) + 12,
        start_date: new Date().toISOString().slice(0,10)
      }))
    );
  } catch {}

  const { data: invAcct } = await supabase
    .from('investment_accounts' as any)
    .insert({ company_id: companyId, name: 'Demo Investment', currency: 'ZAR', broker_name: 'Demo Broker' })
    .select('id')
    .single();
  const invAccountId = (invAcct as any)?.id as string;
  await supabase.from('investment_positions' as any).insert({ account_id: invAccountId, symbol: `FD-${new Date().toISOString().slice(0,10)}`, instrument_type: 'fixed_deposit', quantity: 1, avg_cost: 20000, current_price: 20000, market_value: 20000, unrealized_gain: 0 });
  await supabase.from('investment_transactions' as any).insert({ account_id: invAccountId, type: 'buy', trade_date: new Date().toISOString().slice(0,10), symbol: `FD-${new Date().toISOString().slice(0,10)}`, quantity: 1, price: 20000, total_amount: 20000, fees: 0, notes: `Rate 6.50%, Term 12m` });
  await insertPostedTransaction(companyId, user.id, new Date().toISOString().slice(0,10), 'Dividend income', 'income', 900, bankCoaId, dividendIncomeId, bankAccountId);
  await insertPostedTransaction(companyId, user.id, new Date().toISOString().slice(0,10), 'Interest income', 'income', 650, longInvestId, interestIncomeId, null);

  // Sales (Invoices) - 10 records
  const customers = ['Alpha Pty', 'Beta CC', 'Gamma Ltd', 'Delta Inc', 'Epsilon SA', 'Zeta Group', 'Eta Holdings', 'Theta Enterprises', 'Iota BV', 'Kappa GmbH'];
  const salesRows = Array.from({ length: 10 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - Math.floor(Math.random() * 6)); const invDate = d.toISOString().slice(0,10);
    const due = new Date(d); due.setDate(due.getDate() + 30);
    return {
      company_id: companyId,
      customer_name: customers[i],
      invoice_number: `INV-${String(companyId).slice(0,4)}-${i + 1}`,
      total_amount: randomAmount(1200, 15000),
      status: i % 3 === 0 ? 'paid' : (i % 2 === 0 ? 'sent' : 'unpaid'),
      invoice_date: invDate,
      due_date: due.toISOString().slice(0,10)
    };
  });
  await supabase.from('invoices').insert(salesRows as any);

  // Suppliers
  const supplierNames = ['Paper & Co', 'OfficeMax', 'Travel SA', 'Catering Hub', 'Marketing Pro', 'Tech Repairs', 'Utilities Cape', 'Security Ltd', 'Cleaning Crew', 'Insurance ZA'];
  const supplierRows = supplierNames.map(name => ({
    company_id: companyId,
    name
  }));
  
  const { data: createdSuppliers } = await supabase.from('suppliers').insert(supplierRows).select('id, name');
  const supplierMap = new Map((createdSuppliers || []).map((s: any) => [s.name, s.id]));

  // Purchases (Bills) - 10 records
  const billsRows = Array.from({ length: 10 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - Math.floor(Math.random() * 6)); const billDate = d.toISOString().slice(0,10);
    const due = new Date(d); due.setDate(d.getDate() + 30);
    const sName = supplierNames[i];
    return {
      company_id: companyId,
      supplier_id: supplierMap.get(sName) || null,
      total_amount: randomAmount(500, 8000),
      status: i % 4 === 0 ? 'paid' : 'open',
      bill_date: billDate,
      due_date: due.toISOString().slice(0,10)
    };
  });
  await supabase.from('bills').insert(billsRows as any);

  // Purchase Orders - 10 records
  const poRows = Array.from({ length: 10 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - Math.floor(Math.random() * 6)); const poDate = d.toISOString().slice(0,10);
    const sName = supplierNames[i];
    return {
      company_id: companyId,
      supplier_id: supplierMap.get(sName) || null,
      po_number: `PO-${String(companyId).slice(0,4)}-${i + 1}`,
      total_amount: randomAmount(1000, 12000),
      status: i % 3 === 0 ? 'approved' : 'open',
      po_date: poDate
    };
  });
  await supabase.from('purchase_orders' as any).insert(poRows as any);
};

const deleteSupabaseDemoCompany = async (companyId: string) => {
  try { await supabase.from('ledger_entries').delete().eq('company_id', companyId); } catch {}
  try { await supabase.from('transaction_entries').delete().in('transaction_id', (await supabase.from('transactions').select('id').eq('company_id', companyId)).data?.map((r: any) => r.id) || []); } catch {}
  try { await supabase.from('transactions').delete().eq('company_id', companyId); } catch {}
  try { await supabase.from('fixed_assets').delete().eq('company_id', companyId); } catch {}
  try { await supabase.from('bank_accounts').delete().eq('company_id', companyId); } catch {}
  try { await supabase.from('investment_transactions' as any).delete().in('account_id', (await supabase.from('investment_accounts' as any).select('id').eq('company_id', companyId)).data?.map((r: any) => r.id) || []); } catch {}
  try { await supabase.from('investment_positions' as any).delete().in('account_id', (await supabase.from('investment_accounts' as any).select('id').eq('company_id', companyId)).data?.map((r: any) => r.id) || []); } catch {}
  try { await supabase.from('investment_accounts' as any).delete().eq('company_id', companyId); } catch {}
  try { await supabase.from('user_roles').delete().eq('company_id', companyId); } catch {}
  try { await supabase.from('chart_of_accounts').delete().eq('company_id', companyId); } catch {}
  try { await supabase.from('companies').delete().eq('id', companyId); } catch {}
};
export const getDemoTransactions = async () => {
  const backend = getDemoBackend();
  if (backend === 'supabase') {
    try {
      const cid = JSON.parse(String(localStorage.getItem('rigel_demo_company') || '{}'))?.id;
      if (!cid) return [];
      const { data } = await supabase
        .from('transactions')
        .select('id, description, transaction_date, transaction_type, total_amount, status')
        .eq('company_id', cid)
        .order('transaction_date', { ascending: false });
      return (data || []).map((t: any) => ({ id: t.id, type: t.transaction_type, description: t.description, amount: t.total_amount, transaction_date: t.transaction_date, status: t.status }));
    } catch { return []; }
  }
  try {
    const s = localStorage.getItem('rigel_demo_transactions');
    return s ? JSON.parse(s) : [];
  } catch { return []; }
};
export const getDemoTrialBalanceForPeriod = async (start: string, end: string) => {
  const backend = getDemoBackend();
  if (backend === 'supabase') {
    try {
      const cid = JSON.parse(String(localStorage.getItem('rigel_demo_company') || '{}'))?.id;
      if (!cid) return [];
      const startISO = new Date(start).toISOString();
      const endObj = new Date(end); endObj.setHours(23,59,59,999);
      const endISO = endObj.toISOString();
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('company_id', cid)
        .eq('is_active', true);
      const { data: txEntries } = await supabase
        .from('transaction_entries')
        .select(`transaction_id, account_id, debit, credit, transactions!inner (transaction_date, status, company_id)`)
        .eq('transactions.company_id', cid)
        .eq('transactions.status', 'posted')
        .gte('transactions.transaction_date', startISO)
        .lte('transactions.transaction_date', endISO);
      const { data: ledgerEntries } = await supabase
        .from('ledger_entries')
        .select('transaction_id, account_id, debit, credit, entry_date')
        .eq('company_id', cid)
        .gte('entry_date', startISO)
        .lte('entry_date', endISO);
      const rows: any[] = [];
      (accounts || []).forEach((acc: any) => {
        let sumDebit = 0; let sumCredit = 0;
        (txEntries || []).forEach((e: any) => { if (e.account_id === acc.id) { sumDebit += Number(e.debit || 0); sumCredit += Number(e.credit || 0); } });
        (ledgerEntries || []).forEach((e: any) => { if (e.account_id === acc.id) { sumDebit += Number(e.debit || 0); sumCredit += Number(e.credit || 0); } });
        const type = String(acc.account_type || '').toLowerCase();
        const naturalDebit = type === 'asset' || type === 'expense';
        const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);
        const shouldShow = Math.abs(balance) > 0.01;
        if (shouldShow) rows.push({ account_id: acc.id, account_code: acc.account_code, account_name: acc.account_name, account_type: acc.account_type, normal_balance: naturalDebit ? 'debit' : 'credit', total_debits: sumDebit, total_credits: sumCredit, balance });
      });
      return rows;
    } catch { return []; }
  }
  try {
    const s = localStorage.getItem('rigel_demo_trial_balance_period');
    return s ? JSON.parse(s) : [];
  } catch { return []; }
};
export const getDemoTrialBalanceAsOf = async (end: string) => {
  const backend = getDemoBackend();
  if (backend === 'supabase') {
    try {
      const cid = JSON.parse(String(localStorage.getItem('rigel_demo_company') || '{}'))?.id;
      if (!cid) return [];
      const endObj = new Date(end); endObj.setHours(23,59,59,999);
      const endISO = endObj.toISOString();
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('company_id', cid)
        .eq('is_active', true);
      const { data: ledgerEntries } = await supabase
        .from('ledger_entries')
        .select('account_id, debit, credit, entry_date')
        .eq('company_id', cid)
        .lte('entry_date', endISO);
      const rows: any[] = [];
      (accounts || []).forEach((acc: any) => {
        let sumDebit = 0; let sumCredit = 0;
        (ledgerEntries || []).forEach((e: any) => { if (e.account_id === acc.id) { sumDebit += Number(e.debit || 0); sumCredit += Number(e.credit || 0); } });
        const type = String(acc.account_type || '').toLowerCase();
        const naturalDebit = type === 'asset' || type === 'expense';
        const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);
        const shouldShow = Math.abs(balance) > 0.01;
        if (shouldShow) rows.push({ account_id: acc.id, account_code: acc.account_code, account_name: acc.account_name, account_type: acc.account_type, normal_balance: naturalDebit ? 'debit' : 'credit', total_debits: sumDebit, total_credits: sumCredit, balance });
      });
      return rows;
    } catch { return []; }
  }
  try {
    const s = localStorage.getItem('rigel_demo_trial_balance_asof');
    return s ? JSON.parse(s) : [];
  } catch { return []; }
};
