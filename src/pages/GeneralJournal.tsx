import { useState, useEffect, Fragment } from "react";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageLoader } from "@/components/ui/loading-spinner";
import { ArrowLeft, RefreshCw, Download, FileSpreadsheet, FileText, Filter, Search, Lock, Paperclip, ChevronDown, ChevronUp, User, Calendar, Clock, Eye, RotateCcw, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportTransactionsToExcel, exportTransactionsToPDF, type ExportableTransaction } from "@/lib/export-utils";

interface JournalEntry {
  id: string;
  transaction_date: string;
  description: string;
  reference: string;
  status: string;
  source: string;
  transaction_type: string;
  created_at: string;
  updated_at: string;
  created_by_name: string;
  lines: JournalLine[];
  total_debit: number;
  total_credit: number;
  attachment_count: number;
}

interface JournalLine {
  id: string;
  account_name: string;
  account_code: string;
  description: string;
  debit: number;
  credit: number;
}

interface LedgerAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface LedgerRow {
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

const getNormalBalanceSide = (accountType: string): "debit" | "credit" => {
  const t = accountType.toLowerCase();
  if (t === "asset" || t === "expense") return "debit";
  return "credit";
};

const formatLedgerBalance = (amount: number, normalSide: "debit" | "credit") => {
  const abs = Math.abs(amount);
  if (abs === 0) return "0.00";
  if (normalSide === "debit") {
    return amount >= 0 ? `${abs.toFixed(2)} Dr` : `${abs.toFixed(2)} Cr`;
  }
  return amount >= 0 ? `${abs.toFixed(2)} Cr` : `${abs.toFixed(2)} Dr`;
};

const GeneralJournal = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "balanced" | "unbalanced">("all");
  const [hasAttachmentFilter, setHasAttachmentFilter] = useState<"all" | "with" | "without">("all");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [sortField, setSortField] = useState<"date" | "debit" | "credit" | "reference" | "source">("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<"journal" | "ledger">("ledger");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [ledgerMonth, setLedgerMonth] = useState(new Date().getMonth() + 1);
  const [ledgerYear, setLedgerYear] = useState(new Date().getFullYear());
  const [ledgerFromDate, setLedgerFromDate] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")
  );
  const [ledgerToDate, setLedgerToDate] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd")
  );
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [ledgerCodeFilter, setLedgerCodeFilter] = useState("");
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState("");

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSort = (field: "date" | "debit" | "credit" | "reference" | "source") => {
    setSortField(prevField => {
      if (prevField === field) {
        setSortDirection(prevDir => (prevDir === "asc" ? "desc" : "asc"));
        return prevField;
      }
      setSortDirection("asc");
      return field;
    });
  };

  useEffect(() => {
    const from = new Date(ledgerYear, ledgerMonth - 1, 1);
    const to = new Date(ledgerYear, ledgerMonth, 0);
    setLedgerFromDate(format(from, "yyyy-MM-dd"));
    setLedgerToDate(format(to, "yyyy-MM-dd"));
  }, [ledgerMonth, ledgerYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.company_id) {
        setLoading(false);
        return;
      }
      setCompanyId(profile.company_id);

      const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
      const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();

      // Fetch transactions with entries - Limit to 100 for performance stability during presentation
      console.log('Fetching transactions...');
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          id,
          transaction_date,
          description,
          reference_number,
          status,
          transaction_type,
          created_at,
          updated_at,
          user_id,
          transaction_entries (
            id,
            debit,
            credit,
            description,
            account:chart_of_accounts (
              account_name,
              account_code
            )
          )
        `)
        .eq('company_id', profile.company_id)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .order('transaction_date', { ascending: true })
        .limit(100);
      
      console.log('Transactions fetch result:', { dataCount: data?.length, error });

      if (error) throw error;

      const safeData = data || [];

      // Fetch user profiles for creator names
      const userIds = Array.from(new Set(safeData.map((tx: any) => tx.user_id).filter(Boolean)));
      let profileMap = new Map();
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', userIds);

        profiles?.forEach((p: any) => {
          profileMap.set(p.user_id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'System User');
        });
      }

      // Transform data
      const formattedEntries: JournalEntry[] = safeData.map((tx: any) => {
        const lines: JournalLine[] = (tx.transaction_entries || []).map((entry: any) => ({
          id: entry.id,
          account_name: entry.account?.account_name || 'Unknown Account',
          account_code: entry.account?.account_code || 'N/A',
          description: entry.description || tx.description,
          debit: Number(entry.debit || 0),
          credit: Number(entry.credit || 0),
        }));

        const total_debit = lines.reduce((sum, line) => sum + line.debit, 0);
        const total_credit = lines.reduce((sum, line) => sum + line.credit, 0);
        const attachment_count = 0;

        // Determine source from transaction_type or description context
        let source = 'Manual';
        if (tx.transaction_type) {
            source = tx.transaction_type.charAt(0).toUpperCase() + tx.transaction_type.slice(1);
        } else if (tx.description?.toLowerCase().includes('payroll')) {
            source = 'Payroll';
        } else if (tx.description?.toLowerCase().includes('invoice')) {
            source = 'Sales';
        } else if (tx.description?.toLowerCase().includes('bill')) {
            source = 'Purchases';
        }

        return {
          id: tx.id,
          transaction_date: tx.transaction_date,
          description: tx.description,
          reference: tx.reference_number || `TX-${tx.id.slice(0, 8)}`,
          status: tx.status || 'draft',
          source,
          transaction_type: tx.transaction_type || 'general',
          created_at: tx.created_at,
          updated_at: tx.updated_at,
          created_by_name: profileMap.get(tx.user_id) || 'System',
          lines,
          total_debit,
          total_credit,
          attachment_count
        };
      });

      setEntries(formattedEntries);
    } catch (error: any) {
      console.error("GeneralJournal load error:", error);
      toast({
        title: "Error loading journal",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  useEffect(() => {
    if (activeTab === "ledger") {
      fetchLedger();
    }
  }, [activeTab, ledgerMonth, ledgerYear]);

  const uniqueSources = Array.from(new Set(entries.map(e => e.source))).filter(Boolean).sort();
  const uniqueTypes = Array.from(new Set(entries.map(e => e.transaction_type))).filter(Boolean).sort();
  const uniqueUsers = Array.from(new Set(entries.map(e => e.created_by_name))).filter(Boolean).sort();

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = 
      entry.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.lines.some(line => 
        line.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        line.account_code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || entry.source === sourceFilter;
    const matchesType = typeFilter === 'all' || entry.transaction_type === typeFilter;
    const matchesUser = userFilter === 'all' || entry.created_by_name === userFilter;

    const entryDate = new Date(entry.transaction_date);
    const matchesDateFrom = !dateFrom || entryDate >= new Date(dateFrom);
    const matchesDateTo = !dateTo || entryDate <= new Date(dateTo);

    const amount = Math.max(entry.total_debit, entry.total_credit);
    const min = amountMin ? parseFloat(amountMin) : undefined;
    const max = amountMax ? parseFloat(amountMax) : undefined;
    const matchesAmountMin = min === undefined || amount >= min;
    const matchesAmountMax = max === undefined || amount <= max;

    const difference = Math.abs(entry.total_debit - entry.total_credit);
    const isBalanced = difference < 0.01;
    const matchesBalance =
      balanceFilter === "all" ||
      (balanceFilter === "balanced" && isBalanced) ||
      (balanceFilter === "unbalanced" && !isBalanced);

    const matchesAttachments =
      hasAttachmentFilter === "all" ||
      (hasAttachmentFilter === "with" && entry.attachment_count > 0) ||
      (hasAttachmentFilter === "without" && entry.attachment_count === 0);

    return (
      matchesSearch &&
      matchesStatus &&
      matchesSource &&
      matchesType &&
      matchesUser &&
      matchesDateFrom &&
      matchesDateTo &&
      matchesAmountMin &&
      matchesAmountMax &&
      matchesBalance &&
      matchesAttachments
    );
  });

  const sortedEntries = [...filteredEntries].sort((a, b) => {
    let cmp = 0;
    if (sortField === "date") {
      cmp = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
    } else if (sortField === "debit") {
      cmp = a.total_debit - b.total_debit;
    } else if (sortField === "credit") {
      cmp = a.total_credit - b.total_credit;
    } else if (sortField === "reference") {
      cmp = a.reference.localeCompare(b.reference, undefined, { numeric: true, sensitivity: "base" });
    } else if (sortField === "source") {
      cmp = a.source.localeCompare(b.source, undefined, { sensitivity: "base" });
    }
    return sortDirection === "asc" ? cmp : -cmp;
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'posted': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'reversed': return 'bg-red-100 text-red-700 border-red-200';
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', { style: 'decimal', minimumFractionDigits: 2 }).format(amount);
  };

  const mapEntryToExportRows = (entry: JournalEntry): ExportableTransaction[] => {
    return entry.lines.map(line => ({
      date: new Date(entry.transaction_date).toLocaleDateString('en-ZA'),
      description: `${entry.description} - ${line.account_code} ${line.account_name}`,
      type: entry.transaction_type,
      amount: line.debit !== 0 ? line.debit : line.credit,
      vatAmount: undefined,
      reference: entry.reference
    }));
  };

  const handleExportAllExcel = () => {
    if (sortedEntries.length === 0) {
      toast({ title: "No data to export", description: "There are no journal entries for this view." });
      return;
    }

    const rows: ExportableTransaction[] = sortedEntries.flatMap(mapEntryToExportRows);
    const label = format(parseISO(selectedMonth + "-01"), "yyyy-MM");
    exportTransactionsToExcel(rows, `general_journal_${label}`);
    toast({ title: "Exported", description: "General journal exported to Excel." });
  };

  const handleExportAllPDF = () => {
    if (sortedEntries.length === 0) {
      toast({ title: "No data to export", description: "There are no journal entries for this view." });
      return;
    }

    const rows: ExportableTransaction[] = sortedEntries.flatMap(mapEntryToExportRows);
    const label = format(parseISO(selectedMonth + "-01"), "yyyy-MM");
    exportTransactionsToPDF(rows, `general_journal_${label}`);
    toast({ title: "Exported", description: "General journal exported to PDF." });
  };

  const fetchLedger = async () => {
    try {
      setLedgerLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLedgerLoading(false);
        return;
      }

      let currentCompanyId = companyId;
      if (!currentCompanyId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
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
        currentCompanyId = profile.company_id;
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

      let accountsList = ledgerAccounts;
      if (accountsList.length === 0) {
        const { data: accData, error: accError } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type")
          .eq("company_id", currentCompanyId)
          .order("account_code", { ascending: true });

        if (accError) throw accError;
        accountsList = accData || [];
        setLedgerAccounts(accountsList);
      }

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
          const accountId = entry.account_id as string;
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

      const rows: LedgerRow[] = [];

      const accountIds = Array.from(
        new Set([
          ...Object.keys(openingDebitMap),
          ...Object.keys(openingCreditMap),
          ...Object.keys(periodEntries),
        ])
      );

      accountIds.forEach(accountId => {
        const account = accountsList.find(a => a.id === accountId);
        if (!account) return;

        const normalSide = getNormalBalanceSide(account.account_type);
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
          accountId,
          accountCode: account.account_code,
          accountName: account.account_name,
          date: ledgerFromDate,
          reference: "OB",
          description: "Opening Balance",
          debit: 0,
          credit: 0,
          balanceLabel: formatLedgerBalance(openingBalance, normalSide),
        });

        const sortedEntries = [...entriesForAccount].sort((a, b) => {
          const da = new Date(a.date).getTime();
          const db = new Date(b.date).getTime();
          if (da !== db) return da - db;
          if (a.reference !== b.reference) return (a.reference || "").localeCompare(b.reference || "");
          return a.id.localeCompare(b.id);
        });

        sortedEntries.forEach(entry => {
          if (normalSide === "debit") {
            runningBalance = runningBalance + entry.debit - entry.credit;
          } else {
            runningBalance = runningBalance - entry.debit + entry.credit;
          }

          rows.push({
            id: entry.id,
            accountId,
            accountCode: account.account_code,
            accountName: account.account_name,
            date: entry.date,
            reference: entry.reference,
            description: entry.description,
            debit: entry.debit,
            credit: entry.credit,
            balanceLabel: formatLedgerBalance(runningBalance, normalSide),
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
      console.error("General ledger load error:", error);
      toast({
        title: "Failed to load general ledger",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
      setLedgerRows([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleExportSinglePDF = (entry: JournalEntry) => {
    const rows = mapEntryToExportRows(entry);
    const dateLabel = new Date(entry.transaction_date).toLocaleDateString('en-ZA');
    const safeRef = entry.reference || entry.id.slice(0, 8);
    exportTransactionsToPDF(rows, `journal_${safeRef}_${dateLabel.replace(/\//g, "-")}`);
    toast({ title: "Exported", description: "Journal entry exported to PDF." });
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="hover:bg-transparent pl-0">
            <ArrowLeft className="h-6 w-6 text-muted-foreground" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">General Journal</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="font-normal text-muted-foreground border-slate-300">
                {format(parseISO(selectedMonth + "-01"), "MMMM yyyy")}
              </Badge>
              <span className="text-sm text-muted-foreground">• FY 2025/26</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[180px] bg-background">
              <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select Month" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }).map((_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const val = d.toISOString().slice(0, 7);
                return (
                  <SelectItem key={val} value={val}>
                    {format(d, "MMMM yyyy")}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="icon" onClick={() => loadData()}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleExportAllExcel}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                <span>Download Excel</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportAllPDF}>
                <FileText className="mr-2 h-4 w-4" />
                <span>Download PDF</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "journal" | "ledger")}
        className="w-full"
      >
        <TabsList className="w-full justify-start h-auto bg-transparent p-0 border-b rounded-none space-x-6">
          <TabsTrigger
            value="ledger"
            className="rounded-none border-b-2 border-transparent px-2 py-2 data-[state=active]:border-[#0070ad] data-[state=active]:text-[#0070ad] data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-none font-medium"
          >
            General Ledger
          </TabsTrigger>
          <TabsTrigger
            value="journal"
            className="rounded-none border-b-2 border-transparent px-2 py-2 data-[state=active]:border-[#0070ad] data-[state=active]:text-[#0070ad] data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-none font-medium"
          >
            General Journal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="journal" className="mt-6 space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Advanced filters
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowFilters(prev => !prev)}
              >
                {showFilters ? "Hide filters" : "Show filters"}
              </Button>
            </div>
          </div>

          {showFilters && (
            <Card className="border-none shadow-sm bg-muted/20">
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setSearchTerm("");
                        setStatusFilter("all");
                        setSourceFilter("all");
                        setTypeFilter("all");
                        setUserFilter("all");
                        setBalanceFilter("all");
                        setHasAttachmentFilter("all");
                        setAmountMin("");
                        setAmountMax("");
                        setDateFrom("");
                        setDateTo("");
                      }}
                    >
                      Clear all
                    </Button>
                  </div>
                </div>

                {/* Row 1: Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search reference, description, account code or name..."
                    className="pl-9 bg-background"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                {/* Row 2: Status / Source / Type / User */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="bg-background h-8 text-xs">
                        <Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="posted">Posted</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="reversed">Reversed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Source</Label>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="bg-background h-8 text-xs">
                        <SelectValue placeholder="All sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        {uniqueSources.map(source => (
                          <SelectItem key={source} value={source}>
                            {source}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Transaction type</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="bg-background h-8 text-xs">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {uniqueTypes.map(type => (
                          <SelectItem key={type} value={type}>
                            {type || "General"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Created by</Label>
                    <Select value={userFilter} onValueChange={setUserFilter}>
                      <SelectTrigger className="bg-background h-8 text-xs">
                        <SelectValue placeholder="All users" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All users</SelectItem>
                        {uniqueUsers.map(user => (
                          <SelectItem key={user} value={user}>
                            {user}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 3: Date range / Amount range */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date from</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs bg-background"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Date to</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs bg-background"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Amount range (any side)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="h-8 text-xs bg-background"
                        placeholder="Min"
                        value={amountMin}
                        onChange={e => setAmountMin(e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="number"
                        className="h-8 text-xs bg-background"
                        placeholder="Max"
                        value={amountMax}
                        onChange={e => setAmountMax(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Row 4: Audit helpers */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Balance check</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={balanceFilter === "all" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setBalanceFilter("all")}
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={balanceFilter === "balanced" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setBalanceFilter("balanced")}
                      >
                        Balanced only
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={balanceFilter === "unbalanced" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setBalanceFilter("unbalanced")}
                      >
                        Unbalanced only
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Attachments</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={hasAttachmentFilter === "all" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setHasAttachmentFilter("all")}
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={hasAttachmentFilter === "with" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setHasAttachmentFilter("with")}
                      >
                        With attachments
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={hasAttachmentFilter === "without" ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => setHasAttachmentFilter("without")}
                      >
                        No attachments
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Audit shortcuts</Label>
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <Checkbox
                          id="audit-posted-only"
                          checked={statusFilter === "posted"}
                          onCheckedChange={checked => setStatusFilter(checked ? "posted" : "all")}
                        />
                        <Label htmlFor="audit-posted-only" className="text-xs cursor-pointer">
                          Posted only
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Checkbox
                          id="audit-unbalanced-only"
                          checked={balanceFilter === "unbalanced"}
                          onCheckedChange={checked => setBalanceFilter(checked ? "unbalanced" : "all")}
                        />
                        <Label htmlFor="audit-unbalanced-only" className="text-xs cursor-pointer">
                          Show only unbalanced
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {loading ? (
              <div className="h-[400px] flex items-center justify-center">
                <PageLoader />
              </div>
            ) : sortedEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/5">
                <Search className="h-12 w-12 opacity-20 mb-4" />
                <p className="text-lg font-medium">No journal entries found</p>
                <p className="text-sm">Try adjusting your filters or search terms.</p>
              </div>
            ) : (
              <Card className="border-none shadow-sm">
                <CardContent className="p-0">
                  <div className="overflow-x-auto rounded-md border bg-white">
                    <Table>
                      <TableHeader className="bg-slate-700 border-b border-slate-800">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead
                            className="text-xs font-semibold text-white h-9 min-w-[80px] cursor-pointer select-none border-r border-slate-600 pl-4"
                            onClick={() => handleSort("date")}
                          >
                            <div className="flex items-center gap-1">
                              Date
                              {sortField === "date" && (
                                <span className="text-[10px] text-muted-foreground">
                                  {sortDirection === "asc" ? "▲" : "▼"}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-9 min-w-[140px] border-r border-slate-600">
                            Reference
                          </TableHead>
                          <TableHead
                            className="text-xs font-semibold text-white h-9 min-w-[110px] cursor-pointer select-none border-r border-slate-600"
                            onClick={() => handleSort("source")}
                          >
                            <div className="flex items-center gap-1">
                              Source
                              {sortField === "source" && (
                                <span className="text-[10px] text-muted-foreground">
                                  {sortDirection === "asc" ? "▲" : "▼"}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-9 min-w-[220px] border-r border-slate-600">
                            Description
                          </TableHead>
                          <TableHead
                            className="text-xs font-semibold text-white h-9 text-right min-w-[120px] cursor-pointer select-none border-r border-slate-600"
                            onClick={() => handleSort("debit")}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Debit (ZAR)
                              {sortField === "debit" && (
                                <span className="text-[10px] text-muted-foreground">
                                  {sortDirection === "asc" ? "▲" : "▼"}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead
                            className="text-xs font-semibold text-white h-9 text-right min-w-[120px] cursor-pointer select-none border-r border-slate-600"
                            onClick={() => handleSort("credit")}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Credit (ZAR)
                              {sortField === "credit" && (
                                <span className="text-[10px] text-muted-foreground">
                                  {sortDirection === "asc" ? "▲" : "▼"}
                                </span>
                              )}
                            </div>
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-9 min-w-[110px] border-r border-slate-600">
                            Status
                          </TableHead>
                          <TableHead className="text-xs font-semibold text-white h-9 text-right min-w-[140px] pr-4">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedEntries.map((entry, index) => {
                          const isBalanced = Math.abs(entry.total_debit - entry.total_credit) < 0.01;
                          const isReadOnly = ["posted", "reversed"].includes(entry.status.toLowerCase());
                          const lines = Array.isArray(entry.lines) ? entry.lines.filter(Boolean) : [];
                          const firstLine = lines[0];
                          const accountSummary =
                            !firstLine
                              ? "No lines"
                              : lines.length === 1
                              ? `${firstLine.account_code} – ${firstLine.account_name}`
                              : `${firstLine.account_code} – ${firstLine.account_name} (+${lines.length - 1} more)`;

                          return (
                            <Fragment key={entry.id}>
                              <TableRow
                                className={cn(
                                  "h-11 cursor-pointer border-b border-border/40 hover:bg-muted/10",
                                  index % 2 === 0 ? "bg-white" : "bg-slate-100",
                                  !isBalanced && "bg-red-50/40 hover:bg-red-50/60"
                                )}
                                onClick={() => toggleExpand(entry.id)}
                              >
                                <TableCell className="text-xs text-muted-foreground border-r border-border/40 pl-4 whitespace-normal leading-tight">
                                  {format(parseISO(entry.transaction_date), "dd MMM yyyy")}
                                </TableCell>
                                <TableCell className="text-xs border-r border-border/40 whitespace-normal leading-tight max-w-[90px]">
                                  <button
                                    type="button"
                                    className="font-mono text-xs px-2 py-1 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100"
                                  >
                                    {entry.reference}
                                  </button>
                                </TableCell>
                                <TableCell className="text-xs border-r border-border/40 align-top">
                                  <div className="inline-flex max-w-[140px] whitespace-normal break-words text-left text-[11px] px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 capitalize">
                                    {entry.source}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-foreground truncate max-w-[260px] border-r border-border/40">
                                  <div className="flex flex-col">
                                    <span className="font-medium">{entry.description}</span>
                                    <span className="text-[11px] text-muted-foreground truncate">
                                      {accountSummary}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums text-emerald-600 border-r border-border/40">
                                  {formatCurrency(entry.total_debit)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums text-red-600 border-r border-border/40">
                                  {formatCurrency(entry.total_credit)}
                                </TableCell>
                                <TableCell className="border-r border-border/40">
                                  <Badge
                                    className={cn(
                                      "capitalize px-2.5 py-0.5 text-[11px] shadow-none",
                                      getStatusColor(entry.status)
                                    )}
                                  >
                                    {entry.status}
                                  </Badge>
                                  {isReadOnly && (
                                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Lock className="h-3 w-3" />
                                      <span>Read-only</span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right pr-4">
                                  <div className="flex justify-end items-center gap-1.5">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={e => {
                                        e.stopPropagation();
                                        toggleExpand(entry.id);
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      disabled={isReadOnly}
                                      onClick={e => {
                                        e.stopPropagation();
                                        toast({
                                          title: "Reverse entry",
                                          description: "Reversal workflow will be available soon.",
                                        });
                                      }}
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleExportSinglePDF(entry);
                                      }}
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {expandedItems[entry.id] && lines.length > 0 && (
                                <TableRow className="bg-muted/5">
                                  <TableCell colSpan={8} className="p-0">
                                    <div className="px-4 py-3 border-t space-y-4">
                                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                          <div className="flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {format(parseISO(entry.transaction_date), "PPPP")}
                                          </div>
                                          <span className="text-muted-foreground/30">|</span>
                                          <div className="flex items-center gap-1.5">
                                            <User className="h-3 w-3" />
                                            <span>Created by {entry.created_by_name}</span>
                                          </div>
                                          <span className="text-muted-foreground/30">|</span>
                                          <div>
                                            Last update:{" "}
                                            {entry.updated_at ? format(parseISO(entry.updated_at), "PPpp") : "-"}
                                          </div>
                                        </div>
                                        <div className={cn(
                                          "flex items-center gap-4 text-xs font-mono",
                                          Math.abs(entry.total_debit - entry.total_credit) < 0.01
                                            ? "text-emerald-700"
                                            : "text-red-700"
                                        )}>
                                          <span>
                                            DR {formatCurrency(entry.total_debit)}
                                          </span>
                                          <span>
                                            CR {formatCurrency(entry.total_credit)}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="border rounded-md overflow-hidden bg-white">
                                        <Table>
                                          <TableHeader className="bg-muted/10 border-b border-border/50">
                                            <TableRow className="hover:bg-transparent border-none">
                                              <TableHead className="w-[120px] text-xs font-semibold h-9">
                                                Account Code
                                              </TableHead>
                                              <TableHead className="w-[220px] text-xs font-semibold h-9">
                                                Account Name
                                              </TableHead>
                                              <TableHead className="text-xs font-semibold h-9">
                                                Line Description
                                              </TableHead>
                                              <TableHead className="text-right w-[140px] text-xs font-semibold h-9">
                                                Debit (ZAR)
                                              </TableHead>
                                              <TableHead className="text-right w-[140px] text-xs font-semibold h-9">
                                                Credit (ZAR)
                                              </TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {lines.map(line => (
                                              <TableRow
                                                key={line.id}
                                                className="border-b border-border/40 hover:bg-muted/10 h-9"
                                              >
                                                <TableCell className="font-mono text-xs text-muted-foreground py-1.5">
                                                  {line.account_code}
                                                </TableCell>
                                                <TableCell className="text-sm font-medium py-1.5">
                                                  {line.account_name}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground py-1.5 truncate max-w-[320px]">
                                                  {line.description}
                                                </TableCell>
                                                <TableCell
                                                  className={cn(
                                                    "text-right font-mono text-sm tabular-nums py-1.5",
                                                    line.debit > 0 ? "text-emerald-600" : "text-muted-foreground/60"
                                                  )}
                                                >
                                                  {line.debit > 0 ? formatCurrency(line.debit) : "-"}
                                                </TableCell>
                                                <TableCell
                                                  className={cn(
                                                    "text-right font-mono text-sm tabular-nums py-1.5",
                                                    line.credit > 0 ? "text-red-600" : "text-muted-foreground/60"
                                                  )}
                                                >
                                                  {line.credit > 0 ? formatCurrency(line.credit) : "-"}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                      {entry.attachment_count > 0 && (
                                        <div className="inline-flex items-center text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
                                          <Paperclip className="h-3 w-3 mr-1" />
                                          {entry.attachment_count} attachment(s)
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="ledger" className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              Ledger filters
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  const now = new Date();
                  setLedgerMonth(now.getMonth() + 1);
                  setLedgerYear(now.getFullYear());
                  setLedgerCodeFilter("");
                  setLedgerAccountFilter("");
                }}
              >
                This month
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  const now = new Date();
                  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                  setLedgerMonth(prev.getMonth() + 1);
                  setLedgerYear(prev.getFullYear());
                  setLedgerCodeFilter("");
                  setLedgerAccountFilter("");
                }}
              >
                Previous month
              </Button>
            </div>
          </div>

          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between rounded-md border bg-gray-50 px-3 py-2 text-xs text-muted-foreground">
              <span>Show advanced ledger filters</span>
              <span className="text-[10px] opacity-70 group-open:hidden">▼</span>
              <span className="text-[10px] opacity-70 hidden group-open:inline">▲</span>
            </summary>
            <div className="mt-2 rounded-md border bg-gray-50 p-4 space-y-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Month</Label>
                  <Select value={String(ledgerMonth)} onValueChange={v => setLedgerMonth(Number(v))}>
                    <SelectTrigger className="w-[150px] bg-white h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">January</SelectItem>
                      <SelectItem value="2">February</SelectItem>
                      <SelectItem value="3">March</SelectItem>
                      <SelectItem value="4">April</SelectItem>
                      <SelectItem value="5">May</SelectItem>
                      <SelectItem value="6">June</SelectItem>
                      <SelectItem value="7">July</SelectItem>
                      <SelectItem value="8">August</SelectItem>
                      <SelectItem value="9">September</SelectItem>
                      <SelectItem value="10">October</SelectItem>
                      <SelectItem value="11">November</SelectItem>
                      <SelectItem value="12">December</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Year</Label>
                  <Input
                    type="number"
                    value={ledgerYear}
                    onChange={e => {
                      const value = parseInt(e.target.value || String(new Date().getFullYear()), 10);
                      if (!Number.isNaN(value)) setLedgerYear(value);
                    }}
                    className="w-[110px] bg-white h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Account code contains</Label>
                  <Input
                    value={ledgerCodeFilter}
                    onChange={e => setLedgerCodeFilter(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-[160px] bg-white h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Account name contains</Label>
                  <Input
                    value={ledgerAccountFilter}
                    onChange={e => setLedgerAccountFilter(e.target.value)}
                    placeholder="e.g. Bank"
                    className="w-[200px] bg-white h-9 text-xs"
                  />
                </div>
              </div>
            </div>
          </details>

          {ledgerLoading ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              Loading general ledger...
            </div>
          ) : ledgerRows.length === 0 ? (
            <div className="border rounded-md p-8 text-center text-muted-foreground">
              No accounts with balances for this period.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Period: {format(new Date(ledgerFromDate), "dd/MM/yyyy")} to{" "}
                {format(new Date(ledgerToDate), "dd/MM/yyyy")}
              </div>

              <div className="border rounded-md overflow-hidden bg-white">
                <Table>
                  <TableHeader className="bg-slate-700 border-b border-slate-800">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="text-xs font-semibold text-white h-8 min-w-[110px] border-r border-slate-600 pl-3">
                        Account Code
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-white h-8 min-w-[140px] border-r border-slate-600">
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
                    {ledgerRows
                      .filter(row => {
                        const codeMatch = !ledgerCodeFilter
                          || row.accountCode.toLowerCase().includes(ledgerCodeFilter.toLowerCase());
                        const nameMatch = !ledgerAccountFilter
                          || row.accountName.toLowerCase().includes(ledgerAccountFilter.toLowerCase());
                        return codeMatch && nameMatch;
                      })
                      .map((row, index) => (
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
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GeneralJournal;
