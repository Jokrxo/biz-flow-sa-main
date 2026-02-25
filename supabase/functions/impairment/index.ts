import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

type Action =
  | "preview_receivables"
  | "post_receivables"
  | "preview_assets"
  | "post_assets"
  | "preview_inventory"
  | "post_inventory"
  | "get_settings"
  | "update_settings"
  | "get_lock"
  | "set_lock";

interface RequestBody {
  action: Action;
  period_end: string;
  params?: unknown;
}

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

async function getCompanyId(client: ReturnType<typeof createClient>): Promise<string> {
  const { data: { user } } = await client.auth.getUser();
  if (!user?.id) throw new Error("Not authenticated");
  const { data, error } = await client
    .from("profiles")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.company_id) throw new Error("No company associated");
  return String(data.company_id);
}

async function getSettings(client: ReturnType<typeof createClient>, companyId: string) {
  const { data } = await client
    .from("impairment_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (data) return data;
  const defaults = {
    ecl_rate_0_30: 0.01,
    ecl_rate_31_60: 0.05,
    ecl_rate_61_90: 0.2,
    ecl_rate_90_plus: 0.5,
  };
  const { data: created } = await client
    .from("impairment_settings")
    .insert({ company_id: companyId, ...defaults })
    .select("*")
    .maybeSingle();
  return created ?? { company_id: companyId, ...defaults };
}

function pickAccount(
  list: { id: string; name: string; type: string; code: string }[],
  type: string,
  codes: string[],
  names: string[]
): string | null {
  const byType = list.filter((a) => a.type === type.toLowerCase());
  const byCode = byType.find((a) => codes.includes(a.code));
  if (byCode) return byCode.id;
  const byName = byType.find((a) => names.some((n) => a.name.includes(n)));
  return byName?.id || null;
}

async function ensureAccount(client: ReturnType<typeof createClient>, companyId: string, desired: { code: string; name: string; type: "asset" | "liability" | "expense" | "revenue" | "equity"; normal_balance?: "debit" | "credit" }) {
  const { data: found } = await client
    .from("chart_of_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("account_code", desired.code)
    .eq("account_type", desired.type)
    .eq("is_active", true)
    .limit(1);
  if (Array.isArray(found) && found[0]?.id) return String(found[0].id);
  const { data: created } = await client
    .from("chart_of_accounts")
    .insert({ company_id: companyId, account_code: desired.code, account_name: desired.name, account_type: desired.type, is_active: true, normal_balance: desired.normal_balance || null })
    .select("id")
    .single();
  return String((created as any)?.id || "");
}

async function getAccountsList(client: ReturnType<typeof createClient>, companyId: string) {
  const { data: accounts } = await client
    .from("chart_of_accounts")
    .select("id, account_name, account_type, account_code, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true);
  return (accounts || []).map((a: any) => ({
    id: String(a.id),
    name: String(a.account_name || "").toLowerCase(),
    type: String(a.account_type || "").toLowerCase(),
    code: String(a.account_code || ""),
  }));
}

async function previewReceivables(client: ReturnType<typeof createClient>, companyId: string, periodEnd: string) {
  const settings = await getSettings(client, companyId);
  const end = new Date(periodEnd);
  const { data: invoices } = await client
    .from("invoices")
    .select("id, invoice_number, invoice_date, due_date, total_amount, amount_paid, status")
    .eq("company_id", companyId);
  const list = (invoices || []).map((inv: any) => {
    const total = Number(inv.total_amount || 0);
    const paid = Number(inv.amount_paid || 0);
    const outstanding = Math.max(0, total - paid);
    const due = inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date);
    const days = Math.floor((end.getTime() - due.getTime()) / (1000 * 3600 * 24));
    const bucket = days <= 30 ? "0_30" : days <= 60 ? "31_60" : days <= 90 ? "61_90" : "90_plus";
    const rate =
      bucket === "0_30" ? Number(settings.ecl_rate_0_30 || 0.01) :
      bucket === "31_60" ? Number(settings.ecl_rate_31_60 || 0.05) :
      bucket === "61_90" ? Number(settings.ecl_rate_61_90 || 0.2) :
      Number(settings.ecl_rate_90_plus || 0.5);
    const loss = Number((outstanding * rate).toFixed(2));
    return { id: inv.id, invoice_number: inv.invoice_number, outstanding, days_overdue: Math.max(0, days), bucket, rate, expected_loss: loss };
  }).filter((r: any) => r.outstanding > 0);
  const totals = list.reduce((acc: any, r: any) => {
    acc.total_outstanding += r.outstanding;
    acc.total_expected_loss += r.expected_loss;
    acc[`sum_${r.bucket}`] = (acc[`sum_${r.bucket}`] || 0) + r.expected_loss;
    return acc;
  }, { total_outstanding: 0, total_expected_loss: 0 });
  return { settings, items: list, summary: totals };
}

async function postReceivables(client: ReturnType<typeof createClient>, companyId: string, userId: string, periodEnd: string, preview: any) {
  const { data: existingCalc } = await client
    .from("impairment_calculations")
    .select("id")
    .eq("company_id", companyId)
    .eq("calc_type", "receivables")
    .eq("period_end_date", periodEnd)
    .eq("status", "posted")
    .limit(1);
  if ((existingCalc || []).length > 0) throw new Error("Receivables impairment already posted for this period");
  const { data: lock } = await client
    .from("impairment_locks")
    .select("locked")
    .eq("company_id", companyId)
    .eq("module", "receivables")
    .eq("period_end_date", periodEnd)
    .maybeSingle();
  if (lock?.locked) throw new Error("Period is locked for receivables impairment");
  const total = Number(preview?.summary?.total_expected_loss || 0);
  if (!(total > 0)) return { posted: false, total: 0 };
  const accountsList = await getAccountsList(client, companyId);
  let expenseId = pickAccount(accountsList, "expense", ["6150"], ["bad debt", "impairment"]);
  let allowanceId = pickAccount(accountsList, "asset", ["1290"], ["allowance", "doubtful"]);
  if (!expenseId) expenseId = await ensureAccount(client, companyId, { code: "6150", name: "Bad Debt Expense", type: "expense" });
  if (!allowanceId) allowanceId = await ensureAccount(client, companyId, { code: "1290", name: "Allowance for Doubtful Accounts", type: "asset", normal_balance: "credit" });
  const { data: tx, error: txErr } = await client
    .from("transactions")
    .insert({
      company_id: companyId,
      user_id: userId,
      transaction_date: periodEnd,
      description: `Impairment - Receivables (${periodEnd})`,
      reference_number: `IMP-AR-${periodEnd}`,
      total_amount: total,
      transaction_type: "impairment_receivables",
      status: "pending",
    })
    .select("id")
    .single();
  if (txErr) throw txErr;
  const txId = (tx as any).id as string;
  const rows = [
    { transaction_id: txId, account_id: expenseId!, debit: total, credit: 0, description: "Receivables impairment", status: "approved" },
    { transaction_id: txId, account_id: allowanceId!, debit: 0, credit: total, description: "Allowance for doubtful accounts", status: "approved" },
  ];
  await client.from("transaction_entries").insert(rows as any);
  const ledgerRows = rows.map((r) => ({
    company_id: companyId,
    account_id: r.account_id,
    debit: r.debit,
    credit: r.credit,
    entry_date: periodEnd,
    is_reversed: false,
    transaction_id: txId,
    description: r.description,
  }));
  await client.from("ledger_entries").insert(ledgerRows as any);
  await client.from("transactions").update({ status: "posted" }).eq("id", txId);
  const { data: calc } = await client
    .from("impairment_calculations")
    .insert({
      company_id: companyId,
      calc_type: "receivables",
      period_end_date: periodEnd,
      params: {},
      result: preview,
      status: "posted",
      created_by: userId,
    })
    .select("id")
    .single();
  await client.from("impairment_postings").insert({
    calculation_id: (calc as any)?.id,
    company_id: companyId,
    transaction_id: txId,
    posted_by: userId,
  });
  return { posted: true, transaction_id: txId, total };
}

async function previewAssets(client: ReturnType<typeof createClient>, companyId: string, periodEnd: string, params: any) {
  const recMap: Record<string, number> = (params?.recoverables || []).reduce((acc: Record<string, number>, r: any) => {
    acc[String(r.asset_id)] = Number(r.recoverable_amount || 0);
    return acc;
  }, {});
  const { data: assets } = await client
    .from("fixed_assets")
    .select("id, description, cost, accumulated_depreciation, status")
    .eq("company_id", companyId)
    .neq("status", "disposed");
  const items = (assets || []).map((a: any) => {
    const carrying = Math.max(0, Number(a.cost || 0) - Number(a.accumulated_depreciation || 0));
    const recoverable = Number(recMap[a.id] || 0);
    const impairment = recoverable > 0 && recoverable < carrying ? Number((carrying - recoverable).toFixed(2)) : 0;
    return { asset_id: a.id, description: a.description, carrying_amount: carrying, recoverable_amount: recoverable, impairment_loss: impairment };
  }).filter((i: any) => i.impairment_loss > 0);
  const summary = {
    total_impairment: items.reduce((s: number, i: any) => s + i.impairment_loss, 0),
    count: items.length,
  };
  return { items, summary };
}

async function postAssets(client: ReturnType<typeof createClient>, companyId: string, userId: string, periodEnd: string, preview: any) {
  const { data: existingCalc } = await client
    .from("impairment_calculations")
    .select("id")
    .eq("company_id", companyId)
    .eq("calc_type", "assets")
    .eq("period_end_date", periodEnd)
    .eq("status", "posted")
    .limit(1);
  if ((existingCalc || []).length > 0) throw new Error("Asset impairment already posted for this period");
  const { data: lock } = await client
    .from("impairment_locks")
    .select("locked")
    .eq("company_id", companyId)
    .eq("module", "assets")
    .eq("period_end_date", periodEnd)
    .maybeSingle();
  if (lock?.locked) throw new Error("Period is locked for asset impairment");
  const total = Number(preview?.summary?.total_impairment || 0);
  if (!(total > 0)) return { posted: false, total: 0 };
  const accountsList = await getAccountsList(client, companyId);
  let expenseId = pickAccount(accountsList, "expense", ["6160"], ["impairment loss","assets"]);
  let contraId = pickAccount(accountsList, "asset", ["1550"], ["accumulated impairment","asset"]);
  if (!expenseId) expenseId = await ensureAccount(client, companyId, { code: "6160", name: "Impairment Loss - Assets", type: "expense" });
  if (!contraId) contraId = await ensureAccount(client, companyId, { code: "1550", name: "Accumulated Impairment - Assets", type: "asset", normal_balance: "credit" });
  const { data: tx, error: txErr } = await client
    .from("transactions")
    .insert({
      company_id: companyId,
      user_id: userId,
      transaction_date: periodEnd,
      description: `Impairment - Assets (${periodEnd})`,
      reference_number: `IMP-AS-${periodEnd}`,
      total_amount: total,
      transaction_type: "impairment_assets",
      status: "pending",
    })
    .select("id")
    .single();
  if (txErr) throw txErr;
  const txId = (tx as any).id as string;
  const rows = [
    { transaction_id: txId, account_id: expenseId!, debit: total, credit: 0, description: "Asset impairment", status: "approved" },
    { transaction_id: txId, account_id: contraId!, debit: 0, credit: total, description: "Accumulated impairment - assets", status: "approved" },
  ];
  await client.from("transaction_entries").insert(rows as any);
  const ledgerRows = rows.map((r) => ({
    company_id: companyId,
    account_id: r.account_id,
    debit: r.debit,
    credit: r.credit,
    entry_date: periodEnd,
    is_reversed: false,
    transaction_id: txId,
    description: r.description,
  }));
  await client.from("ledger_entries").insert(ledgerRows as any);
  await client.from("transactions").update({ status: "posted" }).eq("id", txId);
  const { data: calc } = await client
    .from("impairment_calculations")
    .insert({
      company_id: companyId,
      calc_type: "assets",
      period_end_date: periodEnd,
      params: {},
      result: preview,
      status: "posted",
      created_by: userId,
    })
    .select("id")
    .single();
  await client.from("impairment_postings").insert({
    calculation_id: (calc as any)?.id,
    company_id: companyId,
    transaction_id: txId,
    posted_by: userId,
  });
  return { posted: true, transaction_id: txId, total };
}

async function previewInventory(client: ReturnType<typeof createClient>, companyId: string, periodEnd: string, params: any) {
  const nrvMap: Record<string, number> = (params?.nrv || []).reduce((acc: Record<string, number>, r: any) => {
    acc[String(r.item_id)] = Number(r.nrv_per_unit || 0);
    return acc;
  }, {});
  const { data: items } = await client
    .from("items")
    .select("id, name, quantity_on_hand, cost_price")
    .eq("item_type", "product");
  const rows = (items || []).map((it: any) => {
    const qty = Number(it.quantity_on_hand || 0);
    const cost = Number(it.cost_price || 0);
    const carrying = qty * cost;
    const nrvUnit = Number(nrvMap[it.id] || cost);
    const nrvTotal = qty * nrvUnit;
    const writeDown = nrvTotal < carrying ? Number((carrying - nrvTotal).toFixed(2)) : 0;
    return { item_id: it.id, name: it.name, qty, cost_price: cost, carrying_amount: carrying, nrv_per_unit: nrvUnit, nrv_total: nrvTotal, write_down: writeDown };
  }).filter((r: any) => r.write_down > 0);
  const summary = {
    total_write_down: rows.reduce((s: number, r: any) => s + r.write_down, 0),
    count: rows.length,
  };
  return { items: rows, summary };
}

async function postInventory(client: ReturnType<typeof createClient>, companyId: string, userId: string, periodEnd: string, preview: any) {
  const { data: existingCalc } = await client
    .from("impairment_calculations")
    .select("id")
    .eq("company_id", companyId)
    .eq("calc_type", "inventory")
    .eq("period_end_date", periodEnd)
    .eq("status", "posted")
    .limit(1);
  if ((existingCalc || []).length > 0) throw new Error("Inventory write-down already posted for this period");
  const { data: lock } = await client
    .from("impairment_locks")
    .select("locked")
    .eq("company_id", companyId)
    .eq("module", "inventory")
    .eq("period_end_date", periodEnd)
    .maybeSingle();
  if (lock?.locked) throw new Error("Period is locked for inventory write-down");
  const total = Number(preview?.summary?.total_write_down || 0);
  if (!(total > 0)) return { posted: false, total: 0 };
  const accountsList = await getAccountsList(client, companyId);
  let expenseId = pickAccount(accountsList, "expense", ["5110"], ["write-down","inventory"]);
  let inventoryId = pickAccount(accountsList, "asset", ["1300"], ["inventory","stock"]);
  if (!expenseId) expenseId = await ensureAccount(client, companyId, { code: "5110", name: "Inventory Write-down Expense", type: "expense" });
  if (!inventoryId) inventoryId = await ensureAccount(client, companyId, { code: "1300", name: "Inventory", type: "asset" });
  const { data: tx, error: txErr } = await client
    .from("transactions")
    .insert({
      company_id: companyId,
      user_id: userId,
      transaction_date: periodEnd,
      description: `Inventory Write-down (${periodEnd})`,
      reference_number: `IMP-INV-${periodEnd}`,
      total_amount: total,
      transaction_type: "impairment_inventory",
      status: "pending",
    })
    .select("id")
    .single();
  if (txErr) throw txErr;
  const txId = (tx as any).id as string;
  const rows = [
    { transaction_id: txId, account_id: expenseId!, debit: total, credit: 0, description: "Inventory write-down", status: "approved" },
    { transaction_id: txId, account_id: inventoryId!, debit: 0, credit: total, description: "Reduce inventory to NRV", status: "approved" },
  ];
  await client.from("transaction_entries").insert(rows as any);
  const ledgerRows = rows.map((r) => ({
    company_id: companyId,
    account_id: r.account_id,
    debit: r.debit,
    credit: r.credit,
    entry_date: periodEnd,
    is_reversed: false,
    transaction_id: txId,
    description: r.description,
  }));
  await client.from("ledger_entries").insert(ledgerRows as any);
  await client.from("transactions").update({ status: "posted" }).eq("id", txId);
  const { data: calc } = await client
    .from("impairment_calculations")
    .insert({
      company_id: companyId,
      calc_type: "inventory",
      period_end_date: periodEnd,
      params: {},
      result: preview,
      status: "posted",
      created_by: userId,
    })
    .select("id")
    .single();
  await client.from("impairment_postings").insert({
    calculation_id: (calc as any)?.id,
    company_id: companyId,
    transaction_id: txId,
    posted_by: userId,
  });
  return { posted: true, transaction_id: txId, total };
}

Deno.serve(async (req) => {
  try {
    const client = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: req.headers } });
    const body = (await req.json()) as RequestBody;
    const periodEnd = body.period_end;
    if (!periodEnd) return jsonResponse({ error: "period_end is required" }, 400);
    const companyId = await getCompanyId(client);
    const { data: { user } } = await client.auth.getUser();
    const userId = String(user?.id || "");
    switch (body.action) {
      case "get_settings": {
        const settings = await getSettings(client, companyId);
        return jsonResponse(settings);
      }
      case "get_lock": {
        const module = (body.params as any)?.module as string;
        const { data } = await client
          .from("impairment_locks")
          .select("*")
          .eq("company_id", companyId)
          .eq("module", module)
          .eq("period_end_date", periodEnd)
          .maybeSingle();
        return jsonResponse(data || null);
      }
      case "set_lock": {
        const module = (body.params as any)?.module as string;
        const locked = Boolean((body.params as any)?.locked ?? true);
        const { data: existing } = await client
          .from("impairment_locks")
          .select("id")
          .eq("company_id", companyId)
          .eq("module", module)
          .eq("period_end_date", periodEnd)
          .maybeSingle();
        if (existing?.id) {
          const { data } = await client
            .from("impairment_locks")
            .update({ locked })
            .eq("id", existing.id)
            .select("*")
            .single();
          return jsonResponse(data);
        } else {
          const { data } = await client
            .from("impairment_locks")
            .insert({ company_id: companyId, module, period_end_date: periodEnd, locked })
            .select("*")
            .single();
          return jsonResponse(data);
        }
      }
      case "update_settings": {
        const { ecl_rate_0_30, ecl_rate_31_60, ecl_rate_61_90, ecl_rate_90_plus } = body.params as any || {};
        const { data: existing } = await client
          .from("impairment_settings")
          .select("id")
          .eq("company_id", companyId)
          .maybeSingle();
        if (existing?.id) {
          const { data } = await client
            .from("impairment_settings")
            .update({
              ecl_rate_0_30,
              ecl_rate_31_60,
              ecl_rate_61_90,
              ecl_rate_90_plus,
            })
            .eq("id", existing.id)
            .select("*")
            .single();
          return jsonResponse(data);
        } else {
          const { data } = await client
            .from("impairment_settings")
            .insert({
              company_id: companyId,
              ecl_rate_0_30,
              ecl_rate_31_60,
              ecl_rate_61_90,
              ecl_rate_90_plus,
            })
            .select("*")
            .single();
          return jsonResponse(data);
        }
      }
      case "preview_receivables": {
        const preview = await previewReceivables(client, companyId, periodEnd);
        return jsonResponse(preview);
      }
      case "post_receivables": {
        const preview = await previewReceivables(client, companyId, periodEnd);
        const result = await postReceivables(client, companyId, userId, periodEnd, preview);
        return jsonResponse(result);
      }
      case "preview_assets": {
        const preview = await previewAssets(client, companyId, periodEnd, body.params);
        return jsonResponse(preview);
      }
      case "post_assets": {
        const preview = await previewAssets(client, companyId, periodEnd, body.params);
        const result = await postAssets(client, companyId, userId, periodEnd, preview);
        return jsonResponse(result);
      }
      case "preview_inventory": {
        const preview = await previewInventory(client, companyId, periodEnd, body.params);
        return jsonResponse(preview);
      }
      case "post_inventory": {
        const preview = await previewInventory(client, companyId, periodEnd, body.params);
        const result = await postInventory(client, companyId, userId, periodEnd, preview);
        return jsonResponse(result);
      }
      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return jsonResponse({ error: e?.message || String(e) }, 500);
  }
});
