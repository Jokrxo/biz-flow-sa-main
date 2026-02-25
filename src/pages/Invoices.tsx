import { useState, useEffect, useCallback, useMemo } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, Mail, Trash2, Info, Plus, LayoutDashboard, CheckCircle2, XCircle, AlertCircle, TrendingUp, Filter, Users, History, Upload, Loader2, AlertTriangle } from "lucide-react";
import { exportInvoiceToPDF, buildInvoicePDF, addLogoToPDF, fetchLogoDataUrl, type InvoiceForPDF, type InvoiceItemForPDF, type CompanyForPDF } from '@/lib/invoice-export';
import { exportInvoicesToExcel } from '@/lib/export-utils';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { MetricCard } from "@/components/ui/MetricCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useNavigate } from "react-router-dom";
import { Textarea } from "@/components/ui/textarea";

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  status: string;
  amount_paid?: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, isAccountant } = useRoles();
  const navigate = useNavigate();
  
  // UI State
  const [tab, setTab] = useState("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  
  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);

  // Credit Note State
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [invoiceToCredit, setInvoiceToCredit] = useState<Invoice | null>(null);
  const [creditReason, setCreditReason] = useState("");
  const [isCrediting, setIsCrediting] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  const loadInvoices = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    const uid = user?.id ? String(user.id) : "anonymous";
    const key = `tutorial_shown_invoices_${uid}`;
    const already = localStorage.getItem(key);
    if (!already) {
      setTutorialOpen(true);
      localStorage.setItem(key, "true");
    }
  }, [user?.id]);

  // Filter Logic
  const dateFilteredInvoices = useMemo(() => invoices.filter((inv) => {
    const d = new Date(inv.invoice_date);
    const matchesYear = yearFilter === 'all' || String(d.getFullYear()) === yearFilter;
    const matchesMonth = monthFilter === 'all' || String(d.getMonth() + 1).padStart(2, '0') === monthFilter;
    return matchesYear && matchesMonth;
  }), [invoices, yearFilter, monthFilter]);

  const filteredInvoices = dateFilteredInvoices.filter((inv) => {
    const total = Number(inv.total_amount || 0);
    const paid = Number(inv.amount_paid || 0);
    const outstanding = Math.max(0, total - paid);
    
    if (tab === 'unpaid') return inv.status !== 'paid' && outstanding > 0;
    if (tab === 'paid') return inv.status === 'paid' || outstanding === 0;
    if (tab === 'draft') return inv.status === 'draft';
    if (tab === 'overdue') return inv.status === 'overdue';
    return true;
  });

  const totalCount = filteredInvoices.length;
  const start = page * pageSize;
  const pagedInvoices = filteredInvoices.slice(start, start + pageSize);

  // Metrics & Charts
  const metrics = {
    total: dateFilteredInvoices.reduce((acc, curr) => acc + Number(curr.total_amount || 0), 0),
    paid: dateFilteredInvoices.reduce((acc, curr) => acc + Number(curr.amount_paid || 0), 0),
    outstanding: dateFilteredInvoices.reduce((acc, curr) => acc + Math.max(0, Number(curr.total_amount || 0) - Number(curr.amount_paid || 0)), 0),
    count: dateFilteredInvoices.length,
    overdueCount: dateFilteredInvoices.filter(i => i.status === 'overdue').length
  };

  const chartData = useMemo(() => {
    const months: Record<string, { name: string, total: number, paid: number }> = {};
    dateFilteredInvoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = { name: d.toLocaleString('default', { month: 'short' }), total: 0, paid: 0 };
      months[key].total += Number(inv.total_amount || 0);
      months[key].paid += Number(inv.amount_paid || 0);
    });
    return Object.keys(months).sort().map(k => months[k]);
  }, [dateFilteredInvoices]);

  const statusData = [
    { name: 'Paid', value: dateFilteredInvoices.filter(i => i.status === 'paid').length },
    { name: 'Unpaid', value: dateFilteredInvoices.filter(i => i.status !== 'paid' && i.status !== 'draft' && i.status !== 'cancelled').length },
    { name: 'Draft', value: dateFilteredInvoices.filter(i => i.status === 'draft').length },
    { name: 'Overdue', value: dateFilteredInvoices.filter(i => i.status === 'overdue').length },
  ].filter(i => i.value > 0);

  // Actions
  const handleDelete = async (id: string) => {
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    try {
      await supabase.from("invoice_items").delete().eq("invoice_id", id);
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Invoice deleted successfully" });
      loadInvoices();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleSendEmail = async (invoice: Invoice) => {
    if (!invoice.customer_email) {
      toast({ title: "Error", description: "No email address for this customer", variant: "destructive" });
      return;
    }
    try {
      const company: CompanyForPDF = await fetchCompanyForPDF();
      const items: any[] = await fetchInvoiceItemsForPDF(invoice.id);
      const dto = mapInvoiceForPDF(invoice);
      const doc = buildInvoicePDF(dto, items as InvoiceItemForPDF[], company);
      const logoDataUrl = await fetchLogoDataUrl(company.logo_url);
      if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
      const blob = doc.output('blob');
      const fileName = `invoice_${dto.invoice_number}.pdf`;
      const path = `invoices/${fileName}`;
      const { error: uploadErr } = await supabase.storage.from('invoices').upload(path, blob, { contentType: 'application/pdf', upsert: true });
      let publicUrl = '';
      if (!uploadErr) {
        const { data } = supabase.storage.from('invoices').getPublicUrl(path);
        publicUrl = data?.publicUrl || '';
      }
      const subject = encodeURIComponent(`Invoice ${dto.invoice_number}`);
      const body = encodeURIComponent(`Hello,\n\nPlease find attached Invoice ${dto.invoice_number}.\nTotal due: R ${dto.total_amount}.\n\n${publicUrl ? `Download: ${publicUrl}` : ''}`);
      window.location.href = `mailto:${invoice.customer_email}?subject=${subject}&body=${body}`;
      toast({ title: 'Success', description: 'Email compose opened' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      const company: CompanyForPDF = await fetchCompanyForPDF();
      const items: any[] = await fetchInvoiceItemsForPDF(invoice.id);
      const dto = mapInvoiceForPDF(invoice);
      const doc = buildInvoicePDF(dto, items as InvoiceItemForPDF[], company);
      const logoDataUrl = await fetchLogoDataUrl(company.logo_url);
      if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
      doc.save(`invoice_${dto.invoice_number}.pdf`);
      toast({ title: 'Success', description: 'Downloaded PDF' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const fetchCompanyForPDF = async (): Promise<CompanyForPDF> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.company_id) throw new Error("No company profile found");

    const { data } = await supabase.from('companies')
      .select('name,email,phone,address,tax_number,vat_number,logo_url')
      .eq('id', profile.company_id)
      .single();

    return {
      name: (data as any)?.name || 'Company',
      email: (data as any)?.email,
      phone: (data as any)?.phone,
      address: (data as any)?.address,
      tax_number: (data as any)?.tax_number ?? null,
      vat_number: (data as any)?.vat_number ?? null,
      logo_url: (data as any)?.logo_url ?? null,
    } as CompanyForPDF;
  };

  const fetchInvoiceItemsForPDF = async (invoiceId: string): Promise<InvoiceItemForPDF[]> => {
    const { data } = await supabase.from('invoice_items').select('description,quantity,unit_price,tax_rate').eq('invoice_id', invoiceId);
    return (data || []) as any;
  };

  const mapInvoiceForPDF = (inv: any): InvoiceForPDF => ({
    invoice_number: inv.invoice_number || String(inv.id),
    invoice_date: inv.invoice_date || new Date().toISOString(),
    due_date: inv.due_date || null,
    customer_name: inv.customer_name || 'Customer',
    customer_email: inv.customer_email || null,
    notes: null,
    subtotal: (inv.subtotal ?? inv.total_amount ?? 0) - (inv.tax_amount ?? 0),
    tax_amount: inv.tax_amount ?? 0,
    total_amount: inv.total_amount ?? 0,
  });

  const canEdit = isAdmin || isAccountant;

  return (
    <>
      <SEO title="Invoices | Rigel Business" description="Manage customer invoices" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Invoice Management</h1>
              <p className="text-muted-foreground mt-1">Track revenue, manage invoices, and monitor payments</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTutorialOpen(true)}>
                <Info className="h-4 w-4 mr-2" />
                Help
              </Button>
              <Sheet open={isQuickActionsOpen} onOpenChange={setIsQuickActionsOpen}>
                <SheetTrigger asChild>
                  <Button className="bg-gradient-primary shadow-lg hover:shadow-xl transition-all">
                    <Plus className="h-4 w-4 mr-2" /> Quick Actions
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Invoice Actions</SheetTitle>
                    <SheetDescription>Quickly manage your sales documents</SheetDescription>
                  </SheetHeader>
                  <div className="grid gap-4 py-4">
                    <Button variant="outline" className="justify-start h-12" onClick={() => { navigate('/sales'); setIsQuickActionsOpen(false); }}>
                      <FileText className="h-5 w-5 mr-3 text-blue-500" />
                      Create Invoice
                    </Button>
                    <Button variant="outline" className="justify-start h-12" onClick={() => { navigate('/quotes'); setIsQuickActionsOpen(false); }}>
                      <FileText className="h-5 w-5 mr-3 text-purple-500" />
                      Create Quote
                    </Button>
                    <Button variant="outline" className="justify-start h-12" onClick={() => { navigate('/customers'); setIsQuickActionsOpen(false); }}>
                      <Users className="h-5 w-5 mr-3 text-green-500" />
                      Add Customer
                    </Button>
                    <Button variant="outline" className="justify-start h-12" onClick={() => exportInvoicesToExcel(filteredInvoices as any, 'invoices_export')}>
                      <Download className="h-5 w-5 mr-3 text-orange-500" />
                      Export Report
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard 
              title="Total Invoiced" 
              value={`R ${metrics.total.toLocaleString('en-ZA')}`} 
              icon={<FileText className="h-4 w-4" />}
              gradient="bg-blue-500/10"
              className="border-l-4 border-l-blue-500"
            />
            <MetricCard 
              title="Total Paid" 
              value={`R ${metrics.paid.toLocaleString('en-ZA')}`} 
              icon={<CheckCircle2 className="h-4 w-4" />}
              gradient="bg-green-500/10"
              className="border-l-4 border-l-green-500"
            />
            <MetricCard 
              title="Outstanding" 
              value={`R ${metrics.outstanding.toLocaleString('en-ZA')}`} 
              icon={<AlertCircle className="h-4 w-4" />}
              gradient="bg-orange-500/10"
              className="border-l-4 border-l-orange-500"
            />
            <MetricCard 
              title="Overdue Count" 
              value={metrics.overdueCount.toString()} 
              icon={<XCircle className="h-4 w-4" />}
              gradient="bg-red-500/10"
              className="border-l-4 border-l-red-500"
            />
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Revenue Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `R${v/1000}k`} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        formatter={(value: number) => [`R ${value.toLocaleString()}`, '']}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="total" stroke="#3b82f6" name="Invoiced" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="paid" stroke="#22c55e" name="Paid" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full flex justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={tab} onValueChange={setTab} className="space-y-6">
            <div className="flex items-center justify-between border-b pb-2">
              <TabsList className="bg-transparent p-0 gap-6">
                <TabsTrigger value="all" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 pb-2 bg-transparent">All Invoices</TabsTrigger>
                <TabsTrigger value="unpaid" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 pb-2 bg-transparent">Unpaid</TabsTrigger>
                <TabsTrigger value="paid" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 pb-2 bg-transparent">Paid</TabsTrigger>
                <TabsTrigger value="draft" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 pb-2 bg-transparent">Drafts</TabsTrigger>
                <TabsTrigger value="overdue" className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-0 pb-2 bg-transparent">Overdue</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <Select value={yearFilter} onValueChange={setYearFilter}>
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {Array.from(new Set(invoices.map(i => new Date(i.invoice_date).getFullYear()))).sort((a,b)=>b-a).map(y => (
                      <SelectItem key={String(y)} value={String(y)}>{String(y)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="w-[110px] h-8 text-xs">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (
                      <SelectItem key={m} value={m}>{new Date(2025, Number(m)-1, 1).toLocaleString('en-ZA', { month: 'short' })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value={tab} className="animate-in fade-in-50 duration-500">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center">Loading invoices...</TableCell>
                        </TableRow>
                      ) : pagedInvoices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No invoices found for this view.</TableCell>
                        </TableRow>
                      ) : (
                        pagedInvoices.map((invoice) => (
                          <TableRow key={invoice.id} className="hover:bg-muted/50">
                            <TableCell className="font-medium text-primary">{invoice.invoice_number}</TableCell>
                            <TableCell>{invoice.customer_name}</TableCell>
                            <TableCell>{new Date(invoice.invoice_date).toLocaleDateString('en-ZA')}</TableCell>
                            <TableCell>{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-ZA') : "-"}</TableCell>
                            <TableCell className="text-right">R {Number(invoice.total_amount).toLocaleString('en-ZA')}</TableCell>
                            <TableCell className="text-right font-semibold text-orange-600">
                              R {Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0)).toLocaleString('en-ZA')}
                            </TableCell>
                            <TableCell>
                              <span className={`px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wide ${
                                invoice.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                invoice.status === 'sent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                invoice.status === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                              }`}>
                                {invoice.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownloadInvoice(invoice)}>
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleSendEmail(invoice)} disabled={!invoice.customer_email}>
                                  <Mail className="h-4 w-4" />
                                </Button>
                                {canEdit && (
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={() => { setInvoiceToCredit(invoice); setCreditNoteOpen(true); }} title="Create Credit Note">
                                    <History className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  
                  {/* Pagination */}
                  {pagedInvoices.length > 0 && (
                    <div className="flex items-center justify-between p-4 border-t">
                      <div className="text-xs text-muted-foreground">
                        Page {page + 1} of {Math.max(1, Math.ceil(totalCount / pageSize))} • Showing {pagedInvoices.length} of {totalCount} records
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
                        <Button variant="outline" size="sm" disabled={(page + 1) >= Math.ceil(totalCount / pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
            <DialogContent className="sm:max-w-[560px] p-4">
              <DialogHeader>
                <DialogTitle>Invoices Tutorial</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>This dashboard gives you a complete overview of your invoicing.</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Use the <strong>Tabs</strong> to quickly filter between Paid, Unpaid, and Draft invoices.</li>
                  <li><strong>Charts</strong> show your revenue trend and status distribution.</li>
                  <li>Use <strong>Quick Actions</strong> (top right) to create new invoices or quotes.</li>
                  <li>Click the action icons in the table to download PDF or email invoices directly.</li>
                </ul>
              </div>
              <DialogFooter>
                <Button onClick={() => setTutorialOpen(false)}>Got it</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </>
  );
}
