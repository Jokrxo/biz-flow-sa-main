import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Plus, FileText, Loader2, Download, CreditCard, MoreHorizontal, ArrowRightLeft, History, Printer, Copy, Eye, Edit, ChevronUp, ChevronDown, RefreshCw, Settings, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Info, Box, Briefcase, Building, Trash2, Send, CheckCircle2, Upload, FileSpreadsheet, Lock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { emitDashboardCacheInvalidation } from "@/stores/dashboardCache";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import Papa from 'papaparse';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { transactionsApi } from "@/lib/transactions-api";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";
import { buildInvoicePDF } from "@/lib/invoice-export";
import { cn } from "@/lib/utils";

interface Bill {
  id: string;
  bill_number: string;
  bill_date: string;
  due_date: string | null;
  supplier_id: string;
  supplier_name?: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_due: number;
  notes: string | null;
  source: 'bill' | 'purchase_order';
  po_number?: string;
  purchase_type?: 'inventory' | 'service';
}

interface BillItem {
  type: 'service' | 'inventory';
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

interface Supplier {
  id: string;
  name: string;
  address?: string;
  tax_number?: string;
  phone?: string;
  email?: string;
}

type SortConfig = {
  key: keyof Bill | '';
  direction: 'asc' | 'desc';
};

export const SupplierInvoice = () => {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'bill_date', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const { toast } = useToast();
  const { user } = useAuth();
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
      setForm(prev => ({
        ...prev,
        items: prev.items.map(item => ({ ...item, tax_rate: 0 }))
      }));
    }
  }, [isVatRegistered]);

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payOrder, setPayOrder] = useState<Bill | null>(null);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState<string>("");
  const [paidSoFar, setPaidSoFar] = useState<number>(0);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; account_name: string }>>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showDateWarning, setShowDateWarning] = useState(false);

  // Return Dialog State
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnBill, setReturnBill] = useState<Bill | null>(null);
  const [returnItems, setReturnItems] = useState<any[]>([]);
  const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({});
  const [returnAmount, setReturnAmount] = useState("");
  const [overLimitOpen, setOverLimitOpen] = useState(false);
  const [overLimitMessage, setOverLimitMessage] = useState("");
  const [returnDescription, setReturnDescription] = useState("");
  const [selectedCreditAccountId, setSelectedCreditAccountId] = useState("");
  const [isReturning, setIsReturning] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [selectedReturnType, setSelectedReturnType] = useState<'' | 'inventory' | 'service'>('');
  const filteredReturnItems = useMemo(() => {
    if (!selectedReturnType) return returnItems;
    return returnItems.filter(i => (i.type || '').toLowerCase() === selectedReturnType);
  }, [returnItems, selectedReturnType]);
  const [inventoryUnits, setInventoryUnits] = useState<Record<string, number>>({});
  const [overrideAmount, setOverrideAmount] = useState(false);
  const [selectedServiceIndex, setSelectedServiceIndex] = useState<number | null>(null);

  useEffect(() => {
    async function fetchReturnItems() {
      if (!returnBill) {
        setReturnItems([]);
        setReturnQuantities({});
        return;
      }
      
      let itemsData: any[] = [];
      if (returnBill.source === 'purchase_order') {
         const { data } = await supabase.from('purchase_order_items').select('*').eq('purchase_order_id', returnBill.id);
         if (data) itemsData = data;
      } else {
         const { data } = await supabase.from('bill_items').select('*').eq('bill_id', returnBill.id);
         if (data) itemsData = data;
      }
      setReturnItems(itemsData);
      setReturnQuantities({});
    }
    fetchReturnItems();
  }, [returnBill]);

  useEffect(() => {
    if (selectedReturnType === 'inventory' && filteredReturnItems.length > 0 && !overrideAmount) {
      let total = 0;
      filteredReturnItems.forEach((item, idx) => {
        const qty = returnQuantities[idx] || 0;
        const price = item.unit_price || 0;
        const taxRate = item.tax_rate || 0;
        const lineTotal = qty * price * (1 + taxRate / 100);
        total += lineTotal;
      });
      setReturnAmount(total.toFixed(2));
    }
  }, [returnQuantities, filteredReturnItems, selectedReturnType, overrideAmount]);

  useEffect(() => {
    async function fetchUnits() {
      if (selectedReturnType !== 'inventory') {
        setInventoryUnits({});
        return;
      }
      if (!companyId || filteredReturnItems.length === 0) return;
      const names = filteredReturnItems.map(i => i.description);
      const { data } = await supabase
        .from('items')
        .select('name, quantity_on_hand')
        .in('name', names)
        .eq('company_id', companyId);
      const map: Record<string, number> = {};
      (data || []).forEach(r => { map[String(r.name)] = Number(r.quantity_on_hand || 0); });
      setInventoryUnits(map);
    }
    fetchUnits();
  }, [selectedReturnType, filteredReturnItems, companyId]);

 

  // Credit Balance Logic State
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [availableCredit, setAvailableCredit] = useState<number>(0);
  const [creditSources, setCreditSources] = useState<any[]>([]);
  const [pendingPayment, setPendingPayment] = useState<{ amt: number; outstanding: number } | null>(null);
  const [isApplyingCredit, setIsApplyingCredit] = useState(false);

  // New Invoice Form State
  const [showForm, setShowForm] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({
    bill_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    supplier_id: "",
    bill_number: "",
    notes: "",
    items: [{ type: 'service', description: "", quantity: 1, unit_price: 0, tax_rate: 15 }] as BillItem[]
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import State
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [deleteBlockedOpen, setDeleteBlockedOpen] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "text/csv" || file.name.endsWith('.csv')) {
        setImportFile(file);
        toast({ title: "File Selected", description: file.name });
      } else {
        toast({ 
          title: "Invalid File", 
          description: "Please upload a CSV file", 
          variant: "destructive" 
        });
      }
    }
  };

  useEffect(() => {
    async function fetchData() {
      if (!companyId) return;
      
      const { data: suppliersData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      
      if (suppliersData) setSuppliers(suppliersData);

      const { data: productsData } = await supabase
        .from('items')
        .select('*')
        .eq('company_id', companyId)
        .order('name');
      
      if (productsData) setProducts(productsData);
    }
    if (showForm) fetchData();
  }, [companyId, showForm]);

  const checkSupplierCredit = async (supplierId: string) => {
     if (!companyId) return { total: 0, sources: [] };
     
     const { data: bills } = await supabase
       .from('bills')
       .select('bill_number, total_amount')
       .eq('company_id', companyId)
       .eq('supplier_id', supplierId);
       
     const { data: pos } = await supabase
       .from('purchase_orders')
       .select('po_number, total_amount')
       .eq('company_id', companyId)
       .eq('supplier_id', supplierId)
       .in('status', ['sent', 'paid', 'processed', 'partially_paid']);

     const { data: deposits } = await supabase
       .from('transactions')
       .select('reference_number, total_amount, transaction_type')
       .match({
         company_id: companyId,
         supplier_id: supplierId,
         transaction_type: 'deposit'
       })
       .in('status', ['posted', 'approved']);

     const allBills = [
        ...(bills || []).map(b => ({ ref: b.bill_number, total: Number(b.total_amount) })),
        ...(pos || []).map(p => ({ ref: p.po_number, total: Number(p.total_amount) }))
     ];
     
     const billRefs = allBills.map(b => b.ref);
     const depositRefs = (deposits || []).map(d => d.reference_number);
     const allRefs = [...billRefs, ...depositRefs].filter(Boolean);
     
     if (allRefs.length === 0) return { total: 0, sources: [] };
     
     const { data: txs } = await supabase
       .from('transactions')
       .select('reference_number, total_amount, transaction_type')
       .eq('company_id', companyId)
       .in('reference_number', allRefs);
       
     const sources: any[] = [];
     let totalCredit = 0;
     
     // Check Bills for surplus
     allBills.forEach(bill => {
        if (!bill.ref) return;
        const billTxs = (txs || []).filter(t => t.reference_number === bill.ref);
        const payments = billTxs.filter(t => t.transaction_type === 'payment').reduce((sum, t) => sum + Number(t.total_amount), 0);
        const refunds = billTxs.filter(t => t.transaction_type === 'refund').reduce((sum, t) => sum + Number(t.total_amount), 0);
        
        const net = bill.total - payments - refunds;
        
        if (net < -0.01) {
           const surplus = Math.abs(net);
           const type = payments > bill.total ? 'payment' : 'refund';
           sources.push({
              ref: bill.ref,
              amount: surplus,
              type: type
           });
           totalCredit += surplus;
        }
     });

     // Check Deposits
     if (deposits) {
        // Group deposits by reference number to handle cases where we might have duplicates? 
        // Actually deposit refs should be unique per transaction usually.
        const uniqueDepositRefs = Array.from(new Set(depositRefs));
        
        uniqueDepositRefs.forEach(ref => {
            if (!ref) return;
            const dTxs = (txs || []).filter(t => t.reference_number === ref);
            // Sum all amounts: Deposit is positive, usage (negative payment) is negative
            const balance = dTxs.reduce((sum, t) => sum + Number(t.total_amount), 0);
            
            if (balance > 0.01) {
                sources.push({
                    ref: ref,
                    amount: balance,
                    type: 'deposit'
                });
                totalCredit += balance;
            }
        });
     }
     
     return { total: totalCredit, sources };
  };

  const handleApplyCredit = async () => {
      if (!payOrder || !pendingPayment || !creditSources.length) return;
      
      setIsApplyingCredit(true);
      try {
         const amountToPay = pendingPayment.amt;
         let remainingToPay = amountToPay;
         let creditUsedTotal = 0;
         
         const { data: { user } } = await supabase.auth.getUser();
         if (!user) throw new Error("No user");

         const { data: accountsList } = await supabase
           .from('chart_of_accounts')
           .select('id, account_name, account_type, account_code')
           .eq('company_id', companyId)
           .eq('is_active', true);
         
         const apAccount = accountsList?.find(a => a.account_type?.toLowerCase() === 'liability' && (a.account_code === '2000' || a.account_name?.toLowerCase().includes('payable')));
         const apId = apAccount?.id;
         if (!apId) throw new Error("AP Account not found");

         const depositAccount = accountsList?.find(a => a.account_code === '1430');
         let depositAccountId = depositAccount?.id;
         if (!depositAccountId) {
           const guess = accountsList?.find(
             a => (a.account_type?.toLowerCase() === 'asset') && (
               (a.account_name || '').toLowerCase().includes('deposit') ||
               (a.account_name || '').toLowerCase().includes('advance')
             )
           );
           depositAccountId = guess?.id;
         }
 
         for (const source of creditSources) {
             if (remainingToPay <= 0.01) break;
             
             const useAmount = Math.min(remainingToPay, source.amount);
             
             // 1. Create Credit Usage Transaction (Target)
             const { data: tx1, error: tx1Error } = await supabase.from('transactions').insert({
                 company_id: companyId,
                 user_id: user.id,
                 transaction_date: payDate,
                 description: `Credit applied from ${source.ref}`,
                 reference_number: payOrder.bill_number,
                 total_amount: useAmount,
                 transaction_type: 'payment',
                 status: 'posted'
             }).select().single();
             
             if (tx1Error) throw tx1Error;

             if (source.type === 'deposit' && !depositAccountId) {
               throw new Error("Deposit account not found (1430). Please create or activate the Deposits Paid account.");
             }
             const creditSideAccountId = (source.type === 'deposit') ? depositAccountId! : apId;

             await supabase.from('ledger_entries').insert([
                 {
                     company_id: companyId,
                     transaction_id: tx1.id,
                     account_id: apId,
                     debit: useAmount,
                     credit: 0,
                     entry_date: payDate,
                     description: `Credit applied from ${source.ref}`,
                     reference_id: payOrder.bill_number
                 },
                 {
                     company_id: companyId,
                     transaction_id: tx1.id,
                     account_id: creditSideAccountId,
                     debit: 0,
                     credit: useAmount,
                     entry_date: payDate,
                     description: `Credit Source: ${source.ref}`,
                     reference_id: source.ref
                 }
             ]);
             
             // 2. Reduce Source Credit (Negative Transaction)
             await supabase.from('transactions').insert({
                 company_id: companyId,
                 user_id: user.id,
                 transaction_date: payDate,
                 description: `Credit used for ${payOrder.bill_number}`,
                 reference_number: source.ref,
                 total_amount: -useAmount,
                 transaction_type: source.type, // 'payment' or 'refund' or 'deposit'
                 status: 'posted'
             });

             remainingToPay -= useAmount;
             creditUsedTotal += useAmount;
         }
         
         // 3. Pay remaining with Bank
         if (remainingToPay > 0.01) {
             await transactionsApi.postPurchasePaidClient(
                { ...payOrder, po_number: payOrder.bill_number },
                payDate,
                selectedBankId,
                remainingToPay
             );
         }
         
         toast({ title: "Success", description: `Credit applied: R${creditUsedTotal.toFixed(2)}. Paid from Bank: R${remainingToPay.toFixed(2)}` });
         setCreditDialogOpen(false);
         setPayDialogOpen(false);
         refreshData(true);
      } catch (e: any) {
         console.error(e);
         toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
         setIsApplyingCredit(false);
      }
  };

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const isSyncing = false;

  const fetchInvoices = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
        let cid = companyId;
        if (!cid) {
           const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
           cid = profile?.company_id || null;
        }

        if (!cid) {
            setLoading(false);
            return;
        }
        const companyIdToUse = cid;

        // Fetch Bills
        const { data: billsData, error: billsError } = await supabase
          .from("bills")
          .select("*")
          .eq("company_id", companyIdToUse)
          .order("bill_date", { ascending: false });

        if (billsError) throw billsError;

        // Fetch Purchase Orders (Sent/Paid)
        const { data: poData, error: poError } = await supabase
          .from("purchase_orders")
          .select("id, po_number, po_date, status, subtotal, tax_amount, total_amount, supplier_id, notes")
          .eq("company_id", companyIdToUse)
          .in("status", ["sent", "paid", "processed", "partially_paid"])
          .order("po_date", { ascending: false });

        if (poError) throw poError;

        // Collect all supplier IDs and Reference Numbers
        const billSupplierIds = (billsData || []).map(b => b.supplier_id);
        const poSupplierIds = (poData || []).map(p => p.supplier_id);
        const supplierIds = Array.from(new Set([...billSupplierIds, ...poSupplierIds]));

        const billRefs = (billsData || []).map(b => b.bill_number);
        const poRefs = (poData || []).map(p => p.po_number);
        const allRefs = [...billRefs, ...poRefs].filter(Boolean);

        let typeByRef: Record<string, 'inventory' | 'service'> = {};
        if (allRefs.length > 0) {
          const { data: ledger } = await supabase
            .from('ledger_entries')
            .select('description, reference_id')
            .in('reference_id', allRefs);
          (ledger || []).forEach((le: any) => {
            const ref = String(le.reference_id || '');
            const desc = String(le.description || '').toLowerCase();
            if (!ref) return;
            if (desc.includes('(inventory)')) {
              typeByRef[ref] = 'inventory';
            } else if (!typeByRef[ref] && desc.includes('(service)')) {
              typeByRef[ref] = 'service';
            }
          });
        }

        const billIds = (billsData || []).map(b => b.id);
        let billItemsMap: Record<string, string[]> = {};
        if (billIds.length > 0) {
          const { data: billItems } = await supabase
            .from('bill_items')
            .select('bill_id, description')
            .in('bill_id', billIds);
          (billItems || []).forEach((bi: any) => {
            const bid = String(bi.bill_id || '');
            const desc = String(bi.description || '').trim();
            if (!bid) return;
            billItemsMap[bid] = billItemsMap[bid] || [];
            if (desc) billItemsMap[bid].push(desc);
          });
        }

        const { data: dbItems } = await supabase
          .from('items')
          .select('name, item_type')
          .eq('company_id', companyIdToUse);
        const itemTypeMap: Record<string, string> = {};
        (dbItems || []).forEach((it: any) => {
          const nameKey = String(it.name || '').trim();
          if (nameKey) itemTypeMap[nameKey] = String(it.item_type || '');
        });

        let supplierMap: Record<string, string> = {};
        let paymentsMap: Record<string, number> = {};
        let refundsMap: Record<string, number> = {};
        
        if (supplierIds.length > 0) {
          const { data: suppliers } = await supabase
            .from("suppliers")
            .select("id, name")
            .in("id", supplierIds);
          
          if (suppliers) {
            suppliers.forEach(s => {
              supplierMap[s.id] = s.name;
            });
          }
        }

        // Fetch payments and refunds for these bills/POs
        if (allRefs.length > 0) {
          const { data: refTx } = await supabase
            .from('transactions')
            .select('reference_number, total_amount, transaction_type')
            .eq('company_id', companyIdToUse)
            .in('transaction_type', ['payment', 'refund'])
            .eq('status', 'posted')
            .in('reference_number', allRefs);
            
          if (refTx) {
            refTx.forEach(p => {
              const ref = p.reference_number || '';
              const amt = Number(p.total_amount || 0);
              if (ref) {
                if (p.transaction_type === 'refund') {
                   refundsMap[ref] = (refundsMap[ref] || 0) + amt;
                } else {
                   paymentsMap[ref] = (paymentsMap[ref] || 0) + amt;
                }
              }
            });
          }
        }

        // Fetch deposits by supplier (unallocated credits)
        const { data: depositTx } = await supabase
          .from('transactions')
          .select<string, any>('supplier_id, reference_number, total_amount, transaction_type')
          .eq('company_id', companyIdToUse)
          .eq('status', 'posted')
          .eq('transaction_type', 'deposit');
        
        const depositsBySupplier: Record<string, number> = {};
        if (depositTx && depositTx.length > 0) {
          const refSet = new Set(allRefs);
          (depositTx as any[]).forEach(d => {
            const supplierId = String(d.supplier_id || '');
            const ref = d.reference_number || '';
            if (!supplierId) return;
            // Only count deposits not explicitly linked to a bill/po reference
            if (ref && refSet.has(ref)) return;
            const amt = Number(d.total_amount || 0);
            depositsBySupplier[supplierId] = (depositsBySupplier[supplierId] || 0) + amt;
          });
        }

        const calculateStatus = (item: any, type: 'bill' | 'po') => {
          const ref = type === 'bill' ? item.bill_number : item.po_number;
          const total = Number(item.total_amount || 0);
          let paid = paymentsMap[ref] || 0;
          
          // Check for payments on linked PO
          if (type === 'bill' && item.po_number) {
             paid += paymentsMap[item.po_number] || 0;
          }
          
          const refunded = refundsMap[ref] || 0;
          const totalPaid = paid + refunded;
          
          // Check for full return first
          if (total > 0 && refunded >= total - 0.01) return 'Returned';

          // Due date logic
          let dueDate: Date | null = null;
          if (type === 'bill' && item.due_date) {
            dueDate = new Date(item.due_date);
          } else if (type === 'po' && item.po_date) {
            // Fallback for PO: assume 30 days if no explicit due date
            dueDate = new Date(item.po_date);
            dueDate.setDate(dueDate.getDate() + 30);
          }

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (dueDate) dueDate.setHours(0, 0, 0, 0);
          
          if (total > 0 && totalPaid >= total - 0.01) return 'Paid';
          if (totalPaid > 0 && totalPaid < total) return 'Partially Paid';
          if (dueDate && dueDate < today && totalPaid < total) return 'Overdue';
          
          // If not paid at all
          return 'Unpaid';
        };

        const getAmountDue = (item: any, type: 'bill' | 'po') => {
          const ref = type === 'bill' ? item.bill_number : item.po_number;
          const total = Number(item.total_amount || 0);
          let paid = paymentsMap[ref] || 0;
          
          // Check for payments on linked PO
          if (type === 'bill' && item.po_number) {
             paid += paymentsMap[item.po_number] || 0;
          }
          
          const refunded = refundsMap[ref] || 0;
          return Math.max(0, total - paid - refunded);
        };

        const formattedBills: Bill[] = (billsData || []).map(bill => {
          const ref = String(bill.bill_number || '');
          let ptype: 'inventory' | 'service' | undefined = typeByRef[ref];
          if (!ptype) {
            const names = billItemsMap[bill.id] || [];
            const hasInventory = names.some(n => (itemTypeMap[n] || '').toLowerCase() === 'product' || (itemTypeMap[n] || '').toLowerCase() === 'inventory');
            ptype = hasInventory ? 'inventory' : 'service';
          }
          return {
            ...bill,
            supplier_name: supplierMap[bill.supplier_id] || "Unknown Supplier",
            status: calculateStatus(bill, 'bill'),
            amount_due: getAmountDue(bill, 'bill'),
            source: 'bill',
            po_number: (bill as any).po_number,
            purchase_type: ptype
          };
        });

        const poIds = (poData || []).map(p => p.id);
        let poTypeMap: Record<string, 'inventory' | 'service'> = {};
        if (poIds.length > 0) {
          const { data: poItems } = await supabase
            .from('purchase_order_items')
            .select('purchase_order_id, expense_account_id')
            .in('purchase_order_id', poIds);
          const grouped: Record<string, any[]> = {};
          (poItems || []).forEach((pi: any) => {
            const pid = String(pi.purchase_order_id || '');
            grouped[pid] = grouped[pid] || [];
            grouped[pid].push(pi);
          });
          Object.keys(grouped).forEach(pid => {
            const items = grouped[pid];
            const hasInventory = items.some(i => !i.expense_account_id);
            poTypeMap[pid] = hasInventory ? 'inventory' : 'service';
          });
        }

        const formattedPOs: Bill[] = (poData || []).map(po => ({
          id: po.id,
          bill_number: po.po_number,
          bill_date: po.po_date,
          due_date: null,
          supplier_id: po.supplier_id,
          supplier_name: supplierMap[po.supplier_id] || "Unknown Supplier",
          status: calculateStatus(po, 'po'),
          amount_due: getAmountDue(po, 'po'),
          subtotal: po.subtotal,
          tax_amount: po.tax_amount,
          total_amount: po.total_amount,
          notes: po.notes,
          source: 'purchase_order',
          purchase_type: poTypeMap[po.id] || 'service'
        }));

        // Combine and sort by date ascending for allocation
        let combined = [...formattedBills, ...formattedPOs].sort((a, b) => 
          new Date(a.bill_date).getTime() - new Date(b.bill_date).getTime()
        );

        // Apply supplier deposits to reduce amount_due, and update status
        const creditRemaining: Record<string, number> = { ...depositsBySupplier };
        combined = combined.map(item => {
          const supplierId = item.supplier_id;
          const outstanding = Math.max(0, Number(item.amount_due || 0));
          const available = creditRemaining[supplierId] || 0;
          if (available > 0 && outstanding > 0) {
            const allocate = Math.min(available, outstanding);
            const newDue = Math.max(0, outstanding - allocate);
            creditRemaining[supplierId] = Math.max(0, available - allocate);
            const newStatus = newDue <= 0 ? 'Paid' : (item.status.toLowerCase() === 'overdue' ? 'Overdue' : 'Partially Paid');
            return { ...item, amount_due: newDue, status: newStatus };
          }
          // If there is excess deposit and no outstanding, leave as is
          return item;
        });

        // Re-sort by date descending for display
        combined = combined.sort((a, b) => 
          new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime()
        );

        setBills(combined);
    } catch (error: any) {
        console.error("Error fetching invoices:", error);
        toast({ title: "Error", description: "Failed to load invoices", variant: "destructive" });
    } finally {
        setLoading(false);
    }
  }, [user, companyId, toast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const refreshData = async (force?: boolean) => {
    await fetchInvoices();
  };

  useEffect(() => {
    const fetchAccounts = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, account_name, account_type, account_code')
        .eq('company_id', profile!.company_id)
        .eq('is_active', true);
        
      if (data) {
        setAccounts(data.map(a => ({ id: String(a.id), name: a.account_name, code: a.account_code })));
      }
    };
    fetchAccounts();
  }, []);

  useEffect(() => {
    const fetchBankAccounts = async () => {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) return;
       const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
       if (!profile) return;
       
       const { data } = await supabase
        .from('bank_accounts')
        .select('id, account_name')
        .eq('company_id', profile.company_id);
         
       if (data) setBankAccounts(data);
    };
    fetchBankAccounts();
  }, []);

  useEffect(() => {
    if (returnOpen && accounts.length > 0) {
      // No account selection needed
    }
  }, [returnOpen, accounts]);

  const handleMakePayment = async (bill: Bill) => {
    setPayOrder(bill);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayAmount("");
    setSelectedBankId("");
    
    try {
      const { data: payments } = await supabase
        .from('transactions')
        .select('total_amount')
        .eq('reference_number', bill.bill_number)
        .eq('transaction_type', 'payment')
        .eq('status', 'posted');
        
      const paid = (payments || []).reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
      setPaidSoFar(paid);
      
      const outstanding = Math.max(0, bill.total_amount - paid);
      setPayAmount(outstanding.toFixed(2));
      
      setPayDialogOpen(true);
    } catch (e) {
      console.error(e);
      setPaidSoFar(0);
      setPayAmount(bill.total_amount.toFixed(2));
      setPayDialogOpen(true);
    }
  };

  const confirmPayment = async () => {
    if (!payOrder || !selectedBankId) return;
    
    // Date Validation: Payment Date cannot be before Invoice Date
    if (payDate < payOrder.bill_date) {
      setShowDateWarning(true);
      return;
    }

    if (isDateLocked(payDate)) {
      setPayDialogOpen(false);
      setIsLockDialogOpen(true);
      return;
    }
    
    try {
      setIsProcessingPayment(true);
      const amt = parseFloat(payAmount || '0');
      const outstanding = Math.max(0, Number(payOrder.total_amount || 0) - paidSoFar);
      
      if (!amt || amt <= 0) {
        toast({ title: "Error", description: "Enter a valid payment amount", variant: "destructive" });
        return;
      }
      
      if (amt > outstanding + 1.0) { 
         toast({ title: "Error", description: "Amount exceeds outstanding balance", variant: "destructive" });
         return;
      }

      // Check for credit
      const { total, sources } = await checkSupplierCredit(payOrder.supplier_id);
      if (total > 0) {
          setAvailableCredit(total);
          setCreditSources(sources);
          setPendingPayment({ amt, outstanding });
          setCreditDialogOpen(true);
          setPayDialogOpen(false);
          setIsProcessingPayment(false);
          return;
      }
      
      await transactionsApi.postPurchasePaidClient(
        { ...payOrder, po_number: payOrder.bill_number },
        payDate,
        selectedBankId,
        amt
      );
      
      toast({ title: "Success", description: "Payment recorded successfully" });
      setPayDialogOpen(false);
      refreshData(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleCreateReturn = async () => {
    if (!returnBill || !returnAmount) {
       toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
       return;
    }
    
    setIsReturning(true);
    try {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) return;
       const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
       
       // Find Accounts
       const { data: accountsList } = await supabase
         .from('chart_of_accounts')
         .select('id, account_name, account_type, account_code')
         .eq('company_id', profile!.company_id)
         .eq('is_active', true);

       const list = (accountsList || []).map(a => ({ id: String(a.id), name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
       const pick = (type: string, codes: string[], names: string[]) => {
         const byCode = list.find(a => a.type === type && codes.includes(a.code));
         if (byCode) return byCode.id;
         const byName = list.find(a => a.type === type && names.some(n => a.name.includes(n)));
         if (byName) return byName.id;
         return "";
       };
       
       const apId = pick('liability', ['2000'], ['accounts payable','payable']);
      // Fix: Inventory is 1300, not 1000 (which is Cash on Hand)
      const inventoryId = pick('asset', ['1300', '1310', '1320'], ['inventory', 'stock']);
      const vatInputId = pick('asset', ['2200', '2110'], ['vat input', 'input vat']);
       
       if (!apId) throw new Error("Could not find Accounts Payable account.");

       // Validation: Check if return amount exceeds (Total - Previous Refunds)
       const { data: previousRefunds } = await supabase
         .from('transactions')
         .select('total_amount')
         .eq('company_id', profile!.company_id)
         .eq('reference_number', returnBill.bill_number)
         .eq('transaction_type', 'refund')
         .eq('status', 'posted');
         
       const totalRefunded = (previousRefunds || []).reduce((sum, t) => sum + Number(t.total_amount || 0), 0);
       const currentReturnAmt = parseFloat(returnAmount);
       
       if (totalRefunded + currentReturnAmt > returnBill.total_amount + 0.01) {
          throw new Error(`Return amount exceeds invoice total. Previously refunded: ${totalRefunded.toFixed(2)}`);
       }

       const refNum = `DN-${Date.now()}`; // Changed to DN for Debit Note
       const returnDate = new Date().toISOString().slice(0, 10);

       // Transaction
       const { data: tx, error: txError } = await supabase.from('transactions').insert({
          company_id: profile!.company_id,
          user_id: user.id,
          supplier_id: returnBill.supplier_id,
          transaction_date: returnDate,
          description: returnDescription || `Debit Note for ${returnBill.bill_number}`,
          reference_number: returnBill.bill_number,
          total_amount: parseFloat(returnAmount),
          transaction_type: 'refund',
          status: 'pending'
       }).select('id').single();
       
       if (txError) throw txError;
       
       let inventoryCredit = 0;
       let serviceCredit = 0;
       let vatCredit = 0;

      if (filteredReturnItems.length > 0 && selectedReturnType) {
         // Identify types for items
        const itemNames = filteredReturnItems.map(i => i.description);
         const { data: dbItems } = await supabase
           .from('items')
           .select('name, item_type')
           .in('name', itemNames)
           .eq('company_id', profile!.company_id);

         const itemTypeMap: Record<string, string> = {};
         if (dbItems) {
           dbItems.forEach(i => itemTypeMap[i.name] = i.item_type);
         }

        if (selectedReturnType === 'inventory') {
          for (let idx = 0; idx < filteredReturnItems.length; idx++) {
            const item = filteredReturnItems[idx];
            const qty = returnQuantities[idx] || 0;
            if (qty > 0) {
              const lineTotal = qty * item.unit_price;
              const taxRate = item.tax_rate || 0;
              const taxAmount = lineTotal * (taxRate / 100);
              vatCredit += taxAmount;
              const type = itemTypeMap[item.description] || item.type || 'service';
              if (type === 'inventory' || type === 'Inventory' || type === 'product') {
                inventoryCredit += lineTotal;
              }
            }
          }
        } else if (selectedReturnType === 'service' && selectedServiceIndex !== null) {
          const item = filteredReturnItems[selectedServiceIndex];
          const taxRate = item.tax_rate || 0;
          const inclusive = parseFloat(returnAmount) || 0;
          const net = taxRate > 0 ? inclusive / (1 + taxRate / 100) : inclusive;
          const taxAmount = inclusive - net;
          serviceCredit += net;
          vatCredit += taxAmount;
        }
       } else {
        throw new Error("Specify items and quantities to return.");
       }

       const calculatedTotal = (selectedReturnType === 'inventory' ? inventoryCredit : serviceCredit) + vatCredit;

       // Entries: DR AP, CR Inventory/Service/VAT, CR AP for remainder
       const entries = [
         {
           transaction_id: tx.id,
           account_id: apId,
           credit: 0,
           debit: parseFloat(returnAmount),
           description: `Debit Note for ${returnBill.bill_number}`,
           status: 'approved'
         }
       ];

       if (selectedReturnType === 'inventory' && inventoryCredit > 0.01 && inventoryId) {
         entries.push({
           transaction_id: tx.id,
           account_id: inventoryId,
           credit: inventoryCredit,
           debit: 0,
           description: `Inventory Return: ${returnBill.bill_number}`,
           status: 'approved'
         });
       }

       if (selectedReturnType === 'service' && serviceCredit > 0.01) {
         const serviceExpenseId = selectedCreditAccountId || pick('expense', ['5120', '5000'], ['supplier returns', 'services', 'purchases', 'expense']);
         if (serviceExpenseId) {
           entries.push({
             transaction_id: tx.id,
             account_id: serviceExpenseId,
             credit: serviceCredit,
             debit: 0,
             description: `Service Return: ${returnBill.bill_number}`,
             status: 'approved'
           });
         }
       }
       if (vatCredit > 0.01 && vatInputId) {
          entries.push({
             transaction_id: tx.id,
             account_id: vatInputId,
             credit: vatCredit,
             debit: 0,
             description: `VAT Reversal: ${returnBill.bill_number}`,
             status: 'approved'
          });
       }
       
       let totalCredited = entries.filter(e => e.credit > 0).reduce((sum, e) => sum + e.credit, 0);
       let remaining = parseFloat(returnAmount) - totalCredited;
       
       if (remaining > 0.01) {
          entries.push({
             transaction_id: tx.id,
             account_id: apId,
             credit: remaining,
             debit: 0,
             description: `Debit Note Adjustment: ${returnBill.bill_number}`,
             status: 'approved'
          });
       }
       
       const { error: entriesError } = await supabase.from('transaction_entries').insert(entries);
       if (entriesError) throw entriesError;
       
       // Ledger
       const ledgerEntries = entries.map(e => ({
          company_id: profile!.company_id,
          transaction_id: tx.id,
          account_id: e.account_id,
          debit: e.debit,
          credit: e.credit,
          entry_date: returnDate,
          description: e.description,
          is_reversed: false,
          reference_id: refNum
       }));
       
       const { error: ledgerError } = await supabase.from('ledger_entries').insert(ledgerEntries);
       if (ledgerError) throw ledgerError;

       // Update transaction status to posted to trigger final checks
       const { error: updateError } = await supabase
         .from('transactions')
         .update({ status: 'posted' })
         .eq('id', tx.id);
       
       if (updateError) throw updateError;

       // Inventory Adjustment (only for inventory returns)
       if (selectedReturnType === 'inventory') {
       for (let i = 0; i < filteredReturnItems.length; i++) {
          const qty = returnQuantities[i] || 0;
          if (qty > 0) {
            const item = filteredReturnItems[i];
             // Try to find product by name since we don't have ID link
             const { data: product } = await supabase
               .from('items')
               .select('id, quantity_on_hand')
               .eq('company_id', profile!.company_id)
               .eq('name', item.description)
               .maybeSingle();

             if (product) {
                const currentQty = Number(product.quantity_on_hand || 0);
                if (qty > currentQty + 0.0001) {
                  throw new Error(`Insufficient stock to return "${item.description}". On hand: ${currentQty}, requested: ${qty}`);
                }
                const newQty = currentQty - qty;
                await supabase.from('items').update({ quantity_on_hand: newQty }).eq('id', product.id);
             }
          }
        }}
       
       toast({ title: "Success", description: "Debit Note recorded successfully" });
       setReturnOpen(false);
       setReturnAmount("");
       setReturnDescription("");
       setSelectedCreditAccountId("");
       refreshData(true);
    } catch (e: any) {
       console.error(e);
       toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
       setIsReturning(false);
    }
  };

  const handleImportInvoices = async () => {
    if (!importFile) {
      toast({ title: "Error", description: "Please select a file", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    setImportLogs([]);

    // Helper to parse DD/MM/YYYY or YYYY-MM-DD
    const parseDate = (dateStr: string): string | null => {
        if (!dateStr) return null;
        try {
            // Handle DD/MM/YYYY or DD-MM-YYYY
            if (dateStr.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/)) {
                const parts = dateStr.split(/[-/]/);
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                const year = parts[2];
                return `${year}-${month}-${day}`;
            }
            // Handle YYYY-MM-DD
            if (dateStr.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) {
                 return new Date(dateStr).toISOString().slice(0, 10);
            }
            // Try standard parse
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) {
                return d.toISOString().slice(0, 10);
            }
            return null;
        } catch (e) {
            return null;
        }
    };

    // Helper to parse amount
    const parseAmount = (amountStr: string): number => {
        if (!amountStr) return 0;
        // Remove currency symbols and spaces
        let clean = amountStr.replace(/[R\s]/g, '');
        // Check format
        if (clean.includes(',') && clean.includes('.')) {
            // Mixed: 1,234.56 or 1.234,56
            if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
                // 1.234,56 -> 1234.56
                clean = clean.replace(/\./g, '').replace(',', '.');
            } else {
                // 1,234.56 -> 1234.56
                clean = clean.replace(/,/g, '');
            }
        } else if (clean.includes(',')) {
            // 1234,56 -> 1234.56 (Assume comma is decimal if no dots, or thousand sep?)
            // Usually if it has 2 decimals, it's decimal separator. 
            // Safer: replace comma with dot
            clean = clean.replace(',', '.');
        }
        return parseFloat(clean) || 0;
    };

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      const companyId = profile?.company_id;
      if (!companyId) throw new Error("No company found");

      const text = await importFile.text();
      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      const rows = result.data as any[];

      if (rows.length === 0) throw new Error("No data found in file");

      setImportLogs(prev => [...prev, `Found ${rows.length} rows. Starting import...`]);

      // 1. Fetch Suppliers
      const { data: suppliersData } = await supabase.from('suppliers').select('id, name').eq('company_id', companyId);
      const supplierMap = new Map();
      if (suppliersData) {
        suppliersData.forEach(s => supplierMap.set(s.name.toLowerCase().trim(), s.id));
      }
      setImportLogs(prev => [...prev, `Loaded ${supplierMap.size} suppliers.`]);

      // 2. Fetch Accounts for Posting
      const { data: accountsList } = await supabase
        .from('chart_of_accounts')
        .select('id, account_name, account_type, account_code')
        .eq('company_id', companyId)
        .eq('is_active', true);
      
      const list = (accountsList || []).map(a => ({ 
          id: String(a.id), 
          name: String(a.account_name || '').toLowerCase(), 
          type: String(a.account_type || '').toLowerCase(), 
          code: String(a.account_code || '') 
      }));

      const pick = (type: string, codes: string[], names: string[]) => {
         const byCode = list.find(a => a.type === type && codes.includes(a.code));
         if (byCode) return byCode.id;
         const byName = list.find(a => a.type === type && names.some(n => a.name.includes(n)));
         if (byName) return byName.id;
         return "";
      };

      const apId = pick('liability', ['2000'], ['accounts payable', 'payable']);
      let expenseId = pick('expense', ['5000', '5100'], ['purchases', 'cost of goods sold', 'expense']);
      
      // Auto-create Purchases account if missing
      if (!expenseId) {
          try {
             const { data: newAcc } = await supabase.from('chart_of_accounts').insert({
                 company_id: companyId,
                 account_code: '5000',
                 account_name: 'Purchases',
                 account_type: 'expense',
                 is_active: true
             }).select('id').single();
             if (newAcc) expenseId = newAcc.id;
             setImportLogs(prev => [...prev, `Created 'Purchases' account.`]);
          } catch (e) {
             console.error("Failed to create Purchases account", e);
          }
      }

      if (!apId) throw new Error("Accounts Payable account not found (2000).");
      if (!expenseId) throw new Error("Expense/Purchases account not found and could not be created.");

      let successCount = 0;
      let errorCount = 0;

      // Fuzzy Header Matching
      const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
      const getRowValue = (row: any, ...keys: string[]) => {
          const rowKeys = Object.keys(row);
          for (const key of keys) {
              const normKey = normalizeHeader(key);
              const foundKey = rowKeys.find(k => normalizeHeader(k) === normKey);
              if (foundKey && row[foundKey]) return row[foundKey];
          }
          return null;
      };

      for (const row of rows) {
        const supplierName = getRowValue(row, 'Supplier Name', 'Supplier', 'Vendor');
        const billNumber = getRowValue(row, 'Document No', 'Bill Number', 'Invoice Number', 'Reference');
        const dateStr = getRowValue(row, 'Date', 'Bill Date', 'Invoice Date');
        const dueDateStr = getRowValue(row, 'Due Date');
        const amountStr = getRowValue(row, 'Amount', 'Total Amount', 'Total');
        const description = getRowValue(row, 'Description', 'Memo') || `Imported Invoice ${billNumber}`;
        
        if (!supplierName || !billNumber || !amountStr) {
           setImportLogs(prev => [...prev, `Skipping row: Missing required fields (Found: Supplier=${!!supplierName}, Doc=${!!billNumber}, Amt=${!!amountStr})`]);
           errorCount++;
           continue;
        }

        const supplierId = supplierMap.get(String(supplierName).toLowerCase().trim());
        if (!supplierId) {
           setImportLogs(prev => [...prev, `Error: Supplier "${supplierName}" not found. Please create it first.`]);
           errorCount++;
           continue;
        }

        try {
           const amount = parseAmount(String(amountStr));
           if (isNaN(amount) || amount === 0) {
               setImportLogs(prev => [...prev, `Error: Invalid amount "${amountStr}"`]);
               errorCount++;
               continue;
           }
           
           // Fix Date Parsing
           const billDate = parseDate(dateStr) || new Date().toISOString().slice(0, 10);
           const dueDate = dueDateStr ? parseDate(dueDateStr) : null;

           // Check if bill exists
           const { data: existing } = await supabase.from('bills').select('id').eq('company_id', companyId).eq('bill_number', billNumber).eq('supplier_id', supplierId).maybeSingle();
           if (existing) {
              setImportLogs(prev => [...prev, `Skipping: Bill ${billNumber} already exists.`]);
              continue;
           }

           // 1. Create Bill
           // Fix Status: Use 'pending' instead of 'Unpaid'
           const { data: bill, error: billError } = await supabase.from('bills').insert({
              company_id: companyId,
              bill_number: billNumber,
              bill_date: billDate,
              due_date: dueDate,
              supplier_id: supplierId,
              subtotal: amount,
              tax_amount: 0,
              total_amount: amount,
              amount_due: amount,
              status: 'pending', // Corrected status
              notes: 'Imported via CSV',
              source: 'bill'
           }).select().single();

           if (billError) throw billError;

           // 2. Bill Item
           await supabase.from('bill_items').insert({
              bill_id: bill.id,
              description: description,
              quantity: 1,
              unit_price: amount,
              tax_rate: 0,
              total_price: amount
           });

           // 3. Transaction & GL
           // Use 'pending' initially so the trigger doesn't fire prematurely if we want manual control,
           // BUT the trigger fires on 'posted' or 'approved'. 
           // If we insert as 'posted', the trigger MIGHT fire and try to read transaction_entries which don't exist yet.
           // So: Insert as 'pending', insert entries, then update to 'posted'.
           const { data: tx, error: txError } = await supabase.from('transactions').insert({
              company_id: companyId,
              user_id: user.id,
              transaction_date: billDate,
              description: `Supplier Invoice: ${billNumber}`,
              reference_number: billNumber,
              total_amount: amount,
              transaction_type: 'bill',
              status: 'pending', // Wait for entries
              supplier_id: supplierId
           }).select('id').single();

           if (txError) throw txError;

           // Entries
           const entries = [
              {
                 transaction_id: tx.id,
                 account_id: apId,
                 credit: amount,
                 debit: 0,
                 description: `Invoice ${billNumber} - AP`,
                 status: 'approved'
              },
              {
                 transaction_id: tx.id,
                 account_id: expenseId, // We ensured this exists now
                 credit: 0,
                 debit: amount,
                 description: description,
                 status: 'approved'
              }
           ];

           const { error: entriesError } = await supabase.from('transaction_entries').insert(entries);
           if (entriesError) throw entriesError;

           // Update to 'posted' to trigger the automatic ledger posting
           const { error: updateError } = await supabase
             .from('transactions')
             .update({ status: 'posted' })
             .eq('id', tx.id);
             
           if (updateError) throw updateError;

           // Note: We do NOT need to manually insert into ledger_entries because the trigger 'trigger_post_transaction_to_ledger'
           // on the transactions table (ON UPDATE OF status to 'posted') handles it automatically by reading transaction_entries.
           // Manually inserting creates duplicates.

           setImportLogs(prev => [...prev, `Success: Imported ${billNumber}`]);
           successCount++;

        } catch (e: any) {
           console.error(e);
           setImportLogs(prev => [...prev, `Error importing ${billNumber}: ${e.message}`]);
           errorCount++;
        }
      }

      toast({ 
        title: "Import Completed", 
        description: `Imported ${successCount} invoices. ${errorCount} errors.`,
        variant: successCount > 0 ? "default" : "destructive"
      });

      if (successCount > 0) {
         refreshData(true);
      }

    } catch (e: any) {
      toast({ title: "Import Failed", description: e.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!form.supplier_id || !form.bill_number || !form.bill_date) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");
      
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      const companyId = profile?.company_id;
      if (!companyId) throw new Error("No company found");

      // Calculate totals
      const subtotal = form.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      const taxAmount = form.items.reduce((sum, item) => sum + (item.quantity * item.unit_price * (item.tax_rate / 100)), 0);
      const totalAmount = subtotal + taxAmount;

      // 1. Create Bill
      const { data: bill, error: billError } = await supabase.from('bills').insert({
        company_id: companyId,
        bill_number: form.bill_number,
        bill_date: form.bill_date,
        due_date: form.due_date || null,
        supplier_id: form.supplier_id,
        subtotal: subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        status: 'Unpaid', // Matches logic (paid < total)
        notes: form.notes
      }).select().single();

      if (billError) throw billError;

      // 2. Create Bill Items
      if (form.items.length > 0) {
        const itemsToInsert = form.items.map(item => ({
          bill_id: bill.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          total_price: item.quantity * item.unit_price * (1 + item.tax_rate / 100)
        }));

        const { error: itemsError } = await supabase.from('bill_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      // ------------------------------------------------------------------
      // 3. POST TO GENERAL LEDGER (Automatic Accrual)
      // ------------------------------------------------------------------
      
      // Fetch Accounts
      const { data: accountsList } = await supabase
        .from('chart_of_accounts')
        .select('id, account_name, account_type, account_code')
        .eq('company_id', companyId)
        .eq('is_active', true);
        
      const list = (accountsList || []).map(a => ({ 
          id: String(a.id), 
          name: String(a.account_name || '').toLowerCase(), 
          type: String(a.account_type || '').toLowerCase(), 
          code: String(a.account_code || '') 
      }));

      const pick = (type: string, codes: string[], names: string[]) => {
         const byCode = list.find(a => a.type === type && codes.includes(a.code));
         if (byCode) return byCode.id;
         const byName = list.find(a => a.type === type && names.some(n => a.name.includes(n)));
         if (byName) return byName.id;
         return "";
      };

      const apId = pick('liability', ['2000'], ['accounts payable', 'payable']);
      const vatInputId = pick('asset', ['2200', '2110'], ['vat input', 'input vat']);
      // 1430 is the standard code for Supplier Deposits/Prepayments
      const depositAssetId = pick('asset', ['1430'], ['deposits paid', 'supplier deposits', 'prepayments']);

      if (!apId) {
        throw new Error("Accounts Payable (Liability) account not found. Please ensure it exists in your Chart of Accounts with code 2000 or name 'Accounts Payable'.");
      }

      if (apId) {
          // Create Transaction Record
          const { data: tx } = await supabase.from('transactions').insert({
              company_id: companyId,
              user_id: user.id,
              transaction_date: form.bill_date,
              description: `Supplier Invoice: ${form.bill_number}`,
              reference_number: form.bill_number,
              total_amount: totalAmount,
              transaction_type: 'bill',
              status: 'posted',
              supplier_id: form.supplier_id
          }).select('id').single();

          if (tx) {
              const entries: any[] = [];
              let totalDebits = 0;

              // Credit AP (Liability) - Full Amount
              entries.push({
                  transaction_id: tx.id,
                  account_id: apId,
                  debit: 0,
                  credit: totalAmount,
                  description: `Invoice ${form.bill_number} - AP`,
                  status: 'approved'
              });

              // Debit Expense/Inventory & VAT
              let inventoryTotal = 0;
              let expenseTotal = 0;
              let vatTotal = 0;

              // We need to categorize items to know if they are Inventory or Expense
              // For simplicity, we check the item type from the form or fallback
              
              // Get all product names to check types if needed, but form.items has type
              for (const item of form.items) {
                  const lineNet = item.quantity * item.unit_price;
                  const lineTax = lineNet * (item.tax_rate / 100);
                  
                  vatTotal += lineTax;
                  
                  // Determine Account ID for this line
                  let debitAccountId = "";
                  
                  if (item.type === 'inventory') {
                      inventoryTotal += lineNet;
                      // Try to find inventory account
                      debitAccountId = pick('asset', ['1300', '1310'], ['inventory', 'stock']);
                  } else {
                      expenseTotal += lineNet;
                      // Try to find a specific expense account if we had one selected, 
                      // but for now default to a general "Purchases" or "Cost of Goods Sold"
                      debitAccountId = pick('expense', ['5000', '5100'], ['purchases', 'cost of goods sold', 'expense']);
                  }
                  
                  if (!debitAccountId) debitAccountId = apId; // Fallback (should not happen in configured system)

                  // Add Debit Entry
                  entries.push({
                      transaction_id: tx.id,
                      account_id: debitAccountId,
                      debit: lineNet,
                      credit: 0,
                      description: `${item.description} (${item.type})`,
                      status: 'approved'
                  });
                  totalDebits += lineNet;
              }

              // Debit VAT
              if (vatTotal > 0.01 && vatInputId) {
                  entries.push({
                      transaction_id: tx.id,
                      account_id: vatInputId,
                      debit: vatTotal,
                      credit: 0,
                      description: `VAT Input - ${form.bill_number}`,
                      status: 'approved'
                  });
                  totalDebits += vatTotal;
              }
              
              // Fix Rounding
              const diff = totalAmount - totalDebits; // Should be Credit (Total) - Debits
              if (Math.abs(diff) > 0.01) {
                   // Add diff to first debit entry or expense
                   entries[1].debit += diff; 
              }

              await supabase.from('transaction_entries').insert(entries);
              
              // Ledger Entries
              const ledgerRows = entries.map(r => ({
                  company_id: companyId,
                  account_id: r.account_id,
                  debit: r.debit,
                  credit: r.credit,
                  entry_date: form.bill_date,
                  is_reversed: false,
                  transaction_id: tx.id,
                  description: r.description,
                  reference_id: form.bill_number
              }));
              await supabase.from('ledger_entries').insert(ledgerRows);

              // --------------------------------------------------------------
              // 4. AUTOMATIC DEPOSIT OFFSET (The Fix)
              // --------------------------------------------------------------
              
              // Check for available deposits
              const { total: availableDeposit, sources } = await checkSupplierCredit(form.supplier_id);
              
              // Ensure Deposit Asset Account exists if we have deposits to offset
              let finalDepositId = depositAssetId;
              if (availableDeposit > 0 && !finalDepositId) {
                 try {
                     // Check if it exists but wasn't picked (maybe different name)
                     const { data: existing } = await supabase.from('chart_of_accounts')
                        .select('id').eq('company_id', companyId).eq('account_code', '1430').maybeSingle();
                     
                     if (existing) {
                         finalDepositId = existing.id;
                     } else {
                         // Create it
                         const { data: created } = await supabase.from('chart_of_accounts').insert({
                             company_id: companyId,
                             account_code: '1430',
                             account_name: 'Deposits Paid',
                             account_type: 'asset',
                             is_active: true
                         }).select('id').single();
                         finalDepositId = created?.id || "";
                     }
                 } catch (e) {
                     console.error("Failed to ensure Deposits Paid account", e);
                 }
              }

              if (availableDeposit > 0 && !finalDepositId) {
                  throw new Error("Unable to locate or create a 'Deposits Paid' (Asset) account to offset the existing deposit. Please ensure account 1430 exists.");
              }

              if (availableDeposit > 0 && finalDepositId) {
                  const amountToOffset = Math.min(availableDeposit, totalAmount);
                  
                  if (amountToOffset > 0) {
                      console.log(`Auto-allocating deposit: ${amountToOffset}`);
                      
                      let remainingToOffset = amountToOffset;
                      
                      for (const source of sources) {
                          if (remainingToOffset <= 0.01) break;
                          if (source.type !== 'deposit') continue; // Only use actual deposits for now

                          const useAmount = Math.min(remainingToOffset, source.amount);
                          
                          // A. Create "Payment/Allocation" Transaction
                          // This acts as the "Payment" for the bill
                          const { data: allocTx } = await supabase.from('transactions').insert({
                              company_id: companyId,
                              user_id: user.id,
                              transaction_date: form.bill_date,
                              description: `Deposit Allocation from ${source.ref}`,
                              reference_number: form.bill_number, // Linked to Bill
                              total_amount: useAmount,
                              transaction_type: 'payment',
                              status: 'posted',
                              supplier_id: form.supplier_id
                          }).select('id').single();

                          if (allocTx) {
                              // B. GL Entries for Allocation
                              // Debit AP (Reduce Liability)
                              // Credit Deposit Asset (Reduce Asset)
                              const allocEntries = [
                                  {
                                      transaction_id: allocTx.id,
                                      account_id: apId,
                                      debit: useAmount,
                                      credit: 0,
                                      description: `Offset by Deposit ${source.ref}`,
                                      status: 'approved'
                                  },
                                  {
                                      transaction_id: allocTx.id,
                                      account_id: depositAssetId,
                                      debit: 0,
                                      credit: useAmount,
                                      description: `Applied to Inv ${form.bill_number}`,
                                      status: 'approved'
                                  }
                              ];
                              
                              await supabase.from('transaction_entries').insert(allocEntries);
                              
                              const allocLedger = allocEntries.map(r => ({
                                  company_id: companyId,
                                  account_id: r.account_id,
                                  debit: r.debit,
                                  credit: r.credit,
                                  entry_date: form.bill_date,
                                  is_reversed: false,
                                  transaction_id: allocTx.id,
                                  description: r.description,
                                  reference_id: form.bill_number
                              }));
                              await supabase.from('ledger_entries').insert(allocLedger);
                          }

                          // C. Reduce Source Deposit Balance (Negative Transaction)
                          // This ensures checkSupplierCredit won't find it again
                          await supabase.from('transactions').insert({
                             company_id: companyId,
                             user_id: user.id,
                             transaction_date: form.bill_date,
                             description: `Used for Invoice ${form.bill_number}`,
                             reference_number: source.ref, // IMPORTANT: Link to Deposit Ref
                             total_amount: -useAmount,     // Negative to reduce balance
                             transaction_type: 'deposit',  // Keep type deposit so it sums correctly
                             status: 'posted',
                             supplier_id: form.supplier_id
                          });

                          remainingToOffset -= useAmount;
                      }

                      // Update Bill Status if fully paid by deposit
                      if (amountToOffset >= totalAmount - 0.01) {
                          await supabase.from('bills').update({ status: 'Paid' }).eq('id', bill.id);
                      } else {
                          await supabase.from('bills').update({ status: 'Partially Paid' }).eq('id', bill.id);
                      }
                      
                      toast({ title: "Deposit Applied", description: `Automatically offset R${amountToOffset.toFixed(2)} from available deposits.` });
                  }
              }
          }
      }

      toast({ title: "Success", description: "Invoice posted successfully" });
      emitDashboardCacheInvalidation(companyId);
      setShowForm(false);
      setForm({
        bill_date: new Date().toISOString().slice(0, 10),
        due_date: "",
        supplier_id: "",
        bill_number: "",
        notes: "",
        items: [{ description: "", quantity: 1, unit_price: 0, tax_rate: isVatRegistered ? 15 : 0, type: 'service' }]
      });
      refreshData(true);

    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadInvoice = async (bill: Bill) => {
    try {
      // 1. Fetch User's Company Details (The "Bill To" entity)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile) return;
      
      const { data: companyData } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single();
        
      // 2. Fetch Supplier Details (The "From" entity)
      const { data: supplierData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', bill.supplier_id)
        .single();

      // 3. Fetch Items
      let itemsData: any[] = [];
      if (bill.source === 'purchase_order') {
         const { data } = await supabase.from('purchase_order_items').select('*').eq('purchase_order_id', bill.id);
         if (data) itemsData = data;
      } else {
         const { data } = await supabase.from('bill_items').select('*').eq('bill_id', bill.id);
         if (data) itemsData = data;
      }
      
      // 4. Prepare Data for PDF Generator
      const invoiceForPDF = {
        invoice_number: bill.bill_number,
        invoice_date: bill.bill_date,
        due_date: bill.due_date,
        customer_name: companyData?.name || 'Our Company',
        customer_email: companyData?.email,
        notes: bill.notes,
        subtotal: bill.subtotal || bill.total_amount, // Fallback if subtotal is missing
        tax_amount: bill.tax_amount || 0,
        total_amount: bill.total_amount,
      };

      const supplierForPDF = {
        name: supplierData?.name || bill.supplier_name || 'Supplier',
        email: supplierData?.email,
        phone: supplierData?.phone,
        address: supplierData?.address,
        tax_number: supplierData?.tax_number,
      };

      const itemsForPDF = itemsData.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate || 0
      }));

      // For Supplier Invoice, we swap roles: 
      // Company arg in buildInvoicePDF -> Supplier (Sender)
      // Invoice.customer_name -> Our Company (Receiver)
      const doc = buildInvoicePDF(invoiceForPDF, itemsForPDF, supplierForPDF);
      
      doc.save(`Supplier_Invoice_${bill.bill_number}.pdf`);
      
    } catch (error) {
      console.error('Download failed', error);
      toast({ title: "Error", description: "Failed to download invoice", variant: "destructive" });
    }
  };

  const filteredBills = bills.filter(bill => {
    const matchesSearch = bill.bill_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (bill.supplier_name || "").toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    if (activeTab === "all") return true;
    return bill.status.toLowerCase() === activeTab;
  });

  const sortedBills = [...filteredBills].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    const aValue = a[sortConfig.key];
    const bValue = b[sortConfig.key];

    if (aValue === bValue) return 0;
    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    const comparison = aValue < bValue ? -1 : 1;
    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });

  // Pagination Logic
  const totalPages = Math.ceil(sortedBills.length / itemsPerPage);
  const paginatedBills = sortedBills.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, sortConfig]);

  const handleSort = (key: keyof Bill) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(sortedBills.map(b => b.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(current => 
      current.includes(id) 
        ? current.filter(i => i !== id)
        : [...current, id]
    );
  };

  const getStatusBadge = (status: string) => {
    let colorClass = "";
    switch (status.toLowerCase()) {
      case "paid":
        colorClass = "bg-[#d1fae5] text-[#065f46]"; // Sage Green
        break;
      case "processed":
        colorClass = "bg-[#dbeafe] text-[#1e40af]"; // Sage Blue
        break;
      case "partially paid":
        colorClass = "bg-[#fef3c7] text-[#92400e]"; // Sage Yellow
        break;
      case "sent":
      case "unpaid":
        colorClass = "bg-[#fee2e2] text-[#991b1b]"; // Sage Red
        break;
      case "overdue":
        colorClass = "bg-[#fee2e2] text-[#991b1b]"; // Sage Red
        break;
      case "returned":
        colorClass = "bg-amber-100 text-amber-800"; // Amber for Returned
        break;
      default:
        colorClass = "bg-[#f3f4f6] text-[#374151]"; // Sage Gray
        break;
    }

    return (
      <div className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
        {status.toUpperCase()}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-2 font-sans text-slate-700">
      {/* Refined Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border shadow-sm">
        {/* Search & Filters */}
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                <Info className="h-5 w-5" />
                <span className="sr-only">Info</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 p-4">
               <div className="space-y-2">
                 <h1 className="text-xl font-bold text-[#111827]">Supplier Invoices</h1>
                 <p className="text-sm text-muted-foreground">
                   Manage and track your supplier invoices and payments.
                 </p>
               </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              className="pl-9 bg-white border-gray-200 focus:border-[#1BA37B] focus:ring-[#1BA37B]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={activeTab} onValueChange={setActiveTab}>
               <SelectTrigger className="w-[180px] bg-white border-gray-200">
                   <div className="flex items-center gap-2">
                       <Filter className="h-4 w-4 text-muted-foreground" />
                       <span className="font-medium text-foreground">{activeTab === 'all' ? 'All Statuses' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span>
                   </div>
               </SelectTrigger>
               <SelectContent>
                   <SelectItem value="all">All Statuses</SelectItem>
                   <SelectItem value="unpaid">Unpaid</SelectItem>
                   <SelectItem value="paid">Paid</SelectItem>
                   <SelectItem value="overdue">Overdue</SelectItem>
                   <SelectItem value="processed">Processed</SelectItem>
               </SelectContent>
           </Select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
           {/* <Button 
          id="AddSupplierInvoiceButton"
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all duration-200 ease-in-out gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>New Invoice</span>
        </Button> */}

          <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />
          
           <Button variant="outline" size="icon" className="h-9 w-9 border-gray-200 hover:bg-gray-50 text-gray-600" onClick={() => refreshData()} title="Refresh">
                <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
           </Button>

           <Button variant="outline" size="icon" className="h-9 w-9 border-gray-200 hover:bg-gray-50 text-gray-600" onClick={() => setImportOpen(true)} title="Import Invoices">
                <Upload className="h-4 w-4" />
           </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 border-gray-200 hover:bg-gray-50 text-gray-600" title="Download">
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toast({ title: "Export", description: "Export to Excel coming soon" })} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast({ title: "Export", description: "Export to PDF coming soon" })} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4" /> Export to PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Batch Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-lg text-emerald-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#1BA37B] text-white text-xs font-medium">
              {selectedIds.length}
            </div>
            <span className="text-sm font-medium">invoices selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="hover:bg-emerald-100 text-emerald-800 hover:text-emerald-900"
              onClick={() => handleSelectAll(false)}
            >
              Cancel
            </Button>
            <div className="h-4 w-px bg-emerald-200 mx-2" />
            <Button 
              variant="ghost" 
              size="sm"
              className="hover:bg-emerald-100 text-emerald-800 hover:text-emerald-900"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="hover:bg-emerald-100 text-emerald-800 hover:text-emerald-900"
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : (
            <div className="relative w-full overflow-auto max-h-[calc(100vh-280px)]">
              <Table>
                <TableHeader className="bg-[#4b5563] text-white hover:bg-[#4b5563]">
                  <TableRow className="hover:bg-[#4b5563] border-none">
                    <TableHead className="w-[40px] pl-4 text-white/90 h-10">
                      <Checkbox 
                        className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-[#4b5563]"
                        checked={sortedBills.length > 0 && selectedIds.length === sortedBills.length}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      />
                    </TableHead>
                    <TableHead className="text-white font-semibold h-10 cursor-pointer" onClick={() => handleSort('supplier_name')}>
                      <div className="flex items-center gap-1">
                        Supplier Name {sortConfig.key === 'supplier_name' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </div>
                    </TableHead>
                    <TableHead className="text-white font-semibold h-10 cursor-pointer" onClick={() => handleSort('bill_number')}>
                      <div className="flex items-center gap-1">
                        Document No {sortConfig.key === 'bill_number' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </div>
                    </TableHead>
                    <TableHead className="text-white font-semibold h-10">Supplier Inv No</TableHead>
                    <TableHead className="text-white font-semibold h-10">Type of Purchase</TableHead>
                    <TableHead className="text-white font-semibold h-10 cursor-pointer" onClick={() => handleSort('bill_date')}>
                      <div className="flex items-center gap-1">
                        Date {sortConfig.key === 'bill_date' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </div>
                    </TableHead>
                    <TableHead className="text-white font-semibold h-10 cursor-pointer" onClick={() => handleSort('due_date')}>
                      <div className="flex items-center gap-1">
                        Due Date {sortConfig.key === 'due_date' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </div>
                    </TableHead>
                    <TableHead className="text-white font-semibold h-10 text-right cursor-pointer" onClick={() => handleSort('total_amount')}>
                      <div className="flex items-center justify-end gap-1">
                        Total {sortConfig.key === 'total_amount' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </div>
                    </TableHead>
                    <TableHead className="text-white font-semibold h-10 text-right cursor-pointer" onClick={() => handleSort('amount_due')}>
                      <div className="flex items-center justify-end gap-1">
                        Amount Due {sortConfig.key === 'amount_due' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                      </div>
                    </TableHead>
                    <TableHead className="text-white font-semibold h-10 text-center w-[80px]">Print</TableHead>
                    <TableHead className="text-white font-semibold h-10 cursor-pointer" onClick={() => handleSort('status')}>
                       <div className="flex items-center gap-1">Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}</div>
                    </TableHead>
                    <TableHead className="text-white font-semibold h-10 text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedBills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                        No invoices found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedBills.map((bill, i) => (
                      <TableRow 
                        key={bill.id} 
                        className={cn(
                           "hover:bg-emerald-50/50",
                           i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                        )}
                      >
                        <TableCell className="pl-4 py-3">
                          <Checkbox 
                            checked={selectedIds.includes(bill.id)}
                            onCheckedChange={() => toggleSelection(bill.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-slate-700 py-3">
                          {bill.supplier_name || "Unknown Supplier"}
                        </TableCell>
                        <TableCell className="text-[#1BA37B] font-medium py-3 cursor-pointer hover:underline" onClick={() => handleDownloadInvoice(bill)}>
                          {bill.bill_number}
                        </TableCell>
                        <TableCell className="text-slate-500 py-3">
                          {bill.bill_number}
                        </TableCell>
                        <TableCell className="text-slate-600 py-3 capitalize">
                          {bill.purchase_type || 'service'}
                        </TableCell>
                        <TableCell className="text-slate-600 py-3">
                          {new Date(bill.bill_date).toLocaleDateString("en-ZA")}
                        </TableCell>
                        <TableCell className="text-slate-600 py-3">
                          {bill.due_date ? new Date(bill.due_date).toLocaleDateString("en-ZA") : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-slate-700 py-3">
                          {bill.total_amount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600 py-3">
                          {bill.amount_due.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })}
                        </TableCell>
                        <TableCell className="text-center py-3">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-[#1BA37B]" onClick={() => handleDownloadInvoice(bill)}>
                            <Printer className="h-4 w-4" />
                          </Button>
                        </TableCell>
                        <TableCell className="py-3">
                           {getStatusBadge(bill.status)}
                        </TableCell>
                        <TableCell className="text-right pr-4 py-3">
                           <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                 <Button variant="ghost" className="h-8 text-[#1BA37B] hover:text-emerald-800 hover:bg-emerald-50 px-2 font-medium text-sm">
                                   Actions <ChevronDown className="ml-1 h-3 w-3" />
                                 </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 shadow-lg border-slate-200">
                                 <DropdownMenuItem onClick={() => handleDownloadInvoice(bill)} className="cursor-pointer text-slate-600 focus:text-emerald-600 focus:bg-emerald-50">
                                    <FileText className="mr-2 h-4 w-4" /> View Invoice
                                 </DropdownMenuItem>
                                 <DropdownMenuItem onClick={() => handleDownloadInvoice(bill)} className="cursor-pointer text-slate-600 focus:text-emerald-600 focus:bg-emerald-50">
                                    <Download className="mr-2 h-4 w-4" /> Download PDF
                                 </DropdownMenuItem>
                                 
                                 <DropdownMenuSeparator />
                                 
                                 {bill.amount_due > 0 && (
                                   <DropdownMenuItem onClick={() => handleMakePayment(bill)} className="cursor-pointer text-emerald-600 font-medium focus:text-emerald-700 focus:bg-emerald-50">
                                      <CreditCard className="mr-2 h-4 w-4" /> Record Payment
                                   </DropdownMenuItem>
                                 )}
                                 
                                 <DropdownMenuItem onClick={() => { setReturnBill(bill); setReturnOpen(true); }} className="cursor-pointer text-amber-600 focus:text-amber-700 focus:bg-amber-50">
                                    <ArrowRightLeft className="mr-2 h-4 w-4" /> Debit Note
                                 </DropdownMenuItem>

                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                                  onClick={() => setDeleteBlockedOpen(true)}
                                >
                                   <Trash2 className="mr-2 h-4 w-4" /> Delete Invoice
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>

              </Table>
            </div>
          )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between pt-4 text-sm text-slate-500">
           <div>
             Displaying {paginatedBills.length} of {sortedBills.length} invoices
           </div>
           <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <div className="text-xs text-muted-foreground bg-slate-100 px-2 py-1 rounded">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
           </div>
        </div>
      )}

      <Dialog open={deleteBlockedOpen} onOpenChange={setDeleteBlockedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-lg font-semibold text-red-600">
              Caution: Invoice cannot be deleted
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Supplier invoices form part of your permanent accounting record and may not be removed once created. 
              To correct an error, capture a debit note or post an appropriate adjusting journal entry instead of attempting to delete the invoice.
            </DialogDescription>
            <p className="mt-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              This safeguard protects your audit trail and statutory compliance.
            </p>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setDeleteBlockedOpen(false)}
              className="bg-red-600 hover:bg-red-700 text-white px-6"
            >
              I understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl max-w-[720px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              {selectedReturnType === 'service' ? 'Create Service Debit Note' : selectedReturnType === 'inventory' ? 'Create Inventory Debit Note' : 'Create Debit Note'}
            </DialogTitle>
            <DialogDescription>
              Create a debit note for invoice {returnBill?.bill_number}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-3">
            <div className="flex items-center gap-2">
              <Button variant={selectedReturnType === 'inventory' ? 'default' : 'outline'} onClick={() => setSelectedReturnType('inventory')}>
                <Box className="h-4 w-4 mr-2" /> Inventory Return
              </Button>
              <Button variant={selectedReturnType === 'service' ? 'default' : 'outline'} onClick={() => setSelectedReturnType('service')}>
                <Briefcase className="h-4 w-4 mr-2" /> Service Return
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-md border p-3 bg-slate-50">
              <div>
                <p className="text-xs text-muted-foreground">Invoice</p>
                <p className="font-medium">{returnBill?.bill_number}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Supplier</p>
                <p className="font-medium">{returnBill?.supplier_name || ''}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-medium">{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(returnBill?.total_amount || 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="font-medium">{new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(returnBill?.amount_due || 0)}</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Debit Note</Label>
              {selectedReturnType === 'inventory' ? (
                <p className="text-sm text-muted-foreground">
                  Inventory returns credit Inventory and reduce Accounts Payable. Returns are not classified to expense.
                </p>
              ) : selectedReturnType === 'service' ? (
                <p className="text-sm text-muted-foreground">
                  Service returns reduce Accounts Payable and credit the selected service expense.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Choose the type of return above to proceed.
                </p>
              )}
            </div>
            {selectedReturnType === 'service' && (
              <div className="grid gap-2">
                <Label>Select Service Line</Label>
                <Select value={selectedServiceIndex !== null ? String(selectedServiceIndex) : ""} onValueChange={(v) => {
                  const idx = parseInt(v, 10);
                  setSelectedServiceIndex(isNaN(idx) ? null : idx);
                  const item = filteredReturnItems[isNaN(idx) ? 0 : idx];
                  const acc = (item as any)?.expense_account_id;
                  if (acc) setSelectedCreditAccountId(acc);
                }}>
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Choose service line..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredReturnItems.map((it, idx) => (
                      <SelectItem key={idx} value={String(idx)}>{it.description}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedServiceIndex !== null && (
                  <div className="text-xs text-muted-foreground">
                    Amount limit is the service line total including tax.
                  </div>
                )}
              </div>
            )}
            
            {filteredReturnItems.length > 0 && selectedReturnType === 'inventory' && (
               <div className="border rounded-md max-h-[160px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-2 h-8">Item</TableHead>
                        <TableHead className="py-2 h-8 text-right">Price</TableHead>
                        <TableHead className="py-2 h-8 text-right">Qty</TableHead>
                        {selectedReturnType === 'inventory' && (
                          <TableHead className="py-2 h-8 text-right">Units on Hand</TableHead>
                        )}
                        <TableHead className="py-2 h-8 text-right">Return</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReturnItems.map((item, idx) => (
                        <TableRow 
                          key={idx} 
                          className={cn("border-b", idx % 2 === 0 ? "bg-white" : "bg-gray-50/30")}
                        >
                          <TableCell className="py-2 text-sm">{item.description}</TableCell>
                          <TableCell className="py-2 text-right text-sm">{item.unit_price.toFixed(2)}</TableCell>
                          <TableCell className="py-2 text-right text-sm">{item.quantity}</TableCell>
                          {selectedReturnType === 'inventory' && (
                            <TableCell className="py-2 text-right text-sm">
                              {inventoryUnits[item.description] ?? '—'}
                            </TableCell>
                          )}
                          <TableCell className="py-2 text-right">
                            <Input
                              type="number"
                            className="h-7 w-24 text-right ml-auto"
                              min="0"
                              max={selectedReturnType === 'inventory' ? Math.min(item.quantity, inventoryUnits[item.description] ?? item.quantity) : item.quantity}
                              value={returnQuantities[idx] || ""}
                              onChange={(e) => {
                              const raw = parseInt(e.target.value) || 0;
                              const allowedMax = selectedReturnType === 'inventory' ? Math.min(item.quantity, inventoryUnits[item.description] ?? item.quantity) : item.quantity;
                              if (raw > allowedMax) {
                                const hand = inventoryUnits[item.description];
                                const msg = selectedReturnType === 'inventory' && hand !== undefined
                                  ? `You cannot return more than ${allowedMax} units (on hand: ${hand}, invoiced: ${item.quantity}) for "${item.description}".`
                                  : `You cannot return more than ${allowedMax} units for "${item.description}".`;
                                setOverLimitMessage(msg);
                                setOverLimitOpen(true);
                                const val = allowedMax;
                                setReturnQuantities(prev => ({ ...prev, [idx]: val }));
                              } else if (raw < 0) {
                                setReturnQuantities(prev => ({ ...prev, [idx]: 0 }));
                              } else {
                                setReturnQuantities(prev => ({ ...prev, [idx]: raw }));
                              }
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
               </div>
            )}

            <div className="grid gap-2">
              <Label>Return Amount</Label>
              <Input
                type="number"
                value={returnAmount}
                onChange={(e) => setReturnAmount(e.target.value)}
                placeholder="0.00"
                readOnly={selectedReturnType === 'inventory' && !overrideAmount}
                className={selectedReturnType === 'inventory' && !overrideAmount ? "bg-gray-100" : ""}
              />
              {selectedReturnType === 'inventory' && (
                <div className="flex items-center gap-2">
                  <Checkbox checked={overrideAmount} onCheckedChange={(v: boolean) => setOverrideAmount(v)} />
                  <span className="text-sm text-muted-foreground">Override total amount</span>
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input
                value={returnDescription}
                onChange={(e) => setReturnDescription(e.target.value)}
                placeholder="Reason for return"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateReturn} disabled={isReturning} className="bg-amber-600 hover:bg-amber-700">
              {isReturning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Debit Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={overLimitOpen} onOpenChange={setOverLimitOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Return Quantity Exceeds Limit</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-slate-700">
            {overLimitMessage}
          </div>
          <DialogFooter>
            <Button onClick={() => setOverLimitOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-emerald-600 flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Make Payment
            </DialogTitle>
            <DialogDescription>
              Record a payment for {payOrder?.bill_number}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Bank Account</Label>
              <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Bank Account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-sm text-muted-foreground">
                Outstanding: {payOrder ? new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Math.max(0, payOrder.total_amount - paidSoFar)) : '0.00'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} disabled={isProcessingPayment}>Cancel</Button>
            <Button onClick={confirmPayment} disabled={isProcessingPayment} className="bg-emerald-600 hover:bg-emerald-700">
              {isProcessingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isProcessingPayment ? "Processing..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Available Credit Found</DialogTitle>
            <DialogDescription>
              This supplier has an available credit balance of R{availableCredit.toFixed(2)}.
              Would you like to use this credit to pay for the invoice?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
             <div className="flex justify-between">
                <span>Total Amount to Pay:</span>
                <span className="font-bold">R{pendingPayment?.amt.toFixed(2)}</span>
             </div>
             <div className="flex justify-between text-green-600">
                <span>Credit to Apply:</span>
                <span className="font-bold">- R{Math.min(availableCredit, pendingPayment?.amt || 0).toFixed(2)}</span>
             </div>
             <div className="flex justify-between border-t pt-2">
                <span>Remaining to Pay (Bank):</span>
                <span className="font-bold">R{Math.max(0, (pendingPayment?.amt || 0) - availableCredit).toFixed(2)}</span>
             </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditDialogOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={async () => {
                 if (!pendingPayment || !payOrder) return;
                 try {
                     await transactionsApi.postPurchasePaidClient(
                        { ...payOrder, po_number: payOrder.bill_number },
                        payDate,
                        selectedBankId,
                        pendingPayment.amt
                     );
                     toast({ title: "Success", description: "Payment recorded successfully (Credit skipped)" });
                     setCreditDialogOpen(false);
                     refreshData(true);
                 } catch(e: any) {
                     toast({ title: "Error", description: e.message, variant: "destructive" });
                 }
            }}>Skip Credit</Button>
            <Button onClick={handleApplyCredit} disabled={isApplyingCredit}>
              {isApplyingCredit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Use Credit & Pay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Supplier Invoice</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Supplier</Label>
                <Select
                  value={form.supplier_id}
                  onValueChange={(val) => setForm({ ...form, supplier_id: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Bill Number</Label>
                <Input
                  value={form.bill_number}
                  onChange={(e) => setForm({ ...form, bill_number: e.target.value })}
                  placeholder="INV-001"
                />
              </div>
              <div className="grid gap-2">
                <Label>Bill Date</Label>
                <Input
                  type="date"
                  value={form.bill_date}
                  onChange={(e) => setForm({ ...form, bill_date: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-semibold">Line Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm({
                    ...form,
                    items: [...form.items, { type: 'service', description: "", quantity: 1, unit_price: 0, tax_rate: isVatRegistered ? 15 : 0 }]
                  })}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Item
                </Button>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[15%]">Type</TableHead>
                    <TableHead className="w-[35%]">Item / Description</TableHead>
                    <TableHead className="w-[10%]">Qty</TableHead>
                    <TableHead className="w-[15%]">Unit Price</TableHead>
                    <TableHead className="w-[15%]">Tax %</TableHead>
                    <TableHead className="w-[10%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.items.map((item, index) => (
                    <TableRow 
                      key={index}
                      className={index % 2 === 0 ? "bg-white" : "bg-gray-50/30"}
                    >
                      <TableCell>
                         <Select 
                           value={item.type || 'service'} 
                           onValueChange={(val: 'service' | 'inventory') => {
                              const newItems = [...form.items];
                              newItems[index].type = val;
                              newItems[index].product_id = undefined;
                              newItems[index].description = "";
                              newItems[index].unit_price = 0;
                              setForm({ ...form, items: newItems });
                           }}
                         >
                           <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                           <SelectContent>
                             <SelectItem value="service">Service</SelectItem>
                             <SelectItem value="inventory">Inventory</SelectItem>
                           </SelectContent>
                         </Select>
                      </TableCell>
                      <TableCell>
                        {item.type === 'inventory' ? (
                           <Select
                             value={item.product_id}
                             onValueChange={(val) => {
                               const product = products.find(p => p.id === val);
                               const newItems = [...form.items];
                               newItems[index].product_id = val;
                               if (product) {
                                  newItems[index].description = product.name;
                                  newItems[index].unit_price = Number(product.cost_price || 0);
                               }
                               setForm({ ...form, items: newItems });
                             }}
                           >
                             <SelectTrigger className="h-9"><SelectValue placeholder="Select Product" /></SelectTrigger>
                             <SelectContent>
                               {products.map(p => (
                                 <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                        ) : (
                           <Input
                             value={item.description}
                             onChange={(e) => {
                               const newItems = [...form.items];
                               newItems[index].description = e.target.value;
                               setForm({ ...form, items: newItems });
                             }}
                             placeholder="Item description"
                             className="h-9"
                           />
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...form.items];
                            newItems[index].quantity = parseFloat(e.target.value) || 0;
                            setForm({ ...form, items: newItems });
                          }}
                          className="h-9"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          id={index === 0 ? "InvoiceTotalInput" : undefined}
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => {
                            const newItems = [...form.items];
                            newItems[index].unit_price = parseFloat(e.target.value) || 0;
                            setForm({ ...form, items: newItems });
                          }}
                          className="h-9"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Input
                            type="number"
                            value={item.tax_rate}
                            onChange={(e) => {
                              const newItems = [...form.items];
                              newItems[index].tax_rate = parseFloat(e.target.value) || 0;
                              setForm({ ...form, items: newItems });
                            }}
                            disabled={!isVatRegistered}
                            className={!isVatRegistered ? "bg-gray-100 text-gray-500 pr-8" : ""}
                          />
                          {!isVatRegistered && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                              <Lock className="h-3 w-3 text-gray-400" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const newItems = form.items.filter((_, i) => i !== index);
                            setForm({ ...form, items: newItems });
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button id="SaveSupplierInvoiceButton" onClick={handleCreateInvoice} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDateWarning} onOpenChange={setShowDateWarning}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <History className="h-5 w-5" />
              Check the dates
            </DialogTitle>
            <DialogDescription className="pt-2 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              It looks like the payment date you selected is <strong>before</strong> the invoice date.
              <br /><br />
              Usually, a payment happens after or on the same day as the invoice. Please double-check the dates to make sure everything is accurate.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button onClick={() => setShowDateWarning(false)} className="w-full sm:w-auto">
              Okay, let me fix that
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FinancialYearLockDialog 
        open={isLockDialogOpen} 
        onOpenChange={setIsLockDialogOpen} 
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Import Supplier Invoices</DialogTitle>
            <DialogDescription>Upload a CSV file to import invoices.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div 
               className={cn(
                 "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer",
                 isDragActive ? "border-[#1BA37B] bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
               )}
               onDragOver={handleDragOver}
               onDragLeave={handleDragLeave}
               onDrop={handleDrop}
               onClick={() => document.getElementById('invoice-csv-upload')?.click()}
            >
               <Upload className={cn("h-8 w-8 mb-2", isDragActive ? "text-[#1BA37B]" : "text-slate-400")} />
               <p className={cn("text-sm mb-1", isDragActive ? "text-emerald-700 font-medium" : "text-slate-600")}>
                 {isDragActive ? "Drop CSV file here" : "Drag and drop your CSV file here or click to browse"}
               </p>
               <Input 
                 type="file" 
                 accept=".csv" 
                 className="hidden" 
                 id="invoice-csv-upload"
                 onChange={(e) => setImportFile(e.target.files?.[0] || null)}
               />
               <Button variant="secondary" size="sm" className="mt-2 pointer-events-none">
                 Select File
               </Button>
               {importFile && (
                 <div className="mt-2 text-sm text-emerald-600 font-medium flex items-center">
                   <FileText className="h-4 w-4 mr-1" />
                   {importFile.name}
                 </div>
               )}
            </div>

            <div className="bg-slate-50 p-3 rounded-md text-xs text-slate-600 space-y-1">
               <p className="font-medium">Required CSV Headers:</p>
               <p>Supplier Name, Document No, Date, Amount</p>
               <p className="font-medium mt-2">Optional Headers:</p>
               <p>Due Date, Description</p>
            </div>

            {importLogs.length > 0 && (
                <div className="bg-slate-900 text-slate-50 p-3 rounded-md text-xs font-mono h-32 overflow-y-auto">
                    {importLogs.map((log, i) => (
                        <div key={i} className={log.includes('Error') ? 'text-red-400' : log.includes('Success') ? 'text-emerald-400' : ''}>
                            {log}
                        </div>
                    ))}
                </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={isImporting}>Cancel</Button>
            <Button onClick={handleImportInvoices} disabled={!importFile || isImporting}>
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              {isImporting ? 'Importing...' : 'Start Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
