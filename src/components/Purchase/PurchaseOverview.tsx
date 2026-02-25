import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const PurchaseOverview = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    unpaidBills: { value: 0, count: 0 },
    overdueBills: { value: 0, count: 0 },
    paidBills: { value: 0, count: 0 },
    totalOutstanding: { value: 0, count: 0 }
  });
  const [ageAnalysis, setAgeAnalysis] = useState({
    current: 0,
    days31to60: 0,
    days61to90: 0,
    overdue: 0
  });

  const loadPurchaseData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (!profile) return;
      const { data: bills } = await supabase
        .from("bills")
        .select("*")
        .eq("company_id", profile.company_id);
      const today = new Date();
      let unpaid = 0, unpaidCount = 0;
      let overdue = 0, overdueCount = 0;
      let paid = 0, paidCount = 0;
      let current = 0, days31to60 = 0, days61to90 = 0, overdueAnalysis = 0;
      bills?.forEach(bill => {
        const amount = Number(bill.total_amount);
        if (bill.status === 'paid') { paid += amount; paidCount++; }
        else {
          unpaid += amount; unpaidCount++;
          if (bill.due_date) {
            const dueDate = new Date(bill.due_date);
            const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysOverdue > 0) { overdue += amount; overdueCount++; }
            if (daysOverdue <= 30) current += amount;
            else if (daysOverdue <= 60) days31to60 += amount;
            else if (daysOverdue <= 90) days61to90 += amount;
            else overdueAnalysis += amount;
          } else { current += amount; }
        }
      });
      setStats({ unpaidBills: { value: unpaid, count: unpaidCount }, overdueBills: { value: overdue, count: overdueCount }, paidBills: { value: paid, count: paidCount }, totalOutstanding: { value: unpaid, count: unpaidCount } });
      setAgeAnalysis({ current, days31to60, days61to90, overdue: overdueAnalysis });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => {
    loadPurchaseData();

    // Real-time updates
    const channel = supabase
      .channel('purchase-overview-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => {
        loadPurchaseData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        loadPurchaseData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPurchaseData]);

  const loadPurchaseData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return;

      // Load bills
      const { data: bills } = await supabase
        .from("bills")
        .select("*")
        .eq("company_id", profile.company_id);

      const today = new Date();
      let unpaid = 0, unpaidCount = 0;
      let overdue = 0, overdueCount = 0;
      let paid = 0, paidCount = 0;
      let current = 0, days31to60 = 0, days61to90 = 0, overdueAnalysis = 0;

      bills?.forEach(bill => {
        const amount = Number(bill.total_amount);
        if (bill.status === 'paid') {
          paid += amount;
          paidCount++;
        } else {
          unpaid += amount;
          unpaidCount++;

          if (bill.due_date) {
            const dueDate = new Date(bill.due_date);
            const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

            if (daysOverdue > 0) {
              overdue += amount;
              overdueCount++;
            }

            // Age analysis
            if (daysOverdue <= 30) current += amount;
            else if (daysOverdue <= 60) days31to60 += amount;
            else if (daysOverdue <= 90) days61to90 += amount;
            else overdueAnalysis += amount;
          } else {
            current += amount;
          }
        }
      });

      setStats({
        unpaidBills: { value: unpaid, count: unpaidCount },
        overdueBills: { value: overdue, count: overdueCount },
        paidBills: { value: paid, count: paidCount },
        totalOutstanding: { value: unpaid, count: unpaidCount }
      });

      setAgeAnalysis({
        current,
        days31to60,
        days61to90,
        overdue: overdueAnalysis
      });

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const statsCards = [
    { title: "Unpaid Bills", value: formatCurrency(stats.unpaidBills.value), count: stats.unpaidBills.count, icon: AlertCircle, color: "text-amber-500" },
    { title: "Overdue Bills", value: formatCurrency(stats.overdueBills.value), count: stats.overdueBills.count, icon: Clock, color: "text-destructive" },
    { title: "Paid Bills", value: formatCurrency(stats.paidBills.value), count: stats.paidBills.count, icon: CheckCircle, color: "text-primary" },
    { title: "Total Outstanding", value: formatCurrency(stats.totalOutstanding.value), count: stats.totalOutstanding.count, icon: FileText, color: "text-accent" },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>;
  }

  return (
    <div className="space-y-6 mt-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <Card key={stat.title} className="card-professional">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.count} bills</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-professional">
        <CardHeader>
          <CardTitle>Age Analysis Report (Accounts Payable)</CardTitle>
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
              <span className="font-bold text-destructive">{formatCurrency(ageAnalysis.overdue)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
