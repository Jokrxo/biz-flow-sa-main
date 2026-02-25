import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Flag, Eye, FileText, Calculator, Receipt, Settings, Lock } from "lucide-react";
import { format, addMonths, addDays, endOfMonth, startOfMonth, parseISO } from "date-fns";
import { toast } from "sonner";
import { calculateVatPeriod } from "@/utils/vat-calculations";

type Position = "VAT Payable" | "VAT Receivable" | "Neutral";

interface TaxPeriod {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  vat_input_total: number;
  vat_output_total: number;
  vat_payable: number;
  submission_date: string | null;
}

interface Vat201Row {
  id?: string;
  period: string;
  vatOutput: number;
  vatInput: number;
  net: number;
  position: Position;
  startDate: string;
  endDate: string;
  status: string;
  submissionDate?: string;
  paymentAmount?: number;
  settled: boolean;
  refundReceived: boolean;
}

function formatMonth(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "long" });
}

import { VATAdjustmentDialog } from "./VATAdjustmentDialog";

export const VAT201 = () => {
  const [loading, setLoading] = useState(true);
  const [frequency, setFrequency] = useState(() => localStorage.getItem("vat_frequency") || "2"); 
  const [currentPeriod, setCurrentPeriod] = useState<Vat201Row | null>(null);
  const [previousPeriods, setPreviousPeriods] = useState<Vat201Row[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<Vat201Row | null>(null);
  const [linkedPayment, setLinkedPayment] = useState<any>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);

  // Close Period Dialog State
  const [closePeriodDialogOpen, setClosePeriodDialogOpen] = useState(false);
  const [previousTransactions, setPreviousTransactions] = useState<any[]>([]);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [loadingPreviousTx, setLoadingPreviousTx] = useState(false);

  // Out of Period Dialog State
  const [outOfPeriodDialogOpen, setOutOfPeriodDialogOpen] = useState(false);
  const [outOfPeriodTransactions, setOutOfPeriodTransactions] = useState<any[]>([]);
  const [loadingOutOfPeriod, setLoadingOutOfPeriod] = useState(false);

  // Link Payment Dialog State
  const [linkPaymentDialogOpen, setLinkPaymentDialogOpen] = useState(false);
  const [potentialPayments, setPotentialPayments] = useState<any[]>([]);
  const [loadingPotentialPayments, setLoadingPotentialPayments] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]); // New state for bank accounts

  // New VAT Action States
  const [vatAdjustmentDialogOpen, setVatAdjustmentDialogOpen] = useState(false);
  const [vatPaymentRefundDialogOpen, setVatPaymentRefundDialogOpen] = useState(false);
  const [vatActionType, setVatActionType] = useState<'payment' | 'refund'>('payment');
  const [paymentPeriodId, setPaymentPeriodId] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<string>("");

  const [reportTransactions, setReportTransactions] = useState<{inputs: any[], outputs: any[]}>({inputs: [], outputs: []});
  const [loadingReport, setLoadingReport] = useState(false);

  // Reopen Dialog State
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenPassword, setReopenPassword] = useState("");
  const [periodToReopen, setPeriodToReopen] = useState<Vat201Row | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [reopenError, setReopenError] = useState("");

  const fetchReportTransactions = async (period: Vat201Row) => {
      if (!companyId || !period.rawStartDate || !period.rawEndDate) return;
      
      setLoadingReport(true);
      try {
          const { data: txs, error } = await supabase
          .from('transactions')
          .select('*')
          .eq('company_id', companyId)
          .in('status', ['approved', 'posted', 'pending'])
          .or(`and(transaction_date.gte.${period.rawStartDate},transaction_date.lte.${period.rawEndDate}),tax_period_id.eq.${period.id}`);

          if (error) throw error;

          const inputs: any[] = [];
          const outputs: any[] = [];

          (txs || []).forEach((t: any) => {
              const type = String(t.transaction_type || '').toLowerCase();
              const isIncome = ['income', 'sales', 'receipt'].includes(type);
              const isPurchase = ['expense', 'purchase', 'bill', 'product_purchase'].includes(type);
              
              if (isIncome) outputs.push(t);
              if (isPurchase) inputs.push(t);
          });

          setReportTransactions({ inputs, outputs });

      } catch (e) {
          console.error("Error fetching report transactions:", e);
          toast.error("Failed to load report details");
      } finally {
          setLoadingReport(false);
      }
  };

  const handleReopenClick = (period: Vat201Row) => {
    setPeriodToReopen(period);
    setReopenDialogOpen(true);
    setReopenPassword("");
    setReopenError("");
  };

  const handleConfirmReopen = async () => {
    if (!companyId || !periodToReopen) return;

    if (userRole !== 'admin') {
        setReopenError("Only administrators can reopen VAT periods.");
        return;
    }

    if (!reopenPassword) {
         setReopenError("Password is required.");
         return;
    }

    // In a real application, you would verify the password here.
    // Since we are simulating the admin check based on role, we assume the presence of a password confirms intent.
    
    try {
        setLoading(true);
        const { error } = await supabase
            .from('tax_periods')
            .update({ status: 'open' })
            .eq('id', periodToReopen.id);

        if (error) throw error;
        
        toast.success("Period reopened successfully");
        setReopenDialogOpen(false);
        loadData();
    } catch (e: any) {
        console.error("Error reopening period:", e);
        toast.error(e.message || "Failed to reopen period");
    } finally {
        setLoading(false);
    }
  };

  const handlePaymentPeriodChange = (periodId: string) => {
    setPaymentPeriodId(periodId);
    const period = [...previousPeriods, (currentPeriod || {})].find(p => p?.id === periodId);
    
    if (period && period.id) {
        const net = period.net; 
        // Net = Input - Output
        // If Net < 0 (e.g. -100), Output > Input => Payable => Payment
        // If Net > 0 (e.g. 100), Input > Output => Receivable => Refund
        
        if (net < 0) {
            setVatActionType('payment');
            setPaymentAmount(Math.abs(net).toFixed(2));
        } else {
            setVatActionType('refund');
            setPaymentAmount(net.toFixed(2));
        }
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, role")
        .eq("user_id", user.id)
        .single();
      
      if (profile?.role) setUserRole(profile.role);

      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);

      // Fetch Company Details
      const { data: companyData } = await supabase
        .from('companies')
        .select('*')
        .eq('id', profile.company_id)
        .single();
      setCompany(companyData);

      // Fetch Bank Accounts
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('company_id', profile.company_id);
      setBankAccounts(bankData || []);

      // 1. Fetch Tax Periods
      const { data: periods, error: periodsError } = await supabase
        .from('tax_periods')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('period_type', 'vat')
        .order('period_end', { ascending: false });

      if (periodsError) throw periodsError;

      // Fetch linked settlement transactions for all periods
      const periodIds = periods?.map(p => p.id) || [];
      const { data: linkedTxs } = await supabase
        .from('transactions')
        .select('tax_period_id, transaction_type')
        .in('tax_period_id', periodIds)
        .in('transaction_type', ['payment', 'receipt']);

      let currentPeriodData: Vat201Row | null = null;
      const prevPeriodsData: Vat201Row[] = [];

      // Find Open period
      const openPeriod = periods?.find(p => p.status === 'open');

      if (openPeriod) {
        // Fetch real-time transactions for the open period
        // Logic: Date Range OR Explicitly Linked
        const { data: txs, error: txError } = await supabase
          .from('transactions')
          .select('transaction_type, vat_amount, total_amount, vat_rate, vat_inclusive, base_amount, transaction_date, tax_period_id')
          .eq('company_id', profile.company_id)
          .in('status', ['approved', 'posted', 'pending'])
          .or(`and(transaction_date.gte.${openPeriod.period_start},transaction_date.lte.${openPeriod.period_end}),tax_period_id.eq.${openPeriod.id}`);

        if (txError) throw txError;

        let outTotal = 0;
        let inTotal = 0;

        (txs || []).forEach((t: any) => {
          const type = String(t.transaction_type || '').toLowerCase();
          const isIncome = ['income', 'sales', 'receipt'].includes(type);
          const isPurchase = ['expense', 'purchase', 'bill', 'product_purchase'].includes(type);
          
          // Simplified VAT calculation logic reuse
          const rate = Number(t.vat_rate || 0);
          const total = Number(t.total_amount || 0);
          const base = Number(t.base_amount || 0);
          const inclusive = Boolean(t.vat_inclusive);
          let vat = Number(t.vat_amount || 0);

          if (vat === 0 && rate > 0) {
             if (inclusive) {
                const net = base > 0 ? base : total / (1 + rate / 100);
                vat = total - net;
              } else {
                vat = total - (base > 0 ? base : total);
              }
          }

          if (isIncome) outTotal += Math.max(0, vat);
          if (isPurchase) inTotal += Math.max(0, vat);
        });

        const net = inTotal - outTotal;
        currentPeriodData = {
          id: openPeriod.id,
          period: `${formatMonth(openPeriod.period_start)} - ${formatMonth(openPeriod.period_end)}`,
          startDate: format(new Date(openPeriod.period_start), 'dd/MM/yyyy'),
          endDate: format(new Date(openPeriod.period_end), 'dd/MM/yyyy'),
          rawStartDate: openPeriod.period_start,
          rawEndDate: openPeriod.period_end,
          vatOutput: outTotal,
          vatInput: inTotal,
          net: net,
          position: net > 0 ? "VAT Receivable" : net < 0 ? "VAT Payable" : "Neutral",
          status: 'open',
          settled: false,
          refundReceived: false
        };
      } else {
        // No open period found - logic to suggest creating one could go here
        // For now, we leave it null, UI handles it
      }

      // Process Closed periods
      periods?.filter(p => p.status !== 'open').forEach(p => {
        const calculatedNet = (p.vat_input_total || 0) - (p.vat_output_total || 0);
        const finalNet = p.vat_payable ? -p.vat_payable : calculatedNet;
        
        // Check settlement status
        const periodTxs = linkedTxs?.filter(t => t.tax_period_id === p.id) || [];
        const isSettled = periodTxs.some(t => t.transaction_type === 'payment');
        const isRefunded = periodTxs.some(t => t.transaction_type === 'receipt');

        prevPeriodsData.push({
          id: p.id,
          period: `${formatMonth(p.period_start)} - ${formatMonth(p.period_end)}`,
          startDate: p.period_start ? format(new Date(p.period_start), 'dd/MM/yyyy') : '-',
          endDate: p.period_end ? format(new Date(p.period_end), 'dd/MM/yyyy') : '-',
          rawStartDate: p.period_start,
          rawEndDate: p.period_end,
          vatOutput: p.vat_output_total || 0,
          vatInput: p.vat_input_total || 0,
          net: finalNet, 
          position: finalNet > 0 ? "VAT Receivable" : finalNet < 0 ? "VAT Payable" : "Neutral",
          status: p.status,
          submissionDate: p.submission_date ? format(parseISO(p.submission_date), 'dd/MM/yyyy') : undefined,
          settled: isSettled,
          refundReceived: isRefunded
        });
      });

      setCurrentPeriod(currentPeriodData);
      setPreviousPeriods(prevPeriodsData);

    } catch (e) {
      console.error("Error loading VAT data:", e);
      toast.error("Failed to load VAT data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInitiateClosePeriod = async () => {
      if (!currentPeriod || !currentPeriod.id || !companyId) return;

      setLoadingPreviousTx(true);
      try {
          // Fetch raw current period to get exact start date
          const { data: periodData } = await supabase
            .from('tax_periods')
            .select('period_start')
            .eq('id', currentPeriod.id)
            .single();
          
          if (!periodData) throw new Error("Could not fetch current period details");

          // Fetch previous transactions:
          // Date < period_start AND tax_period_id IS NULL AND status in approved/posted
          // We assume "Previous" means older than current period start.
          
          const { data: txs, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('company_id', companyId)
            .lt('transaction_date', periodData.period_start)
            .is('tax_period_id', null)
            .in('status', ['approved', 'posted'])
            .order('transaction_date', { ascending: false });

          if (error) throw error;

          setPreviousTransactions(txs || []);
          // Default: Select ALL
          const allIds = new Set((txs || []).map(t => t.id));
          setSelectedTxIds(allIds);
          
          setClosePeriodDialogOpen(true);

      } catch (e) {
          console.error("Error fetching previous transactions:", e);
          toast.error("Failed to prepare close period");
      } finally {
          setLoadingPreviousTx(false);
      }
  };

  const toggleTransactionSelection = (id: string) => {
      const newSet = new Set(selectedTxIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedTxIds(newSet);
  };

  const toggleAllTransactions = () => {
      if (selectedTxIds.size === previousTransactions.length) {
          setSelectedTxIds(new Set());
      } else {
          setSelectedTxIds(new Set(previousTransactions.map(t => t.id)));
      }
  };

  const performClosePeriod = async () => {
    if (!currentPeriod || !currentPeriod.id || !companyId) return;

    try {
      setLoading(true);
      setClosePeriodDialogOpen(false); // Close dialog immediately

      // 1. Link selected previous transactions
      if (selectedTxIds.size > 0) {
          const allIds = Array.from(selectedTxIds);
          const BATCH_SIZE = 100;
          
          for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
              const batch = allIds.slice(i, i + BATCH_SIZE);
              const { error: linkError } = await supabase
                .from('transactions')
                .update({ tax_period_id: currentPeriod.id })
                .in('id', batch);
              
              if (linkError) throw linkError;
          }
      }

      // 2. Re-calculate Period Totals to include these new transactions
      // We use the server-side-like utility which we updated to include linked transactions
      const finalCalc = await calculateVatPeriod(currentPeriod.id);

      const netVat = finalCalc.inputVat - finalCalc.outputVat;
      const payableAmount = netVat < 0 ? Math.abs(netVat) : -netVat; // Positive if payable (net negative)

      // 3. Update current period to Closed with FINAL totals
      const { error: updateError } = await supabase
        .from('tax_periods')
        .update({ 
          status: 'closed',
          vat_input_total: finalCalc.inputVat,
          vat_output_total: finalCalc.outputVat,
          vat_payable: payableAmount, // Store simplified payable
          submission_date: new Date().toISOString()
        })
        .eq('id', currentPeriod.id);

      if (updateError) throw updateError;

      // 4. Create Next Period
      // Workaround: Re-fetch the just-closed period to get dates (or use what we had)
      const { data: justClosed } = await supabase
        .from('tax_periods')
        .select('*')
        .eq('id', currentPeriod.id)
        .single();
        
      if (justClosed) {
        const nextStart = addDays(new Date(justClosed.period_end), 1);
        const nextEnd = endOfMonth(addMonths(nextStart, parseInt(frequency) - 1));
        
        const { error: insertError } = await supabase
          .from('tax_periods')
          .insert({
            company_id: companyId,
            period_type: 'vat',
            period_start: format(nextStart, 'yyyy-MM-dd'),
            period_end: format(nextEnd, 'yyyy-MM-dd'),
            status: 'open',
            vat_input_total: 0,
            vat_output_total: 0,
            vat_payable: 0
          });
          
        if (insertError) throw insertError;
      }

      toast.success("VAT Period Closed Successfully");
      await loadData(); // Refresh UI

    } catch (e) {
      console.error("Error closing period:", e);
      toast.error("Failed to close VAT period");
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreateFirstPeriod = async () => {
    if (!companyId) return;
    try {
       setLoading(true);
       const start = startOfMonth(new Date());
       const end = endOfMonth(addMonths(start, parseInt(frequency) - 1));
       
       const { error } = await supabase
        .from('tax_periods')
        .insert({
            company_id: companyId,
            period_type: 'vat',
            period_start: format(start, 'yyyy-MM-dd'),
            period_end: format(end, 'yyyy-MM-dd'),
            status: 'open',
            vat_input_total: 0,
            vat_output_total: 0,
            vat_payable: 0
        });
        
       if (error) throw error;
       toast.success("First VAT Period Created");
       loadData();
    } catch (e: any) {
       console.error("Error creating period:", e);
       toast.error(e.message || "Failed to create period");
    }
  };

  const getDueDate = (endDateStr: string) => {
    if (!endDateStr) return "-";
    const parts = endDateStr.split('/');
    if (parts.length !== 3) return "-";
    
    const day = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const year = Number(parts[2]);
    
    if (isNaN(day) || isNaN(month) || isNaN(year)) return "-";

    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return "-";

    try {
        const nextMonth = addMonths(date, 1);
        const dueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 25);
        return format(dueDate, 'dd/MM/yyyy');
    } catch (e) {
        return "-";
    }
  };

  const handleViewPeriod = async (period: Vat201Row) => {
    setSelectedPeriod(period);
    setViewDialogOpen(true);
    setLinkedPayment(null);
    fetchReportTransactions(period);
    if (period.id) {
        setLoadingPayment(true);
        try {
            if (period.status === 'open') {
               const calc = await calculateVatPeriod(period.id);
               if (calc) {
                   setSelectedPeriod(prev => prev ? ({
                       ...prev,
                       vatOutput: calc.outputVat,
                       vatInput: calc.inputVat,
                       net: calc.inputVat - calc.outputVat,
                       position: (calc.inputVat - calc.outputVat) > 0 ? "VAT Receivable" : "VAT Payable"
                   }) : null);
               }
            }
            
            const { data: payments } = await supabase
                .from('transactions')
                .select('*')
                .eq('company_id', companyId)
                .eq('tax_period_id', period.id)
                .ilike('description', '%VAT Payment%')
                .limit(1);

            if (payments && payments.length > 0) {
                setLinkedPayment(payments[0]);
            }
        } catch (e) {
            console.error("Error loading payment info", e);
        } finally {
            setLoadingPayment(false);
        }
    }
  };

  const handleOpenLinkPaymentDialog = async () => {
    if (!selectedPeriod || !companyId) return;
    
    setLoadingPotentialPayments(true);
    setLinkPaymentDialogOpen(true);
    setPotentialPayments([]);

    try {
        const isPayable = selectedPeriod.net < 0;
        // If Payable (we owe SARS), we look for payments/expenses.
        // If Refundable (SARS owes us), we look for receipts/income.
        const types = isPayable
           ? ['expense', 'payment', 'withdrawal', 'transfer_out']
           : ['income', 'receipt', 'deposit', 'transfer_in'];

        let query = supabase
            .from('transactions')
            .select('*')
            .eq('company_id', companyId)
            .is('tax_period_id', null)
            .in('transaction_type', types);
            
        // We generally expect the payment to be AFTER the period end.
        if ((selectedPeriod as any).rawEndDate) {
            query = query.gte('transaction_date', (selectedPeriod as any).rawEndDate);
        }

        const { data, error } = await query
            .order('transaction_date', { ascending: false })
            .limit(50);

        if (error) throw error;
        setPotentialPayments(data || []);

    } catch (e) {
        console.error("Error fetching potential payments:", e);
        toast.error("Failed to load potential payments");
    } finally {
        setLoadingPotentialPayments(false);
    }
  };

  const handleConfirmLinkPayment = async (transaction: any) => {
      if (!selectedPeriod || !transaction) return;
      
      try {
          setLoadingPayment(true);
          const { error } = await supabase
              .from('transactions')
              .update({ 
                  tax_period_id: selectedPeriod.id
              })
              .eq('id', transaction.id);

          if (error) throw error;

          toast.success("Payment linked successfully");
          setLinkPaymentDialogOpen(false);
          handleViewPeriod(selectedPeriod); // Refresh view
          
      } catch (e: any) {
          console.error("Error linking payment:", e);
          toast.error("Failed to link payment");
      } finally {
          setLoadingPayment(false);
      }
  };

  const handleViewOutOfPeriod = async (period: Vat201Row) => {
    if (!period.rawStartDate || !companyId) return;
    
    setLoadingOutOfPeriod(true);
    setSelectedPeriod(period);
    setOutOfPeriodDialogOpen(true);
    setOutOfPeriodTransactions([]);

    try {
        let query = supabase
            .from('transactions')
            .select('*')
            .eq('company_id', companyId)
            .lt('transaction_date', period.rawStartDate)
            .in('status', ['approved', 'posted'])
            .neq('vat_amount', 0);

        if (period.status === 'open') {
             // For open period, it's any transaction NOT yet in a period
             query = query.is('tax_period_id', null);
        } else {
             // For closed period, it's transactions IN this period but with date < start
             if (period.id) {
                 query = query.eq('tax_period_id', period.id);
             }
        }
        
        const { data, error } = await query.order('transaction_date', { ascending: false });
        
        if (error) throw error;
        setOutOfPeriodTransactions(data || []);

    } catch (e) {
        console.error("Error fetching out of period transactions:", e);
        toast.error("Failed to load out of period transactions");
    } finally {
        setLoadingOutOfPeriod(false);
    }
  };

  const handleSaveSettings = (newFreq: string) => {
    setFrequency(newFreq);
    localStorage.setItem("vat_frequency", newFreq);
    setSettingsDialogOpen(false);
    toast.success("VAT settings updated");
  };

  const handleCreateVatPaymentRefund = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!companyId) return;

      const formData = new FormData(e.target as HTMLFormElement);
      const amount = parseFloat(formData.get('amount') as string);
      const date = formData.get('date') as string;
      const bankAccountId = formData.get('bankAccountId') as string;
      const description = formData.get('description') as string;

      if (!amount || !date || !bankAccountId) {
          toast.error("Please fill in all required fields");
          return;
      }

      try {
          setLoading(true);
          const type = vatActionType === 'payment' ? 'payment' : 'receipt'; // Payment = Out, Receipt = In
          
          const { error } = await supabase.from('transactions').insert({
              company_id: companyId,
              transaction_date: date,
              description: description || `VAT ${vatActionType === 'payment' ? 'Payment' : 'Refund'}`,
              total_amount: amount,
              base_amount: amount, // No VAT on VAT payment
              vat_amount: 0,
              vat_rate: 0,
              transaction_type: type,
              bank_account_id: bankAccountId,
              status: 'posted',
              payment_method: 'bank_transfer',
              tax_period_id: paymentPeriodId || null
          });

          if (error) throw error;

          toast.success(`VAT ${vatActionType} recorded successfully`);
          setVatPaymentRefundDialogOpen(false);
          loadData(); // Refresh

      } catch (e: any) {
          console.error("Error creating VAT payment:", e);
          toast.error(e.message || "Failed to create transaction");
      } finally {
          setLoading(false);
      }
  };

  const handlePaySars = (period: Vat201Row) => {
    setPaymentPeriodId(period.id || "");
    setPaymentAmount(Math.abs(period.net).toFixed(2));
    setVatActionType('payment');
    setVatPaymentRefundDialogOpen(true);
  };

  const handleReceiveRefund = (period: Vat201Row) => {
    setPaymentPeriodId(period.id || "");
    setPaymentAmount(period.net.toFixed(2));
    setVatActionType('refund');
    setVatPaymentRefundDialogOpen(true);
  };

  return (
    <div className="space-y-8 bg-white p-6 rounded-lg shadow-sm">
      {/* Header Section */}
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold text-gray-800">VAT Returns and Reports</h2>
        
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="text-[#0070ad] border-[#0070ad] hover:bg-[#0070ad]/10">
                  Transactions <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => setVatAdjustmentDialogOpen(true)}>
                  VAT Adjustment
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { 
                    setPaymentPeriodId(""); 
                    setPaymentAmount(""); 
                    setVatPaymentRefundDialogOpen(true); 
                }}>
                  VAT Payment / Refund
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button className="bg-[#0070ad] hover:bg-[#00609d]">
              Reports <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="bg-gray-50 p-4 rounded-md border border-gray-200 text-sm">
            <div className="grid grid-cols-[auto_120px_120px] gap-x-4 gap-y-3 items-center">
              <div></div>
              <div className="font-semibold text-gray-600 text-center">Previous</div>
              <div className="font-semibold text-gray-600 text-center">Next</div>

              <div className="text-gray-600">VAT Period End Date</div>
              <div className="bg-white border px-2 py-1 rounded text-center text-gray-700">
                 {previousPeriods.length > 0 ? previousPeriods[0].endDate : "-"}
              </div>
              <div className="bg-white border px-2 py-1 rounded text-center text-red-500 border-red-200">
                 {currentPeriod ? currentPeriod.endDate : "-"}
              </div>

              <div className="text-gray-600">VAT Submission Due</div>
              <div className="bg-white border px-2 py-1 rounded text-center text-gray-700">
                 {previousPeriods.length > 0 ? getDueDate(previousPeriods[0].endDate) : "-"}
              </div>
              <div className="bg-white border px-2 py-1 rounded text-center text-red-500 border-red-200">
                 {currentPeriod ? getDueDate(currentPeriod.endDate) : "-"}
              </div>

              <div className="text-gray-600 flex items-center gap-2">
                 VAT Reporting Frequency
                 <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-gray-600" onClick={() => setSettingsDialogOpen(true)}>
                    <Settings className="h-4 w-4" />
                 </Button>
              </div>
              <div className="bg-white border px-2 py-1 rounded text-center text-gray-700">
                 {frequency}
              </div>
              <div className="text-gray-500 text-center text-sm pt-1">
                 months
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Current VAT Period Section */}
      <div className="space-y-4">
        <h3 className="text-xl font-medium text-gray-800">Current VAT Period and Return</h3>
        {currentPeriod ? (
           <Button onClick={handleInitiateClosePeriod} className="bg-[#0070ad] hover:bg-[#00609d]">Close VAT Period</Button>
        ) : (
           <Button onClick={handleCreateFirstPeriod} className="bg-[#0070ad] hover:bg-[#00609d]">Start First VAT Period</Button>
        )}

        <div className="rounded-md border overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-slate-700 border-b border-slate-800">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="text-xs font-semibold text-white h-8 min-w-[110px] border-r border-slate-600 pl-3">
                  Period Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 min-w-[80px] border-r border-slate-600">
                  Ref
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 min-w-[180px] border-r border-slate-600">
                  VAT Period
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 min-w-[120px] border-r border-slate-600">
                  Submitted
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[130px] border-r border-slate-600">
                  VAT Payable
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[140px] border-r border-slate-600">
                  VAT Refundable
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-center min-w-[110px] border-r border-slate-600">
                  VAT Report
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[130px] pr-3">
                  Out of Period
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentPeriod ? (
                <TableRow className="h-8 border-b border-border/40 bg-white hover:bg-muted/40">
                  <TableCell className="py-1 text-xs pl-3">Open</TableCell>
                  <TableCell className="py-1 text-xs">Ref</TableCell>
                  <TableCell className="py-1 text-xs">
                    {currentPeriod.startDate} - {currentPeriod.endDate}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-red-500">
                    {getDueDate(currentPeriod.endDate)}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-right font-mono">
                    {currentPeriod.net > 0
                      ? `R ${currentPeriod.net.toLocaleString("en-ZA", {
                          minimumFractionDigits: 2,
                        })}`
                      : "-"}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-right font-mono">
                    {currentPeriod.net < 0
                      ? `R ${Math.abs(currentPeriod.net).toLocaleString("en-ZA", {
                          minimumFractionDigits: 2,
                        })}`
                      : "-"}
                  </TableCell>
                  <TableCell className="py-1 text-xs text-center">
                    <span
                      onClick={() => handleViewPeriod(currentPeriod!)}
                      className="text-[#0070ad] cursor-pointer hover:underline"
                    >
                      view
                    </span>
                  </TableCell>
                  <TableCell className="py-1 text-xs text-right flex justify-end items-center gap-2 pr-3">
                    <span className="text-[#0070ad] font-mono">R 0.00</span>
                    <Flag className="h-4 w-4 text-[#0070ad] fill-current" />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center py-6 text-sm text-gray-500"
                  >
                    No active VAT period found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Previous VAT Periods Section */}
      <div className="space-y-4 pt-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-medium text-gray-800">Previous VAT Periods and Returns</h3>
          <span className="text-gray-400 text-sm cursor-pointer hover:text-[#0070ad]">Start Over?</span>
        </div>

        <div className="rounded-md border overflow-hidden bg-white">
          <Table>
            <TableHeader className="bg-slate-700 border-b border-slate-800">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="text-xs font-semibold text-white h-8 min-w-[130px] border-r border-slate-600 pl-3">
                  Submission Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 min-w-[110px] border-r border-slate-600">
                  Period Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 min-w-[70px] border-r border-slate-600">
                  Ref
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 min-w-[180px] border-r border-slate-600">
                  VAT Period
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 min-w-[120px] border-r border-slate-600">
                  Submitted
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[130px] border-r border-slate-600">
                  VAT Payable
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[140px] border-r border-slate-600">
                  VAT Refundable
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-center min-w-[110px] border-r border-slate-600">
                  VAT Report
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[130px] border-r border-slate-600">
                  Out of Period
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-center min-w-[130px] border-r border-slate-600">
                  Settled (SARS)
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-center min-w-[130px] border-r border-slate-600">
                  Refund Received
                </TableHead>
                <TableHead className="text-xs font-semibold text-white h-8 text-center min-w-[120px] pr-3">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previousPeriods.length > 0 ? (
                previousPeriods.map((row, i) => (
                  <TableRow
                    key={i}
                    className="h-8 border-b border-border/40 bg-white hover:bg-muted/40"
                  >
                    <TableCell className="py-1 text-xs text-gray-400 pl-3">
                        <span 
                            className="cursor-pointer hover:text-[#0070ad] hover:underline" 
                            onClick={() => handleReopenClick(row)}
                        >
                            reopen
                        </span>
                    </TableCell>
                    <TableCell className="py-1 text-xs">Closed</TableCell>
                    <TableCell className="py-1 text-xs">Ref</TableCell>
                    <TableCell className="py-1 text-xs">
                      {row.startDate} - {row.endDate}
                    </TableCell>
                    <TableCell className="py-1 text-xs">
                      {row.submissionDate || "-"}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-right font-mono">
                      {row.net > 0
                        ? `R ${row.net.toLocaleString("en-ZA", {
                            minimumFractionDigits: 2,
                          })}`
                        : "R 0.00"}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-right font-mono">
                      {row.net < 0
                        ? `R ${Math.abs(row.net).toLocaleString("en-ZA", {
                            minimumFractionDigits: 2,
                          })}`
                        : "R 0.00"}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-center">
                      <span
                        onClick={() => handleViewPeriod(row)}
                        className="text-[#0070ad] cursor-pointer hover:underline"
                      >
                        view
                      </span>
                    </TableCell>
                    <TableCell className="py-1 text-xs text-right">
                      <span
                        className="text-[#0070ad] cursor-pointer hover:underline"
                        onClick={() => handleViewOutOfPeriod(row)}
                      >
                        view
                      </span>
                    </TableCell>
                    <TableCell className="py-1 text-xs text-center">
                        {row.net < 0 && ( // Payable
                            row.settled ? (
                                <span className="text-green-600 flex justify-center">
                                  <Flag className="h-4 w-4" />
                                </span>
                            ) : (
                                <span className="text-red-500">No</span>
                            )
                        )}
                        {row.net >= 0 && <span className="text-gray-300">-</span>}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-center">
                        {row.net > 0 && ( // Receivable
                            row.refundReceived ? (
                                <span className="text-green-600 flex justify-center">
                                  <Flag className="h-4 w-4" />
                                </span>
                            ) : (
                                <span className="text-red-500">No</span>
                            )
                        )}
                        {row.net <= 0 && <span className="text-gray-300">-</span>}
                    </TableCell>
                    <TableCell className="py-1 text-xs text-center">
                        {row.net < 0 && !row.settled && (
                            <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50" onClick={() => handlePaySars(row)}>
                                Pay SARS
                            </Button>
                        )}
                        {row.net > 0 && !row.refundReceived && (
                            <Button size="sm" variant="outline" className="h-7 text-xs border-green-200 text-green-600 hover:bg-green-50" onClick={() => handleReceiveRefund(row)}>
                                Receive Refund
                            </Button>
                        )}
                        {(row.settled || row.refundReceived) && (
                             <span className="text-xs text-gray-500">Completed</span>
                        )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={13}
                    className="text-center py-6 text-sm text-gray-500"
                  >
                    No previous VAT periods found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Include Previous Transactions Dialog */}
      <Dialog open={closePeriodDialogOpen} onOpenChange={setClosePeriodDialogOpen}>
        <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Include Previous Transactions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border-l-4 border-[#0070ad] p-4 text-sm text-gray-700 rounded-md">
              <p className="font-bold text-[#0070ad] mb-1">Note:</p>
              <p>These are VAT transactions from an earlier period that have not been included in a VAT return. These transactions will be included in the current {currentPeriod ? (() => {
                  const parts = currentPeriod.endDate.split('/');
                  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : '';
              })() : ''} VAT return.</p>
              <p className="mt-2">If you wish to exclude any of these transactions please deselect the transaction in the grid.</p>
            </div>
            
            <div className="border rounded-md overflow-hidden max-h-[50vh] overflow-y-auto bg-white">
              <Table>
                <TableHeader className="bg-slate-700 border-b border-slate-800 sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="w-10 pl-3">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded border-gray-300 text-[#0070ad] focus:ring-[#0070ad]"
                        checked={previousTransactions.length > 0 && selectedTxIds.size === previousTransactions.length}
                        onChange={toggleAllTransactions}
                      />
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-8 min-w-[110px] border-l border-slate-600">
                      Date
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-8 min-w-[130px] border-l border-slate-600">
                      Transaction Type
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-8 min-w-[140px] border-l border-slate-600">
                      Name
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-8 min-w-[160px] border-l border-slate-600">
                      Doc. No. / Description
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-8 min-w-[110px] border-l border-slate-600">
                      Reference
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[120px] border-l border-slate-600">
                      VAT amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[130px] border-l border-slate-600">
                      Excluding amount
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-white h-8 text-right min-w-[130px] border-l border-slate-600 pr-3">
                      Including amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previousTransactions.length > 0 ? (
                    previousTransactions
                      .filter(tx => Number(tx.vat_amount || 0) !== 0)
                      .map(tx => (
                      <TableRow
                        key={tx.id}
                        className="h-8 border-b border-border/40 hover:bg-muted/40 text-xs"
                      >
                        <TableCell className="pl-3">
                          <input 
                            type="checkbox" 
                            className="h-4 w-4 rounded border-gray-300 text-[#0070ad] focus:ring-[#0070ad]"
                            checked={selectedTxIds.has(tx.id)}
                            onChange={() => toggleTransactionSelection(tx.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {format(new Date(tx.transaction_date), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="capitalize">
                          {tx.transaction_type?.replace(/_/g, ' ') || "-"}
                        </TableCell>
                        <TableCell>
                          {tx.description || "-"}
                        </TableCell>
                        <TableCell>
                          {tx.reference_number || tx.description || "-"}
                        </TableCell>
                        <TableCell>
                          {tx.reference_number || "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          R {(tx.vat_amount || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          R {(
                            tx.base_amount ||
                            (tx.total_amount || 0) - (tx.vat_amount || 0)
                          ).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono pr-3">
                          R {(tx.total_amount || 0).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-sm text-gray-500">
                        No previous unsubmitted transactions found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedTxIds(new Set(previousTransactions.map(t => t.id)))}>Select All</Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedTxIds(new Set())}>Deselect All</Button>
            </div>

            <div className="text-center text-sm text-gray-500 py-2">
                Remember: Add your VAT Submission date once you have submitted your return to keep track of your VAT returns.
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setClosePeriodDialogOpen(false)}>Cancel</Button>
              <Button className="bg-[#0070ad] hover:bg-[#00609d]" onClick={performClosePeriod}>
                Close VAT Period
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={outOfPeriodDialogOpen} onOpenChange={setOutOfPeriodDialogOpen}>
        <DialogContent className="max-w-5xl w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Out of Period Transactions</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
             <div className="bg-white border p-4 text-sm text-gray-700 shadow-sm rounded-md">
                <p className="font-bold mb-1">{selectedPeriod?.period} VAT Return:</p>
                <p>You have back dated transactions included in this VAT return.</p>
                <p className="mt-2 text-gray-500 italic text-xs">Note: Your financial reports will still display these transactions in their correct financial periods, but for VAT purposes they are included in this VAT return.</p>
             </div>
             
             <div className="border rounded-md overflow-hidden max-h-[60vh] overflow-y-auto">
                <Table>
                   <TableHeader className="bg-gray-700 text-white sticky top-0 z-10">
                      <TableRow className="hover:bg-gray-700">
                         <TableHead className="text-white h-8">Date</TableHead>
                         <TableHead className="text-white h-8">Transaction Type</TableHead>
                         <TableHead className="text-white h-8">Name</TableHead>
                         <TableHead className="text-white h-8">Doc. No / Description</TableHead>
                         <TableHead className="text-white h-8">Reference</TableHead>
                         <TableHead className="text-white h-8 text-right">VAT</TableHead>
                         <TableHead className="text-white h-8 text-right">Exclusive</TableHead>
                         <TableHead className="text-white h-8 text-right">Total</TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {outOfPeriodTransactions.map(tx => (
                          <TableRow key={tx.id} className="hover:bg-gray-50 text-xs">
                              <TableCell className="py-2">{format(new Date(tx.transaction_date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell className="py-2 capitalize">{tx.transaction_type?.replace(/_/g, ' ') || '-'}</TableCell>
                              <TableCell className="py-2">-</TableCell>
                              <TableCell className="py-2">{tx.description || '-'}</TableCell>
                              <TableCell className="py-2">{tx.reference_number || '-'}</TableCell>
                              <TableCell className="py-2 text-right">R {(tx.vat_amount || 0).toFixed(2)}</TableCell>
                              <TableCell className="py-2 text-right">R {(tx.base_amount || (tx.total_amount - (tx.vat_amount || 0))).toFixed(2)}</TableCell>
                              <TableCell className="py-2 text-right">R {(tx.total_amount || 0).toFixed(2)}</TableCell>
                          </TableRow>
                      ))}
                      {outOfPeriodTransactions.length === 0 && (
                          <TableRow>
                              <TableCell colSpan={8} className="text-center py-8 text-gray-500">No out of period transactions found.</TableCell>
                          </TableRow>
                      )}
                   </TableBody>
                </Table>
             </div>

             {/* Totals Footer */}
             <div className="flex justify-end gap-8 font-bold text-sm px-4 py-2 bg-gray-50 border-t">
                <div>Totals:</div>
                <div>R {outOfPeriodTransactions.reduce((acc, t) => acc + (t.vat_amount||0), 0).toFixed(2)}</div>
                <div>R {outOfPeriodTransactions.reduce((acc, t) => acc + (t.base_amount || (t.total_amount - (t.vat_amount||0))), 0).toFixed(2)}</div>
                <div>R {outOfPeriodTransactions.reduce((acc, t) => acc + (t.total_amount||0), 0).toFixed(2)}</div>
             </div>

             <div className="flex justify-end gap-2 pt-2">
                 <Button variant="default" className="bg-[#0070ad] hover:bg-[#00609d]" onClick={() => setOutOfPeriodDialogOpen(false)}>Close</Button>
                 <Button variant="outline" className="text-[#0070ad] border-[#0070ad]">Export</Button>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={linkPaymentDialogOpen} onOpenChange={setLinkPaymentDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link {selectedPeriod?.net && selectedPeriod.net < 0 ? "Payment to SARS" : "Refund from SARS"}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
             <div className="mb-4 text-sm text-gray-600">
                Select the transaction that represents the settlement for this VAT period.
                Showing unallocated transactions from {selectedPeriod?.endDate} onwards.
             </div>

             <div className="border rounded-md overflow-hidden">
                <Table>
                   <TableHeader className="bg-gray-100">
                      <TableRow>
                         <TableHead>Date</TableHead>
                         <TableHead>Type</TableHead>
                         <TableHead>Description</TableHead>
                         <TableHead className="text-right">Amount</TableHead>
                         <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                      {loadingPotentialPayments ? (
                          <TableRow>
                              <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                          </TableRow>
                      ) : potentialPayments.length === 0 ? (
                          <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                                  No matching transactions found.
                              </TableCell>
                          </TableRow>
                      ) : (
                          potentialPayments.map(tx => (
                              <TableRow key={tx.id} className="hover:bg-gray-50">
                                  <TableCell>{format(new Date(tx.transaction_date), 'dd/MM/yyyy')}</TableCell>
                                  <TableCell className="capitalize">{tx.transaction_type?.replace(/_/g, ' ')}</TableCell>
                                  <TableCell>{tx.description}</TableCell>
                                  <TableCell className="text-right">R {tx.total_amount?.toFixed(2)}</TableCell>
                                  <TableCell className="text-right">
                                      <Button size="sm" variant="outline" onClick={() => handleConfirmLinkPayment(tx)}>
                                          Link
                                      </Button>
                                  </TableCell>
                              </TableRow>
                          ))
                      )}
                   </TableBody>
                </Table>
             </div>
          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setLinkPaymentDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="p-6 bg-white min-h-[800px]">
             {/* Report Header */}
             <div className="text-center mb-8">
               <h2 className="text-2xl font-bold text-gray-800">VAT 201 Calculation Report</h2>
             </div>
             
             <div className="flex justify-between mb-8 text-sm">
               <div className="space-y-1">
                 <div className="font-bold text-base">{company?.company_name || "Company Name"}</div>
                 <div className="flex gap-2">
                   <span className="font-semibold">VAT Registration Number:</span>
                   <span>{company?.vat_number || "N/A"}</span>
                 </div>
                 <div className="flex gap-2">
                   <span className="font-semibold">VAT Period:</span>
                   <span>{selectedPeriod?.period}</span>
                 </div>
               </div>
               <div className="space-y-1 text-right">
                  <div className="flex gap-4 justify-end">
                    <span className="font-semibold">Start Date:</span>
                    <span>{selectedPeriod?.startDate || "-"}</span>
                  </div>
                  <div className="flex gap-4 justify-end">
                    <span className="font-semibold">End Date:</span>
                    <span>{selectedPeriod?.endDate || "-"}</span>
                  </div>
                </div>
             </div>

             {/* Report Table */}
            {loadingReport ? (
                 <div className="flex justify-center items-center py-12">
                     <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                     <span className="ml-2 text-gray-500">Loading report details...</span>
                 </div>
             ) : (
                 <div className="space-y-8">
                    {/* Output VAT Section */}
                    <div>
                        <h3 className="font-bold text-lg mb-4 bg-gray-100 p-2 border-l-4 border-blue-500">VAT Output (Sales & Income)</h3>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Amount (Excl)</TableHead>
                                        <TableHead className="text-right">VAT</TableHead>
                                        <TableHead className="text-right">Total (Inc)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportTransactions.outputs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-gray-500 py-4">No output transactions found</TableCell>
                                        </TableRow>
                                    ) : (
                                        reportTransactions.outputs.map((t: any) => (
                                            <TableRow key={t.id}>
                                                <TableCell>{t.transaction_date ? format(new Date(t.transaction_date), 'dd/MM/yyyy') : '-'}</TableCell>
                                                <TableCell>{t.description || 'N/A'}</TableCell>
                                                <TableCell className="text-right">R {((t.total_amount || 0) - (t.vat_amount || 0)).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell className="text-right">R {(t.vat_amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell className="text-right">R {(t.total_amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                    <TableRow className="font-bold bg-gray-50">
                                        <TableCell colSpan={3} className="text-right">Total Output VAT:</TableCell>
                                        <TableCell className="text-right">
                                            R {reportTransactions.outputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                             R {reportTransactions.outputs.reduce((sum, t) => sum + (t.total_amount || 0), 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* Input VAT Section */}
                    <div>
                        <h3 className="font-bold text-lg mb-4 bg-gray-100 p-2 border-l-4 border-red-500">VAT Input (Purchases & Expenses)</h3>
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Amount (Excl)</TableHead>
                                        <TableHead className="text-right">VAT</TableHead>
                                        <TableHead className="text-right">Total (Inc)</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reportTransactions.inputs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-gray-500 py-4">No input transactions found</TableCell>
                                        </TableRow>
                                    ) : (
                                        reportTransactions.inputs.map((t: any) => (
                                            <TableRow key={t.id}>
                                                <TableCell>{t.transaction_date ? format(new Date(t.transaction_date), 'dd/MM/yyyy') : '-'}</TableCell>
                                                <TableCell>{t.description || 'N/A'}</TableCell>
                                                <TableCell className="text-right">R {((t.total_amount || 0) - (t.vat_amount || 0)).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell className="text-right">R {(t.vat_amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                                <TableCell className="text-right">R {(t.total_amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                    <TableRow className="font-bold bg-gray-50">
                                        <TableCell colSpan={3} className="text-right">Total Input VAT:</TableCell>
                                        <TableCell className="text-right">
                                            R {reportTransactions.inputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right">
                                             R {reportTransactions.inputs.reduce((sum, t) => sum + (t.total_amount || 0), 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* Calculation Summary */}
                    <div className="bg-gray-100 p-6 rounded-lg border border-gray-200">
                        <h4 className="font-bold text-gray-700 mb-4 uppercase text-sm tracking-wider">VAT Calculation Summary</h4>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-base">
                                <span>Total Output VAT</span>
                                <span className="font-medium">R {reportTransactions.outputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between items-center text-base">
                                <span>Total Input VAT</span>
                                <span className="font-medium text-red-600">- R {reportTransactions.inputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="h-px bg-gray-300 my-2"></div>
                            <div className="flex justify-between items-center text-xl font-bold">
                                <span>
                                    {(reportTransactions.outputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0) - 
                                      reportTransactions.inputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0)) > 0 
                                      ? "VAT Payable to SARS" 
                                      : "VAT Refundable from SARS"}
                                </span>
                                <span className={(reportTransactions.outputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0) - 
                                                  reportTransactions.inputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0)) > 0 
                                                  ? "text-red-600" 
                                                  : "text-green-600"}>
                                    R {Math.abs(reportTransactions.outputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0) - 
                                                reportTransactions.inputs.reduce((sum, t) => sum + (t.vat_amount || 0), 0)).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Payment Linking */}
                    <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                        <div className="text-gray-500 text-sm">
                            Payment Reference: {linkedPayment ? linkedPayment.description : "No Payment Linked"}
                        </div>
                        <Button onClick={handleOpenLinkPaymentDialog} className="bg-[#0070ad] hover:bg-[#00609d]" disabled={loadingPayment || !!linkedPayment}>
                            {loadingPayment ? "Linking..." : linkedPayment ? "Payment Linked" : "Link Payment/Refund"}
                        </Button>
                    </div>
                 </div>
             )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>VAT Settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="frequency" className="col-span-2">
                Reporting Frequency
              </Label>
              <div className="col-span-2">
                  <select 
                    id="frequency"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={frequency}
                    onChange={(e) => handleSaveSettings(e.target.value)}
                  >
                    <option value="1">1 Month</option>
                    <option value="2">2 Months</option>
                    <option value="4">4 Months</option>
                    <option value="6">6 Months</option>
                    <option value="12">12 Months</option>
                  </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSettingsDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VAT Adjustment Dialog */}
      <VATAdjustmentDialog 
        open={vatAdjustmentDialogOpen} 
        onOpenChange={setVatAdjustmentDialogOpen} 
        companyId={companyId} 
        onSuccess={loadData} 
      />

      {/* Reopen Period Dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
                <Lock className="h-5 w-5" />
                Admin Authorization Required
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="text-sm text-gray-600">
                You are about to reopen the VAT period <strong>{periodToReopen?.period}</strong>.
                <br /><br />
                This action is restricted to administrators only. Please enter your password to confirm.
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="admin-password">Admin Password</Label>
                <Input 
                    id="admin-password" 
                    type="password" 
                    value={reopenPassword} 
                    onChange={(e) => setReopenPassword(e.target.value)}
                    placeholder="Enter admin password"
                />
            </div>

            {reopenError && (
                <div className="text-sm text-red-500 bg-red-50 p-2 rounded border border-red-200">
                    {reopenError}
                </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmReopen}>Reopen Period</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VAT Payment/Refund Dialog */}
      <Dialog open={vatPaymentRefundDialogOpen} onOpenChange={setVatPaymentRefundDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Record VAT Transaction</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateVatPaymentRefund}>
            <div className="grid gap-4 py-4">
              {/* Period Selection */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="period" className="text-right">Period</Label>
                <div className="col-span-3">
                    <Select value={paymentPeriodId} onValueChange={handlePaymentPeriodChange} required>
                        <SelectTrigger>
                            <SelectValue placeholder="Select VAT Period" />
                        </SelectTrigger>
                        <SelectContent>
                            {previousPeriods.map(p => (
                                <SelectItem key={p.id} value={p.id || "unknown"}>{p.period} ({p.position})</SelectItem>
                            ))}
                            {currentPeriod && currentPeriod.id && (
                                <SelectItem value={currentPeriod.id}>{currentPeriod.period} (Current)</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>
              </div>

              {/* Display Type (Read Only) */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Type</Label>
                <div className="col-span-3 font-medium">
                    {paymentPeriodId ? (
                        vatActionType === 'payment' ? 
                        <span className="text-red-600 flex items-center gap-2">VAT Payment (Payable)</span> : 
                        <span className="text-green-600 flex items-center gap-2">VAT Refund (Receivable)</span>
                    ) : <span className="text-gray-400">-</span>}
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pay_date" className="text-right">Date</Label>
                <Input id="pay_date" name="date" type="date" className="col-span-3" defaultValue={new Date().toISOString().split('T')[0]} required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="bank" className="text-right">Bank Account</Label>
                <div className="col-span-3">
                    <Select name="bankAccountId" required>
                        <SelectTrigger>
                            <SelectValue placeholder="Select Bank Account" />
                        </SelectTrigger>
                        <SelectContent>
                            {bankAccounts.map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.bank_name} - {acc.account_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pay_amount" className="text-right">Amount</Label>
                <Input 
                    id="pay_amount" 
                    name="amount" 
                    type="number" 
                    step="0.01" 
                    className="col-span-3" 
                    placeholder="0.00" 
                    required 
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pay_desc" className="text-right">Reference</Label>
                <Input id="pay_desc" name="description" className="col-span-3" placeholder={`VAT ${vatActionType === 'payment' ? 'Payment' : 'Refund'} Reference`} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVatPaymentRefundDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading || !paymentPeriodId}>Record {vatActionType === 'payment' ? 'Payment' : 'Refund'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
