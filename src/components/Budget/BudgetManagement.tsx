import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle, Download, Plus, Filter, Calculator, ArrowRight, PieChart, Activity, Scale, Wallet } from "lucide-react";
import { exportFinancialReportToPDF } from "@/lib/export-utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

interface Budget {
  id: string;
  account_id?: string | null;
  budget_name: string;
  budget_year: number;
  budget_month: number;
  category: string;
  budgeted_amount: number;
  actual_amount: number;
  variance: number;
  status: string;
  notes: string | null;
}
interface AccountOpt { id: string; account_name: string; account_type: string; normal_balance?: string }

export const BudgetManagement = () => {
  const { fiscalStartMonth, selectedFiscalYear, setSelectedFiscalYear, getCalendarYearForFiscalPeriod, loading: fiscalLoading } = useFiscalYear();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, isAccountant } = useRoles();
  const [activeTab, setActiveTab] = useState<string>('pl');
  const [actualMap, setActualMap] = useState<Record<string, number>>({});
  const [bsActualMap, setBsActualMap] = useState<Record<string, number>>({});
  const [cfActual, setCfActual] = useState<{ operating: number; investing: number; financing: number; net: number; opening: number; closing: number }>({ operating: 0, investing: 0, financing: 0, net: 0, opening: 0, closing: 0 });
  
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryValues, setEntryValues] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [formData, setFormData] = useState({
    budget_name: "",
    budget_year: currentYear.toString(),
    budget_month: currentMonth.toString(),
    account_id: "",
    category: "",
    budgeted_amount: "",
    notes: "",
  });

  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState(currentMonth.toString());

  useEffect(() => {
    if (!fiscalLoading && typeof selectedFiscalYear === 'number') {
      setSelectedYear(String(selectedFiscalYear));
    }
  }, [fiscalLoading, selectedFiscalYear]);

  const loadBudgets = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .maybeSingle();
      if (!profile) return;
      
      const calendarYear = getCalendarYearForFiscalPeriod(parseInt(selectedYear), parseInt(selectedMonth));
      
      const { data, error } = await supabase
        .from("budgets")
        .select("id, account_id, budget_name, budget_year, budget_month, category, budgeted_amount, actual_amount, variance, status, notes")
        .eq("company_id", profile.company_id)
        .eq("budget_year", calendarYear)
        .eq("budget_month", parseInt(selectedMonth))
        .order("budget_name");
      if (error) throw error;
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_name, account_type, normal_balance")
        .eq("company_id", profile.company_id)
        .eq("is_active", true);
      const acctAll = (accs || []).map((a: any) => ({ id: a.id, account_name: a.account_name, account_type: a.account_type, normal_balance: a.normal_balance }));
      setAccounts(acctAll);
      const start = `${calendarYear}-${String(selectedMonth).padStart(2,'0')}-01`;
      const y = calendarYear;
      const m = parseInt(selectedMonth);
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${calendarYear}-${String(selectedMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
      const { data: te, error: teError } = await supabase
        .from("transaction_entries")
        .select("account_id, debit, credit, status, transactions!inner(transaction_date, company_id, status)")
        .eq("transactions.company_id", profile.company_id)
        .eq("transactions.status", "posted")
        .gte("transactions.transaction_date", start)
        .lte("transactions.transaction_date", end)
        .eq("status", "approved");
      if (teError) throw teError;
      const actuals: Record<string, number> = {};
      (te || []).forEach((row: any) => {
        const accId = String(row.account_id || '');
        const acc = acctAll.find((a: any) => a.id === accId);
        const nb = String(acc?.normal_balance || '').toLowerCase();
        const val = nb === 'credit' ? Number(row.credit || 0) - Number(row.debit || 0) : Number(row.debit || 0) - Number(row.credit || 0);
        actuals[accId] = (actuals[accId] || 0) + val;
      });
      setActualMap(actuals);

      const { data: led } = await supabase
        .from('ledger_entries')
        .select('account_id, debit, credit, entry_date, company_id')
        .eq('company_id', profile.company_id)
        .lte('entry_date', end);
      const bsActuals: Record<string, number> = {};
      (led || []).forEach((row: any) => {
        const accId = String(row.account_id || '');
        const acc = acctAll.find((a: any) => a.id === accId);
        const nb = String(acc?.normal_balance || '').toLowerCase();
        const val = nb === 'credit' ? Number(row.credit || 0) - Number(row.debit || 0) : Number(row.debit || 0) - Number(row.credit || 0);
        bsActuals[accId] = (bsActuals[accId] || 0) + val;
      });
      setBsActualMap(bsActuals);

      try {
        const { data: cfData } = await supabase.rpc('generate_cash_flow', { _company_id: profile.company_id, _period_start: start, _period_end: end });
        if (cfData && cfData.length > 0) {
          const cf = cfData[0];
          setCfActual({
            operating: Number(cf.operating_activities || 0),
            investing: Number(cf.investing_activities || 0),
            financing: Number(cf.financing_activities || 0),
            net: Number(cf.net_cash_flow || 0),
            opening: Number(cf.opening_cash || 0),
            closing: Number(cf.closing_cash || 0),
          });
        } else {
          setCfActual({ operating: 0, investing: 0, financing: 0, net: 0, opening: 0, closing: 0 });
        }
      } catch {}
      const budgetsWithActuals = (data || []).map((budget: any) => {
        const actualAmount = actuals[String(budget.account_id || '')] || 0;
        const variance = Number(budget.budgeted_amount || 0) - actualAmount;
        return { ...budget, actual_amount: actualAmount, variance } as Budget;
      });
      setBudgets(budgetsWithActuals);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [user?.id, selectedYear, selectedMonth, toast]);

  function updateBudgetActuals() { return loadBudgets(); }

  useEffect(() => {
    loadBudgets();
    let channel: any;
    (async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).maybeSingle();
      const companyId = (profile as any)?.company_id || "";
      channel = supabase.channel('budgets-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets', filter: `company_id=eq.${companyId}` }, () => loadBudgets())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `company_id=eq.${companyId}` }, () => updateBudgetActuals())
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [selectedYear, selectedMonth, loadBudgets, user?.id]);


  const openDialog = (budget?: Budget) => {
    if (budget) {
      setEditingBudget(budget);
      setFormData({
        budget_name: budget.budget_name,
        budget_year: budget.budget_year.toString(),
        budget_month: budget.budget_month.toString(),
        account_id: budget.account_id ? String(budget.account_id) : "",
        category: budget.category,
        budgeted_amount: budget.budgeted_amount.toString(),
        notes: budget.notes || "",
      });
    } else {
      setEditingBudget(null);
      resetForm();
    }
    setDialogOpen(true);
  };

  const resetForm = () => {
    const calendarYear = getCalendarYearForFiscalPeriod(parseInt(selectedYear), parseInt(selectedMonth));
    setFormData({
      budget_name: "",
      budget_year: calendarYear.toString(),
      budget_month: selectedMonth,
      account_id: "",
      category: "",
      budgeted_amount: "",
      notes: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }
    try {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).single();
      if (!formData.account_id) {
        toast({ title: "Account required", description: "Please select an account for this budget.", variant: "destructive" });
        return;
      }
      if (editingBudget) {
        const { error } = await supabase.from("budgets").update({
            budget_name: formData.budget_name,
            budget_year: parseInt(formData.budget_year),
            budget_month: parseInt(formData.budget_month),
            account_id: formData.account_id || null,
            category: String(formData.account_id),
            budgeted_amount: parseFloat(formData.budgeted_amount),
            notes: formData.notes || null,
          }).eq("id", editingBudget.id).eq("company_id", profile!.company_id);
        if (error) throw error;
        toast({ title: "Success", description: "Budget updated successfully" });
      } else {
        const { data: existing } = await (supabase as any).from("budgets").select("id").eq("company_id", profile!.company_id).eq("budget_year", parseInt(formData.budget_year)).eq("budget_month", parseInt(formData.budget_month)).eq("account_id", formData.account_id);
        if ((existing || []).length > 0) {
          toast({ title: "Duplicate budget", description: "An entry for this account and period already exists.", variant: "destructive" });
          return;
        }
        const { error } = await supabase.from("budgets").insert({
          company_id: profile!.company_id,
          user_id: user!.id,
          budget_name: formData.budget_name || (accounts.find(a => a.id === formData.account_id)?.account_name || ""),
          budget_year: parseInt(formData.budget_year),
          budget_month: parseInt(formData.budget_month),
          account_id: formData.account_id || null,
          category: String(formData.account_id),
          budgeted_amount: parseFloat(formData.budgeted_amount),
          actual_amount: 0,
          variance: parseFloat(formData.budgeted_amount),
          notes: formData.notes || null,
          status: "active"
        });
        if (error) throw error;
        toast({ title: "Success", description: "Budget created successfully" });
      }
      setDialogOpen(false);
      setEditingBudget(null);
      resetForm();
      loadBudgets();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const totalBudgeted = budgets.reduce((sum, b) => sum + Number(b.budgeted_amount), 0);
  const totalActual = budgets.reduce((sum, b) => sum + Number(b.actual_amount), 0);
  const totalVariance = totalBudgeted - totalActual;
  const utilizationRate = totalBudgeted > 0 ? (totalActual / totalBudgeted) * 100 : 0;
  const formatCurrency = (value: number) => `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const budgetLookup = Object.fromEntries(budgets.map(b => [String(b.account_id || b.category), Number(b.budgeted_amount || 0)]));

  const upsertBudgetAmount = async (opts: { accountId?: string; category?: string; amount: number }) => {
    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user?.id).maybeSingle();
      if (!profile?.company_id) return;
      const calendarYear = getCalendarYearForFiscalPeriod(parseInt(selectedYear), parseInt(selectedMonth));
      const q: any = (supabase as any).from('budgets').select('id').eq('company_id', profile.company_id).eq('budget_year', calendarYear).eq('budget_month', parseInt(selectedMonth));
      if (opts.accountId) q.eq('account_id', opts.accountId); else q.is('account_id', null).eq('category', opts.category || '');
      const { data: existing } = await q;
      if ((existing || []).length > 0) {
        const id = (existing || [])[0].id as string;
        await supabase.from('budgets').update({ budgeted_amount: opts.amount }).eq('id', id);
      } else {
        await supabase.from('budgets').insert({
          company_id: profile.company_id,
          user_id: user!.id,
          budget_name: opts.accountId ? (accounts.find(a => a.id === opts.accountId)?.account_name || '') : (opts.category || ''),
          budget_year: calendarYear,
          budget_month: parseInt(selectedMonth),
          account_id: opts.accountId || null,
          category: opts.accountId ? String(opts.accountId) : String(opts.category || ''),
          budgeted_amount: opts.amount,
          actual_amount: 0,
          variance: opts.amount,
          status: 'active',
          notes: null,
        } as any);
      }
      loadBudgets();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const openBudgetEntry = () => {
    const initial: Record<string, number> = {};
    if (activeTab === 'pl') {
      accounts.filter(a => ['income','revenue','expense'].includes(String(a.account_type).toLowerCase())).forEach(a => { initial[a.id] = Number(budgetLookup[a.id] || 0); });
    } else if (activeTab === 'bs') {
      accounts.filter(a => ['asset','liability','equity'].includes(String(a.account_type).toLowerCase())).forEach(a => { initial[a.id] = Number(budgetLookup[a.id] || 0); });
    } else {
      ['operating','investing','financing','net'].forEach(k => { const key = `cashflow_${k}`; initial[key] = Number(budgetLookup[key] || 0); });
    }
    setEntryValues(initial);
    setEntryOpen(true);
  };

  const submitBudgetEntries = async () => {
    try {
      setSubmitting(true);
      const keys = Object.keys(entryValues);
      for (const key of keys) {
        const amt = Number(entryValues[key] || 0);
        if (!isFinite(amt)) continue;
        if (key.startsWith('cashflow_')) await upsertBudgetAmount({ category: key, amount: amt });
        else await upsertBudgetAmount({ accountId: key, amount: amt });
      }
      await loadBudgets();
      setEntryOpen(false);
      toast({ title: 'Success', description: 'Budget submitted' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  // --- NEW UI COMPONENTS ---

  const MetricCard = ({ title, value, icon: Icon, color, subtitle }: any) => {
    let bgClass = "", iconClass = "", textClass = "";
    switch (color) {
      case 'blue': bgClass = "from-blue-500/10 via-blue-500/5"; iconClass = "text-blue-600"; textClass = "text-blue-700"; break;
      case 'red': bgClass = "from-red-500/10 via-red-500/5"; iconClass = "text-red-600"; textClass = "text-red-700"; break;
      case 'emerald': bgClass = "from-emerald-500/10 via-emerald-500/5"; iconClass = "text-emerald-600"; textClass = "text-emerald-700"; break;
      case 'amber': bgClass = "from-amber-500/10 via-amber-500/5"; iconClass = "text-amber-600"; textClass = "text-amber-700"; break;
      case 'purple': bgClass = "from-purple-500/10 via-purple-500/5"; iconClass = "text-purple-600"; textClass = "text-purple-700"; break;
      default: bgClass = "from-gray-500/10 via-gray-500/5"; iconClass = "text-gray-600"; textClass = "text-gray-700";
    }
    return (
      <Card className={`border-none shadow-md bg-gradient-to-br ${bgClass} to-background`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className={`h-5 w-5 ${iconClass}`} />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${textClass}`}>{value}</div>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Budget Management</h1>
          <p className="text-muted-foreground mt-1">Track performance, manage allocations, and monitor variances.</p>
        </div>
        <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-xl border">
            <Select value={selectedYear} onValueChange={(val) => { setSelectedYear(val); const y = parseInt(val, 10); setSelectedFiscalYear(y); }}>
              <SelectTrigger className="h-9 w-[120px] bg-background border-none shadow-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[parseInt(selectedYear) - 1, parseInt(selectedYear), parseInt(selectedYear) + 1].map(year => (
                  <SelectItem key={year} value={year.toString()}>
                    {fiscalStartMonth === 1 ? year : `FY ${year}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="h-6 w-px bg-border" />
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-9 w-[140px] bg-background border-none shadow-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => {
                  const monthIndex = (fiscalStartMonth - 1 + i) % 12;
                  const monthNum = monthIndex + 1;
                  const date = new Date(2000, monthIndex, 1);
                  return (
                    <SelectItem key={monthNum} value={monthNum.toString()}>
                      {date.toLocaleString('default', { month: 'long' })}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Total Budgeted" value={formatCurrency(totalBudgeted)} icon={Wallet} color="blue" subtitle="For selected period" />
        <MetricCard title="Total Spent" value={formatCurrency(totalActual)} icon={TrendingDown} color="red" subtitle="Actual expenditure" />
        <MetricCard title="Variance" value={formatCurrency(Math.abs(totalVariance))} icon={totalVariance >= 0 ? TrendingUp : AlertCircle} color={totalVariance >= 0 ? "emerald" : "amber"} subtitle={totalVariance >= 0 ? "Under Budget" : "Over Budget"} />
        <MetricCard title="Utilization" value={`${utilizationRate.toFixed(1)}%`} icon={Activity} color="purple" subtitle="Budget used" />
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b pb-1">
          <TabsList className="bg-transparent p-0 h-auto gap-6">
            <TabsTrigger value="pl" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3 font-medium text-muted-foreground data-[state=active]:text-foreground transition-all">
              <Activity className="h-4 w-4 mr-2" /> Income Statement
            </TabsTrigger>
            <TabsTrigger value="bs" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3 font-medium text-muted-foreground data-[state=active]:text-foreground transition-all">
              <Scale className="h-4 w-4 mr-2" /> Balance Sheet
            </TabsTrigger>
            <TabsTrigger value="cf" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3 font-medium text-muted-foreground data-[state=active]:text-foreground transition-all">
              <PieChart className="h-4 w-4 mr-2" /> Cash Flow
            </TabsTrigger>
          </TabsList>
          <Button onClick={() => setActionsOpen(true)} className="shadow-md bg-primary hover:bg-primary/90 transition-all">
             Actions <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>

        {/* Tab Content */}
        {['pl', 'bs', 'cf'].map(tab => (
          <TabsContent key={tab} value={tab} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="border-none shadow-md overflow-hidden">
               <CardHeader className="bg-muted/10 border-b pb-4">
                 <div className="flex items-center justify-between">
                   <div className="space-y-1">
                     <CardTitle>{tab === 'pl' ? 'Income & Expenses' : tab === 'bs' ? 'Assets, Liabilities & Equity' : 'Cash Flow Activities'}</CardTitle>
                     <p className="text-sm text-muted-foreground">Detailed breakdown against budget</p>
                   </div>
                   <Button variant="outline" size="sm" onClick={openBudgetEntry}><Calculator className="h-4 w-4 mr-2" /> Quick Entry</Button>
                 </div>
               </CardHeader>
               <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="pl-6">Account / Category</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Budget</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead className="pr-6 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                       {tab === 'pl' && (
                          <>
                             <TableRow className="bg-muted/20 hover:bg-muted/20"><TableCell colSpan={5} className="pl-6 font-bold text-xs uppercase tracking-wider text-muted-foreground py-2">Income</TableCell></TableRow>
                             {renderRows(accounts.filter(a => ['income','revenue'].includes(String(a.account_type).toLowerCase())), budgetLookup, actualMap, formatCurrency)}
                             <TableRow className="bg-muted/20 hover:bg-muted/20"><TableCell colSpan={5} className="pl-6 font-bold text-xs uppercase tracking-wider text-muted-foreground py-2">Expenses</TableCell></TableRow>
                             {renderRows(accounts.filter(a => String(a.account_type).toLowerCase()==='expense'), budgetLookup, actualMap, formatCurrency)}
                          </>
                       )}
                       {tab === 'bs' && (
                          <>
                             <TableRow className="bg-muted/20 hover:bg-muted/20"><TableCell colSpan={5} className="pl-6 font-bold text-xs uppercase tracking-wider text-muted-foreground py-2">Assets</TableCell></TableRow>
                             {renderRows(accounts.filter(a => String(a.account_type).toLowerCase()==='asset'), budgetLookup, bsActualMap, formatCurrency)}
                             <TableRow className="bg-muted/20 hover:bg-muted/20"><TableCell colSpan={5} className="pl-6 font-bold text-xs uppercase tracking-wider text-muted-foreground py-2">Liabilities</TableCell></TableRow>
                             {renderRows(accounts.filter(a => String(a.account_type).toLowerCase()==='liability'), budgetLookup, bsActualMap, formatCurrency)}
                             <TableRow className="bg-muted/20 hover:bg-muted/20"><TableCell colSpan={5} className="pl-6 font-bold text-xs uppercase tracking-wider text-muted-foreground py-2">Equity</TableCell></TableRow>
                             {renderRows(accounts.filter(a => String(a.account_type).toLowerCase()==='equity'), budgetLookup, bsActualMap, formatCurrency)}
                          </>
                       )}
                       {tab === 'cf' && (
                          [
                            { key: 'operating', name: 'Operating Activities' },
                            { key: 'investing', name: 'Investing Activities' },
                            { key: 'financing', name: 'Financing Activities' },
                            { key: 'net', name: 'Net Cash Flow' },
                          ].map(row => {
                             const budgetKey = `cashflow_${row.key}`;
                             const budgetAmt = Number(budgetLookup[budgetKey] || 0);
                             const actualAmt = Number((cfActual as any)[row.key] || 0);
                             const variance = budgetAmt - actualAmt;
                             return (
                               <TableRow key={row.key} className="hover:bg-muted/50 transition-colors">
                                 <TableCell className="pl-6 font-medium">{row.name}</TableCell>
                                 <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(actualAmt)}</TableCell>
                                 <TableCell className="text-right font-mono font-medium">{formatCurrency(budgetAmt)}</TableCell>
                                 <TableCell className={`text-right font-mono font-bold ${variance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(variance)}</TableCell>
                                 <TableCell className="pr-6 text-center"><StatusBadge variance={variance} /></TableCell>
                               </TableRow>
                             )
                          })
                       )}
                    </TableBody>
                  </Table>
               </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Actions Sheet */}
      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetContent className="sm:max-w-[400px]">
          <SheetHeader className="mb-6">
            <SheetTitle>Budget Actions</SheetTitle>
            <SheetDescription>Manage your financial planning</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4">
            <Button variant="outline" className="w-full justify-start h-12" onClick={() => { setActionsOpen(false); openBudgetEntry(); }}>
              <Calculator className="mr-2 h-5 w-5 text-primary" />
              <div className="text-left"><div className="font-semibold">Quick Entry</div><div className="text-xs text-muted-foreground">Batch edit budget figures</div></div>
            </Button>
            <Button variant="outline" className="w-full justify-start h-12" onClick={() => { setActionsOpen(false); openDialog(); }}>
              <Plus className="mr-2 h-5 w-5 text-primary" />
              <div className="text-left"><div className="font-semibold">New Single Budget</div><div className="text-xs text-muted-foreground">Add individual line item</div></div>
            </Button>
            <div className="h-px bg-border my-2" />
            <Button variant="outline" className="w-full justify-start h-12" onClick={() => {
                 // Export Logic reused
                const periodLabel = `${selectedYear}-${String(selectedMonth).padStart(2,'0')}`;
                const lines: any[] = [];
                // ... reuse existing export logic logic ...
                if (activeTab === 'pl') {
                  lines.push({ account: 'INCOME', amount: 0, type: 'header' });
                  const inc = accounts.filter(a => ['income','revenue'].includes(String(a.account_type).toLowerCase()))
                    .map(a => ({ a, budget: Number(budgetLookup[a.id]||0), actual: Number(actualMap[a.id]||0) }))
                    .filter(x => Math.abs(x.budget) > 0.0001 || Math.abs(x.actual) > 0.0001);
                  let incTotal = 0; inc.forEach(x => { lines.push({ account: x.a.account_name, amount: x.budget, type: 'income' }); incTotal += x.budget; });
                  lines.push({ account: 'Total Income (Budget)', amount: incTotal, type: 'subtotal' });
                  lines.push({ account: '', amount: 0, type: 'spacer' });
                  lines.push({ account: 'EXPENSES', amount: 0, type: 'header' });
                  const exp = accounts.filter(a => String(a.account_type).toLowerCase()==='expense')
                    .map(a => ({ a, budget: Number(budgetLookup[a.id]||0), actual: Number(actualMap[a.id]||0) }))
                    .filter(x => Math.abs(x.budget) > 0.0001 || Math.abs(x.actual) > 0.0001);
                  let expTotal = 0; exp.forEach(x => { lines.push({ account: x.a.account_name, amount: x.budget, type: 'expense' }); expTotal += x.budget; });
                  lines.push({ account: 'Total Expenses (Budget)', amount: expTotal, type: 'subtotal' });
                  lines.push({ account: 'Net Profit (Budget)', amount: incTotal - expTotal, type: 'final' });
                } else if (activeTab === 'bs') {
                    // BS Export Logic
                   lines.push({ account: 'ASSETS', amount: 0, type: 'header' });
                   const assets = accounts.filter(a => String(a.account_type).toLowerCase()==='asset').map(a => ({ a, budget: Number(budgetLookup[a.id]||0) })).filter(x => Math.abs(x.budget) > 0.0001);
                   let assetTotal = 0; assets.forEach(x => { lines.push({ account: x.a.account_name, amount: x.budget, type: 'asset' }); assetTotal += x.budget; });
                   lines.push({ account: 'Total Assets', amount: assetTotal, type: 'subtotal' });
                }
                exportFinancialReportToPDF(lines, `Budget - ${activeTab.toUpperCase()}`, periodLabel, `budget_${activeTab}`);
                toast({ title: 'Exported', description: 'Budget exported to PDF' });
                setActionsOpen(false);
            }}>
              <Download className="mr-2 h-5 w-5 text-primary" />
              <div className="text-left"><div className="font-semibold">Export PDF</div><div className="text-xs text-muted-foreground">Download current view</div></div>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Budget Entry Dialog */}
      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader className="border-b pb-4">
            <DialogTitle>Quick Budget Entry</DialogTitle>
            <p className="text-sm text-muted-foreground">Adjust budget allocations for {selectedYear} - {months[parseInt(selectedMonth)-1]}</p>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2 mb-6 bg-muted/50 p-1 rounded-lg border w-fit">
               {[{id:'pl', l:'Income Statement'}, {id:'bs', l:'Balance Sheet'}, {id:'cf', l:'Cash Flow'}].map(m => (
                 <Button key={m.id} variant={activeTab === m.id ? 'secondary' : 'ghost'} size="sm" onClick={() => setActiveTab(m.id as any)} className="h-8">{m.l}</Button>
               ))}
            </div>
            {/* Reusing table logic for entry but cleaner */}
             <div className="space-y-6">
               {activeTab === 'pl' && (
                 <>
                   <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Income</h4>
                   <EntryTable rows={accounts.filter(a => ['income','revenue'].includes(String(a.account_type).toLowerCase()))} values={entryValues} actuals={actualMap} onChange={setEntryValues} format={formatCurrency} />
                   <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground pt-4">Expenses</h4>
                   <EntryTable rows={accounts.filter(a => String(a.account_type).toLowerCase()==='expense')} values={entryValues} actuals={actualMap} onChange={setEntryValues} format={formatCurrency} />
                 </>
               )}
               {activeTab === 'bs' && (
                 <>
                   <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Assets</h4>
                   <EntryTable rows={accounts.filter(a => String(a.account_type).toLowerCase()==='asset')} values={entryValues} actuals={bsActualMap} onChange={setEntryValues} format={formatCurrency} />
                   <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground pt-4">Liabilities</h4>
                   <EntryTable rows={accounts.filter(a => String(a.account_type).toLowerCase()==='liability')} values={entryValues} actuals={bsActualMap} onChange={setEntryValues} format={formatCurrency} />
                 </>
               )}
             </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t">
            <Button type="button" variant="ghost" onClick={() => setEntryOpen(false)}>Cancel</Button>
            <Button onClick={submitBudgetEntries} disabled={submitting} className="bg-primary">{submitting ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Create Dialog (Hidden/Standard) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
         <DialogContent>
            <DialogHeader><DialogTitle>{editingBudget ? "Edit Budget" : "New Budget Item"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
               {/* Existing Form Logic simplified visual */}
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Year</Label><Input value={formData.budget_year} readOnly className="bg-muted" /></div>
                  <div className="space-y-2"><Label>Month</Label><Input value={months[parseInt(formData.budget_month)-1]} readOnly className="bg-muted" /></div>
               </div>
               <div className="space-y-2">
                  <Label>Account</Label>
                  <div className="flex gap-2">
                     <Select value={formData.account_id} onValueChange={(v) => setFormData({...formData, account_id: v})}>
                        <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                        <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}</SelectContent>
                     </Select>
                     <Button type="button" variant="outline" onClick={() => setAccountSearchOpen(true)}><Filter className="h-4 w-4" /></Button>
                  </div>
               </div>
               <div className="space-y-2"><Label>Amount (R)</Label><Input type="number" step="0.01" value={formData.budgeted_amount} onChange={e => setFormData({...formData, budgeted_amount: e.target.value})} required /></div>
               <div className="space-y-2"><Label>Notes</Label><Textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} /></div>
               <DialogFooter><Button type="submit">Save Budget</Button></DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
       
      <CommandDialog open={accountSearchOpen} onOpenChange={setAccountSearchOpen}>
        <CommandInput placeholder="Search chart of accounts..." />
        <CommandList>
          <CommandEmpty>No accounts found</CommandEmpty>
          <CommandGroup heading="Accounts">
            {accounts.map(a => (
              <CommandItem key={a.id} onSelect={() => { setFormData(prev => ({ ...prev, account_id: a.id })); setAccountSearchOpen(false); }}>
                {a.account_name} <span className="ml-auto text-xs text-muted-foreground capitalize">{a.account_type}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

    </div>
  );
};

// Helper Components
const StatusBadge = ({ variance }: { variance: number }) => (
  <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variance >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
    {variance >= 0 ? 'On Track' : 'Attention'}
  </div>
);

const renderRows = (accounts: any[], budgetLookup: any, actualMap: any, format: any) => {
  return accounts.map(acc => {
    const budgetAmt = Number(budgetLookup[acc.id] || 0);
    const actualAmt = Number(actualMap[acc.id] || 0);
    if (Math.abs(budgetAmt) < 0.0001 && Math.abs(actualAmt) < 0.0001) return null;
    const variance = budgetAmt - actualAmt;
    return (
      <TableRow key={acc.id} className="hover:bg-muted/50 transition-colors border-b border-muted/40 last:border-0">
        <TableCell className="pl-6 font-medium">{acc.account_name}</TableCell>
        <TableCell className="text-right font-mono text-muted-foreground">{format(actualAmt)}</TableCell>
        <TableCell className="text-right font-mono font-medium">{format(budgetAmt)}</TableCell>
        <TableCell className={`text-right font-mono font-bold ${variance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{format(variance)}</TableCell>
        <TableCell className="pr-6 text-center"><StatusBadge variance={variance} /></TableCell>
      </TableRow>
    );
  });
};

const EntryTable = ({ rows, values, actuals, onChange, format }: any) => (
  <Table>
    <TableHeader>
       <TableRow>
         <TableHead>Account</TableHead>
         <TableHead className="text-right">Actual</TableHead>
         <TableHead className="text-right">Budget Allocation</TableHead>
         <TableHead className="text-right">Variance</TableHead>
       </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((acc: any) => {
         const actual = Number(actuals[acc.id] || 0);
         const budget = Number(values[acc.id] || 0);
         const variance = budget - actual;
         return (
           <TableRow key={acc.id}>
             <TableCell className="font-medium">{acc.account_name}</TableCell>
             <TableCell className="text-right font-mono text-muted-foreground">{format(actual)}</TableCell>
             <TableCell className="text-right">
               <Input 
                 type="number" 
                 className="text-right h-8 w-32 ml-auto font-mono" 
                 value={budget || ''} 
                 placeholder="0.00"
                 onChange={(e) => onChange((prev: any) => ({ ...prev, [acc.id]: parseFloat(e.target.value) || 0 }))} 
               />
             </TableCell>
             <TableCell className={`text-right font-mono ${variance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{format(variance)}</TableCell>
           </TableRow>
         );
      })}
    </TableBody>
  </Table>
);

