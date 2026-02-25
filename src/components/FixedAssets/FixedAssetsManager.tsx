import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Download, Package, Search, Info, Loader2, Building2, TrendingUp, Calculator, CheckCircle2, CheckCircle, AlertTriangle, MoreHorizontal, ChevronDown, Filter, Settings, Menu, Pencil, Upload } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { calculateDepreciation, updateAssetDepreciation } from "@/components/FixedAssets/DepreciationCalculator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Progress } from "@/components/ui/progress";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";
import { validateTransactionDate } from "@/lib/transactions-api";
import { format } from "date-fns";

interface FixedAsset {
  id: string;
  description: string;
  cost: number;
  purchase_date: string;
  useful_life_years: number;
  accumulated_depreciation: number;
  status: string;
  disposal_date?: string;
  asset_account_id?: string;
  category?: string;
  location?: string;
  serial_number?: string;
  bought_from?: string;
}

interface AssetLedgerRow {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balanceLabel: string;
}

const getAssetNormalBalanceSide = (accountType: string): "debit" | "credit" => {
  const t = String(accountType || "").toLowerCase();
  if (t === "asset" || t === "expense") return "debit";
  return "credit";
};

const formatAssetLedgerBalance = (amount: number, normalSide: "debit" | "credit") => {
  const abs = Math.abs(amount);
  if (abs === 0) return "0.00";
  if (normalSide === "debit") {
    return amount >= 0 ? `${abs.toFixed(2)} Dr` : `${abs.toFixed(2)} Cr`;
  }
  return amount >= 0 ? `${abs.toFixed(2)} Cr` : `${abs.toFixed(2)} Dr`;
};

const isOpeningAsset = (asset: FixedAsset) => {
  return (asset.description || '').toLowerCase().includes('[opening]');
};

const calculateNetBookValue = (asset: FixedAsset | null) => {
  if (!asset) return 0;
  return (asset.cost || 0) - (asset.accumulated_depreciation || 0);
};

const monthStartsBetween = (d1: string, d2: string) => {
  const start = new Date(d1);
  const end = new Date(d2);
  const result: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    result.push(current.toISOString().split('T')[0]);
    current.setMonth(current.getMonth() + 1);
  }
  return result;
};

interface FixedAssetsManagerProps {
  isManagementMode?: boolean;
}

