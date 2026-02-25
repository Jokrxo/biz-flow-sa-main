import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Calendar, FileText, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";

export const TaxOverview = () => {
  const [vatDue, setVatDue] = useState<number>(0);
  const [nextFiling, setNextFiling] = useState<string>("—");
  const [series, setSeries] = useState<Array<{ month: string; vatOutput: number; vatInput: number }>>([]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (!profile?.company_id) return;

      // Pull VAT related entries for company to compute net VAT due = VAT Output - VAT Input
      const { data, error } = await supabase
        .from("transaction_entries")
        .select(`
          debit, credit,
          transactions!inner(company_id, transaction_date, status),
          chart_of_accounts!inner(account_name, account_type)
        `)
        .eq('transactions.company_id', profile.company_id)
        .in('transactions.status', ['pending','approved','posted']);
      if (error) return;

      let output = 0;
      let input = 0;
      const monthMap = new Map<string, { vatOutput: number; vatInput: number }>();
      for (const e of (data || []) as any[]) {
        const name = String(e.chart_of_accounts?.account_name || '').toLowerCase();
        if (!name.includes('vat') && !name.includes('tax')) continue;
        const debit = Number(e.debit || 0);
        const credit = Number(e.credit || 0);
        const dt = e.transactions?.transaction_date ? new Date(e.transactions.transaction_date) : null;
        const key = dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : '';
        const label = dt ? dt.toLocaleString('en-ZA', { month: 'short' }) : '';
        const out = Math.max(0, credit - debit);
        const inn = Math.max(0, debit - credit);
        output += out;
        input += inn;
        if (key) {
          const prev = monthMap.get(key) || { vatOutput: 0, vatInput: 0 };
          monthMap.set(key, { vatOutput: prev.vatOutput + out, vatInput: prev.vatInput + inn });
        }
      }

      if (!data || data.length === 0) {
        const { data: txs } = await supabase
          .from('transactions')
          .select('transaction_date, company_id, vat_rate, vat_amount, status, transaction_type')
          .eq('company_id', profile.company_id)
          .in('status', ['pending','approved','posted']);
        for (const t of (txs || []) as any[]) {
          const rate = Number(t.vat_rate || 0);
          const vat = Number(t.vat_amount || 0);
          if (rate <= 0 || vat <= 0) continue;
          const type = String(t.transaction_type || '').toLowerCase();
          const isIncome = type === 'income' || type === 'sales' || type === 'receipt';
          const isPurchase = type === 'expense' || type === 'purchase' || type === 'bill' || type === 'product_purchase';
          const dt = t.transaction_date ? new Date(t.transaction_date) : null;
          const key = dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : '';
          if (isIncome) {
            output += vat;
            if (key) {
              const prev = monthMap.get(key) || { vatOutput: 0, vatInput: 0 };
              monthMap.set(key, { vatOutput: prev.vatOutput + vat, vatInput: prev.vatInput });
            }
          } else if (isPurchase) {
            input += vat;
            if (key) {
              const prev = monthMap.get(key) || { vatOutput: 0, vatInput: 0 };
              monthMap.set(key, { vatOutput: prev.vatOutput, vatInput: prev.vatInput + vat });
            }
          }
        }
      }
      setVatDue(Math.max(0, output - input));

      // Simple next filing date: last day of current month + 25 days (placeholder)
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 25);
      setNextFiling(next.toLocaleDateString('en-ZA'));

      const sorted = Array.from(monthMap.entries()).sort(([a],[b]) => a.localeCompare(b));
      const formatted = sorted.map(([key, vals]) => ({ month: key, vatOutput: vals.vatOutput, vatInput: vals.vatInput }));
      setSeries(formatted);
    };
    load();
  }, []);

  const stats = [
    { title: "Current VAT Due", value: `R ${vatDue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, period: "Live from ledger", icon: DollarSign, color: "text-primary" },
    { title: "Next Filing Date", value: nextFiling, period: "Estimated", icon: Calendar, color: "text-accent" },
    { title: "Submitted Returns", value: "—", period: "Coming soon", icon: FileText, color: "text-primary" },
    { title: "Pending Action", value: vatDue > 0 ? "Payable" : "—", period: vatDue > 0 ? "Review & file" : "—", icon: AlertCircle, color: "text-amber-500" },
  ];

  return (
    <div className="space-y-6 mt-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-md bg-gradient-to-br from-primary/10 via-primary/5 to-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current VAT Due</CardTitle>
            <DollarSign className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">R {vatDue.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">Live from ledger</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-background">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium text-muted-foreground">Next Filing Date</CardTitle>
             <Calendar className="h-5 w-5 text-blue-600" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold text-blue-700">{nextFiling}</div>
             <p className="text-xs text-muted-foreground mt-1">Estimated</p>
           </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-background">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium text-muted-foreground">Submitted Returns</CardTitle>
             <FileText className="h-5 w-5 text-purple-600" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold text-purple-700">—</div>
             <p className="text-xs text-muted-foreground mt-1">Coming soon</p>
           </CardContent>
        </Card>

        <Card className="border-none shadow-md bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-background">
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <CardTitle className="text-sm font-medium text-muted-foreground">Pending Action</CardTitle>
             <AlertCircle className="h-5 w-5 text-amber-600" />
           </CardHeader>
           <CardContent>
             <div className="text-2xl font-bold text-amber-700">{vatDue > 0 ? "Payable" : "—"}</div>
             <p className="text-xs text-muted-foreground mt-1">{vatDue > 0 ? "Review & file" : "—"}</p>
           </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-md">
        <CardHeader className="border-b bg-muted/10 pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            VAT Trends (Output vs Input)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {series.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-3">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No VAT Data Available</h3>
              <p className="text-muted-foreground max-w-sm mt-1">
                Start recording transactions with VAT to see your tax liability trends here.
              </p>
            </div>
          ) : (
            <div className="h-[350px] w-full">
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} 
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} 
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `R${val}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      borderColor: 'hsl(var(--border))', 
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
                    }}
                    itemStyle={{ fontSize: '12px' }}
                    labelStyle={{ fontWeight: 'bold', marginBottom: '4px' }}
                    formatter={(v: any) => [`R ${Number(v).toLocaleString('en-ZA', {minimumFractionDigits: 2})}`]} 
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Line 
                    type="monotone" 
                    dataKey="vatOutput" 
                    name="VAT Output (Sales)" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={3} 
                    dot={{ r: 4, strokeWidth: 2 }} 
                    activeDot={{ r: 6 }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="vatInput" 
                    name="VAT Input (Purchases)" 
                    stroke="#ef4444" 
                    strokeWidth={3} 
                    dot={{ r: 4, strokeWidth: 2 }} 
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
