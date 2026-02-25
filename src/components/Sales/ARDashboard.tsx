import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from "recharts";

import { AlertCircle, Clock, DollarSign, TrendingUp, TrendingDown, FileText, Users, PieChart as PieChartIcon, Filter } from "lucide-react";

interface InvoiceRow {
  id: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  amount_due: number;
  currency?: string | null;
  status: string;
  total_amount?: number;
}

type StatusScope = 'sent_overdue' | 'include_draft';

type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd91p';
type AgingRow = { name: string; due: number } & Record<AgingBucket, number>;

const COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#f59e0b", "#06b6d4", "#64748b", "#84cc16", "#f43f5e", "#0ea5e9"];

export const ARDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [periodStart, setPeriodStart] = useState(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split('T')[0]);
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [statusScope, setStatusScope] = useState<StatusScope>('include_draft');
  const [showFilters, setShowFilters] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: companyProfile, error: profErr } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (profErr) throw profErr;
      if (!companyProfile?.company_id) throw new Error("Company not found");
      const { data, error } = await supabase
        .from("invoices")
        .select("id, customer_name, invoice_number, invoice_date, due_date, total_amount, status")
        .eq("company_id", companyProfile.company_id)
        .gte("invoice_date", periodStart)
        .lte("invoice_date", periodEnd)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      let rowsRaw: any[] = data || [];
      rowsRaw = rowsRaw.filter(r => {
        if (statusScope === 'sent_overdue') {
          return r.status === 'sent' || r.status === 'overdue';
        }
        return r.status !== 'paid' && r.status !== 'cancelled';
      });
      let rows: InvoiceRow[] = rowsRaw.map((r: any) => ({
        id: r.id,
        customer_name: r.customer_name,
        invoice_number: r.invoice_number,
        invoice_date: r.invoice_date,
        due_date: r.due_date,
        amount_due: r.status === 'paid' ? 0 : Number(r.total_amount || 0),
        status: r.status,
        currency: null,
        total_amount: Number(r.total_amount || 0),
      }));
      if (customerFilter !== "all") rows = rows.filter(r => r.customer_name === customerFilter);
      setInvoices(rows);
    } catch (e: any) {
      console.error("AR load error:", e);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [periodStart, periodEnd, customerFilter, statusScope]);
  useEffect(() => { loadData(); }, [periodStart, periodEnd, customerFilter, statusScope, loadData]);
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (periodEnd !== today) setPeriodEnd(today);
  }, [periodEnd]);
  useEffect(() => {
    const channel = supabase
      .channel('ar-dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        loadData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);


  const customers = useMemo(() => {
    const uniq = new Map<string, string>();
    invoices.forEach(r => { if (r.customer_name) uniq.set(r.customer_name, r.customer_name); });
    return Array.from(uniq.entries()).map(([id, name]) => ({ id, name }));
  }, [invoices]);

  // Hoisted function to avoid "Cannot access before initialization" runtime
  function diffDays(from?: string | null, to?: string | null) {
    if (!from || !to) return 0;
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    return Math.floor((b - a) / (1000 * 60 * 60 * 24));
  }

  const kpis = useMemo(() => {
    const now = new Date().toISOString().split('T')[0];
    const unpaidTotal = invoices.reduce((sum, r) => sum + (r.amount_due || 0), 0);
    const overdue = invoices.filter(r => r.amount_due > 0 && r.due_date && r.due_date < now);
    const overdueTotal = overdue.reduce((sum, r) => sum + (r.amount_due || 0), 0);
    // Under 30 days overdue (1–30)
    const overdueUnder30 = overdue.filter(r => {
      const d = r.due_date ? diffDays(r.due_date, now) : 0;
      return d > 0 && d <= 30;
    });
    // 31+ days overdue
    const overdue30 = overdue.filter(r => r.due_date ? diffDays(r.due_date, now) >= 31 : false);
    // 90+ days overdue
    const overdue90 = overdue.filter(r => r.due_date ? diffDays(r.due_date, now) >= 90 : false);

    const overdueUnder30Total = overdueUnder30.reduce((sum, r) => sum + (r.amount_due || 0), 0);
    const overdue30Total = overdue30.reduce((sum, r) => sum + (r.amount_due || 0), 0);
    const overdue90Total = overdue90.reduce((sum, r) => sum + (r.amount_due || 0), 0);

    return { unpaidTotal, overdueTotal, overdueUnder30Total, overdue30Total, overdue90Total };
  }, [invoices]);

  // diffDays hoisted above

  const trendData = useMemo(() => {
    const data = new Map<string, number>();
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleString('default', { month: 'short', year: 'numeric' });
      data.set(key, 0);
    }
    
    invoices.forEach(inv => {
      if (inv.status === 'cancelled') return;
      const d = new Date(inv.invoice_date);
      const key = d.toLocaleString('default', { month: 'short', year: 'numeric' });
      if (data.has(key)) {
        data.set(key, (data.get(key) || 0) + Number(inv.total_amount || 0));
      }
    });

    return Array.from(data.entries()).map(([name, value]) => ({ name, value }));
  }, [invoices]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = { Paid: 0, Pending: 0, Overdue: 0, Draft: 0 };
    invoices.forEach(inv => {
      if (inv.status === 'cancelled') return;
      if (inv.status === 'paid') counts.Paid++;
      else if (inv.status === 'draft') counts.Draft++;
      else if (inv.status === 'overdue' || (inv.due_date && new Date(inv.due_date) < new Date())) counts.Overdue++;
      else counts.Pending++;
    });
    const total = invoices.filter(inv => inv.status !== 'cancelled').length;
    return Object.entries(counts).map(([name, value]) => ({ 
      name, 
      value,
      percentage: total > 0 ? Math.round((value / total) * 100) : 0
    }));
  }, [invoices]);

  const customerUnpaidData = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach(inv => {
      if (inv.amount_due > 0) {
        const name = inv.customer_name || 'Unknown';
        map.set(name, (map.get(name) || 0) + inv.amount_due);
      }
    });
    const totalUnpaid = Array.from(map.values()).reduce((sum, val) => sum + val, 0);
    return Array.from(map.entries())
      .map(([name, value]) => ({ 
        name, 
        value,
        percentage: totalUnpaid > 0 ? Math.round((value / totalUnpaid) * 100) : 0
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Top 10
  }, [invoices]);

  const agingSummary = useMemo(() => {
    const now = new Date().toISOString().split('T')[0];
    const rows = new Map<string, AgingRow>();
    invoices.forEach(r => {
      const key = r.customer_name || 'Unknown';
      const isOverdue = r.amount_due > 0 && r.due_date && r.due_date < now;
      const days = r.due_date ? diffDays(r.due_date, now) : 0;
      const bucket = !isOverdue ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd91p';
      const curr: AgingRow = rows.get(key) || { name: key, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91p: 0, due: 0 };
      const typedBucket: AgingBucket = bucket as AgingBucket;
      curr[typedBucket] += r.amount_due || 0;
      curr.due += r.amount_due || 0;
      rows.set(key, curr);
    });
    return Array.from(rows.entries()).map(([id, r]) => ({ customer_id: id, ...r }));
  }, [invoices]);

  return (
    <div className="space-y-6">
      <Card className="card-professional">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>AR Dashboard</CardTitle>
          <Button variant="outline" onClick={() => setShowFilters(v => !v)}>
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
        </CardHeader>
        {showFilters && (
          <CardContent className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-56">
              <Label htmlFor="periodStart">Start</Label>
              <Input id="periodStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div className="flex-1 min-w-56">
              <Label htmlFor="periodEnd">End</Label>
              <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} disabled />
            </div>
            <div className="min-w-56">
              <Label>Customer</Label>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-56">
              <Label>Statuses</Label>
              <Select value={statusScope} onValueChange={(v) => setStatusScope(v as StatusScope)}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sent_overdue">Sent & Overdue</SelectItem>
                  <SelectItem value="include_draft">Include Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="self-end flex gap-2">
              <Button onClick={loadData} disabled={loading}>Refresh</Button>
              <Button variant="outline" onClick={() => {
                setPeriodStart(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                setPeriodEnd(new Date().toISOString().split('T')[0]);
                setCustomerFilter('all');
                setStatusScope('include_draft');
              }}>Reset</Button>
            </div>
          </CardContent>
        )}
      </Card>

      {invoices.length === 0 ? (
        <Card className="shadow-md">
          <CardHeader><CardTitle>No invoices match your filters</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Try adjusting status or widening the date range. End date is fixed to today.</p>
          </CardContent>
        </Card>
      ) : (
       <>
         <div className="hidden">
           {/* Metric Cards Removed */}
         </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Revenue Trend (Last 6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `R${value/1000}k`} 
                />
                <Tooltip 
                  formatter={(value: number) => [`R ${value.toLocaleString('en-ZA')}`, 'Revenue']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3b82f6" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: "#3b82f6" }} 
                  activeDot={{ r: 6 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Invoice Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name, props) => [`${value} (${props.payload.percentage}%)`, name]} />
                <Legend verticalAlign="bottom" height={36} formatter={(value, entry) => {
                  const item = statusData.find(d => d.name === value);
                  return `${value}: ${item?.percentage || 0}%`;
                }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              AR Unpaid (Top Customers)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={customerUnpaidData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} fontSize={11} />
                <Tooltip formatter={(value: number) => `R ${value.toLocaleString('en-ZA')}`} />
                <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChartIcon className="h-4 w-4 text-primary" />
              Unpaid Invoices % by Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={customerUnpaidData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {customerUnpaidData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name, props) => [`R ${value.toLocaleString('en-ZA')} (${props.payload.percentage}%)`, name]} />
                <Legend verticalAlign="bottom" height={36} formatter={(value, entry) => {
                  const item = customerUnpaidData.find(d => d.name === value);
                  return `${value}: ${item?.percentage || 0}%`;
                }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader><CardTitle>AR Aging Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left bg-[#2e2e2e] hover:bg-[#2e2e2e] border-none">
                  <th className="p-3 font-medium text-white">Customer</th>
                  <th className="p-3 font-medium text-white">Current</th>
                  <th className="p-3 font-medium text-white">1-30 Days</th>
                  <th className="p-3 font-medium text-white">31-60 Days</th>
                  <th className="p-3 font-medium text-white">61-90 Days</th>
                  <th className="p-3 font-medium text-white">91+ Days</th>
                  <th className="p-3 font-medium text-right text-white">Amount Due</th>
                </tr>
              </thead>
              <tbody>
                {agingSummary.map((row, i) => (
                  <tr key={row.customer_id} className={`border-t hover:bg-muted/50 transition-colors ${i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                    <td className="p-3 font-medium">{row.name}</td>
                    <td className="p-3">R {row.current.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3">R {row.d1_30.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3">R {row.d31_60.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3">R {row.d61_90.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3">R {row.d91p.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3 font-bold text-right text-primary">R {row.due.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader><CardTitle>Unpaid invoices</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left bg-[#2e2e2e] hover:bg-[#2e2e2e] border-none">
                  <th className="p-3 font-medium text-white">Customer</th>
                  <th className="p-3 font-medium text-white">Invoice No.</th>
                  <th className="p-3 font-medium text-white">Date</th>
                  <th className="p-3 font-medium text-white">Due Date</th>
                  <th className="p-3 font-medium text-right text-white">Amount Due</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <tr key={inv.id} className={`border-t hover:bg-muted/50 transition-colors ${i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                    <td className="p-3 font-medium">{inv.customer_name}</td>
                    <td className="p-3 text-primary">{inv.invoice_number}</td>
                    <td className="p-3">{inv.invoice_date}</td>
                    <td className="p-3">{inv.due_date || '-'}</td>
                    <td className="p-3 font-mono font-semibold text-right">R {inv.amount_due.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
};
