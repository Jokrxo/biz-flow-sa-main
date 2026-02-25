import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type StatusScope = 'sent_overdue' | 'include_draft';

export const SalesOverviewReal = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    unpaidInvoices: { value: 0, count: 0 },
    overdueInvoices: { value: 0, count: 0 },
    paidInvoices: { value: 0, count: 0 },
    totalOutstanding: { value: 0, count: 0 }
  });
  const [ageAnalysis, setAgeAnalysis] = useState({
    current: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0
  });
  const [statusScope, setStatusScope] = useState<StatusScope>('sent_overdue');

  useEffect(() => {
    loadSalesData();

    // Real-time updates
    const channel = supabase
      .channel('sales-overview-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        loadSalesData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, () => {
        loadSalesData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadSalesData]);

  useEffect(() => { loadSalesData(); }, [loadSalesData]);

  const loadSalesData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return;

      // Load all invoices
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", profile.company_id);

      if (error) throw error;

      // Calculate stats
      const today = new Date();
      const unpaid = { value: 0, count: 0 };
      const overdue = { value: 0, count: 0 };
      const paid = { value: 0, count: 0 };
      
      let current = 0, days31to60 = 0, days61to90 = 0, days90plus = 0;

      const rows = invoices || [];
      const filtered = rows.filter(inv => {
        if (statusScope === 'sent_overdue') {
          return inv.status === 'sent' || inv.status === 'overdue';
        }
        return inv.status !== 'paid' && inv.status !== 'cancelled';
      });

      filtered.forEach(inv => {
        const amount = inv.total_amount || 0;
        
        if (inv.status === 'paid') {
          paid.value += amount;
          paid.count++;
        } else {
          unpaid.value += amount;
          unpaid.count++;
          
          // Check if overdue
          if (inv.due_date) {
            const dueDate = new Date(inv.due_date);
            const daysDiff = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysDiff > 0) {
              overdue.value += amount;
              overdue.count++;
              
              // Age analysis
              if (daysDiff <= 30) current += amount;
              else if (daysDiff <= 60) days31to60 += amount;
              else if (daysDiff <= 90) days61to90 += amount;
              else days90plus += amount;
            } else {
              current += amount;
            }
          } else {
            current += amount;
          }
        }
      });

      setStats({
        unpaidInvoices: unpaid,
        overdueInvoices: overdue,
        paidInvoices: paid,
        totalOutstanding: { value: unpaid.value, count: unpaid.count }
      });

      setAgeAnalysis({ current, days31to60, days61to90, days90plus });
    } catch (error: any) {
      toast({ title: "Error loading sales data", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusScope, toast]);

  const formatCurrency = (value: number) => {
    return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return <div className="text-center py-8">Loading sales data...</div>;
  }

  const statCards = [
    { title: "Unpaid Invoices", value: formatCurrency(stats.unpaidInvoices.value), count: stats.unpaidInvoices.count, icon: AlertCircle, color: "text-amber-500" },
    { title: "Overdue Invoices", value: formatCurrency(stats.overdueInvoices.value), count: stats.overdueInvoices.count, icon: Clock, color: "text-destructive" },
    { title: "Paid Invoices", value: formatCurrency(stats.paidInvoices.value), count: stats.paidInvoices.count, icon: CheckCircle, color: "text-primary" },
    { title: "Total Outstanding", value: formatCurrency(stats.totalOutstanding.value), count: stats.totalOutstanding.count, icon: FileText, color: "text-accent" },
  ];

  return (
    <div className="space-y-6 mt-6">
      <Card className="card-professional">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
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
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="card-professional">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.count} invoices</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-professional">
        <CardHeader>
          <CardTitle>Age Analysis Report (Accounts Receivable)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">Current (0-30 days)</span>
              <span className="font-bold text-primary">{formatCurrency(ageAnalysis.current)}</span>
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">31-60 days</span>
              <span className="font-bold text-amber-500">{formatCurrency(ageAnalysis.days31to60)}</span>
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">61-90 days</span>
              <span className="font-bold text-amber-600">{formatCurrency(ageAnalysis.days61to90)}</span>
            </div>
            <div className="flex items-center justify-between p-3 border rounded">
              <span className="font-medium">90+ days (Overdue)</span>
              <span className="font-bold text-destructive">{formatCurrency(ageAnalysis.days90plus)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
