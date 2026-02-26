import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { transactionsApi } from "@/lib/transactions-api";
import { TransactionFormEnhanced } from "@/components/Transactions/TransactionFormEnhanced";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRoles } from "@/hooks/use-roles";
import { Download, Mail, Plus, Trash2, FileText, MoreHorizontal, CheckCircle2, Clock, AlertTriangle, DollarSign, FilePlus, ArrowRight, Check, History, Upload, Loader2, Filter, Search, Settings, FileSpreadsheet, ArrowUpDown, ChevronDown, Printer, FileInput, Copy, Receipt, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { exportInvoiceToPDF, buildInvoicePDF, addLogoToPDF, fetchLogoDataUrl, type InvoiceForPDF, type InvoiceItemForPDF, type CompanyForPDF } from '@/lib/invoice-export';
import { exportInvoicesToExcel } from '@/lib/export-utils';

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Progress } from "@/components/ui/progress";

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  notes: string | null;
  amount_paid?: number;
  sent_at?: string | null;
  paid_at?: string | null;
}

export const SalesInvoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invoiceTypeDialogOpen, setInvoiceTypeDialogOpen] = useState(false);
  const [invoicePaymentMode, setInvoicePaymentMode] = useState<'cash' | 'credit' | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, isAccountant } = useRoles();
  const navigate = useNavigate();
  const todayStr = new Date().toISOString().split("T")[0];
  const [posting, setPosting] = useState(false);
  const [lastPosting, setLastPosting] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(7);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [searchText, setSearchText] = useState("");
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  
  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isVatRegistered, setIsVatRegistered] = useState(false);

  useEffect(() => {
    async function fetchCompany() {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    }
    fetchCompany();
  }, [user]);

  useEffect(() => {
    async function checkVatStatus() {
      if (!companyId) return;
      const { data } = await supabase
        .from('companies')
        .select('vat_number')
        .eq('id', companyId)
        .single();
      
      setIsVatRegistered(!!data?.vat_number);
    }
    checkVatStatus();
  }, [companyId]);

  useEffect(() => {
    if (!isVatRegistered) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => ({ ...item, tax_rate: 0 }))
      }));
    }
  }, [isVatRegistered]);

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_email: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: "",
    notes: "",
    items: [{ product_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 15 }]
  });

  // Send dialog state (inside component)
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState<string>('');
  const [sendMessage, setSendMessage] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [companyEmail, setCompanyEmail] = useState<string>('');

  // Edit/Copy/History dialog state
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [invoiceHistory, setInvoiceHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState<string>(todayStr);
  const [paymentInvoice, setPaymentInvoice] = useState<any>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");

  const [sentDialogOpen, setSentDialogOpen] = useState(false);
  const [sentDate, setSentDate] = useState<string>(todayStr);
  const [sentInvoice, setSentInvoice] = useState<any>(null);
  const [sentIncludeVAT, setSentIncludeVAT] = useState<boolean>(true);
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalEditData, setJournalEditData] = useState<any>(null);

  // Credit Note / Adjustment State
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [invoiceToCredit, setInvoiceToCredit] = useState<any>(null);
  const [creditReason, setCreditReason] = useState("");
  const [isCrediting, setIsCrediting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .maybeSingle();
      if (!profile) return;
      const { data: customersData } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("name");
      setCustomers(customersData || []);
      const { data: productsData } = await supabase
        .from("items")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("item_type", "product")
        .order("name");
      setProducts(productsData || []);
      const { data: servicesData } = await supabase
        .from("items")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("item_type", "service")
        .order("name");
      setServices(servicesData || []);
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      setInvoices(data || []);
      try {
        await (supabase as any).rpc('backfill_invoice_postings', { _company_id: profile.company_id });
        await (supabase as any).rpc('refresh_afs_cache', { _company_id: profile.company_id });
      } catch {}
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);
  useEffect(() => {
    loadData();

    // Real-time updates
    const channel = supabase
      .channel('invoices-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  useEffect(() => {
    const loadCompanyEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!profile?.company_id) return;
      const { data: company } = await supabase
        .from('companies')
        .select('email')
        .eq('id', profile.company_id)
        .maybeSingle();
      setCompanyEmail((company as any)?.email || '');
    };
    loadCompanyEmail();
  }, []);

  const handleConfirmSent = async () => {
    if (!sentInvoice) return;
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "sent", sent_at: new Date(sentDate).toISOString() })
        .eq("id", sentInvoice.id);
      if (error) throw error;
      await openJournalForSent(sentInvoice, sentDate, sentIncludeVAT);
      toast({ title: "Success", description: "Opening transaction form to post Debtors (AR), Revenue and VAT; plus COGS/Inventory if applicable" });
      setSentDialogOpen(false);
      setSentInvoice(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { product_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: 15 }]
    });
  };

  const removeItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const updateItemProduct = (index: number, productId: string) => {
    const product = products.find((p: any) => String(p.id) === String(productId));
    const service = services.find((s: any) => String(s.id) === String(productId));
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], product_id: productId };
    const picked = product || service;
    if (picked) {
      const name = (picked.name ?? picked.description ?? '').toString();
      newItems[index].description = name;
      if (typeof picked.unit_price === 'number') {
        newItems[index].unit_price = picked.unit_price;
      }
    }
    setFormData({ ...formData, items: newItems });
  };

  // Apply selected customer to form (name and email)
  const applyCustomerSelection = (name: string) => {
    const selected = customers.find((c: any) => c.name === name);
    setFormData(prev => ({
      ...prev,
      customer_name: name,
      customer_email: selected?.email ?? "",
    }));
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    formData.items.forEach(item => {
      const amount = item.quantity * item.unit_price;
      subtotal += amount;
      taxAmount += amount * (item.tax_rate / 100);
    });

    return { subtotal, taxAmount, total: subtotal + taxAmount };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDateLocked(formData.invoice_date)) {
      setDialogOpen(false);
      setIsLockDialogOpen(true);
      return;
    }
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }
    if (!formData.customer_name) {
      toast({ title: "Customer required", description: "Please select a customer.", variant: "destructive" });
      return;
    }
    if (formData.items.some((it: any) => !it.product_id)) {
      toast({ title: "Product required", description: "Please select a product for each item.", variant: "destructive" });
      return;
    }
    if (formData.items.some((it: any) => (Number(it.quantity) || 0) <= 0)) {
      toast({ title: "Invalid quantity", description: "Each item must have quantity > 0.", variant: "destructive" });
      return;
    }
    // Validate stock availability against loaded products
    for (const it of formData.items) {
      const prod = products.find((p: any) => String(p.id) === String(it.product_id));
      const svc = services.find((s: any) => String(s.id) === String(it.product_id));
      if (svc) continue;
      const available = Number(prod?.quantity_on_hand ?? 0);
      const requested = Number(it.quantity ?? 0);
      if (!prod) {
        toast({ title: "Product not found", description: "Selected product no longer exists.", variant: "destructive" });
        return;
      }
      if (requested > available) {
        toast({ title: "Insufficient stock", description: `Requested ${requested}, available ${available} for ${prod.name}.`, variant: "destructive" });
        return;
      }
    }
    // Date validation: invoice_date must be today or earlier; due_date (if provided) must be >= invoice_date
    const invDate = new Date(formData.invoice_date);
    const dueDate = formData.due_date ? new Date(formData.due_date) : null;
    const today = new Date(todayStr);
    if (isNaN(invDate.getTime())) {
      toast({ title: "Invalid date", description: "Invoice date is not valid.", variant: "destructive" });
      return;
    }
    if (invDate > today) {
      toast({ title: "Invalid invoice date", description: "Invoice date cannot be in the future.", variant: "destructive" });
      return;
    }
    if (dueDate && dueDate < invDate) {
      toast({ title: "Invalid due date", description: "Due date cannot be earlier than invoice date.", variant: "destructive" });
      return;
    }

    // Handle edit mode
    if (isEditMode && editingInvoice) {
      await handleUpdateInvoice();
      return;
    }

    setDialogOpen(false);
    try {
      setIsSubmitting(true);
      setProgress(10);
      setProgressText("Creating Invoice...");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();

      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const totals = calculateTotals();

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          company_id: profile!.company_id,
          invoice_number: invoiceNumber,
          customer_name: formData.customer_name,
          customer_email: formData.customer_email || null,
          invoice_date: formData.invoice_date,
          due_date: formData.due_date || null,
          subtotal: totals.subtotal,
          tax_amount: totals.taxAmount,
          total_amount: totals.total,
          notes: formData.notes || null,
          status: "draft"
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      setProgress(40);
      setProgressText("Saving Invoice Items...");
      await new Promise(r => setTimeout(r, 400));

      // Create invoice items
      const items = formData.items.map(item => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        amount: item.quantity * item.unit_price * (1 + item.tax_rate / 100),
        item_type: services.find((s: any) => String(s.id) === String(item.product_id)) ? 'service' : 'product'
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(items);

      if (itemsError) throw itemsError;

      setProgress(70);
      setProgressText("Updating Inventory...");
      await new Promise(r => setTimeout(r, 400));

      // Decrease stock for each product item
      for (const it of formData.items) {
        const prod = products.find((p: any) => String(p.id) === String(it.product_id));
        const svc = services.find((s: any) => String(s.id) === String(it.product_id));
        if (!prod || svc) continue;
        const currentQty = Number(prod.quantity_on_hand ?? 0);
        const newQty = currentQty - Number(it.quantity ?? 0);
        const { error: stockError } = await supabase
          .from("items")
          .update({ quantity_on_hand: newQty })
          .eq("id", prod.id);
        if (stockError) throw stockError;
      }

      setProgress(100);
      setProgressText("Finalizing...");
      await new Promise(r => setTimeout(r, 600));

      setSuccessMessage("Invoice created successfully");
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setIsSubmitting(false);
      }, 2000);
      
      // If cash sale: post issuance (AR/Revenue/VAT & COGS), mark sent, then open payment dialog
      try {
        if (invoicePaymentMode === 'cash') {
          await transactionsApi.postInvoiceSentClient(invoice, formData.invoice_date);
          await supabase.from('invoices').update({ status: 'sent' }).eq('id', invoice.id);
          const totalsNow = totals;
          setPaymentInvoice({ ...invoice, _payment_amount: totalsNow.total, _cash_sale: true });
          setPaymentDate(todayStr);
          setPaymentAmount(totalsNow.total);
          const companyId = await getCompanyId();
          if (companyId) {
            const list = await loadBankAccounts(companyId);
            if (!list || list.length === 0) {
              toast({ title: "No bank accounts", description: "Add a bank account in the Bank module before posting payment.", variant: "destructive" });
            } else {
              setSelectedBankId("");
              setPaymentDialogOpen(true);
            }
          } else {
            setPaymentDialogOpen(true);
          }
        }
      } catch {}
      setInvoicePaymentMode(null);
      resetForm();
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsSubmitting(false);
      setDialogOpen(true);
    }
  };

  // Handle update invoice (edit mode)
  const handleUpdateInvoice = async () => {
    if (!editingInvoice) return;
    
    setDialogOpen(false);
    setIsSubmitting(true);
    setProgress(10);
    setProgressText("Updating Invoice...");
    
    try {
      // Calculate totals
      const subtotal = formData.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);
      const taxAmount = formData.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price * (item.tax_rate / 100)), 0);
      const total = subtotal + taxAmount;
      
      // Update invoice
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          customer_name: formData.customer_name,
          customer_email: formData.customer_email || null,
          invoice_date: formData.invoice_date,
          due_date: formData.due_date || null,
          subtotal: subtotal,
          tax_amount: taxAmount,
          total_amount: total,
          notes: formData.notes || null
        })
        .eq('id', editingInvoice.id);
      
      if (updateError) throw updateError;
      
      // Delete existing items and re-insert
      await supabase.from('invoice_items').delete().eq('invoice_id', editingInvoice.id);
      
      const items = formData.items.map((item: any) => ({
        invoice_id: editingInvoice.id,
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate
      }));
      
      const { error: itemsError } = await supabase.from('invoice_items').insert(items);
      if (itemsError) throw itemsError;
      
      toast({ title: 'Success', description: 'Invoice updated successfully' });
      setIsEditMode(false);
      setEditingInvoice(null);
      resetForm();
      loadData();
    } catch (error: any) {
      console.error('Error updating invoice:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update invoice', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
      setProgress(0);
      setProgressText("");
    }
  };

  const resetForm = () => {
    setFormData({
      customer_name: "",
      customer_email: "",
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: "",
      notes: "",
      items: [{ product_id: "", description: "", quantity: 1, unit_price: 0, tax_rate: isVatRegistered ? 15 : 0 }]
    });
  };

  const getCompanyId = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user?.id)
      .maybeSingle();
    return profile?.company_id as string;
  };

  const loadAccounts = async (companyId: string) => {
    try { await (supabase as any).rpc('ensure_core_accounts', { _company_id: companyId }); } catch {}
    const { data } = await supabase
      .from("chart_of_accounts")
      .select("id, account_name, account_type, account_code")
      .eq("company_id", companyId)
      .eq("is_active", true);
    return (data || []) as Array<{ id: string; account_name: string; account_type: string; account_code: string }>;
  };

  const loadBankAccounts = async (companyId: string) => {
    const { data } = await supabase
      .from("bank_accounts")
      .select("id,bank_name,account_name,account_number")
      .eq("company_id", companyId)
      .order("bank_name");
    const list = data || [];
    setBankAccounts(list);
    return list;
  };

  const findAccountByCodeOrName = (
    accounts: Array<{ id: string; account_name: string; account_type: string; account_code: string }>,
    type: string,
    codes: string[],
    names: string[]
  ) => {
    const lower = accounts.map(a => ({
      ...a,
      account_name: (a.account_name || "").toLowerCase(),
      account_type: (a.account_type || "").toLowerCase(),
      account_code: (a.account_code || "").toString()
    }));
    const byType = lower.filter(a => a.account_type === type.toLowerCase());
    const byCode = byType.find(a => codes.includes((a.account_code || "").toString()));
    if (byCode) return byCode.id;
    const byName = byType.find(a => names.some(k => a.account_name.includes(k)));
    return byName?.id || byType[0]?.id || null;
  };

  const ensureNoDuplicatePosting = async (companyId: string, reference: string) => {
    const { data: txs } = await supabase
      .from("transactions")
      .select("id")
      .eq("company_id", companyId)
      .eq("reference_number", reference);
    const ids = (txs || []).map(t => t.id);
    if (ids.length === 0) return true;
    const { count } = await supabase
      .from("transaction_entries")
      .select("id", { count: 'exact', head: true })
      .in("transaction_id", ids);
    return (count || 0) === 0;
  };

  const insertEntries = async (
    companyId: string,
    txId: string,
    entryDate: string,
    description: string,
    rows: Array<{ account_id: string; debit: number; credit: number }>
  ) => {
    const txEntries = rows.map(r => ({ transaction_id: txId, account_id: r.account_id, debit: r.debit, credit: r.credit, description, status: "approved" }));
    const { error: teErr } = await supabase.from("transaction_entries").insert(txEntries);
    if (teErr) throw teErr;
  };

  const postInvoiceSent = async (inv: any, postDateStr?: string) => {
    try {
      setPosting(true);
      setIsSubmitting(true);
      setProgress(10);
      setProgressText("Posting Invoice to Ledger...");

      const postDate = postDateStr || inv.invoice_date;
      // Post full AR/Revenue/VAT and COGS/Inventory via client to guarantee all four accounts
      await transactionsApi.postInvoiceSentClient(inv, postDate);
      
      setProgress(70);
      setProgressText("Updating Financial Statements...");
      await new Promise(r => setTimeout(r, 600));

      const companyId = await getCompanyId();
      if (companyId) {
        try { await supabase.rpc('refresh_afs_cache', { _company_id: companyId }); } catch {}
      }
      
      setProgress(100);
      setProgressText("Posted Successfully");
      await new Promise(r => setTimeout(r, 400));

      toast({ title: "Success", description: `Posted invoice ${inv.invoice_number}: Dr Receivable | Cr Revenue, Cr VAT; Dr COGS | Cr Inventory` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || 'Failed to post Sent invoice', variant: 'destructive' });
    } finally {
      setPosting(false);
      setIsSubmitting(false);
    }
  };

  const openJournalForSent = async (inv: any, postDateStr?: string, includeVAT?: boolean) => {
    const companyId = await getCompanyId();
    if (!companyId) return;
    try { await (supabase as any).rpc('ensure_core_accounts', { _company_id: companyId }); } catch {}
    let accounts = await loadAccounts(companyId);
    const pick = (
      type: string,
      codes: string[],
      names: string[]
    ) => {
      const id = findAccountByCodeOrName(accounts, type, codes, names);
      if (id) return id;
      const lower = accounts.map(a => ({
        ...a,
        account_type: (a.account_type || '').toLowerCase(),
        account_name: (a.account_name || '').toLowerCase(),
        account_code: (a.account_code || '').toString(),
      }));
      const byType = lower.filter(a => a.account_type === type.toLowerCase());
      return byType[0]?.id || null;
    };
    let arId = pick('asset', ['1200'], ['receiv','debtors','accounts receiv']);
    let revId = pick('income', ['4000'], ['sales revenue','revenue','sales','income']);
    if (!arId) {
      const { data } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1200', account_name: 'Accounts Receivable', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      arId = (data as any)?.id || arId;
      accounts = await loadAccounts(companyId);
    }
    if (!revId) {
      const { data } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '4000', account_name: 'Sales Revenue', account_type: 'income', is_active: true })
        .select('id')
        .single();
      revId = (data as any)?.id || revId;
      accounts = await loadAccounts(companyId);
    }
    const amount = Number(inv.total_amount || inv.subtotal || 0);
    const net = Number(inv.subtotal || 0);
    const vat = Number(inv.tax_amount || 0);
    const rate = net > 0 ? ((vat / net) * 100) : 0;
    const editData = {
      id: null,
      transaction_date: postDateStr || inv.invoice_date,
      description: `Invoice ${inv.invoice_number || inv.id} issued`,
      reference_number: inv.invoice_number || null,
      transaction_type: 'income',
      payment_method: 'accrual',
      debit_account_id: arId,
      credit_account_id: revId,
      total_amount: includeVAT ? amount : net,
      vat_rate: includeVAT ? String(rate.toFixed(2)) : '0',
      bank_account_id: null,
      lockType: 'sent',
    };
    setJournalEditData(editData);
    setJournalOpen(true);
  };

  const postInvoicePaid = async (inv: any, payDateStr?: string, bankAccountId?: string) => {
    try {
      setPosting(true);
      setIsSubmitting(true);
      setProgress(10);
      setProgressText("Processing Payment...");

      const amt = Number(inv._payment_amount || inv.total_amount || 0);
      try {
        await (supabase as any).rpc('post_invoice_paid', { _invoice_id: inv.id, _payment_date: payDateStr || todayStr, _bank_account_id: bankAccountId, _amount: amt });
      } catch (rpcErr) {
        await transactionsApi.postInvoicePaidClient(inv, payDateStr || todayStr, bankAccountId as string, amt);
      }
      
      setProgress(60);
      setProgressText("Updating Bank Balance...");
      await new Promise(r => setTimeout(r, 600));

      const companyId = await getCompanyId();
      if (companyId) {
        try { await supabase.rpc('refresh_afs_cache', { _company_id: companyId }); } catch {}
      }

      setProgress(100);
      setProgressText("Payment Recorded");
      await new Promise(r => setTimeout(r, 400));

      toast({ title: "Success", description: `Posted payment for ${inv.invoice_number}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || 'Failed to post payment', variant: 'destructive' });
    } finally {
      setPosting(false);
      setIsSubmitting(false);
    }
  };

  const openJournalForPaid = async (inv: any, payDateStr?: string, bankAccountId?: string, amount?: number) => {
    const companyId = await getCompanyId();
    if (!companyId) return;
    try { await (supabase as any).rpc('ensure_core_accounts', { _company_id: companyId }); } catch {}
    let accounts = await loadAccounts(companyId);
    const pick = (
      type: string,
      codes: string[],
      names: string[]
    ) => {
      const id = findAccountByCodeOrName(accounts, type, codes, names);
      if (id) return id;
      const lower = accounts.map(a => ({
        ...a,
        account_type: (a.account_type || '').toLowerCase(),
        account_name: (a.account_name || '').toLowerCase(),
        account_code: (a.account_code || '').toString(),
      }));
      const byType = lower.filter(a => a.account_type === type.toLowerCase());
      return byType[0]?.id || null;
    };
    let bankLedgerId = pick('asset', ['1100'], ['bank','cash']);
    let arId = pick('asset', ['1200'], ['receiv','debtors','accounts receiv']);
    if (!bankLedgerId) {
      const { data } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1100', account_name: 'Bank', account_type: 'asset', is_active: true, is_cash_equivalent: true, financial_statement_category: 'current_asset' })
        .select('id')
        .single();
      bankLedgerId = (data as any)?.id || bankLedgerId;
      accounts = await loadAccounts(companyId);
    }
    if (!arId) {
      const { data } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: '1200', account_name: 'Accounts Receivable', account_type: 'asset', is_active: true })
        .select('id')
        .single();
      arId = (data as any)?.id || arId;
      accounts = await loadAccounts(companyId);
    }
    const amt = Number(amount || inv._payment_amount || inv.total_amount || 0);
    const editData = {
      id: null,
      transaction_date: payDateStr || todayStr,
      description: `${inv._cash_sale ? 'Cash sale ' : ''}Payment for invoice ${inv.invoice_number || inv.id}`,
      reference_number: inv.invoice_number || null,
      transaction_type: 'receipt',
      payment_method: inv._cash_sale ? 'cash' : 'bank',
      bank_account_id: bankAccountId || null,
      debit_account_id: bankLedgerId,
      credit_account_id: arId,
      total_amount: amt,
      lockType: 'paid',
    };
    setJournalEditData(editData);
    setJournalOpen(true);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const inv = invoices.find(i => i.id === id);
      if (!inv) return;
      if (newStatus === "paid") {
        setPaymentInvoice(inv);
        setPaymentDate(todayStr);
        const amtPaid = Number(inv.amount_paid ?? 0);
        const outstanding = Math.max(0, Number(inv.total_amount || 0) - amtPaid);
        setPaymentAmount(outstanding);
        const companyId = await getCompanyId();
        if (companyId) {
          const list = await loadBankAccounts(companyId);
          if (!list || list.length === 0) {
            toast({ title: "No bank accounts", description: "Add a bank account in the Bank module before posting payment.", variant: "destructive" });
            return;
          }
        }
        setSelectedBankId("");
        setPaymentDialogOpen(true);
        return;
      }
      if (newStatus === "sent") {
        setSentInvoice(inv);
        setSentDate(todayStr);
        setSentDialogOpen(true);
        return;
      }

      const { error } = await supabase
        .from("invoices")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Success", description: "Invoice status updated" });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleConfirmPayment = async () => {
    if (!paymentInvoice) return;
    
    if (isDateLocked(paymentDate)) {
      setIsLockDialogOpen(true);
      return;
    }

    setPaymentDialogOpen(false);
    try {
      const outstanding = Math.max(0, Number(paymentInvoice.total_amount || 0) - Number(paymentInvoice.amount_paid || 0));
      const amount = Number(paymentAmount || 0);
      if (!amount || amount <= 0) {
        toast({ title: "Invalid amount", description: "Enter a payment amount greater than zero.", variant: "destructive" });
        return;
      }
      if (!selectedBankId) {
        toast({ title: "Bank required", description: "Select a bank account to post the payment.", variant: "destructive" });
        return;
      }
      const selectedBank = bankAccounts.find((b: any) => String(b.id) === String(selectedBankId));
      if (!selectedBank) {
        toast({ title: "Invalid bank account", description: "Selected bank account no longer exists.", variant: "destructive" });
        return;
      }
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(String(selectedBankId))) {
        toast({ title: "Invalid bank account ID", description: "Bank account identifier format is invalid.", variant: "destructive" });
        return;
      }
      if (amount > outstanding + 0.0001) {
        toast({ title: "Amount exceeds outstanding", description: `Outstanding: R ${outstanding.toLocaleString('en-ZA')}`, variant: "destructive" });
        return;
      }
      const { error } = await supabase
        .from("invoices")
        .update({ 
          status: amount >= outstanding ? "paid" : "sent", 
          amount_paid: Number(paymentInvoice.amount_paid || 0) + amount 
        })
        .eq("id", paymentInvoice.id);
      if (error) throw error;
      const invForPost = { ...paymentInvoice, _payment_amount: amount };
      await openJournalForPaid(invForPost, paymentDate, selectedBankId, amount);
      // Optionally record paid date if schema supports it (non-blocking)
      // if your invoices table includes paid_at, you can enable the following:
      // await (supabase as any).from('invoices').update({ paid_at: new Date(paymentDate).toISOString() }).eq('id', paymentInvoice.id);
      toast({ title: "Success", description: "Opening journal to post payment" });
      setPaymentInvoice(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setPaymentDialogOpen(true);
    }
  };

  const handleCreditNote = async () => {
    if (!invoiceToCredit) return;
    const today = new Date().toISOString().split('T')[0];
    if (isDateLocked(today)) {
      setCreditNoteOpen(false);
      setIsLockDialogOpen(true);
      return;
    }
    if (!creditReason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for the credit note.", variant: "destructive" });
      return;
    }

    setIsCrediting(true);
    try {
      // 1. Find original transaction
      const { data: originalTx } = await supabase
        .from('transactions')
        .select('*, transaction_entries(*)')
        .eq('reference_number', invoiceToCredit.invoice_number)
        .eq('company_id', invoiceToCredit.company_id)
        .maybeSingle();

      // 2. Create Reversal Entries if transaction exists
      if (originalTx) {
        const originalEntries = originalTx.transaction_entries || [];
        const reversalEntries = originalEntries.map((entry: any) => ({
          account_id: entry.account_id,
          debit: entry.credit,
          credit: entry.debit,
          description: `Credit Note/Reversal: ${entry.description || ''}`,
          status: 'approved'
        }));

        const { data: newTx, error: txError } = await supabase
          .from('transactions')
          .insert({
            company_id: invoiceToCredit.company_id,
            transaction_date: new Date().toISOString().split('T')[0],
            description: `Credit Note for ${invoiceToCredit.invoice_number}: ${creditReason}`,
            reference_number: `CN-${invoiceToCredit.invoice_number}-${Date.now().toString().slice(-4)}`,
            transaction_type: 'Credit Note',
            status: 'approved',
            total_amount: invoiceToCredit.total_amount,
            user_id: user?.id,
          })
          .select()
          .single();

        if (txError) throw txError;

        if (newTx && reversalEntries.length > 0) {
            const entriesWithTxId = reversalEntries.map((e: any) => ({
                ...e,
                transaction_id: newTx.id
            }));
            const { error: entriesError } = await supabase.from('transaction_entries').insert(entriesWithTxId);
            if (entriesError) throw entriesError;
        }
      }

      // 3. Update Invoice Status
      const { error: invError } = await supabase
        .from('invoices')
        .update({ 
            status: 'cancelled', 
            notes: `${invoiceToCredit.notes || ''}\n[Credit Note Issued: ${creditReason}]`
        })
        .eq('id', invoiceToCredit.id);

      if (invError) throw invError;

      toast({ title: "Success", description: "Credit Note issued and invoice cancelled." });
      setCreditNoteOpen(false);
      loadData();
    } catch (error: any) {
      console.error("Credit Note error:", error);
      toast({ title: "Error", description: error.message || "Failed to process credit note.", variant: "destructive" });
    } finally {
      setIsCrediting(false);
    }
  };

  // Helpers for PDF generation and email sending
  const fetchCompanyForPDF = async (): Promise<any> => {
    const { data, error } = await supabase
      .from('companies')
      .select('name,email,phone,address,tax_number,vat_number,logo_url')
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      return { name: 'Company' };
    }
    return {
      name: (data as any).name,
      email: (data as any).email,
      phone: (data as any).phone,
      address: (data as any).address,
      tax_number: (data as any).tax_number ?? null,
      vat_number: (data as any).vat_number ?? null,
      logo_url: (data as any).logo_url ?? null,
    };
  };

  const fetchInvoiceItemsForPDF = async (invoiceId: string): Promise<any[]> => {
    const { data, error } = await supabase
      .from('invoice_items')
      .select('description,quantity,unit_price,tax_rate')
      .eq('invoice_id', invoiceId);
    if (error || !data) return [] as any[];
    return data as any[];
  };

  const mapInvoiceForPDF = (inv: any) => ({
    invoice_number: inv.invoice_number || String(inv.id),
    invoice_date: inv.invoice_date || new Date().toISOString(),
    due_date: inv.due_date || null,
    customer_name: inv.customer_name || inv.customer?.name || 'Customer',
    customer_email: inv.customer_email || inv.customer?.email || null,
    notes: inv.notes || null,
    subtotal: inv.subtotal ?? inv.total_before_tax ?? 0,
    tax_amount: inv.tax_amount ?? inv.tax ?? 0,
    total_amount: inv.total_amount ?? inv.total ?? inv.amount ?? 0,
  });

  const handleDownloadInvoice = async (inv: any) => {
    try {
      const [company, items] = await Promise.all([
        fetchCompanyForPDF(),
        fetchInvoiceItemsForPDF(inv.id),
      ]);
      const dto = mapInvoiceForPDF(inv);
      const doc = buildInvoicePDF(dto, items, company);
      const logoDataUrl = await fetchLogoDataUrl(company.logo_url);
      if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
      doc.save(`invoice_${dto.invoice_number}.pdf`);
      toast({ title: 'Success', description: 'Invoice PDF downloaded' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to download invoice PDF', variant: 'destructive' });
    }
  };

  // Handle print invoice (opens print dialog)
  const handlePrintInvoice = async (inv: any) => {
    try {
      const [company, items] = await Promise.all([
        fetchCompanyForPDF(),
        fetchInvoiceItemsForPDF(inv.id),
      ]);
      const dto = mapInvoiceForPDF(inv);
      const doc = buildInvoicePDF(dto, items, company);
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
          <head><title>Print Invoice ${inv.invoice_number}</title></head>
          <body style="margin:0;">
            <iframe src="${pdfUrl}" style="width:100%;height:100%;" onload="this.contentWindow.print();"></iframe>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to print invoice', variant: 'destructive' });
    }
  };

  const openSendDialog = (inv: any) => {
    setSelectedInvoice(inv);
    const email = inv.customer_email || inv.customer?.email || '';
    setSendEmail(email);
    const totalText = inv.total_amount ?? inv.total ?? inv.amount ?? '';
    const msg = `Hello,\n\nPlease find your Invoice ${inv.invoice_number} for our company.\nTotal due: R ${totalText}.\n\nThank you.\n`;
    setSendMessage(msg);
    setSendDialogOpen(true);
  };

  // Load invoice items for editing/copying
  const loadInvoiceItemsForEdit = async (invoiceId: string) => {
    const { data: items } = await supabase
      .from('invoice_items')
      .select('product_id, description, quantity, unit_price, tax_rate')
      .eq('invoice_id', invoiceId);
    return items || [];
  };

  // Handle edit invoice
  const handleEditInvoice = async (inv: any) => {
    try {
      const items = await loadInvoiceItemsForEdit(inv.id);
      setFormData({
        customer_name: inv.customer_name || '',
        customer_email: inv.customer_email || '',
        invoice_date: inv.invoice_date || new Date().toISOString().split('T')[0],
        due_date: inv.due_date || '',
        notes: inv.notes || '',
        items: items.length > 0 ? items.map((item: any) => ({
          product_id: item.product_id || '',
          description: item.description || '',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          tax_rate: item.tax_rate || 15
        })) : [{ product_id: '', description: '', quantity: 1, unit_price: 0, tax_rate: isVatRegistered ? 15 : 0 }]
      });
      setEditingInvoice(inv);
      setIsEditMode(true);
      setDialogOpen(true);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load invoice for editing', variant: 'destructive' });
    }
  };

  // Handle copy invoice (create new from existing)
  const handleCopyInvoice = async (inv: any) => {
    try {
      const items = await loadInvoiceItemsForEdit(inv.id);
      setFormData({
        customer_name: inv.customer_name || '',
        customer_email: inv.customer_email || '',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: '',
        notes: inv.notes || '',
        items: items.length > 0 ? items.map((item: any) => ({
          product_id: item.product_id || '',
          description: item.description || '',
          quantity: item.quantity || 1,
          unit_price: item.unit_price || 0,
          tax_rate: item.tax_rate || 15
        })) : [{ product_id: '', description: '', quantity: 1, unit_price: 0, tax_rate: isVatRegistered ? 15 : 0 }]
      });
      setEditingInvoice(null);
      setIsEditMode(false);
      setInvoiceTypeDialogOpen(false);
      setDialogOpen(true);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to copy invoice', variant: 'destructive' });
    }
  };

  // Handle view history
  const handleViewHistory = async (inv: any) => {
    setLoadingHistory(true);
    setHistoryDialogOpen(true);
    try {
      // Build history from the invoice data we already have
      const historyEvents = [];
      
      // Add creation event
      historyEvents.push({ 
        date: inv.created_at || inv.invoice_date, 
        action: 'Invoice Created', 
        details: `Invoice ${inv.invoice_number} was created - Status: ${inv.status}` 
      });
      
      // Add sent event if applicable
      if (inv.sent_at) {
        historyEvents.push({ date: inv.sent_at, action: 'Invoice Sent', details: `Invoice was marked as sent` });
      }
      
      // Add paid event if applicable
      if (inv.paid_at) {
        historyEvents.push({ date: inv.paid_at, action: 'Payment Received', details: `Invoice was marked as paid` });
      }
      
      // Add current status
      historyEvents.push({ 
        date: new Date().toISOString(), 
        action: 'Current Status', 
        details: `Current status: ${inv.status}` 
      });
      
      setInvoiceHistory(historyEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } catch (error) {
      console.error('Error loading history:', error);
      setInvoiceHistory([]);
    }
    setLoadingHistory(false);
  };

  // Handle print delivery note
  const handlePrintDeliveryNote = async (inv: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Error', description: 'Could not open print window', variant: 'destructive' });
      return;
    }
    
    // Fetch invoice items if not already loaded
    let items = inv.items || [];
    if (!items.length && inv.id) {
      const { data: fetchedItems } = await supabase
        .from('invoice_items')
        .select('*, product:products(name)')
        .eq('invoice_id', inv.id);
      items = fetchedItems || [];
    }
    
    const taxRate = 15;
    
    // Calculate line totals with tax
    const itemsWithTax = items.map((item: any, index: number) => {
      const quantity = item.quantity || 0;
      const unitPrice = item.unit_price || 0;
      const subtotal = quantity * unitPrice;
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;
      return {
        lineNumber: index + 1,
        description: item.description || item.product?.name || 'Product/Service',
        quantity,
        unitPrice,
        taxRate,
        tax,
        total
      };
    });
    
    // Calculate grand totals
    const grandSubtotal = itemsWithTax.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
    const grandTax = itemsWithTax.reduce((sum: number, item: any) => sum + item.tax, 0);
    const grandTotal = grandSubtotal + grandTax;
    
    const content = `
      <html>
        <head>
          <title>Delivery Note - ${inv.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .invoice-number { font-size: 24px; font-weight: bold; }
            .info { margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .totals { margin-top: 20px; }
            .totals-table { width: 300px; margin-left: auto; }
            .totals-table td { padding: 8px; }
            .totals-table .total-row { font-weight: bold; font-size: 1.1em; }
            .footer { margin-top: 50px; text-align: center; }
            .company-info { margin-bottom: 20px; padding: 10px; background: #f9f9f9; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>DELIVERY NOTE</h1>
            <div class="invoice-number">${inv.invoice_number}</div>
          </div>
          
          <div class="company-info">
            <p><strong>Customer:</strong> ${inv.customer_name}</p>
            <p><strong>Email:</strong> ${inv.customer_email || 'N/A'}</p>
            <p><strong>Date:</strong> ${inv.invoice_date}</p>
            <p><strong>Due Date:</strong> ${inv.due_date || 'N/A'}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th class="text-center" style="width: 50px;">#</th>
                <th>Description</th>
                <th class="text-right" style="width: 80px;">Qty</th>
                <th class="text-right" style="width: 120px;">Price</th>
                <th class="text-right" style="width: 80px;">Tax (15%)</th>
                <th class="text-right" style="width: 120px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsWithTax.map((item: any) => `
                <tr>
                  <td class="text-center">${item.lineNumber}</td>
                  <td>${item.description}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">R ${item.unitPrice.toFixed(2)}</td>
                  <td class="text-right">R ${item.tax.toFixed(2)}</td>
                  <td class="text-right">R ${item.total.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <table class="totals-table">
            <tr>
              <td>Subtotal:</td>
              <td class="text-right">R ${grandSubtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Tax (15% VAT):</td>
              <td class="text-right">R ${grandTax.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>Total:</td>
              <td class="text-right">R ${grandTotal.toFixed(2)}</td>
            </tr>
          </table>
          
          <div class="footer">
            <p>Thank you for your business!</p>
            <p><small>This is a computer-generated document. No signature required.</small></p>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;
    
    printWindow.document.write(content);
    printWindow.document.close();
  };

  const handleSendEmail = async () => {
    if (!selectedInvoice) return;
    if (isDateLocked(selectedInvoice.invoice_date)) {
      setSendDialogOpen(false);
      setIsLockDialogOpen(true);
      return;
    }
    if (!sendEmail) {
      toast({ title: 'Error', description: 'Please enter recipient email', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const [company, items] = await Promise.all([
        fetchCompanyForPDF(),
        fetchInvoiceItemsForPDF(selectedInvoice.id),
      ]);
      const dto = mapInvoiceForPDF(selectedInvoice);
      const doc = buildInvoicePDF(dto, items, company);
      const logoDataUrl = await fetchLogoDataUrl(company.logo_url);
      if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
      const blob = doc.output('blob');
      const fileName = `invoice_${dto.invoice_number}.pdf`;
      const path = `invoices/${fileName}`;
      const { error: uploadErr } = await supabase.storage
        .from('invoices')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true });
      let publicUrl = '';
      if (!uploadErr) {
        const { data } = supabase.storage.from('invoices').getPublicUrl(path);
        publicUrl = data?.publicUrl || '';
      }
      const subject = encodeURIComponent(`Invoice ${dto.invoice_number}`);
      const bodyLines = [
        sendMessage,
        publicUrl ? `\nDownload your invoice: ${publicUrl}` : '',
      ].join('\n');
      const body = encodeURIComponent(bodyLines);
      const ccParam = companyEmail ? `&cc=${encodeURIComponent(companyEmail)}` : '';
      window.location.href = `mailto:${sendEmail}?subject=${subject}&body=${body}${ccParam}`;
      await supabase
        .from('invoices')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', selectedInvoice.id);
      await postInvoiceSent(selectedInvoice);
      toast({ title: 'Success', description: 'Email compose opened with invoice link' });
      setSendDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to prepare email', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const canEdit = isAdmin || isAccountant;
  const totals = calculateTotals();

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch = searchText === "" || 
      inv.invoice_number.toLowerCase().includes(searchText.toLowerCase()) ||
      inv.customer_name.toLowerCase().includes(searchText.toLowerCase()) ||
      (inv.notes && inv.notes.toLowerCase().includes(searchText.toLowerCase()));

    if (!matchesSearch) return false;

    const total = Number(inv.total_amount || 0);
    const paid = Number(inv.amount_paid || 0);
    const outstanding = Math.max(0, total - paid);
    switch (statusFilter) {
      case 'unpaid':
        return inv.status !== 'paid' && outstanding > 0;
      case 'paid':
        return inv.status === 'paid' || outstanding === 0;
      case 'draft':
        return inv.status === 'draft';
      case 'cancelled':
        return inv.status === 'cancelled';
      case 'overdue':
        return inv.status === 'overdue';
      default:
        return true;
    }
  });
  const filteredByDateInvoices = filteredInvoices.filter((inv) => {
    const d = new Date(inv.invoice_date);
    const matchesYear = yearFilter === 'all' || String(d.getFullYear()) === yearFilter;
    const matchesMonth = monthFilter === 'all' || String(d.getMonth() + 1).padStart(2, '0') === monthFilter;
    return matchesYear && matchesMonth;
  });

  const totalCount = filteredByDateInvoices.length;
  const start = page * pageSize;
  const pagedInvoices = filteredByDateInvoices.slice(start, start + pageSize);

  // Advanced Metrics & Charts Logic REMOVED as per user request (moved to ARDashboard)
  // Kept simple stats for metric cards? User said "hide them on invoice module".
  // Removing Metric Cards from return JSX.

  useEffect(() => {
    setPage(0);
  }, [statusFilter, yearFilter, monthFilter]);

  const exportFilteredInvoicesDate = () => {
    const filename = `invoices_${statusFilter}`;
    exportInvoicesToExcel(filteredByDateInvoices as any, filename);
  };

  const getStatusBadge = (status: string, dueDate: string | null, amountPaid: number, totalAmount: number) => {
    let colorClass = "";
    const outstanding = Math.max(0, totalAmount - amountPaid);
    
    if (status === 'paid' || outstanding <= 0) {
        colorClass = "bg-[#d1fae5] text-[#065f46]"; // Sage Green
    } else if (status === 'cancelled') {
        colorClass = "bg-gray-100 text-gray-800";
    } else if (dueDate && new Date(dueDate) < new Date()) {
        colorClass = "bg-[#fee2e2] text-[#991b1b]"; // Sage Red
    } else {
        colorClass = "bg-[#ffedd5] text-[#9a3412]"; // Sage Orange/Pending
    }

    return (
      <div className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
        {status === 'paid' ? 'PAID' : 
         status === 'cancelled' ? 'CANCELLED' : 
         (dueDate && new Date(dueDate) < new Date()) ? 'OVERDUE' :
         'UNPAID'}
      </div>
    );
  };

  return (
    <>
    <div className="space-y-4">
      {/* Sage-style Toolbar */}
      <div className="flex items-center justify-between bg-card p-2 rounded-md border shadow-sm">
        <div className="flex items-center gap-2">
           {canEdit && (
            <Button 
              className="bg-[#0070ad] hover:bg-[#005a8b] text-white"
              onClick={() => setInvoiceTypeDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Tax Invoice
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search"
              placeholder="Search..."
              className="pl-8 w-[250px] h-9"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">View:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
             <Button variant="outline" size="sm" className="h-9 gap-1 text-[#0070ad] border-[#0070ad] hover:bg-blue-50" onClick={exportFilteredInvoicesDate}>
               <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
             </Button>
             <Button variant="outline" size="sm" className="h-9 gap-1 text-[#0070ad] border-[#0070ad] hover:bg-blue-50">
               Quick Reports <ChevronDown className="h-3 w-3" />
             </Button>
          </div>
        </div>
      </div>

      {selectedInvoices.length > 0 && (
        <div className="flex items-center gap-2 py-2 px-3 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-700">
           <span className="font-medium">{selectedInvoices.length} selected</span>
           <div className="h-4 w-px bg-blue-200 mx-2" />
           <Button variant="ghost" size="sm" className="h-7 text-blue-700 hover:bg-blue-100 hover:text-blue-800" onClick={() => setSelectedInvoices([])}>
             Clear Selection
           </Button>
           <div className="flex-1" />
           <Button variant="ghost" size="sm" className="h-7 text-blue-700 hover:bg-blue-100 hover:text-blue-800">
             <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
           </Button>
           <Button variant="ghost" size="sm" className="h-7 text-blue-700 hover:bg-blue-100 hover:text-blue-800">
             <Download className="h-3.5 w-3.5 mr-1.5" /> Export
           </Button>
           <Button variant="ghost" size="sm" className="h-7 text-red-600 hover:bg-red-50 hover:text-red-700">
             <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
           </Button>
        </div>
      )}

      {lastPosting && (
        <div className="mb-4 p-3 border rounded bg-muted/30 text-sm">
          {lastPosting}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <Table>
              <TableHeader className="bg-[#2e2e2e] sticky top-0 z-10">
                  <TableRow className="hover:bg-[#2e2e2e] border-none">
                      <TableHead className="w-[40px] text-white/90 h-10">
                        <Checkbox 
                            className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-[#2e2e2e]"
                            checked={pagedInvoices.length > 0 && selectedInvoices.length === pagedInvoices.length}
                            onCheckedChange={(checked) => {
                                if (checked) setSelectedInvoices(pagedInvoices.map(i => i.id));
                                else setSelectedInvoices([]);
                            }}
                        />
                      </TableHead>
                      <TableHead className="text-white font-medium h-10">Customer Name</TableHead>
                      <TableHead className="text-white font-medium h-10">Doc. No.</TableHead>
                      <TableHead className="text-white font-medium h-10">Cust. Ref.</TableHead>
                      <TableHead className="text-white font-medium h-10">Date</TableHead>
                      <TableHead className="text-white font-medium h-10">Due Date</TableHead>
                      <TableHead className="text-white font-medium h-10 text-right">Total</TableHead>
                      <TableHead className="text-white font-medium h-10 text-right">Amount Due</TableHead>
                      <TableHead className="text-white font-medium h-10 text-center">Printed</TableHead>
                      <TableHead className="text-white font-medium h-10">Status</TableHead>
                      <TableHead className="text-white font-medium h-10 text-right">Actions</TableHead>
                  </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow>
                        <TableCell colSpan={11} className="h-24 text-center">
                            <LoadingSpinner size="lg" />
                        </TableCell>
                    </TableRow>
                ) : pagedInvoices.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                            No invoices found matching your criteria.
                        </TableCell>
                    </TableRow>
                ) : (
                    pagedInvoices.map((invoice, i) => {
                        const outstanding = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0));
                        return (
                          <TableRow key={invoice.id} className={`hover:bg-blue-50/50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                              <TableCell className="py-2">
                                <Checkbox 
                                    checked={selectedInvoices.includes(invoice.id)}
                                    onCheckedChange={(checked) => {
                                        if (checked) setSelectedInvoices([...selectedInvoices, invoice.id]);
                                        else setSelectedInvoices(selectedInvoices.filter(id => id !== invoice.id));
                                    }}
                                />
                              </TableCell>
                              <TableCell className="font-medium py-2 text-[#2563eb]">{invoice.customer_name}</TableCell>
                              <TableCell className="py-2 text-[#2563eb]">{invoice.invoice_number}</TableCell>
                              <TableCell className="py-2 text-gray-500">{invoice.notes ? 'Yes' : ''}</TableCell>
                              <TableCell className="py-2 text-gray-600">{new Date(invoice.invoice_date).toLocaleDateString('en-ZA')}</TableCell>
                              <TableCell className="py-2 text-gray-600">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-ZA') : "-"}</TableCell>
                              <TableCell className="text-right py-2 font-medium">R {Number(invoice.total_amount).toLocaleString('en-ZA')}</TableCell>
                              <TableCell className="text-right py-2 font-medium text-primary">R {outstanding.toLocaleString('en-ZA')}</TableCell>
                              <TableCell className="text-center py-2"><Checkbox checked={false} disabled /></TableCell>
                              <TableCell className="py-2">
                                  {getStatusBadge(invoice.status, invoice.due_date, Number(invoice.amount_paid || 0), Number(invoice.total_amount || 0))}
                              </TableCell>
                              <TableCell className="text-right py-2">
                                  <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-[#2563eb]">
                                              <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                          <DropdownMenuItem onClick={() => handleDownloadInvoice(invoice)}>
                                              <FileText className="h-4 w-4 mr-2" /> Preview PDF
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handlePrintInvoice(invoice)}>
                                              <Printer className="h-4 w-4 mr-2" /> Print
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => openSendDialog(invoice)}>
                                              <Mail className="h-4 w-4 mr-2" /> Email Tax Invoice
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          {canEdit && invoice.status !== "paid" && invoice.status !== "cancelled" && (
                                            <DropdownMenuItem onClick={() => handleEditInvoice(invoice)}>
                                                <FileText className="h-4 w-4 mr-2" /> Edit Tax Invoice
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuItem onClick={() => navigate('/sales?tab=receipts&action=create-receipt')}>
                                              <Receipt className="h-4 w-4 mr-2" /> Create Receipt
                                          </DropdownMenuItem>
                                          {canEdit && (
                                              <DropdownMenuItem onClick={() => { setInvoiceToCredit(invoice); setCreditReason(""); setCreditNoteOpen(true); }}>
                                                  <FileText className="h-4 w-4 mr-2" /> Create Credit Note
                                              </DropdownMenuItem>
                                          )}
                                          <DropdownMenuItem onClick={() => handleCopyInvoice(invoice)}>
                                              <Copy className="h-4 w-4 mr-2" /> Copy Tax Invoice
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handlePrintDeliveryNote(invoice)}>
                                              <FileText className="h-4 w-4 mr-2" /> Print Delivery Note
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleViewHistory(invoice)}>
                                              <History className="h-4 w-4 mr-2" /> View History
                                          </DropdownMenuItem>
                                      </DropdownMenuContent>
                                  </DropdownMenu>
                              </TableCell>
                          </TableRow>
                        );
                    })
                )}
              </TableBody>
          </Table>
      </div>

      <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-500">
              Showing {totalCount === 0 ? 0 : start + 1} to {Math.min(start + pageSize, totalCount)} of {totalCount} entries
          </div>
          <div className="flex items-center gap-2">
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="h-8 w-8 p-0"
            >
                {'<<'}
            </Button>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="h-8 w-8 p-0"
            >
                {'<'}
            </Button>
            <div className="flex items-center gap-1">
                <Button variant="default" size="sm" className="h-8 w-8 bg-[#2563eb]">{page + 1}</Button>
            </div>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(Math.min(Math.ceil(totalCount / pageSize) - 1, page + 1))}
                disabled={start + pageSize >= totalCount}
                className="h-8 w-8 p-0"
            >
                {'>'}
            </Button>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(Math.ceil(totalCount / pageSize) - 1)}
                disabled={start + pageSize >= totalCount}
                className="h-8 w-8 p-0"
            >
                {'>>'}
            </Button>
          </div>
      </div>

        <Dialog open={invoiceTypeDialogOpen} onOpenChange={setInvoiceTypeDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Sale Type</DialogTitle>
              <DialogDescription>Is this cash or on credit?</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => { setInvoicePaymentMode('cash'); setInvoiceTypeDialogOpen(false); setDialogOpen(true); }}>Cash</Button>
              <Button className="bg-gradient-primary" onClick={() => { setInvoicePaymentMode('credit'); setInvoiceTypeDialogOpen(false); setDialogOpen(true); }}>Credit</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Tax Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Label>Customer *</Label>
                    <Button type="button" variant="link" size="sm" onClick={() => window.open('/customers', '_blank')}>Add customer</Button>
                  </div>
                  <Select value={formData.customer_name} onValueChange={(value) => applyCustomerSelection(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder={customers.length ? "Select customer" : "No customers found"} />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c: any) => (
                        <SelectItem key={c.id ?? c.name} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Customer Email</Label>
                  <Input
                    type="email"
                    value={formData.customer_email}
                    onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                    placeholder="customer@example.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tax Invoice Date *</Label>
                  <Input
                    type="date"
                    value={formData.invoice_date}
                    onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                    max={todayStr}
                    required
                  />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    min={formData.invoice_date}
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                    <Label>Items</Label>
                    <Button type="button" variant="link" size="sm" onClick={() => window.open('/sales?tab=products', '_blank')}>Create product</Button>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addItem}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                  </Button>
                </div>

                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 border rounded-lg">
                      <div className="col-span-4">
                        <Label className="text-xs">Product/Service</Label>
                        <Select value={item.product_id || ""} onValueChange={(val) => updateItemProduct(index, val)}>
                          <SelectTrigger>
                            <SelectValue placeholder={(products.length + services.length) ? "Select an item" : "No items found"} />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p: any) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {(p.name ?? p.title ?? p.description ?? `Product ${p.id}`) as string}
                              </SelectItem>
                            ))}
                            {services.map((s: any) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {((s.name ?? s.title ?? s.description ?? `Service ${s.id}`) as string)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="mt-2 text-[11px] text-muted-foreground">{item.description}</div>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          step="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Tax %</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="1"
                            value={item.tax_rate}
                            onChange={(e) => updateItem(index, "tax_rate", parseFloat(e.target.value) || 0)}
                            disabled={!isVatRegistered}
                            className={!isVatRegistered ? "bg-gray-100 text-gray-500 pr-8" : ""}
                          />
                          {!isVatRegistered && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                              <Lock className="h-3 w-3 text-gray-400" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="col-span-1">
                        <Label className="text-xs">Amount</Label>
                        <div className="text-sm font-mono py-2">
                          {(item.quantity * item.unit_price).toFixed(2)}
                        </div>
                      </div>
                      <div className="col-span-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeItem(index)}
                          disabled={formData.items.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span className="font-mono">R {totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax:</span>
                  <span className="font-mono">R {totals.taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>Total:</span>
                  <span className="font-mono">R {totals.total.toFixed(2)}</span>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); setIsEditMode(false); setEditingInvoice(null); }}>Cancel</Button>
                <Button type="submit" className="bg-gradient-primary">{isEditMode ? 'Update Invoice' : 'Create Invoice'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={sentDialogOpen} onOpenChange={setSentDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Post Sent Invoice</DialogTitle>
              <DialogDescription>
                Confirm date and amounts to post Debtors (AR), Revenue and VAT.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Posting Date</Label>
                <Input type="date" value={sentDate} max={todayStr} onChange={(e) => setSentDate(e.target.value)} />
              </div>
              {sentInvoice && (
                <div className="p-3 border rounded bg-muted/30 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Amount (excl. VAT)</span><span className="font-mono">R {Number(sentInvoice.subtotal || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between"><span>VAT amount</span><span className="font-mono">R {Number(sentInvoice.tax_amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between"><span>Total</span><span className="font-mono">R {Number(sentInvoice.total_amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between"><span>Revenue account</span><span className="font-mono">4000 - Sales Revenue</span></div>
                  <div className="flex items-center gap-2 pt-2">
                    <Label htmlFor="includeVat">Include VAT in posting?</Label>
                    <input id="includeVat" type="checkbox" checked={sentIncludeVAT} onChange={e => setSentIncludeVAT(e.target.checked)} />
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSentDialogOpen(false)}>Cancel</Button>
                <Button className="bg-gradient-primary" onClick={handleConfirmSent}>Post</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Payment</DialogTitle>
              <DialogDescription>
                Select the payment date to post Bank and settle Debtors.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {paymentInvoice && (
                <div className="text-sm text-muted-foreground">
                  Outstanding: R {Math.max(0, Number(paymentInvoice.total_amount || 0) - Number(paymentInvoice.amount_paid || 0)).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                </div>
              )}
              <div>
                <Label>Payment Amount</Label>
                <Input type="number" min={0} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} />
              </div>
              <div>
                <Label>Payment Date</Label>
                <Input type="date" value={paymentDate} max={todayStr} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div>
                <Label>Bank Account</Label>
                <Select value={selectedBankId} onValueChange={(v) => setSelectedBankId(v)}>
                  <SelectTrigger>
                <SelectValue placeholder={bankAccounts.length ? "Select bank account" : "No bank accounts"} />
                </SelectTrigger>
                <SelectContent>
                    {bankAccounts.map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{`${b.bank_name} - ${b.account_name} (${b.account_number})`}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
                <Button className="bg-gradient-primary" onClick={handleConfirmPayment}>Post Payment</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <TransactionFormEnhanced
          open={journalOpen}
          onOpenChange={setJournalOpen}
          onSuccess={loadData}
          editData={journalEditData}
        />

        {/* Send Invoice Dialog */}
        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send invoice</DialogTitle>
              <DialogDescription>Enter recipient email. Message is prefilled. Sender CC: {companyEmail || 'not set'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input type="email" placeholder="Recipient email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} />
              <Textarea rows={6} value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSendEmail} disabled={sending}>{sending ? 'Sending...' : 'Send'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isSuccess} onOpenChange={setIsSuccess}>
          <DialogContent className="sm:max-w-[425px] flex flex-col items-center justify-center min-h-[300px]">
            <div className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center mb-6 animate-in zoom-in-50 duration-300">
              <Check className="h-12 w-12 text-green-600" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-center text-2xl text-green-700">Success!</DialogTitle>
            </DialogHeader>
            <div className="text-center space-y-2">
              <p className="text-xl font-semibold text-gray-900">{successMessage}</p>
              <p className="text-muted-foreground">The operation has been completed successfully.</p>
            </div>
          </DialogContent>
        </Dialog>

        {isSubmitting && (
          <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center transition-all duration-500">
            <div className="bg-background border shadow-xl rounded-xl flex flex-col items-center gap-8 p-8 max-w-md w-full animate-in fade-in zoom-in-95 duration-300">
              <LoadingSpinner size="lg" className="scale-125" />
              <div className="w-full space-y-4">
                <Progress value={progress} className="h-2 w-full" />
                <div className="text-center space-y-2">
                  <div className="text-xl font-semibold text-primary animate-pulse">
                    {progressText}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Please wait while we update your financial records...
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Credit Note Dialog */}
        <Dialog open={creditNoteOpen} onOpenChange={setCreditNoteOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-amber-600 flex items-center gap-2">
                <History className="h-5 w-5" />
                Issue Credit Note
              </DialogTitle>
              <DialogDescription className="pt-2">
                This will cancel the invoice and create a credit note transaction in the ledger.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-sm font-medium flex gap-3 items-start">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  For audit compliance, invoices cannot be deleted. Use this form to issue a credit note.
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Reason for Credit Note</Label>
                <Textarea 
                  value={creditReason} 
                  onChange={(e) => setCreditReason(e.target.value)} 
                  placeholder="Reason for return or cancellation..."
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Supporting Document (Optional)</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => toast({ title: "Upload", description: "File upload will be available in the next update." })}>
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-8 w-8 opacity-50" />
                    <span className="text-sm">Click to upload document</span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setCreditNoteOpen(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button 
                onClick={handleCreditNote}
                disabled={isCrediting || !creditReason.trim()}
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isCrediting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <History className="mr-2 h-4 w-4" />
                    Issue Credit Note
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invoice History Dialog */}
        <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Invoice History
              </DialogTitle>
            </DialogHeader>
            
            <div className="py-4">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : invoiceHistory.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No history available</p>
              ) : (
                <div className="space-y-3">
                  {invoiceHistory.map((event, index) => (
                    <div key={index} className="flex gap-3 p-3 border rounded-lg">
                      <div className="shrink-0">
                        <div className="h-2 w-2 rounded-full bg-primary mt-2" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{event.action}</div>
                        <div className="text-sm text-muted-foreground">{event.details}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(event.date).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      <FinancialYearLockDialog 
        open={isLockDialogOpen} 
        onOpenChange={setIsLockDialogOpen} 
      />
    </div>
    </>
  );
};
