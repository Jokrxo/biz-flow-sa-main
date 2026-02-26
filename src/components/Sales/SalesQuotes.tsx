import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
  Search, Filter, ChevronDown, Trash2, Printer, RefreshCw, MoreVertical, Copy, Eye, FileEdit,
  FileSpreadsheet, Settings, AlertTriangle, XCircle, Check, ArrowUpDown, History
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { buildQuotePDF, type QuoteForPDF, type QuoteItemForPDF, type CompanyForPDF } from '@/lib/quote-export';
import { sendEmailWithResend, blobToBase64 } from '@/lib/resend-email';
import { addLogoToPDF, fetchLogoDataUrl } from '@/lib/invoice-export';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

export const SalesQuotes = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, isAccountant } = useRoles();
  const navigate = useNavigate();
  const location = useLocation();
  
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
  const [isEditMode, setIsEditMode] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusValue, setStatusValue] = useState<string>("draft");
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any>(null);
  const [orderType, setOrderType] = useState<'product' | 'service'>('product');
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [itemsForm, setItemsForm] = useState<{ product_id?: string; description: string; quantity: number; unit_price: number; tax_rate: number }[]>([
    { product_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 15 },
  ]);
  const [cannotDeleteOpen, setCannotDeleteOpen] = useState(false);
  const [cannotDeleteItems, setCannotDeleteItems] = useState<{ quote_number: string; status: string; reason: string }[]>([]);
  const [cannotEditOpen, setCannotEditOpen] = useState(false);
  const [cannotEditInfo, setCannotEditInfo] = useState<{ quote_number: string; status: string; reason: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'selected' | 'current'>('current');
  const [hideSO, setHideSO] = useState(true);
  const [confirmInvoiceOpen, setConfirmInvoiceOpen] = useState(false);
  const [quoteToConvert, setQuoteToConvert] = useState<any>(null);
  const selectedCustomer = useMemo(
    () => customers.find(c => c.name === formData.customer_name),
    [customers, formData.customer_name]
  );

  const getCompanyId = useCallback(async (fallback?: any) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user?.id)
      .maybeSingle();
    if ((profile as any)?.company_id) return (profile as any).company_id;
    if (fallback && (fallback as any).company_id) return (fallback as any).company_id;
    const { data: comp } = await supabase
      .from('companies')
      .select('id')
      .limit(1)
      .maybeSingle();
    if ((comp as any)?.id) return (comp as any).id;
    throw new Error('Company not found');
  }, [user?.id]);

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

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      // Support both action=create and openCreate=1
      if (params.get('action') === 'create' || params.get('openCreate') === '1') {
        const name = params.get('customer') || params.get('customer_name') || "";
        const email = params.get('email') || "";
        setFormData({
          customer_name: decodeURIComponent(name),
          customer_email: email,
          quote_date: new Date().toISOString().split("T")[0],
          expiry_date: "",
          total_amount: "",
        });
        setDialogOpen(true);
        // Clear URL parameters
        navigate(window.location.pathname, { replace: true });
      }
    } catch {}
  }, [navigate]);

  const loadLists = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();
      const companyId = profile?.company_id;
      if (!companyId) return;
      const [{ data: cust }, { data: prod }, { data: svc }] = await Promise.all([
        supabase.from('customers').select('name,email').eq('company_id', companyId).order('name'),
        supabase.from('items').select('*').eq('company_id', companyId).eq('item_type', 'product').order('name'),
        supabase.from('items').select('*').eq('company_id', companyId).eq('item_type', 'service').order('name'),
      ]);
      setCustomers(cust || []);
      setProducts(prod || []);
      setServices(svc || []);
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    if (dialogOpen) loadLists();
  }, [dialogOpen, loadLists]);

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

  // Handle print quote (opens print dialog)
  const handlePrintQuote = async (q: any) => {
    try {
      const [company, items] = await Promise.all([
        fetchCompanyForPDF(),
        fetchQuoteItemsForPDF(q.id),
      ]);
      const dto = mapQuoteForPDF(q);
      const doc = buildQuotePDF(dto, items as QuoteItemForPDF[], company);
      const logoDataUrl = await fetchLogoDataUrl(company.logo_url);
      if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
      
      // Open print dialog
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast({ title: 'Error', description: 'Could not open print window', variant: 'destructive' });
        return;
      }
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      printWindow.document.write(`
        <html>
          <head><title>Print Quote ${q.quote_number}</title></head>
          <body style="margin:0;">
            <iframe src="${pdfUrl}" style="width:100%;height:100%;" onload="this.contentWindow.print();"></iframe>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to print quote', variant: 'destructive' });
    }
  };

  // Load quote items for editing
  const loadQuoteItemsForEdit = async (quoteId: string) => {
    const { data: items } = await supabase
      .from('quote_items')
      .select('product_id, description, quantity, unit_price, tax_rate, item_type')
      .eq('quote_id', quoteId);
    return items || [];
  };

  // Handle edit quote
  const handleEditQuote = async (q: any) => {
    try {
      const items = await loadQuoteItemsForEdit(q.id);
      setFormData({
        customer_name: q.customer_name || '',
        customer_email: q.customer_email || '',
        quote_date: q.quote_date || new Date().toISOString().split('T')[0],
        expiry_date: q.expiry_date || '',
        notes: q.notes || '',
      });
      setItemsForm(items.length > 0 ? items.map((item: any) => ({
        product_id: item.product_id || '',
        description: item.description || '',
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        tax_rate: item.tax_rate || 15,
        item_type: item.item_type || 'product'
      })) : [{ product_id: '', description: '', quantity: 1, unit_price: 0, tax_rate: 15, item_type: 'product' }]);
      setSelectedQuote(q);
      setIsEditMode(true);
      setDialogOpen(true);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load quote for editing', variant: 'destructive' });
    }
  };

  // Handle view quote history
  const handleViewHistory = async (q: any) => {
    try {
      const { data: history } = await supabase
        .from('quote_history')
        .select('*')
        .eq('quote_id', q.id)
        .order('created_at', { ascending: false });
      setHistoryData(history || []);
      setSelectedQuote(q);
      setHistoryDialogOpen(true);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load quote history', variant: 'destructive' });
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
      
      // Generate PDF blob
      const blob = doc.output('blob');
      const fileName = `quote_${dto.quote_number}.pdf`;
      
      // Upload to Supabase storage (for backup/tracking)
      const path = `quotes/${fileName}`;
      const { error: uploadErr } = await supabase.storage
        .from('quotes')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true });
      let publicUrl = '';
      if (!uploadErr) {
        const { data } = supabase.storage.from('quotes').getPublicUrl(path);
        publicUrl = data?.publicUrl || '';
      }
      
      // Convert PDF to base64 for attachment
      const base64Pdf = await blobToBase64(blob);
      
      // Send email with Resend API
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
          <h2 style="color: #333;">Quote ${dto.quote_number}</h2>
          <p>Dear Customer,</p>
          <p>${sendMessage || 'Please find attached your quote.'}</p>
          <div style="margin: 20px 0; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
            <p style="margin: 5px 0;"><strong>Quote Number:</strong> ${dto.quote_number}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${dto.quote_date}</p>
            <p style="margin: 5px 0;"><strong>Total Amount:</strong> R ${dto.total_amount}</p>
            ${dto.expiry_date ? `<p style="margin: 5px 0;"><strong>Valid Until:</strong> ${dto.expiry_date}</p>` : ''}
          </div>
          ${publicUrl ? `<p>Or download directly: <a href="${publicUrl}">${publicUrl}</a></p>` : ''}
          <p style="margin-top: 30px;">Kind regards,<br/>${company.name}</p>
        </div>
      `;

      const result = await sendEmailWithResend({
        to: sendEmail,
        subject: `Quote ${dto.quote_number}`,
        html: htmlContent,
        attachments: [
          {
            filename: fileName,
            content: base64Pdf,
            contentType: 'application/pdf',
          },
        ],
      });

      if (result.error) {
        // Fallback to mailto if Resend fails
        console.warn('Resend failed, falling back to mailto:', result.error);
        const subject = encodeURIComponent(`Quote ${dto.quote_number}`);
        const bodyLines = [sendMessage, publicUrl ? `\nDownload your quote: ${publicUrl}` : ''].join('\n');
        const body = encodeURIComponent(bodyLines);
        window.location.href = `mailto:${sendEmail}?subject=${subject}&body=${body}`;
      } else {
        // Update quote status
        await supabase
          .from('quotes')
          .update({ status: 'sent' })
          .eq('id', selectedQuote.id);
        toast({ title: 'Success', description: 'Email sent successfully with quote attached' });
      }
      setSendDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to send email', variant: 'destructive' });
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
    if (hideSO) {
      result = result.filter(q => !String(q.quote_number || '').startsWith('SO-'));
    }
    
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

  const checkProtectedQuotes = useCallback(async (ids: string[]) => {
    const blocked: { quote_number: string; status: string; reason: string }[] = [];
    const local = quotes.filter(q => ids.includes(q.id));
    local.forEach(q => {
      if (q.status === 'converted') {
        blocked.push({ quote_number: q.quote_number, status: q.status, reason: 'Invoiced' });
      }
    });
    const { data: invs } = await supabase.from('invoices').select('id, quote_id').in('quote_id', ids);
    (invs || []).forEach((inv: any) => {
      const q = local.find(x => x.id === inv.quote_id);
      if (q && !blocked.find(b => b.quote_number === q.quote_number)) {
        blocked.push({ quote_number: q.quote_number, status: q.status, reason: 'Invoiced' });
      }
    });
    return blocked;
  }, [quotes]);

  const handleDeleteQuotes = useCallback(async (ids: string[]) => {
    const blocked = await checkProtectedQuotes(ids);
    if (blocked.length > 0) {
      setCannotDeleteItems(blocked);
      setCannotDeleteOpen(true);
      return;
    }
    const ok = window.confirm(`Delete ${ids.length} quote(s)? This cannot be undone.`);
    if (!ok) return;
    await supabase.from('quote_items').delete().in('quote_id', ids);
    await supabase.from('quotes').delete().in('id', ids);
    toast({ title: 'Deleted', description: 'Selected quotes removed' });
    setSelectedIds([]);
    loadQuotes();
  }, [checkProtectedQuotes, loadQuotes, toast]);

  return (
    <div className="space-y-4 font-sans text-sm">
      <h2 className="text-2xl font-normal text-gray-700">Customer Quotes</h2>

      {/* Toolbar */}
      <div className="flex items-center justify-between bg-transparent">
        <div className="flex items-center gap-2">
           {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-[#0070ad] hover:bg-[#005a8b] text-white rounded-sm h-9 px-4 font-normal">
                  Add Quote
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { setOrderType('service'); setDialogOpen(true); }}>
                  Service
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setOrderType('product'); setDialogOpen(true); }}>
                  Product (Inventory)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
           )}
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <span className="text-gray-600 mr-2 text-sm">Search:</span>
            <div className="relative flex items-center">
                <Input 
                    type="search"
                    placeholder="Search..." 
                    className="w-[200px] h-9 rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:border-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="bg-[#0070ad] h-9 w-9 flex items-center justify-center rounded-r-sm text-white cursor-pointer">
                    <Search className="h-4 w-4" />
                </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-sm whitespace-nowrap">View:</span>
            <Select value={viewFilter} onValueChange={setViewFilter}>
              <SelectTrigger className="w-[180px] h-9 bg-white rounded-sm border-gray-300">
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

          <div className="flex items-center gap-2 text-gray-400">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-gray-600">
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSortConfig({ key: 'quote_date', direction: 'asc' })}>Date ↑</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortConfig({ key: 'quote_date', direction: 'desc' })}>Date ↓</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortConfig({ key: 'total_amount', direction: 'asc' })}>Total ↑</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortConfig({ key: 'total_amount', direction: 'desc' })}>Total ↓</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortConfig({ key: 'customer_name', direction: 'asc' })}>Customer A–Z</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortConfig({ key: 'customer_name', direction: 'desc' })}>Customer Z–A</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-gray-600">
                  <FileSpreadsheet className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  const rows = (exportScope === 'selected' && selectedIds.length > 0) ? quotes.filter(q => selectedIds.includes(q.id)) : filteredQuotes;
                  const header = ['Quote #','Customer','Date','Expiry','Status','Total'];
                  const lines = rows.map(r => [
                    r.quote_number,
                    r.customer_name,
                    new Date(r.quote_date).toLocaleDateString('en-ZA'),
                    r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('en-ZA') : '',
                    r.status,
                    String(r.total_amount || 0)
                  ]);
                  const csv = [header.join(','), ...lines.map(l => l.join(','))].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'quotes.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}>CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const rows = (exportScope === 'selected' && selectedIds.length > 0) ? quotes.filter(q => selectedIds.includes(q.id)) : filteredQuotes;
                  const data = rows.map(r => ({
                    'Quote #': r.quote_number,
                    'Customer': r.customer_name,
                    'Date': new Date(r.quote_date).toLocaleDateString('en-ZA'),
                    'Expiry': r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('en-ZA') : '',
                    'Status': r.status,
                    'Total': Number(r.total_amount || 0)
                  }));
                  const ws = XLSX.utils.json_to_sheet(data);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, 'Quotes');
                  XLSX.writeFile(wb, 'quotes.xlsx');
                }}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const rows = (exportScope === 'selected' && selectedIds.length > 0) ? quotes.filter(q => selectedIds.includes(q.id)) : filteredQuotes;
                  const doc = new jsPDF();
                  autoTable(doc, {
                    head: [['Quote #','Customer','Date','Expiry','Status','Total']],
                    body: rows.map(r => [
                      r.quote_number,
                      r.customer_name,
                      new Date(r.quote_date).toLocaleDateString('en-ZA'),
                      r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('en-ZA') : '',
                      r.status,
                      `R ${Number(r.total_amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                    ]),
                    styles: { fontSize: 8 }
                  });
                  doc.save('quotes.pdf');
                }}>PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-gray-600" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" className="h-9 gap-1 text-[#0070ad] border-[#0070ad] bg-white hover:bg-blue-50 rounded-sm font-normal" onClick={() => setShowReport(true)}>
            Quick Reports <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 h-8">
          <div className="flex items-center gap-1 text-[#0070ad] text-sm font-medium cursor-pointer">
            <ArrowRight className="h-3 w-3 rotate-45" /> Actions
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-gray-700"
            onClick={async () => {
              try {
                await handleDeleteQuotes(selectedIds);
              } catch (e: any) {
                toast({ title: 'Error', description: e.message, variant: 'destructive' });
              }
            }}
          >Delete</Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-gray-700" 
            onClick={() => {
              const q = filteredQuotes.find(x => x.id === selectedIds[0]);
              if (q) handleDownloadQuote(q);
            }}
          >Print</Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-gray-700" 
            onClick={() => {
              const q = filteredQuotes.find(x => x.id === selectedIds[0]);
              if (q) openSendDialog(q);
            }}
          >Email</Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-gray-700" 
            onClick={() => {
              const first = filteredQuotes.find(q => q.id === selectedIds[0]);
              if (first) {
                setSelectedQuote(first);
                setStatusValue(first.status || 'draft');
                setStatusDialogOpen(true);
              }
            }}
          >Update Status</Button>
        </div>
      )}

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Quotes Settings</DialogTitle>
            <DialogDescription>Configure export and view options</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Export Scope</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="exportScope"
                    value="current"
                    checked={exportScope === 'current'}
                    onChange={() => setExportScope('current')}
                  />
                  <span>Current view</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="exportScope"
                    value="selected"
                    checked={exportScope === 'selected'}
                    onChange={() => setExportScope('selected')}
                  />
                  <span>Selected only</span>
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between border rounded px-3 py-2">
              <div>
                <div className="font-medium">Hide Sales Orders</div>
                <div className="text-xs text-muted-foreground">Exclude SO- documents from the list</div>
              </div>
              <Checkbox checked={hideSO} onCheckedChange={(c) => setHideSO(!!c)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSettingsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <div className="border rounded-sm overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-[#4b4b4b] hover:bg-[#4b4b4b]">
            <TableRow className="hover:bg-[#4b4b4b] border-none">
              <TableHead className="w-[40px] text-white h-9">
                <Checkbox 
                  checked={selectedIds.length === filteredQuotes.length && filteredQuotes.length > 0}
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                  className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-[#4b4b4b]"
                />
              </TableHead>
              <TableHead className="text-white font-medium h-9 cursor-pointer hover:bg-white/10" onClick={() => handleSort('customer_name')}>
                Customer Name {sortConfig?.key === 'customer_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="text-white font-medium h-9 cursor-pointer hover:bg-white/10" onClick={() => handleSort('quote_number')}>
                 Doc. No. {sortConfig?.key === 'quote_number' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="text-white font-medium h-9">Cust. Ref.</TableHead>
              <TableHead className="text-white font-medium h-9 cursor-pointer hover:bg-white/10" onClick={() => handleSort('quote_date')}>
                Date {sortConfig?.key === 'quote_date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="text-white font-medium h-9 text-right cursor-pointer hover:bg-white/10" onClick={() => handleSort('total_amount')}>
                Total {sortConfig?.key === 'total_amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="text-white font-medium h-9 text-center">Printed</TableHead>
              <TableHead className="text-white font-medium h-9">Status</TableHead>
              <TableHead className="text-white font-medium h-9 text-right pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                    <div className="flex justify-center items-center">Loading...</div>
                </TableCell>
              </TableRow>
            ) : filteredQuotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No quotes found.</TableCell>
              </TableRow>
            ) : (
              filteredQuotes.map((quote, index) => (
                <TableRow key={quote.id} className={`hover:bg-blue-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <TableCell className="py-2">
                    <Checkbox 
                      checked={selectedIds.includes(quote.id)}
                      onCheckedChange={(checked) => handleSelectRow(quote.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell className="font-medium py-2 text-[#0070ad] cursor-pointer hover:underline">{quote.customer_name}</TableCell>
                  <TableCell className="py-2 text-[#0070ad] cursor-pointer hover:underline">{quote.quote_number}</TableCell>
                  <TableCell className="py-2 text-gray-500"></TableCell>
                  <TableCell className="py-2 text-gray-600">{new Date(quote.quote_date).toLocaleDateString('en-ZA')}</TableCell>
                  <TableCell className="text-right py-2 font-medium text-gray-700">R {Number(quote.total_amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-center py-2">
                    <Checkbox disabled checked={false} className="opacity-50" />
                  </TableCell>
                  <TableCell className="py-2">
                    <div className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                      quote.status === 'converted' || quote.status === 'accepted' ? 'bg-green-50 text-green-600 border-green-500' :
                      quote.status === 'sent' ? 'bg-green-50 text-green-600 border-green-500' : // Sent often considered 'active' or similar to invoice pending acceptance
                      quote.status === 'expired' ? 'bg-orange-50 text-orange-600 border-orange-500' :
                      quote.status === 'declined' ? 'bg-red-50 text-red-600 border-red-500' :
                      'bg-gray-50 text-gray-600 border-gray-400' // Draft/Pending
                    }`}>
                      {quote.status === 'draft' ? 'Pending' : 
                       quote.status === 'converted' ? 'Invoiced' :
                       quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right py-2 pr-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 text-[#0070ad] hover:text-[#005a8b] hover:bg-blue-50 font-medium">
                          Actions <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleDownloadQuote(quote)}>
                          <Eye className="mr-2 h-4 w-4" /> Preview
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handlePrintQuote(quote)}>
                          <Printer className="mr-2 h-4 w-4" /> Print
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleViewHistory(quote)}>
                          <History className="mr-2 h-4 w-4" /> View History
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openSendDialog(quote)} disabled={!quote.customer_email}>
                          <Mail className="mr-2 h-4 w-4" /> Email
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleEditQuote(quote)}>
                          <FileEdit className="mr-2 h-4 w-4" /> Edit Quote
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          disabled={quote.status === 'converted'}
                          onClick={async () => {
                            try {
                              await handleDeleteQuotes([quote.id]);
                            } catch (e: any) {
                              toast({ title: 'Error', description: e.message, variant: 'destructive' });
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => {
                          setSelectedQuote(quote);
                          setStatusValue(quote.status || 'draft');
                          setStatusDialogOpen(true);
                        }}>Update Status</DropdownMenuItem>
                        {quote.status !== 'converted' && (
                          <DropdownMenuItem onClick={() => {
                            setQuoteToConvert(quote);
                            setConfirmInvoiceOpen(true);
                          }}>
                            <FileText className="mr-2 h-4 w-4" /> Create Invoice
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={async () => {
                          try {
                            const quoNumber = `QUO-${Date.now().toString().slice(-6)}`;
                            const companyId = await getCompanyId(quote);
                            const { data: newQuote, error: qErr } = await supabase
                              .from('quotes')
                              .insert({
                                company_id: companyId,
                                quote_number: quoNumber,
                                customer_name: quote.customer_name,
                                customer_email: quote.customer_email,
                                quote_date: new Date().toISOString().split('T')[0],
                                expiry_date: quote.expiry_date,
                                subtotal: quote.subtotal,
                                tax_amount: quote.tax_amount,
                                total_amount: quote.total_amount,
                                notes: quote.notes,
                                status: 'draft'
                              })
                              .select()
                              .single();
                            if (qErr) throw qErr;
                            const { data: items } = await supabase.from('quote_items').select('*').eq('quote_id', quote.id);
                            if (items && items.length > 0) {
                              const newItems = items.map((it: any) => ({
                                quote_id: newQuote.id,
                                description: it.description,
                                quantity: it.quantity,
                                unit_price: it.unit_price,
                                tax_rate: it.tax_rate,
                                amount: it.amount,
                              }));
                              await supabase.from('quote_items').insert(newItems);
                            }
                            toast({ title: 'Quote copied', description: 'New quote created from copy' });
                            loadQuotes();
                          } catch (e: any) {
                            toast({ title: 'Error', description: e.message, variant: 'destructive' });
                          }
                        }}>
                          <Copy className="mr-2 h-4 w-4" /> Copy Quote
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={async () => {
                          try {
                            const { data: invoice } = await supabase.from('invoices').select('id,invoice_number,status,created_at').eq('quote_id', quote.id).maybeSingle();
                            setHistoryData({
                              created_at: quote.created_at,
                              updated_at: quote.updated_at,
                              status: quote.status,
                              invoice
                            });
                            setHistoryDialogOpen(true);
                          } catch (e: any) {
                            toast({ title: 'Error', description: e.message, variant: 'destructive' });
                          }
                        }}>View History</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={cannotEditOpen} onOpenChange={setCannotEditOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Editing Not Allowed</DialogTitle>
            <DialogDescription>
              {cannotEditInfo?.reason || 'This quote can no longer be edited.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {cannotEditInfo && (
              <div className="flex items-center justify-between border rounded px-3 py-2">
                <div>
                  <div className="font-medium">Document: {cannotEditInfo.quote_number}</div>
                  <div className="text-xs text-muted-foreground">Status: {cannotEditInfo.status}</div>
                </div>
                <div className="text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-700 border border-yellow-300">
                  Locked
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCannotEditOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cannotDeleteOpen} onOpenChange={setCannotDeleteOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Cannot Delete</DialogTitle>
            <DialogDescription>
              The selected quote(s) cannot be deleted because they are already invoiced or have a Sales Order created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {cannotDeleteItems.map((it, idx) => (
              <div key={idx} className="flex items-center justify-between border rounded px-3 py-2">
                <div>
                  <div className="font-medium">Document: {it.quote_number}</div>
                  <div className="text-xs text-muted-foreground">Status: {it.status}</div>
                </div>
                <div className="text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-700 border border-yellow-300">
                  {it.reason}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setCannotDeleteOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Footer / Pagination */}
      <div className="flex items-center gap-2 mt-4 text-sm">
          <Button 
              variant="outline" 
              size="sm" 
              className="h-8 px-3 text-gray-600"
              disabled
          >
              First
          </Button>
          <Button 
              variant="default" 
              size="sm" 
              className="h-8 w-8 bg-[#0070ad] hover:bg-[#005a8b]"
          >
              1
          </Button>
          <Button 
              variant="outline" 
              size="sm" 
              className="h-8 px-3 text-gray-600"
              disabled
          >
              Last
          </Button>
          <span className="text-gray-500 ml-2">
              Displaying 1 - {filteredQuotes.length} of {filteredQuotes.length}
          </span>
      </div>

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

      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) { setIsEditMode(false); setItemsForm([{ product_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 15 }]); } }}>
        <DialogContent className="sm:max-w-[980px] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4">
          <DialogHeader>
            <DialogTitle>{isEditMode ? 'Edit Quote' : 'Create Quote'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={async (e) => {
            if (!isEditMode) return handleSubmit(e);
            e.preventDefault();
            try {
              if (!selectedQuote) return;
              if (selectedQuote?.status === 'converted') {
                setCannotEditOpen(true);
                return;
              }
              // Calculate totals from itemsForm
              const subtotal = itemsForm.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
              const taxAmount = itemsForm.reduce((sum, item) => sum + (item.quantity * item.unit_price * (item.tax_rate / 100)), 0);
              const total = subtotal + taxAmount;
              
              const { error } = await supabase.from('quotes').update({
                customer_name: formData.customer_name,
                customer_email: formData.customer_email || null,
                quote_date: formData.quote_date,
                expiry_date: formData.expiry_date || null,
                total_amount: total,
                subtotal: subtotal,
                tax_amount: taxAmount,
                notes: formData.notes || null,
              }).eq('id', selectedQuote.id);
              if (error) throw error;
              
              // Delete existing items and re-insert
              await supabase.from('quote_items').delete().eq('quote_id', selectedQuote.id);
              
              const newItems = itemsForm.map((item: any) => ({
                quote_id: selectedQuote.id,
                product_id: item.product_id,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                tax_rate: item.tax_rate,
                item_type: item.item_type || 'product'
              }));
              
              const { error: itemsError } = await supabase.from('quote_items').insert(newItems);
              if (itemsError) throw itemsError;
              
              toast({ title: 'Updated', description: 'Quote updated successfully' });
              setDialogOpen(false);
              setIsEditMode(false);
              loadQuotes();
            } catch (err: any) {
              toast({ title: 'Error', description: err.message, variant: 'destructive' });
            }
          }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-7">
                <div className="p-5 border rounded-xl bg-card shadow-sm space-y-4 h-full">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                      Customer Details
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Type:</span>
                      <Select value={orderType} onValueChange={(v: any) => setOrderType(v)}>
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">Inventory Order</SelectItem>
                          <SelectItem value="service">Service Order</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Select Customer</Label>
                    <Select value={formData.customer_name} onValueChange={(name) => {
                      const sel = customers.find(c => c.name === name);
                      setFormData({ ...formData, customer_name: name, customer_email: sel?.email ?? '' });
                    }}>
                      <SelectTrigger className="w-full bg-background">
                        <SelectValue placeholder="Search or select customer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c: any) => (
                          <SelectItem key={c.id || c.name} value={c.name}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedCustomer ? (
                    <div className="mt-2 p-4 bg-muted/30 rounded-lg border border-dashed">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground uppercase font-semibold">Address</div>
                          <div className="text-sm whitespace-pre-wrap">{selectedCustomer.address || "No address on file"}</div>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs text-muted-foreground uppercase font-semibold">Contact</div>
                            <div className="text-sm">{selectedCustomer.phone || "No phone"}</div>
                            <div className="text-sm text-muted-foreground">{selectedCustomer.email}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 p-8 border border-dashed rounded-lg text-center text-muted-foreground text-sm bg-muted/10">
                      Select a customer to view details
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-5">
                <div className="p-5 border rounded-xl bg-card shadow-sm space-y-4 h-full">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
                    Order Info
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <Label>Order Date</Label>
                      <Input type="date" value={formData.quote_date} onChange={(e) => setFormData({ ...formData, quote_date: e.target.value })} />
                    </div>
                    <div>
                      <Label>Expiry Date</Label>
                      <Input type="date" value={formData.expiry_date} onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })} />
                    </div>
                    <div className="pt-2">
                      <Label>Order Reference</Label>
                      <Input placeholder="Auto-generated (Draft)" disabled className="bg-muted/50" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <Label className="text-base font-semibold">
                  {orderType === 'service' ? 'Service Details' : 'Line Items'}
                </Label>
                <Button size="sm" variant="outline" onClick={() => setItemsForm([...itemsForm, { product_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 15 }])} className="border-dashed">
                  <Plus className="h-4 w-4 mr-2" />
                  {orderType === 'service' ? 'Add Service' : 'Add Item'}
                </Button>
              </div>
              
              <div className="border rounded-xl overflow-hidden bg-card">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className={orderType === 'service' ? "w-[55%]" : "w-[40%]"}>{orderType === 'service' ? 'Service Description' : 'Description / Item'}</TableHead>
                      {orderType !== 'service' && <TableHead className="w-[15%] text-right">Quantity</TableHead>}
                      <TableHead className="w-[15%] text-right">Unit Price</TableHead>
                      <TableHead className="w-[12%] text-right">Tax Rate</TableHead>
                      <TableHead className="w-[15%] text-right">Line Total</TableHead>
                      <TableHead className="w-[3%]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsForm.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div className="space-y-1">
                            {orderType === 'product' && (
                              <Select value={item.product_id} onValueChange={(val) => {
                                const prod = products.find((p: any) => String(p.id) === String(val)) || services.find((s: any) => String(s.id) === String(val));
                                const next = [...itemsForm];
                                (next[index] as any).product_id = val;
                                (next[index] as any).description = prod ? (prod.name ?? prod.description ?? '') : '';
                                if (prod && typeof prod.unit_price === 'number') (next[index] as any).unit_price = prod.unit_price;
                                setItemsForm(next);
                              }}>
                                <SelectTrigger className="border-0 bg-transparent px-0 h-auto py-0 text-xs text-muted-foreground w-full mb-1">
                                  <SelectValue placeholder="Select Product..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map((p: any) => (
                                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {orderType === 'service' && (
                              <Select value={item.product_id} onValueChange={(val) => {
                                const svc = services.find((s: any) => String(s.id) === String(val));
                                const next = [...itemsForm];
                                (next[index] as any).product_id = val;
                                (next[index] as any).description = svc ? (svc.name ?? svc.description ?? '') : '';
                                if (svc && typeof svc.unit_price === 'number') (next[index] as any).unit_price = svc.unit_price;
                                setItemsForm(next);
                              }}>
                                <SelectTrigger className="border-0 bg-transparent px-0 h-auto py-0 text-xs text-muted-foreground w-full mb-1">
                                  <SelectValue placeholder="Select Service..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {services.map((s: any) => (
                                    <SelectItem key={s.id} value={String(s.id)}>{s.name || s.description}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <Input
                              className="border-0 bg-transparent focus-visible:ring-0 px-0 h-auto py-1 font-medium"
                              placeholder={orderType === 'service' ? "Enter service description..." : "Enter item description..."}
                              value={item.description}
                              onChange={(e) => {
                                const next = [...itemsForm];
                                next[index] = { ...next[index], description: e.target.value };
                                setItemsForm(next);
                              }}
                            />
                          </div>
                        </TableCell>
                        {orderType !== 'service' && (
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="1"
                              className="border-0 bg-transparent text-right px-0 h-auto py-1"
                              value={item.quantity}
                              onChange={(e) => {
                                const next = [...itemsForm];
                                next[index] = { ...next[index], quantity: parseFloat(e.target.value) || 0 };
                                setItemsForm(next);
                              }}
                            />
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="border-0 bg-transparent text-right px-0 h-auto py-1"
                            value={item.unit_price}
                            onChange={(e) => {
                              const next = [...itemsForm];
                              next[index] = { ...next[index], unit_price: parseFloat(e.target.value) || 0 };
                              setItemsForm(next);
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min="0"
                              className="border-0 bg-transparent text-right px-0 h-auto py-1 w-12"
                              value={item.tax_rate}
                              onChange={(e) => {
                                const next = [...itemsForm];
                                next[index] = { ...next[index], tax_rate: parseFloat(e.target.value) || 0 };
                                setItemsForm(next);
                              }}
                            />
                            <span className="text-muted-foreground text-xs">%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {((item.quantity || 0) * (item.unit_price || 0)).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (itemsForm.length === 1) return;
                              const next = itemsForm.filter((_, i) => i !== index);
                              setItemsForm(next);
                            }}
                            disabled={itemsForm.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-7">
                <Label>Notes</Label>
                <Textarea placeholder="Add any notes..." rows={4} value={''} onChange={() => {}} disabled />
              </div>
              <div className="md:col-span-5">
                <div className="bg-muted/30 border rounded-xl p-5 space-y-3">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-mono">{itemsForm.reduce((s, it) => s + (it.quantity * it.unit_price), 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tax Amount</span>
                    <span className="font-mono">{itemsForm.reduce((s, it) => s + (it.quantity * it.unit_price * (it.tax_rate / 100)), 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
                  </div>
                  <div className="border-t my-2 pt-2 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="font-mono text-primary">{itemsForm.reduce((s, it) => s + (it.quantity * it.unit_price * (1 + it.tax_rate / 100)), 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setIsEditMode(false); }}>Cancel</Button>
              <Button
                type="button"
                onClick={async () => {
                  if (!isAdmin && !isAccountant) { toast({ title: "Permission denied", variant: "destructive" }); return; }
                  if (!formData.customer_name) { toast({ title: "Customer required", description: "Please select a customer.", variant: "destructive" }); return; }
                  if (orderType === 'product') {
                    if (itemsForm.some((it) => !it.product_id)) { toast({ title: "Item required", description: "Select a product for each item.", variant: "destructive" }); return; }
                    if (itemsForm.some((it) => (Number(it.quantity) || 0) <= 0)) { toast({ title: "Invalid quantity", description: "Each item must have quantity > 0.", variant: "destructive" }); return; }
                  } else {
                    if (itemsForm.some((it) => !it.description)) { toast({ title: "Description required", description: "Enter a description for each service.", variant: "destructive" }); return; }
                  }
                  try {
                    setCreating(true);
                    const { data: profile } = await supabase
                      .from("profiles")
                      .select("company_id")
                      .eq("user_id", user?.id)
                      .single();
                    const quoteNumber = `QUO-${Date.now().toString().slice(-6)}`;
                    const subtotal = itemsForm.reduce((s, it) => s + (it.quantity * it.unit_price), 0);
                    const tax = itemsForm.reduce((s, it) => s + (it.quantity * it.unit_price * (it.tax_rate / 100)), 0);
                    const total = subtotal + tax;
                    const { data: q, error: qErr } = await supabase
                      .from("quotes")
                      .insert({
                        company_id: profile!.company_id,
                        quote_number: quoteNumber,
                        customer_name: formData.customer_name,
                        customer_email: formData.customer_email || null,
                        quote_date: formData.quote_date,
                        expiry_date: formData.expiry_date || null,
                        subtotal,
                        tax_amount: tax,
                        total_amount: total,
                        status: "draft",
                      })
                      .select()
                      .single();
                    if (qErr) throw qErr;
                    const rows = itemsForm.map((it) => ({
                      quote_id: q.id,
                      description: it.description,
                      quantity: orderType === 'service' ? 1 : it.quantity,
                      unit_price: it.unit_price,
                      tax_rate: it.tax_rate,
                      amount: (orderType === 'service' ? 1 : it.quantity) * it.unit_price * (1 + it.tax_rate / 100),
                    }));
                    if (rows.length > 0) await supabase.from('quote_items').insert(rows);
                    toast({ title: "Success", description: "Quote created successfully" });
                    setDialogOpen(false);
                    setItemsForm([{ product_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 15 }]);
                    loadQuotes();
                  } catch (e: any) {
                    toast({ title: "Error", description: e.message, variant: "destructive" });
                  } finally {
                    setCreating(false);
                  }
                }}
                disabled={creating}
              >
                {isEditMode ? 'Save Changes' : (creating ? 'Creating…' : 'Create Quote')}
              </Button>
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

      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>Status</Label>
            <Select value={statusValue} onValueChange={setStatusValue}>
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="converted">Invoiced</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!selectedQuote) return;
              try {
                await supabase.from('quotes').update({ status: statusValue }).eq('id', selectedQuote.id);
                toast({ title: 'Updated', description: 'Status updated' });
                setStatusDialogOpen(false);
                loadQuotes();
              } catch (e: any) {
                toast({ title: 'Error', description: e.message, variant: 'destructive' });
              }
            }}>Update</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Quote History - {selectedQuote?.quote_number}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-3">
            {historyData && historyData.length > 0 ? (
              historyData.map((record: any, index: number) => (
                <div key={index} className="border rounded p-3 text-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">
                      {record.action || record.change_type || 'Update'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {record.created_at ? new Date(record.created_at).toLocaleString() : '-'}
                    </span>
                  </div>
                  <div className="text-gray-600">
                    {record.details || record.description || 'No details'}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-center py-4">No history records found</div>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setHistoryDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmInvoiceOpen} onOpenChange={setConfirmInvoiceOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to convert Quote {quoteToConvert?.quote_number} to an invoice?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmInvoiceOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (quoteToConvert) convertToInvoice(quoteToConvert);
              setConfirmInvoiceOpen(false);
            }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
