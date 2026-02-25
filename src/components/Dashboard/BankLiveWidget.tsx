import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CreditCard, AlertCircle, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BankLiveWidgetProps {
  data: {
    totalAmount: number;
    pending: { amount: number; count: number; oldestDate: string | null };
    approved: { amount: number; count: number };
    posted: { amount: number; count: number };
    matchStatus: boolean;
    lastSync: Date;
  };
  transactions?: any[];
  periodLabel?: string;
}

export const BankLiveWidget = ({ data, transactions = [], periodLabel = "Current Period" }: BankLiveWidgetProps) => {
  const navigate = useNavigate();
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [period, setPeriod] = useState("24");

  // Filter transactions based on selected period
  const filteredMetrics = useMemo(() => {
    if (!transactions || transactions.length === 0) return data;

    const months = parseInt(period);
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    const filtered = transactions.filter(t => new Date(t.transaction_date) >= cutoffDate);

    const pending = filtered.filter(t => t.status === 'pending');
    const approved = filtered.filter(t => t.status === 'approved');
    const posted = filtered.filter(t => t.status === 'posted');

    // Find oldest pending date
    let oldestPending = null;
    if (pending.length > 0) {
      const sortedPending = [...pending].sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
      oldestPending = sortedPending[0].transaction_date;
    }

    return {
      totalAmount: filtered.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
      pending: {
        amount: pending.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
        count: pending.length,
        oldestDate: oldestPending
      },
      approved: {
        amount: approved.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
        count: approved.length
      },
      posted: {
        amount: posted.reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
        count: posted.length
      },
      matchStatus: data.matchStatus,
      lastSync: data.lastSync
    };
  }, [data, transactions, period]);

  const chartData = useMemo(() => [
    { name: 'Pending', value: filteredMetrics.pending.amount, count: filteredMetrics.pending.count, color: '#f59e0b', status: 'pending' },
    { name: 'Approved', value: filteredMetrics.approved.amount, count: filteredMetrics.approved.count, color: '#3b82f6', status: 'approved' },
    { name: 'Posted', value: filteredMetrics.posted.amount, count: filteredMetrics.posted.count, color: '#22c55e', status: 'posted' },
  ].filter(d => d.value > 0), [filteredMetrics]);

  // If no data, show empty ring
  const displayData = chartData.length > 0 ? chartData : [{ name: 'No Data', value: 1, count: 0, color: '#e5e7eb', status: 'none' }];

  const pendingThreshold = 5; // Example threshold for count
  const isPendingHigh = filteredMetrics.pending.count > pendingThreshold;

  const handleSliceClick = (entry: any) => {
    if (entry.status !== 'none') {
      navigate(`/transactions?status=${entry.status}`);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      if (d.status === 'none') return null;
      
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-[180px] z-50">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="font-semibold text-sm">{d.name}</span>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Amount:</span>
              <span className="font-medium text-foreground">R {d.value.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span>Count:</span>
              <span className="font-medium text-foreground">{d.count} txns</span>
            </div>
            {d.status === 'pending' && filteredMetrics.pending.oldestDate && (
               <div className="flex justify-between text-amber-600 mt-1 pt-1 border-t border-amber-100">
                 <span>Oldest:</span>
                 <span>{formatDistanceToNow(new Date(filteredMetrics.pending.oldestDate))} ago</span>
               </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className={`card-professional shadow-md hover:shadow-lg transition-all duration-300 relative overflow-hidden ${isPendingHigh ? 'border-amber-200/50' : ''}`}>
      {isPendingHigh && (
        <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-amber-500/10 to-transparent pointer-events-none animate-pulse" />
      )}
      
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-3 pt-4 px-4 h-[60px]">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <CreditCard className="h-4 w-4 text-primary" />
          </div>
          Bank Live
        </CardTitle>
        <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[110px] h-7 text-[10px] px-2">
                <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="3">3 M</SelectItem>
                <SelectItem value="6">6 M</SelectItem>
                <SelectItem value="12">12 M</SelectItem>
                <SelectItem value="24">24 M</SelectItem>
            </SelectContent>
            </Select>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[10px] h-5 px-1.5 gap-1 animate-pulse">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Live
            </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between gap-4">
          {/* Donut Chart */}
          <div className="relative h-[120px] w-[120px] flex-shrink-0 mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={displayData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={55}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={handleSliceClick}
                  cursor="pointer"
                  stroke="none"
                >
                  {displayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} className="outline-none focus:outline-none transition-all duration-300 hover:opacity-80" />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
              <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter leading-none mb-0.5 max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                {periodLabel}
              </span>
              <span className="text-xs font-bold text-foreground truncate max-w-[80px]">
                {data.totalAmount >= 1000000 
                  ? `${(data.totalAmount / 1000000).toFixed(1)}M` 
                  : `${(data.totalAmount / 1000).toFixed(1)}k`}
              </span>
            </div>
          </div>

          {/* Quick Stats / Legend */}
          <div className="flex flex-col justify-center gap-2 flex-1 min-w-0">
             <div className="flex items-center justify-between text-xs cursor-pointer hover:bg-muted/50 p-1 rounded transition-colors" onClick={() => navigate('/transactions?status=pending')}>
               <div className="flex items-center gap-1.5">
                 <div className="w-2 h-2 rounded-full bg-amber-500" />
                 <span className="text-muted-foreground">Pending</span>
               </div>
               <span className="font-medium">{data.pending.count}</span>
             </div>
             <div className="flex items-center justify-between text-xs cursor-pointer hover:bg-muted/50 p-1 rounded transition-colors" onClick={() => navigate('/transactions?status=approved')}>
               <div className="flex items-center gap-1.5">
                 <div className="w-2 h-2 rounded-full bg-blue-500" />
                 <span className="text-muted-foreground">Approved</span>
               </div>
               <span className="font-medium">{data.approved.count}</span>
             </div>
             <div className="flex items-center justify-between text-xs cursor-pointer hover:bg-muted/50 p-1 rounded transition-colors" onClick={() => navigate('/transactions?status=posted')}>
               <div className="flex items-center gap-1.5">
                 <div className="w-2 h-2 rounded-full bg-emerald-500" />
                 <span className="text-muted-foreground">Posted</span>
               </div>
               <span className="font-medium">{data.posted.count}</span>
             </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-4 flex items-center justify-between border-t pt-2">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            <span>Synced {data.lastSync ? formatDistanceToNow(new Date(data.lastSync)) : 'just now'} ago</span>
          </div>
          
          <div className="flex items-center gap-1 text-[10px]">
             {data.matchStatus ? (
               <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                 <CheckCircle2 className="h-3 w-3" /> Match
               </span>
             ) : (
               <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                 <AlertTriangle className="h-3 w-3" /> Review
               </span>
             )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
