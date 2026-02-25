import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Receipt, Info, Download, Filter, ChevronRight, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from 'xlsx';

interface ARData {
  name: string;
  amount: number;
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
}

interface ARUnpaidGraphProps {
  data: ARData[];
  totalUnpaid: number;
  invoices?: any[];
}

export const ARUnpaidGraph = ({ data, totalUnpaid, invoices = [] }: ARUnpaidGraphProps) => {
  const [topN, setTopN] = useState<string>("10");
  const [period, setPeriod] = useState<string>("12");
  const [selectedCustomer, setSelectedCustomer] = useState<ARData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Calculate AR Data from raw invoices if available
  const processedData = useMemo(() => {
    if (!invoices || invoices.length === 0) return data;

    const months = parseInt(period);
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    const unpaidStatuses = new Set(['unpaid','pending','partial','sent','overdue','open']);
    const today = new Date();
    const arByCustomer: Record<string, ARData> = {};

    invoices.forEach((inv: any) => {
      const invDate = new Date(inv.invoice_date);
      if (invDate < cutoffDate) return;

      const amt = Number(inv.total_amount || 0);
      if (unpaidStatuses.has(String(inv.status || '').toLowerCase())) {
        const name = String(inv.customer_name || 'Unknown');
        
        if (!arByCustomer[name]) {
          arByCustomer[name] = { name, amount: 0, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
        }
        
        arByCustomer[name].amount += amt;
        
        const due = inv.due_date ? new Date(String(inv.due_date)) : null;
        if (due) {
          const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays <= 0) arByCustomer[name].current += amt;
          else if (diffDays <= 30) arByCustomer[name].days1_30 += amt;
          else if (diffDays <= 60) arByCustomer[name].days31_60 += amt;
          else if (diffDays <= 90) arByCustomer[name].days61_90 += amt;
          else arByCustomer[name].days90plus += amt;
        } else {
           arByCustomer[name].current += amt;
        }
      }
    });

    return Object.values(arByCustomer);
  }, [invoices, period, data]);

  // Filter top N customers
  const filteredData = useMemo(() => {
    return [...processedData]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, parseInt(topN));
  }, [processedData, topN]);

  // Recalculate total unpaid based on filtered period (optional, but good for consistency)
  const currentTotalUnpaid = useMemo(() => {
    if (!invoices || invoices.length === 0) return totalUnpaid;
    return processedData.reduce((sum, item) => sum + item.amount, 0);
  }, [processedData, totalUnpaid, invoices]);


  // Determine bar color based on risk level (highest overdue category dominant)
  const getRiskColor = (item: ARData) => {
    if (item.days90plus > 0) return "#EF4444"; // Red (High Risk)
    if (item.days61_90 > 0) return "#F97316"; // Orange
    if (item.days31_60 > 0) return "#F59E0B"; // Amber
    if (item.days1_30 > 0) return "#EAB308"; // Yellow
    return "#22C55E"; // Green (Current)
  };

  const handleBarClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const customer = data.activePayload[0].payload;
      setSelectedCustomer(customer);
      setDetailsOpen(true);
    }
  };

  const exportToCSV = () => {
    if (!selectedCustomer) return;
    
    // Flatten data for export
    const exportData = [
      { Category: "Current", Amount: selectedCustomer.current },
      { Category: "1-30 Days", Amount: selectedCustomer.days1_30 },
      { Category: "31-60 Days", Amount: selectedCustomer.days31_60 },
      { Category: "61-90 Days", Amount: selectedCustomer.days61_90 },
      { Category: "90+ Days", Amount: selectedCustomer.days90plus },
      { Category: "Total", Amount: selectedCustomer.amount },
    ];

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Details");
    XLSX.writeFile(wb, `${selectedCustomer.name}_AR_Details.xlsx`);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
          <p className="font-semibold text-sm mb-2">{d.name}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Unpaid:</span>
              <span className="font-bold">R {d.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="h-px bg-border my-1" />
            <div className="flex justify-between text-emerald-600">
              <span>Current:</span>
              <span>R {d.current.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-yellow-600">
              <span>1-30 Days:</span>
              <span>R {d.days1_30.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-amber-600">
              <span>31-60 Days:</span>
              <span>R {d.days31_60.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-orange-600">
              <span>61-90 Days:</span>
              <span>R {d.days61_90.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-red-600 font-medium">
              <span>90+ Days:</span>
              <span>R {d.days90plus.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground italic">Click for details</div>
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
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div>
                AR Unpaid (Top Customers)
                <div className="text-xs font-normal text-muted-foreground mt-1">
                  Total Outstanding: <span className="font-medium text-foreground">R {currentTotalUnpaid.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </CardTitle>
            
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Last 3 Months</SelectItem>
                  <SelectItem value="6">Last 6 Months</SelectItem>
                  <SelectItem value="12">Last 12 Months</SelectItem>
                  <SelectItem value="24">Last 24 Months</SelectItem>
                </SelectContent>
              </Select>
              <Select value={topN} onValueChange={setTopN}>
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue placeholder="Top 10" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Top 5</SelectItem>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="15">Top 15</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={filteredData} 
                layout="vertical" 
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                onClick={handleBarClick}
                className="cursor-pointer"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => `R ${Number(v/1000).toFixed(0)}k`} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis type="category" dataKey="name" width={120} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.4)' }} content={<CustomTooltip />} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={24}>
                  {filteredData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getRiskColor(entry)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#22C55E]" /> Current</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#EAB308]" /> 1-30 Days</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#F59E0B]" /> 31-60 Days</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#F97316]" /> 61-90 Days</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#EF4444]" /> 90+ Days</div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedCustomer?.name}</span>
              <Badge variant={selectedCustomer && selectedCustomer.days90plus > 0 ? "destructive" : "outline"}>
                {selectedCustomer && selectedCustomer.days90plus > 0 ? "High Risk" : "Standard"}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Detailed breakdown of outstanding balance
            </DialogDescription>
          </DialogHeader>
          
          {selectedCustomer && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">Total Outstanding</div>
                  <div className="text-xl font-bold text-foreground">R {selectedCustomer.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg">
                  <div className="text-xs text-muted-foreground">% of Total AR</div>
                  <div className="text-xl font-bold text-primary">
                    {totalUnpaid > 0 ? ((selectedCustomer.amount / totalUnpaid) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-8">Aging Category</TableHead>
                      <TableHead className="h-8 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="py-2 text-emerald-600 font-medium">Current</TableCell>
                      <TableCell className="py-2 text-right">R {selectedCustomer.current.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 text-yellow-600 font-medium">1-30 Days Overdue</TableCell>
                      <TableCell className="py-2 text-right">R {selectedCustomer.days1_30.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 text-amber-600 font-medium">31-60 Days Overdue</TableCell>
                      <TableCell className="py-2 text-right">R {selectedCustomer.days31_60.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 text-orange-600 font-medium">61-90 Days Overdue</TableCell>
                      <TableCell className="py-2 text-right">R {selectedCustomer.days61_90.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="py-2 text-red-600 font-bold flex items-center gap-2">
                        90+ Days Overdue
                        {selectedCustomer.days90plus > 0 && <AlertTriangle className="h-3 w-3" />}
                      </TableCell>
                      <TableCell className="py-2 text-right font-bold text-red-600">R {selectedCustomer.days90plus.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
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
