import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShoppingCart, Download, TrendingUp, TrendingDown, Eye, EyeOff } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from 'xlsx';

interface PurchaseData {
  month: string;
  amount: number;
  cumulative: number;
  pctChange: number;
  topSuppliers: { name: string; amount: number }[];
}

interface PurchaseTrendGraphProps {
  data: PurchaseData[];
}

export const PurchaseTrendGraph = ({ data }: PurchaseTrendGraphProps) => {
  const [period, setPeriod] = useState("6");
  const [showTrend, setShowTrend] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<PurchaseData | null>(null);

  // Filter data based on selected period
  const filteredData = useMemo(() => {
    const monthsToShow = parseInt(period);
    return data.slice(-monthsToShow);
  }, [data, period]);

  const totalPeriodAmount = filteredData.reduce((sum, d) => sum + d.amount, 0);

  const handleBarClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      setSelectedMonth(data.activePayload[0].payload);
      setDetailsOpen(true);
    }
  };

  const getGrowthColor = (pct: number) => {
    if (pct > 0) return "#22C55E"; // Green
    if (pct < 0) return "#EF4444"; // Red
    return "#3B82F6"; // Blue (Neutral)
  };

  const exportToCSV = () => {
    if (!selectedMonth) return;
    
    const exportData = selectedMonth.topSuppliers.map(s => ({
      Month: selectedMonth.month,
      Supplier: s.name,
      Amount: s.amount
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${selectedMonth.month}_Purchases`);
    XLSX.writeFile(wb, "Purchase_Details.xlsx");
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
          <p className="font-semibold text-sm mb-2">{d.month}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purchases:</span>
              <span className="font-bold">R {d.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
            </div>
            {showTrend && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trend:</span>
                <span className={`font-bold flex items-center gap-1 ${d.pctChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {d.pctChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {d.pctChange}%
                </span>
              </div>
            )}
            <div className="h-px bg-border my-1" />
          <div className="font-semibold text-muted-foreground mb-1">Top Suppliers:</div>
            {d.topSuppliers && d.topSuppliers.length > 0 ? (
              d.topSuppliers.map((s: any, i: number) => (
                <div key={i} className="flex justify-between pl-2">
                  <span>{s.name}</span>
                  <span>R {s.amount.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}</span>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground pl-2 italic">No data</div>
            )}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground italic">Click bar for details</div>
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <Card className="card-professional shadow-md hover:shadow-lg transition-all duration-300">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <div className="p-2 bg-primary/10 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div>
                Purchase Trend
                <div className="text-xs font-normal text-muted-foreground mt-1">
                  Total for Period: <span className="font-medium text-foreground">R {totalPeriodAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowTrend(!showTrend)} title={showTrend ? "Hide Trend Line" : "Show Trend Line"}>
                {showTrend ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[110px] h-8 text-xs">
                  <SelectValue placeholder="Last 6 Months" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Last 3 Months</SelectItem>
                  <SelectItem value="6">Last 6 Months</SelectItem>
                  <SelectItem value="12">Last 12 Months</SelectItem>
                  <SelectItem value="24">Last 24 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filteredData} onClick={handleBarClick} className="cursor-pointer">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} hide={!showTrend} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.4)' }} content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                
                <Bar yAxisId="left" dataKey="amount" name="Monthly Purchases" radius={[4, 4, 0, 0]} barSize={32}>
                  {filteredData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pctChange >= 0 ? '#22C55E' : '#EF4444'} fillOpacity={0.8} />
                  ))}
                </Bar>
                
                {showTrend && (
                  <Line 
                    yAxisId="right" 
                    type="monotone" 
                    dataKey="pctChange" 
                    name="% Change (MoM)" 
                    stroke="#3B82F6" 
                    strokeWidth={2} 
                    dot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }} 
                    activeDot={{ r: 6 }} 
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex justify-center gap-6 mt-4 text-xs text-muted-foreground">
             <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#22C55E]" /> Increase vs Prev Month</div>
             <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#EF4444]" /> Decrease vs Prev Month</div>
             {showTrend && <div className="flex items-center gap-1.5"><div className="w-8 h-0.5 bg-[#3B82F6] relative"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#3B82F6] border border-white"></div></div> Trend Line (% Change)</div>}
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMonth?.month} Purchase Details</DialogTitle>
            <DialogDescription>
              Breakdown of top suppliers
            </DialogDescription>
          </DialogHeader>
          
          {selectedMonth && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Total Purchases</div>
                  <div className="text-xl font-bold text-foreground">R {selectedMonth.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">MoM Change</div>
                  <div className={`text-xl font-bold flex items-center gap-1 ${selectedMonth.pctChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {selectedMonth.pctChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {selectedMonth.pctChange}%
                  </div>
                </div>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Supplier</TableHead>
                      <TableHead className="h-8 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedMonth.topSuppliers.length > 0 ? (
                      selectedMonth.topSuppliers.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-2 font-medium">{s.name}</TableCell>
                          <TableCell className="py-2 text-right">R {s.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center py-4 text-muted-foreground">No supplier data available</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDetailsOpen(false)}>Close</Button>
                <Button variant="default" size="sm" onClick={exportToCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
