import { useEffect, useState, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/ui/count-up";
import { SagePieChart } from "./SagePieChart";
import { 
  TrendingUp, 
  TrendingDown, 
  Receipt, 
  Calendar,
  FileText,
  CreditCard,
  Building2,
  Briefcase,
  Settings,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Filter,
  MoreHorizontal,
  Activity,
  Wifi,
  Server,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, LabelList } from "recharts";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/useAuth";
import { DashboardCalendar } from "./DashboardCalendar";
import { FinancialHealthInsight } from "./FinancialHealthInsight";
import { ARUnpaidGraph } from "./ARUnpaidGraph";
import { BalanceSheetComposition } from "./BalanceSheetComposition";
import { PurchaseTrendGraph } from "./PurchaseTrendGraph";
import { IncomeExpenseGraph } from "./IncomeExpenseGraph";
import { NetProfitTrendGraph } from "./NetProfitTrendGraph";
import { CostStructureGraph } from "./CostStructureGraph";
import { ProfitabilityMarginsGraph } from "./ProfitabilityMarginsGraph";
import { BankLiveWidget } from "./BankLiveWidget";
import { TrialBalanceWidget } from "./TrialBalanceWidget";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useDashboardData } from "@/hooks/useDashboardData";

export const DashboardOverview = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [userName, setUserName] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [chartMonths, setChartMonths] = useState<number>(24);
  const [sbStatus, setSbStatus] = useState<'online' | 'offline' | 'connecting'>('connecting');
  const [sbLatency, setSbLatency] = useState<number | null>(null);
  const [sbStrength, setSbStrength] = useState<number>(0);

  // UI Control States
  const [filterOpen, setFilterOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { fiscalStartMonth, selectedFiscalYear, setSelectedFiscalYear, getCalendarYearForFiscalPeriod, loading: fiscalLoading } = useFiscalYear();
  
  // Manage company ID state locally to trigger refreshes
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    const fetchCompanyId = async () => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).maybeSingle();
      if (data?.company_id) setCompanyId(String(data.company_id));
    };
    fetchCompanyId();

    const handleCompanyChange = () => { fetchCompanyId(); };
    window.addEventListener('company-changed', handleCompanyChange);
    return () => window.removeEventListener('company-changed', handleCompanyChange);
  }, [user]);

  // Date filter state
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [periodMode, setPeriodMode] = useState<'rolling' | 'fiscal_year'>('rolling');
  const [assetTrendPeriod, setAssetTrendPeriod] = useState<string>("12");

  useEffect(() => {
    if (!fiscalLoading && typeof selectedFiscalYear === 'number') {
      setSelectedYear(selectedFiscalYear);
      // Ensure we stay on current month
      setSelectedMonth(new Date().getMonth() + 1);
    }
  }, [fiscalLoading, selectedFiscalYear, fiscalStartMonth]);

  // Load User Profile Name
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("user_id", user.id)
          .single();
        
        const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
        setUserName(fullName || (user.user_metadata?.name as string) || user.email || "");
      } catch {}
    };
    loadProfile();
  }, [user]);
  
  // Widget visibility settings
  const [widgets, setWidgets] = useState(() => {
    const defaultWidgets = {
      metrics: false,
      netProfit: true,
      incomeVsExpense: true,
      incomeExpense: true,
      expenseBreakdown: true,
      assetTrend: true,
      recentTransactions: true,
      trialBalance: true,
      arOverview: true,
      apOverview: true,
      purchaseTrend: true,
      budgetGauge: false,
      inventoryStock: true,
      bsComposition: true,
      cashGauge: true,
      costStructure: true,
      profitMargins: true,
    };
    const saved = localStorage.getItem('dashboardWidgets');
    const parsed = saved ? JSON.parse(saved) : {};
    return { ...defaultWidgets, ...parsed };
  });

  const checkSupabaseConnection = useCallback(async () => {
    try {
      const dm = typeof localStorage !== 'undefined' && localStorage.getItem('rigel_demo_mode') === 'true';
      if (dm) {
        setSbStatus('online');
        setSbStrength(3);
        setSbLatency(null);
        return;
      }
      setSbStatus(prev => prev === 'offline' ? 'connecting' : prev);
      const start = performance.now();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSbStatus('offline');
        setSbStrength(0);
        setSbLatency(null);
        return;
      }
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw error;
      const latency = Math.round(performance.now() - start);
      setSbLatency(latency);
      setSbStatus('online');
      setSbStrength(latency < 150 ? 3 : latency < 400 ? 2 : 1);
    } catch (e: any) {
      setSbStatus('offline');
      setSbStrength(0);
      setSbLatency(null);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(checkSupabaseConnection, 15000);
    checkSupabaseConnection();
    return () => { try { clearInterval(timer); } catch {} };
  }, [checkSupabaseConnection]);

  useEffect(() => {
    localStorage.setItem('dashboardWidgets', JSON.stringify(widgets));
  }, [widgets]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleWidget = (widget: string) => {
    setWidgets((prev: any) => ({ ...prev, [widget]: !prev[widget] }));
  };

  // --- React Query Hook ---
  const { data, isLoading, isFetching, error } = useDashboardData(
    companyId,
    selectedYear,
    selectedMonth,
    chartMonths,
    fiscalStartMonth,
    getCalendarYearForFiscalPeriod,
    periodMode
  );

  const apTotal = useMemo(() => (data?.apDonut || []).reduce((acc: number, curr: any) => acc + curr.value, 0), [data?.apDonut]);
  const arTotal = useMemo(() => (data?.arDonut || []).reduce((acc: number, curr: any) => acc + curr.value, 0), [data?.arDonut]);
  const quotesTotal = useMemo(() => (data?.quotesAcceptanceDonut || []).reduce((acc: number, curr: any) => acc + curr.value, 0), [data?.quotesAcceptanceDonut]);

  useEffect(() => {
    if (error) {
      toast({ title: "Dashboard load failed", description: error.message, variant: "destructive" });
    }
  }, [error, toast]);

  // Realtime Subscription for Silent Sync
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`dashboard-sync-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `company_id=eq.${companyId}` },
        () => queryClient.invalidateQueries({ queryKey: ['dashboard-data'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transaction_entries', filter: `transactions.company_id=eq.${companyId}` }, 
        () => queryClient.invalidateQueries({ queryKey: ['dashboard-data'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `company_id=eq.${companyId}` },
        () => queryClient.invalidateQueries({ queryKey: ['dashboard-data'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bills', filter: `company_id=eq.${companyId}` },
        () => queryClient.invalidateQueries({ queryKey: ['dashboard-data'] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quotes', filter: `company_id=eq.${companyId}` },
        () => queryClient.invalidateQueries({ queryKey: ['dashboard-data'] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);

  // Move hooks above conditional returns
  const filteredAssetTrend = useMemo(() => {
    if (!data?.assetTrend) return [];
    const months = parseInt(assetTrendPeriod);
    return data.assetTrend.slice(-months);
  }, [data?.assetTrend, assetTrendPeriod]);

  const assetTrendSummary = useMemo(() => {
    if (!filteredAssetTrend.length) {
      return { latest: 0, changePct: null as number | null };
    }
    const latestPoint = filteredAssetTrend[filteredAssetTrend.length - 1] as any;
    const prevPoint = filteredAssetTrend.length > 1 ? (filteredAssetTrend[filteredAssetTrend.length - 2] as any) : null;
    const latest = Number(latestPoint.nbv || 0);
    const prevValue = prevPoint ? Number(prevPoint.nbv || 0) : 0;
    if (!prevValue || !isFinite(prevValue)) {
      return { latest, changePct: null as number | null };
    }
    const changePct = ((latest - prevValue) / prevValue) * 100;
    return { latest, changePct };
  }, [filteredAssetTrend]);

  const inventoryWithMetrics = useMemo(() => {
    const source = Array.isArray(data?.inventoryLevels) ? data.inventoryLevels : [];
    if (!source.length) return [];

    const base = [...source];
    base.sort((a: any, b: any) => Number(b.qty || 0) - Number(a.qty || 0));
    const maxQty = Math.max(...base.map((i: any) => Number(i.qty || 0)));
    const safeMax = maxQty > 0 ? maxQty : 1;
    const minLevel = safeMax * 0.25;
    const reorderLevel = safeMax * 0.4;

    return base.map((item: any) => {
      const qty = Number(item.qty || 0);
      let status: "critical" | "low" | "healthy" = "healthy";
      if (qty <= minLevel) status = "critical";
      else if (qty <= reorderLevel) status = "low";

      const color =
        status === "critical"
          ? "#ef4444"
          : status === "low"
          ? "#f59e0b"
          : "#22c55e";

      const daysLeft = Math.max(
        0,
        Math.round((qty / safeMax) * 60)
      );
      const turnover =
        safeMax > 0 ? Number((2 + (1 - qty / safeMax) * 6).toFixed(1)) : 0;

      return {
        ...item,
        qty,
        status,
        color,
        minLevel,
        reorderLevel,
        daysLeft,
        turnover,
      };
    });
  }, [data?.inventoryLevels]);

  if (isLoading || fiscalLoading) {
    return (
      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[400px] rounded-xl" />
          <Skeleton className="h-[400px] rounded-xl" />
        </div>
      </div>
    );
  }

  // Safety check: if we are not loading but still have no data (e.g. error state or empty), 
  // we might want to return null or empty structure, but useDashboardData usually returns defaults.
  // We'll proceed assuming data exists if !isLoading.
  if (!data) return null;

  // Destructure data for cleaner usage in JSX
  const {
    metrics,
    recentTransactions,
    chartData,
    netProfitTrend,
    incomeBreakdown,
    expenseBreakdown,
    arTop10,
    apTop10,
    arDonut,
    apDonut,
    purchaseTrend,
    costStructure,
    profitMargins,
    assetTrend,
    inventoryLevels,
    bsComposition,
    bsBreakdown,
    cashGaugePct,
    cashOnTrack,
    safeMinimum,
    quotesAcceptanceDonut,
    incomeWheelInner,
    expenseWheelInner,
    arKpis,
    apKpis,
    bankStats = {
      totalAmount: 0,
      pending: { amount: 0, count: 0, oldestDate: null },
      approved: { amount: 0, count: 0 },
      posted: { amount: 0, count: 0 },
      matchStatus: true,
      lastSync: new Date()
    }
  } = data;

  const metricCards = [
    {
      title: "Total Assets",
      amount: metrics.totalAssets,
      prefix: "R ",
      icon: Building2,
      color: "text-blue-600",
      gradient: "bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-background border-blue-200/50"
    },
    {
      title: "Total Liabilities",
      amount: metrics.totalLiabilities,
      prefix: "R ",
      icon: FileText,
      color: "text-red-600",
      gradient: "bg-gradient-to-br from-red-500/10 via-red-500/5 to-background border-red-200/50"
    },
    {
      title: "Total Equity",
      amount: metrics.totalAssets - metrics.totalLiabilities,
      prefix: "R ",
      icon: Briefcase,
      color: "text-purple-600",
      gradient: "bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-background border-purple-200/50"
    },
    {
      title: "Total Income",
      amount: metrics.totalIncome,
      prefix: "R ",
      icon: TrendingUp,
      color: "text-emerald-600",
      gradient: "bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-background border-emerald-200/50"
    },
    {
      title: "Operating Expenses",
      amount: metrics.operatingExpenses,
      prefix: "(R ",
      suffix: ")",
      icon: TrendingDown,
      color: "text-amber-600",
      gradient: "bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-background border-amber-200/50"
    },
    {
      title: "Bank Balance",
      amount: metrics.bankBalance,
      prefix: "R ",
      icon: CreditCard,
      color: "text-cyan-600",
      gradient: "bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-background border-cyan-200/50"
    }
  ];

  const COLORS = [
    '#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6',
    '#06B6D4', '#84CC16', '#EC4899', '#F43F5E', '#10B981'
  ];
  const QUOTE_COLORS = ['#22C55E', '#EF4444'];

  return (
    <div id="dashboard-content" className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            Dashboard
            {isFetching && !isLoading && (
               <div className="flex items-center gap-2 text-xs font-normal text-muted-foreground bg-muted/50 px-2 py-1 rounded-full animate-pulse">
                 <Loader2 className="h-3 w-3 animate-spin" />
                 Updating...
               </div>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome {userName}, {currentTime.toLocaleDateString('en-US', { weekday: 'long' })} {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setFilterOpen(true)} className="rounded-full h-10 w-10 shrink-0">
            <Filter className="h-4 w-4" />
          </Button>
          <Button variant="default" size="icon" onClick={() => setDrawerOpen(true)} className="rounded-full h-10 w-10 shrink-0 bg-primary text-primary-foreground shadow-md hover:scale-105 transition-transform">
            <MoreHorizontal className="h-4 w-4" />
          </Button>

          <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Dashboard Filters</DialogTitle>
                <DialogDescription>Adjust your dashboard view</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Fiscal Year</Label>
                  <Select value={selectedYear.toString()} onValueChange={(value) => { const y = parseInt(value); setSelectedYear(y); setSelectedFiscalYear(y); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                        <SelectItem key={year} value={year.toString()}>{fiscalStartMonth === 1 ? year : `FY ${year}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(parseInt(value))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                <div className="space-y-2">
                  <Label>Period Mode</Label>
                  <Select value={periodMode} onValueChange={(value) => setPeriodMode(value as 'rolling' | 'fiscal_year')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rolling">Rolling</SelectItem>
                      <SelectItem value="fiscal_year">Fiscal Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {periodMode === 'rolling' && (
                  <div className="space-y-2">
                    <Label>Rolling Period</Label>
                    <Select value={chartMonths.toString()} onValueChange={(value) => setChartMonths(parseInt(value))}>
                      <SelectTrigger><SelectValue placeholder="Period" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">Last 3 months</SelectItem>
                        <SelectItem value="6">Last 6 months</SelectItem>
                        <SelectItem value="12">Last 12 months</SelectItem>
                        <SelectItem value="24">Last 24 months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex justify-center pt-2">
                   <Badge variant="outline" className="gap-2 w-full justify-center py-1.5">
                     <Calendar className="h-4 w-4" />
                     {new Date(getCalendarYearForFiscalPeriod(selectedYear, selectedMonth), selectedMonth - 1).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })} • {chartMonths} months
                   </Badge>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setFilterOpen(false)}>Apply Filters</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetContent className="overflow-y-auto sm:max-w-[400px]">
              <SheetHeader>
                <SheetTitle>Dashboard Controls</SheetTitle>
                <SheetDescription>Manage widgets and tools</SheetDescription>
              </SheetHeader>
              
              <div className="space-y-6 mt-6">
                {/* Supabase Status */}
                <div className="rounded-xl border bg-card/50 text-card-foreground shadow-sm overflow-hidden">
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="relative flex h-3 w-3">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${sbStatus === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                          <span className={`relative inline-flex rounded-full h-3 w-3 ${sbStatus === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                        </div>
                        <span className="font-semibold text-sm">System Status</span>
                      </div>
                      <Badge variant={sbStatus === 'online' ? "outline" : "destructive"} className={`text-[10px] px-2 py-0.5 h-5 ${sbStatus === 'online' ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10' : ''}`}>
                        {sbStatus === 'online' ? "OPERATIONAL" : "OFFLINE"}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-muted/50 p-2.5 rounded-lg flex flex-col gap-1.5 border border-border/50">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Activity className="h-3 w-3" /> Latency
                        </span>
                        <div className="flex items-center gap-1 font-mono font-medium text-sm">
                          {sbLatency ? `${sbLatency}ms` : '--'}
                          <span className="text-[10px] text-muted-foreground font-sans font-normal">avg</span>
                        </div>
                      </div>
                      <div className="bg-muted/50 p-2.5 rounded-lg flex flex-col gap-1.5 border border-border/50">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Wifi className="h-3 w-3" /> Signal
                        </span>
                        <div className="flex items-center gap-1 font-medium text-sm">
                          {sbStrength === 3 ? 'Excellent' : sbStrength === 2 ? 'Good' : 'Weak'}
                        </div>
                        <div className="flex items-end gap-0.5 h-1.5 mt-auto">
                          <div className={`w-2 rounded-full ${sbStrength >= 1 ? 'bg-emerald-500' : 'bg-muted'} h-1.5`} />
                          <div className={`w-2 rounded-full ${sbStrength >= 2 ? 'bg-emerald-500' : 'bg-muted'} h-1.5`} />
                          <div className={`w-2 rounded-full ${sbStrength >= 3 ? 'bg-emerald-500' : 'bg-muted'} h-1.5`} />
                        </div>
                      </div>
                      <div className="bg-muted/50 p-2.5 rounded-lg flex flex-col gap-1.5 border border-border/50">
                         <span className="text-muted-foreground flex items-center gap-1.5">
                          <Server className="h-3 w-3" /> Database
                        </span>
                         <div className="flex items-center gap-1 font-medium text-emerald-500 text-xs">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </div>
                      </div>
                       <div className="bg-muted/50 p-2.5 rounded-lg flex flex-col gap-1.5 border border-border/50">
                         <span className="text-muted-foreground flex items-center gap-1.5">
                          <ShieldCheck className="h-3 w-3" /> Security
                        </span>
                         <div className="flex items-center gap-1 font-medium text-emerald-500 text-xs">
                          <CheckCircle2 className="h-3 w-3" /> Encrypted
                        </div>
                      </div>
                    </div>

                    <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-2 hover:bg-muted/80" onClick={checkSupabaseConnection} disabled={sbStatus === 'connecting'}>
                      <RefreshCw className={`h-3 w-3 ${sbStatus === 'connecting' ? "animate-spin" : ""}`} />
                      {sbStatus === 'connecting' ? "Checking Connection..." : "Test Connectivity"}
                    </Button>
                  </div>
                </div>

                 <div className="space-y-2">
                    <Label>Tools</Label>
                    <div className="grid gap-2">
                       <FinancialHealthInsight metrics={metrics} />
                       <DashboardCalendar />
                    </div>
                 </div>

                 <div className="space-y-4">
                    <Label className="text-base font-semibold">Widget Visibility</Label>
                    <div className="grid gap-2">
                        {Object.entries(widgets).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border/50">
                            <Label htmlFor={key} className="flex items-center gap-2 cursor-pointer flex-1">
                              {value ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                              <span className="text-sm font-medium">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                            </Label>
                            <Switch
                              id={key}
                              checked={value as boolean}
                              onCheckedChange={() => toggleWidget(key)}
                            />
                          </div>
                        ))}
                    </div>
                 </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Key Metrics - Accounting Elements */}
      {widgets.metrics && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {metricCards.map((metric) => (
            <Card key={metric.title} className={`card-professional border-l-4 transition-all duration-300 hover:-translate-y-1 ${metric.color.replace('text-', 'border-')} ${metric.gradient}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {metric.title}
                </CardTitle>
                <div className={`p-2 rounded-full bg-white/50 backdrop-blur-sm shadow-sm ${metric.color}`}>
                  <metric.icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold tracking-tight ${metric.color}`}>
                  <CountUp 
                    end={metric.amount} 
                    prefix={metric.prefix} 
                    suffix={metric.suffix} 
                    decimals={2} 
                    duration={800} 
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-medium">+2.5% from last month</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {widgets.purchaseTrend && (
          <PurchaseTrendGraph data={purchaseTrend} />
        )}



        {widgets.incomeVsExpense && (
          <IncomeExpenseGraph data={chartData} />
        )}
        {widgets.netProfit && (
          <NetProfitTrendGraph data={netProfitTrend} />
        )}
        {widgets.incomeExpense && (
          <SagePieChart
            title="Income Breakdown"
            data={incomeBreakdown}
            totalAmount={metrics.totalIncome}
            icon={TrendingUp}
            iconColor="text-emerald-600"
            storageKey="incomeBreakdown"
            colors={['#22C55E', '#16A34A', '#15803D', '#4ADE80', '#86EFAC', '#BBF7D0']}
          />
        )}

        {widgets.inventoryStock && (
          <Card className="bg-white dark:bg-slate-950 shadow-sm border border-slate-100/70 dark:border-slate-800">
            <CardHeader className="pb-0">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                Inventory Stock Levels
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 pb-6 px-6">
              {inventoryWithMetrics.length === 0 ? (
                <div className="text-sm text-muted-foreground">No inventory items</div>
              ) : (
                <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,0.3fr)] gap-6">
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={inventoryWithMetrics}
                        layout="vertical"
                        margin={{ top: 8, right: 32, bottom: 8, left: 0 }}
                      >
                        <CartesianGrid
                          horizontal
                          vertical={false}
                          stroke="rgba(0,0,0,0.05)"
                        />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={160}
                          tickLine={false}
                          axisLine={false}
                          stroke="hsl(var(--muted-foreground))"
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(15, 23, 42, 0.02)" }}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
                          }}
                          formatter={(_value: any, _name: any, props: any) => {
                            const payload = props?.payload as any;
                            if (!payload) return ["", ""];
                            const statusLabel =
                              payload.status === "critical"
                                ? "Critical"
                                : payload.status === "low"
                                ? "Low"
                                : "Healthy";
                            const lines = [
                              `Qty: ${Number(payload.qty || 0).toLocaleString(
                                "en-ZA"
                              )}`,
                              `Min level: ${Number(
                                payload.minLevel || 0
                              ).toLocaleString("en-ZA")}`,
                              `Reorder level: ${Number(
                                payload.reorderLevel || 0
                              ).toLocaleString("en-ZA")}`,
                              `Turnover: ${Number(
                                payload.turnover || 0
                              ).toFixed(1)}x`,
                              `Days left: ${Number(
                                payload.daysLeft || 0
                              )} days`,
                              `Status: ${statusLabel}`,
                            ];
                            return [lines.join(" • "), payload.name];
                          }}
                          labelFormatter={(_label: any, payload: any) =>
                            payload?.[0]?.payload?.name ?? ""
                          }
                        />
                        <Bar
                          dataKey="qty"
                          barSize={18}
                          radius={10}
                          isAnimationActive
                        >
                          {inventoryWithMetrics.map((entry: any, index: number) => (
                            <Cell
                              key={`inv-bar-${index}`}
                              fill={entry.color}
                            />
                          ))}
                          <LabelList
                            dataKey="qty"
                            position="right"
                            formatter={(value: any) =>
                              Number(value || 0).toLocaleString("en-ZA")
                            }
                            style={{
                              fontSize: 11,
                              fill: "hsl(var(--muted-foreground))",
                            }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col justify-center gap-3">
                    {inventoryWithMetrics.map((item: any, index: number) => {
                      const isCritical = item.status === "critical";
                      const isLow = item.status === "low";
                      const flagTitle = isCritical
                        ? "Reorder Required"
                        : "Monitor Stock";
                      return (
                        <div
                          key={`inv-metrics-${index}`}
                          className="grid grid-cols-3 items-center text-left gap-4 text-xs"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold">
                              {Number(item.turnover || 0).toFixed(1)}x
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Turnover
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold">
                              {Number(item.daysLeft || 0)} days
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Days Left
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {(isCritical || isLow) && (
                              <div
                                className={`inline-flex items-center justify-center rounded-full p-1 ${
                                  isCritical
                                    ? "bg-red-50 text-red-600"
                                    : "bg-amber-50 text-amber-600"
                                }`}
                                title={flagTitle}
                              >
                                {isCritical ? (
                                  <AlertTriangle className="h-3 w-3" />
                                ) : (
                                  <AlertCircle className="h-3 w-3" />
                                )}
                              </div>
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {isCritical
                                ? "Critical"
                                : isLow
                                ? "Low"
                                : "Healthy"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}


        {widgets.expenseBreakdown && (
          <SagePieChart
            title="Expense Breakdown"
            data={expenseBreakdown}
            totalAmount={metrics.totalExpenses}
            icon={TrendingDown}
            iconColor="text-red-600"
            storageKey="expenseBreakdown"
            colors={['#EF4444', '#DC2626', '#B91C1C', '#F87171', '#FCA5A5', '#FECACA']}
          />
        )}

        {widgets.bsComposition && (
          <BalanceSheetComposition data={bsBreakdown} periodLabel={periodMode === 'fiscal_year' ? 'Fiscal Year' : 'Rolling 12 Months'} />
        )}

        

        {widgets.arOverview && (
          <ARUnpaidGraph data={arTop10} totalUnpaid={arTotal} invoices={data.rawInvoices} />
        )}


        {widgets.assetTrend && (
          <Card className="bg-white dark:bg-slate-950 border border-slate-100/70 dark:border-slate-800 shadow-sm">
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  Fixed Assets Trend
                </CardTitle>
                <Select value={assetTrendPeriod} onValueChange={setAssetTrendPeriod}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Last 3 months</SelectItem>
                    <SelectItem value="6">Last 6 months</SelectItem>
                    <SelectItem value="12">Last 12 months</SelectItem>
                    <SelectItem value="24">Last 24 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-[0.08em]">
                    Net Book Value
                  </div>
                  <div className="mt-1 text-2xl font-semibold">
                    {assetTrendSummary.latest
                      ? `R ${assetTrendSummary.latest.toLocaleString("en-ZA")}`
                      : "R 0"}
                  </div>
                  {assetTrendSummary.changePct !== null && (
                    <div
                      className={`mt-1 text-xs font-medium ${
                        assetTrendSummary.changePct > 0
                          ? "text-emerald-600"
                          : assetTrendSummary.changePct < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {assetTrendSummary.changePct > 0 ? "+" : ""}
                      {assetTrendSummary.changePct.toFixed(1)}% vs last period
                    </div>
                  )}
                  {assetTrendSummary.changePct === null && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      No prior period available
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 pb-6 px-6">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={filteredAssetTrend}
                    margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                  >
                    <CartesianGrid
                      horizontal
                      vertical={false}
                      stroke="rgba(0,0,0,0.05)"
                    />
                    <XAxis
                      dataKey="month"
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) => {
                        if (!value) return "R 0";
                        const abs = Math.abs(value);
                        if (abs >= 1_000_000_000) {
                          return `R ${(value / 1_000_000_000).toFixed(1)}B`;
                        }
                        if (abs >= 1_000_000) {
                          return `R ${(value / 1_000_000).toFixed(1)}M`;
                        }
                        if (abs >= 1_000) {
                          return `R ${(value / 1_000).toFixed(1)}K`;
                        }
                        return `R ${value.toFixed(0)}`;
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(15, 23, 42, 0.02)" }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.08)",
                      }}
                      formatter={(value: any, _name: any, props: any) => {
                        const payload = props?.payload as any;
                        const idx = filteredAssetTrend.findIndex(
                          (p: any) => p.month === payload?.month
                        );
                        const current = Number(payload?.nbv || 0);
                        const prev =
                          idx > 0
                            ? Number((filteredAssetTrend[idx - 1] as any).nbv || 0)
                            : null;
                        const currency = `R ${current.toLocaleString("en-ZA")}`;
                        if (!prev || !isFinite(prev)) {
                          return [currency, "Net Book Value"];
                        }
                        const pct = ((current - prev) / prev) * 100;
                        const pctLabel = `${pct >= 0 ? "+" : ""}${pct.toFixed(
                          1
                        )}% vs prev`;
                        return [`${currency} • ${pctLabel}`, "Net Book Value"];
                      }}
                      labelFormatter={(label: any) => `${label}`}
                    />
                    <Bar
                      dataKey="nbv"
                      fill="#22c55e"
                      barSize={26}
                      radius={[10, 10, 0, 0]}
                      isAnimationActive
                    />
                    <Line
                      type="monotone"
                      dataKey="nbv"
                      stroke="#15803d"
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 1, stroke: "#15803d" }}
                      activeDot={{ r: 4 }}
                      isAnimationActive
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {widgets.cashGauge && (
          <Card className="bg-white dark:bg-slate-950 shadow-md hover:shadow-lg transition-all duration-300 border border-slate-100/70 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-lg font-semibold">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  <span>Cash Position</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 pb-6 px-6">
              <DashboardCashGauge safeMinimum={safeMinimum} currentBalance={metrics.bankBalance} />
            </CardContent>
          </Card>
        )}

        {widgets.arOverview && (
          <SagePieChart
            title="Unpaid invoices percentage by customer"
            data={arDonut}
            totalAmount={arTotal}
            icon={Receipt}
            iconColor="text-primary"
            storageKey="arDonut"
            colors={COLORS}
          />
        )}



        {widgets.apOverview && (
          <>
            <SagePieChart
              title="Unpaid Purchases % by Supplier"
              data={apDonut}
              totalAmount={apTotal}
              icon={CreditCard}
              iconColor="text-primary"
              storageKey="apDonutWidget"
              colors={COLORS}
            />

            <Card className="card-professional shadow-md hover:shadow-lg transition-all duration-300">
              <CardHeader className="border-b bg-muted/20 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>
                  Unpaid Purchases Amount (Top 10)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={apTop10} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tickFormatter={(v) => `R ${Number(v).toLocaleString('en-ZA')}`} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="name" width={150} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }} formatter={(v: any) => [`R ${Number(v).toLocaleString('en-ZA')}`, 'Unpaid']} />
                    <Legend />
                    <Bar dataKey="amount" name="Unpaid" radius={[4, 4, 0, 0]}>
                      {apTop10.map((entry, index) => (
                        <Cell key={`ap-top-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {widgets.costStructure && (
          <CostStructureGraph data={costStructure} />
        )}
        {widgets.profitMargins && (
          <ProfitabilityMarginsGraph data={profitMargins} />
        )}
        {widgets.purchaseTrend && (
          <Card className="card-professional shadow-md hover:shadow-lg transition-all duration-300">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                Purchase Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={purchaseTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R ${Number(v).toLocaleString('en-ZA')}`} />
                  <Tooltip
                    formatter={(value: any) => [`R ${Number(value).toLocaleString('en-ZA')}`, 'Purchases']}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="amount" name="Purchases" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <SagePieChart
          title="Quotes Accepted vs Unaccepted"
          data={quotesAcceptanceDonut}
          totalAmount={quotesTotal}
          icon={FileText}
          iconColor="text-primary"
          storageKey="quotesDonut"
          colors={QUOTE_COLORS}
          formatType="number"
        />
      </div>

      {/* Recent & Summary at End */}
      <div className="grid gap-6 lg:grid-cols-2">
          {widgets.trialBalance && (
            <TrialBalanceWidget metrics={metrics} />
          )}

          {widgets.recentTransactions && (
            <BankLiveWidget 
              data={bankStats} 
              transactions={data.rawTransactions}
              periodLabel={periodMode === 'fiscal_year' ? 'Fiscal Year' : `${chartMonths} Months`} 
            />
          )}
      </div>
    </div>
  );
};

const DashboardBudgetGauge = ({ percentage, onTrack }: { percentage: number; onTrack: boolean }) => {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2 + 20;
  const r = size / 2 - 20;
  const start = -Math.PI / 2;
  const end = Math.PI / 2;
  const safePct = isNaN(percentage) ? 0 : percentage;
  const pct = Math.max(0, Math.min(100, safePct));
  const ang = start + (pct / 100) * (end - start);
  const nx = cx + r * Math.cos(ang);
  const ny = cy + r * Math.sin(ang);
  const color = pct <= 50 ? '#22c55e' : pct <= 80 ? '#f59e0b' : '#ef4444';
  const ticks = Array.from({ length: 11 }).map((_, i) => {
    const a = start + (i / 10) * (end - start);
    const x1 = cx + (r - 10) * Math.cos(a);
    const y1 = cy + (r - 10) * Math.sin(a);
    const x2 = cx + r * Math.cos(a);
    const y2 = cy + r * Math.sin(a);
    return { x1, y1, x2, y2, i };
  });
  const sx = cx + r * Math.cos(start);
  const sy = cy + r * Math.sin(start);
  const ex = cx + r * Math.cos(ang);
  const ey = cy + r * Math.sin(ang);
  return (
    <svg width={size} height={size / 2 + 60} viewBox={`0 0 ${size} ${size / 2 + 60}`}>
      <defs>
        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e5e7eb" strokeWidth={12} />
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke={"url(#gaugeGradient)"} strokeWidth={12} strokeLinecap="round" />
      {ticks.map((t) => (
        <line key={t.i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#9ca3af" strokeWidth={t.i % 5 === 0 ? 3 : 1.5} />
      ))}
      <circle cx={cx} cy={cy} r={6} fill="#374151" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={4} />
      <text x={cx} y={cy - 20} textAnchor="middle" fontSize="20" fill={color}>{`${pct.toFixed(0)}%`}</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize="12" fill="#6b7280">{onTrack ? 'On Track' : 'Over Budget'}</text>
    </svg>
  );
};

const DashboardCashGauge = ({ safeMinimum, currentBalance }: { safeMinimum: number; currentBalance: number }) => {
  const safe = Math.max(0, safeMinimum || 0);
  const current = Math.max(0, currentBalance || 0);
  const coverage = safe > 0 ? current / safe : 0;
  const coverageRounded = safe > 0 && isFinite(coverage) ? `${coverage.toFixed(1)}x` : "—";

  let coverageColor = "#22c55e";
  let coverageLabel = "Healthy Buffer";

  if (!safe || !isFinite(coverage)) {
    coverageColor = "#6b7280";
    coverageLabel = "No safe minimum configured";
  } else if (coverage < 1) {
    coverageColor = "#ef4444";
    coverageLabel = "Below Minimum";
  } else if (coverage < 3) {
    coverageColor = "#f59e0b";
    coverageLabel = "Tight Buffer";
  }

  const maxValue = Math.max(safe, current);
  const domainMax = maxValue > 0 ? maxValue * 1.15 : 1;

  const data = [
    {
      name: "Cash",
      safe,
      current,
    },
  ];

  const formatter = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    notation: "compact",
    maximumFractionDigits: 1,
  });

  const formatCurrency = (value: number) => {
    if (!value || !isFinite(value)) return "R 0";
    const raw = formatter.format(value);
    return raw.startsWith("R") ? `R ${raw.slice(1).trim()}` : raw;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-[0.08em]">
            Cash Coverage Ratio
          </div>
          <div className="mt-1 text-3xl font-semibold" style={{ color: coverageColor }}>
            {coverageRounded}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {coverageLabel}
          </div>
        </div>
        <div className="text-xs text-muted-foreground text-right space-y-2">
          <div>
            <div>Current Cash</div>
            <div className="font-medium text-foreground">
              {formatCurrency(current)}
            </div>
          </div>
          <div>
            <div>Safe Minimum</div>
            <div className="font-medium text-foreground">
              {formatCurrency(safe)}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2">
        <ResponsiveContainer width="100%" height={90}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
          >
            <CartesianGrid
              horizontal
              vertical={false}
              stroke="rgba(0,0,0,0.05)"
            />
            <XAxis
              type="number"
              domain={[0, domainMax]}
              tickFormatter={formatCurrency}
              tickLine={false}
              axisLine={false}
            />
            <YAxis type="category" dataKey="name" hide />
            <Bar
              dataKey="safe"
              fill="rgba(148, 163, 184, 0.25)"
              barSize={18}
              radius={12}
            />
            <Bar
              dataKey="current"
              fill={coverageColor}
              barSize={18}
              radius={12}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