export const FixedAssetsManager: React.FC<FixedAssetsManagerProps> = ({ isManagementMode = true }) => {
  const navigate = useNavigate();
  const { user } = useAuth(); // Already imported
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompany() {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    }
    fetchCompany();
  }, [user]);

  const fetcher = useCallback(async () => {
    if (!user) return [];
    
    let cid = companyId;
    if (!cid) {
       const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
       cid = profile?.company_id || null;
    }
    
    if (!cid) return [];

    const { data, error } = await supabase
      .from("fixed_assets")
      .select("*")
      .eq("company_id", cid)
      .order("purchase_date", { ascending: false });

    if (error) throw error;
    return data as FixedAsset[];
  }, [user, companyId]);

  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (full = false) => {
     setLoading(true);
     try {
       const data = await fetcher();
       setAssets(data);
     } catch (e) {
       console.error(e);
     } finally {
       setLoading(false);
     }
  }, [fetcher]);

  useEffect(() => {
    refresh();
  }, [refresh]);


  const [assetAccounts, setAssetAccounts] = useState<Array<{ id: string; account_code: string; account_name: string; account_type: string }>>([]);
  const [loanAccounts, setLoanAccounts] = useState<Array<{ id: string; account_code: string; account_name: string }>>([]);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; account_name: string; bank_name?: string }>>([]);
  const [assetFilter, setAssetFilter] = useState<'all' | 'opening' | 'during'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [disposalDialogOpen, setDisposalDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);
  const [deprDialogOpen, setDeprDialogOpen] = useState(false);
  const [deprSelectedAsset, setDeprSelectedAsset] = useState<FixedAsset | null>(null);
  const [deprDate, setDeprDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [deprPosting, setDeprPosting] = useState<boolean>(false);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [deprMonthStatus, setDeprMonthStatus] = useState<{ posted: boolean; count: number; label: string } | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Operation completed successfully");
  const { toast } = useToast();
  // user is already defined in the component scope
  const { isAdmin, isAccountant } = useRoles();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  
  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const assetCategoryOptions = [
    "Office Equipment",
    "Computer Equipment",
    "Furniture and Fittings",
    "Motor Vehicles",
    "Machinery",
    "Buildings",
    "Land and Property",
    "Intangible Assets"
  ];

  const [formData, setFormData] = useState({
    description: "",
    cost: "",
    purchase_date: "",
    useful_life_years: "5",
    depreciation_method: "straight_line",
    asset_account_id: "",
    funding_source: "bank",
    bank_account_id: "",
    loan_account_id: "",
    category: "",
    location: "",
    serial_number: "",
    bought_from: ""
  });

  const [disposalData, setDisposalData] = useState({
    disposal_date: new Date().toISOString().split("T")[0],
    disposal_amount: "",
    asset_account_id: "",
    bank_account_id: "",
    reason: "",
    file: null as File | null,
  });
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(7);
  const [purchaseForm, setPurchaseForm] = useState({
    purchase_date: new Date().toISOString().split("T")[0],
    amount: "",
    asset_account_id: "",
    funding_source: "bank",
    bank_account_id: "",
    loan_account_id: "",
    interest_rate: "",
    loan_term: "",
    loan_term_type: "short",
    vat_applicable: "no",
    useful_life_years: "5",
    depreciation_method: "straight_line",
    description: "",
    category: "",
    location: "",
    serial_number: "",
    bought_from: ""
  });
  const [deprAmount, setDeprAmount] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [ledgerDialogOpen, setLedgerDialogOpen] = useState(false);
  const [ledgerFromDate, setLedgerFromDate] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [ledgerToDate, setLedgerToDate] = useState<string>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [ledgerRows, setLedgerRows] = useState<AssetLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    const fetchAccounts = async () => {
      // Fetch Chart of Accounts
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('company_id', companyId)
        .eq('is_active', true);

      if (data) {
        const assets = data.filter(a => 
          (String(a.account_type).toLowerCase() === 'asset' || String(a.account_type).toLowerCase() === 'fixed_asset') && 
          (String(a.account_code).startsWith('15') || 
           a.account_name.toLowerCase().includes('fixed asset') ||
           a.account_name.toLowerCase().includes('equipment') ||
           a.account_name.toLowerCase().includes('vehicle') ||
           a.account_name.toLowerCase().includes('machinery'))
        );
        setAssetAccounts(assets);

        // Filter and set Loan Accounts
        const loans = data.filter(a => 
          String(a.account_type).toLowerCase() === 'liability' && 
          (a.account_name.toLowerCase().includes('loan') || a.account_name.toLowerCase().includes('finance'))
        );
        setLoanAccounts(loans);
      }

      // Fetch Real Bank Accounts (Entities)
      const { data: realBanks } = await supabase
        .from('bank_accounts')
        .select('id, account_name, bank_name')
        .eq('company_id', companyId);
      
      if (realBanks) {
        setBankAccounts(realBanks);
      }
    };

    fetchAccounts();
  }, [companyId]);

  const loadAssetLedger = useCallback(async () => {
    try {
      setLedgerLoading(true);
      setLedgerRows([]);

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        setLedgerLoading(false);
        return;
      }

      let currentCompanyId = companyId;
      if (!currentCompanyId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (!profile?.company_id) {
          toast({
            title: "Company not found",
            description: "You are not linked to a company.",
            variant: "destructive",
          });
          setLedgerLoading(false);
          return;
        }
        currentCompanyId = profile.company_id as string;
        setCompanyId(currentCompanyId);
      }

      const { data: transactions, error } = await supabase
        .from("transactions")
        .select(`
          id,
          transaction_date,
          reference_number,
          description,
          status,
          company_id,
          transaction_entries (
            id,
            account_id,
            debit,
            credit,
            description
          )
        `)
        .eq("company_id", currentCompanyId)
        .eq("status", "posted")
        .lte("transaction_date", ledgerToDate)
        .order("transaction_date", { ascending: true })
        .order("reference_number", { ascending: true })
        .order("id", { ascending: true });

      if (error) throw error;

      const assetAccountIds = new Set(assetAccounts.map(a => String(a.id)));

      const openingDebitMap: Record<string, number> = {};
      const openingCreditMap: Record<string, number> = {};
      const periodEntries: Record<string, Array<{
        id: string;
        date: string;
        reference: string;
        description: string;
        debit: number;
        credit: number;
      }>> = {};

      transactions?.forEach((tx: any) => {
        const txDate = tx.transaction_date;
        const entries = tx.transaction_entries || [];
        entries.forEach((entry: any) => {
          const accountId = String(entry.account_id || "");
          if (!assetAccountIds.has(accountId)) return;

          const debit = Number(entry.debit || 0);
          const credit = Number(entry.credit || 0);
          if (debit === 0 && credit === 0) return;

          if (new Date(txDate) < new Date(ledgerFromDate)) {
            openingDebitMap[accountId] = (openingDebitMap[accountId] || 0) + debit;
            openingCreditMap[accountId] = (openingCreditMap[accountId] || 0) + credit;
          } else if (new Date(txDate) >= new Date(ledgerFromDate) && new Date(txDate) <= new Date(ledgerToDate)) {
            if (!periodEntries[accountId]) {
              periodEntries[accountId] = [];
            }
            periodEntries[accountId].push({
              id: entry.id,
              date: txDate,
              reference: tx.reference_number || "",
              description: entry.description || tx.description || "",
              debit,
              credit,
            });
          }
        });
      });

      const rows: AssetLedgerRow[] = [];

      const accountIds = Array.from(
        new Set([
          ...Object.keys(openingDebitMap),
          ...Object.keys(openingCreditMap),
          ...Object.keys(periodEntries),
        ])
      );

      accountIds.forEach(accountId => {
        const account = assetAccounts.find(a => String(a.id) === String(accountId));
        if (!account) return;

        const normalSide = getAssetNormalBalanceSide(account.account_type);
        const openingDebit = openingDebitMap[accountId] || 0;
        const openingCredit = openingCreditMap[accountId] || 0;

        let openingBalance = 0;
        if (normalSide === "debit") {
          openingBalance = openingDebit - openingCredit;
        } else {
          openingBalance = openingCredit - openingDebit;
        }

        const entriesForAccount = periodEntries[accountId] || [];

        if (openingBalance === 0 && entriesForAccount.length === 0) {
          return;
        }

        let runningBalance = openingBalance;

        rows.push({
          id: `ob-${accountId}`,
          accountId: String(accountId),
          accountCode: account.account_code,
          accountName: account.account_name,
          date: ledgerFromDate,
          reference: "OB",
          description: "Opening Balance",
          debit: 0,
          credit: 0,
          balanceLabel: formatAssetLedgerBalance(openingBalance, normalSide),
        });

        const sortedEntries = [...entriesForAccount].sort((a, b) => {
          const da = new Date(a.date).getTime();
          const db = new Date(b.date).getTime();
          if (da !== db) return da - db;
          if (a.reference !== b.reference) return (a.reference || "").localeCompare(b.reference || "");
          return String(a.id).localeCompare(String(b.id));
        });

        sortedEntries.forEach(entry => {
          if (normalSide === "debit") {
            runningBalance = runningBalance + entry.debit - entry.credit;
          } else {
            runningBalance = runningBalance - entry.debit + entry.credit;
          }

          rows.push({
            id: String(entry.id),
            accountId: String(accountId),
            accountCode: account.account_code,
            accountName: account.account_name,
            date: entry.date,
            reference: entry.reference,
            description: entry.description,
            debit: entry.debit,
            credit: entry.credit,
            balanceLabel: formatAssetLedgerBalance(runningBalance, normalSide),
          });
        });
      });

      rows.sort((a, b) => {
        if (a.accountCode !== b.accountCode) {
          return a.accountCode.localeCompare(b.accountCode);
        }
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        if (da !== db) return da - db;
        if (a.reference !== b.reference) return (a.reference || "").localeCompare(b.reference || "");
        return a.id.localeCompare(b.id);
      });

      setLedgerRows(rows);
    } catch (error: any) {
      console.error("Fixed assets ledger load error:", error);
      toast({
        title: "Failed to load asset ledger",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
      setLedgerRows([]);
    } finally {
      setLedgerLoading(false);
    }
  }, [assetAccounts, companyId, ledgerFromDate, ledgerToDate, toast]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(assets.map(a => a.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  useEffect(() => {
    if (assetAccounts.length > 0) {
      setFormData(prev => prev.asset_account_id ? prev : ({ ...prev, asset_account_id: assetAccounts[0].id }));
      setPurchaseForm(prev => prev.asset_account_id ? prev : ({
          ...prev,
          asset_account_id: assetAccounts[0].id,
          description: prev.description || assetAccounts[0].account_name
        }));
    }
  }, [assetAccounts]);
  
  useEffect(() => {
    if (loanAccounts.length > 0) {
       setFormData(prev => prev.loan_account_id ? prev : ({ ...prev, loan_account_id: loanAccounts[0].id }));
       setPurchaseForm(prev => prev.loan_account_id ? prev : ({ ...prev, loan_account_id: loanAccounts[0].id }));
    }
  }, [loanAccounts]);

  useEffect(() => {
    if (bankAccounts.length > 0) {
       setFormData(prev => prev.bank_account_id ? prev : ({ ...prev, bank_account_id: bankAccounts[0].id }));
       setPurchaseForm(prev => prev.bank_account_id ? prev : ({ ...prev, bank_account_id: bankAccounts[0].id }));
    }
  }, [bankAccounts]);



  useEffect(() => {
    const uid = user?.id ? String(user.id) : "anonymous";
    const key = `tutorial_shown_fixed_assets_${uid}`;
    const already = localStorage.getItem(key);
    if (!already) {
      setTutorialOpen(true);
      localStorage.setItem(key, "true");
    }
  }, [user]);

  useEffect(() => {
    if (!selectedAsset) return;
    const norm = String(selectedAsset.description || '').split('[')[0].trim().toLowerCase();
    const byName = assetAccounts.find(a => a.account_name.toLowerCase().includes(norm));
    const byToken = assetAccounts.find(a => {
      const n = a.account_name.toLowerCase();
      return ['fixed asset','equipment','vehicle','machinery','property','computer','office'].some(t => n.includes(t));
    });
    const byCode = assetAccounts.find(a => String(a.account_code || '').startsWith('15'));
    setDisposalData(prev => ({
      ...prev,
      asset_account_id: (byName?.id || byToken?.id || byCode?.id || prev.asset_account_id || ''),
      bank_account_id: (prev.bank_account_id || (bankAccounts[0]?.id || ''))
    }));
  }, [selectedAsset, assetAccounts, bankAccounts]);

  const handleEditOpeningClick = (asset: FixedAsset) => {
    setSelectedAsset(asset);
    setIsEditing(true);
    // Parse description to remove tags
    const cleanDesc = asset.description.replace(/\[opening\]/g, '').replace(/\[method:.*?\]/g, '').trim();
    // Extract method if possible
    const methodMatch = asset.description.match(/\[method:(.*?)\]/);
    const method = methodMatch ? methodMatch[1] : 'straight_line';
    
    setFormData({
      description: cleanDesc,
      cost: String(asset.cost),
      purchase_date: asset.purchase_date,
      useful_life_years: String(asset.useful_life_years),
      depreciation_method: method,
      asset_account_id: asset.asset_account_id || '',
      funding_source: "bank", 
      bank_account_id: "",
      loan_account_id: "",
      category: asset.category || "",
      location: asset.location || "",
      serial_number: asset.serial_number || "",
      bought_from: asset.bought_from || "",
    });
    setDialogOpen(true);
  };

  const createOpeningEntries = async (companyId: string, txId: string, description: string, nbv: number, date: string, assetAccId: string) => {
    const { data: coas } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);
    const lower = (coas || []).map((a: any) => ({ id: String(a.id), account_code: String(a.account_code||''), account_name: String(a.account_name||'').toLowerCase(), account_type: String(a.account_type||'').toLowerCase() }));
    const ensureEquity = async (name: string, code: string) => {
      const found = lower.find(a => a.account_type === 'equity' && (a.account_name.includes(name.toLowerCase()) || a.account_code === code));
      if (found) return found.id;
      const { data: created } = await supabase
        .from('chart_of_accounts')
        .insert({ company_id: companyId, account_code: code, account_name: name, account_type: 'equity', is_active: true, normal_balance: 'credit' } as any)
        .select('id')
        .single();
      return String((created as any)?.id || '');
    };
    const equityId = await ensureEquity('Opening Equity', '3100');
    
    if (equityId && assetAccId) {
        const rows = [
          { transaction_id: txId, account_id: assetAccId, debit: nbv, credit: 0, description: `Opening PPE (NBV) - ${description}`, status: 'approved' },
          { transaction_id: txId, account_id: equityId, debit: 0, credit: nbv, description: `Opening Equity - ${description}`, status: 'approved' },
        ];
        await supabase.from('transaction_entries' as any).insert(rows as any);
        const ledgerRows = rows.map(e => ({ company_id: companyId, account_id: e.account_id, entry_date: date, description: e.description, debit: e.debit, credit: e.credit, reference_id: txId, transaction_id: txId }));
        await supabase.from('ledger_entries' as any).insert(ledgerRows as any);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const requiredFields = [
      formData.description,
      formData.category,
      formData.location,
      formData.serial_number,
      formData.bought_from,
      formData.cost,
      formData.purchase_date,
      formData.useful_life_years,
      formData.asset_account_id,
    ];

    if (requiredFields.some(v => !String(v || "").trim())) {
      toast({
        title: "Missing information",
        description: "Please fill in all fields before saving the opening asset.",
        variant: "destructive",
      });
      return;
    }

    if (isDateLocked(formData.purchase_date)) {
      setDialogOpen(false);
      setIsLockDialogOpen(true);
      return;
    }

    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }

    try {
      setIsSubmitting(true);
      setProgress(10);
      setProgressText(isEditing ? "Updating Asset..." : "Initializing Asset Posting...");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();
      
      if (profile?.company_id) {
         await validateTransactionDate(profile.company_id, formData.purchase_date);
      }

      const dep = calculateDepreciation(parseFloat(formData.cost), formData.purchase_date, parseInt(formData.useful_life_years));
      const description = `${formData.description} [opening] [method:${formData.depreciation_method}]`;
      const companyId = String((profile as any)?.company_id || '');
      const nbv = Number((parseFloat(formData.cost) - Number(dep.accumulatedDepreciation)).toFixed(2));

      if (isEditing && selectedAsset) {
         const { error } = await supabase.from("fixed_assets").update({
            description,
            cost: parseFloat(formData.cost),
            purchase_date: formData.purchase_date,
            useful_life_years: parseInt(formData.useful_life_years),
            accumulated_depreciation: Number(dep.accumulatedDepreciation.toFixed(2)),
            asset_account_id: formData.asset_account_id || null,
            category: formData.category,
            location: formData.location,
            serial_number: formData.serial_number,
            bought_from: formData.bought_from,
         }).eq('id', selectedAsset.id);
         if (error) throw error;

         // Attempt to update financial records
         const oldDescClean = selectedAsset.description.replace(/\[opening\]/g, '').replace(/\[method:.*?\]/g, '').trim();
         const oldTxDesc = `Opening Fixed Asset - ${oldDescClean}`;
         const { data: txs } = await supabase.from('transactions')
            .select('id')
            .eq('company_id', companyId)
            .eq('transaction_type', 'opening_balance')
            .ilike('description', oldTxDesc)
            .limit(1);
         
         if (txs && txs.length > 0) {
             const txId = txs[0].id;
             await supabase.from('transactions').update({
                 description: `Opening Fixed Asset - ${formData.description}`,
                 reference_number: `OPEN-FA-${formData.purchase_date}`,
                 total_amount: nbv,
                 transaction_date: formData.purchase_date
             }).eq('id', txId);

             await supabase.from('transaction_entries').delete().eq('transaction_id', txId);
             await supabase.from('ledger_entries').delete().eq('transaction_id', txId);
             
             if (nbv > 0) {
                 await createOpeningEntries(companyId, txId, formData.description, nbv, formData.purchase_date, formData.asset_account_id || '');
             }
         }
      } else {
          const { error } = await supabase.from("fixed_assets").insert({
            company_id: companyId,
            description,
            category: formData.category,
            location: formData.location,
            serial_number: formData.serial_number,
            bought_from: formData.bought_from,
            cost: parseFloat(formData.cost),
            purchase_date: formData.purchase_date,
            useful_life_years: parseInt(formData.useful_life_years),
            accumulated_depreciation: Number(dep.accumulatedDepreciation.toFixed(2)),
            status: "active",
            asset_account_id: formData.asset_account_id || null,
          } as any);
          if (error) throw error;

          setProgress(40);
          setProgressText("Posting to Ledger...");
          await new Promise(r => setTimeout(r, 800));

          if (nbv > 0 && companyId) {
            const { data: tx } = await supabase
                .from('transactions' as any)
                .insert({ company_id: companyId, user_id: user!.id, transaction_date: formData.purchase_date, description: `Opening Fixed Asset - ${formData.description}`, reference_number: `OPEN-FA-${formData.purchase_date}`, total_amount: nbv, transaction_type: 'opening_balance', status: 'posted' } as any)
                .select('id')
                .single();
            const txId = (tx as any)?.id;
            if (txId) {
                await createOpeningEntries(companyId, txId, formData.description, nbv, formData.purchase_date, formData.asset_account_id || '');
            }
          }
      }

      try { await supabase.rpc('refresh_afs_cache', { _company_id: companyId }); } catch {}
      
      setProgress(100);
      setProgressText("Finalizing...");
      await new Promise(r => setTimeout(r, 600));

      setSuccessMessage(isEditing ? "Opening asset updated successfully" : "Opening asset added successfully");
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setIsSubmitting(false);
        setFormData({ description: "", cost: "", purchase_date: "", useful_life_years: "5", depreciation_method: "straight_line", asset_account_id: formData.asset_account_id, funding_source: "bank", bank_account_id: "", loan_account_id: "" });
        refresh(true);
        setDialogOpen(false);
        setIsEditing(false);
      }, 2000);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setIsSubmitting(false);
    }
  };

  const isOpeningAsset = (asset: FixedAsset) => {
    return String(asset.description || '').toLowerCase().includes('[opening]');
  };

  const openingTotal = assets
    .filter((a) => isOpeningAsset(a) && String(a.status || 'active').toLowerCase() !== 'disposed')
    .reduce((sum, a) => sum + Math.max(0, calculateNetBookValue(a)), 0);

  const duringYearTotal = assets
    .filter((a) => !isOpeningAsset(a) && String(a.status || 'active').toLowerCase() !== 'disposed')
    .reduce((sum, a) => sum + Math.max(0, calculateNetBookValue(a)), 0);

  const handleDispose = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isDateLocked(disposalData.disposal_date)) {
      setDisposalDialogOpen(false);
      setIsLockDialogOpen(true);
      return;
    }

    if (!selectedAsset) return;
    const nbv = calculateNetBookValue(selectedAsset);
    const disposalAmount = parseFloat(disposalData.disposal_amount);
    if (disposalAmount > nbv) {
      if (!confirm(`Disposal amount (R ${disposalAmount.toLocaleString()}) exceeds Net Book Value (R ${nbv.toLocaleString()}). This will result in a gain. Continue?`)) {
        return;
      }
    }
    let bankLedgerId = '';
    setDisposalDialogOpen(false);
    try {
      setIsSubmitting(true);
      setProgress(10);
      setProgressText("Processing Disposal...");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();
      if (!profile?.company_id) throw new Error("Company not found");
      const companyId = profile.company_id as string;
      
      await validateTransactionDate(companyId, disposalData.disposal_date);

      const { data: coas } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true);

      if (disposalData.bank_account_id) {
          const { data: bankEntity } = await supabase.from('bank_accounts').select('account_name').eq('id', disposalData.bank_account_id).single();
          if (bankEntity) {
              const lower = (coas || []).map((a: any) => ({ id: String(a.id), type: String(a.account_type||'').toLowerCase(), name: String(a.account_name||'').toLowerCase(), code: String(a.account_code||'') }));
              const targetName = `bank - ${bankEntity.account_name}`.toLowerCase();
              const found = lower.find(a => a.name === targetName);
              if (found) {
                  bankLedgerId = found.id;
              } else {
                  const generic = lower.find(a => a.type === 'asset' && (a.name.includes(bankEntity.account_name.toLowerCase()) || a.name.includes('bank')));
                  bankLedgerId = generic?.id || '';
              }
          }
      } else {
          const bankCoa = (coas || []).find((a: any) => String(a.account_type||'').toLowerCase()==='asset' && (String(a.account_name||'').toLowerCase().includes('bank') || String(a.account_code||'')==='1100'));
          bankLedgerId = String(bankCoa?.id || '');
      }

      const description = `Asset Disposal - ${selectedAsset.description}`;
      const proceeds = disposalAmount || 0;
      const cost = Number(selectedAsset.cost || 0);
      const accum = Number(selectedAsset.accumulated_depreciation || 0);

      const { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          company_id: companyId,
          user_id: user!.id,
          transaction_date: disposalData.disposal_date,
          description,
          reference_number: null,
          total_amount: proceeds,
          bank_account_id: (disposalData.bank_account_id && bankAccounts.some(b => b.id === disposalData.bank_account_id)) ? disposalData.bank_account_id : null,
          transaction_type: 'asset_disposal',
          status: 'pending'
        } as any)
        .select('id')
        .single();
      if (txError) throw txError;

      const accDepAccount = (coas || []).find((a: any) => String(a.account_type||'').toLowerCase()==='asset' && (String(a.account_name||'').toLowerCase().includes('accumulated') || String(a.account_name||'').toLowerCase().includes('depreciation')));
      const assetAccId = disposalData.asset_account_id || '';

      const lower = (coas || []).map((a: any) => ({ id: String(a.id), account_type: String(a.account_type||'').toLowerCase(), account_name: String(a.account_name||'').toLowerCase(), account_code: String(a.account_code||'') }));
      const ensureAccount = async (type: 'revenue' | 'expense', name: string, code: string) => {
        const found = lower.find(a => a.account_type === type && (a.account_name.includes(name.toLowerCase()) || a.account_code === code));
        if (found) return found.id;
        const { data: created } = await supabase
          .from('chart_of_accounts')
          .insert({ company_id: companyId, account_code: code, account_name: name, account_type: type, is_active: true, normal_balance: type === 'revenue' ? 'credit' : 'debit' } as any)
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

      const entries: any[] = [];
      if (bankLedgerId && proceeds > 0) {
        entries.push({ transaction_id: tx.id, account_id: bankLedgerId, debit: proceeds, credit: 0, description, status: 'approved' });
      }
      if (accDepAccount && accum > 0) {
        entries.push({ transaction_id: tx.id, account_id: String((accDepAccount as any).id), debit: accum, credit: 0, description: 'Derecognize Accumulated Depreciation', status: 'approved' });
      }
      if (assetAccId && cost > 0) {
        entries.push({ transaction_id: tx.id, account_id: assetAccId, debit: 0, credit: cost, description: 'Derecognize Asset Cost', status: 'approved' });
      }
      if (gainLoss > 0 && gainAccId) {
        entries.push({ transaction_id: tx.id, account_id: gainAccId, debit: 0, credit: gainLoss, description: 'Gain on Asset Disposal', status: 'approved' });
      } else if (gainLoss < 0 && lossAccId) {
        entries.push({ transaction_id: tx.id, account_id: lossAccId, debit: Math.abs(gainLoss), credit: 0, description: 'Loss on Asset Disposal', status: 'approved' });
      }

      const { error: entErr } = await supabase.from('transaction_entries').insert(entries as any);
      if (entErr) throw entErr;

      const totalDebits = entries.reduce((s, e) => s + (Number(e.debit) || 0), 0);
      const totalCredits = entries.reduce((s, e) => s + (Number(e.credit) || 0), 0);
      if (Number(totalDebits.toFixed(2)) !== Number(totalCredits.toFixed(2))) {
        throw new Error('Unbalanced disposal entries');
      }

      await supabase.from('ledger_entries').delete().eq('reference_id', tx.id);
      const ledgerRows = entries.map(e => ({
        company_id: companyId,
        account_id: e.account_id,
        entry_date: disposalData.disposal_date,
        description: e.description || description,
        debit: e.debit,
        credit: e.credit,
        reference_id: tx.id,
        transaction_id: tx.id
      }));
      const { error: ledErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
      if (ledErr) throw ledErr;

      setProgress(60);
      setProgressText("Updating Asset Status...");
      await new Promise(r => setTimeout(r, 600));

      await supabase.from('transactions').update({ status: 'approved' }).eq('id', tx.id);
      await supabase.from('transaction_entries').update({ status: 'approved' }).eq('transaction_id', tx.id);

      if (disposalData.bank_account_id) {
        try { await supabase.rpc('update_bank_balance', { _bank_account_id: disposalData.bank_account_id, _amount: proceeds, _operation: 'add' }); } catch {}
      }

      await supabase
        .from('fixed_assets')
        .update({ status: 'disposed', disposal_date: disposalData.disposal_date })
        .eq('id', selectedAsset.id);

      try { await supabase.rpc('refresh_afs_cache', { _company_id: companyId }); } catch {}

      setProgress(100);
      setProgressText("Disposal Complete...");
      await new Promise(r => setTimeout(r, 600));

      setSuccessMessage('Asset disposal posted successfully');
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setIsSubmitting(false);
        setSelectedAsset(null);
        setDisposalData({ 
          disposal_date: new Date().toISOString().split('T')[0], 
          disposal_amount: '', 
          asset_account_id: disposalData.asset_account_id || '', 
          bank_account_id: disposalData.bank_account_id || '',
          reason: '',
          file: null as any
        });
        refresh(true);
      }, 2000);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setIsSubmitting(false);
      setDisposalDialogOpen(true);
    }
  };

  const exportAssets = () => {
    const ws = XLSX.utils.json_to_sheet(assets.map(a => ({
      Description: a.description,
      'Purchase Date': a.purchase_date,
      'Cost': a.cost,
      'Useful Life': a.useful_life_years,
      'Accumulated Depreciation': a.accumulated_depreciation,
      'Net Book Value': calculateNetBookValue(a),
      'Status': a.status
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fixed Assets");
    XLSX.writeFile(wb, "fixed_assets_register.xlsx");
  };

  const canEdit = isAdmin || isAccountant;

  return (
    <>
      <div className="space-y-8">


        {isSuccess && (
          <Alert className="bg-emerald-50 border-emerald-200 animate-in fade-in slide-in-from-top-2">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <AlertTitle className="text-emerald-800">Success</AlertTitle>
            <AlertDescription className="text-emerald-700">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}



        <div className="space-y-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
               <h2 className="text-2xl font-semibold tracking-tight">List of Assets</h2>
               <div className="flex gap-2">
                  {canEdit && isManagementMode && (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button className="bg-primary hover:bg-primary/90">
                            <Plus className="mr-2 h-4 w-4" /> Add Asset
                            <ChevronDown className="ml-1 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Add Asset</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setPurchaseDialogOpen(true);
                            }}
                          >
                            New Asset
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setIsEditing(false);
                              setFormData({
                                description: "",
                                cost: "",
                                purchase_date: "",
                                useful_life_years: "5",
                                depreciation_method: "straight_line",
                                asset_account_id: "",
                                funding_source: "bank",
                                bank_account_id: "",
                                loan_account_id: "",
                                category: "",
                                location: "",
                                serial_number: "",
                                bought_from: "",
                              });
                              setDialogOpen(true);
                            }}
                          >
                            Opening Asset
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button variant="outline">
                         <Upload className="mr-2 h-4 w-4" /> Import Assets
                      </Button>
                    </>
                  )}
               </div>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-between gap-4 bg-muted/20 p-3 rounded-lg border">
               <div className="flex items-center gap-2 flex-1">
                  <div className="relative max-w-md w-full">
                     <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                     <Input 
                       placeholder="Search by description, serial number..." 
                       className="pl-8 bg-background" 
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                     />
                  </div>
               </div>
               <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                     <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline-block">View:</span>
                     <Select value={assetFilter} onValueChange={(v: any) => { setAssetFilter(v); setPage(0); }}>
                       <SelectTrigger className="w-[180px] bg-background">
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="all">All Assets</SelectItem>
                         <SelectItem value="opening">Opening Balances</SelectItem>
                         <SelectItem value="during">New Acquisitions</SelectItem>
                       </SelectContent>
                     </Select>
                  </div>
                  
                  <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="bg-background">
                           Quick Reports <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={exportAssets}>
                           <Download className="mr-2 h-4 w-4" /> Export to Excel
                        </DropdownMenuItem>
                        {isManagementMode && (
                          <DropdownMenuItem onClick={() => setDeprDialogOpen(true)}>
                             <Calculator className="mr-2 h-4 w-4" /> Depreciation Schedule
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setLedgerDialogOpen(true);
                            loadAssetLedger();
                          }}
                        >
                          <TrendingUp className="mr-2 h-4 w-4" /> General ledger (fixed assets)
                        </DropdownMenuItem>
                     </DropdownMenuContent>
                  </DropdownMenu>

                  {isManagementMode && (
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Menu className="h-4 w-4" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent>
                        <SheetHeader>
                          <SheetTitle>Asset Management</SheetTitle>
                          <SheetDescription>Additional actions.</SheetDescription>
                        </SheetHeader>
                        <div className="flex flex-col gap-4 mt-6">
                           <Button variant="outline" className="justify-start" onClick={() => setDialogOpen(true)}>
                             <Plus className="mr-2 h-4 w-4" /> Add Opening Balance
                           </Button>
                           <Button variant="outline" className="justify-start" onClick={() => setTutorialOpen(true)}>
                             <Info className="mr-2 h-4 w-4" /> Help & Tutorial
                           </Button>
                           {selectedIds.length > 0 && (
                              <Button variant="outline" className="justify-start text-destructive" onClick={() => setDeprDialogOpen(true)}>
                                 <AlertTriangle className="mr-2 h-4 w-4" /> Delete Selected
                              </Button>
                           )}
                        </div>
                      </SheetContent>
                    </Sheet>
                  )}
               </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border bg-white shadow-none">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : (
              <>
              <Table>
                <TableHeader className="bg-slate-700 border-b border-slate-800 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-none">
                    {isManagementMode && (
                      <TableHead className="w-[40px] pl-4 text-xs font-semibold text-white h-9 border-r border-slate-600">
                        <Checkbox 
                          checked={selectedIds.length === assets.length && assets.length > 0}
                          onCheckedChange={(checked) => handleSelectAll(!!checked)}
                          className="border-white data-[state=checked]:bg-white data-[state=checked]:text-[#2e2e2e]"
                        />
                      </TableHead>
                    )}
                    <TableHead
                      className="text-xs font-semibold text-white h-9 cursor-pointer select-none border-r border-slate-600"
                      onClick={() => handleSort('description')}
                    >
                      <div className="flex items-center gap-1">
                        Description {sortConfig?.key === 'description' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-xs font-semibold text-white h-9 cursor-pointer select-none border-r border-slate-600"
                      onClick={() => handleSort('category')}
                    >
                      <div className="flex items-center gap-1">
                        Category {sortConfig?.key === 'category' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-xs font-semibold text-white h-9 cursor-pointer select-none border-r border-slate-600"
                      onClick={() => handleSort('location')}
                    >
                      <div className="flex items-center gap-1">
                        Location {sortConfig?.key === 'location' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-xs font-semibold text-white h-9 cursor-pointer select-none border-r border-slate-600"
                      onClick={() => handleSort('purchase_date')}
                    >
                      <div className="flex items-center gap-1">
                        Purchase Date {sortConfig?.key === 'purchase_date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-xs font-semibold text-white h-9 cursor-pointer select-none border-r border-slate-600"
                      onClick={() => handleSort('serial_number')}
                    >
                      <div className="flex items-center gap-1">
                        Serial Number {sortConfig?.key === 'serial_number' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-xs font-semibold text-white h-9 cursor-pointer select-none border-r border-slate-600"
                      onClick={() => handleSort('bought_from')}
                    >
                      <div className="flex items-center gap-1">
                        Bought From {sortConfig?.key === 'bought_from' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-xs font-semibold text-white h-9 text-right cursor-pointer select-none border-r border-slate-600"
                      onClick={() => handleSort('cost')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Cost {sortConfig?.key === 'cost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-xs font-semibold text-white h-9 text-right cursor-pointer select-none border-r border-slate-600"
                      onClick={() => handleSort('accumulated_depreciation')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Acc. Depr {sortConfig?.key === 'accumulated_depreciation' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </TableHead>
                    <TableHead
                      className="text-xs font-semibold text-white h-9 text-right cursor-pointer select-none border-r border-slate-600"
                      onClick={() => handleSort('net_book_value')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Net Book Value {sortConfig?.key === 'net_book_value' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                      </div>
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-9 border-r border-slate-600">
                      Status
                    </TableHead>
                    {isManagementMode && (
                      <TableHead className="text-xs font-semibold text-white h-9 border-r border-slate-600">
                        Depreciation Update
                      </TableHead>
                    )}
                    {isManagementMode && (
                      <TableHead className="w-[100px] text-xs font-semibold text-white h-9 text-right pr-4">
                        Actions
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const filtered = assets.filter(a => {
                      if (searchQuery) {
                        const query = searchQuery.toLowerCase();
                        const match = 
                          a.description.toLowerCase().includes(query) ||
                          (a.category || '').toLowerCase().includes(query) ||
                          (a.location || '').toLowerCase().includes(query) ||
                          (a.serial_number || '').toLowerCase().includes(query) ||
                          (a.bought_from || '').toLowerCase().includes(query);
                        if (!match) return false;
                      }
                      if (assetFilter === 'opening') return isOpeningAsset(a);
                      if (assetFilter === 'during') return !isOpeningAsset(a);
                      return true;
                    });

                    const sorted = [...filtered].sort((a, b) => {
                      if (!sortConfig) return 0;
                      const { key, direction } = sortConfig;
                      let aVal: any = a[key as keyof FixedAsset];
                      let bVal: any = b[key as keyof FixedAsset];
                      
                      if (key === 'net_book_value') {
                        aVal = calculateNetBookValue(a);
                        bVal = calculateNetBookValue(b);
                      } else if (key === 'cost' || key === 'accumulated_depreciation') {
                        aVal = Number(aVal || 0);
                        bVal = Number(bVal || 0);
                      } else {
                         aVal = String(aVal || '').toLowerCase();
                         bVal = String(bVal || '').toLowerCase();
                      }

                      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
                      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
                      return 0;
                    });

                    if (sorted.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={isManagementMode ? 13 : 10} className="h-24 text-center">
                            No assets found.
                          </TableCell>
                        </TableRow>
                      );
                    }
                    const paginated = sorted.slice(page * pageSize, (page + 1) * pageSize);
                    return paginated.map((asset, index) => (
                      <TableRow 
                        key={asset.id} 
                        className={cn(
                          "h-8 hover:bg-muted/50 data-[state=selected]:bg-muted",
                          index % 2 === 0 ? "bg-white" : "bg-slate-100",
                          String(asset.status || 'active').toLowerCase() === 'disposed' ? 'opacity-60' : ''
                        )}
                        data-state={selectedIds.includes(asset.id) ? "selected" : ""}
                      >
                        {isManagementMode && (
                          <TableCell className="pl-4 py-1">
                            <Checkbox 
                              checked={selectedIds.includes(asset.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedIds([...selectedIds, asset.id]);
                                } else {
                                  setSelectedIds(selectedIds.filter(id => id !== asset.id));
                                }
                              }}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium py-1">
                          {asset.description}
                          {isOpeningAsset(asset) && <span className="ml-2 text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Opening</span>}
                        </TableCell>
                        <TableCell className="py-1">{asset.category || '-'}</TableCell>
                        <TableCell className="py-1">{asset.location || '-'}</TableCell>
                        <TableCell className="py-1">{new Date(asset.purchase_date).toLocaleDateString()}</TableCell>
                        <TableCell className="py-1">{asset.serial_number || '-'}</TableCell>
                        <TableCell className="py-1">{asset.bought_from || '-'}</TableCell>
                        <TableCell className="text-right py-1">R {Number(asset.cost).toLocaleString()}</TableCell>
                        <TableCell className="text-right py-1">R {Number(asset.accumulated_depreciation).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold text-primary py-1">R {calculateNetBookValue(asset).toLocaleString()}</TableCell>
                        <TableCell className="py-1">
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "rounded-full font-medium text-[11px] px-2.5 py-0.5 h-6 border",
                              String(asset.status || 'active').toLowerCase() === 'active' 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                : "bg-gray-50 text-gray-600 border-gray-200"
                            )}
                          >
                            {asset.status}
                          </Badge>
                        </TableCell>
                        {isManagementMode && (
                           <TableCell className="py-1">
                               {asset.accumulated_depreciation > 0 ? (
                                   <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
                                       Updated: R {Number(asset.accumulated_depreciation).toLocaleString()}
                                   </Badge>
                               ) : (
                                   <Badge variant="outline" className="text-muted-foreground whitespace-nowrap">
                                       No Depreciation
                                   </Badge>
                               )}
                           </TableCell>
                        )}
                        {isManagementMode && (
                          <TableCell className="text-right pr-4 py-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedAsset(asset);
                                    setDetailsDialogOpen(true);
                                  }}
                                >
                                  View Details
                                </DropdownMenuItem>
                                {asset.status === 'active' && canEdit && isManagementMode && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        const annualDep = Number(asset.cost || 0) / Number(asset.useful_life_years || 1);
                                        const monthly = annualDep / 12;
                                        toast({
                                          title: `Monthly Depreciation: ${asset.description}`,
                                          description: (
                                            <div className="space-y-1">
                                              <div>Cost: R {Number(asset.cost).toLocaleString()}</div>
                                              <div>Useful Life: {asset.useful_life_years} years</div>
                                              <div>Monthly Depr: R {monthly.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                              <div>Acc. Depr: R {Number(asset.accumulated_depreciation).toLocaleString()}</div>
                                              <div className="font-bold border-t pt-1 mt-1">Net Book Value: R {(Number(asset.cost) - Number(asset.accumulated_depreciation)).toLocaleString()}</div>
                                            </div>
                                          ),
                                          duration: 8000
                                        });
                                      }}
                                    >
                                      Check Monthly Depr.
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedIds([asset.id]);
                                        setDeprDialogOpen(true);
                                      }}
                                    >
                                      Post Monthly Depr.
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        setSelectedAsset(asset);
                                        const byName = assetAccounts.find(a => a.account_name.toLowerCase().includes((asset.description || '').toLowerCase()));
                                        setDisposalData(prev => ({
                                          ...prev,
                                          asset_account_id: (byName?.id || prev.asset_account_id || ''),
                                          bank_account_id: (prev.bank_account_id || (bankAccounts[0]?.id || ''))
                                        }));
                                        setDisposalDialogOpen(true);
                                      }}
                                    >
                                      Dispose Asset
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between p-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Page {page + 1} of {Math.max(1, Math.ceil((assets.filter(a => assetFilter === 'all' ? true : assetFilter === 'opening' ? isOpeningAsset(a) : !isOpeningAsset(a)).length) / pageSize))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={(page + 1) >= Math.ceil((assets.filter(a => assetFilter === 'all' ? true : assetFilter === 'opening' ? isOpeningAsset(a) : !isOpeningAsset(a)).length) / pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
                </>
              )}
            </div>
        </div>

          <Dialog open={ledgerDialogOpen} onOpenChange={(open) => {
            setLedgerDialogOpen(open);
            if (open) {
              loadAssetLedger();
            }
          }}>
            <DialogContent className="sm:max-w-5xl max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Fixed Assets General Ledger</DialogTitle>
                <DialogDescription>
                  Ledger entries for fixed asset accounts with a date filter.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">From</span>
                  <Input
                    type="date"
                    value={ledgerFromDate}
                    onChange={(e) => setLedgerFromDate(e.target.value)}
                    className="h-8 w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={ledgerToDate}
                    onChange={(e) => setLedgerToDate(e.target.value)}
                    className="h-8 w-40"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadAssetLedger}
                  disabled={ledgerLoading}
                >
                  {ledgerLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Apply
                </Button>
                <div className="text-xs text-muted-foreground ml-auto">
                  Period:{" "}
                  {ledgerFromDate
                    ? format(new Date(ledgerFromDate), "dd/MM/yyyy")
                    : "-"}{" "}
                  to{" "}
                  {ledgerToDate ? format(new Date(ledgerToDate), "dd/MM/yyyy") : "-"}
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                {ledgerLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Loading ledger...
                  </div>
                ) : ledgerRows.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No ledger entries for this period.
                  </div>
                ) : (
                  <div className="border rounded-md overflow-auto bg-white">
                    <Table>
                      <TableHeader className="bg-slate-700 border-b border-slate-800">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="text-xs font-semibold text-white h-8 min-w-[110px] border-r border-slate-600 pl-3">
                            Account Code
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-8 min-w-[160px] border-r border-slate-600">
                            Account
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-8 min-w-[110px] border-r border-slate-600">
                            Date
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-8 min-w-[70px] border-r border-slate-600">
                            Ref
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-8 border-r border-slate-600">
                            Description
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[110px] border-r border-slate-600">
                            Debit
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[110px] border-r border-slate-600">
                            Credit
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[120px] pr-3">
                            Balance
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledgerRows.map((row, index) => (
                          <TableRow
                            key={row.id}
                            className={cn(
                              "h-8 border-b border-border/40",
                              index % 2 === 0 ? "bg-white" : "bg-slate-100"
                            )}
                          >
                            <TableCell className="py-0.5 text-[11px] font-mono pl-3 border-r border-border/40">
                              {row.accountCode}
                            </TableCell>
                            <TableCell className="py-0.5 text-[11px] border-r border-border/40">
                              {row.accountName}
                            </TableCell>
                            <TableCell className="py-0.5 text-[11px] border-r border-border/40">
                              {format(new Date(row.date), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell className="py-0.5 text-[11px] border-r border-border/40">
                              {row.reference}
                            </TableCell>
                            <TableCell className="py-0.5 text-[11px] border-r border-border/40">
                              {row.description}
                            </TableCell>
                            <TableCell className="py-0.5 text-[11px] text-right font-mono border-r border-border/40">
                              {row.debit ? row.debit.toFixed(2) : ""}
                            </TableCell>
                            <TableCell className="py-0.5 text-[11px] text-right font-mono border-r border-border/40">
                              {row.credit ? row.credit.toFixed(2) : ""}
                            </TableCell>
                            <TableCell className="py-0.5 text-[11px] text-right font-mono pr-3">
                              {row.balanceLabel}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
            <DialogContent className="sm:max-w-[560px] p-4">
              <DialogHeader>
                <DialogTitle>Fixed Assets Tutorial</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>This module is for viewing the assets register and tracking book values.</p>
                <p>To add or purchase new assets, use the Transaction form under Transactions.</p>
                <p>To add existing opening assets, use the Add Opening Asset button in this module.</p>
                <p>To post monthly depreciation, use the Post Monthly Depreciation button. Depreciation reduces book value and appears in reports.</p>
                <p>To dispose assets, use the dispose action; proceeds post to Bank, and the system records gain or loss automatically.</p>
              </div>
              <DialogFooter>
                <Button onClick={() => setTutorialOpen(false)}>Got it</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
            <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <Package className="h-5 w-5 text-primary" />
                  Purchase Fixed Asset
                </DialogTitle>
                <DialogDescription>
                  Record a new asset purchase. This will create the asset record and post the necessary financial transactions.
                </DialogDescription>
              </DialogHeader>

              <form id="purchase-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  
                  if (isDateLocked(purchaseForm.purchase_date)) {
                    setPurchaseDialogOpen(false);
                    setIsLockDialogOpen(true);
                    return;
                  }

                  try {
                    const requiredDetails = [
                      purchaseForm.description,
                      purchaseForm.category,
                      purchaseForm.location,
                      purchaseForm.serial_number,
                      purchaseForm.bought_from,
                      purchaseForm.purchase_date,
                      purchaseForm.useful_life_years,
                    ];
                    if (requiredDetails.some(v => !String(v || "").trim())) {
                      throw new Error("Please fill in all fields in the asset details section.");
                    }

                    setIsSubmitting(true);
                    setProgress(10);
                    setProgressText("Processing Purchase...");

                    const { data: profile } = await supabase
                      .from("profiles")
                      .select("company_id")
                      .eq("user_id", user?.id)
                      .single();
                    if (!profile?.company_id) throw new Error("Company not found");
                    const companyId = profile.company_id as string;

                    const amt = Number(purchaseForm.amount || 0);
                    if (!amt || amt <= 0) throw new Error("Invalid amount");
                    if (!purchaseForm.asset_account_id) throw new Error("Select fixed asset account");
                    if (purchaseForm.funding_source === 'bank' && !purchaseForm.bank_account_id) throw new Error("Select bank account");
                    if (purchaseForm.funding_source === 'loan' && !purchaseForm.loan_account_id) throw new Error("Select loan account");
                    const isVat = String(purchaseForm.vat_applicable || 'no') === 'yes';
                    const vatRate = isVat ? 15 : 0;
                    const subtotal = isVat ? Number((amt / 1.15).toFixed(2)) : amt;
                    const taxAmount = isVat ? Number((amt - subtotal).toFixed(2)) : 0;

                    const { data: coas } = await supabase
                      .from("chart_of_accounts")
                      .select("id, account_code, account_name, account_type, is_active")
                      .eq("company_id", companyId)
                      .eq("is_active", true);

                    let bankLedgerId = '';
                    let vatInputId: string | null = null;
                    if (coas && coas.length > 0) {
                      const lower = coas.map((a: any) => ({ id: String(a.id), type: String(a.account_type||'').toLowerCase(), name: String(a.account_name||'').toLowerCase(), code: String(a.account_code||'') }));
                      
                      if (purchaseForm.funding_source === 'bank' && purchaseForm.bank_account_id) {
                          // Fetch bank entity name to find matching GL account
                          const { data: bankEntity } = await supabase.from('bank_accounts').select('account_name').eq('id', purchaseForm.bank_account_id).single();
                          if (bankEntity) {
                              const targetName = `bank - ${bankEntity.account_name}`.toLowerCase();
                              const found = lower.find(a => a.name === targetName);
                              if (found) {
                                  bankLedgerId = found.id;
                              } else {
                                  // Fallback
                                  const generic = lower.find(a => a.type === 'asset' && (a.name.includes(bankEntity.account_name.toLowerCase()) || a.name.includes('bank')));
                                  bankLedgerId = generic?.id || '';
                              }
                          }
                      }

                      const vatIn = lower.find(a => a.type === 'liability' && (a.code === '2110' || a.code === '2210' || a.name.includes('vat input') || a.name.includes('vat receivable') || a.name.includes('input tax')));
                      vatInputId = vatIn ? String(vatIn.id) : null;
                    }
                    if (!vatInputId && taxAmount > 0) {
                      try {
                        const { data: created } = await supabase
                          .from('chart_of_accounts')
                          .insert({ company_id: companyId, account_code: '2110', account_name: 'VAT Input', account_type: 'liability', is_active: true })
                          .select('id')
                          .single();
                        vatInputId = String((created as any)?.id || '');
                      } catch {}
                    }

                    const { data: tx, error: txErr } = await supabase
                      .from('transactions')
                      .insert({
                        company_id: companyId,
                        user_id: user!.id,
                        transaction_date: purchaseForm.purchase_date,
                        description: purchaseForm.description ? `Asset Purchase - ${purchaseForm.description}` : 'Asset Purchase',
                        reference_number: null,
                        total_amount: amt,
                        transaction_type: 'asset',
                        status: 'pending',
                        bank_account_id: purchaseForm.funding_source === 'bank' && purchaseForm.bank_account_id && bankAccounts.some(b => b.id === purchaseForm.bank_account_id) ? purchaseForm.bank_account_id : null,
                        vat_rate: vatRate > 0 ? vatRate : null,
                        vat_amount: taxAmount > 0 ? taxAmount : null,
                        vat_inclusive: true
                      } as any)
                      .select('id')
                      .single();
                    if (txErr) throw txErr;

                    const rows: Array<{ transaction_id: string; account_id: string; debit: number; credit: number; description: string; status: string }> = [];
                    rows.push({ transaction_id: tx.id, account_id: purchaseForm.asset_account_id, debit: subtotal, credit: 0, description: 'Fixed Asset', status: 'approved' });
                    if (taxAmount > 0 && vatInputId) {
                      rows.push({ transaction_id: tx.id, account_id: vatInputId, debit: taxAmount, credit: 0, description: 'VAT Input', status: 'approved' });
                    }
                    if (purchaseForm.funding_source === 'bank') {
                      if (!bankLedgerId) throw new Error('Bank ledger account missing');
                      rows.push({ transaction_id: tx.id, account_id: bankLedgerId, debit: 0, credit: amt, description: 'Bank', status: 'approved' });
                    } else if (purchaseForm.funding_source === 'loan') {
                      const loanAccId = purchaseForm.loan_account_id || '';
                      if (!loanAccId) throw new Error('Loan account required');
                      rows.push({ transaction_id: tx.id, account_id: loanAccId, debit: 0, credit: amt, description: 'Loan Payable', status: 'approved' });
                    }

                    const { error: teErr } = await supabase.from('transaction_entries').insert(rows as any);
                    if (teErr) throw teErr;

                    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: purchaseForm.purchase_date, is_reversed: false, transaction_id: tx.id, description: r.description }));
                    const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
                    if (leErr) throw leErr;

                    setProgress(50);
                    setProgressText("Posting to Ledger...");
                    await new Promise(r => setTimeout(r, 600));

                    await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id);
                    if (purchaseForm.funding_source === 'bank' && purchaseForm.bank_account_id) {
                      try { await supabase.rpc('update_bank_balance', { _bank_account_id: purchaseForm.bank_account_id, _amount: amt, _operation: 'subtract' }); } catch {}
                    }

                    if (purchaseForm.funding_source === 'loan') {
                      const irStr = String(purchaseForm.interest_rate || '').trim();
                      const termStr = String(purchaseForm.loan_term || '').trim();
                      if (!irStr || !termStr) throw new Error('Enter interest rate (%) and term (months)');
                      const interestRatePercent = parseFloat(irStr);
                      const interestRateDecimal = interestRatePercent / 100;
                      const termMonths = parseInt(termStr);
                      const monthlyRate = interestRateDecimal / 12;
                      const monthlyRepayment = monthlyRate === 0 ? amt / termMonths : (amt * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
                      const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
                      const rand = Math.random().toString(36).slice(2,8);
                      const refVal = `LN-${today}-${rand}`;
                      try {
                        await supabase
                          .from('loans')
                          .upsert({
                            company_id: companyId,
                            reference: refVal,
                            loan_type: purchaseForm.loan_term_type,
                            principal: amt,
                            interest_rate: interestRateDecimal,
                            start_date: purchaseForm.purchase_date,
                            term_months: termMonths,
                            monthly_repayment: monthlyRepayment,
                            status: 'active',
                            outstanding_balance: amt
                          } as any, { onConflict: 'company_id,reference' });
                      } catch {}
                    }

                    const { error: faErr } = await supabase.from('fixed_assets').insert({
                      company_id: companyId,
                      description: purchaseForm.description,
                      category: purchaseForm.category,
                      location: purchaseForm.location,
                      serial_number: purchaseForm.serial_number,
                      bought_from: purchaseForm.bought_from,
                      cost: subtotal,
                      purchase_date: purchaseForm.purchase_date,
                      useful_life_years: parseInt(purchaseForm.useful_life_years || '5'),
                      accumulated_depreciation: 0,
                      status: 'active'
                    } as any);
                    if (faErr) throw faErr;

                    setProgress(100);
                    setProgressText("Finalizing...");
                    await new Promise(r => setTimeout(r, 600));

                    try { await supabase.rpc('refresh_afs_cache', { _company_id: companyId }); } catch {}
                    setSuccessMessage('Asset purchase posted successfully');
                    setIsSuccess(true);
                    setTimeout(() => {
                      setIsSuccess(false);
                      setIsSubmitting(false);
                      setPurchaseDialogOpen(false);
                      setPurchaseForm({
                        purchase_date: new Date().toISOString().split("T")[0],
                        amount: "",
                        asset_account_id: purchaseForm.asset_account_id || "",
                        funding_source: "bank",
                        bank_account_id: purchaseForm.bank_account_id || "",
                        loan_account_id: purchaseForm.loan_account_id || "",
                        interest_rate: "",
                        loan_term: "",
                        loan_term_type: "short",
                        vat_applicable: "no",
                        useful_life_years: purchaseForm.useful_life_years || "5",
                        depreciation_method: purchaseForm.depreciation_method || "straight_line",
                        description: "",
                        category: "",
                        location: "",
                        serial_number: "",
                        bought_from: ""
                      });
                      refresh(true);
                    }, 2000);
                  } catch (err: any) {
                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                    setIsSubmitting(false);
                  }
                }}
                className="space-y-6 mt-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Asset Details & Depreciation */}
                  <div className="space-y-6">
                    {/* Asset Details Section */}
                    <div className="space-y-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                        <Info className="h-4 w-4" /> Asset Details
                      </h3>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label>Description <span className="text-destructive">*</span></Label>
                          <Input 
                            className="h-9"
                            value={purchaseForm.description}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, description: e.target.value })}
                            placeholder="e.g., Office Equipment"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                           <div className="space-y-1">
                             <Label>Category</Label>
                             {(() => {
                               const purchaseCategoryValue = assetCategoryOptions.includes(purchaseForm.category)
                                 ? purchaseForm.category
                                 : purchaseForm.category
                                 ? "other"
                                 : "";
                               return (
                                 <>
                                   <Select
                                     value={purchaseCategoryValue}
                                     onValueChange={(val) => {
                                       if (val === "other") {
                                         setPurchaseForm({ ...purchaseForm, category: "" });
                                       } else {
                                         setPurchaseForm({ ...purchaseForm, category: val });
                                       }
                                     }}
                                   >
                                     <SelectTrigger className="h-9">
                                       <SelectValue placeholder="Select category" />
                                     </SelectTrigger>
                                     <SelectContent>
                                       {assetCategoryOptions.map((cat) => (
                                         <SelectItem key={cat} value={cat}>
                                           {cat}
                                         </SelectItem>
                                       ))}
                                       <SelectItem value="other">Other</SelectItem>
                                     </SelectContent>
                                   </Select>
                                   {purchaseCategoryValue === "other" && (
                                     <Input
                                       className="h-9 mt-2"
                                       value={purchaseForm.category}
                                       onChange={(e) =>
                                         setPurchaseForm({
                                           ...purchaseForm,
                                           category: e.target.value,
                                         })
                                       }
                                       placeholder="Type category"
                                       required
                                     />
                                   )}
                                 </>
                               );
                             })()}
                           </div>
                           <div className="space-y-1">
                             <Label>Location</Label>
                             <Input 
                               className="h-9"
                               value={purchaseForm.location}
                               onChange={(e) => setPurchaseForm({ ...purchaseForm, location: e.target.value })}
                               placeholder="e.g. Office 101"
                               required
                             />
                           </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                           <div className="space-y-1">
                             <Label>Serial Number</Label>
                             <Input 
                               className="h-9"
                               value={purchaseForm.serial_number}
                               onChange={(e) => setPurchaseForm({ ...purchaseForm, serial_number: e.target.value })}
                               placeholder="Optional"
                               required
                             />
                           </div>
                           <div className="space-y-1">
                             <Label>Bought From</Label>
                             <Input 
                               className="h-9"
                               value={purchaseForm.bought_from}
                               onChange={(e) => setPurchaseForm({ ...purchaseForm, bought_from: e.target.value })}
                               placeholder="Supplier Name"
                               required
                             />
                           </div>
                        </div>
                        <div className="space-y-1">
                          <Label>Asset Account (CoA) <span className="text-destructive">*</span></Label>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Select
                                value={purchaseForm.asset_account_id}
                                onValueChange={(val) => {
                                  const acc = assetAccounts.find((a) => a.id === val);
                                  setPurchaseForm(prev => ({
                                    ...prev,
                                    asset_account_id: val,
                                    description: acc?.account_name || prev.description
                                  }));
                                }}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Choose account" />
                                </SelectTrigger>
                                <SelectContent>
                                  {assetAccounts.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Depreciation Section */}
                    <div className="space-y-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                        <Calculator className="h-4 w-4" /> Depreciation
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Useful Life (Years)</Label>
                          <Input 
                            type="number" 
                            min="1" 
                            className="h-9"
                            value={purchaseForm.useful_life_years}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, useful_life_years: e.target.value })}
                            required 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Method</Label>
                          <Select
                            value={purchaseForm.depreciation_method}
                            onValueChange={(val) => setPurchaseForm({ ...purchaseForm, depreciation_method: val })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="straight_line">Straight Line</SelectItem>
                              <SelectItem value="diminishing_balance">Diminishing Balance</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Financial & Funding */}
                  <div className="space-y-6">
                    {/* Financial Details */}
                    <div className="space-y-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                        <Building2 className="h-4 w-4" /> Financial Details
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Date</Label>
                          <Input 
                            type="date" 
                            className="h-9"
                            value={purchaseForm.purchase_date}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })}
                            required 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Total Amount <span className="text-destructive">*</span></Label>
                          <div className="relative">
                            <span className="absolute left-2 top-2 text-muted-foreground text-sm">R</span>
                            <Input 
                              type="number" 
                              step="0.01" 
                              className="pl-6 h-9"
                              value={purchaseForm.amount}
                              onChange={(e) => setPurchaseForm({ ...purchaseForm, amount: e.target.value })}
                              required 
                            />
                          </div>
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label>VAT Applicable?</Label>
                          <Select
                            value={purchaseForm.vat_applicable}
                            onValueChange={(val) => setPurchaseForm({ ...purchaseForm, vat_applicable: val })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="no">No (Not Registered)</SelectItem>
                              <SelectItem value="yes">Yes (15% Included)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Funding Source */}
                    <div className="space-y-4">
                      <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                        <TrendingUp className="h-4 w-4" /> Funding
                      </h3>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label>Paid Via</Label>
                          <Select
                            value={purchaseForm.funding_source}
                            onValueChange={(val) => setPurchaseForm({ ...purchaseForm, funding_source: val })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bank">Bank Transfer / Cash</SelectItem>
                              <SelectItem value="loan">Loan / Finance</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {purchaseForm.funding_source === 'bank' && (
                          <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                            <Label>Bank Account <span className="text-destructive">*</span></Label>
                            <Select
                              value={purchaseForm.bank_account_id}
                              onValueChange={(val) => setPurchaseForm({ ...purchaseForm, bank_account_id: val })}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Select Bank" />
                              </SelectTrigger>
                              <SelectContent>
                                {bankAccounts.map(b => (
                                  <SelectItem key={b.id} value={b.id}>{b.account_name} ({b.bank_name})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {purchaseForm.funding_source === 'loan' && (
                          <div className="space-y-3 p-3 bg-muted/30 rounded-md animate-in fade-in slide-in-from-top-1 border">
                            <div className="space-y-1">
                              <Label>Loan Account (Liability) <span className="text-destructive">*</span></Label>
                              <Select
                                value={purchaseForm.loan_account_id}
                                onValueChange={(val) => setPurchaseForm({ ...purchaseForm, loan_account_id: val })}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select Loan Account" />
                                </SelectTrigger>
                                <SelectContent>
                                  {loanAccounts.map(l => (
                                    <SelectItem key={l.id} value={l.id}>{l.account_code} - {l.account_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Interest Rate (%)</Label>
                                <Input 
                                  type="number" 
                                  step="0.1" 
                                  className="h-8 text-xs"
                                  placeholder="e.g. 10.5"
                                  value={purchaseForm.interest_rate}
                                  onChange={(e) => setPurchaseForm({ ...purchaseForm, interest_rate: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Term (Months)</Label>
                                <Input 
                                  type="number" 
                                  className="h-8 text-xs"
                                  placeholder="e.g. 60"
                                  value={purchaseForm.loan_term}
                                  onChange={(e) => setPurchaseForm({ ...purchaseForm, loan_term: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className="pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setPurchaseDialogOpen(false)}>Cancel</Button>
                  <Button id="SaveAssetButton" type="submit" disabled={isSubmitting} className="bg-gradient-primary text-white">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Confirm Purchase
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setIsEditing(false);
                setFormData({
                  description: "",
                  cost: "",
                  purchase_date: "",
                  useful_life_years: "5",
                  depreciation_method: "straight_line",
                  asset_account_id: "",
                  funding_source: "bank",
                  bank_account_id: "",
                  loan_account_id: "",
                  category: "",
                  location: "",
                  serial_number: "",
                  bought_from: "",
                });
              }
            }}
          >
            <DialogContent className="sm:max-w-[850px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  {isEditing ? "Edit Opening Asset" : "Add Opening Asset"}
                </DialogTitle>
                <DialogDescription>
                  Add an asset that you already own (from previous years). This creates an opening balance entry without any bank or loan financing.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                      <Package className="h-4 w-4" /> Asset details
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="opening_description">Description</Label>
                        <Input
                          id="opening_description"
                          value={formData.description}
                          onChange={(e) =>
                            setFormData({ ...formData, description: e.target.value })
                          }
                          placeholder="e.g. Laptop, Vehicle, Machinery"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Category</Label>
                        {(() => {
                          const openingCategoryValue = assetCategoryOptions.includes(formData.category)
                            ? formData.category
                            : formData.category
                            ? "other"
                            : "";
                          return (
                            <>
                              <Select
                                value={openingCategoryValue}
                                onValueChange={(val) => {
                                  if (val === "other") {
                                    setFormData({ ...formData, category: "" });
                                  } else {
                                    setFormData({ ...formData, category: val });
                                  }
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {assetCategoryOptions.map((cat) => (
                                    <SelectItem key={cat} value={cat}>
                                      {cat}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              {openingCategoryValue === "other" && (
                                <Input
                                  className="mt-2"
                                  value={formData.category}
                                  onChange={(e) =>
                                    setFormData({
                                      ...formData,
                                      category: e.target.value,
                                    })
                                  }
                                  placeholder="Type category"
                                  required
                                />
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div className="space-y-1">
                        <Label>Location</Label>
                        <Input
                          value={formData.location}
                          onChange={(e) =>
                            setFormData({ ...formData, location: e.target.value })
                          }
                          placeholder="e.g. Office 101, Warehouse"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Serial number</Label>
                        <Input
                          value={formData.serial_number}
                          onChange={(e) =>
                            setFormData({ ...formData, serial_number: e.target.value })
                          }
                          placeholder="Optional"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Bought from</Label>
                        <Input
                          value={formData.bought_from}
                          onChange={(e) =>
                            setFormData({ ...formData, bought_from: e.target.value })
                          }
                          placeholder="Supplier name"
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                      <TrendingUp className="h-4 w-4" /> Value and useful life
                    </h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="opening_cost">Original cost</Label>
                        <Input
                          id="opening_cost"
                          type="number"
                          step="0.01"
                          value={formData.cost}
                          onChange={(e) =>
                            setFormData({ ...formData, cost: e.target.value })
                          }
                          placeholder="0.00"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="opening_purchase_date">Purchase date</Label>
                        <Input
                          id="opening_purchase_date"
                          type="date"
                          value={formData.purchase_date}
                          onChange={(e) =>
                            setFormData({ ...formData, purchase_date: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="opening_useful_life">Useful life (years)</Label>
                        <Input
                          id="opening_useful_life"
                          type="number"
                          value={formData.useful_life_years}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              useful_life_years: e.target.value,
                            })
                          }
                          placeholder="e.g. 5"
                          required
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Depreciation for opening assets is calculated from the purchase date using the selected useful life.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                    <Building2 className="h-4 w-4" /> Posting
                  </h3>
                  <div className="space-y-2">
                    <Label>Asset account</Label>
                    <Select
                      value={formData.asset_account_id}
                      onValueChange={(val) =>
                        setFormData({ ...formData, asset_account_id: val })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select asset account" />
                      </SelectTrigger>
                      <SelectContent>
                        {assetAccounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.account_code} - {acc.account_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This will post an opening balance directly to the asset account. No bank or loan accounts are used for opening assets.
                    </p>
                  </div>
                </div>

                <DialogFooter className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      "Save Opening Asset"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={disposalDialogOpen} onOpenChange={setDisposalDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Dispose Asset</DialogTitle>
                <DialogDescription>
                  Sell or write off an asset. This will calculate gain/loss and update the ledger.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleDispose} className="space-y-4">
                <div className="p-3 bg-muted rounded-md text-sm">
                  <div className="font-semibold">{selectedAsset?.description}</div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-muted-foreground">
                    <div>Cost: R {Number(selectedAsset?.cost).toLocaleString()}</div>
                    <div>NBV: R {calculateNetBookValue(selectedAsset).toLocaleString()}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Disposal Date</Label>
                    <Input
                      type="date"
                      value={disposalData.disposal_date}
                      onChange={(e) => setDisposalData({ ...disposalData, disposal_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Selling Price (Proceeds)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00 if scrapped"
                      value={disposalData.disposal_amount}
                      onChange={(e) => setDisposalData({ ...disposalData, disposal_amount: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Deposit to Bank Account</Label>
                  <Select
                    value={disposalData.bank_account_id}
                    onValueChange={(val) => setDisposalData({ ...disposalData, bank_account_id: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reason / Notes</Label>
                  <Textarea
                    placeholder="Optional notes..."
                    value={disposalData.reason}
                    onChange={(e) => setDisposalData({ ...disposalData, reason: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDisposalDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting} variant="destructive">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Confirm Disposal"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={deprDialogOpen} onOpenChange={setDeprDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Post Monthly Depreciation</DialogTitle>
                <DialogDescription>
                  This will calculate and post depreciation for {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'all active'} assets for the selected month.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Post up to Date</Label>
                  <Input 
                    type="date" 
                    value={deprDate} 
                    onChange={(e) => setDeprDate(e.target.value)} 
                  />
                  <p className="text-xs text-muted-foreground">
                    System will post depreciation for all months from purchase date up to this date that haven't been posted yet.
                  </p>
                </div>
                <Button
                  className="w-full bg-gradient-primary gap-2"
                  disabled={deprPosting}
                  onClick={async () => {
                    if (isDateLocked(deprDate)) {
                      setDeprDialogOpen(false);
                      setIsLockDialogOpen(true);
                      return;
                    }
                    setDeprDialogOpen(false);
                    try {
                      setDeprPosting(true);
                      setIsSubmitting(true);
                      setProgress(10);
                      setProgressText("Processing Bulk Depreciation...");

                      const { data: { user: authUser } } = await supabase.auth.getUser();
                      if (!authUser) throw new Error("Not authenticated");
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('company_id')
                        .eq('user_id', authUser.id)
                        .single();
                      const companyId = (profile as any)?.company_id;
                      if (!companyId) throw new Error("Company not found");
                      
                      const activeAssets = assets.filter(a => {
                        const isActive = String(a.status||'active').toLowerCase() !== 'disposed';
                        if (selectedIds.length > 0) {
                          return isActive && selectedIds.includes(a.id);
                        }
                        return isActive;
                      });

                      if (activeAssets.length === 0) {
                        toast({ title: 'No active assets', description: 'There are no assets to depreciate', variant: 'destructive' });
                        return;
                      }
                      const { data: coas } = await supabase
                        .from('chart_of_accounts')
                        .select('id, account_code, account_name, account_type, is_active')
                        .eq('company_id', companyId)
                        .eq('is_active', true);
                      const monthsToPost = (() => {
                        const starts = activeAssets.map(a => a.purchase_date).filter(Boolean);
                        const earliest = starts.length ? starts.sort()[0] : deprDate;
                        return monthStartsBetween(earliest, deprDate);
                      })();
                      const lower = (coas||[]).map((a:any)=>({ id: String(a.id), account_code: String(a.account_code||''), account_name: String(a.account_name||'').toLowerCase(), account_type: String(a.account_type||'').toLowerCase() }));
                      const findOrCreate = async (type: 'expense'|'asset', code: string, name: string) => {
                        const found = lower.find(a => a.account_type===type && (a.account_code===code || a.account_name.includes(name.toLowerCase())));
                        if (found) return found.id;
                        const { data: created } = await supabase
                          .from('chart_of_accounts')
                          .insert({ company_id: companyId, account_code: code, account_name: name, account_type: type, is_active: true })
                          .select('id')
                          .single();
                        return String((created as any)?.id || '');
                      };
                      const depExpenseId = await findOrCreate('expense','7400','Depreciation Expense');
                      const accumDepId = await findOrCreate('asset','1540','Accumulated Depreciation');
                      let monthsPosted = 0;
                      for (const a of activeAssets) {
                        const perAssetMonths = monthStartsBetween(a.purchase_date, deprDate);
                        const annualDep = Number(a.cost || 0) / Number(a.useful_life_years || 1);
                        const monthly = annualDep / 12;
                        for (const ms of perAssetMonths) {
                          const mStart = new Date(ms);
                          const mNext = new Date(ms);
                          mNext.setMonth(mNext.getMonth() + 1);
                          const mStartStr = mStart.toISOString().slice(0,10);
                          const mNextStr = mNext.toISOString().slice(0,10);
                          const description = `Depreciation - ${a.description}`;
                          const { data: dup } = await supabase
                            .from('transactions')
                            .select('id')
                            .eq('company_id', companyId)
                            .eq('transaction_type', 'depreciation')
                            .gte('transaction_date', mStartStr)
                            .lt('transaction_date', mNextStr)
                            .ilike('description', `%${description}%`);
                          if ((dup || []).length > 0) continue;
                          const remaining = Math.max(0, Number(a.cost||0) - Number(a.accumulated_depreciation||0));
                          const amt = Math.min(monthly, remaining);
                          if (!amt || amt <= 0) continue;
                          const { data: tx, error: txErr } = await supabase
                            .from('transactions')
                            .insert({
                              company_id: companyId,
                              user_id: authUser.id,
                              transaction_date: ms,
                              description,
                              reference_number: null,
                              total_amount: amt,
                              vat_rate: null,
                              vat_amount: null,
                              base_amount: amt,
                              vat_inclusive: false,
                              bank_account_id: null,
                              transaction_type: 'depreciation',
                              status: 'pending'
                            } as any)
                            .select('id')
                            .single();
                          if (txErr) throw txErr;
                          const entries = [
                            { transaction_id: tx.id, account_id: depExpenseId, debit: amt, credit: 0, description, status: 'approved' },
                            { transaction_id: tx.id, account_id: accumDepId, debit: 0, credit: amt, description, status: 'approved' }
                          ];
                          const { error: entErr } = await supabase.from('transaction_entries').insert(entries as any);
                          if (entErr) throw entErr;
                          const ledgerRows = entries.map(e => ({
                            company_id: companyId,
                            account_id: e.account_id,
                            entry_date: ms,
                            description: e.description,
                            debit: e.debit,
                            credit: e.credit,
                            reference_id: tx.id,
                            transaction_id: tx.id
                          }));
                          const { error: ledErr } = await supabase.from('ledger_entries').insert(ledgerRows as any);
                          if (ledErr) throw ledErr;
                          await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id);
                          const newAccum = Number(a.accumulated_depreciation || 0) + amt;
                          await updateAssetDepreciation(supabase, a.id, newAccum);
                          a.accumulated_depreciation = newAccum;
                          monthsPosted += 1;
                        }
                      }
                      try { await supabase.rpc('refresh_afs_cache', { _company_id: companyId }); } catch {}
                      
                      setProgress(100);
                      setProgressText("Finalizing...");
                      await new Promise(r => setTimeout(r, 600));

                      setSuccessMessage(`Backfilled ${monthsPosted} month(s)`);
                      setIsSuccess(true);
                      setTimeout(() => {
                        setIsSuccess(false);
                        setIsSubmitting(false);
                        setDeprSelectedAsset(null);
                        setDeprAmount('');
                        refresh(true);
                      }, 2000);
                    } catch (err:any) {
                      toast({ title: 'Failed to post depreciation', description: err.message, variant: 'destructive' });
                      setIsSubmitting(false);
                      setDeprDialogOpen(true);
                    } finally {
                      setDeprPosting(false);
                    }
                  }}
                >
                  {deprPosting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Posting…</>) : `Post Monthly Depreciation (${selectedIds.length > 0 ? 'Selected' : 'All'} Assets)`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>



        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Asset Details
              </DialogTitle>
              <DialogDescription>
                Comprehensive view of the selected asset.
              </DialogDescription>
            </DialogHeader>
            {selectedAsset && (
              <div className="space-y-4 py-2">
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <h4 className="font-semibold text-lg mb-1">{selectedAsset.description}</h4>
                  <p className="text-sm text-muted-foreground mb-3">{selectedAsset.status === 'active' ? 'Active Asset' : 'Disposed Asset'}</p>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div className="text-muted-foreground">Purchase Date</div>
                    <div className="font-medium text-right">{new Date(selectedAsset.purchase_date).toLocaleDateString()}</div>
                    
                    <div className="text-muted-foreground">Original Cost</div>
                    <div className="font-medium text-right">R {Number(selectedAsset.cost).toLocaleString()}</div>
                    
                    <div className="text-muted-foreground">Useful Life</div>
                    <div className="font-medium text-right">{selectedAsset.useful_life_years} years</div>
                    
                    <div className="text-muted-foreground">Monthly Depr.</div>
                    <div className="font-medium text-right">R {(Number(selectedAsset.cost || 0) / Number(selectedAsset.useful_life_years || 1) / 12).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    
                    <div className="text-muted-foreground">Accumulated Depr.</div>
                    <div className="font-medium text-right">R {Number(selectedAsset.accumulated_depreciation).toLocaleString()}</div>
                    
                    <div className="col-span-2 border-t pt-2 mt-1 flex justify-between items-center">
                      <span className="font-bold">Net Book Value</span>
                      <span className="font-bold text-lg text-primary">R {(Number(selectedAsset.cost) - Number(selectedAsset.accumulated_depreciation)).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
            </DialogFooter>
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
        
        <FinancialYearLockDialog 
          open={isLockDialogOpen} 
          onOpenChange={setIsLockDialogOpen} 
        />
    </>
  );
};
