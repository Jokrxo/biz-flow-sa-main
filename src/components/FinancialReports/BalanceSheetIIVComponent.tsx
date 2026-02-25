
import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Download, FileText, Filter, RefreshCw, Calendar, ArrowLeftRight, ChevronDown, ChevronRight, Calculator, TrendingUp, TrendingDown, DollarSign, PieChart, Activity, Layers, FileDown, CheckCircle2, HelpCircle, Info, Star, ArrowLeft, Loader2, Scale, History, BarChart3, FileSpreadsheet } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, addMonths, subYears, getYear, parseISO, isValid } from 'date-fns';
import { useToast } from "@/components/ui/use-toast";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { exportFinancialReportToExcel, exportFinancialReportToPDF, exportComparativeBalanceSheetToExcel, exportComparativeBalanceSheetToPDF } from "@/lib/export-utils";
import { PPEStatement } from './PPEStatement';

// Lazy load Monthly Report to improve initial render
// const MonthlyAFSReport = lazy(() => import('./MonthlyAFSReport'));

// --- Types ---
interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance?: string;
  total_debits?: number;
  total_credits?: number;
  balance: number;
}

interface AccountingEquation {
  assets: number;
  liabilities: number;
  equity: number;
  is_valid: boolean;
  difference: number;
}

interface BalanceSheetFilterPayload {
  asAt: string;
  compareYear: boolean;
  periods: string[];
  level: number;
}

interface BalanceSheetFilterProps {
  onApply: (payload: BalanceSheetFilterPayload) => void;
  availableYears: number[];
  availablePeriods: string[];
  maxLevels: number;
}

