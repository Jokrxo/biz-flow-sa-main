import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, PieChart, Download, DollarSign, Percent, LineChart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ComposedChart, Line } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from 'xlsx';

interface CostData {
  month: string;
  cogs: number;
  opex: number;
  total: number;
  cogsPct: number;
  opexPct: number;
}

interface CostStructureGraphProps {
  data: CostData[];
}

export const CostStructureGraph = ({ data }: CostStructureGraphProps) => {
  const [period, setPeriod] = useState("12");
  const [viewMode, setViewMode] = useState<"absolute" | "percentage">("absolute");
  const [showTrend, setShowTrend] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<CostData | null>(null);

  // Filter data based on selected period
  const filteredData = useMemo(() => {
    const monthsToShow = parseInt(period);
    return data.slice(-monthsToShow);
  }, [data, period]);

  const totalCogs = filteredData.reduce((sum, d) => sum + d.cogs, 0);
  const totalOpex = filteredData.reduce((sum, d) => sum + d.opex, 0);
  const totalCosts = totalCogs + totalOpex;
  const avgCogsPct = totalCosts > 0 ? (totalCogs / totalCosts) * 100 : 0;

  const handleBarClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      setSelectedMonth(data.activePayload[0].payload);
      setDetailsOpen(true);
    }
  };

  const exportToCSV = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.map(d => ({
      Month: d.month,
      'COGS': d.cogs,
      'OPEX': d.opex,
      'Total': d.total,
      'COGS %': `${d.cogsPct}%`,
      'OPEX %': `${d.opexPct}%`
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cost_Structure");
    XLSX.writeFile(wb, "Cost_Structure_Analysis.xlsx");
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
          <p className="font-semibold text-sm mb-2">{d.month}</p>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-orange-500"></div> COGS:
              </span>
              <div className="text-right">
                <div className="font-bold">R {d.cogs.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                <div className="text-[10px] text-muted-foreground">{d.cogsPct}% of Total</div>
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-amber-500"></div> OPEX:
              </span>
              <div className="text-right">
                <div className="font-bold">R {d.opex.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                <div className="text-[10px] text-muted-foreground">{d.opexPct}% of Total</div>
              </div>
            </div>

            <div className="h-px bg-border my-1" />
            
            <div className="flex justify-between items-center font-medium">
              <span>Total Costs:</span>
              <span>R {d.total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
            </div>
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
                <PieChart className="h-5 w-5 text-primary" />
              </div>
              <div>
                Cost Structure (COGS vs OPEX)
                <div className="flex gap-3 text-xs font-normal text-muted-foreground mt-1">
                  <span>COGS Ratio: <span className="font-medium text-foreground">{avgCogsPct.toFixed(1)}%</span></span>
                  <span>Total: <span className="font-medium text-foreground">R {totalCosts.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</span></span>
                </div>
              </div>
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <div className="flex bg-muted rounded-md p-0.5">
                <Button 
                  variant={viewMode === 'absolute' ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-7 w-7 rounded-sm" 
                  onClick={() => setViewMode('absolute')}
                  title="Absolute Value"
                >
                  <DollarSign className="h-3.5 w-3.5" />
                </Button>
                <Button 
                  variant={viewMode === 'percentage' ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-7 w-7 rounded-sm" 
                  onClick={() => setViewMode('percentage')}
                  title="Percentage View"
                >
                  <Percent className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={showTrend ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 rounded-sm ml-1"
                  onClick={() => setShowTrend(!showTrend)}
                  title={showTrend ? "Hide Trend Line" : "Show Trend Line"}
                >
                  <LineChart className="h-3.5 w-3.5" />
                </Button>
              </div>
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
              <ComposedChart 
                data={filteredData} 
                stackOffset={viewMode === 'percentage' ? 'expand' : 'none'}
                onClick={handleBarClick} 
                className="cursor-pointer"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis 
                  yAxisId="left"
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={12} 
                  tickFormatter={viewMode === 'percentage' ? (v) => `${(v * 100).toFixed(0)}%` : (v) => `R${(v/1000).toFixed(0)}k`} 
                  tickLine={false} 
                  axisLine={false} 
                />
                {showTrend && viewMode === 'absolute' && (
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12} 
                    tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} 
                    tickLine={false} 
                    axisLine={false} 
                    hide
                  />
                )}
                <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.4)' }} content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                
                <Bar yAxisId="left" dataKey={viewMode === 'percentage' ? 'cogs' : 'cogs'} stackId="a" name="COGS" fill="#F97316" radius={viewMode === 'percentage' ? [0,0,0,0] : [0,0,4,4]} />
                <Bar yAxisId="left" dataKey={viewMode === 'percentage' ? 'opex' : 'opex'} stackId="a" name="OPEX" fill="#F59E0B" radius={viewMode === 'percentage' ? [4,4,0,0] : [4,4,0,0]} />
                
                {showTrend && viewMode === 'absolute' && (
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="total"
                    name="Total Trend"
                    stroke="#EF4444"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#EF4444", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 5 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-4 text-center">
             <div className="bg-orange-50/50 p-2 rounded border border-orange-100">
               <div className="text-[10px] text-orange-600 uppercase font-semibold">Total COGS</div>
               <div className="text-sm font-bold text-orange-700">R {totalCogs.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</div>
             </div>
             <div className="bg-amber-50/50 p-2 rounded border border-amber-100">
               <div className="text-[10px] text-amber-600 uppercase font-semibold">Total OPEX</div>
               <div className="text-sm font-bold text-amber-700">R {totalOpex.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</div>
             </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMonth?.month} Cost Analysis</DialogTitle>
            <DialogDescription>
              Breakdown of expenses
            </DialogDescription>
          </DialogHeader>
          
          {selectedMonth && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Total Costs</div>
                  <div className="text-xl font-bold text-foreground">R {selectedMonth.total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">COGS Ratio</div>
                  <div className="text-xl font-bold text-orange-600">
                    {selectedMonth.cogsPct}%
                  </div>
                </div>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Category</TableHead>
                      <TableHead className="h-8 text-right">Amount</TableHead>
                      <TableHead className="h-8 text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="py-2 font-medium text-orange-600">COGS</TableCell>
                      <TableCell className="py-2 text-right">R {selectedMonth.cogs.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="py-2 text-right text-muted-foreground">{selectedMonth.cogsPct}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 font-medium text-amber-600">OPEX</TableCell>
                      <TableCell className="py-2 text-right">R {selectedMonth.opex.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="py-2 text-right text-muted-foreground">{selectedMonth.opexPct}%</TableCell>
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
