import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function CorporateTaxPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const { selectedFiscalYear, setSelectedFiscalYear, getFiscalYearDates, lockFiscalYear } = useFiscalYear();
  const [years, setYears] = useState<number[]>([]);
  const [status, setStatus] = useState<string>("open");
  const [loading, setLoading] = useState<boolean>(false);
  const [comp, setComp] = useState<any>(null);
  const [citRateSetting, setCitRateSetting] = useState<number>(27);
  const [adjustments, setAdjustments] = useState<Array<{ id: string; description: string; type: 'add' | 'deduct'; amount: number }>>([]);
  const [newAdj, setNewAdj] = useState<{ description: string; type: 'add' | 'deduct'; amount: string }>({ description: "", type: 'add', amount: "" });
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [citRateInput, setCitRateInput] = useState<string>("27");
  const [fyStartInput, setFyStartInput] = useState<string>("");
  const [fyEndInput, setFyEndInput] = useState<string>("");
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; code: string; type: string }>>([]);
  const [incomeTaxExpenseId, setIncomeTaxExpenseId] = useState<string>("");
  const [currentTaxPayableId, setCurrentTaxPayableId] = useState<string>("");
  const [provisionalTaxPaidId, setProvisionalTaxPaidId] = useState<string>("");
  const [deferredTaxLiabilityId, setDeferredTaxLiabilityId] = useState<string>("");

  useEffect(() => {
    const loadCompany = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    };
    loadCompany();
  }, []);

  useEffect(() => {
    const loadCitRate = async () => {
      if (!companyId) return;
      const { data: app } = await supabase
        .from('app_settings' as any)
        .select('*' as any)
        .eq('company_id', companyId)
        .maybeSingle();
      const rate = Number((app as any)?.corporate_tax_rate || 27);
      setCitRateSetting(rate > 0 ? rate : 27);
      setCitRateInput(String(rate > 0 ? rate : 27));
      try {
        const raw = (app as any)?.corporate_tax_settings_json;
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed) {
          setFyStartInput(String(parsed.fy_start || ""));
          setFyEndInput(String(parsed.fy_end || ""));
          setIncomeTaxExpenseId(String(parsed.account_mappings?.income_tax_expense_account_id || ""));
          setCurrentTaxPayableId(String(parsed.account_mappings?.current_tax_payable_account_id || ""));
          setProvisionalTaxPaidId(String(parsed.account_mappings?.provisional_tax_paid_account_id || ""));
          setDeferredTaxLiabilityId(String(parsed.account_mappings?.deferred_tax_liability_account_id || ""));
        }
      } catch {}
    };
    loadCitRate();
  }, [companyId]);

  useEffect(() => {
    const loadAccounts = async () => {
      if (!companyId) return;
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, account_name, account_code, account_type')
        .eq('company_id', companyId);
      const list = (data || []).map((a: any) => ({
        id: String(a.id),
        name: String(a.account_name || ''),
        code: String(a.account_code || ''),
        type: String(a.account_type || '').toLowerCase()
      }));
      setAccounts(list);
    };
    loadAccounts();
  }, [companyId]);

  useEffect(() => {
    const fy = selectedFiscalYear || new Date().getFullYear();
    setYears([fy - 2, fy - 1, fy, fy + 1]);
    setStatus(lockFiscalYear ? "locked" : "open");
  }, [selectedFiscalYear, lockFiscalYear]);

  const computeAccountingFromTB = async (periodStart: string, periodEnd: string) => {
    const { data: entries } = await supabase
      .from('transaction_entries')
      .select(`debit, credit, account_id, chart_of_accounts!inner (account_type, account_name, account_code), transactions!inner (transaction_date, status, company_id)`)
      .gte('transactions.transaction_date', periodStart)
      .lte('transactions.transaction_date', periodEnd)
      .eq('transactions.status', 'posted')
      .eq('transactions.company_id', companyId) as any;
    const inPeriod = (d: string) => new Date(d) >= new Date(periodStart) && new Date(d) <= new Date(periodEnd);
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalOpex = 0;
    (entries || []).forEach((e: any) => {
      if (String(e.transactions?.company_id || '') !== String(companyId)) return;
      const dateStr = String(e.transactions?.transaction_date || '');
      if (!inPeriod(dateStr)) return;
      const type = String(e.chart_of_accounts?.account_type || '').toLowerCase();
      const name = String(e.chart_of_accounts?.account_name || '').toLowerCase();
      const code = String(e.chart_of_accounts?.account_code || '');
      const debit = Number(e.debit || 0);
      const credit = Number(e.credit || 0);
      if (type === 'income' || type === 'revenue') {
        totalRevenue += (credit - debit);
      } else if (type === 'expense') {
        const isCogs = code.startsWith('50') || name.includes('cost of');
        if (isCogs) totalCOGS += (debit - credit);
        else totalOpex += (debit - credit);
      }
    });
    const netProfit = totalRevenue - totalCOGS - totalOpex;
    return { totalRevenue, totalCOGS, totalOpex, netProfit };
  };

  useEffect(() => {
    const loadComputation = async () => {
      if (!companyId || !selectedFiscalYear) return;
      setLoading(true);
      const { startStr, endStr } = getFiscalYearDates(selectedFiscalYear);
      const { netProfit } = await computeAccountingFromTB(startStr, endStr);
      const addTotal = adjustments.filter(a => a.type === 'add').reduce((s, a) => s + Number(a.amount || 0), 0);
      const deductTotal = adjustments.filter(a => a.type === 'deduct').reduce((s, a) => s + Number(a.amount || 0), 0);
      const taxableIncome = netProfit + addTotal - deductTotal;
      const citRate = Number(citRateSetting || 27);
      const corporateTax = Math.max(0, taxableIncome) * (citRate / 100);
      const provisionalPaid = 0;
      const taxPayable = corporateTax - provisionalPaid;
      setComp({
        accounting_profit: netProfit,
        add_backs: { non_deductible: addTotal, other: 0, total: addTotal },
        deductions: { capital_allowances: deductTotal, assessed_losses: 0, total: deductTotal },
        taxable_income: taxableIncome,
        cit_rate: citRate,
        corporate_tax: corporateTax,
        provisional_tax_paid: provisionalPaid,
        tax_payable: taxPayable
      });
      setLoading(false);
    };
    loadComputation();
  }, [companyId, selectedFiscalYear, adjustments, citRateSetting]);

  const lockPeriod = async () => {
    if (!companyId || !selectedFiscalYear) return;
    try {
      await supabase
        .from('app_settings')
        .update({ fiscal_lock_year: true, fiscal_default_year: selectedFiscalYear })
        .eq('company_id', companyId);
      setStatus('locked');
    } catch {}
  };

  const addAdjustment = async () => {
    if (!newAdj.description || !newAdj.amount) return;
    const id = `${Date.now()}`;
    const adj = { id, description: newAdj.description, type: newAdj.type, amount: Number(newAdj.amount) };
    setAdjustments(prev => [...prev, adj]);
    setNewAdj({ description: "", type: 'add', amount: "" });
  };

  const removeAdjustment = async (id: string) => {
    setAdjustments(prev => prev.filter(a => a.id !== id));
  };

  const saveTaxSettings = async () => {
    if (!companyId) return;
    const rateNum = Number(citRateInput || 0);
    if (!incomeTaxExpenseId || !currentTaxPayableId || !provisionalTaxPaidId || !deferredTaxLiabilityId) return;
    const ids = [incomeTaxExpenseId, currentTaxPayableId, provisionalTaxPaidId, deferredTaxLiabilityId];
    const unique = new Set(ids);
    if (unique.size !== ids.length) return;
    if (!fyStartInput || !fyEndInput) return;
    if (new Date(fyStartInput) >= new Date(fyEndInput)) return;
    try {
      await supabase
        .from('app_settings' as any)
        .update({
          corporate_tax_rate: rateNum,
          corporate_tax_settings_json: JSON.stringify({
            tax_rate: rateNum,
            fy_start: fyStartInput,
            fy_end: fyEndInput,
            account_mappings: {
              income_tax_expense_account_id: incomeTaxExpenseId,
              current_tax_payable_account_id: currentTaxPayableId,
              provisional_tax_paid_account_id: provisionalTaxPaidId,
              deferred_tax_liability_account_id: deferredTaxLiabilityId
            }
          })
        } as any)
        .eq('company_id', companyId);
      setCitRateSetting(rateNum > 0 ? rateNum : 27);
      setSettingsOpen(false);
    } catch {}
  };

  return (
    <>
      <SEO title="Corporate Tax | Rigel Business" description="Manage corporate income tax computations, returns, and submissions" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Label>Tax Year</Label>
              <Select value={String(selectedFiscalYear || "")} onValueChange={(v) => setSelectedFiscalYear(Number(v))}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="uppercase">{status}</Badge>
              <Button variant="outline" onClick={lockPeriod}>Lock Year</Button>
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>Settings</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-9">
              <div className="border rounded-md">
                <div className="px-4 py-3 text-sm font-semibold tracking-wide">CORPORATE TAX COMPUTATION</div>
                <div className="border-t">
                  <div className="px-4 py-2 flex justify-between">
                    <span>Accounting Profit</span>
                    <span className={`font-mono ${Number(comp?.accounting_profit || 0) < 0 ? 'text-red-600' : ''}`}>
                      {Number(comp?.accounting_profit || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-2 text-xs text-muted-foreground">Add:</div>
                  <div className="px-4 py-2 flex justify-between bg-muted/20">
                    <span>Non-deductible expenses</span>
                    <span className={`font-mono ${Number(comp?.add_backs?.non_deductible || 0) < 0 ? 'text-red-600' : ''}`}>
                      {Number(comp?.add_backs?.non_deductible || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-2 flex justify-between">
                    <span>Other add-backs</span>
                    <span className={`font-mono ${Number(comp?.add_backs?.other || 0) < 0 ? 'text-red-600' : ''}`}>
                      {Number(comp?.add_backs?.other || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-2 flex justify-between border-t">
                    <span className="font-medium">Total Add-backs</span>
                    <span className="font-mono font-medium">
                      {Number(comp?.add_backs?.total || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-2 text-xs text-muted-foreground">Less:</div>
                  <div className="px-4 py-2 flex justify-between bg-muted/20">
                    <span>Capital allowances</span>
                    <span className={`font-mono ${Number(comp?.deductions?.capital_allowances || 0) < 0 ? 'text-red-600' : ''}`}>
                      {Number(comp?.deductions?.capital_allowances || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-2 flex justify-between">
                    <span>Assessed losses</span>
                    <span className={`font-mono ${Number(comp?.deductions?.assessed_losses || 0) < 0 ? 'text-red-600' : ''}`}>
                      {Number(comp?.deductions?.assessed_losses || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-2 flex justify-between border-t">
                    <span className="font-medium">Total Deductions</span>
                    <span className="font-mono font-medium">
                      {Number(comp?.deductions?.total || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-2 flex justify-between border-t">
                    <span className="font-semibold">Taxable Income</span>
                    <span className={`font-mono font-semibold ${Number(comp?.taxable_income || 0) < 0 ? 'text-red-600' : ''}`}>
                      {Number(comp?.taxable_income || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-2 flex justify-between">
                    <span>Corporate Tax @ {Number(comp?.cit_rate || 27)}%</span>
                    <span className="font-mono">
                      {Number(comp?.corporate_tax || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-2 flex justify-between">
                    <span>Less: Provisional Tax Paid</span>
                    <span className="font-mono">
                      {Number(comp?.provisional_tax_paid || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between border-t bg-emerald-50">
                    <span className="font-semibold">Tax Payable / (Refund)</span>
                    <span className={`font-mono font-semibold ${Number(comp?.tax_payable || 0) < 0 ? 'text-red-600' : ''}`}>
                      {Number(comp?.tax_payable || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-3">
              <div className="border rounded-md bg-white shadow-sm">
                <div className="px-4 py-3 text-sm font-semibold tracking-wide border-b">
                  Adjustments
                </div>
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-700 border-b border-slate-800">
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="text-xs font-semibold text-white h-8 min-w-[140px] border-r border-slate-600 pl-3">
                          Description
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-white h-8 min-w-[80px] border-r border-slate-600">
                          Type
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[120px] border-r border-slate-600">
                          Amount
                        </TableHead>
                        <TableHead className="text-xs font-semibold text-white h-8 min-w-[110px] pr-3">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustments.map(a => (
                        <TableRow
                          key={a.id}
                          className="h-8 border-b border-border/40 hover:bg-muted/40"
                        >
                          <TableCell className="py-1 text-xs pl-3">
                            {a.description}
                          </TableCell>
                          <TableCell className="py-1 text-xs capitalize">
                            {a.type}
                          </TableCell>
                          <TableCell
                            className={`py-1 text-xs text-right font-mono ${
                              Number(a.amount) < 0 ? "text-red-600" : ""
                            }`}
                          >
                            {Number(a.amount).toLocaleString("en-ZA", {
                              style: "currency",
                              currency: "ZAR",
                            })}
                          </TableCell>
                          <TableCell className="py-1 text-right pr-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => removeAdjustment(a.id)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="h-9 border-t border-border/40 bg-muted/10">
                        <TableCell className="pl-3">
                          <Input
                            placeholder="Description"
                            value={newAdj.description}
                            onChange={(e) =>
                              setNewAdj((prev) => ({
                                ...prev,
                                description: e.target.value,
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={newAdj.type}
                            onValueChange={(v: any) =>
                              setNewAdj((prev) => ({ ...prev, type: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="add">Add</SelectItem>
                              <SelectItem value="deduct">Deduct</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="text-right"
                            type="number"
                            step="0.01"
                            value={newAdj.amount}
                            onChange={(e) =>
                              setNewAdj((prev) => ({
                                ...prev,
                                amount: e.target.value,
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell className="pr-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-3 text-xs"
                            onClick={addAdjustment}
                          >
                            + Add Adjustment
                          </Button>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
          {loading && (
            <div className="text-sm text-muted-foreground">Loading computation…</div>
          )}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Corporate Tax Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="text-sm font-semibold tracking-wide">General</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Corporate Income Tax Rate (%)</Label>
                      <Input type="number" min="0" step="0.1" value={citRateInput} onChange={(e) => setCitRateInput(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Financial Year Start</Label>
                      <Input type="date" value={fyStartInput} onChange={(e) => setFyStartInput(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Financial Year End</Label>
                      <Input type="date" value={fyEndInput} onChange={(e) => setFyEndInput(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold tracking-wide">Account Mapping</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Income Tax Expense Account</Label>
                      <Select value={incomeTaxExpenseId} onValueChange={setIncomeTaxExpenseId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.filter(a => a.type === 'expense').map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Current Tax Payable Account</Label>
                      <Select value={currentTaxPayableId} onValueChange={setCurrentTaxPayableId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.filter(a => a.type === 'liability').map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Provisional Tax Paid Account</Label>
                      <Select value={provisionalTaxPaidId} onValueChange={setProvisionalTaxPaidId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.filter(a => a.type === 'asset').map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Deferred Tax Liability Account</Label>
                      <Select value={deferredTaxLiabilityId} onValueChange={setDeferredTaxLiabilityId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.filter(a => a.type === 'liability').map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
                  <Button onClick={saveTaxSettings} disabled={
                    !incomeTaxExpenseId || !currentTaxPayableId || !provisionalTaxPaidId || !deferredTaxLiabilityId ||
                    new Date(fyStartInput) >= new Date(fyEndInput) ||
                    new Set([incomeTaxExpenseId, currentTaxPayableId, provisionalTaxPaidId, deferredTaxLiabilityId]).size !== 4
                  }>Save Settings</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </>
  );
}
