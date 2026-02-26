import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { transactionsApi } from "@/lib/transactions-api";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRoles } from "@/hooks/use-roles";
import { 
  Download, Plus, Trash2, FileText, MoreHorizontal, 
  CheckCircle2, Clock, AlertTriangle, DollarSign, 
  Search, Filter, ArrowUpDown, ChevronDown, 
  Receipt, Lock, Eye, Edit, X, FileSpreadsheet, Printer
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO } from "date-fns";

interface Receipt {
  [key: string]: any;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
}

interface Invoice {
  [key: string]: any;
}

export const SalesReceipts = ({ 
  dialogOpen: externalDialogOpen, 
  setDialogOpen: externalSetDialogOpen 
}: { 
  dialogOpen?: boolean; 
  setDialogOpen?: (open: boolean) => void 
}) => {
  const [receipts, setReceipts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Use external props if provided, otherwise use internal state
  const isControlled = externalDialogOpen !== undefined;
  const currentDialogOpen = isControlled ? externalDialogOpen : internalDialogOpen;
  const handleSetDialogOpen = (open: boolean) => {
    if (externalSetDialogOpen) {
      externalSetDialogOpen(open);
    } else {
      setInternalDialogOpen(open);
    }
  };

  // Open dialog when external prop changes to true (only once)
  useEffect(() => {
    if (externalDialogOpen && !currentDialogOpen) {
      handleSetDialogOpen(true);
    }
  }, [externalDialogOpen]);
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState("");
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, isAccountant } = useRoles();
  const todayStr = new Date().toISOString().split("T")[0];
  const { isDateLocked } = useFiscalYear();
  const [companyId, setCompanyId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    transaction_date: todayStr,
    description: '',
    reference_number: '',
    customer_id: '',
    invoice_id: '',
    payment_method: 'bank',
    bank_account_id: '',
    total_amount: 0,
    notes: ''
  });
  const [viewReceiptOpen, setViewReceiptOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    async function fetchCompany() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', authUser.id)
        .single();
      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        await Promise.all([
          fetchReceipts(profile.company_id),
          fetchCustomers(profile.company_id),
          fetchInvoices(profile.company_id),
          fetchAccounts(profile.company_id)
        ]);
      }
    }
    fetchCompany();
  }, []);

  const fetchReceipts = async (compId: string) => {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('company_id', compId)
        .gt('total_amount', 0)
        .order('transaction_date', { ascending: false });
      
      if (error) throw error;
      setReceipts(data || []);
    } catch (err) {
      console.error('Error fetching receipts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async (compId: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, email')
        .eq('company_id', compId)
        .order('name');
      
      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const fetchInvoices = async (compId: string) => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, customer_name, total_amount, amount_paid, status')
        .eq('company_id', compId)
        .in('status', ['sent', 'paid', 'partial'])
        .order('invoice_date', { ascending: false });
      
      if (error) throw error;
      setInvoices(data || []);
    } catch (err) {
      console.error('Error fetching invoices:', err);
    }
  };

  const fetchAccounts = async (compId: string) => {
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('company_id', compId)
        .eq('is_active', true)
        .order('account_code');
      
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  };

  const bankAccounts = useMemo(() => 
    accounts.filter(a => 
      a.account_type === 'asset' && 
      (a.account_name.toLowerCase().includes('bank') || 
       a.account_name.toLowerCase().includes('cash'))
    ), [accounts]);

  const filteredReceipts = useMemo(() => {
    return receipts.filter(r => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesSearch = !searchText || 
        r.description?.toLowerCase().includes(searchText.toLowerCase()) ||
        r.reference_number?.toLowerCase().includes(searchText.toLowerCase()) ||
        r.customer_name?.toLowerCase().includes(searchText.toLowerCase());
      const matchesCustomer = customerFilter === 'all' || r.customer_id === customerFilter;
      return matchesStatus && matchesSearch && matchesCustomer;
    });
  }, [receipts, statusFilter, searchText, customerFilter]);

  const paginatedReceipts = useMemo(() => {
    const start = page * pageSize;
    return filteredReceipts.slice(start, start + pageSize);
  }, [filteredReceipts, page, pageSize]);

  const totalPages = Math.ceil(filteredReceipts.length / pageSize);

  const handleCreateReceipt = async () => {
    if (!companyId) return;
    if (!formData.description || !formData.total_amount) {
      toast({ title: "Error", description: "Please fill in required fields", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      // Get Accounts Receivable account
      const arAccount = accounts.find(a => a.account_name.toLowerCase().includes('receivable'));
      const bankAccount = accounts.find(a => a.id === formData.bank_account_id);

      if (!arAccount || !bankAccount) {
        toast({ title: "Error", description: "Please ensure you have bank and receivable accounts set up", variant: "destructive" });
        return;
      }

      // Get customer if selected
      let customerName = '';
      if (formData.customer_id) {
        const customer = customers.find(c => c.id === formData.customer_id);
        customerName = customer?.name || '';
      }

      // If invoice is selected, get its details
      let invoiceRef = formData.reference_number;
      let amount = formData.total_amount;
      if (formData.invoice_id) {
        const invoice = invoices.find(i => i.id === formData.invoice_id);
        if (invoice) {
          invoiceRef = invoice.invoice_number;
          customerName = invoice.customer_name;
          // Auto-fill outstanding amount
          const outstanding = Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0);
          if (!formData.total_amount || formData.total_amount === 0) {
            amount = outstanding;
            setFormData(prev => ({ ...prev, total_amount: outstanding }));
          }
        }
      }

      const receiptData: any = {
        company_id: companyId,
        user_id: user?.id,
        transaction_date: formData.transaction_date,
        description: formData.description,
        reference_number: invoiceRef || null,
        total_amount: amount,
        status: 'pending'
      };

      const { data, error } = await supabase
        .from('transactions')
        .insert(receiptData)
        .select()
        .single();

      if (error) throw error;

      // Create double-entry transaction entries
      const txId = data.id;
      const entryDescription = `Receipt: ${invoiceRef || formData.description || 'Payment received'}`;
      
      // Debit: Bank account (money coming in)
      // Credit: Accounts Receivable (reducing customer debt)
      const entries = [
        {
          transaction_id: txId,
          account_id: bankAccount.id,
          debit: amount,
          credit: 0,
          description: entryDescription,
          status: 'approved'
        },
        {
          transaction_id: txId,
          account_id: arAccount.id,
          debit: 0,
          credit: amount,
          description: entryDescription,
          status: 'approved'
        }
      ];

      const { error: entriesError } = await supabase
        .from('transaction_entries')
        .insert(entries);
      
      if (entriesError) {
        // If entries fail, we should still have the transaction but warn user
        console.error('Error creating transaction entries:', entriesError);
        toast({ 
          title: 'Warning', 
          description: 'Receipt created but journal entries failed. Please contact administrator.'
        });
      }

      // Now update transaction status to posted
      await supabase
        .from('transactions')
        .update({ status: 'posted' })
        .eq('id', txId);

      // If linked to invoice, update invoice status
      if (formData.invoice_id && amount > 0) {
        const invoice = invoices.find(i => i.id === formData.invoice_id);
        if (invoice) {
          const newAmountPaid = Number(invoice.amount_paid || 0) + amount;
          const newStatus = newAmountPaid >= Number(invoice.total_amount) ? 'paid' : 'sent';
          await supabase
            .from('invoices')
            .update({ 
              amount_paid: newAmountPaid,
              status: newStatus,
              paid_at: newStatus === 'paid' ? new Date().toISOString() : null
            })
            .eq('id', formData.invoice_id);
        }
      }

      toast({ title: "Success", description: "Receipt created successfully" });
      handleSetDialogOpen(false);
      resetForm();
      await fetchReceipts(companyId);
      if (formData.invoice_id) {
        await fetchInvoices(companyId);
      }
    } catch (err: any) {
      console.error('Error creating receipt:', err);
      toast({ title: "Error", description: err.message || "Failed to create receipt", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteReceipt = async (id: string) => {
    if (!confirm("Are you sure you want to delete this receipt?")) return;
    
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      toast({ title: "Success", description: "Receipt deleted successfully" });
      if (companyId) await fetchReceipts(companyId);
    } catch (err) {
      console.error('Error deleting receipt:', err);
      toast({ title: "Error", description: "Failed to delete receipt", variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({
      transaction_date: todayStr,
      description: '',
      reference_number: '',
      customer_id: '',
      invoice_id: '',
      payment_method: 'bank',
      bank_account_id: bankAccounts[0]?.id || '',
      total_amount: 0,
      notes: ''
    });
  };

  const handleViewReceipt = (receipt: Receipt) => {
    setSelectedReceipt(receipt);
    setViewReceiptOpen(true);
  };

  const handleInvoiceSelect = (invoiceId: string) => {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (invoice) {
      const outstanding = Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0);
      setFormData(prev => ({
        ...prev,
        invoice_id: invoiceId,
        customer_id: '', // Customer is inferred from invoice
        reference_number: invoice.invoice_number,
        total_amount: outstanding,
        description: `Payment for invoice ${invoice.invoice_number}`
      }));
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', { 
      style: 'currency', 
      currency: 'ZAR' 
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'posted':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Posted</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      case 'draft':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Draft</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getPaymentMethodBadge = (method: string | null) => {
    switch (method) {
      case 'bank':
        return <Badge variant="outline" className="border-blue-500 text-blue-600">Bank Transfer</Badge>;
      case 'cash':
        return <Badge variant="outline" className="border-green-500 text-green-600">Cash</Badge>;
      case 'card':
        return <Badge variant="outline" className="border-purple-500 text-purple-600">Card</Badge>;
      default:
        return null;
    }
  };

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    const totalReceived = receipts
      .filter(r => r.status === 'posted')
      .reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    
    const pendingReceipts = receipts.filter(r => r.status === 'pending');
    const pendingAmount = pendingReceipts.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    
    return { totalReceived, pendingAmount, totalCount: receipts.length };
  }, [receipts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(summaryMetrics.totalReceived)}</div>
            <p className="text-xs text-muted-foreground mt-1">{summaryMetrics.totalCount} total receipts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{formatCurrency(summaryMetrics.pendingAmount)}</div>
            <p className="text-xs text-muted-foreground mt-1">{receipts.filter(r => r.status === 'pending').length} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(receipts.filter(r => {
                const date = new Date(r.transaction_date);
                const now = new Date();
                return r.status === 'posted' && 
                  date.getMonth() === now.getMonth() && 
                  date.getFullYear() === now.getFullYear();
              }).reduce((sum, r) => sum + Number(r.total_amount || 0), 0))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Current month receipts</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search receipts..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => { resetForm(); handleSetDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            New Receipt
          </Button>
        </div>
      </div>

      {/* Receipts Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedReceipts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No receipts found. Create your first receipt to get started.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedReceipts.map((receipt) => (
                  <TableRow key={receipt.id} className="cursor-pointer" onClick={() => handleViewReceipt(receipt)}>
                    <TableCell>{receipt.transaction_date ? format(parseISO(receipt.transaction_date), 'dd MMM yyyy') : '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{receipt.reference_number || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{receipt.description || '-'}</TableCell>
                    <TableCell>{receipt.customer_name || '-'}</TableCell>
                    <TableCell>{getPaymentMethodBadge(receipt.payment_method)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(receipt.total_amount || 0))}</TableCell>
                    <TableCell>{getStatusBadge(receipt.status)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewReceipt(receipt)}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Printer className="h-4 w-4 mr-2" /> Print
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleDeleteReceipt(receipt.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, filteredReceipts.length)} of {filteredReceipts.length} receipts
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            disabled={page === 0} 
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            disabled={(page + 1) >= totalPages} 
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Create Receipt Dialog */}
      <Dialog open={currentDialogOpen} onOpenChange={handleSetDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Receipt</DialogTitle>
            <DialogDescription>Record a payment received from a customer</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="receiptDate">Receipt Date *</Label>
                <Input
                  id="receiptDate"
                  type="date"
                  value={formData.transaction_date}
                  onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select 
                  value={formData.payment_method} 
                  onValueChange={(v) => setFormData({ ...formData, payment_method: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="invoice">Link to Invoice (Optional)</Label>
              <Select 
                value={formData.invoice_id} 
                onValueChange={handleInvoiceSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an invoice" />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map(inv => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoice_number} - {inv.customer_name} ({formatCurrency(Number(inv.total_amount) - Number(inv.amount_paid))} outstanding)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                placeholder="e.g., Payment for Invoice INV-001"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reference">Reference Number</Label>
                <Input
                  id="reference"
                  placeholder="e.g., Receipt number"
                  value={formData.reference_number}
                  onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.total_amount || ''}
                  onChange={(e) => setFormData({ ...formData, total_amount: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bankAccount">Bank/Cash Account *</Label>
              <Select 
                value={formData.bank_account_id} 
                onValueChange={(v) => setFormData({ ...formData, bank_account_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.account_code} - {account.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Optional notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleSetDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateReceipt} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Receipt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Receipt Dialog */}
      <Dialog open={viewReceiptOpen} onOpenChange={setViewReceiptOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receipt Details</DialogTitle>
          </DialogHeader>
          {selectedReceipt && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p className="font-medium">{selectedReceipt.transaction_date ? format(parseISO(selectedReceipt.transaction_date), 'dd MMMM yyyy') : '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Reference</Label>
                  <p className="font-medium font-mono">{selectedReceipt.reference_number || '-'}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="font-medium">{selectedReceipt.description || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Customer</Label>
                  <p className="font-medium">{selectedReceipt.customer_name || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Payment Method</Label>
                  <p className="font-medium">{getPaymentMethodBadge(selectedReceipt.payment_method)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedReceipt.status)}</div>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Amount</Label>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(Number(selectedReceipt.total_amount || 0))}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewReceiptOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
