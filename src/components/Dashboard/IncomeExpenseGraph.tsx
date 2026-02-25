import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Download, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from 'xlsx';

interface IncomeExpenseData {
  month: string;
  income: number;
  expenses: number;
  profit: number;
  incomePctChange: number;
  expensePctChange: number;
}

interface IncomeExpenseGraphProps {
  data: IncomeExpenseData[];
}

export const IncomeExpenseGraph = ({ data }: IncomeExpenseGraphProps) => {
  const [period, setPeriod] = useState("12");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<IncomeExpenseData | null>(null);

  // Filter data based on selected period
  const filteredData = useMemo(() => {
    const monthsToShow = parseInt(period);
    return data.slice(-monthsToShow);
  }, [data, period]);

  const totalIncome = filteredData.reduce((sum, d) => sum + d.income, 0);
  const totalExpenses = filteredData.reduce((sum, d) => sum + d.expenses, 0);
  const netProfit = totalIncome - totalExpenses;
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

  const handlePointClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      setSelectedMonth(data.activePayload[0].payload);
      setDetailsOpen(true);
    }
  };

  const exportToCSV = () => {
    if (!selectedMonth) return;
    
    const exportData = [
      { Category: 'Income', Amount: selectedMonth.income, Change: `${selectedMonth.incomePctChange}%` },
      { Category: 'Expenses', Amount: selectedMonth.expenses, Change: `${selectedMonth.expensePctChange}%` },
      { Category: 'Net Profit', Amount: selectedMonth.profit, Change: '-' }
    ];

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${selectedMonth.month}_Summary`);
    XLSX.writeFile(wb, "Monthly_Summary.xlsx");
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
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Income:
              </span>
              <div className="text-right">
                <div className="font-bold">R {d.income.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                <div className={`text-[10px] flex items-center justify-end ${d.incomePctChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {d.incomePctChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(d.incomePctChange)}%
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500"></div> Expenses:
              </span>
              <div className="text-right">
                <div className="font-bold">R {d.expenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                <div className={`text-[10px] flex items-center justify-end ${d.expensePctChange <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                   {/* Lower expenses is better (green), Higher is worse (red) - logic inverted for visual cue */}
                  {d.expensePctChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(d.expensePctChange)}%
                </div>
              </div>
            </div>

            <div className="h-px bg-border my-1" />
            
            <div className="flex justify-between items-center font-medium">
              <span>Net Profit:</span>
              <span className={d.profit >= 0 ? "text-emerald-600" : "text-red-600"}>
                R {d.profit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
              </span>
            </div>
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
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                Income vs Expenses
                <div className="flex gap-3 text-xs font-normal text-muted-foreground mt-1">
                  <span>Net Profit: <span className={netProfit >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-600"}>R {netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 0 })}</span></span>
                  <span>Margin: <span className="font-medium text-foreground">{profitMargin.toFixed(1)}%</span></span>
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
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `R${(v/1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                
                <Area 
                  type="monotone" 
                  dataKey="income" 
                  name="Income" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorIncome)" 
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="expenses" 
                  name="Expenses" 
                  stroke="#EF4444" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorExpense)" 
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-4 text-center">
             <div className="bg-emerald-50/50 p-2 rounded border border-emerald-100">
               <div className="text-[10px] text-emerald-600 uppercase font-semibold">Total Income</div>
               <div className="text-sm font-bold text-emerald-700">R {totalIncome.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</div>
             </div>
             <div className="bg-red-50/50 p-2 rounded border border-red-100">
               <div className="text-[10px] text-red-600 uppercase font-semibold">Total Expenses</div>
               <div className="text-sm font-bold text-red-700">R {totalExpenses.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</div>
             </div>
             <div className={`p-2 rounded border ${netProfit >= 0 ? 'bg-blue-50/50 border-blue-100' : 'bg-orange-50/50 border-orange-100'}`}>
               <div className={`text-[10px] uppercase font-semibold ${netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Net Profit</div>
               <div className={`text-sm font-bold ${netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>R {netProfit.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}</div>
             </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedMonth?.month} Summary</DialogTitle>
            <DialogDescription>
              Financial performance overview
            </DialogDescription>
          </DialogHeader>
          
          {selectedMonth && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Net Profit / Loss</div>
                  <div className={`text-2xl font-bold ${selectedMonth.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    R {selectedMonth.profit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                {selectedMonth.profit >= 0 ? <TrendingUp className="h-8 w-8 text-emerald-500 opacity-50" /> : <TrendingDown className="h-8 w-8 text-red-500 opacity-50" />}
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Metric</TableHead>
                      <TableHead className="h-8 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="py-2 font-medium text-emerald-600">Total Income</TableCell>
                      <TableCell className="py-2 text-right font-medium">R {selectedMonth.income.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 font-medium text-red-600">Total Expenses</TableCell>
                      <TableCell className="py-2 text-right font-medium">R {selectedMonth.expenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
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