const BalanceSheetFilterBar = ({ onApply, availablePeriods, maxLevels }: BalanceSheetFilterProps) => {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [compareYear, setCompareYear] = useState(false);
  const [showPeriods, setShowPeriods] = useState<string[]>([]);
  const [detailLevel, setDetailLevel] = useState(1);

  const togglePeriod = (period: string) => {
    setShowPeriods(prev =>
      prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period]
    );
  };

  const handleApply = () => {
    onApply({
      asAt: selectedDate,
      compareYear,
      periods: showPeriods,
      level: detailLevel,
    });
  };

  return (
    <div
      className="p-3 bg-white border border-gray-300 rounded-lg space-y-4 text-sm"
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      <div className="space-y-1">
        <div className="text-xs font-semibold">As At:</div>
        <Input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="h-9"
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={compareYear}
          onCheckedChange={v => setCompareYear(!!v)}
        />
        <span className="text-sm font-semibold">Compare Year</span>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold">Select Months/Periods</div>
        <div className="grid grid-cols-3 gap-2">
          {availablePeriods.map(period => {
            const active = showPeriods.includes(period);
            return (
              <button
                key={period}
                type="button"
                onClick={() => togglePeriod(period)}
                className={`flex items-center gap-2 px-2 py-1 rounded border text-xs ${
                  active
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-muted/40 border-muted-foreground/20 text-muted-foreground"
                }`}
              >
                <Checkbox checked={active} className="h-3 w-3" />
                <span className="truncate">{period}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-1">
        <div className="text-xs font-semibold">Detail Level</div>
        <Input
          type="number"
          min={1}
          max={maxLevels}
          value={detailLevel}
          onChange={e => {
            const raw = e.target.value;
            const parsed = parseInt(raw || "1", 10);
            if (Number.isNaN(parsed)) {
              return;
            }
            const clamped = Math.min(maxLevels, Math.max(1, parsed));
            setDetailLevel(clamped);
          }}
          className="h-9"
        />
      </div>
      <div>
        <Button className="w-full" onClick={handleApply}>
          Apply Filters
        </Button>
      </div>
    </div>
  );
};

interface CashFlowFilterProps {
  onApply: (payload: BalanceSheetFilterPayload) => void;
  availablePeriods: string[];
  maxLevels: number;
}

const CashFlowFilterBar = ({ onApply, availablePeriods, maxLevels }: CashFlowFilterProps) => {
  const today = format(new Date(), "yyyy-MM-dd");
  const [asAt, setAsAt] = useState<string>(today);
  const [compareYear, setCompareYear] = useState(false);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [detailLevel, setDetailLevel] = useState(1);

  const togglePeriod = (value: string) => {
    setSelectedPeriods(prev =>
      prev.includes(value) ? prev.filter(p => p !== value) : [...prev, value]
    );
  };

  const handleApply = () => {
    onApply({
      asAt,
      compareYear,
      periods: selectedPeriods,
      level: detailLevel,
    });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4 text-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            As at date
          </Label>
          <Input
            type="date"
            value={asAt}
            onChange={e => setAsAt(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-2 pt-5 sm:pt-7">
          <Checkbox
            checked={compareYear}
            onCheckedChange={v => setCompareYear(!!v)}
            className="h-4 w-4"
          />
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Year-on-year view
            </span>
            <span className="text-[11px] text-muted-foreground">
              Show current year cash flow against previous year
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          Additional months for comparison
        </Label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {availablePeriods.map(period => {
            const active = selectedPeriods.includes(period);
            return (
              <button
                key={period}
                type="button"
                onClick={() => togglePeriod(period)}
                className={`flex items-center justify-between rounded-md border px-2 py-1 text-xs ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted-foreground/20 bg-muted/40 text-muted-foreground hover:border-primary/60 hover:text-primary"
                }`}
              >
                <span className="truncate">{period}</span>
                <Checkbox checked={active} className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          Detail level
        </Label>
        <Input
          type="number"
          min={1}
          max={maxLevels}
          value={detailLevel}
          onChange={e => {
            const value = e.target.value;
            const parsed = parseInt(value || "1", 10);
            if (Number.isNaN(parsed)) return;
            const clamped = Math.min(maxLevels, Math.max(1, parsed));
            setDetailLevel(clamped);
          }}
          className="h-9 w-24"
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleApply}>
          Apply Filters
        </Button>
      </div>
    </div>
  );
};

interface NotesFilterProps {
  onApply: (payload: BalanceSheetFilterPayload) => void;
  maxLevels: number;
}

const NotesFilterBar = ({ onApply, maxLevels }: NotesFilterProps) => {
  const today = format(new Date(), "yyyy-MM-dd");
  const [asAt, setAsAt] = useState<string>(today);
  const [compareYear, setCompareYear] = useState(false);
  const [detailLevel, setDetailLevel] = useState(1);

  const handleApply = () => {
    onApply({
      asAt,
      compareYear,
      periods: [],
      level: detailLevel,
    });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4 text-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            As at date
          </Label>
          <Input
            type="date"
            value={asAt}
            onChange={e => setAsAt(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-2 pt-5 sm:pt-7">
          <Checkbox
            checked={compareYear}
            onCheckedChange={v => setCompareYear(!!v)}
            className="h-4 w-4"
          />
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Comparative notes
            </span>
            <span className="text-[11px] text-muted-foreground">
              Show notes for current year and previous year
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
          Detail level
        </Label>
        <Input
          type="number"
          min={1}
          max={maxLevels}
          value={detailLevel}
          onChange={e => {
            const value = e.target.value;
            const parsed = parseInt(value || "1", 10);
            if (Number.isNaN(parsed)) return;
            const clamped = Math.min(maxLevels, Math.max(1, parsed));
            setDetailLevel(clamped);
          }}
          className="h-9 w-24"
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={handleApply}>
          Apply Filters
        </Button>
      </div>
    </div>
  );
};

export interface BalanceSheetIIVComponentProps {
  companyId?: string;
  periodStart?: string;
  periodEnd?: string;
  title?: string;
  subtitle?: string;
  variant?: 'balance-sheet' | 'income' | 'cash-flow' | 'ifrs-notes' | 'retained-earnings';
}

// --- Constants & Helpers ---
const DEFAULT_FISCAL_START_MONTH = 2; // March (0-indexed? No, 1=Jan usually. Let's assume 1=Jan. Actually code uses 2 for March usually implies 0=Jan, 1=Feb, 2=Mar. Wait. 
// Standard SA tax year starts 1 March.
// If 1=Jan, 3=March.
// Let's check logic: getFiscalYearDates uses fiscalStartMonth.

const SAGE_COLOR = '#0070ad'; // Sage Blue

// Loading Overlay Component
const SageLoadingOverlay = ({ message = "Loading...", progress }: { message?: string, progress?: number }) => (
  <div className="fixed inset-0 bg-white/70 z-[9999] flex flex-col items-center justify-center p-4 pointer-events-none">
    <div className="bg-white p-6 rounded-xl shadow-2xl border border-slate-100 max-w-sm w-full text-center space-y-4">
      <div className="relative w-16 h-16 mx-auto">
        <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-[#0070ad] rounded-full border-t-transparent animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Activity className="h-6 w-6 text-[#0070ad] animate-pulse" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-800">{message}</h3>
        <p className="text-sm text-slate-500">Processing financial data...</p>
      </div>
      {progress !== undefined && (
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-[#0070ad] h-full transition-all duration-300 ease-out rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  </div>
);

export const BalanceSheetIIVComponent = ({ companyId: propCompanyId, periodStart: propStart, periodEnd: propEnd, title = "GAAP Financial Statements", subtitle = "Statement of Financial Position", variant = 'balance-sheet' }: BalanceSheetIIVComponentProps = {}) => {
  const { toast } = useToast();
  
  // --- State ---
  const [activeTab, setActiveTab] = useState<string>('balance-sheet'); // Default to Balance Sheet
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isDataReady, setDataLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("Synced");
  const [showFilters, setShowFilters] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf' | null>(null);
  const [exportMode, setExportMode] = useState<'month' | 'compare' | 'range'>('month');
  const [exportMonth, setExportMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [exportRangeStart, setExportRangeStart] = useState<string>(format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [exportRangeEnd, setExportRangeEnd] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [companyId, setCompanyId] = useState<string | null>(propCompanyId || null);
  const [companyName, setCompanyName] = useState<string>("");
  
  // Period Selection
  const [periodMode, setPeriodMode] = useState<'monthly' | 'annual'>('annual');
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<number>(new Date().getFullYear());
  const [defaultFiscalYear, setDefaultFiscalYear] = useState<number>(new Date().getFullYear());
  const [fiscalStartMonth, setFiscalStartMonth] = useState<number>(3); // Default March (3)
  const [lockFiscalYear, setLockFiscalYear] = useState(false); // If true, forces fiscal year view

  // Data
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [trialBalanceAsOf, setTrialBalanceAsOf] = useState<TrialBalanceRow[]>([]);
  const [accountingEquation, setAccountingEquation] = useState<AccountingEquation | null>(null);
  const [retainedOpeningYTD, setRetainedOpeningYTD] = useState(0);
  const [netProfitPeriod, setNetProfitPeriod] = useState(0);
  const [openingEquityTotal, setOpeningEquityTotal] = useState(0);
  const [vatPayableAsOf, setVatPayableAsOf] = useState(0);
  const [vatReceivableAsOf, setVatReceivableAsOf] = useState(0);
  const [ppeValueFromModule, setPpeValueFromModule] = useState(0);
  const [depExpensePeriod, setDepExpensePeriod] = useState(0);
  const [fallbackCOGS, setFallbackCOGS] = useState(0);
  
  // Cash Flow specific
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [cashFlowLoading, setCashFlowLoading] = useState(false);
  const [ppeDisposalProceeds, setPpeDisposalProceeds] = useState(0);
  const [investingPurchasesCurr, setInvestingPurchasesCurr] = useState(0);
  const [investingProceedsCurr, setInvestingProceedsCurr] = useState(0);
  const [loanFinancedAcqCurr, setLoanFinancedAcqCurr] = useState(0);

  // Comparative
  const [comparativeYearA, setComparativeYearA] = useState<number>(new Date().getFullYear());
  const [comparativeYearB, setComparativeYearB] = useState<number>(new Date().getFullYear() - 1);
  const [trialBalanceCompAsOfA, setTrialBalanceCompAsOfA] = useState<TrialBalanceRow[]>([]);
  const [trialBalanceCompAsOfB, setTrialBalanceCompAsOfB] = useState<TrialBalanceRow[]>([]);
  const [trialBalancePrev, setTrialBalancePrev] = useState<TrialBalanceRow[]>([]); // Period movement for Year B
  const [trialBalancePrevPrev, setTrialBalancePrevPrev] = useState<TrialBalanceRow[]>([]); // For cash flow prev year
  const [comparativeLoading, setComparativeLoading] = useState(false);
  const [fallbackCOGSPrev, setFallbackCOGSPrev] = useState(0);
  const [compDepCurr, setCompDepCurr] = useState(0);
  const [compDepPrev, setCompDepPrev] = useState(0);
  const [cashFlowCurrComparative, setCashFlowCurrComparative] = useState<any>(null);
  const [cashFlowPrev, setCashFlowPrev] = useState<any>(null);
  const [investingPurchasesPrev, setInvestingPurchasesPrev] = useState(0);
  const [investingProceedsPrev, setInvestingProceedsPrev] = useState(0);
  const [loanFinancedAcqPrev, setLoanFinancedAcqPrev] = useState(0);

  const [exportCompareMonths, setExportCompareMonths] = useState<number[]>([]);
  const [exportCompareMode, setExportCompareMode] = useState<'year' | 'month'>('year');

  // Monthly AFS
  const [monthlyAFSData, setMonthlyAFSData] = useState<any[]>([]);
  const [monthlyAFSLoading, setMonthlyAFSLoading] = useState(false);
  const [monthlyAFSError, setMonthlyAFSError] = useState<string | null>(null);

  // Drilldown
  const [drilldownAccount, setDrilldownAccount] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [showPPEDialog, setShowPPEDialog] = useState(false);
  const [cashFlowDrillKey, setCashFlowDrillKey] = useState<string | null>(null);

  // Trace
  const [traceLabel, setTraceLabel] = useState<string | null>(null);
  const [traceResolved, setTraceResolved] = useState<TrialBalanceRow | null>(null);
  const [traceCFMonthly, setTraceCFMonthly] = useState<Record<string, number> | null>(null);
  const [traceCFLoading, setTraceCFLoading] = useState(false);

  // Advice
  const [showAdviceModal, setShowAdviceModal] = useState(false);
  const [systemOverview, setSystemOverview] = useState("");
  const [accountingPrimer, setAccountingPrimer] = useState("");
  
  const [unallocatedTxCount, setUnallocatedTxCount] = useState<number | null>(null);

  const UnallocatedWarningBanner = () => {
    if (unallocatedTxCount === null) return null;
    if (unallocatedTxCount > 0) {
      return (
        <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500" />
            <div>
              <AlertTitle className="text-sm font-semibold">Some transactions still need allocating</AlertTitle>
              <AlertDescription className="text-xs">
                There are {unallocatedTxCount} transactions that are not yet allocated. Until you
                finish allocating them, this report may not fully reflect your actual position.
              </AlertDescription>
            </div>
          </div>
        </Alert>
      );
    }
    return (
      <Alert className="mb-6 border-emerald-300 bg-emerald-50 text-emerald-900">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500" />
          <div>
            <AlertTitle className="text-sm font-semibold">All transactions are allocated</AlertTitle>
            <AlertDescription className="text-xs">
              All transactions are allocated and your report includes all transactions. If your AFS do not
              balance, please verify all the journals.
            </AlertDescription>
          </div>
        </div>
      </Alert>
    );
  };

  const [balanceSheetCompareEnabled, setBalanceSheetCompareEnabled] = useState(false);
  const [balanceSheetSelectedMonths, setBalanceSheetSelectedMonths] = useState<string[]>([]);
  const [balanceSheetMonthSnapshots, setBalanceSheetMonthSnapshots] = useState<{ label: string; tb: TrialBalanceRow[] }[]>([]);
  const [balanceSheetMultiLoading, setBalanceSheetMultiLoading] = useState(false);

  const [incomeCompareEnabled, setIncomeCompareEnabled] = useState(false);
  const [incomeSelectedMonths, setIncomeSelectedMonths] = useState<string[]>([]);
  const [incomeMonthSnapshots, setIncomeMonthSnapshots] = useState<{ label: string; tb: TrialBalanceRow[] }[]>([]);
  const [incomeMultiLoading, setIncomeMultiLoading] = useState(false);

  const [cashFlowCompareEnabled, setCashFlowCompareEnabled] = useState(false);
  const [cashFlowSelectedMonths, setCashFlowSelectedMonths] = useState<string[]>([]);
  const [cashFlowMonthSnapshots, setCashFlowMonthSnapshots] = useState<{ label: string; cf: {
    operating_inflows: number;
    operating_outflows: number;
    net_cash_from_operations: number;
    investing_inflows: number;
    investing_outflows: number;
    net_cash_from_investing: number;
    financing_inflows: number;
    financing_outflows: number;
    net_cash_from_financing: number;
    opening_cash_balance: number;
    closing_cash_balance: number;
    net_change_in_cash: number;
  } }[]>([]);
  const [cashFlowMultiLoading, setCashFlowMultiLoading] = useState(false);

  const [notesCompareEnabled, setNotesCompareEnabled] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  const [retainedCompareEnabled, setRetainedCompareEnabled] = useState(false);
  const [retainedSelectedMonths, setRetainedSelectedMonths] = useState<string[]>([]);
  const [retainedMonthSnapshots, setRetainedMonthSnapshots] = useState<{
    label: string;
    opening: number;
    profit: number;
    dividends: number;
    drawings: number;
    closing: number;
  }[]>([]);
  const [retainedMultiLoading, setRetainedMultiLoading] = useState(false);

  const balanceSheetPeriodOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), 'MMMM'));
  }, []);

  const hideControls = !!propStart;
  const hideBackToMenu = !!propStart;

  const handleOpenExportDialog = (formatType: 'excel' | 'pdf') => {
    setExportFormat(formatType);
    if (periodMode === 'monthly') {
      setExportMonth(selectedMonth);
      const [y, m] = selectedMonth.split('-');
      const monthIndex = parseInt(m, 10) - 1;
      const start = startOfMonth(new Date(parseInt(y, 10), monthIndex));
      const end = endOfMonth(new Date(parseInt(y, 10), monthIndex));
      setExportRangeStart(format(start, 'yyyy-MM-dd'));
      setExportRangeEnd(format(end, 'yyyy-MM-dd'));
      setExportCompareMonths([monthIndex]);
    } else {
      const { startDate, endDate } = getFiscalYearDates(selectedYear);
      setExportRangeStart(format(startDate, 'yyyy-MM-dd'));
      setExportRangeEnd(format(endDate, 'yyyy-MM-dd'));
      setExportCompareMonths(Array.from({ length: 12 }, (_, idx) => idx));
    }
    setExportMode('month');
    setExportCompareMode('year');
    setShowExportDialog(true);
  };

  const handleConfirmExport = async () => {
    if (!exportFormat) {
      setShowExportDialog(false);
      return;
    }

    try {
      setShowExportDialog(false);
      let activeCompanyId = companyId;
      if (!activeCompanyId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('company_id')
            .eq('user_id', user.id)
            .maybeSingle();
          if (profile?.company_id) {
            setCompanyId(profile.company_id);
            activeCompanyId = profile.company_id;
          }
        }
      }

      if (!activeCompanyId) {
        toast({
          title: "Export error",
          description: "No company selected for export.",
          variant: "destructive",
        });
        return;
      }

      if (exportMode === 'compare') {
        const baseYear =
          periodMode === 'monthly'
            ? parseInt(selectedMonth.split('-')[0], 10)
            : selectedYear;
        const prevYear = baseYear - 1;

        let monthsToUse = exportCompareMonths;
        if (exportCompareMode === 'year') {
          monthsToUse = Array.from({ length: 12 }, (_, idx) => idx);
        }
        if (!monthsToUse.length) {
          const defaultMonthIndex =
            periodMode === 'monthly'
              ? Math.max(0, Math.min(11, parseInt(selectedMonth.split('-')[1] || '1', 10) - 1))
              : new Date().getMonth();
          monthsToUse = [defaultMonthIndex];
        }

        const map = new Map<string, { label: string; yearA: number; yearB: number }>();

        for (const monthIndex of monthsToUse) {
          const endA = endOfMonth(new Date(baseYear, monthIndex, 1));
          const endB = endOfMonth(new Date(prevYear, monthIndex, 1));

          const endStrA = format(endA, 'yyyy-MM-dd');
          const endStrB = format(endB, 'yyyy-MM-dd');

          const tbA = await fetchTrialBalanceAsOf(activeCompanyId, endStrA);
          const tbB = await fetchTrialBalanceAsOf(activeCompanyId, endStrB);

          const pushRow = (row: any, isBase: boolean) => {
            const code = String(row.account_code || '');
            const name = String(row.account_name || '');
            if (!code && !name) return;
            const key = code || name;
            const label = `${code} ${name}`.trim();
            const entry = map.get(key) || { label, yearA: 0, yearB: 0 };
            if (isBase) {
              entry.yearA += Number(row.balance || 0);
            } else {
              entry.yearB += Number(row.balance || 0);
            }
            map.set(key, entry);
          };

          (tbA || []).forEach(r => pushRow(r, true));
          (tbB || []).forEach(r => pushRow(r, false));
        }

        const rows = Array.from(map.values()).map(r => {
          const percent = r.yearB === 0 ? undefined : ((r.yearA - r.yearB) / Math.abs(r.yearB)) * 100;
          return {
            label: r.label,
            yearA: r.yearA,
            yearB: r.yearB,
            percent,
          };
        });

        if (!rows.length) {
          toast({
            title: "No data to compare",
            description: "There is no balance sheet data for the selected years/months.",
            variant: "destructive",
          });
          return;
        }

        rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

        const firstMonth = monthsToUse[0];
        const endAFirst = endOfMonth(new Date(baseYear, firstMonth, 1));
        const endBFirst = endOfMonth(new Date(prevYear, firstMonth, 1));
        const filename =
          exportCompareMode === 'year'
            ? `Balance_Sheet_Comparative_${baseYear}_vs_${prevYear}`
            : `Balance_Sheet_Comparative_${format(endAFirst, 'yyyyMM')}_vs_${format(endBFirst, 'yyyyMM')}`;

        if (exportFormat === 'excel') {
          exportComparativeBalanceSheetToExcel(rows as any, baseYear, prevYear, filename);
        } else {
          exportComparativeBalanceSheetToPDF(rows as any, baseYear, prevYear, filename);
        }

        toast({
          title: exportFormat === 'excel' ? "Excel exported" : "PDF exported",
          description:
            exportCompareMode === 'year'
              ? `Comparing full year ${baseYear} vs ${prevYear}`
              : `Comparing selected months ${baseYear} vs ${prevYear}`,
        });
        return;
      }

      let startStr = exportRangeStart;
      let endStr = exportRangeEnd;
      let periodLabel = "";

      if (exportMode === 'month') {
        const baseMonthStr = exportMonth || selectedMonth || format(new Date(), 'yyyy-MM');
        const [yearStr, monthStr] = baseMonthStr.split('-');
        const year = parseInt(yearStr || String(new Date().getFullYear()), 10);
        const month = Math.max(0, Math.min(11, parseInt(monthStr || String(new Date().getMonth() + 1), 10) - 1));
        const start = startOfMonth(new Date(year, month, 1));
        const end = endOfMonth(new Date(year, month, 1));
        startStr = format(start, 'yyyy-MM-dd');
        endStr = format(end, 'yyyy-MM-dd');
        periodLabel = `As at ${format(end, 'dd MMMM yyyy')}`;
      } else {
        if (!exportRangeStart || !exportRangeEnd) {
          toast({
            title: "Export error",
            description: "Please select a valid date range.",
            variant: "destructive",
          });
          return;
        }
        const start = new Date(exportRangeStart);
        const end = new Date(exportRangeEnd);
        end.setHours(23, 59, 59, 999);
        startStr = format(start, 'yyyy-MM-dd');
        endStr = format(end, 'yyyy-MM-dd');
        periodLabel = `${format(start, 'dd MMM yyyy')} to ${format(end, 'dd MMM yyyy')}`;
      }

      const tbAsOf = await fetchTrialBalanceAsOf(activeCompanyId, endStr);
      const toLower = (s: string) => String(s || '').toLowerCase();

      const assetsAll = tbAsOf.filter(r => toLower(r.account_type) === 'asset');
      const nonCurrentAssets = assetsAll.filter(r => {
        const code = parseInt(String(r.account_code || '0'), 10);
        const name = toLower(r.account_name || '');
        if (name.includes('inventory') || name.includes('stock')) return false;
        if (name.includes('receivable') || name.includes('debtor')) return false;
        if (name.includes('cash') || name.includes('bank') || name.includes('petty')) return false;
        if (name.includes('vat input') || name.includes('vat receivable')) return false;
        if (code >= 1500 && code < 2000) return true;
        if (name.includes('equipment') || name.includes('vehicle') || name.includes('property') || name.includes('machinery') || name.includes('computer')) return true;
        if (name.includes('investment') || name.includes('loan')) return true;
        return false;
      });
      const currentAssets = assetsAll.filter(r => !nonCurrentAssets.includes(r));

      const equityAll = tbAsOf.filter(r => toLower(r.account_type) === 'equity');
      const liabilitiesAll = tbAsOf.filter(r => toLower(r.account_type) === 'liability');

      const nonCurrentLiabilities = liabilitiesAll.filter(r => {
        const code = parseInt(String(r.account_code || '0'), 10);
        const name = toLower(r.account_name || '');
        if (code >= 2300 && code < 2500) return true;
        if (name.includes('long term') || name.includes('mortgage') || name.includes('bond')) return true;
        if (name.includes('loan from owner')) return true;
        return false;
      });
      const currentLiabilities = liabilitiesAll.filter(r => !nonCurrentLiabilities.includes(r));

      const totalNonCurrentAssets = nonCurrentAssets.reduce((s, r) => s + Number(r.balance || 0), 0);
      const totalCurrentAssets = currentAssets.reduce((s, r) => s + Number(r.balance || 0), 0);
      const totalAssets = totalNonCurrentAssets + totalCurrentAssets;

      const totalEquity = equityAll.reduce((s, r) => s + Number(r.balance || 0), 0);
      const totalNonCurrentLiabilities = nonCurrentLiabilities.reduce((s, r) => s + Number(r.balance || 0), 0);
      const totalCurrentLiabilities = currentLiabilities.reduce((s, r) => s + Number(r.balance || 0), 0);
      const totalEquityAndLiabilities = totalEquity + totalNonCurrentLiabilities + totalCurrentLiabilities;

      const data: { account: string; amount: number; type?: string }[] = [];

      data.push({ account: 'ASSETS', amount: 0, type: 'main-header' });
      data.push({ account: 'Non-current assets', amount: 0, type: 'sub-header' });
      nonCurrentAssets.forEach(r => {
        data.push({
          account: `${r.account_code} - ${r.account_name}`,
          amount: Number(r.balance || 0),
          type: 'asset',
        });
      });
      data.push({ account: 'Total non-current assets', amount: totalNonCurrentAssets, type: 'subtotal' });

      data.push({ account: 'Current assets', amount: 0, type: 'sub-header' });
      currentAssets.forEach(r => {
        data.push({
          account: `${r.account_code} - ${r.account_name}`,
          amount: Number(r.balance || 0),
          type: 'asset',
        });
      });
      data.push({ account: 'Total current assets', amount: totalCurrentAssets, type: 'subtotal' });
      data.push({ account: 'TOTAL ASSETS', amount: totalAssets, type: 'total' });

      data.push({ account: 'EQUITY AND LIABILITIES', amount: 0, type: 'main-header' });
      data.push({ account: 'Equity', amount: 0, type: 'sub-header' });
      equityAll.forEach(r => {
        data.push({
          account: `${r.account_code} - ${r.account_name}`,
          amount: Number(r.balance || 0),
          type: 'equity',
        });
      });
      data.push({ account: 'Total equity', amount: totalEquity, type: 'subtotal' });

      data.push({ account: 'Non-current liabilities', amount: 0, type: 'sub-header' });
      nonCurrentLiabilities.forEach(r => {
        data.push({
          account: `${r.account_code} - ${r.account_name}`,
          amount: Number(r.balance || 0),
          type: 'liability',
        });
      });
      data.push({ account: 'Total non-current liabilities', amount: totalNonCurrentLiabilities, type: 'subtotal' });

      data.push({ account: 'Current liabilities', amount: 0, type: 'sub-header' });
      currentLiabilities.forEach(r => {
        data.push({
          account: `${r.account_code} - ${r.account_name}`,
          amount: Number(r.balance || 0),
          type: 'liability',
        });
      });
      data.push({ account: 'Total current liabilities', amount: totalCurrentLiabilities, type: 'subtotal' });
      data.push({ account: 'Total equity and liabilities', amount: totalEquityAndLiabilities, type: 'final' });

      const reportName = 'Balance Sheet';
      const safeEnd = endStr.replace(/-/g, '');
      const filename =
        exportMode === 'range'
          ? `Balance_Sheet_${startStr}_to_${endStr}`.replace(/-/g, '')
          : `Balance_Sheet_${safeEnd}`;

      if (exportFormat === 'excel') {
        exportFinancialReportToExcel(data, reportName, filename);
      } else {
        exportFinancialReportToPDF(data, reportName, periodLabel, filename);
      }

      toast({
        title: exportFormat === 'excel' ? "Excel exported" : "PDF exported",
        description: periodLabel,
      });
    } catch (err: any) {
      toast({
        title: "Export failed",
        description: err?.message || "Unable to export balance sheet.",
        variant: "destructive",
      });
    } finally {
      setShowExportDialog(false);
    }
  };

  const getFiscalYearDates = (year: number) => {
    const start = new Date(year - 1, fiscalStartMonth - 1, 1);
    const end = endOfMonth(new Date(year, fiscalStartMonth - 2, 1));
    return { startDate: start, endDate: end };
  };

  const currentPeriodDates = useMemo(() => {
    if (propStart && propEnd) return { start: propStart, end: propEnd };
    
    if (periodMode === 'monthly') {
      const [y, m] = selectedMonth.split('-');
      const start = startOfMonth(new Date(parseInt(y), parseInt(m) - 1));
      const end = endOfMonth(new Date(parseInt(y), parseInt(m) - 1));
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    } else {
      const { startDate, endDate } = getFiscalYearDates(selectedYear);
      return { start: format(startDate, 'yyyy-MM-dd'), end: format(endDate, 'yyyy-MM-dd') };
    }
  }, [periodMode, selectedMonth, selectedYear, fiscalStartMonth, propStart, propEnd]);

  const periodStart = currentPeriodDates.start;
  const periodEnd = currentPeriodDates.end;

  // --- Effects ---

  useEffect(() => {
    const init = async () => {
      try {
        let activeCompanyId = companyId;

        if (!activeCompanyId) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('company_id')
              .eq('user_id', user.id)
              .maybeSingle();
            if (profile?.company_id) {
              setCompanyId(profile.company_id);
              activeCompanyId = profile.company_id;
            } else {
              toast({
                title: "Profile Error",
                description: "No company profile found for your account.",
                variant: "destructive",
              });
              setLoading(false);
              setDataLoaded(true);
            }
          } else {
            setLoading(false);
            setDataLoaded(true);
          }
        }

        if (activeCompanyId) {
          const { data: settings } = await (supabase as any)
            .from('app_settings')
            .select('fiscal_year_start')
            .eq('company_id', activeCompanyId)
            .maybeSingle();
          if (settings?.fiscal_year_start) {
            const m = Number(settings.fiscal_year_start);
            setFiscalStartMonth(m >= 1 && m <= 12 ? m : fiscalStartMonth);
          }

          const { data: company } = await supabase
            .from('companies')
            .select('name')
            .eq('id', activeCompanyId)
            .maybeSingle();
          if (company?.name) {
            setCompanyName(company.name);
          }
        }
      } catch (e) {
        console.error("Init error", e);
        setLoading(false);
        setDataLoaded(true);
      }
    };
    init();
  }, [companyId, fiscalStartMonth, toast]);

  useEffect(() => {
    const checkUnallocated = async () => {
      if (!companyId) return;
      try {
        const { count, error } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .in('status', ['pending', 'unposted']);
        if (!error) {
          setUnallocatedTxCount(typeof count === 'number' ? count : 0);
        }
      } catch (e) {
        console.error('Failed to check unallocated transactions for reports', e);
      }
    };
    checkUnallocated();
  }, [companyId]);

  // Data Loading Logic
  // We use a simple cache to avoid re-fetching if parameters haven't changed, but 
  // we must ensure we re-fetch if they DO change.
  const financialReportsCache = useMemo(() => new Map<string, any>(), []);

  const deepEqual = useCallback((obj1: any, obj2: any) => {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
  }, []);

  const isPeriodReady = useMemo(() => {
    return companyId && periodStart && periodEnd;
  }, [companyId, periodStart, periodEnd]);

  // Main Data Loader
  const loadFinancialData = useCallback(async () => {
    if (!isPeriodReady || !companyId) return;
    
    // Check cache
    const cacheKey = `main-${companyId}-${periodStart}-${periodEnd}`;
    if (financialReportsCache.has(cacheKey) && isDataReady) {
       // Already loaded
       return;
    }

    setLoading(true);
    setLoadingProgress(10);
    setSyncStatus("Syncing...");

    try {
      // 1. Fetch Trial Balance (Period Movement)
      // This is for Income Statement (Revenue, Expenses)
      const tbPeriod = await fetchTrialBalanceForPeriod(companyId, periodStart, periodEnd);
      setTrialBalance(tbPeriod);
      setLoadingProgress(40);

      // 2. Fetch Trial Balance (As Of End Date)
      // This is for Balance Sheet (Assets, Liabilities, Equity)
      const tbAsOf = await fetchTrialBalanceAsOf(companyId, periodEnd);
      setTrialBalanceAsOf(tbAsOf);
      setLoadingProgress(60);

      // 3. Calculate Key Figures
      const assets = tbAsOf.filter(r => r.account_type.toLowerCase() === 'asset').reduce((sum, r) => sum + r.balance, 0);
      const liabilities = tbAsOf.filter(r => r.account_type.toLowerCase() === 'liability').reduce((sum, r) => sum + r.balance, 0);
      const equity = tbAsOf.filter(r => r.account_type.toLowerCase() === 'equity').reduce((sum, r) => sum + r.balance, 0);
      
      // Net Profit for Period
      const revenue = tbPeriod.filter(r => r.account_type.toLowerCase() === 'revenue' || r.account_type.toLowerCase() === 'income').reduce((sum, r) => sum + r.balance, 0);
      const expenses = tbPeriod.filter(r => r.account_type.toLowerCase() === 'expense').reduce((sum, r) => sum + r.balance, 0);
      const netProfit = revenue - expenses;
      setNetProfitPeriod(netProfit);

      // VAT
      const vatPayableRow = tbAsOf.find(r => r.account_name.toLowerCase().includes('vat output') || r.account_name.toLowerCase().includes('vat payable'));
      const vatReceivableRow = tbAsOf.find(r => r.account_name.toLowerCase().includes('vat input') || r.account_name.toLowerCase().includes('vat receivable'));
      setVatPayableAsOf(vatPayableRow?.balance || 0);
      setVatReceivableAsOf(vatReceivableRow?.balance || 0);

      // COGS Fallback
      const cogs = await calculateCOGSFromInvoices(companyId, periodStart, periodEnd);
      setFallbackCOGS(cogs);

      // Depreciation
      const dep = tbPeriod.filter(r => r.account_name.toLowerCase().includes('depreciation')).reduce((sum, r) => sum + r.balance, 0);
      setDepExpensePeriod(dep);

      // Accounting Equation Check
      // Assets = Liabilities + Equity + Net Profit (if equity doesn't include current period profit yet)
      // Usually, Retained Earnings in TB As Of might be opening or closing depending on system.
      // In this system, 'ledger_entries' are raw. 'trialBalanceAsOf' sums all history.
      // So Equity in 'tbAsOf' includes all past profit (Retained Earnings) + Current Year movements in Equity accounts.
      // However, Revenue/Expense accounts are NOT in Equity type in 'tbAsOf' usually? 
      // Wait. fetchTrialBalanceAsOf returns ALL accounts.
      // Assets (Dr) = Liabilities (Cr) + Equity (Cr) + Income (Cr) - Expenses (Dr)
      // So Assets - Liabilities - Equity - (Income - Expenses) = 0
      
      const incomeAsOf = tbAsOf.filter(r => r.account_type.toLowerCase() === 'revenue' || r.account_type.toLowerCase() === 'income').reduce((sum, r) => sum + r.balance, 0);
      const expenseAsOf = tbAsOf.filter(r => r.account_type.toLowerCase() === 'expense').reduce((sum, r) => sum + r.balance, 0);
      const retainedEarnings = incomeAsOf - expenseAsOf; // Lifetime retained earnings?
      // Actually, 'tbAsOf' sums ALL transactions.
      // So: Assets (positive) - Liabilities (positive) - Equity (positive) - Revenue (positive) + Expenses (positive) ?
      // Depends on sign convention.
      // Our fetcher returns positive balances usually.
      // Natural Debit: Asset, Expense. Natural Credit: Liab, Equity, Revenue.
      // fetchTrialBalanceAsOf logic:
      // naturalDebit ? (Debit - Credit) : (Credit - Debit).
      // So ALL returned balances are positive if they match natural state.
      // Equation: Assets + Expenses = Liabilities + Equity + Revenue
      
      const totalDebits = assets + expenseAsOf;
      const totalCredits = liabilities + equity + incomeAsOf;
      const diff = totalDebits - totalCredits;
      
      setAccountingEquation({
        assets: totalDebits,
        liabilities: 0, // placeholder
        equity: totalCredits,
        is_valid: Math.abs(diff) < 1.0,
        difference: diff
      });

      if (periodMode === 'monthly') {
        const prevRes = await fetchTrialBalanceAsOf(companyId, format(new Date(new Date(periodStart).setDate(0)), 'yyyy-MM-dd')); // Day 0 of month = last day of prev month
        const prevRev = prevRes.filter(r => r.account_type === 'revenue' || r.account_type === 'income').reduce((s,r) => s+r.balance, 0);
        const prevExp = prevRes.filter(r => r.account_type === 'expense').reduce((s,r) => s+r.balance, 0);
        setRetainedOpeningYTD(prevRev - prevExp);
      } else {
        // Annual
        // Opening Equity is usually 0 if we close books, or it's the RE from previous years.
        // We'll calculate it dynamically in the report render.
      }

      setLoadingProgress(100);
      setDataLoaded(true);
      setSyncStatus("Synced");
      
      // Cache
      financialReportsCache.set(cacheKey, {
        tbPeriod, tbAsOf, netProfit, vatPayable: vatPayableRow?.balance, vatReceivable: vatReceivableRow?.balance
      });

    } catch (error) {
      console.error("Load data error", error);
      toast({ title: "Error loading data", description: "Could not fetch financial data.", variant: "destructive" });
      setSyncStatus("Error");
      setDataLoaded(true); // Ensure overlay is removed even on error so user can see the problem
    } finally {
      setLoading(false);
    }
  }, [isPeriodReady, companyId, periodStart, periodEnd, periodMode, toast, financialReportsCache, isDataReady]);

  // Comparative Data Loader
  const loadComparativeData = useCallback(async () => {
    if (!companyId) return;
    setComparativeLoading(true);
    try {
      const { startDate: startA, endDate: endA } = getFiscalYearDates(comparativeYearA);
      const { startDate: startB, endDate: endB } = getFiscalYearDates(comparativeYearB);
      
      const pStartA = format(startA, 'yyyy-MM-dd');
      const pEndA = format(endA, 'yyyy-MM-dd');
      const pStartB = format(startB, 'yyyy-MM-dd');
      const pEndB = format(endB, 'yyyy-MM-dd');

      // Year A (Current)
      const tbA = await fetchTrialBalanceAsOf(companyId, pEndA);
      setTrialBalanceCompAsOfA(tbA);
      
      // Year B (Previous)
      const tbB = await fetchTrialBalanceAsOf(companyId, pEndB);
      setTrialBalanceCompAsOfB(tbB);
      
      // Period Movements for Income Statement
      const tbMovB = await fetchTrialBalanceForPeriod(companyId, pStartB, pEndB);
      setTrialBalancePrev(tbMovB);
      
      const tbMovPrevPrev = await fetchTrialBalanceForPeriod(companyId, format(subYears(startB, 1), 'yyyy-MM-dd'), format(subYears(endB, 1), 'yyyy-MM-dd'));
      setTrialBalancePrevPrev(tbMovPrevPrev);

      // COGS
      const cogsA = await calculateCOGSFromInvoices(companyId, pStartA, pEndA);
      const cogsB = await calculateCOGSFromInvoices(companyId, pStartB, pEndB);
      setFallbackCOGS(cogsA); // Update main state too? Maybe not.
      setFallbackCOGSPrev(cogsB);

      // Depreciation
      const depA = (await fetchTrialBalanceForPeriod(companyId, pStartA, pEndA))
        .filter(r => r.account_name.toLowerCase().includes('depreciation'))
        .reduce((s, r) => s + r.balance, 0);
      const depB = tbMovB
        .filter(r => r.account_name.toLowerCase().includes('depreciation'))
        .reduce((s, r) => s + r.balance, 0);
      setCompDepCurr(depA);
      setCompDepPrev(depB);

      // Cash Flow
      const cfA = await getCashFlowForPeriod(companyId, pStartA, pEndA);
      const cfB = await getCashFlowForPeriod(companyId, pStartB, pEndB);
      setCashFlowCurrComparative(cfA);
      setCashFlowPrev(cfB);

      // PPE Movement for CF
      // Need purchases and disposals. Hard to get exactly without proper asset register module.
      // Approximate: Increase in Cost = Purchases. Decrease = Disposals.
      // We need AsOf at start and end.
      const getPPECost = (tb: TrialBalanceRow[]) => tb.filter(r => r.account_type === 'asset' && parseInt(r.account_code) >= 1500 && !r.account_name.includes('Accumulated')).reduce((s,r) => s+r.balance, 0);
      
      const tbStartA = await fetchTrialBalanceAsOf(companyId, format(subMonths(startA, 1), 'yyyy-MM-dd')); // End of prev year
      const tbStartB = await fetchTrialBalanceAsOf(companyId, format(subMonths(startB, 1), 'yyyy-MM-dd'));
      
      const ppeEndA = getPPECost(tbA);
      const ppeStartA = getPPECost(tbStartA);
      const ppeChangeA = ppeEndA - ppeStartA;
      
      const ppeEndB = getPPECost(tbB);
      const ppeStartB = getPPECost(tbStartB);
      const ppeChangeB = ppeEndB - ppeStartB;
      
      setInvestingPurchasesCurr(Math.max(0, ppeChangeA));
      setInvestingPurchasesPrev(Math.max(0, ppeChangeB));
      // Proceeds? Assume 0 unless we find "Profit on disposal"
      // If Profit on Disposal exists, we can try to back-calculate, but it's tricky.
      // Let's assume Proceeds = 0 for now or use the heuristic from main CF loader.
      
    } catch (e) {
      console.error("Comparative load error", e);
    } finally {
      setComparativeLoading(false);
    }
  }, [companyId, comparativeYearA, comparativeYearB]);

  useEffect(() => {
    if (!companyId) return;
    if (!balanceSheetCompareEnabled) return;
    if (!comparativeYearA || !comparativeYearB) return;
    loadComparativeData();
  }, [companyId, balanceSheetCompareEnabled, comparativeYearA, comparativeYearB, loadComparativeData]);

  // Monthly Report Loader
  const loadMonthlyAFS = useCallback(async () => {
    if (!companyId || activeTab !== 'monthly-report') return;
    setMonthlyAFSLoading(true);
    setMonthlyAFSError(null);
    try {
      // Determine range: If annual, show all 12 months. If monthly, show just that month? 
      // Usually Monthly Report implies a 12-month spread.
      const { startDate, endDate } = getFiscalYearDates(selectedYear);
      
      // We need to fetch data for EACH month.
      const months = [];
      let iter = new Date(startDate);
      while (iter <= endDate) {
        months.push(new Date(iter));
        iter = addMonths(iter, 1);
      }

      // Parallel fetch? might be too heavy. Sequential for now.
      const results = [];
      for (const mStart of months) {
        const mEnd = endOfMonth(mStart);
        const s = format(mStart, 'yyyy-MM-dd');
        const e = format(mEnd, 'yyyy-MM-dd');
        
        const [bs, pl, cf, audit] = await Promise.all([
          supabase.rpc('generate_balance_sheet_json' as any, { _company_id: companyId, _as_of_date: e }),
          supabase.rpc('generate_income_statement_json' as any, { _company_id: companyId, _start_date: s, _end_date: e }),
          getCashFlowForPeriod(companyId, s, e),
          supabase.rpc('audit_financial_period' as any, { _company_id: companyId, _period_start: s, _period_end: e })
        ]);

        const bsData: any = bs?.data || {};
        const plData: any = pl?.data || {};

        results.push({
          month: s,
          label: format(mStart, 'MMM yy'),
          bs: bsData,
          bsDetail: bsData.details || {},
          pl: plData,
          plDetail: plData.details || {},
          cf: cf || {},
          audit: audit?.data || {}
        });
      }
      setMonthlyAFSData(results);

    } catch (e: any) {
      console.error("Monthly AFS Error", e);
      setMonthlyAFSError(e.message);
    } finally {
      setMonthlyAFSLoading(false);
    }
  }, [companyId, activeTab, selectedYear]);

  // Cash Flow Loader
  const loadCashFlow = useCallback(async () => {
    if (!isPeriodReady || !companyId) return;
    
    // Check cache
    const cid = `cf-${companyId}-${periodStart}-${periodEnd}`;
    const cached = financialReportsCache.get(cid);
    const cachedLoaded = !!cached;
    
    if (cachedLoaded) {
      setCashFlow(cached);
      return;
    }

    setCashFlowLoading(true);
    setSyncStatus("Syncing...");

    try {
      let finalCF: any = null;
      
      const { data, error } = await (supabase as any).rpc('get_cash_flow_statement', {
        _company_id: companyId,
        _period_start: periodStart,
        _period_end: periodEnd
      });

      const rows: any[] = Array.isArray(data) ? (data as any[]) : [];

      if (!error && rows.length > 0) {
        finalCF = rows[0];
      } else {
        const local = await computeCashFlowFallback(companyId, periodStart, periodEnd);
        finalCF = local;
      }

      // If we got data, we might need to enrich it (e.g. Opening Balance if RPC didn't return it correctly)
      if (finalCF) {
        if (!finalCF.opening_cash_balance) {
          const open = await computeOpeningCashOnly(companyId, periodStart);
          finalCF.opening_cash_balance = open;
          finalCF.closing_cash_balance = open + (finalCF.net_change_in_cash || 0);
        } else {
          // No data; compute local fallback
          const local = await computeCashFlowFallback(companyId, periodStart, periodEnd);
          finalCF = local;
        }
      }


      if (finalCF) {
        setCashFlow(prev => deepEqual(prev, finalCF) ? prev : finalCF);
        financialReportsCache.set(
          cid,
          finalCF
        );
        setSyncStatus("Up to date");
      }
    } catch (e: any) {
      console.warn('Cash flow load error', e);
      if (cachedLoaded) {
        setSyncStatus("Offline – showing last synced data");
      } else {
        setSyncStatus("Offline");
      }
    } finally {
      setCashFlowLoading(false);
    }
  }, [isPeriodReady, periodStart, periodEnd, companyId, deepEqual]);

  useEffect(() => {
    if (selectedYear) {
      setComparativeYearA(selectedYear);
      setComparativeYearB(selectedYear - 1);
    }
  }, [selectedYear]);

  // MOVED FROM TOP: Load effects
  useEffect(() => {
    if (activeTab === 'cash-flow' || variant === 'cash-flow') {
      loadCashFlow();
    }
  }, [activeTab, variant, periodStart, periodEnd, loadCashFlow]);
  useEffect(() => { if (activeTab === 'comparative') { loadComparativeData(); } }, [activeTab, comparativeYearA, comparativeYearB, fiscalStartMonth, loadComparativeData]);
  useEffect(() => {
    if (periodMode === 'annual' && activeTab === 'cash-flow') {
      loadComparativeData();
    }
  }, [activeTab, periodMode, selectedYear, loadComparativeData]);
  useEffect(() => { loadMonthlyAFS(); }, [loadMonthlyAFS]);

  useEffect(() => {
    // Reset dataLoaded when activeTab, periodStart, periodEnd, or companyId changes
    // This forces the "full loading" state (skeleton) to show again
    setDataLoaded(false);
  }, [activeTab, periodStart, periodEnd, companyId]);

  useEffect(() => {
    if (activeTab === 'balance-sheet' || activeTab === 'income' || activeTab === '' || activeTab === 'ifrs-notes') {
      loadFinancialData();
    }
  }, [activeTab, isPeriodReady, periodStart, periodEnd, loadFinancialData]);

  const handleDrilldown = async (accountId: string, accountName: string) => {
    setDrilldownAccount(accountName);
    try {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('id, entry_date, description, debit, credit, reference_id')
        .eq('account_id', accountId)
        .gte('entry_date', periodStart)
        .lte('entry_date', periodEnd)
        .order('entry_date', { ascending: false });

      if (error) throw error;
      setLedgerEntries(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBalanceSheetFilterApply = (filters: BalanceSheetFilterPayload) => {
    const asAtDate = filters.asAt ? new Date(filters.asAt) : new Date();
    const monthString = format(asAtDate, "yyyy-MM");
    const year = asAtDate.getFullYear();
    setPeriodMode("monthly");
    setSelectedMonth(monthString);
    setSelectedYear(year);
    setSelectedFiscalYear(year);
    setBalanceSheetCompareEnabled(!!filters.compareYear);
    setBalanceSheetSelectedMonths(filters.periods || []);
    setBalanceSheetMonthSnapshots([]);

    if (filters.compareYear) {
      setComparativeYearA(year);
      setComparativeYearB(year - 1);
    }

    if (filters.periods && filters.periods.length > 0 && companyId) {
      setBalanceSheetMultiLoading(true);
      const monthNames = filters.periods.slice();
      (async () => {
        try {
          const snapshots: { label: string; tb: TrialBalanceRow[] }[] = [];
          for (const name of monthNames) {
            const monthIndex = new Date(`${name} 1, ${year}`).getMonth();
            const end = endOfMonth(new Date(year, monthIndex, 1));
            const endStr = format(end, "yyyy-MM-dd");
            const tb = await fetchTrialBalanceAsOf(companyId, endStr);
            snapshots.push({
              label: format(end, "MMM yy"),
              tb,
            });
          }
          setBalanceSheetMonthSnapshots(snapshots);
        } finally {
          setBalanceSheetMultiLoading(false);
        }
      })();
    }

    setDataLoaded(false);
    setLoading(true);
    setShowFilters(false);
  };

  const handleIncomeFilterApply = (filters: BalanceSheetFilterPayload) => {
    const asAtDate = filters.asAt ? new Date(filters.asAt) : new Date();
    const monthString = format(asAtDate, "yyyy-MM");
    const year = asAtDate.getFullYear();
    setPeriodMode("monthly");
    setSelectedMonth(monthString);
    setSelectedYear(year);
    setSelectedFiscalYear(year);
    setIncomeCompareEnabled(!!filters.compareYear);
    setIncomeSelectedMonths(filters.periods || []);
    setIncomeMonthSnapshots([]);

    if (filters.compareYear) {
      setComparativeYearA(year);
      setComparativeYearB(year - 1);
      loadComparativeData();
    }

    if (filters.periods && filters.periods.length > 0 && companyId) {
      setIncomeMultiLoading(true);
      const monthNames = filters.periods.slice();
      (async () => {
        try {
          const snapshots: { label: string; tb: TrialBalanceRow[] }[] = [];
          for (const name of monthNames) {
            const monthIndex = new Date(`${name} 1, ${year}`).getMonth();
            const start = startOfMonth(new Date(year, monthIndex, 1));
            const end = endOfMonth(new Date(year, monthIndex, 1));
            const s = format(start, "yyyy-MM-dd");
            const e = format(end, "yyyy-MM-dd");
            const tb = await fetchTrialBalanceForPeriod(companyId, s, e);
            snapshots.push({
              label: format(end, "MMM yy"),
              tb,
            });
          }
          setIncomeMonthSnapshots(snapshots);
        } finally {
          setIncomeMultiLoading(false);
        }
      })();
    }

    setDataLoaded(false);
    setLoading(true);
    setShowFilters(false);
  };

  const handleCashFlowFilterApply = (filters: BalanceSheetFilterPayload) => {
    const asAtDate = filters.asAt ? new Date(filters.asAt) : new Date();
    const monthString = format(asAtDate, "yyyy-MM");
    const year = asAtDate.getFullYear();
    setPeriodMode("monthly");
    setSelectedMonth(monthString);
    setSelectedYear(year);
    setSelectedFiscalYear(year);

    setCashFlowCompareEnabled(!!filters.compareYear);
    setCashFlowSelectedMonths(filters.periods || []);
    setCashFlowMonthSnapshots([]);

    if (filters.compareYear) {
      setComparativeYearA(year);
      setComparativeYearB(year - 1);
      loadComparativeData();
    }

    if (filters.periods && filters.periods.length > 0 && companyId) {
      setCashFlowMultiLoading(true);
      const monthNames = filters.periods.slice();
      (async () => {
        try {
          const snapshots: { label: string; cf: {
            operating_inflows: number;
            operating_outflows: number;
            net_cash_from_operations: number;
            investing_inflows: number;
            investing_outflows: number;
            net_cash_from_investing: number;
            financing_inflows: number;
            financing_outflows: number;
            net_cash_from_financing: number;
            opening_cash_balance: number;
            closing_cash_balance: number;
            net_change_in_cash: number;
          } }[] = [];
          for (const name of monthNames) {
            const monthIndex = new Date(`${name} 1, ${year}`).getMonth();
            const start = startOfMonth(new Date(year, monthIndex, 1));
            const end = endOfMonth(new Date(year, monthIndex, 1));
            const s = format(start, "yyyy-MM-dd");
            const e = format(end, "yyyy-MM-dd");
            const cfPeriod = await getCashFlowForPeriod(companyId, s, e);
            snapshots.push({
              label: format(end, "MMM yy"),
              cf: cfPeriod,
            });
          }
          setCashFlowMonthSnapshots(snapshots);
        } finally {
          setCashFlowMultiLoading(false);
        }
      })();
    }

    setDataLoaded(false);
    setLoading(true);
    setShowFilters(false);
  };

  const handleRetainedEarningsFilterApply = (filters: BalanceSheetFilterPayload) => {
    const asAtDate = filters.asAt ? new Date(filters.asAt) : new Date();
    const monthString = format(asAtDate, "yyyy-MM");
    const year = asAtDate.getFullYear();
    setPeriodMode("monthly");
    setSelectedMonth(monthString);
    setSelectedYear(year);
    setSelectedFiscalYear(year);
    setRetainedCompareEnabled(!!filters.compareYear);
    setRetainedSelectedMonths(filters.periods || []);
    setRetainedMonthSnapshots([]);

    if (filters.compareYear) {
      setComparativeYearA(year);
      setComparativeYearB(year - 1);
      loadComparativeData();
    }

    if (filters.periods && filters.periods.length > 0 && companyId) {
      setRetainedMultiLoading(true);
      const monthNames = filters.periods.slice();
      (async () => {
        try {
          const snaps: {
            label: string;
            opening: number;
            profit: number;
            dividends: number;
            drawings: number;
            closing: number;
          }[] = [];
          for (const name of monthNames) {
            const monthIndex = new Date(`${name} 1, ${year}`).getMonth();
            const start = startOfMonth(new Date(year, monthIndex, 1));
            const end = endOfMonth(new Date(year, monthIndex, 1));
            const s = format(start, "yyyy-MM-dd");
            const e = format(end, "yyyy-MM-dd");
            const tbMovement = await fetchTrialBalanceForPeriod(companyId, s, e);
            const tbAsOf = await fetchTrialBalanceAsOf(companyId, e);

            const sumTb = (arr: TrialBalanceRow[]) =>
              arr.reduce((sum, r) => sum + Number(r.balance || 0), 0);
            const toLower = (val: string) => String(val || "").toLowerCase();

            const revenue = tbMovement.filter(
              r =>
                toLower(r.account_type) === "revenue" ||
                toLower(r.account_type) === "income"
            );
            const expenses = tbMovement.filter(
              r => toLower(r.account_type) === "expense"
            );
            const costOfSales = expenses.filter(
              r =>
                toLower(r.account_name).includes("cost of") ||
                String(r.account_code || "").startsWith("50")
            );
            const operatingExpenses = expenses
              .filter(r => !costOfSales.includes(r))
              .filter(r => !toLower(r.account_name).includes("vat"))
              .filter(
                r =>
                  !(
                    String(r.account_code || "") === "5600" ||
                    toLower(r.account_name).includes("depreciation")
                  )
              );

            const totalRevenue = sumTb(revenue);
            const totalCostOfSales = sumTb(costOfSales);
            const grossProfit = totalRevenue - totalCostOfSales;
            const totalOperatingExpenses = sumTb(operatingExpenses);
            const netProfit = grossProfit - totalOperatingExpenses;

            const dividendsDuring = tbMovement
              .filter(
                r =>
                  toLower(r.account_type) === "equity" &&
                  (String(r.account_code || "") === "3500" ||
                    toLower(r.account_name).includes("dividend"))
              )
              .reduce(
                (sum, r) => sum + Math.abs(Number(r.balance || 0)),
                0
              );

            const drawingsDuring = tbMovement
              .filter(
                r =>
                  toLower(r.account_type) === "equity" &&
                  (String(r.account_code || "") === "3400" ||
                    toLower(r.account_name).includes("drawings"))
              )
              .reduce(
                (sum, r) => sum + Math.abs(Number(r.balance || 0)),
                0
              );

            const retainedRowAsOf = tbAsOf.find(
              r =>
                toLower(r.account_type) === "equity" &&
                toLower(r.account_name).includes("retained earning")
            );
            const closing = Number(retainedRowAsOf?.balance || 0);
            const opening = closing - netProfit + dividendsDuring + drawingsDuring;

            snaps.push({
              label: format(end, "MMM yy"),
              opening,
              profit: netProfit,
              dividends: dividendsDuring,
              drawings: drawingsDuring,
              closing,
            });
          }
          setRetainedMonthSnapshots(snaps);
        } finally {
          setRetainedMultiLoading(false);
        }
      })();
    }

    setDataLoaded(false);
    setLoading(true);
    setShowFilters(false);
  };

  const handleNotesFilterApply = (filters: BalanceSheetFilterPayload) => {
    const asAtDate = filters.asAt ? new Date(filters.asAt) : new Date();
    const monthString = format(asAtDate, "yyyy-MM");
    const year = asAtDate.getFullYear();
    setPeriodMode("monthly");
    setSelectedMonth(monthString);
    setSelectedYear(year);
    setSelectedFiscalYear(year);

    setNotesCompareEnabled(!!filters.compareYear);

    if (filters.compareYear) {
      setComparativeYearA(year);
      setComparativeYearB(year - 1);
      loadComparativeData();
    }

    setDataLoaded(false);
    setLoading(true);
    setShowFilters(false);
  };

  const openTrace = (label: string) => {
    setTraceLabel(label);
  };

  const resolveAccountFromLabel = (lab: string): TrialBalanceRow | null => {
    const parts = String(lab || '').split(' - ');
    if (parts.length < 2) return null;
    const code = parts[0].trim();
    const name = parts.slice(1).join(' - ').trim();
    const findIn = (arr: TrialBalanceRow[]) => arr.find(r => String(r.account_code || '') === code && String(r.account_name || '') === name) || null;
    return findIn(trialBalanceAsOf) || findIn(trialBalance) || null;
  };

  const loadTraceCFMonthlyByAccount = async (accountId: string) => {
    try {
      setTraceCFLoading(true);
      const baseMonth = fiscalStartMonth - 1;
      const ranges: { label: string; start: string; end: string }[] = [];
      for (let i = 0; i < 12; i++) {
        const monthIndex = (baseMonth + i) % 12;
        const yearOffset = monthIndex < baseMonth ? 1 : 0;
        const y = selectedYear + yearOffset;
        const startDate = startOfMonth(new Date(y, monthIndex, 1));
        const endDate = endOfMonth(startDate);
        const label = format(startDate, 'MMM yyyy');
        ranges.push({
          label,
          start: format(startDate, 'yyyy-MM-dd'),
          end: format(endDate, 'yyyy-MM-dd'),
        });
      }
      const start = ranges[0]?.start;
      const end = ranges[ranges.length - 1]?.end;
      if (!start || !end) { setTraceCFMonthly(null); setTraceCFLoading(false); return; }
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('entry_date,debit,credit')
        .eq('account_id', accountId)
        .gte('entry_date', start)
        .lte('entry_date', end);
      if (error) throw error;
      const vals: Record<string, number> = {};
      ranges.forEach(r => { vals[r.label] = 0; });
      (data || []).forEach((e: any) => {
        const d = new Date(String(e.entry_date || '')); const mi = d.getMonth();
        const lab = ranges[mi]?.label; if (!lab) return;
        const debit = Number(e.debit || 0); const credit = Number(e.credit || 0);
        const net = debit - credit;
        vals[lab] = (vals[lab] || 0) + net;
      });
      setTraceCFMonthly(vals);
    } catch (e: any) {
      toast({ title: 'Trace error', description: e.message || 'Could not load monthly movements', variant: 'destructive' });
      setTraceCFMonthly(null);
    } finally {
      setTraceCFLoading(false);
    }
  };

  useEffect(() => {
    if (!traceLabel) { setTraceResolved(null); setTraceCFMonthly(null); return; }
    const r = resolveAccountFromLabel(traceLabel);
    setTraceResolved(r);
    if (r?.account_id) {
      loadTraceCFMonthlyByAccount(r.account_id);
    } else {
      setTraceCFMonthly(null);
    }
  }, [traceLabel, selectedYear, trialBalanceAsOf, trialBalance]);

  const renderStatementOfFinancialPosition = () => {
    const f = (val: number) => {
      const v = val || 0;
      const abs = Math.abs(v);
      const s = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
      return <span className="whitespace-nowrap">{v < 0 ? `(R ${s})` : `R ${s}`}</span>;
    };

    const isMonthMode = balanceSheetSelectedMonths.length > 0 && balanceSheetMonthSnapshots.length > 0;
    const isCompareMode = balanceSheetCompareEnabled && !isMonthMode;

    if (balanceSheetMultiLoading) {
      return (
        <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[400px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8 flex items-center justify-center">
          <div className="text-sm text-gray-600">Loading selected balance sheet periods…</div>
        </div>
      );
    }

    if (isMonthMode || isCompareMode) {
      const columns: { label: string; tb: TrialBalanceRow[] }[] = [];
      if (isMonthMode) {
        columns.push(...balanceSheetMonthSnapshots);
      } else if (isCompareMode) {
        columns.push(
          { label: String(comparativeYearA), tb: trialBalanceCompAsOfA },
          { label: String(comparativeYearB), tb: trialBalanceCompAsOfB },
        );
      }

      type SectionKey = 'nca' | 'ca' | 'eq' | 'ncl' | 'cl';

      const classifyForMulti = (tb: TrialBalanceRow[]) => {
        const assetsAll = tb.filter(r => String(r.account_type || '').toLowerCase() === 'asset');
        const nonCurrentAssets = assetsAll.filter(r => {
          const code = parseInt(String(r.account_code || '0'), 10);
          const name = String(r.account_name || '').toLowerCase();
          if (name.includes('inventory') || name.includes('stock')) return false;
          if (name.includes('receivable') || name.includes('debtor')) return false;
          if (name.includes('cash') || name.includes('bank') || name.includes('petty')) return false;
          if (name.includes('vat input') || name.includes('vat receivable')) return false;
          if (code >= 1500 && code < 2000) return true;
          if (name.includes('equipment') || name.includes('vehicle') || name.includes('property') || name.includes('machinery') || name.includes('computer')) return true;
          if (name.includes('investment') || name.includes('loan')) return true;
          return false;
        });
        const currentAssets = assetsAll.filter(r => !nonCurrentAssets.includes(r));

        const equityAll = tb.filter(r => String(r.account_type || '').toLowerCase() === 'equity');
        const liabilitiesAll = tb.filter(r => String(r.account_type || '').toLowerCase() === 'liability');

        const nonCurrentLiabilities = liabilitiesAll.filter(r => {
          const code = parseInt(String(r.account_code || '0'), 10);
          const name = String(r.account_name || '').toLowerCase();
          if (code >= 2300 && code < 2500) return true;
          if (name.includes('long term') || name.includes('mortgage') || name.includes('bond')) return true;
          if (name.includes('loan from owner')) return true;
          return false;
        });
        const currentLiabilities = liabilitiesAll.filter(r => !nonCurrentLiabilities.includes(r));

        return {
          nca: nonCurrentAssets,
          ca: currentAssets,
          eq: equityAll,
          ncl: nonCurrentLiabilities,
          cl: currentLiabilities,
        };
      };

      const sectionOrder: SectionKey[] = ['nca', 'ca', 'eq', 'ncl', 'cl'];
      const sectionLabels: Record<SectionKey, string> = {
        nca: 'Non-Current Assets',
        ca: 'Current Assets',
        eq: 'Owners Equity',
        ncl: 'Non-Current Liabilities',
        cl: 'Current Liabilities',
      };

      const classifiedPerCol = columns.map(c => classifyForMulti(c.tb));

      const rows: {
        type: 'section' | 'line' | 'total';
        section: SectionKey;
        key: string;
        label: string;
        note?: string;
      }[] = [];

      const addSectionRows = (section: SectionKey) => {
        rows.push({
          type: 'section',
          section,
          key: `section-${section}`,
          label: sectionLabels[section],
        });

        const seen = new Map<string, string>();

        classifiedPerCol.forEach(colClass => {
          const items = colClass[section];
          items.forEach(r => {
            const key = `${String(r.account_code || '').trim()}|${String(r.account_name || '').trim()}`;
            if (!seen.has(key)) {
              seen.set(key, key);
              const name = String(r.account_name || '');
              const lower = name.toLowerCase();
              const code = String(r.account_code || '');
              let note = '';
              if (section === 'ca') {
                if (lower.includes('inventory')) note = '3';
                else if (lower.includes('receivable') || lower.includes('impairment')) note = '4';
                else if (lower.includes('cash') || lower.includes('bank')) note = '5';
              } else if (section === 'eq') {
                note = '11';
              } else if (section === 'nca') {
                const codeNum = parseInt(code, 10);
                if (!Number.isNaN(codeNum) && codeNum >= 1500 && codeNum < 2000) note = '2';
              } else if (section === 'cl') {
                if (lower.includes('payable') || lower.includes('accrual')) note = '6';
                if (lower.includes('tax')) note = '9';
              }

              rows.push({
                type: 'line',
                section,
                key,
                label: name,
                note,
              });
            }
          });
        });

        rows.push({
          type: 'total',
          section,
          key: `total-${section}`,
          label:
            section === 'nca'
              ? 'Total Non-Current Assets'
              : section === 'ca'
              ? 'Total Current Assets'
              : section === 'eq'
              ? 'Total Equity'
              : section === 'ncl'
              ? 'Total Non-Current Liabilities'
              : 'Total Current Liabilities',
        });
      };

      sectionOrder.forEach(s => addSectionRows(s));

      const valueForCell = (section: SectionKey, rowKey: string, colIdx: number) => {
        const colClass = classifiedPerCol[colIdx];
        const items = colClass[section];
        if (rowKey.startsWith('total-')) {
          return items.reduce((s, r) => s + (Number(r.balance) || 0), 0);
        }
        const [code, name] = rowKey.split('|');
        const found = items.find(
          r =>
            String(r.account_code || '').trim() === code &&
            String(r.account_name || '').trim() === name,
        );
        return found ? Number(found.balance) || 0 : 0;
      };

      const headerLabel =
        isMonthMode && columns.length > 0 && !isCompareMode
          ? 'Selected periods'
          : `For the years/periods selected`;

      return (
        <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[600px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8">
          <div className="text-center mb-8">
            <h1 className="text-[24px] font-bold text-gray-900 uppercase tracking-wide mb-2">Balance Sheet</h1>
            <p className="text-gray-600 mb-1">{headerLabel}</p>
            <p className="text-[18px] font-semibold text-gray-900 mb-1">{companyName}</p>
            <p className="text-sm text-gray-500">Currency: ZAR</p>
          </div>
          <UnallocatedWarningBanner />
          <div className="rounded-md border border-slate-300 overflow-x-auto">
            <table className="min-w-[700px] w-full text-sm border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="py-2 pl-4 text-left font-bold text-gray-900 w-1/2 whitespace-nowrap">Item</th>
                  <th className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-gray-300 w-[60px] whitespace-nowrap">
                    Note
                  </th>
                  {columns.map(col => (
                    <th
                      key={col.label}
                      className="py-2 pr-4 pl-2 text-right font-semibold text-gray-900 tabular-nums border-l border-gray-300 whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let lineRowIndex = -1;
                  return rows.map(r => {
                  if (r.type === 'section') {
                    return (
                      <tr key={r.key} className="bg-slate-100 border-b border-slate-300">
                        <td className="py-2 pl-4 text-left font-bold text-gray-900 whitespace-nowrap" colSpan={2 + columns.length}>
                          {r.label}
                        </td>
                      </tr>
                    );
                  }
                  if (r.type === 'line') {
                    lineRowIndex += 1;
                    const stripeClass = lineRowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-100';
                    return (
                      <tr
                        key={r.key}
                        className={`border-b border-slate-200 ${stripeClass} hover:bg-muted/10 transition-colors`}
                      >
                        <td className="py-2 pl-4 pr-2 whitespace-nowrap">{r.label}</td>
                        <td className="py-2 px-2 text-center border-l border-slate-200 text-blue-600 whitespace-nowrap">
                          {r.note || ''}
                        </td>
                        {columns.map((_, idx) => (
                          <td
                            key={`${r.key}-${idx}`}
                            className="py-2 pr-4 pl-2 text-right font-mono tabular-nums border-l border-slate-200 whitespace-nowrap"
                          >
                            {f(valueForCell(r.section, r.key, idx))}
                          </td>
                        ))}
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={r.key}
                      className="border-b border-slate-300 bg-slate-50 font-semibold border-t-2 border-t-slate-300"
                    >
                      <td className="py-2 pl-4 pr-2 whitespace-nowrap">{r.label}</td>
                      <td className="py-2 px-2 text-center border-l border-slate-300 text-xs font-semibold text-gray-500 whitespace-nowrap">
                        {r.section === 'nca' || r.section === 'ca' ? '' : ''}
                      </td>
                      {columns.map((_, idx) => (
                        <td
                          key={`${r.key}-${idx}`}
                          className="py-2 pr-4 pl-2 text-right font-mono tabular-nums border-l border-slate-300 whitespace-nowrap"
                        >
                          {f(valueForCell(r.section, r.key, idx))}
                        </td>
                      ))}
                    </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // --- Classification Logic ---
    // 1. Assets
    const assetsAll = trialBalanceAsOf.filter(r => r.account_type.toLowerCase() === 'asset');
    
    // Non-Current Assets: Fixed Assets (1500-1999), Investments, Intangibles
    const nonCurrentAssets = assetsAll.filter(r => {
      const code = parseInt(r.account_code || '0', 10);
      const name = (r.account_name || '').toLowerCase();
      // Exclude Current Assets keywords
      if (name.includes('inventory') || name.includes('stock')) return false;
      if (name.includes('receivable') || name.includes('debtor')) return false;
      if (name.includes('cash') || name.includes('bank') || name.includes('petty')) return false;
      if (name.includes('vat input') || name.includes('vat receivable')) return false;
      
      // Include typical Non-Current keywords/codes
      if (code >= 1500 && code < 2000) return true; // Fixed Assets range
      if (name.includes('equipment') || name.includes('vehicle') || name.includes('property') || name.includes('machinery') || name.includes('computer')) return true;
      if (name.includes('investment') || name.includes('loan')) return true; // Long term loans given
      
      return false; 
    });

    // Current Assets: Everything else
    const currentAssets = assetsAll.filter(r => !nonCurrentAssets.includes(r));
    // Add VAT Input/Receivable if it's separate in state
    if (vatReceivableAsOf > 0) {
        // Check if already in currentAssets
        const hasVat = currentAssets.some(r => r.account_name.toLowerCase().includes('vat'));
        if (!hasVat) {
            currentAssets.push({
                account_id: 'vat-input-synthetic',
                account_code: '2500', // standard code?
                account_name: 'VAT Receivable',
                account_type: 'asset',
                balance: vatReceivableAsOf
            });
        }
    }

    // 2. Equity & Liabilities
    const equityAll = trialBalanceAsOf.filter(r => r.account_type.toLowerCase() === 'equity');
    const liabilitiesAll = trialBalanceAsOf.filter(r => r.account_type.toLowerCase() === 'liability');

    // Equity: Add Net Profit and Retained Earnings logic
    const equityRows = [...equityAll];
    const hasNetProfitRow = equityRows.some(r => r.account_name.includes('Profit and Loss'));
    if (!hasNetProfitRow && netProfitPeriod !== 0) {
        equityRows.push({
            account_id: 'net-profit-synthetic',
            account_code: '',
            account_name: 'Profit and Loss (This Year)',
            account_type: 'equity',
            balance: netProfitPeriod
        });
    }

    // Non-Current Liabilities
    const nonCurrentLiabilities = liabilitiesAll.filter(r => {
        const code = parseInt(r.account_code || '0', 10);
        const name = (r.account_name || '').toLowerCase();
        if (code >= 2300 && code < 2500) return true; // Long term loans
        if (name.includes('long term') || name.includes('mortgage') || name.includes('bond')) return true;
        if (name.includes('loan from owner')) return true; // Often non-current
        return false;
    });

    // Current Liabilities
    const currentLiabilities = liabilitiesAll.filter(r => !nonCurrentLiabilities.includes(r));
    if (vatPayableAsOf > 0) {
         const hasVat = currentLiabilities.some(r => r.account_name.toLowerCase().includes('vat'));
         if (!hasVat) {
             currentLiabilities.push({
                 account_id: 'vat-output-synthetic',
                 account_code: '2550',
                 account_name: 'VAT Payable',
                 account_type: 'liability',
                 balance: vatPayableAsOf
             });
         }
    }

    const isLongTermInvestment = (row: TrialBalanceRow) => {
      const name = (row.account_name || '').toLowerCase();
      return (
        name.includes('investment') ||
        name.includes('fixed deposit') ||
        name.includes('term deposit') ||
        name.includes('bond')
      );
    };
    const longTermInvestmentRows = nonCurrentAssets.filter(isLongTermInvestment);
    const ppeRows = nonCurrentAssets.filter(r => !longTermInvestmentRows.includes(r));
    const totalLongTermInvestments = longTermInvestmentRows.reduce((s, r) => s + r.balance, 0);
    const totalPPE = ppeRows.reduce((s, r) => s + r.balance, 0);
    const totalNonCurrentAssets = totalPPE + totalLongTermInvestments;
    const totalCurrentAssets = currentAssets.reduce((s, r) => s + r.balance, 0);
    const totalAssets = totalNonCurrentAssets + totalCurrentAssets;

    const totalEquity = equityRows.reduce((s, r) => s + r.balance, 0);
    const totalNonCurrentLiabilities = nonCurrentLiabilities.reduce((s, r) => s + r.balance, 0);
    const totalCurrentLiabilities = currentLiabilities.reduce((s, r) => s + r.balance, 0);
    const totalEquityAndLiabilities = totalEquity + totalNonCurrentLiabilities + totalCurrentLiabilities;

    // Helper to get note number
    const getNoteNumber = (row: any) => {
      const name = String(row.account_name || '').toLowerCase();
      const code = String(row.account_code || '');
      
      if (name.includes('inventory')) return '3';
      if (name.includes('receivable') || name.includes('impairment')) return '4';
      if (name.includes('cash') || name.includes('bank')) return '5';
      if (name.includes('payable') || name.includes('accrual')) return '6';
      if (row.account_type === 'equity') return '11';
      
      // PPE
      if (parseInt(code, 10) >= 1500 && parseInt(code, 10) < 2000) return '2';
      
      return '';
    };

    const handleNoteClick = (noteId: string) => {
      if (!noteId) return;
      setActiveNoteId(noteId);
    };

    return (
      <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[1000px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8">
        {/* Header */}
        <div className="text-center mb-12">
            <h1 className="text-[24px] font-bold text-gray-900 uppercase tracking-wide mb-2">Balance Sheet</h1>
            <p className="text-gray-600 mb-1">For the year ended {format(new Date(periodEnd), 'dd MMMM yyyy')}</p>
            <p className="text-[18px] font-semibold text-gray-900 mb-1">{companyName}</p>
            <p className="text-sm text-gray-500">Currency: ZAR</p>
        </div>

        {/* ASSETS */}
        <div className="mb-8 w-full">
            <h2 className="text-[18px] font-bold text-[#1f2937] uppercase mb-1">Assets</h2>
            <div className="w-full border-b-2 border-[#1f2937] mb-4"></div>

            <div className="mb-6 border border-slate-300">
                <table className="w-full text-sm border-collapse table-fixed">
                    <colgroup>
                        <col className="w-auto" />
                        <col className="w-[60px]" />
                        <col className="w-auto min-w-[140px]" />
                    </colgroup>
                    <tbody>
                        <tr className="bg-slate-100 border-b border-slate-300">
                            <td className="py-2 pl-4 text-left font-bold text-gray-900">Non-Current Assets</td>
                            <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                            <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(totalNonCurrentAssets)}</td>
                        </tr>
                        <tr className="border-b border-slate-200 bg-white hover:bg-muted/10 transition-colors">
                            <td
                              className="py-2 pl-4 pr-2 text-blue-600 cursor-pointer hover:underline"
                              onClick={() => setShowPPEDialog(true)}
                            >
                              Property, plant and equipment (PPE)
                            </td>
                            <td
                              className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                              onClick={() => handleNoteClick('2')}
                            >
                              2
                            </td>
                            <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">
                              {f(totalPPE)}
                            </td>
                        </tr>
                        {totalLongTermInvestments !== 0 && (
                          <tr className="border-b border-slate-200 bg-white hover:bg-muted/10 transition-colors">
                            <td className="py-2 pl-8 pr-2">
                              Long-term Investments
                            </td>
                            <td className="py-2 px-2 text-center border-l border-r border-gray-200" />
                            <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">
                              {f(totalLongTermInvestments)}
                            </td>
                          </tr>
                        )}

                        <tr className="bg-slate-100 border-b border-slate-300 border-t-2 border-t-slate-300">
                            <td className="py-2 pl-4 text-left font-bold text-gray-900">Current Assets</td>
                            <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                            <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(totalCurrentAssets)}</td>
                        </tr>
                        {currentAssets.map((r, idx) => (
                            <tr
                              key={r.account_id}
                              className={`border-b border-slate-200 cursor-pointer ${
                                idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'
                              } hover:bg-muted/10 transition-colors`}
                              onClick={() => handleDrilldown(r.account_id, r.account_name)}
                            >
                                <td className="py-2 pl-4 pr-2">{r.account_name}</td>
                                <td
                                  className="py-2 px-2 text-center border-l border-r border-slate-200 text-blue-600 cursor-pointer hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNoteClick(getNoteNumber(r));
                                  }}
                                >
                                  {getNoteNumber(r)}
                                </td>
                                <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(r.balance)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="text-[16px] font-bold border-t-2 border-b-2 border-[#374151] py-3 mt-6 flex justify-between px-4 bg-slate-50">
                <span>Total Assets</span>
                <span className="font-mono tabular-nums">{f(totalAssets)}</span>
            </div>
        </div>

        {/* EQUITY AND LIABILITIES */}
        <div className="w-full">
            <h2 className="text-[18px] font-bold text-[#1f2937] uppercase mb-1 mt-8">Equity and Liabilities</h2>
            <div className="w-full border-b-2 border-[#1f2937] mb-4"></div>

            <div className="mb-6 border border-slate-300">
                 <table className="w-full text-sm border-collapse table-fixed">
                    <colgroup>
                        <col className="w-auto" />
                        <col className="w-[60px]" />
                        <col className="w-auto min-w-[140px]" />
                    </colgroup>
                    <tbody>
                        <tr className="bg-slate-100 border-b border-slate-300">
                            <td className="py-2 pl-4 text-left font-bold text-gray-900">Owners Equity</td>
                            <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                            <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(totalEquity)}</td>
                        </tr>
                        {equityRows.map((r, idx) => (
                            <tr
                              key={r.account_id}
                              className={`border-b border-slate-200 cursor-pointer ${
                                idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'
                              } hover:bg-muted/10 transition-colors`}
                              onClick={() => handleDrilldown(r.account_id, r.account_name)}
                            >
                                <td className="py-2 pl-4 pr-2">{r.account_name}</td>
                                <td
                                  className="py-2 px-2 text-center border-l border-r border-slate-200 text-blue-600 cursor-pointer hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNoteClick(getNoteNumber(r));
                                  }}
                                >
                                  {getNoteNumber(r)}
                                </td>
                                <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(r.balance)}</td>
                            </tr>
                        ))}

                        <tr className="bg-slate-100 border-b border-slate-300 border-t-2 border-t-slate-300">
                            <td className="py-2 pl-4 text-left font-bold text-gray-900">Non-Current Liabilities</td>
                            <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                            <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(totalNonCurrentLiabilities)}</td>
                        </tr>
                        {nonCurrentLiabilities.map((r, idx) => (
                            <tr
                              key={r.account_id}
                              className={`border-b border-slate-200 cursor-pointer ${
                                idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'
                              } hover:bg-muted/10 transition-colors`}
                              onClick={() => handleDrilldown(r.account_id, r.account_name)}
                            >
                                <td className="py-2 pl-4 pr-2">{r.account_name}</td>
                                <td
                                  className="py-2 px-2 text-center border-l border-r border-slate-200 text-blue-600 cursor-pointer hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNoteClick(getNoteNumber(r));
                                  }}
                                >
                                  {getNoteNumber(r)}
                                </td>
                                <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(r.balance)}</td>
                            </tr>
                        ))}

                        <tr className="bg-slate-100 border-b border-slate-300 border-t-2 border-t-slate-300">
                            <td className="py-2 pl-4 text-left font-bold text-gray-900">Current Liabilities</td>
                            <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                            <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(totalCurrentLiabilities)}</td>
                        </tr>
                        {currentLiabilities.map((r, idx) => (
                            <tr
                              key={r.account_id}
                              className={`border-b border-slate-200 cursor-pointer ${
                                idx % 2 === 0 ? 'bg-white' : 'bg-slate-100'
                              } hover:bg-muted/10 transition-colors`}
                              onClick={() => handleDrilldown(r.account_id, r.account_name)}
                            >
                                <td className="py-2 pl-4 pr-2">{r.account_name}</td>
                                <td
                                  className="py-2 px-2 text-center border-l border-r border-slate-200 text-blue-600 cursor-pointer hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNoteClick(getNoteNumber(r));
                                  }}
                                >
                                  {getNoteNumber(r)}
                                </td>
                                <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(r.balance)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="text-[16px] font-bold border-t-2 border-b-2 border-[#374151] py-3 mt-6 flex justify-between px-4 bg-slate-50">
                <span>Total Equity and Liabilities</span>
                <span className="font-mono tabular-nums">{f(totalEquityAndLiabilities)}</span>
            </div>
        </div>

        <Dialog open={showPPEDialog} onOpenChange={setShowPPEDialog}>
          <DialogContent className="max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>PPE Movement Schedule</DialogTitle>
              <DialogDescription>
                Fiscal-year view of PPE cost, depreciation, additions and disposals.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <PPEStatement
                selectedYear={selectedFiscalYear}
                companyId={companyId || undefined}
                variant="dialog"
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const renderIncomeStatementIIV = () => {
    const f = (val: number) => {
      const v = val || 0;
      const abs = Math.abs(v);
      const s = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
      return <span className="whitespace-nowrap">{v < 0 ? `(R ${s})` : `R ${s}`}</span>;
    };

    const sum = (arr: TrialBalanceRow[]) => arr.reduce((s, r) => s + Number(r.balance || 0), 0);
    const toLower = (s: string) => String(s || '').toLowerCase();

    const isMonthMode = incomeSelectedMonths.length > 0 && incomeMonthSnapshots.length > 0;
    const isCompareMode = incomeCompareEnabled && !isMonthMode;

    if (incomeMultiLoading) {
      return (
        <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[400px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8 flex items-center justify-center">
          <div className="text-sm text-gray-600">Loading selected income statement periods…</div>
        </div>
      );
    }

    if (isMonthMode || isCompareMode) {
      const columns: { label: string; tb: TrialBalanceRow[] }[] = [];
      if (isMonthMode) {
        columns.push(...incomeMonthSnapshots);
      } else if (isCompareMode) {
        const { startDate: aStart, endDate: aEnd } = getFiscalYearDates(comparativeYearA);
        const { startDate: bStart, endDate: bEnd } = getFiscalYearDates(comparativeYearB);
        columns.push(
          { label: `${comparativeYearA}`, tb: trialBalance },
          { label: `${comparativeYearB}`, tb: trialBalancePrev },
        );
      }

      type SectionKey = 'rev' | 'cogs' | 'oi' | 'opex' | 'dep' | 'tax';

      const classifyIncome = (tb: TrialBalanceRow[]) => {
        const allRevenue = tb.filter(r => toLower(r.account_type) === 'revenue' || toLower(r.account_type) === 'income');
        const isOtherIncome = (r: TrialBalanceRow) => {
          const name = toLower(r.account_name);
          return (
            name.includes('interest') ||
            name.includes('dividend') ||
            name.includes('gain') ||
            name.includes('profit') ||
            name.includes('other income') ||
            name.includes('discount received')
          );
        };
        const salesItems = allRevenue.filter(r => !isOtherIncome(r));
        const otherIncomeItems = allRevenue.filter(r => isOtherIncome(r));

        const costOfSalesItems = tb.filter(
          r =>
            String(r.account_code || '').startsWith('50') ||
            toLower(r.account_name).includes('cost of') ||
            toLower(r.account_name).includes('purchases'),
        );

        const expenseItemsAll = tb.filter(r => toLower(r.account_type) === 'expense');
        const taxExpenseItems = expenseItemsAll.filter(
          r => toLower(r.account_name).includes('tax') && !toLower(r.account_name).includes('vat'),
        );
        const operatingExpenses = expenseItemsAll
          .filter(r => !costOfSalesItems.includes(r))
          .filter(r => !taxExpenseItems.includes(r))
          .filter(r => !toLower(r.account_name).includes('vat'))
          .filter(
            r =>
              !(String(r.account_code || '') === '5600' || toLower(r.account_name).includes('depreciation')),
          );
        const depItems = expenseItemsAll.filter(r => toLower(r.account_name).includes('depreciation'));

        return {
          rev: salesItems,
          cogs: costOfSalesItems,
          oi: otherIncomeItems,
          opex: operatingExpenses,
          dep: depItems,
          tax: taxExpenseItems,
        };
      };

      const classifiedPerCol = columns.map(c => classifyIncome(c.tb));

      const rows: {
        type: 'section' | 'line' | 'total' | 'calc';
        section?: SectionKey;
        key: string;
        label: string;
      }[] = [];

      const addSectionLines = (section: SectionKey, header: string, totalLabel?: string) => {
        rows.push({ type: 'section', section, key: `sec-${section}`, label: header });

        const seen = new Set<string>();
        classifiedPerCol.forEach(colClass => {
          const items = colClass[section];
          items.forEach(r => {
            const key = `${String(r.account_code || '').trim()}|${String(r.account_name || '').trim()}`;
            if (!seen.has(key)) {
              seen.add(key);
              rows.push({
                type: 'line',
                section,
                key,
                label: String(r.account_name || ''),
              });
            }
          });
        });

        if (totalLabel) {
          rows.push({
            type: 'total',
            section,
            key: `total-${section}`,
            label: totalLabel,
          });
        }
      };

      addSectionLines('rev', 'Revenue', 'Total Revenue');
      addSectionLines('cogs', 'Cost of Sales', 'Total Cost of Sales');
      rows.push({ type: 'calc', key: 'gross', label: 'Gross Profit' });
      addSectionLines('oi', 'Other Income', 'Total Other Income');
      addSectionLines('opex', 'Operating Expenses', 'Total Operating Expenses');
      addSectionLines('dep', 'Depreciation Expense', undefined);
      rows.push({ type: 'calc', key: 'pbt', label: 'Profit Before Tax' });
      addSectionLines('tax', 'Taxation', 'Total Taxation');
      rows.push({ type: 'calc', key: 'np', label: 'Net Profit / (Loss) for the Year' });

      const valueForCell = (row: typeof rows[number], colIdx: number) => {
        const colClass = classifiedPerCol[colIdx];
        if (row.type === 'total' && row.section) {
          const items = colClass[row.section];
          const total = sum(items);
          if (row.section === 'cogs' || row.section === 'opex' || row.section === 'dep' || row.section === 'tax') {
            return -Math.abs(total);
          }
          return total;
        }
        if (row.type === 'line' && row.section) {
          const [code, name] = row.key.split('|');
          const items = colClass[row.section];
          const found = items.find(
            r =>
              String(r.account_code || '').trim() === code &&
              String(r.account_name || '').trim() === name,
          );
          if (!found) return 0;
          const v = Number(found.balance) || 0;
          if (row.section === 'cogs' || row.section === 'opex' || row.section === 'dep' || row.section === 'tax') {
            return -Math.abs(v);
          }
          return v;
        }
        if (row.type === 'calc') {
          const revTotal = sum(colClass.rev);
          const cogsTotal = sum(colClass.cogs);
          const oiTotal = sum(colClass.oi);
          const opexTotal = sum(colClass.opex);
          const depTotal = sum(colClass.dep);
          const taxTotal = sum(colClass.tax);
          if (row.key === 'gross') {
            const cogsVal = cogsTotal !== 0 ? cogsTotal : 0;
            return revTotal - Math.abs(cogsVal);
          }
          if (row.key === 'pbt') {
            const cogsVal = cogsTotal !== 0 ? cogsTotal : 0;
            const gp = revTotal - Math.abs(cogsVal);
            return gp + oiTotal - Math.abs(opexTotal) - Math.abs(depTotal);
          }
          if (row.key === 'np') {
            const cogsVal = cogsTotal !== 0 ? cogsTotal : 0;
            const gp = revTotal - Math.abs(cogsVal);
            const pbt = gp + oiTotal - Math.abs(opexTotal) - Math.abs(depTotal);
            return pbt - Math.abs(taxTotal);
          }
        }
        return 0;
      };

      const headerLabel =
        isMonthMode && columns.length > 0 && !isCompareMode
          ? 'Selected periods'
          : 'For the years/periods selected';

      return (
        <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[600px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8">
          <div className="text-center mb-12">
            <h1 className="text-[24px] font-bold text-gray-900 uppercase tracking-wide mb-2">Income Statement</h1>
            <p className="text-gray-600 mb-1">{headerLabel}</p>
            <p className="text-[18px] font-semibold text-gray-900 mb-1">{companyName}</p>
            <p className="text-sm text-gray-500">Currency: ZAR</p>
          </div>
          <div className="mb-8 w-full">
            <h2 className="text-[18px] font-bold text-[#1f2937] uppercase mb-1">Income Statement</h2>
            <div className="w-full border-b-2 border-[#1f2937] mb-4"></div>
            <div className="mb-6 border border-gray-300 overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300">
                    <th className="py-2 pl-4 text-left font-bold text-gray-900 w-1/2 whitespace-nowrap">Item</th>
                    {columns.map(col => (
                      <th
                        key={col.label}
                        className="py-2 pr-4 pl-2 text-right font-semibold text-gray-900 tabular-nums border-l border-gray-300 whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    if (r.type === 'section') {
                      return (
                        <tr key={r.key} className="bg-gray-100 border-b border-gray-300">
                          <td className="py-2 pl-4 text-left font-bold text-gray-900 whitespace-nowrap" colSpan={1 + columns.length}>
                            {r.label}
                          </td>
                        </tr>
                      );
                    }
                    if (r.type === 'line') {
                      return (
                        <tr key={r.key} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="py-2 pl-4 pr-2 whitespace-nowrap">{r.label}</td>
                          {columns.map((_, idx) => (
                            <td
                              key={`${r.key}-${idx}`}
                              className="py-2 pr-4 pl-2 text-right font-mono tabular-nums border-l border-gray-200 whitespace-nowrap"
                            >
                              {f(valueForCell(r, idx))}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if (r.type === 'total' || r.type === 'calc') {
                      return (
                        <tr
                          key={r.key}
                          className="border-b border-gray-300 bg-gray-50 font-semibold border-t-2 border-t-gray-300"
                        >
                          <td className="py-2 pl-4 pr-2 whitespace-nowrap">{r.label}</td>
                          {columns.map((_, idx) => (
                            <td
                              key={`${r.key}-${idx}`}
                              className="py-2 pr-4 pl-2 text-right font-mono tabular-nums border-l border-gray-300 whitespace-nowrap"
                            >
                              {f(valueForCell(r, idx))}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    return null;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    const allRevenue = trialBalance.filter(r => toLower(r.account_type) === 'revenue' || toLower(r.account_type) === 'income');

    const isOtherIncome = (r: TrialBalanceRow) => {
      const name = toLower(r.account_name);
      return name.includes('interest') || name.includes('dividend') || name.includes('gain') || name.includes('profit') || name.includes('other income') || name.includes('discount received');
    };

    const salesItems = allRevenue.filter(r => !isOtherIncome(r));
    const otherIncomeItems = allRevenue.filter(r => isOtherIncome(r));

    const costOfSalesItems = trialBalance.filter(r =>
      String(r.account_code || '').startsWith('50') ||
      toLower(r.account_name).includes('cost of') ||
      toLower(r.account_name).includes('purchases')
    );

    const expenseItemsAll = trialBalance.filter(r => toLower(r.account_type) === 'expense');
    const taxExpenseItems = expenseItemsAll.filter(r => toLower(r.account_name).includes('tax') && !toLower(r.account_name).includes('vat'));

    const operatingExpenses = expenseItemsAll
      .filter(r => !costOfSalesItems.includes(r))
      .filter(r => !taxExpenseItems.includes(r))
      .filter(r => !toLower(r.account_name).includes('vat'))
      .filter(r => !(String(r.account_code || '') === '5600' || toLower(r.account_name).includes('depreciation')));

    const totalSales = sum(salesItems);
    const totalCostOfSalesRaw = sum(costOfSalesItems);
    const cogsValue = totalCostOfSalesRaw > 0 ? totalCostOfSalesRaw : fallbackCOGS;
    const grossProfit = totalSales - cogsValue;

    const totalOtherIncome = sum(otherIncomeItems);
    const depVal = Number(depExpensePeriod || 0);
    const totalOperatingExpenses = sum(operatingExpenses) + depVal;
    const totalTaxExpenses = sum(taxExpenseItems);

    const profitBeforeTax = grossProfit + totalOtherIncome - totalOperatingExpenses;
    const netProfit = profitBeforeTax - totalTaxExpenses;

    const getNoteNumber = (row: TrialBalanceRow) => {
      const name = toLower(row.account_name);
      const type = toLower(row.account_type);
      const code = String(row.account_code || '');

      if (type === 'revenue' || type === 'income') return '7';
      if (code.startsWith('50') || name.includes('cost of') || name.includes('purchases')) return '8';
      if (type === 'expense' && name.includes('tax') && !name.includes('vat')) return '10';
      if (type === 'expense') return '9';
      return '';
    };

    const handleNoteClick = (noteId: string) => {
      if (!noteId) return;
      setActiveNoteId(noteId);
    };

    return (
      <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[900px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8">
        <div className="text-center mb-12">
          <h1 className="text-[24px] font-bold text-gray-900 uppercase tracking-wide mb-2">Income Statement</h1>
          <p className="text-gray-600 mb-1">For the year ended {format(new Date(periodEnd), 'dd MMMM yyyy')}</p>
          <p className="text-[18px] font-semibold text-gray-900 mb-1">{companyName}</p>
          <p className="text-sm text-gray-500">Currency: ZAR</p>
        </div>

        <div className="mb-8 w-full">
          <h2 className="text-[18px] font-bold text-[#1f2937] uppercase mb-1">Income Statement</h2>
          <div className="w-full border-b-2 border-[#1f2937] mb-4"></div>

          <div className="mb-6 border border-gray-300">
            <table className="w-full text-sm border-collapse">
              <colgroup>
                <col className="w-auto" />
                <col className="w-[60px]" />
                <col className="w-auto min-w-[140px]" />
              </colgroup>
              <tbody>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Revenue</td>
                  <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                  <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(totalSales)}</td>
                </tr>
                {salesItems.map(r => (
                  <tr
                    key={r.account_id}
                    className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleDrilldown(r.account_id, r.account_name)}
                  >
                    <td className="py-2 pl-4 pr-2">{r.account_name}</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={e => {
                        e.stopPropagation();
                        handleNoteClick(getNoteNumber(r));
                      }}
                    >
                      {getNoteNumber(r)}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(r.balance)}</td>
                  </tr>
                ))}

                <tr className="bg-gray-100 border-b border-gray-300 border-t-2 border-t-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Cost of Sales</td>
                  <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                  <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(-Math.abs(cogsValue))}</td>
                </tr>
                {costOfSalesItems.map(r => (
                  <tr
                    key={r.account_id}
                    className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleDrilldown(r.account_id, r.account_name)}
                  >
                    <td className="py-2 pl-4 pr-2">{r.account_name}</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={e => {
                        e.stopPropagation();
                        handleNoteClick(getNoteNumber(r));
                      }}
                    >
                      {getNoteNumber(r)}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(-Math.abs(r.balance))}</td>
                  </tr>
                ))}

                <tr className="bg-gray-50 border-t-2 border-b-2 border-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Gross Profit</td>
                  <td className="py-2 text-center border-l border-r border-gray-300"></td>
                  <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(grossProfit)}</td>
                </tr>

                {otherIncomeItems.length > 0 && (
                  <>
                    <tr className="bg-gray-100 border-b border-gray-300 border-t-2 border-t-gray-300">
                      <td className="py-2 pl-4 text-left font-bold text-gray-900">Other Income</td>
                      <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                      <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(totalOtherIncome)}</td>
                    </tr>
                    {otherIncomeItems.map(r => (
                      <tr
                        key={r.account_id}
                        className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleDrilldown(r.account_id, r.account_name)}
                      >
                        <td className="py-2 pl-4 pr-2">{r.account_name}</td>
                        <td
                          className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                          onClick={e => {
                            e.stopPropagation();
                            handleNoteClick(getNoteNumber(r));
                          }}
                        >
                          {getNoteNumber(r)}
                        </td>
                        <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(r.balance)}</td>
                      </tr>
                    ))}
                  </>
                )}

                <tr className="bg-gray-100 border-b border-gray-300 border-t-2 border-t-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Operating Expenses</td>
                  <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                  <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(-Math.abs(totalOperatingExpenses))}</td>
                </tr>
                {operatingExpenses.map(r => (
                  <tr
                    key={r.account_id}
                    className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleDrilldown(r.account_id, r.account_name)}
                  >
                    <td className="py-2 pl-4 pr-2">{r.account_name}</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={e => {
                        e.stopPropagation();
                        handleNoteClick(getNoteNumber(r));
                      }}
                    >
                      {getNoteNumber(r)}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(-Math.abs(r.balance))}</td>
                  </tr>
                ))}
                {depVal > 0 && (
                  <tr className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="py-2 pl-4 pr-2">Depreciation Expense</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('9')}
                    >
                      9
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(-Math.abs(depVal))}</td>
                  </tr>
                )}

                <tr className="bg-gray-50 border-t border-b border-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Profit Before Tax</td>
                  <td className="py-2 text-center border-l border-r border-gray-300"></td>
                  <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(profitBeforeTax)}</td>
                </tr>

                {taxExpenseItems.length > 0 && (
                  <>
                    <tr className="bg-gray-100 border-b border-gray-300 border-t-2 border-t-gray-300">
                      <td className="py-2 pl-4 text-left font-bold text-gray-900">Taxation</td>
                      <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">Note</td>
                      <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(-Math.abs(totalTaxExpenses))}</td>
                    </tr>
                    {taxExpenseItems.map(r => (
                      <tr
                        key={r.account_id}
                        className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleDrilldown(r.account_id, r.account_name)}
                      >
                        <td className="py-2 pl-4 pr-2">{r.account_name}</td>
                        <td
                          className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                          onClick={e => {
                            e.stopPropagation();
                            handleNoteClick(getNoteNumber(r));
                          }}
                        >
                          {getNoteNumber(r)}
                        </td>
                        <td className="py-2 pr-4 pl-2 text-right font-mono tabular-nums">{f(-Math.abs(r.balance))}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          <div className="text-[16px] font-bold border-t-2 border-b-2 border-[#374151] py-3 mt-6 flex justify-between px-4 bg-gray-50">
            <span>Net Profit / (Loss) for the Year</span>
            <span className="font-mono tabular-nums">{f(netProfit)}</span>
          </div>
        </div>
      </div>
    );
  };

  
  const renderNotesContent = (noteIdFilter?: string) => {
    const sum = (arr: TrialBalanceRow[]) => arr.reduce((s, r) => s + Number(r.balance || 0), 0);
    const toLower = (s: string) => String(s || '').toLowerCase();
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
    
    const nonCurrentAssets = trialBalanceAsOf.filter(r => toLower(r.account_type) === 'asset' && parseInt(String(r.account_code || '0'), 10) >= 1500);
    const ppeItems = nonCurrentAssets.filter(r => !toLower(r.account_name).includes('accumulated') && !toLower(r.account_name).includes('intangible') && !toLower(r.account_name).includes('investment'));
    const accDepItems = nonCurrentAssets.filter(r => toLower(r.account_name).includes('accumulated'));
    
    const getAccumulatedFor = (name: string) => {
      const base = toLower(name).replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
      return accDepItems
        .filter(ad => {
          const adBase = toLower(ad.account_name)
            .replace(/accumulated/g, '')
            .replace(/depreciation/g, '')
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          return adBase.includes(base) || base.includes(adBase);
        })
        .reduce((s, r) => s + r.balance, 0);
    };
 
    const inventoryItems = trialBalanceAsOf.filter(r => toLower(r.account_type) === 'asset' && toLower(r.account_name).includes('inventory'));
    const tradeReceivables = trialBalanceAsOf.filter(r => toLower(r.account_type) === 'asset' && (toLower(r.account_name).includes('trade receivable') || toLower(r.account_name).includes('accounts receivable')));
    const impairment = trialBalanceAsOf.filter(r => toLower(r.account_type) === 'asset' && toLower(r.account_name).includes('impairment'));
    const otherReceivables = trialBalanceAsOf.filter(r => 
      toLower(r.account_type) === 'asset' &&
      !tradeReceivables.includes(r) &&
      !inventoryItems.includes(r) &&
      !ppeItems.includes(r) &&
      !toLower(r.account_name).includes('bank') &&
      !toLower(r.account_name).includes('cash') &&
      parseInt(String(r.account_code || '0'), 10) < 1500
    );
    const cashItems = trialBalanceAsOf.filter(r => toLower(r.account_type) === 'asset' && (toLower(r.account_name).includes('cash') || toLower(r.account_name).includes('bank')));
    const tradePayables = trialBalanceAsOf.filter(r => toLower(r.account_type) === 'liability' && (toLower(r.account_name).includes('trade payable') || toLower(r.account_name).includes('accounts payable')));
    const otherPayables = trialBalanceAsOf.filter(r => toLower(r.account_type) === 'liability' && !tradePayables.includes(r) && !toLower(r.account_name).includes('tax') && !toLower(r.account_name).includes('vat'));
    const revenueItems = trialBalance.filter(r => toLower(r.account_type) === 'revenue' || toLower(r.account_type) === 'income');
    const cogsItems = trialBalance.filter(r => (String(r.account_code || '')).startsWith('50') || toLower(r.account_name).includes('cost of') || toLower(r.account_name).includes('purchases'));
    const expenseItems = trialBalance.filter(r => toLower(r.account_type) === 'expense' && !cogsItems.includes(r) && !toLower(r.account_name).includes('tax'));
    const taxItems = trialBalance.filter(r => toLower(r.account_type) === 'expense' && toLower(r.account_name).includes('tax'));
    const equityItems = trialBalanceAsOf.filter(r => toLower(r.account_type) === 'equity');
 
    return (
      <div className="max-w-[900px] mx-auto bg-white p-8 md:p-10 min-h-[600px] text-gray-900 font-sans border border-slate-200 space-y-8">
        <div className="border-b pb-4 mb-4">
          <h2 className="text-2xl font-bold text-center">Notes to the Financial Statements</h2>
          <p className="text-center text-muted-foreground">
            For the period ended {format(new Date(periodEnd), 'dd MMMM yyyy')}
          </p>
        </div>
        <UnallocatedWarningBanner />
        {(!noteIdFilter || noteIdFilter === '1') && (
          <div id="note-1" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">1. Basis of Preparation</h3>
            <p className="text-sm text-muted-foreground">
              Financial statements are prepared on the accrual basis in accordance with IFRS for SMEs and on a going-concern assumption.
            </p>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '2') && (
          <div id="note-2" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">2. Property, Plant & Equipment</h3>
            <p className="text-sm text-muted-foreground mb-2">Shows PPE cost, additions, depreciation, and carrying amount.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Cost
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">
                    Accumulated Depreciation
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">
                    Carrying Value
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ppeItems.map((item, idx) => {
                  const stripe = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                  const cost = item.balance;
                  const accDep = getAccumulatedFor(item.account_name);
                  return (
                    <TableRow
                      key={item.account_code}
                      className={`${stripe} hover:bg-slate-100/60 transition-colors`}
                    >
                      <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                        <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">{formatCurrency(cost)}</TableCell>
                      <TableCell className="px-3 py-2 text-right">{formatCurrency(accDep)}</TableCell>
                      <TableCell className="px-3 py-2 text-right font-medium">
                        {formatCurrency(cost + accDep)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                  <TableCell className="px-3 py-2">Total</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">{formatCurrency(sum(ppeItems))}</TableCell>
                  <TableCell className="px-3 py-2 text-right">{formatCurrency(sum(accDepItems))}</TableCell>
                  <TableCell className="px-3 py-2 text-right">
                    {formatCurrency(sum(ppeItems) + sum(accDepItems))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '3') && (
          <div id="note-3" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">3. Inventory</h3>
            <p className="text-sm text-muted-foreground mb-2">Inventory measured at lower of cost and NRV.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryItems.map((item, idx) => (
                  <TableRow
                    key={item.account_code}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100/60 transition-colors`}
                  >
                    <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">{formatCurrency(item.balance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                  <TableCell className="px-3 py-2">Total Inventory</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">
                    {formatCurrency(sum(inventoryItems))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '4') && (
          <div id="note-4" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">4. Trade Receivables</h3>
            <p className="text-sm text-muted-foreground mb-2">Shows receivables balance and impairment (ECL) if any.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-white">
                  <TableCell className="px-3 py-2">Trade Receivables (Gross)</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">
                    {formatCurrency(sum(tradeReceivables))}
                  </TableCell>
                </TableRow>
                {impairment.length > 0 && (
                  <TableRow className="bg-slate-50">
                    <TableCell className="px-3 py-2">Less: Impairment (ECL)</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">
                      {formatCurrency(sum(impairment))}
                    </TableCell>
                  </TableRow>
                )}
                {otherReceivables.map((item, idx) => (
                  <TableRow
                    key={item.account_code}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100/60 transition-colors`}
                  >
                    <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">
                      {formatCurrency(item.balance)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                  <TableCell className="px-3 py-2">Net Trade and Other Receivables</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">
                    {formatCurrency(sum(tradeReceivables) + sum(impairment) + sum(otherReceivables))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '5') && (
          <div id="note-5" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">5. Cash & Cash Equivalents</h3>
            <p className="text-sm text-muted-foreground mb-2">Bank and cash on hand.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashItems.map((item, idx) => (
                  <TableRow
                    key={item.account_code}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100/60 transition-colors`}
                  >
                    <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">{formatCurrency(item.balance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                  <TableCell className="px-3 py-2">Total Cash and Cash Equivalents</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">
                    {formatCurrency(sum(cashItems))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '6') && (
          <div id="note-6" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">6. Trade Payables</h3>
            <p className="text-sm text-muted-foreground mb-2">Closing balance of payables.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-white">
                  <TableCell className="px-3 py-2">Trade Payables</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">
                    {formatCurrency(Math.abs(sum(tradePayables)))}
                  </TableCell>
                </TableRow>
                {otherPayables.map((item, idx) => (
                  <TableRow
                    key={item.account_code}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100/60 transition-colors`}
                  >
                    <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">
                      {formatCurrency(Math.abs(item.balance))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                  <TableCell className="px-3 py-2">Total Trade and Other Payables</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">
                    {formatCurrency(Math.abs(sum(tradePayables) + sum(otherPayables)))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '7') && (
          <div id="note-7" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">7. Revenue</h3>
            <p className="text-sm text-muted-foreground mb-2">Total revenue for the year.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenueItems.map((item, idx) => (
                  <TableRow
                    key={item.account_code}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100/60 transition-colors`}
                  >
                    <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">
                      {formatCurrency(Math.abs(item.balance))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                  <TableCell className="px-3 py-2">Total Revenue</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">
                    {formatCurrency(Math.abs(sum(revenueItems)))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '8') && (
          <div id="note-8" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">8. Cost of Sales</h3>
            <p className="text-sm text-muted-foreground mb-2">Opening inventory, purchases, closing inventory.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cogsItems.map((item, idx) => (
                  <TableRow
                    key={item.account_code}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100/60 transition-colors`}
                  >
                    <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">{formatCurrency(item.balance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                  <TableCell className="px-3 py-2">Total Cost of Sales</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">
                    {formatCurrency(sum(cogsItems))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '9') && (
          <div id="note-9" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">9. Operating Expenses</h3>
            <p className="text-sm text-muted-foreground mb-2">Grouped total of expenses.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseItems.map((item, idx) => (
                  <TableRow
                    key={item.account_code}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100/60 transition-colors`}
                  >
                    <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">{formatCurrency(item.balance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                  <TableCell className="px-3 py-2">Total Operating Expenses</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">
                    {formatCurrency(sum(expenseItems))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '10') && (
          <div id="note-10" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">10. Taxation</h3>
            <p className="text-sm text-muted-foreground mb-2">Current tax expense and tax rate used.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxItems.length > 0 ? (
                  taxItems.map((item, idx) => (
                    <TableRow
                      key={item.account_code}
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100/60 transition-colors`}
                    >
                      <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                      <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">{formatCurrency(item.balance)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="px-3 py-2 text-center text-muted-foreground">
                      No tax expense recorded for this period.
                    </TableCell>
                  </TableRow>
                )}
                {taxItems.length > 0 && (
                  <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                    <TableCell className="px-3 py-2">Total Taxation</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">
                      {formatCurrency(sum(taxItems))}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
 
        {(!noteIdFilter || noteIdFilter === '11') && (
          <div id="note-11" className="space-y-4 scroll-mt-24">
            <h3 className="text-lg font-semibold">11. Equity</h3>
            <p className="text-sm text-muted-foreground mb-2">Opening balance, contributions, withdrawals, closing balance.</p>
            <Table className="w-full text-sm border border-slate-200 rounded-md overflow-hidden">
              <TableHeader>
                <TableRow className="bg-slate-100 border-b border-slate-200">
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </TableHead>
                  <TableHead className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right border-l border-slate-300 w-[220px]">
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equityItems.map((item, idx) => (
                  <TableRow
                    key={item.account_code}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100/60 transition-colors`}
                  >
                    <TableCell className="px-3 py-2">{item.account_name}</TableCell>
                    <TableCell className="px-3 py-2 text-right border-l border-slate-200 w-[220px]">{formatCurrency(item.balance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-100 font-semibold border-t border-slate-200">
                  <TableCell className="px-3 py-2">Total Equity</TableCell>
                  <TableCell className="px-3 py-2 text-right border-l border-slate-300 w-[220px]">
                    {formatCurrency(sum(equityItems))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };
 
  const renderIFRSNotes = () => {
    if (notesCompareEnabled) {
      return renderComparativeNotes();
    }
    return renderNotesContent();
  };

  const renderNoteDialog = () => {
    if (!activeNoteId || notesCompareEnabled) return null;
    return (
      <Dialog open={!!activeNoteId} onOpenChange={(open) => !open && setActiveNoteId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Note {activeNoteId}</DialogTitle>
            <DialogDescription>
              Detailed note for the selected balance sheet line.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            {renderNotesContent(activeNoteId)}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  const bsGroups = (tb: Pick<TrialBalanceRow, 'account_id' | 'account_code' | 'account_name' | 'account_type' | 'balance'>[]) => {
    const currentAssets = tb.filter(r =>
      r.account_type.toLowerCase() === 'asset' &&
      (r.account_name.toLowerCase().includes('cash') ||
       r.account_name.toLowerCase().includes('bank') ||
       r.account_name.toLowerCase().includes('receivable') ||
       r.account_name.toLowerCase().includes('inventory') ||
       parseInt(r.account_code) < 1500) &&
      !String(r.account_name || '').toLowerCase().includes('vat') &&
      !['1210','2110','2210'].includes(String(r.account_code || '')) &&
      (!String(r.account_name || '').toLowerCase().includes('inventory') || String(r.account_code || '') === '1300')
    );
    const nonCurrentAssetsAll = tb.filter(r => r.account_type.toLowerCase() === 'asset' && !currentAssets.includes(r));
    const accDepRows = nonCurrentAssetsAll.filter(r => String(r.account_name || '').toLowerCase().includes('accumulated'));
    const nonCurrentAssets = nonCurrentAssetsAll.filter(r => !String(r.account_name || '').toLowerCase().includes('accumulated'));
    const normalizeName = (name: string) => name.toLowerCase().replace(/accumulated/g, '').replace(/depreciation/g, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const nbvFor = (assetRow: Pick<TrialBalanceRow, 'account_id' | 'account_code' | 'account_name' | 'account_type' | 'balance'>) => {
      const base = normalizeName(assetRow.account_name);
      const related = accDepRows.filter(ad => {
        const adBase = normalizeName(ad.account_name);
        return adBase.includes(base) || base.includes(adBase);
      });
      const accTotal = related.reduce((sum, r) => sum + r.balance, 0);
      return assetRow.balance - accTotal;
    };
    const isInvestment = (row: Pick<TrialBalanceRow, 'account_id' | 'account_code' | 'account_name' | 'account_type' | 'balance'>) => {
      const n = String(row.account_name || '').toLowerCase();
      return n.includes('investment') || n.includes('fixed deposit') || n.includes('term deposit') || n.includes('bond');
    };
    const ppeAssets = nonCurrentAssets.filter(r => !isInvestment(r));
    const longTermInvestments = nonCurrentAssets.filter(r => isInvestment(r));
    const vatInputAsAssets = tb.filter(r => (String(r.account_name || '').toLowerCase().includes('vat input') || String(r.account_name || '').toLowerCase().includes('vat receivable')));
    const vatPayableRows = tb.filter(r => r.account_type.toLowerCase() === 'liability' && String(r.account_name || '').toLowerCase().includes('vat'));
    const vatReceivable = vatInputAsAssets.reduce((s, r) => s + r.balance, 0);
    const vatPayable = vatPayableRows.reduce((s, r) => s + r.balance, 0);
    const totalCurrentAssets = currentAssets.reduce((sum, r) => sum + r.balance, 0) + vatReceivable;
    const totalFixedAssetsNBV = ppeAssets.reduce((sum, r) => sum + nbvFor(r), 0);
    const totalLongTermInvestments = longTermInvestments.reduce((sum, r) => sum + r.balance, 0);
    const totalNonCurrentAssets = totalFixedAssetsNBV + totalLongTermInvestments;
    const liabilitiesExVat = tb.filter(r => r.account_type.toLowerCase() === 'liability' && !String(r.account_name || '').toLowerCase().includes('vat') && !['2100','2200'].includes(String(r.account_code || '')));
    const currentLiabilities = liabilitiesExVat.filter(r => {
      const name = String(r.account_name || '').toLowerCase();
      const code = String(r.account_code || '');
      const isLoan = name.includes('loan');
      const isLongLoan = isLoan && (code === '2400' || name.includes('long'));
      const isShortLoan = isLoan && (code === '2300' || name.includes('short'));
      const isPayableOrTax = (name.includes('payable') || name.includes('sars'));
      return (isPayableOrTax && !isLongLoan) || isShortLoan;
    });
    const currentSet = new Set(currentLiabilities.map(r => r.account_id));
    const nonCurrentLiabilities = tb.filter(r => r.account_type.toLowerCase() === 'liability' && !currentSet.has(r.account_id) && !String(r.account_name || '').toLowerCase().includes('vat'));
    const equity = tb.filter(r => r.account_type.toLowerCase() === 'equity');
    const totalEquity = equity.reduce((sum, r) => sum + r.balance, 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
    const totalCurrentLiabilities = currentLiabilities.reduce((sum, r) => sum + r.balance, 0) + vatPayable;
    const totalNonCurrentLiabilities = nonCurrentLiabilities.reduce((sum, r) => sum + r.balance, 0);
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
    return {
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalFixedAssetsNBV,
      totalLongTermInvestments,
      totalAssets,
      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,
      totalEquity,
      vatReceivable,
      vatPayable,
    };
  };

  const percentChange = (curr: number, prev: number) => {
    const p = Math.abs(prev);
    if (p < 0.00001) return 0;
    return ((curr - prev) / p) * 100;
  };

  const formatRand = (n: number) => Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatAccounting = (n: number) => {
    const v = Number(n || 0);
    const s = formatRand(Math.abs(v));
    return { display: v < 0 ? `(R ${s})` : `R ${s}`, negative: v < 0 };
  };
  const pctClass = (v: number) => (v > 0 ? 'text-green-600 dark:text-green-400' : v < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground');
  
  const handleComparativeExport = (type: 'pdf' | 'excel') => {
    try {
      const yA = comparativeYearA;
      const yB = comparativeYearB;
      const rows = (() => {
        const r: { label: string; yearA: number; yearB: number; percent?: number; bold?: boolean }[] = [];
        const cfCurr = cashFlowCurrComparative || { net_cash_from_operations: 0, net_cash_from_investing: 0, net_cash_from_financing: 0, net_change_in_cash: 0, opening_cash_balance: 0 } as any;
        const cfPrev = cashFlowPrev || { net_cash_from_operations: 0, net_cash_from_investing: 0, net_cash_from_financing: 0, net_change_in_cash: 0, opening_cash_balance: 0 } as any;
        const pct = (a: number, b: number) => percentChange(a, b);
        r.push({ label: 'Net cash from operating activities', yearA: Number(cfCurr.net_cash_from_operations || 0), yearB: Number(cfPrev.net_cash_from_operations || 0), percent: pct(Number(cfCurr.net_cash_from_operations || 0), Number(cfPrev.net_cash_from_operations || 0)), bold: true });
        r.push({ label: 'Net cash used in / from investing activities', yearA: Number(cfCurr.net_cash_from_investing || 0), yearB: Number(cfPrev.net_cash_from_investing || 0), percent: pct(Number(cfCurr.net_cash_from_investing || 0), Number(cfPrev.net_cash_from_investing || 0)), bold: true });
        r.push({ label: 'Net cash from / used in financing activities', yearA: Number(cfCurr.net_cash_from_financing || 0), yearB: Number(cfPrev.net_cash_from_financing || 0), percent: pct(Number(cfCurr.net_cash_from_financing || 0), Number(cfPrev.net_cash_from_financing || 0)), bold: true });
        r.push({ label: 'Net increase / (decrease) in cash', yearA: Number(cfCurr.net_change_in_cash || 0), yearB: Number(cfPrev.net_change_in_cash || 0), percent: pct(Number(cfCurr.net_change_in_cash || 0), Number(cfPrev.net_change_in_cash || 0)), bold: true });
        r.push({ label: 'Cash and cash equivalents at beginning of period', yearA: Number(cfCurr.opening_cash_balance || 0), yearB: Number(cfPrev.opening_cash_balance || 0) });
        r.push({ label: 'Cash and cash equivalents at end of period', yearA: Number(cfCurr.opening_cash_balance || 0) + Number(cfCurr.net_change_in_cash || 0), yearB: Number(cfPrev.opening_cash_balance || 0) + Number(cfPrev.net_change_in_cash || 0), bold: true });
        return r;
      })();
      if (type === 'pdf') {
        exportComparativeCashFlowToPDF(rows, yA, yB, `Comparative_Cash_Flow_${yA}_vs_${yB}`);
      } else {
        exportComparativeCashFlowToExcel(rows, yA, yB, `Comparative_Cash_Flow_${yA}_vs_${yB}`);
      }
    } catch {}
  };

  const renderComparativeBalanceSheet = () => {
    const y = comparativeYearA;
    const py = comparativeYearB;
    const { endDate: yEndDate } = getFiscalYearDates(y);
    const { endDate: pyEndDate } = getFiscalYearDates(py);
    const pctClass = (val: number) => {
        if (isNaN(val) || !isFinite(val)) return 'text-muted-foreground';
        if (val > 0) return 'text-green-600';
        if (val < 0) return 'text-red-600';
        return 'text-muted-foreground';
    };
    const percentChange = (curr: number, prev: number) => {
        if (prev === 0) return 0;
        return ((curr - prev) / Math.abs(prev)) * 100;
    };
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);

    // Helper functions for aggregation (matching renderComparativeNotes logic where possible)
    const toLower = (s: string) => String(s || '').toLowerCase();
    const sum = (arr: TrialBalanceRow[]) => arr.reduce((s, r) => s + Number(r.balance || 0), 0);

    const getAggregates = (tb: TrialBalanceRow[]) => {
        const nonCurrentAssets = tb.filter(r => toLower(r.account_type) === 'asset' && parseInt(String(r.account_code || '0'), 10) >= 1500);
        const ppe = sum(nonCurrentAssets.filter(r => !toLower(r.account_name).includes('accumulated') && !toLower(r.account_name).includes('intangible') && !toLower(r.account_name).includes('investment')));
        const accDep = sum(nonCurrentAssets.filter(r => toLower(r.account_name).includes('accumulated')));
        const ppeNet = ppe + accDep; // accDep is usually negative

        const inventory = sum(tb.filter(r => toLower(r.account_type) === 'asset' && toLower(r.account_name).includes('inventory')));
        
        const tradeReceivables = tb.filter(r => toLower(r.account_type) === 'asset' && (toLower(r.account_name).includes('trade receivable') || toLower(r.account_name).includes('accounts receivable')));
        const tradeRecVal = sum(tradeReceivables);
        
        const cashItems = tb.filter(r => toLower(r.account_type) === 'asset' && (toLower(r.account_name).includes('cash') || toLower(r.account_name).includes('bank')));
        const cashVal = sum(cashItems);

        const vatReceivable = sum(tb.filter(r => toLower(r.account_type) === 'asset' && toLower(r.account_name).includes('vat')));
        
        // Other receivables (excluding trade, inventory, ppe, cash, vat)
        const otherReceivables = sum(tb.filter(r => 
            toLower(r.account_type) === 'asset' && 
            !tradeReceivables.includes(r) && 
            !toLower(r.account_name).includes('inventory') && 
            !nonCurrentAssets.includes(r) && 
            !cashItems.includes(r) &&
            !toLower(r.account_name).includes('vat')
        ));

        // Liabilities
        const tradePayables = tb.filter(r => toLower(r.account_type) === 'liability' && (toLower(r.account_name).includes('trade payable') || toLower(r.account_name).includes('accounts payable')));
        const tradePayVal = sum(tradePayables);
        
        const vatPayable = sum(tb.filter(r => toLower(r.account_type) === 'liability' && toLower(r.account_name).includes('vat')));
        
        const taxPayable = sum(tb.filter(r => toLower(r.account_type) === 'liability' && toLower(r.account_name).includes('tax') && !toLower(r.account_name).includes('vat')));

        // Long term loans
        const nonCurrentLiab = sum(tb.filter(r => toLower(r.account_type) === 'liability' && (String(r.account_code) === '2400' || toLower(r.account_name).includes('long term'))));

        // Other current liabilities
        const otherPayables = sum(tb.filter(r => 
            toLower(r.account_type) === 'liability' && 
            !tradePayables.includes(r) && 
            !toLower(r.account_name).includes('vat') && 
            !toLower(r.account_name).includes('tax') &&
            !(String(r.account_code) === '2400' || toLower(r.account_name).includes('long term'))
        ));

        const equity = sum(tb.filter(r => toLower(r.account_type) === 'equity'));

        return {
            ppeNet,
            inventory,
            tradeRecVal,
            otherReceivables,
            cashVal,
            vatReceivable,
            equity,
            nonCurrentLiab,
            tradePayVal,
            otherPayables,
            vatPayable,
            taxPayable
        };
    };

    const curr = getAggregates(trialBalanceCompAsOfA);
    const prev = getAggregates(trialBalanceCompAsOfB);

    // Calculate totals
    const totalNonCurrentAssetsCurr = curr.ppeNet; // Add other non-current if needed
    const totalNonCurrentAssetsPrev = prev.ppeNet;
    
    const totalCurrentAssetsCurr = curr.inventory + curr.tradeRecVal + curr.otherReceivables + curr.cashVal + curr.vatReceivable;
    const totalCurrentAssetsPrev = prev.inventory + prev.tradeRecVal + prev.otherReceivables + prev.cashVal + prev.vatReceivable;

    const totalAssetsCurr = totalNonCurrentAssetsCurr + totalCurrentAssetsCurr;
    const totalAssetsPrev = totalNonCurrentAssetsPrev + totalCurrentAssetsPrev;

    const totalEquityCurr = curr.equity;
    const totalEquityPrev = prev.equity;

    const totalNonCurrentLiabCurr = curr.nonCurrentLiab;
    const totalNonCurrentLiabPrev = prev.nonCurrentLiab;

    const totalCurrentLiabCurr = curr.tradePayVal + curr.otherPayables + curr.vatPayable + curr.taxPayable;
    const totalCurrentLiabPrev = prev.tradePayVal + prev.otherPayables + prev.vatPayable + prev.taxPayable;

    const totalEquityLiabCurr = totalEquityCurr + totalNonCurrentLiabCurr + totalCurrentLiabCurr;
    const totalEquityLiabPrev = totalEquityPrev + totalNonCurrentLiabPrev + totalCurrentLiabPrev;

    const rows: Array<{ label: string; curr: number; prev: number; bold?: boolean; note?: string; indent?: boolean; sectionHeader?: boolean; totalRow?: boolean }> = [
      { label: 'ASSETS', curr: 0, prev: 0, sectionHeader: true },
      { label: 'Non-current assets', curr: totalNonCurrentAssetsCurr, prev: totalNonCurrentAssetsPrev, bold: true },
      { label: 'Property, plant and equipment', curr: curr.ppeNet, prev: prev.ppeNet, note: '1', indent: true },
      
      { label: 'Current assets', curr: totalCurrentAssetsCurr, prev: totalCurrentAssetsPrev, bold: true },
      { label: 'Inventories', curr: curr.inventory, prev: prev.inventory, note: '2', indent: true },
      { label: 'Trade and other receivables', curr: curr.tradeRecVal + curr.otherReceivables, prev: prev.tradeRecVal + prev.otherReceivables, note: '3', indent: true },
      { label: 'Cash and cash equivalents', curr: curr.cashVal, prev: prev.cashVal, note: '4', indent: true },
      { label: 'VAT Receivable', curr: curr.vatReceivable, prev: prev.vatReceivable, indent: true }, // No note usually for VAT
      
      { label: 'Total Assets', curr: totalAssetsCurr, prev: totalAssetsPrev, totalRow: true },

      { label: 'EQUITY AND LIABILITIES', curr: 0, prev: 0, sectionHeader: true },
      { label: 'Equity', curr: totalEquityCurr, prev: totalEquityPrev, bold: true, note: '10' },
      
      { label: 'Non-current liabilities', curr: totalNonCurrentLiabCurr, prev: totalNonCurrentLiabPrev, bold: true },
      { label: 'Long-term borrowings', curr: curr.nonCurrentLiab, prev: prev.nonCurrentLiab, indent: true },

      { label: 'Current liabilities', curr: totalCurrentLiabCurr, prev: totalCurrentLiabPrev, bold: true },
      { label: 'Trade and other payables', curr: curr.tradePayVal + curr.otherPayables, prev: prev.tradePayVal + prev.otherPayables, note: '5', indent: true },
      { label: 'Taxation payable', curr: curr.taxPayable, prev: prev.taxPayable, note: '9', indent: true },
      { label: 'VAT Payable', curr: curr.vatPayable, prev: prev.vatPayable, indent: true },

      { label: 'Total Equity and Liabilities', curr: totalEquityLiabCurr, prev: totalEquityLiabPrev, totalRow: true },
    ];

    return (
      <div className="space-y-4">
        <h3 className="text-xl font-bold">Comparative Statement of Financial Position</h3>
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-left font-semibold w-1/2">Item</th>
                <th className="p-2 text-center font-semibold w-16">Note</th>
                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">
                  {y}
                  <span className="text-xs font-normal text-muted-foreground block">As of {format(yEndDate, 'dd MMM yyyy')}</span>
                </th>
                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">
                  {py}
                  <span className="text-xs font-normal text-muted-foreground block">As of {format(pyEndDate, 'dd MMM yyyy')}</span>
                </th>
                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">% Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                if (r.sectionHeader) {
                    return (
                        <tr key={`bs-comp-${i}`} className="bg-muted/30">
                            <td colSpan={5} className="p-2 font-bold uppercase">{r.label}</td>
                        </tr>
                    );
                }
                return (
                    <tr key={`bs-comp-${i}`} className={`border-b hover:bg-muted/50 ${r.totalRow ? 'font-bold border-t-2 bg-muted/20' : ''}`}>
                      <td className={`p-2 ${r.indent ? 'pl-6' : ''} ${r.bold ? 'font-semibold' : ''}`}>{r.label}</td>
                      <td className="p-2 text-center text-muted-foreground">{r.note || '-'}</td>
                      <td className={`p-2 text-right border-l border-muted-foreground/20`}>{formatCurrency(r.curr)}</td>
                      <td className={`p-2 text-right border-l border-muted-foreground/20`}>{formatCurrency(r.prev)}</td>
                      <td className={`p-2 text-right border-l border-muted-foreground/20 ${pctClass(percentChange(r.curr, r.prev))}`}>
                        {percentChange(r.curr, r.prev).toFixed(1)}%
                      </td>
                    </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderBalanceSheetMonthlySelection = () => {
    return null;
  };

  const renderComparativeIncomeStatement = () => {
    const y = comparativeYearA;
    const py = comparativeYearB;
    const { startDate: yStartDate, endDate: yEndDate } = getFiscalYearDates(y);
    const { startDate: pyStartDate, endDate: pyEndDate } = getFiscalYearDates(py);
    const revenueCurr = trialBalance.filter(r => r.account_type.toLowerCase() === 'revenue' || r.account_type.toLowerCase() === 'income');
    const revenuePrev = trialBalancePrev.filter(r => r.account_type.toLowerCase() === 'revenue' || r.account_type.toLowerCase() === 'income');
    const expensesCurr = trialBalance.filter(r => String(r.account_type || '').toLowerCase() === 'expense');
    const expensesPrev = trialBalancePrev.filter(r => String(r.account_type || '').toLowerCase() === 'expense');
    const costOfSalesCurr = expensesCurr.filter(r => r.account_name.toLowerCase().includes('cost of') || String(r.account_code || '').startsWith('50'));
    const costOfSalesPrev = expensesPrev.filter(r => r.account_name.toLowerCase().includes('cost of') || String(r.account_code || '').startsWith('50'));
    const operatingExpensesCurr = expensesCurr
      .filter(r => !costOfSalesCurr.includes(r))
      .filter(r => !String(r.account_name || '').toLowerCase().includes('vat'))
      .filter(r => !(String(r.account_code || '') === '5600' || String(r.account_name || '').toLowerCase().includes('depreciation')));
    const operatingExpensesPrev = expensesPrev
      .filter(r => !costOfSalesPrev.includes(r))
      .filter(r => !String(r.account_name || '').toLowerCase().includes('vat'))
      .filter(r => !(String(r.account_code || '') === '5600' || String(r.account_name || '').toLowerCase().includes('depreciation')));
    const sum = (arr: TrialBalanceRow[]) => arr.reduce((s, r) => s + r.balance, 0);
    const totalRevenueCurr = sum(revenueCurr);
    const totalRevenuePrev = sum(revenuePrev);
    const totalCostOfSalesCurrRaw = sum(costOfSalesCurr);
    const totalCostOfSalesPrevRaw = sum(costOfSalesPrev);
    const totalCostOfSalesCurr = totalCostOfSalesCurrRaw > 0 ? totalCostOfSalesCurrRaw : fallbackCOGS;
    const totalCostOfSalesPrev = totalCostOfSalesPrevRaw > 0 ? totalCostOfSalesPrevRaw : fallbackCOGSPrev;
    const grossProfitCurr = totalRevenueCurr - totalCostOfSalesCurr;
    const grossProfitPrev = totalRevenuePrev - totalCostOfSalesPrev;
    const totalOperatingExpensesCurr = sum(operatingExpensesCurr) + Number(compDepCurr || 0);
    const totalOperatingExpensesPrev = sum(operatingExpensesPrev) + Number(compDepPrev || 0);
    const netProfitCurr = grossProfitCurr - totalOperatingExpensesCurr;
    const netProfitPrev = grossProfitPrev - totalOperatingExpensesPrev;
    const rows: Array<{ label: string; curr: number; prev: number; bold?: boolean }> = [];
    rows.push({ label: 'REVENUE', curr: 0, prev: 0, bold: true });
    revenueCurr.forEach(r => {
      const prevMatch = revenuePrev.find(p => p.account_code === r.account_code);
      rows.push({ label: `${r.account_code} - ${r.account_name}`, curr: r.balance, prev: prevMatch ? prevMatch.balance : 0 });
    });
    rows.push({ label: 'Total Revenue', curr: totalRevenueCurr, prev: totalRevenuePrev, bold: true });
    rows.push({ label: 'COST OF SALES', curr: 0, prev: 0, bold: true });
    costOfSalesCurr.forEach(r => {
      const prevMatch = costOfSalesPrev.find(p => p.account_code === r.account_code);
      rows.push({ label: `${r.account_code} - ${r.account_name}`, curr: r.balance, prev: prevMatch ? prevMatch.balance : 0 });
    });
    rows.push({ label: 'Total Cost of Sales', curr: totalCostOfSalesCurr, prev: totalCostOfSalesPrev, bold: true });
    rows.push({ label: 'GROSS PROFIT', curr: grossProfitCurr, prev: grossProfitPrev, bold: true });
    rows.push({ label: 'OPERATING EXPENSES', curr: 0, prev: 0, bold: true });
    operatingExpensesCurr.forEach(r => {
      const prevMatch = operatingExpensesPrev.find(p => p.account_code === r.account_code);
      rows.push({ label: `${r.account_code} - ${r.account_name}`, curr: r.balance, prev: prevMatch ? prevMatch.balance : 0 });
    });
    rows.push({ label: 'Monthly Depreciation', curr: Number(compDepCurr || 0), prev: Number(compDepPrev || 0) });
    rows.push({ label: 'Total Operating Expenses', curr: totalOperatingExpensesCurr, prev: totalOperatingExpensesPrev, bold: true });
    rows.push({ label: 'NET PROFIT/(LOSS)', curr: netProfitCurr, prev: netProfitPrev, bold: true });
    return (
      <div className="space-y-4">
        <h3 className="text-xl font-bold">Comparative Income Statement</h3>
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-left font-semibold">Item</th>
                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">
                  {y}
                  <span className="text-xs font-normal text-muted-foreground block">{format(yStartDate, 'dd MMM')} - {format(yEndDate, 'dd MMM')}</span>
                </th>
                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">
                  {py}
                  <span className="text-xs font-normal text-muted-foreground block">{format(pyStartDate, 'dd MMM')} - {format(pyEndDate, 'dd MMM')}</span>
                </th>
                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">% Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`cf-comp-${i}-${r.label}`} className="border-b hover:bg-muted/50">
                  <td className={`p-2 ${r.bold ? 'font-semibold' : ''}`}>{r.label}</td>
                  <td className={`p-2 text-right border-l border-muted-foreground/20 ${r.bold ? 'font-semibold' : ''}`}>R {r.curr.toLocaleString()}</td>
                  <td className={`p-2 text-right border-l border-muted-foreground/20 ${r.bold ? 'font-semibold' : ''}`}>R {r.prev.toLocaleString()}</td>
                  <td className={`p-2 text-right border-l border-muted-foreground/20 ${pctClass(percentChange(r.curr, r.prev))} ${r.bold ? 'font-semibold' : ''}`}>
                    {percentChange(r.curr, r.prev).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderComparativeCashFlow = () => {
    const cfCurr = cashFlowCurrComparative || { operating_inflows: 0, operating_outflows: 0, net_cash_from_operations: 0, investing_inflows: 0, investing_outflows: 0, net_cash_from_investing: 0, financing_inflows: 0, financing_outflows: 0, net_cash_from_financing: 0, opening_cash_balance: 0, closing_cash_balance: 0, net_change_in_cash: 0 };
    const cfPrev = cashFlowPrev || { operating_inflows: 0, operating_outflows: 0, net_cash_from_operations: 0, investing_inflows: 0, investing_outflows: 0, net_cash_from_investing: 0, financing_inflows: 0, financing_outflows: 0, net_cash_from_financing: 0, opening_cash_balance: 0, closing_cash_balance: 0, net_change_in_cash: 0 };
    const y = comparativeYearA;
    const py = comparativeYearB;
    const { startDate: yStartDate, endDate: yEndDate } = getFiscalYearDates(y);
    const { startDate: pyStartDate, endDate: pyEndDate } = getFiscalYearDates(py);
    const buildLower = (tb: TrialBalanceRow[]) => tb.map(a => ({ account_id: a.account_id, account_code: String(a.account_code || ''), account_name: String(a.account_name || '').toLowerCase(), account_type: String(a.account_type || '').toLowerCase(), balance: Number(a.balance || 0) }));
    const lowerCurr = buildLower(trialBalance);
    const lowerPrev = buildLower(trialBalancePrev);
    const lowerPrevPrev = buildLower(trialBalancePrevPrev);
    const sum = (arr: any[]) => arr.reduce((s, x) => s + Number(x.balance || 0), 0);
    const revenueBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'revenue' || a.account_type === 'income'));
    const cogsBal = (arr: any[]) => sum(arr.filter(a => (String(a.account_code || '')).startsWith('50') || a.account_name.includes('cost of')));
    const opexBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'expense' && !((String(a.account_code || '')).startsWith('50') || a.account_name.includes('cost of'))).filter(a => !a.account_name.includes('vat')));
    const depAmortBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'expense' && (a.account_name.includes('depreciation') || a.account_name.includes('amortisation') || a.account_name.includes('amortization'))));
    const impairmentBal = (arr: any[]) => sum(arr.filter(a => a.account_name.includes('impairment')));
    const profitDisposalBal = (arr: any[]) => sum(arr.filter(a => (a.account_code === '9500') || (a.account_name.includes('gain on sale') || a.account_name.includes('disposal gain'))));
    const lossDisposalBal = (arr: any[]) => sum(arr.filter(a => (a.account_code === '9600') || (a.account_name.includes('loss on sale') || a.account_name.includes('disposal loss'))));
    const financeCostsBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'expense' && (a.account_name.includes('finance cost') || a.account_name.includes('interest expense'))));
    const interestIncomeBal = (arr: any[]) => sum(arr.filter(a => (a.account_type === 'revenue' || a.account_type === 'income') && a.account_name.includes('interest')));
    const fxUnrealisedBal = (arr: any[]) => sum(arr.filter(a => a.account_name.includes('unrealised') && (a.account_name.includes('foreign exchange') || a.account_name.includes('fx') || a.account_name.includes('currency'))));
    const provisionsMoveBal = (arr: any[]) => sum(arr.filter(a => (a.account_type === 'liability' || a.account_type === 'expense') && a.account_name.includes('provision')));
    const fairValueAdjBal = (arr: any[]) => sum(arr.filter(a => a.account_name.includes('fair value')));
    const otherNonCashBal = (arr: any[]) => sum(arr.filter(a => a.account_name.includes('non-cash') || a.account_name.includes('non cash')));
    const interestReceivedBal = (arr: any[]) => interestIncomeBal(arr);
    const interestPaidBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'expense' && (a.account_name.includes('interest') || a.account_name.includes('finance cost'))));
    const dividendsReceivedBal = (arr: any[]) => sum(arr.filter(a => (a.account_type === 'revenue' || a.account_type === 'income') && a.account_name.includes('dividend')));
    const dividendsPaidBal = (arr: any[]) => sum(arr.filter(a => (a.account_type === 'expense' || a.account_type === 'equity') && a.account_name.includes('dividend')));
    const taxPaidBal = (arr: any[]) => sum(arr.filter(a => (a.account_type === 'expense' || a.account_type === 'liability') && a.account_name.includes('tax') && !a.account_name.includes('vat')));
    const receivablesBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'asset' && (a.account_name.includes('receivable') || a.account_name.includes('debtors') || a.account_name.includes('accounts receivable'))).filter(a => !a.account_name.includes('vat')));
    const inventoriesBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'asset' && (a.account_name.includes('inventory') || a.account_name.includes('stock'))));
    const payablesBal = (arr: any[]) => sum(arr.filter(a => a.account_type === 'liability' && (a.account_name.includes('payable') || a.account_name.includes('creditors') || a.account_name.includes('accounts payable'))).filter(a => !a.account_name.includes('vat')).filter(a => !a.account_name.includes('loan')));
    const profitBeforeTaxCurr = revenueBal(lowerCurr) - (cogsBal(lowerCurr) > 0 ? cogsBal(lowerCurr) : fallbackCOGS) - opexBal(lowerCurr);
    const profitBeforeTaxPrev = revenueBal(lowerPrev) - (cogsBal(lowerPrev) > 0 ? cogsBal(lowerPrev) : fallbackCOGSPrev) - opexBal(lowerPrev);
    const receivablesChangeCurr = receivablesBal(lowerCurr) - receivablesBal(lowerPrev);
    const inventoriesChangeCurr = inventoriesBal(lowerCurr) - inventoriesBal(lowerPrev);
    const payablesChangeCurr = payablesBal(lowerCurr) - payablesBal(lowerPrev);
    const receivablesChangePrev = receivablesBal(lowerPrev) - receivablesBal(lowerPrevPrev);
    const inventoriesChangePrev = inventoriesBal(lowerPrev) - inventoriesBal(lowerPrevPrev);
    const payablesChangePrev = payablesBal(lowerPrev) - payablesBal(lowerPrevPrev);
    const workingCapitalCurr = -receivablesChangeCurr + -inventoriesChangeCurr + payablesChangeCurr;
    const workingCapitalPrev = -receivablesChangePrev + -inventoriesChangePrev + payablesChangePrev;
    const adjustmentsCurr = depAmortBal(lowerCurr) + impairmentBal(lowerCurr) - profitDisposalBal(lowerCurr) + lossDisposalBal(lowerCurr) + financeCostsBal(lowerCurr) - interestIncomeBal(lowerCurr) + fxUnrealisedBal(lowerCurr) + provisionsMoveBal(lowerCurr) + fairValueAdjBal(lowerCurr) + otherNonCashBal(lowerCurr);
    const adjustmentsPrev = depAmortBal(lowerPrev) + impairmentBal(lowerPrev) - profitDisposalBal(lowerPrev) + lossDisposalBal(lowerPrev) + financeCostsBal(lowerPrev) - interestIncomeBal(lowerPrev) + fxUnrealisedBal(lowerPrev) + provisionsMoveBal(lowerPrev) + fairValueAdjBal(lowerPrev) + otherNonCashBal(lowerPrev);
    const cashGeneratedCurr = profitBeforeTaxCurr + adjustmentsCurr + workingCapitalCurr;
    const cashGeneratedPrev = profitBeforeTaxPrev + adjustmentsPrev + workingCapitalPrev;
    const netOperatingCurr = cashGeneratedCurr + interestReceivedBal(lowerCurr) - Math.abs(interestPaidBal(lowerCurr)) + dividendsReceivedBal(lowerCurr) - Math.abs(dividendsPaidBal(lowerCurr)) - Math.abs(taxPaidBal(lowerCurr));
    const netOperatingPrev = cashGeneratedPrev + interestReceivedBal(lowerPrev) - Math.abs(interestPaidBal(lowerPrev)) + dividendsReceivedBal(lowerPrev) - Math.abs(dividendsPaidBal(lowerPrev)) - Math.abs(taxPaidBal(lowerPrev));
    const isLoanLiability = (a: any) => a.account_type === 'liability' && (a.account_name.includes('loan') || a.account_name.includes('borrow') || a.account_name.includes('debenture') || a.account_name.includes('note payable') || a.account_name.includes('overdraft'));
    const isShareEquity = (a: any) => a.account_type === 'equity' && (a.account_name.includes('share') || a.account_name.includes('capital') || a.account_name.includes('share premium') || a.account_name.includes('treasury'));
    const isLeaseLiability = (a: any) => a.account_type === 'liability' && a.account_name.includes('lease');
    const borrowingsCurr = sum(lowerCurr.filter(isLoanLiability));
    const borrowingsPrev = sum(lowerPrev.filter(isLoanLiability));
    const borrowingsPrevPrev = sum(lowerPrevPrev.filter(isLoanLiability));
    const borrowingsChangeCurr = borrowingsCurr - borrowingsPrev;
    const borrowingsChangePrev = borrowingsPrev - borrowingsPrevPrev;
    const proceedsBorrowingsCurr = Math.max(0, borrowingsChangeCurr);
    const repaymentBorrowingsCurr = Math.max(0, -borrowingsChangeCurr);
    const proceedsBorrowingsPrev = Math.max(0, borrowingsChangePrev);
    const repaymentBorrowingsPrev = Math.max(0, -borrowingsChangePrev);
    const sharesCurr = sum(lowerCurr.filter(isShareEquity));
    const sharesPrev = sum(lowerPrev.filter(isShareEquity));
    const sharesPrevPrev = sum(lowerPrevPrev.filter(isShareEquity));
    const sharesChangeCurr = sharesCurr - sharesPrev;
    const sharesChangePrev = sharesPrev - sharesPrevPrev;
    const proceedsSharesCurr = Math.max(0, sharesChangeCurr);
    const repurchaseSharesCurr = Math.max(0, -sharesChangeCurr);
    const proceedsSharesPrev = Math.max(0, sharesChangePrev);
    const repurchaseSharesPrev = Math.max(0, -sharesChangePrev);
    const leasesCurr = sum(lowerCurr.filter(isLeaseLiability));
    const leasesPrev = sum(lowerPrev.filter(isLeaseLiability));
    const leasesPrevPrev = sum(lowerPrevPrev.filter(isLeaseLiability));
    const leasesChangeCurr = leasesCurr - leasesPrev;
    const leasesChangePrev = leasesPrev - leasesPrevPrev;
    const leasesPaidCurr = Math.max(0, -leasesChangeCurr);
    const leasesPaidPrev = Math.max(0, -leasesChangePrev);
    const netInvestingCurr = investingProceedsCurr - (Math.abs(investingPurchasesCurr) + Math.abs(loanFinancedAcqCurr));
    const netInvestingPrev = investingProceedsPrev - (Math.abs(investingPurchasesPrev) + Math.abs(loanFinancedAcqPrev));
    const netFinancingCurr = proceedsSharesCurr + proceedsBorrowingsCurr - repurchaseSharesCurr - repaymentBorrowingsCurr - leasesPaidCurr;
    const netFinancingPrev = proceedsSharesPrev + proceedsBorrowingsPrev - repurchaseSharesPrev - repaymentBorrowingsPrev - leasesPaidPrev;
    const netChangeCurr = netOperatingCurr + netInvestingCurr + netFinancingCurr;
    const netChangePrev = netOperatingPrev + netInvestingPrev + netFinancingPrev;
    const rows: Array<{ label: string; curr: number; prev: number; bold?: boolean }> = [];
    rows.push({ label: 'CASH FLOWS FROM OPERATING ACTIVITIES', curr: 0, prev: 0, bold: true });
    rows.push({ label: 'Profit before tax', curr: profitBeforeTaxCurr, prev: profitBeforeTaxPrev });
    rows.push({ label: 'Depreciation and amortisation', curr: depAmortBal(lowerCurr), prev: depAmortBal(lowerPrev) });
    rows.push({ label: 'Impairment losses / reversals', curr: impairmentBal(lowerCurr), prev: impairmentBal(lowerPrev) });
    rows.push({ label: 'Profit on disposal of assets', curr: -Math.abs(profitDisposalBal(lowerCurr)), prev: -Math.abs(profitDisposalBal(lowerPrev)) });
    rows.push({ label: 'Loss on disposal of assets', curr: Math.abs(lossDisposalBal(lowerCurr)), prev: Math.abs(lossDisposalBal(lowerPrev)) });
    rows.push({ label: 'Finance costs', curr: financeCostsBal(lowerCurr), prev: financeCostsBal(lowerPrev) });
    rows.push({ label: 'Interest income', curr: -Math.abs(interestIncomeBal(lowerCurr)), prev: -Math.abs(interestIncomeBal(lowerPrev)) });
    rows.push({ label: 'Unrealised foreign exchange differences', curr: fxUnrealisedBal(lowerCurr), prev: fxUnrealisedBal(lowerPrev) });
    rows.push({ label: 'Movements in provisions', curr: provisionsMoveBal(lowerCurr), prev: provisionsMoveBal(lowerPrev) });
    rows.push({ label: 'Fair value adjustments', curr: fairValueAdjBal(lowerCurr), prev: fairValueAdjBal(lowerPrev) });
    rows.push({ label: 'Other non-cash items', curr: otherNonCashBal(lowerCurr), prev: otherNonCashBal(lowerPrev) });
    rows.push({ label: 'Changes in working capital:', curr: workingCapitalCurr, prev: workingCapitalPrev, bold: true });
    rows.push({ label: '(Increase)/Decrease in trade receivables', curr: -receivablesChangeCurr, prev: -receivablesChangePrev });
    rows.push({ label: '(Increase)/Decrease in inventories', curr: -inventoriesChangeCurr, prev: -inventoriesChangePrev });
    rows.push({ label: 'Increase/(Decrease) in trade payables', curr: payablesChangeCurr, prev: payablesChangePrev });
    rows.push({ label: 'Cash generated from operations', curr: cashGeneratedCurr, prev: cashGeneratedPrev, bold: true });
    rows.push({ label: 'Interest received', curr: interestReceivedBal(lowerCurr), prev: interestReceivedBal(lowerPrev) });
    rows.push({ label: 'Interest paid', curr: -Math.abs(interestPaidBal(lowerCurr)), prev: -Math.abs(interestPaidBal(lowerPrev)) });
    rows.push({ label: 'Dividends received', curr: dividendsReceivedBal(lowerCurr), prev: dividendsReceivedBal(lowerPrev) });
    rows.push({ label: 'Dividends paid', curr: -Math.abs(dividendsPaidBal(lowerCurr)), prev: -Math.abs(dividendsPaidBal(lowerPrev)) });
    rows.push({ label: 'Tax paid', curr: -Math.abs(taxPaidBal(lowerCurr)), prev: -Math.abs(taxPaidBal(lowerPrev)) });
    rows.push({ label: 'Net cash from operating activities', curr: netOperatingCurr, prev: netOperatingPrev, bold: true });
    rows.push({ label: 'CASH FLOWS FROM INVESTING ACTIVITIES', curr: 0, prev: 0, bold: true });
    rows.push({ label: 'Purchase of property, plant and equipment', curr: -(Math.abs(investingPurchasesCurr) + Math.abs(loanFinancedAcqCurr)), prev: -(Math.abs(investingPurchasesPrev) + Math.abs(loanFinancedAcqPrev)) });
    rows.push({ label: 'Proceeds from disposal of property, plant and equipment', curr: investingProceedsCurr, prev: investingProceedsPrev });
    rows.push({ label: 'Net cash from investing activities', curr: netInvestingCurr, prev: netInvestingPrev, bold: true });
    rows.push({ label: 'CASH FLOWS FROM FINANCING ACTIVITIES', curr: 0, prev: 0, bold: true });
    rows.push({ label: 'Proceeds from issue of shares', curr: proceedsSharesCurr, prev: proceedsSharesPrev });
    rows.push({ label: 'Repurchase of shares', curr: -Math.abs(repurchaseSharesCurr), prev: -Math.abs(repurchaseSharesPrev) });
    rows.push({ label: 'Proceeds from borrowings', curr: proceedsBorrowingsCurr, prev: proceedsBorrowingsPrev });
    rows.push({ label: 'Repayment of borrowings', curr: -Math.abs(repaymentBorrowingsCurr), prev: -Math.abs(repaymentBorrowingsPrev) });
    rows.push({ label: 'Lease liabilities paid (IFRS 16)', curr: -Math.abs(leasesPaidCurr), prev: -Math.abs(leasesPaidPrev) });
    rows.push({ label: 'Net cash from financing activities', curr: netFinancingCurr, prev: netFinancingPrev, bold: true });
    rows.push({ label: 'Net change in cash and cash equivalents', curr: netChangeCurr, prev: netChangePrev, bold: true });
    rows.push({ label: 'Cash and cash equivalents at beginning of period', curr: cfCurr.opening_cash_balance, prev: cfPrev.opening_cash_balance });
    rows.push({ label: 'Cash and cash equivalents at end of period', curr: cfCurr.opening_cash_balance + netChangeCurr, prev: cfPrev.opening_cash_balance + netChangePrev, bold: true });

    const tiny = 0.00001;
    const isSectionHeader = (label: string) =>
      label.startsWith('CASH FLOWS FROM') || label === 'Changes in working capital:';
    const isTotalRow = (label: string) =>
      label.startsWith('Cash generated from operations') ||
      label.startsWith('Net cash from operating activities') ||
      label.startsWith('Net cash from investing activities') ||
      label.startsWith('Net cash from financing activities') ||
      label.startsWith('Net change in cash and cash equivalents') ||
      label.startsWith('Cash and cash equivalents at beginning of period') ||
      label.startsWith('Cash and cash equivalents at end of period');

    const filteredRows: typeof rows = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const nonZero = Math.abs(r.curr) > tiny || Math.abs(r.prev) > tiny;

      if (isSectionHeader(r.label)) {
        let hasNonZeroChild = false;
        for (let j = i + 1; j < rows.length; j++) {
          const next = rows[j];
          if (isSectionHeader(next.label)) break;
          const nextNonZero = Math.abs(next.curr) > tiny || Math.abs(next.prev) > tiny;
          if (nextNonZero) {
            hasNonZeroChild = true;
            break;
          }
        }
        if (hasNonZeroChild) {
          filteredRows.push(r);
        }
        continue;
      }

      if (nonZero || isTotalRow(r.label)) {
        filteredRows.push(r);
      }
    }
    return (
      <div className="space-y-4">
        <h3 className="text-xl font-bold">Comparative Cash Flow Statement</h3>
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-left font-semibold">Item</th>
                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">
                  {y}
                  <span className="text-xs font-normal text-muted-foreground block">{format(yStartDate, 'dd MMM')} - {format(yEndDate, 'dd MMM')}</span>
                </th>
                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">
                  {py}
                  <span className="text-xs font-normal text-muted-foreground block">{format(pyStartDate, 'dd MMM')} - {format(pyEndDate, 'dd MMM')}</span>
                </th>
                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">% Change</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => (
                <tr key={`pl-comp-${i}-${r.label}`} className="border-b hover:bg-muted/50">
                  <td className={`p-2 ${r.bold ? 'font-semibold' : ''}`}>{r.label}</td>
                  <td className={`p-2 text-right border-l border-muted-foreground/20 ${r.bold ? 'font-semibold' : ''}`}>R {r.curr.toLocaleString()}</td>
                  <td className={`p-2 text-right border-l border-muted-foreground/20 ${r.bold ? 'font-semibold' : ''}`}>R {r.prev.toLocaleString()}</td>
                  <td className={`p-2 text-right border-l border-muted-foreground/20 ${pctClass(percentChange(r.curr, r.prev))} ${r.bold ? 'font-semibold' : ''}`}>
                    {percentChange(r.curr, r.prev).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderComparativeRetainedEarnings = () => {
    const y = comparativeYearA;
    const py = comparativeYearB;
    const { startDate: yStartDate, endDate: yEndDate } = getFiscalYearDates(y);
    const { startDate: pyStartDate, endDate: pyEndDate } = getFiscalYearDates(py);
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
    const sum = (arr: TrialBalanceRow[]) => arr.reduce((s, r) => s + Number(r.balance || 0), 0);

    // Calculate Net Profit for Year A
    const revenueCurr = trialBalance.filter(r => r.account_type.toLowerCase() === 'revenue' || r.account_type.toLowerCase() === 'income');
    const expensesCurr = trialBalance.filter(r => String(r.account_type || '').toLowerCase() === 'expense');
    const costOfSalesCurr = expensesCurr.filter(r => r.account_name.toLowerCase().includes('cost of') || String(r.account_code || '').startsWith('50'));
    const operatingExpensesCurr = expensesCurr
      .filter(r => !costOfSalesCurr.includes(r))
      .filter(r => !String(r.account_name || '').toLowerCase().includes('vat'))
      .filter(r => !(String(r.account_code || '') === '5600' || String(r.account_name || '').toLowerCase().includes('depreciation')));
    
    const totalRevenueCurr = sum(revenueCurr);
    const totalCostOfSalesCurrRaw = sum(costOfSalesCurr);
    const totalCostOfSalesCurr = totalCostOfSalesCurrRaw > 0 ? totalCostOfSalesCurrRaw : fallbackCOGS;
    const grossProfitCurr = totalRevenueCurr - totalCostOfSalesCurr;
    const totalOperatingExpensesCurr = sum(operatingExpensesCurr);
    const netProfitCurr = grossProfitCurr - totalOperatingExpensesCurr;

    // Calculate Net Profit for Year B
    const revenuePrev = trialBalancePrev.filter(r => r.account_type.toLowerCase() === 'revenue' || r.account_type.toLowerCase() === 'income');
    const expensesPrev = trialBalancePrev.filter(r => String(r.account_type || '').toLowerCase() === 'expense');
    const costOfSalesPrev = expensesPrev.filter(r => r.account_name.toLowerCase().includes('cost of') || String(r.account_code || '').startsWith('50'));
    const operatingExpensesPrev = expensesPrev
      .filter(r => !costOfSalesPrev.includes(r))
      .filter(r => !String(r.account_name || '').toLowerCase().includes('vat'))
      .filter(r => !(String(r.account_code || '') === '5600' || String(r.account_name || '').toLowerCase().includes('depreciation')));

    const totalRevenuePrev = sum(revenuePrev);
    const totalCostOfSalesPrevRaw = sum(costOfSalesPrev);
    const totalCostOfSalesPrev = totalCostOfSalesPrevRaw > 0 ? totalCostOfSalesPrevRaw : fallbackCOGSPrev;
    const grossProfitPrev = totalRevenuePrev - totalCostOfSalesPrev;
    const totalOperatingExpensesPrev = sum(operatingExpensesPrev);
    const netProfitPrev = grossProfitPrev - totalOperatingExpensesPrev;

    // Dividends & Drawings
    const getDividends = (tb: TrialBalanceRow[]) => tb
      .filter(r => String(r.account_type || '').toLowerCase() === 'equity' && (String(r.account_code || '') === '3500' || String(r.account_name || '').toLowerCase().includes('dividend')))
      .reduce((sum, r) => sum + Math.abs(Number(r.balance || 0)), 0);
    
    const getDrawings = (tb: TrialBalanceRow[]) => tb
      .filter(r => String(r.account_type || '').toLowerCase() === 'equity' && (String(r.account_code || '') === '3400' || String(r.account_name || '').toLowerCase().includes('drawings')))
      .reduce((sum, r) => sum + Math.abs(Number(r.balance || 0)), 0);

    const dividendsCurr = getDividends(trialBalance);
    const drawingsCurr = getDrawings(trialBalance);
    const dividendsPrev = getDividends(trialBalancePrev);
    const drawingsPrev = getDrawings(trialBalancePrev);

    // Opening Retained Earnings logic:
    // If periodMode is monthly, we use retainedOpeningYTD for current year.
    // For Previous Year in monthly mode, it's harder to get exact opening without full history.
    // However, usually: Opening = Closing (from BS) - Net Profit + Dividends + Drawings
    
    // Let's rely on Closing RE from Balance Sheet As Of end date
    const getClosingRE = (tbAsOf: TrialBalanceRow[]) => {
        const row = tbAsOf.find(r => String(r.account_type || '').toLowerCase() === 'equity' && String(r.account_name || '').toLowerCase().includes('retained earning'));
        return Number(row?.balance || 0);
    };

    const closingRECurr = getClosingRE(trialBalanceCompAsOfA);
    const closingREPrev = getClosingRE(trialBalanceCompAsOfB);

    // Back-calculate Opening RE to ensure the statement flows correctly
    const openingRECurr = closingRECurr - netProfitCurr + dividendsCurr + drawingsCurr;
    const openingREPrev = closingREPrev - netProfitPrev + dividendsPrev + drawingsPrev;

    const rows = [
        { label: 'Opening Retained Earnings', curr: openingRECurr, prev: openingREPrev },
        { label: 'Add: Net Profit/(Loss) for the period', curr: netProfitCurr, prev: netProfitPrev },
        { label: 'Less: Dividends Declared', curr: -dividendsCurr, prev: -dividendsPrev },
        { label: 'Less: Drawings', curr: -drawingsCurr, prev: -drawingsPrev },
        { label: 'Closing Retained Earnings', curr: closingRECurr, prev: closingREPrev, bold: true, borderTop: true }
    ];

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold">Comparative Statement of Changes in Equity (Retained Earnings)</h3>
            <UnallocatedWarningBanner />
            <div className="rounded-md border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50">
                            <th className="p-2 text-left font-semibold">Item</th>
                            <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">
                              {y}
                              <span className="text-xs font-normal text-muted-foreground block">{format(yStartDate, 'dd MMM')} - {format(yEndDate, 'dd MMM')}</span>
                            </th>
                            <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">
                              {py}
                              <span className="text-xs font-normal text-muted-foreground block">{format(pyStartDate, 'dd MMM')} - {format(pyEndDate, 'dd MMM')}</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={`re-comp-${i}`} className={`border-b hover:bg-muted/50 ${r.borderTop ? 'border-t-2' : ''}`}>
                                <td className={`p-2 ${r.bold ? 'font-bold' : ''}`}>{r.label}</td>
                                <td className={`p-2 text-right border-l border-muted-foreground/20 ${r.bold ? 'font-bold' : ''}`}>{formatCurrency(r.curr)}</td>
                                <td className={`p-2 text-right border-l border-muted-foreground/20 ${r.bold ? 'font-bold' : ''}`}>{formatCurrency(r.prev)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
  };

  const renderComparativeNotes = () => {
    const y = comparativeYearA;
    const py = comparativeYearB;
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
    const sum = (arr: TrialBalanceRow[]) => arr.reduce((s, r) => s + Number(r.balance || 0), 0);
    const toLower = (s: string) => String(s || '').toLowerCase();

    // Helper to get rows for a specific year
    const getData = (tbAsOf: TrialBalanceRow[], tbMovement: TrialBalanceRow[]) => {
        const nonCurrentAssets = tbAsOf.filter(r => toLower(r.account_type) === 'asset' && parseInt(String(r.account_code || '0'), 10) >= 1500);
        const ppeItems = nonCurrentAssets.filter(r => !toLower(r.account_name).includes('accumulated') && !toLower(r.account_name).includes('intangible') && !toLower(r.account_name).includes('investment'));
        const accDepItems = nonCurrentAssets.filter(r => toLower(r.account_name).includes('accumulated'));
        
        const inventoryItems = tbAsOf.filter(r => toLower(r.account_type) === 'asset' && toLower(r.account_name).includes('inventory'));

        const tradeReceivables = tbAsOf.filter(r => toLower(r.account_type) === 'asset' && (toLower(r.account_name).includes('trade receivable') || toLower(r.account_name).includes('accounts receivable')));
        const impairment = tbAsOf.filter(r => toLower(r.account_type) === 'asset' && toLower(r.account_name).includes('impairment'));
        const otherReceivables = tbAsOf.filter(r => toLower(r.account_type) === 'asset' && !tradeReceivables.includes(r) && !inventoryItems.includes(r) && !ppeItems.includes(r) && !toLower(r.account_name).includes('bank') && !toLower(r.account_name).includes('cash') && parseInt(String(r.account_code || '0'), 10) < 1500);

        const cashItems = tbAsOf.filter(r => toLower(r.account_type) === 'asset' && (toLower(r.account_name).includes('cash') || toLower(r.account_name).includes('bank')));
        
        const tradePayables = tbAsOf.filter(r => toLower(r.account_type) === 'liability' && (toLower(r.account_name).includes('trade payable') || toLower(r.account_name).includes('accounts payable')));
        const otherPayables = tbAsOf.filter(r => toLower(r.account_type) === 'liability' && !tradePayables.includes(r) && !toLower(r.account_name).includes('tax') && !toLower(r.account_name).includes('vat'));

        const revenueItems = tbMovement.filter(r => toLower(r.account_type) === 'revenue' || toLower(r.account_type) === 'income');
        
        const cogsItems = tbMovement.filter(r => (String(r.account_code || '')).startsWith('50') || toLower(r.account_name).includes('cost of') || toLower(r.account_name).includes('purchases'));

        const expenseItems = tbMovement.filter(r => toLower(r.account_type) === 'expense' && !cogsItems.includes(r) && !toLower(r.account_name).includes('tax'));

        const taxItems = tbMovement.filter(r => toLower(r.account_type) === 'expense' && toLower(r.account_name).includes('tax'));

        const equityItems = tbAsOf.filter(r => toLower(r.account_type) === 'equity');

        return { ppeItems, accDepItems, inventoryItems, tradeReceivables, impairment, otherReceivables, cashItems, tradePayables, otherPayables, revenueItems, cogsItems, expenseItems, taxItems, equityItems };
    };

    const dataA = getData(trialBalanceCompAsOfA, trialBalance);
    const dataB = getData(trialBalanceCompAsOfB, trialBalancePrev);

    const renderTable = (title: string, itemsA: TrialBalanceRow[], itemsB: TrialBalanceRow[], totalLabel: string) => {
        const allCodes = Array.from(new Set([...itemsA.map(i => i.account_code), ...itemsB.map(i => i.account_code)]));
        const rows = allCodes.map(code => {
            const itemA = itemsA.find(i => i.account_code === code);
            const itemB = itemsB.find(i => i.account_code === code);
            const name = itemA?.account_name || itemB?.account_name || 'Unknown Account';
            const valA = itemA?.balance || 0;
            const valB = itemB?.balance || 0;
            return { code, name, valA, valB };
        }).sort((a, b) => a.code.localeCompare(b.code));

        const totalA = rows.reduce((s, r) => s + r.valA, 0);
        const totalB = rows.reduce((s, r) => s + r.valB, 0);

        return (
            <div className="space-y-4 break-inside-avoid">
                <h3 className="text-lg font-semibold">{title}</h3>
                <div className="rounded-md border">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50">
                                <th className="p-2 text-left font-semibold">Description</th>
                                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">{y}</th>
                                <th className="p-2 text-right font-semibold border-l border-muted-foreground/20">{py}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(row => (
                                <tr key={row.code} className="border-b hover:bg-muted/50">
                                    <td className="p-2">{row.name}</td>
                                    <td className="p-2 text-right border-l border-muted-foreground/20">{formatCurrency(Math.abs(row.valA))}</td>
                                    <td className="p-2 text-right border-l border-muted-foreground/20">{formatCurrency(Math.abs(row.valB))}</td>
                                </tr>
                            ))}
                            <tr className="bg-muted/50 font-bold">
                                <td className="p-2">{totalLabel}</td>
                                <td className="p-2 text-right border-l border-muted-foreground/20">{formatCurrency(Math.abs(totalA))}</td>
                                <td className="p-2 text-right border-l border-muted-foreground/20">{formatCurrency(Math.abs(totalB))}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-8 p-4 mt-8 border-t-4 border-double pt-8">
            <div className="border-b pb-4">
                <h2 className="text-2xl font-bold text-center">Notes to the Comparative Financial Statements</h2>
                <p className="text-center text-muted-foreground">Detailed breakdown for {y} and {py}</p>
            </div>

            {renderTable('1. Property, Plant & Equipment', dataA.ppeItems, dataB.ppeItems, 'Total PPE')}
            {renderTable('2. Inventory', dataA.inventoryItems, dataB.inventoryItems, 'Total Inventory')}
            {renderTable('3. Trade Receivables', dataA.tradeReceivables, dataB.tradeReceivables, 'Total Trade Receivables')}
            {renderTable('4. Cash & Cash Equivalents', dataA.cashItems, dataB.cashItems, 'Total Cash & Equivalents')}
            {renderTable('5. Trade Payables', dataA.tradePayables, dataB.tradePayables, 'Total Trade Payables')}
            {renderTable('6. Revenue', dataA.revenueItems, dataB.revenueItems, 'Total Revenue')}
            {renderTable('7. Cost of Sales', dataA.cogsItems, dataB.cogsItems, 'Total Cost of Sales')}
            {renderTable('8. Operating Expenses', dataA.expenseItems, dataB.expenseItems, 'Total Operating Expenses')}
            {renderTable('9. Taxation', dataA.taxItems, dataB.taxItems, 'Total Taxation')}
            {renderTable('10. Equity', dataA.equityItems, dataB.equityItems, 'Total Equity')}
        </div>
    );
  };

  const renderRetainedEarnings = () => {
    const toLower = (s: string) => String(s || '').toLowerCase();
    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
      }).format(amount);

    const isMonthMode = retainedSelectedMonths.length > 0 && retainedMonthSnapshots.length > 0;
    const isCompareMode = retainedCompareEnabled && !isMonthMode;

    if (retainedMultiLoading) {
      return (
        <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[400px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8 flex items-center justify-center">
          <div className="text-sm text-gray-600">Loading selected equity periods…</div>
        </div>
      );
    }

    if (isCompareMode) {
      return renderComparativeRetainedEarnings();
    }

    if (isMonthMode) {
      const rows = [
        { key: 'opening', label: 'Opening Retained Earnings', get: (s: typeof retainedMonthSnapshots[number]) => s.opening },
        { key: 'profit', label: 'Add: Net Profit/(Loss) for the period', get: (s: typeof retainedMonthSnapshots[number]) => s.profit },
        { key: 'dividends', label: 'Less: Dividends Declared', get: (s: typeof retainedMonthSnapshots[number]) => -Math.abs(s.dividends) },
        { key: 'drawings', label: 'Less: Drawings', get: (s: typeof retainedMonthSnapshots[number]) => -Math.abs(s.drawings) },
        { key: 'closing', label: 'Closing Retained Earnings', get: (s: typeof retainedMonthSnapshots[number]) => s.closing },
      ];

      return (
        <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[600px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8">
          <div className="text-center mb-12">
            <h1 className="text-[24px] font-bold text-gray-900 uppercase tracking-wide mb-2">
              Statement of Changes in Equity
            </h1>
            <p className="text-gray-600 mb-1">Retained earnings movement for selected periods</p>
            <p className="text-[18px] font-semibold text-gray-900 mb-1">{companyName}</p>
            <p className="text-sm text-gray-500">Currency: ZAR</p>
          </div>
          <UnallocatedWarningBanner />
          <div className="mb-8 w-full">
            <h2 className="text-[18px] font-bold text-[#1f2937] uppercase mb-1">
              Retained Earnings – Multi-period view
            </h2>
            <div className="w-full border-b-2 border-[#1f2937] mb-4" />
            <div className="mb-6 border border-gray-300 overflow-x-auto">
              <table className="min-w-[700px] w-full text-sm border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300">
                    <th className="py-2 pl-4 text-left font-bold text-gray-900 w-1/2 whitespace-nowrap">
                      Item
                    </th>
                    {retainedMonthSnapshots.map(col => (
                      <th
                        key={col.label}
                        className="py-2 pr-4 pl-2 text-right font-semibold text-gray-900 tabular-nums border-l border-gray-300 whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr
                      key={r.key}
                      className={`border-b border-gray-200 hover:bg-gray-50 ${
                        r.key === 'closing' ? 'bg-gray-50 font-semibold border-t-2 border-t-gray-300' : ''
                      }`}
                    >
                      <td className="py-2 pl-4 pr-2 whitespace-nowrap">{r.label}</td>
                      {retainedMonthSnapshots.map(col => {
                        const val = r.get(col);
                        return (
                          <td
                            key={`${r.key}-${col.label}`}
                            className="py-2 pr-4 pl-2 text-right font-mono tabular-nums border-l border-gray-200 whitespace-nowrap"
                          >
                            {formatCurrency(val)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    const dividendsDuring = trialBalance
      .filter(
        r =>
          toLower(String(r.account_type || '')) === 'equity' &&
          (String(r.account_code || '') === '3500' ||
            toLower(String(r.account_name || '')).includes('dividend'))
      )
      .reduce((sum, r) => sum + Math.abs(Number(r.balance || 0)), 0);
    const drawingsDuring = trialBalance
      .filter(
        r =>
          toLower(String(r.account_type || '')) === 'equity' &&
          (String(r.account_code || '') === '3400' ||
            toLower(String(r.account_name || '')).includes('drawings'))
      )
      .reduce((sum, r) => sum + Math.abs(Number(r.balance || 0)), 0);
    const retainedRow = trialBalanceAsOf.find(
      r =>
        toLower(String(r.account_type || '')) === 'equity' &&
        toLower(String(r.account_name || '')).includes('retained earning')
    );
    const opening = periodMode === 'monthly' ? retainedOpeningYTD : Number(retainedRow?.balance || 0);
    const during = netProfitPeriod;
    const closing = opening + during - dividendsDuring - drawingsDuring;

    return (
      <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[600px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8">
        <div className="text-center mb-12">
          <h1 className="text-[24px] font-bold text-gray-900 uppercase tracking-wide mb-2">
            Statement of Changes in Equity
          </h1>
          <p className="text-gray-600 mb-1">
            Retained earnings for the period ended {format(new Date(periodEnd), 'dd MMMM yyyy')}
          </p>
          <p className="text-[18px] font-semibold text-gray-900 mb-1">{companyName}</p>
          <p className="text-sm text-gray-500">Currency: ZAR</p>
        </div>
        <UnallocatedWarningBanner />

        <div className="mb-8 w-full">
          <h2 className="text-[18px] font-bold text-[#1f2937] uppercase mb-1">
            Retained Earnings – Single period view
          </h2>
          <div className="w-full border-b-2 border-[#1f2937] mb-4" />

          <div className="mb-6 border border-gray-300 overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <colgroup>
                <col className="w-auto" />
                <col className="w-[220px]" />
              </colgroup>
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="py-2 pl-4 text-left font-bold text-gray-900">
                    Description
                  </th>
                  <th className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums border-l border-gray-300">
                    Retained earnings
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pl-4 pr-2">
                    Opening retained earnings
                  </td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums border-l border-gray-200">
                    {formatCurrency(opening)}
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pl-4 pr-2">
                    Add: Net profit/(loss) for the period
                  </td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums border-l border-gray-200">
                    {formatCurrency(during)}
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pl-4 pr-2">
                    Less: Dividends declared
                  </td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums border-l border-gray-200">
                    {formatCurrency(dividendsDuring)}
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pl-4 pr-2">
                    Less: Drawings
                  </td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums border-l border-gray-200">
                    {formatCurrency(drawingsDuring)}
                  </td>
                </tr>
                <tr className="bg-gray-50 border-t-2 border-b-2 border-gray-300">
                  <td className="py-2 pl-4 pr-2 font-semibold text-gray-900">
                    Closing retained earnings
                  </td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums font-semibold text-gray-900 border-l border-gray-300">
                    {formatCurrency(closing)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // GAAP Income Statement
  const renderIncomeStatement = () => {
    // Helper to sum accounts
    const sum = (arr: any[]) => arr.reduce((s, r) => s + Number(r.balance || 0), 0);
    const toLower = (s: string) => String(s || '').toLowerCase();
    
    // 1. Revenue & Other Income Separation
    const allRevenue = trialBalance.filter(r => toLower(r.account_type) === 'revenue' || toLower(r.account_type) === 'income');
    
    const isOtherIncome = (r: any) => {
        const name = toLower(r.account_name);
        return name.includes('interest') || name.includes('dividend') || name.includes('gain') || name.includes('profit') || name.includes('other income') || name.includes('discount received');
    };
    
    const salesItems = allRevenue.filter(r => !isOtherIncome(r));
    const otherIncomeItems = allRevenue.filter(r => isOtherIncome(r));
    
    // 2. Cost of Sales
    const costOfSales = trialBalance.filter(r => (String(r.account_code || '')).startsWith('50') || (String(r.account_name || '').toLowerCase().includes('cost of')));
    
    // 3. Expenses
    const operatingExpenses = trialBalance
      .filter(r => (String(r.account_type || '').toLowerCase() === 'expense') && !costOfSales.includes(r))
      .filter(r => !String(r.account_name || '').toLowerCase().includes('vat'))
      .filter(r => !(String(r.account_code || '') === '5600' || String(r.account_name || '').toLowerCase().includes('depreciation')));

    // Calculations
    const totalSales = sum(salesItems);
    const totalCostOfSales = sum(costOfSales);
    const cogsValue = totalCostOfSales > 0 ? totalCostOfSales : fallbackCOGS;
    const grossProfit = totalSales - cogsValue;
    
    const totalOtherIncome = sum(otherIncomeItems);
    
    const totalOperatingExpenses = sum(operatingExpenses);
    const depVal = Number(depExpensePeriod || 0);
    const totalExpensesWithDep = totalOperatingExpenses + depVal;
    
    const netProfit = grossProfit + totalOtherIncome - totalExpensesWithDep;

    return (
      <div className="font-sans text-slate-800 bg-white min-h-[600px] p-4">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start mb-6 border-b pb-4">
          <div>
            <h1 className="text-2xl font-normal text-slate-700 mb-1">Income Statement</h1>
            <h2 className="text-lg text-slate-600 mb-2">{title === "Income Statement" ? "Statement of Profit or Loss" : title}</h2>
            <div className="text-sm text-slate-500">Run Date: {format(new Date(), 'dd/MM/yyyy')}</div>
            <div className="text-sm text-slate-500">Period: {format(new Date(periodStart), 'dd/MM/yyyy')} to {format(new Date(periodEnd), 'dd/MM/yyyy')}</div>
          </div>
            <div className="flex flex-col items-end gap-2 mt-4 sm:mt-0">
             <Button 
              variant="outline" 
              className="bg-[#0070ad] hover:bg-[#005a8d] text-white border-none h-8 text-xs"
              onClick={() => setShowFilters(!showFilters)}
             >
               Report Options
             </Button>
          </div>
        </div>
        <UnallocatedWarningBanner />

        {/* Main Table */}
        <div className="w-full overflow-auto">
          <table className="w-full text-sm border border-slate-200">
            <tbody>
                {/* Sales */}
                <tr>
                    <td colSpan={2} className="pt-2 pb-1 font-semibold text-[#0070ad] text-base border-b border-slate-200">Sales</td>
                </tr>
                {salesItems.length > 0 ? salesItems.map(row => (
                    <tr key={row.account_id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => handleDrilldown(row.account_id, row.account_name)}>
                        <td className="py-1 pl-4 text-slate-600">{row.account_name}</td>
                        <td className="text-right font-mono text-slate-700 py-1 pr-2">{formatRand(row.balance)}</td>
                    </tr>
                )) : (
                    <tr><td colSpan={2} className="py-1 pl-4 text-slate-400 italic">No sales recorded</td></tr>
                )}
                <tr className="bg-slate-50/50 font-semibold">
                    <td className="py-2 pl-4 text-slate-700">Total for Sales</td>
                    <td className="text-right font-mono text-slate-800 py-2 pr-2">{formatRand(totalSales)}</td>
                </tr>

                {/* Cost of Sales */}
                <tr><td colSpan={2} className="py-2"></td></tr>
                <tr>
                    <td colSpan={2} className="pt-2 pb-1 font-semibold text-[#0070ad] text-base border-b border-slate-200">Cost of Sales</td>
                </tr>
                {costOfSales.length > 0 ? costOfSales.map(row => (
                    <tr key={row.account_id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => handleDrilldown(row.account_id, row.account_name)}>
                        <td className="py-1 pl-4 text-slate-600">{row.account_name}</td>
                        <td className="text-right font-mono text-slate-700 py-1 pr-2">{formatRand(row.balance)}</td>
                    </tr>
                )) : (
                    cogsValue > 0 ? (
                        <tr>
                            <td className="py-1 pl-4 text-slate-600">Calculated Cost of Sales</td>
                            <td className="text-right font-mono text-slate-700 py-1 pr-2">{formatRand(cogsValue)}</td>
                        </tr>
                    ) : (
                        <tr><td colSpan={2} className="py-1 pl-4 text-slate-400 italic">No cost of sales recorded</td></tr>
                    )
                )}
                <tr className="bg-slate-50/50 font-semibold">
                    <td className="py-2 pl-4 text-slate-700">Total for Cost of Sales</td>
                    <td className="text-right font-mono text-slate-800 py-2 pr-2">{formatRand(cogsValue)}</td>
                </tr>

                {/* Gross Profit */}
                <tr><td colSpan={2} className="py-2"></td></tr>
                <tr className="bg-slate-100 font-bold border-t border-b border-slate-300">
                    <td className="py-2 pl-4 text-slate-800">Gross Profit</td>
                    <td className="text-right font-mono text-slate-900 py-2 pr-2">{formatRand(grossProfit)}</td>
                </tr>

                {/* Other Income */}
                {otherIncomeItems.length > 0 && (
                    <>
                        <tr><td colSpan={2} className="py-2"></td></tr>
                        <tr>
                            <td colSpan={2} className="pt-2 pb-1 font-semibold text-[#0070ad] text-base border-b border-slate-200">Other Income</td>
                        </tr>
                        {otherIncomeItems.map(row => (
                            <tr key={row.account_id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => handleDrilldown(row.account_id, row.account_name)}>
                                <td className="py-1 pl-4 text-slate-600">{row.account_name}</td>
                                <td className="text-right font-mono text-slate-700 py-1 pr-2">{formatRand(row.balance)}</td>
                            </tr>
                        ))}
                        <tr className="bg-slate-50/50 font-semibold">
                            <td className="py-2 pl-4 text-slate-700">Total for Other Income</td>
                            <td className="text-right font-mono text-slate-800 py-2 pr-2">{formatRand(totalOtherIncome)}</td>
                        </tr>
                    </>
                )}

                {/* Expenses */}
                <tr><td colSpan={2} className="py-2"></td></tr>
                <tr>
                    <td colSpan={2} className="pt-2 pb-1 font-semibold text-[#0070ad] text-base border-b border-slate-200">Expenses</td>
                </tr>
                {operatingExpenses.map(row => (
                    <tr key={row.account_id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => handleDrilldown(row.account_id, row.account_name)}>
                        <td className="py-1 pl-4 text-slate-600">{row.account_name}</td>
                        <td className="text-right font-mono text-slate-700 py-1 pr-2">{formatRand(row.balance)}</td>
                    </tr>
                ))}
                {depVal > 0 && (
                    <tr className="hover:bg-slate-50 group">
                        <td className="py-1 pl-4 text-slate-600">Depreciation Expense</td>
                        <td className="text-right font-mono text-slate-700 py-1 pr-2">{formatRand(depVal)}</td>
                    </tr>
                )}
                <tr className="bg-slate-50/50 font-semibold">
                    <td className="py-2 pl-4 text-slate-700">Total for Expenses</td>
                    <td className="text-right font-mono text-slate-800 py-2 pr-2">{formatRand(totalExpensesWithDep)}</td>
                </tr>

                {/* Net Profit */}
                <tr><td colSpan={2} className="py-4"></td></tr>
                <tr className={`font-bold border-t-2 border-b-2 border-slate-300 ${netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <td className="py-3 pl-4 text-slate-900 text-lg">Net Profit / (Loss)</td>
                    <td className="text-right font-mono text-slate-900 py-3 pr-2 text-lg">{formatRand(netProfit)}</td>
                </tr>
            </tbody>
          </table>
        </div>
        
        {/* Footer */}
        <div className="mt-8 pt-4 border-t text-center text-xs text-[#0070ad] flex justify-center gap-2" />
      </div>
    );
  };

  const renderCashFlowStatement = () => {
    const cf = cashFlow || {
      operating_inflows: 0,
      operating_outflows: 0,
      net_cash_from_operations: 0,
      investing_inflows: 0,
      investing_outflows: 0,
      net_cash_from_investing: 0,
      financing_inflows: 0,
      financing_outflows: 0,
      net_cash_from_financing: 0,
      opening_cash_balance: 0,
      closing_cash_balance: 0,
      net_change_in_cash: 0,
    };
    const lowerTB = trialBalance.map(a => ({
      account_id: a.account_id,
      account_code: String(a.account_code || ''),
      account_name: String(a.account_name || '').toLowerCase(),
      account_type: String(a.account_type || '').toLowerCase(),
      balance: Number(a.balance || 0)
    }));
    const sum = (arr: any[]) => arr.reduce((s, x) => s + Number(x.balance || 0), 0);
    const buildLower = (arr: any[]) => arr.map(a => ({ account_id: a.account_id, account_code: String(a.account_code || ''), account_name: String(a.account_name || '').toLowerCase(), account_type: String(a.account_type || '').toLowerCase(), balance: Number(a.balance || 0) }));
    const lowerPrevTB = buildLower(trialBalancePrev || []);
    const useComparativeWC = periodMode === 'annual' && lowerPrevTB.length > 0;
    const revenueCF = trialBalance.filter(r => String(r.account_type || '').toLowerCase() === 'revenue' || String(r.account_type || '').toLowerCase() === 'income');
    const cogsCF = trialBalance.filter(r => (String(r.account_code || '')).startsWith('50') || (String(r.account_name || '').toLowerCase().includes('cost of')));
    const opexCF = trialBalance
      .filter(r => String(r.account_type || '').toLowerCase() === 'expense' && !cogsCF.includes(r))
      .filter(r => !String(r.account_name || '').toLowerCase().includes('vat'));
    const totalRevenueCF = revenueCF.reduce((sum, r) => sum + Number(r.balance || 0), 0);
    const totalCOGSCF = cogsCF.reduce((sum, r) => sum + Number(r.balance || 0), 0);
    const cogsValueCF = totalCOGSCF > 0 ? totalCOGSCF : fallbackCOGS;
    const totalOpexCF = opexCF.reduce((sum, r) => sum + Number(r.balance || 0), 0);
    const profitBeforeTax = totalRevenueCF - cogsValueCF - totalOpexCF;
    const depAmort = sum(lowerTB.filter(a => a.account_type === 'expense' && (a.account_name.includes('depreciation') || a.account_name.includes('amortisation') || a.account_name.includes('amortization'))));
    const impairmentNet = sum(lowerTB.filter(a => a.account_name.includes('impairment')));
    const profitDisposal = sum(lowerTB.filter(a => (a.account_code === '9500') || (a.account_name.includes('gain on sale') || a.account_name.includes('disposal gain'))));
    const lossDisposal = sum(lowerTB.filter(a => (a.account_code === '9600') || (a.account_name.includes('loss on sale') || a.account_name.includes('disposal loss'))));
    const financeCosts = sum(lowerTB.filter(a => a.account_type === 'expense' && (a.account_name.includes('finance cost') || a.account_name.includes('interest expense'))));
    const interestIncome = sum(lowerTB.filter(a => (a.account_type === 'revenue' || a.account_type === 'income') && a.account_name.includes('interest')));
    const fxUnrealised = sum(lowerTB.filter(a => a.account_name.includes('unrealised') && (a.account_name.includes('foreign exchange') || a.account_name.includes('fx') || a.account_name.includes('currency'))));
    const provisionsMove = sum(lowerTB.filter(a => (a.account_type === 'liability' || a.account_type === 'expense') && a.account_name.includes('provision')));
    const fairValueAdj = sum(lowerTB.filter(a => a.account_name.includes('fair value')));
    const otherNonCash = sum(lowerTB.filter(a => a.account_name.includes('non-cash') || a.account_name.includes('non cash')));
    const adjustmentsTotal = depAmort + impairmentNet - Math.abs(profitDisposal) + Math.abs(lossDisposal) + financeCosts - Math.abs(interestIncome) + fxUnrealised + provisionsMove + fairValueAdj + otherNonCash;
    const interestReceivedCF = sum(lowerTB.filter(a => (a.account_type === 'revenue' || a.account_type === 'income') && a.account_name.includes('interest')));
    const interestPaidCF = sum(lowerTB.filter(a => a.account_type === 'expense' && (a.account_name.includes('interest') || a.account_name.includes('finance cost'))));
    const dividendsReceivedCF = sum(lowerTB.filter(a => (a.account_type === 'revenue' || a.account_type === 'income') && a.account_name.includes('dividend')));
    const dividendsPaidCF = sum(lowerTB.filter(a => (a.account_type === 'expense' || a.account_type === 'equity') && a.account_name.includes('dividend')));
    const taxPaidCF = sum(lowerTB.filter(a => (a.account_type === 'expense' || a.account_type === 'liability') && a.account_name.includes('tax') && !a.account_name.includes('vat')));
    const isAccumulated = (a: any) => a.account_name.includes('accumulated');
    const isPPE = (a: any) => a.account_type === 'asset' && !isAccumulated(a) && (a.account_name.includes('property') || a.account_name.includes('plant') || a.account_name.includes('equipment') || a.account_name.includes('machinery') || a.account_name.includes('vehicle'));
    const isIntangible = (a: any) => a.account_type === 'asset' && !isAccumulated(a) && (a.account_name.includes('intangible') || a.account_name.includes('software') || a.account_name.includes('patent') || a.account_name.includes('goodwill'));
    const isInvestment = (a: any) => a.account_type === 'asset' && a.account_name.includes('investment');
    const isLoanReceivable = (a: any) => a.account_type === 'asset' && (a.account_name.includes('loan') || a.account_name.includes('advance'));
    const ppeMovement = sum(lowerTB.filter(isPPE));
    const intangibleMovement = sum(lowerTB.filter(isIntangible));
    const investmentMovement = sum(lowerTB.filter(isInvestment));
    const loansMovement = sum(lowerTB.filter(isLoanReceivable));
    const isShareEquity = (a: any) => a.account_type === 'equity' && (a.account_name.includes('share') || a.account_name.includes('capital') || a.account_name.includes('share premium') || a.account_name.includes('treasury'));
    const sharesCurr = sum(lowerTB.filter(isShareEquity));
    const sharesPrev = sum(lowerPrevTB.filter(isShareEquity));
    const sharesChange = sharesCurr - sharesPrev;
    const proceedsShares = Math.max(0, sharesChange);
    const repurchaseShares = Math.max(0, -sharesChange);
    const isLoanLiability = (a: any) => a.account_type === 'liability' && (a.account_name.includes('loan') || a.account_name.includes('borrow') || a.account_name.includes('debenture') || a.account_name.includes('note payable') || a.account_name.includes('overdraft'));
    const borrowingsCurr = sum(lowerTB.filter(isLoanLiability));
    const borrowingsPrev = sum(lowerPrevTB.filter(isLoanLiability));
    const borrowingsChange = borrowingsCurr - borrowingsPrev;
    const proceedsBorrowings = Math.max(0, borrowingsChange);
    const repaymentBorrowings = Math.max(0, -borrowingsChange);
    const isLeaseLiability = (a: any) => a.account_type === 'liability' && a.account_name.includes('lease');
    const leasesCurr = sum(lowerTB.filter(isLeaseLiability));
    const leasesPrev = sum(lowerPrevTB.filter(isLeaseLiability));
    const leasesChange = leasesCurr - leasesPrev;
    const nz = (v: number) => Math.abs(v) > 0.0001;
    const purchasePPE = Math.max(0, ppeMovement);
    const proceedsPPE = ppeDisposalProceeds;
    const purchaseIntangible = Math.max(0, intangibleMovement);
    const proceedsIntangible = Math.max(0, -intangibleMovement);
    const investmentsPurchased = Math.max(0, investmentMovement);
    const investmentsProceeds = Math.max(0, -investmentMovement);
    const loansAdvanced = Math.max(0, loansMovement);
    const loansRepaid = Math.max(0, -loansMovement);
    const leasesPaid = Math.max(0, -leasesChange);
    const financeCostsPaid = Math.abs(financeCosts);
    
    const isAsset = (a: any) => a.account_type === 'asset';
    const isLiability = (a: any) => a.account_type === 'liability';
    const isInventory = (a: any) => a.account_code === '1300' || a.account_name.includes('inventory') || a.account_name.includes('stock');
    const isTradeReceivable = (a: any) => isAsset(a) && (a.account_name.includes('trade receivable') || a.account_name.includes('accounts receivable') || a.account_name.includes('debtors'));
    const isOtherReceivable = (a: any) => isAsset(a) && (a.account_name.includes('other receivable') || a.account_name.includes('prepaid') || a.account_name.includes('deposit')) && !isTradeReceivable(a);
    const isTradePayable = (a: any) => isLiability(a) && (a.account_name.includes('trade payable') || a.account_name.includes('accounts payable') || a.account_name.includes('creditors'));
    const isOtherPayable = (a: any) => isLiability(a) && (a.account_name.includes('other payable') || a.account_name.includes('accrual') || a.account_name.includes('vat payable') || a.account_name.includes('tax payable')) && !isTradePayable(a);

    const tbTradeReceivables = lowerTB.filter(isTradeReceivable);
    const tbInventories = lowerTB.filter(isInventory);
    const tbOtherReceivables = lowerTB.filter(isOtherReceivable);
    const tbTradePayables = lowerTB.filter(isTradePayable);
    const tbOtherPayables = lowerTB.filter(isOtherPayable);

    const prevTradeReceivables = lowerPrevTB.filter(isTradeReceivable);
    const prevInventories = lowerPrevTB.filter(isInventory);
    const prevOtherReceivables = lowerPrevTB.filter(isOtherReceivable);
    const prevTradePayables = lowerPrevTB.filter(isTradePayable);
    const prevOtherPayables = lowerPrevTB.filter(isOtherPayable);

    const currReceivablesSum = sum(tbTradeReceivables);
    const prevReceivablesSum = sum(prevTradeReceivables);
    const currInventoriesSum = sum(tbInventories);
    const prevInventoriesSum = sum(prevInventories);
    const currOtherReceivablesSum = sum(tbOtherReceivables);
    const prevOtherReceivablesSum = sum(prevOtherReceivables);
    const currTradePayablesSum = sum(tbTradePayables);
    const prevTradePayablesSum = sum(prevTradePayables);
    const currOtherPayablesSum = sum(tbOtherPayables);
    const prevOtherPayablesSum = sum(prevOtherPayables);

    const wcTradeReceivables = useComparativeWC ? (prevReceivablesSum - currReceivablesSum) : -currReceivablesSum;
    const wcInventories = useComparativeWC ? (prevInventoriesSum - currInventoriesSum) : -currInventoriesSum;
    const wcOtherReceivables = useComparativeWC ? (prevOtherReceivablesSum - currOtherReceivablesSum) : -currOtherReceivablesSum;
    const wcTradePayables = useComparativeWC ? (currTradePayablesSum - prevTradePayablesSum) : currTradePayablesSum;
    const wcOtherPayables = useComparativeWC ? (currOtherPayablesSum - prevOtherPayablesSum) : currOtherPayablesSum;
    const wcTotal = wcTradeReceivables + wcInventories + wcOtherReceivables + wcTradePayables + wcOtherPayables;
    const cashGeneratedOpsTotal = profitBeforeTax + adjustmentsTotal + wcTotal;
    const netOperatingDisplay = cashGeneratedOpsTotal + interestReceivedCF - Math.abs(interestPaidCF) + dividendsReceivedCF - Math.abs(dividendsPaidCF) - Math.abs(taxPaidCF);
    const netInvestingDisplay = (
      proceedsPPE + proceedsIntangible + investmentsProceeds + loansRepaid
    ) - (
      purchasePPE + purchaseIntangible + investmentsPurchased + loansAdvanced
    );
    const netFinancingDisplay = proceedsShares + proceedsBorrowings - repurchaseShares - repaymentBorrowings - leasesPaid;
    const netChangeDisplay = netOperatingDisplay + netInvestingDisplay + netFinancingDisplay;
    const closingCashDisplay = cf.opening_cash_balance + netChangeDisplay;

    return {
      profitBeforeTax,
      depAmort,
      impairmentNet,
      profitDisposal,
      lossDisposal,
      financeCosts,
      interestIncome,
      fxUnrealised,
      provisionsMove,
      fairValueAdj,
      otherNonCash,
      wcTradeReceivables,
      wcInventories,
      wcOtherReceivables,
      wcTradePayables,
      wcOtherPayables,
      cashGeneratedOpsTotal,
      interestReceivedCF,
      interestPaidCF,
      dividendsReceivedCF,
      dividendsPaidCF,
      taxPaidCF,
      netOperatingDisplay,
      proceedsPPE,
      purchasePPE,
      proceedsIntangible,
      purchaseIntangible,
      investmentsProceeds,
      investmentsPurchased,
      loansRepaid,
      loansAdvanced,
      netInvestingDisplay,
      proceedsShares,
      repurchaseShares,
      proceedsBorrowings,
      repaymentBorrowings,
      leasesPaid,
      netFinancingDisplay,
      netChangeDisplay,
      closingCashDisplay,
      openingCash: cf.opening_cash_balance,
      nz,
    };
  };

  const getCashFlowDrilldown = (key: string | null) => {
    if (!key) return null;

    const {
      profitBeforeTax,
      depAmort,
      impairmentNet,
      profitDisposal,
      lossDisposal,
      financeCosts,
      interestIncome,
      fxUnrealised,
      provisionsMove,
      fairValueAdj,
      otherNonCash,
      wcTradeReceivables,
      wcInventories,
      wcOtherReceivables,
      wcTradePayables,
      wcOtherPayables,
      cashGeneratedOpsTotal,
      interestReceivedCF,
      interestPaidCF,
      dividendsReceivedCF,
      dividendsPaidCF,
      taxPaidCF,
      netOperatingDisplay,
      proceedsPPE,
      purchasePPE,
      proceedsIntangible,
      purchaseIntangible,
      investmentsProceeds,
      investmentsPurchased,
      loansRepaid,
      loansAdvanced,
      netInvestingDisplay,
      proceedsShares,
      repurchaseShares,
      proceedsBorrowings,
      repaymentBorrowings,
      leasesPaid,
      netFinancingDisplay,
      netChangeDisplay,
      closingCashDisplay,
      openingCash,
    } = renderCashFlowStatement();

    const formatAmount = (val: number) => {
      const v = val || 0;
      const abs = Math.abs(v);
      const s = new Intl.NumberFormat('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(abs);
      return v < 0 ? `(R ${s})` : `R ${s}`;
    };

    const adjustmentsTotal =
      depAmort +
      impairmentNet -
      Math.abs(profitDisposal) +
      Math.abs(lossDisposal) +
      financeCosts -
      Math.abs(interestIncome) +
      fxUnrealised +
      provisionsMove +
      fairValueAdj +
      otherNonCash;

    const workingCapitalTotal =
      wcTradeReceivables +
      wcInventories +
      wcOtherReceivables +
      wcTradePayables +
      wcOtherPayables;

    if (key === 'netOperating') {
      const items = [
        {
          label: 'Profit before tax',
          amount: profitBeforeTax,
        },
        {
          label: 'Non-cash adjustments (depreciation, impairment, fair value, etc.)',
          amount: adjustmentsTotal,
        },
        {
          label: 'Changes in working capital',
          amount: workingCapitalTotal,
        },
      ];

      const cashGeneratedFromOperations =
        profitBeforeTax + adjustmentsTotal + workingCapitalTotal;

      const reconciliation = [
        {
          label: 'Cash generated from operations',
          amount: cashGeneratedFromOperations,
        },
        {
          label: 'Interest received',
          amount: interestReceivedCF,
        },
        {
          label: 'Interest paid',
          amount: -Math.abs(interestPaidCF),
        },
        {
          label: 'Dividends received',
          amount: dividendsReceivedCF,
        },
        {
          label: 'Dividends paid',
          amount: -Math.abs(dividendsPaidCF),
        },
        {
          label: 'Tax paid',
          amount: -Math.abs(taxPaidCF),
        },
      ];

      return {
        title: 'Net cash from operating activities',
        reportedAmount: formatAmount(netOperatingDisplay),
        steps: [
          {
            heading: 'How this amount was calculated',
            rows: items.map(x => ({
              ...x,
              formatted: formatAmount(x.amount),
            })),
          },
          {
            heading: 'Reconciliation from cash generated to net operating cash',
            rows: reconciliation.map(x => ({
              ...x,
              formatted: formatAmount(x.amount),
            })),
          },
        ],
      };
    }

    if (key === 'netInvesting') {
      const inflows = proceedsPPE + proceedsIntangible + investmentsProceeds + loansRepaid;
      const outflows =
        -Math.abs(purchasePPE) -
        Math.abs(purchaseIntangible) -
        Math.abs(investmentsPurchased) -
        Math.abs(loansAdvanced);

      const rows = [
        {
          label: 'Total investing cash inflows',
          amount: inflows,
        },
        {
          label: 'Total investing cash outflows',
          amount: outflows,
        },
      ];

      return {
        title: 'Net cash from investing activities',
        reportedAmount: formatAmount(netInvestingDisplay),
        steps: [
          {
            heading: 'How this amount was calculated',
            rows: rows.map(x => ({
              ...x,
              formatted: formatAmount(x.amount),
            })),
          },
        ],
      };
    }

    if (key === 'netFinancing') {
      const inflows = proceedsShares + proceedsBorrowings;
      const outflows =
        -Math.abs(repurchaseShares) -
        Math.abs(repaymentBorrowings) -
        Math.abs(leasesPaid);

      const rows = [
        {
          label: 'Total financing cash inflows',
          amount: inflows,
        },
        {
          label: 'Total financing cash outflows',
          amount: outflows,
        },
      ];

      return {
        title: 'Net cash from financing activities',
        reportedAmount: formatAmount(netFinancingDisplay),
        steps: [
          {
            heading: 'How this amount was calculated',
            rows: rows.map(x => ({
              ...x,
              formatted: formatAmount(x.amount),
            })),
          },
        ],
      };
    }

    if (key === 'netChange') {
      const rows = [
        {
          label: 'Net cash from operating activities',
          amount: netOperatingDisplay,
        },
        {
          label: 'Net cash from investing activities',
          amount: netInvestingDisplay,
        },
        {
          label: 'Net cash from financing activities',
          amount: netFinancingDisplay,
        },
      ];

      const closingCheck = openingCash + netChangeDisplay;

      return {
        title: 'Net change in cash and cash equivalents',
        reportedAmount: formatAmount(netChangeDisplay),
        steps: [
          {
            heading: 'How this amount was calculated',
            rows: rows.map(x => ({
              ...x,
              formatted: formatAmount(x.amount),
            })),
          },
          {
            heading: 'Reconciliation to closing cash balance',
            rows: [
              {
                label: 'Opening cash and cash equivalents',
                amount: openingCash,
                formatted: formatAmount(openingCash),
              },
              {
                label: 'Net change in cash and cash equivalents',
                amount: netChangeDisplay,
                formatted: formatAmount(netChangeDisplay),
              },
              {
                label: 'Calculated closing cash',
                amount: closingCheck,
                formatted: formatAmount(closingCheck),
              },
              {
                label: 'Reported closing cash and cash equivalents',
                amount: closingCashDisplay,
                formatted: formatAmount(closingCashDisplay),
              },
            ],
          },
        ],
      };
    }

    return null;
  };

  const renderCashFlowIIV = () => {
    const {
      profitBeforeTax,
      depAmort,
      impairmentNet,
      profitDisposal,
      lossDisposal,
      financeCosts,
      interestIncome,
      fxUnrealised,
      provisionsMove,
      fairValueAdj,
      otherNonCash,
      wcTradeReceivables,
      wcInventories,
      wcOtherReceivables,
      wcTradePayables,
      wcOtherPayables,
      cashGeneratedOpsTotal,
      interestReceivedCF,
      interestPaidCF,
      dividendsReceivedCF,
      dividendsPaidCF,
      taxPaidCF,
      netOperatingDisplay,
      proceedsPPE,
      purchasePPE,
      proceedsIntangible,
      purchaseIntangible,
      investmentsProceeds,
      investmentsPurchased,
      loansRepaid,
      loansAdvanced,
      netInvestingDisplay,
      proceedsShares,
      repurchaseShares,
      proceedsBorrowings,
      repaymentBorrowings,
      leasesPaid,
      netFinancingDisplay,
      netChangeDisplay,
      closingCashDisplay,
      openingCash,
      nz,
    } = renderCashFlowStatement();

    const f = (val: number) => {
      const v = val || 0;
      const abs = Math.abs(v);
      const s = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
      return <span className="whitespace-nowrap">{v < 0 ? `(R ${s})` : `R ${s}`}</span>;
    };

    return (
      <div className="max-w-[900px] mx-auto bg-white p-12 min-h-[900px] text-gray-900 font-sans border border-slate-200 mt-8 mb-8">
        <div className="text-center mb-12">
          <h1 className="text-[24px] font-bold text-gray-900 uppercase tracking-wide mb-2">Cash Flow Statement</h1>
          <p className="text-gray-600 mb-1">For the year ended {format(new Date(periodEnd), 'dd MMMM yyyy')}</p>
          <p className="text-[18px] font-semibold text-gray-900 mb-1">{companyName}</p>
          <p className="text-sm text-gray-500">Currency: ZAR</p>
        </div>

        <UnallocatedWarningBanner />

        {cashFlowCompareEnabled && (
          <div className="mb-10">
            {renderComparativeCashFlow()}
          </div>
        )}

        {cashFlowMonthSnapshots.length > 0 && (() => {
          type CFSection = 'operating' | 'investing' | 'financing' | 'summary';
          type CFRowType = 'section' | 'line' | 'total';

          const tiny = 0.00001;

          const rows: Array<{
            id: string;
            section: CFSection;
            type: CFRowType;
            label: string;
            key?: string;
          }> = [
            { id: 'sec-op', section: 'operating', type: 'section', label: 'CASH FLOWS FROM OPERATING ACTIVITIES' },
            { id: 'op-in', section: 'operating', type: 'line', label: 'Operating cash inflows', key: 'operating_inflows' },
            { id: 'op-out', section: 'operating', type: 'line', label: 'Operating cash outflows', key: 'operating_outflows' },
            { id: 'op-net', section: 'operating', type: 'total', label: 'Net cash from operating activities', key: 'net_cash_from_operations' },

            { id: 'sec-inv', section: 'investing', type: 'section', label: 'CASH FLOWS FROM INVESTING ACTIVITIES' },
            { id: 'inv-in', section: 'investing', type: 'line', label: 'Investing cash inflows', key: 'investing_inflows' },
            { id: 'inv-out', section: 'investing', type: 'line', label: 'Investing cash outflows', key: 'investing_outflows' },
            { id: 'inv-net', section: 'investing', type: 'total', label: 'Net cash from investing activities', key: 'net_cash_from_investing' },

            { id: 'sec-fin', section: 'financing', type: 'section', label: 'CASH FLOWS FROM FINANCING ACTIVITIES' },
            { id: 'fin-in', section: 'financing', type: 'line', label: 'Financing cash inflows', key: 'financing_inflows' },
            { id: 'fin-out', section: 'financing', type: 'line', label: 'Financing cash outflows', key: 'financing_outflows' },
            { id: 'fin-net', section: 'financing', type: 'total', label: 'Net cash from financing activities', key: 'net_cash_from_financing' },

            { id: 'sec-sum', section: 'summary', type: 'section', label: 'NET MOVEMENT IN CASH AND CASH EQUIVALENTS' },
            { id: 'sum-net', section: 'summary', type: 'total', label: 'Net change in cash and cash equivalents', key: 'net_change_in_cash' },
            { id: 'sum-open', section: 'summary', type: 'line', label: 'Cash and cash equivalents at beginning of period', key: 'opening_cash_balance' },
            { id: 'sum-close', section: 'summary', type: 'total', label: 'Cash and cash equivalents at end of period', key: 'closing_cash_balance' },
          ];

          const hasNonZeroForKey = (metricKey: string | undefined) => {
            if (!metricKey) return false;
            return cashFlowMonthSnapshots.some(snap => {
              const v = Number((snap.cf as any)[metricKey] || 0);
              return Math.abs(v) > tiny;
            });
          };

          const rowsToRender: typeof rows = [];
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (r.type === 'section') {
              let hasChild = false;
              for (let j = i + 1; j < rows.length; j++) {
                const child = rows[j];
                if (child.type === 'section') break;
                if (child.key && hasNonZeroForKey(child.key)) {
                  hasChild = true;
                  break;
                }
              }
              if (hasChild) rowsToRender.push(r);
              continue;
            }
            if (!r.key) continue;
            if (!hasNonZeroForKey(r.key)) continue;
            rowsToRender.push(r);
          }

          if (rowsToRender.length === 0) return null;

          return (
            <div className="mb-10 space-y-3">
              <h3 className="text-lg font-bold text-gray-900">Monthly cash flow analysis</h3>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-semibold">Item</th>
                      {cashFlowMonthSnapshots.map(snap => (
                        <th key={snap.label} className="p-2 text-right font-semibold border-l border-muted-foreground/20">
                          {snap.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsToRender.map(row => {
                      if (row.type === 'section') {
                        return (
                          <tr key={row.id} className="bg-muted/40 border-b">
                            <td className="p-2 font-semibold" colSpan={1 + cashFlowMonthSnapshots.length}>
                              {row.label}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr
                          key={row.id}
                          className={`border-b hover:bg-muted/50 ${row.type === 'total' ? 'font-semibold bg-muted/20' : ''}`}
                        >
                          <td className="p-2">{row.label}</td>
                          {cashFlowMonthSnapshots.map(snap => (
                            <td
                              key={snap.label}
                              className="p-2 text-right border-l border-muted-foreground/20"
                            >
                              {f((snap.cf as any)[row.key || ''] || 0)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {!cashFlowCompareEnabled && cashFlowMonthSnapshots.length === 0 && (
        <div className="mb-8 w-full">
          <h2 className="text-[18px] font-bold text-[#1f2937] uppercase mb-1">Statement of Cash Flows</h2>
          <div className="w-full border-b-2 border-[#1f2937] mb-4"></div>

          <div className="mb-6 border border-gray-300">
            <table className="w-full text-sm border-collapse">
              <colgroup>
                <col className="w-auto" />
                <col className="w-[60px]" />
                <col className="w-auto min-w-[140px]" />
              </colgroup>
              <tbody>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Operating Activities</td>
                  <td className="py-2 text-center text-xs font-semibold text-gray-500 border-l border-r border-gray-300">
                    Note
                  </td>
                  <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(netOperatingDisplay)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pl-6 pr-2">Profit before tax</td>
                  <td className="py-2 px-2 text-center border-l border-r border-gray-200"></td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(profitBeforeTax)}</td>
                </tr>
        {nz(depAmort) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Depreciation and amortisation</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('9')}
                    >
                      9
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(depAmort)}</td>
                  </tr>
                )}
        {nz(impairmentNet) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Impairment losses / reversals</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('9')}
                    >
                      9
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(impairmentNet)}</td>
                  </tr>
                )}
        {nz(profitDisposal) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Profit on disposal of assets</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('2')}
                    >
                      2
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(-Math.abs(profitDisposal))}</td>
                  </tr>
                )}
        {nz(lossDisposal) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Loss on disposal of assets</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('2')}
                    >
                      2
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(lossDisposal)}</td>
                  </tr>
                )}
        {nz(financeCosts) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Finance costs</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('9')}
                    >
                      9
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(financeCosts)}</td>
                  </tr>
                )}
        {nz(interestIncome) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Interest income</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('7')}
                    >
                      7
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(-Math.abs(interestIncome))}</td>
                  </tr>
                )}
                {nz(fxUnrealised) && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Unrealised foreign exchange differences</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('9')}
                    >
                      9
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(fxUnrealised)}</td>
                  </tr>
                )}
        {nz(provisionsMove) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Movements in provisions</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('9')}
                    >
                      9
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(provisionsMove)}</td>
                  </tr>
                )}
        {nz(fairValueAdj) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Fair value adjustments</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('9')}
                    >
                      9
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(fairValueAdj)}</td>
                  </tr>
                )}
        {nz(otherNonCash) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Other non-cash items</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('9')}
                    >
                      9
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(otherNonCash)}</td>
                  </tr>
                )}

                <tr className="border-b border-gray-200">
                  <td className="py-2 pl-4 pr-2 font-semibold">Changes in working capital:</td>
                  <td className="py-2 px-2 text-center border-l border-r border-gray-200"></td>
                  <td></td>
                </tr>
        {nz(wcTradeReceivables) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">(Increase)/Decrease in trade receivables</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('4')}
                    >
                      4
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(wcTradeReceivables)}</td>
                  </tr>
                )}
        {nz(wcInventories) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">(Increase)/Decrease in inventories</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('3')}
                    >
                      3
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(wcInventories)}</td>
                  </tr>
                )}
        {nz(wcOtherReceivables) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">(Increase)/Decrease in other receivables</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('4')}
                    >
                      4
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(wcOtherReceivables)}</td>
                  </tr>
                )}
        {nz(wcTradePayables) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Increase/(Decrease) in trade payables</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('6')}
                    >
                      6
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(wcTradePayables)}</td>
                  </tr>
                )}
        {nz(wcOtherPayables) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Increase/(Decrease) in other payables</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('6')}
                    >
                      6
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(wcOtherPayables)}</td>
                  </tr>
                )}

                <tr className="bg-gray-50 border-t-2 border-b-2 border-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Net Cash from Operating Activities</td>
                  <td className="py-2 px-2 text-center border-l border-r border-gray-300"></td>
                  <td
                    className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums text-blue-600 cursor-pointer hover:underline"
                    onClick={() => setCashFlowDrillKey('netOperating')}
                  >
                    {f(netOperatingDisplay)}
                  </td>
                </tr>

                <tr className="bg-gray-100 border-b border-gray-300 border-t-2 border-t-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Investing Activities</td>
                  <td className="py-2 px-2 text-center border-l border-r border-gray-300"></td>
                  <td
                    className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums text-blue-600 cursor-pointer hover:underline"
                    onClick={() => setCashFlowDrillKey('netInvesting')}
                  >
                    {f(netInvestingDisplay)}
                  </td>
                </tr>
        {nz(proceedsPPE) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Proceeds on disposal of property, plant and equipment</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('2')}
                    >
                      2
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(proceedsPPE)}</td>
                  </tr>
                )}
        {nz(purchasePPE) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Additions to property, plant and equipment</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('2')}
                    >
                      2
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(-Math.abs(purchasePPE))}</td>
                  </tr>
                )}
        {nz(proceedsIntangible) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Proceeds on disposal of intangible assets</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('2')}
                    >
                      2
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(proceedsIntangible)}</td>
                  </tr>
                )}
        {nz(purchaseIntangible) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Additions to intangible assets</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('2')}
                    >
                      2
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(-Math.abs(purchaseIntangible))}</td>
                  </tr>
                )}
        {nz(investmentsProceeds) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Proceeds on disposal of investments</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('2')}
                    >
                      2
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(investmentsProceeds)}</td>
                  </tr>
                )}
        {nz(investmentsPurchased) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Purchase of investments</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('2')}
                    >
                      2
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(-Math.abs(investmentsPurchased))}</td>
                  </tr>
                )}
        {nz(loansRepaid) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Loans repaid to the group</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('6')}
                    >
                      6
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(loansRepaid)}</td>
                  </tr>
                )}
        {nz(loansAdvanced) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Loans advanced to the group</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('6')}
                    >
                      6
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(-Math.abs(loansAdvanced))}</td>
                  </tr>
                )}

                <tr className="bg-gray-100 border-b border-gray-300 border-t-2 border-t-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Financing Activities</td>
                  <td className="py-2 px-2 text-center border-l border-r border-gray-300"></td>
                  <td
                    className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums text-blue-600 cursor-pointer hover:underline"
                    onClick={() => setCashFlowDrillKey('netFinancing')}
                  >
                    {f(netFinancingDisplay)}
                  </td>
                </tr>
        {nz(proceedsShares) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Proceeds from issue of shares</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('11')}
                    >
                      11
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(proceedsShares)}</td>
                  </tr>
                )}
        {nz(repurchaseShares) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Repurchase of shares</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('11')}
                    >
                      11
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(-Math.abs(repurchaseShares))}</td>
                  </tr>
                )}
        {nz(proceedsBorrowings) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Proceeds from borrowings</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('6')}
                    >
                      6
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(proceedsBorrowings)}</td>
                  </tr>
                )}
        {nz(repaymentBorrowings) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Repayment of borrowings</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('6')}
                    >
                      6
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(-Math.abs(repaymentBorrowings))}</td>
                  </tr>
                )}
        {nz(leasesPaid) && activeNoteId && (
                  <tr className="border-b border-gray-200">
                    <td className="py-2 pl-6 pr-2">Lease payments</td>
                    <td
                      className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleNoteClick('6')}
                    >
                      6
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(-Math.abs(leasesPaid))}</td>
                  </tr>
                )}

                <tr className="bg-gray-50 border-t border-b border-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Net change in cash and cash equivalents</td>
                  <td
                    className="py-2 px-2 text-center border-l border-r border-gray-300 text-blue-600 cursor-pointer hover:underline"
                    onClick={() => handleNoteClick('5')}
                  >
                    5
                  </td>
                  <td
                    className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums text-blue-600 cursor-pointer hover:underline"
                    onClick={() => setCashFlowDrillKey('netChange')}
                  >
                    {f(netChangeDisplay)}
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="py-2 pl-4 pr-2">Cash and cash equivalents at beginning of the year</td>
                  <td
                    className="py-2 px-2 text-center border-l border-r border-gray-200 text-blue-600 cursor-pointer hover:underline"
                    onClick={() => handleNoteClick('5')}
                  >
                    5
                  </td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums">{f(openingCash)}</td>
                </tr>
                <tr className="bg-gray-50 border-t-2 border-b-2 border-gray-300">
                  <td className="py-2 pl-4 text-left font-bold text-gray-900">Cash and cash equivalents at end of the year</td>
                  <td
                    className="py-2 px-2 text-center border-l border-r border-gray-300 text-blue-600 cursor-pointer hover:underline"
                    onClick={() => handleNoteClick('5')}
                  >
                    5
                  </td>
                  <td className="py-2 pr-4 text-right font-bold text-gray-900 tabular-nums">{f(closingCashDisplay)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>
    );
  };

  return (
      <div className="space-y-6">
        {(!hideControls || title !== "GAAP Financial Statements") && (
          <div className="flex justify-end items-center">
            {activeTab && (
            <div className="flex items-center gap-3 bg-background p-1.5 rounded-xl border shadow-sm">
             {(refreshing || syncStatus === 'Updating...') && (
               <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/30 text-xs font-medium text-muted-foreground animate-in fade-in">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span className="text-primary">Updating...</span>
               </div>
             )}
             <DropdownMenu>
               <DropdownMenuTrigger asChild>
                 <Button
                   variant="ghost"
                   size="icon"
                   className="h-8 w-8 text-muted-foreground hover:text-foreground"
                 >
                   <Download className="h-4 w-4" />
                 </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-40">
                 <DropdownMenuItem onClick={() => handleOpenExportDialog('excel')}>
                   <FileSpreadsheet className="mr-2 h-4 w-4" />
                   <span>Download Excel</span>
                 </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => handleOpenExportDialog('pdf')}>
                   <FileText className="mr-2 h-4 w-4" />
                   <span>Download PDF</span>
                 </DropdownMenuItem>
               </DropdownMenuContent>
             </DropdownMenu>
             <Dialog open={showFilters} onOpenChange={setShowFilters}>
               <DialogTrigger asChild>
                 <Button 
                   variant="ghost" 
                   size="icon" 
                   className={`h-8 w-8 rounded-lg transition-all ${showFilters ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                 >
                   <Filter className="h-4 w-4" />
                 </Button>
               </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Report Filters</DialogTitle>
                  <DialogDescription>Adjust report view settings</DialogDescription>
                </DialogHeader>
                {variant === "balance-sheet" || variant === "income" || variant === "retained-earnings" ? (
                  <BalanceSheetFilterBar
                    onApply={
                      variant === "balance-sheet"
                        ? handleBalanceSheetFilterApply
                        : variant === "income"
                          ? handleIncomeFilterApply
                          : handleRetainedEarningsFilterApply
                    }
                    availableYears={[]}
                    availablePeriods={balanceSheetPeriodOptions}
                    maxLevels={3}
                  />
                ) : variant === "cash-flow" ? (
                  <CashFlowFilterBar
                    onApply={handleCashFlowFilterApply}
                    availablePeriods={balanceSheetPeriodOptions}
                    maxLevels={3}
                  />
                ) : variant === "ifrs-notes" ? (
                  <NotesFilterBar
                    onApply={handleNotesFilterApply}
                    maxLevels={3}
                  />
                ) : (
                  <>
                    <div className="grid gap-6 py-4">
                      <div className="space-y-3">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Report Mode</Label>
                        <div className="flex p-1 bg-background border rounded-lg shadow-sm">
                          <Button
                            variant={periodMode === "monthly" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setPeriodMode("monthly")}
                            className="flex-1 rounded-md text-sm font-medium transition-all"
                          >
                            Monthly
                          </Button>
                          <Button
                            variant={periodMode === "annual" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setPeriodMode("annual")}
                            className="flex-1 rounded-md text-sm font-medium transition-all"
                          >
                            Annual
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {periodMode === "monthly" ? "Select Period" : "Fiscal Year"}
                        </Label>
                        {periodMode === "monthly" ? (
                          <Input
                            type="month"
                            value={selectedMonth}
                            onChange={e => {
                              setDataLoaded(false);
                              setLoading(true);
                              setSelectedMonth(e.target.value);
                            }}
                            className="bg-background border-muted-foreground/20 focus:border-primary h-10"
                          />
                        ) : (
                          <div className="relative">
                            {lockFiscalYear ? (
                              <div className="h-10 pl-10 flex items-center bg-muted/40 rounded-md border border-muted-foreground/20">
                                <span className="text-sm">
                                  {(() => {
                                    const y = defaultFiscalYear || selectedFiscalYear;
                                    const { startDate, endDate } = getFiscalYearDates(y);
                                    return `${format(startDate, "d MMMM yyyy")} - ${format(endDate, "d MMMM yyyy")}`;
                                  })()}
                                </span>
                              </div>
                            ) : (
                              (() => {
                                const currentY = new Date().getFullYear();
                                const years = Array.from({ length: 12 }, (_, i) => currentY - 9 + i);
                                if (!years.includes(selectedYear)) {
                                  years.push(selectedYear);
                                  years.sort((a, b) => a - b);
                                }
                                return (
                                  <Select
                                    value={String(selectedYear)}
                                    onValueChange={(val: string) => {
                                      const y = parseInt(val, 10);
                                      setDataLoaded(false);
                                      setLoading(true);
                                      setSelectedYear(y);
                                      setSelectedFiscalYear(y);
                                    }}
                                  >
                                    <SelectTrigger className="h-10 pl-10 bg-background border-muted-foreground/20 focus:border-primary">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {years.map(y => {
                                        const { startDate, endDate } = getFiscalYearDates(y);
                                        return (
                                          <SelectItem key={y} value={String(y)}>
                                            {format(startDate, "d MMMM yyyy")} - {format(endDate, "d MMMM yyyy")}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                );
                              })()
                            )}
                            <Calendar className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Effective Date Range</Label>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background p-2.5 rounded-lg border border-muted-foreground/20">
                          <Calendar className="h-4 w-4 text-primary" />
                          <span>{periodStart}</span>
                          <ArrowLeftRight className="h-3 w-3 mx-1" />
                          <span>{periodEnd}</span>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setShowFilters(false)}>Apply Filters</Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
             </Dialog>
             <Dialog open={showExportDialog} onOpenChange={open => {
               setShowExportDialog(open);
               if (!open) {
                 setExportFormat(null);
               }
             }}>
               <DialogContent className="sm:max-w-[480px]">
                 <DialogHeader>
                   <DialogTitle>Download report</DialogTitle>
                   <DialogDescription>
                     Choose how you want to download this report.
                   </DialogDescription>
                 </DialogHeader>
                 <div className="space-y-4 py-2">
                   <div className="space-y-2">
                     <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                       Download type
                     </Label>
                     <RadioGroup
                       value={exportMode}
                       onValueChange={v => setExportMode(v as 'month' | 'compare' | 'range')}
                     >
                       <div className="flex items-center space-x-2">
                         <RadioGroupItem value="month" id="export-month" />
                         <Label htmlFor="export-month" className="text-xs">
                           Specific month
                         </Label>
                       </div>
                       <div className="flex items-center space-x-2">
                         <RadioGroupItem value="compare" id="export-compare" />
                         <Label htmlFor="export-compare" className="text-xs">
                           Comparing data
                         </Label>
                       </div>
                       <div className="flex items-center space-x-2">
                         <RadioGroupItem value="range" id="export-range" />
                         <Label htmlFor="export-range" className="text-xs">
                           Date range
                         </Label>
                       </div>
                     </RadioGroup>
                   </div>
                  {exportMode === 'month' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Month
                      </Label>
                      <Input
                        type="month"
                        value={exportMonth}
                        onChange={e => setExportMonth(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  )}
                  {exportMode === 'compare' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Compare by
                        </Label>
                        <RadioGroup
                          value={exportCompareMode}
                          onValueChange={v => setExportCompareMode(v as 'year' | 'month')}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="year" id="compare-year" />
                            <Label htmlFor="compare-year" className="text-xs">
                              Year (current vs previous)
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="month" id="compare-month" />
                            <Label htmlFor="compare-month" className="text-xs">
                              Months (select months)
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                      {exportCompareMode === 'month' && (
                        <div className="space-y-2">
                          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Months to include
                          </Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {balanceSheetPeriodOptions.map((m, idx) => {
                              const checked = exportCompareMonths.includes(idx);
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setExportCompareMonths(prev =>
                                      checked ? prev.filter(v => v !== idx) : [...prev, idx].sort((a, b) => a - b)
                                    );
                                  }}
                                  className={`flex items-center gap-2 px-2 py-1 rounded border text-xs ${
                                    checked
                                      ? 'border-primary bg-primary/5 text-primary'
                                      : 'border-muted-foreground/20 text-muted-foreground hover:border-primary/60'
                                  }`}
                                >
                                  <Checkbox checked={checked} className="h-3 w-3 pointer-events-none" />
                                  <span>{m}</span>
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Comparing selected months for current year against previous year.
                          </p>
                        </div>
                      )}
                      {exportCompareMode === 'year' && (
                        <p className="text-[11px] text-muted-foreground">
                          Comparing full current year against previous year (no month selection needed).
                        </p>
                      )}
                    </div>
                  )}
                   {exportMode === 'range' && (
                     <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                       <div className="space-y-2">
                         <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                           From
                         </Label>
                         <Input
                           type="date"
                           value={exportRangeStart}
                           onChange={e => setExportRangeStart(e.target.value)}
                           className="h-9"
                         />
                       </div>
                       <div className="space-y-2">
                         <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                           To
                         </Label>
                         <Input
                           type="date"
                           value={exportRangeEnd}
                           onChange={e => setExportRangeEnd(e.target.value)}
                           className="h-9"
                         />
                       </div>
                     </div>
                   )}
                 </div>
                 <DialogFooter>
                   <Button variant="outline" onClick={() => setShowExportDialog(false)}>
                     Cancel
                   </Button>
                   <Button onClick={handleConfirmExport} disabled={!exportFormat}>
                     {exportFormat === 'excel' ? 'Download Excel' : exportFormat === 'pdf' ? 'Download PDF' : 'Download'}
                   </Button>
                 </DialogFooter>
               </DialogContent>
             </Dialog>
          </div>
          )}
        </div>
      )}







      <div className="space-y-6">
             <div className="shadow-sm border rounded-sm overflow-hidden relative min-h-[600px]">
              {(!isDataReady || loading) && (
                <SageLoadingOverlay 
                  message={
                    !isDataReady
                      ? (variant === 'income'
                          ? "Initializing Income Statement..."
                          : variant === 'cash-flow'
                            ? "Initializing Cash Flow Statement..."
                            : variant === 'ifrs-notes'
                              ? "Initializing IFRS Notes..."
                              : variant === 'retained-earnings'
                                ? "Initializing Changes in Equity..."
                                : "Initializing Balance Sheet...")
                      : (variant === 'income'
                          ? "Updating Income Statement..."
                          : variant === 'cash-flow'
                            ? "Updating Cash Flow Statement..."
                            : variant === 'ifrs-notes'
                              ? "Updating IFRS Notes..."
                              : variant === 'retained-earnings'
                                ? "Updating Changes in Equity..."
                                : "Updating Balance Sheet...")
                  } 
                  progress={loadingProgress} 
                />
              )}
              {variant === 'income'
                ? renderIncomeStatementIIV()
                : variant === 'cash-flow'
                  ? renderCashFlowIIV()
                  : variant === 'ifrs-notes'
                    ? renderIFRSNotes()
                    : variant === 'retained-earnings'
                      ? renderRetainedEarnings()
                      : renderStatementOfFinancialPosition()}
           </div>
        </div>






                          {/* Removed explicit Total Fixed Assets (NBV) row to avoid confusion.
                              Carrying value is shown via PPE (NBV) line items above. */}
































      {/* Note dialog (from balance sheet note clicks) */}
      {renderNoteDialog()}

      {/* Drill-down modal */}
      <Dialog open={!!drilldownAccount} onOpenChange={(open) => !open && setDrilldownAccount(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ledger Entries: {drilldownAccount}</DialogTitle>
            <DialogDescription>
              Detailed transactions for the selected period
            </DialogDescription>
          </DialogHeader>
          {ledgerEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions found for this period.
            </div>
          ) : (
            <div className="mt-2 border border-slate-200 rounded-md overflow-hidden">
              <Table>
                <TableHeader className="bg-[#535c69] hover:bg-[#535c69]">
                  <TableRow className="hover:bg-[#535c69]">
                    <TableHead className="text-white font-medium w-[120px]">Date</TableHead>
                    <TableHead className="text-white font-medium">Description</TableHead>
                    <TableHead className="text-white font-medium w-[120px]">Reference</TableHead>
                    <TableHead className="text-white font-medium text-right w-[120px]">Debit</TableHead>
                    <TableHead className="text-white font-medium text-right w-[120px]">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerEntries.map((entry: any, index: number) => (
                    <TableRow
                      key={entry.id}
                      className="hover:bg-blue-50/50 transition-colors odd:bg-white even:bg-slate-50/50"
                    >
                      <TableCell className="text-sm text-slate-700">
                        {entry.entry_date}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.description}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {entry.reference_id || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-700">
                        {entry.debit > 0
                          ? `R ${entry.debit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                          : ''}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-green-700">
                        {entry.credit > 0
                          ? `R ${entry.credit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                          : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cashFlowDrillKey} onOpenChange={(open) => !open && setCashFlowDrillKey(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {(() => {
            const data = getCashFlowDrilldown(cashFlowDrillKey);
            if (!data) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{data.title}</DialogTitle>
                  <DialogDescription>
                    Detailed explanation of how this cash flow amount is derived.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-2 space-y-6">
                  <div className="text-sm">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Reported amount
                    </div>
                    <div className="mt-1 font-mono text-base">{data.reportedAmount}</div>
                  </div>
                  {data.steps.map(section => (
                    <div key={section.heading} className="space-y-2">
                      <h4 className="text-sm font-semibold text-gray-900">{section.heading}</h4>
                      <div className="rounded-md border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <tbody>
                            {section.rows.map((row: any, idx: number) => (
                              <tr
                                key={`${row.label}-${idx}`}
                                className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}
                              >
                                <td className="px-3 py-1.5">{row.label}</td>
                                <td className="px-3 py-1.5 text-right font-mono">
                                  {row.formatted}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Accounts and individual transactions behind these lines can be inspected using
                    the note links and ledger drill-down on the related balance sheet and income
                    statement accounts.
                  </p>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Trace modal */}
      <Dialog open={!!traceLabel} onOpenChange={(open) => !open && setTraceLabel(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Trace: {traceLabel}</DialogTitle>
              {traceResolved && (
                <Button size="sm" variant="outline" onClick={() => { handleDrilldown(String(traceResolved.account_id), `${traceResolved.account_code} - ${traceResolved.account_name}`); setTraceLabel(null); }}>
                  Open Ledger Entries
                </Button>
              )}
            </div>
            <DialogDescription>
              Monthly impact across Balance Sheet and Income Statement
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Balance Sheet</CardTitle></CardHeader>
              <CardContent className="py-2">
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left px-3 py-2 border-b sticky left-0 bg-background z-10 border-r">Section</th>
                        {monthlyAFSData.map((m: any, i: number) => (
                          <th key={`trace-bs-h-${m.label}`} className={`text-right py-2 border-b ${i < monthlyAFSData.length - 1 ? 'border-r' : ''}`}>{m.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'Non-current Assets', get: (m: any) => {
                          const found = (m.bsDetail?.nonCurrentAssetsItems || []).find((x: any) => x.label === traceLabel);
                          return Number(found?.amount || 0);
                        }},
                        { key: 'Current Assets', get: (m: any) => {
                          const found = (m.bsDetail?.currentAssetsItems || []).find((x: any) => x.label === traceLabel);
                          return Number(found?.amount || 0);
                        }},
                        { key: 'Non-current Liabilities', get: (m: any) => {
                          const found = (m.bsDetail?.nonCurrentLiabilitiesItems || []).find((x: any) => x.label === traceLabel);
                          return Number(found?.amount || 0);
                        }},
                        { key: 'Current Liabilities', get: (m: any) => {
                          const found = (m.bsDetail?.currentLiabilitiesItems || []).find((x: any) => x.label === traceLabel);
                          return Number(found?.amount || 0);
                        }},
                        { key: 'Equity', get: (m: any) => {
                          const found = (m.bsDetail?.equityItems || []).find((x: any) => x.label === traceLabel || String(x.label || '').toLowerCase().includes('retained earning'));
                          return Number(found?.amount || 0);
                        }},
                      ].map((row) => (
                        <tr key={`trace-bs-${row.key}`} className="border-b odd:bg-muted/40">
                          <td className="px-3 py-1 font-medium sticky left-0 bg-background z-10 border-r">{row.key}</td>
                          {monthlyAFSData.map((m: any, i: number) => {
                            const f = formatAccounting(row.get(m));
                            return (
                              <td key={`trace-bs-${row.key}-${m.label}`} className={`py-1 text-right font-mono ${f.negative ? 'text-red-600 dark:text-red-400' : ''} ${i < monthlyAFSData.length - 1 ? 'border-r' : ''}`}>{f.display}</td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Income Statement</CardTitle></CardHeader>
              <CardContent className="py-2">
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left px-3 py-2 border-b sticky left-0 bg-background z-10 border-r">Section</th>
                        {monthlyAFSData.map((m: any, i: number) => (
                          <th key={`trace-pl-h-${m.label}`} className={`text-right py-2 border-b ${i < monthlyAFSData.length - 1 ? 'border-r' : ''}`}>{m.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'Revenue', get: (m: any) => {
                          const found = (m.plDetail?.revenueItems || []).find((x: any) => x.label === traceLabel);
                          return Number(found?.amount || 0);
                        }},
                        { key: 'Cost of sales', get: (m: any) => {
                          const found = (m.plDetail?.cogsItems || []).find((x: any) => x.label === traceLabel);
                          return Number(found?.amount || 0);
                        }},
                        { key: 'Operating expenses', get: (m: any) => {
                          const found = (m.plDetail?.opexItems || []).find((x: any) => x.label === traceLabel);
                          return Number(found?.amount || 0);
                        }},
                      ].map((row) => (
                        <tr key={`trace-pl-${row.key}`} className="border-b odd:bg-muted/40">
                          <td className="px-3 py-1 font-medium sticky left-0 bg-background z-10 border-r">{row.key}</td>
                          {monthlyAFSData.map((m: any, i: number) => {
                            const f = formatAccounting(row.get(m));
                            return (
                              <td key={`trace-pl-${row.key}-${m.label}`} className={`py-1 text-right font-mono ${f.negative ? 'text-red-600 dark:text-red-400' : ''} ${i < monthlyAFSData.length - 1 ? 'border-r' : ''}`}>{f.display}</td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-2"><CardTitle className="text-sm">Cash Flow</CardTitle></CardHeader>
              <CardContent className="py-2">
                <div className="overflow-x-auto">
                  <table className="min-w-[900px] w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left px-3 py-2 border-b sticky left-0 bg-background z-10 border-r">Section</th>
                        {monthlyAFSData.map((m: any, i: number) => (
                          <th key={`trace-cf-h-${m.label}`} className={`text-right py-2 border-b ${i < monthlyAFSData.length - 1 ? 'border-r' : ''}`}>{m.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'Net cash from operating activities', get: (m: any) => m.cf.netOperating },
                        { key: 'Net cash from investing activities', get: (m: any) => m.cf.netInvesting },
                        { key: 'Net cash from financing activities', get: (m: any) => m.cf.netFinancing },
                        { key: 'Net change in cash', get: (m: any) => m.cf.netChange },
                      ].map((row) => (
                        <tr key={`trace-cf-${row.key}`} className="border-b odd:bg-muted/40">
                          <td className="px-3 py-1 font-medium sticky left-0 bg-background z-10 border-r">{row.key}</td>
                          {monthlyAFSData.map((m: any, i: number) => {
                            const f = formatAccounting(row.get(m));
                            return (
                              <td key={`trace-cf-${row.key}-${m.label}`} className={`py-1 text-right font-mono ${f.negative ? 'text-red-600 dark:text-red-400' : ''} ${i < monthlyAFSData.length - 1 ? 'border-r' : ''}`}>{f.display}</td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="border-b odd:bg-muted/40">
                        <td className="px-3 py-1 font-medium sticky left-0 bg-background z-10 border-r">Account net movement (Dr - Cr)</td>
                        {monthlyAFSData.map((m: any, i: number) => {
                          const val = traceCFMonthly ? Number(traceCFMonthly[m.label] || 0) : 0;
                          const f = formatAccounting(val);
                          return (
                            <td key={`trace-cf-net-${m.label}`} className={`py-1 text-right font-mono ${f.negative ? 'text-red-600 dark:text-red-400' : ''} ${i < monthlyAFSData.length - 1 ? 'border-r' : ''}`}>
                              {traceCFLoading && !traceCFMonthly ? '…' : f.display}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {showAdviceModal && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Expert Guidance</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowAdviceModal(false)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-sm whitespace-pre-wrap">{systemOverview}</div>
              <div className="text-sm whitespace-pre-wrap">{accountingPrimer}</div>
            </div>
          </CardContent>
        </Card>
      )}
      
    </div>
  );
};

// Period-scoped trial balance computation using transaction_entries joined to transactions.transaction_date
// Function to calculate total inventory value from products
const calculateTotalInventoryValue = async (companyId: string) => {
  try {
    const { data: products } = await supabase
      .from('items')
      .select('cost_price, quantity_on_hand')
      .eq('company_id', companyId)
      .eq('item_type', 'product')
      .gt('quantity_on_hand', 0);
    
    const totalValue = (products || []).reduce((sum, product) => {
      const cost = Number(product.cost_price || 0);
      const qty = Number(product.quantity_on_hand || 0);
      return sum + (cost * qty);
    }, 0);
    
    return totalValue;
  } catch (error) {
    console.error('Error calculating inventory value:', error);
    return 0;
  }
};

// Calculate inventory value as-of a cutoff date using product catalog and date-aware movements
const calculateInventoryValueAsOf = async (companyId: string, end: string) => {
  try {
    const endDateObj = new Date(end);
    endDateObj.setHours(23, 59, 59, 999);
    const endISO = endDateObj.toISOString();

    const { data: products } = await supabase
      .from('items')
      .select('id, name, cost_price, quantity_on_hand')
      .eq('company_id', companyId)
      .eq('item_type', 'product');

    const catalog = (products || []).map((p: any) => ({
      id: String(p.id),
      name: String(p.name || '').toLowerCase().trim(),
      cost: Number(p.cost_price || 0),
      currentQty: Number(p.quantity_on_hand || 0)
    }));
    const nameList = catalog.map(c => c.name);

    const { data: invItemsAfter } = await supabase
      .from('invoice_items')
      .select(`
        description,
        quantity,
        item_type,
        invoices!inner (
          invoice_date,
          company_id,
          status
        )
      `)
      .eq('invoices.company_id', companyId)
      .gt('invoices.invoice_date', endISO);

    const salesAfter = (invItemsAfter || []).filter((it: any) => String(it.item_type || '').toLowerCase() === 'product');
    const saleQtyByName = new Map<string, number>();
    salesAfter.forEach((it: any) => {
      const desc = String(it.description || '').toLowerCase().trim();
      const qty = Number(it.quantity || 0);
      const key = nameList.find(n => n === desc) || nameList.find(n => desc.includes(n) || n.includes(desc)) || desc;
      saleQtyByName.set(key, (saleQtyByName.get(key) || 0) + qty);
    });

    const { data: poItemsAfter } = await supabase
      .from('purchase_order_items')
      .select(`
        description,
        quantity,
        unit_price,
        purchase_orders!inner (
          po_date,
          status,
          company_id
        )
      `)
      .eq('purchase_orders.company_id', companyId)
      .in('purchase_orders.status', ['sent','paid'])
      .gt('purchase_orders.po_date', endISO);

    const purchaseQtyByName = new Map<string, number>();
    (poItemsAfter || []).forEach((it: any) => {
      const desc = String(it.description || '').toLowerCase().trim();
      const qty = Number(it.quantity || 0);
      const key = nameList.find(n => n === desc) || nameList.find(n => desc.includes(n) || n.includes(desc)) || desc;
      purchaseQtyByName.set(key, (purchaseQtyByName.get(key) || 0) + qty);
    });

    let totalValue = 0;
    catalog.forEach((prod) => {
      const purchasesAfter = Number(purchaseQtyByName.get(prod.name) || 0);
      const salesAfterQty = Number(saleQtyByName.get(prod.name) || 0);
      const qtyAsOf = Math.max(0, prod.currentQty - purchasesAfter + salesAfterQty);
      totalValue += qtyAsOf * prod.cost;
    });

    return totalValue;
  } catch (error) {
    console.error('Error calculating inventory value as-of date:', error);
    return 0;
  }
};

const fetchTrialBalanceForPeriod = async (companyId: string, start: string, end: string) => {
  const startDateObj = new Date(start);
  const startISO = startDateObj.toISOString();
  const endDateObj = new Date(end);
  endDateObj.setHours(23, 59, 59, 999);
  const endISO = endDateObj.toISOString();

  // Get all active accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('account_code');

  if (accountsError) throw accountsError;

  // Get transaction entries
  const { data: txEntries, error: txError } = await supabase
    .from('transaction_entries')
    .select(`
      transaction_id,
      account_id,
      debit,
      credit,
      description,
      transactions!inner (
        transaction_date,
        status,
        company_id
      )
    `)
    .eq('transactions.company_id', companyId)
    .in('transactions.status', ['posted', 'approved'])
    .gte('transactions.transaction_date', startISO)
    .lte('transactions.transaction_date', endISO);

  if (txError) throw txError;

  // Get ledger entries
  const { data: ledgerEntries, error: ledgerError } = await supabase
    .from('ledger_entries')
    .select('transaction_id, account_id, debit, credit, entry_date')
    .eq('company_id', companyId)
    .gte('entry_date', startISO)
    .lte('entry_date', endISO);

  if (ledgerError) throw ledgerError;

  const trialBalance: Array<{ account_id: string; account_code: string; account_name: string; account_type: string; balance: number; }> = [];

  let apBalanceAsOf: number | undefined = undefined;
  let arBalanceAsOf: number | undefined = undefined;
  let loanShortAsOf: number | undefined = undefined;
  let loanLongAsOf: number | undefined = undefined;
  try {
    const asOfTB = await fetchTrialBalanceAsOf(companyId, end);
    const apRow = (asOfTB || []).find((r: any) => String(r.account_code || '') === '2000');
    const arRow = (asOfTB || []).find((r: any) => String(r.account_code || '') === '1200');
    const loanShortRow = (asOfTB || []).find((r: any) => String(r.account_code || '') === '2300');
    const loanLongRow = (asOfTB || []).find((r: any) => String(r.account_code || '') === '2400');
    apBalanceAsOf = apRow?.balance;
    arBalanceAsOf = arRow?.balance;
    loanShortAsOf = loanShortRow?.balance;
    loanLongAsOf = loanLongRow?.balance;
  } catch {}

  

  // Process each account
  const ledgerTxIds = new Set<string>((ledgerEntries || []).map((e: any) => String(e.transaction_id || '')));
  const filteredTxEntries = (txEntries || []).filter((e: any) => !ledgerTxIds.has(String(e.transaction_id || '')));

  (accounts || []).forEach((acc: any) => {
    let sumDebit = 0;
    let sumCredit = 0;

    // Sum transaction entries
    (filteredTxEntries || []).forEach((entry: any) => {
      if (entry.account_id === acc.id) {
        sumDebit += Number(entry.debit || 0);
        sumCredit += Number(entry.credit || 0);
      }
    });

    // Sum ledger entries
    (ledgerEntries || []).forEach((entry: any) => {
      if (entry.account_id === acc.id) {
        sumDebit += Number(entry.debit || 0);
        sumCredit += Number(entry.credit || 0);
      }
    });

    const type = (acc.account_type || '').toLowerCase();
    const naturalDebit = type === 'asset' || type === 'expense';
    let balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);

    if (String(acc.account_code || '') === '2000' && typeof apBalanceAsOf === 'number') {
      balance = apBalanceAsOf;
    }
    if (String(acc.account_code || '') === '1200' && typeof arBalanceAsOf === 'number') {
      balance = arBalanceAsOf;
    }
    if (String(acc.account_code || '') === '2300' && typeof loanShortAsOf === 'number') {
      balance = loanShortAsOf;
    }
    if (String(acc.account_code || '') === '2400' && typeof loanLongAsOf === 'number') {
      balance = loanLongAsOf;
    }

    const isInventoryName = (acc.account_name || '').toLowerCase().includes('inventory');
    const isPrimaryInventory = acc.account_code === '1300';
    const shouldShow = Math.abs(balance) > 0.01 && (!isInventoryName || isPrimaryInventory);
    if (shouldShow) {
      trialBalance.push({
        account_id: acc.id,
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        balance
      });
    }
  });

  return trialBalance;
};

// Cumulative trial balance as of a given end date (used for Balance Sheet)
const fetchTrialBalanceAsOf = async (companyId: string, end: string) => {
  const endDateObj = new Date(end);
  endDateObj.setHours(23, 59, 59, 999);
  const endISO = endDateObj.toISOString();

  const { data: accounts, error: accountsError } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, account_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('account_code');
  if (accountsError) throw accountsError;

  const { data: txEntries, error: txError } = await supabase
    .from('transaction_entries')
    .select(`
      transaction_id,
      account_id,
      debit,
      credit,
      transactions!inner (
        transaction_date,
        status,
        company_id
      )
    `)
    .eq('transactions.company_id', companyId)
    .in('transactions.status', ['posted', 'approved'])
    .lte('transactions.transaction_date', endISO);
  if (txError) throw txError;

  const { data: ledgerEntries, error: ledgerError } = await supabase
    .from('ledger_entries')
    .select('transaction_id, account_id, debit, credit, entry_date, description')
    .eq('company_id', companyId)
    .lte('entry_date', endISO);
  if (ledgerError) throw ledgerError;

  const trialBalance: Array<{ account_id: string; account_code: string; account_name: string; account_type: string; balance: number; }> = [];

  const ledgerTxIds = new Set<string>((ledgerEntries || []).map((e: any) => String(e.transaction_id || '')));
  const filteredTxEntries = (txEntries || []).filter((e: any) => !ledgerTxIds.has(String(e.transaction_id || '')));

  const inventoryValueAsOf = await calculateInventoryValueAsOf(companyId, end);

  (accounts || []).forEach((acc: any) => {
    let sumDebit = 0;
    let sumCredit = 0;

    (filteredTxEntries || []).forEach((entry: any) => {
      if (entry.account_id === acc.id) {
        sumDebit += Number(entry.debit || 0);
        sumCredit += Number(entry.credit || 0);
      }
    });

    (ledgerEntries || []).forEach((entry: any) => {
      if (entry.account_id === acc.id) {
        sumDebit += Number(entry.debit || 0);
        sumCredit += Number(entry.credit || 0);
      }
    });

    const type = (acc.account_type || '').toLowerCase();
    const naturalDebit = type === 'asset' || type === 'expense';
    const balance = naturalDebit ? (sumDebit - sumCredit) : (sumCredit - sumDebit);

    const shouldShow = Math.abs(balance) > 0.01;
    if (shouldShow) {
      trialBalance.push({
        account_id: acc.id,
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        balance
      });
    }
  });

  return trialBalance;
};

const calculateCOGSFromInvoices = async (companyId: string, start: string, end: string) => {
  try {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_date, sent_at, status')
      .eq('company_id', companyId)
      .in('status', ['sent','paid','approved','posted']);
    const startDt = new Date(start);
    const endDt = new Date(end);
    endDt.setHours(23,59,59,999);
    const inPeriod = (inv: any) => {
      const dStr = inv.sent_at || inv.invoice_date;
      if (!dStr) return false;
      const d = new Date(dStr);
      return d >= startDt && d <= endDt;
    };
    const ids = (invoices || []).filter(inPeriod).map((i: any) => i.id);
    if (!ids.length) return 0;
    const { data: items } = await supabase
      .from('invoice_items')
      .select('invoice_id, description, quantity, unit_price, item_type')
      .in('invoice_id', ids as any);
    const onlyProducts = (items || []).filter((it: any) => String(it.item_type || '').toLowerCase() === 'product');
    let total = 0;
    const { data: prodByName } = await supabase
      .from('items')
      .select('name, cost_price')
      .eq('company_id', companyId)
      .eq('item_type', 'product');
    const catalog = (prodByName || []).map((p: any) => ({ name: String(p.name || '').toLowerCase().trim(), cost: Number(p.cost_price || 0) }));
    onlyProducts.forEach((it: any) => {
      const desc = String(it.description || '').toLowerCase().trim();
      let cp = 0;
      const exact = catalog.find(c => c.name === desc);
      if (exact) cp = exact.cost;
      else {
        const contains = catalog.find(c => desc.includes(c.name) || c.name.includes(desc));
        if (contains) cp = contains.cost;
      }
      if (!cp || cp <= 0) cp = Number(it.unit_price || 0);
      const qty = Number(it.quantity || 0);
      total += (cp * qty);
    });
    return total;
  } catch {
    return 0;
  }
};

const computeCashFlowFallback = async (companyId: string, start: string, end: string) => {
  try {
    const startDateObj = new Date(start);
    const startISO = startDateObj.toISOString();
    const endDateObj = new Date(end);
    endDateObj.setHours(23, 59, 59, 999);
    const endISO = endDateObj.toISOString();

    // Fetch period entries with account metadata
    const { data: periodEntries } = await supabase
      .from('transaction_entries')
      .select(`
        debit, credit,
        transactions!inner ( transaction_date, company_id, status ),
        chart_of_accounts!inner ( id, account_name, account_type, is_cash_equivalent )
      `)
      .eq('transactions.company_id', companyId)
      .in('transactions.status', ['posted', 'approved'])
      .gte('transactions.transaction_date', startISO)
      .lte('transactions.transaction_date', endISO);

    const sumBy = (pred: (row: any) => boolean, fn: (row: any) => number) =>
      (periodEntries || []).filter(pred).reduce((s, row) => s + fn(row), 0);

    const isIncome = (t: string) => {
      const v = (t || '').toLowerCase();
      return v === 'income' || v === 'revenue';
    };

    const isExpense = (t: string) => (t || '').toLowerCase() === 'expense';

    const incomeSum = sumBy(
      (row) => isIncome(row.chart_of_accounts?.account_type || ''),
      (row) => Number(row.credit || 0) - Number(row.debit || 0)
    );

    const expenseSum = sumBy(
      (row) => isExpense(row.chart_of_accounts?.account_type || ''),
      (row) => Number(row.debit || 0) - Number(row.credit || 0)
    );

    const v_net_profit = incomeSum - expenseSum;

    const v_depreciation = sumBy(
      (row) => String(row.chart_of_accounts?.account_name || '').toLowerCase().includes('depreciation'),
      (row) => Number(row.debit || 0)
    );

    const v_receivables_change = sumBy(
      (row) => String(row.chart_of_accounts?.account_name || '').toLowerCase().includes('receivable'),
      (row) => Number(row.debit || 0) - Number(row.credit || 0)
    );

    const v_payables_change = sumBy(
      (row) => String(row.chart_of_accounts?.account_name || '').toLowerCase().includes('payable'),
      (row) => Number(row.credit || 0) - Number(row.debit || 0)
    );

    const v_operating = v_net_profit + v_depreciation - v_receivables_change + v_payables_change;

    const v_investing = sumBy(
      (row) => String(row.chart_of_accounts?.account_name || '').toLowerCase().includes('fixed asset'),
      (row) => (Number(row.debit || 0) - Number(row.credit || 0)) * -1
    );

    const v_financing = sumBy(
      (row) => {
        const name = String(row.chart_of_accounts?.account_name || '').toLowerCase();
        return name.includes('loan') || name.includes('capital');
      },
      (row) => Number(row.credit || 0) - Number(row.debit || 0)
    );

    let v_opening_cash = 0;
    try {
      const historyPromise = supabase
        .from('transaction_entries')
        .select(`
        debit, credit,
        transactions!inner ( transaction_date, company_id, status ),
        chart_of_accounts!inner ( is_cash_equivalent )
      `)
        .eq('transactions.company_id', companyId)
        .eq('transactions.status', 'posted')
        .lt('transactions.transaction_date', startISO)
        .eq('chart_of_accounts.is_cash_equivalent', true);

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("History query timeout")), 5000));
      
      const { data: openingEntries } = await Promise.race([historyPromise, timeoutPromise]) as any;

      v_opening_cash = (openingEntries || []).reduce(
        (s: number, row: any) => s + (Number(row.debit || 0) - Number(row.credit || 0)),
        0
      );
    } catch (err) {
       console.warn("Cash flow history query timed out or failed, falling back to bank opening balances", err);
       v_opening_cash = await computeOpeningCashOnly(companyId, startISO);
    }

    const v_closing_cash = v_opening_cash + v_operating + v_investing + v_financing;

    return {
      operating_inflows: v_operating > 0 ? v_operating : 0,
      operating_outflows: v_operating < 0 ? -v_operating : 0,
      net_cash_from_operations: v_operating,
      investing_inflows: v_investing > 0 ? v_investing : 0,
      investing_outflows: v_investing < 0 ? -v_investing : 0,
      net_cash_from_investing: v_investing,
      financing_inflows: v_financing > 0 ? v_financing : 0,
      financing_outflows: v_financing < 0 ? -v_financing : 0,
      net_cash_from_financing: v_financing,
      opening_cash_balance: v_opening_cash,
      closing_cash_balance: v_closing_cash,
      net_change_in_cash: v_operating + v_investing + v_financing,
    };
  } catch (e) {
    console.error('Fallback cash flow error', e);
    return null;
  }
};

const computeOpeningCashOnly = async (companyId: string, start: string) => {
  const { data: banks } = await supabase
    .from('bank_accounts')
    .select('opening_balance')
    .eq('company_id', companyId);
  const totalOpening = (banks || []).reduce((s: number, b: any) => s + Number(b.opening_balance || 0), 0);
  return totalOpening;
};

const getCashFlowForPeriod = async (companyId: string, start: string, end: string) => {
  try {
    const opening = await computeOpeningCashOnly(companyId, start);
    try {
      const { data, error } = await supabase.rpc('get_cash_flow_statement' as any, {
        _company_id: companyId,
        _period_start: start,
        _period_end: end,
      });
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) {
        const cf = (data as any)[0];
        const nets = (
          Number(cf.net_cash_from_operations || 0) +
          Number(cf.net_cash_from_investing || 0) +
          Number(cf.net_cash_from_financing || 0)
        );
        return {
          ...cf,
          opening_cash_balance: opening,
          net_change_in_cash: nets,
          closing_cash_balance: opening + nets,
        };
      }
    } catch {}

    const { data: legacy, error: legacyErr } = await supabase.rpc('generate_cash_flow' as any, {
      _company_id: companyId,
      _period_start: start,
      _period_end: end,
    });
    if (legacyErr) throw legacyErr;
    if (Array.isArray(legacy) && legacy.length > 0) {
      const d: any = legacy[0] || {};
      const toNumber = (v: any) => {
        const n = typeof v === 'number' ? v : parseFloat(String(v || 0));
        return isNaN(n) ? 0 : n;
      };
      const oa = toNumber(d.operating_activities);
      const ia = toNumber(d.investing_activities);
      const fa = toNumber(d.financing_activities);
      const cf = {
        operating_inflows: toNumber(d.operating_inflows ?? (oa > 0 ? oa : 0)),
        operating_outflows: toNumber(d.operating_outflows ?? (oa < 0 ? -oa : 0)),
        net_cash_from_operations: toNumber(d.net_cash_from_operations ?? oa),
        investing_inflows: toNumber(d.investing_inflows ?? (ia > 0 ? ia : 0)),
        investing_outflows: toNumber(d.investing_outflows ?? (ia < 0 ? -ia : 0)),
        net_cash_from_investing: toNumber(d.net_cash_from_investing ?? ia),
        financing_inflows: toNumber(d.financing_inflows ?? (fa > 0 ? fa : 0)),
        financing_outflows: toNumber(d.financing_outflows ?? (fa < 0 ? -fa : 0)),
        net_cash_from_financing: toNumber(d.net_cash_from_financing ?? fa),
        opening_cash_balance: toNumber(d.opening_cash_balance ?? d.opening_cash),
        closing_cash_balance: toNumber(d.closing_cash_balance ?? d.closing_cash),
        net_change_in_cash: toNumber(d.net_change_in_cash ?? d.net_cash_flow),
      };
      const nets = cf.net_cash_from_operations + cf.net_cash_from_investing + cf.net_cash_from_financing;
      const updated = { ...cf, opening_cash_balance: opening, net_change_in_cash: nets, closing_cash_balance: opening + nets };
      const isAllZero = [
        updated.operating_inflows,
        updated.operating_outflows,
        updated.net_cash_from_operations,
        updated.investing_inflows,
        updated.investing_outflows,
        updated.net_cash_from_investing,
        updated.financing_inflows,
        updated.financing_outflows,
        updated.net_cash_from_financing,
        updated.opening_cash_balance,
        updated.closing_cash_balance,
        updated.net_change_in_cash,
      ].every(v => Math.abs(v || 0) < 0.001);
      if (isAllZero) {
        const local = await computeCashFlowFallback(companyId, start, end);
        return local;
      }
      return updated;
    } else {
      const local = await computeCashFlowFallback(companyId, start, end);
      return local;
    }
  } catch (e) {
    console.error('getCashFlowForPeriod error', e);
    return null;
  }
};
