import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/useAuth";

export const AssetsPurchaseGraph = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();
      
      if (!profile?.company_id) return;

      const { data: assets } = await supabase
        .from("fixed_assets")
        .select("cost, purchase_date")
        .eq("company_id", profile.company_id)
        .order("purchase_date", { ascending: true });

      if (assets) {
        // Group by Month
        const grouped = assets.reduce((acc: any, asset: any) => {
          const date = new Date(asset.purchase_date);
          const key = date.toLocaleString('default', { month: 'short', year: 'numeric' });
          if (!acc[key]) {
            acc[key] = 0;
          }
          acc[key] += Number(asset.cost);
          return acc;
        }, {});

        const chartData = Object.entries(grouped).map(([name, value]) => ({
          name,
          value
        }));

        setData(chartData);
      }
    } catch (error) {
      console.error("Error loading assets:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Assets Purchase History</CardTitle>
      </CardHeader>
      <CardContent className="h-[400px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No asset purchase data available.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(value) => `R${value/1000}k`} 
              />
              <Tooltip 
                formatter={(value: number) => [`R ${value.toLocaleString('en-ZA')}`, 'Cost']}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Legend />
              <Bar dataKey="value" name="Purchase Cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
