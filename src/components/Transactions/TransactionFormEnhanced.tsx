import { useState, useEffect, useCallback } from "react";
import React from "react";
import { lazy, Suspense } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { toast as notify } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { emitDashboardCacheInvalidation } from "@/stores/dashboardCache";
import { AlertCircle, CheckCircle2, Sparkles, TrendingUp, TrendingDown, Info, Search, Loader2, Check, XCircle, DollarSign, Percent, Calculator, Save, ArrowRight, FileText, Calendar, Lock, Wallet, CreditCard, Globe, Plus, Briefcase, BookOpen, Package, Landmark, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandDialog } from "@/components/ui/command";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { z } from "zod";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Progress } from "@/components/ui/progress";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { validateTransactionDate } from "@/lib/transactions-api";

// Loan calculation function
const calculateMonthlyRepayment = (principal: number, monthlyRate: number, termMonths: number): number => {
  if (monthlyRate === 0) return principal / termMonths;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
};

// Calculate loan payment amount based on installment
const calculateLoanPaymentAmount = (loan: any, installmentNumber: number): number => {
  if (!loan || !loan.monthly_repayment) return 0;
  
  // For now, return the monthly repayment amount
  // In a more sophisticated system, this could calculate principal/interest split
  return loan.monthly_repayment;
};

// Initial form state
const initialFormState = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  reference: "",
  bankAccountId: "",
  element: "",
  paymentMethod: "bank",
  debitAccount: "",
  creditAccount: "",
  amount: "",
  vatRate: "0",
  loanId: "",
  interestRate: "",
  loanTerm: "",
  loanTermType: "short",
  installmentNumber: "",
  assetFinancedByLoan: false
};

const ChartOfAccountsLazy = lazy(() => import("./ChartOfAccountsManagement").then(m => ({ default: m.ChartOfAccountsManagement })));


interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string; // stored lowercase in DB: asset|liability|equity|income|expense
}

interface BankAccount {
  id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
}

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editData?: any;
  prefill?: any;
  headless?: boolean;
}

// Accounting element configurations with debit/credit rules
const ACCOUNTING_ELEMENTS = [
  { 
    value: "expense", 
    label: "Expense Payment", 
    icon: TrendingDown, 
    debitType: 'expense', 
    creditTypes: ['asset', 'liability'],
    description: "Record business expenses (Dr Expense / Cr Bank or Payable)"
  },
  { 
    value: "income", 
    label: "Income Received", 
    description: "A transaction where the business receives money for goods or services sold.",
    debitType: "asset",
    creditTypes: ["income", "revenue"],
  },
  { 
    value: "receipt", 
    label: "Receivable Collection", 
    debitType: 'asset', 
    creditTypes: ['asset'],
    description: "Collect receivable (Dr Bank / Cr Accounts Receivable)"
  },
  { 
    value: "asset", 
    label: "Asset Purchase", 
    icon: TrendingDown, 
    debitType: 'asset', 
    creditTypes: ['asset', 'liability'],
    description: "Record asset purchases (Dr Fixed Asset / Cr Bank or Payable)"
  },
  {
    value: "product_purchase",
    label: "Product Purchase",
    icon: TrendingDown,
    debitType: 'asset',
    creditTypes: ['asset','liability'],
    description: "Record product/inventory purchases (Dr Inventory / Cr Bank or Payable)"
  },
  { 
    value: "liability", 
    label: "Liability Payment", 
    icon: TrendingDown, 
    debitType: 'liability', 
    creditTypes: ['asset'],
    description: "Record liability payments (Dr Liability / Cr Bank)"
  },
  { 
    value: "equity", 
    label: "Equity/Capital", 
    icon: TrendingUp, 
    debitType: 'asset', 
    creditTypes: ['equity'],
    description: "Record capital contributions (Dr Bank / Cr Capital)"
  },
  { 
    value: "loan_received", 
    label: "Loan Received", 
    icon: TrendingUp, 
    debitType: 'asset', 
    creditTypes: ['liability'],
    description: "Receive loan from bank (Dr Bank / Cr Loan Payable)"
  },
  { 
    value: "loan_repayment", 
    label: "Loan Repayment", 
    icon: TrendingDown, 
    debitType: 'liability', 
    creditTypes: ['asset'],
    description: "Repay loan principal (Dr Loan Payable / Cr Bank)"
  },
  { 
    value: "loan_interest", 
    label: "Loan Interest", 
    icon: TrendingDown, 
    debitType: 'expense', 
    creditTypes: ['asset'],
    description: "Pay loan interest (Dr Interest Expense / Cr Bank)"
  }
  ,
  {
    value: "depreciation",
    label: "Depreciation",
    icon: TrendingDown,
    debitType: 'expense',
    creditTypes: ['asset'],
    description: "Record periodic depreciation (Dr Depreciation / Cr Accumulated Depreciation)"
  }
  ,
  {
    value: "asset_disposal",
    label: "Asset Disposal",
    icon: TrendingUp,
    debitType: 'asset',
    creditTypes: ['asset','income','expense'],
    description: "Dispose a fixed asset with proceeds and auto gain/loss"
  }
];

const PAYMENT_METHODS = [
  { value: 'bank', label: 'Bank Payment/Receipt', accountKeyword: 'bank' },
  { value: 'cash', label: 'Cash Payment/Receipt', accountKeyword: 'cash' },
  { value: 'accrual', label: 'On Account (Accrual)', accountKeyword: 'payable,receivable' }
];

// Validation schema
const transactionSchema = z.object({
  date: z.string().min(1, "Date is required"),
  description: z.string().trim().min(1, "Description is required").max(500, "Description must be less than 500 characters"),
  reference: z.string().trim().max(50, "Reference must be less than 50 characters").optional().or(z.literal("")),
  element: z.string().min(1, "Accounting element is required"),
  debitAccount: z.string().min(1, "Debit account is required"),
  creditAccount: z.string().min(1, "Credit account is required"),
  amount: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Amount must be greater than 0"),
  vatRate: z.string()
});

