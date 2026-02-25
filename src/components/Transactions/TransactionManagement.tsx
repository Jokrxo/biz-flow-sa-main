import React, { useEffect, useMemo, useState, Suspense, lazy, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, Filter, Download, Edit, Receipt, ArrowUpDown, Calendar, CheckCircle, XCircle, MoreHorizontal, Loader2, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft, Copy, FileText, Paperclip, Eye, SlidersHorizontal, ShoppingCart, FileSpreadsheet, Landmark, Percent, ArrowLeft, PieChart, CreditCard, Upload, AlertTriangle, AlertOctagon, RefreshCw, History, Trash2, Check, ChevronsUpDown, BookOpen, Lock } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";
// Lazy-load the enhanced transaction form to avoid route-level stalls if it errors
const TransactionFormLazy = lazy(() =>
  import("./TransactionFormEnhanced").then((m) => ({ default: m.TransactionFormEnhanced }))
);
import { exportTransactionsToExcel, exportTransactionsToPDF } from "@/lib/export-utils";

interface AccountComboboxProps {
  accounts: any[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const AccountCombobox = ({ accounts, value, onChange, placeholder = "Select Account...", disabled = false }: AccountComboboxProps) => {
  const [open, setOpen] = useState(false);
  const selectedAccount = accounts.find((account) => String(account.id) === String(value));

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal pl-3 h-10 text-left bg-background hover:bg-muted/50"
        >
          {selectedAccount ? (
             <span className="truncate flex items-center gap-2">
                <span className="font-mono font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">{selectedAccount.account_code}</span>
                <span className="truncate">{selectedAccount.account_name}</span>
             </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 z-[1100]" align="start">
        <Command>
          <CommandInput placeholder="Search account code or name..." />
          <CommandList className="max-h-[300px] overflow-y-auto custom-scrollbar">
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`${account.account_code} ${account.account_name}`}
                  onSelect={() => {
                    onChange(String(account.id));
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      String(value) === String(account.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-mono text-muted-foreground mr-2 w-16">{account.account_code}</span>
                  <span className="flex-1 truncate">{account.account_name}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-2 capitalize">{account.account_type || account.type}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  reference_number: string | null;
  total_amount: number;
  status: string;
  bank_account_id: string | null;
  transaction_type: string | null;
  category: string | null;
  entries?: any[];
  bank_accounts?: { account_name: string; bank_name: string } | null;
}

export const TransactionManagement = () => {
  const { toast } = useToast();
  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [posting, setPosting] = useState<Record<string, boolean>>({});
  const [newFlowOpen, setNewFlowOpen] = useState(false);
  const [quickType, setQuickType] = useState<'income' | 'expense' | 'receipt' | 'asset' | 'product_purchase' | 'liability' | 'equity' | 'loan_received' | 'loan_repayment' | 'loan_interest' | 'depreciation' | 'asset_disposal' | null>(null);
  const [quickDate, setQuickDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [quickAmount, setQuickAmount] = useState<string>('');
  const [quickDesc, setQuickDesc] = useState<string>('');
  const [quickPayment, setQuickPayment] = useState<'cash' | 'accrual' | 'asset'>('cash');
  const [quickBankId, setQuickBankId] = useState<string>('');
  const [quickExpenseAccountId, setQuickExpenseAccountId] = useState<string>('');
  const [quickIncomeAccountId, setQuickIncomeAccountId] = useState<string>('');
  const [quickReceivableAccountId, setQuickReceivableAccountId] = useState<string>('');
  const [quickPayableAccountId, setQuickPayableAccountId] = useState<string>('');
  const [quickEquityAccountId, setQuickEquityAccountId] = useState<string>('');
  const [quickAssetAccountId, setQuickAssetAccountId] = useState<string>('');
  const [quickUsefulLifeYears, setQuickUsefulLifeYears] = useState<string>('5');
  const [quickDepMethod, setQuickDepMethod] = useState<'straight_line' | 'diminishing'>('straight_line');
  const [quickUsefulLifeStartDate, setQuickUsefulLifeStartDate] = useState<string>(new Date().toISOString().slice(0,10));
  const fixedAssetCodes = ['1500','1510','1600','1700','1800'];
  const [quickVatOn, setQuickVatOn] = useState<'yes' | 'no'>('no');
  const [quickVatRate, setQuickVatRate] = useState<string>('15');
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Transaction[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [prefillData, setPrefillData] = useState<any>(null);
  const [headless, setHeadless] = useState(false);
  const [sourceTab, setSourceTab] = useState<"all" | "invoice" | "csv" | "bank" | "manual" | "purchase">("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocDate, setAllocDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [allocType, setAllocType] = useState<'income'|'expense'>('income');
  const [allocPayment, setAllocPayment] = useState<'cash'|'accrual'>('cash');
  const [allocBankId, setAllocBankId] = useState<string>('');
  const [allocVatOn, setAllocVatOn] = useState<'yes'|'no'>('no');
  const [allocVatRate, setAllocVatRate] = useState<string>('0');
  const [allocAccountId, setAllocAccountId] = useState<string>('');
  const [allocSettlement, setAllocSettlement] = useState<'receivable'|'payable'|'other'>('receivable');
  const [allocSettlementAccountId, setAllocSettlementAccountId] = useState<string>('');
  const [allocDesc, setAllocDesc] = useState<string>('');
  const [allocationTx, setAllocationTx] = useState<any>(null);

  const [coaIncome, setCoaIncome] = useState<any[]>([]);
  const [coaExpense, setCoaExpense] = useState<any[]>([]);
  const [coaReceivable, setCoaReceivable] = useState<any[]>([]);
  const [coaPayable, setCoaPayable] = useState<any[]>([]);
  const [coaOther, setCoaOther] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [allocAccountSearch, setAllocAccountSearch] = useState<string>("");
  const [allocSettlementSearch, setAllocSettlementSearch] = useState<string>("");

  const [isVatRegistered, setIsVatRegistered] = useState(false);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [viewDetailsData, setViewDetailsData] = useState<any>(null);
  
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachmentsData, setAttachmentsData] = useState<any>(null);

  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [debitAccount, setDebitAccount] = useState("");
  const [creditAccount, setCreditAccount] = useState("");
  const [adjustmentFile, setAdjustmentFile] = useState<File | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [transactionToAdjust, setTransactionToAdjust] = useState<any>(null);

  // Attachments Logic
  const [fileList, setFileList] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  const loadAttachments = useCallback(async () => {
    if (!attachmentsData?.id) return;
    try {
      const { data, error } = await supabase
        .from('transaction_attachments' as any)
        .select('*')
        .eq('transaction_id', attachmentsData.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Attachments error:", error);
        // If table doesn't exist, we should probably let the user know, but gracefully
        if (error.code === '42P01') { // undefined_table
           console.warn("Table transaction_attachments does not exist");
        } else {
           toast({ 
             title: "Error loading attachments", 
             description: "Failed to load attachments. " + error.message,
             variant: "destructive" 
           });
        }
        return;
      }
      setFileList(data || []);
    } catch (error) {
      console.error("Error loading attachments:", error);
    }
  }, [attachmentsData?.id]);

  useEffect(() => {
    if (attachmentsOpen && attachmentsData) {
      loadAttachments();
    }
  }, [attachmentsOpen, attachmentsData, loadAttachments]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!attachmentsData) return;

    const file = e.target.files[0];
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${attachmentsData.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('transactions')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('transaction_attachments' as any)
        .insert({
          transaction_id: attachmentsData.id,
          file_name: file.name,
          file_path: fileName,
          file_size: file.size,
          content_type: file.type,
          // user_id will be handled by default or RLS if column exists and default matches
        });

      if (dbError) throw dbError;

      toast({ title: "Success", description: "File uploaded successfully" });
      loadAttachments();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (id: string, path: string) => {
    try {
      const { error: storageError } = await supabase.storage
        .from('transactions')
        .remove([path]);
      
      if (storageError) console.warn("Storage delete failed:", storageError);

      const { error: dbError } = await supabase
        .from('transaction_attachments' as any)
        .delete()
        .eq('id', id);

      if (dbError) throw dbError;

      toast({ title: "Success", description: "Attachment deleted" });
      loadAttachments();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const initiateAdjustment = (transaction: any) => {
    setTransactionToAdjust(transaction);
    setAdjustmentReason("");
    setAdjustmentDate(new Date().toISOString().split('T')[0]);
    setAdjustmentAmount(transaction.total_amount ? String(Math.abs(transaction.total_amount)) : "");
    // Default to bank as credit (paying out) and expense as debit if possible, or blank
    setDebitAccount("");
    setCreditAccount("");
    setAdjustmentFile(null);
    setAdjustmentOpen(true);
  };

  const handleAdjustment = async () => {
    if (!transactionToAdjust) return;
    
    if (!adjustmentReason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for the adjustment.", variant: "destructive" });
      return;
    }
    
    const amountVal = parseFloat(adjustmentAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
        toast({ title: "Invalid Amount", description: "Please enter a valid adjustment amount.", variant: "destructive" });
        return;
    }

    if (!debitAccount || !creditAccount) {
         toast({ title: "Accounts required", description: "Please select both Debit and Credit accounts for double entry.", variant: "destructive" });
         return;
    }

    if (debitAccount === creditAccount) {
        toast({ title: "Invalid Entry", description: "Debit and Credit accounts cannot be the same.", variant: "destructive" });
        return;
    }

    if (adjustmentFile && adjustmentFile.size > 500 * 1024) {
        toast({ title: "File too large", description: "File size must be less than 500KB.", variant: "destructive" });
        return;
    }

    setIsAdjusting(true);
    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required");

      let attachmentUrl = null;
      if (adjustmentFile) {
        const fileExt = adjustmentFile.name.split('.').pop();
        const filePath = `adjustments/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
            .from('transactions')
            .upload(filePath, adjustmentFile);
            
        if (uploadError) {
             // Try 'documents' bucket if transactions fails, or just warn
             console.warn("Upload failed to transactions bucket:", uploadError);
             const { error: retryError } = await supabase.storage
                .from('documents')
                .upload(filePath, adjustmentFile);
             
             if (!retryError) {
                 const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
                 attachmentUrl = data.publicUrl;
             }
        } else {
             const { data } = supabase.storage.from('transactions').getPublicUrl(filePath);
             attachmentUrl = data.publicUrl;
        }
      }

      const description = `Adjustment: ${adjustmentReason} ${attachmentUrl ? `[File: ${attachmentUrl}]` : ''}`;
      
      const newEntries = [
          { account_id: debitAccount, debit: amountVal, credit: 0, description, status: 'approved' },
          { account_id: creditAccount, debit: 0, credit: amountVal, description, status: 'approved' }
      ];

      const adjustmentData = {
        company_id: transactionToAdjust.company_id,
        transaction_date: adjustmentDate,
        description: description,
        reference_number: `ADJ-${transactionToAdjust.reference_number || Date.now()}`,
        transaction_type: 'adjustment', // Changed to 'adjustment' (lowercase) to match ledger constraint
        status: 'pending', // Set to pending first to allow entry creation
        total_amount: amountVal,
        // attachment_url: attachmentUrl // Uncomment if column exists
      };

      const { data: newTx, error: txError } = await supabase
        .from('transactions')
        .insert({
          company_id: adjustmentData.company_id,
          transaction_date: adjustmentData.transaction_date,
          description: adjustmentData.description,
          reference_number: adjustmentData.reference_number,
          transaction_type: adjustmentData.transaction_type,
          status: adjustmentData.status,
          total_amount: adjustmentData.total_amount,
          user_id: user.id
        })
        .select()
        .single();

      if (txError) throw txError;

      if (newTx && newEntries.length > 0) {
        const entriesWithTxId = newEntries.map((e: any) => ({
          ...e,
          transaction_id: newTx.id
        }));
        
        const { error: entriesError } = await supabase
          .from('transaction_entries')
          .insert(entriesWithTxId);
          
        if (entriesError) throw entriesError;

        // Update status to posted (for journal type) after entries are created
        const { error: updateError } = await supabase
          .from('transactions')
          .update({ status: 'posted' })
          .eq('id', newTx.id);
          
        if (updateError) throw updateError;
      }

      toast({ title: "Success", description: "Successfully adjusted." });
      setAdjustmentOpen(false);
      load();
    } catch (error: any) {
      console.error("Adjustment error:", error);
      toast({ title: "Error", description: error.message || "Failed to process adjustment.", variant: "destructive" });
    } finally {
      setIsAdjusting(false);
    }
  };

  // Edit Warning State
  const [editWarningOpen, setEditWarningOpen] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<any>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return;

      // Fetch company VAT status
      const { data: companyData } = await supabase
        .from("companies")
        .select("vat_number")
        .eq("id", profile.company_id)
        .single();
      
      setIsVatRegistered(!!(companyData?.vat_number));

      const start = page * pageSize;
      const end = start + pageSize - 1;

      let baseCountQuery = supabase
        .from("transactions")
        .select(`
          *,
          bank_account:bank_accounts(bank_name, account_number),
          entries:transaction_entries(
            id,
            account_id,
            debit,
            credit,
            description,
            status,
            chart_of_accounts(account_code, account_name)
          )
        `, { count: 'exact' })
        .eq("company_id", profile.company_id);

      let basePageQuery = supabase
        .from("transactions")
        .select(`
          *,
          bank_account:bank_accounts(bank_name, account_number),
          entries:transaction_entries(
            id,
            account_id,
            debit,
            credit,
            description,
            status,
            chart_of_accounts(account_code, account_name)
          )
        `)
        .eq("company_id", profile.company_id);

      if (searchTerm && searchTerm.trim().length > 0) {
        const term = `%${searchTerm.trim()}%`;
        baseCountQuery = baseCountQuery.or(`description.ilike.${term},reference_number.ilike.${term}`);
        basePageQuery = basePageQuery.or(`description.ilike.${term},reference_number.ilike.${term}`);
      }
      if (filterStatus !== "all") {
        baseCountQuery = baseCountQuery.eq("status", filterStatus);
        basePageQuery = basePageQuery.eq("status", filterStatus);
      }
      if (filterType !== "all") {
        if (filterType.toLowerCase() === "income") {
          baseCountQuery = baseCountQuery.gt("total_amount", 0);
          basePageQuery = basePageQuery.gt("total_amount", 0);
        } else if (filterType.toLowerCase() === "expense") {
          baseCountQuery = baseCountQuery.lt("total_amount", 0);
          basePageQuery = basePageQuery.lt("total_amount", 0);
        }
      }
      if (dateFrom) {
        baseCountQuery = baseCountQuery.gte("transaction_date", dateFrom);
        basePageQuery = basePageQuery.gte("transaction_date", dateFrom);
      }
      if (dateTo) {
        baseCountQuery = baseCountQuery.lte("transaction_date", dateTo);
        basePageQuery = basePageQuery.lte("transaction_date", dateTo);
      }
      if (sourceTab !== "all") {
        const s = sourceTab.toLowerCase();
        if (s === "invoice") {
          baseCountQuery = baseCountQuery.or(`transaction_type.eq.sales,description.ilike.%invoice%,reference_number.ilike.INV-%`);
          basePageQuery = basePageQuery.or(`transaction_type.eq.sales,description.ilike.%invoice%,reference_number.ilike.INV-%`);
        } else if (s === "purchase") {
          baseCountQuery = baseCountQuery.or(`transaction_type.eq.purchase,description.ilike.%purchase%,reference_number.ilike.PO%`);
          basePageQuery = basePageQuery.or(`transaction_type.eq.purchase,description.ilike.%purchase%,reference_number.ilike.PO%`);
        } else if (s === "csv") {
          baseCountQuery = baseCountQuery.or(`category.eq.Bank Import,description.ilike.%csv%,reference_number.ilike.%CSV%`);
          basePageQuery = basePageQuery.or(`category.eq.Bank Import,description.ilike.%csv%,reference_number.ilike.%CSV%`);
        } else if (s === "bank") {
          baseCountQuery = baseCountQuery.not("bank_account_id", "is", "null");
          basePageQuery = basePageQuery.not("bank_account_id", "is", "null");
        }
      }

      const { data, error, count } = await baseCountQuery.order("transaction_date", { ascending: false });
      const { data: pagedData, error: rangeError } = await basePageQuery
        .order("transaction_date", { ascending: false })
        .range(start, end);

      if (error) throw error;
      if (rangeError) throw rangeError;
      setItems(pagedData || []);
      setTotalCount(typeof count === 'number' ? count : ((pagedData && Array.isArray(pagedData) ? pagedData.length : 0)));
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, filterType, filterStatus, sourceTab, dateFrom, dateTo, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [searchTerm, filterType, filterStatus, sourceTab, dateFrom, dateTo, pageSize]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search || "");
      const flow = params.get("flow") || "";
      if (flow.toLowerCase() === "depreciation") {
        const assetId = params.get("asset_id") || "";
        const date = params.get("date") || new Date().toISOString().slice(0,10);
        const amount = params.get("amount") || "";
        const debitAccountId = params.get("debit_account_id") || "";
        const creditAccountId = params.get("credit_account_id") || "";
        const description = params.get("description") || "Depreciation";

        const prefill = {
          element: "depreciation",
          description,
          date,
          amount,
          debitAccount: debitAccountId,
          creditAccount: creditAccountId,
          vatRate: "0",
          paymentMethod: "accrual",
          assetId,
          depreciationMethod: params.get("depreciation_method") || "straight_line",
          usefulLifeYears: params.get("useful_life_years") || "5"
        };
        setPrefillData(prefill);
        setEditData(null);
        setHeadless(false);
        setOpen(true);
        return;
      }
      if (flow.toLowerCase() === "asset_disposal") {
        const assetId = params.get("asset_id") || "";
        const date = params.get("date") || new Date().toISOString().slice(0,10);
        const amount = params.get("amount") || "";
        const bankLedgerId = params.get("bank_ledger_id") || "";
        const assetAccountId = params.get("asset_account_id") || "";
        const description = params.get("description") || "Asset Disposal";

        (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data: profile } = await supabase
              .from("profiles")
              .select("company_id")
              .eq("user_id", user.id)
              .single();
            const companyId = (profile as any)?.company_id;
            if (!companyId) return;
            const { data: existing } = await supabase
              .from("chart_of_accounts")
              .select("id, account_code")
              .eq("company_id", companyId)
              .in("account_code", ["9500","9600"]);
            const hasGainNew = (existing || []).some((a: any) => String(a.account_code) === "9500");
            const hasLossNew = (existing || []).some((a: any) => String(a.account_code) === "9600");
            if (!hasGainNew) {
              await supabase
                .from("chart_of_accounts")
                .insert({ company_id: companyId, account_code: "9500", account_name: "Gain on Sale of Assets", account_type: "revenue", normal_balance: "credit", is_active: true });
            }
            if (!hasLossNew) {
              await supabase
                .from("chart_of_accounts")
                .insert({ company_id: companyId, account_code: "9600", account_name: "Loss on Sale of Assets", account_type: "expense", normal_balance: "debit", is_active: true });
            }
          } catch {}
        })();

        const prefill = {
          element: "asset_disposal",
          description,
          date,
          amount,
          bankAccountId: params.get("bank_id") || "",
          debitAccount: bankLedgerId || "",
          creditAccount: assetAccountId || "",
          vatRate: "0",
          paymentMethod: "bank",
          assetId
        };
        setPrefillData(prefill);
        setEditData(null);
        setHeadless(false);
        setOpen(true);
        return;
      }
      if (flow.toLowerCase() === "asset_purchase") {
        const date = params.get("date") || new Date().toISOString().slice(0,10);
        const amount = params.get("amount") || "";
        const debitAccountId = params.get("debit_account_id") || "";
        const bankLedgerId = params.get("bank_ledger_id") || "";
        const loanLedgerId = params.get("loan_ledger_id") || "";
        const bankId = params.get("bank_id") || "";
        const description = params.get("description") || "Asset Purchase";
        const usefulLifeYears = params.get("useful_life_years") || "5";
        const depreciationMethod = params.get("depreciation_method") || "straight_line";
        const interestRate = params.get("interest_rate") || "";
        const loanTerm = params.get("loan_term") || "";
        const loanTermType = params.get("loan_term_type") || "short";
        const vatRate = params.get("vat_rate") || "0";

        const creditAccount = bankLedgerId || loanLedgerId || "";
        const paymentMethod = bankLedgerId ? "bank" : "accrual";
        const prefill = {
          element: "asset",
          description,
          date,
          amount,
          bankAccountId: bankId,
          debitAccount: debitAccountId,
          creditAccount,
          vatRate,
          paymentMethod,
          depreciationMethod,
          usefulLifeYears,
          interestRate,
          loanTerm,
          loanTermType,
          assetFinancedByLoan: Boolean(loanLedgerId)
        };
        setPrefillData(prefill);
        setEditData(null);
        setHeadless(false);
        setOpen(true);
        return;
      }
    } catch {}
  }, [location.search]);

  useEffect(() => {
    (async () => {
      try {
        if (!allocationOpen && !newFlowOpen && !adjustmentOpen) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .single();
        const companyId = (profile as any)?.company_id;
        if (!companyId) return;
        const { data: accounts } = await supabase
          .from('chart_of_accounts')
          .select('id, account_code, account_name, account_type')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('account_code');
        const list = accounts || [];
        setCoaIncome(list.filter((a: any) => {
          const t = String(a.account_type || '').toLowerCase();
          return t === 'income' || t === 'revenue';
        }));
        setCoaExpense(list.filter((a: any) => String(a.account_type || '').toLowerCase() === 'expense'));
        setCoaReceivable(list.filter((a: any) => {
          const t = String(a.account_type || '').toLowerCase();
          const n = String(a.account_name || '').toLowerCase();
          return t === 'asset' && (n.includes('receivable') || n.includes('debtors'));
        }));
        setCoaPayable(list.filter((a: any) => {
          const t = String(a.account_type || '').toLowerCase();
          const n = String(a.account_name || '').toLowerCase();
          return t === 'liability' && (n.includes('payable') || n.includes('creditors'));
        }));
        setCoaOther(list.filter((a: any) => {
          const t = String(a.account_type || '').toLowerCase();
          return ['asset','liability','equity'].includes(t);
        }));
        const { data: bankList } = await supabase
          .from('bank_accounts')
          .select('id, bank_name, account_number')
          .eq('company_id', companyId)
          .order('bank_name');
        setBanks(bankList || []);
      } catch {}
    })();
  }, [allocationOpen, newFlowOpen, adjustmentOpen]);

  useEffect(() => {
    if (allocVatOn === 'no') setAllocVatRate('0');
  }, [allocVatOn]);

  useEffect(() => {
    if (allocVatOn === 'yes') {
      const r = Number(allocVatRate || '0');
      if (!r || r <= 0) setAllocVatRate('15');
    }
  }, [allocVatOn, allocVatRate]);

  useEffect(() => {
    if (allocPayment === 'accrual') {
      setAllocSettlement(allocType === 'income' ? 'receivable' : 'payable');
    }
  }, [allocPayment, allocType]);

  const derived = useMemo(() => {
    const tx = items.map(t => ({
      id: t.id,
      date: t.transaction_date,
      description: t.description,
      type: (t as any).transaction_type || (t.total_amount >= 0 ? "Income" : "Expense"),
      category: (t as any).category || "—",
      bank: (t as any).bank_account ? `${(t as any).bank_account.bank_name} (${(t as any).bank_account.account_number})` : "—",
      amount: (() => {
        const total = Number(t.total_amount || 0);
        const base = Number((t as any).base_amount || 0);
        const inclusive = Boolean((t as any).vat_inclusive);
        // Prefer posted VAT from entries
        const vatFromEntries = (t.entries || []).reduce((sum: number, e: any) => {
          const name = String(e.chart_of_accounts?.account_name || '').toLowerCase();
          if (!name.includes('vat')) return sum;
          return sum + Math.abs(Number(e.debit || 0) - Number(e.credit || 0));
        }, 0);
        const vaStored = (t as any).vat_amount;
        const ratePct = Number((t as any).vat_rate) || 0;
        const r = ratePct / 100;
        // Force recompute for VAT-inclusive rows when rate is available
        if (inclusive && r > 0) {
          const net = total / (1 + r);
          return Math.abs(net);
        }
        const vat = vatFromEntries > 0
          ? vatFromEntries
          : (typeof vaStored === 'number' && !Number.isNaN(vaStored))
            ? Math.abs(vaStored)
            : (base > 0 && r > 0) ? Math.abs(base * r) : 0;
        const net = base > 0 ? base : Math.max(0, total - vat);
        return Math.abs(net);
      })(),
      vatAmount: (() => {
        const total = Number(t.total_amount || 0);
        const inclusive = Boolean((t as any).vat_inclusive);
        const vatFromEntries = (t.entries || []).reduce((sum: number, e: any) => {
          const name = String(e.chart_of_accounts?.account_name || '').toLowerCase();
          if (!name.includes('vat')) return sum;
          return sum + Math.abs(Number(e.debit || 0) - Number(e.credit || 0));
        }, 0);
        if (vatFromEntries > 0) return vatFromEntries;
        const va = (t as any).vat_amount;
        if (typeof va === 'number' && !Number.isNaN(va) && va !== 0) return Math.abs(va);
        const ratePct = Number((t as any).vat_rate) || 0;
        const r = ratePct / 100;
        const base = Number((t as any).base_amount) || 0;
        if (inclusive && r > 0) {
          const net = total / (1 + r);
          return Math.abs(total - net);
        }
        if (r > 0 && base > 0) return Math.abs(base * r);
        return 0;
      })(),
      reference: t.reference_number || "—",
      statusKey: t.status, // raw DB status
      statusLabel: t.status === 'approved' ? 'Approved' : t.status === 'pending' ? 'Pending' : t.status === 'unposted' ? 'Unposted' : t.status === 'rejected' ? 'Rejected' : t.status.charAt(0).toUpperCase() + t.status.slice(1),
      source: (() => {
        const ref = String(t.reference_number || "").toUpperCase();
        const desc = String(t.description || "").toLowerCase();
        const hasBank = Boolean(t.bank_account_id);
          if (ref.startsWith("INV-") || desc.includes("invoice")) return "invoice" as const;
          if ((t as any).transaction_type === 'purchase' || desc.includes('purchase') || ref.startsWith('PO') || desc.includes('po ')) return "purchase" as const;
          if ((t as any).category === 'Bank Import' || desc.includes('csv') || ref.includes('CSV')) return "csv" as const;
          if (hasBank || desc.includes("bank statement")) return "bank" as const;
          return "manual" as const;
      })()
    }));

    const filtered = tx.filter(transaction => {
      const matchesSearch = transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.reference.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === "all" || transaction.type.toLowerCase() === filterType.toLowerCase();
      const matchesStatus = filterStatus === "all" || (transaction as any).statusKey.toLowerCase() === filterStatus.toLowerCase();
      const matchesSource = sourceTab === "all" || transaction.source === sourceTab;
      return matchesSearch && matchesType && matchesStatus && matchesSource;
    });

    const totalIncome = filtered.filter(t => t.type === "Income").reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = filtered.filter(t => t.type === "Expense").reduce((sum, t) => sum + t.amount, 0);
    return { filtered, totalIncome, totalExpenses };
  }, [items, searchTerm, filterType, filterStatus, sourceTab]);

  const approveOrOpenForm = async (id: string) => {
    try {
      const { data: entries } = await supabase
        .from("transaction_entries")
        .select("id")
        .eq("transaction_id", id)
        .limit(1);
      if (entries && entries.length > 0) {
        await setTransactionStatus(id, 'approved');
        await load();
        return;
      }
      const full = items.find(i => i.id === id) || null;
      setEditData(full);
      setOpen(true);
    } catch {
      const full = items.find(i => i.id === id) || null;
      setEditData(full);
      setOpen(true);
    }
  };

  const setTransactionStatus = async (id: string, status: 'approved' | 'pending' | 'rejected' | 'unposted') => {
    // Lock check for approval
    if (status === 'approved') {
      const tx = items.find(t => t.id === id);
      if (tx && isDateLocked(tx.transaction_date)) {
        setIsLockDialogOpen(true);
        return;
      }
    }

    setPosting(prev => ({ ...prev, [id]: true }));
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated.");

      // Handle approval workflow: ensure double-entry exists, post to ledger, then mark approved
      if (status === 'approved') {
        const { data: transaction, error: txFetchError } = await supabase
          .from("transactions")
          .select("*")
          .eq("id", id)
          .single();
        if (txFetchError) throw txFetchError;
        if (!transaction) throw new Error("Transaction not found");

        // Load existing entries
        const { data: entries, error: entriesError } = await supabase
          .from("transaction_entries")
          .select("account_id, debit, credit, description")
          .eq("transaction_id", id);
        if (entriesError) throw entriesError;
        let computedEntries = entries || [];

        // If no entries exist, try to auto-create from header debit/credit accounts.
        // If missing, fall back to transaction_type_mappings, then heuristic chart_of_accounts.
        if (!entries || entries.length === 0) {
          let debitAccountId = (transaction as any).debit_account_id as string | null | undefined;
          let creditAccountId = (transaction as any).credit_account_id as string | null | undefined;
          const amount = Math.abs(transaction.total_amount || 0);

          // Company context required for fallbacks
          let companyId: string | null = null;
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("company_id")
              .eq("user_id", user.id)
              .single();
            companyId = (prof as any)?.company_id || null;
          } catch {}

          // Fallback 1: transaction_type_mappings
          if ((!debitAccountId || !creditAccountId) && companyId && (transaction as any).transaction_type) {
            const { data: mapping } = await (supabase as any)
              .from("transaction_type_mappings")
              .select("debit_account_id, credit_account_id")
              .eq("company_id", companyId)
              .eq("transaction_type", (transaction as any).transaction_type)
              .maybeSingle();
            debitAccountId = debitAccountId || (mapping as any)?.debit_account_id || null;
            creditAccountId = creditAccountId || (mapping as any)?.credit_account_id || null;
          }

          // Fallback 2: heuristic based on chart_of_accounts
          if ((!debitAccountId || !creditAccountId) && companyId) {
            const { data: accounts } = await supabase
              .from("chart_of_accounts")
              .select("id, account_name, account_type")
              .eq("company_id", companyId)
              .eq("is_active", true);

            const bank = (accounts || []).find(a => a.account_type === 'asset' && a.account_name.toLowerCase().includes('bank'))
              || (accounts || []).find(a => a.account_type === 'asset' && a.account_name.toLowerCase().includes('cash'));
            const income = (accounts || []).find(a => a.account_type === 'income');
            const expense = (accounts || []).find(a => a.account_type === 'expense');

            const isIncome = Number(transaction.total_amount || 0) >= 0;
            if (!debitAccountId) {
              debitAccountId = isIncome ? (bank as any)?.id || null : (expense as any)?.id || null;
            }
            if (!creditAccountId) {
              creditAccountId = isIncome ? (income as any)?.id || null : (bank as any)?.id || null;
            }
          }

          if (!debitAccountId || !creditAccountId) {
            throw new Error("Missing debit/credit accounts. Set mapping in Chart of Accounts or edit transaction to assign accounts.");
          }

          // Check if transaction has VAT and get VAT account
          let vatAccount = null;
          let vatAmount = 0;
          let netAmount = amount;
          
          if ((transaction as any).vat_rate > 0 && (transaction as any).vat_amount > 0) {
            vatAmount = (transaction as any).vat_amount;
            netAmount = amount - vatAmount;
            
            // Find VAT account
            const { data: vatAccounts } = await supabase
              .from("chart_of_accounts")
              .select("id, account_name, account_code")
              .eq("company_id", companyId)
              .or('account_name.ilike.%vat%,account_name.ilike.%tax%')
              .limit(1);
            
            if (vatAccounts && vatAccounts.length > 0) {
              vatAccount = vatAccounts[0];
            }
          }

          let newEntries = [];
          
          if (vatAccount && vatAmount > 0) {
            // VAT-aware entries
            const isIncome = Number(transaction.total_amount || 0) >= 0;
            
            if (isIncome) {
              // Income with VAT: Debit Bank (total), Credit Income (net), Credit VAT Output (vat)
              newEntries = [
                {
                  transaction_id: id,
                  account_id: debitAccountId, // Bank account
                  debit: amount,
                  credit: 0,
                  description: transaction.description,
                  status: 'approved'
                },
                {
                  transaction_id: id,
                  account_id: creditAccountId, // Income account
                  debit: 0,
                  credit: netAmount,
                  description: transaction.description,
                  status: 'approved'
                },
                {
                  transaction_id: id,
                  account_id: vatAccount.id, // VAT Output account
                  debit: 0,
                  credit: vatAmount,
                  description: 'VAT Output',
                  status: 'approved'
                }
              ];
            } else {
              // Expense with VAT: Debit Expense (net), Debit VAT Input (vat), Credit Bank (total)
              newEntries = [
                {
                  transaction_id: id,
                  account_id: debitAccountId, // Expense account
                  debit: netAmount,
                  credit: 0,
                  description: transaction.description,
                  status: 'approved'
                },
                {
                  transaction_id: id,
                  account_id: vatAccount.id, // VAT Input account
                  debit: vatAmount,
                  credit: 0,
                  description: 'VAT Input',
                  status: 'approved'
                },
                {
                  transaction_id: id,
                  account_id: creditAccountId, // Bank account
                  debit: 0,
                  credit: amount,
                  description: transaction.description,
                  status: 'approved'
                }
              ];
            }
          } else {
            // No VAT - simple double entry
            newEntries = [
              {
                transaction_id: id,
                account_id: debitAccountId,
                debit: amount,
                credit: 0,
                description: transaction.description,
                status: 'approved'
              },
              {
                transaction_id: id,
                account_id: creditAccountId,
                debit: 0,
                credit: amount,
                description: transaction.description,
                status: 'approved'
              }
            ];
          }
          const { error: insertEntriesError } = await supabase
            .from("transaction_entries")
            .insert(newEntries);
          if (insertEntriesError) throw insertEntriesError;
          computedEntries = newEntries.map(e => ({
            account_id: e.account_id,
            debit: e.debit,
            credit: e.credit,
            description: e.description,
          }));
        }

        // Validate double-entry balance
        const totalDebits = (computedEntries || []).reduce((sum: number, e: any) => sum + (Number(e.debit) || 0), 0);
        const totalCredits = (computedEntries || []).reduce((sum: number, e: any) => sum + (Number(e.credit) || 0), 0);
        if (Number(totalDebits.toFixed(2)) !== Number(totalCredits.toFixed(2))) {
          throw new Error("Unbalanced transaction entries; approval blocked. Please fix entries.");
        }

        // Company context
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .single();
        if (profileError) throw profileError;
        if (!profile?.company_id) throw new Error("Company context not found for user.");

        // Idempotency: remove previous ledger entries for this transaction
        await supabase.from("ledger_entries").delete().eq("reference_id", id);
        await supabase.from("ledger_entries").delete().eq("transaction_id", id);

        // Insert into ledger_entries
        const ledgerEntries = (computedEntries || []).map((e: any) => ({
          company_id: profile.company_id,
          account_id: e.account_id,
          entry_date: transaction.transaction_date,
          description: e.description || transaction.description,
          debit: e.debit,
          credit: e.credit,
          reference_id: id,
          transaction_id: id
        }));
        if (ledgerEntries.length === 0) {
          throw new Error("No ledger entries generated; approval aborted.");
        }
        const { error: ledgerError } = await supabase.from("ledger_entries").insert(ledgerEntries as any);
        if (ledgerError) throw ledgerError;

        if ((transaction as any).bank_account_id) {
          const bankAccountId = (transaction as any).bank_account_id as string;
          const accountIds = (computedEntries || []).map((e: any) => e.account_id);
          let { data: acctInfos } = await supabase
            .from("chart_of_accounts")
            .select("id, account_type, account_name")
            .in("id", accountIds as any);
          acctInfos = acctInfos || [];
          const isDebitBank = (computedEntries || []).some((e: any) => {
            const a = acctInfos.find((x: any) => x.id === e.account_id);
            return a && String(a.account_type || '').toLowerCase() === 'asset' && String(a.account_name || '').toLowerCase().includes('bank') && Number(e.debit || 0) > 0;
          });
          const isCreditBank = (computedEntries || []).some((e: any) => {
            const a = acctInfos.find((x: any) => x.id === e.account_id);
            return a && String(a.account_type || '').toLowerCase() === 'asset' && String(a.account_name || '').toLowerCase().includes('bank') && Number(e.credit || 0) > 0;
          });
          const bankDebitAmount = (computedEntries || []).reduce((sum: number, e: any) => {
            const a = acctInfos.find((x: any) => x.id === e.account_id);
            const isBank = a && String(a.account_type || '').toLowerCase() === 'asset' && String(a.account_name || '').toLowerCase().includes('bank');
            return sum + (isBank ? Number(e.debit || 0) : 0);
          }, 0);
          const bankCreditAmount = (computedEntries || []).reduce((sum: number, e: any) => {
            const a = acctInfos.find((x: any) => x.id === e.account_id);
            const isBank = a && String(a.account_type || '').toLowerCase() === 'asset' && String(a.account_name || '').toLowerCase().includes('bank');
            return sum + (isBank ? Number(e.credit || 0) : 0);
          }, 0);
          if (isDebitBank && bankDebitAmount > 0) {
            try { await supabase.rpc('update_bank_balance', { _bank_account_id: bankAccountId, _amount: bankDebitAmount, _operation: 'add' }); } catch {}
          } else if (isCreditBank && bankCreditAmount > 0) {
            try { await supabase.rpc('update_bank_balance', { _bank_account_id: bankAccountId, _amount: bankCreditAmount, _operation: 'subtract' }); } catch {}
          }
        }

        // Mark transaction and entries as approved only after successful ledger post
        const { error: updateTxError } = await supabase
          .from("transactions")
          .update({ status: 'approved' })
          .eq("id", id);
        if (updateTxError) throw updateTxError;

        const { error: updateEntriesError } = await supabase
          .from("transaction_entries")
          .update({ status: 'approved' })
          .eq("transaction_id", id);
        if (updateEntriesError) throw updateEntriesError;

        // Optional: refresh AFS cache if available
        try {
          await supabase.rpc('refresh_afs_cache', { _company_id: profile.company_id });
        } catch {}

      } else {
        // Pending or rejected: update status and clean up ledger postings
        const { error: updateTxError } = await supabase
          .from("transactions")
          .update({ status })
          .eq("id", id);
        if (updateTxError) throw updateTxError;

        const { error: updateEntriesError } = await supabase
          .from("transaction_entries")
          .update({ status })
          .eq("transaction_id", id);
        if (updateEntriesError) throw updateEntriesError;

        await supabase.from("ledger_entries").delete().eq("reference_id", id);
      }

      toast({ title: "Success", description: `Allocation ${status}` });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPosting(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleExport = () => {
    const exportData = derived.filtered.map(t => ({
      date: t.date,
      description: t.description,
      type: t.type,
      amount: t.amount,
      vatAmount: t.vatAmount,
      reference: t.reference
    }));
    
    if (confirm("Export as Excel or PDF? (OK = Excel, Cancel = PDF)")) {
      exportTransactionsToExcel(exportData);
    } else {
      exportTransactionsToPDF(exportData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">

        <Suspense fallback={null}>
          <TransactionFormLazy
            open={open}
            onOpenChange={setOpen}
            onSuccess={load}
            editData={editData}
            prefill={prefillData}
            headless={headless}
          />
        </Suspense>

        <Dialog open={newFlowOpen} onOpenChange={(v) => { setNewFlowOpen(v); if (!v) { setQuickType(null); setQuickAmount(''); setQuickDesc(''); } }}>
          <DialogContent className="sm:max-w-[700px] overflow-hidden p-0 gap-0">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
            <DialogHeader className="p-6 pb-4 bg-muted/5">
              <DialogTitle className="text-xl flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </div>
                Start an Allocation
              </DialogTitle>
              <DialogDescription>
                Choose the type of allocation you want to record.
              </DialogDescription>
            </DialogHeader>
            <div className="p-6 pt-2 max-h-[70vh] overflow-y-auto">
            {!quickType ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { id: 'income', label: 'Income Received', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-200' },
                  { id: 'expense', label: 'Expense Payment', icon: TrendingDown, color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'hover:border-rose-200' },
                  { id: 'receipt', label: 'Receivable Collection', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'hover:border-blue-200' },
                  { id: 'product_purchase', label: 'Product Purchase', icon: ShoppingCart, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'hover:border-indigo-200' },
                  { id: 'asset', label: 'Asset Purchase', icon: Wallet, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'hover:border-purple-200' },
                  { id: 'liability', label: 'Liability Payment', icon: CreditCard, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'hover:border-amber-200' },
                  { id: 'equity', label: 'Equity / Capital', icon: PieChart, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'hover:border-cyan-200' },
                  { id: 'loan_received', label: 'Loan Received', icon: Landmark, color: 'text-teal-500', bg: 'bg-teal-500/10', border: 'hover:border-teal-200' },
                  { id: 'loan_repayment', label: 'Loan Repayment', icon: ArrowUpRight, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'hover:border-orange-200' },
                  { id: 'loan_interest', label: 'Loan Interest', icon: Percent, color: 'text-pink-500', bg: 'bg-pink-500/10', border: 'hover:border-pink-200' },
                  { id: 'depreciation', label: 'Depreciation', icon: ArrowDownLeft, color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'hover:border-slate-200' },
                  { id: 'asset_disposal', label: 'Asset Disposal', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', border: 'hover:border-red-200' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setQuickType(item.id as any)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-3 p-4 rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md hover:scale-[1.02]",
                      item.border
                    )}
                  >
                    <div className={cn("p-3 rounded-full", item.bg, item.color)}>
                      <item.icon className="h-6 w-6" />
                    </div>
                    <span className="font-medium text-sm text-center">{item.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                   <Button variant="ghost" size="sm" onClick={() => { setQuickType(null); setQuickAmount(''); setQuickDesc(''); }} className="gap-1 pl-0 hover:bg-transparent hover:text-primary">
                     <ArrowLeft className="h-4 w-4" /> Back
                   </Button>
                   <div className="h-4 w-px bg-border mx-2" />
                   <h3 className="font-semibold text-lg">
                     {quickType === 'income' ? 'Record Income' : 
                      quickType === 'expense' ? 'Record Expense' : 
                      quickType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                   </h3>
                </div>
                {(quickType === 'product_purchase' || quickType === 'asset' || quickType === 'asset_disposal' || quickType === 'depreciation' || (quickType && quickType.startsWith('loan_'))) && (
                  <div className="relative p-6 border rounded-lg bg-muted/30 overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none opacity-10 flex items-center justify-center">
                      <img src="/logo.png" alt="Rigel Business" className="h-32 w-32 rounded-lg object-cover" />
                    </div>
                    <div className="relative space-y-3">
                      {quickType === 'product_purchase' ? (
                        <>
                          <h3 className="text-lg font-semibold">Purchase Module</h3>
                          <p className="text-sm text-muted-foreground">
                            To purchase products, please use the Purchase module. All product purchases are recorded and managed there for accurate inventory and VAT posting.
                          </p>
                          <div className="flex justify-end">
                            <Button onClick={() => { setNewFlowOpen(false); navigate('/purchase'); }}>Go to Purchase Module</Button>
                          </div>
                        </>
                      ) : quickType === 'asset' ? (
                        <>
                          <h3 className="text-lg font-semibold">Fixed Asset Register</h3>
                          <p className="text-sm text-muted-foreground">
                            Record asset purchases in the Fixed Asset Register. Add new and opening balances, dispose assets, and calculate depreciation for accurate financials.
                          </p>
                          <div className="flex justify-end">
                            <Button onClick={() => { setNewFlowOpen(false); navigate('/fixed-assets'); }}>Go to Fixed Asset Register</Button>
                          </div>
                        </>
                      ) : quickType === 'asset_disposal' ? (
                        <>
                          <h3 className="text-lg font-semibold">Asset Disposal</h3>
                          <p className="text-sm text-muted-foreground">
                            Dispose fixed assets from the Fixed Asset Register. The system will post gain or loss and update accumulated depreciation.
                          </p>
                          <div className="flex justify-end">
                            <Button onClick={() => { setNewFlowOpen(false); navigate('/fixed-assets'); }}>Go to Fixed Asset Register</Button>
                          </div>
                        </>
                      ) : quickType === 'depreciation' ? (
                        <>
                          <h3 className="text-lg font-semibold">Depreciation</h3>
                          <p className="text-sm text-muted-foreground">
                            Calculate and post periodic depreciation in the Fixed Asset Register to keep your financials accurate.
                          </p>
                          <div className="flex justify-end">
                            <Button onClick={() => { setNewFlowOpen(false); navigate('/fixed-assets'); }}>Go to Fixed Asset Register</Button>
                          </div>
                        </>
                      ) : quickType === 'loan_received' ? (
                        <>
                          <h3 className="text-lg font-semibold">Loan Received</h3>
                          <p className="text-sm text-muted-foreground">
                            Manage loans in the Loans module: record loan receipts, set interest rates, and track outstanding balances.
                          </p>
                          <div className="flex justify-end">
                            <Button onClick={() => { setNewFlowOpen(false); navigate('/loans'); }}>Go to Loans</Button>
                          </div>
                        </>
                      ) : quickType === 'loan_repayment' ? (
                        <>
                          <h3 className="text-lg font-semibold">Loan Repayment</h3>
                          <p className="text-sm text-muted-foreground">
                            Record principal repayments and keep your loan schedules up to date in the Loans module.
                          </p>
                          <div className="flex justify-end">
                            <Button onClick={() => { setNewFlowOpen(false); navigate('/loans'); }}>Go to Loans</Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold">Loan Interest</h3>
                          <p className="text-sm text-muted-foreground">
                            Post loan interest charges and reconcile payments in the Loans module.
                          </p>
                          <div className="flex justify-end">
                            <Button onClick={() => { setNewFlowOpen(false); navigate('/loans'); }}>Go to Loans</Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {!(quickType === 'product_purchase' || quickType === 'asset' || quickType === 'asset_disposal' || quickType === 'depreciation' || (quickType && quickType.startsWith('loan_'))) && (
                <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="font-semibold text-foreground/80">Date</Label>
                    <Input type="date" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} className="h-11 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-semibold text-foreground/80">Amount</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">R</span>
                      <Input type="number" value={quickAmount} onChange={(e) => setQuickAmount(e.target.value)} placeholder="0.00" className="pl-7 h-11 font-mono text-lg transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-foreground/80">Description</Label>
                  <Input value={quickDesc} onChange={(e) => setQuickDesc(e.target.value)} placeholder={quickType === 'expense' ? 'Expense details' : 'Description'} className="h-11 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50" />
                </div>
                </>
                )}
                {(quickType === 'expense' || quickType === 'income') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>VAT</Label>
                      <div className="relative">
                        <Select 
                          value={!isVatRegistered ? 'no' : quickVatOn} 
                          onValueChange={(v: any) => setQuickVatOn(v)}
                          disabled={!isVatRegistered}
                        >
                          <SelectTrigger className={!isVatRegistered ? "bg-muted text-muted-foreground opacity-70" : ""}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                        {!isVatRegistered && (
                          <div className="absolute inset-y-0 right-8 flex items-center pointer-events-none">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label>VAT Rate (%)</Label>
                      <Input type="number" min="0" max="100" value={quickVatRate} onChange={(e) => setQuickVatRate(e.target.value)} />
                    </div>
                  </div>
                )}
                {(quickType === 'expense' || quickType === 'income' || quickType === 'equity') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Payment Method</Label>
                      <Select value={quickPayment} onValueChange={(v: any) => setQuickPayment(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="accrual">Accrual</SelectItem>
                          {quickType === 'equity' && (
                            <SelectItem value="asset">Asset Contribution</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {quickPayment === 'cash' && (
                      <div>
                        <Label>Bank</Label>
                        <Select value={quickBankId} onValueChange={(v: any) => setQuickBankId(v)}>
                          <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                          <SelectContent>
                            {banks.length === 0 ? (
                              <SelectItem value="__none__" disabled>No bank accounts</SelectItem>
                            ) : (
                              banks.map(b => (
                                <SelectItem key={b.id} value={String(b.id)}>{b.bank_name} ({b.account_number})</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
                {quickType === 'expense' && (
                  <div>
                    <Label>Expense Account</Label>
                    <Select value={quickExpenseAccountId} onValueChange={(v: any) => setQuickExpenseAccountId(v)}>
                      <SelectTrigger><SelectValue placeholder="Select expense account" /></SelectTrigger>
                      <SelectContent>
                        {coaExpense.map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.account_code} • {a.account_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {quickType === 'expense' && quickPayment === 'accrual' && (
                  <div>
                    <Label>Payable Account</Label>
                    <Select value={quickPayableAccountId} onValueChange={(v: any) => setQuickPayableAccountId(v)}>
                      <SelectTrigger><SelectValue placeholder="Select payable account" /></SelectTrigger>
                      <SelectContent>
                        {coaPayable.map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.account_code} • {a.account_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {quickType === 'liability' && (
                  <div>
                    <Label>Liability Account</Label>
                    <Select value={quickPayableAccountId} onValueChange={(v: any) => setQuickPayableAccountId(v)}>
                      <SelectTrigger><SelectValue placeholder="Select liability account" /></SelectTrigger>
                      <SelectContent>
                        {coaPayable.map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.account_code} • {a.account_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {quickType === 'income' && (
                  <div>
                    <Label>Income Account</Label>
                    <Select value={quickIncomeAccountId} onValueChange={(v: any) => setQuickIncomeAccountId(v)}>
                      <SelectTrigger><SelectValue placeholder="Select income account" /></SelectTrigger>
                      <SelectContent>
                        {coaIncome.map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.account_code} • {a.account_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {quickType === 'equity' && (
                  <div>
                    <Label>Equity Account</Label>
                    <Select value={quickEquityAccountId} onValueChange={(v: any) => setQuickEquityAccountId(v)}>
                      <SelectTrigger><SelectValue placeholder="Select equity account" /></SelectTrigger>
                      <SelectContent>
                        {coaOther.filter((a: any) => String(a.type || a.account_type || '').toLowerCase() === 'equity').map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.account_code} • {a.account_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {quickType === 'equity' && quickPayment === 'asset' && (
                  <div>
                    <Label>Asset Account (Director Contribution)</Label>
                    <Select value={quickAssetAccountId} onValueChange={(v: any) => setQuickAssetAccountId(v)}>
                      <SelectTrigger><SelectValue placeholder="Select asset account" /></SelectTrigger>
                      <SelectContent>
                        {coaOther.filter((a: any) => String(a.type || a.account_type || '').toLowerCase() === 'asset' && !String(a.account_name || '').toLowerCase().includes('accumulated')).map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.account_code} • {a.account_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {quickType === 'equity' && quickPayment === 'asset' && (() => { const sel = coaOther.find((a: any) => String(a.id) === String(quickAssetAccountId)); return fixedAssetCodes.includes(String(sel?.account_code || '')); })() && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Useful Life (years)</Label>
                      <Input type="number" min="1" value={quickUsefulLifeYears} onChange={(e) => setQuickUsefulLifeYears(e.target.value)} />
                    </div>
                    <div>
                      <Label>Depreciation Method</Label>
                      <Select value={quickDepMethod} onValueChange={(v: any) => setQuickDepMethod(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="straight_line">Straight Line</SelectItem>
                          <SelectItem value="diminishing">Diminishing Balance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Useful Life Start Date</Label>
                      <Input type="date" value={quickUsefulLifeStartDate} onChange={(e) => setQuickUsefulLifeStartDate(e.target.value)} />
                    </div>
                  </div>
                )}
                {quickType === 'liability' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Payment Method</Label>
                      <Select value={quickPayment} onValueChange={(v: any) => setQuickPayment(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Bank</Label>
                      <Select value={quickBankId} onValueChange={(v: any) => setQuickBankId(v)}>
                        <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                        <SelectContent>
                          {banks.length === 0 ? (
                            <SelectItem value="__none__" disabled>No bank accounts</SelectItem>
                          ) : (
                            banks.map(b => (
                              <SelectItem key={b.id} value={String(b.id)}>{b.bank_name} ({b.account_number})</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                {(quickType === 'receipt' || (quickType === 'income' && quickPayment === 'accrual')) && (
                  <div>
                    <Label>Receivable Account</Label>
                    <Select value={quickReceivableAccountId} onValueChange={(v: any) => setQuickReceivableAccountId(v)}>
                      <SelectTrigger><SelectValue placeholder="Select receivable account" /></SelectTrigger>
                      <SelectContent>
                        {coaReceivable.map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.account_code} • {a.account_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {!(quickType === 'product_purchase' || quickType === 'asset' || quickType === 'asset_disposal' || quickType === 'depreciation' || (quickType && quickType.startsWith('loan_'))) && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setQuickType(null); setQuickAmount(''); setQuickDesc(''); }}>Back</Button>
                  <Button onClick={() => {
                    const desc = String(quickDesc || '').trim();
                    if (!desc) { toast({ title: 'Description required', description: 'Please enter a description before proceeding', variant: 'destructive' }); return; }
                    
                    if (quickVatOn === 'yes' && !isVatRegistered) {
                        toast({ title: "VAT Error", description: "You cannot add VAT to a business that is not registered for VAT.", variant: "destructive" });
                        return;
                    }

                    const amtNum = Number(quickAmount || '0');
                    if (!amtNum || amtNum <= 0) { toast({ title: 'Amount required', description: 'Enter a valid amount', variant: 'destructive' }); return; }
                    const pf: any = {
                      date: quickDate,
                      description: desc,
                      element: quickType,
                      paymentMethod: (quickPayment === 'cash' ? 'bank' : quickPayment),
                      amount: String(amtNum.toFixed(2)),
                      ...(quickType === 'expense' || quickType === 'income' ? {
                        vatRate: quickVatOn === 'yes' ? String(Number(quickVatRate || '0')) : '0',
                        amountIncludesVAT: quickVatOn === 'yes'
                      } : {})
                    };
                    if (quickType === 'expense') {
                      pf.debitAccount = quickExpenseAccountId || "";
                      if (quickPayment === 'cash') {
                        pf.creditAccount = "";
                        pf.bankAccountId = String(quickBankId || "");
                      } else {
                        pf.creditAccount = quickPayableAccountId || "";
                        pf.bankAccountId = "";
                      }
                    } else if (quickType === 'income') {
                      pf.creditAccount = quickIncomeAccountId || "";
                      if (quickPayment === 'cash') {
                        pf.debitAccount = "";
                        pf.bankAccountId = String(quickBankId || "");
                      } else {
                        pf.debitAccount = quickReceivableAccountId || "";
                        pf.bankAccountId = "";
                      }
                    } else if (quickType === 'equity') {
                      pf.creditAccount = quickEquityAccountId || "";
                      if (quickPayment === 'cash') {
                        pf.debitAccount = "";
                        pf.bankAccountId = String(quickBankId || "");
                      } else if (quickPayment === 'accrual') {
                        pf.debitAccount = quickReceivableAccountId || "";
                        pf.bankAccountId = "";
                      } else {
                        // Asset contribution
                        pf.debitAccount = quickAssetAccountId || "";
                        pf.bankAccountId = "";
                        {
                          const sel = coaOther.find((a: any) => String(a.id) === String(quickAssetAccountId));
                          if (fixedAssetCodes.includes(String(sel?.account_code || ''))) {
                            pf.usefulLifeYears = quickUsefulLifeYears;
                            pf.depreciationMethod = quickDepMethod;
                            pf.usefulLifeStartDate = quickUsefulLifeStartDate;
                          }
                        }
                      }
                    } else if (quickType === 'receipt') {
                      pf.debitAccount = quickPayment === 'cash' ? "" : "";
                      pf.creditAccount = quickReceivableAccountId || "";
                      if (quickPayment === 'cash') pf.bankAccountId = String(quickBankId || "");
                    } else if (quickType === 'liability') {
                      pf.debitAccount = quickPayableAccountId || "";
                      pf.creditAccount = "";
                      pf.bankAccountId = String(quickBankId || "");
                      pf.paymentMethod = 'bank';
                    }
                    setPrefillData(pf);
                    setNewFlowOpen(false);
                    setOpen(true);
                  }}>Next</Button>
                </DialogFooter>
                )}
              </div>
            )}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={allocationOpen} onOpenChange={setAllocationOpen}>
          <DialogContent className="sm:max-w-[900px] border-none shadow-2xl p-0 overflow-hidden gap-0">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
            
            <div className="grid md:grid-cols-5 h-full">
              {/* Left Side: Summary & Basics */}
              <div className="md:col-span-2 bg-muted/30 p-6 border-r flex flex-col gap-6">
                 <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary shadow-sm border border-primary/20">
                      <SlidersHorizontal className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-lg leading-tight">Allocation</h2>
                      <p className="text-xs text-muted-foreground">Categorize this transaction</p>
                    </div>
                 </div>

                 <Card className="shadow-sm border-primary/20 bg-background/50">
                    <CardHeader className="p-4 pb-2">
                       <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Amount</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                       <div className="text-3xl font-bold text-primary tabular-nums tracking-tight">
                         R {Number(allocationTx?.total_amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                       </div>
                    </CardContent>
                 </Card>

                 <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">Allocation Date</Label>
                      <div className="relative">
                         <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <Input type="date" value={allocDate} onChange={(e) => setAllocDate(e.target.value)} className="pl-9 bg-background" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">Description</Label>
                      <Textarea 
                        value={allocDesc} 
                        onChange={(e) => setAllocDesc(e.target.value)} 
                        placeholder="Enter description..." 
                        className="bg-background resize-none min-h-[80px]" 
                      />
                    </div>
                 </div>
              </div>

              {/* Right Side: Allocation Logic */}
              <div className="md:col-span-3 p-6 space-y-6 bg-background">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <Label className="flex items-center gap-2">
                          <Filter className="h-3.5 w-3.5 text-primary" />
                          Allocation Type
                       </Label>
                       <Select value={allocType} onValueChange={(v: any) => setAllocType(v)}>
                        <SelectTrigger className="bg-muted/10 border-muted-foreground/20 h-10">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="income">Income Received</SelectItem>
                          <SelectItem value="expense">Expense Payment</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                       <Label className="flex items-center gap-2">
                          <CreditCard className="h-3.5 w-3.5 text-primary" />
                          Payment Method
                       </Label>
                       <Select value={allocPayment} onValueChange={(v: any) => setAllocPayment(v)}>
                        <SelectTrigger className="bg-muted/10 border-muted-foreground/20 h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash / Bank</SelectItem>
                          <SelectItem value="accrual">Accrual (Credit)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                 </div>

                 {allocPayment === 'cash' && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                      <Label className="flex items-center gap-2">
                         <Wallet className="h-3.5 w-3.5 text-primary" />
                         Bank Account
                      </Label>
                      <Select value={allocBankId} onValueChange={(v: any) => setAllocBankId(v)}>
                        <SelectTrigger className="bg-muted/10 border-muted-foreground/20 h-10"><SelectValue placeholder="Select Bank Account" /></SelectTrigger>
                        <SelectContent>
                          {banks.map(b => (
                            <SelectItem key={b.id} value={String(b.id)}>{b.bank_name} ({b.account_number})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                 )}

                 <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                       <BookOpen className="h-3.5 w-3.5 text-primary" />
                       {allocType === 'income' ? 'Income Account' : 'Expense Account'}
                    </Label>
                    <AccountCombobox 
                       accounts={allocType === 'income' ? coaIncome : coaExpense}
                       value={allocAccountId}
                       onChange={setAllocAccountId}
                       placeholder={allocType === 'income' ? "Select Income Account..." : "Select Expense Account..."}
                    />
                 </div>

                 <div className="p-4 rounded-lg bg-muted/20 border border-dashed border-muted-foreground/20 space-y-4">
                    <div className="flex items-center justify-between">
                       <Label className="flex items-center gap-2 cursor-pointer" htmlFor="vat-toggle">
                          <Percent className="h-3.5 w-3.5 text-primary" />
                          Apply VAT?
                       </Label>
                       <div className="flex items-center gap-2 relative">
                          <Select 
                            value={!isVatRegistered ? 'no' : allocVatOn} 
                            onValueChange={(v: any) => setAllocVatOn(v)}
                            disabled={!isVatRegistered}
                          >
                            <SelectTrigger className={cn("h-8 w-[80px] text-xs", !isVatRegistered && "bg-muted text-muted-foreground opacity-70")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Yes</SelectItem>
                              <SelectItem value="no">No</SelectItem>
                            </SelectContent>
                          </Select>
                          {!isVatRegistered && (
                             <Lock className="h-3 w-3 text-muted-foreground ml-1" />
                          )}
                       </div>
                    </div>
                    
                    {allocVatOn === 'yes' && (
                       <div className="grid grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-200">
                          <div className="space-y-1">
                             <Label className="text-xs text-muted-foreground">VAT Rate (%)</Label>
                             <Input 
                               type="number" min="0" max="100" 
                               value={allocVatRate} 
                               onChange={(e) => setAllocVatRate(e.target.value)} 
                               className="h-9 bg-background"
                             />
                          </div>
                          <div className="space-y-1">
                             <Label className="text-xs text-muted-foreground">VAT Amount</Label>
                             <div className="h-9 px-3 flex items-center bg-muted/50 rounded-md border text-sm font-medium text-muted-foreground">
                                R {((Number(allocationTx?.total_amount || 0) * Number(allocVatRate || 0)) / (100 + Number(allocVatRate || 0))).toFixed(2)}
                             </div>
                          </div>
                       </div>
                    )}
                 </div>

                 {allocPayment === 'accrual' && (
                    <div className="space-y-4 pt-2 border-t animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <Label>Settlement Type</Label>
                           <Select value={allocSettlement} onValueChange={(v: any) => setAllocSettlement(v)} disabled>
                            <SelectTrigger disabled className="bg-muted"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="receivable">Receivable</SelectItem>
                              <SelectItem value="payable">Payable</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                         </div>
                         <div className="space-y-2">
                            <Label>{allocSettlement === 'receivable' ? 'Receivable Account' : allocSettlement === 'payable' ? 'Payable Account' : 'Other Account'}</Label>
                            <AccountCombobox 
                               accounts={allocSettlement === 'receivable' ? coaReceivable : allocSettlement === 'payable' ? coaPayable : coaOther}
                               value={allocSettlementAccountId}
                               onChange={setAllocSettlementAccountId}
                               placeholder="Select Settlement Account..."
                            />
                         </div>
                      </div>
                    </div>
                 )}
              </div>
            </div>

            <DialogFooter className="p-4 bg-muted/10 border-t gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setAllocationOpen(false)} disabled={allocationTx && posting[allocationTx.id]}>Cancel</Button>
              <Button onClick={() => {
                // Capture all necessary state variables in local scope
                const txId = String(allocationTx?.id || '');
                if (!txId) return;
                
                if (allocVatOn === 'yes' && !isVatRegistered) {
                    toast({ title: "VAT Error", description: "You cannot add VAT to a business that is not registered for VAT.", variant: "destructive" });
                    return;
                }

                if (allocPayment === 'cash' && !allocBankId) { toast({ title: "Bank Required", description: "Please select a bank account.", variant: "destructive" }); return; }
                if (!allocAccountId) { toast({ title: "Account Required", description: "Please select an income/expense account.", variant: "destructive" }); return; }
                if (allocPayment === 'accrual' && !allocSettlementAccountId) { toast({ title: "Settlement Account Required", description: "Please select a settlement account.", variant: "destructive" }); return; }

                // Optimistic UI updates
                setPosting(prev => ({ ...prev, [txId]: true }));
                setAllocationOpen(false);
                toast({ title: "Posting Started", description: "Allocation is being processed in the background. You can continue working." });

                // Define the async operation
                const processTransaction = async () => {
                  if (isDateLocked(allocDate)) {
                    setIsLockDialogOpen(true);
                    setPosting(prev => ({ ...prev, [txId]: false }));
                    setAllocationOpen(false);
                    return;
                  }

                  try {
                    const isIncome = allocType === 'income';
                    const total = Math.abs(Number(allocationTx?.total_amount || 0));
                    let debitAccount = '';
                    let creditAccount = '';
                    
                    if (allocPayment === 'cash') {
                      if (isIncome) { debitAccount = ''; creditAccount = allocAccountId; }
                      else { debitAccount = allocAccountId; creditAccount = ''; }
                    } else {
                      const settleId = allocSettlementAccountId;
                      if (isIncome) { debitAccount = settleId; creditAccount = allocAccountId; }
                      else { debitAccount = allocAccountId; creditAccount = settleId; }
                    }

                    const rate = allocVatOn === 'yes' ? Number(allocVatRate || '0') : 0;
                    const vatAmount = rate > 0 ? ((total * rate) / (100 + rate)) : 0;
                    const netAmount = rate > 0 ? (total - vatAmount) : total;

                    // Auto-create VAT accounts if needed (Simplified check)
                    if (rate > 0 && vatAmount > 0) {
                      try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                          const { data: profile } = await supabase
                            .from('profiles')
                            .select('company_id')
                            .eq('user_id', user.id)
                            .single();
                          const companyId = (profile as any)?.company_id;
                          if (companyId) {
                            const { data: vatAccounts } = await supabase
                              .from('chart_of_accounts')
                              .select('id, account_name, account_code, account_type')
                              .eq('company_id', companyId)
                              .or('account_name.ilike.%vat%,account_name.ilike.%tax%');
                            const hasVat = (vatAccounts || []).length > 0;
                            if (!hasVat) {
                              if (isIncome) {
                                await supabase
                                  .from('chart_of_accounts')
                                  .insert({ company_id: companyId, account_code: '2100', account_name: 'VAT Output', account_type: 'liability', is_active: true });
                              } else {
                                await supabase
                                  .from('chart_of_accounts')
                                  .insert({ company_id: companyId, account_code: '1400', account_name: 'VAT Input', account_type: 'asset', is_active: true });
                              }
                            }
                          }
                        }
                      } catch {}
                    }

                    const { error: upErr } = await supabase
                      .from('transactions')
                    .update({
                      transaction_date: allocDate,
                      description: String(allocDesc || '').trim() || (allocationTx?.description || null),
                      bank_account_id: allocPayment === 'cash' ? allocBankId : null,
                      debit_account_id: debitAccount || null,
                      credit_account_id: creditAccount || null,
                      vat_rate: rate > 0 ? rate : null,
                      vat_amount: vatAmount > 0 ? vatAmount : null,
                      base_amount: netAmount,
                      vat_inclusive: (allocVatOn === 'yes')
                    })
                    .eq('id', txId);
                    
                    if (upErr) throw upErr;

                    await setTransactionStatus(txId, 'approved');
                    toast({ title: 'Success', description: 'Allocation successfully allocated and approved.' });
                  } catch (e: any) {
                    console.error(e);
                    toast({ title: 'Allocation Failed', description: e.message || 'Failed to allocate transaction', variant: 'destructive' });
                  } finally {
                    setPosting(prev => ({ ...prev, [txId]: false }));
                  }
                };

                // Fire and forget
                processTransaction();
              }} disabled={allocationTx && posting[allocationTx.id]} className="min-w-[140px] shadow-md">
                {allocationTx && posting[allocationTx.id] ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>) : (<><CheckCircle className="mr-2 h-4 w-4" /> Confirm & Post</>)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Simplified Control Bar */}
        <div className="flex items-center justify-between gap-4 bg-background/50 p-2 rounded-xl border shadow-sm">
           <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
             <Input
               placeholder="Search allocations..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="pl-10 bg-transparent border-none shadow-none focus-visible:ring-0"
             />
           </div>
           <div className="flex items-center gap-2">
             <Button variant="outline" size="icon" onClick={() => setFilterOpen(true)} className="rounded-full h-10 w-10 shrink-0">
               <Filter className="h-4 w-4" />
             </Button>
             <Button variant="default" size="icon" onClick={() => setDrawerOpen(true)} className="rounded-full h-10 w-10 shrink-0 bg-primary text-primary-foreground shadow-md hover:scale-105 transition-transform">
               <MoreHorizontal className="h-4 w-4" />
             </Button>
           </div>
        </div>

        {/* Filter Dialog */}
        <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-primary" />
                Filter Allocations
              </DialogTitle>
              <DialogDescription>
                Refine your view with detailed filters
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
               {/* Source Pills */}
               <div className="space-y-2">
                 <Label>Source</Label>
                 <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'All', icon: Filter },
                      { id: 'invoice', label: 'Invoices', icon: FileText },
                      { id: 'bank', label: 'Bank', icon: Wallet },
                      { id: 'csv', label: 'Import', icon: FileSpreadsheet },
                      { id: 'purchase', label: 'Purchases', icon: ShoppingCart },
                      { id: 'manual', label: 'Manual', icon: Edit },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setSourceTab(tab.id as any)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 flex items-center gap-1.5 border",
                          sourceTab === tab.id
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-background text-muted-foreground border-border hover:bg-muted"
                        )}
                      >
                         <tab.icon className="h-3 w-3" />
                         <span>{tab.label}</span>
                      </button>
                    ))}
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <Label>Type</Label>
                     <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="space-y-2">
                     <Label>Status</Label>
                     <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger><SelectValue placeholder="All Status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="unposted">Unposted</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                     </Select>
                  </div>
               </div>

               <div className="space-y-2">
                 <Label>Date Range</Label>
                 <div className="flex items-center gap-2">
                     <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                     <span className="text-muted-foreground">-</span>
                     <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                 </div>
               </div>
            </div>
            <DialogFooter>
               <Button variant="outline" onClick={() => { setSearchTerm(''); setFilterType('all'); setFilterStatus('all'); setSourceTab('all'); setDateFrom(''); setDateTo(''); }}>Reset</Button>
               <Button onClick={() => setFilterOpen(false)}>Apply Filters</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Actions Drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
           <SheetContent>
             <SheetHeader>
               <SheetTitle>Actions</SheetTitle>
               <SheetDescription>Manage your allocations</SheetDescription>
             </SheetHeader>
             <div className="grid gap-4 py-6">
                <Button className="w-full justify-start gap-3 h-12 text-base" onClick={() => { setDrawerOpen(false); setEditData(null); setNewFlowOpen(true); }}>
                   <div className="p-2 bg-primary/10 rounded-full text-primary">
                     <Plus className="h-5 w-5" />
                   </div>
                   New Allocation
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3 h-12 text-base" onClick={() => { setDrawerOpen(false); handleExport(); }}>
                   <div className="p-2 bg-muted rounded-full text-foreground">
                     <Download className="h-5 w-5" />
                   </div>
                   Export Data
                </Button>
             </div>
           </SheetContent>
        </Sheet>
      </div>

      <Card className="border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-card/50 backdrop-blur-sm">
        <CardHeader className="px-6 py-5 border-b bg-muted/5 flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-2">
              <div className="h-8 w-1 bg-primary rounded-full" />
              Recent Allocations
            </CardTitle>
            <CardDescription>
              Manage and review your financial records. You have <span className="font-medium text-foreground">{totalCount}</span> total allocations.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="px-3 py-1 text-xs font-medium bg-primary/10 text-primary border-primary/20 shadow-sm">
            Page {page + 1} of {Math.max(1, Math.ceil(totalCount / pageSize))}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
              <TableHeader className="bg-muted/10">
                <TableRow className="hover:bg-transparent border-b border-border/60">
                  <TableHead className="w-40 pl-6 h-12 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                    <Button variant="ghost" className="gap-1 p-0 h-auto font-semibold uppercase text-xs hover:bg-transparent hover:text-primary transition-colors">
                      Date <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Description</TableHead>
                  <TableHead className="w-40 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Bank</TableHead>
                  <TableHead className="w-28 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Type</TableHead>
                  <TableHead className="w-36 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Category</TableHead>
                  <TableHead className="text-right w-36 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Amount</TableHead>
                  <TableHead className="text-right w-28 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">VAT</TableHead>
                  <TableHead className="w-32 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Status</TableHead>
                  <TableHead className="w-20 text-right pr-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {derived.filtered.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={9} className="h-64 text-center text-muted-foreground">
                       <div className="flex flex-col items-center justify-center gap-3 animate-in zoom-in-95 duration-500">
                         <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center">
                           <FileText className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-lg text-foreground">No allocations found</p>
                          <p className="text-sm">Try adjusting your search or filters to find what you're looking for.</p>
                        </div>
                         <Button variant="outline" className="mt-2" onClick={() => { setSearchTerm(''); setFilterType('all'); setFilterStatus('all'); setSourceTab('all'); setDateFrom(''); setDateTo(''); }}>
                           Clear Filters
                         </Button>
                       </div>
                     </TableCell>
                   </TableRow>
                ) : derived.filtered.map((transaction, index) => (
                 <React.Fragment key={transaction.id}>
                {posting[transaction.id] && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                     <div className="flex items-center gap-2 bg-background/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg border border-border/50">
                       <Loader2 className="h-4 w-4 animate-spin text-primary" />
                       <span className="text-xs font-medium text-primary">Posting...</span>
                     </div>
                  </div>
                )}
                  <TableRow 
                    className={cn("group hover:bg-muted/40 transition-all border-b border-border/40 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-backwards", posting[transaction.id] ? "opacity-70 pointer-events-none" : "")}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <TableCell className="font-medium pl-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-md bg-muted/50 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors shadow-sm">
                          <Calendar className="h-4 w-4" />
                        </div>
                        <span className="text-sm tabular-nums">{transaction.date}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex flex-col gap-0.5 max-w-[300px]">
                        <span className="font-semibold text-sm text-foreground/90 truncate" title={transaction.description}>{transaction.description}</span>
                        <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                          {transaction.reference}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      {transaction.bank !== "—" ? (
                        <div className="flex flex-col">
                           <span className="text-sm font-medium">{transaction.bank.split('(')[0]}</span>
                           <span className="text-xs text-muted-foreground truncate max-w-[120px]" title={transaction.bank}>
                             {transaction.bank.includes('(') ? transaction.bank.split('(')[1].replace(')', '') : ''}
                           </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm opacity-50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4">
                       <Badge variant="outline" className={cn(
                          "font-medium px-2.5 py-1 rounded-md border shadow-sm transition-all hover:shadow-md",
                          transaction.type === "Income" 
                            ? "border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100" 
                            : "border-rose-200 text-rose-700 bg-rose-50/50 hover:bg-rose-100"
                       )}>
                          {transaction.type === "Income" ? <ArrowDownLeft className="h-3 w-3 mr-1.5" /> : <ArrowUpRight className="h-3 w-3 mr-1.5" />}
                          {transaction.type}
                       </Badge>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-normal text-xs bg-muted/50 hover:bg-muted text-muted-foreground border-transparent hover:border-border transition-all">
                          {transaction.category}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className={cn(
                        "font-mono font-bold text-sm tabular-nums",
                        transaction.type === "Income" ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {transaction.type === "Income" ? "+" : "-"} R {transaction.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground py-4">
                      {transaction.vatAmount > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/30 text-xs font-medium tabular-nums">
                          R {transaction.vatAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                        </span>
                      ) : <span className="opacity-30">-</span>}
                    </TableCell>
                    <TableCell className="py-4">
                       <div className={cn(
                         "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shadow-sm",
                         (transaction as any).statusKey === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : 
                         (transaction as any).statusKey === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" : 
                         (transaction as any).statusKey === "rejected" ? "bg-rose-50 text-rose-700 border-rose-200" : 
                         "bg-slate-50 text-slate-700 border-slate-200"
                       )}>
                          <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", 
                             (transaction as any).statusKey === "approved" ? "bg-emerald-500" : 
                             (transaction as any).statusKey === "pending" ? "bg-amber-500" : 
                             (transaction as any).statusKey === "rejected" ? "bg-rose-500" : "bg-slate-400"
                          )} />
                          {(transaction as any).statusLabel}
                       </div>
                    </TableCell>
                    <TableCell className="text-right pr-6 py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-muted data-[state=open]:bg-muted transition-colors rounded-full">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[180px] p-1 shadow-lg border-border/60 backdrop-blur-sm bg-popover/95">
                            {(transaction.statusKey === "pending" || transaction.statusKey === "unposted") && (
                              <>
                                <DropdownMenuItem onClick={() => {
                                  const full = items.find(i => i.id === transaction.id) || null;
                                  setAllocationTx(full);
                                  const amt = Number(full?.total_amount || 0);
                                  const isIncome = amt >= 0;
                                  setAllocType(isIncome ? 'income' : 'expense');
                                  setAllocDate(String(full?.transaction_date || new Date().toISOString().slice(0,10)));
                                  const hasBank = Boolean(full?.bank_account_id);
                                  setAllocPayment(hasBank ? 'cash' : 'accrual');
                                  setAllocBankId(String(full?.bank_account_id || ''));
                                  const vatRate = Number((full as any)?.vat_rate || 0);
                                  const vatAmount = Number((full as any)?.vat_amount || 0);
                                  setAllocVatOn(vatRate > 0 || vatAmount > 0 ? 'yes' : 'no');
                                  setAllocVatRate(String(vatRate || 0));
                                  setAllocSettlement(isIncome ? 'receivable' : 'payable');
                                  setAllocSettlementAccountId('');
                                  setAllocAccountId('');
                                  setAllocDesc(String(full?.description || ''));
                                  setAllocationOpen(true);
                                }} disabled={posting[transaction.id]} className="cursor-pointer focus:bg-emerald-50 focus:text-emerald-700 transition-colors">
                                  {posting[transaction.id] ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      <span>Posting…</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="mr-2 h-4 w-4 text-emerald-500" />
                                      <span>Approve</span>
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setTransactionStatus(transaction.id, 'rejected')} className="cursor-pointer focus:bg-rose-50 focus:text-rose-700 transition-colors">
                                  <XCircle className="mr-2 h-4 w-4 text-rose-500" />
                                  <span>Reject</span>
                                </DropdownMenuItem>
                              </>
                            )}
                            {transaction.statusKey === "approved" && (
                              <DropdownMenuItem onClick={() => setTransactionStatus(transaction.id, 'pending')} className="cursor-pointer focus:bg-amber-50 focus:text-amber-700 transition-colors">
                                <XCircle className="mr-2 h-4 w-4 text-amber-500" />
                                <span>Unapprove</span>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => { 
                              const full = items.find(i => i.id === transaction.id);
                              setPendingEditData(full || transaction);
                              setEditWarningOpen(true);
                            }} className="cursor-pointer focus:bg-primary/5 focus:text-primary transition-colors">
                              <Edit className="mr-2 h-4 w-4" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                                toast({ title: "Not implemented", description: "Duplicate feature coming soon" });
                            }} className="cursor-pointer transition-colors">
                              <Copy className="mr-2 h-4 w-4" />
                              <span>Duplicate</span>
                            </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => {
                               const full = items.find(i => i.id === transaction.id);
                               setViewDetailsData(full || transaction);
                               setViewDetailsOpen(true);
                            }} className="cursor-pointer transition-colors">
                              <FileText className="mr-2 h-4 w-4" />
                              <span>View Details</span>
                            </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => {
                               const full = items.find(i => i.id === transaction.id);
                               setAttachmentsData(full || transaction);
                               setAttachmentsOpen(true);
                            }} className="cursor-pointer transition-colors">
                              <Paperclip className="mr-2 h-4 w-4" />
                              <span>Attachments</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                               const full = items.find(i => i.id === transaction.id);
                               initiateAdjustment(full || transaction);
                            }} className="cursor-pointer text-amber-600 focus:bg-amber-50 focus:text-amber-700 transition-colors">
                              <RefreshCw className="mr-2 h-4 w-4" />
                              <span>Adjust / Reverse</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                  </TableRow>
                  </React.Fragment>
                ))}
              </TableBody>
          </Table>
        </CardContent>
        <div className="flex items-center justify-between p-4 border-t bg-muted/5">
          <div className="text-sm text-muted-foreground">
             Showing {items.length} of {totalCount} entries
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => { setPage(0); setPageSize(parseInt(v)); }}>
              <SelectTrigger className="w-[70px] h-8 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
               <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="h-8">Previous</Button>
               <Button variant="outline" size="sm" disabled={(page + 1) >= Math.ceil(totalCount / pageSize)} onClick={() => setPage(p => p + 1)} className="h-8">Next</Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Edit Warning Dialog */}
      <Dialog open={editWarningOpen} onOpenChange={setEditWarningOpen}>
        <DialogContent className="sm:max-w-[425px] text-center p-6">
           <DialogHeader className="flex flex-col items-center gap-4">
             <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mb-2">
                <img src="/logo.png" alt="Rigel Logo" className="h-10 w-auto object-contain opacity-50" />
             </div>
             <DialogTitle className="text-xl text-amber-700">Expert Mode Warning</DialogTitle>
             <DialogDescription className="text-base pt-2">
               Editing a transaction requires accounting knowledge. You will need to manually adjust debit and credit entries.
               <br/><br/>
               <span className="font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">Incorrect changes may affect your trial balance.</span>
             </DialogDescription>
           </DialogHeader>
           <DialogFooter className="flex sm:justify-center gap-3 mt-6 w-full">
             <Button variant="outline" onClick={() => setEditWarningOpen(false)} className="w-full sm:w-auto border-amber-200 hover:bg-amber-50 hover:text-amber-700">Cancel</Button>
             <Button onClick={() => {
               setEditData(pendingEditData);
               setEditWarningOpen(false);
               setOpen(true);
             }} className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white border-none">
               Continue to Edit
             </Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
        <DialogContent className="sm:max-w-[650px] overflow-hidden p-0 gap-0">
          <div className="bg-muted/30 p-6 border-b">
             <DialogHeader>
               <DialogTitle className="flex items-center gap-2 text-xl">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  Allocation Details
               </DialogTitle>
               <DialogDescription>
                  Reference: <span className="font-mono text-foreground font-medium">{viewDetailsData?.reference_number || viewDetailsData?.reference || '—'}</span>
               </DialogDescription>
             </DialogHeader>
          </div>
          {viewDetailsData && (
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Date</Label>
                  <div className="font-medium text-sm flex items-center gap-2">
                     <Calendar className="h-4 w-4 text-muted-foreground" />
                     {viewDetailsData.transaction_date || viewDetailsData.date}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Amount</Label>
                  <div className="font-bold text-lg tabular-nums text-primary">
                     R {Number(viewDetailsData.total_amount || viewDetailsData.amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Description</Label>
                  <div className="font-medium text-sm p-3 bg-muted/20 rounded-md border">{viewDetailsData.description}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Type</Label>
                  <div><Badge variant="outline" className="font-normal">{viewDetailsData.transaction_type || viewDetailsData.type || 'Allocation'}</Badge></div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Status</Label>
                  <div>
                    <Badge variant={viewDetailsData.status === 'approved' ? 'default' : 'secondary'} className={cn(
                       viewDetailsData.status === 'approved' ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200" : ""
                    )}>
                      {viewDetailsData.status || 'Pending'}
                    </Badge>
                  </div>
                </div>
                <div className="col-span-2 space-y-1">
                   <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Bank Account</Label>
                   <div className="font-medium text-sm flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      {(viewDetailsData.bank_account?.bank_name || viewDetailsData.bank || '—')}
                   </div>
                </div>
              </div>

              {viewDetailsData.entries && viewDetailsData.entries.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <Label className="mb-3 block text-sm font-semibold flex items-center gap-2">
                     <SlidersHorizontal className="h-4 w-4" />
                     Journal Entries (Double Entry)
                  </Label>
                  <div className="border rounded-lg overflow-hidden shadow-sm">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 divide-x divide-border/50">
                          <TableHead className="text-xs uppercase font-semibold">Account</TableHead>
                          <TableHead className="text-right text-xs uppercase font-semibold w-32">Debit</TableHead>
                          <TableHead className="text-right text-xs uppercase font-semibold w-32">Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewDetailsData.entries.map((e: any, i: number) => (
                          <TableRow key={i} className="divide-x divide-border/50 hover:bg-muted/20">
                            <TableCell className="font-medium text-sm">{e.chart_of_accounts?.account_name || 'Unknown Account'}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{Number(e.debit) > 0 ? `R ${Number(e.debit).toFixed(2)}` : '-'}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{Number(e.credit) > 0 ? `R ${Number(e.credit).toFixed(2)}` : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="p-4 bg-muted/10 border-t">
            <Button onClick={() => setViewDetailsOpen(false)} className="w-full sm:w-auto">Close Details</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attachments Dialog */}
      <Dialog open={attachmentsOpen} onOpenChange={setAttachmentsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
               <Paperclip className="h-5 w-5 text-primary" />
               Attachments
            </DialogTitle>
            <DialogDescription>
              Manage files for allocation <span className="font-mono text-foreground">{attachmentsData?.reference_number}</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors relative">
               {uploading ? (
                   <div className="flex flex-col items-center gap-2">
                       <Loader2 className="h-8 w-8 animate-spin text-primary" />
                       <p className="text-sm text-muted-foreground">Uploading...</p>
                   </div>
               ) : (
                   <>
                       <input 
                          type="file" 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={handleFileUpload}
                          disabled={uploading}
                       />
                       <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Upload className="h-8 w-8 opacity-50" />
                          <span className="text-sm font-medium">Click to upload or drag and drop</span>
                          <span className="text-xs">Supports PDF, Images, Excel (Max 5MB)</span>
                       </div>
                   </>
               )}
            </div>

            <div className="space-y-2">
               <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Attached Files ({fileList.length})</h4>
               {fileList.length === 0 ? (
                   <p className="text-sm text-muted-foreground italic py-2">No files attached yet.</p>
               ) : (
                   <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                       {fileList.map((file) => (
                           <div key={file.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border group hover:bg-muted/50 transition-colors">
                               <div className="flex items-center gap-3 overflow-hidden">
                                   <div className="p-2 bg-background rounded-md border">
                                       <FileText className="h-4 w-4 text-primary" />
                                   </div>
                                   <div className="flex flex-col overflow-hidden">
                                       <span className="text-sm font-medium truncate w-[200px]">{file.file_name}</span>
                                       <span className="text-xs text-muted-foreground">
                                           {(file.file_size / 1024).toFixed(1)} KB • {new Date(file.created_at).toLocaleDateString()}
                                       </span>
                                   </div>
                               </div>
                               <div className="flex items-center gap-1">
                                   <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => {
                                       const { data } = supabase.storage.from('transactions').getPublicUrl(file.file_path);
                                       window.open(data.publicUrl, '_blank');
                                   }}>
                                       <Eye className="h-4 w-4" />
                                   </Button>
                                   <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteAttachment(file.id, file.file_path)}>
                                       <Trash2 className="h-4 w-4" />
                                   </Button>
                               </div>
                           </div>
                       ))}
                   </div>
               )}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setAttachmentsOpen(false)} className="w-full sm:w-auto">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment Dialog */}
      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <History className="h-5 w-5" />
              Adjust Allocation
            </DialogTitle>
            <DialogDescription className="pt-2">
              Create an adjustment or reversal for this allocation. This will create a new allocation entry to correct the ledger.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label>Adjustment Date</Label>
                  <Input 
                     type="date" 
                     value={adjustmentDate} 
                     onChange={(e) => setAdjustmentDate(e.target.value)}
                  />
               </div>
               <div className="space-y-2">
                  <Label>Adjustment Amount</Label>
                  <Input 
                     type="number" 
                     value={adjustmentAmount} 
                     onChange={(e) => setAdjustmentAmount(e.target.value)}
                     placeholder="0.00" 
                  />
               </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <Label>Account to Debit</Label>
                   <Select value={debitAccount} onValueChange={setDebitAccount}>
                      <SelectTrigger>
                         <SelectValue placeholder="Select Debit Account" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                         {coaExpense.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name} (Expense)</SelectItem>
                         ))}
                         {coaIncome.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name} (Income)</SelectItem>
                         ))}
                         {coaReceivable.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name} (Asset)</SelectItem>
                         ))}
                         {coaPayable.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name} (Liability)</SelectItem>
                         ))}
                         {coaOther.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>
                         ))}
                         {banks.map((b: any) => (
                             <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>
                         ))}
                      </SelectContent>
                   </Select>
                </div>
                <div className="space-y-2">
                   <Label>Account to Credit</Label>
                   <Select value={creditAccount} onValueChange={setCreditAccount}>
                      <SelectTrigger>
                         <SelectValue placeholder="Select Credit Account" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                         {coaExpense.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name} (Expense)</SelectItem>
                         ))}
                         {coaIncome.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name} (Income)</SelectItem>
                         ))}
                         {coaReceivable.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name} (Asset)</SelectItem>
                         ))}
                         {coaPayable.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name} (Liability)</SelectItem>
                         ))}
                         {coaOther.map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>
                         ))}
                         {banks.map((b: any) => (
                             <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>
                         ))}
                      </SelectContent>
                   </Select>
                </div>
             </div>

             <div className="space-y-2">
               <Label>Reason for Adjustment</Label>
               <Textarea 
                 value={adjustmentReason} 
                 onChange={(e) => setAdjustmentReason(e.target.value)} 
                 placeholder="Explain why this adjustment is being made..."
                 className="min-h-[80px]"
               />
             </div>

             <div className="space-y-2">
               <Label>Supporting Document (Optional)</Label>
               <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors relative">
                 <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                            setAdjustmentFile(e.target.files[0]);
                        }
                    }}
                 />
                 <div className="flex flex-col items-center gap-2 text-muted-foreground">
                   {adjustmentFile ? (
                       <>
                        <FileText className="h-8 w-8 text-primary" />
                        <span className="text-sm font-medium text-foreground">{adjustmentFile.name}</span>
                        <span className="text-xs">Click to replace</span>
                       </>
                   ) : (
                       <>
                        <Upload className="h-8 w-8 opacity-50" />
                        <span className="text-sm">Click or drag to upload document</span>
                       </>
                   )}
                 </div>
               </div>
             </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAdjustmentOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button 
              onClick={handleAdjustment}
              disabled={isAdjusting || !adjustmentReason.trim()}
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
                  Post Adjustment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FinancialYearLockDialog 
        open={isLockDialogOpen} 
        onOpenChange={setIsLockDialogOpen} 
      />
    </div>
  );
};
