/**
 * Loan Overview Dashboard
 * Main landing page for Loan Management module
 * Displays key metrics, charts, and quick actions
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import SEO from '@/components/SEO';
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
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui/dialog';
import { 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Calendar,
  DollarSign,
  BarChart3,
  FileText,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { Loan, LoanMetrics, LoanFilters } from '@/types/loans';
import { 
  fetchLoans, 
  getLoanMetrics, 
  fetchLoanPayments 
} from '@/services/loanApi';
import { formatCurrency, formatPercentage } from '@/utils/loanUtils';

// Metric Card Component
function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  color,
  trendUp
}: { 
  title: string; 
  value: string; 
  icon: React.ElementType; 
  trend?: string;
  trendUp?: boolean;
  color?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color || 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend && (
          <p className={`text-xs ${trendUp ? 'text-green-500' : 'text-red-500'} flex items-center gap-1`}>
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </p>
        )}
      </CardContent>
      {color && (
        <div className={`absolute bottom-0 left-0 right-0 h-1 ${color.replace('text-', 'bg-')}`} />
      )}
    </Card>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    active: { color: 'bg-green-500', label: 'Active' },
    completed: { color: 'bg-blue-500', label: 'Completed' },
    overdue: { color: 'bg-red-500', label: 'Overdue' },
    pending: { color: 'bg-yellow-500', label: 'Pending' },
    written_off: { color: 'bg-gray-500', label: 'Written Off' },
  };
  
  const { color, label } = config[status] || { color: 'bg-gray-500', label: status };
  
  return (
    <Badge variant="outline" className={`${color} text-white border-0`}>
      {label}
    </Badge>
  );
}

// Quick Action Button
function QuickAction({ 
  icon: Icon, 
  label, 
  onClick,
  description 
}: { 
  icon: React.ElementType; 
  label: string; 
  onClick: () => void;
  description?: string;
}) {
  return (
    <Button 
      variant="outline" 
      className="h-auto flex flex-col items-center justify-center p-4 gap-2 hover:bg-primary/5"
      onClick={onClick}
    >
      <Icon className="h-6 w-6 text-primary" />
      <div className="text-center">
        <div className="font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
    </Button>
  );
}

export default function LoanOverview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<LoanMetrics | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [filters, setFilters] = useState<LoanFilters>({
    status: 'active',
    type: 'all',
    search: '',
  });
  const [showTutorial, setShowTutorial] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      
      // Get company ID from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();
      
      if (!profile?.company_id) {
        throw new Error('Company not found');
      }
      
      const companyId = profile.company_id;
      
      // Fetch metrics and loans in parallel
      const [metricsData, loansData] = await Promise.all([
        getLoanMetrics(companyId),
        fetchLoans(companyId, filters),
      ]);
      
      setMetrics(metricsData);
      setLoans(loansData);
    } catch (error: any) {
      toast({
        title: 'Error loading loan data',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle filter changes
  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [filters]);

  const handleSearch = (search: string) => {
    setFilters(prev => ({ ...prev, search }));
  };

  const handleStatusFilter = (status: string) => {
    setFilters(prev => ({ ...prev, status: status as any }));
  };

  const handleTypeFilter = (type: string) => {
    setFilters(prev => ({ ...prev, type: type as any }));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading loan data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <SEO title="Loan Management | Rigel Business" description="Track and manage company loans, director loans, and repayment schedules" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Loan Management</h1>
              <p className="text-muted-foreground mt-1">
                Track and manage company loans, director loans, and repayment schedules
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowTutorial(true)}>
                <FileText className="h-4 w-4 mr-2" />
                Guide
              </Button>
              <Button onClick={() => navigate('/loans/new')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Loan
              </Button>
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Outstanding"
              value={formatCurrency(metrics?.total_outstanding || 0)}
              icon={DollarSign}
              color="text-blue-600"
            />
            <MetricCard
              title="Active Loans"
              value={`${metrics?.active_loans_count || 0}`}
              icon={TrendingUp}
              trend={`${metrics?.completed_loans_count || 0} completed`}
              trendUp={true}
              color="text-green-600"
            />
            <MetricCard
              title="Upcoming Repayments"
              value={formatCurrency(metrics?.upcoming_repayments.total_amount || 0)}
              icon={Calendar}
              trend={`${metrics?.upcoming_repayments.count || 0} payments due`}
              trendUp={true}
              color="text-purple-600"
            />
            <MetricCard
              title="Overdue Amount"
              value={formatCurrency(metrics?.overdue_amount || 0)}
              icon={AlertCircle}
              trend={metrics?.overdue_amount ? 'Requires attention' : 'All up to date'}
              trendUp={!metrics?.overdue_amount}
              color="text-red-600"
            />
          </div>

          {/* Quick Actions */}
          <div className="grid gap-4 md:grid-cols-4">
            <QuickAction
              icon={Plus}
              label="New Loan"
              description="Add external loan"
              onClick={() => navigate('/loans/new')}
            />
            <QuickAction
              icon={DollarSign}
              label="Record Payment"
              description="Log a repayment"
              onClick={() => navigate('/loans/repayments')}
            />
            <QuickAction
              icon={BarChart3}
              label="View Reports"
              description="Analytics & aging"
              onClick={() => navigate('/loans/reports')}
            />
            <QuickAction
              icon={Clock}
              label="Amortization"
              description="View schedules"
              onClick={() => navigate('/loans/amortization')}
            />
          </div>

          {/* Loans Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Loans</CardTitle>
                  <CardDescription>Manage your active and historical loans</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="active" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="all" onClick={() => handleStatusFilter('all')}>
                    All Loans
                  </TabsTrigger>
                  <TabsTrigger value="active" onClick={() => handleStatusFilter('active')}>
                    Active
                  </TabsTrigger>
                  <TabsTrigger value="completed" onClick={() => handleStatusFilter('completed')}>
                    Completed
                  </TabsTrigger>
                  <TabsTrigger value="overdue" onClick={() => handleStatusFilter('overdue')}>
                    Overdue
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Lender</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>Outstanding</TableHead>
                        <TableHead>Interest Rate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loans.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No loans found. Click "Add Loan" to get started.
                          </TableCell>
                        </TableRow>
                      ) : (
                        loans.slice(0, 10).map((loan) => (
                          <TableRow key={loan.id}>
                            <TableCell className="font-medium">{loan.reference}</TableCell>
                            <TableCell>{loan.lender_name}</TableCell>
                            <TableCell className="capitalize">
                              {loan.loan_type === 'short' ? 'Short-term' : 'Long-term'}
                            </TableCell>
                            <TableCell>{formatCurrency(loan.principal)}</TableCell>
                            <TableCell>{formatCurrency(loan.outstanding_balance)}</TableCell>
                            <TableCell>{formatPercentage(loan.interest_rate)}</TableCell>
                            <TableCell>
                              <StatusBadge status={loan.status} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => navigate(`/loans/details/${loan.id}`)}
                              >
                                View <ArrowRight className="h-4 w-4 ml-1" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  
                  {loans.length > 10 && (
                    <div className="flex justify-center">
                      <Button 
                        variant="outline" 
                        onClick={() => navigate('/loans/list')}
                      >
                        View All {loans.length} Loans
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Upcoming Repayments */}
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Repayments</CardTitle>
              <CardDescription>Next 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics?.upcoming_repayments.count === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p>No upcoming repayments in the next 30 days</p>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <Calendar className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">{metrics?.upcoming_repayments.count} payments due</p>
                      <p className="text-sm text-muted-foreground">
                        Next payment: {metrics?.upcoming_repayments.next_date}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      {formatCurrency(metrics?.upcoming_repayments.total_amount || 0)}
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate('/loans/repayments')}
                    >
                      Make Payment
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tutorial Dialog */}
        <Dialog open={showTutorial} onOpenChange={setShowTutorial}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Loan Management Guide</DialogTitle>
              <DialogDescription>
                Learn how to manage your company loans effectively
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold mb-2">External Loans</h4>
                <p className="text-sm text-muted-foreground">
                  Track loans from banks and financial institutions. The system calculates 
                  amortization schedules and tracks outstanding balances automatically.
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold mb-2">Director Loans</h4>
                <p className="text-sm text-muted-foreground">
                  Specialized tracking for loans between the company and its directors. 
                  Supports both loans to and from directors with tax implications tracking.
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold mb-2">Amortization</h4>
                <p className="text-sm text-muted-foreground">
                  View detailed payment schedules showing interest and principal portions 
                  for each payment period. Export schedules for planning purposes.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    </>
  );
}

// Import supabase for profile lookup
import { supabase } from '@/integrations/supabase/client';
