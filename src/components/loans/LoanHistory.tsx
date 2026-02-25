/**
 * Loan History Component
 * Displays transaction history for a loan, similar to debtor statements
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  History, 
  ArrowUpRight, 
  ArrowDownLeft, 
  PlusCircle, 
  RefreshCcw,
  FileText,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { LoanHistoryEntry } from '@/types/loans';
import { fetchLoanHistory } from '@/services/loanApi';
import { formatCurrency } from '@/utils/loanUtils';

interface LoanHistoryProps {
  loanId: string;
  isModal?: boolean;
  onClose?: () => void;
}

const actionIcons: Record<string, React.ElementType> = {
  created: PlusCircle,
  payment: ArrowDownLeft,
  interest_posted: FileText,
  status_change: RefreshCcw,
  adjustment: RefreshCcw,
  amortization_update: RefreshCcw,
};

const actionColors: Record<string, string> = {
  created: 'bg-green-500',
  payment: 'bg-blue-500',
  interest_posted: 'bg-purple-500',
  status_change: 'bg-yellow-500',
  adjustment: 'bg-orange-500',
  amortization_update: 'bg-cyan-500',
};

export function LoanHistoryView({ loanId, isModal = false, onClose }: LoanHistoryProps) {
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<LoanHistoryEntry[]>([]);

  useEffect(() => {
    if (loanId) {
      loadHistory();
    }
  }, [loanId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await fetchLoanHistory(loanId);
      setHistory(data);
    } catch (error: any) {
      toast({
        title: 'Error loading history',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate running balance
  let runningBalance = history.find(h => h.action_type === 'created')?.amount || 0;
  
  const historyWithBalance = history.map(entry => {
    if (entry.action_type === 'payment') {
      runningBalance -= entry.amount || 0;
    } else if (entry.balance_after !== undefined) {
      runningBalance = entry.balance_after;
    }
    return { ...entry, runningBalance };
  });

  // Group by month
  const groupedHistory = historyWithBalance.reduce((groups, entry) => {
    const date = new Date(entry.action_date);
    const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!groups[monthYear]) {
      groups[monthYear] = [];
    }
    groups[monthYear].push(entry);
    return groups;
  }, {} as Record<string, LoanHistoryEntry[]>);

  const sortedMonths = Object.keys(groupedHistory).sort().reverse();

  const content = (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <PlusCircle className="h-4 w-4 text-green-500" />
              <span>Transactions</span>
            </div>
            <div className="text-2xl font-bold mt-1">{history.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 text-blue-500" />
              <span>First Transaction</span>
            </div>
            <div className="text-2xl font-bold mt-1">
              {history.length > 0 
                ? new Date(history[history.length - 1].action_date).toLocaleDateString()
                : '-'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowDownLeft className="h-4 w-4 text-purple-500" />
              <span>Total Payments</span>
            </div>
            <div className="text-2xl font-bold mt-1">
              {formatCurrency(
                history
                  .filter(h => h.action_type === 'payment')
                  .reduce((sum, h) => sum + (h.amount || 0), 0)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </CardTitle>
          <CardDescription>
            Complete history of all transactions and changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transaction history available
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMonths.map(month => (
                  <>
                    <TableRow key={`header-${month}`} className="bg-muted/50">
                      <TableCell colSpan={5} className="font-semibold">
                        {new Date(month + '-01').toLocaleDateString('en-ZA', { 
                          year: 'numeric', 
                          month: 'long' 
                        })}
                      </TableCell>
                    </TableRow>
                    {groupedHistory[month].map((entry) => {
                      const Icon = actionIcons[entry.action_type] || FileText;
                      const color = actionColors[entry.action_type] || 'bg-gray-500';
                      
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap">
                            {new Date(entry.action_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`${color} text-white border-0`}>
                              <Icon className="h-3 w-3 mr-1" />
                              {entry.action_type.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell className="text-right">
                            {entry.amount ? (
                              <span className={entry.action_type === 'payment' ? 'text-green-600' : ''}>
                                {entry.action_type === 'payment' ? '-' : '+'}
                                {formatCurrency(entry.amount)}
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(entry.runningBalance || 0)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );

  if (isModal) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loan History</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return content;
}

export default LoanHistoryView;
