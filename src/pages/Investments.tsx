import { useEffect, useState, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { transactionsApi } from "@/lib/transactions-api";
import { 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Briefcase, 
  DollarSign, 
  Menu, 
  Plus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  History, 
  FileText, 
  Wallet, 
  Search, 
  Filter,
  LayoutDashboard,
  ArrowRightLeft,
  Landmark,
  Check,
  XCircle,
  Download,
  ChevronDown
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Progress } from "@/components/ui/progress";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

type InvestmentAccount = { id: string; name: string; currency: string; broker_name?: string };
type Position = { id: string; account_id: string; symbol: string; instrument_type: string; quantity: number; avg_cost: number; current_price?: number; market_value?: number; unrealized_gain?: number };
type InvestmentTx = { id: string; account_id: string; type: string; trade_date: string; symbol: string; quantity?: number; price?: number; total_amount: number; currency?: string; fx_rate?: number; fees?: number; notes?: string };

// --- Metric Card Component ---
function MetricCard({ title, value, icon: Icon, color, trend }: { title: string; value: string; icon: any; color: string; trend?: string }) {
  return (
    <Card className="border-none shadow-md overflow-hidden relative">
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-10`} />
      <CardContent className="p-6 relative">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
            {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
          </div>
          <div className={`p-3 rounded-xl bg-gradient-to-br ${color} text-white shadow-lg`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Investments() {
  const { toast } = useToast();
  const [tab, setTab] = useState("positions");
  const [companyId, setCompanyId] = useState<string>("");
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; account_name: string }>>([]);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Operation completed successfully");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  
  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);

  // Dialog States
  const [buyOpen, setBuyOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [divOpen, setDivOpen] = useState(false);
  const [intOpen, setIntOpen] = useState(false);
  const [fdOpen, setFdOpen] = useState(false);

  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string>("");
  
  // Form States
  const [actionAccountId, setActionAccountId] = useState<string>("");
  const [actionBankId, setActionBankId] = useState<string>("");
  const [symbol, setSymbol] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [termMonths, setTermMonths] = useState<string>("12");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0,10));
  
  // Search & Filter
  const [search, setSearch] = useState("");
  const [txFilter, setTxFilter] = useState("all");

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
        if (!profile?.company_id) return;
        setCompanyId(String(profile.company_id));
      } catch {}
    };
    init();
  }, []);

  const loadAll = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      let accts: any[] = [];
      const { data: existingAccounts } = await supabase
        .from("investment_accounts" as any)
        .select("id, name, currency, broker_name")
        .eq("company_id", companyId);

      accts = (existingAccounts || []) as any[];

      if (!accts || accts.length === 0) {
        const { data: created } = await supabase
          .from("investment_accounts" as any)
          .insert({
            company_id: companyId,
            name: "Fixed Deposit",
            currency: "ZAR",
            broker_name: "Bank",
          })
          .select("id, name, currency, broker_name")
          .single();

        if (created) {
          accts = [created as any];
        }
      }

      setAccounts(accts as any);

      const accountIds = accts.map((a: any) => a.id);

      const { data: pos } = await supabase
        .from("investment_positions" as any)
        .select("*")
        .in("account_id", accountIds);
      setPositions((pos || []) as any);

      const { data: txs } = await supabase
        .from("investment_transactions" as any)
        .select("*")
        .in("account_id", accountIds)
        .order("trade_date", { ascending: false });
      setTransactions((txs || []) as any);

      const { data: banks } = await supabase
        .from("bank_accounts" as any)
        .select("id, account_name")
        .eq("company_id", companyId)
        .order("account_name");
      setBankAccounts(
        ((banks || []) as any[]).filter((b) => b && typeof b.id === "string")
      );
    } catch (e: any) {
      // Tables may not exist yet; keep UI responsive
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadAll(); }, [companyId, loadAll]);

  const allocation = useMemo(() => {
    const map: Record<string, number> = {};
    (positions || []).forEach(p => {
      const key = String(p.instrument_type || 'other');
      const val = Number(p.market_value ?? (p.quantity || 0) * (p.current_price || p.avg_cost || 0));
      map[key] = (map[key] || 0) + Math.max(0, val);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
  }, [positions]);

  const fdMetaByAccount = useMemo(() => {
    const metas: Record<string, { principal: number; rate: number; termMonths: number; startDate: string }> = {};
    const fdPositions = (positions || []).filter(p => String(p.instrument_type).toLowerCase() === 'fixed_deposit');
    fdPositions.forEach(p => {
      const principal = Number(p.avg_cost || 0);
      const tx = (transactions || []).find(t => t.account_id === p.account_id && String(t.type).toLowerCase() === 'buy' && String(t.symbol || '').includes('FD-'));
      let rate = 0; let termMonths = 0; const startIso = tx ? String(tx.trade_date) : startDate;
      const note = (tx as any)?.notes || '';
      const rateMatch = String(note).match(/Rate\s+([0-9]+(?:\.[0-9]+)?)%/i);
      const termMatch = String(note).match(/Term\s+([0-9]+)m/i);
      if (rateMatch) rate = parseFloat(rateMatch[1]) / 100;
      if (termMatch) termMonths = parseInt(termMatch[1], 10);
      metas[p.account_id] = { principal, rate, termMonths, startDate: startIso };
    });
    return metas;
  }, [positions, transactions]);

  const fdMonthlyInterest = (accountId: string) => {
    const m = fdMetaByAccount[accountId];
    if (!m || !(m.principal > 0) || !(m.rate > 0)) return 0;
    return Number((m.principal * m.rate / 12).toFixed(2));
  };

  const performanceSeries = useMemo(() => {
    const series: Array<{ date: string; value: number }> = [];
    const monthsBack = 12;
    const end = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
      const dIso = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10);
      let total = 0;
      Object.values(fdMetaByAccount).forEach(m => {
        if (!m.rate || !m.principal) return;
        const start = new Date(m.startDate || dIso);
        const monthsElapsed = Math.max(0, Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
        const cappedMonths = m.termMonths ? Math.min(monthsElapsed, m.termMonths) : monthsElapsed;
        const accrued = m.principal * m.rate * (cappedMonths / 12);
        total += m.principal + accrued;
      });
      (positions || []).forEach(p => {
        if (String(p.instrument_type).toLowerCase() !== 'fixed_deposit') {
          const mv = Number(p.market_value ?? (p.quantity || 0) * (p.current_price || p.avg_cost || 0));
          total += Math.max(0, mv);
        }
      });
      series.push({ date: dIso, value: Number(total.toFixed(2)) });
    }
    return series;
  }, [positions, fdMetaByAccount]);

  const metrics = useMemo(() => {
    const totalValue = (positions || []).reduce((sum, p) => sum + Number(p.market_value ?? (p.quantity || 0) * (p.current_price || p.avg_cost || 0)), 0);
    const totalUnrealized = (positions || []).reduce((sum, p) => sum + Number(p.unrealized_gain || 0), 0);
    const year = new Date().getFullYear();
    const dividendsYTD = (transactions || []).filter(t => String(t.type).toLowerCase() === 'dividend' && new Date(t.trade_date).getFullYear() === year).reduce((s, t) => s + Number(t.total_amount || 0), 0);
    const interestYTD = (transactions || []).filter(t => String(t.type).toLowerCase() === 'interest' && new Date(t.trade_date).getFullYear() === year).reduce((s, t) => s + Number(t.total_amount || 0), 0);
    
    return { totalValue, totalUnrealized, dividendsYTD, interestYTD };
  }, [positions, transactions]);

  const COLORS = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#84CC16", "#EC4899", "#F43F5E", "#10B981"];

  const filteredPositions = useMemo(() => {
    return positions.filter(p => 
      p.symbol.toLowerCase().includes(search.toLowerCase()) || 
      (p.instrument_type || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [positions, search]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        t.symbol?.toLowerCase().includes(search.toLowerCase()) ||
        t.type.toLowerCase().includes(search.toLowerCase());
      const matchesFilter =
        txFilter === "all" || t.type.toLowerCase() === txFilter;
      return matchesSearch && matchesFilter;
    });
  }, [transactions, search, txFilter]);

  const handleSaveTransaction = async (type: string) => {
    if (!companyId) return;
    setIsSubmitting(true);
    try {
      if (type === "fixed_deposit") {
        const amt = parseFloat(amount || "0");
        const r = parseFloat(rate || "0");
        const term = parseInt(termMonths || "0", 10);
        const bankId = actionBankId || bankAccounts[0]?.id || "";

        if (!bankId) {
          toast({
            title: "No bank account",
            description: "Please add a bank account before creating a fixed deposit.",
            variant: "destructive",
          });
          return;
        }

        await transactionsApi.postFixedDepositOpen({
          name: "Fixed Deposit",
          amount: amt,
          rate: r,
          termMonths: term,
          date: startDate,
          bankAccountId: bankId,
        });
      } else {
        if (!actionAccountId) return;

        const txData: any = {
          company_id: companyId,
          account_id: actionAccountId,
          type: type,
          trade_date: startDate,
          symbol: symbol,
          total_amount: parseFloat(amount || "0"),
          notes: `Manual ${type} record`,
        };

        if (["buy", "sell"].includes(type)) {
          txData.quantity = parseFloat(quantity || "0");
          txData.price = parseFloat(price || "0");
        }

        const { error } = await supabase
          .from("investment_transactions" as any)
          .insert(txData);
        if (error) throw error;
      }

      await loadAll();

      setBuyOpen(false);
      setSellOpen(false);
      setDivOpen(false);
      setIntOpen(false);
      setFdOpen(false);

      setSymbol("");
      setQuantity("");
      setPrice("");
      setAmount("");
      setRate("");
      setTermMonths("12");

      setSuccessMessage(
        `${type.charAt(0).toUpperCase() + type.slice(1)} recorded successfully`
      );
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Error",
        description: e?.message || "Unable to save investment transaction",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReportClick = (reportType: string) => {
    setSelectedReport(reportType);
    setReportDialogOpen(true);
  };

  return (
    <>
      <SEO title="Investments | Rigel Business" description="Manage company investments" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Investments</h1>
              <p className="text-muted-foreground">Manage portfolio, track performance, and record distributions</p>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <FileText className="h-4 w-4" />
                    Reports
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleReportClick("Overview")}>
                    Overview & Analysis
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleReportClick("Fixed Deposit")}>
                    Fixed Deposit Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleReportClick("Income")}>
                    Income Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleReportClick("Transactions")}>
                    Transaction History
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-[#0070ad] hover:bg-[#00609d] text-white shadow-sm gap-2">
                    <Menu className="h-4 w-4" />
                    Actions
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Trades</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setBuyOpen(true)}>
                    <ArrowDownLeft className="h-4 w-4 mr-2 text-emerald-500" />
                    Record Buy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSellOpen(true)}>
                    <ArrowUpRight className="h-4 w-4 mr-2 text-red-500" />
                    Record Sell
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Income</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setDivOpen(true)}>
                    <PieChartIcon className="h-4 w-4 mr-2" />
                    Record Dividend
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIntOpen(true)}>
                    <DollarSign className="h-4 w-4 mr-2" />
                    Record Interest
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Fixed Deposits</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setFdOpen(true)}>
                    <Landmark className="h-4 w-4 mr-2" />
                    New Fixed Deposit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Main Tabs */}
          <Tabs value={tab} onValueChange={setTab} className="space-y-6">
            <div className="border-b pb-px overflow-x-auto">
              <TabsList className="h-auto w-full justify-start gap-2 bg-transparent p-0 rounded-none">
                <TabsTrigger value="positions" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Positions
                </TabsTrigger>
                <TabsTrigger value="transactions" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Transactions
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="positions" className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <h3 className="text-lg font-semibold text-[#0070ad]">
                    Portfolio Positions
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Detailed view of current holdings
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search positions..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-white border-gray-200 focus:border-[#2563eb] focus:ring-[#2563eb]"
                  />
                </div>
              </div>

              <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-700 border-b border-slate-800">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="text-white">Symbol</TableHead>
                      <TableHead className="text-white">Type</TableHead>
                      <TableHead className="text-white">Account</TableHead>
                      <TableHead className="text-white text-right">
                        Quantity
                      </TableHead>
                      <TableHead className="text-white text-right">
                        Avg Cost
                      </TableHead>
                      <TableHead className="text-white text-right">
                        Current Price
                      </TableHead>
                      <TableHead className="text-white text-right">
                        Market Value
                      </TableHead>
                      <TableHead className="text-white text-right">
                        Unrealized
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPositions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No positions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPositions.map((p, i) => (
                        <TableRow
                          key={p.id}
                          className={`${
                            i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                          } hover:bg-blue-50/50`}
                        >
                          <TableCell className="font-medium py-2 text-[#2563eb]">
                            {p.symbol}
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge
                              variant="outline"
                              className="capitalize text-xs font-normal"
                            >
                              {p.instrument_type.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground py-2 text-sm">
                            {accounts.find((a) => a.id === p.account_id)?.name}
                          </TableCell>
                          <TableCell className="text-right py-2">
                            {Number(p.quantity || 0).toLocaleString("en-ZA")}
                          </TableCell>
                          <TableCell className="text-right py-2">
                            R{" "}
                            {Number(p.avg_cost || 0).toLocaleString("en-ZA", {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-mono py-2 text-xs">
                            R{" "}
                            {Number(
                              p.current_price || p.avg_cost || 0
                            ).toLocaleString("en-ZA", {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-bold py-2">
                            R{" "}
                            {Number(
                              p.market_value ??
                                (p.quantity || 0) *
                                  (p.current_price || p.avg_cost || 0)
                            ).toLocaleString("en-ZA", {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell
                            className={`text-right py-2 font-medium ${
                              Number(p.unrealized_gain || 0) >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            R{" "}
                            {Number(
                              p.unrealized_gain || 0
                            ).toLocaleString("en-ZA", {
                              minimumFractionDigits: 2,
                            })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              <div className="flex flex-col md:flex-row justify-between gap-4 items-center">
                <div className="space-y-1 text-center md:text-left">
                  <h3 className="text-lg font-semibold text-[#0070ad]">
                    Transaction History
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Historical record of all activities
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search transactions..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 bg-white border-gray-200 focus:border-[#2563eb] focus:ring-[#2563eb]"
                    />
                  </div>
                  <Select value={txFilter} onValueChange={setTxFilter}>
                    <SelectTrigger className="w-[180px] bg-white border-gray-200">
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">
                          {txFilter === "all"
                            ? "All Types"
                            : txFilter.charAt(0).toUpperCase() +
                              txFilter.slice(1)}
                        </span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                      <SelectItem value="dividend">Dividend</SelectItem>
                      <SelectItem value="interest">Interest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-700 border-b border-slate-800">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="text-white">Date</TableHead>
                      <TableHead className="text-white">Type</TableHead>
                      <TableHead className="text-white">Symbol</TableHead>
                      <TableHead className="text-white text-right">
                        Quantity
                      </TableHead>
                      <TableHead className="text-white text-right">
                        Price
                      </TableHead>
                      <TableHead className="text-white text-right">
                        Total Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No transactions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTransactions.map((t, i) => (
                        <TableRow
                          key={t.id}
                          className={`${
                            i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                          } hover:bg-blue-50/50`}
                        >
                          <TableCell className="py-2">
                            {new Date(t.trade_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge
                              variant={
                                t.type === "buy"
                                  ? "default"
                                  : t.type === "sell"
                                  ? "destructive"
                                  : "secondary"
                              }
                              className="capitalize text-xs font-normal"
                            >
                              {t.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2 font-medium text-[#2563eb]">
                            {t.symbol || "-"}
                          </TableCell>
                          <TableCell className="text-right py-2">
                            {t.quantity
                              ? Number(t.quantity).toLocaleString("en-ZA")
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono py-2 text-xs">
                            {t.price
                              ? `R ${Number(t.price).toLocaleString("en-ZA", {
                                  minimumFractionDigits: 2,
                                })}`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium py-2">
                            R{" "}
                            {Number(t.total_amount || 0).toLocaleString(
                              "en-ZA",
                              { minimumFractionDigits: 2 }
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>



          {/* Report Dialog */}
          <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
            <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{selectedReport} Report</DialogTitle>
                <DialogDescription>Detailed view of {selectedReport.toLowerCase()} data</DialogDescription>
              </DialogHeader>
              
              {selectedReport === "Overview" && (
                 <div className="space-y-6 py-4">
                    {/* Metric Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <MetricCard 
                        title="Total Portfolio Value" 
                        value={`R ${metrics.totalValue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`} 
                        icon={Briefcase} 
                        color="from-blue-500 to-blue-600" 
                      />
                      <MetricCard 
                        title="Unrealized Gain" 
                        value={`R ${metrics.totalUnrealized.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`} 
                        icon={TrendingUp} 
                        color="from-emerald-500 to-emerald-600" 
                        trend={metrics.totalValue > 0 ? `${((metrics.totalUnrealized / metrics.totalValue) * 100).toFixed(1)}% Return` : undefined}
                      />
                      <MetricCard 
                        title="Dividends (YTD)" 
                        value={`R ${metrics.dividendsYTD.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`} 
                        icon={PieChartIcon} 
                        color="from-purple-500 to-purple-600" 
                      />
                      <MetricCard 
                        title="Interest (YTD)" 
                        value={`R ${metrics.interestYTD.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`} 
                        icon={DollarSign} 
                        color="from-orange-500 to-orange-600" 
                      />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle>Asset Allocation</CardTitle>
                          <CardDescription>Distribution by instrument type</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {allocation.length === 0 ? (
                            <div className="flex items-center justify-center h-[300px] text-muted-foreground">No assets allocated</div>
                          ) : (
                            <ResponsiveContainer width="100%" height={300}>
                              <PieChart>
                                <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={80} outerRadius={120} paddingAngle={2}>
                                  {allocation.map((entry, index) => (
                                    <Cell key={`alloc-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} 
                                  formatter={(v: any) => [`R ${Number(v).toLocaleString('en-ZA')}`, 'Value']} 
                                />
                                <Legend verticalAlign="bottom" height={36} />
                              </PieChart>
                            </ResponsiveContainer>
                          )}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>Portfolio Trend</CardTitle>
                          <CardDescription>Value over last 12 months</CardDescription>
                        </CardHeader>
                        <CardContent>
                           <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={performanceSeries}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                              <XAxis dataKey="date" tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, {month:'short'})} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => `R${(val/1000).toFixed(0)}k`} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} 
                                formatter={(v: any) => [`R ${Number(v).toLocaleString('en-ZA')}`, 'Portfolio Value']} 
                                labelFormatter={(l) => new Date(l).toLocaleDateString()}
                              />
                              <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    </div>
                 </div>
              )}

              {selectedReport === "Fixed Deposit" && (
                 <div className="space-y-4 py-4">
                    <div className="border rounded-md overflow-hidden bg-white shadow-sm">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[#0070ad] hover:bg-[#0070ad] border-none">
                            <TableHead className="text-white font-semibold h-9">Account</TableHead>
                            <TableHead className="text-white font-semibold h-9 text-right">Principal</TableHead>
                            <TableHead className="text-white font-semibold h-9 text-right">Rate</TableHead>
                            <TableHead className="text-white font-semibold h-9 text-right">Term (Months)</TableHead>
                            <TableHead className="text-white font-semibold h-9">Start Date</TableHead>
                            <TableHead className="text-white font-semibold h-9 text-right">Monthly Interest</TableHead>
                            <TableHead className="text-white font-semibold h-9 text-right">Est. Maturity Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.keys(fdMetaByAccount).length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No fixed deposits found</TableCell></TableRow>
                          ) : (
                            Object.entries(fdMetaByAccount).map(([accId, meta]) => {
                               const accName = accounts.find(a => a.id === accId)?.name || 'Unknown Account';
                               const monthlyInt = (meta.principal * meta.rate) / 12;
                               const maturityVal = meta.principal + (meta.principal * meta.rate * (meta.termMonths / 12));
                               
                               return (
                                <TableRow key={accId} className="hover:bg-blue-50/50">
                                  <TableCell className="font-medium py-2">{accName}</TableCell>
                                  <TableCell className="text-right py-2">R {meta.principal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                                  <TableCell className="text-right py-2">{(meta.rate * 100).toFixed(2)}%</TableCell>
                                  <TableCell className="text-right py-2">{meta.termMonths}</TableCell>
                                  <TableCell className="py-2">{new Date(meta.startDate).toLocaleDateString()}</TableCell>
                                  <TableCell className="text-right py-2 font-mono text-emerald-600">R {monthlyInt.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                                  <TableCell className="text-right py-2 font-bold">R {maturityVal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                                </TableRow>
                               );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-end">
                       <Button variant="outline" onClick={() => {
                          const rows = Object.entries(fdMetaByAccount).map(([accId, meta]) => {
                             const accName = accounts.find(a => a.id === accId)?.name || 'Unknown';
                             return { account: accName, principal: meta.principal, rate: meta.rate, term: meta.termMonths, start: meta.startDate };
                          });
                          const header = 'Account,Principal,Rate,Term,StartDate\n';
                          const body = rows.map(r => `${r.account},${r.principal},${r.rate},${r.term},${r.start}`).join('\n');
                          const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url; a.download = 'fixed-deposits.csv'; a.click(); URL.revokeObjectURL(url);
                       }}>
                         <Download className="h-4 w-4 mr-2" />
                         Export CSV
                       </Button>
                    </div>
                 </div>
              )}

              {selectedReport !== "Fixed Deposit" && selectedReport !== "Overview" && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-4">
                  <FileText className="h-12 w-12 opacity-20" />
                  <p>Report preview for {selectedReport} is under development.</p>
                  <Button variant="outline" onClick={() => setReportDialogOpen(false)}>Close</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Record Buy Dialog */}
          <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Record Buy Transaction</DialogTitle>
                <DialogDescription>Purchase new shares or assets</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="buy-account" className="text-right">Account</Label>
                  <Select value={actionAccountId} onValueChange={setActionAccountId}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="buy-date" className="text-right">Date</Label>
                  <Input id="buy-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="buy-symbol" className="text-right">Symbol</Label>
                  <Input id="buy-symbol" value={symbol} onChange={e => setSymbol(e.target.value)} className="col-span-3" placeholder="e.g. AAPL" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="buy-qty" className="text-right">Quantity</Label>
                  <Input id="buy-qty" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="buy-price" className="text-right">Price</Label>
                  <Input id="buy-price" type="number" value={price} onChange={e => setPrice(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="buy-total" className="text-right">Total</Label>
                  <Input id="buy-total" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBuyOpen(false)}>Cancel</Button>
                <Button onClick={() => handleSaveTransaction('buy')} disabled={isSubmitting}>
                  {isSubmitting ? <LoadingSpinner /> : "Record Buy"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Record Sell Dialog */}
          <Dialog open={sellOpen} onOpenChange={setSellOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Record Sell Transaction</DialogTitle>
                <DialogDescription>Sell existing shares or assets</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sell-account" className="text-right">Account</Label>
                  <Select value={actionAccountId} onValueChange={setActionAccountId}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sell-date" className="text-right">Date</Label>
                  <Input id="sell-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sell-symbol" className="text-right">Symbol</Label>
                  <Input id="sell-symbol" value={symbol} onChange={e => setSymbol(e.target.value)} className="col-span-3" placeholder="e.g. AAPL" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sell-qty" className="text-right">Quantity</Label>
                  <Input id="sell-qty" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sell-price" className="text-right">Price</Label>
                  <Input id="sell-price" type="number" value={price} onChange={e => setPrice(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sell-total" className="text-right">Total</Label>
                  <Input id="sell-total" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSellOpen(false)}>Cancel</Button>
                <Button onClick={() => handleSaveTransaction('sell')} disabled={isSubmitting} variant="destructive">
                  {isSubmitting ? <LoadingSpinner /> : "Record Sell"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Record Dividend Dialog */}
          <Dialog open={divOpen} onOpenChange={setDivOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Record Dividend</DialogTitle>
                <DialogDescription>Record dividend income received</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="div-account" className="text-right">Account</Label>
                  <Select value={actionAccountId} onValueChange={setActionAccountId}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="div-date" className="text-right">Date</Label>
                  <Input id="div-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="div-symbol" className="text-right">Symbol</Label>
                  <Input id="div-symbol" value={symbol} onChange={e => setSymbol(e.target.value)} className="col-span-3" placeholder="e.g. AAPL" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="div-amount" className="text-right">Amount</Label>
                  <Input id="div-amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDivOpen(false)}>Cancel</Button>
                <Button onClick={() => handleSaveTransaction('dividend')} disabled={isSubmitting}>
                  {isSubmitting ? <LoadingSpinner /> : "Record Dividend"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Record Interest Dialog */}
          <Dialog open={intOpen} onOpenChange={setIntOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Record Interest</DialogTitle>
                <DialogDescription>Record interest income received</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="int-account" className="text-right">Account</Label>
                  <Select value={actionAccountId} onValueChange={setActionAccountId}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="int-date" className="text-right">Date</Label>
                  <Input id="int-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="int-amount" className="text-right">Amount</Label>
                  <Input id="int-amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIntOpen(false)}>Cancel</Button>
                <Button onClick={() => handleSaveTransaction('interest')} disabled={isSubmitting}>
                  {isSubmitting ? <LoadingSpinner /> : "Record Interest"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* New Fixed Deposit Dialog */}
          <Dialog open={fdOpen} onOpenChange={setFdOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>New Fixed Deposit</DialogTitle>
                <DialogDescription>Create a new fixed deposit investment</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="fd-account" className="text-right">Account</Label>
                  <Select value={actionAccountId} onValueChange={setActionAccountId}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="fd-date" className="text-right">Start Date</Label>
                  <Input id="fd-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="fd-amount" className="text-right">Principal</Label>
                  <Input id="fd-amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="fd-rate" className="text-right">Rate (%)</Label>
                  <Input id="fd-rate" type="number" value={rate} onChange={e => setRate(e.target.value)} className="col-span-3" placeholder="e.g. 0.05 for 5%" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="fd-term" className="text-right">Term (Months)</Label>
                  <Input id="fd-term" type="number" value={termMonths} onChange={e => setTermMonths(e.target.value)} className="col-span-3" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFdOpen(false)}>Cancel</Button>
                <Button onClick={() => handleSaveTransaction('fixed_deposit')} disabled={isSubmitting}>
                  {isSubmitting ? <LoadingSpinner /> : "Create FD"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </DashboardLayout>
    </>
  );
}
