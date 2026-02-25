import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Download, DollarSign, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from 'xlsx';

interface NetProfitData {
  month: string;
  netProfit: number;
  pctChange: number;
}

interface NetProfitTrendGraphProps {
  data: NetProfitData[];
}

export const NetProfitTrendGraph = ({ data }: NetProfitTrendGraphProps) => {
  const [period, setPeriod] = useState("12");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<NetProfitData | null>(null);

  // Filter data based on selected period
  const filteredData = useMemo(() => {
    const monthsToShow = parseInt(period);
    return data.slice(-monthsToShow);
  }, [data, period]);

  const totalProfit = filteredData.reduce((sum, d) => sum + d.netProfit, 0);
  const averageProfit = totalProfit / (filteredData.length || 1);
  const maxProfit = Math.max(...filteredData.map(d => d.netProfit));
  const minProfit = Math.min(...filteredData.map(d => d.netProfit));

  const handlePointClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      setSelectedMonth(data.activePayload[0].payload);
      setDetailsOpen(true);
    }
  };

  const exportToCSV = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.map(d => ({
      Month: d.month,
      'Net Profit': d.netProfit,
      'Change %': `${d.pctChange}%`
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Net_Profit_Trend");
    XLSX.writeFile(wb, "Net_Profit_Trend.xlsx");
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
          <p className="font-semibold text-sm mb-2">{d.month}</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Net Profit:</span>
              <span className={`font-bold text-sm ${d.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                R {d.netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Change (MoM):</span>
              <div className={`text-xs flex items-center gap-1 font-medium ${d.pctChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {d.pctChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {d.pctChange}%
              </div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground italic">Click point for details</div>
        </div>
      );
    }
    return null;
  };

  // Gradient offset for coloring the area chart (Green above 0, Red below 0)
  const gradientOffset = () => {
    const dataMax = Math.max(...filteredData.map((i) => i.netProfit));
    const dataMin = Math.min(...filteredData.map((i) => i.netProfit));
  
    if (dataMax <= 0) {
      return 0;
    }
    if (dataMin >= 0) {
      return 1;
    }
  
    return dataMax / (dataMax - dataMin);
  };
  
  const off = gradientOffset();

  return (
    <>
      <Card className="card-professional shadow-md hover:shadow-lg transition-all duration-300">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <div className="p-2 bg-primary/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                Net Profit Trend
                <div className="flex gap-3 text-xs font-normal text-muted-foreground mt-1">
                  <span>Avg: <span className="font-medium text-foreground">R {averageProfit.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</span></span>
                  <span>Total: <span className={totalProfit >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"}>R {totalProfit.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</span></span>
                </div>
              </div>
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[110px] h-8 text-xs">
                  <SelectValue placeholder="Last 12 Months" />
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
              <AreaChart data={filteredData} onClick={handlePointClick} className="cursor-pointer">
                <defs>
                  <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={off} stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset={off} stopColor="#EF4444" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }} content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                
                <Area 
                  type="monotone" 
                  dataKey="netProfit" 
                  name="Net Profit" 
                  stroke="#3B82F6" 
                  strokeWidth={2}
                  fill="url(#splitColor)" 
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-4 text-center">
             <div className="bg-emerald-50/50 p-2 rounded border border-emerald-100">
               <div className="text-[10px] text-emerald-600 uppercase font-semibold">Highest Profit</div>
               <div className="text-sm font-bold text-emerald-700">R {maxProfit.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</div>
             </div>
             <div className="bg-red-50/50 p-2 rounded border border-red-100">
               <div className="text-[10px] text-red-600 uppercase font-semibold">Lowest Profit (Max Loss)</div>
               <div className="text-sm font-bold text-red-700">R {minProfit.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</div>
             </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMonth?.month} Net Profit Details</DialogTitle>
            <DialogDescription>
              Financial performance snapshot
            </DialogDescription>
          </DialogHeader>
          
          {selectedMonth && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Net Result</div>
                  <div className={`text-2xl font-bold ${selectedMonth.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    R {selectedMonth.netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                {selectedMonth.netProfit >= 0 ? <TrendingUp className="h-8 w-8 text-emerald-500 opacity-50" /> : <TrendingDown className="h-8 w-8 text-red-500 opacity-50" />}
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Metric</TableHead>
                      <TableHead className="h-8 text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="py-2 font-medium">Net Profit</TableCell>
                      <TableCell className={`py-2 text-right font-bold ${selectedMonth.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        R {selectedMonth.netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 font-medium text-muted-foreground">Change vs Last Month</TableCell>
                      <TableCell className={`py-2 text-right font-medium flex items-center justify-end gap-1 ${selectedMonth.pctChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {selectedMonth.pctChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {selectedMonth.pctChange}%
                      </TableCell>
                    </TableRow>
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
