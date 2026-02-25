import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  CreditCard, 
  BarChart3, 
  Plus, 
  Menu, 
  LayoutDashboard, 
  FileText, 
  User, 
  TrendingUp, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  DollarSign,
  Calendar,
  Percent,
  Search,
  Filter,
  Check,
  XCircle,
  ChevronDown,
  MoreHorizontal,
  Info,
  AlertTriangle,
  Download,
  FileSpreadsheet
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";
import { TransactionFormEnhanced } from "@/components/Transactions/TransactionFormEnhanced";
import { transactionsApi } from "@/lib/transactions-api";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Progress } from "@/components/ui/progress";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LoanOverview from "@/pages/loans/LoanOverview";

type Loan = { id: string; company_id: string; reference: string; loan_type: "short" | "long"; principal: number; interest_rate: number; start_date: string; term_months: number; monthly_repayment: number | null; status: string; outstanding_balance: number; lender_name?: string; borrower_name?: string };
type LoanPayment = { id: string; loan_id: string; payment_date: string; amount: number; principal_component: number; interest_component: number };

// --- Metric Card Component ---
function MetricCard({ title, value, icon: Icon, color, trend }: { title: string; value: string; icon: any; color: string; trend?: string }) {
  return (
    <Card className="border-none shadow-md overflow-hidden relative">
      <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-10`} />
      <CardContent className="p-6 relative">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
            {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
          </div>
          <div className={`p-3 rounded-xl bg-gradient-to-br ${color} text-white shadow-lg`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Loans({ tab: initialTab }: { tab?: string }) {
  const location = useLocation();
  const [tab, setTab] = useState(() => {
    if (initialTab) return initialTab;
    const tabParam = new URLSearchParams(location.search).get('tab');
    return tabParam || "overview";
  });
  const { user } = useAuth();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Operation completed successfully");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  
  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);
  const [isInstallmentDupDialogOpen, setIsInstallmentDupDialogOpen] = useState(false);
  
  // Dialog States
  const [addLoanOpen, setAddLoanOpen] = useState(false);
  const [allLoans, setAllLoans] = useState<Loan[]>([]);
  const [loadingAllLoans, setLoadingAllLoans] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [transactionPrefill, setTransactionPrefill] = useState<any>(null);
  const [interestQuickOpen, setInterestQuickOpen] = useState(false);
  const [repaymentQuickOpen, setRepaymentQuickOpen] = useState(false);
  const [postIntInstOpen, setPostIntInstOpen] = useState(false);
  const [amortOpen, setAmortOpen] = useState(false);
  const [amortPage, setAmortPage] = useState(1);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [directorsLoanOpen, setDirectorsLoanOpen] = useState(false);
  const [clearLoansOpen, setClearLoansOpen] = useState(false);
  const [isClearingLoans, setIsClearingLoans] = useState(false);

  // Action States
  const [actionLoan, setActionLoan] = useState<Loan | null>(null);
  const [actionDate, setActionDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [repaymentAmount, setRepaymentAmount] = useState<string>("");
  const [repaymentBankId, setRepaymentBankId] = useState<string>("");
  const [isProcessingRepayment, setIsProcessingRepayment] = useState(false);
  
  // Data States
  const [loanAccounts, setLoanAccounts] = useState<Array<{ id: string; account_name: string; account_code: string }>>([]);
  const [banks, setBanks] = useState<Array<{ id: string; account_name: string }>>([]);
  
  // Director Loan Form
  const [directorLoanDirection, setDirectorLoanDirection] = useState<'to_director' | 'from_director'>('from_director');
  const [directorPrincipal, setDirectorPrincipal] = useState<string>('');
  const [directorInterestRate, setDirectorInterestRate] = useState<string>('0');
  const [directorTermMonths, setDirectorTermMonths] = useState<string>('12');
  const [directorLoanAccountId, setDirectorLoanAccountId] = useState<string>('');
  const [directorBankAccountId, setDirectorBankAccountId] = useState<string>('');
  const [directorDate, setDirectorDate] = useState<string>(new Date().toISOString().slice(0,10));
  
  // Standard Loan Form
  const [loanForm, setLoanForm] = useState({
    reference: "",
    principal: "",
    interestRatePercent: "",
    termValue: "",
    termUnit: "months",
    classification: "short",
    loanAccountId: "",
    bankAccountId: "",
    startDate: new Date().toISOString().slice(0,10)
  });

  const generateUniqueLoanRef = () => {
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const rand = Math.random().toString(36).slice(2,8);
    return `LN-${today}-${rand}`;
  };

  useEffect(() => {
    const loadCompany = async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).maybeSingle();
      if (profile?.company_id) setCompanyId(profile.company_id);
    };
    loadCompany();
  }, [user?.id]);

  // Handle URL query parameter for tab
  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (tabParam && ['overview', 'list', 'payments', 'director', 'amortization'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [location.search]);

  useEffect(() => {
    const loadAux = async () => {
      if (!companyId) return;
      const { data: accts } = await supabase
        .from("chart_of_accounts" as any)
        .select("id, account_name, account_code, account_type")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("account_code");
      const loanCandidates = (accts || []).filter((a: any) => (String(a.account_name || '').toLowerCase().includes('loan')));
      setLoanAccounts(loanCandidates as any);
      const { data: bankList } = await supabase
        .from("bank_accounts" as any)
        .select("id, account_name")
        .eq("company_id", companyId)
        .order("account_name");
      const banksSafe = Array.isArray(bankList)
        ? (bankList as any[]).filter((b: any) => b && typeof b.id === 'string' && typeof b.account_name === 'string')
        : [];
      setBanks(banksSafe as any);
    };
    loadAux();
  }, [companyId]);

  // Load all loans for amortization tab
  const loadAllLoans = useCallback(async () => {
    if (!companyId) return;
    setLoadingAllLoans(true);
    try {
      const { data, error } = await supabase.from("loans" as any).select("*").eq("company_id", companyId).order("start_date", { ascending: false });
      if (error) throw error;
      setAllLoans((data || []) as any);
    } catch (e: any) {
      console.error("Error loading loans:", e);
    } finally {
      setLoadingAllLoans(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (tab === 'amortization' && companyId) {
      loadAllLoans();
    }
  }, [tab, companyId, loadAllLoans]);

  useEffect(() => {
    if (addLoanOpen) {
      const ref = generateUniqueLoanRef();
      setLoanForm(prev => ({ ...prev, reference: ref }));
    } else {
      setLoanForm(prev => ({ ...prev, reference: "" }));
    }
  }, [addLoanOpen]);

  const resolveBankAccountId = async (): Promise<string> => {
    if (loanForm.bankAccountId && loanForm.bankAccountId.trim() !== "") return loanForm.bankAccountId;
    if (banks.length > 0) return banks[0].id;
    if (!companyId) return "";
    const { data: bankList } = await supabase.from("bank_accounts" as any).select("id, account_name").eq("company_id", companyId).order("account_name");
    if (Array.isArray(bankList) && bankList.length > 0) {
      const banksSafe = (bankList as any[]).filter((b: any) => b && typeof b.id === 'string' && typeof b.account_name === 'string');
      setBanks(banksSafe as any);
      return String((banksSafe[0] as any).id);
    }
    const { data: created } = await supabase.from("bank_accounts" as any).insert({ company_id: companyId, account_name: "Default Bank Account" }).select("id").single();
    const newId = (created as any)?.id || "";
    if (newId) setBanks([{ id: newId, account_name: "Default Bank Account" }]);
    return newId;
  };

  const createDirectorsLoan = useCallback(async () => {
    if (isDateLocked(directorDate)) {
      setDirectorsLoanOpen(false);
      setIsLockDialogOpen(true);
      return;
    }

    try {
      const principal = Number(directorPrincipal || '0');
      if (!principal || principal <= 0) { toast({ title: 'Principal required', variant: 'destructive' }); return; }
      if (!directorBankAccountId) { toast({ title: 'Select bank', variant: 'destructive' }); return; }

      setIsSubmitting(true);
      setProgress(10);
      setProgressText("Initializing Director Loan...");

      const ref = `DIR-${generateUniqueLoanRef()}`;
      const shortOrLong: 'short' | 'long' = Number(directorTermMonths || '0') >= 12 ? 'long' : 'short';
      const { error: loanErr } = await supabase
        .from('loans' as any)
        .insert({ company_id: companyId, reference: ref, loan_type: shortOrLong, principal, interest_rate: Number(directorInterestRate || '0') / 100, start_date: directorDate, term_months: Number(directorTermMonths || '0'), monthly_repayment: null, status: 'active', outstanding_balance: principal });
      if (loanErr) throw loanErr;
      
      setProgress(40);
      setProgressText("Processing Transaction...");

      if (directorLoanDirection === 'from_director') {
        let loanAssetId = directorLoanAccountId;
        try {
          const { data: accts } = await supabase.from('chart_of_accounts' as any).select('id, account_name, account_type, account_code, is_active').eq('company_id', companyId).eq('is_active', true);
          const list = (accts || []).map((a: any) => ({ id: String(a.id), name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
          const isLong = shortOrLong === 'long';
          const desiredName = isLong ? 'Director Loan Receivable - Non-current' : 'Director Loan Receivable - Current';
          const desiredCode = isLong ? '1450' : '1250';
          const found = list.find(a => a.type === 'asset' && (a.name.includes('director') && a.name.includes('loan')) && (isLong ? a.name.includes('non') : a.name.includes('current')));
          loanAssetId = found?.id || '';
          if (!loanAssetId) {
            const { data: created } = await supabase.from('chart_of_accounts' as any).insert({ company_id: companyId, account_code: desiredCode, account_name: desiredName, account_type: 'asset', is_active: true }).select('id').single();
            loanAssetId = (created as any)?.id || '';
          }
        } catch {}
        await transactionsApi.postLoanAdvanced({ date: directorDate, amount: principal, reference: ref, bankAccountId: directorBankAccountId, loanLedgerAccountId: loanAssetId || undefined });
      } else {
        await transactionsApi.postLoanReceived({ date: directorDate, amount: principal, reference: ref, bankAccountId: directorBankAccountId, loanType: shortOrLong, loanLedgerAccountId: directorLoanAccountId || undefined });
      }

      setProgress(80);
      setProgressText("Updating Financials...");

      try {
        const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user?.id || '').maybeSingle();
        if (profile?.company_id) await supabase.rpc('refresh_afs_cache', { _company_id: profile.company_id });
      } catch {}
      
      setProgress(100);
      setProgressText("Finalizing...");
      await new Promise(r => setTimeout(r, 500));

      setSuccessMessage('Director loan recorded successfully');
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setIsSubmitting(false);
        setDirectorsLoanOpen(false);
      }, 2000);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to create director loan', variant: 'destructive' });
      setIsSubmitting(false);
    }
  }, [companyId, directorPrincipal, directorLoanAccountId, directorBankAccountId, directorTermMonths, directorInterestRate, directorDate, directorLoanDirection, user?.id, toast]);

  const openInterestPayment = (loan: Loan) => {
    const today = new Date().toISOString().slice(0, 10);
    setActionLoan(loan);
    setActionDate(today);
    setInterestQuickOpen(true);
  };

  const openLoanRepayment = (loan: Loan) => {
    const today = new Date().toISOString().slice(0, 10);
    setActionLoan(loan);
    setActionDate(today);
    setRepaymentAmount("");
    setRepaymentBankId("");
    setRepaymentQuickOpen(true);
  };

  const handleQuickRepayment = async () => {
    if (!actionLoan || !repaymentAmount || !repaymentBankId) {
      toast({ title: "Error", description: "Please select a bank account and enter an amount", variant: "destructive" });
      return;
    }

    setIsProcessingRepayment(true);
    try {
      const amount = parseFloat(repaymentAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Invalid amount");
      }

      // Use transactionsApi to post the loan repayment
      await transactionsApi.postLoanRepayment({
        loanId: actionLoan.id,
        date: actionDate,
        bankAccountId: repaymentBankId,
        amountOverride: amount
      });

      toast({ title: "Success", description: "Loan repayment recorded successfully" });
      setRepaymentQuickOpen(false);
      setRefreshKey(k => k + 1);
    } catch (error: any) {
      console.error("Repayment error:", error);
      toast({ title: "Error", description: error.message || "Failed to process repayment", variant: "destructive" });
    } finally {
      setIsProcessingRepayment(false);
    }
  };

  const openPostIntAndInst = (loan: Loan) => {
    setActionLoan(loan);
    setPostIntInstOpen(true);
  };

  const openAmortisation = (loan: Loan) => {
    setActionLoan(loan);
    setAmortPage(1);
    setAmortOpen(true);
  };

  return (
    <>
      <SEO title="Loans | Rigel Business" description="Track company loans, director loans, and repayment schedules" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">Loan Management</h1>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="right" align="start">
                  <p className="text-sm text-muted-foreground">
                    Track company loans, director loans, and repayment schedules to this !.....
                  </p>
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" className="h-9 w-9">
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>New Records</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setAddLoanOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Loan
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDirectorsLoanOpen(true)}>
                    <User className="h-4 w-4 mr-2" />
                    Record Director's Loan
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Management</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setTab('director')}>
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    View Director Loans
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTutorialOpen(true)}>
                    <FileText className="h-4 w-4 mr-2" />
                    Help & Documentation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Main Tabs */}
          <Tabs value={tab} onValueChange={setTab} className="space-y-6">
            <div className="border-b pb-px overflow-x-auto">
              <TabsList className="h-auto w-full justify-start gap-2 bg-transparent p-0 rounded-none">
                <TabsTrigger value="overview" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="list" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary">
                  Loan List
                </TabsTrigger>
                <TabsTrigger value="payments" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary">
                  Payment History
                </TabsTrigger>
                <TabsTrigger value="director" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary">
                  Director Loans
                </TabsTrigger>
                <TabsTrigger value="amortization" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary">
                  Amortization
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <LoanOverview />
            </TabsContent>

            <TabsContent value="list" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <LoanList
                key={refreshKey}
                companyId={companyId}
                onOpenInterest={openInterestPayment}
                onOpenRepayment={openLoanRepayment}
                onOpenPostIntInst={openPostIntAndInst}
                onOpenAmortisation={openAmortisation}
              />
            </TabsContent>
            <TabsContent value="payments" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <LoanPayments key={refreshKey} companyId={companyId} />
            </TabsContent>
            <TabsContent value="director" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <DirectorLoansList companyId={companyId} />
            </TabsContent>
            <TabsContent value="amortization" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {loadingAllLoans ? (
                <div className="flex items-center justify-center p-8">
                  <LoadingSpinner />
                </div>
              ) : allLoans.length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Loan Amortization Schedules</CardTitle>
                    <CardDescription>View detailed payment schedules for all loans</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted/50 rounded-lg p-8 text-center">
                      <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">No Loans Found</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        Create your first loan to see its amortization schedule here.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {allLoans.map((loan) => {
                    const annualRate = Number(loan.interest_rate || 0);
                    const termMonths = Number(loan.term_months || 0);
                    const principalAmount = Number(loan.principal || 0);
                    const monthlyRate = annualRate / 12;
                    let scheduled = loan.monthly_repayment && loan.monthly_repayment > 0
                      ? Number(loan.monthly_repayment)
                      : monthlyRate === 0 || termMonths <= 0
                      ? termMonths > 0 ? principalAmount / termMonths : principalAmount
                      : (principalAmount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
                    const startDate = new Date(loan.start_date);
                    const scheduleRows = [];
                    let balance = principalAmount;
                    for (let i = 1; i <= termMonths; i++) {
                      const interest = balance * monthlyRate;
                      const capital = scheduled - interest;
                      balance = Math.max(0, balance - capital);
                      const rowDate = new Date(startDate);
                      rowDate.setMonth(rowDate.getMonth() + i);
                      scheduleRows.push({
                        period: i,
                        date: rowDate.toISOString().split('T')[0],
                        opening: balance + capital,
                        installment: scheduled,
                        interest,
                        capital,
                        closing: balance
                      });
                    }
                    return (
                      <Card key={loan.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-lg">{loan.reference}</CardTitle>
                              <CardDescription>
                                Principal: R {principalAmount.toFixed(2)} | {(annualRate * 100).toFixed(2)}% p.a. | {termMonths} months
                              </CardDescription>
                            </div>
                            <Badge variant={loan.status === 'active' ? 'default' : 'secondary'}>
                              {loan.status}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader className="bg-slate-700">
                                <TableRow className="hover:bg-transparent">
                                  <TableHead className="text-white text-center">#</TableHead>
                                  <TableHead className="text-white">Date</TableHead>
                                  <TableHead className="text-white text-right">Opening</TableHead>
                                  <TableHead className="text-white text-right">Installment</TableHead>
                                  <TableHead className="text-white text-right">Interest</TableHead>
                                  <TableHead className="text-white text-right">Capital</TableHead>
                                  <TableHead className="text-white text-right">Closing</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {scheduleRows.slice(0, 12).map((row) => (
                                  <TableRow key={row.period}>
                                    <TableCell className="text-center">{row.period}</TableCell>
                                    <TableCell>{row.date}</TableCell>
                                    <TableCell className="text-right">R {row.opening.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">R {row.installment.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">R {row.interest.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">R {row.capital.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">R {row.closing.toFixed(2)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          {scheduleRows.length > 12 && (
                            <div className="p-3 text-center text-sm text-muted-foreground border-t">
                              Showing first 12 of {scheduleRows.length} installments. View full schedule in Loan List.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Dialogs */}
          <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Loans Module Guide</DialogTitle>
                <DialogDescription>Learn how to manage your company loans.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-1">Loan Management</h4>
                  <p>Create and track loans from external providers. The system calculates amortization schedules and tracks outstanding balances.</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-1">Director Loans</h4>
                  <p>Specialized tracking for loans between the company and its directors. Supports both loans to and from directors.</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <h4 className="font-semibold text-foreground mb-1">Payments & Interest</h4>
                  <p>Record interest payments and capital repayments. The system automatically splits repayments between principal and interest components.</p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setTutorialOpen(false)}>Got it</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Add Loan Dialog */}
          <Dialog open={addLoanOpen} onOpenChange={setAddLoanOpen}>
            <DialogContent className="sm:max-w-[600px] overflow-y-auto max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>Add New Loan</DialogTitle>
                <DialogDescription>Enter the details of the new loan agreement.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reference</Label>
                    <Input value={loanForm.reference} disabled readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={loanForm.startDate} onChange={(e) => setLoanForm(prev => ({ ...prev, startDate: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Principal Amount (R)</Label>
                  <Input type="number" value={loanForm.principal} onChange={(e) => setLoanForm(prev => ({ ...prev, principal: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Interest Rate (%)</Label>
                    <Input type="number" value={loanForm.interestRatePercent} onChange={(e) => setLoanForm(prev => ({ ...prev, interestRatePercent: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Term Length</Label>
                    <div className="flex gap-2">
                      <Input type="number" value={loanForm.termValue} onChange={(e) => setLoanForm(prev => ({ ...prev, termValue: e.target.value }))} placeholder="36" />
                      <Select value={loanForm.termUnit} onValueChange={(v: any) => setLoanForm(prev => ({ ...prev, termUnit: v }))}>
                        <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="months">Months</SelectItem>
                          <SelectItem value="years">Years</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Classification</Label>
                  <Select value={loanForm.classification} onValueChange={(v: any) => setLoanForm(prev => ({ ...prev, classification: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short-term (Current Liability)</SelectItem>
                      <SelectItem value="long">Long-term (Non-current Liability)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Loan Account</Label>
                  <Select value={loanForm.loanAccountId} onValueChange={(v: any) => setLoanForm(prev => ({ ...prev, loanAccountId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select ledger account" /></SelectTrigger>
                    <SelectContent>
                      {loanAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.account_code} — {acc.account_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bank Account</Label>
                  <Select value={loanForm.bankAccountId} onValueChange={(v: any) => setLoanForm(prev => ({ ...prev, bankAccountId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select bank for deposit" /></SelectTrigger>
                    <SelectContent>
                      {banks.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setAddLoanOpen(false)}>Cancel</Button>
                  <Button onClick={async () => {
                    if (isDateLocked(loanForm.startDate)) {
                      setAddLoanOpen(false);
                      setIsLockDialogOpen(true);
                      return;
                    }
                    try {
                      const principal = parseFloat(loanForm.principal || "0");
                      const ratePct = parseFloat(loanForm.interestRatePercent || "0");
                      const termVal = parseInt(loanForm.termValue || "0", 10);
                      if (!companyId) throw new Error("Company not loaded");
                      if (!loanForm.loanAccountId) throw new Error("Select loan account");
                      if (!loanForm.bankAccountId) throw new Error("Select bank");
                      if (!(principal > 0)) throw new Error("Enter principal amount");
                      
                      const termMonths = loanForm.termUnit === 'years' ? termVal * 12 : termVal;
                      const monthlyRate = (ratePct / 100) / 12;
                      const monthlyRepayment = monthlyRate === 0 ? (principal / termMonths) : (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
                      const ref = (loanForm.reference && loanForm.reference.trim() !== "") ? loanForm.reference.trim() : generateUniqueLoanRef();
                      const loanType = loanForm.classification || (termMonths >= 12 ? 'long' : 'short');
                      
                      const { error } = await supabase.from('loans' as any).insert({
                        company_id: companyId, reference: ref, loan_type: loanType, principal: principal, interest_rate: ratePct / 100, start_date: loanForm.startDate, term_months: termMonths, monthly_repayment: monthlyRepayment, status: 'active', outstanding_balance: principal
                      });
                      if (error) throw error;

                      await transactionsApi.postLoanReceived({
                        date: loanForm.startDate, amount: principal, reference: ref, bankAccountId: loanForm.bankAccountId, loanType: loanType as any, loanLedgerAccountId: loanForm.loanAccountId,
                      });
                      
                      setSuccessMessage('Loan recorded successfully');
                      setIsSuccess(true);
                      setTimeout(() => {
                        setIsSuccess(false);
                        setAddLoanOpen(false);
                        setTab('list');
                      }, 2000);
                    } catch (e: any) {
                      toast({ title: 'Error', description: e.message, variant: 'destructive' });
                    }
                  }}>Create Loan</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Director Loan Dialog */}
          <Dialog open={directorsLoanOpen} onOpenChange={setDirectorsLoanOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Record Director Loan</DialogTitle>
                <DialogDescription>Record a loan between the company and a director.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={directorLoanDirection} onValueChange={(v: any) => setDirectorLoanDirection(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="from_director">Loan to director (Asset)</SelectItem>
                      <SelectItem value="to_director">Loan from director (Liability)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={directorDate} onChange={e => setDirectorDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input type="number" value={directorPrincipal} onChange={e => setDirectorPrincipal(e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Interest Rate (%)</Label>
                    <Input type="number" value={directorInterestRate} onChange={e => setDirectorInterestRate(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Term (Months)</Label>
                    <Input type="number" value={directorTermMonths} onChange={e => setDirectorTermMonths(e.target.value)} placeholder="12" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Loan Account (Optional)</Label>
                  <Select value={directorLoanAccountId} onValueChange={(v: any) => setDirectorLoanAccountId(v)}>
                    <SelectTrigger><SelectValue placeholder="Auto-select" /></SelectTrigger>
                    <SelectContent>
                      {loanAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.account_code} • {acc.account_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bank Account</Label>
                  <Select value={directorBankAccountId} onValueChange={(v: any) => setDirectorBankAccountId(v)}>
                    <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                    <SelectContent>
                      {banks.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDirectorsLoanOpen(false)}>Cancel</Button>
                <Button onClick={createDirectorsLoan}>Record Loan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Interest Payment Warning Dialog */}
          <Dialog open={interestQuickOpen} onOpenChange={setInterestQuickOpen}>
            <DialogContent className="sm:max-w-[480px] bg-red-50 border-red-200">
              <DialogHeader className="flex flex-col items-center gap-2">
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <DialogTitle className="text-xl text-center text-red-700">
                  Caution: Pay loan interest via Banking
                </DialogTitle>
                <DialogDescription className="text-center text-base font-medium text-foreground mt-2">
                  Interest payments for this loan must be captured and allocated through the Banking module, not from the Loans screen.
                </DialogDescription>
                <div className="w-full p-2 bg-red-100 rounded text-sm text-red-700 text-center mt-1">
                  This keeps your bank reconciliation clean and prevents double posting of interest.
                </div>
              </DialogHeader>
              <DialogFooter className="sm:justify-center mt-4">
                <Button
                  onClick={() => setInterestQuickOpen(false)}
                  className="bg-red-600 hover:bg-red-700 text-white min-w-[120px]"
                >
                  I understand
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Repayment Form Dialog */}
          <Dialog open={repaymentQuickOpen} onOpenChange={setRepaymentQuickOpen}>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Record Loan Repayment</DialogTitle>
                <DialogDescription>
                  Record a payment for {actionLoan?.borrower_name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {actionLoan && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Loan Balance</div>
                    <div className="text-xl font-semibold">
                      R{actionLoan.outstanding_balance?.toLocaleString('en-ZA', { minimumFractionDigits: 2 }) || '0.00'}
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor="bankAccount">Bank Account</Label>
                  <Select value={repaymentBankId} onValueChange={setRepaymentBankId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((bank) => (
                        <SelectItem key={bank.id} value={bank.id}>
                          {bank.account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="repaymentAmount">Amount</Label>
                  <Input
                    id="repaymentAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Enter repayment amount"
                    value={repaymentAmount}
                    onChange={(e) => setRepaymentAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="repaymentDate">Date</Label>
                  <Input
                    id="repaymentDate"
                    type="date"
                    value={actionDate}
                    onChange={(e) => setActionDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRepaymentQuickOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleQuickRepayment} 
                  disabled={!repaymentAmount || !repaymentBankId || isProcessingRepayment}
                >
                  {isProcessingRepayment ? "Processing..." : "Record Payment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Amortisation Schedule Dialog */}
          <Dialog open={amortOpen} onOpenChange={setAmortOpen}>
            <DialogContent className="sm:max-w-[900px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Loan Amortisation Schedule</DialogTitle>
                <DialogDescription>
                  Detailed breakdown of installments, interest, capital, and bank and accounting impact.
                </DialogDescription>
              </DialogHeader>
              {actionLoan && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Reference</span>
                      <div className="font-medium text-foreground">{actionLoan.reference}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Principal</span>
                      <div className="font-medium text-foreground">R {Number(actionLoan.principal || 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Interest rate (per annum)</span>
                      <div className="font-medium text-foreground">
                        {(Number(actionLoan.interest_rate || 0) * 100).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Term</span>
                      <div className="font-medium text-foreground">
                        {Number(actionLoan.term_months || 0)} months
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-semibold text-foreground">
                      Accounting and bank logic per installment
                    </p>
                    <p>
                      For each installment: <span className="font-medium">Debit Interest Expense</span> with the interest portion,
                      <span className="font-medium"> Debit Loan Liability</span> with the capital portion,
                      and <span className="font-medium">Credit Bank</span> with the full installment.
                    </p>
                    <p>
                      The Bank module is used to capture and allocate the actual payment against this schedule.
                    </p>
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-700 border-b border-slate-800">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="text-white text-center w-12">#</TableHead>
                          <TableHead className="text-white">Date</TableHead>
                          <TableHead className="text-white text-right">Opening</TableHead>
                          <TableHead className="text-white text-right">Installment</TableHead>
                          <TableHead className="text-white text-right">Interest</TableHead>
                          <TableHead className="text-white text-right">Capital</TableHead>
                          <TableHead className="text-white text-right">Closing</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const rows: {
                            period: number;
                            date: string;
                            opening: number;
                            installment: number;
                            interest: number;
                            capital: number;
                            closing: number;
                          }[] = [];
                          const annualRate = Number(actionLoan.interest_rate || 0);
                          const termMonths = Number(actionLoan.term_months || 0);
                          const principalAmount = Number(actionLoan.principal || 0);
                          const monthlyRate = annualRate / 12;
                          let scheduled =
                            actionLoan.monthly_repayment && actionLoan.monthly_repayment > 0
                              ? Number(actionLoan.monthly_repayment)
                              : monthlyRate === 0 || termMonths <= 0
                              ? termMonths > 0
                                ? principalAmount / termMonths
                                : principalAmount
                              : (principalAmount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
                                (Math.pow(1 + monthlyRate, termMonths) - 1);
                          if (!(scheduled > 0)) scheduled = 0;
                          let balance = principalAmount;
                          const start = new Date(actionLoan.start_date);
                          for (let i = 1; i <= termMonths && balance > 0.01; i++) {
                            const periodDate = new Date(start);
                            periodDate.setMonth(periodDate.getMonth() + (i - 1));
                            const opening = balance;
                            const interest = monthlyRate > 0 ? opening * monthlyRate : 0;
                            let capital = scheduled - interest;
                            if (capital > opening) capital = opening;
                            const closing = opening - capital;
                            rows.push({
                              period: i,
                              date: periodDate.toISOString().slice(0, 10),
                              opening,
                              installment: scheduled,
                              interest,
                              capital,
                              closing,
                            });
                            balance = closing;
                          }
                          if (rows.length === 0 && principalAmount > 0) {
                            rows.push({
                              period: 1,
                              date: actionLoan.start_date,
                              opening: principalAmount,
                              installment: principalAmount,
                              interest: 0,
                              capital: principalAmount,
                              closing: 0,
                            });
                          }
                          const pageSize = 10;
                          const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
                          const safePage = Math.min(Math.max(amortPage, 1), totalPages);
                          const startIndex = (safePage - 1) * pageSize;
                          const pageRows = rows.slice(startIndex, startIndex + pageSize);
                          return pageRows.map((r) => (
                            <TableRow key={r.period} className="hover:bg-blue-50/40">
                              <TableCell className="text-center text-xs">{r.period}</TableCell>
                              <TableCell className="text-xs">
                                {new Date(r.date).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                R {r.opening.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                R {r.installment.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                R {r.interest.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                R {r.capital.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                R {r.closing.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                  {(() => {
                    const annualRate = Number(actionLoan.interest_rate || 0);
                    const termMonths = Number(actionLoan.term_months || 0);
                    const principalAmount = Number(actionLoan.principal || 0);
                    const monthlyRate = annualRate / 12;
                    const rows: any[] = [];
                    let scheduled =
                      actionLoan.monthly_repayment && actionLoan.monthly_repayment > 0
                        ? Number(actionLoan.monthly_repayment)
                        : monthlyRate === 0 || termMonths <= 0
                        ? termMonths > 0
                          ? principalAmount / termMonths
                          : principalAmount
                        : (principalAmount * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
                          (Math.pow(1 + monthlyRate, termMonths) - 1);
                    if (!(scheduled > 0)) scheduled = 0;
                    let balance = principalAmount;
                    const start = new Date(actionLoan.start_date);
                    for (let i = 1; i <= termMonths && balance > 0.01; i++) {
                      const opening = balance;
                      const interest = monthlyRate > 0 ? opening * monthlyRate : 0;
                      let capital = scheduled - interest;
                      if (capital > opening) capital = opening;
                      const closing = opening - capital;
                      rows.push({ period: i });
                      balance = closing;
                    }
                    if (rows.length === 0 && principalAmount > 0) {
                      rows.push({ period: 1 });
                    }
                    const totalPages = Math.max(1, Math.ceil(rows.length / 10));
                    const safePage = Math.min(Math.max(amortPage, 1), totalPages);
                    return (
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                        <div>
                          Page {safePage} of {totalPages} (showing 10 installments per page)
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={safePage <= 1}
                            onClick={() => setAmortPage(p => Math.max(1, p - 1))}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={safePage >= totalPages}
                            onClick={() => setAmortPage(p => Math.min(totalPages, p + 1))}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => setAmortOpen(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Post Interest & Installment Dialog */}
          <Dialog open={postIntInstOpen} onOpenChange={setPostIntInstOpen}>
            <DialogContent className="sm:max-w-[650px]">
              <DialogHeader>
                <DialogTitle>Post interest &amp; installment</DialogTitle>
                <DialogDescription>
                  Review the loan and this month&#39;s installment before posting.
                </DialogDescription>
              </DialogHeader>
              {actionLoan && (
                <div className="grid gap-6 py-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-foreground">Loan details</h4>
                    <div className="text-sm text-muted-foreground space-y-1.5">
                      <div className="flex justify-between">
                        <span>Reference</span>
                        <span className="font-medium text-foreground">{actionLoan.reference}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Start date</span>
                        <span className="font-medium text-foreground">
                          {new Date(actionLoan.start_date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Type</span>
                        <span className="font-medium text-foreground">
                          {actionLoan.loan_type === "short" ? "Short-term (current liability)" : "Long-term (non-current liability)"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Principal</span>
                        <span className="font-medium text-foreground">
                          R {Number(actionLoan.principal || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Outstanding balance</span>
                        <span className="font-medium text-foreground">
                          R {Number(actionLoan.outstanding_balance || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Interest rate (per annum)</span>
                        <span className="font-medium text-foreground">
                          {(Number(actionLoan.interest_rate || 0) * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Term</span>
                        <span className="font-medium text-foreground">
                          {Number(actionLoan.term_months || 0)} months
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Posting date</span>
                        <span className="font-medium text-foreground">
                          <Input
                            type="date"
                            value={actionDate}
                            onChange={(e) => setActionDate(e.target.value)}
                            className="h-8 w-auto px-2 py-1"
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h4 className="font-semibold text-foreground">Installment breakdown</h4>
                    {(() => {
                      const annualRate = Number(actionLoan.interest_rate || 0);
                      const termMonths = Number(actionLoan.term_months || 0);
                      const principalAmount = Number(actionLoan.principal || 0);
                      const monthlyRate = annualRate / 12;
                      const scheduled =
                        actionLoan.monthly_repayment && actionLoan.monthly_repayment > 0
                          ? Number(actionLoan.monthly_repayment)
                          : monthlyRate === 0 || termMonths <= 0
                          ? termMonths > 0
                            ? principalAmount / termMonths
                            : principalAmount
                          : (principalAmount *
                              monthlyRate *
                              Math.pow(1 + monthlyRate, termMonths)) /
                            (Math.pow(1 + monthlyRate, termMonths) - 1);
                      const balance = Number(actionLoan.outstanding_balance || 0);
                      const interestPortion = balance * monthlyRate;
                      const capitalPortion = scheduled - interestPortion;
                      return (
                        <div className="text-sm text-muted-foreground space-y-2">
                          <div className="flex justify-between">
                            <span>Scheduled installment</span>
                            <span className="font-semibold text-foreground">
                              R {scheduled.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Interest portion</span>
                            <span className="font-medium text-foreground">
                              R {interestPortion.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Capital portion</span>
                            <span className="font-medium text-foreground">
                              R {capitalPortion.toFixed(2)}
                            </span>
                          </div>
                          <div className="mt-4 border rounded-md p-3 bg-muted/40 space-y-1.5">
                            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                              Posting preview
                            </p>
                            <p className="text-xs">
                              Debit interest expense with the interest portion.
                            </p>
                            <p className="text-xs">
                              Credit interest payable with the interest portion.
                            </p>
                            <p className="text-xs">
                              Debit long-term loan with the capital portion.
                            </p>
                            <p className="text-xs">
                              Credit short-term loan (current portion) with the capital portion.
                            </p>
                            <p className="text-xs text-orange-700 mt-1">
                              This posting does not affect the bank account. To allocate the installment and interest, use the Bank module to match the payment.
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPostIntInstOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    if (!actionLoan) return;
                    if (isDateLocked(actionDate)) {
                      setPostIntInstOpen(false);
                      setIsLockDialogOpen(true);
                      return;
                    }
                    try {
                      await transactionsApi.postLoanInstallmentAccrual({ loanId: actionLoan.id, date: actionDate });
                      setSuccessMessage('Interest and installment accrual posted successfully');
                      setIsSuccess(true);
                      setPostIntInstOpen(false);
                    } catch (err: any) {
                      const msg = String(err?.message || '');
                      if (msg.includes('Installment for this month is already posted')) {
                        setPostIntInstOpen(false);
                        setIsInstallmentDupDialogOpen(true);
                        return;
                      }
                      toast({ title: 'Error', description: msg, variant: 'destructive' });
                    }
                  }}
                >
                  Post installment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Success Dialog */}
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
          {/* Duplicate Installment Dialog */}
          <Dialog open={isInstallmentDupDialogOpen} onOpenChange={setIsInstallmentDupDialogOpen}>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Installment already posted for this month</DialogTitle>
                <DialogDescription>
                  The interest and current portion for this loan have already been posted for this month. 
                  To keep your books clean and make sure payment history allocates correctly to the right month,
                  the system only allows one interest and installment posting per month.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 text-sm text-muted-foreground">
                If you need to correct something, reverse the original posting or adjust in the correct period,
                instead of posting a second time for the same month.
              </div>
              <DialogFooter>
                <Button onClick={() => setIsInstallmentDupDialogOpen(false)}>Got it</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <FinancialYearLockDialog 
            open={isLockDialogOpen} 
            onOpenChange={setIsLockDialogOpen} 
          />
        </div>
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
      </DashboardLayout>
    </>
  );
}

function LoansDashboard({ companyId }: { companyId: string }) {
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0, interest: 0, outstanding: 0 });

  useEffect(() => {
    const load = async () => {
      if (!companyId) return;
      try {
        const { data: loans } = await supabase.from("loans" as any).select("id, status, outstanding_balance").eq("company_id", companyId);
        const { data: pays } = await supabase.from("loan_payments" as any).select("interest_component");
        const total = (loans || []).length;
        const active = (loans || []).filter((l: any) => l.status === 'active').length;
        const completed = (loans || []).filter((l: any) => l.status !== 'active').length;
        const outstanding = (loans || []).reduce((s: number, l: any) => s + (l.outstanding_balance || 0), 0);
        const interest = (pays || []).reduce((s: number, p: any) => s + (p.interest_component || 0), 0);
        setStats({ total, active, completed, interest, outstanding });
      } catch {
        setStats({ total: 0, active: 0, completed: 0, interest: 0, outstanding: 0 });
      }
    };
    load();
  }, [companyId]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Active Loans" 
          value={`${stats.active}`} 
          icon={Wallet} 
          color="from-emerald-500 to-emerald-600" 
          trend={`${stats.total} total loans`}
        />
        <MetricCard 
          title="Outstanding Balance" 
          value={`R ${stats.outstanding.toLocaleString()}`} 
          icon={BarChart3} 
          color="from-purple-500 to-purple-600" 
        />
        <MetricCard 
          title="Interest Paid" 
          value={`R ${stats.interest.toLocaleString()}`} 
          icon={Percent} 
          color="from-orange-500 to-orange-600" 
        />
        <MetricCard 
          title="Loans Closed" 
          value={`${stats.completed}`} 
          icon={History} 
          color="from-emerald-500 to-emerald-600" 
        />
      </div>
      <DirectorAssetLoansCard companyId={companyId} />
    </div>
  );
}

function DirectorAssetLoansCard({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<Array<{ ref: string; amount: number; date: string }>>([]);
  
  useEffect(() => {
    const load = async () => {
      if (!companyId) return;
      try {
        const { data: txs } = await supabase
          .from('transactions')
          .select('id, reference_number, transaction_date, total_amount, status')
          .eq('company_id', companyId)
          .like('reference_number', 'DIR-%')
          .in('status', ['approved','posted']);
        const list = (txs || []) as any[];
        if (list.length === 0) { setItems([]); return; }
        const { data: leds } = await supabase
          .from('ledger_entries')
          .select('transaction_id, account_id, debit')
          .in('transaction_id', list.map(t => t.id));
        
        const { data: accts } = await supabase.from('chart_of_accounts').select('id, account_type, account_name');
        const typeById = new Map<string,string>((accts || []).map((a: any) => [String(a.id), String(a.account_type || '').toLowerCase()]));
        const nameById = new Map<string,string>((accts || []).map((a: any) => [String(a.id), String(a.account_name || '').toLowerCase()]));
        
        const assetTxIds = new Set<string>();
        (leds || []).forEach((l: any) => {
          const type = typeById.get(String(l.account_id)) || '';
          const name = nameById.get(String(l.account_id)) || '';
          if (name.includes('loan') && type === 'asset' && l.debit > 0) assetTxIds.add(String(l.transaction_id));
        });
        
        const filtered = list.filter(t => assetTxIds.has(String(t.id))).map(t => ({ ref: String(t.reference_number || ''), amount: Number(t.total_amount || 0), date: String(t.transaction_date || '') }));
        setItems(filtered);
      } catch {
        setItems([]);
      }
    };
    load();
  }, [companyId]);

  return (
    <Card className="border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Director Loans (Assets)</CardTitle>
        <CardDescription>Loans provided to directors (Company Assets)</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No director asset loans recorded</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[#0070ad] hover:bg-[#0070ad]">
              <TableRow className="hover:bg-[#0070ad]">
                <TableHead className="text-white h-9">Reference</TableHead>
                <TableHead className="text-white h-9">Date</TableHead>
                <TableHead className="text-white h-9 text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.slice(0, 5).map((it, idx) => (
                <TableRow key={idx} className="hover:bg-muted/50">
                  <TableCell className="font-medium py-2">{it.ref}</TableCell>
                  <TableCell className="py-2">{it.date}</TableCell>
                  <TableCell className="text-right py-2">R {it.amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LoanList({ companyId, onOpenInterest, onOpenRepayment, onOpenPostIntInst, onOpenAmortisation }: { companyId: string; onOpenInterest: (loan: Loan) => void; onOpenRepayment: (loan: Loan) => void; onOpenPostIntInst: (loan: Loan) => void; onOpenAmortisation: (loan: Loan) => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("loans" as any).select("*").eq("company_id", companyId).order("start_date", { ascending: false });
      if (error) throw error;
      setItems((data || []) as any);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);
  
  useEffect(() => { if (companyId) load(); }, [companyId, load]);

  const filtered = useMemo(() => {
    return items.filter((l) => {
      if (String(l.reference || '').startsWith('DIR-')) return false;
      const matchesSearch = l.reference.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === 'all' || l.loan_type === filterType;
      return matchesSearch && matchesType;
    });
  }, [items, search, filterType]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search loans..."
              className="pl-9 bg-white border-gray-200 focus:border-[#2563eb] focus:ring-[#2563eb]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px] bg-white border-gray-200">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {filterType === 'all'
                    ? 'All Loans'
                    : filterType === 'short'
                    ? 'Short-term'
                    : 'Long-term'}
                </span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Loans</SelectItem>
              <SelectItem value="short">Short-term</SelectItem>
              <SelectItem value="long">Long-term</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading loans...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No loans found. Add a new loan to get started.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-700 border-b border-slate-800">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="text-white w-10">
                  <div className="w-4 h-4 rounded border border-slate-400 mx-auto" />
                </TableHead>
                <TableHead className="text-white">Reference</TableHead>
                <TableHead className="text-white">Start Date</TableHead>
                <TableHead className="text-white">Type</TableHead>
                <TableHead className="text-white">Principal</TableHead>
                <TableHead className="text-white">Balance</TableHead>
                <TableHead className="text-white">Status</TableHead>
                <TableHead className="text-white text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l, index) => (
                <TableRow
                  key={l.id}
                  className={`${
                    index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                  } hover:bg-blue-50/50`}
                >
                  <TableCell className="py-2">
                    <div className="w-4 h-4 rounded border border-emerald-400 mx-auto" />
                  </TableCell>
                  <TableCell className="py-2 font-medium text-[#2563eb]">
                    {l.reference}
                  </TableCell>
                  <TableCell className="py-2 text-gray-600">
                    {new Date(l.start_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="py-2 text-gray-600 capitalize">
                    {l.loan_type === "short" ? "Short-term" : "Long-term"}
                  </TableCell>
                  <TableCell className="py-2 text-gray-600">
                    R {l.principal.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-2 text-gray-900 font-semibold">
                    R {l.outstanding_balance.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    {l.status === "active" ? (
                      <Check className="h-5 w-5 text-green-500 mx-auto" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[#2563eb] hover:text-[#1d4ed8] hover:bg-blue-50"
                        >
                          Actions <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpenInterest(l)}>
                          Record Interest
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOpenRepayment(l)}>
                          Record Repayment
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOpenPostIntInst(l)}>
                          Post int &amp; inst
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onOpenAmortisation(l)}>
                          Amortisation
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function LoanPayments({ companyId }: { companyId: string }) {
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("loan_payments" as any)
        .select(`*, loans!inner(reference, loan_type, principal, interest_rate, term_months, monthly_repayment, start_date)`)
        .eq("loans.company_id", companyId)
        .order("payment_date", { ascending: false });
      setPayments((data || []) as any);
      setLoading(false);
    };
    if (companyId) load();
  }, [companyId]);

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      {loading ? (
        <div className="py-8 text-center">Loading...</div>
      ) : payments.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No payment history found
        </div>
      ) : (
        <Table>
          <TableHeader className="bg-slate-700 border-b border-slate-800">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="text-white">Date</TableHead>
              <TableHead className="text-white">Loan Ref</TableHead>
              <TableHead className="text-white">Accrued interest</TableHead>
              <TableHead className="text-white">Current portion</TableHead>
              <TableHead className="text-white">Actual paid</TableHead>
              <TableHead className="text-white">Installment balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p, index) => {
              const loan: any = (p as any).loans || {};
              const annualRate = Number(loan.interest_rate || 0);
              const termMonths = Number(loan.term_months || 0);
              const principalAmount = Number(loan.principal || 0);
              const monthlyRate = annualRate / 12;
              let scheduled = 0;
              if (Number(loan.monthly_repayment || 0) > 0) {
                scheduled = Number(loan.monthly_repayment || 0);
              } else if (monthlyRate === 0 || termMonths <= 0) {
                scheduled = termMonths > 0 ? principalAmount / termMonths : principalAmount;
              } else {
                const r = monthlyRate;
                const n = termMonths;
                scheduled = (principalAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
              }
              let accruedInterest = 0;
              let currentPortion = 0;
              if (scheduled > 0 && principalAmount > 0 && termMonths > 0 && monthlyRate >= 0) {
                const start = new Date(loan.start_date);
                const payDate = new Date(p.payment_date);
                const monthsDiff = (payDate.getFullYear() - start.getFullYear()) * 12 + (payDate.getMonth() - start.getMonth());
                const periodIndex = Math.max(0, Math.min(monthsDiff, termMonths - 1));
                let balance = principalAmount;
                for (let i = 0; i <= periodIndex && balance > 0.0001; i++) {
                  const opening = balance;
                  const interest = monthlyRate > 0 ? opening * monthlyRate : 0;
                  let capital = scheduled - interest;
                  if (capital > opening) capital = opening;
                  const closing = opening - capital;
                  if (i === periodIndex) {
                    accruedInterest = interest;
                    currentPortion = capital;
                    break;
                  }
                  balance = closing;
                }
              }
              const actualPaid = p.amount;
              const installmentBalance = Math.max(0, accruedInterest + currentPortion - actualPaid);
              return (
                <TableRow
                  key={p.id}
                  className={`${
                    index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                  } hover:bg-blue-50/50`}
                >
                  <TableCell className="py-2">
                    {new Date(p.payment_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="py-2 text-[#2563eb] font-medium">
                    {(p as any).loans?.reference}
                  </TableCell>
                  <TableCell className="text-gray-600 py-2">
                    R {accruedInterest.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-gray-600 py-2">
                    R {currentPortion.toFixed(2)}
                  </TableCell>
                  <TableCell className="font-medium py-2">
                    R {actualPaid.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-gray-600 py-2">
                    R {installmentBalance.toFixed(2)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function DirectorLoansList({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Loan[]>([]);
  const [banks, setBanks] = useState<Array<{ id: string; account_name: string }>>([]);
  const [actionLoan, setActionLoan] = useState<Loan | null>(null);
  const [interestOpen, setInterestOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [postIntInstOpen, setPostIntInstOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [bankId, setBankId] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Operation completed successfully");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");

  useEffect(() => {
    if (companyId) {
      supabase.from("loans" as any).select("*").eq("company_id", companyId).like("reference", "DIR-%").order("start_date", { ascending: false })
        .then(({ data }) => setItems((data || []) as any));
      supabase.from("bank_accounts" as any).select("id, account_name").eq("company_id", companyId)
        .then(({ data }) => setBanks(((data || []) as any[]).filter(b => b && typeof b.id === 'string')));
    }
  }, [companyId]);

  return (
    <>
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        {items.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No director loans found
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-700 border-b border-slate-800">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="text-white">Reference</TableHead>
                <TableHead className="text-white">Type</TableHead>
                <TableHead className="text-white">Start Date</TableHead>
                <TableHead className="text-white">Director</TableHead>
                <TableHead className="text-white">Principal</TableHead>
                <TableHead className="text-white">Balance</TableHead>
                <TableHead className="text-white">Status</TableHead>
                <TableHead className="text-white text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((l, index) => (
                <TableRow
                  key={l.id}
                  className={`${
                    index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                  } hover:bg-blue-50/50`}
                >
                  <TableCell className="py-2 text-[#2563eb] font-medium">
                    {l.reference}
                  </TableCell>
                  <TableCell className="py-2 text-gray-600">
                    {l.loan_type === 'short' ? 'Liability' : 'Asset'}
                  </TableCell>
                  <TableCell className="py-2 text-gray-600">
                    {new Date(l.start_date).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="py-2 text-gray-600">
                    -
                  </TableCell>
                  <TableCell className="py-2 text-gray-600">
                    R {l.principal.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-2 text-gray-900 font-semibold">
                    R {l.outstanding_balance.toFixed(2)}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    {l.status === "active" ? (
                      <Check className="h-5 w-5 text-green-500 mx-auto" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[#2563eb] hover:text-[#1d4ed8] hover:bg-blue-50"
                        >
                          Actions <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            setInterestOpen(true);
                          }}
                        >
                          Interest Received
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setPaymentOpen(true);
                          }}
                        >
                          Payment Received
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setActionLoan(l);
                            setDate(new Date().toISOString().slice(0, 10));
                            setPostIntInstOpen(true);
                          }}
                        >
                          Post int &amp; inst
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Director Interest Warning Dialog */}
      <Dialog open={interestOpen} onOpenChange={setInterestOpen}>
        <DialogContent className="sm:max-w-[480px] bg-red-50 border-red-200">
          <DialogHeader className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-xl text-center text-red-700">
              Caution: Pay director loan interest via Banking
            </DialogTitle>
            <DialogDescription className="text-center text-base font-medium text-foreground mt-2">
              Interest payments on director loans must be captured and allocated through the Banking module, not from the Director Loans screen.
            </DialogDescription>
            <div className="w-full p-2 bg-red-100 rounded text-sm text-red-700 text-center mt-1">
              This keeps your bank reconciliation clean and prevents double posting of interest.
            </div>
          </DialogHeader>
          <DialogFooter className="sm:justify-center mt-4">
            <Button
              onClick={() => setInterestOpen(false)}
              className="bg-red-600 hover:bg-red-700 text-white min-w-[120px]"
            >
              I understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Director Payment Warning Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-[480px] bg-red-50 border-red-200">
          <DialogHeader className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-2">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <DialogTitle className="text-xl text-center text-red-700">
              Caution: Pay director installments via Banking
            </DialogTitle>
            <DialogDescription className="text-center text-base font-medium text-foreground mt-2">
              Director loan installments must be paid and allocated from the Banking module so that payments match the bank statement.
            </DialogDescription>
            <div className="w-full p-2 bg-red-100 rounded text-sm text-red-700 text-center mt-1">
              This protects proper accounting, keeps your bank reconciliation accurate, and avoids double posting.
            </div>
          </DialogHeader>
          <DialogFooter className="sm:justify-center mt-4">
            <Button
              onClick={() => setPaymentOpen(false)}
              className="bg-red-600 hover:bg-red-700 text-white min-w-[120px]"
            >
              I understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Post Interest & Installment Dialog */}
      <Dialog open={postIntInstOpen} onOpenChange={setPostIntInstOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Post interest and installment</DialogTitle>
            <DialogDescription>
              Preview how this director loan installment will be accrued in the ledger. This does not move money in the bank.
            </DialogDescription>
          </DialogHeader>
          {actionLoan && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Reference</p>
                  <p className="font-medium">{actionLoan.reference}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Type</p>
                  <p className="font-medium">
                    {actionLoan.loan_type === 'short' ? 'Director loan (liability)' : 'Director loan (asset)'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Start date</p>
                  <p>{new Date(actionLoan.start_date).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Outstanding balance</p>
                  <p className="font-semibold">R {actionLoan.outstanding_balance.toFixed(2)}</p>
                </div>
              </div>
              <div className="mt-1">
                {(() => {
                  const annualRate = Number(actionLoan.interest_rate || 0);
                  const termMonths = Number(actionLoan.term_months || 0);
                  const principalAmount = Number(actionLoan.principal || 0);
                  const monthlyRate = annualRate / 12;
                  const scheduled =
                    actionLoan.monthly_repayment && actionLoan.monthly_repayment > 0
                      ? Number(actionLoan.monthly_repayment)
                      : monthlyRate === 0 || termMonths <= 0
                      ? termMonths > 0
                        ? principalAmount / termMonths
                        : principalAmount
                      : (principalAmount *
                          monthlyRate *
                          Math.pow(1 + monthlyRate, termMonths)) /
                        (Math.pow(1 + monthlyRate, termMonths) - 1);
                  const balance = Number(actionLoan.outstanding_balance || 0);
                  const interestPortion = balance * monthlyRate;
                  const capitalPortion = scheduled - interestPortion;
                  return (
                    <div className="text-sm text-muted-foreground space-y-2">
                      <div className="flex justify-between">
                        <span>Scheduled installment</span>
                        <span className="font-semibold text-foreground">
                          R {scheduled.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Interest portion (this month)</span>
                        <span className="font-medium text-foreground">
                          R {interestPortion.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Capital portion</span>
                        <span className="font-medium text-foreground">
                          R {capitalPortion.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <Separator />
              {actionLoan.loan_type === 'short' ? (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-foreground">How this affects the books (director loan liability)</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Accrues interest expense on the director loan for this month.</li>
                    <li>Credits interest payable owed to the director.</li>
                    <li>Does not change the principal balance. Capital will only reduce when payments are recorded.</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-foreground">How this affects the books (director loan asset)</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Recognises interest income on the director loan for this month.</li>
                    <li>Raises an interest receivable from the director as a current asset.</li>
                    <li>Does not change the principal balance. Capital will only reduce when payments are recorded.</li>
                  </ul>
                </div>
              )}
              <div className="mt-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-800">
                This posting does not touch the bank account. To allocate what the director actually paid, use the Banking module and match the payment against this loan.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostIntInstOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!actionLoan) return;
                try {
                  await transactionsApi.postDirectorLoanInstallmentAccrual({ loanId: actionLoan.id, date });
                  toast({ title: 'Interest and installment posted successfully' });
                  setPostIntInstOpen(false);
                } catch (e: any) {
                  toast({ title: 'Error', description: e.message });
                }
              }}
            >
              Post installment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Success Dialog */}
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
    </>
  );
}

function LoanReports({ companyId }: { companyId: string }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<LoanPayment[]>([]);

  useEffect(() => {
    if (companyId) {
      supabase.from("loans" as any).select("*").eq("company_id", companyId).then(({ data }) => setLoans((data || []) as any));
      supabase.from("loan_payments" as any).select("*").then(({ data }) => setPayments((data || []) as any));
    }
  }, [companyId]);

  const totals = {
    interest: payments.reduce((s, p) => s + (p.interest_component || 0), 0),
    exposure: loans.reduce((s, l) => s + (l.outstanding_balance || 0), 0),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard title="Total Interest Paid" value={`R ${totals.interest.toFixed(2)}`} icon={Percent} color="from-orange-500 to-orange-600" />
        <MetricCard title="Total Exposure" value={`R ${totals.exposure.toFixed(2)}`} icon={TrendingUp} color="from-red-500 to-red-600" />
      </div>
      <Card>
        <CardHeader><CardTitle>Summary Report</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.slice(0, 10).map(l => (
                <TableRow key={l.id}>
                  <TableCell>{l.reference}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{l.status}</Badge></TableCell>
                  <TableCell className="text-right font-mono">R {l.outstanding_balance.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
