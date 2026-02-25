/**
 * Amortization Schedule Component
 * Displays loan amortization schedule with filters, charts, and export options
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Download, 
  FileSpreadsheet, 
  FileText, 
  TrendingDown, 
  TrendingUp,
  PieChart,
  Filter,
  Eye,
  Printer
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Loan, AmortizationSchedule, AmortizationEntry } from '@/types/loans';
import { fetchLoanById, generateLoanAmortization, exportAmortizationToCSV } from '@/services/loanApi';
import { formatCurrency, formatPercentage } from '@/utils/loanUtils';
import { 
  PieChart as RechartsPie, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  Area,
  AreaChart 
} from 'recharts';

// Color palette for charts
const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c'];

interface AmortizationScheduleProps {
  loanId: string;
  onClose?: () => void;
  isModal?: boolean;
}

export function AmortizationScheduleView({ loanId, onClose, isModal = false }: AmortizationScheduleProps) {
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [schedule, setSchedule] = useState<AmortizationSchedule | null>(null);
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [showCharts, setShowCharts] = useState(true);

  useEffect(() => {
    if (loanId) {
      loadSchedule();
    }
  }, [loanId]);

  const loadSchedule = async () => {
    try {
      setLoading(true);
      
      const [loanData, scheduleData] = await Promise.all([
        fetchLoanById(loanId),
        generateLoanAmortization(loanId),
      ]);
      
      setLoan(loanData);
      setSchedule(scheduleData);
    } catch (error: any) {
      toast({
        title: 'Error loading amortization schedule',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter entries by year
  const filteredEntries = schedule?.entries.filter(entry => {
    if (yearFilter === 'all') return true;
    const entryYear = new Date(entry.payment_date).getFullYear().toString();
    return entryYear === yearFilter;
  }) || [];

  // Get unique years from schedule
  const availableYears = schedule ? [...new Set(
    schedule.entries.map(e => new Date(e.payment_date).getFullYear().toString())
  )].sort() : [];

  // Calculate summary totals
  const summary = {
    totalPayments: filteredEntries.reduce((sum, e) => sum + e.payment_amount, 0),
    totalInterest: filteredEntries.reduce((sum, e) => sum + e.interest_portion, 0),
    totalPrincipal: filteredEntries.reduce((sum, e) => sum + e.principal_portion, 0),
    paidCount: filteredEntries.filter(e => e.is_paid).length,
    pendingCount: filteredEntries.filter(e => !e.is_paid).length,
  };

  // Chart data
  const pieData = [
    { name: 'Principal', value: summary.totalPrincipal },
    { name: 'Interest', value: summary.totalInterest },
  ];

  const lineData = filteredEntries.map(entry => ({
    period: `P${entry.period}`,
    balance: entry.remaining_balance,
    principal: entry.principal_portion,
    interest: entry.interest_portion,
    payment: entry.payment_amount,
  }));

  // Handle export
  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      if (format === 'csv') {
        const csv = await exportAmortizationToCSV(loanId);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `amortization_${loan?.reference || loanId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: 'Export successful',
          description: 'Amortization schedule exported to CSV',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Handle print
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading amortization schedule...</p>
        </div>
      </div>
    );
  }

  const content = (
    <div className="space-y-6">
      {/* Header with Loan Info */}
      {loan && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Reference</div>
              <div className="text-xl font-bold">{loan.reference}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Principal</div>
              <div className="text-xl font-bold">{formatCurrency(loan.principal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Interest Rate</div>
              <div className="text-xl font-bold">{formatPercentage(loan.interest_rate)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Outstanding</div>
              <div className="text-xl font-bold">{formatCurrency(loan.outstanding_balance)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Total Principal</span>
            </div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(summary.totalPrincipal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Total Interest</span>
            </div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(summary.totalInterest)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Total Payments</span>
            </div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(summary.totalPayments)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              {summary.paidCount} Paid
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
              {summary.pendingCount} Pending
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {showCharts && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Pie Chart - Principal vs Interest */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Principal vs Interest</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <RechartsPie>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </RechartsPie>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Line Chart - Balance Over Time */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Balance Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="balance" 
                    stroke="#2563eb" 
                    fill="#2563eb" 
                    fillOpacity={0.3}
                    name="Balance"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowCharts(!showCharts)}
          >
            <Eye className="h-4 w-4 mr-2" />
            {showCharts ? 'Hide Charts' : 'Show Charts'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('csv')}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Amortization Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Schedule</CardTitle>
          <CardDescription>
            Showing {filteredEntries.length} of {schedule?.entries.length || 0} periods
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Payment</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Cumulative Interest</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow key={entry.period}>
                  <TableCell className="font-medium">{entry.period}</TableCell>
                  <TableCell>{new Date(entry.payment_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">{formatCurrency(entry.payment_amount)}</TableCell>
                  <TableCell className="text-right text-red-600">
                    {formatCurrency(entry.interest_portion)}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    {formatCurrency(entry.principal_portion)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(entry.remaining_balance)}
                  </TableCell>
                  <TableCell>{formatCurrency(entry.cumulative_interest)}</TableCell>
                  <TableCell>
                    <Badge variant={entry.is_paid ? 'default' : 'outline'} className={entry.is_paid ? 'bg-green-500' : ''}>
                      {entry.is_paid ? 'Paid' : 'Pending'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  // If modal, wrap in Dialog
  if (isModal) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Amortization Schedule</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return content;
}

export default AmortizationScheduleView;
