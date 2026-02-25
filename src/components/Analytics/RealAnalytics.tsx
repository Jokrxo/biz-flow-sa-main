import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Calendar as CalendarIcon } from "lucide-react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const RealAnalytics = () => {
  const { fiscalStartMonth, selectedFiscalYear, setSelectedFiscalYear, getFiscalYearDates, loading: fiscalLoading } = useFiscalYear();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [chartMonths, setChartMonths] = useState<number>(12);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [expenseData, setExpenseData] = useState<any[]>([]);
  const [cashFlowData, setCashFlowData] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({
    avgInvoice: 0,
    collectionDays: 28,
    profitMargin: 0,
    retention: 89.5
  });

  useEffect(() => {
    if (!fiscalLoading && typeof selectedFiscalYear === 'number') {
      setYear(String(selectedFiscalYear));
    }
  }, [fiscalLoading, selectedFiscalYear]);

  useEffect(() => {
    loadAnalyticsData();
  }, [year, fiscalStartMonth, chartMonths]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return;

      const { endDate: endObj } = getFiscalYearDates(parseInt(year));
      
      // Calculate period based on chartMonths ending at the fiscal year end
      const targetEnd = new Date(endObj);
      const targetStart = new Date(targetEnd.getFullYear(), targetEnd.getMonth() - chartMonths + 1, 1);
      
      const startStr = targetStart.toISOString();
      const endStr = targetEnd.toISOString();

      // Load transactions
      const { data: transactions } = await supabase
        .from("transactions")
        .select(`
          *,
          entries:transaction_entries(
            debit,
            credit,
            chart_of_accounts(account_type)
          )
        `)
        .eq("company_id", profile.company_id)
        .in("status", ["pending", "approved", "posted"]) 
        .gte("transaction_date", startStr)
        .lte("transaction_date", endStr)
        .order("transaction_date", { ascending: true });

      // Process data for charts
      const monthlyRevenue: { [key: string]: number } = {};
      const monthlyExpense: { [key: string]: number } = {};
      let totalIncome = 0;
      let totalExpenses = 0;

      transactions?.forEach(tx => {
        const month = new Date(tx.transaction_date).toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' });
        
        tx.entries?.forEach((entry: any) => {
          const type = entry.chart_of_accounts?.account_type?.toLowerCase() || "";
          const amount = entry.debit - entry.credit;

          if (type.includes("income") || type.includes("revenue")) {
            monthlyRevenue[month] = (monthlyRevenue[month] || 0) + Math.abs(amount);
            totalIncome += Math.abs(amount);
          } else if (type.includes("expense")) {
            monthlyExpense[month] = (monthlyExpense[month] || 0) + Math.abs(amount);
            totalExpenses += Math.abs(amount);
          }
        });
      });

      // Generate months for labels
      const chartMonthLabels: string[] = [];
      for(let i=0; i<chartMonths; i++) {
         const d = new Date(targetStart.getFullYear(), targetStart.getMonth() + i, 1);
         chartMonthLabels.push(d.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' }));
      }

      // Format for charts
      const revenueChartData = chartMonthLabels.map(month => ({
        month,
        revenue: monthlyRevenue[month] || 0
      }));

      const expenseChartData = chartMonthLabels.map(month => ({
        month,
        amount: monthlyExpense[month] || 0
      }));

      // Cash flow pie chart
      const cashFlow = [
        { name: "Income", value: totalIncome, color: "#22c55e" },
        { name: "Expenses", value: totalExpenses, color: "#ef4444" }
      ];

      setRevenueData(revenueChartData);
      setExpenseData(expenseChartData);
      setCashFlowData(cashFlow);

      // Calculate metrics
      const profitMargin = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
      
      // Load invoices for avg invoice
      const { data: invoices } = await supabase
        .from("invoices")
        .select("total_amount")
        .eq("company_id", profile.company_id);

      const avgInvoice = invoices && invoices.length > 0
        ? invoices.reduce((sum, inv) => sum + inv.total_amount, 0) / invoices.length
        : 0;

      setMetrics({
        avgInvoice,
        collectionDays: 28,
        profitMargin,
        retention: 89.5
      });

    } catch (error: any) {
      toast({ title: "Error loading analytics", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading analytics...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <Select value={chartMonths.toString()} onValueChange={(val) => setChartMonths(parseInt(val))}>
          <SelectTrigger className="w-[180px] bg-background">
            <SelectValue placeholder="Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Last 3 Months</SelectItem>
            <SelectItem value="6">Last 6 Months</SelectItem>
            <SelectItem value="12">Last 12 Months</SelectItem>
            <SelectItem value="24">Last 24 Months</SelectItem>
          </SelectContent>
        </Select>

        <Select value={year} onValueChange={(val) => { setYear(val); const y = parseInt(val, 10); setSelectedFiscalYear(y); }}>
          <SelectTrigger className="w-[180px] bg-background">
            <CalendarIcon className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Select Year" />
          </SelectTrigger>
          <SelectContent>
             {[2023, 2024, 2025, 2026, 2027].map(y => (
                <SelectItem key={y} value={y.toString()}>
                    {fiscalStartMonth === 1 ? y : `FY ${y}`}
                </SelectItem>
             ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="card-professional">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Revenue Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: any) => `R ${value.toLocaleString()}`} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart className="h-5 w-5 text-primary" />
              Expense Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={expenseData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value: any) => `R ${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="amount" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              Cash Flow Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={cashFlowData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: R ${entry.value.toLocaleString()}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {cashFlowData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => `R ${value.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardHeader>
            <CardTitle>Key Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Average Invoice Value</span>
                <span className="font-bold">R {metrics.avgInvoice.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Collection Period</span>
                <span className="font-bold">{metrics.collectionDays} days</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Profit Margin</span>
                <span className="font-bold text-primary">{metrics.profitMargin.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Customer Retention</span>
                <span className="font-bold text-primary">{metrics.retention}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
