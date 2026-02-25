import { useState, useEffect, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  TrendingUp, FileText, Plus, Download, Mail, ArrowRight, 
  Search, Filter, ChevronDown, Trash2, Printer, RefreshCw, MoreVertical, Copy, Eye, FileEdit
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { buildQuotePDF, type QuoteForPDF, type QuoteItemForPDF, type CompanyForPDF } from '@/lib/quote-export';
import { addLogoToPDF, fetchLogoDataUrl } from '@/lib/invoice-export';

interface Quote {
  id: string;
  quote_number: string;
  customer_name: string;
  customer_email: string | null;
  quote_date: string;
  expiry_date: string | null;
  total_amount: number;
  status: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, isAccountant } = useRoles();
  
  // State for new UI
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState("all");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Existing state for dialogs
  const [showReport, setShowReport] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_email: "",
    quote_date: new Date().toISOString().split("T")[0],
    expiry_date: "",
    total_amount: "",
  });
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);

  const loadQuotes = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("quote_date", { ascending: false });

      if (error) throw error;
      setQuotes(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  // ... existing PDF helpers ...
  const fetchCompanyForPDF = async (): Promise<CompanyForPDF> => {
    const { data } = await supabase
      .from('companies')
      .select('name,email,phone,address,tax_number,vat_number,logo_url')
      .limit(1)
      .maybeSingle();
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

  const fetchQuoteItemsForPDF = async (quoteId: string): Promise<QuoteItemForPDF[]> => {
    const { data } = await supabase.from('quote_items').select('description,quantity,unit_price,tax_rate').eq('quote_id', quoteId);
    return (data || []) as any;
  };

  const mapQuoteForPDF = (q: any): QuoteForPDF => ({
    quote_number: q.quote_number || String(q.id),
    quote_date: q.quote_date || new Date().toISOString(),
    expiry_date: q.expiry_date || null,
    customer_name: q.customer_name || 'Customer',
    customer_email: q.customer_email || null,
    notes: null,
    subtotal: (q.subtotal ?? q.total_amount ?? 0) - (q.tax_amount ?? 0),
    tax_amount: q.tax_amount ?? 0,
    total_amount: q.total_amount ?? 0,
  });

  const handleDownloadQuote = async (q: any) => {
    try {
      const [company, items] = await Promise.all([
        fetchCompanyForPDF(),
        fetchQuoteItemsForPDF(q.id),
      ]);
      const dto = mapQuoteForPDF(q);
      const doc = buildQuotePDF(dto, items as QuoteItemForPDF[], company);
      const logoDataUrl = await fetchLogoDataUrl(company.logo_url);
      if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
      doc.save(`quote_${dto.quote_number}.pdf`);
      toast({ title: 'Success', description: 'Quote PDF downloaded' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to download quote PDF', variant: 'destructive' });
    }
  };

  const openSendDialog = (q: any) => {
    setSelectedQuote(q);
    const email = q.customer_email || '';
    setSendEmail(email);
    const totalText = q.total_amount ?? '';
    const msg = `Hello,\n\nPlease find your Quote ${q.quote_number}.\nTotal: R ${totalText}.\n\nThank you.`;
    setSendMessage(msg);
    setSendDialogOpen(true);
  };

  const handleSendEmail = async () => {
    if (!selectedQuote) return;
    if (!sendEmail) { toast({ title: 'Error', description: 'Please enter recipient email', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const [company, items] = await Promise.all([
        fetchCompanyForPDF(),
        fetchQuoteItemsForPDF(selectedQuote.id),
      ]);
      const dto = mapQuoteForPDF(selectedQuote);
      const doc = buildQuotePDF(dto, items as QuoteItemForPDF[], company);
      const logoDataUrl = await fetchLogoDataUrl(company.logo_url);
      if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
      const blob = doc.output('blob');
      const fileName = `quote_${dto.quote_number}.pdf`;
      const path = `quotes/${fileName}`;
      const { error: uploadErr } = await supabase.storage
        .from('quotes')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true });
      let publicUrl = '';
      if (!uploadErr) {
        const { data } = supabase.storage.from('quotes').getPublicUrl(path);
        publicUrl = data?.publicUrl || '';
      }
      const subject = encodeURIComponent(`Quote ${dto.quote_number}`);
      const bodyLines = [sendMessage, publicUrl ? `\nDownload your quote: ${publicUrl}` : ''].join('\n');
      const body = encodeURIComponent(bodyLines);
      window.location.href = `mailto:${sendEmail}?subject=${subject}&body=${body}`;
      await supabase
        .from('quotes')
        .update({ status: 'sent' })
        .eq('id', selectedQuote.id);
      toast({ title: 'Success', description: 'Email compose opened with quote link' });
      setSendDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to prepare email', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();
      const quoteNumber = `QUO-${Date.now().toString().slice(-6)}`;
      const total = parseFloat(formData.total_amount);
      const { error } = await supabase.from("quotes").insert({
        company_id: profile!.company_id,
        quote_number: quoteNumber,
        customer_name: formData.customer_name,
        customer_email: formData.customer_email || null,
        quote_date: formData.quote_date,
        expiry_date: formData.expiry_date || null,
        total_amount: total,
        subtotal: total / 1.15,
        tax_amount: (total * 0.15) / 1.15,
        status: "draft",
      });
      if (error) throw error;
      toast({ title: "Success", description: "Quote created successfully" });
      setDialogOpen(false);
      setFormData({
        customer_name: "",
        customer_email: "",
        quote_date: new Date().toISOString().split("T")[0],
        expiry_date: "",
        total_amount: "",
      });
      loadQuotes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const convertToInvoice = async (quote: Quote) => {
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const { error: invoiceError } = await supabase.from("invoices").insert({
        company_id: profile!.company_id,
        invoice_number: invoiceNumber,
        customer_name: quote.customer_name,
        customer_email: quote.customer_email,
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: null,
        total_amount: quote.total_amount,
        subtotal: quote.total_amount / 1.15,
        tax_amount: (quote.total_amount * 0.15) / 1.15,
        status: "draft",
        quote_id: quote.id,
      });
      if (invoiceError) throw invoiceError;
      const { error: updateError } = await supabase
        .from("quotes")
        .update({ status: "converted" })
        .eq("id", quote.id);
      if (updateError) throw updateError;
      toast({ title: "Success", description: "Quote converted to invoice successfully" });
      loadQuotes();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const canEdit = isAdmin || isAccountant;

  const filteredQuotes = useMemo(() => {
    let result = quotes;
    
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(quote => 
        quote.customer_name.toLowerCase().includes(q) ||
        quote.quote_number.toLowerCase().includes(q)
      );
    }

    // View Filter
    if (viewFilter !== "all") {
       // Assuming viewFilter maps to statuses or 'accepted' (which includes converted)
       if (viewFilter === 'accepted') {
        result = result.filter(q => q.status === 'accepted' || q.status === 'converted');
       } else {
        // Only filter if it matches a status exactly, otherwise ignore (or add more logic)
        // For simplicity, let's assume viewFilter can be a status
        // But for "View: All (No Filter)", we do nothing.
       }
    }
    
    // Sort
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key as keyof Quote];
        const bValue = b[sortConfig.key as keyof Quote];
        
        if (aValue === bValue) return 0;
        
        const comparison = aValue > bValue ? 1 : -1;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [quotes, searchQuery, viewFilter, sortConfig]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredQuotes.map(q => q.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Metrics for report
  const metrics = {
    total: quotes.reduce((acc, q) => acc + Number(q.total_amount || 0), 0),
    count: quotes.length,
    accepted: quotes.filter(q => q.status === 'accepted' || q.status === 'converted').length,
  };

  const statusData = [
    { name: 'Draft', value: filteredQuotes.filter(q => q.status === 'draft').length },
    { name: 'Sent', value: filteredQuotes.filter(q => q.status === 'sent').length },
    { name: 'Accepted', value: filteredQuotes.filter(q => q.status === 'accepted' || q.status === 'converted').length },
    { name: 'Expired', value: filteredQuotes.filter(q => q.status === 'expired').length },
  ].filter(i => i.value > 0);

  const monthlyData = useMemo(() => {
    const data: Record<string, number> = {};
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    filteredQuotes.forEach(q => {
      const d = new Date(q.quote_date);
      const key = `${months[d.getMonth()]} ${d.getFullYear().toString().substr(2)}`;
      data[key] = (data[key] || 0) + (q.total_amount || 0);
    });

    return Object.entries(data)
      .map(([name, value]) => ({ name, value }))
      .slice(-6);
  }, [filteredQuotes]);

  return (
    <>
      <SEO title="Customer Quotes | Rigel Business" description="View and manage customer quotes" />
      <DashboardLayout>
        <div className="flex flex-col h-full gap-4">
          
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Customer Quotes</h1>
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between bg-card p-2 rounded-md border shadow-sm">
            <div className="flex items-center gap-2">
               {canEdit && (
                <Button onClick={() => setDialogOpen(true)} className="bg-[#0070ad] hover:bg-[#005a8b] text-white">
                  Add Quote
                </Button>
               )}
            </div>
            
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search"
                  className="pl-8 w-[200px] h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">View:</span>
                <Select value={viewFilter} onValueChange={setViewFilter}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="All (No Filter)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All (No Filter)</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1 text-muted-foreground">
                 <Button variant="outline" size="sm" className="h-9 gap-1 text-[#0070ad] border-[#0070ad] hover:bg-blue-50" onClick={() => setShowReport(true)}>
                    Quick Reports <ChevronDown className="h-3 w-3" />
                 </Button>
              </div>
            </div>
          </div>

          {/* Actions Bar */}
          <div className="flex items-center gap-2 py-1">
             <DropdownMenu>
               <DropdownMenuTrigger asChild>
                 <Button variant="ghost" size="sm" className="gap-1 text-primary font-medium hover:text-primary/80 hover:bg-transparent px-0">
                   <ArrowRight className="h-4 w-4 rotate-45" /> Actions <ChevronDown className="h-3 w-3" />
                 </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="start">
                 <DropdownMenuItem>Delete Selected</DropdownMenuItem>
                 <DropdownMenuItem>Update Status</DropdownMenuItem>
               </DropdownMenuContent>
             </DropdownMenu>

             <div className="h-4 w-[1px] bg-border mx-2"></div>

             <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" disabled={selectedIds.length === 0}>
               Delete
             </Button>
             <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" disabled={selectedIds.length === 0}>
               Print
             </Button>
             <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" disabled={selectedIds.length === 0}>
               Email
             </Button>
             <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" disabled={selectedIds.length === 0}>
               Update Status
             </Button>
          </div>

          {/* Table */}
          <div className="rounded-md border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-[#404040]">
                <TableRow className="hover:bg-[#404040] border-b-0">
                  <TableHead className="w-[40px] pl-4">
                    <Checkbox 
                      checked={selectedIds.length === filteredQuotes.length && filteredQuotes.length > 0}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      className="border-white data-[state=checked]:bg-white data-[state=checked]:text-[#404040]"
                    />
                  </TableHead>
                  <TableHead className="text-white cursor-pointer hover:bg-white/10" onClick={() => handleSort('customer_name')}>
                    Customer Name {sortConfig?.key === 'customer_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-white cursor-pointer hover:bg-white/10" onClick={() => handleSort('quote_number')}>
                     Doc. No. {sortConfig?.key === 'quote_number' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-white">Cust. Ref.</TableHead>
                  <TableHead className="text-white cursor-pointer hover:bg-white/10" onClick={() => handleSort('quote_date')}>
                    Date {sortConfig?.key === 'quote_date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-white text-right cursor-pointer hover:bg-white/10" onClick={() => handleSort('total_amount')}>
                    Total {sortConfig?.key === 'total_amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="text-white text-center">Printed</TableHead>
                  <TableHead className="text-white">Status</TableHead>
                  <TableHead className="text-white text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">Loading...</TableCell>
                  </TableRow>
                ) : filteredQuotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No quotes found.</TableCell>
                  </TableRow>
                ) : (
                  filteredQuotes.map((quote, index) => (
                    <TableRow key={quote.id} className={index % 2 === 0 ? "bg-white hover:bg-muted/50" : "bg-muted/20 hover:bg-muted/50"}>
                      <TableCell className="pl-4">
                        <Checkbox 
                          checked={selectedIds.includes(quote.id)}
                          onCheckedChange={(checked) => handleSelectRow(quote.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{quote.customer_name}</TableCell>
                      <TableCell className="text-[#0070ad] hover:underline cursor-pointer">{quote.quote_number}</TableCell>
                      <TableCell>-</TableCell>
                      <TableCell>{new Date(quote.quote_date).toLocaleDateString('en-ZA')}</TableCell>
                      <TableCell className="text-right font-medium">R {Number(quote.total_amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox disabled checked={false} className="opacity-50" />
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded border text-xs font-medium uppercase ${
                          quote.status === 'converted' || quote.status === 'accepted' ? 'bg-green-50 text-green-700 border-green-200' :
                          quote.status === 'sent' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          quote.status === 'expired' ? 'bg-red-50 text-red-700 border-red-200' :
                          'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          {quote.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 gap-1 text-[#0070ad]">
                              Actions <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDownloadQuote(quote)}>
                              <Eye className="mr-2 h-4 w-4" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadQuote(quote)}>
                              <Printer className="mr-2 h-4 w-4" /> Print
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSendDialog(quote)} disabled={!quote.customer_email}>
                              <Mail className="mr-2 h-4 w-4" /> Email
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled>
                              <FileEdit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>Update Status</DropdownMenuItem>
                            {quote.status !== 'converted' && (
                              <DropdownMenuItem onClick={() => convertToInvoice(quote)}>
                                <FileText className="mr-2 h-4 w-4" /> Create Invoice
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem>Create Sales Order</DropdownMenuItem>
                            <DropdownMenuItem>
                              <Copy className="mr-2 h-4 w-4" /> Copy Quote
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>View History</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination (Visual only for now as no backend pagination) */}
          <div className="flex items-center gap-2 mt-2">
            <Button variant="outline" size="sm" disabled>First</Button>
            <Button variant="default" size="sm" className="bg-[#0070ad]">1</Button>
            <Button variant="outline" size="sm" disabled>Last</Button>
            <span className="text-sm text-muted-foreground ml-2">
              Displaying 1 - {filteredQuotes.length} of {filteredQuotes.length}
            </span>
          </div>

        </div>
      </DashboardLayout>

      {/* Reports Dialog */}
      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quotes Report</DialogTitle>
            <DialogDescription>Performance overview and status distribution</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Quote Value by Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R${value/1000}k`} />
                      <RechartsTooltip formatter={(value) => [`R ${Number(value).toLocaleString()}`, 'Value']} />
                      <Bar dataKey="value" fill="#8884d8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
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
                      <RechartsTooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="col-span-1 md:col-span-2">
              <h3 className="text-lg font-semibold mb-4">Summary Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <div className="text-sm text-muted-foreground">Total Quotes</div>
                  <div className="text-2xl font-bold mt-1">{metrics.count}</div>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <div className="text-sm text-muted-foreground">Total Value</div>
                  <div className="text-2xl font-bold mt-1">R {metrics.total.toLocaleString()}</div>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <div className="text-sm text-muted-foreground">Conversion Rate</div>
                  <div className="text-2xl font-bold mt-1">
                    {metrics.count > 0 ? Math.round((metrics.accepted / metrics.count) * 100) : 0}%
                  </div>
                </div>
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <div className="text-sm text-muted-foreground">Avg. Quote Value</div>
                  <div className="text-2xl font-bold mt-1">
                    R {metrics.count > 0 ? Math.round(metrics.total / metrics.count).toLocaleString() : 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
             <Button onClick={() => window.print()} variant="outline" className="mr-2">Print Report</Button>
             <Button onClick={() => setShowReport(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[640px] p-4">
          <DialogHeader>
            <DialogTitle>Add Quote</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Customer Name</Label>
                <Input value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} />
              </div>
              <div>
                <Label>Customer Email</Label>
                <Input type="email" value={formData.customer_email} onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })} />
              </div>
              <div>
                <Label>Quote Date</Label>
                <Input type="date" value={formData.quote_date} onChange={(e) => setFormData({ ...formData, quote_date: e.target.value })} />
              </div>
              <div>
                <Label>Expiry Date</Label>
                <Input type="date" value={formData.expiry_date} onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })} />
              </div>
              <div>
                <Label>Total Amount</Label>
                <Input type="number" step="0.01" value={formData.total_amount} onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="email" placeholder="Recipient email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} />
            <Textarea rows={6} value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSendEmail} disabled={sending}>{sending ? 'Sending…' : 'Send'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
