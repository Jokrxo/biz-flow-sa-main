import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Users, Mail, Phone, Info, FileDown, Search, MoreHorizontal, UserPlus, 
  FileText, 
  CreditCard, 
  MapPin,
  Check,
  XCircle,
  FileSpreadsheet,
  ArrowUpDown,
  ChevronDown,
  Printer,
  Edit,
  Trash,
  Eye,
  Filter,
  Download,
  Upload,
  Loader2,
  Settings,
  History,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { exportCustomerStatementToPDF } from "@/lib/export-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  balance?: number; // Added for compatibility with Supplier table style
}

export function SalesCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(7);
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementViewOpen, setStatementViewOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [monthsPreset, setMonthsPreset] = useState<string>("12");
  const [useCustomRange, setUseCustomRange] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [statementEntries, setStatementEntries] = useState<any[]>([]);
  const [statementOpeningBalance, setStatementOpeningBalance] = useState<number>(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, isAccountant } = useRoles();
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Operation completed successfully");

  // New State for Table Standardization
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Customer; direction: 'asc' | 'desc' } | null>(null);
  const [viewFilter, setViewFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [inactiveWarningOpen, setInactiveWarningOpen] = useState(false);
  const [inactiveActionMessage, setInactiveActionMessage] = useState("");

  // Quick Actions State
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [deleteCustomerOpen, setDeleteCustomerOpen] = useState(false);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: ""
  });


  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    openingBalance: "",
    openingDate: new Date().toISOString().split('T')[0],
    creditTerms: "30", // Default 30 days
    accountCode: "", // Customer account code
    isActive: true
  });

  const loadCustomers = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Calculate balances (mocked or fetched if possible, for now using 0 or simple logic)
      // Ideally this should be a view or a separate query to sum transactions
      const customersWithBalance = data?.map(c => ({
          ...c,
          balance: 0 // Placeholder until we have a real balance calculation
      })) || [];

      setCustomers(customersWithBalance);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    const uid = user?.id ? String(user.id) : "anonymous";
    const key = `tutorial_shown_customers_${uid}`;
    const already = localStorage.getItem(key);
    if (!already) {
      setTutorialOpen(true);
      localStorage.setItem(key, "true");
    }
  }, [user?.id]);

  const checkCustomerActive = (customer: Customer, action: string) => {
    if (customer.name.startsWith('[INACTIVE] ')) {
        setInactiveActionMessage(`You cannot ${action} because this customer is inactive.`);
        setInactiveWarningOpen(true);
        return false;
    }
    return true;
  };

  // Quick Actions Handlers
  const handleQuickView = (customer: Customer) => {
    setViewCustomer(customer);
    setQuickViewOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setViewCustomer(customer);
    setEditFormData({
      name: customer.name.startsWith('[INACTIVE] ') ? customer.name.replace('[INACTIVE] ', '') : customer.name,
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || ""
    });
    setEditCustomerOpen(true);
  };

  const handleDeleteCustomer = (customer: Customer) => {
    setViewCustomer(customer);
    setDeleteCustomerOpen(true);
  };

  const confirmDeleteCustomer = async () => {
    if (!viewCustomer) return;
    if (!isAdmin) {
      toast({ title: "Permission denied", description: "Only admins can delete customers", variant: "destructive" });
      return;
    }
    try {
      // Soft delete - set is_active to false instead of hard deleting
      const { error } = await supabase.from('customers').update({ 
        is_active: false,
        // Also prepend [INACTIVE] to name to make it clear
        name: viewCustomer.name.startsWith('[INACTIVE]') ? viewCustomer.name : `[INACTIVE] ${viewCustomer.name}`
      }).eq('id', viewCustomer.id);
      if (error) throw error;
      
      // Log to audit trail
      try {
        await supabase.from('audit_logs').insert({
          company_id: viewCustomer.company_id,
          user_id: user?.id,
          action: 'DELETE',
          entity_type: 'customer',
          entity_id: viewCustomer.id,
          description: `Soft-deleted customer: ${viewCustomer.name} (ID: ${viewCustomer.id})`,
          timestamp: new Date().toISOString()
        });
      } catch (auditErr) {
        console.error('Failed to log audit trail:', auditErr);
      }
      
      toast({ title: "Success", description: "Customer deactivated successfully (soft delete)" });
      setDeleteCustomerOpen(false);
      setViewCustomer(null);
      loadCustomers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewCustomer) return;
    try {
      const { error } = await supabase.from('customers').update({
        name: editFormData.name,
        email: editFormData.email || null,
        phone: editFormData.phone || null,
        address: editFormData.address || null
      }).eq('id', viewCustomer.id);
      if (error) throw error;
      toast({ title: "Success", description: "Customer updated successfully" });
      setEditCustomerOpen(false);
      setViewCustomer(null);
      loadCustomers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCreateInvoice = (customer: Customer) => {
    const customerName = customer.name.startsWith('[INACTIVE] ') ? customer.name.replace('[INACTIVE] ', '') : customer.name;
    window.location.href = `/sales?tab=invoices&action=create&customer=${encodeURIComponent(customerName)}`;
  };

  const handleCreateQuote = (customer: Customer) => {
    const customerName = customer.name.startsWith('[INACTIVE] ') ? customer.name.replace('[INACTIVE] ', '') : customer.name;
    window.location.href = `/sales?tab=quotes&action=create&customer=${encodeURIComponent(customerName)}`;
  };

  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    // 1. Search Filter
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(lower) || 
        (c.email && c.email.toLowerCase().includes(lower)) ||
        (c.phone && c.phone.includes(lower))
      );
    }

    // 2. View Filter (Active/Inactive)
    if (viewFilter !== 'all') {
      result = result.filter(c => {
        const isInactive = c.name.startsWith('[INACTIVE] ');
        return viewFilter === 'inactive' ? isInactive : !isInactive;
      });
    }

    // 3. Sorting
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [customers, searchTerm, sortConfig, viewFilter]);

  const handleSort = (key: keyof Customer) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredCustomers.map(c => c.id));
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

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }

    try {
      if (formData.phone) {
        const { isTenDigitPhone } = await import("@/lib/validators");
        if (!isTenDigitPhone(formData.phone)) {
          toast({ title: "Invalid phone", description: "Phone number must be 10 digits", variant: "destructive" });
          return;
        }
      }
      
      // Get company profile first
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();
      
      if (!profile?.company_id) {
        toast({ title: "Error", description: "Company not found. Please set up a company first.", variant: "destructive" });
        return;
      }
      
      // Check for duplicate customer name within the company
      const { data: existingCustomers } = await supabase
        .from("customers")
        .select("id, name")
        .eq("company_id", profile.company_id)
        .ilike("name", formData.name.trim());
      
      if (existingCustomers && existingCustomers.length > 0) {
        toast({ title: "Duplicate Customer", description: `A customer with name "${formData.name}" already exists. Please use a different name.`, variant: "destructive" });
        return;
      }
      
      // Check for duplicate account code if provided
      if (formData.accountCode && formData.accountCode.trim()) {
        const { data: existingCode } = await supabase
          .from("customers")
          .select("id, name, account_code")
          .eq("company_id", profile.company_id)
          .eq("account_code", formData.accountCode.trim());
        
        if (existingCode && existingCode.length > 0) {
          toast({ title: "Duplicate Account Code", description: `Account code "${formData.accountCode}" is already used by customer "${existingCode[0].name}". Please use a different code.`, variant: "destructive" });
          return;
        }
      }
      
      const { data: insertedCustomer, error } = await supabase.from("customers").insert({
        company_id: profile.company_id,
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        credit_terms: parseInt(formData.creditTerms) || 30,
        account_code: formData.accountCode || null,
        is_active: formData.isActive,
      }).select('id').single();

      if (error) throw error;

      // Opening balance posting: Dr AR (1200), Cr Opening Equity (3900)
      try {
        const openingAmt = Math.max(0, Number(formData.openingBalance || 0));
        if (openingAmt > 0 && insertedCustomer?.id) {
          const { data: accounts } = await supabase
            .from('chart_of_accounts')
            .select('id, account_code, account_name, account_type')
            .eq('company_id', profile.company_id)
            .eq('is_active', true);
          const findAcc = (type: string, codes: string[], names: string[]) => {
            const list = (accounts || []).map((a: any) => ({ id: String(a.id), code: String(a.account_code || ''), name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase() }));
            const byType = list.filter(a => a.type === type.toLowerCase());
            const byCode = byType.find(a => codes.includes(a.code));
            if (byCode) return byCode.id;
            const byName = byType.find(a => names.some(n => a.name.includes(n)));
            return byName?.id || null;
          };
          let arId = findAcc('asset', ['1200'], ['receiv','debtors','accounts receiv']);
          let eqId = findAcc('equity', ['3900'], ['opening balance']);
          if (!arId) {
            const { data: created } = await supabase
              .from('chart_of_accounts')
              .insert({ company_id: profile!.company_id, account_code: '1200', account_name: 'Accounts Receivable', account_type: 'asset', is_active: true })
              .select('id')
              .single();
            arId = (created as any)?.id || arId;
          }
          if (!eqId) {
            const { data: created } = await supabase
              .from('chart_of_accounts')
              .insert({ company_id: profile!.company_id, account_code: '3900', account_name: 'Opening Balance Equity', account_type: 'equity', is_active: true })
              .select('id')
              .single();
            eqId = (created as any)?.id || eqId;
          }
          if (arId && eqId) {
            const { data: { user } } = await supabase.auth.getUser();
            const txDate = String(formData.openingDate || new Date().toISOString().slice(0,10));
            const { data: tx } = await supabase
              .from('transactions')
              .insert({
                company_id: profile!.company_id,
                user_id: user?.id || '',
                transaction_date: txDate,
                description: `Opening balance for ${formData.name}`,
                reference_number: `OB-${insertedCustomer.id}`,
                total_amount: openingAmt,
                transaction_type: 'journal',
                status: 'pending'
              })
              .select('id')
              .single();
            const rows = [
              { transaction_id: (tx as any).id, account_id: arId, debit: openingAmt, credit: 0, description: 'Opening balance', status: 'approved' },
              { transaction_id: (tx as any).id, account_id: eqId, debit: 0, credit: openingAmt, description: 'Opening balance', status: 'approved' },
            ];
            await supabase.from('transaction_entries').insert(rows);
            const ledgerRows = rows.map(r => ({ company_id: profile!.company_id, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: txDate, is_reversed: false, transaction_id: (tx as any).id, description: r.description }));
            await supabase.from('ledger_entries').insert(ledgerRows as any);
            await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id);
          }
        }
      } catch {}
      
      setSuccessMessage("Customer added successfully");
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setDialogOpen(false);
        setFormData({ name: "", email: "", phone: "", address: "", openingBalance: "", openingDate: new Date().toISOString().split('T')[0], creditTerms: "30", accountCode: "", isActive: true });
        loadCustomers();
      }, 2000);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBatchDeactivate = async () => {
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }

    try {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).maybeSingle();
      if (!profile) return;

      const updates = selectedIds.map(async (id) => {
        const customer = customers.find(c => c.id === id);
        if (customer && !customer.name.startsWith('[INACTIVE] ')) {
          await supabase
            .from('customers')
            .update({ name: `[INACTIVE] ${customer.name}` })
            .eq('id', id)
            .eq('company_id', profile.company_id);
        }
      });

      await Promise.all(updates);
      
      toast({ title: "Success", description: "Selected customers deactivated" });
      setSelectedIds([]);
      loadCustomers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBatchDelete = async () => {
    if (!isAdmin) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }
    
    // Note: This is a hard delete. Usually we prefer soft delete (deactivate).
    // But if requested, here is the logic.
    // Ideally we should check for dependencies (invoices, quotes) before deleting.
    // For now, I'll just implement Deactivate as the primary batch action in UI to be safe.
  };

  const canEdit = isAdmin || isAccountant;

  const downloadStatement = async (customer: Customer, start: string, end: string) => {
    try {
      const data = await buildStatementData(customer, start, end);
      const periodLabel = `${new Date(start).toLocaleDateString('en-ZA')} – ${new Date(end).toLocaleDateString('en-ZA')}`;
      exportCustomerStatementToPDF(data.entries, customer.name, periodLabel, data.openingBalance, `statement_${customer.name.replace(/\s+/g,'_')}` , { email: customer.email || undefined, phone: customer.phone || undefined, address: customer.address || undefined });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openStatementDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    setStatementOpen(true);
    setMonthsPreset("12");
    setUseCustomRange(false);
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const exportStatement = async () => {
    if (!selectedCustomer) return;
    let start = startDate;
    let end = endDate;
    if (!useCustomRange) {
      const endDt = new Date();
      const months = parseInt(monthsPreset || "12");
      const startDt = new Date();
      startDt.setMonth(startDt.getMonth() - months);
      start = startDt.toISOString().split('T')[0];
      end = endDt.toISOString().split('T')[0];
    }
    await downloadStatement(selectedCustomer, start, end);
    setStatementOpen(false);
  };

  const buildStatementData = async (customer: Customer, start: string, end: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user?.id)
      .single();
    if (!profile?.company_id) throw new Error("Company not found");

    const { data: periodInv } = await supabase
      .from("invoices")
      .select("invoice_number, invoice_date, total_amount")
      .eq("company_id", profile.company_id)
      .eq("customer_name", customer.name)
      .gte("invoice_date", start)
      .lte("invoice_date", end)
      .order("invoice_date", { ascending: true });
    const { data: priorInv } = await supabase
      .from("invoices")
      .select("invoice_number, invoice_date, total_amount")
      .eq("company_id", profile.company_id)
      .eq("customer_name", customer.name)
      .lt("invoice_date", start);
    const nameLower = String(customer.name || '').toLowerCase();
    const periodInvNumbers = (periodInv || []).map((i: any) => String(i.invoice_number));
    const priorInvNumbers = (priorInv || []).map((i: any) => String(i.invoice_number));
    const allNumbers = Array.from(new Set([ ...periodInvNumbers, ...priorInvNumbers ]));
    // Locate AR (1200)
    const { data: arAcc } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('company_id', profile.company_id)
      .eq('account_code', '1200')
      .maybeSingle();
    const arId = (arAcc as any)?.id;

    const openingInvoicesTotal = (priorInv || []).reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0);
    let openingPaymentsTotal = 0;
    if (arId) {
      const { data: arCreditsPrior } = await supabase
        .from('transaction_entries')
        .select('credit, description, transactions!inner (transaction_date, status, description, reference_number)')
        .eq('account_id', arId)
        .lt('transactions.transaction_date', start)
        .eq('transactions.status', 'posted');
      openingPaymentsTotal = (arCreditsPrior || [])
        .filter((e: any) => {
          const tx = e.transactions as any;
          const ref = String(tx?.reference_number || '');
          const txDesc = String(tx?.description || '').toLowerCase();
          const entryDesc = String(e.description || '').toLowerCase();
          return priorInvNumbers.includes(ref) || txDesc.includes(nameLower) || entryDesc.includes(nameLower);
        })
        .reduce((s: number, e: any) => s + Number(e.credit || 0), 0);
    }
    let openingJournalTotal = 0;
    try {
      if (arId) {
        const { data: arEntries } = await supabase
          .from('transaction_entries')
          .select('debit, credit, description, transactions!inner (transaction_date, description, reference_number)')
          .eq('account_id', arId)
          .lt('transactions.transaction_date', start);
        openingJournalTotal = (arEntries || [])
          .filter((e: any) => {
            const tx = e.transactions as any;
            const ref = String(tx?.reference_number || '');
            const txDesc = String(tx?.description || '').toLowerCase();
            const entryDesc = String(e.description || '').toLowerCase();
            return ref === `OB-${customer.id}` || txDesc.includes(nameLower) || entryDesc.includes(nameLower);
          })
          .reduce((s: number, e: any) => s + (Number(e.debit || 0) - Number(e.credit || 0)), 0);
      }
    } catch {}
    const openingBalance = openingInvoicesTotal - openingPaymentsTotal + openingJournalTotal;

    // Payments during period from AR credits
    let paymentsPeriodCredits: any[] = [];
    if (arId) {
      const { data: arCreditsPeriod } = await supabase
        .from('transaction_entries')
        .select('credit, description, transactions!inner (transaction_date, description, reference_number, status)')
        .eq('account_id', arId)
        .gte('transactions.transaction_date', start)
        .lte('transactions.transaction_date', end)
        .eq('transactions.status', 'posted');
      paymentsPeriodCredits = (arCreditsPeriod || [])
        .filter((e: any) => {
          if (!(Number(e.credit || 0) > 0)) return false;
          const tx = e.transactions as any;
          const ref = String(tx?.reference_number || '');
          const txDesc = String(tx?.description || '').toLowerCase();
          const entryDesc = String(e.description || '').toLowerCase();
          return allNumbers.includes(ref) || txDesc.includes(nameLower) || entryDesc.includes(nameLower);
        })
        .map((e: any) => ({
          date: (e.transactions as any).transaction_date,
          description: (e.transactions as any).description || e.description || 'Payment',
          reference: (e.transactions as any).reference_number || null,
          dr: 0,
          cr: Number(e.credit || 0)
        }));
    }

    // Fallback: posted receipts in transactions table for this customer (credit)
    let paymentsPeriodReceipts: any[] = [];
    try {
      const { data: txReceipts } = await supabase
        .from('transactions')
        .select('transaction_date,total_amount,description,reference_number,status,transaction_type')
        .eq('company_id', profile.company_id)
        .eq('transaction_type', 'receipt')
        .eq('status', 'posted')
        .gte('transaction_date', start)
        .lte('transaction_date', end);
      const filtered = (txReceipts || []).filter((t: any) => {
        const ref = String(t.reference_number || '');
        const desc = String(t.description || '').toLowerCase();
        return allNumbers.includes(ref) || desc.includes(nameLower);
      });
      paymentsPeriodReceipts = filtered.map((t: any) => ({
        date: t.transaction_date,
        description: t.description || 'Payment',
        reference: t.reference_number || null,
        dr: 0,
        cr: Number(t.total_amount || 0)
      }));
      // Deduplicate against AR credits by date and amount
      const creditKeys = new Set(paymentsPeriodCredits.map(p => `${String(p.date)}|${Number(p.cr).toFixed(2)}`));
      paymentsPeriodReceipts = paymentsPeriodReceipts.filter(p => !creditKeys.has(`${String(p.date)}|${Number(p.cr).toFixed(2)}`));
    } catch {}

    // Opening balance journals during period (explicit row if posted within range)
    let openingDebitsPeriod: any[] = [];
    if (arId) {
      const { data: arDebitsPeriod } = await supabase
        .from('transaction_entries')
        .select('debit, description, transactions!inner (transaction_date, description, reference_number, status)')
        .eq('account_id', arId)
        .gte('transactions.transaction_date', start)
        .lte('transactions.transaction_date', end)
        .eq('transactions.status', 'posted');
      openingDebitsPeriod = (arDebitsPeriod || [])
        .filter((e: any) => {
          if (!(Number(e.debit || 0) > 0)) return false;
          const tx = e.transactions as any;
          const ref = String(tx?.reference_number || '');
          const txDesc = String(tx?.description || '').toLowerCase();
          const entryDesc = String(e.description || '').toLowerCase();
          const isOb = ref === `OB-${customer.id}` || txDesc.includes(`opening balance for ${nameLower}`) || entryDesc.includes('opening balance');
          const mentionsName = txDesc.includes(nameLower) || entryDesc.includes(nameLower);
          return isOb && mentionsName;
        })
        .map((e: any) => ({
          date: (e.transactions as any).transaction_date,
          description: (e.transactions as any).description || e.description || 'Opening balance',
          reference: (e.transactions as any).reference_number || null,
          dr: Number(e.debit || 0),
          cr: 0
        }));
    }

    const entries = [
      // Opening balance row so it shows in viewer/PDF
      { date: start, description: 'Opening balance', reference: null, dr: openingBalance > 0 ? openingBalance : 0, cr: openingBalance < 0 ? Math.abs(openingBalance) : 0 },
      ...openingDebitsPeriod,
      ...((periodInv || []).map((r: any) => ({ date: r.invoice_date, description: `Invoice ${r.invoice_number}`, reference: r.invoice_number, dr: Number(r.total_amount || 0), cr: 0 }))),
      ...paymentsPeriodCredits,
      ...paymentsPeriodReceipts
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { openingBalance, entries };
  };

  const openStatementViewer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    const s = start.toISOString().split('T')[0];
    const e = end.toISOString().split('T')[0];
    setStartDate(s);
    setEndDate(e);
    const data = await buildStatementData(customer, s, e);
    setStatementOpeningBalance(data.openingBalance);
    setStatementEntries(data.entries);
    setStatementViewOpen(true);
  };

  const refreshStatementViewer = async () => {
    if (!selectedCustomer) return;
    const s = startDate;
    const e = endDate;
    const data = await buildStatementData(selectedCustomer, s, e);
    setStatementOpeningBalance(data.openingBalance);
    setStatementEntries(data.entries);
  };

  const loadBankAccounts = async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user?.id)
      .single();
    if (!profile?.company_id) return;
    const { data: bankList } = await supabase
      .from('bank_accounts')
      .select('id, bank_name, account_number')
      .eq('company_id', profile.company_id);
    setBankAccounts(bankList || []);
  };

  const openPayment = async (customer: Customer) => {
    setPaymentCustomer(customer);
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setSelectedBankId('');
    await loadBankAccounts();
    setPaymentOpen(true);
  };

  const postCustomerPayment = async () => {
    try {
      const amt = Number(paymentAmount || 0);
      if (!paymentCustomer || !selectedBankId || !amt || amt <= 0) return;
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', authUser.id)
        .single();
      if (!profile?.company_id) throw new Error('Company not found');
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('company_id', profile.company_id)
        .eq('is_active', true);
      const list = (accounts || []).map((a: any) => ({ id: String(a.id), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || ''), name: String(a.account_name || '').toLowerCase() }));
      const pick = (type: string, codes: string[], names: string[]) => {
        const byType = list.filter(a => a.type === type.toLowerCase());
        const byCode = byType.find(a => codes.includes(a.code));
        if (byCode) return byCode.id;
        const byName = byType.find(a => names.some(n => a.name.includes(n)));
        return byName?.id || null;
      };
      let bankLedgerId = pick('asset', ['1100'], ['bank','cash']);
      let arId = pick('asset', ['1200'], ['receiv','debtors']);
      if (!bankLedgerId) {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: profile.company_id, account_code: '1100', account_name: 'Bank', account_type: 'asset', is_active: true })
          .select('id')
          .single();
        bankLedgerId = (created as any)?.id || bankLedgerId;
      }
      if (!arId) {
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: profile.company_id, account_code: '1200', account_name: 'Accounts Receivable', account_type: 'asset', is_active: true })
          .select('id')
          .single();
        arId = (created as any)?.id || arId;
      }
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          company_id: profile.company_id,
          user_id: authUser.id,
          transaction_date: paymentDate,
          description: `Customer payment from ${paymentCustomer.name}`,
          reference_number: null,
          total_amount: amt,
          transaction_type: 'receipt',
          status: 'pending',
          bank_account_id: selectedBankId,
        })
        .select('id')
        .single();
      if (txErr) throw txErr;
      const rows = [
        { transaction_id: (tx as any).id, account_id: bankLedgerId as string, debit: amt, credit: 0, description: 'Customer payment', status: 'approved' },
        { transaction_id: (tx as any).id, account_id: arId as string, debit: 0, credit: amt, description: 'Customer payment', status: 'approved' },
      ];
      const { error: teErr } = await supabase.from('transaction_entries').insert(rows);
      if (teErr) throw teErr;
      const ledgerRows = rows.map(r => ({ company_id: profile.company_id, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: paymentDate, is_reversed: false, transaction_id: (tx as any).id, description: r.description }));
      const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
      if (leErr) throw leErr;
      await supabase.from('transactions').update({ status: 'posted' }).eq('id', (tx as any).id);
      try { await supabase.rpc('update_bank_balance', { _bank_account_id: selectedBankId, _amount: amt, _operation: 'add' }); } catch {}
      setSuccessMessage('Payment posted successfully');
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setPaymentOpen(false);
        setPaymentCustomer(null);
        setPaymentAmount('');
        setSelectedBankId('');
        refreshStatementViewer();
      }, 2000);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to post payment', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#2e2e2e]">List of Customers</h2>
        </div>
      </div>

      <Dialog open={inactiveWarningOpen} onOpenChange={setInactiveWarningOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-5 w-5" />
                    Action Restricted
                </DialogTitle>
                <DialogDescription className="pt-2">
                    {inactiveActionMessage}
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button onClick={() => setInactiveWarningOpen(false)}>Close</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {/* Main Action Bar & Filters - Sage Style */}
        <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    {canEdit && (
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                        <Button className="bg-[#0070ad] hover:bg-[#005a8b] text-white h-9 font-medium">
                            Create a Customer
                        </Button>
                        </DialogTrigger>
                        <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Customer</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                            <Label>Customer Name *</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                                placeholder="Business or individual name"
                            />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Email</Label>
                                <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="client@example.com"
                                />
                            </div>
                            <div>
                                <Label>Phone</Label>
                                <Input
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="082 123 4567"
                                />
                            </div>
                            </div>
                            <div>
                            <Label>Address</Label>
                            <Input
                                value={formData.address}
                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                placeholder="Physical address"
                            />
                            </div>
                            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                            <div>
                                <Label className="text-xs">Account Code</Label>
                                <Input
                                value={formData.accountCode}
                                onChange={(e) => setFormData({ ...formData, accountCode: e.target.value })}
                                placeholder="CUST-001"
                                className="bg-background"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Credit Terms (days)</Label>
                                <Input
                                type="number"
                                value={formData.creditTerms}
                                onChange={(e) => setFormData({ ...formData, creditTerms: e.target.value })}
                                placeholder="30"
                                className="bg-background"
                                />
                            </div>
                            </div>
                            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                            <Checkbox
                                id="isActive"
                                checked={formData.isActive}
                                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked === true })}
                            />
                            <Label htmlFor="isActive" className="cursor-pointer">
                                Active Customer
                            </Label>
                            </div>
                            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                            <div>
                                <Label className="text-xs">Opening Balance</Label>
                                <Input
                                type="number"
                                step="0.01"
                                value={formData.openingBalance}
                                onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                                placeholder="0.00"
                                className="bg-background"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Date</Label>
                                <Input
                                type="date"
                                value={formData.openingDate}
                                onChange={(e) => setFormData({ ...formData, openingDate: e.target.value })}
                                className="bg-background"
                                />
                            </div>
                            </div>
                            <Button type="submit" className="w-full bg-[#0070ad] hover:bg-[#005a8b]">Create Customer</Button>
                        </form>
                        </DialogContent>
                    </Dialog>
                    )}
                    <Button variant="outline" className="h-9 text-[#0070ad] border-[#0070ad] hover:bg-blue-50">
                        Import Customers
                    </Button>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Search:</span>
                        <div className="relative">
                            <Input
                                type="search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-[200px] h-9"
                            />
                            <Button size="icon" className="absolute right-0 top-0 h-9 w-9 bg-[#0070ad] hover:bg-[#005a8b] rounded-l-none">
                                <Search className="h-4 w-4 text-white" />
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                         <span className="text-sm text-muted-foreground">View:</span>
                         <Select value={viewFilter} onValueChange={setViewFilter}>
                            <SelectTrigger className="w-[140px] h-9">
                                <SelectValue placeholder="View" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All (No Filter)</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                         </Select>
                    </div>

                    <div className="flex items-center gap-1 ml-2 text-muted-foreground">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSort('name')}>
                            <ArrowUpDown className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                             <FileSpreadsheet className="h-4 w-4" />
                        </Button>
                         <Button variant="ghost" size="icon" className="h-8 w-8">
                             <Settings className="h-4 w-4" />
                        </Button>
                    </div>

                     <Button variant="outline" className="h-9 ml-2 text-[#0070ad] border-[#0070ad] hover:bg-blue-50">
                        Quick Reports <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                </div>
            </div>

            {/* Sage Actions Row */}
            <div className="flex items-center gap-4 text-sm text-[#0070ad] font-medium pl-1">
                 <div className="flex items-center gap-1 cursor-pointer hover:underline">
                    <div className="rotate-90 text-xs">↩</div> Actions
                 </div>
                 <button className={`hover:underline ${selectedIds.length === 0 ? 'text-gray-400 cursor-not-allowed' : ''}`} disabled={selectedIds.length === 0}>
                    Delete
                 </button>
                 <button className={`hover:underline ${selectedIds.length === 0 ? 'text-gray-400 cursor-not-allowed' : ''}`} disabled={selectedIds.length === 0} onClick={handleBatchDeactivate}>
                    Mark As Active/Inactive
                 </button>
                 <button className={`hover:underline ${selectedIds.length === 0 ? 'text-gray-400 cursor-not-allowed' : ''}`} disabled={selectedIds.length === 0}>
                    Update
                 </button>
            </div>
        </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                Loading customers...
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No customers found</p>
              {canEdit && <p className="text-sm mt-2">Add your first customer to get started</p>}
            </div>
          ) : (
            <>
            <div className="border rounded-sm overflow-hidden bg-white shadow-sm">
            <Table>
              <TableHeader className="bg-[#545454]">
                <TableRow className="hover:bg-[#545454] border-none">
                  <TableHead className="w-[40px] text-white h-10 pl-4">
                    <Checkbox 
                        checked={selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0}
                        onCheckedChange={handleSelectAll}
                        className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-[#545454]"
                    />
                  </TableHead>
                  <TableHead 
                    className="text-white h-10 cursor-pointer hover:text-gray-300 transition-colors font-semibold"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center">
                        Name
                        <ArrowUpDown className="ml-2 h-3 w-3 opacity-70" />
                    </div>
                  </TableHead>
                  <TableHead className="text-white h-10 font-semibold">Category</TableHead>
                  <TableHead className="text-white h-10 font-semibold text-right">Balance</TableHead>
                  <TableHead className="text-white h-10 font-semibold">Contact Name</TableHead>
                  <TableHead className="text-white h-10 font-semibold">Telephone</TableHead>
                  <TableHead className="text-white h-10 font-semibold">Mobile</TableHead>
                  <TableHead className="text-white h-10 font-semibold text-center">Active</TableHead>
                  <TableHead className="text-white h-10 font-semibold text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.slice(page * pageSize, page * pageSize + pageSize).map((customer) => {
                  const isInactive = customer.name.startsWith('[INACTIVE] ');
                  const displayName = isInactive ? customer.name.replace('[INACTIVE] ', '') : customer.name;
                  
                  return (
                  <TableRow key={customer.id} className={`border-b border-gray-100 ${isInactive ? "bg-gray-50/50 text-muted-foreground" : "hover:bg-blue-50/30"}`}>
                    <TableCell className="pl-4">
                        <Checkbox 
                            checked={selectedIds.includes(customer.id)}
                            onCheckedChange={(checked) => handleSelectRow(customer.id, checked as boolean)}
                        />
                    </TableCell>
                    <TableCell>
                        <span className={`font-medium text-sm ${!isInactive ? 'text-[#0070ad] hover:underline cursor-pointer' : ''}`}>
                            {displayName}
                        </span>
                    </TableCell>
                    <TableCell className="text-sm">
                         {/* Category Placeholder */}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                        R {Number(customer.balance || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">
                         {displayName}
                    </TableCell>
                    <TableCell className="text-sm">
                        {customer.phone || ''}
                    </TableCell>
                    <TableCell className="text-sm">
                         {/* Mobile Placeholder */}
                    </TableCell>
                    <TableCell className="text-center">
                        <div className="flex justify-center">
                            {isInactive ? (
                                <div className="h-4 w-4 border border-gray-300 rounded bg-gray-100" />
                            ) : (
                                <div className="h-4 w-4 border border-gray-300 rounded bg-white flex items-center justify-center">
                                    <Check className="h-3 w-3 text-green-600" />
                                </div>
                            )}
                        </div>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 px-2 text-[#0070ad] hover:text-[#005a8b] hover:bg-transparent font-medium">
                              Actions <ChevronDown className="ml-1 h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleQuickView(customer)}>
                              <Eye className="h-4 w-4 mr-2" /> Quick View
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleEditCustomer(customer)}>
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-red-600" onClick={() => handleDeleteCustomer(customer)}>
                              <Trash className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleCreateInvoice(customer)}>
                              <FileText className="h-4 w-4 mr-2" /> Create Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleCreateQuote(customer)}>
                              <FileSpreadsheet className="h-4 w-4 mr-2" /> Create Quote
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => window.location.href = '/sales?tab=receipts&action=create-receipt'}>
                                <CreditCard className="h-4 w-4 mr-2" /> Create Receipt
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openStatementDialog(customer)}>
                                <FileDown className="h-4 w-4 mr-2" /> View Statement
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="text-xs text-muted-foreground">
                Page {page + 1} of {Math.max(1, Math.ceil(filteredCustomers.length / pageSize))}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) >= Math.ceil(filteredCustomers.length / pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
            </>
          )}
        </div>

      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Statement Options</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quick period</Label>
                <Select value={monthsPreset} onValueChange={setMonthsPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Last 3 months</SelectItem>
                    <SelectItem value="6">Last 6 months</SelectItem>
                    <SelectItem value="12">Last 12 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={useCustomRange} onCheckedChange={setUseCustomRange} />
                <Label>Use custom date range</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!useCustomRange} />
              </div>
              <div>
                <Label>End date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!useCustomRange} />
              </div>
            </div>
          </div>
          <div className="pt-4">
            <Button onClick={exportStatement} className="w-full bg-gradient-primary">Export PDF</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
        <DialogContent className="sm:max-w-[640px] p-4">
          <DialogHeader>
            <DialogTitle>Customers Tutorial</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>To issue an invoice, first add the customer here.</p>
            <p>Capture the customer’s basic information so invoices and statements reflect correct details.</p>
          </div>
          <div className="pt-4">
            <Button onClick={() => setTutorialOpen(false)}>Got it</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={statementViewOpen} onOpenChange={setStatementViewOpen}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>Customer Statement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium">Opening balance: <span className="font-mono">{statementOpeningBalance.toFixed(2)}</span></div>
              <Button variant="outline" size="sm" onClick={refreshStatementViewer}>Refresh</Button>
            </div>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Dr</TableHead>
                    <TableHead className="text-right">Cr</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    let running = statementOpeningBalance;
                    return statementEntries.map((e, idx) => {
                      running = running + Number(e.dr || 0) - Number(e.cr || 0);
                      return (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{new Date(e.date).toLocaleDateString('en-ZA')}</TableCell>
                          <TableCell className="text-xs font-medium">{e.description}</TableCell>
                          <TableCell className="text-xs">{e.reference || '-'}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-muted-foreground">{Number(e.dr || 0) > 0 ? Number(e.dr).toFixed(2) : '-'}</TableCell>
                          <TableCell className="text-xs text-right font-mono text-muted-foreground">{Number(e.cr || 0) > 0 ? Number(e.cr).toFixed(2) : '-'}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold">{running.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Receive Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer</Label>
              <Input readOnly value={paymentCustomer?.name || ''} className="bg-muted" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount</Label>
                <Input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Bank Account</Label>
              <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.bank_name} ({b.account_number})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="pt-4">
            <Button className="w-full bg-gradient-primary" onClick={postCustomerPayment}>Post Payment</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick View Dialog */}
      <Dialog open={quickViewOpen} onOpenChange={setQuickViewOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>
          {viewCustomer && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 pb-4 border-b">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-xl bg-[#0070ad] text-white">
                    {viewCustomer.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">{viewCustomer.name.startsWith('[INACTIVE] ') ? viewCustomer.name.replace('[INACTIVE] ', '') : viewCustomer.name}</h3>
                  <p className="text-sm text-muted-foreground">Customer ID: {viewCustomer.id.slice(0, 8)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{viewCustomer.email || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium">{viewCustomer.phone || '-'}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Address</Label>
                <p className="font-medium">{viewCustomer.address || '-'}</p>
              </div>
              <div className="pt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => handleEditCustomer(viewCustomer)}>
                  <Edit className="h-4 w-4 mr-2" /> Edit
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => handleCreateInvoice(viewCustomer)}>
                  <FileText className="h-4 w-4 mr-2" /> Create Invoice
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={editCustomerOpen} onOpenChange={setEditCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateCustomer} className="space-y-4">
            <div>
              <Label>Customer Name *</Label>
              <Input
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                required
                placeholder="Business or individual name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  placeholder="client@example.com"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  placeholder="082 123 4567"
                />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={editFormData.address}
                onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                placeholder="Physical address"
              />
            </div>
            <Button type="submit" className="w-full bg-[#0070ad] hover:bg-[#005a8b]">Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteCustomerOpen} onOpenChange={setDeleteCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Delete Customer
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {viewCustomer && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium">{viewCustomer.name}</p>
              {viewCustomer.email && <p className="text-sm text-muted-foreground">{viewCustomer.email}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCustomerOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteCustomer}>Delete</Button>
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
    </div>
  );
}
