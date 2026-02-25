import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useMemo, useState } from "react";
import { supabase, hasSupabaseEnv } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type Employee = { id: string; first_name: string; last_name: string };
type PayRun = { id: string; period_start: string; period_end: string; status: string };
type AggregatedTax = { paye: number; uif_emp: number; uif_er: number; sdl_er: number };

export default function EmployeeTax() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState<string>("");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [taxByEmployee, setTaxByEmployee] = useState<Record<string, AggregatedTax>>({});
  const [paidStatus, setPaidStatus] = useState<"paid" | "pending">("pending");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openPayDlg, setOpenPayDlg] = useState<boolean>(false);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; account_name: string }>>([]);
  const [bankId, setBankId] = useState<string>("");
  const [showBankSelect, setShowBankSelect] = useState<boolean>(false);

  useEffect(() => {
    const loadCompany = async () => {
      if (!hasSupabaseEnv) { setCompanyId(""); return; }
      const { data: profile } = await supabase.from("profiles" as any).select("company_id").eq("user_id", user?.id).maybeSingle();
      if ((profile as any)?.company_id) setCompanyId((profile as any).company_id);
    };
    loadCompany();
  }, [user?.id]);

  useEffect(() => {
    const initPeriod = () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setPeriodStart(format(start, "yyyy-MM-dd"));
      setPeriodEnd(format(end, "yyyy-MM-dd"));
    };
    initPeriod();
  }, []);

  const loadData = async () => {
    if (!companyId || !periodStart || !periodEnd) return;
    setLoading(true);
    try {
      const { data: empRows } = await supabase.from("employees" as any).select("id,first_name,last_name").eq("company_id", companyId);
      const employeesList = (empRows || []) as any[];
      setEmployees(employeesList);
      setSelectedIds(new Set(employeesList.map((e: any) => e.id)));

      const { data: runs } = await supabase
        .from("pay_runs" as any)
        .select("id,period_start,period_end,status")
        .eq("company_id", companyId)
        .lte("period_start", periodEnd)
        .gte("period_end", periodStart);
      const runIds = (runs || []).map((r: any) => r.id);

      let agg: Record<string, AggregatedTax> = {};
      if (runIds.length > 0) {
        const { data: lines } = await supabase
          .from("pay_run_lines" as any)
          .select("employee_id,paye,uif_emp,uif_er,sdl_er")
          .in("pay_run_id", runIds);
        (lines || []).forEach((l: any) => {
          const cur = agg[l.employee_id] || { paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 };
          agg[l.employee_id] = { 
            paye: cur.paye + Number(l.paye || 0), 
            uif_emp: cur.uif_emp + Number(l.uif_emp || 0), 
            uif_er: cur.uif_er + Number(l.uif_er || 0),
            sdl_er: cur.sdl_er + Number(l.sdl_er || 0) 
          };
        });
      }
      setTaxByEmployee(agg);

      const { data: txs } = await supabase
        .from("transactions" as any)
        .select("id,description,transaction_date,status,transaction_type")
        .eq("company_id", companyId)
        .gte("transaction_date", periodStart)
        .lte("transaction_date", periodEnd)
        .in("transaction_type", ["liability","payment"]);
      const paid = (txs || []).some((t: any) => String(t.description || "").toLowerCase().includes("sars"));
      setPaidStatus(paid ? "paid" : "pending");

      const { data: banks } = await supabase
        .from("bank_accounts" as any)
        .select("id, account_name")
        .eq("company_id", companyId)
        .order("account_name");
      setBankAccounts((banks || []) as any);
      setBankId(((banks || [])[0] as any)?.id || "");
    } catch {
      toast({ title: "Error", description: "Failed to load employee tax", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [companyId, periodStart, periodEnd]);

  const rows = useMemo(() => {
    return employees.map(e => {
      const taxes = taxByEmployee[e.id] || { paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 };
      const withheld = taxes.paye > 0 ? "withheld" : "none";
      return {
        id: e.id,
        name: `${e.first_name} ${e.last_name}`,
        paye: taxes.paye,
        uif: taxes.uif_emp,
        uif_er: taxes.uif_er,
        sdl: taxes.sdl_er,
        withheld,
        paidToSARS: paidStatus
      };
    });
  }, [employees, taxByEmployee, paidStatus]);

  const totals = useMemo(() => {
    let paye = 0, uifTotal = 0, sdl = 0;
    rows.forEach(r => {
      if (selectedIds.has(r.id)) {
        paye += Number(r.paye || 0);
        uifTotal += Number(r.uif || 0) + Number(r.uif_er || 0);
        sdl += Number(r.sdl || 0);
      }
    });
    return { paye, uif_total: uifTotal, sdl };
  }, [rows, selectedIds]);

  const getEffectiveCompanyId = async (): Promise<string> => {
    let cid = String(companyId || '').trim();
    if (cid) return cid;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prof } = await supabase.from('profiles' as any).select('company_id').eq('user_id', user.id).maybeSingle();
      cid = String((prof as any)?.company_id || '').trim();
    }
    return cid;
  };

  const ensureAccountByCode = async (nm: string, tp: 'asset' | 'liability' | 'equity' | 'income' | 'expense', code: string) => {
    const cid = await getEffectiveCompanyId();
    const { data: found } = await supabase.from('chart_of_accounts' as any).select('id').eq('company_id', cid).eq('account_code', code).maybeSingle();
    if ((found as any)?.id) return (found as any).id as string;
    const { data } = await supabase.from('chart_of_accounts' as any).insert({ company_id: cid, account_code: code, account_name: nm, account_type: tp, is_active: true } as any).select('id').single();
    return (data as any).id as string;
  };

  const executePaySarsBulk = async () => {
    try {
      const cid = await getEffectiveCompanyId();
      if (!cid) throw new Error("Company ID missing");
      const bid = String(bankId || '').trim();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!bid || !uuidRegex.test(bid) || !bankAccounts.find(b => b.id === bid)) {
        toast({ title: "Bank Account Required", description: "Select a valid bank account.", variant: "destructive" });
        return;
      }
      const ref = `SARS-${periodStart}-${periodEnd}-BULK`;
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('company_id', cid)
        .eq('reference_number', ref)
        .maybeSingle();
      if (existingTx) { toast({ title: "Duplicate", description: "Bulk SARS payment already posted", variant: "destructive" }); return; }
      const payePayable = await ensureAccountByCode('PAYE (Tax Payable)', 'liability', '2315');
      const uifPayable = await ensureAccountByCode('UIF Payable', 'liability', '2210');
      const sdlPayable = await ensureAccountByCode('SDL Payable', 'liability', '2220');
      const bankLedger = await ensureAccountByCode('Bank', 'asset', '1000');
      const total = Number(totals.paye || 0) + Number(totals.uif_total || 0) + Number(totals.sdl || 0);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: tx } = await supabase
        .from('transactions')
        .insert({ company_id: cid, user_id: user.id, transaction_date: new Date().toISOString().slice(0,10), description: 'SARS payment (PAYE/UIF/SDL) bulk', total_amount: total, bank_account_id: bid, transaction_type: 'liability', status: 'pending', reference_number: ref } as any)
        .select()
        .single();
      const txId = (tx as any)?.id;
      const entries = [
        { transaction_id: txId, account_id: payePayable, debit: Number(totals.paye || 0), credit: 0, description: 'PAYE Payable', status: 'pending' },
        { transaction_id: txId, account_id: sdlPayable, debit: Number(totals.sdl || 0), credit: 0, description: 'SDL Payable', status: 'pending' },
        { transaction_id: txId, account_id: uifPayable, debit: Number(totals.uif_total || 0), credit: 0, description: 'UIF Payable', status: 'pending' },
        { transaction_id: txId, account_id: bankLedger, debit: 0, credit: total, description: 'SARS Payment', status: 'pending' },
      ];
      await supabase.from('transaction_entries').insert(entries as any);
      const ledgerRows = entries.map(e => ({ company_id: cid, transaction_id: txId, account_id: e.account_id, entry_date: new Date().toISOString().slice(0,10), description: e.description, debit: e.debit, credit: e.credit, is_reversed: false }));
      await supabase.from('ledger_entries').insert(ledgerRows as any);
      setOpenPayDlg(false);
      setPaidStatus("paid");
      toast({ title: "Paid", description: "Bulk SARS payment posted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to pay SARS", variant: "destructive" });
    }
  };

  return (
    <>
      <SEO title="Employee Tax | Rigel Business" description="View employee tax withheld and SARS payment status" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <Label>Period Start</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-44" />
              </div>
              <div className="space-y-1">
                <Label>Period End</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-44" />
              </div>
              <Button variant="outline" onClick={loadData}>Refresh</Button>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={paidStatus === "paid" ? "default" : "outline"} className="uppercase">
                {paidStatus === "paid" ? "Tax Paid to SARS" : "Payment Pending"}
              </Badge>
              <Button variant="outline" onClick={() => setOpenPayDlg(true)}>Pay SARS</Button>
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div className="text-muted-foreground">Selected</div>
                <div className="font-medium">{selectedIds.size} employees</div>
                <div className="hidden sm:block w-px h-4 bg-border" />
                <div className="flex items-center gap-3">
                  <div>PAYE: <span className="font-mono">{totals.paye.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span></div>
                  <div>UIF: <span className="font-mono">{totals.uif_total.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span></div>
                  <div>SDL: <span className="font-mono">{totals.sdl.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span></div>
                </div>
              </div>
              <div>
                <Button size="sm" onClick={() => setOpenPayDlg(true)}>Pay SARS</Button>
              </div>
            </div>
          </div>

          <div className="border rounded-md">
            <div className="px-4 py-3 text-sm font-semibold tracking-wide text-neutral-800">Employee Tax</div>
            <div className="border-t">
              {loading ? (
                <div className="p-6"><LoadingSpinner /></div>
              ) : (
                <Table className="text-[13px]">
                  <TableHeader className="bg-[#4b5563] text-white hover:bg-[#4b5563]">
                    <TableRow>
                      <TableHead className="text-xs text-white/90">Employee</TableHead>
                      <TableHead className="text-right text-xs text-white/90">PAYE Withheld</TableHead>
                      <TableHead className="text-right text-xs text-white/90">UIF (Employee)</TableHead>
                      <TableHead className="text-right text-xs text-white/90">UIF (Employer)</TableHead>
                      <TableHead className="text-right text-xs text-white/90">SDL (Employer)</TableHead>
                      <TableHead className="text-xs text-white/90">Status</TableHead>
                      <TableHead className="text-xs text-white/90">Tax Paid to SARS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.id} className="hover:bg-neutral-100 odd:bg-neutral-50 even:bg-white">
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={(v: boolean) => {
                              const next = new Set([...selectedIds]);
                              if (v) next.add(r.id); else next.delete(r.id);
                              setSelectedIds(next);
                            }} />
                            {r.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{r.paye.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{r.uif.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{Number(r.uif_er || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{r.sdl.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</TableCell>
                        <TableCell>
                          {r.withheld === "withheld" ? <Badge className="rounded-full bg-gray-200 text-gray-800">Withheld</Badge> : <Badge className="rounded-full bg-gray-200 text-gray-800">None</Badge>}
                        </TableCell>
                        <TableCell>
                          {r.paidToSARS === "paid" ? <Badge className="rounded-full bg-green-500 text-white">Paid</Badge> : <Badge className="rounded-full bg-amber-500 text-white">Pending</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">No payroll data for selected period</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
          <Dialog open={openPayDlg} onOpenChange={setOpenPayDlg}>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Pay SARS (Period Totals)</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">This payment includes PAYE, UIF and SDL totals for the selected employees and period.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PAYE Total</Label>
                    <div className="font-mono">{
                      totals.paye.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })
                    }</div>
                  </div>
                  <div>
                    <Label>UIF Total (Emp+Er)</Label>
                    <div className="font-mono">{
                      totals.uif_total.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })
                    }</div>
                  </div>
                  <div>
                    <Label>SDL Total</Label>
                    <div className="font-mono">{
                      totals.sdl.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })
                    }</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox checked={showBankSelect} onCheckedChange={(v: boolean) => setShowBankSelect(!!v)} />
                    <Label>Select Bank Account</Label>
                  </div>
                  {showBankSelect && (
                    <div>
                      <Select value={bankId} onValueChange={(v: any) => setBankId(String(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {bankAccounts.map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <div className="text-muted-foreground">Employees: {selectedIds.size}</div>
                  <div className="font-semibold">Grand Total: <span className="font-mono">{
                    (Number(totals.paye || 0) + Number(totals.uif_total || 0) + Number(totals.sdl || 0)).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })
                  }</span></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenPayDlg(false)}>Cancel</Button>
                <Button
                  onClick={executePaySarsBulk}
                  disabled={
                    (!showBankSelect) ||
                    (!bankId) ||
                    (totals.paye <= 0 && totals.uif_total <= 0 && totals.sdl <= 0)
                  }
                >
                  Pay SARS
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </>
  );
}
