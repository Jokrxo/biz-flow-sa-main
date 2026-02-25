import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, Building2, AlertCircle, Loader2, Check, XCircle, Briefcase, Info, History } from "lucide-react";

// Loan calculation function
const calculateMonthlyRepayment = (principal: number, monthlyRate: number, termMonths: number): number => {
  if (monthlyRate === 0) return principal / termMonths;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
};

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
}

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editData?: any;
}

const TRANSACTION_TYPES = [
  { value: "expense", label: "Expense Payment", icon: "💸", description: "Record expense (Dr Expense / Cr Bank or Payable)" },
  { value: "income", label: "Income Received", icon: "💰", description: "Record income (Dr Bank or Receivable / Cr Revenue)" },
  { value: "asset", label: "Asset Purchase", icon: "🏢", description: "Buy fixed asset (Dr Asset / Cr Bank or Payable)" },
  { value: "liability", label: "Liability Payment", icon: "💳", description: "Pay liability (Dr Liability / Cr Bank)" },
  { value: "equity", label: "Capital Contribution", icon: "💎", description: "Owner investment (Dr Bank / Cr Capital)" },
  { value: "loan_received", label: "Loan Received", icon: "🏦", description: "Receive loan from bank (Dr Bank / Cr Loan Payable)" },
  { value: "loan_repayment", label: "Loan Repayment", icon: "💵", description: "Repay loan principal (Dr Loan Payable / Cr Bank)" },
  { value: "loan_interest", label: "Loan Interest", icon: "📈", description: "Pay loan interest (Dr Interest Expense / Cr Bank)" }
];

