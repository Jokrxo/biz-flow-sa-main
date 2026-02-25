import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export const QuotesReport = () => {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const loadQuotes = async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user?.id)
          .single();

        if (!profile) return;

        const { data, error } = await supabase
          .from("quotes")
          .select("*")
          .eq("company_id", profile.company_id);

        if (error) throw error;
        setQuotes(data || []);
      } catch (error) {
        console.error("Error loading quotes for report:", error);
      } finally {
        setLoading(false);
      }
    };

    loadQuotes();
  }, [user]);

  const metrics = useMemo(() => ({
    total: quotes.reduce((acc, q) => acc + Number(q.total_amount || 0), 0),
    count: quotes.length,
    accepted: quotes.filter(q => q.status === 'accepted' || q.status === 'converted').length,
  }), [quotes]);

  const statusData = useMemo(() => {
    const total = quotes.length;
    return [
      { name: 'Draft', value: quotes.filter(q => q.status === 'draft').length, percentage: total > 0 ? Math.round((quotes.filter(q => q.status === 'draft').length / total) * 100) : 0 },
      { name: 'Sent', value: quotes.filter(q => q.status === 'sent').length, percentage: total > 0 ? Math.round((quotes.filter(q => q.status === 'sent').length / total) * 100) : 0 },
      { name: 'Accepted', value: quotes.filter(q => q.status === 'accepted' || q.status === 'converted').length, percentage: total > 0 ? Math.round((quotes.filter(q => q.status === 'accepted' || q.status === 'converted').length / total) * 100) : 0 },
      { name: 'Expired', value: quotes.filter(q => q.status === 'expired').length, percentage: total > 0 ? Math.round((quotes.filter(q => q.status === 'expired').length / total) * 100) : 0 },
    ].filter(i => i.value > 0);
  }, [quotes]);

  const monthlyData = useMemo(() => {
    const data: Record<string, number> = {};
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    quotes.forEach(q => {
      const d = new Date(q.quote_date);
      const key = `${months[d.getMonth()]} ${d.getFullYear().toString().substr(2)}`;
      data[key] = (data[key] || 0) + (q.total_amount || 0);
    });

    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .slice(-6);
  }, [quotes]);

  if (loading) {
    return <div className="flex justify-center p-8"><LoadingSpinner /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Quote Value by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R${value/1000}k`} />
                  <RechartsTooltip formatter={(value) => [`R ${Number(value).toLocaleString()}`, 'Value']} />
                  <Bar dataKey="value" fill="#8884d8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
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
                  <RechartsTooltip formatter={(value, name, props) => [`${value} (${props.payload.percentage}%)`, name]} />
                  <Legend verticalAlign="bottom" height={36} formatter={(value, entry) => {
                    const item = statusData.find(d => d.name === value);
                    return `${value}: ${item?.percentage || 0}%`;
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="col-span-1 md:col-span-2">
          <h3 className="text-lg font-semibold mb-4">Summary Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-muted/30 rounded-lg border">
              <div className="text-sm text-muted-foreground">Total Quotes</div>
              <div className="text-2xl font-bold mt-1">{metrics.count}</div>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg border">
              <div className="text-sm text-muted-foreground">Total Value</div>
              <div className="text-2xl font-bold mt-1">R {metrics.total.toLocaleString()}</div>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg border">
              <div className="text-sm text-muted-foreground">Conversion Rate</div>
              <div className="text-2xl font-bold mt-1">
                {metrics.count > 0 ? Math.round((metrics.accepted / metrics.count) * 100) : 0}%
              </div>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg border">
              <div className="text-sm text-muted-foreground">Avg. Quote Value</div>
              <div className="text-2xl font-bold mt-1">
                R {metrics.count > 0 ? Math.round(metrics.total / metrics.count).toLocaleString() : 0}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
         <Button onClick={() => window.print()} variant="outline">Print Report</Button>
      </div>
    </div>
  );
};
