import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Percent, Download, Eye, EyeOff, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from 'xlsx';

interface MarginData {
  month: string;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
}

interface ProfitabilityMarginsGraphProps {
  data: MarginData[];
}

export const ProfitabilityMarginsGraph = ({ data }: ProfitabilityMarginsGraphProps) => {
  const [period, setPeriod] = useState("12");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MarginData | null>(null);
  
  // Visibility toggles
  const [showGross, setShowGross] = useState(true);
  const [showOperating, setShowOperating] = useState(true);
  const [showNet, setShowNet] = useState(true);

  // Filter data based on selected period
  const filteredData = useMemo(() => {
    const monthsToShow = parseInt(period);
    return data.slice(-monthsToShow);
  }, [data, period]);

  // Calculate Averages
  const avgGross = filteredData.reduce((sum, d) => sum + d.grossMargin, 0) / (filteredData.length || 1);
  const avgOperating = filteredData.reduce((sum, d) => sum + d.operatingMargin, 0) / (filteredData.length || 1);
  const avgNet = filteredData.reduce((sum, d) => sum + d.netMargin, 0) / (filteredData.length || 1);

  const handlePointClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      setSelectedMonth(data.activePayload[0].payload);
      setDetailsOpen(true);
    }
  };

  const exportToCSV = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.map(d => ({
      Month: d.month,
      'Gross Margin %': `${d.grossMargin}%`,
      'Operating Margin %': `${d.operatingMargin}%`,
      'Net Margin %': `${d.netMargin}%`
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Profitability_Margins");
    XLSX.writeFile(wb, "Profitability_Analysis.xlsx");
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
          <p className="font-semibold text-sm mb-2">{d.month}</p>
          <div className="space-y-2 text-xs">
            {showGross && (
              <div className="flex justify-between items-center">
                <span className="text-blue-600 font-medium">Gross Margin:</span>
                <span className="font-bold">{d.grossMargin.toFixed(1)}%</span>
              </div>
            )}
            {showOperating && (
              <div className="flex justify-between items-center">
                <span className="text-orange-600 font-medium">Operating Margin:</span>
                <span className="font-bold">{d.operatingMargin.toFixed(1)}%</span>
              </div>
            )}
            {showNet && (
              <div className="flex justify-between items-center">
                <span className="text-emerald-600 font-medium">Net Margin:</span>
                <span className="font-bold">{d.netMargin.toFixed(1)}%</span>
              </div>
            )}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground italic">Click point for details</div>
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
                <Percent className="h-5 w-5 text-primary" />
              </div>
              <div>
                Profitability Margins
                <div className="flex gap-3 text-xs font-normal text-muted-foreground mt-1">
                  <span>Avg Net: <span className="font-medium text-emerald-600">{avgNet.toFixed(1)}%</span></span>
                  <span>Avg Gross: <span className="font-medium text-blue-600">{avgGross.toFixed(1)}%</span></span>
                </div>
              </div>
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <div className="flex bg-muted rounded-md p-0.5">
                <Button 
                  variant={showGross ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-7 w-7 rounded-sm text-blue-600" 
                  onClick={() => setShowGross(!showGross)}
                  title="Toggle Gross Margin"
                >
                  {showGross ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                <Button 
                  variant={showOperating ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-7 w-7 rounded-sm text-orange-600" 
                  onClick={() => setShowOperating(!showOperating)}
                  title="Toggle Operating Margin"
                >
                  {showOperating ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
                <Button 
                  variant={showNet ? 'secondary' : 'ghost'} 
                  size="icon" 
                  className="h-7 w-7 rounded-sm text-emerald-600" 
                  onClick={() => setShowNet(!showNet)}
                  title="Toggle Net Margin"
                >
                  {showNet ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
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
              <LineChart data={filteredData} onClick={handlePointClick} className="cursor-pointer">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }} content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                
                {showGross && (
                  <Line 
                    type="monotone" 
                    dataKey="grossMargin" 
                    name="Gross Margin" 
                    stroke="#3B82F6" 
                    strokeWidth={2} 
                    dot={{ r: 3, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 6 }}
                  />
                )}
                {showOperating && (
                  <Line 
                    type="monotone" 
                    dataKey="operatingMargin" 
                    name="Operating Margin" 
                    stroke="#F97316" 
                    strokeWidth={2} 
                    dot={{ r: 3, fill: "#F97316", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 6 }}
                  />
                )}
                {showNet && (
                  <Line 
                    type="monotone" 
                    dataKey="netMargin" 
                    name="Net Margin" 
                    stroke="#10B981" 
                    strokeWidth={2} 
                    dot={{ r: 3, fill: "#10B981", strokeWidth: 2, stroke: "#fff" }}
                    activeDot={{ r: 6 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
             <div className="bg-blue-50/50 p-2 rounded border border-blue-100">
               <div className="text-[10px] text-blue-600 uppercase font-semibold">Avg Gross Margin</div>
               <div className="text-sm font-bold text-blue-700">{avgGross.toFixed(1)}%</div>
             </div>
             <div className="bg-orange-50/50 p-2 rounded border border-orange-100">
               <div className="text-[10px] text-orange-600 uppercase font-semibold">Avg Operating Margin</div>
               <div className="text-sm font-bold text-orange-700">{avgOperating.toFixed(1)}%</div>
             </div>
             <div className="bg-emerald-50/50 p-2 rounded border border-emerald-100">
               <div className="text-[10px] text-emerald-600 uppercase font-semibold">Avg Net Margin</div>
               <div className="text-sm font-bold text-emerald-700">{avgNet.toFixed(1)}%</div>
             </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMonth?.month} Margin Analysis</DialogTitle>
            <DialogDescription>
              Profitability breakdown
            </DialogDescription>
          </DialogHeader>
          
          {selectedMonth && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Net Margin Performance</div>
                  <div className={`text-2xl font-bold ${selectedMonth.netMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {selectedMonth.netMargin.toFixed(1)}%
                  </div>
                </div>
                <Activity className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Margin Type</TableHead>
                      <TableHead className="h-8 text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="py-2 font-medium text-blue-600">Gross Margin</TableCell>
                      <TableCell className="py-2 text-right font-bold">{selectedMonth.grossMargin.toFixed(1)}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 font-medium text-orange-600">Operating Margin</TableCell>
                      <TableCell className="py-2 text-right font-bold">{selectedMonth.operatingMargin.toFixed(1)}%</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 font-medium text-emerald-600">Net Margin</TableCell>
                      <TableCell className="py-2 text-right font-bold">{selectedMonth.netMargin.toFixed(1)}%</TableCell>
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