export const TransactionForm = ({ open, onOpenChange, onSuccess, editData }: TransactionFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [debitAccounts, setDebitAccounts] = useState<Account[]>([]);
  const [creditAccounts, setCreditAccounts] = useState<Account[]>([]);
  const [autoClassification, setAutoClassification] = useState<{ type: string; category: string } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [loans, setLoans] = useState<any[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    reference: "",
    bankAccount: "",
    transactionType: "",
    debitAccount: "",
    creditAccount: "",
    amount: "",
    vatRate: "0",
    amountIncludesVat: false,
    loanId: "",
    interestRate: "",
    loanTerm: ""
  });
  const [companyId, setCompanyId] = useState<string>("");
  const [validationError, setValidationError] = useState<string>("");

  const loadData = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!profile) return;

      const { data: accountsData, error: accountsError } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("is_active", true)
        .order("account_code");
      if (accountsError) throw accountsError;

      const { data: bankData, error: bankError } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("bank_name");
      if (bankError) throw bankError;

      const { data: loansData, error: loansError } = await supabase
        .from("loans")
        .select("id, reference, loan_type, outstanding_balance, status")
        .eq("company_id", profile.company_id)
        .eq("status", "active")
        .order("reference");
      if (loansError) throw loansError;

      setAccounts(accountsData || []);
      setDebitAccounts(accountsData || []);
      setCreditAccounts(accountsData || []);
      setBankAccounts(bankData || []);
      setLoans(loansData || []);

      if (!bankData || bankData.length === 0) {
        toast({
          title: "No Bank Accounts",
          description: "Please set up bank accounts first in the Bank module.",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({ title: "Error loading data", description: error.message, variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  useEffect(() => {
    if (editData) {
      // Validate that bank_account_id exists in bankAccounts list when editing
      let validBankAccount = "";
      if (editData.bank_account_id && bankAccounts.length > 0) {
        const bankExists = bankAccounts.find(bank => bank.id === editData.bank_account_id);
        if (bankExists) {
          validBankAccount = editData.bank_account_id;
        }
      }
      
      setForm({
        date: editData.transaction_date || new Date().toISOString().slice(0, 10),
        description: editData.description || "",
        reference: editData.reference_number || "",
        bankAccount: validBankAccount,
        transactionType: "",
        debitAccount: "",
        creditAccount: "",
        amount: editData.total_amount?.toString() || "",
        vatRate: editData.vat_rate ? String(editData.vat_rate) : "0",
        amountIncludesVat: !!editData.vat_inclusive,
        loanId: "",
        interestRate: "",
        loanTerm: ""
      });
    }
  }, [editData, bankAccounts]);

  // Auto-classify when description changes
  useEffect(() => {
    if (form.description && form.description.length > 3) {
      classifyTransaction(form.description);
    } else {
      setAutoClassification(null);
    }
  }, [form.description]);

 

  

  const classifyTransaction = async (description: string) => {
    try {
      const { data, error } = await supabase.rpc("auto_classify_transaction", {
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
      console.error("Classification error:", error);
    }
  };

  const checkDuplicate = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!profile) return;

      // Convert empty string to null for bank_account_id
      const bankAccountId = form.bankAccount && form.bankAccount.trim() !== "" ? form.bankAccount : null;
      
      const { data, error } = await supabase.rpc("check_duplicate_transaction", {
        _company_id: profile.company_id,
        _bank_account_id: bankAccountId,
        _transaction_date: form.date,
        _total_amount: parseFloat(form.amount || "0"),
        _description: form.description
      });

      if (error) throw error;
      setDuplicateWarning(data === true);
    } catch (error: any) {
      console.error("Duplicate check error:", error);
    }
  }, [form.description, form.amount, form.date, form.bankAccount]);

  useEffect(() => {
    if (form.description && form.amount && form.date && form.bankAccount) {
      checkDuplicate();
    } else {
      setDuplicateWarning(false);
    }
  }, [form.description, form.amount, form.date, form.bankAccount, checkDuplicate]);

  const handleTransactionTypeChange = async (txType: string) => {
    setForm({ 
      ...form, 
      transactionType: txType, 
      debitAccount: "", 
      creditAccount: "",
      loanId: "",
      interestRate: "",
      loanTerm: ""
    });
    
    if (!txType) {
      setDebitAccounts([]);
      setCreditAccounts([]);
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.company_id) return;

      // Handle loan-specific account suggestions
      let debitSuggestions = [];
      let creditSuggestions = [];

      if (txType === 'loan_received') {
        // Loan received: Dr Bank, Cr Loan Payable
        const { data: bankAccounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type")
          .eq("company_id", profile.company_id)
          .eq("account_type", "asset")
          .like("account_name", "%bank%")
          .or("account_code.eq.1100"); // Default bank account

        const { data: loanPayable } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type")
          .eq("company_id", profile.company_id)
          .eq("account_type", "liability")
          .or("account_code.eq.2300,account_code.eq.2400"); // Short/long term loans

        debitSuggestions = bankAccounts || [];
        creditSuggestions = loanPayable || [];
      } else if (txType === 'loan_repayment') {
        // Loan repayment: Dr Loan Payable, Cr Bank
        const { data: loanPayable } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type")
          .eq("company_id", profile.company_id)
          .eq("account_type", "liability")
          .or("account_code.eq.2300,account_code.eq.2400"); // Short/long term loans

        const { data: bankAccounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type")
          .eq("company_id", profile.company_id)
          .eq("account_type", "asset")
          .like("account_name", "%bank%")
          .or("account_code.eq.1100"); // Default bank account

        debitSuggestions = loanPayable || [];
        creditSuggestions = bankAccounts || [];
      } else if (txType === 'loan_interest') {
        // Loan interest: Dr Interest Expense, Cr Bank
        const { data: interestExpense } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type")
          .eq("company_id", profile.company_id)
          .eq("account_type", "expense")
          .like("account_name", "%interest%");

        const { data: bankAccounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_name, account_type")
          .eq("company_id", profile.company_id)
          .eq("account_type", "asset")
          .like("account_name", "%bank%")
          .or("account_code.eq.1100"); // Default bank account

        debitSuggestions = interestExpense || [];
        creditSuggestions = bankAccounts || [];
      } else {
        // Use existing RPC for other transaction types
        const { data: debitData } = await supabase.rpc('get_account_suggestions', {
          _company_id: profile.company_id,
          _transaction_element: txType,
          _side: 'debit'
        });

        const { data: creditData } = await supabase.rpc('get_account_suggestions', {
          _company_id: profile.company_id,
          _transaction_element: txType,
          _side: 'credit'
        });

        debitSuggestions = debitData || [];
        creditSuggestions = creditData || [];
      }

      setDebitAccounts(debitSuggestions);
      setCreditAccounts(creditSuggestions);

      // Auto-select recommended accounts for loan transactions
      if (txType === 'loan_received') {
        // Auto-select first bank account for debit
        const firstBank = debitSuggestions.find(acc => acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank'));
        if (firstBank) {
          setForm(prev => ({ ...prev, debitAccount: firstBank.id }));
        }
        
        // Auto-select first loan payable account for credit
        const firstLoanPayable = creditSuggestions.find(acc => 
          acc.account_type === 'liability' && (acc.account_code === '2300' || acc.account_code === '2400')
        );
        if (firstLoanPayable) {
          setForm(prev => ({ ...prev, creditAccount: firstLoanPayable.id }));
        }
      } else if (txType === 'loan_repayment') {
        // Auto-select first loan payable account for debit
        const firstLoanPayable = debitSuggestions.find(acc => 
          acc.account_type === 'liability' && (acc.account_code === '2300' || acc.account_code === '2400')
        );
        if (firstLoanPayable) {
          setForm(prev => ({ ...prev, debitAccount: firstLoanPayable.id }));
        }
        
        // Auto-select first bank account for credit
        const firstBank = creditSuggestions.find(acc => acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank'));
        if (firstBank) {
          setForm(prev => ({ ...prev, creditAccount: firstBank.id }));
        }
      } else if (txType === 'loan_interest') {
        // Auto-select interest expense for debit
        const interestExpense = debitSuggestions.find(acc => 
          acc.account_type === 'expense' && acc.account_name.toLowerCase().includes('interest')
        );
        if (interestExpense) {
          setForm(prev => ({ ...prev, debitAccount: interestExpense.id }));
        }
        
        // Auto-select first bank account for credit
        const firstBank = creditSuggestions.find(acc => acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank'));
        if (firstBank) {
          setForm(prev => ({ ...prev, creditAccount: firstBank.id }));
        }
      }

      // Validate loan transactions have required accounts
      if (txType.startsWith('loan_') && (debitSuggestions.length === 0 || creditSuggestions.length === 0)) {
        toast({ 
          title: "Missing Loan Accounts", 
          description: `Please ensure you have the required accounts for loan transactions in Chart of Accounts.`,
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error("Error loading account suggestions:", error);
      toast({ title: "Error", description: "Failed to load account suggestions", variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setValidationError("");

      // Basic validation with specific missing fields
      const missingFields = [];
      if (!form.bankAccount) missingFields.push("Bank Account");
      if (!form.description) missingFields.push("Description");
      if (!form.transactionType) missingFields.push("Transaction Type");
      if (!form.debitAccount) missingFields.push("Debit Account");
      if (!form.creditAccount) missingFields.push("Credit Account");
      if (!form.amount) missingFields.push("Amount");
      
      // Loan-specific validation
      if (form.transactionType.startsWith('loan_')) {
        if (!form.bankAccount || form.bankAccount === "__none__") {
          missingFields.push("Bank Account (required for loan transactions)");
        }
        
        if (form.transactionType === 'loan_repayment' && !form.loanId) {
          missingFields.push("Loan Selection (required for loan repayment)");
        }
        
        if (form.transactionType === 'loan_received' && !form.interestRate) {
          missingFields.push("Interest Rate (required for new loans)");
        }
        
        if (form.transactionType === 'loan_received' && !form.loanTerm) {
          missingFields.push("Loan Term (required for new loans)");
        }
      }
      
      if (missingFields.length > 0) {
        toast({ 
          title: "Missing Required Fields", 
          description: `Please fill: ${missingFields.join(", ")}`, 
          variant: "destructive" 
        });
        return;
      }

      // Validate bank account (required in this form)
      let bankAccountId: string | null = null;
      if (form.bankAccount && form.bankAccount.trim() !== "" && form.bankAccount !== "__none__") {
        // Check if bank account exists in the loaded bank accounts list
        const bankExists = bankAccounts.find(bank => bank.id === form.bankAccount);
        if (!bankExists) {
          toast({ 
            title: "Invalid Bank Account", 
            description: "The selected bank account no longer exists. Please select a valid bank account.", 
            variant: "destructive" 
          });
          return;
        }
        // Ensure it's a valid UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(form.bankAccount)) {
          toast({ 
            title: "Invalid Bank Account ID", 
            description: "Bank account ID format is invalid.", 
            variant: "destructive" 
          });
          return;
        }
        bankAccountId = form.bankAccount;
      }
      
      // Double-check: ensure we're sending null, not empty string
      if (bankAccountId === "" || bankAccountId === "__none__") {
        bankAccountId = null;
      }

      const rawAmount = parseFloat(form.amount);
      if (isNaN(rawAmount) || rawAmount <= 0) {
        toast({ title: "Invalid amount", description: "Amount must be greater than 0", variant: "destructive" });
        return;
      }

      const ratePct = parseFloat(form.vatRate) || 0;
      const txTypeLower = String(form.transactionType).toLowerCase();
      const isIncomeTx = ['income','sales','receipt'].includes(txTypeLower);
      const isPurchaseTx = ['expense','purchase','bill','product_purchase'].includes(txTypeLower);
      const purchaseInclusive = isPurchaseTx && !!form.amountIncludesVat && ratePct > 0;
      const baseAmount = purchaseInclusive ? (rawAmount / (1 + ratePct / 100)) : rawAmount;
      const vatAmount = purchaseInclusive ? (rawAmount - baseAmount) : (baseAmount * (ratePct / 100));
      const totalAmount = purchaseInclusive ? rawAmount : (baseAmount + vatAmount);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.company_id) throw new Error("Profile not found");

      // Enhanced validation using RPC
      const { data: validation } = await supabase.rpc('validate_transaction_before_post', {
        _company_id: profile.company_id,
        _debit_account_id: form.debitAccount,
        _credit_account_id: form.creditAccount,
        _debit_amount: totalAmount,
        _credit_amount: totalAmount
      });

      if (validation && validation.length > 0 && !validation[0].is_valid) {
        setValidationError(validation[0].error_message);
        toast({ title: "Validation Error", description: validation[0].error_message, variant: "destructive" });
        return;
      }

      // Check duplicates
      if (duplicateWarning) {
        const confirmed = confirm("⚠️ Duplicate Transaction Detected!\n\nA similar transaction already exists. Do you want to proceed anyway?");
        if (!confirmed) return;
      }

      let transaction;
      let txError;
      if (editData?.id) {
        const { data: updated, error: updErr } = await supabase
          .from("transactions")
          .update({
            transaction_date: form.date,
            description: form.description.trim(),
            reference_number: form.reference?.trim() || null,
            vat_rate: ratePct || null,
            vat_amount: vatAmount || null,
            base_amount: baseAmount,
            vat_inclusive: !!form.amountIncludesVat,
            total_amount: totalAmount,
          })
          .eq("id", editData.id)
          .select()
          .single();
        transaction = updated;
        txError = updErr as any;
      } else {
        const ins = await supabase
          .from("transactions")
          .insert({
            company_id: profile.company_id,
            user_id: user.id,
            bank_account_id: bankAccountId,
            transaction_date: form.date,
            description: form.description.trim(),
            reference_number: form.reference?.trim() || null,
            total_amount: totalAmount,
            transaction_type: form.transactionType,
            category: autoClassification?.category || null,
            vat_rate: parseFloat(form.vatRate) || null,
            vat_amount: vatAmount || null,
            base_amount: baseAmount,
            vat_inclusive: !!form.amountIncludesVat,
            status: "pending"
          })
          .select()
          .single();
        transaction = ins.data;
        txError = ins.error as any;
      }
      if (txError) {
        toast({ title: "Transaction failed", description: txError.message, variant: "destructive" });
        return;
      }

      if (txError) {
        console.error("Transaction insert error:", txError);
        console.error("Attempted bank_account_id value:", bankAccountId);
        console.error("Bank account ID type:", typeof bankAccountId);
        
        // Provide more helpful error messages
        if (txError.message?.includes('bank_account_id_fkey') || txError.message?.includes('foreign key constraint')) {
          toast({ 
            title: "Bank Account Error", 
            description: `The bank account reference is invalid. Please select a valid bank account. Error: ${txError.message}`, 
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
      // Ensure selected accounts exist in loaded Chart of Accounts
      const debitExistsInChart = accounts.some(a => a.id === form.debitAccount);
      const creditExistsInChart = accounts.some(a => a.id === form.creditAccount);
      if (!debitExistsInChart || !creditExistsInChart) {
        toast({
          title: "Invalid Account",
          description: "Selected accounts must exist in your Chart of Accounts.",
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

      // Ensure at least one side is a Bank (Asset) ledger when a bank account is involved
      if (bankAccountId) {
        const debitAcc = accounts.find(a => a.id === form.debitAccount);
        const creditAcc = accounts.find(a => a.id === form.creditAccount);
        const isDebitBank = !!(debitAcc && (debitAcc.account_type || '').toLowerCase().includes('asset') && (debitAcc.account_name || '').toLowerCase().includes('bank'));
        const isCreditBank = !!(creditAcc && (creditAcc.account_type || '').toLowerCase().includes('asset') && (creditAcc.account_name || '').toLowerCase().includes('bank'));
        if (!isDebitBank && !isCreditBank) {
          toast({ 
            title: "Select Bank Ledger Account", 
            description: "With a bank account selected, either the debit or credit must be a Bank (Asset) ledger account.", 
            variant: "destructive" 
          });
          return;
        }
      }

      const isIncomeTx2 = ['income','sales','receipt'].includes(String(form.transactionType).toLowerCase());
      const isPurchaseTx2 = ['expense','purchase','bill','product_purchase'].includes(String(form.transactionType).toLowerCase());
      let vatOutputAcc = accounts.find(a => a.account_code === '2100' || (a.account_name || '').toLowerCase().includes('vat output') || (a.account_name || '').toLowerCase().includes('vat payable'));
      let vatInputAcc = accounts.find(a => a.account_code === '2110' || (a.account_name || '').toLowerCase().includes('vat input') || (a.account_name || '').toLowerCase().includes('vat receivable'));

      try {
        if (ratePct > 0 && isIncomeTx && !vatOutputAcc) {
          const { data: created } = await supabase
            .from('chart_of_accounts')
            .insert({ company_id: profile.company_id, account_code: '2100', account_name: 'VAT Output (15%)', account_type: 'liability', is_active: true })
            .select('*')
            .single();
          if (created) {
            vatOutputAcc = created as any;
            accounts.push(created as any);
          }
        }
        if (ratePct > 0 && isPurchaseTx && !vatInputAcc) {
          const { data: created } = await supabase
            .from('chart_of_accounts')
            .insert({ company_id: profile.company_id, account_code: '2110', account_name: 'VAT Input', account_type: 'liability', is_active: true })
            .select('*')
            .single();
          if (created) {
            vatInputAcc = created as any;
            accounts.push(created as any);
          }
        }
      } catch {}

      const entries: Array<{ account_id: string; debit: number; credit: number; description: string }> = [];
      if (ratePct > 0 && (isIncomeTx2 || isPurchaseTx2) && (vatOutputAcc || vatInputAcc)) {
        if (isIncomeTx2) {
          entries.push({ account_id: form.debitAccount, debit: totalAmount, credit: 0, description: form.description.trim() });
          entries.push({ account_id: form.creditAccount, debit: 0, credit: baseAmount, description: form.description.trim() });
          if (vatOutputAcc) entries.push({ account_id: vatOutputAcc.id, debit: 0, credit: vatAmount, description: `VAT Output ${ratePct}%` });
        } else if (isPurchaseTx2) {
          entries.push({ account_id: form.debitAccount, debit: baseAmount, credit: 0, description: form.description.trim() });
          if (vatInputAcc) entries.push({ account_id: vatInputAcc.id, debit: vatAmount, credit: 0, description: `VAT Input ${ratePct}%` });
          entries.push({ account_id: form.creditAccount, debit: 0, credit: totalAmount, description: form.description.trim() });
        }
      } else {
        entries.push({ account_id: form.debitAccount, debit: totalAmount, credit: 0, description: form.description.trim() });
        entries.push({ account_id: form.creditAccount, debit: 0, credit: totalAmount, description: form.description.trim() });
      }

      
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

      // Log entries before inserting for debugging
      console.log("Inserting transaction entries:", sanitizedEntries.map(e => ({ 
        account_id: e.account_id, 
        debit: e.debit, 
        credit: e.credit 
      })));

      if (!editData?.id) {
        const { error: entriesError } = await supabase
          .from("transaction_entries")
          .insert(sanitizedEntries.map(e => ({
            transaction_id: transaction.id,
            account_id: e.account_id,
            debit: e.debit,
            credit: e.credit,
            description: form.description.trim(),
            status: "pending"
          })) as any);
        if (entriesError) {
          toast({ title: "Entries failed", description: entriesError.message, variant: "destructive" });
          return;
        }
      }
      // Keep manual transactions at approved status; do not auto-set to posted

      // Update bank account balance
      if (bankAccountId && !editData?.id) {
        const debitAccountData = accounts.find(a => a.id === form.debitAccount);
        const creditAccountData = accounts.find(a => a.id === form.creditAccount);
        
        // If bank account is debited (receiving money), increase balance
        if (debitAccountData && debitAccountData.account_type.toLowerCase().includes('asset') && debitAccountData.account_name.toLowerCase().includes('bank')) {
          await supabase.rpc('update_bank_balance', {
            _bank_account_id: bankAccountId,
            _amount: totalAmount,
            _operation: 'add'
          });
        }
        
        // If bank account is credited (paying money), decrease balance
        if (creditAccountData && creditAccountData.account_type.toLowerCase().includes('asset') && creditAccountData.account_name.toLowerCase().includes('bank')) {
          await supabase.rpc('update_bank_balance', {
            _bank_account_id: bankAccountId,
            _amount: totalAmount,
            _operation: 'subtract'
          });
        }
      }

      // Handle loan-specific operations
      if (form.transactionType === 'loan_received') {
        // Create a new loan record
        const monthlyRepayment = calculateMonthlyRepayment(
          parseFloat(form.amount),
          parseFloat(form.interestRate) / 100 / 12, // Monthly rate
          parseInt(form.loanTerm)
        );

        const { error: loanError } = await supabase
          .from("loans")
          .insert({
            company_id: profile.company_id,
            reference: form.reference || `LOAN-${Date.now()}`,
            loan_type: parseInt(form.loanTerm) <= 12 ? 'short' : 'long',
            principal: parseFloat(form.amount),
            interest_rate: parseFloat(form.interestRate),
            start_date: form.date,
            term_months: parseInt(form.loanTerm),
            monthly_repayment: monthlyRepayment,
            status: 'active',
            outstanding_balance: parseFloat(form.amount)
          });

        if (loanError) {
          console.error("Loan creation error:", loanError);
          toast({ 
            title: "Loan Creation Failed", 
            description: "Transaction was posted but loan record could not be created: " + loanError.message, 
            variant: "destructive" 
          });
        } else {
          toast({ 
            title: "Loan Created Successfully", 
            description: "New loan record created with monthly repayment of R " + monthlyRepayment.toFixed(2) 
          });
        }
      } else if (form.transactionType === 'loan_repayment' && form.loanId) {
        // Update loan outstanding balance
        const { data: loanData } = await supabase
          .from("loans")
          .select("outstanding_balance")
          .eq("id", form.loanId)
          .single();

        if (loanData) {
          const newBalance = Math.max(0, loanData.outstanding_balance - parseFloat(form.amount));
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
      } else if (form.transactionType === 'loan_interest' && form.loanId) {
        // Record loan interest payment
        const { error: interestError } = await supabase
          .from("loan_payments")
          .insert({
            loan_id: form.loanId,
            payment_date: form.date,
            amount: parseFloat(form.amount),
            principal_component: 0,
            interest_component: parseFloat(form.amount)
          });

        if (interestError) {
          console.error("Interest payment recording error:", interestError);
        }
      }

      toast({ 
        title: "Success", 
        description: editData?.id ? "Transaction updated" : "Transaction posted successfully" 
      });
      
      setIsSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        onSuccess();
        setIsSuccess(false);

        // Reset form
        setForm({
          date: new Date().toISOString().slice(0, 10),
          description: "",
          reference: "",
          bankAccount: "",
          transactionType: "",
          debitAccount: "",
          creditAccount: "",
          amount: "",
          vatRate: "0",
          amountIncludesVat: false,
          loanId: "",
          interestRate: "",
          loanTerm: ""
        });
        setAutoClassification(null);
        setDuplicateWarning(false);
        setValidationError("");
      }, 2000);
    } catch (error: any) {
      console.error('Transaction posting error:', error);
      
      // Check if it's an AFS/accounting equation error
      if (error.message?.includes('AFS Posting') || error.message?.includes('not balanced')) {
        toast({ 
          title: "Accounting Posting Error", 
          description: error.message, 
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Error", 
          description: error.message || "Failed to post transaction", 
          variant: "destructive" 
        });
        setValidationError(error.message || "Failed to post transaction");
      }
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] flex flex-col items-center justify-center min-h-[350px] border-none shadow-2xl bg-gradient-to-b from-background to-muted/20">
          <div className="h-28 w-28 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center mb-6 animate-in zoom-in-50 duration-500 shadow-inner">
            <Check className="h-14 w-14 text-emerald-600 drop-shadow-sm" />
          </div>
          <DialogHeader className="space-y-4">
            <DialogTitle className="text-center text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-emerald-500">Success!</DialogTitle>
            <div className="text-center space-y-2">
              <p className="text-xl font-medium text-foreground">Transaction Posted Successfully</p>
              <p className="text-muted-foreground max-w-[280px] mx-auto">Your transaction has been securely recorded in the ledger.</p>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-0 shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
        {loading && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-md z-50 flex flex-col items-center justify-center animate-in fade-in duration-200">
            <div className="p-6 rounded-2xl bg-card shadow-xl border border-border/50 flex flex-col items-center">
              <div className="relative mb-4">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                <Loader2 className="h-12 w-12 animate-spin text-primary relative z-10" />
              </div>
              <p className="text-lg font-semibold text-foreground">Processing Transaction</p>
              <p className="text-sm text-muted-foreground animate-pulse">Updating ledger and balances...</p>
            </div>
          </div>
        )}
        <DialogHeader className="p-6 pb-4 bg-muted/10 border-b">
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary shadow-sm">
              <Building2 className="h-6 w-6" />
            </div>
            {editData ? "Edit Transaction" : "New Transaction"}
          </DialogTitle>
          <p className="text-muted-foreground ml-[3.25rem]">
            {editData ? "Modify the existing transaction details." : "Record a new double-entry transaction."}
          </p>
        </DialogHeader>
        
        <div className="grid gap-6 p-6">
          {/* Bank Account Selection */}
          <div className="p-5 bg-gradient-to-br from-primary/5 to-transparent rounded-xl border border-primary/10 shadow-sm">
            <Label className="text-sm font-semibold flex items-center gap-2 mb-3 text-primary">
              <Building2 className="h-4 w-4" />
              Bank Account <span className="text-xs font-normal text-muted-foreground">(Required for bank transactions)</span>
            </Label>
            <Select value={form.bankAccount || "__none__"} onValueChange={(val) => {
              const bankAccountValue = val === "__none__" ? "" : val;
              setForm({ ...form, bankAccount: bankAccountValue });
            }}>
              <SelectTrigger className="bg-background border-primary/20 focus:ring-primary/20 h-11 transition-all hover:border-primary/50">
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-muted-foreground">None</SelectItem>
                {bankAccounts.map(bank => (
                  <SelectItem key={bank.id} value={bank.id} className="cursor-pointer">
                    <span className="font-medium">{bank.bank_name}</span> 
                    <span className="mx-2 text-muted-foreground/50">|</span> 
                    <span>{bank.account_name}</span> 
                    <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {bank.account_number}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="font-semibold text-foreground/80">Transaction Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="h-11 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50 bg-background/50 focus:bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-semibold text-foreground/80">Reference Number</Label>
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="e.g. INV-001"
                className="h-11 transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50 bg-background/50 focus:bg-background"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-semibold text-foreground/80">Description <span className="text-red-500">*</span> <span className="text-xs font-normal text-muted-foreground">(Auto-Classification enabled)</span></Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. 'Fuel purchase', 'Equipment', 'Salary payment'"
              rows={2}
              className="resize-none min-h-[80px] transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50 bg-background/50 focus:bg-background"
            />
            {autoClassification && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-300 pt-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-muted-foreground">
                  Auto-classified as: 
                  <Badge className="ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200" variant="secondary">
                    {autoClassification.type} - {autoClassification.category}
                  </Badge>
                </span>
              </div>
            )}
          </div>

          {duplicateWarning && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">⚠️ Duplicate Transaction Detected</p>
                <p className="text-sm text-muted-foreground">A similar transaction already exists for this bank account, date, and amount.</p>
              </div>
            </div>
          )}

          {validationError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
              <XCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">Error</p>
                <p className="text-sm text-muted-foreground">{validationError}</p>
              </div>
            </div>
          )}

          <div>
            <Label className="font-semibold text-foreground/80 mb-1.5 block">Transaction Type <span className="text-red-500">*</span></Label>
            <Select value={form.transactionType} onValueChange={handleTransactionTypeChange}>
              <SelectTrigger className="h-11 bg-background border-primary/20 focus:ring-primary/20 transition-all hover:border-primary/50">
                <SelectValue placeholder="Select transaction type" />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map(tt => (
                  <SelectItem key={tt.value} value={tt.value} className="py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="p-1 rounded-md bg-primary/10 text-primary">{tt.icon}</span>
                      <span className="font-medium">{tt.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.transactionType && (
              <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                <Info className="h-3.5 w-3.5" />
                {TRANSACTION_TYPES.find(t => t.value === form.transactionType)?.description}
              </div>
            )}
          </div>

          {/* Loan-specific fields */}
          {form.transactionType.startsWith('loan_') && (
            <div className="space-y-4 p-5 bg-gradient-to-br from-blue-50 to-transparent rounded-xl border border-blue-100 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 pb-2 border-b border-blue-100">
                <Briefcase className="h-4 w-4 text-blue-600" />
                <div className="text-sm font-semibold text-blue-900">Loan Transaction Details</div>
              </div>
              
              {form.transactionType === 'loan_received' && (
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <Label className="text-blue-900">Interest Rate (% per annum) *</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        value={form.interestRate}
                        onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                        placeholder="e.g., 8.5"
                        className="h-10 border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-blue-400 font-bold">%</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-blue-900">Loan Term (months) *</Label>
                    <Input
                      type="number"
                      value={form.loanTerm}
                      onChange={(e) => setForm({ ...form, loanTerm: e.target.value })}
                      placeholder="e.g., 12"
                      className="h-10 border-blue-200 focus:border-blue-400 focus:ring-blue-400/20"
                    />
                  </div>
                </div>
              )}

              {(form.transactionType === 'loan_repayment' || form.transactionType === 'loan_interest') && (
                <div className="space-y-1.5">
                  <Label className="text-blue-900">Select Loan *</Label>
                  <Select value={form.loanId} onValueChange={(val) => setForm({ ...form, loanId: val })}>
                    <SelectTrigger className="h-10 border-blue-200 focus:border-blue-400 focus:ring-blue-400/20 bg-white/50">
                      <SelectValue placeholder="Choose a loan" />
                    </SelectTrigger>
                    <SelectContent>
                      {loans.map(loan => (
                        <SelectItem key={loan.id} value={loan.id}>
                          <span className="font-medium text-blue-900">{loan.reference}</span>
                          <span className="mx-2 text-blue-300">|</span>
                          <span className="text-blue-700">{loan.loan_type === 'short' ? 'Short-term' : 'Long-term'}</span>
                          <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-700 hover:bg-blue-200">
                            Outstanding: R {loan.outstanding_balance?.toFixed(2)}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="text-xs text-blue-600/80 bg-blue-100/50 p-2.5 rounded border border-blue-100 flex items-start gap-2">
                <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  {form.transactionType === 'loan_received' && 
                    "This will create a new loan record and post the transaction to your accounts."}
                  {form.transactionType === 'loan_repayment' && 
                    "This will reduce the loan outstanding balance and post the principal repayment."}
                  {form.transactionType === 'loan_interest' && 
                    "This will post interest expense and update the loan interest records."}
                </span>
              </div>
            </div>
          )}

          {form.transactionType === 'loan_received' && (
            <div className="p-4 bg-gradient-to-r from-blue-50 to-transparent border-l-4 border-blue-500 rounded-r-lg animate-in fade-in slide-in-from-left-2">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-full text-blue-600">🏦</div>
                <div className="text-sm">
                  <p className="font-semibold text-blue-900 mb-1">Loan Received Transaction</p>
                  <p className="text-blue-700/90 leading-relaxed">
                    When you receive a loan: <strong className="text-blue-800">Debit Bank Account</strong> (cash increases) and <strong className="text-blue-800">Credit Loan Account</strong> (liability increases).
                    Select your bank account below to receive the funds, and choose either 2300 (Short-term) or 2400 (Long-term) loan account.
                  </p>
                </div>
              </div>
            </div>
          )}

          {form.transactionType === 'loan_repayment' && (
            <div className="p-4 bg-gradient-to-r from-green-50 to-transparent border-l-4 border-green-500 rounded-r-lg animate-in fade-in slide-in-from-left-2">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-100 rounded-full text-green-600">💳</div>
                <div className="text-sm">
                  <p className="font-semibold text-green-900 mb-1">Loan Repayment Transaction</p>
                  <p className="text-green-700/90 leading-relaxed">
                    When repaying loan principal: <strong className="text-green-800">Debit Loan Account</strong> (liability decreases) and <strong className="text-green-800">Credit Bank Account</strong> (cash decreases).
                    This reduces your outstanding loan balance.
                  </p>
                </div>
              </div>
            </div>
          )}

          {form.transactionType === 'loan_interest' && (
            <div className="p-4 bg-gradient-to-r from-orange-50 to-transparent border-l-4 border-orange-500 rounded-r-lg animate-in fade-in slide-in-from-left-2">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-orange-100 rounded-full text-orange-600">📈</div>
                <div className="text-sm">
                  <p className="font-semibold text-orange-900 mb-1">Loan Interest Payment</p>
                  <p className="text-orange-700/90 leading-relaxed">
                    When paying loan interest: <strong className="text-orange-800">Debit Interest Expense</strong> (expense increases) and <strong className="text-orange-800">Credit Bank Account</strong> (cash decreases).
                    This records the cost of borrowing, separate from principal repayment.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 p-5 bg-muted/30 rounded-xl border border-border/50">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                Debit Account (Dr) <span className="text-red-500">*</span>
                {form.transactionType === 'loan_received' && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-green-50 text-green-700 border-green-200">
                    💰 Cash Received
                  </Badge>
                )}
                {form.transactionType === 'loan_repayment' && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-blue-50 text-blue-700 border-blue-200">
                    💳 Reduce Loan
                  </Badge>
                )}
                {form.transactionType === 'loan_interest' && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-orange-50 text-orange-700 border-orange-200">
                    📈 Interest Expense
                  </Badge>
                )}
              </Label>
              <Select value={form.debitAccount} onValueChange={(val) => setForm({ ...form, debitAccount: val })}>
                <SelectTrigger className={cn(
                  "h-11 bg-background transition-all hover:border-primary/50 focus:ring-primary/20",
                  form.transactionType?.startsWith('loan_') && !form.debitAccount && "border-orange-300 ring-2 ring-orange-100"
                )}>
                  <SelectValue 
                    placeholder={form.transactionType === 'loan_received' ? "Select Bank Account (Cash Received)" : 
                                 form.transactionType === 'loan_repayment' ? "Select Loan Account (Reduce Loan)" :
                                 form.transactionType === 'loan_interest' ? "Select Interest Expense" :
                                 "Select debit account"} 
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {debitAccounts.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No accounts available for this transaction type
                    </div>
                  ) : (
                    debitAccounts.map(acc => (
                      <SelectItem key={(acc as any).id ?? (acc as any).account_id} value={(acc as any).id ?? (acc as any).account_id} className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium border">{acc.account_code}</span>
                          <span className="font-medium">{acc.account_name}</span>
                          <span className="text-xs text-muted-foreground/70">[{acc.account_type}]</span>
                          {form.transactionType === 'loan_received' && acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank') && (
                            <Badge variant="secondary" className="text-[10px] ml-auto bg-green-100 text-green-700 hover:bg-green-200">💰 Recommended</Badge>
                          )}
                          {form.transactionType === 'loan_repayment' && (acc.account_code === '2300' || acc.account_code === '2400') && (
                            <Badge variant="secondary" className="text-[10px] ml-auto bg-blue-100 text-blue-700 hover:bg-blue-200">💳 Loan Account</Badge>
                          )}
                          {form.transactionType === 'loan_interest' && acc.account_type === 'expense' && acc.account_name.toLowerCase().includes('interest') && (
                            <Badge variant="secondary" className="text-[10px] ml-auto bg-orange-100 text-orange-700 hover:bg-orange-200">📈 Interest</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                Credit Account (Cr) <span className="text-red-500">*</span>
                {form.transactionType === 'loan_received' && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-purple-50 text-purple-700 border-purple-200">
                    🏦 Loan Liability
                  </Badge>
                )}
                {form.transactionType === 'loan_repayment' && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-red-50 text-red-700 border-red-200">
                    💸 Cash Paid
                  </Badge>
                )}
                {form.transactionType === 'loan_interest' && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-red-50 text-red-700 border-red-200">
                    💸 Cash Paid
                  </Badge>
                )}
              </Label>
              <Select value={form.creditAccount} onValueChange={(val) => setForm({ ...form, creditAccount: val })}>
                <SelectTrigger className={cn(
                  "h-11 bg-background transition-all hover:border-primary/50 focus:ring-primary/20",
                  form.transactionType?.startsWith('loan_') && !form.creditAccount && "border-orange-300 ring-2 ring-orange-100"
                )}>
                  <SelectValue 
                    placeholder={form.transactionType === 'loan_received' ? "Select Loan Account (Create Liability)" : 
                                 form.transactionType === 'loan_repayment' ? "Select Bank Account (Cash Paid)" :
                                 form.transactionType === 'loan_interest' ? "Select Bank Account (Cash Paid)" :
                                 "Select credit account"} 
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {creditAccounts.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No accounts available for this transaction type
                    </div>
                  ) : (
                    creditAccounts.map(acc => (
                      <SelectItem key={(acc as any).id ?? (acc as any).account_id} value={(acc as any).id ?? (acc as any).account_id} className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium border">{acc.account_code}</span>
                          <span className="font-medium">{acc.account_name}</span>
                          <span className="text-xs text-muted-foreground/70">[{acc.account_type}]</span>
                          {form.transactionType === 'loan_received' && (acc.account_code === '2300' || acc.account_code === '2400') && (
                            <Badge variant="secondary" className="text-[10px] ml-auto bg-purple-100 text-purple-700 hover:bg-purple-200">🏦 Loan Payable</Badge>
                          )}
                          {form.transactionType === 'loan_repayment' && acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank') && (
                            <Badge variant="secondary" className="text-[10px] ml-auto bg-red-100 text-red-700 hover:bg-red-200">💸 Bank Account</Badge>
                          )}
                          {form.transactionType === 'loan_interest' && acc.account_type === 'asset' && acc.account_name.toLowerCase().includes('bank') && (
                            <Badge variant="secondary" className="text-[10px] ml-auto bg-red-100 text-red-700 hover:bg-red-200">💸 Bank Account</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <Label className="font-semibold text-foreground/80">Amount (excl. VAT) <span className="text-red-500">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">R</span>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  className="pl-7 h-11 font-mono text-lg transition-all focus:ring-2 focus:ring-primary/20 hover:border-primary/50"
                />
              </div>
            </div>
            {form.transactionType?.startsWith('loan_') ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Interest Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.interestRate}
                    onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                    placeholder="e.g. 10"
                    className="h-11"
                  />
                </div>
                {form.transactionType === 'loan_received' && (
                  <div className="space-y-1.5">
                    <Label>Term (months)</Label>
                    <Input
                      type="number"
                      step="1"
                      value={form.loanTerm}
                      onChange={(e) => setForm({ ...form, loanTerm: e.target.value })}
                      placeholder="e.g. 12"
                      className="h-11"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="font-semibold text-foreground/80">VAT Rate (%)</Label>
                <div className="relative">
                  <Select 
                    value={!isVatRegistered ? "0" : form.vatRate} 
                    onValueChange={(val) => setForm({ ...form, vatRate: val })}
                    disabled={!isVatRegistered}
                  >
                    <SelectTrigger className={cn(
                      "h-11 bg-background transition-all hover:border-primary/50 focus:ring-primary/20",
                      !isVatRegistered && "bg-muted text-muted-foreground opacity-70"
                    )}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (No VAT)</SelectItem>
                      <SelectItem value="15">15% (Standard)</SelectItem>
                    </SelectContent>
                  </Select>
                  {!isVatRegistered && (
                    <div className="absolute inset-y-0 right-8 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
                {['expense','purchase','product_purchase'].includes(String(form.transactionType).toLowerCase()) && (
                  <div className={cn(
                    "mt-2 flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-transparent transition-colors",
                    !isVatRegistered ? "opacity-50 cursor-not-allowed" : "hover:border-border/50"
                  )}>
                    <Switch 
                      checked={form.amountIncludesVat} 
                      onCheckedChange={(val) => setForm({ ...form, amountIncludesVat: val })} 
                      disabled={!isVatRegistered}
                    />
                    <span 
                      className="text-sm font-medium text-muted-foreground cursor-pointer" 
                      onClick={() => isVatRegistered && setForm({ ...form, amountIncludesVat: !form.amountIncludesVat })}
                    >
                      Amount includes VAT
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {form.amount && !form.transactionType?.startsWith('loan_') && (
            <div className="p-5 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/10 shadow-sm animate-in zoom-in-95 duration-300">
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">{['expense','purchase','product_purchase'].includes(String(form.transactionType).toLowerCase()) && form.amountIncludesVat ? 'Base Amount (excl. VAT):' : 'Amount (excl. VAT):'}</span>
                <span className="font-mono font-medium">
                  {(() => {
                    const amt = parseFloat(form.amount || '0');
                    const rate = parseFloat(form.vatRate || '0');
                    const isPur = ['expense','purchase','product_purchase'].includes(String(form.transactionType).toLowerCase());
                    if (isPur && form.amountIncludesVat && rate > 0) {
                      const base = amt / (1 + rate/100);
                      return `R ${base.toFixed(2)}`;
                    }
                    return `R ${amt.toFixed(2)}`;
                  })()}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-2 items-center">
                <span className="text-muted-foreground">VAT ({form.vatRate}%):</span>
                <span className="font-mono font-medium text-primary/80">
                  {(() => {
                    const amt = parseFloat(form.amount || '0');
                    const rate = parseFloat(form.vatRate || '0');
                    const isPur = ['expense','purchase','product_purchase'].includes(String(form.transactionType).toLowerCase());
                    if (isPur && form.amountIncludesVat && rate > 0) {
                      const base = amt / (1 + rate/100);
                      const vat = amt - base;
                      return `R ${vat.toFixed(2)}`;
                    }
                    const vat = amt * rate / 100;
                    return `R ${vat.toFixed(2)}`;
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-primary/20">
                <span className="font-bold text-foreground">Total (Posted Amount):</span>
                <span className="font-mono text-xl font-bold text-primary">
                  {(() => {
                    const amt = parseFloat(form.amount || '0');
                    const rate = parseFloat(form.vatRate || '0');
                    const isPur = ['expense','purchase','product_purchase'].includes(String(form.transactionType).toLowerCase());
                    if (isPur && form.amountIncludesVat && rate > 0) {
                      return `R ${amt.toFixed(2)}`;
                    }
                    const total = amt * (1 + rate/100);
                    return `R ${total.toFixed(2)}`;
                  })()}
                </span>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground p-4 bg-muted/30 rounded-xl border border-border/50">
            <p className="font-semibold mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              Double-Entry & Bank Balance:
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-1">
              <li className="flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <span>Debit and Credit must be selected from valid account types</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <span>Both entries will post the same amount</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <span>Bank balance will be updated automatically (Dr = Add, Cr = Subtract)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-1 w-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <span>Transaction will update Trial Balance automatically</span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter className="p-6 pt-2 bg-muted/5">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-11 px-8 hover:bg-muted/80">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !form.bankAccount} className="h-11 px-8 gap-2 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-md hover:shadow-lg transition-all">
            {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Posting...</>) : "Post Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
