import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Trash2, FileText, Download, Search, MoreHorizontal, Calendar, Filter, Send, CreditCard, History, Upload, Loader2, AlertTriangle, Box, Briefcase, Building, ChevronUp, ChevronDown, CheckCircle2, RefreshCw, FileSpreadsheet, Info, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { transactionsApi } from "@/lib/transactions-api";
import { TransactionFormEnhanced } from "@/components/Transactions/TransactionFormEnhanced";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { useAuth } from "@/context/useAuth"; // Ensure this import is present
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Supplier {
  id: string;
  name: string;
  address?: string | null;
  tax_number?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface POItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  amount: number;
  expense_account_id?: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  po_date: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  supplier_id: string;
  notes?: string;
  suppliers?: { name: string };
  supplierName?: string;
  supplierEmail?: string;
  purchase_type?: 'inventory' | 'service';
}

export const PurchaseOrdersManagement = () => {
  const [searchParams] = useSearchParams();
  
  // UI State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'po_date', direction: 'desc' });
  // Move user declaration here to fix the ReferenceError
  const { user } = useAuth(); // Import useAuth
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompany() {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    }
    fetchCompany();
  }, [user]);

  useEffect(() => {
    const loadCompanyBrand = async () => {
      if (!companyId) return;
      const { data } = await supabase.from("companies").select("name, logo_url").eq("id", companyId).maybeSingle();
      if (data) {
        setCompanyLogoUrl(data.logo_url || null);
        setCompanyName(data.name || "");
      }
    };
    loadCompanyBrand();
  }, [companyId]);

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [viewFilter, setViewFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState<boolean>(false);

  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (searchParams.get("action") === "create-po") {
      setShowForm(true);
      const supId = searchParams.get("supplierId");
      if (supId) {
         setForm(prev => ({ ...prev, supplier_id: supId }));
      }
    }
  }, [searchParams]);

  const [sentLoading, setSentLoading] = useState<string | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payOrder, setPayOrder] = useState<PurchaseOrder | null>(null);
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState<string>("");
  const [paidSoFar, setPaidSoFar] = useState<number>(0);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; account_name: string }>>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Array<{ id: string; account_name: string; account_code: string }>>([]);
  const [selectedBankId, setSelectedBankId] = useState<string>("");
  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);

  // Credit Balance Logic State
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [availableCredit, setAvailableCredit] = useState<number>(0);
  const [creditSources, setCreditSources] = useState<any[]>([]);
  const [pendingPayment, setPendingPayment] = useState<{ amt: number; outstanding: number } | null>(null);
  const [isApplyingCredit, setIsApplyingCredit] = useState(false);

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

     const allBills = [
        ...(bills || []).map(b => ({ ref: b.bill_number, total: Number(b.total_amount) })),
        ...(pos || []).map(p => ({ ref: p.po_number, total: Number(p.total_amount) }))
     ];
     
     if (allBills.length === 0) return { total: 0, sources: [] };

     const refs = allBills.map(b => b.ref);
     
   const txsQuery = await supabase
      .from('transactions' as any)
      .select('reference_number, total_amount, transaction_type' as any)
      .eq('company_id', companyId)
      .in('reference_number', refs);
    const txs: any[] = ((txsQuery as any)?.data as any[]) || [];

   const depositsQuery = await supabase
      .from('transactions' as any)
      .select('reference_number, total_amount, transaction_type' as any)
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .eq('transaction_type', 'deposit')
      .eq('status', 'posted');
    const deposits: any[] = ((depositsQuery as any)?.data as any[]) || [];

     // Combine deposit refs into our check list if needed, or handle separately
     const depositRefs = (deposits || []).map(d => d.reference_number);
     if (depositRefs.length > 0) {
      const depositTxsQuery = await supabase
          .from('transactions' as any)
          .select('reference_number, total_amount, transaction_type' as any)
          .eq('company_id', companyId)
          .in('reference_number', depositRefs);
      const depositTxs: any[] = ((depositTxsQuery as any)?.data as any[]) || [];
      if (depositTxs.length > 0) {
          txs.push(...depositTxs);
      }
     }
       
     const sources: any[] = [];
     let totalCredit = 0;
     
     allBills.forEach(bill => {
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
        const uniqueDepositRefs = Array.from(new Set(depositRefs));
        uniqueDepositRefs.forEach(ref => {
            if (!ref) return;
            const dTxs = (txs || []).filter(t => t.reference_number === ref);
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

         // Ensure Deposit Asset Account exists (Code 1430)
         let depositAssetId = accountsList?.find(a => a.account_code === '1430')?.id;
         if (!depositAssetId) {
             const { data: created } = await supabase.from('chart_of_accounts').insert({
                 company_id: companyId,
                 account_code: '1430',
                 account_name: 'Deposits Paid',
                 account_type: 'asset',
                 is_active: true
             }).select('id').single();
             depositAssetId = created?.id;
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
                 reference_number: payOrder.po_number,
                 total_amount: useAmount,
                 transaction_type: 'payment',
                 status: 'posted'
             }).select().single();
             
             if (tx1Error) throw tx1Error;

             // Determine Credit Account (Source)
             // If source is a Deposit, Credit Deposit Asset (1430)
             // If source is a Surplus Payment/Refund, Credit AP (Liability)
             let creditAccountId = apId;
             if (source.type === 'deposit' && depositAssetId) {
                 creditAccountId = depositAssetId;
             }

             await supabase.from('ledger_entries').insert([
                 {
                     company_id: companyId,
                     transaction_id: tx1.id,
                     account_id: apId,
                     debit: useAmount,
                     credit: 0,
                     entry_date: payDate,
                     description: `Credit applied from ${source.ref}`,
                     reference_id: payOrder.po_number
                 },
                 {
                     company_id: companyId,
                     transaction_id: tx1.id,
                     account_id: creditAccountId,
                     debit: 0,
                     credit: useAmount,
                     entry_date: payDate,
                     description: `Credit Source: ${source.ref}`,
                     reference_id: source.ref
                 }
             ]);
             
             // 2. Reduce Source Credit
             await supabase.from('transactions').insert({
                 company_id: companyId,
                 user_id: user.id,
                 transaction_date: payDate,
                 description: `Credit used for ${payOrder.po_number}`,
                 reference_number: source.ref,
                 total_amount: -useAmount,
                 transaction_type: source.type,
                 status: 'posted'
             });

             remainingToPay -= useAmount;
             creditUsedTotal += useAmount;
         }
         
         // 3. Pay remaining with Bank
         if (remainingToPay > 0.01) {
             await transactionsApi.postPurchasePaidClient(
                payOrder,
                payDate,
                selectedBankId,
                remainingToPay
             );
         }
         
         // Update Status
         const { error } = await supabase
            .from("purchase_orders")
            .update({ status: (creditUsedTotal + remainingToPay >= (payOrder.total_amount || 0) - paidSoFar ? "paid" : "partially_paid") }) // Simple logic, assumes full payment if amount matches
            .eq("id", payOrder.id);
            
         // Actually, better to check total paid
         const newPaid = paidSoFar + creditUsedTotal + remainingToPay;
         const fullySettled = newPaid >= (payOrder.total_amount || 0) - 0.01;
         
         await supabase
            .from("purchase_orders")
            .update({ status: fullySettled ? "paid" : "partially_paid" })
            .eq("id", payOrder.id);

         setOrders(prev => prev.map(o => o.id === payOrder.id ? { ...o, status: fullySettled ? "paid" : "partially_paid" } : o));
         setPaidMap(prev => ({ ...prev, [payOrder.po_number]: newPaid }));

         toast({ title: "Success", description: `Credit applied: R${creditUsedTotal.toFixed(2)}. Paid from Bank: R${remainingToPay.toFixed(2)}` });
         setCreditDialogOpen(false);
         setPayDialogOpen(false);
         // refresh(true); // Optional
      } catch (e: any) {
         console.error(e);
         toast({ title: "Error", description: e.message, variant: "destructive" });
      } finally {
         setIsApplyingCredit(false);
      }
  };

  const { toast } = useToast();
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalEditData, setJournalEditData] = useState<any>(null);
  const [poSentDialogOpen, setPoSentDialogOpen] = useState(false);
  const [poSentOrder, setPoSentOrder] = useState<PurchaseOrder | null>(null);
  const [poSentDate, setPoSentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [poSentIncludeVAT, setPoSentIncludeVAT] = useState<boolean>(true);

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");

  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [poToAdjust, setPoToAdjust] = useState<PurchaseOrder | null>(null);
  const [adjustReason, setAdjustReason] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  
  // Type Selection State
  const [purchaseType, setPurchaseType] = useState<'product' | 'service' | 'asset'>('product');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [paidMap, setPaidMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const isSyncing = false;

  const fetchOrders = useCallback(async () => {
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
        
        const [suppliersData, ordersData] = await Promise.all([
          supabase.from("suppliers").select("id, name, address, tax_number, phone, email").eq("company_id", cid).order("name"),
          supabase.from("purchase_orders").select("id, po_number, po_date, status, subtotal, tax_amount, total_amount, supplier_id, company_id").eq("company_id", cid).order("po_date", { ascending: false })
        ]);
        
        if (suppliersData.error) throw suppliersData.error;
        if (ordersData.error) throw ordersData.error;
        
        const suppliersList = (suppliersData.data || []) as Supplier[];
        const supplierNameMap = new Map(suppliersList.map(s => [s.id, s.name]));
        
        const mappedOrders = (ordersData.data || []).map((order: any) => ({
          ...order,
          supplierName: supplierNameMap.get(order.supplier_id) || "N/A",
        })) as PurchaseOrder[];
        
        const orderIds = mappedOrders.map(o => o.id);
        let poTypeMap: Record<string, 'inventory' | 'service'> = {};
        if (orderIds.length > 0) {
          const { data: poItems } = await supabase
            .from('purchase_order_items')
            .select('purchase_order_id, expense_account_id')
            .in('purchase_order_id', orderIds);
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

        const poNumbers = mappedOrders.map(o => o.po_number).filter(Boolean);
        let paidMapData: Record<string, number> = {};
        
        if (poNumbers.length > 0) {
          const { data: payments } = await supabase
            .from('transactions')
            .select('reference_number,total_amount,transaction_type,status')
            .in('reference_number', poNumbers)
            .eq('transaction_type', 'payment')
            .eq('status', 'posted');
            
          (payments || []).forEach((p: any) => {
            const ref = String(p.reference_number || '');
            paidMapData[ref] = (paidMapData[ref] || 0) + Number(p.total_amount || 0);
          });
        }
        
        setOrders(mappedOrders.map(o => ({ ...o, purchase_type: poTypeMap[o.id] || 'service' })));
        setSuppliers(suppliersList);
        setPaidMap(paidMapData);
    } catch (error: any) {
        console.error("Error fetching orders:", error);
        toast({ title: "Error", description: "Failed to load orders", variant: "destructive" });
    } finally {
        setLoading(false);
    }
  }, [user, companyId, toast]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);
  
  const refresh = async (force?: boolean) => {
    await fetchOrders();
  };

  const [viewLoading, setViewLoading] = useState(false);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, sortConfig]);

  // Manual refresh handler that forces update
  const handleRefresh = () => refresh(true);

  // Bank accounts need to be fetched separately or added to fetcher?
  // They are used in payment dialog. Let's keep them separate or add to fetcher if critical.
  // They are only needed when payment dialog opens.
  useEffect(() => {
     // Fetch bank accounts when component mounts (or when dialog opens)
     const loadBanks = async () => {
       const { data: { user } } = await supabase.auth.getUser();
       if(!user) return;
       const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
       if(!profile?.company_id) return;
       const { data: banks } = await supabase
         .from("chart_of_accounts")
         .select("id, account_name")
         .eq("company_id", profile.company_id)
         .eq("account_type", "Asset")
         .ilike("account_name", "%Bank%");
       setBankAccounts(banks || []);

        const { data: allAccounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_name, account_code, account_type, is_active")
          .eq("company_id", profile.company_id)
          .eq("is_active", true);
        const lower = (allAccounts || []).map(a => ({
          id: String(a.id),
          account_name: String(a.account_name || ''),
          account_code: String(a.account_code || ''),
          account_type: String(a.account_type || '').toLowerCase()
        }));
        const expenseTypes = new Set(['expense','cost of goods sold','cost of sales','cogs']);
        const expensesOnly = lower.filter(a => expenseTypes.has(a.account_type));
        setExpenseAccounts(expensesOnly.length > 0 ? expensesOnly : lower);
     };
     loadBanks();
  }, []);

  const handleSort = (key: string) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getStatusBadge = (status: string) => {
    let colorClass = "";
    switch (status.toLowerCase()) {
      case "paid": colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200"; break;
      case "sent": colorClass = "bg-blue-50 text-blue-700 border-blue-200"; break;
      case "placed order":
      case "open": colorClass = "bg-orange-50 text-orange-700 border-orange-200"; break;
      case "cancelled": colorClass = "bg-gray-50 text-gray-600 border-gray-200"; break;
      default: colorClass = "bg-gray-50 text-gray-600 border-gray-200";
    }
    
    return (
      <Badge variant="outline" className={`${colorClass} rounded-full font-medium text-[11px] px-2.5 py-0.5 h-6 border`}>
        {status === "placed order" ? "PLACED ORDER" : status.toUpperCase()}
      </Badge>
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredOrders.map(o => o.id));
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

  const [form, setForm] = useState({
    po_date: new Date().toISOString().slice(0, 10),
    supplier_id: "",
    notes: "",
    items: [{ description: "", quantity: 1, unit_price: 0, tax_rate: 15, expense_account_id: "" }]
  });

  const selectedSupplier = useMemo(() => suppliers.find(s => s.id === form.supplier_id), [suppliers, form.supplier_id]);

  const AccountCombobox = ({ accounts, value, onChange, placeholder = "Select account..." }: { accounts: Array<{ id: string; account_name: string; account_code: string }>; value: string; onChange: (v: string) => void; placeholder?: string }) => {
    const [open, setOpen] = useState(false);
    const selectedAccount = accounts.find(a => String(a.id) === String(value));
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" role="combobox" aria-expanded={open} className="w-full justify-between hover:bg-muted/50 font-normal h-8 text-left text-xs">
            {selectedAccount ? (
              <span className="truncate flex items-center gap-2">
                <span className="font-mono font-medium text-primary bg-primary/10 px-1 py-0.5 rounded text-[10px]">{selectedAccount.account_code}</span>
                <span className="truncate">{selectedAccount.account_name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 z-[2000]" align="start">
          <Command>
            <CommandInput placeholder="Search account code or name..." />
            <CommandList className="max-h-[300px] overflow-y-auto">
              <CommandEmpty>No account found.</CommandEmpty>
              <CommandGroup>
                {accounts.map(acc => (
                  <CommandItem
                    key={acc.id}
                    value={`${acc.account_code} ${acc.account_name}`}
                    onSelect={() => { onChange(acc.id); setOpen(false); }}
                    className="cursor-pointer text-sm"
                  >
                    <Check className={cn("mr-2 h-4 w-4", String(value) === String(acc.id) ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono text-muted-foreground mr-2 w-16">{acc.account_code}</span>
                    <span className="flex-1 truncate">{acc.account_name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const handleViewOrder = async (order: PurchaseOrder) => {
    try {
      setViewLoading(true);
      const { data: items, error } = await supabase
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", order.id);

      if (error) throw error;

      // Try to detect purchase type from first item match in inventory
      let detectedType: 'product' | 'service' | 'asset' = 'product';
      if (items && items.length > 0) {
         const firstDesc = items[0].description;
         const { data: existingItem } = await supabase
           .from("items")
           .select("item_type")
           .eq("company_id", (order as any).company_id || (suppliers.find(s=>s.id === order.supplier_id) as any)?.company_id) // best effort
           .eq("name", firstDesc)
           .maybeSingle();
         
         if (existingItem?.item_type) {
            detectedType = existingItem.item_type as any;
         } else {
            // Heuristic: if quantity is 1 for all items, maybe service? 
            // But products can be 1 too. Default to product.
         }
      }

      setForm({
        po_date: order.po_date,
        supplier_id: order.supplier_id,
        notes: order.notes || "",
        items: items.map(i => ({
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          tax_rate: i.tax_rate,
          expense_account_id: (i as any).expense_account_id || ""
        }))
      });

      setEditingId(order.id);
      setPurchaseType(detectedType);
      setShowForm(true);
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to load order details", variant: "destructive" });
    } finally {
      setViewLoading(false);
    }
  };


  // Data loading logic replaced by direct Supabase fetching


  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.supplierName && order.supplierName.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesDate = 
        (!startDate || order.po_date >= startDate) &&
        (!endDate || order.po_date <= endDate);

      let matchesStatus = true;
      if (viewFilter === 'open') {
         matchesStatus = order.status === 'open' || order.status === 'placed order';
      } else if (viewFilter === 'overdue') {
         // Simple overdue check: if open/placed and date is past due (assuming 30 days for now or just if it's old)
         // For now let's just match 'overdue' status if it exists, or logic
         matchesStatus = order.status === 'overdue'; 
      }

      return matchesSearch && matchesDate && matchesStatus;
    });
  }, [orders, searchTerm, startDate, endDate, viewFilter]);

  const sortedOrders = useMemo(() => {
    const sorted = [...filteredOrders];
    if (!sortConfig.key) return sorted;

    sorted.sort((a: any, b: any) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      // Handle specific fields
      if (sortConfig.key === 'supplierName') {
        aValue = a.supplierName || '';
        bValue = b.supplierName || '';
      }
      
      if (typeof aValue === 'string') aValue = aValue.toLowerCase();
      if (typeof bValue === 'string') bValue = bValue.toLowerCase();

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredOrders, sortConfig]);

  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
  const paginatedOrders = useMemo(() => {
    return sortedOrders.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [sortedOrders, currentPage, itemsPerPage]);

  const addItem = () => {
    setForm({
      ...form,
      items: [...form.items, { description: "", quantity: 1, unit_price: 0, tax_rate: 15, expense_account_id: "" }]
    });
  };

  const removeItem = (index: number) => {
    const newItems = form.items.filter((_, i) => i !== index);
    setForm({ ...form, items: newItems });
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...form.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setForm({ ...form, items: newItems });
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;

    form.items.forEach(item => {
      const amount = item.quantity * item.unit_price;
      subtotal += amount;
      taxAmount += amount * (item.tax_rate / 100);
    });

    return { subtotal, taxAmount, total: subtotal + taxAmount };
  };

  const handleSubmit = async () => {
    if (isDateLocked(form.po_date)) {
      setShowForm(false);
      setIsLockDialogOpen(true);
      return;
    }

    try {
      if (!form.supplier_id || form.items.length === 0) {
        toast({ title: "Missing fields", description: "Please select supplier and add items", variant: "destructive" });
        return;
      }

      const invalid = form.items.some(it => !String(it.description || '').trim() || Number(it.quantity || 0) <= 0 || Number(it.unit_price || 0) < 0);
      if (invalid) {
        toast({ title: "Invalid Items", description: "Each item needs a name, quantity > 0 and non-negative price", variant: "destructive" });
        return;
      }

      if (editingId) {
        const existingOrder = orders.find(o => o.id === editingId);
        if (existingOrder && existingOrder.status !== 'placed order' && existingOrder.status !== 'open') {
          toast({ title: "Cannot Edit", description: "Only 'Placed Order' status can be edited.", variant: "destructive" });
          return;
        }
      }

      setIsSubmitting(true);
      setShowForm(false);
      setProgress(10);
      setProgressText("Validating order details...");
      await new Promise(resolve => setTimeout(resolve, 500));

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("No profile found");

      setProgress(30);
      setProgressText("Calculating totals and taxes...");
      await new Promise(resolve => setTimeout(resolve, 500));

      const totals = calculateTotals();
      
      let poId = editingId;
      let poNumber = "";

      if (editingId) {
        setProgress(50);
        setProgressText("Updating purchase order...");
        
        const { data: po, error: poError } = await supabase
          .from("purchase_orders")
          .update({
            supplier_id: form.supplier_id,
            po_date: form.po_date,
            subtotal: totals.subtotal,
            tax_amount: totals.taxAmount,
            total_amount: totals.total,
            notes: form.notes || null
          })
          .eq("id", editingId)
          .select()
          .single();
          
        if (poError) throw poError;
        poId = po.id;
        poNumber = po.po_number;
        
        await supabase.from("purchase_order_items").delete().eq("purchase_order_id", poId);
      } else {
        poNumber = `PO-${Date.now()}`;
        setProgress(50);
        setProgressText("Creating purchase order record...");

        const { data: po, error: poError } = await supabase
          .from("purchase_orders")
          .insert({
            company_id: profile.company_id,
            supplier_id: form.supplier_id,
            po_number: poNumber,
            po_date: form.po_date,
            subtotal: totals.subtotal,
            tax_amount: totals.taxAmount,
            total_amount: totals.total,
            notes: form.notes || null,
            status: "placed order"
          })
          .select()
          .single();

        if (poError) throw poError;
        poId = po.id;
      }

      if (!poId) throw new Error("Failed to save order");

      setProgress(70);
      setProgressText("Saving line items...");

      const items = form.items.map(item => ({
        purchase_order_id: poId,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        amount: item.quantity * item.unit_price * (1 + item.tax_rate / 100),
        expense_account_id: item.expense_account_id || null
      }));

      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(items);

      if (itemsError) throw itemsError;

      setProgress(90);
      setProgressText("Updating product inventory...");
      await new Promise(resolve => setTimeout(resolve, 300));

      try {
        const { data: existingItems } = await supabase
          .from("items")
          .select("id,name")
          .eq("company_id", profile.company_id)
          .eq("item_type", purchaseType);

        const existingSet = new Set<string>((existingItems || []).map((it: any) => String(it.name || '').trim().toLowerCase()));
        const toInsert: any[] = [];

        for (const poi of items) {
          const nameKey = String((poi as any).description || '').trim().toLowerCase();
          if (!nameKey) continue;
          if (existingSet.has(nameKey)) {
            await supabase
              .from("items")
              .update({ cost_price: Number((poi as any).unit_price || 0) })
              .eq("company_id", profile.company_id)
              .eq("item_type", purchaseType)
              .eq("name", String((poi as any).description || '').trim());
          } else {
            toInsert.push({
              company_id: profile.company_id,
              name: String((poi as any).description || '').trim(),
              description: String((poi as any).description || '').trim(),
              item_type: purchaseType,
              unit_price: Number((poi as any).unit_price || 0),
              cost_price: Number((poi as any).unit_price || 0),
              quantity_on_hand: 0
            });
          }
        }

        if (toInsert.length > 0) {
          const { error: insErr } = await supabase.from("items").insert(toInsert);
          if (insErr) throw insErr;
        }
        
      } catch (syncErr: any) {
        console.error("PO products sync error:", syncErr);
        toast({ title: "Product Sync Failed", description: String(syncErr?.message || syncErr), variant: "destructive" });
      }

      setProgress(100);
      setProgressText("Finalizing...");
      await new Promise(resolve => setTimeout(resolve, 500));

      toast({ title: "Success", description: editingId ? "Purchase order updated successfully" : "Purchase order created successfully" });
      
      await refresh(true);
      
      setForm({
        po_date: new Date().toISOString().slice(0, 10),
        supplier_id: "",
        notes: "",
        items: [{ description: "", quantity: 1, unit_price: 0, tax_rate: 15, expense_account_id: "" }]
      });
      setEditingId(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustment = async () => {
    if (!poToAdjust) return;
    const today = new Date().toISOString().split('T')[0];
    if (isDateLocked(today)) {
      setAdjustmentOpen(false);
      setIsLockDialogOpen(true);
      return;
    }
    if (!adjustReason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for the adjustment.", variant: "destructive" });
      return;
    }

    setIsAdjusting(true);
    try {
      // 1. Find original transactions linked to this PO
      const reversalEntries: any[] = [];
      let originalTxIds: string[] = [];

      if (poToAdjust.po_number) {
        const { data: txs } = await supabase
          .from("transactions")
          .select("*, transaction_entries(*)")
          .eq("reference_number", poToAdjust.po_number)
          .eq("company_id", (poToAdjust as any).company_id); // Assuming company_id is available or we get it from profile

        if (txs && txs.length > 0) {
          originalTxIds = txs.map(t => t.id);
          
          // Prepare reversal entries from all related transactions
          txs.forEach(tx => {
            if (tx.transaction_entries) {
              tx.transaction_entries.forEach((entry: any) => {
                reversalEntries.push({
                  account_id: entry.account_id,
                  debit: entry.credit, // Swap debit/credit
                  credit: entry.debit,
                  description: `Adjustment/Reversal: ${entry.description || ''}`,
                  status: 'approved'
                });
              });
            }
          });
        }
      }

      // 2. Create Adjustment Transaction
      const { data: { user } } = await supabase.auth.getUser();
      let companyId = (poToAdjust as any).company_id;
      
      if (!companyId && user) {
         const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
         companyId = profile?.company_id;
      }

      if (companyId && reversalEntries.length > 0) {
          const { data: newTx, error: txError } = await supabase
            .from('transactions')
            .insert({
              company_id: companyId,
              transaction_date: new Date().toISOString().split('T')[0],
              description: `Adjustment for PO ${poToAdjust.po_number}: ${adjustReason}`,
              reference_number: `ADJ-${poToAdjust.po_number}-${Date.now().toString().slice(-4)}`,
              transaction_type: 'Adjustment',
              status: 'pending',
              total_amount: poToAdjust.total_amount,
              user_id: user?.id
            })
            .select()
            .single();

          if (txError) throw txError;

          if (newTx) {
              const entriesWithTxId = reversalEntries.map((e: any) => ({
                  ...e,
                  transaction_id: newTx.id
              }));
              const { error: entriesError } = await supabase.from('transaction_entries').insert(entriesWithTxId);
              if (entriesError) throw entriesError;

              // Update status to approved to trigger ledger posting
              const { error: updateError } = await supabase
                .from('transactions')
                .update({ status: 'approved' })
                .eq('id', newTx.id);
                
              if (updateError) throw updateError;
          }
      }

      // 3. Update PO Status instead of deleting
      const { error: poError } = await supabase
        .from("purchase_orders")
        .update({ 
            status: "cancelled",
            notes: `${poToAdjust.notes || ''}\n[Adjustment/Cancelled: ${adjustReason}]`
        })
        .eq("id", poToAdjust.id);
        
      if (poError) throw poError;

      // 4. Refresh AFS Cache
      try {
        if (companyId) {
          await supabase.rpc('refresh_afs_cache', { _company_id: companyId });
        }
      } catch {}

      toast({ title: "Success", description: "Purchase order adjusted and cancelled." });
      setAdjustmentOpen(false);
      refresh(true);
    } catch (error: any) {
      console.error("Adjustment error:", error);
      toast({ title: "Error", description: error.message || "Failed to process adjustment.", variant: "destructive" });
    } finally {
      setIsAdjusting(false);
    }
  };

  useEffect(() => {
    const loadBankAccounts = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!profile) return;
        const { data } = await supabase
          .from("bank_accounts")
          .select("id, account_name")
          .eq("company_id", (profile as any).company_id)
          .order("created_at", { ascending: false });
        setBankAccounts((data || []).map((b: any) => ({ id: b.id, account_name: b.account_name })));
      } catch {}
    };
    loadBankAccounts();
  }, []);

  const markSent = async (order: PurchaseOrder) => {
    try {
      setPoSentOrder(order);
      setPoSentDate(new Date().toISOString().slice(0, 10));
      setPoSentIncludeVAT(true);
      setPoSentDialogOpen(true);
      return;
    } catch {}
  };

  const finalizePOSent = async (order: PurchaseOrder) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (!profile?.company_id) return;
      const companyId = profile.company_id;

      // 1. Update PO Status
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status: "sent" })
        .eq("id", order.id);
      if (error) throw error;

      // 2. Update Inventory Items (Sync quantities)
      try {
          const { data: poItems } = await supabase
            .from("purchase_order_items")
            .select("description, quantity, unit_price, expense_account_id")
            .eq("purchase_order_id", order.id);
            
          for (const it of (poItems || [])) {
            if (it.expense_account_id) continue; // Skip service items

            const name = String(it.description || '').trim();
            if (!name) continue;
            const { data: existing } = await supabase
              .from("items")
              .select("id, quantity_on_hand")
              .eq("company_id", companyId)
              .eq("name", name)
              .maybeSingle();
              
            if (existing?.id) {
              await supabase
                .from("items")
                .update({ 
                  quantity_on_hand: Number(existing.quantity_on_hand || 0) + Number(it.quantity || 0),
                  cost_price: Number(it.unit_price || 0)
                })
                .eq("id", existing.id);
            } else {
              await supabase
                .from("items")
                .insert({
                  company_id: companyId,
                  name,
                  description: name,
                  unit_price: Number(it.unit_price || 0),
                  cost_price: Number(it.unit_price || 0),
                  quantity_on_hand: Number(it.quantity || 0),
                  item_type: "product",
                });
            }
          }
      } catch (e) {
        console.error("Inventory sync error", e);
      }
      
      toast({ title: "Success", description: "Purchase order marked as Sent and posted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleTransactionSuccess = async () => {
    setJournalOpen(false);
    if (poSentOrder && journalEditData?.lockType === 'po_sent') {
        await finalizePOSent(poSentOrder);
        setPoSentOrder(null);
    }
    refresh(true);
  };

  const confirmPOSent = async () => {
    if (!poSentOrder) return;
    if (isDateLocked(poSentDate)) {
      setPoSentDialogOpen(false);
      setIsLockDialogOpen(true);
      return;
    }
    
    // Instead of auto-posting, open the transaction form for review
    setPoSentDialogOpen(false);
    openJournalForPOSent(poSentOrder, poSentDate, poSentIncludeVAT);
  };

  const openJournalForPOSent = async (po: PurchaseOrder, postDateStr?: string, includeVAT?: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (!profile?.company_id) return;

      // Fetch items to check for expense accounts
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("description, amount, expense_account_id, tax_rate")
        .eq("purchase_order_id", po.id);

      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_name, account_type, account_code")
        .eq("company_id", profile.company_id)
        .eq("is_active", true);
      const list = (accounts || []).map(a => ({ id: String(a.id), name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
      
      const pick = (type: string, codes: string[], names: string[]) => {
        const byType = list.filter(a => a.type === type.toLowerCase());
        const byCode = byType.find(a => codes.includes(a.code));
        if (byCode) return byCode.id;
        const byName = byType.find(a => names.some(k => a.name.includes(k)));
        return byName?.id || byType[0]?.id || '';
      };
      
      const invId = pick('asset', ['1300'], ['inventory','stock']);
      const apId = pick('liability', ['2000'], ['accounts payable','payable']);
      const depositAssetId = pick('asset', ['1430'], ['deposit paid', 'supplier deposit']);
      
      // Check for existing supplier deposits
      const { total: depositTotal } = await checkSupplierCredit(po.supplier_id);
      
      const net = Number(po.subtotal || 0);
      const vat = Number(po.tax_amount || 0);
      const rate = net > 0 ? ((vat / net) * 100) : 0;
      
      let debitAccountId = invId;
      let splitMode = false;
      let splits: any[] = [];

      const serviceItems = (poItems || []).filter(i => i.expense_account_id);
      
      if (serviceItems.length > 0) {
        // If we have items with expense accounts, use them
        if (serviceItems.length === 1 && serviceItems.length === (poItems || []).length) {
             // Single service item, use its account directly
             debitAccountId = serviceItems[0].expense_account_id!;
        } else {
             // Multiple items or mixed -> Use Split Mode
             splitMode = true;
             // Group by expense account
             const map = new Map<string, number>();
             
             (poItems || []).forEach(item => {
                const accId = item.expense_account_id || invId; // Fallback to inventory for non-service items
                const gross = Number(item.amount || 0);
                const current = map.get(accId) || 0;
                map.set(accId, current + (includeVAT ? gross : (gross / (1 + (Number(item.tax_rate || 0)/100)))));
             });

             splits = Array.from(map.entries()).map(([accId, amt]) => ({
                account_id: accId,
                debit: amt,
                credit: 0,
                description: `Split for PO ${po.po_number}`
             }));
             
             debitAccountId = ''; // Clear main debit account
        }
      }

      const editData = {
        id: null,
        transaction_date: postDateStr || po.po_date,
        description: `PO ${po.po_number || po.id} sent`,
        reference_number: po.po_number || null,
        transaction_type: (serviceItems.length > 0 && serviceItems.length === (poItems || []).length) ? 'expense' : 'product_purchase',
        payment_method: 'accrual',
        debit_account_id: debitAccountId,
        credit_account_id: apId,
        deposit_available: depositTotal,
        deposit_account_id: depositAssetId,
        total_amount: includeVAT ? Number(po.total_amount || 0) : net,
        bank_account_id: null,
        lockType: 'po_sent',
        vat_rate: includeVAT ? String(rate.toFixed(2)) : '0',
        amount_includes_vat: Boolean(includeVAT),
        splitMode,
        splits,
        po_has_services: serviceItems.length > 0,
        po_all_services: serviceItems.length === (poItems || []).length
      };
      setJournalEditData(editData);
      setJournalOpen(true);
    } catch {}
  };

  const openPayDialog = (order: PurchaseOrder) => {
    setPayOrder(order);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayDialogOpen(true);
    (async () => {
      try {
        const { data: txs } = await supabase
          .from('transactions')
          .select('total_amount')
          .eq('reference_number', order.po_number)
          .eq('transaction_type', 'payment')
          .eq('status', 'posted');
        const paid = (txs || []).reduce((sum: number, t: any) => sum + Number(t.total_amount || 0), 0);
        setPaidSoFar(paid);
        const outstanding = Math.max(0, Number(order.total_amount || 0) - paid);
        setPayAmount(outstanding.toFixed(2));
      } catch {
        setPaidSoFar(0);
        setPayAmount(String(order.total_amount || 0));
      }
    })();
  };

  const confirmPayment = async () => {
    if (!payOrder || !selectedBankId) return;

    if (isDateLocked(payDate)) {
      setPayDialogOpen(false);
      setIsLockDialogOpen(true);
      return;
    }

    try {
      const amt = parseFloat(payAmount || '0');
      const outstanding = Math.max(0, Number((payOrder as any).total_amount || 0) - paidSoFar);
      
      if (!amt || amt <= 0) { throw new Error('Enter a valid payment amount'); }
      if (amt > outstanding + 0.0001) { throw new Error('Amount exceeds outstanding'); }

      // Check for credit
      const { total, sources } = await checkSupplierCredit(payOrder.supplier_id);
      if (total > 0) {
          setAvailableCredit(total);
          setCreditSources(sources);
          setPendingPayment({ amt, outstanding });
          setCreditDialogOpen(true);
          setPayDialogOpen(false);
          return;
      }

      await transactionsApi.postPurchasePaidClient(
        payOrder,
        payDate,
        selectedBankId,
        amt
      );
      const { error } = await supabase
        .from("purchase_orders")
        .update({ status: (amt >= outstanding ? "paid" : "sent") })
        .eq("id", (payOrder as any).id);
      if (error) throw error;
      const newPaid = paidSoFar + amt;
      setPaidMap(prev => ({ ...prev, [String(payOrder?.po_number || '')]: newPaid }));
      const fullySettled = newPaid >= Number((payOrder as any).total_amount || 0) - 0.0001;
      setOrders(prev => prev.map(o => o.id === (payOrder as any).id ? { ...o, status: (fullySettled ? "paid" : "sent") } : o));
      toast({ title: "Success", description: fullySettled ? "Payment posted and Purchase order marked as Paid" : "Partial payment posted" });
      setPayDialogOpen(false);
      setPayOrder(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const totals = calculateTotals();
  
  const handleExportExcel = () => {
    const dataToExport = filteredOrders.map(order => ({
      'PO Number': order.po_number,
      'Date': new Date(order.po_date).toLocaleDateString("en-ZA"),
      'Supplier': order.supplierName || "N/A",
      'Status': order.status,
      'Total Amount': order.total_amount,
      'Tax Amount': order.tax_amount,
      'Subtotal': order.subtotal
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase Orders");
    XLSX.writeFile(wb, `Purchase_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.text("Purchase Orders Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString("en-ZA")}`, 14, 30);

    const tableColumn = ["PO Number", "Date", "Supplier", "Status", "Total"];
    const tableRows = filteredOrders.map(order => [
      order.po_number,
      new Date(order.po_date).toLocaleDateString("en-ZA"),
      order.supplierName || "N/A",
      order.status.toUpperCase(),
      order.total_amount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
    });

    doc.save(`Purchase_Orders_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handlePreviewOrder = (order: PurchaseOrder) => {
    // Reuse print logic but without auto-print if possible, 
    // or just open the PDF in a new tab which acts as a preview.
    handlePrintOrder(order);
  };

  const handleEmailOrder = (order: PurchaseOrder) => {
    if (!order.supplierEmail) {
      toast({ title: "No Email", description: "Supplier does not have an email address.", variant: "destructive" });
      return;
    }
    const subject = encodeURIComponent(`Purchase Order ${order.po_number}`);
    const body = encodeURIComponent(`Please find attached purchase order ${order.po_number}.\n\nRegards,\n${user?.email || 'Accounts'}`);
    window.open(`mailto:${order.supplierEmail}?subject=${subject}&body=${body}`);
  };

  const handleDeleteOrder = async (order: PurchaseOrder) => {
    if (!confirm(`Are you sure you want to delete PO ${order.po_number}? This cannot be undone.`)) return;
    
    try {
      // Delete items first
      const { error: itemsError } = await supabase.from('purchase_order_items').delete().eq('purchase_order_id', order.id);
      if (itemsError) throw itemsError;

      // Delete order
      const { error: orderError } = await supabase.from('purchase_orders').delete().eq('id', order.id);
      if (orderError) throw orderError;

      toast({ title: "Success", description: "Purchase order deleted" });
      refresh(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleCopyOrder = async (order: PurchaseOrder) => {
    try {
        setViewLoading(true);
        const { data: items } = await supabase
            .from("purchase_order_items")
            .select("*")
            .eq("purchase_order_id", order.id);
            
        setForm({
            po_date: new Date().toISOString().slice(0, 10),
            supplier_id: order.supplier_id,
            notes: order.notes || "",
            items: (items || []).map((i: any) => ({
                description: i.description,
                quantity: i.quantity,
                unit_price: i.unit_price,
                tax_rate: i.tax_rate,
                expense_account_id: i.expense_account_id || ""
            }))
        });
        setEditingId(null);
        setPurchaseType('product'); // Default or detect
        setShowForm(true);
        toast({ title: "Copy Created", description: "New order form populated from existing order." });
    } catch (e: any) {
        toast({ title: "Error", description: "Failed to copy order", variant: "destructive" });
    } finally {
        setViewLoading(false);
    }
  };

  const handleViewHistory = (order: PurchaseOrder) => {
    toast({ title: "Coming Soon", description: "Audit history will be available in the next update." });
  };

  const handleUpdateStatus = (order: PurchaseOrder) => {
      // Simple status toggle for now or reuse existing flows
      if (order.status === 'draft') {
          markSent(order);
      } else {
          toast({ title: "Info", description: "Use specific actions like 'Create Invoice' or 'Pay' to update status." });
      }
  };

  const handlePrintOrder = async (order: PurchaseOrder) => {
    try {
      setViewLoading(true);
      const { data: items, error } = await supabase
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", order.id);

      if (error) throw error;

      // Generate PDF for printing
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.text("PURCHASE ORDER", 105, 20, { align: "center" });
      
      doc.setFontSize(10);
      doc.text(`PO Number: ${order.po_number}`, 14, 40);
      doc.text(`Date: ${new Date(order.po_date).toLocaleDateString("en-ZA")}`, 14, 46);
      doc.text(`Status: ${order.status.toUpperCase()}`, 14, 52);
      
      doc.text(`Supplier:`, 140, 40);
      doc.setFont("helvetica", "bold");
      doc.text(`${order.supplierName || "N/A"}`, 140, 46);
      doc.setFont("helvetica", "normal");
      
      // Items Table
      const tableColumn = ["Description", "Quantity", "Unit Price", "Tax Rate", "Amount"];
      const tableRows = (items || []).map((item: any) => [
        item.description,
        item.quantity,
        item.unit_price.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" }),
        `${item.tax_rate}%`,
        item.amount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })
      ]);

      autoTable(doc, {
        startY: 60,
        head: [tableColumn],
        body: tableRows,
        foot: [
            ["", "", "", "Subtotal:", order.subtotal.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })],
            ["", "", "", "VAT:", order.tax_amount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })],
            ["", "", "", "Total:", order.total_amount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })]
        ],
        theme: 'grid',
        headStyles: { fillColor: [66, 66, 66] }
      });

      // Footer
      const finalY = (doc as any).lastAutoTable.finalY || 150;
      doc.text(`Notes: ${order.notes || ""}`, 14, finalY + 10);
      
      // Open print window
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
      
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to generate print view", variant: "destructive" });
    } finally {
      setViewLoading(false);
    }
  };

  const editingOrder = useMemo(() => orders.find(o => o.id === editingId), [orders, editingId]);
  const isEditable = !editingId || (editingOrder && (editingOrder.status === 'placed order' || editingOrder.status === 'open'));

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
                 <h1 className="text-xl font-bold text-[#111827]">Purchase Orders</h1>
                 <p className="text-sm text-muted-foreground">
                   Manage your supplier purchase orders, inventory, and asset acquisitions.
                 </p>
               </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              className="pl-9 bg-white border-gray-200 focus:border-[#1BA37B] focus:ring-[#1BA37B]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={viewFilter} onValueChange={setViewFilter}>
               <SelectTrigger className="w-[180px] bg-white border-gray-200">
                   <div className="flex items-center gap-2">
                       <Filter className="h-4 w-4 text-muted-foreground" />
                       <span className="font-medium text-foreground">{viewFilter === 'all' ? 'All Orders' : viewFilter.charAt(0).toUpperCase() + viewFilter.slice(1)}</span>
                   </div>
               </SelectTrigger>
               <SelectContent>
                   <SelectItem value="all">All Orders</SelectItem>
                   <SelectItem value="open">Open Orders</SelectItem>
                   <SelectItem value="overdue">Overdue</SelectItem>
               </SelectContent>
           </Select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button id="AddPurchaseOrderButton" className="bg-[#1BA37B] hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all duration-200 ease-in-out gap-2">
            <Plus className="h-4 w-4" />
            Add Purchase Order
          </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => { setPurchaseType('product'); setShowForm(true); }} className="cursor-pointer">
                <Box className="mr-2 h-4 w-4 text-slate-500" /> Inventory Order
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setPurchaseType('service'); setShowForm(true); }} className="cursor-pointer">
                <Briefcase className="mr-2 h-4 w-4 text-slate-500" /> Service Order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />
          
           <Button variant="outline" size="icon" className="h-9 w-9 border-gray-200 hover:bg-gray-50 text-gray-600" onClick={() => refresh(true)} title="Refresh">
                <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
           </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 border-gray-200 hover:bg-gray-50 text-gray-600" title="Download">
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
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
            <span className="text-sm font-medium">orders selected</span>
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
               onClick={() => toast({ title: "Info", description: "Batch actions are coming soon." })}
             >
               Delete
             </Button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <Table>
          <TableHeader className="bg-[#4b5563] text-white hover:bg-[#4b5563]">
            <TableRow className="hover:bg-[#4b5563] border-none">
              <TableHead className="w-[40px] pl-4 text-white/90 h-10">
                <Checkbox 
                   className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-[#4b5563]"
                   checked={filteredOrders.length > 0 && selectedIds.length === filteredOrders.length} 
                   onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="text-white font-semibold h-10 cursor-pointer" onClick={() => handleSort('supplierName')}>
                 <div className="flex items-center gap-1">Supplier Name {sortConfig.key === 'supplierName' && <ChevronDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead className="text-white font-semibold h-10 cursor-pointer" onClick={() => handleSort('po_number')}>
                 <div className="flex items-center gap-1">Document Number {sortConfig.key === 'po_number' && <ChevronDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead className="text-white font-semibold h-10">Order No.</TableHead>
              <TableHead className="text-white font-semibold h-10">Type of Purchase</TableHead>
              <TableHead className="text-white font-semibold h-10 cursor-pointer" onClick={() => handleSort('po_date')}>
                 <div className="flex items-center gap-1">Date {sortConfig.key === 'po_date' && <ChevronDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead className="text-white font-semibold h-10 text-right cursor-pointer" onClick={() => handleSort('total_amount')}>
                 <div className="flex items-center justify-end gap-1">Total {sortConfig.key === 'total_amount' && <ChevronDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead className="text-white font-semibold h-10 text-center w-[80px]">Printed</TableHead>
              <TableHead className="text-white font-semibold h-10 cursor-pointer" onClick={() => handleSort('status')}>
                 <div className="flex items-center gap-1">Status {sortConfig.key === 'status' && <ChevronDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead className="text-white font-semibold h-10 text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} className="h-24 text-center">Loading...</TableCell></TableRow>
            ) : paginatedOrders.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No orders found.</TableCell></TableRow>
            ) : (
              paginatedOrders.map((order, idx) => (
                <TableRow 
                  key={order.id} 
                  className={cn(
                    "hover:bg-emerald-50/50", 
                    idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                  )}
                >
                  <TableCell className="pl-4 py-3">
                    <Checkbox 
                      checked={selectedIds.includes(order.id)} 
                      onCheckedChange={(checked) => handleSelectRow(order.id, !!checked)} 
                    />
                  </TableCell>
                  <TableCell className="font-medium text-slate-700 py-3">{order.supplierName || "N/A"}</TableCell>
                  <TableCell className="text-[#1BA37B] font-medium py-3 cursor-pointer hover:underline" onClick={() => handleViewOrder(order)}>
                    {order.po_number}
                  </TableCell>
                  <TableCell className="text-slate-500 py-3">{order.po_number}</TableCell>
                  <TableCell className="text-slate-600 py-3 capitalize">{order.purchase_type || 'service'}</TableCell>
                  <TableCell className="text-slate-600 py-3">{new Date(order.po_date).toLocaleDateString("en-ZA")}</TableCell>
                  <TableCell className="text-right font-medium text-slate-700 py-3">
                    {order.total_amount.toLocaleString("en-ZA", { style: "currency", currency: "ZAR" })}
                  </TableCell>
                  <TableCell className="text-center py-3">
                     <div className="w-4 h-4 border border-slate-300 rounded mx-auto bg-white"></div>
                  </TableCell>
                  <TableCell className="py-3">
                     {getStatusBadge(order.status)}
                  </TableCell>
                  <TableCell className="text-right pr-4 py-3">
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <Button variant="ghost" className="h-8 text-[#1BA37B] hover:text-emerald-800 hover:bg-emerald-50 px-2 font-medium text-sm">
                             Actions <ChevronDown className="ml-1 h-3 w-3" />
                           </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 shadow-lg border-slate-200">
                           <DropdownMenuItem onClick={() => handlePreviewOrder(order)} className="cursor-pointer text-slate-600 focus:text-emerald-600 focus:bg-emerald-50">
                              <FileText className="mr-2 h-4 w-4" /> Preview
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => handlePrintOrder(order)} className="cursor-pointer text-slate-600 focus:text-emerald-600 focus:bg-emerald-50">
                              <Box className="mr-2 h-4 w-4" /> Print
                           </DropdownMenuItem>
                           <DropdownMenuItem onClick={() => handleEmailOrder(order)} className="cursor-pointer text-slate-600 focus:text-emerald-600 focus:bg-emerald-50">
                              <Send className="mr-2 h-4 w-4" /> Email
                           </DropdownMenuItem>
                           <DropdownMenuSeparator />
                           <DropdownMenuItem onClick={() => handleViewOrder(order)} className="cursor-pointer text-slate-600 focus:text-emerald-600 focus:bg-emerald-50">
                              <Briefcase className="mr-2 h-4 w-4" /> Edit
                           </DropdownMenuItem>
                           
                           {['draft', 'placed order', 'open'].includes(order.status) && (
                               <DropdownMenuItem onClick={() => handleDeleteOrder(order)} className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50">
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                               </DropdownMenuItem>
                           )}
                           
                           <DropdownMenuSeparator />
                           <DropdownMenuItem onClick={() => handleUpdateStatus(order)} className="cursor-pointer text-slate-600 focus:text-emerald-600 focus:bg-emerald-50">
                              <RefreshCw className="mr-2 h-4 w-4" /> Update Status
                           </DropdownMenuItem>
                           
                           {(order.status === 'placed order' || order.status === 'open' || order.status === 'draft' || order.status === 'overdue') && (
                             <DropdownMenuItem onClick={() => markSent(order)} className="cursor-pointer text-emerald-600 font-medium focus:text-emerald-700 focus:bg-emerald-50">
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Create Invoice
                             </DropdownMenuItem>
                           )}

                           <DropdownMenuItem onClick={() => handleCopyOrder(order)} className="cursor-pointer text-slate-600 focus:text-emerald-600 focus:bg-emerald-50">
                              <Upload className="mr-2 h-4 w-4" /> Copy Purchase Order
                           </DropdownMenuItem>
                           <DropdownMenuSeparator />
                           <DropdownMenuItem onClick={() => handleViewHistory(order)} className="cursor-pointer text-slate-600 focus:text-emerald-600 focus:bg-emerald-50">
                              <History className="mr-2 h-4 w-4" /> View History
                           </DropdownMenuItem>
                           
                           {(order.status !== 'cancelled') && (
                              <DropdownMenuItem onClick={() => { setPoToAdjust(order); setAdjustmentOpen(true); }} className="cursor-pointer text-amber-600 focus:text-amber-700 focus:bg-amber-50">
                                <History className="mr-2 h-4 w-4" /> Adjust / Reverse
                              </DropdownMenuItem>
                           )}
                        </DropdownMenuContent>
                     </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination Footer */}
      <div className="flex items-center justify-between pt-4 text-sm text-slate-500">
         <div>
            First <span className="mx-2 px-2 py-1 bg-[#1BA37B] text-white rounded text-xs font-bold">{currentPage}</span> Last &nbsp; Display {paginatedOrders.length} of {filteredOrders.length}
         </div>
      </div>


      {/* Adjustment Dialog */}
      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <History className="h-5 w-5" />
              Adjust / Reverse Purchase Order
            </DialogTitle>
            <DialogDescription className="pt-2">
              This will cancel the purchase order and create adjustment entries in the ledger to reverse any financial impact.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-sm font-medium flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                For audit compliance, purchase orders cannot be deleted. Use this form to adjust or reverse the transaction.
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Reason for Adjustment</Label>
              <Textarea 
                value={adjustReason} 
                onChange={(e) => setAdjustReason(e.target.value)} 
                placeholder="Reason for cancellation or adjustment..."
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
            <Button variant="outline" onClick={() => setAdjustmentOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button 
              onClick={handleAdjustment}
              disabled={isAdjusting || !adjustReason.trim()}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isAdjusting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <History className="mr-2 h-4 w-4" />
                  Confirm Adjustment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={poSentDialogOpen} onOpenChange={setPoSentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Post Sent Purchase</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Posting Date</Label>
              <Input type="date" value={poSentDate} onChange={(e) => setPoSentDate(e.target.value)} />
            </div>
            {poSentOrder && (
              <div className="p-3 border rounded bg-muted/30 space-y-1 text-sm">
                <div className="flex justify-between"><span>Amount (excl. VAT)</span><span className="font-mono">R {Number(poSentOrder.subtotal || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between"><span>VAT amount</span><span className="font-mono">R {Number(poSentOrder.tax_amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between"><span>Total</span><span className="font-mono">R {Number(poSentOrder.total_amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex items-center gap-2 pt-2">
                  <Label htmlFor="includeVatPo">Include VAT in posting?</Label>
                  <input id="includeVatPo" type="checkbox" checked={poSentIncludeVAT} onChange={e => setPoSentIncludeVAT(e.target.checked)} />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPoSentDialogOpen(false)}>Cancel</Button>
              <Button className="bg-[#1BA37B] hover:bg-emerald-700" onClick={confirmPOSent}>Post</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={showForm} onOpenChange={(open) => {
        setShowForm(open);
        if (!open) {
          setEditingId(null);
          setForm({
            po_date: new Date().toISOString().slice(0, 10),
            supplier_id: "",
            notes: "",
            items: [{ description: "", quantity: 1, unit_price: 0, tax_rate: 15, expense_account_id: "" }]
          });
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId ? (isEditable ? "Edit Purchase Order" : "Purchase Order Details") : "New Purchase Order"}
              {!editingId && (
                <Badge variant="outline" className="text-xs font-normal">
                  {purchaseType === 'product' ? 'Inventory Order' : 'Service Order'}
                </Badge>
              )}
            </DialogTitle>
            {editingId && !isEditable && (
                <DialogDescription>This order is {editingOrder?.status} and cannot be edited.</DialogDescription>
            )}
            {!editingId && (
              <DialogDescription>
                You are creating a Purchase Order. Review supplier and line items before posting.
              </DialogDescription>
            )}
          </DialogHeader>

          <fieldset disabled={!isEditable} className="space-y-6 border-0 p-0 m-0 min-w-0 block">
            {/* Header Section: Supplier & Order Details */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Supplier Selection Area */}
              <div className="md:col-span-7 space-y-4">
                <div className="p-5 border rounded-xl bg-card shadow-sm space-y-4 h-full">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Briefcase className="h-4 w-4" /> Supplier Details
                    </h3>
                    <Badge variant="outline" className="font-normal">
                      {purchaseType === 'product' ? 'Inventory Order' : purchaseType === 'service' ? 'Service Order' : 'Asset Order'}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    <Label>Select Supplier</Label>
                    <Select value={form.supplier_id} onValueChange={(val) => setForm({ ...form, supplier_id: val })}>
                      <SelectTrigger className="w-full bg-background">
                        <SelectValue placeholder="Search or select supplier..." />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.filter(s => !s.name.startsWith('[INACTIVE]')).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedSupplier ? (
                    <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-dashed animate-in fade-in slide-in-from-top-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground uppercase font-semibold">Address</div>
                          <div className="text-sm whitespace-pre-wrap">{selectedSupplier.address || "No address on file"}</div>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <div className="text-xs text-muted-foreground uppercase font-semibold">Contact</div>
                            <div className="text-sm">{selectedSupplier.phone || "No phone"}</div>
                            <div className="text-sm text-muted-foreground">{selectedSupplier.email}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground uppercase font-semibold">Tax / VAT No</div>
                            <div className="text-sm font-mono">{selectedSupplier.tax_number || "N/A"}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 p-8 border border-dashed rounded-lg text-center text-muted-foreground text-sm bg-muted/10">
                      Select a supplier to view details
                    </div>
                  )}
                </div>
              </div>

              {/* Order Details Area */}
              <div className="md:col-span-5 space-y-4">
                <div className="p-5 border rounded-xl bg-card shadow-sm space-y-4 h-full">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Order Info
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <Label>Order Date</Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          className="pl-9"
                          value={form.po_date}
                          onChange={(e) => setForm({ ...form, po_date: e.target.value })}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label>Expected Delivery</Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input type="date" className="pl-9" />
                      </div>
                    </div>

                    <div className="pt-2">
                      <Label>Order Reference</Label>
                      <Input placeholder="Auto-generated (Draft)" disabled className="bg-muted/50" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items Section */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <Label className="text-base font-semibold">
                  {purchaseType === 'service' ? 'Service Details' : purchaseType === 'asset' ? 'Asset Details' : 'Line Items'}
                </Label>
                <Button size="sm" variant="outline" onClick={addItem} className="border-dashed">
                  <Plus className="h-4 w-4 mr-2" />
                  {purchaseType === 'service' ? 'Add Service' : purchaseType === 'asset' ? 'Add Asset' : 'Add Item'}
                </Button>
              </div>
              
              {purchaseType === 'service' ? (
                <div className="space-y-3">
                  {form.items.map((item, index) => (
                    <div key={index} className="border rounded-xl p-4 bg-card shadow-sm group">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                        <div className="md:col-span-6">
                          <Label className="text-xs">Service Description</Label>
                          <Input
                            className="mt-1.5"
                            placeholder="Enter service description..."
                            value={item.description}
                            onChange={(e) => updateItem(index, "description", e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Expense Account</Label>
                          <AccountCombobox
                            accounts={expenseAccounts}
                            value={item.expense_account_id || ""}
                            onChange={(val) => updateItem(index, "expense_account_id", val)}
                            placeholder="Select expense account..."
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Amount</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="mt-1.5 text-right"
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">VAT %</Label>
                          <div className="flex items-center justify-end gap-1 mt-1.5">
                            <Input
                              type="number"
                              min="0"
                              className="text-right w-16"
                              value={item.tax_rate}
                              onChange={(e) => updateItem(index, "tax_rate", parseFloat(e.target.value) || 0)}
                            />
                            <span className="text-muted-foreground text-xs">%</span>
                          </div>
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Line Total</Label>
                          <div className="mt-1.5 font-mono">
                            {(item.unit_price * (1 + (item.tax_rate || 0) / 100)).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                          </div>
                        </div>
                        <div className="md:col-span-12 flex justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeItem(index)}
                            disabled={form.items.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="p-2">
                    <Button variant="ghost" size="sm" onClick={addItem} className="w-full h-8 text-muted-foreground hover:text-primary text-xs uppercase tracking-wide">
                      <Plus className="h-3 w-3 mr-2" /> Add another service line
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-[40%]">Description / Item</TableHead>
                        <TableHead className="w-[15%] text-right">Quantity</TableHead>
                        <TableHead className="w-[15%] text-right">Unit Price</TableHead>
                        <TableHead className="w-[12%] text-right">Tax Rate</TableHead>
                        <TableHead className="w-[15%] text-right">Line Total</TableHead>
                        <TableHead className="w-[3%]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {form.items.map((item, index) => (
                        <TableRow key={index} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <Input
                              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-muted/50 px-0 h-auto py-1 font-medium"
                              placeholder="Enter item description..."
                              value={item.description}
                              onChange={(e) => updateItem(index, "description", e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="1"
                              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-muted/50 text-right px-0 h-auto py-1"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-muted/50 text-right px-0 h-auto py-1"
                              value={item.unit_price}
                              onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min="0"
                                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:bg-muted/50 text-right px-0 h-auto py-1 w-12"
                                value={item.tax_rate}
                                onChange={(e) => updateItem(index, "tax_rate", parseFloat(e.target.value) || 0)}
                              />
                              <span className="text-muted-foreground text-xs">%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {(item.quantity * item.unit_price).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeItem(index)}
                              disabled={form.items.length === 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="p-2 border-t bg-muted/5">
                    <Button variant="ghost" size="sm" onClick={addItem} className="w-full h-8 text-muted-foreground hover:text-primary text-xs uppercase tracking-wide">
                      <Plus className="h-3 w-3 mr-2" /> Add another line item
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Section: Notes & Totals */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2">
              <div className="md:col-span-7">
                <Label>Notes / Memo</Label>
                <Textarea
                  placeholder="Add any notes for this order..."
                  className="mt-1.5 min-h-[120px] resize-none"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="md:col-span-5">
                <div className="bg-muted/30 border rounded-xl p-5 space-y-3">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-mono">{totals.subtotal.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tax Amount (VAT)</span>
                    <span className="font-mono">{totals.taxAmount.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
                  </div>
                  <div className="border-t my-2 pt-2 flex justify-between font-bold text-lg">
                    <span>Total Due</span>
                    <span className="font-mono text-primary">{totals.total.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
                  </div>
                </div>
              </div>
            </div>
          </fieldset>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {isEditable ? "Cancel" : "Close"}
            </Button>
            {isEditable && (
              <Button id="SavePurchaseOrderButton" onClick={() => setConfirmSubmitOpen(true)} className="bg-[#1BA37B] hover:bg-emerald-700">
              {editingId ? "Update Order" : "Place Order"}
            </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            {companyLogoUrl && (
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-md border bg-white overflow-hidden">
                  <img src={companyLogoUrl} alt="Company Logo" className="w-full h-full object-contain" />
                </div>
                <div className="text-sm font-semibold">{companyName}</div>
              </div>
            )}
            <DialogTitle>{purchaseType === 'service' ? 'Confirm Service Order' : 'Confirm Inventory Order'}</DialogTitle>
            <DialogDescription>
              {purchaseType === 'service'
                ? 'You are creating a Service Purchase Order. Review services and expense accounts before confirming.'
                : 'You are creating an Inventory Purchase Order. Review item quantities and prices before confirming.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Order Type</div>
              <Badge variant="outline">
                {purchaseType === 'product' ? 'Inventory Order' : 'Service Order'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Supplier</div>
              <div className="text-sm font-medium">{selectedSupplier?.name || "N/A"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Items</div>
              <div className="text-sm font-medium">{form.items.length}</div>
            </div>
            {purchaseType === 'service' ? (
              <div className="border rounded-md p-3 bg-muted/20">
                {(form.items || []).slice(0, 3).map((it, idx) => {
                  const accName = expenseAccounts.find(a => a.id === (it.expense_account_id || ""))?.account_name || "Expense";
                  const amt = (it.quantity || 0) * (it.unit_price || 0);
                  return (
                    <div key={idx} className="flex items-center justify-between text-sm py-1">
                      <div className="truncate max-w-[65%]">
                        <div className="font-medium">{it.description || 'Service'}</div>
                        <div className="text-xs text-muted-foreground">{accName}</div>
                      </div>
                      <span className="font-mono">{amt.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
                    </div>
                  );
                })}
                {form.items.length > 3 && (
                  <div className="text-xs text-muted-foreground mt-1">+ {form.items.length - 3} more lines</div>
                )}
              </div>
            ) : (
              <div className="border rounded-md p-3 bg-muted/20">
                {(form.items || []).slice(0, 3).map((it, idx) => {
                  const qty = it.quantity || 0;
                  const unit = it.unit_price || 0;
                  const total = qty * unit;
                  return (
                    <div key={idx} className="flex items-center justify-between text-sm py-1">
                      <div className="truncate max-w-[65%] font-medium">{it.description || 'Item'}</div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{qty} × {unit.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</div>
                        <div className="font-mono">{total.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</div>
                      </div>
                    </div>
                  );
                })}
                {form.items.length > 3 && (
                  <div className="text-xs text-muted-foreground mt-1">+ {form.items.length - 3} more lines</div>
                )}
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{totals.subtotal.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">VAT</span>
                <span className="font-mono">{totals.taxAmount.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold border-t pt-2">
                <span>Total</span>
                <span className="font-mono text-primary">{totals.total.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmitOpen(false)}>Cancel</Button>
            <Button className="bg-[#1BA37B] hover:bg-emerald-700" onClick={() => { setConfirmSubmitOpen(false); handleSubmit(); }}>
              {editingId ? "Confirm Update" : "Create Purchase Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount to Pay (R)</Label>
              <Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              <div className="text-xs text-muted-foreground mt-1">
                Outstanding: R {Math.max(0, Number(payOrder?.total_amount || 0) - paidSoFar).toLocaleString('en-ZA')}
              </div>
            </div>
            <div>
              <Label>Bank Account</Label>
              <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPayDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmPayment} className="bg-[#1BA37B] hover:bg-emerald-700">Confirm</Button>
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
            <div className="flex justify-between text-sm">
              <span>Invoice Amount:</span>
              <span className="font-mono">R{pendingPayment?.amt.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Available Credit:</span>
              <span className="font-mono text-green-600">R{availableCredit.toFixed(2)}</span>
            </div>
            <div className="border-t pt-2 mt-2 flex justify-between font-bold">
              <span>Outstanding after Credit:</span>
              <span className="font-mono">
                 R{Math.max(0, (pendingPayment?.amt || 0) - availableCredit).toFixed(2)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
                setCreditDialogOpen(false);
                setPayDialogOpen(true); // Return to normal payment
            }}>No, Pay Manually</Button>
            <Button onClick={handleApplyCredit} disabled={isApplyingCredit} className="bg-gradient-primary">
               {isApplyingCredit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Apply Credit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionFormEnhanced open={journalOpen} onOpenChange={setJournalOpen} onSuccess={handleTransactionSuccess} editData={journalEditData} />

      {isSubmitting && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center">
          <div className="bg-background p-8 rounded-xl shadow-2xl max-w-md w-full space-y-6 border border-border animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="relative">
                <LoadingSpinner className="h-16 w-16 text-primary" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold">{Math.round(progress)}%</span>
                </div>
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold tracking-tight">Processing Purchase Order</h3>
                <p className="text-sm text-muted-foreground">{progressText}</p>
              </div>
              <Progress value={progress} className="w-full h-2" />
            </div>
          </div>
        </div>
      )}
      <FinancialYearLockDialog 
        open={isLockDialogOpen} 
        onOpenChange={setIsLockDialogOpen} 
      />
    </div>
  );
};
