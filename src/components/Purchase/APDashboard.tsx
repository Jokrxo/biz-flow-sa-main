import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid } from "recharts";

import { AlertCircle, Clock, DollarSign, TrendingUp, TrendingDown, FileText, Users, PieChart as PieChartIcon, Briefcase, Filter } from "lucide-react";

type SourceScope = "all" | "bills" | "purchase_orders";
type StatusScope = "sent_overdue" | "include_draft";

interface PayableRow {
  id: string;
  supplier_name: string;
  doc_no: string;
  date: string;
  due_date: string | null;
  outstanding: number;
  total_amount: number;
  status: string;
  source: SourceScope;
}

const COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#f59e0b", "#06b6d4", "#64748b", "#84cc16", "#f43f5e", "#0ea5e9"];

export const APDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [rows, setRows] = useState<PayableRow[]>([]);
  const [periodStart, setPeriodStart] = useState(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split("T")[0]);
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [statusScope, setStatusScope] = useState<StatusScope>("include_draft");
  const [sourceScope, setSourceScope] = useState<SourceScope>("purchase_orders");

  useEffect(() => { loadData(); }, [periodStart, periodEnd, supplierFilter, statusScope, sourceScope]);
  useEffect(() => { const today = new Date().toISOString().split("T")[0]; if (periodEnd !== today) setPeriodEnd(today); }, [periodEnd]);
  useEffect(() => {
    const channel = supabase
      .channel("ap-dashboard-changes")
      // Bills table removed from real-time subscription as module is hidden
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_orders" }, () => { loadData(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => { loadData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error("Company not found");

      const out: PayableRow[] = [];

      if (sourceScope === "all" || sourceScope === "bills") {
        const { data: billsData } = await supabase
          .from("bills")
          .select("id, supplier_id, bill_number, bill_date, due_date, total_amount, status")
          .eq("company_id", companyId)
          .gte("bill_date", periodStart)
          .lte("bill_date", periodEnd)
          .order("bill_date", { ascending: false });

        const supplierIds = Array.from(new Set((billsData || []).map((b: any) => b.supplier_id).filter(Boolean)));
        const nameMap: Record<string, string> = {};
        if (supplierIds.length > 0) {
          const { data: supps } = await supabase
            .from("suppliers")
            .select("id, name")
            .in("id", supplierIds);
          (supps || []).forEach((s: any) => { nameMap[s.id] = s.name; });
        }
        (billsData || []).forEach((b: any) => {
          if (statusScope === "sent_overdue" && !["pending", "overdue"].includes(String(b.status))) return;
          if (["paid", "cancelled"].includes(String(b.status))) return;
          const supplierName = nameMap[b.supplier_id] || "Unknown";
          if (supplierFilter !== "all" && supplierName !== supplierFilter) return;
          out.push({
            id: b.id,
            supplier_name: supplierName,
            doc_no: b.bill_number,
            date: b.bill_date,
            due_date: b.due_date,
            outstanding: Number(b.total_amount || 0),
            total_amount: Number(b.total_amount || 0),
            status: b.status,
            source: "bills",
          });
        });
      }

      if (sourceScope === "all" || sourceScope === "purchase_orders") {
        const { data: poData } = await supabase
          .from("purchase_orders")
          .select("id, supplier_id, po_number, po_date, total_amount, status")
          .eq("company_id", companyId)
          .gte("po_date", periodStart)
          .lte("po_date", periodEnd)
          .order("po_date", { ascending: false });
        const supplierIds = Array.from(new Set((poData || []).map((p: any) => p.supplier_id).filter(Boolean)));
        const nameMap: Record<string, string> = {};
        if (supplierIds.length > 0) {
          const { data: supps } = await supabase
            .from("suppliers")
            .select("id, name")
            .in("id", supplierIds);
          (supps || []).forEach((s: any) => { nameMap[s.id] = s.name; });
        }
        const poNumbers = (poData || []).map((p: any) => p.po_number).filter(Boolean);
        const payMap: Record<string, number> = {};
        if (poNumbers.length > 0) {
          const { data: pays } = await supabase
            .from("transactions")
            .select("reference_number, total_amount, transaction_type, status")
            .in("reference_number", poNumbers)
            .eq("transaction_type", "payment")
            .eq("status", "posted");
          (pays || []).forEach((t: any) => {
            const ref = String(t.reference_number || "");
            payMap[ref] = (payMap[ref] || 0) + Number(t.total_amount || 0);
          });
        }
        (poData || []).forEach((p: any) => {
          if (statusScope === "sent_overdue" && String(p.status) !== "sent") return;
          if (String(p.status) === "paid") return;
          const supplierName = nameMap[p.supplier_id] || "Unknown";
          if (supplierFilter !== "all" && supplierName !== supplierFilter) return;
          const paidAmt = payMap[String(p.po_number || "")] || 0;
          const outstanding = Math.max(0, Number(p.total_amount || 0) - paidAmt);
          if (outstanding <= 0) return;
          out.push({
            id: p.id,
            supplier_name: supplierName,
            doc_no: p.po_number,
            date: p.po_date,
            due_date: null,
            outstanding,
            total_amount: Number(p.total_amount || 0),
            status: p.status,
            source: "purchase_orders",
          });
        });
      }

      setRows(out);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function diffDays(from?: string | null, to?: string | null) {
    if (!from || !to) return 0;
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    return Math.floor((b - a) / (1000 * 60 * 60 * 24));
  }

  const suppliers = useMemo(() => {
    const uniq = new Map<string, string>();
    rows.forEach(r => { if (r.supplier_name) uniq.set(r.supplier_name, r.supplier_name); });
    return Array.from(uniq.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const kpis = useMemo(() => {
    const now = new Date().toISOString().split("T")[0];
    const unpaidTotal = rows.reduce((sum, r) => sum + (r.outstanding || 0), 0);
    const overdueBills = rows.filter(r => r.source === "bills" && r.outstanding > 0 && r.due_date && r.due_date < now);
    const overdueTotal = overdueBills.reduce((sum, r) => sum + (r.outstanding || 0), 0);
    const overdueUnder30 = overdueBills.filter(r => { const d = r.due_date ? diffDays(r.due_date, now) : 0; return d > 0 && d <= 30; });
    const overdue30 = overdueBills.filter(r => r.due_date ? diffDays(r.due_date, now) >= 31 : false);
    const overdue90 = overdueBills.filter(r => r.due_date ? diffDays(r.due_date, now) >= 90 : false);
    const overdueUnder30Total = overdueUnder30.reduce((sum, r) => sum + (r.outstanding || 0), 0);
    const overdue30Total = overdue30.reduce((sum, r) => sum + (r.outstanding || 0), 0);
    const overdue90Total = overdue90.reduce((sum, r) => sum + (r.outstanding || 0), 0);
    return { unpaidTotal, overdueTotal, overdueUnder30Total, overdue30Total, overdue90Total };
  }, [rows]);

  const top10Data = useMemo(() => {
    const totals = new Map<string, { name: string; amount: number }>();
    rows.forEach(r => {
      const key = r.supplier_name || "Unknown";
      const curr = totals.get(key) || { name: key, amount: 0 };
      curr.amount += r.outstanding || 0;
      totals.set(key, curr);
    });
    return Array.from(totals.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);
  }, [rows]);

  const donutData = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + (r.outstanding || 0), 0) || 1;
    const buckets = new Map<string, { name: string; value: number }>();
    rows.forEach(r => {
      const key = r.supplier_name || "Unknown";
      const curr = buckets.get(key) || { name: key, value: 0 };
      curr.value += r.outstanding || 0;
      buckets.set(key, curr);
    });
    return Array.from(buckets.values()).map(b => ({ name: b.name, value: b.value, pct: (b.value / total) * 100 }));
  }, [rows]);

  const trendData = useMemo(() => {
    const data = new Map<string, number>();
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleString('default', { month: 'short', year: 'numeric' });
      data.set(key, 0);
    }
    
    rows.forEach(row => {
      const d = new Date(row.date);
      const key = d.toLocaleString('default', { month: 'short', year: 'numeric' });
      if (data.has(key)) {
        data.set(key, (data.get(key) || 0) + row.total_amount);
      }
    });

    return Array.from(data.entries()).map(([name, value]) => ({ name, value }));
  }, [rows]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = { Paid: 0, Pending: 0, Overdue: 0, Draft: 0, Sent: 0 };
    rows.forEach(row => {
      if (row.status === 'paid') counts.Paid++;
      else if (row.status === 'draft') counts.Draft++;
      else if (row.status === 'sent') counts.Sent++;
      else if (row.status === 'overdue' || (row.due_date && new Date(row.due_date) < new Date())) counts.Overdue++;
      else counts.Pending++;
    });
    return Object.entries(counts)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [rows]);

  const agingSummary = useMemo(() => {
    const now = new Date().toISOString().split("T")[0];
    const data = new Map<string, any>();
    rows.forEach(r => {
      const key = r.supplier_name || "Unknown";
      const isOverdue = r.source === "bills" && r.outstanding > 0 && r.due_date && r.due_date < now;
      const days = r.due_date ? diffDays(r.due_date, now) : 0;
      const bucket = r.source !== "bills" ? "current" : !isOverdue ? "current" : days <= 30 ? "d1_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d91p";
      const curr = data.get(key) || { name: key, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91p: 0, due: 0 };
      curr[bucket] += r.outstanding || 0;
      curr.due += r.outstanding || 0;
      data.set(key, curr);
    });
    return Array.from(data.entries()).map(([id, r]) => ({ supplier_id: id, ...r }));
  }, [rows]);

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-slate-50 to-indigo-50 dark:from-slate-900 dark:to-indigo-900 shadow-sm">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>AP Dashboard</CardTitle>
            <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4" />
            </Button>
          </div>
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
              <Label>Supplier</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Source selector hidden as Bills module is disabled */}
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
                setPeriodStart(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
                setPeriodEnd(new Date().toISOString().split("T")[0]);
                setSupplierFilter("all");
                setStatusScope("include_draft");
                setSourceScope("all");
              }}>Reset</Button>
            </div>
          </CardContent>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card className="shadow-md"><CardHeader><CardTitle>No purchases match your filters</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Adjust source or widen the date range. End date is fixed to today.</p></CardContent></Card>
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
                  Purchase Trend (Last 6 Months)
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
                      formatter={(value: number) => [`R ${value.toLocaleString('en-ZA')}`, 'Amount']}
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
                  Purchase Status Distribution
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
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Briefcase className="h-4 w-4 text-primary" />
                  Unpaid Purchases Amount (Top 10 Suppliers)
                </CardTitle>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top10Data} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} fontSize={11} />
                    <Tooltip formatter={(v: any) => [`R ${Number(v).toLocaleString('en-ZA')}`, "Amount"]} />
                    <Bar dataKey="amount" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChartIcon className="h-4 w-4 text-primary" />
                  Unpaid Purchases % by Supplier
                </CardTitle>
              </CardHeader>
              <CardContent style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={donutData} 
                      dataKey="value" 
                      nameKey="name" 
                      innerRadius={60} 
                      outerRadius={80} 
                      paddingAngle={2}
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any, _n, p: any) => [`R ${Number(v).toLocaleString('en-ZA')}`, p?.payload?.name]} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-md">
            <CardHeader><CardTitle>AP Aging Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left bg-muted/50">
                      <th className="p-3 font-medium">Supplier</th>
                      <th className="p-3 font-medium">Current</th>
                      <th className="p-3 font-medium">1-30 Days</th>
                      <th className="p-3 font-medium">31-60 Days</th>
                      <th className="p-3 font-medium">61-90 Days</th>
                      <th className="p-3 font-medium">91+ Days</th>
                      <th className="p-3 font-medium text-right">Amount Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingSummary.map((row: any, i: number) => (
                      <tr key={row.supplier_id} className={`border-t hover:bg-muted/50 transition-colors ${i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
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
            <CardHeader><CardTitle>Unpaid Purchases</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left bg-muted/50">
                      <th className="p-3 font-medium">Supplier</th>
                      <th className="p-3 font-medium">Document No.</th>
                      <th className="p-3 font-medium">Date</th>
                      <th className="p-3 font-medium">Due Date</th>
                      <th className="p-3 font-medium text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((inv, i) => (
                      <tr key={inv.id} className={`border-t hover:bg-muted/50 transition-colors ${i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}`}>
                        <td className="p-3 font-medium">{inv.supplier_name}</td>
                        <td className="p-3 text-primary">{inv.doc_no}</td>
                        <td className="p-3">{inv.date}</td>
                        <td className="p-3">{inv.due_date || '-'}</td>
                        <td className="p-3 font-mono font-semibold text-right">R {inv.outstanding.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
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

export default APDashboard;