export const TransactionFormEnhanced = ({ open, onOpenChange, onSuccess, editData, prefill, headless }: TransactionFormProps) => {
  const { toast } = useToast();
  const { isDateLocked, closedDate } = useFiscalYear();
  const [loading, setLoading] = useState(false);
  const [postProgress, setPostProgress] = useState(0);
  const [progressText, setProgressText] = useState("Posting Transaction...");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loans, setLoans] = useState<Array<{ id: string; reference: string; outstanding_balance: number; status: string; loan_type: string; interest_rate: number; monthly_repayment?: number }>>([]);
  const [debitAccounts, setDebitAccounts] = useState<Account[]>([]);
  const [creditAccounts, setCreditAccounts] = useState<Account[]>([]);
  const [autoClassification, setAutoClassification] = useState<{ type: string; category: string } | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [chartMissing, setChartMissing] = useState(false);
  const [companyId, setCompanyId] = useState<string>('');
  const [debitSearch, setDebitSearch] = useState("");
  const [creditSearch, setCreditSearch] = useState("");
  const [debitSearchOpen, setDebitSearchOpen] = useState(false);
  const [creditSearchOpen, setCreditSearchOpen] = useState(false);
  const [debitIncludeAll, setDebitIncludeAll] = useState(false);
  const [creditIncludeAll, setCreditIncludeAll] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [lockAccounts, setLockAccounts] = useState(false);
  const [lockType, setLockType] = useState<string | null>(null);
  const [fixedAssets, setFixedAssets] = useState<Array<{ id: string; description: string; cost: number; purchase_date: string; useful_life_years: number; accumulated_depreciation?: number }>>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [assetUsefulLifeYears, setAssetUsefulLifeYears] = useState<string>("5");
  const [assetUsefulLifeStartDate, setAssetUsefulLifeStartDate] = useState<string>(new Date().toISOString().slice(0,10));
  const fixedAssetCodes = ['1500','1510','1600','1700','1800'];
  
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    reference: "",
    bankAccountId: "",
    element: "",
    paymentMethod: "bank",
    debitAccount: "",
    creditAccount: "",
    amount: "",
    vatRate: "0",
    loanId: "",
    interestRate: "",
    loanTerm: "",
    loanTermType: "short",
    installmentNumber: "",
    assetFinancedByLoan: false
  });
  
  const isPeriodLocked = isDateLocked(form.date);

  const [showFixedAssetsUI, setShowFixedAssetsUI] = useState<boolean>(false);
  const [cogsTotal, setCogsTotal] = useState<number>(0);
  const [amountIncludesVAT, setAmountIncludesVAT] = useState<boolean>(false);
  const [cogsAccount, setCogsAccount] = useState<Account | null>(null);
  const [inventoryAccount, setInventoryAccount] = useState<Account | null>(null);
  const [invoiceIdForRef, setInvoiceIdForRef] = useState<string>("");
  const [isVatRegistered, setIsVatRegistered] = useState<boolean>(false);
  const [vatDialogOpen, setVatDialogOpen] = useState<boolean>(false);
  
  // Split Transaction State
  const [splitMode, setSplitMode] = useState(false);
  const [splits, setSplits] = useState<{ id: string; accountId: string; amount: string; description: string; vatRate: string }[]>([
    { id: "1", accountId: "", amount: "", description: "", vatRate: "0" }
  ]);

  // Update splits when total amount changes (if only 1 split)
  useEffect(() => {
    if (!splitMode && form.amount) {
      setSplits([{ id: "1", accountId: form.debitAccount, amount: form.amount, description: form.description, vatRate: form.vatRate }]);
    }
  }, [form.amount, form.description, form.debitAccount, form.vatRate, splitMode]);

  // Calculate remaining amount for splits
  const splitTotal = splits.reduce((sum, split) => sum + (parseFloat(split.amount) || 0), 0);
  const totalAmount = parseFloat(form.amount) || 0;
  const remainingAmount = totalAmount - splitTotal;


  useEffect(() => {
    if (open && prefill) {
      setForm(prev => ({ ...prev, ...prefill }));
      if (typeof (prefill as any).amountIncludesVAT !== 'undefined') {
        setAmountIncludesVAT(!!(prefill as any).amountIncludesVAT);
      }
      if ((prefill as any).usefulLifeYears) setAssetUsefulLifeYears(String((prefill as any).usefulLifeYears));
      if ((prefill as any).depreciationMethod) setDepreciationMethod(String((prefill as any).depreciationMethod));
      if ((prefill as any).usefulLifeStartDate) setAssetUsefulLifeStartDate(String((prefill as any).usefulLifeStartDate));
      
      // Handle Split Prefill
      if ((prefill as any).splitMode) {
        setSplitMode(true);
        if ((prefill as any).splits && Array.isArray((prefill as any).splits)) {
           setSplits((prefill as any).splits);
        }
      }
    }
  }, [open, prefill]);
  useEffect(() => {
    if (!open) return;
    const ref = String(form.reference || '').trim();
    if (!ref) {
      const d = new Date();
      const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      const rand = String(Math.floor(Math.random() * 9000) + 1000);
      const prefix = form.element ? String(form.element).toUpperCase().slice(0,3) : 'TXN';
      setForm(prev => ({ ...prev, reference: `${prefix}-${ymd}-${rand}` }));
    }
  }, [open]);
  useEffect(() => {
    if (!open || !prefill) return;
    const lt = String((prefill as any).lockType || '').trim();
    if (lt) {
      setLockAccounts(true);
      setLockType(lt);
    }
  }, [open, prefill]);
  useEffect(() => {
    if (open && prefill) {
      if (prefill.depreciationMethod) setDepreciationMethod(String(prefill.depreciationMethod));
      if (prefill.usefulLifeYears) setAssetUsefulLifeYears(String(prefill.usefulLifeYears));
    }
  }, [open, prefill]);
  useEffect(() => {
    if (open && prefill && prefill.assetId) {
      setSelectedAssetId(String(prefill.assetId));
    }
  }, [open, prefill]);

  
  const [depreciationMethod, setDepreciationMethod] = useState<string>("straight_line");
  useEffect(() => {
    if (loading) {
      // Skip auto-progress for advanced asset posting as we handle it manually in handleSubmit
      if (showFixedAssetsUI && form.element === 'asset') {
        return;
      }

      setPostProgress(10);
      const timer = setInterval(() => {
        setPostProgress((p) => {
          const next = p + Math.floor(Math.random() * 10) + 5;
          return Math.min(next, 90);
        });
      }, 200);
      return () => clearInterval(timer);
    } else {
      setPostProgress(0);
    }
  }, [loading, showFixedAssetsUI, form.element]);

  useEffect(() => {
    const selectedDebit = accounts.find((acc: any) => String(acc.id) === String(form.debitAccount));
    const code = String((selectedDebit as any)?.account_code || '');
    setShowFixedAssetsUI(
      ((form.element === 'asset') || (form.element === 'equity' && form.paymentMethod === 'asset')) && fixedAssetCodes.includes(code)
      || form.element === 'depreciation' || form.element === 'asset_disposal'
    );
  }, [form.element, form.paymentMethod, form.debitAccount, accounts]);

  useEffect(() => {
    if (!form.bankAccountId || !form.element || accounts.length === 0) return;
    const bankLedger =
      accounts.find(a => (a.account_type || '').toLowerCase() === 'asset' && String(a.account_code || '') === '1100') ||
      accounts.find(a => {
        const type = (a.account_type || '').toLowerCase();
        const name = (a.account_name || '').toLowerCase();
        return type === 'asset' && (name.includes('bank') || name.includes('cash'));
      });
    if (!bankLedger) return;
    if (form.element === 'income' || form.element === 'receipt' || form.element === 'asset_disposal' || form.element === 'loan_received') {
      setForm(prev => ({ ...prev, debitAccount: prev.debitAccount || bankLedger.id }));
    } else if (form.element === 'expense' || form.element === 'asset' || form.element === 'product_purchase' || form.element === 'liability' || form.element === 'loan_repayment' || form.element === 'loan_interest') {
      setForm(prev => ({ ...prev, creditAccount: prev.creditAccount || bankLedger.id }));
    }
  }, [form.bankAccountId, form.element, accounts]);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);

      const { data: companyData } = await supabase
        .from("companies")
        .select("vat_number")
        .eq("id", profile.company_id)
        .single();
      
      const hasVat = !!(companyData?.vat_number);
      setIsVatRegistered(hasVat);
      if (!hasVat) {
        setVatDialogOpen(true);
      }

      const { data: banks } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("account_name");
      setBankAccounts(banks || []);
      const { data: assetsData } = await supabase
        .from("fixed_assets")
        .select("id, description, cost, purchase_date, useful_life_years, accumulated_depreciation")
        .eq("company_id", profile.company_id)
        .order("purchase_date", { ascending: false });
      setFixedAssets(assetsData || []);
      const { data: loansData } = await supabase
        .from("loans")
        .select("id, reference, outstanding_balance, status, loan_type, interest_rate, monthly_repayment")
        .eq("company_id", profile.company_id)
        .eq("status", "active")
        .order("reference");
      setLoans(loansData || []);
      const { data: accts, error } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("is_active", true)
        .order("account_code");
      if (error) throw error;
      if (!accts || accts.length === 0) {
        setChartMissing(true);
        toast({ title: "Chart of Accounts missing", description: "Please set up your Chart of Accounts before creating transactions.", variant: "destructive" });
      } else {
        setChartMissing(false);
      }
      setAccounts(accts || []);
      if (lockAccounts && accts && accts.length > 0) {
        const lower = accts.map(a => ({
          ...a,
          account_type: (a.account_type || '').toLowerCase(),
          account_name: (a.account_name || '').toLowerCase(),
          account_code: (a.account_code || '').toString(),
        }));
        const pick = (type: string, codes: string[], names: string[]) => {
          const byCode = lower.find(a => codes.includes(a.account_code) && a.account_type === type.toLowerCase());
          if (byCode) return byCode.id;
          const byName = lower.find(a => a.account_type === type.toLowerCase() && names.some(n => a.account_name.includes(n)));
          if (byName) return byName.id;
          const byType = lower.find(a => a.account_type === type.toLowerCase());
          return byType?.id || '';
        };
        if (lockType === 'sent') {
          const arId = form.debitAccount || pick('asset', ['1200'], ['receiv','debtors','accounts receiv']);
          const revId = form.creditAccount || pick('income', ['4000'], ['revenue','sales','income']);
          setForm(prev => ({ ...prev, debitAccount: arId, creditAccount: revId }));
        } else if (lockType === 'paid') {
          const bankId = form.debitAccount || pick('asset', ['1100'], ['bank','cash']);
          const arId = form.creditAccount || pick('asset', ['1200'], ['receiv','debtors','accounts receiv']);
          setForm(prev => ({ ...prev, debitAccount: bankId, creditAccount: arId }));
        } else if (lockType === 'po_sent') {
          const creditAccountId = (prefill?.funding_source === 'loan' || Boolean(prefill?.loan_ledger_id))
            ? (form.creditAccount || pick('liability', ['2300','2400'], ['loan']))
            : (form.creditAccount || pick('liability', ['2000'], ['accounts payable','payable']));
          if (form.element === 'product_purchase') {
            const invId = form.debitAccount || pick('asset', ['1300'], ['inventory','stock']);
            setForm(prev => ({ ...prev, debitAccount: invId, creditAccount: creditAccountId }));
          } else {
            // For service POs treated as expense, keep the provided expense account
            const expId = form.debitAccount || pick('expense', ['5000'], ['expense']);
            setForm(prev => ({ ...prev, debitAccount: expId, creditAccount: creditAccountId }));
          }
        }
      }
    } catch (error: any) {
      toast({ title: "Error loading data", description: error.message, variant: "destructive" });
    }
  }, [toast, lockAccounts, lockType, form.debitAccount, form.creditAccount]);
  useEffect(() => {
    if (open) {
      loadData();
    } else {
      // Reset form when dialog closes
      setForm({
        date: new Date().toISOString().slice(0, 10),
        description: "",
        reference: "",
        bankAccountId: "",
        element: "",
        paymentMethod: "bank",
        debitAccount: "",
        creditAccount: "",
        amount: "",
        vatRate: "0",
        loanId: "",
        interestRate: "",
        loanTerm: "",
        loanTermType: "short",
        installmentNumber: "",
        assetFinancedByLoan: false
      });
      setDebitSearch("");
      setCreditSearch("");
    }
  }, [open, editData, loadData]);

  // Prefill form when editing an existing transaction
  useEffect(() => {
    if (!open || !editData) return;
    try {
      setForm(prev => ({
        ...prev,
        date: (editData.transaction_date || new Date().toISOString().slice(0, 10)).slice(0, 10),
        description: editData.description || "",
        reference: editData.reference_number || "",
        bankAccountId: editData.bank_account_id || "",
        element: (String(editData.lockType || '') === 'po_sent')
          ? ((editData.po_has_services || editData.splitMode) ? 'expense' : 'product_purchase')
          : (editData.transaction_type || (Number(editData.total_amount || 0) >= 0 ? 'income' : 'expense')),
        paymentMethod: editData.payment_method || prev.paymentMethod,
        debitAccount: editData.debit_account_id || prev.debitAccount,
        creditAccount: editData.credit_account_id || prev.creditAccount,
        amount: String(Math.abs(editData.total_amount || 0)),
        vatRate: editData.vat_rate ? String(editData.vat_rate) : "0",
        loanTermType: prev.loanTermType
      }));
      setLockAccounts(Boolean(editData.lockType));
      setLockType(String(editData.lockType || ''));
      if (typeof (editData as any).amount_includes_vat !== 'undefined') {
        setAmountIncludesVAT(Boolean((editData as any).amount_includes_vat));
      } else {
        const el = (String(editData.lockType || '') === 'po_sent') ? ((editData.po_has_services || editData.splitMode) ? 'expense' : 'product_purchase') : (editData.transaction_type || '');
        setAmountIncludesVAT(!(el === 'expense' || el === 'product_purchase'));
      }
      if (editData.splitMode && Array.isArray(editData.splits)) {
        setSplitMode(true);
        setSplits(editData.splits.map((s: any, idx: number) => ({
          id: String(idx + 1),
          accountId: String(s.account_id || s.accountId || ''),
          amount: String(Math.abs(s.debit || s.credit || 0)),
          description: String(s.description || editData.description || ''),
          vatRate: String(editData.vat_rate ? Number(editData.vat_rate) : 0)
        })));
      } else {
        setSplitMode(false);
      }
    } catch {}
  }, [open, editData]);

  const computeCOGS = useCallback(async () => {
      try {
        if (!open) return;
        if (lockType !== 'sent') return;
        const ref = (form.reference || '').trim();
        if (!ref) return;
        let effectiveCompanyId = companyId;
        if (!effectiveCompanyId || effectiveCompanyId.trim() === '') {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('company_id')
              .eq('user_id', user.id)
              .maybeSingle();
            effectiveCompanyId = (prof as any)?.company_id || effectiveCompanyId;
          }
        }
        if (!effectiveCompanyId || effectiveCompanyId.trim() === '') return;
        const { data: inv } = await supabase
          .from('invoices')
          .select('id')
          .eq('company_id', effectiveCompanyId)
          .eq('invoice_number', ref)
          .maybeSingle();
        const invId = (inv as any)?.id || '';
        if (!invId) return;
        setInvoiceIdForRef(invId);
        const { data: invItems } = await supabase
          .from('invoice_items')
          .select('description, quantity, unit_price, item_type')
          .eq('invoice_id', invId);
        let totalCost = 0;
          const names = (invItems || [])
            .filter((it: any) => String(it.item_type || '').toLowerCase() === 'product')
            .map((it: any) => String(it.description || ''))
            .filter(Boolean);
          if (names.length > 0) {
            const { data: prodByName } = await supabase
              .from('items')
              .select('name, cost_price')
              .eq('company_id', effectiveCompanyId)
              .eq('item_type', 'product');
            const costByName = new Map<string, number>();
            (prodByName || []).forEach((p: any) => costByName.set(String(p.name || ''), Number(p.cost_price || 0)));
            (invItems || []).forEach((it: any) => {
              if (String(it.item_type || '').toLowerCase() !== 'product') return;
              let cp = costByName.get(String(it.description || '')) || 0;
              if (!cp || cp <= 0) cp = Number(it.unit_price || 0);
              const qty = Number(it.quantity || 0);
              totalCost += (cp * qty);
            });
          }
        const lower = accounts.map(a => ({
          ...a,
          account_type: (a.account_type || '').toLowerCase(),
          account_name: (a.account_name || '').toLowerCase(),
          account_code: (a.account_code || '').toString(),
        }));
        const findAccount = (type: string, codes: string[], names: string[]): Account | null => {
          const byCode = lower.find(a => a.account_type === type.toLowerCase() && codes.includes(a.account_code));
          if (byCode) return accounts.find(x => x.id === byCode.id) || null;
          const byName = lower.find(a => a.account_type === type.toLowerCase() && names.some(n => a.account_name.includes(n)));
          if (byName) return accounts.find(x => x.id === byName.id) || null;
          return null;
        };
        let cogsAcc = findAccount('expense', ['5000'], ['cost of sales','cost of goods','cogs']);
        let invAcc = findAccount('asset', ['1300'], ['inventory','stock']);
        if (totalCost > 0) {
          if (!cogsAcc) {
            const { data: created } = await supabase
              .from('chart_of_accounts')
              .insert({ company_id: effectiveCompanyId, account_code: '5000', account_name: 'Cost of Sales', account_type: 'expense', is_active: true })
              .select('*')
              .single();
            cogsAcc = created as any as Account;
          }
          if (!invAcc) {
            const { data: created } = await supabase
              .from('chart_of_accounts')
              .insert({ company_id: effectiveCompanyId, account_code: '1300', account_name: 'Inventory', account_type: 'asset', is_active: true })
              .select('*')
              .single();
            invAcc = created as any as Account;
          }
        }
        setCogsTotal(totalCost);
        setCogsAccount(cogsAcc || null);
        setInventoryAccount(invAcc || null);
      } catch {}
  }, [open, lockType, form.reference, accounts, companyId]);
  useEffect(() => { computeCOGS(); }, [computeCOGS]);

  useEffect(() => {
    if (form.element === 'loan_interest') {
      if (!form.loanId) return;
      const loan = loans.find(l => l.id === form.loanId);
      if (!loan) return;
      const rate = Number(loan.interest_rate || 0);
      const bal = Number(loan.outstanding_balance || 0);
      const monthlyInterest = bal * (rate / 12);
      if (monthlyInterest > 0) {
        setForm(prev => ({ ...prev, amount: String(monthlyInterest.toFixed(2)) }));
      }
    } else if (form.element === 'depreciation') {
      if (!selectedAssetId) return;
      const asset = fixedAssets.find(a => a.id === selectedAssetId);
      if (!asset) return;
      const annual = Number(asset.cost || 0) / Number(asset.useful_life_years || 1);
      const monthly = annual / 12;
      if (monthly > 0) {
        setForm(prev => ({ ...prev, amount: String(monthly.toFixed(2)), description: `Depreciation - ${asset.description}` }));
      }
    }
  }, [form.element, form.loanId, loans, selectedAssetId, fixedAssets]);

  // Ensure locked flows always have required accounts set once accounts are loaded
  const ensureLockedAccounts = useCallback(() => {
    if (!open || !lockAccounts || accounts.length === 0) return;
    const lower = accounts.map(a => ({
      ...a,
      account_type: (a.account_type || '').toLowerCase(),
      account_name: (a.account_name || '').toLowerCase(),
      account_code: (a.account_code || '').toString(),
    }));
    const pick = (type: string, codes: string[], names: string[]) => {
      const byCode = lower.find(a => codes.includes(a.account_code) && a.account_type === type.toLowerCase());
      if (byCode) return byCode.id;
      const byName = lower.find(a => a.account_type === type.toLowerCase() && names.some(n => a.account_name.includes(n)));
      if (byName) return byName.id;
      const byType = lower.find(a => a.account_type === type.toLowerCase());
      return byType?.id || '';
    };
    if (lockType === 'sent') {
      const arId = form.debitAccount || pick('asset', ['1200'], ['receiv','debtors','accounts receiv']);
      const revId = form.creditAccount || pick('income', ['4000'], ['sales revenue','revenue','sales','income']);
      setForm(prev => ({ ...prev, debitAccount: arId, creditAccount: revId }));
    } else if (lockType === 'paid') {
      const bankId = form.debitAccount || pick('asset', ['1100'], ['bank','cash']);
      const arId = form.creditAccount || pick('asset', ['1200'], ['receiv','debtors','accounts receiv']);
      setForm(prev => ({ ...prev, debitAccount: bankId, creditAccount: arId }));
    } else if (lockType === 'po_sent') {
      const creditAccountId = (prefill?.funding_source === 'loan' || Boolean(prefill?.loan_ledger_id))
        ? (form.creditAccount || pick('liability', ['2300','2400'], ['loan']))
        : (form.creditAccount || pick('liability', ['2000'], ['accounts payable','payable']));
      
      if (form.element === 'product_purchase') {
         const invId = form.debitAccount || pick('asset', ['1300'], ['inventory','stock']);
         setForm(prev => ({ ...prev, debitAccount: invId, creditAccount: creditAccountId }));
      } else {
         const expId = form.debitAccount || pick('expense', ['5000'], ['expense']);
         setForm(prev => ({ ...prev, debitAccount: expId, creditAccount: creditAccountId }));
      }
    }
  }, [open, lockAccounts, lockType, accounts, form.debitAccount, form.creditAccount]);
  useEffect(() => { ensureLockedAccounts(); }, [ensureLockedAccounts]);

  // Filter accounts based on search input
  const debitSource = debitIncludeAll ? accounts : debitAccounts;
  const baseCreditSource = creditIncludeAll ? accounts : creditAccounts;
  const creditSource = (lockAccounts && lockType === 'sent' && form.creditAccount)
    ? baseCreditSource.filter(a => a.id === form.creditAccount)
    : baseCreditSource;

  const filteredDebitAccounts = debitSource.filter(a =>
    a.account_name.toLowerCase().includes(debitSearch.toLowerCase()) ||
    a.account_code.toLowerCase().includes(debitSearch.toLowerCase())
  );

  const filteredCreditAccounts = creditSource.filter(a =>
    a.account_name.toLowerCase().includes(creditSearch.toLowerCase()) ||
    a.account_code.toLowerCase().includes(creditSearch.toLowerCase())
  );

  // Debounce search input
  useEffect(() => {
    setDebitSearch("");
    setCreditSearch("");
  }, [open, editData]);

  // Filter accounts based on accounting element and payment method
  const filterAccountsByElement = useCallback(() => {
    if (!form.element || accounts.length === 0) {
      setDebitAccounts([]);
      setCreditAccounts([]);
      return;
    }

    const config = ACCOUNTING_ELEMENTS.find(e => e.value === form.element);
    if (!config) return;

    // Base filtered sets by element
    let debits = accounts.filter(acc => (acc.account_type || '').toLowerCase() === config.debitType);
    let credits = accounts.filter(acc => config.creditTypes.includes((acc.account_type || '').toLowerCase()));

    // Asset purchase: narrow debit side to fixed assets only (codes 15xx or known names), exclude accumulated depreciation
    if (form.element === 'asset') {
      const isFixedAsset = (acc: Account) => {
        const name = String(acc.account_name || '').toLowerCase();
        const fixedNames = ['land','building','buildings','plant','machinery','motor vehicle','vehicles','furniture','fixtures','equipment','computer','software','goodwill'];
        const nameMatches = fixedNames.some(n => name.includes(n));
        const isAccum = name.includes('accumulated') || name.includes('depreciation') || name.includes('amortization');
        return !isAccum && nameMatches;
      };
      debits = debits.filter(isFixedAsset);
    }

    // Product purchase: narrow debit side to inventory accounts (code 1300 or names)
    if (form.element === 'product_purchase') {
      const isInventory = (acc: Account) => {
        const code = String(acc.account_code || '');
        const name = String(acc.account_name || '').toLowerCase();
        const isInvName = name.includes('inventory') || name.includes('stock');
        const isInvCode = code === '1300' || code.startsWith('13');
        return isInvName || isInvCode;
      };
      debits = debits.filter(isInventory);
    }

    // Exclude the opposite side's currently selected account to avoid duplicates
    if (form.creditAccount) {
      debits = debits.filter(acc => acc.id !== form.creditAccount);
    }
    if (form.debitAccount) {
      credits = credits.filter(acc => acc.id !== form.debitAccount);
    }

    // When posting a Sent invoice, hard-lock the credit list to the preset Sales Revenue ledger
    if (lockAccounts && lockType === 'sent' && form.creditAccount) {
      credits = credits.filter(acc => acc.id === form.creditAccount);
    }

    setDebitAccounts(debits);
    setCreditAccounts(credits);

    // Auto-select accounts based on element and payment method
    if (!lockAccounts) {
      autoSelectAccounts(config, debits, credits);
    }

    // Fallback defaults: if not selected yet, choose the first available
    if (!lockAccounts) {
      setForm(prev => ({
        ...prev,
        debitAccount: prev.debitAccount || (debits[0]?.id || ""),
        creditAccount: prev.creditAccount || (credits[0]?.id || ""),
      }));
    }
  }, [form.element, form.paymentMethod, accounts, form.debitAccount, form.creditAccount, lockAccounts]);
  useEffect(() => { filterAccountsByElement(); }, [filterAccountsByElement]);

  
  

  const autoClassifyTransaction = useCallback(async (description: string) => {
    try {
      const { data, error } = await supabase.rpc('auto_classify_transaction', {
        _description: description
      });
      if (error) throw error;
      if (data && data.length > 0) {
        setAutoClassification({
          type: data[0].transaction_type,
          category: data[0].category
        });
      }
    } catch (error: any) {
      console.error("Auto-classification error:", error);
    }
  }, []);

  const checkDuplicate = useCallback(async () => {
    try {
      // Convert empty string to null for bank_account_id
      const bankAccountId = form.bankAccountId && form.bankAccountId.trim() !== "" ? form.bankAccountId : null;
      
      const { data, error } = await supabase.rpc('check_duplicate_transaction', {
        _company_id: companyId,
        _bank_account_id: bankAccountId,
        _transaction_date: form.date,
        _total_amount: parseFloat(form.amount || "0"),
        _description: form.description
      });
      if (error) throw error;
      setIsDuplicate(data === true);
    } catch (error: any) {
      console.error("Duplicate check error:", error);
    }
  }, [companyId, form.bankAccountId, form.date, form.amount, form.description]);

  function autoSelectAccounts(config: typeof ACCOUNTING_ELEMENTS[0], debits: Account[], credits: Account[]) {
    if (!config || debits.length === 0 || credits.length === 0) return;

    const paymentMethod = PAYMENT_METHODS.find(m => m.value === form.paymentMethod);
    if (!paymentMethod) return;

    const keywords = paymentMethod.accountKeyword.split(',');

    // Auto-select based on element type and payment method
    try {
      if (form.element === 'loan_received') {
        const bankAccount = debits.find(acc => 
          acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank')
        );
        const preferredCode = form.loanTermType === 'long' ? '2400' : '2300';
        let loanPayable = credits.find(acc => acc.account_type === 'liability' && acc.account_code === preferredCode);
        if (!loanPayable) {
          loanPayable = credits.find(acc => acc.account_type === 'liability' && (acc.account_code === '2300' || acc.account_code === '2400'));
        }
        if (bankAccount) {
          setForm(prev => ({ ...prev, debitAccount: prev.debitAccount || bankAccount.id }));
        }
        if (loanPayable) {
          setForm(prev => ({ ...prev, creditAccount: prev.creditAccount || loanPayable.id }));
        }
      } else if (form.element === 'loan_repayment') {
        // Loan repayment: Auto-select loan payable for debit, bank for credit
        const loanPayable = debits.find(acc => 
          acc.account_type === 'liability' && (acc.account_code === '2300' || acc.account_code === '2400')
        );
        const bankAccount = credits.find(acc => 
          acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank')
        );
        if (loanPayable) {
          setForm(prev => ({ ...prev, debitAccount: prev.debitAccount || loanPayable.id }));
        }
        if (bankAccount) {
          setForm(prev => ({ ...prev, creditAccount: prev.creditAccount || bankAccount.id }));
        }
      } else if (form.element === 'loan_interest') {
        // Loan interest: Auto-select interest expense for debit, bank for credit
        const interestExpense = debits.find(acc => 
          acc.account_type === 'expense' && acc.account_name.toLowerCase().includes('interest')
        );
        const bankAccount = credits.find(acc => 
          acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank')
        );
        if (interestExpense) {
          setForm(prev => ({ ...prev, debitAccount: prev.debitAccount || interestExpense.id }));
        }
        if (bankAccount) {
          setForm(prev => ({ ...prev, creditAccount: prev.creditAccount || bankAccount.id }));
        }
      } else if (form.element === 'expense' || form.element === 'asset' || form.element === 'liability') {
        let creditAccount: Account | undefined;
        if (paymentMethod.value === 'accrual') {
          creditAccount = credits.find(acc => (acc.account_type || '').toLowerCase() === 'liability' && ((acc.account_code || '').toString() === '2000' || (acc.account_name || '').toLowerCase().includes('accounts payable') || (acc.account_name || '').toLowerCase().includes('payable')));
        } else {
          creditAccount =
            credits.find(acc => (acc.account_type || '').toLowerCase() === 'asset' && String(acc.account_code || '') === '1100') ||
            credits.find(acc => 
              keywords.some(kw => (acc.account_name || '').toLowerCase().includes(kw.trim()))
            );
        }
        if (creditAccount) {
          setForm(prev => ({ ...prev, creditAccount: prev.creditAccount || creditAccount.id }));
        }
      } else if (form.element === 'income' || form.element === 'equity') {
        const debitAccount =
          debits.find(acc => (acc.account_type || '').toLowerCase() === 'asset' && String(acc.account_code || '') === '1100') ||
          debits.find(acc => 
            keywords.some(kw => (acc.account_name || '').toLowerCase().includes(kw.trim()))
          );
        if (debitAccount) {
          setForm(prev => ({ ...prev, debitAccount: prev.debitAccount || debitAccount.id }));
        }
        if (form.element === 'equity') {
          const equityCredit = credits.find(acc => (acc.account_type || '').toLowerCase() === 'equity') || credits[0];
          if (equityCredit) {
            setForm(prev => ({ ...prev, creditAccount: prev.creditAccount || equityCredit.id }));
          }
        }
      } else if (form.element === 'depreciation') {
        const depExp = debits.find(acc => acc.account_type === 'expense' && acc.account_name.toLowerCase().includes('depreciation')) || debits.find(acc => acc.account_type === 'expense' && acc.account_name.toLowerCase().includes('asset'));
        const accDep = credits.find(acc => acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('accumulated')) || credits.find(acc => acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('depreciation'));
        if (depExp) {
          setForm(prev => ({ ...prev, debitAccount: prev.debitAccount || depExp.id }));
        }
        if (accDep) {
          setForm(prev => ({ ...prev, creditAccount: prev.creditAccount || accDep.id }));
        }
      } else if (form.element === 'asset_disposal') {
        const bankAccount = debits.find(acc => acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank')) || credits.find(acc => acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank'));
        const assetAcc = credits.find(acc => acc.account_type === 'asset' && ((acc.account_code || '').toString().startsWith('15') || acc.account_name.toLowerCase().includes('asset') || acc.account_name.toLowerCase().includes('equipment') || acc.account_name.toLowerCase().includes('vehicle') || acc.account_name.toLowerCase().includes('machinery')))
          || debits.find(acc => acc.account_type === 'asset' && ((acc.account_code || '').toString().startsWith('15') || acc.account_name.toLowerCase().includes('asset')));
        if (bankAccount) {
          setForm(prev => ({ ...prev, debitAccount: prev.debitAccount || bankAccount.id }));
        }
        if (assetAcc) {
          setForm(prev => ({ ...prev, creditAccount: prev.creditAccount || assetAcc.id }));
        }
      }
    } catch (error) {
      console.error("Auto-select accounts error:", error);
    }
  }

  const handleSubmit = useCallback(async () => {
    try {
      setLoading(true);

      if (parseFloat(form.vatRate) > 0 && !isVatRegistered) {
        toast({
            title: "VAT Error",
            description: "You cannot add VAT to a business that is not registered for VAT.",
            variant: "destructive"
        });
        setLoading(false);
        return;
      }

      // Verify period lock
      if (companyId) {
        try {
          await validateTransactionDate(companyId, form.date);
        } catch (error: any) {
          toast({ title: "Period Locked", description: error.message, variant: "destructive" });
          setLoading(false);
          return;
        }
      }

      if (showFixedAssetsUI && form.element === 'asset') {
        setProgressText("Initializing Asset Posting...");
        setPostProgress(10);
      }

      // Validation
      let validationResult;
      if (splitMode) {
          // Custom validation for split mode
          const baseSchema = transactionSchema.omit({ debitAccount: true, creditAccount: true });
          validationResult = baseSchema.safeParse(form);
          
          if (validationResult.success) {
             const isDebitSplit = ['expense', 'asset', 'product_purchase', 'liability', 'loan_repayment', 'loan_interest', 'depreciation'].includes(form.element);
             if (isDebitSplit && !form.creditAccount) {
                 toast({ title: "Validation Error", description: "Credit account is required.", variant: "destructive" });
                 setLoading(false);
                 return;
             }
             if (!isDebitSplit && !form.debitAccount) {
                 toast({ title: "Validation Error", description: "Debit account is required.", variant: "destructive" });
                 setLoading(false);
                 return;
             }
             
             // Check split balance
             const splitTotal = splits.reduce((sum, split) => sum + (parseFloat(split.amount) || 0), 0);
             const totalAmount = parseFloat(form.amount) || 0;
             if (Math.abs(totalAmount - splitTotal) > 0.01) {
                toast({ title: "Unbalanced Split", description: `Split total (${splitTotal.toFixed(2)}) does not match transaction amount (${totalAmount.toFixed(2)})`, variant: "destructive" });
                setLoading(false);
                return;
             }
             
             // Check if all accounts selected
             if (splits.some(s => !s.accountId)) {
                toast({ title: "Missing Account", description: "Please select an account for all split lines.", variant: "destructive" });
                setLoading(false);
                return;
             }
          }
      } else {
          validationResult = transactionSchema.safeParse(form);
      }

      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        toast({ title: "Validation Error", description: firstError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      if (chartMissing) {
        toast({ title: "Cannot proceed", description: "Chart of Accounts missing or incomplete.", variant: "destructive" });
        return;
      }

      if (form.debitAccount === form.creditAccount) {
        toast({ title: "Invalid entry", description: "Debit and credit accounts must be different", variant: "destructive" });
        return;
      }

      // If editing, update the transaction header fields and account mapping
      if (editData && editData.id) {
        // Guard: ensure we have a valid transaction id to post against
        if (!editData.id) {
          toast({ 
            title: "Missing transaction ID", 
            description: "Cannot post ledger entries without a valid transaction.", 
            variant: "destructive" 
          });
          return;
        }
        
        // Calculate VAT amounts for edit path (similar to create path)
      const amountNum = parseFloat(form.amount || "0");
      const isLoan = !!(form.element && form.element.startsWith('loan_'));
      const vatRate = (isLoan || form.element === 'asset_disposal') ? 0 : parseFloat(form.vatRate);
      const isPurchase = form.element === 'expense' || form.element === 'product_purchase';
      const inclusive = amountIncludesVAT;
      let vatAmount = 0;
      let netAmount = amountNum;
      if (vatRate > 0) {
        if (inclusive) {
          const base = amountNum / (1 + (vatRate / 100));
          vatAmount = amountNum - base;
          netAmount = base;
        } else {
          vatAmount = (amountNum * vatRate) / 100;
          netAmount = amountNum;
        }
      }
        
        // Get VAT account if needed
        let vatAccount = null;
        if (vatAmount > 0 && vatRate > 0) {
          vatAccount = accounts.find(acc => 
            (acc.account_name || '').toLowerCase().includes('vat') || 
            (acc.account_name || '').toLowerCase().includes('tax')
          );
          
          if (!vatAccount) {
            toast({ 
              title: "VAT Account Missing", 
              description: "Please create a VAT account in Chart of Accounts before adding VAT transactions.", 
              variant: "destructive" 
            });
            return;
          }
        }
        
        const { error: updateError } = await supabase
          .from("transactions")
          .update({ 
            transaction_date: form.date,
            description: form.description.trim(),
            reference_number: form.reference ? form.reference.trim() : null,
            transaction_type: lockType === 'po_sent' ? 'purchase' : (form.element || null),
            bank_account_id: form.bankAccountId && form.bankAccountId.trim() !== "" ? form.bankAccountId : null,
            total_amount: (isNaN(amountNum) ? 0 : amountNum),
            debit_account_id: form.debitAccount,
            credit_account_id: form.creditAccount,
            vat_rate: vatRate > 0 ? vatRate : null,
            vat_amount: vatAmount > 0 ? vatAmount : null,
            base_amount: netAmount,
            vat_inclusive: inclusive,
           })
          .eq("id", editData.id);

        if (updateError) throw updateError;

        // Simple posting logic: recreate double-entry rows for trial balance
        // Remove prior entries to avoid duplicates (transaction_entries and ledger_entries)
        await supabase.from("transaction_entries").delete().eq("transaction_id", editData.id);
        await supabase.from("ledger_entries").delete().eq("transaction_id", editData.id);

        const sanitizedDescription = form.description.trim();
        const amountAbs = Math.abs(amountNum || 0);
        
        // Resolve company id for ledger insert
        let effectiveCompanyId = companyId;
        if (!effectiveCompanyId || effectiveCompanyId.trim() === "") {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: prof } = await supabase
                .from('profiles')
                .select('company_id')
                .eq('user_id', user.id)
                .single();
              if (prof?.company_id) {
                effectiveCompanyId = prof.company_id as string;
              }
            }
          } catch {}
        }
        if (!effectiveCompanyId || effectiveCompanyId.trim() === "") {
          toast({ 
            title: "Company context missing", 
            description: "Company ID is required to post ledger entries.", 
            variant: "destructive" 
          });
          return;
        }
        // Create VAT-aware entries for edit path (similar to create path)
        const entries: any[] = [];
        
        if (splitMode) {
            const isDebitSplit = ['expense', 'asset', 'product_purchase', 'liability', 'loan_repayment', 'loan_interest', 'depreciation'].includes(form.element);
            
            // 1. Add the Single Side (Bank/Source)
            if (isDebitSplit) {
                 // Credit Bank for Total Amount
                 entries.push({
                    transaction_id: editData.id,
                    account_id: form.creditAccount,
                    debit: 0,
                    credit: amountAbs,
                    description: sanitizedDescription,
                    status: "approved"
                 });
            } else {
                 // Debit Bank for Total Amount (Income)
                 entries.push({
                    transaction_id: editData.id,
                    account_id: form.debitAccount,
                    debit: amountAbs,
                    credit: 0,
                    description: sanitizedDescription,
                    status: "approved"
                 });
            }

            // 2. Add Split Entries
            for (const split of splits) {
                const splitAmount = parseFloat(split.amount) || 0;
                const splitVatRate = parseFloat(split.vatRate) || 0;
                const splitDesc = split.description || sanitizedDescription;
                
                let splitNet = splitAmount;
                let splitVat = 0;
                
                if (splitVatRate > 0) {
                   if (amountIncludesVAT) {
                      const base = splitAmount / (1 + (splitVatRate / 100));
                      splitVat = splitAmount - base;
                      splitNet = base;
                   } else {
                      splitVat = (splitAmount * splitVatRate) / 100;
                      // If excl VAT, the entry amount is Net, and we add VAT on top.
                      // But wait, if amount is excl VAT, the Bank Amount (Total) should be Net + VAT.
                      // My Bank Entry above used `amountAbs` which comes from `form.amount`.
                      // If `amountIncludesVAT` is false, `form.amount` is Net.
                      // So Total Bank = Net + VAT.
                      // The loop above adds Bank = `amountAbs`.
                      // This implies `amountAbs` MUST be the Total Payment.
                      // If user enters Net Amount (excl VAT), then `form.amount` is Net.
                      // I need to adjust the Bank Amount if Excl VAT.
                      
                      // Actually, let's look at existing logic:
                      // const amountNum = parseFloat(form.amount || "0");
                      // if inclusive: base = amount / (1+r); vat = amount - base; net = base;
                      // if exclusive: vat = amount * r; net = amount;
                      // entries: Debit Net, Debit Vat, Credit (Net + Vat).
                      
                      // So `form.amount` is treated as Base if Exclusive.
                      // And `form.amount` is treated as Total if Inclusive.
                      
                      // In Split Mode:
                      // Each split has an amount.
                      // If Inclusive: Split Amount is Total. Net = Split / (1+r). Vat = Split - Net.
                      // If Exclusive: Split Amount is Base. Net = Split. Vat = Split * r.
                      
                      // Bank Amount = Sum of (Net + Vat) for all splits.
                      // The `amountAbs` variable is just `form.amount`.
                      // If Exclusive, `form.amount` is sum of Bases.
                      // So Bank Amount should be calculated from splits, NOT `form.amount` directly if Exclusive.
                   }
                }
                
                if (!amountIncludesVAT && splitVatRate > 0) {
                   splitVat = (splitAmount * splitVatRate) / 100;
                   // Net is splitAmount
                }
                
                // Find VAT Account
                let splitVatAccount = null;
                if (splitVat > 0) {
                   splitVatAccount = accounts.find(acc => (acc.account_name || '').toLowerCase().includes('vat') || (acc.account_name || '').toLowerCase().includes('tax'));
                }

                if (isDebitSplit) {
                    entries.push({
                        transaction_id: editData.id,
                        account_id: split.accountId,
                        debit: splitNet,
                        credit: 0,
                        description: splitDesc,
                        status: "approved"
                    });
                    if (splitVat > 0 && splitVatAccount) {
                        entries.push({
                            transaction_id: editData.id,
                            account_id: splitVatAccount.id,
                            debit: splitVat,
                            credit: 0,
                            description: "VAT Input",
                            status: "approved"
                        });
                    }
                } else {
                    entries.push({
                        transaction_id: editData.id,
                        account_id: split.accountId,
                        debit: 0,
                        credit: splitNet,
                        description: splitDesc,
                        status: "approved"
                    });
                    if (splitVat > 0 && splitVatAccount) {
                         entries.push({
                            transaction_id: editData.id,
                            account_id: splitVatAccount.id,
                            debit: 0,
                            credit: splitVat,
                            description: "VAT Output",
                            status: "approved"
                        });
                    }
                }
            }
            
            // Re-calculate Total Bank Amount from splits to be safe
             const totalBankAmount = splits.reduce((sum, split) => {
                const amt = parseFloat(split.amount) || 0;
                const rate = parseFloat(split.vatRate) || 0;
                if (amountIncludesVAT) return sum + amt;
                return sum + amt + (amt * rate / 100);
             }, 0);
             
             // Update the Bank Entry amount
             if (entries.length > 0) {
                 if (isDebitSplit) {
                     entries[0].credit = totalBankAmount;
                 } else {
                     entries[0].debit = totalBankAmount;
                 }
             }
             
             // Update Transaction Total Amount in DB?
             // The code earlier did: .update({ total_amount: amountNum ... })
             // If Exclusive, amountNum is Base. But total_amount usually implies final money movement.
             // I should probably update `transactions` table with `totalBankAmount` if it differs.
             // But let's stick to entries for now.
        } else if (vatAmount > 0 && vatAccount && vatAccount.id) {
          // VAT-inclusive transaction
          if (form.element === 'expense') {
            // Expense with VAT: Debit Expense (net), Debit VAT Input (vat), Credit Bank (total)
            entries.push(
              {
                transaction_id: editData.id,
                account_id: form.debitAccount, // Expense account
                debit: netAmount,
                credit: 0,
                description: sanitizedDescription,
                status: "approved"
              },
              {
                transaction_id: editData.id,
                account_id: vatAccount.id, // VAT Input account
                debit: vatAmount,
                credit: 0,
                description: 'VAT Input',
                status: "approved"
              },
              {
                transaction_id: editData.id,
                account_id: form.creditAccount, // Bank account
                debit: 0,
                credit: netAmount + vatAmount,
                description: sanitizedDescription,
                status: "approved"
              }
            );
          } else if (form.element === 'income') {
            // Income with VAT: Debit Bank (total), Credit Income (net), Credit VAT Output (vat)
            entries.push(
              {
                transaction_id: editData.id,
                account_id: form.debitAccount, // Bank account
                debit: amountAbs, // Total amount
                credit: 0,
                description: sanitizedDescription,
                status: "approved"
              },
              {
                transaction_id: editData.id,
                account_id: form.creditAccount, // Income account
                debit: 0,
                credit: netAmount,
                description: sanitizedDescription,
                status: "approved"
              },
              {
                transaction_id: editData.id,
                account_id: vatAccount.id, // VAT Output account
                debit: 0,
                credit: vatAmount,
                description: 'VAT Output',
                status: "approved"
              }
            );
          } else if (form.element === 'asset') {
            entries.push(
              {
                transaction_id: editData.id,
                account_id: form.debitAccount,
                debit: netAmount,
                credit: 0,
                description: sanitizedDescription,
                status: "approved"
              },
              {
                transaction_id: editData.id,
                account_id: vatAccount.id,
                debit: vatAmount,
                credit: 0,
                description: 'VAT Input',
                status: "approved"
              },
              {
                transaction_id: editData.id,
                account_id: form.creditAccount,
                debit: 0,
                credit: netAmount + vatAmount,
                description: sanitizedDescription,
                status: "approved"
              }
            );
          } else if (form.element === 'product_purchase') {
            entries.push(
              {
                transaction_id: editData.id,
                account_id: form.debitAccount,
                debit: netAmount,
                credit: 0,
                description: sanitizedDescription,
                status: "approved"
              },
              {
                transaction_id: editData.id,
                account_id: vatAccount.id,
                debit: vatAmount,
                credit: 0,
                description: 'VAT Input',
                status: "approved"
              },
              {
                transaction_id: editData.id,
                account_id: form.creditAccount,
                debit: 0,
                credit: netAmount + vatAmount,
                description: sanitizedDescription,
                status: "approved"
              }
            );

            // Handle Deposit Offset if applicable
            const depositAvailable = Number(editData?.deposit_available || 0);
            const depositAccountId = editData?.deposit_account_id;
            const totalPayable = netAmount + vatAmount;
            
            if (depositAvailable > 0 && depositAccountId) {
              const offsetAmount = Math.min(depositAvailable, totalPayable);
              if (offsetAmount > 0) {
                entries.push(
                  {
                    transaction_id: editData.id,
                    account_id: form.creditAccount, // AP Account (Debit to reduce liability)
                    debit: offsetAmount,
                    credit: 0,
                    description: 'Deposit Allocation',
                    status: "approved"
                  },
                  {
                    transaction_id: editData.id,
                    account_id: depositAccountId, // Deposit Asset (Credit to reduce asset)
                    debit: 0,
                    credit: offsetAmount,
                    description: 'Deposit Allocation',
                    status: "approved"
                  }
                );
              }
            }
          } else {
            // Other transaction types - treat as no VAT for now
            entries.push(
              {
                transaction_id: editData.id,
                account_id: form.debitAccount,
                debit: amountAbs,
                credit: 0,
                description: sanitizedDescription,
                status: "approved"
              },
              {
                transaction_id: editData.id,
                account_id: form.creditAccount,
                debit: 0,
                credit: amountAbs,
                description: sanitizedDescription,
                status: "approved"
              }
            );
          }
        } else {
          // No VAT - simple double entry
          entries.push(
            {
              transaction_id: editData.id,
              account_id: form.debitAccount,
              debit: amountAbs,
              credit: 0,
              description: sanitizedDescription,
              status: "approved"
            },
            {
              transaction_id: editData.id,
              account_id: form.creditAccount,
              debit: 0,
              credit: amountAbs,
              description: sanitizedDescription,
              status: "approved"
            }
          );
        }

        const { error: entriesErr } = await supabase
          .from("transaction_entries")
          .insert(entries);
        if (entriesErr) throw entriesErr;

        // Also insert into ledger_entries so AFS/Trial Balance sees the amounts (VAT-aware)
        const ledgerRows: any[] = [];
        
        if (vatAmount > 0 && vatAccount && vatAccount.id) {
          // VAT-inclusive ledger entries
          if (form.element === 'expense') {
            // Expense with VAT: Debit Expense (net), Debit VAT Input (vat), Credit Bank (total)
            ledgerRows.push(
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.debitAccount, // Expense account
                entry_date: form.date,
                description: sanitizedDescription,
                debit: netAmount,
                credit: 0,
                is_reversed: false,
              },
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: vatAccount.id, // VAT Input account
                entry_date: form.date,
                description: 'VAT Input',
                debit: vatAmount,
                credit: 0,
                is_reversed: false,
              },
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.creditAccount, // Bank account
                entry_date: form.date,
                description: sanitizedDescription,
                debit: 0,
                credit: amountAbs, // Total amount
                is_reversed: false,
              }
            );
          } else if (form.element === 'income') {
            // Income with VAT: Debit Bank (total), Credit Income (net), Credit VAT Output (vat)
            ledgerRows.push(
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.debitAccount, // Bank account
                entry_date: form.date,
                description: sanitizedDescription,
                debit: amountAbs, // Total amount
                credit: 0,
                is_reversed: false,
              },
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.creditAccount, // Income account
                entry_date: form.date,
                description: sanitizedDescription,
                debit: 0,
                credit: netAmount,
                is_reversed: false,
              },
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: vatAccount.id, // VAT Output account
                entry_date: form.date,
                description: 'VAT Output',
                debit: 0,
                credit: vatAmount,
                is_reversed: false,
              }
            );
          } else if (form.element === 'asset') {
            ledgerRows.push(
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.debitAccount,
                entry_date: form.date,
                description: sanitizedDescription,
                debit: netAmount,
                credit: 0,
                is_reversed: false,
              },
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: vatAccount.id,
                entry_date: form.date,
                description: 'VAT Input',
                debit: vatAmount,
                credit: 0,
                is_reversed: false,
              },
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.creditAccount,
                entry_date: form.date,
                description: sanitizedDescription,
                debit: 0,
                credit: amountAbs,
                is_reversed: false,
              }
            );
          } else if (form.element === 'product_purchase') {
            ledgerRows.push(
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.debitAccount,
                entry_date: form.date,
                description: sanitizedDescription,
                debit: netAmount,
                credit: 0,
                is_reversed: false,
              },
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: vatAccount.id,
                entry_date: form.date,
                description: 'VAT Input',
                debit: vatAmount,
                credit: 0,
                is_reversed: false,
              },
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.creditAccount,
                entry_date: form.date,
                description: sanitizedDescription,
                debit: 0,
                credit: amountAbs,
                is_reversed: false,
              }
            );

            // Handle Deposit Offset if applicable
            const depositAvailable = Number(editData?.deposit_available || 0);
            const depositAccountId = editData?.deposit_account_id;
            const totalPayable = amountAbs; // amountAbs includes VAT if applicable in this context?
            // In ledgerRows logic above:
            // debit: netAmount, debit: vatAmount, credit: amountAbs
            // So amountAbs = netAmount + vatAmount (if standard purchase)
            
            if (depositAvailable > 0 && depositAccountId) {
              const offsetAmount = Math.min(depositAvailable, totalPayable);
              if (offsetAmount > 0) {
                ledgerRows.push(
                  {
                    company_id: effectiveCompanyId,
                    transaction_id: editData.id,
                    account_id: form.creditAccount, // AP Account (Debit to reduce liability)
                    entry_date: form.date,
                    description: 'Deposit Allocation',
                    debit: offsetAmount,
                    credit: 0,
                    is_reversed: false,
                  },
                  {
                    company_id: effectiveCompanyId,
                    transaction_id: editData.id,
                    account_id: depositAccountId, // Deposit Asset (Credit to reduce asset)
                    entry_date: form.date,
                    description: 'Deposit Allocation',
                    debit: 0,
                    credit: offsetAmount,
                    is_reversed: false,
                  }
                );
              }
            }
          } else {
            // Other transaction types - treat as no VAT for now
            ledgerRows.push(
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.debitAccount,
                entry_date: form.date,
                description: sanitizedDescription,
                debit: amountAbs,
                credit: 0,
                is_reversed: false,
              },
              {
                company_id: effectiveCompanyId,
                transaction_id: editData.id,
                account_id: form.creditAccount,
                entry_date: form.date,
                description: sanitizedDescription,
                debit: 0,
                credit: amountAbs,
                is_reversed: false,
              }
            );
          }
        } else {
          // No VAT - simple double entry
          ledgerRows.push(
            {
              company_id: effectiveCompanyId,
              transaction_id: editData.id,
              account_id: form.debitAccount,
              entry_date: form.date,
              description: sanitizedDescription,
              debit: amountAbs,
              credit: 0,
              is_reversed: false,
            },
            {
              company_id: effectiveCompanyId,
              transaction_id: editData.id,
              account_id: form.creditAccount,
              entry_date: form.date,
              description: sanitizedDescription,
              debit: 0,
              credit: amountAbs,
              is_reversed: false,
            }
          );
        }

        const { error: ledgerErr } = await supabase
          .from("ledger_entries")
          .insert(ledgerRows as any);
        if (ledgerErr) throw ledgerErr;

        // Optional: mark transaction approved for clarity in UI
        await supabase.from("transactions").update({ status: "approved" }).eq("id", editData.id);
        emitDashboardCacheInvalidation(effectiveCompanyId);

        // Optional: refresh AFS/trial balance cache (if available)
        try {
          if (companyId) {
            await supabase.rpc('refresh_afs_cache', { _company_id: companyId });
          }
        } catch {}

        toast({ title: "Success", description: "Transaction posted to Trial Balance" });
        onOpenChange(false);
        onSuccess();
        return;
      }

      // Validate bank account if provided (and enforce when payment method is bank)
      let bankAccountId: string | null = null;
      if (form.bankAccountId && form.bankAccountId.trim() !== "" && form.bankAccountId !== "__none__") {
        // Check if bank account exists in the loaded bank accounts list
        const bankExists = bankAccounts.find(bank => bank.id === form.bankAccountId);
        if (!bankExists) {
          toast({ 
            title: "Invalid Bank Account", 
            description: "The selected bank account no longer exists. Please select a valid bank account or leave it empty.", 
            variant: "destructive" 
          });
          return;
        }
        // Ensure it's a valid UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(form.bankAccountId)) {
          toast({ 
            title: "Invalid Bank Account ID", 
            description: "Bank account ID format is invalid.", 
            variant: "destructive" 
          });
          return;
        }
        bankAccountId = form.bankAccountId;
      }
      
      // Double-check: ensure we're sending null, not empty string
      if (bankAccountId === "" || bankAccountId === "__none__") {
        bankAccountId = null;
      }

      // If payment method is bank, enforce that a valid bank account is selected
      if (form.paymentMethod === 'bank' && form.element !== 'depreciation' && form.element !== 'asset_disposal' && !bankAccountId) {
        toast({ 
          title: "Bank Account Required", 
          description: "For bank payments/receipts, please select a valid bank account.", 
          variant: "destructive" 
        });
        return;
      }

      // Validate asset purchase: require debit account to be a Fixed Asset ledger
      if (showFixedAssetsUI && form.element === 'asset') {
        const debitAcc = accounts.find(a => a.id === form.debitAccount);
        const isAssetType = (debitAcc?.account_type || '').toLowerCase() === 'asset';
        const name = (debitAcc?.account_name || '').toLowerCase();
        const fixedNames = ['land','building','buildings','plant','machinery','motor vehicle','vehicles','furniture','fixtures','equipment','computer','software','goodwill'];
        const nameMatches = fixedNames.some(n => name.includes(n));
        const isAccum = name.includes('accumulated') || name.includes('depreciation') || name.includes('amortization');
        if (!isAssetType || isAccum || !nameMatches) {
          toast({ title: "Select Fixed Asset Ledger", description: "For Asset Purchase, choose a fixed asset ledger.", variant: "destructive" });
          return;
        }
      }

      const amount = parseFloat(form.amount);
      if (form.element === 'loan_interest' && form.loanId) {
        const monthStart = new Date((form.date || new Date().toISOString().slice(0,10)).slice(0,7) + '-01');
        const nextMonth = new Date(monthStart);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const monthStartStr = monthStart.toISOString().slice(0,10);
        const nextMonthStr = nextMonth.toISOString().slice(0,10);
        const { data: interestDup } = await supabase
          .from('loan_payments')
          .select('id')
          .eq('loan_id', form.loanId)
          .gte('payment_date', monthStartStr)
          .lt('payment_date', nextMonthStr)
          .gt('interest_component', 0);
        if ((interestDup || []).length > 0) {
          toast({ title: 'Duplicate', description: 'Interest installment for this month is already recorded', variant: 'destructive' });
          setLoading(false);
          return;
        }
      }
      if (form.element === 'loan_repayment' && form.loanId) {
        const monthStart = new Date((form.date || new Date().toISOString().slice(0,10)).slice(0,7) + '-01');
        const nextMonth = new Date(monthStart);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const monthStartStr = monthStart.toISOString().slice(0,10);
        const nextMonthStr = nextMonth.toISOString().slice(0,10);
        const { data: principalDup } = await supabase
          .from('loan_payments')
          .select('id')
          .eq('loan_id', form.loanId)
          .gte('payment_date', monthStartStr)
          .lt('payment_date', nextMonthStr)
          .gt('principal_component', 0);
        if ((principalDup || []).length > 0) {
          toast({ title: 'Duplicate', description: 'Principal installment for this month is already recorded', variant: 'destructive' });
          setLoading(false);
          return;
        }
      }
      const isLoan = !!(form.element && form.element.startsWith('loan_'));
      const vatRate = (isLoan || form.element === 'depreciation' || form.element === 'asset_disposal') ? 0 : parseFloat(form.vatRate);
      const isPurchase = form.element === 'expense' || form.element === 'product_purchase';
      const inclusive = amountIncludesVAT;
      let vatAmount = 0;
      let netAmount = amount;
      if (vatRate > 0) {
        if (inclusive) {
          const base = amount / (1 + (vatRate / 100));
          vatAmount = amount - base;
          netAmount = base;
        } else {
          vatAmount = (amount * vatRate) / 100;
          netAmount = amount;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Sanitize inputs
      const sanitizedDescription = form.description.trim();
      const descriptionWithMethod = form.element === 'asset' 
        ? `${sanitizedDescription} [method:${depreciationMethod}]` 
        : sanitizedDescription;
      const sanitizedReference = form.reference ? form.reference.trim() : null;

      // Get VAT account if needed
      let vatAccount = null;
      if (vatAmount > 0 && vatRate > 0) {
        const norm = accounts.map(a => ({
          ...a,
          account_name: (a.account_name || '').toLowerCase(),
          account_type: (a.account_type || '').toLowerCase(),
          account_code: (a.account_code || '').toString(),
        }));
        const findVatInput = () => {
          return (
            norm.find(a => (a.account_name.includes('vat input') || a.account_name.includes('input tax') || a.account_name.includes('vat receivable')) && (a.account_type === 'asset' || a.account_type === 'liability'))
            || norm.find(a => a.account_code === '2110')
          );
        };
        const findVatOutput = () => {
          return (
            norm.find(a => (a.account_name.includes('vat output') || a.account_name.includes('output tax') || a.account_name.includes('vat payable')) && a.account_type === 'liability')
            || norm.find(a => a.account_code === '2100')
          );
        };
        const isSales = lockType === 'sent' || form.element === 'income';
        vatAccount = isSales ? findVatOutput() : findVatInput();
        if (!vatAccount) {
          const code = isSales ? '2100' : '2110';
          const name = isSales ? 'VAT Output (15%)' : 'VAT Input';
          const type = isSales ? 'liability' : 'asset';
          const { error: createErr } = await supabase
            .from('chart_of_accounts')
            .insert({ company_id: companyId, account_code: code, account_name: name, account_type: type, is_active: true });
          if (createErr) {
            toast({ title: 'VAT Account Missing', description: 'Could not auto-create VAT account. Please create VAT accounts in Chart of Accounts.', variant: 'destructive' });
            return;
          }
          const { data: refreshed } = await supabase
            .from('chart_of_accounts')
            .select('*')
            .eq('company_id', companyId);
          setAccounts((refreshed || []) as any);
          const refreshedNorm = (refreshed || []).map(a => ({
            ...a,
            account_name: (a.account_name || '').toLowerCase(),
            account_type: (a.account_type || '').toLowerCase(),
            account_code: (a.account_code || '').toString(),
          }));
          const reFindInput = () => (
            refreshedNorm.find(a => (a.account_name.includes('vat input') || a.account_name.includes('input tax') || a.account_name.includes('vat receivable')) && (a.account_type === 'asset'))
            || refreshedNorm.find(a => a.account_code === '2110')
          );
          const reFindOutput = () => (
            refreshedNorm.find(a => (a.account_name.includes('vat output') || a.account_name.includes('output tax') || a.account_name.includes('vat payable')) && a.account_type === 'liability')
            || refreshedNorm.find(a => a.account_code === '2100')
          );
          vatAccount = isSales ? reFindOutput() : reFindInput();
          if (!vatAccount) {
            toast({ title: 'VAT Account Missing', description: 'VAT account still missing after auto-create. Please create VAT accounts in Chart of Accounts.', variant: 'destructive' });
            return;
          }
        }
      }

      const { data: transaction, error: txError } = await supabase
        .from("transactions")
        .insert({
          company_id: companyId,
          user_id: user.id,
          transaction_date: form.date,
          description: sanitizedDescription,
          reference_number: sanitizedReference,
          total_amount: amount,
          vat_rate: vatRate > 0 ? vatRate : null,
          vat_amount: vatAmount > 0 ? vatAmount : null,
          base_amount: netAmount,
          vat_inclusive: amountIncludesVAT,
          bank_account_id: bankAccountId,
          transaction_type: lockType === 'po_sent' ? 'purchase' : form.element,
          category: autoClassification?.category || null,
          status: "pending"
        })
        .select()
        .single();

      if (txError) {
        console.error("Transaction insert error:", txError);
        console.error("Attempted bank_account_id value:", bankAccountId);
        console.error("Bank account ID type:", typeof bankAccountId);
        
        // Provide more helpful error messages
        if (txError.message?.includes('bank_account_id_fkey') || txError.message?.includes('foreign key constraint')) {
          toast({ 
            title: "Bank Account Error", 
            description: `The bank account reference is invalid. Please select a valid bank account or leave it empty. Error: ${txError.message}`, 
            variant: "destructive" 
          });
        } else {
          throw txError;
        }
        return;
      }

      // Validate account IDs before creating entries
      if (!form.debitAccount || form.debitAccount.trim() === "") {
        toast({ 
          title: "Validation Error", 
          description: "Debit account is required. Please select a debit account.", 
          variant: "destructive" 
        });
        return;
      }
      
      if (!form.creditAccount || form.creditAccount.trim() === "") {
        toast({ 
          title: "Validation Error", 
          description: "Credit account is required. Please select a credit account.", 
          variant: "destructive" 
        });
        return;
      }
      
      // Validate UUID format for account IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(form.debitAccount)) {
        toast({ 
          title: "Invalid Debit Account", 
          description: "Debit account ID format is invalid.", 
          variant: "destructive" 
        });
        return;
      }
      
      if (!uuidRegex.test(form.creditAccount)) {
        toast({ 
          title: "Invalid Credit Account", 
          description: "Credit account ID format is invalid.", 
          variant: "destructive" 
        });
        return;
      }

      // Create double-entry transaction entries
      // For VAT-inclusive transactions:
      // - Expense: Dr Expense (net), Dr VAT Input (vat), Cr Bank (total)
      // - Income: Dr Bank (total), Cr Income (net), Cr VAT Output (vat)
      const entries: any[] = [];

      // If payment method is bank, ensure one side is a Bank/Cash Asset ledger
      if (form.paymentMethod === 'bank' && form.element !== 'depreciation') {
        const norm = accounts.map(a => ({
          ...a,
          account_name: (a.account_name || '').toLowerCase(),
          account_type: (a.account_type || '').toLowerCase(),
          account_code: (a.account_code || '').toString(),
        }));
        const debitAcc = norm.find(a => a.id === form.debitAccount);
        const creditAcc = norm.find(a => a.id === form.creditAccount);
        const looksBank = (acc: any) => !!(acc && acc.account_type === 'asset' && (acc.account_name.includes('bank') || acc.account_name.includes('cash') || acc.account_code === '1000' || (acc as any).is_cash_equivalent === true));
        let isDebitBank = looksBank(debitAcc);
        let isCreditBank = looksBank(creditAcc);
        if (!isDebitBank && !isCreditBank) {
          // Try auto-fix: pick a bank/cash asset from chart if available
          const autoBank = norm.find(a => a.account_type === 'asset' && (a.account_name.includes('bank') || a.account_name.includes('cash') || a.account_code === '1000' || (a as any).is_cash_equivalent === true));
          if (autoBank) {
            // Prefer credit side as Bank for payments
            const newCredit = form.creditAccount && looksBank(creditAcc) ? form.creditAccount : autoBank.id;
            const newDebit = form.debitAccount;
            setForm(prev => ({ ...prev, creditAccount: newCredit, debitAccount: newDebit }));
            isDebitBank = looksBank(norm.find(a => a.id === newDebit));
            isCreditBank = looksBank(norm.find(a => a.id === newCredit));
          }
        }
        if (!isDebitBank && !isCreditBank) {
          toast({
            title: "Select Bank Ledger Account",
            description: "When using bank payment method, either the debit or credit account must be a Bank (Asset) ledger account.",
            variant: "destructive"
          });
          return;
        }
      }

      // Locked invoice flows: override element-specific VAT handling
      if (lockType === 'sent') {
        // Accrual issuance: Dr AR (total), Cr Revenue (net), Cr VAT Output (vat)
        if (vatAmount > 0 && vatAccount && vatAccount.id) {
          entries.push(
            { transaction_id: transaction.id, account_id: form.debitAccount, debit: amount, credit: 0, description: sanitizedDescription, status: 'pending' },
            { transaction_id: transaction.id, account_id: form.creditAccount, debit: 0, credit: netAmount, description: sanitizedDescription, status: 'pending' },
            { transaction_id: transaction.id, account_id: vatAccount.id, debit: 0, credit: vatAmount, description: 'VAT Output', status: 'pending' }
          );
        } else {
          entries.push(
            { transaction_id: transaction.id, account_id: form.debitAccount, debit: amount, credit: 0, description: sanitizedDescription, status: 'pending' },
            { transaction_id: transaction.id, account_id: form.creditAccount, debit: 0, credit: amount, description: sanitizedDescription, status: 'pending' }
          );
        }
        let cogsAmt = cogsTotal;
        let cogsAccId = cogsAccount?.id || '';
        let invAccId = inventoryAccount?.id || '';
        if ((!cogsAmt || !cogsAccId || !invAccId) && invoiceIdForRef) {
          try {
            const { data: invItems } = await supabase
              .from('invoice_items')
              .select('description, quantity, unit_price, item_type, product_id')
              .eq('invoice_id', invoiceIdForRef);
            let totalCost = 0;
            const prodIds = (invItems || [])
              .filter((it: any) => String(it.item_type || '').toLowerCase() === 'product' && it.product_id)
              .map((it: any) => String(it.product_id));
            if (prodIds.length > 0) {
              const { data: prodInfos } = await supabase
                .from('items')
                .select('id, cost_price')
                .in('id', prodIds as any);
              const costMap = new Map<string, number>();
              (prodInfos || []).forEach((p: any) => costMap.set(String(p.id), Number(p.cost_price || 0)));
              (invItems || []).forEach((it: any) => {
                const isProd = String(it.item_type || '').toLowerCase() === 'product';
                if (!isProd) return;
                let cp = costMap.get(String(it.product_id)) || 0;
                if (!cp || cp <= 0) cp = Number(it.unit_price || 0);
                const qty = Number(it.quantity || 0);
                totalCost += (cp * qty);
              });
            }
            if (totalCost === 0) {
              const names = (invItems || [])
                .filter((it: any) => String(it.item_type || '').toLowerCase() === 'product')
                .map((it: any) => String(it.description || ''))
                .filter(Boolean);
              if (names.length > 0) {
                const { data: prodByName } = await supabase
                  .from('items')
                  .select('name, cost_price')
                  .eq('company_id', companyId)
                  .in('name', names as any)
                  .eq('item_type', 'product');
                const costByName = new Map<string, number>();
                (prodByName || []).forEach((p: any) => costByName.set(String(p.name || ''), Number(p.cost_price || 0)));
                (invItems || []).forEach((it: any) => {
                  if (String(it.item_type || '').toLowerCase() !== 'product') return;
                  let cp = costByName.get(String(it.description || '')) || 0;
                  if (!cp || cp <= 0) cp = Number(it.unit_price || 0);
                  const qty = Number(it.quantity || 0);
                  totalCost += (cp * qty);
                });
              }
            }
            cogsAmt = totalCost;
            const lower = accounts.map(a => ({
              ...a,
              account_type: (a.account_type || '').toLowerCase(),
              account_name: (a.account_name || '').toLowerCase(),
              account_code: (a.account_code || '').toString(),
            }));
            const findId = (type: string, codes: string[], names: string[]): string => {
              const byCode = lower.find(a => a.account_type === type.toLowerCase() && codes.includes(a.account_code));
              if (byCode) return byCode.id;
              const byName = lower.find(a => a.account_type === type.toLowerCase() && names.some(n => a.account_name.includes(n)));
              if (byName) return byName.id;
              const byType = lower.find(a => a.account_type === type.toLowerCase());
              return byType?.id || '';
            };
            cogsAccId = findId('expense', ['5000'], ['cost of sales','cost of goods','cogs']);
            invAccId = findId('asset', ['1300'], ['inventory','stock']);
            if (cogsAmt > 0) {
              if (!cogsAccId) {
                const { data: created } = await supabase
                  .from('chart_of_accounts')
                  .insert({ company_id: companyId, account_code: '5000', account_name: 'Cost of Sales', account_type: 'expense', is_active: true })
                  .select('id')
                  .single();
                cogsAccId = (created as any)?.id || cogsAccId;
              }
              if (!invAccId) {
                const { data: created } = await supabase
                  .from('chart_of_accounts')
                  .insert({ company_id: companyId, account_code: '1300', account_name: 'Inventory', account_type: 'asset', is_active: true })
                  .select('id')
                  .single();
                invAccId = (created as any)?.id || invAccId;
              }
            }
          } catch {}
        }
        if (cogsAmt > 0 && cogsAccId && invAccId) {
          console.log('Adding COGS entries to transaction:', { cogsAmt, cogsAccId, invAccId });
          entries.push(
            { transaction_id: transaction.id, account_id: cogsAccId, debit: cogsAmt, credit: 0, description: 'Cost of Goods Sold', status: 'approved' },
            { transaction_id: transaction.id, account_id: invAccId, debit: 0, credit: cogsAmt, description: 'Inventory', status: 'approved' }
          );
        }
      } else if (lockType === 'paid') {
        // Payment collection: Dr Bank (amount), Cr AR (amount) — no VAT
        entries.push(
          { transaction_id: transaction.id, account_id: form.debitAccount, debit: amount, credit: 0, description: sanitizedDescription, status: 'pending' },
          { transaction_id: transaction.id, account_id: form.creditAccount, debit: 0, credit: amount, description: sanitizedDescription, status: 'pending' }
        );
      } else if (form.element === 'asset_disposal') {
        const asset = fixedAssets.find(a => a.id === selectedAssetId);
        if (!asset) {
          toast({ title: 'Select Asset', description: 'Please select the asset to dispose.', variant: 'destructive' });
          return;
        }
        const cost = Number(asset.cost || 0);
        const accum = Number(asset.accumulated_depreciation || 0);
        const proceeds = amount;
        const nbv = Math.max(0, cost - accum);
        const accDepAccount = accounts.find(a => (a.account_type || '').toLowerCase() === 'asset' && (a.account_name || '').toLowerCase().includes('accumulated'))
          || accounts.find(a => (a.account_type || '').toLowerCase() === 'asset' && (a.account_name || '').toLowerCase().includes('depreciation'));
        const assetAcc = accounts.find(a => a.id === form.creditAccount)
          || accounts.find(a => (a.account_type || '').toLowerCase() === 'asset' && ((a.account_code || '').toString().startsWith('15') || (a.account_name || '').toLowerCase().includes('asset')));

        const lower = accounts.map(a => ({ id: a.id, account_type: (a.account_type || '').toLowerCase(), account_name: (a.account_name || '').toLowerCase(), account_code: String((a as any).account_code || '') }));
        const ensureAccount = async (type: 'revenue' | 'expense', name: string, code: string) => {
          const found = lower.find(a => a.account_type === type && (a.account_name.includes(name.toLowerCase()) || a.account_code === code));
          if (found) return found.id;
          const { data: created } = await supabase
            .from('chart_of_accounts')
            .insert({ company_id: companyId, account_code: code, account_name: name, account_type: type, is_active: true, normal_balance: type === 'revenue' ? 'credit' : 'debit' })
            .select('id')
            .single();
          return String((created as any)?.id || '');
        };

        const gainLoss = proceeds - nbv;
        let gainAccId = '';
        let lossAccId = '';
        if (gainLoss > 0) {
          gainAccId = await ensureAccount('revenue', 'Gain on Sale of Assets', '9500');
        } else if (gainLoss < 0) {
          lossAccId = await ensureAccount('expense', 'Loss on Sale of Assets', '9600');
        }

        if (proceeds > 0 && form.debitAccount) {
          entries.push({ transaction_id: transaction.id, account_id: form.debitAccount, debit: proceeds, credit: 0, description: sanitizedDescription, status: 'pending' });
        }
        if (accDepAccount && accum > 0) {
          entries.push({ transaction_id: transaction.id, account_id: accDepAccount.id, debit: accum, credit: 0, description: 'Derecognize Accumulated Depreciation', status: 'pending' });
        }
        if (assetAcc && cost > 0) {
          entries.push({ transaction_id: transaction.id, account_id: assetAcc.id, debit: 0, credit: cost, description: 'Derecognize Asset Cost', status: 'pending' });
        }
        if (gainLoss > 0 && gainAccId) {
          entries.push({ transaction_id: transaction.id, account_id: gainAccId, debit: 0, credit: gainLoss, description: 'Gain on Asset Disposal', status: 'pending' });
        } else if (gainLoss < 0 && lossAccId) {
          entries.push({ transaction_id: transaction.id, account_id: lossAccId, debit: Math.abs(gainLoss), credit: 0, description: 'Loss on Asset Disposal', status: 'pending' });
        }
      } else if (splitMode) {
             const isDebitSplit = ['expense', 'asset', 'product_purchase', 'liability', 'loan_repayment', 'loan_interest', 'depreciation'].includes(form.element);
             
             // 1. Add the Single Side (Bank/Source)
             if (isDebitSplit) {
                  // Credit Bank for Total Amount
                  entries.push({
                     transaction_id: transaction.id,
                     account_id: form.creditAccount,
                     debit: 0,
                     credit: amount, // Use 'amount' which is parsed from form
                     description: sanitizedDescription,
                     status: "pending"
                  });
             } else {
                  // Debit Bank for Total Amount (Income)
                  entries.push({
                     transaction_id: transaction.id,
                     account_id: form.debitAccount,
                     debit: amount,
                     credit: 0,
                     description: sanitizedDescription,
                     status: "pending"
                  });
             }
 
             // 2. Add Split Entries
             for (const split of splits) {
                 const splitAmount = parseFloat(split.amount) || 0;
                 const splitVatRate = parseFloat(split.vatRate) || 0;
                 const splitDesc = split.description || sanitizedDescription;
                 
                 let splitNet = splitAmount;
                 let splitVat = 0;
                 
                 if (splitVatRate > 0) {
                    if (amountIncludesVAT) {
                       const base = splitAmount / (1 + (splitVatRate / 100));
                       splitVat = splitAmount - base;
                       splitNet = base;
                    } else {
                       splitVat = (splitAmount * splitVatRate) / 100;
                    }
                 }
                 
                 if (!amountIncludesVAT && splitVatRate > 0) {
                    splitVat = (splitAmount * splitVatRate) / 100;
                 }
                 
                 // Find VAT Account
                 let splitVatAccount = null;
                 if (splitVat > 0) {
                    splitVatAccount = accounts.find(acc => (acc.account_name || '').toLowerCase().includes('vat') || (acc.account_name || '').toLowerCase().includes('tax'));
                 }
 
                 if (isDebitSplit) {
                     entries.push({
                         transaction_id: transaction.id,
                         account_id: split.accountId,
                         debit: splitNet,
                         credit: 0,
                         description: splitDesc,
                         status: "pending"
                     });
                     if (splitVat > 0 && splitVatAccount) {
                         entries.push({
                             transaction_id: transaction.id,
                             account_id: splitVatAccount.id,
                             debit: splitVat,
                             credit: 0,
                             description: "VAT Input",
                             status: "pending"
                         });
                     }
                 } else {
                     entries.push({
                         transaction_id: transaction.id,
                         account_id: split.accountId,
                         debit: 0,
                         credit: splitNet,
                         description: splitDesc,
                         status: "pending"
                     });
                     if (splitVat > 0 && splitVatAccount) {
                          entries.push({
                             transaction_id: transaction.id,
                             account_id: splitVatAccount.id,
                             debit: 0,
                             credit: splitVat,
                             description: "VAT Output",
                             status: "pending"
                         });
                     }
                 }
             }
             
             // Re-calculate Total Bank Amount from splits
              const totalBankAmount = splits.reduce((sum, split) => {
                 const amt = parseFloat(split.amount) || 0;
                 const rate = parseFloat(split.vatRate) || 0;
                 if (amountIncludesVAT) return sum + amt;
                 return sum + amt + (amt * rate / 100);
              }, 0);
              
              if (entries.length > 0) {
                  if (isDebitSplit) {
                      entries[0].credit = totalBankAmount;
                  } else {
                      entries[0].debit = totalBankAmount;
                  }
              }

      } else if (vatAmount > 0 && vatAccount && vatAccount.id) {
        // General VAT-inclusive transaction (non-locked)
        if (form.element === 'expense') {
          // Expense with VAT: Debit Expense (net), Debit VAT Input (vat), Credit Bank (total)
          entries.push(
            {
              transaction_id: transaction.id,
              account_id: form.debitAccount, // Expense account
              debit: netAmount,
              credit: 0,
              description: sanitizedDescription,
              status: "pending"
            },
            {
              transaction_id: transaction.id,
              account_id: vatAccount.id, // VAT Input account
              debit: vatAmount,
              credit: 0,
              description: 'VAT Input',
              status: "pending"
            },
            {
              transaction_id: transaction.id,
              account_id: form.creditAccount, // Bank account
              debit: 0,
              credit: isPurchase ? (netAmount + vatAmount) : amount,
              description: sanitizedDescription,
              status: "pending"
            }
          );
        } else if (form.element === 'income') {
          // Income with VAT: Debit Bank (total), Credit Income (net), Credit VAT Output (vat)
          entries.push(
            {
              transaction_id: transaction.id,
              account_id: form.debitAccount, // Bank account
              debit: amount, // Total amount
              credit: 0,
              description: sanitizedDescription,
              status: "pending"
            },
            {
              transaction_id: transaction.id,
              account_id: form.creditAccount, // Income account
              debit: 0,
              credit: netAmount,
              description: sanitizedDescription,
              status: "pending"
            },
            {
              transaction_id: transaction.id,
              account_id: vatAccount.id, // VAT Output account
              debit: 0,
              credit: vatAmount,
              description: 'VAT Output',
              status: "pending"
            }
          );
        } else if (form.element === 'asset') {
          entries.push(
            {
              transaction_id: transaction.id,
              account_id: form.debitAccount,
              debit: netAmount,
              credit: 0,
              description: sanitizedDescription,
              status: "pending"
            },
            {
              transaction_id: transaction.id,
              account_id: vatAccount.id,
              debit: vatAmount,
              credit: 0,
              description: 'VAT Input',
              status: "pending"
            },
            {
              transaction_id: transaction.id,
              account_id: form.creditAccount,
              debit: 0,
              credit: isPurchase ? (netAmount + vatAmount) : amount,
              description: sanitizedDescription,
              status: "pending"
            }
          );
        } else if (form.element === 'product_purchase') {
          entries.push(
            {
              transaction_id: transaction.id,
              account_id: form.debitAccount,
              debit: netAmount,
              credit: 0,
              description: sanitizedDescription,
              status: "pending"
            },
            {
              transaction_id: transaction.id,
              account_id: vatAccount.id,
              debit: vatAmount,
              credit: 0,
              description: 'VAT Input',
              status: "pending"
            },
            {
              transaction_id: transaction.id,
              account_id: form.creditAccount,
              debit: 0,
              credit: isPurchase ? (netAmount + vatAmount) : amount,
              description: sanitizedDescription,
              status: "pending"
            }
          );

          // Handle Deposit Offset if applicable
          const depositAvailable = Number(editData?.deposit_available || 0);
          const depositAccountId = editData?.deposit_account_id;
          const totalPayable = isPurchase ? (netAmount + vatAmount) : amount;
          
          if (depositAvailable > 0 && depositAccountId) {
            const offsetAmount = Math.min(depositAvailable, totalPayable);
            if (offsetAmount > 0) {
              entries.push(
                {
                  transaction_id: transaction.id,
                  account_id: form.creditAccount, // AP Account (Debit to reduce liability)
                  debit: offsetAmount,
                  credit: 0,
                  description: 'Deposit Allocation',
                  status: "pending"
                },
                {
                  transaction_id: transaction.id,
                  account_id: depositAccountId, // Deposit Asset (Credit to reduce asset)
                  debit: 0,
                  credit: offsetAmount,
                  description: 'Deposit Allocation',
                  status: "pending"
                }
              );
            }
          }
        } else {
          // Other transaction types - treat as no VAT for now
          entries.push(
            {
              transaction_id: transaction.id,
              account_id: form.debitAccount,
              debit: amount,
              credit: 0,
              description: sanitizedDescription,
              status: "pending"
            },
            {
              transaction_id: transaction.id,
              account_id: form.creditAccount,
              debit: 0,
              credit: amount,
              description: sanitizedDescription,
              status: "pending"
            }
          );
        }
      } else {
        // No VAT - support multi-leg via prefill.additionalDebits + prefill.splitCredits
        const multiCredits = prefill && Array.isArray((prefill as any).splitCredits) ? (prefill as any).splitCredits : null;
        const extraDebits = prefill && Array.isArray((prefill as any).additionalDebits) ? (prefill as any).additionalDebits : null;
        const multiDebits = prefill && Array.isArray((prefill as any).splitDebits) ? (prefill as any).splitDebits : null;
        if (form.element === 'expense' && (multiCredits || extraDebits)) {
          const extraDebitsTotal = Array.isArray(extraDebits) ? extraDebits.reduce((s: number, d: any) => s + Number(d.amount || 0), 0) : 0;
          const mainDebitAmt = amount - extraDebitsTotal;
          // Debits
          entries.push({ transaction_id: transaction.id, account_id: form.debitAccount, debit: mainDebitAmt, credit: 0, description: sanitizedDescription, status: 'pending' });
          if (Array.isArray(extraDebits)) {
            for (const d of extraDebits) {
              entries.push({ transaction_id: transaction.id, account_id: d.accountId, debit: Number(d.amount || 0), credit: 0, description: String(d.description || sanitizedDescription), status: 'pending' });
            }
          }
          // Credits
          if (Array.isArray(multiCredits)) {
            for (const c of multiCredits) {
              entries.push({ transaction_id: transaction.id, account_id: c.accountId, debit: 0, credit: Number(c.amount || 0), description: String(c.description || sanitizedDescription), status: 'pending' });
            }
          } else {
            entries.push({ transaction_id: transaction.id, account_id: form.creditAccount, debit: 0, credit: amount, description: sanitizedDescription, status: 'pending' });
          }
        } else if (form.element === 'liability' && Array.isArray(multiDebits)) {
          // Multi-debit liability payment (e.g., PAYE, SDL, UIF to SARS): Dr multiple liabilities / Cr Bank
          for (const d of multiDebits) {
            entries.push({ transaction_id: transaction.id, account_id: d.accountId, debit: Number(d.amount || 0), credit: 0, description: String(d.description || sanitizedDescription), status: 'pending' });
          }
          entries.push({ transaction_id: transaction.id, account_id: form.creditAccount, debit: 0, credit: amount, description: sanitizedDescription, status: 'pending' });
        } else {
          // Simple double entry
          entries.push(
            { transaction_id: transaction.id, account_id: form.debitAccount, debit: amount, credit: 0, description: sanitizedDescription, status: 'pending' },
            { transaction_id: transaction.id, account_id: form.creditAccount, debit: 0, credit: amount, description: sanitizedDescription, status: 'pending' }
          );
        }
      }

      // Validate all entries have account_id before inserting
      const invalidEntries = entries.filter(entry => {
        const accountId = entry.account_id;
        return !accountId || 
               (typeof accountId === 'string' && accountId.trim() === "") ||
               accountId === null ||
               accountId === undefined;
      });
      
      if (invalidEntries.length > 0) {
        console.error("Entries with missing account_id:", invalidEntries);
        console.error("All entries:", entries);
        console.error("Form state:", { debitAccount: form.debitAccount, creditAccount: form.creditAccount });
        toast({ 
          title: "Validation Error", 
          description: "One or more transaction entries have missing account IDs. Please ensure all accounts are selected.", 
          variant: "destructive" 
        });
        return;
      }

      // Additional validation: ensure all account_ids are valid UUIDs
      const entriesWithInvalidIds = entries.filter(entry => {
        const accountId = entry.account_id;
        if (!accountId || typeof accountId !== 'string') return true;
        return !uuidRegex.test(accountId);
      });
      
      if (entriesWithInvalidIds.length > 0) {
        console.error("Entries with invalid account_id format:", entriesWithInvalidIds);
        toast({ 
          title: "Validation Error", 
          description: "One or more transaction entries have invalid account ID format.", 
          variant: "destructive" 
        });
        return;
      }

      // Final safety check: remove any null/undefined account_ids and ensure all are strings
      const sanitizedEntries = entries.map(entry => {
        if (!entry.account_id || entry.account_id === null || entry.account_id === undefined) {
          throw new Error(`Invalid account_id found in entry: ${JSON.stringify(entry)}`);
        }
        // Ensure account_id is a string and not empty
        const accountId = String(entry.account_id).trim();
        if (!accountId || !uuidRegex.test(accountId)) {
          throw new Error(`Invalid account_id format: ${accountId}`);
        }
        return {
          ...entry,
          account_id: accountId // Ensure it's a clean string
        };
      });

      console.log("Inserting transaction entries:", sanitizedEntries.map(e => ({ 
        account_id: e.account_id, 
        debit: e.debit, 
        credit: e.credit 
      })));

      if (showFixedAssetsUI && form.element === 'asset') {
        setProgressText("Posting to General Ledger...");
        setPostProgress(45);
        await new Promise(r => setTimeout(r, 800));
      }

      const { error: entriesError } = await supabase
        .from("transaction_entries")
        .insert(sanitizedEntries.map(e => ({
          transaction_id: transaction.id,
          account_id: e.account_id,
          debit: e.debit,
          credit: e.credit,
          description: sanitizedDescription,
          status: "pending"
        })) as any);

      if (entriesError) {
        console.error("Transaction entries insert error:", entriesError);
        console.error("Error details:", JSON.stringify(entriesError, null, 2));
        console.error("Sanitized entries that were inserted:", sanitizedEntries);
        console.error("Original entries:", entries);
        console.error("Form state at time of error:", { 
          debitAccount: form.debitAccount, 
          creditAccount: form.creditAccount,
          vatAccount: vatAccount?.id 
        });
        
        let errorMessage = entriesError.message || "Failed to create transaction entries.";
        if (entriesError.message?.includes('account_id') && entriesError.message?.includes('null')) {
          errorMessage = "Account ID is null.";
        } else if (entriesError.message?.toLowerCase().includes('foreign key') || entriesError.message?.toLowerCase().includes('violates foreign key constraint')) {
          errorMessage = "Invalid account selected.";
        }
        
        toast({ 
          title: "Error Creating Transaction Entries", 
          description: errorMessage, 
          variant: "destructive" 
        });
        if (transaction?.id) {
          await supabase.from("transactions").delete().eq("id", transaction.id);
        }
        if (companyId) emitDashboardCacheInvalidation(companyId);
        return;
      }
      try {
        await supabase.from('ledger_entries').delete().eq('transaction_id', transaction.id);
        if (!transaction?.id) {
          throw new Error('Missing transaction ID for ledger posting');
        }
        let effectiveCompanyId = companyId;
        if (!effectiveCompanyId || effectiveCompanyId.trim() === '') {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: prof } = await supabase
                .from('profiles')
                .select('company_id')
                .eq('user_id', user.id)
                .single();
              if (prof?.company_id) {
                effectiveCompanyId = prof.company_id as string;
              }
            }
          } catch {}
        }
        if (!effectiveCompanyId || effectiveCompanyId.trim() === '') {
          throw new Error('Company ID missing for ledger posting');
        }

        if (showFixedAssetsUI && form.element === 'asset') {
          setProgressText("Updating Financial Statements...");
          setPostProgress(75);
          await new Promise(r => setTimeout(r, 800));
        }

        const ledgerRowsNew = sanitizedEntries.map(e => ({
          company_id: effectiveCompanyId,
          transaction_id: transaction.id,
          account_id: e.account_id,
          entry_date: form.date,
          description: sanitizedDescription,
          debit: e.debit || 0,
          credit: e.credit || 0,
          is_reversed: false,
        }));
        const { error: ledgerInsErr } = await supabase
          .from('ledger_entries')
          .insert(ledgerRowsNew as any);
        if (ledgerInsErr) {
          console.error('Ledger entries insert error:', ledgerInsErr);
          throw ledgerInsErr;
        }
        // For locked flows, mark transaction as posted after entries/ledger inserted
        if (lockType === 'po_sent' || lockType === 'sent') {
          try {
            await supabase
              .from('transactions')
              .update({ status: 'posted' })
              .eq('id', transaction.id);
          } catch {}
        }
      } catch (ledErr: any) {
        notify.error("Ledger sync warning", { description: `Entries saved, but AFS sync failed: ${ledErr.message}`, duration: 6000 });
      }

      // Keep manual transactions at approved status; do not auto-set to posted
      

      // Handle loan-specific operations
      if (form.element === 'loan_received') {
        const interestRatePercent = form.interestRate && form.interestRate.trim() !== '' ? parseFloat(form.interestRate) : 0;
        const interestRateDecimal = interestRatePercent / 100;
        const termMonths = form.loanTerm && form.loanTerm.trim() !== '' ? parseInt(form.loanTerm) : 12;
        const monthlyRepayment = calculateMonthlyRepayment(amount, interestRateDecimal / 12, termMonths);
        if (!form.loanId) {
          const refVal = (form.reference && form.reference.trim() !== '')
            ? form.reference.trim()
            : (() => {
                const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
                let rand = '';
                try {
                  const arr = new Uint8Array(4);
                  (window.crypto || (globalThis as any).crypto)?.getRandomValues(arr);
                  rand = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,6);
                } catch {
                  rand = Math.random().toString(36).slice(2,8);
                }
                return `LN-${today}-${rand}`;
              })();
          const payload = {
            company_id: companyId,
            reference: refVal,
            loan_type: form.loanTermType,
            principal: amount,
            interest_rate: interestRateDecimal,
            start_date: form.date,
            term_months: termMonths,
            monthly_repayment: monthlyRepayment,
            status: 'active',
            outstanding_balance: amount
          };
          const { error: loanError } = await supabase
            .from('loans')
            .upsert(payload as any, { onConflict: 'company_id,reference' });
          if (loanError) {
            console.error('Loan creation error:', loanError);
            toast({ title: 'Loan Creation Failed', description: 'Transaction was posted but loan record could not be created: ' + loanError.message, variant: 'destructive' });
          } else {
            toast({ title: 'Loan Created/Updated', description: 'Loan record saved with monthly repayment of R ' + monthlyRepayment.toFixed(2) });
          }
        } else {
          // Loan was already created via Loans module; optionally update monthly_repayment if empty
          try {
            await supabase
              .from('loans')
              .update({ monthly_repayment: monthlyRepayment, interest_rate: interestRateDecimal, term_months: termMonths, loan_type: form.loanTermType })
              .eq('id', form.loanId);
          } catch {}
        }
      } else if (form.element === 'loan_repayment' && form.loanId) {
        // Update loan outstanding balance
        const { data: loanData } = await supabase
          .from("loans")
          .select("outstanding_balance")
          .eq("id", form.loanId)
          .single();

        if (loanData) {
          const newBalance = Math.max(0, loanData.outstanding_balance - amount);
          const { error: updateError } = await supabase
            .from("loans")
            .update({ 
              outstanding_balance: newBalance,
              status: newBalance === 0 ? 'completed' : 'active'
            })
            .eq("id", form.loanId);

          if (updateError) {
            console.error("Loan update error:", updateError);
          }
        }
      } else if (form.element === 'loan_interest' && form.loanId) {
        
        // Record loan interest payment
        const { error: interestError } = await supabase
          .from("loan_payments")
          .insert({
            loan_id: form.loanId,
            payment_date: form.date,
            amount: amount,
            principal_component: 0,
            interest_component: amount
          });

        if (interestError) {
          console.error("Interest payment recording error:", interestError);
        }
      } else if (form.element === 'asset') {
        // If asset purchase is funded by a loan liability, ensure the loan is recorded, and optionally create a companion loan transaction
        const creditAcc = accounts.find(a => a.id === form.creditAccount);
        const type = String(creditAcc?.account_type || '').toLowerCase();
        const code = String(creditAcc?.account_code || '');
        const name = String(creditAcc?.account_name || '').toLowerCase();
        const isLoanCredit = type === 'liability' && (code === '2300' || code === '2400' || name.includes('loan'));
        if (isLoanCredit) {
          if (!form.interestRate || !form.loanTerm || String(form.interestRate).trim() === '' || String(form.loanTerm).trim() === '') {
            toast({ title: 'Loan details required', description: 'Enter interest rate (%) and term (months).', variant: 'destructive' });
            return;
          }
          const interestRatePercent = parseFloat(String(form.interestRate));
          const interestRateDecimal = interestRatePercent / 100;
          const termMonths = parseInt(String(form.loanTerm));
          const monthlyRepayment = calculateMonthlyRepayment(amount, interestRateDecimal / 12, termMonths);
          // Create or update loan record
          let createdLoanId: string | undefined = form.loanId || undefined;
          if (!form.loanId) {
            const refVal = (form.reference && form.reference.trim() !== '')
              ? form.reference.trim()
              : (() => {
                  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
                  let rand = '';
                  try {
                    const arr = new Uint8Array(4);
                    (window.crypto || (globalThis as any).crypto)?.getRandomValues(arr);
                    rand = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,6);
                  } catch {
                    rand = Math.random().toString(36).slice(2,8);
                  }
                  return `LN-${today}-${rand}`;
                })();
            const payload = {
              company_id: companyId,
              reference: refVal,
              loan_type: form.loanTermType,
              principal: amount,
              interest_rate: interestRateDecimal,
              start_date: form.date,
              term_months: termMonths,
              monthly_repayment: monthlyRepayment,
              status: 'active',
              outstanding_balance: amount
            };
            const { data: loanRow, error: loanError } = await supabase
              .from('loans')
              .upsert(payload as any, { onConflict: 'company_id,reference' })
              .select('id')
              .single();
            if (loanError) {
              console.error('Loan creation error:', loanError);
              toast({ title: 'Loan Creation Failed', description: 'Asset posted but loan record could not be created: ' + loanError.message, variant: 'destructive' });
            }
            createdLoanId = (loanRow as any)?.id || createdLoanId;
          } else {
            try {
              await supabase
                .from('loans')
                .update({ monthly_repayment: monthlyRepayment, interest_rate: interestRateDecimal, term_months: termMonths, loan_type: form.loanTermType })
                .eq('id', form.loanId);
            } catch {}
          }
          if (createdLoanId) {
            setForm(prev => ({ ...prev, loanId: createdLoanId }));
            // Refresh loans list so the newly created loan appears
            try {
              const { data: loansData } = await supabase
                .from('loans')
                .select('id, reference, outstanding_balance, status, loan_type, interest_rate, monthly_repayment')
                .eq('company_id', companyId)
                .eq('status', 'active')
                .order('reference');
              setLoans(loansData || []);
            } catch {}
          }
          // Remove automatic creation of a companion 'loan_received' transaction to avoid double-posting
        }
      }

      if (showFixedAssetsUI && form.element === 'asset') {
        const assetCost = netAmount; // use amount excluding VAT for asset cost
        if (assetCost > 0) {
          await supabase.from('fixed_assets').insert({
            company_id: companyId,
            description: descriptionWithMethod,
            cost: assetCost,
            purchase_date: form.date,
            useful_life_years: parseInt(assetUsefulLifeYears || '5'),
            accumulated_depreciation: 0,
            status: 'active'
          } as any);
        }
      } else if (showFixedAssetsUI && form.element === 'depreciation' && selectedAssetId) {
        const asset = fixedAssets.find(a => a.id === selectedAssetId);
        const amt = parseFloat(form.amount || '0');
        if (asset && amt > 0) {
          await supabase
            .from('fixed_assets')
            .update({ accumulated_depreciation: Math.min((asset.accumulated_depreciation || 0) + amt, asset.cost) })
            .eq('id', asset.id);
        }
      } else if (showFixedAssetsUI && form.element === 'asset_disposal' && selectedAssetId) {
        await supabase
          .from('fixed_assets')
          .update({ status: 'disposed', disposal_date: form.date })
          .eq('id', selectedAssetId);
      }

      // Update bank balance if bank account is involved
      if (bankAccountId) {
        const debitAccount = accounts.find(a => a.id === form.debitAccount);
        const creditAccount = accounts.find(a => a.id === form.creditAccount);

        // Check if debit or credit account is a bank asset account
        if ((debitAccount?.account_type || '').toLowerCase() === 'asset' && debitAccount.account_name.toLowerCase().includes('bank')) {
          await supabase.rpc('update_bank_balance', {
            _bank_account_id: bankAccountId,
            _amount: isPurchase ? (netAmount + vatAmount) : amount,
            _operation: 'add'
          });
        } else if ((creditAccount?.account_type || '').toLowerCase() === 'asset' && creditAccount.account_name.toLowerCase().includes('bank')) {
          await supabase.rpc('update_bank_balance', {
            _bank_account_id: bankAccountId,
            _amount: isPurchase ? (netAmount + vatAmount) : amount,
            _operation: 'subtract'
          });
        }
      }

      // Refresh AFS/trial balance cache after posting
      try {
        if (companyId) {
          await supabase.rpc('refresh_afs_cache', { _company_id: companyId });
        }
      } catch {}

      if (showFixedAssetsUI && form.element === 'asset') {
        setProgressText("Finalizing...");
        setPostProgress(100);
        await new Promise(r => setTimeout(r, 600));
      }

      notify.success("Transaction posted");

      // Auto-insert Fixed Asset when transaction represents asset acquisition
      try {
        const debitAcc = accounts.find(a => a.id === form.debitAccount);
        const isAssetType = (debitAcc?.account_type || '').toLowerCase() === 'asset';
        const name = (debitAcc?.account_name || '').toLowerCase();
        const fixedNames = ['land','building','buildings','plant','machinery','motor vehicle','vehicles','furniture','fixtures','equipment','computer','software','goodwill'];
        const nameMatches = fixedNames.some(n => name.includes(n));
        const isAccum = name.includes('accumulated') || name.includes('depreciation') || name.includes('amortization');
        const isFixedAssetDebit = isAssetType && nameMatches && !isAccum;
        const isAssetTx = form.element === 'asset' || isFixedAssetDebit;
        if (isAssetTx) {
          // Resolve company id
          let effectiveCompanyId = companyId;
          if (!effectiveCompanyId || effectiveCompanyId.trim() === '') {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: prof } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
              effectiveCompanyId = (prof as any)?.company_id || effectiveCompanyId;
            }
          }
          // Fixed asset record creation is handled earlier using descriptionWithMethod.
          // Avoid duplicate inserts here.
        }
      } catch {}
      setSuccessMessage("Transaction posted successfully");
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onOpenChange(false);
        onSuccess();
      }, 2000);
    } catch (error: any) {
      notify.error("Posting failed", { description: error.message, duration: 6000 });
      setErrorMessage(error.message || "Posting failed");
      setIsError(true);
      setTimeout(() => setIsError(false), 2000);
    } finally {
      setPostProgress(100);
      setLoading(false);
    }
  }, [form, accounts, bankAccounts, companyId, inventoryAccount, cogsAccount, cogsTotal, invoiceIdForRef, lockType, toast, depreciationMethod, autoClassification, assetUsefulLifeYears, chartMissing, editData, fixedAssets, onOpenChange, onSuccess, selectedAssetId, showFixedAssetsUI]);

  const selectedElement = ACCOUNTING_ELEMENTS.find(e => e.value === form.element);
  const debitAccountName = accounts.find(a => a.id === form.debitAccount)?.account_name;
  const creditAccountName = accounts.find(a => a.id === form.creditAccount)?.account_name;

  // Deposit Offset Calculation for Preview
  const depositAvailable = Number(editData?.deposit_available || 0);
  const depositAccountId = editData?.deposit_account_id;
  const depositAccountName = accounts.find(a => a.id === depositAccountId)?.account_name || 'Supplier Deposit';
  
  const amountVal = parseFloat(form.amount || '0');
  const vatRateVal = parseFloat(form.vatRate || '0') / 100;
  const totalPayableVal = amountIncludesVAT ? amountVal : amountVal * (1 + vatRateVal);
  const offsetAmount = (depositAvailable > 0 && depositAccountId && form.amount) ? Math.min(depositAvailable, totalPayableVal) : 0;
  const isLoanCreditSelected = (() => {
    const ca = accounts.find(a => a.id === form.creditAccount);
    const type = String(ca?.account_type || '').toLowerCase();
    const code = String(ca?.account_code || '');
    const name = String(ca?.account_name || '').toLowerCase();
    return type === 'liability' && (code.startsWith('2300') || code.startsWith('2400') || name.includes('loan'));
  })();
  const [accountSearchOpen, setAccountSearchOpen] = useState(false);
  const [accountSearchTarget, setAccountSearchTarget] = useState<"debit"|"credit">("debit");
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalIncludeAll, setGlobalIncludeAll] = useState(false);
  // Lock debit account for loans (user can only choose credit account - bank/accrual)
  const disableDebitSelection = form.element?.startsWith('loan_') || (lockAccounts && Boolean(form.debitAccount));
  const disableCreditSelection = lockType === 'sent' ? true : (form.element?.startsWith('loan_') ? false : (lockAccounts && Boolean(form.creditAccount)));
  const disableAccountSelection = lockAccounts && Boolean(form.debitAccount) && Boolean(form.creditAccount);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAccountSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  // Auto-calculate loan payment amount when loan is selected
  useEffect(() => {
    if (form.element === 'loan_repayment' && form.loanId) {
      const selectedLoan = loans.find(loan => loan.id === form.loanId);
      if (selectedLoan && selectedLoan.monthly_repayment) {
        const paymentAmount = calculateLoanPaymentAmount(selectedLoan, parseInt(form.installmentNumber) || 1);
        setForm(prev => ({ ...prev, amount: paymentAmount.toFixed(2) }));
      }
    }
  }, [form.element, form.loanId, form.installmentNumber, loans]);

  if (headless) return null;
  if (!open) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-card text-card-foreground">
          <DialogHeader className="p-6 pb-4 border-b shrink-0 bg-card z-10">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            {editData ? 'Edit Transaction' : 'Smart Double-Entry Transaction'}
            <Badge variant="outline" className="ml-2 font-normal text-foreground shadow-sm">Automated Accounting Logic</Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-primary animate-pulse" />
            Intelligent debit/credit posting with payment method detection
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-6 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        {/* Alerts */}
        {chartMissing && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Chart of Accounts missing. Please set up your accounts first.
            </AlertDescription>
          </Alert>
        )}

        {isDuplicate && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Possible duplicate transaction detected!
            </AlertDescription>
          </Alert>
        )}

        {autoClassification && (
          <Alert className="bg-primary/10 border-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
            <AlertDescription className="flex items-center gap-2">
              Auto-classified as: 
              <Badge variant="secondary">{autoClassification.type}</Badge>
              <Badge variant="outline">{autoClassification.category}</Badge>
            </AlertDescription>
          </Alert>
        )}
        
        {isPeriodLocked && (
          <Alert variant="destructive" className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
            <Lock className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700 dark:text-red-400 font-medium">
              This transaction was processed outside of the financial year setup. Please make sure the financial year has been set up correctly. To do this go to Settings.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="space-y-6">
          {/* Step 1: Basic Info */}
          <div className="space-y-6 p-6 border rounded-xl bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="font-semibold text-lg flex items-center gap-3 text-foreground/90">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-bold shadow-sm">1</span>
              Transaction Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="date">Transaction Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              
              {form.element !== 'depreciation' && (
                <div>
                  <Label htmlFor="bankAccount">Bank Account {form.paymentMethod === 'bank' ? '(required)' : '(optional)'} </Label>
                  <Select value={form.bankAccountId || "__none__"} onValueChange={(val) => {
                    const bankAccountValue = val === "__none__" ? "" : val;
                    setForm({ ...form, bankAccountId: bankAccountValue });
                  }}>
                    <SelectTrigger id="bankAccount" className={cn(
                      "h-11 border-muted-foreground/20 transition-all hover:border-primary/50 focus:ring-2 focus:ring-primary/20 bg-muted/5",
                      !form.bankAccountId && "text-muted-foreground"
                    )}>
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="max-h-64 overflow-auto">
                      <SelectItem value="__none__" className="cursor-pointer">None</SelectItem>
                      {(!bankAccounts || bankAccounts.length === 0) && form.bankAccountId && form.bankAccountId !== "__none__" && (
                        <SelectItem value={form.bankAccountId}>Selected Bank</SelectItem>
                      )}
                      {bankAccounts.map((bank) => (
                        <SelectItem key={bank.id} value={bank.id} className="cursor-pointer">
                          <span className="font-medium">{bank.bank_name}</span> - <span className="text-muted-foreground">{bank.account_number}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="reference">Reference Number</Label>
              <Input
                id="reference"
                placeholder="e.g., INV-001, REF-123"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                maxLength={50}
              />
            </div>

            <div>
              <Label htmlFor="description">Description * (max 500 chars)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Textarea
                    id="description"
                    placeholder="Enter transaction description (e.g., 'Equipment purchase')"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    maxLength={500}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.description.length}/500 characters
                  </p>
                </div>
      {showFixedAssetsUI && (form.element === 'asset' || form.element === 'asset_disposal') && (
        <div>
          <Label className="text-xs">Select Fixed Asset</Label>
          <Select value={selectedAssetId} onValueChange={(val) => {
            setSelectedAssetId(val);
            const asset = fixedAssets.find(a => a.id === val);
            if (asset?.description) setForm(prev => ({ ...prev, description: asset.description }));
          }}>
            <SelectTrigger className="h-10 border-muted-foreground/20 bg-muted/5 focus:ring-primary/20 hover:border-primary/50 transition-all">
              <SelectValue placeholder="Choose asset" />
            </SelectTrigger>
            <SelectContent>
              {fixedAssets.map(a => (
                <SelectItem key={a.id} value={a.id} className="cursor-pointer">{a.description}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
              </div>
              {showFixedAssetsUI && form.element === 'asset' && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <Label>Depreciation Method</Label>
                    <Select value={depreciationMethod} onValueChange={setDepreciationMethod}>
                      <SelectTrigger className="h-10 border-muted-foreground/20 bg-muted/5 focus:ring-primary/20 hover:border-primary/50 transition-all">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="straight_line" className="cursor-pointer">Straight Line</SelectItem>
                        <SelectItem value="diminishing" className="cursor-pointer">Diminishing Balance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label>Finance Asset With Loan</Label>
                    <Switch checked={form.assetFinancedByLoan} onCheckedChange={(checked) => setForm(prev => ({ ...prev, assetFinancedByLoan: checked }))} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Accounting Element & Payment Method */}
          <div className="space-y-6 p-6 border rounded-xl bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 delay-100 group">
            <h3 className="font-semibold text-lg flex items-center gap-3 text-foreground/90 group-hover:text-primary transition-colors">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-bold shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">2</span>
              Accounting Classification
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="element" className="text-sm font-medium flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-primary/70" />
                  Accounting Element <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Select value={form.element} onValueChange={(val) => setForm({ ...form, element: val, debitAccount: "", creditAccount: "" })} disabled={lockAccounts}>
                    <SelectTrigger id="element" className="h-12 pl-4 border-muted-foreground/20 transition-all hover:border-primary/50 focus:ring-2 focus:ring-primary/20 bg-muted/5">
                      <div className="flex items-center gap-2">
                        <SelectValue placeholder="Select transaction type..." />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {ACCOUNTING_ELEMENTS.map((elem) => (
                        <SelectItem key={elem.value} value={elem.value} className="cursor-pointer py-3 border-b border-border/50 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${elem.debitType === 'asset' || elem.debitType === 'expense' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                              {elem.icon ? <elem.icon className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{elem.label}</span>
                              <span className="text-xs text-muted-foreground">{elem.description}</span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedElement && (
                  <div className="mt-3 p-3 text-xs bg-primary/5 text-primary/80 rounded-lg border border-primary/10 flex items-start gap-3 animate-in fade-in slide-in-from-top-1 shadow-sm">
                    <div className="p-1 bg-primary/10 rounded-full mt-0.5">
                      <Info className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="leading-relaxed">
                      <span className="font-semibold block mb-0.5 text-primary">{selectedElement.label}</span>
                      {selectedElement.description}
                    </div>
                  </div>
                )}
              </div>

              {showFixedAssetsUI && (form.element === 'asset' || (form.element === 'equity' && form.paymentMethod === 'asset')) && (
                <div className="space-y-4 p-5 bg-gradient-to-br from-muted/30 to-muted/10 rounded-xl border border-border/50 animate-in fade-in zoom-in-95 shadow-sm">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground/80">
                    <div className="p-1.5 bg-background rounded-md shadow-sm border">
                      <Package className="w-4 h-4 text-primary" />
                    </div>
                    Asset Details
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="assetUsefulLife" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Useful Life (years)</Label>
                      <div className="relative">
                        <Input 
                          id="assetUsefulLife" 
                          type="number" 
                          min={1} 
                          value={assetUsefulLifeYears} 
                          onChange={(e) => setAssetUsefulLifeYears(e.target.value)}
                          className="h-10 bg-background border-muted-foreground/20 focus:border-primary/50 transition-all" 
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="assetUsefulLifeStartDate" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Start Date</Label>
                      <Input 
                        id="assetUsefulLifeStartDate" 
                        type="date" 
                        value={assetUsefulLifeStartDate} 
                        onChange={(e) => setAssetUsefulLifeStartDate(e.target.value)}
                        className="h-10 bg-background border-muted-foreground/20 focus:border-primary/50 transition-all" 
                      />
                    </div>
                  </div>
                </div>
              )}

              {showFixedAssetsUI && form.element === 'depreciation' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary/70" />
                    Select Asset <span className="text-red-500">*</span>
                  </Label>
                  <Select value={selectedAssetId} onValueChange={(val) => setSelectedAssetId(val)}>
                    <SelectTrigger className="h-12 bg-muted/5 border-muted-foreground/20 transition-all hover:border-primary/50 focus:ring-2 focus:ring-primary/20">
                      <div className="flex items-center gap-2">
                        <SelectValue placeholder="Select asset to depreciate" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {fixedAssets.map(a => (
                        <SelectItem key={a.id} value={a.id} className="cursor-pointer py-2">
                          <span className="font-medium">{a.description}</span>
                          <span className="ml-2 text-muted-foreground text-xs">(Cost: R{a.cost})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="paymentMethod" className="text-sm font-medium flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary/70" />
                  Payment Method <span className="text-red-500">*</span>
                </Label>
                <Select value={form.paymentMethod} onValueChange={(val) => setForm({ ...form, paymentMethod: val })} disabled={lockAccounts || form.element === 'depreciation'}>
                  <SelectTrigger id="paymentMethod" className="h-12 border-muted-foreground/20 transition-all hover:border-primary/50 focus:ring-2 focus:ring-primary/20 bg-muted/5">
                    <div className="flex items-center gap-2">
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method.value} value={method.value} className="cursor-pointer py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{method.label}</span>
                          <span className="text-xs text-muted-foreground">Affects: {method.accountKeyword}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(form.element === 'loan_repayment' || form.element === 'loan_interest') && (
              <div className="mt-6 p-5 bg-gradient-to-r from-orange-50/80 to-amber-50/80 dark:from-orange-950/20 dark:to-amber-950/20 border border-orange-200/50 dark:border-orange-800/30 rounded-xl animate-in fade-in slide-in-from-top-2 shadow-sm">
                <h4 className="text-sm font-bold text-orange-800 dark:text-orange-200 mb-4 flex items-center gap-2">
                  <div className="p-1.5 bg-orange-100 dark:bg-orange-900/40 rounded-md">
                    <Landmark className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  Loan Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">Select Loan <span className="text-red-500">*</span></Label>
                    <Select value={form.loanId} onValueChange={(val) => setForm({ ...form, loanId: val })}>
                      <SelectTrigger className={cn(
                        "h-10 bg-white/50 dark:bg-black/20 border-orange-200 dark:border-orange-800 focus:ring-orange-500/20 transition-all hover:border-orange-300 dark:hover:border-orange-700",
                        !form.loanId && "text-muted-foreground"
                      )}>
                        <SelectValue placeholder="Select a loan" />
                      </SelectTrigger>
                      <SelectContent>
                        {loans.length === 0 ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            No active loans found. Please create loans first.
                          </div>
                        ) : (
                          loans.map(loan => (
                            <SelectItem key={loan.id} value={loan.id} className="cursor-pointer">
                              <span className="font-medium">{loan.reference}</span>
                              <span className="ml-2 text-muted-foreground text-xs">
                                ({loan.loan_type === 'long' ? 'Long-term' : 'Short-term'}) - Bal: R {loan.outstanding_balance?.toFixed(2)}
                              </span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {form.element === 'loan_repayment' && (
                    <div className="space-y-2">
                      <Label htmlFor="installmentNumber" className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wide">Installment No.</Label>
                      <Input
                        id="installmentNumber"
                        type="number"
                        step="1"
                        min="1"
                        placeholder="#"
                        value={form.installmentNumber}
                        onChange={(e) => setForm({ ...form, installmentNumber: e.target.value })}
                        className="h-10 bg-white/50 dark:bg-black/20 border-orange-200 dark:border-orange-800 focus:ring-orange-500/20"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Account Selection */}
          {form.element && (
            <div className="space-y-6 p-6 border rounded-xl bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 delay-200 group">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h3 className="font-semibold text-lg flex items-center gap-3 text-foreground/90 group-hover:text-primary transition-colors">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-bold shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">3</span>
                  Account Selection (Double-Entry)
                </h3>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button type="button" variant="outline" size="sm" onClick={() => setChartOpen(true)} disabled={disableAccountSelection} className="flex-1 sm:flex-none hover:bg-primary/5 hover:text-primary transition-colors border-primary/20 h-9">
                    <BookOpen className="w-3.5 h-3.5 mr-2" />
                    Chart of Accounts
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setAccountSearchTarget("debit"); setAccountSearchOpen(true); }} disabled={disableAccountSelection} className="flex-1 sm:flex-none hover:bg-primary/5 hover:text-primary transition-colors border-primary/20 h-9">
                    <Search className="w-3.5 h-3.5 mr-2" />
                    Search (Ctrl+K)
                  </Button>
                </div>
              </div>
              
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center space-x-2">
                    <Switch id="split-mode" checked={splitMode} onCheckedChange={setSplitMode} />
                    <Label htmlFor="split-mode">Split Transaction</Label>
                 </div>
                 {splitMode && (
                    <Badge variant={Math.abs(remainingAmount) < 0.01 ? "outline" : "destructive"}>
                      Remaining: R {remainingAmount.toFixed(2)}
                    </Badge>
                 )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Debit Side */}
                {(splitMode && ['expense', 'asset', 'product_purchase', 'liability', 'loan_repayment', 'loan_interest', 'depreciation'].includes(form.element)) ? (
                  <div className="col-span-2 space-y-3 p-4 rounded-lg bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/20">
                     <Label className="text-sm font-bold flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                        Split Debit Allocation
                        <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5 border-emerald-200 text-emerald-700 bg-white/50">DR</Badge>
                     </Label>
                     <div className="space-y-3">
                       {splits.map((split, index) => (
                         <div key={split.id} className="grid grid-cols-12 gap-2 items-start">
                            <div className="col-span-6">
                               <Select value={split.accountId} onValueChange={(val) => {
                                  const newSplits = [...splits];
                                  newSplits[index].accountId = val;
                                  setSplits(newSplits);
                               }}>
                                 <SelectTrigger className="bg-white dark:bg-card"><SelectValue placeholder="Select Account" /></SelectTrigger>
                                 <SelectContent className="max-h-60">
                                   {debitSource.map(acc => (
                                      <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                                   ))}
                                 </SelectContent>
                               </Select>
                            </div>
                            <div className="col-span-3">
                               <Input 
                                  type="number" 
                                  placeholder="Amount" 
                                  value={split.amount} 
                                  onChange={(e) => {
                                     const newSplits = [...splits];
                                     newSplits[index].amount = e.target.value;
                                     setSplits(newSplits);
                                  }} 
                                  className="bg-white dark:bg-card"
                               />
                            </div>
                             <div className="col-span-2">
                               <Select value={split.vatRate} onValueChange={(val) => {
                                  const newSplits = [...splits];
                                  newSplits[index].vatRate = val;
                                  setSplits(newSplits);
                               }}>
                                 <SelectTrigger className="bg-white dark:bg-card"><SelectValue placeholder="VAT" /></SelectTrigger>
                                 <SelectContent>
                                    <SelectItem value="0">0%</SelectItem>
                                    <SelectItem value="15">15%</SelectItem>
                                 </SelectContent>
                               </Select>
                            </div>
                            <div className="col-span-1 flex justify-end">
                               <Button variant="ghost" size="icon" onClick={() => {
                                  const newSplits = splits.filter(s => s.id !== split.id);
                                  setSplits(newSplits);
                               }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                            <div className="col-span-12">
                               <Input 
                                  placeholder="Description (Optional)" 
                                  value={split.description} 
                                  onChange={(e) => {
                                     const newSplits = [...splits];
                                     newSplits[index].description = e.target.value;
                                     setSplits(newSplits);
                                  }} 
                                  className="h-8 text-xs bg-white dark:bg-card"
                               />
                            </div>
                         </div>
                       ))}
                       <Button variant="outline" size="sm" onClick={() => setSplits([...splits, { id: Math.random().toString(), accountId: "", amount: "", description: "", vatRate: "0" }])} className="w-full border-dashed">
                         <Plus className="h-4 w-4 mr-2" /> Add Split Line
                       </Button>
                     </div>
                  </div>
                ) : (
                <div className="space-y-3 p-4 rounded-lg bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/20">
                  <Label htmlFor="debitAccount" className="text-sm font-bold flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse"></div>
                    Debit Account <span className="text-red-500">*</span>
                    <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5 border-emerald-200 text-emerald-700 bg-white/50">DR</Badge>
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <Select value={form.debitAccount} onValueChange={(val) => {
                        // Update atomically to avoid overwriting with stale state
                        setForm(prev => ({
                          ...prev,
                          debitAccount: val,
                          creditAccount: prev.creditAccount === val ? "" : prev.creditAccount,
                        }));
                      }} disabled={disableDebitSelection || debitSource.length === 0}>
                        <SelectTrigger id="debitAccount" className={cn(
                          "h-11 border-l-4 border-l-emerald-500 transition-all hover:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 bg-white dark:bg-card",
                          !form.debitAccount && "text-muted-foreground"
                        )}>
                          <SelectValue placeholder="Select debit account" />
                        </SelectTrigger>
                        <SelectContent position="popper" className="max-h-64 overflow-auto">
                          {debitSource.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id} className="cursor-pointer">
                              <span className="font-medium text-emerald-700 dark:text-emerald-400">{acc.account_code}</span> - {acc.account_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Popover open={debitSearchOpen} onOpenChange={setDebitSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="h-11 w-11 p-0 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all shadow-sm" aria-label="Search debit accounts" disabled={disableAccountSelection}>
                          <Search className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                        <PopoverContent className="w-96 p-0 z-[80]">
                        <Command>
                          <div className="p-2">
                             <CommandInput
                               placeholder="Search debit accounts..."
                               value={debitSearch}
                               onValueChange={(val: string) => setDebitSearch(val)}
                               autoFocus
                               className="h-9"
                             />
                            <div className="flex items-center justify-between px-2 py-2 text-xs text-muted-foreground">
                              <span>Include all accounts</span>
                              <Switch checked={debitIncludeAll} onCheckedChange={setDebitIncludeAll} className="scale-75 origin-right" />
                            </div>
                          </div>
                          <CommandList>
                            <CommandEmpty>No matching accounts.</CommandEmpty>
                            <CommandGroup heading="Debit Accounts">
                              {(debitSearch ? filteredDebitAccounts : debitSource).map((acc) => (
                                <CommandItem
                                  key={acc.id}
                                  onSelect={() => {
                                    setForm(prev => ({
                                      ...prev,
                                      debitAccount: acc.id,
                                      creditAccount: prev.creditAccount === acc.id ? "" : prev.creditAccount,
                                    }));
                                    setDebitSearchOpen(false);
                                    setDebitSearch("");
                                  }}
                                  className="cursor-pointer"
                                >
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400 mr-2">{acc.account_code}</span> {acc.account_name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center justify-between text-xs text-emerald-700/70 dark:text-emerald-400/70 mt-1 px-1 font-medium">
                  <span>Target: {selectedElement?.debitType}</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs text-emerald-600 hover:text-emerald-700 underline decoration-dotted"
                    onClick={() => { setAccountSearchTarget("debit"); setAccountSearchOpen(true); }}
                    disabled={disableAccountSelection}
                  >
                    Advanced Search
                  </Button>
                </div>
              </div>
              )}

                {/* Credit Side */}
                {(splitMode && ['income', 'equity', 'receipt', 'loan_received', 'asset_disposal'].includes(form.element)) ? (
                  <div className="col-span-2 space-y-3 p-4 rounded-lg bg-blue-50/30 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/20">
                     <Label className="text-sm font-bold flex items-center gap-2 text-blue-800 dark:text-blue-300">
                        Split Credit Allocation
                        <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5 border-blue-200 text-blue-700 bg-white/50">CR</Badge>
                     </Label>
                     <div className="space-y-3">
                       {splits.map((split, index) => (
                         <div key={split.id} className="grid grid-cols-12 gap-2 items-start">
                            <div className="col-span-6">
                               <Select value={split.accountId} onValueChange={(val) => {
                                  const newSplits = [...splits];
                                  newSplits[index].accountId = val;
                                  setSplits(newSplits);
                               }}>
                                 <SelectTrigger className="bg-white dark:bg-card"><SelectValue placeholder="Select Account" /></SelectTrigger>
                                 <SelectContent className="max-h-60">
                                   {creditSource.map(acc => (
                                      <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                                   ))}
                                 </SelectContent>
                               </Select>
                            </div>
                            <div className="col-span-3">
                               <Input 
                                  type="number" 
                                  placeholder="Amount" 
                                  value={split.amount} 
                                  onChange={(e) => {
                                     const newSplits = [...splits];
                                     newSplits[index].amount = e.target.value;
                                     setSplits(newSplits);
                                  }} 
                                  className="bg-white dark:bg-card"
                               />
                            </div>
                             <div className="col-span-2">
                               <Select value={split.vatRate} onValueChange={(val) => {
                                  const newSplits = [...splits];
                                  newSplits[index].vatRate = val;
                                  setSplits(newSplits);
                               }}>
                                 <SelectTrigger className="bg-white dark:bg-card"><SelectValue placeholder="VAT" /></SelectTrigger>
                                 <SelectContent>
                                    <SelectItem value="0">0%</SelectItem>
                                    <SelectItem value="15">15%</SelectItem>
                                 </SelectContent>
                               </Select>
                            </div>
                            <div className="col-span-1 flex justify-end">
                               <Button variant="ghost" size="icon" onClick={() => {
                                  const newSplits = splits.filter(s => s.id !== split.id);
                                  setSplits(newSplits);
                               }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                            <div className="col-span-12">
                               <Input 
                                  placeholder="Description (Optional)" 
                                  value={split.description} 
                                  onChange={(e) => {
                                     const newSplits = [...splits];
                                     newSplits[index].description = e.target.value;
                                     setSplits(newSplits);
                                  }} 
                                  className="h-8 text-xs bg-white dark:bg-card"
                               />
                            </div>
                         </div>
                       ))}
                       <Button variant="outline" size="sm" onClick={() => setSplits([...splits, { id: Math.random().toString(), accountId: "", amount: "", description: "", vatRate: "0" }])} className="w-full border-dashed">
                         <Plus className="h-4 w-4 mr-2" /> Add Split Line
                       </Button>
                     </div>
                  </div>
                ) : (
                <div className="space-y-3 p-4 rounded-lg bg-blue-50/30 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/20">
                  <Label htmlFor="creditAccount" className="text-sm font-bold flex items-center gap-2 text-blue-800 dark:text-blue-300">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse"></div>
                    Credit Account <span className="text-red-500">*</span>
                    <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5 border-blue-200 text-blue-700 bg-white/50">CR</Badge>
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <Select value={form.creditAccount} onValueChange={(val) => {
                        // Update atomically to avoid overwriting with stale state
                        setForm(prev => ({
                          ...prev,
                          creditAccount: val,
                          debitAccount: prev.debitAccount === val ? "" : prev.debitAccount,
                        }));
                      }} disabled={disableCreditSelection || creditSource.length === 0}>
                        <SelectTrigger id="creditAccount" className={cn(
                          "h-11 border-l-4 border-l-blue-500 transition-all hover:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-card",
                          !form.creditAccount && "text-muted-foreground"
                        )}>
                          <SelectValue placeholder="Select credit account" />
                        </SelectTrigger>
                        <SelectContent position="popper" className="max-h-64 overflow-auto">
                          {creditSource.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id} className="cursor-pointer">
                              <span className="font-medium text-blue-700 dark:text-blue-400">{acc.account_code}</span> - {acc.account_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Popover open={creditSearchOpen} onOpenChange={setCreditSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="h-11 w-11 p-0 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-all shadow-sm" aria-label="Search credit accounts" disabled={disableAccountSelection}>
                          <Search className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                        <PopoverContent className="w-96 p-0 z-[80]">
                        <Command>
                          <div className="p-2">
                             <CommandInput
                               placeholder="Search credit accounts..."
                               value={creditSearch}
                               onValueChange={(val: string) => setCreditSearch(val)}
                               autoFocus
                               className="h-9"
                             />
                            <div className="flex items-center justify-between px-2 py-2 text-xs text-muted-foreground">
                              <span>Include all accounts</span>
                              <Switch checked={creditIncludeAll} onCheckedChange={setCreditIncludeAll} className="scale-75 origin-right" />
                            </div>
                          </div>
                          <CommandList>
                            <CommandEmpty>No matching accounts.</CommandEmpty>
                            <CommandGroup heading="Credit Accounts">
                              {(creditSearch ? filteredCreditAccounts : creditSource).map((acc) => (
                                <CommandItem
                                  key={acc.id}
                                  onSelect={() => {
                                    setForm(prev => ({
                                      ...prev,
                                      creditAccount: acc.id,
                                      debitAccount: prev.debitAccount === acc.id ? "" : prev.debitAccount,
                                    }));
                                    setCreditSearchOpen(false);
                                    setCreditSearch("");
                                  }}
                                  className="cursor-pointer"
                                >
                                  <span className="font-medium text-blue-600 dark:text-blue-400 mr-2">{acc.account_code}</span> {acc.account_name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                      </Popover>
                  </div>
                  <div className="flex items-center justify-between text-xs text-blue-700/70 dark:text-blue-400/70 mt-1 px-1 font-medium">
                    <span>Target: {selectedElement?.creditTypes?.join('/')}</span>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-blue-600 hover:text-blue-700 underline decoration-dotted"
                      onClick={() => { setAccountSearchTarget("credit"); setAccountSearchOpen(true); }}
                      disabled={disableAccountSelection}
                    >
                      Advanced Search
                    </Button>
                  </div>
                  {lockAccounts && lockType === 'sent' && (
                    <p className="text-xs mt-1 text-primary font-medium flex items-center gap-1 bg-primary/5 p-1.5 rounded">
                      <Lock className="w-3 h-3" /> Locked: 4000 - Sales Revenue
                    </p>
                  )}
                </div>
              )}
              </div>

              {debitAccountName && creditAccountName && (
              <div className="mt-4 p-5 rounded-xl bg-gradient-to-r from-emerald-50/50 via-white to-blue-50/50 dark:from-emerald-950/20 dark:via-background dark:to-blue-950/20 border border-border/60 shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-black/[0.02] dark:bg-grid-white/[0.02]" />
                <div className="relative flex flex-col sm:flex-row items-center gap-4 justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-background rounded-full border shadow-sm">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h5 className="font-semibold text-foreground text-sm">Double Entry Preview</h5>
                      <p className="text-xs text-muted-foreground">The transaction is balanced</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 w-full sm:w-auto bg-background/80 backdrop-blur-sm rounded-lg border shadow-sm p-3 font-mono text-xs space-y-2 min-w-[280px]">
                    <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="h-4 text-[9px] px-1 border-emerald-200 bg-emerald-50">DR</Badge>
                        <span className="truncate max-w-[150px]">{debitAccountName}</span>
                      </div>
                      <span className="font-bold">{form.amount ? `R ${parseFloat(form.amount).toFixed(2)}` : '---'}</span>
                    </div>
                    <div className="h-px bg-border/50 w-full" />
                    <div className="flex justify-between items-center text-blue-700 dark:text-blue-400">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="h-4 text-[9px] px-1 border-blue-200 bg-blue-50">CR</Badge>
                        <span className="truncate max-w-[150px]">{creditAccountName}</span>
                      </div>
                      <span className="font-bold">{form.amount ? `R ${parseFloat(form.amount).toFixed(2)}` : '---'}</span>
                    </div>
                    
                    {offsetAmount > 0 && (
                      <>
                        <div className="h-px bg-border/50 w-full my-1 border-dashed" />
                        <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="h-4 text-[9px] px-1 border-emerald-200 bg-emerald-50">DR</Badge>
                            <span className="truncate max-w-[150px]">{creditAccountName} (Offset)</span>
                          </div>
                          <span className="font-bold">R {offsetAmount.toFixed(2)}</span>
                        </div>
                        <div className="h-px bg-border/50 w-full" />
                        <div className="flex justify-between items-center text-blue-700 dark:text-blue-400">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="h-4 text-[9px] px-1 border-blue-200 bg-blue-50">CR</Badge>
                            <span className="truncate max-w-[150px]">{depositAccountName}</span>
                          </div>
                          <span className="font-bold">R {offsetAmount.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            {lockAccounts && lockType === 'sent' && cogsTotal > 0 && cogsAccount && inventoryAccount && (
              <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-900 dark:text-amber-100 text-xs">
                  <strong>Additional Entry (Perpetual Inventory):</strong> Dr {cogsAccount.account_name} / Cr {inventoryAccount.account_name} • R {cogsTotal.toFixed(2)}
                </AlertDescription>
              </Alert>
            )}
          </div>
          )}

          {/* Step 4: Amount & Tax */}
          <div className="space-y-6 p-6 border rounded-xl bg-card text-card-foreground shadow-sm hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 delay-300 group">
            <h3 className="font-semibold text-lg flex items-center gap-3 text-foreground/90 group-hover:text-primary transition-colors">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-bold shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">4</span>
              Values & Taxation
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="amount" className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary/70" />
                  Total Amount {form.element?.startsWith('loan_') || form.element === 'depreciation' || form.element === 'asset_disposal' ? '' : (amountIncludesVAT ? '(incl. VAT)' : '(excl. VAT)')} <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">R</span>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                    className="pl-8 text-lg font-semibold h-11 bg-muted/5 border-muted-foreground/20 focus:border-primary/50 transition-all focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {form.element?.startsWith('loan_') ? (
                <div className="grid grid-cols-2 gap-4">
                  {form.element === 'loan_received' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="interestRate" className="text-sm font-medium flex items-center gap-2">
                          <Percent className="w-4 h-4 text-primary/70" />
                          Interest Rate (%)
                        </Label>
                        <Input
                          id="interestRate"
                          type="number"
                          step="0.01"
                          placeholder="e.g. 10"
                          value={form.interestRate}
                          onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                          className="h-11 bg-muted/5"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="loanTerm" className="text-sm font-medium flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-primary/70" />
                          Term (months)
                        </Label>
                        <Input
                          id="loanTerm"
                          type="number"
                          step="1"
                          placeholder="e.g. 12"
                          value={form.loanTerm}
                          onChange={(e) => setForm({ ...form, loanTerm: e.target.value })}
                          className="h-11 bg-muted/5"
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="loanTermType">Loan Term Type</Label>
                        <Select value={form.loanTermType} onValueChange={(val) => setForm({ ...form, loanTermType: val })}>
                          <SelectTrigger id="loanTermType" className="h-11 bg-muted/5 border-muted-foreground/20 focus:ring-primary/20 hover:border-primary/50 transition-all">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="short" className="cursor-pointer">Short-term</SelectItem>
                            <SelectItem value="long" className="cursor-pointer">Long-term</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                form.element !== 'depreciation' && form.element !== 'asset_disposal' && (
                  <div className="space-y-2">
                    <Label htmlFor="vatRate" className="text-sm font-medium flex items-center gap-2">
                      <Percent className="w-4 h-4 text-primary/70" />
                      VAT Rate (%)
                      {!isVatRegistered && (
                        <Badge variant="outline" className="text-[10px] h-5 bg-muted text-muted-foreground border-muted-foreground/30">
                          Not Registered
                        </Badge>
                      )}
                    </Label>
                    <Select 
                        value={!isVatRegistered ? "0" : form.vatRate} 
                        onValueChange={(val) => {
                            if (!isVatRegistered && val !== "0") {
                                toast({
                                    title: "VAT Restriction",
                                    description: "This company is not registered for VAT. Please update company settings to enable VAT.",
                                    variant: "destructive"
                                });
                                return;
                            }
                            setForm({ ...form, vatRate: val });
                        }}
                        disabled={!isVatRegistered}
                    >
                      <SelectTrigger id="vatRate" className={`h-11 transition-all ${!isVatRegistered ? 'bg-muted opacity-80' : 'bg-muted/5 hover:border-primary/50 focus:ring-2 focus:ring-primary/20 border-muted-foreground/20'}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0" className="cursor-pointer">0% (No VAT)</SelectItem>
                        <SelectItem value="15" className="cursor-pointer">15% (Standard)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )
              )}
              
              {(!form.element?.startsWith('loan_') && form.element !== 'depreciation' && form.element !== 'asset_disposal') && (
                <div className={`flex items-center gap-3 p-4 rounded-lg border bg-muted/30 md:col-span-2 transition-colors ${!isVatRegistered ? 'opacity-50 pointer-events-none' : 'hover:bg-muted/50'}`}>
                  <Switch 
                    id="vatInclusive" 
                    checked={amountIncludesVAT && isVatRegistered} 
                    onCheckedChange={(v: boolean) => isVatRegistered && setAmountIncludesVAT(!!v)} 
                    disabled={!isVatRegistered}
                  />
                  <div className="space-y-0.5 cursor-pointer" onClick={() => isVatRegistered && setAmountIncludesVAT(!amountIncludesVAT)}>
                    <Label htmlFor="vatInclusive" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                      Amount includes VAT?
                      {amountIncludesVAT && <Badge variant="secondary" className="text-[10px] h-4 px-1">Active</Badge>}
                    </Label>
                    <p className="text-xs text-muted-foreground">Toggle on if the entered amount already includes VAT.</p>
                  </div>
                </div>
              )}
              
              {form.element === 'asset' && (isLoanCreditSelected || form.assetFinancedByLoan) && (
                <div className="grid grid-cols-2 gap-4 md:col-span-2 p-5 bg-orange-50/50 dark:bg-orange-950/10 rounded-lg border border-orange-100 dark:border-orange-900/30 border-dashed">
                  <div className="col-span-2 text-sm font-semibold text-orange-800 dark:text-orange-400 flex items-center gap-2 mb-1">
                    <Info className="w-4 h-4" /> Loan Details for Asset Financing
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="interestRate">Interest Rate (%)</Label>
                    <Input
                      id="interestRate"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 10"
                      value={form.interestRate}
                      onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                      className="h-9 bg-background border-orange-200 dark:border-orange-800 focus:border-orange-500 focus:ring-orange-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loanTerm">Term (months)</Label>
                    <Input
                      id="loanTerm"
                      type="number"
                      step="1"
                      placeholder="e.g. 12"
                      value={form.loanTerm}
                      onChange={(e) => setForm({ ...form, loanTerm: e.target.value })}
                      className="h-9 bg-background border-orange-200 dark:border-orange-800 focus:border-orange-500 focus:ring-orange-500/20"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="loanTermType">Loan Term Type</Label>
                    <Select value={form.loanTermType} onValueChange={(val) => setForm({ ...form, loanTermType: val })}>
                      <SelectTrigger id="loanTermType" className="h-9 bg-background border-orange-200 dark:border-orange-800 focus:ring-orange-500/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short" className="cursor-pointer">Short-term</SelectItem>
                        <SelectItem value="long" className="cursor-pointer">Long-term</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Summary */}
            {form.amount && parseFloat(form.amount) > 0 && (
              <div className="mt-6 p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/40 dark:to-slate-900/20 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group/summary">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover/summary:opacity-10 transition-opacity">
                  <Calculator className="w-24 h-24" />
                </div>
                
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                  <Calculator className="w-4 h-4" /> Transaction Summary
                </h4>
                
                <div className="space-y-3 relative z-10">
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground font-medium">Total Amount {form.element?.startsWith('loan_') || form.element === 'depreciation' || form.element === 'asset_disposal' ? '' : '(incl. VAT)'}</span>
                    <span className="font-mono text-lg font-bold">R {parseFloat(form.amount).toFixed(2)}</span>
                  </div>
                  
                  {!form.element?.startsWith('loan_') && form.element !== 'depreciation' && form.element !== 'asset_disposal' && (
                    <>
                      <div className="flex justify-between text-sm items-center">
                        <span className="text-muted-foreground flex items-center gap-1">
                          VAT Amount <Badge variant="outline" className="text-[10px] h-4 px-1">{form.vatRate}%</Badge>
                        </span>
                        <span className="font-mono text-amber-600 dark:text-amber-400 font-medium">
                          + R {(amountIncludesVAT ? (parseFloat(form.amount) * parseFloat(form.vatRate) / (100 + parseFloat(form.vatRate))) : (parseFloat(form.amount) * parseFloat(form.vatRate) / 100)).toFixed(2)}
                        </span>
                      </div>
                      <div className="h-px bg-slate-300/50 dark:bg-slate-700/50 my-2" />
                      <div className="flex justify-between text-base font-bold items-center">
                        <span className="text-slate-800 dark:text-slate-200">Net Amount (excl. VAT)</span>
                        <span className="font-mono text-primary text-lg">
                          R {(amountIncludesVAT ? (parseFloat(form.amount) - (parseFloat(form.amount) * parseFloat(form.vatRate) / (100 + parseFloat(form.vatRate)))) : parseFloat(form.amount)).toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}

                  {form.debitAccount && form.creditAccount && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/50">
                      <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/30 p-2.5 rounded-lg justify-center border border-emerald-100 dark:border-emerald-900/30">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                        <span className="font-semibold">Balanced: Debit = Credit</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        </div>

        <DialogFooter className="p-6 border-t bg-muted/10 shrink-0 flex-col-reverse sm:flex-row gap-3 items-center sm:justify-end backdrop-blur-sm">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => onOpenChange(false)} 
            disabled={loading} 
            className="w-full sm:w-auto hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-all duration-200 h-11"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={
              isPeriodLocked || loading || chartMissing || !form.element || !form.debitAccount || !form.creditAccount ||
              (showFixedAssetsUI && ((form.element === 'asset') || (form.element === 'equity' && form.paymentMethod === 'asset')) && (!assetUsefulLifeYears || !assetUsefulLifeStartDate))
            }
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 w-full sm:w-auto min-w-[180px] h-11 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-[0.98] group"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</>
            ) : (
              <><Save className="h-4 w-4 mr-2 group-hover:animate-bounce" /> Post Transaction <ArrowRight className="w-4 h-4 ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" /></>
            )}
          </Button>
        </DialogFooter>

        {loading && showFixedAssetsUI && (
          <div className="absolute inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center transition-all duration-500">
            <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full animate-in fade-in zoom-in-95 duration-300">
              <LoadingSpinner size="lg" className="scale-125" />
              <div className="w-full space-y-4">
                <Progress value={postProgress} className="h-2 w-full" />
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
      </DialogContent>
    </Dialog>

    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading Chart of Accounts...</div>}>
      <Sheet open={chartOpen} onOpenChange={setChartOpen}>
        <SheetContent side="right" className="sm:max-w-xl w-full z-[60]">
          <div className="h-full overflow-auto">
            <ChartOfAccountsLazy />
          </div>
        </SheetContent>
      </Sheet>
    </Suspense>

    {/* Global Account Search */}
    <CommandDialog open={accountSearchOpen} onOpenChange={(o) => {
      setAccountSearchOpen(o);
      if (!o) { setGlobalSearch(""); }
    }}>
      <div className="flex flex-col gap-2 p-3 bg-muted/20 border-b">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" /> Advanced Account Search
          </span>
          <div className="flex items-center gap-2 bg-background p-1 rounded-lg border shadow-sm">
            <Button 
              variant={accountSearchTarget === "debit" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setAccountSearchTarget("debit")}
              className={cn("h-7 text-xs px-3", accountSearchTarget === "debit" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-bold")}
            >
              Debit
            </Button>
            <Button 
              variant={accountSearchTarget === "credit" ? "secondary" : "ghost"} 
              size="sm" 
              onClick={() => setAccountSearchTarget("credit")}
              className={cn("h-7 text-xs px-3", accountSearchTarget === "credit" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-bold")}
            >
              Credit
            </Button>
          </div>
        </div>
      </div>
      
      <Command className="rounded-none border-0">
        <div className="px-3 pb-2 pt-2">
          <div className="relative">
            <CommandInput
              placeholder="Search by code or name..."
              value={globalSearch}
              onValueChange={(val: string) => setGlobalSearch(val)}
              autoFocus
              className="h-10 bg-muted/30 border rounded-md px-3 text-sm focus-visible:ring-1 focus-visible:ring-primary/20"
            />
          </div>
          <div className="flex items-center justify-between px-1 py-2 mt-1">
             <Label htmlFor="global-include-all" className="text-xs text-muted-foreground flex items-center gap-2 cursor-pointer">
               <Globe className="w-3 h-3" /> Search entire chart of accounts
             </Label>
             <Switch 
               id="global-include-all" 
               checked={globalIncludeAll} 
               onCheckedChange={setGlobalIncludeAll} 
               className="scale-75 origin-right"
             />
          </div>
        </div>
        
        <div className="h-px bg-border/50 mx-3" />
        
        <CommandList className="max-h-[350px] overflow-y-auto p-2">
          <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
            No accounts found matching your search.
          </CommandEmpty>
          <CommandGroup heading={accountSearchTarget === "debit" ? "Select Debit Account" : "Select Credit Account"} className="text-xs font-medium text-muted-foreground">
            {(() => {
              const source = accountSearchTarget === "debit"
                ? (globalIncludeAll ? accounts : debitSource)
                : (globalIncludeAll ? accounts : creditSource);
              const filtered = source.filter(a =>
                (a.account_name || '').toLowerCase().includes(globalSearch.toLowerCase()) ||
                (a.account_code || '').toLowerCase().includes(globalSearch.toLowerCase())
              );
              const list = globalSearch ? filtered : source;
              return list.map(acc => (
                <CommandItem
                  key={acc.id}
                  onSelect={() => {
                    setForm(prev => ({
                      ...prev,
                      debitAccount: accountSearchTarget === "debit" ? acc.id : prev.debitAccount,
                      creditAccount: accountSearchTarget === "credit" ? acc.id : prev.creditAccount,
                    }));
                    setAccountSearchOpen(false);
                  }}
                  className="cursor-pointer py-2.5 px-3 rounded-md mb-1 aria-selected:bg-primary/5 aria-selected:text-primary transition-colors"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-md text-xs font-bold border shadow-sm shrink-0",
                      accountSearchTarget === "debit" 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30" 
                        : "bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/30"
                    )}>
                      {acc.account_code.slice(0, 2)}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium truncate text-foreground/90">{acc.account_name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{acc.account_code}</span>
                    </div>
                    {((accountSearchTarget === "debit" && form.debitAccount === acc.id) || 
                      (accountSearchTarget === "credit" && form.creditAccount === acc.id)) && (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </div>
                </CommandItem>
              ));
            })()}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
    <Dialog open={vatDialogOpen} onOpenChange={setVatDialogOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <Info className="h-5 w-5" />
            VAT Registration
          </DialogTitle>
          <DialogDescription className="pt-2 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
            It looks like your business isn't registered for VAT yet.
            <br /><br />
            Just a heads-up: this means you won't be able to add VAT to your transactions or claim input VAT.
            <br /><br />
            If you register for VAT later, you can update this in your company profile.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button onClick={() => setVatDialogOpen(false)} className="w-full sm:w-auto">
            Got it, thanks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={isSuccess} onOpenChange={setIsSuccess}>
      <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-0 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-b from-green-50 to-white dark:from-green-950/20 dark:to-background z-0" />
        
        <div className="relative z-10 flex flex-col items-center justify-center p-8 pt-10 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full bg-green-200/50 animate-ping duration-[2000ms]" />
            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center border-4 border-white dark:border-background shadow-lg relative z-10 animate-in zoom-in-50 duration-500">
              <Check className="h-10 w-10 text-green-600 dark:text-green-400" strokeWidth={3} />
            </div>
          </div>
          
          <DialogHeader className="mb-2">
            <DialogTitle className="text-2xl font-bold text-green-700 dark:text-green-400 tracking-tight">Success!</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2 mb-8 max-w-[300px]">
            <p className="text-lg font-medium text-foreground">{successMessage}</p>
            <p className="text-sm text-muted-foreground">The transaction has been successfully posted to the ledger.</p>
          </div>
          
          <div className="grid grid-cols-2 gap-3 w-full">
            <Button variant="outline" onClick={() => setIsSuccess(false)} className="w-full hover:bg-muted border-muted-foreground/20">
              Close
            </Button>
            <Button 
              onClick={() => { setIsSuccess(false); setForm(initialFormState); }}
              className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200 dark:shadow-green-900/20"
            >
              <Plus className="w-4 h-4 mr-2" /> New Transaction
            </Button>
          </div>
        </div>
        
        <div className="h-1.5 w-full bg-gradient-to-r from-green-300 via-green-500 to-green-300" />
      </DialogContent>
    </Dialog>

    <Dialog open={isError} onOpenChange={setIsError}>
      <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-0 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-b from-red-50 to-white dark:from-red-950/20 dark:to-background z-0" />
        
        <div className="relative z-10 flex flex-col items-center justify-center p-8 pt-10 text-center">
          <div className="relative mb-6">
            <div className="h-20 w-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center border-4 border-white dark:border-background shadow-lg relative z-10 animate-in zoom-in-50 duration-500 swing">
              <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" strokeWidth={2} />
            </div>
          </div>
          
          <DialogHeader className="mb-2">
            <DialogTitle className="text-2xl font-bold text-red-700 dark:text-red-400 tracking-tight">Transaction Failed</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2 mb-8 max-w-[320px]">
            <p className="text-base font-medium text-foreground bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-100 dark:border-red-900/20">
              {errorMessage}
            </p>
            <p className="text-sm text-muted-foreground">Please review your entries and try again.</p>
          </div>
          
          <div className="w-full">
            <Button 
              variant="destructive" 
              onClick={() => setIsError(false)} 
              className="w-full shadow-lg shadow-red-200 dark:shadow-red-900/20"
            >
              Dismiss
            </Button>
          </div>
        </div>
        
        <div className="h-1.5 w-full bg-gradient-to-r from-red-300 via-red-500 to-red-300" />
      </DialogContent>
    </Dialog>

    <Dialog open={vatDialogOpen} onOpenChange={setVatDialogOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>VAT Status</DialogTitle>
          <DialogDescription className="pt-2 text-base">
            Just a quick note: Your business isn't set up for VAT yet, so we've hidden those options to keep things simple.
            <br /><br />
            If you need to add VAT later, just head over to Company Settings to update your registration.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setVatDialogOpen(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};
