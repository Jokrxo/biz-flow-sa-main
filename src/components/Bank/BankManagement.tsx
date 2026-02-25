import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Loader2, Check, Search, ChevronDown, Settings, Filter, ArrowUpDown, FileText, Wallet, Building2, Link2, CreditCard, ArrowRightLeft, CheckCircle2, Upload, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import Papa from 'papaparse';
import { ConnectBank } from "./ConnectBank";
import { BankReconciliation } from "./BankReconciliation";
import { BankStatementView } from "./BankStatementView";
import { BankReportDialog } from "./BankReportDialog";
import { ReconciledReportDialog } from "./ReconciledReportDialog";
import { validateTransactionDate } from "@/lib/transactions-api";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";

const bankOptions = [
  { value: "ABSA", label: "ABSA Bank", branchCode: "632005" },
  { value: "FNB", label: "First National Bank", branchCode: "250655" },
  { value: "Standard Bank", label: "Standard Bank", branchCode: "051001" },
  { value: "Nedbank", label: "Nedbank", branchCode: "198765" },
  { value: "Capitec", label: "Capitec Bank", branchCode: "470010" },
  { value: "Investec", label: "Investec Bank", branchCode: "580105" },
  { value: "Discovery Bank", label: "Discovery Bank", branchCode: "679000" },
  { value: "TymeBank", label: "TymeBank", branchCode: "678910" },
  { value: "African Bank", label: "African Bank", branchCode: "430000" },
  { value: "Bidvest Bank", label: "Bidvest Bank", branchCode: "462005" },
  { value: "Sasfin Bank", label: "Sasfin Bank", branchCode: "683000" },
  { value: "Mercantile Bank", label: "Mercantile Bank", branchCode: "450905" }
];

interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  opening_balance: number;
  current_balance: number;
  created_at: string;
}

export const BankManagement = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [open, setOpen] = useState(false);
  const [addMode, setAddMode] = useState<'bank' | 'petty_cash'>('bank');
  const [connectBankOpen, setConnectBankOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selectedBankForStatement, setSelectedBankForStatement] = useState<BankAccount | null>(null);
  const [isStatementDialogOpen, setIsStatementDialogOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isReconciledReportOpen, setIsReconciledReportOpen] = useState(false);
  const [form, setForm] = useState({
    account_name: "",
    account_number: "",
    bank_name: "",
    opening_balance: "",
    opening_balance_date: new Date().toISOString().slice(0,10)
  });
  const [sourceBankId, setSourceBankId] = useState<string>("");
  const [branchCode, setBranchCode] = useState<string>("");
  const [inflows, setInflows] = useState(0);
  const [outflows, setOutflows] = useState(0);

  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(1);

  const totalHelpSteps = 10;

  const nextHelpStep = () => {
    setHelpStep((prev) => (prev < totalHelpSteps ? prev + 1 : prev));
  };

  const prevHelpStep = () => {
    setHelpStep((prev) => (prev > 1 ? prev - 1 : prev));
  };

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    date: new Date().toISOString().slice(0,10),
    description: "",
    reference: ""
  });

  // Import State
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);

  const createBankAndTransaction = async (
    user: any,
    profile: any,
    accountName: string,
    accountNumber: string,
    bankName: string,
    openingBalance: number,
    openingDate: string,
    mode: 'bank' | 'petty_cash',
    sourceBankIdVal?: string
  ) => {
    // Prepare Bank Data
    const bankData = {
        company_id: profile.company_id,
        account_name: accountName,
        account_number: mode === 'bank' ? accountNumber : `PC-${Math.floor(Math.random() * 1000000)}`,
        bank_name: mode === 'bank' ? bankName : "Petty Cash",
        opening_balance: 0,
        current_balance: 0
    };

    // Insert bank with zero balances to avoid DB triggers posting with missing account ids
    const { data: insertedBank, error: bankErr } = await supabase
      .from("bank_accounts")
      .insert(bankData)
      .select("id, company_id, account_name")
      .single();

    if (bankErr) throw bankErr;

    // If opening balance provided, create transaction
    if (openingBalance !== 0 && insertedBank?.id) {
      // Try to find Ledger Accounts
      const { data: accountsList } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("company_id", profile.company_id)
        .eq("is_active", true)
        .order("account_code");

      const findAccountBy = (type: string, nameIncludes: string) =>
        (accountsList || []).find(a => a.account_type.toLowerCase() === type.toLowerCase() && (a.account_name || '').toLowerCase().includes(nameIncludes));

      let debitLedger = null;
      let creditLedger = null;

      // Helper to find or create account
      const findOrCreateAccount = async (prefix: string, name: string, type: string) => {
           const codes = (accountsList || [])
              .map(a => parseInt(a.account_code, 10))
              .filter(n => !isNaN(n));
           const base = parseInt(prefix, 10);
           let code = base;
           while (codes.includes(code)) code += 1;
           
           const { data: newAcc, error: createErr } = await supabase
              .from("chart_of_accounts")
              .insert({
                company_id: profile.company_id,
                account_code: String(code),
                account_name: name,
                account_type: type,
                is_active: true,
              })
              .select("id, account_code, account_name, account_type")
              .single();
           if (createErr) throw createErr;
           return newAcc;
      };

      // 1. Determine Debit Account (The New Account)
      if (mode === 'bank') {
           debitLedger = findAccountBy('Asset', 'bank') || findAccountBy('Asset', 'cash');
           if (!debitLedger) {
               debitLedger = await findOrCreateAccount('1100', `Bank - ${accountName}`, 'asset');
           }
      } else {
           debitLedger = await findOrCreateAccount('1150', `Petty Cash - ${accountName}`, 'asset');
      }

      // 2. Determine Credit Account (Source of Funds)
      if (mode === 'bank') {
          // Opening Equity
          creditLedger = (accountsList || []).find(a => a.account_type.toLowerCase() === 'equity' && (a.account_name || '').toLowerCase().includes('opening'));
          if (!creditLedger) {
              creditLedger = await findOrCreateAccount('3900', 'Opening Balance Equity', 'equity');
          }
      } else {
          const sourceBank = banks.find(b => b.id === sourceBankIdVal);
          if (!sourceBank) throw new Error("Source bank not found");
          
          creditLedger = (accountsList || []).find(a => a.account_name === `Bank - ${sourceBank.account_name}`);
          if (!creditLedger) {
               creditLedger = findAccountBy('Asset', 'bank') || findAccountBy('Asset', 'cash');
               if (!creditLedger) throw new Error("Could not find ledger account for source bank.");
          }
      }

      await validateTransactionDate(profile.company_id, openingDate);

      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          company_id: profile.company_id,
          user_id: user?.id || '',
          transaction_date: openingDate,
          description: mode === 'bank' ? `Opening balance for ${accountName}` : `Petty Cash funding from ${mode === 'petty_cash' ? banks.find(b => b.id === sourceBankIdVal)?.account_name : ''}`,
          reference_number: null,
          total_amount: openingBalance,
          bank_account_id: insertedBank.id,
          transaction_type: mode === 'bank' ? 'equity' : 'transfer',
          status: 'pending'
        })
        .select("id")
        .single();
      if (txErr) throw txErr;

      const entries = [
        { transaction_id: tx.id, account_id: debitLedger.id, debit: openingBalance > 0 ? openingBalance : 0, credit: openingBalance < 0 ? Math.abs(openingBalance) : 0, description: 'Opening balance / Funding', status: 'approved' },
        { transaction_id: tx.id, account_id: creditLedger.id, debit: openingBalance < 0 ? Math.abs(openingBalance) : 0, credit: openingBalance > 0 ? openingBalance : 0, description: 'Opening balance / Funding', status: 'approved' },
      ];
      const { error: teErr } = await supabase.from("transaction_entries").insert(entries);
      if (teErr) throw teErr;

      const ledgerEntries = entries.map((e) => ({
        company_id: profile.company_id,
        account_id: e.account_id,
        debit: e.debit,
        credit: e.credit,
        entry_date: openingDate,
        is_reversed: false,
        reference_id: tx.id,
        transaction_id: tx.id,
        description: e.description,
      }));
      const { error: leErr } = await supabase.from('ledger_entries').insert(ledgerEntries as any);
      if (leErr) throw leErr;

      await supabase.from('transactions').update({ status: 'approved' }).eq('id', tx.id);

      await supabase.rpc('update_bank_balance', { _bank_account_id: insertedBank.id, _amount: openingBalance, _operation: 'add' });
      await supabase.from('bank_accounts').update({ opening_balance: openingBalance, current_balance: openingBalance }).eq('id', insertedBank.id);

      if (mode === 'petty_cash' && sourceBankIdVal) {
          await supabase.rpc('update_bank_balance', { _bank_account_id: sourceBankIdVal, _amount: openingBalance, _operation: 'subtract' });
      }
    }
    return insertedBank;
  };

  const handleImportBanks = async () => {
    if (!importFile) {
      toast({ title: "Error", description: "Please select a file", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    setImportLogs([]);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const text = await importFile.text();
      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      const rows = result.data as any[];

      if (rows.length === 0) {
        throw new Error("No data found in file");
      }

      setImportLogs(prev => [...prev, `Found ${rows.length} rows. Starting import...`]);

      let successCount = 0;
      let errorCount = 0;

      for (const row of rows) {
        // Map fields: Name,Bank Name,Account Number,Branch Name,Branch Code,Balance,Active,Default
        const accountName = row['Name'] || row['Account Name'] || row['account_name'];
        const bankName = row['Bank Name'] || row['Bank'] || row['bank_name'];
        const accountNumber = row['Account Number'] || row['Account No'] || row['account_number'];
        // Remove 'R' or spaces from balance
        const balanceStr = String(row['Balance'] || row['Opening Balance'] || '0').replace(/[^0-9.-]/g, '');
        const openingBalance = parseFloat(balanceStr) || 0;
        
        if (!accountName || !bankName || !accountNumber) {
           setImportLogs(prev => [...prev, `Skipping row: Missing required fields (Name, Bank Name, Account Number)`]);
           errorCount++;
           continue;
        }

        try {
           await createBankAndTransaction(
             user, 
             profile, 
             accountName, 
             String(accountNumber), 
             bankName, 
             openingBalance, 
             new Date().toISOString().slice(0,10), 
             'bank'
           );
           setImportLogs(prev => [...prev, `Success: ${accountName}`]);
           successCount++;
        } catch (err: any) {
           console.error(err);
           setImportLogs(prev => [...prev, `Error importing ${accountName}: ${err.message}`]);
           errorCount++;
        }
      }

      toast({ 
        title: "Import Completed", 
        description: `Successfully imported ${successCount} banks. ${errorCount} errors.`,
        variant: successCount > 0 ? "default" : "destructive"
      });
      
      if (successCount > 0) {
        loadBanks();
        loadMonthlyFlows();
        setTimeout(() => {
           setImportOpen(false);
           setImportFile(null);
           setImportLogs([]);
        }, 2000);
      }

    } catch (error: any) {
      toast({ title: "Import Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    loadBanks();
    loadMonthlyFlows();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('bank-management-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_accounts' }, () => { loadBanks(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { loadMonthlyFlows(); loadBanks(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadMonthlyFlows = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return;

      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
      const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString();

      const { data, error } = await supabase
        .from('transactions')
        .select('total_amount')
        .eq('company_id', profile.company_id)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate);

      if (error) throw error;

      let currentInflows = 0;
      let currentOutflows = 0;

      data.forEach(tx => {
        if (tx.total_amount > 0) {
          currentInflows += tx.total_amount;
        } else {
          currentOutflows += Math.abs(tx.total_amount);
        }
      });

      setInflows(currentInflows);
      setOutflows(currentOutflows);

    } catch (error: any) {
      toast({ title: "Error loading monthly flows", description: error.message, variant: "destructive" });
    }
  };

  const loadBanks = async () => {
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

      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBanks(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (!form.account_name) {
        toast({ title: "Missing fields", description: "Please enter an account name", variant: "destructive" });
        return;
      }

      if (addMode === 'bank') {
        if (!form.account_number || !form.bank_name) {
           toast({ title: "Missing fields", description: "Please fill all required fields", variant: "destructive" });
           return;
        }
        const { isValidBankAccountNumber } = await import("@/lib/validators");
        if (!isValidBankAccountNumber(form.account_number)) {
          toast({ title: "Invalid account number", description: "Bank account number must be 10–20 digits", variant: "destructive" });
          return;
        }
      } else {
        // Petty Cash validation
        if (parseFloat(form.opening_balance) > 0 && !sourceBankId) {
            toast({ title: "Source Bank Required", description: "Please select a source bank to fund the petty cash.", variant: "destructive" });
            return;
        }
      }

      setIsSubmitting(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const openingBalance = parseFloat(form.opening_balance || "0");
      const openingDate = String(form.opening_balance_date || new Date().toISOString().slice(0,10));

      if (isDateLocked(openingDate)) {
        setOpen(false);
        setIsLockDialogOpen(true);
        return;
      }

      // Prepare Bank Data and Create
      await createBankAndTransaction(
          user,
          profile,
          form.account_name,
          form.account_number,
          form.bank_name,
          openingBalance,
          openingDate,
          addMode,
          sourceBankId
      );

      setIsSubmitting(false);
      setIsSuccess(true);
      
      setTimeout(() => {
        setOpen(false);
        setIsSuccess(false);
        setForm({ account_name: "", account_number: "", bank_name: "", opening_balance: "", opening_balance_date: new Date().toISOString().slice(0,10) });
        setSourceBankId("");
        setAddMode('bank');
        loadBanks();
        navigate('/transactions');
      }, 2000);
      
    } catch (error: any) {
      setIsSubmitting(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleTransfer = async () => {
    try {
      setIsSubmitting(true);
      const { fromAccountId, toAccountId, amount, date, description, reference } = transferForm;
      const transferAmount = parseFloat(amount);

      if (!fromAccountId || !toAccountId || !amount || !date) {
        throw new Error("Please fill in all required fields");
      }
      if (fromAccountId === toAccountId) {
        throw new Error("Cannot transfer to the same account");
      }
      if (transferAmount <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
        
      if (!profile) return;
      
      await validateTransactionDate(profile.company_id, date);

      const sourceBank = banks.find(b => b.id === fromAccountId);
      const destBank = banks.find(b => b.id === toAccountId);
      
      if (!sourceBank || !destBank) throw new Error("Bank account not found");

      // Fetch Chart of Accounts to find Ledgers
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .eq("company_id", profile.company_id);
        
      if (!accounts) throw new Error("Could not fetch accounts");

      // Helper to find account
      const findAccount = (namePart: string) => accounts.find(a => a.account_name.toLowerCase().includes(namePart.toLowerCase()));
      
      // Find Source Ledger
      let sourceLedger = accounts.find(a => a.account_name === `Bank - ${sourceBank.account_name}`) || 
                         accounts.find(a => a.account_name.includes(sourceBank.account_name)) ||
                         findAccount('Bank');
                         
      // Find Dest Ledger
      let destLedger = accounts.find(a => a.account_name === `Bank - ${destBank.account_name}`) || 
                       accounts.find(a => a.account_name.includes(destBank.account_name)) ||
                       findAccount('Bank');
                       
      if (!sourceLedger || !destLedger) throw new Error("Could not find ledger accounts for banks");

      // Find/Create Clearing Account
      let clearingAccount = accounts.find(a => a.account_name === 'Bank Transfer Clearing');
      if (!clearingAccount) {
         // Create it
         const { data: newAcc, error } = await supabase.from('chart_of_accounts').insert({
            company_id: profile.company_id,
            account_code: '9999',
            account_name: 'Bank Transfer Clearing',
            account_type: 'asset',
            is_active: true
         }).select().single();
         if (error) throw error;
         clearingAccount = newAcc;
      }

      // 1. Outbound Transaction
      const { data: txOut, error: txOutErr } = await supabase.from('transactions').insert({
          company_id: profile.company_id,
          user_id: user.id,
          transaction_date: date,
          description: description || `Transfer to ${destBank.account_name}`,
          reference_number: reference,
          total_amount: -transferAmount,
          bank_account_id: fromAccountId,
          transaction_type: 'transfer_out',
          status: 'pending'
      }).select().single();
      if (txOutErr) throw txOutErr;

      // Entries Outbound
      const entriesOut = [
          { transaction_id: txOut.id, account_id: clearingAccount.id, debit: transferAmount, credit: 0, description: 'Transfer Out', status: 'approved' },
          { transaction_id: txOut.id, account_id: sourceLedger.id, debit: 0, credit: transferAmount, description: 'Transfer Out', status: 'approved' }
      ];
      await supabase.from('transaction_entries').insert(entriesOut);
      
      // Ledger Entries Outbound
       const ledgerEntriesOut = entriesOut.map((e) => ({
          company_id: profile.company_id,
          account_id: e.account_id,
          debit: e.debit,
          credit: e.credit,
          entry_date: date,
          is_reversed: false,
          reference_id: txOut.id,
          transaction_id: txOut.id,
          description: e.description,
        }));
        await supabase.from('ledger_entries').insert(ledgerEntriesOut);
        
        // Update status to approved
        await supabase.from('transactions').update({ status: 'approved' }).eq('id', txOut.id);


      // 2. Inbound Transaction
      const { data: txIn, error: txInErr } = await supabase.from('transactions').insert({
          company_id: profile.company_id,
          user_id: user.id,
          transaction_date: date,
          description: description || `Transfer from ${sourceBank.account_name}`,
          reference_number: reference,
          total_amount: transferAmount,
          bank_account_id: toAccountId,
          transaction_type: 'transfer_in',
          status: 'pending'
      }).select().single();
      if (txInErr) throw txInErr;

      // Entries Inbound
      const entriesIn = [
          { transaction_id: txIn.id, account_id: destLedger.id, debit: transferAmount, credit: 0, description: 'Transfer In', status: 'approved' },
          { transaction_id: txIn.id, account_id: clearingAccount.id, debit: 0, credit: transferAmount, description: 'Transfer In', status: 'approved' }
      ];
      await supabase.from('transaction_entries').insert(entriesIn);
      
      // Ledger Entries Inbound
       const ledgerEntriesIn = entriesIn.map((e) => ({
          company_id: profile.company_id,
          account_id: e.account_id,
          debit: e.debit,
          credit: e.credit,
          entry_date: date,
          is_reversed: false,
          reference_id: txIn.id,
          transaction_id: txIn.id,
          description: e.description,
        }));
        await supabase.from('ledger_entries').insert(ledgerEntriesIn);

        // Update status to approved
        await supabase.from('transactions').update({ status: 'approved' }).eq('id', txIn.id);

      // Update Balances
      await supabase.rpc('update_bank_balance', { _bank_account_id: fromAccountId, _amount: transferAmount, _operation: 'subtract' });
      await supabase.rpc('update_bank_balance', { _bank_account_id: toAccountId, _amount: transferAmount, _operation: 'add' });
      
      toast({ title: "Success", description: "Transfer completed successfully" });
      setTransferOpen(false);
      setTransferForm({
        fromAccountId: "",
        toAccountId: "",
        amount: "",
        date: new Date().toISOString().slice(0,10),
        description: "",
        reference: ""
      });
      loadBanks();
      loadMonthlyFlows();
      
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getBranchCode = (bankName: string) => {
    return bankOptions.find(b => b.value === bankName)?.branchCode || "";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-800">List of Banks and Credit Cards</h1>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 text-xs"
            aria-label="Bank module help"
            onClick={() => setHelpOpen(true)}
          >
            !
          </button>
        </div>

        <Dialog
          open={helpOpen}
          onOpenChange={(open) => {
            setHelpOpen(open);
            if (!open) setHelpStep(1);
          }}
        >
          <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <DialogTitle>How to use the Add Bank module</DialogTitle>
                <div className="flex items-center gap-2">
                  <img
                    src="/logo.png"
                    alt="System logo"
                    className="h-7 w-auto rounded-sm shadow-sm"
                  />
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 text-sm text-muted-foreground">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Step {helpStep} of {totalHelpSteps}
                </span>
                <div className="flex gap-1">
                  {Array.from({ length: totalHelpSteps }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-4 rounded-full ${i + 1 === helpStep ? "bg-blue-600" : "bg-slate-200"}`}
                    />
                  ))}
                </div>
              </div>

              {helpStep === 1 && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                        Overview
                      </div>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Add bank accounts and petty cash used across your business.</li>
                        <li>Import existing bank accounts from CSV files.</li>
                        <li>Connect to bank feeds, view statements and reconcile balances.</li>
                        <li>Use transfers to move money between accounts and keep records neat.</li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-white p-3 shadow-sm">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Layout (preview)
                      </div>
                      <div className="space-y-2 text-[10px]">
                        <div className="h-6 rounded bg-slate-100 flex items-center px-2 text-slate-500">
                          List of Banks and Credit Cards
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-1">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[9px] text-slate-500">
                              !
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Tutorial
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full border text-slate-700 bg-white text-[10px]">
                            Add a Bank or Credit Card ▾
                          </span>
                        </div>
                        <div className="h-12 rounded bg-slate-50 border border-dashed flex items-center justify-center mt-2">
                          Bank accounts table and quick actions
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpStep === 2 && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Add Bank vs Add Petty Cash
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <ul className="list-disc list-inside space-y-1">
                        <li>Use <span className="font-semibold">Add Bank Account</span> for real bank and credit card accounts.</li>
                        <li>Use <span className="font-semibold">Add Petty Cash</span> for small cash on hand in the office.</li>
                        <li>Both options create proper accounting entries behind the scenes.</li>
                        <li>You can also import banks via CSV or set up transfers from this same menu.</li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Add menu (preview)
                      </div>
                      <div className="space-y-1">
                        <div className="px-2 py-1 rounded border bg-slate-50 flex items-center justify-between">
                          <span>Add Bank Account</span>
                          <span className="text-slate-400">Bank</span>
                        </div>
                        <div className="px-2 py-1 rounded border bg-slate-50 flex items-center justify-between">
                          <span>Add Petty Cash</span>
                          <span className="text-slate-400">Cash</span>
                        </div>
                        <div className="px-2 py-1 rounded border bg-slate-50 flex items-center justify-between">
                          <span>Import Banks (CSV)</span>
                          <span className="text-slate-400">Bulk</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpStep === 3 && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Bank account details
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <ul className="list-disc list-inside space-y-1">
                        <li><span className="font-semibold">Account Name</span> is how you will see the bank in reports.</li>
                        <li>Select your bank from the list to auto-fill the correct branch code.</li>
                        <li>Enter the real account number so you can match statements later.</li>
                        <li>For credit cards, you can still capture them under the same Add Bank flow.</li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Add bank form (preview)
                      </div>
                      <div className="space-y-2">
                        <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                          Account Name: Business Cheque Account
                        </div>
                        <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                          Bank: ABSA • Branch Code: 632005
                        </div>
                        <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                          Account Number: 62123456789
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpStep === 4 && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Opening balance and date (accounting effect)
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <ul className="list-disc list-inside space-y-1">
                        <li>Use the opening balance to tell the system how much is in the account on day one.</li>
                        <li>For bank accounts, the system posts against an Opening Balance Equity account.</li>
                        <li>For petty cash, the opening amount is funded from another bank account.</li>
                        <li>Choose the correct opening date so your statements and ledger match.</li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Opening balance (preview)
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>Opening Balance</span>
                          <span className="font-mono">R 10 000.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Opening Date</span>
                          <span className="font-mono">2026-03-01</span>
                        </div>
                        <div className="border-t pt-1 mt-1 text-[10px] text-slate-500">
                          Accounting: DR Bank, CR Opening Balance Equity
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpStep === 5 && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Petty cash setup and source bank
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <ul className="list-disc list-inside space-y-1">
                        <li>When you set up petty cash, you also choose which bank funded it.</li>
                        <li>The system automatically creates a withdrawal from the selected bank.</li>
                        <li>This keeps your cash and bank balances aligned without manual journals.</li>
                        <li>Use petty cash for small day-to-day expenses instead of mixing with main bank.</li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Petty cash (preview)
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>Initial Cash</span>
                          <span className="font-mono">R 2 000.00</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Source Bank</span>
                          <span className="font-mono">Business Cheque</span>
                        </div>
                        <div className="border-t pt-1 mt-1 text-[10px] text-slate-500">
                          Accounting: DR Petty Cash, CR Bank
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpStep === 6 && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Import Banks from CSV
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <ul className="list-disc list-inside space-y-1">
                        <li>Use Import Banks (CSV) to add multiple accounts in one go.</li>
                        <li>Required headers: Name, Bank Name, Account Number.</li>
                        <li>Optional: Balance for opening balance amounts.</li>
                        <li>After import, the system creates banks and opening balance entries automatically.</li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Import (preview)
                      </div>
                      <div className="space-y-2">
                        <div className="h-14 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Drag & drop CSV area
                        </div>
                        <div className="bg-slate-50 rounded px-2 py-1 text-[10px]">
                          Example headers: Name, Bank Name, Account Number, Balance
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpStep === 7 && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Connect Bank and statements
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <ul className="list-disc list-inside space-y-1">
                        <li>Use Connect Bank to link to online bank feeds where available.</li>
                        <li>Fetched transactions can be reviewed and matched from the bank screen.</li>
                        <li>Alternatively, you can upload statements and view them in the statement viewer.</li>
                        <li>This keeps manual capturing to a minimum.</li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Bank connection (preview)
                      </div>
                      <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                        Connect Bank button and statement view
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpStep === 8 && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Bank transfers between accounts
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <ul className="list-disc list-inside space-y-1">
                        <li>Use Bank Transfer when moving money between two bank accounts.</li>
                        <li>Select From and To accounts, then enter amount, date and reference.</li>
                        <li>The system creates both sides of the transfer and updates balances.</li>
                        <li>This keeps your bank ledger clean and prevents double-capturing.</li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Transfer (preview)
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>From</span>
                          <span className="font-mono">Cheque</span>
                        </div>
                        <div className="flex justify-between">
                          <span>To</span>
                          <span className="font-mono">Savings</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Amount</span>
                          <span className="font-mono">R 3 000.00</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpStep === 9 && (
                <div className="space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Bank list, reconciliation and reports
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <ul className="list-disc list-inside space-y-1">
                        <li>The main table shows all banks with current balances and status.</li>
                        <li>Use Reconcile Account to match bank statement lines to transactions.</li>
                        <li>Open Bank Report or Reconciled Report for summaries and audit support.</li>
                        <li>Deactivate old accounts once they are fully reconciled and closed.</li>
                      </ul>
                    </div>
                    <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Bank list (preview)
                      </div>
                      <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                        Table: Account Name, Bank, Current Balance, Actions (Reconcile, Report)
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {helpStep === 10 && (
                <div className="space-y-6">
                  <div className="flex flex-col items-center justify-center text-center space-y-3 py-4">
                    <img
                      src="/logo.png"
                      alt="System logo"
                      className="h-12 w-auto rounded-md shadow-sm mb-1"
                    />
                    <div className="text-lg font-semibold text-slate-900">
                      Thank you
                    </div>
                    <p className="max-w-md text-sm text-slate-600">
                      We hope this Add Bank tutorial helps you set up clean banking and petty cash records.
                      We look forward to supporting your cash and bank control over the next couple of years.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700 disabled:opacity-40"
                  onClick={prevHelpStep}
                  disabled={helpStep === 1}
                >
                  Previous
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700"
                    onClick={() => setHelpOpen(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-40"
                    onClick={helpStep === totalHelpSteps ? () => setHelpOpen(false) : nextHelpStep}
                  >
                    {helpStep === totalHelpSteps
                      ? "Close"
                      : helpStep === totalHelpSteps - 1
                      ? "Finish"
                      : "Next"}
                  </button>
                </div>
              </div>
              <div className="mt-3 text-[10px] text-slate-400 text-right">
                stella-lumen
              </div>
            </div>
          </DialogContent>
        </Dialog>
        
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
          <Dialog open={open} onOpenChange={setOpen}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-[#0070ad] hover:bg-[#005a8b] text-white shadow-none rounded-md px-6 gap-2">
                  Add a Bank or Credit Card <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => { setAddMode('bank'); setOpen(true); }}>
                  <Building2 className="mr-2 h-4 w-4" /> Add Bank Account
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setAddMode('petty_cash'); setOpen(true); }}>
                  <Wallet className="mr-2 h-4 w-4" /> Add Petty Cash
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" /> Import Banks (CSV)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTransferOpen(true)}>
                  <ArrowRightLeft className="mr-2 h-4 w-4" /> Bank Transfer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConnectBankOpen(true)}>
                  <Link2 className="mr-2 h-4 w-4" /> Connect Bank
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              {isSubmitting ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-lg font-medium text-muted-foreground">Adding {addMode === 'bank' ? 'Bank Account' : 'Petty Cash'}...</p>
                </div>
              ) : isSuccess ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                    <Check className="h-10 w-10" />
                  </div>
                  <h2 className="text-xl font-bold text-center">Success!</h2>
                  <p className="text-center text-muted-foreground">YOU SUCCESSFULLY LOADED {addMode === 'bank' ? 'BANK' : 'PETTY CASH'}</p>
                </div>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {addMode === 'bank' ? (
                            <>
                                <Building2 className="h-5 w-5 text-blue-600" />
                                Add Bank or Credit Card
                            </>
                        ) : (
                            <>
                                <Wallet className="h-5 w-5 text-green-600" />
                                Add Petty Cash
                            </>
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {addMode === 'bank' 
                            ? "Enter your bank account details manually." 
                            : "Set up a petty cash account to track small office expenses."}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 py-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="account_name">Account Name *</Label>
                      <Input
                        id="account_name"
                        value={form.account_name}
                        onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                        placeholder={addMode === 'bank' ? "e.g. Business Cheque Account" : "e.g. Office Petty Cash"}
                        className="h-9"
                      />
                    </div>
                    
                    {addMode === 'bank' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-1.5">
                                <Label>Bank *</Label>
                                <Popover open={bankOpen} onOpenChange={setBankOpen} modal={true}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={bankOpen}
                                            className="w-full h-9 justify-between font-normal"
                                        >
                                            {form.bank_name
                                                ? bankOptions.find((b) => b.value === form.bank_name)?.label
                                                : "Select bank..."}
                                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[200]" align="start">
                                        <Command>
                                            <CommandInput placeholder="Search bank..." autoFocus={true} />
                                            <CommandList>
                                                <CommandEmpty>No bank found.</CommandEmpty>
                                                <CommandGroup>
                                                    {bankOptions.map((bank) => (
                                                        <CommandItem
                                                            key={bank.value}
                                                            value={`${bank.label} ${bank.value}`}
                                                            onSelect={() => {
                                                                setForm({ ...form, bank_name: bank.value });
                                                                setBranchCode(bank.branchCode);
                                                                setBankOpen(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mr-2 h-4 w-4",
                                                                    form.bank_name === bank.value ? "opacity-100" : "opacity-0"
                                                                )}
                                                            />
                                                            {bank.label}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            
                            {form.bank_name && (
                                <div className="grid gap-1.5">
                                <Label>Branch Code</Label>
                                <Input value={branchCode} readOnly className="bg-muted h-9" />
                                </div>
                            )}
                            </div>

                            <div className="grid gap-1.5">
                            <Label htmlFor="account_number">Account Number *</Label>
                            <Input
                                id="account_number"
                                value={form.account_number}
                                onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                                placeholder="e.g. 62123456789"
                                disabled={!form.bank_name}
                                className="font-mono h-9"
                            />
                            </div>
                        </>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label>{addMode === 'bank' ? 'Opening Balance' : 'Initial Cash Amount'}</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground text-xs">R</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={form.opening_balance}
                            onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
                            placeholder="0.00"
                            className="pl-7 h-9"
                          />
                        </div>
                      </div>
                      <div className="grid gap-1.5">
                        <Label>{addMode === 'bank' ? 'Opening Date' : 'Funding Date'}</Label>
                        <Input
                          type="date"
                          value={form.opening_balance_date}
                          onChange={(e) => setForm({ ...form, opening_balance_date: e.target.value })}
                          className="h-9"
                        />
                      </div>
                    </div>
                    
                    {addMode === 'petty_cash' && parseFloat(form.opening_balance) > 0 && (
                        <div className="grid gap-1.5">
                            <Label>Source Bank Account *</Label>
                            <Select value={sourceBankId} onValueChange={setSourceBankId}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Select bank to withdraw cash from" />
                                </SelectTrigger>
                                <SelectContent>
                                    {banks.filter(b => b.bank_name !== 'Petty Cash').map((b) => (
                                        <SelectItem key={b.id} value={b.id}>
                                            {b.account_name} ({b.bank_name}) - R{b.current_balance.toFixed(2)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">This will create a withdrawal from the selected bank.</p>
                        </div>
                    )}

                    {/* Visual Card Selector Moved to Footer Area */}
                     {addMode === 'bank' && (
                         <div className="pt-3 border-t mt-1">
                             <Label className="text-[10px] text-muted-foreground mb-2 block uppercase tracking-wider">Card Type Preview</Label>
                             <div className="flex gap-3">
                                 <div className="flex-1 p-2 border rounded-md bg-slate-50 flex flex-col items-center justify-center gap-1 text-center relative overflow-hidden group hover:border-blue-300 transition-all cursor-default">
                                     <div className="absolute top-0 right-0 p-0.5 bg-blue-100 rounded-bl-md">
                                         <Check className="h-2.5 w-2.5 text-blue-600" />
                                     </div>
                                     <Building2 className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                                     <span className="text-[9px] font-medium text-slate-600">Bank Account</span>
                                 </div>
                                 <div className="flex-1 p-2 border rounded-md bg-white flex flex-col items-center justify-center gap-1 text-center relative overflow-hidden group hover:border-blue-300 transition-all cursor-default opacity-60">
                                     <div className="flex gap-1.5 mb-0.5">
                                         {/* Small Visa Icon */}
                                         <div className="h-4 w-7 bg-slate-100 rounded border flex items-center justify-center shadow-sm">
                                             <span className="font-bold text-blue-800 italic text-[7px]" style={{ fontFamily: 'sans-serif' }}>VISA</span>
                                         </div>
                                         {/* Small Mastercard Icon */}
                                         <div className="h-4 w-7 bg-slate-100 rounded border flex items-center justify-center relative overflow-hidden shadow-sm">
                                             <div className="absolute left-1 w-2.5 h-2.5 bg-[#EB001B] rounded-full opacity-90 z-10"></div>
                                             <div className="absolute right-1 w-2.5 h-2.5 bg-[#F79E1B] rounded-full opacity-90"></div>
                                         </div>
                                     </div>
                                     <span className="text-[9px] font-medium text-slate-600">Credit Card</span>
                                 </div>
                             </div>
                         </div>
                     )}

                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit}>{addMode === 'bank' ? 'Add Account' : 'Create Petty Cash'}</Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
            <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="text-sm text-muted-foreground whitespace-nowrap">Search:</div>
                <div className="relative flex w-full sm:w-auto">
                    <Input className="w-full sm:w-[250px] h-9 pr-10 rounded-r-none border-r-0 focus-visible:ring-0" placeholder="Search" />
                    <Button size="icon" className="h-9 w-10 rounded-l-none bg-[#0070ad] hover:bg-[#005a8b]">
                        <Search className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="text-sm text-muted-foreground whitespace-nowrap">View:</div>
                <Select defaultValue="all">
                    <SelectTrigger className="w-full sm:w-[160px] h-9">
                        <SelectValue placeholder="All (No Filter)" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All (No Filter)</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            
            <div className="hidden sm:flex items-center gap-2 text-muted-foreground/30">|</div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="w-full sm:w-auto bg-[#0070ad] hover:bg-[#005a8b] text-white h-9 gap-2">
                  Quick Reports <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsReconciledReportOpen(true)}>
                  <FileText className="mr-2 h-4 w-4" /> Reconciled Report
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsReportOpen(true)}>
                  <FileText className="mr-2 h-4 w-4" /> Banking Reports
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSelectedBankForStatement(null);
                  setIsStatementDialogOpen(true);
                }}>
                  <FileText className="mr-2 h-4 w-4" /> Bank Statement
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
         <div className="flex items-center text-[#0070ad] hover:text-[#005a8b] cursor-pointer text-sm font-medium">
            <ArrowUpDown className="h-4 w-4 mr-1" /> Actions
         </div>
         <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground h-8 text-xs">
            Delete
         </Button>
      </div>

      <FinancialYearLockDialog 
        open={isLockDialogOpen} 
        onOpenChange={setIsLockDialogOpen} 
      />

      <BankStatementView 
        bankAccount={selectedBankForStatement} 
        isOpen={isStatementDialogOpen} 
        onClose={() => setIsStatementDialogOpen(false)} 
      />

      <BankReportDialog 
        isOpen={isReportOpen}
        onClose={setIsReportOpen}
      />

      <ReconciledReportDialog 
        isOpen={isReconciledReportOpen}
        onClose={setIsReconciledReportOpen}
        bankAccounts={banks}
      />

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Bank Transfer</DialogTitle>
            <DialogDescription>Transfer funds between your bank accounts</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             <div className="grid gap-2">
               <Label>From Account</Label>
               <Select value={transferForm.fromAccountId} onValueChange={(val) => setTransferForm({...transferForm, fromAccountId: val})}>
                 <SelectTrigger>
                   <SelectValue placeholder="Select source account" />
                 </SelectTrigger>
                 <SelectContent>
                   {banks.map(b => (
                     <SelectItem key={b.id} value={b.id}>{b.account_name} (R{b.current_balance.toFixed(2)})</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
             
             <div className="grid gap-2">
               <Label>To Account</Label>
               <Select value={transferForm.toAccountId} onValueChange={(val) => setTransferForm({...transferForm, toAccountId: val})}>
                 <SelectTrigger>
                   <SelectValue placeholder="Select destination account" />
                 </SelectTrigger>
                 <SelectContent>
                   {banks.filter(b => b.id !== transferForm.fromAccountId).map(b => (
                     <SelectItem key={b.id} value={b.id}>{b.account_name} (R{b.current_balance.toFixed(2)})</SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             </div>
             
             <div className="grid grid-cols-2 gap-4">
               <div className="grid gap-2">
                 <Label>Amount</Label>
                 <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground text-xs">R</span>
                    <Input 
                      type="number" 
                      step="0.01" 
                      className="pl-7" 
                      value={transferForm.amount} 
                      onChange={(e) => setTransferForm({...transferForm, amount: e.target.value})} 
                    />
                 </div>
               </div>
               <div className="grid gap-2">
                 <Label>Date</Label>
                 <Input 
                   type="date" 
                   value={transferForm.date} 
                   onChange={(e) => setTransferForm({...transferForm, date: e.target.value})} 
                 />
               </div>
             </div>
             
             <div className="grid gap-2">
               <Label>Reference</Label>
               <Input 
                 placeholder="e.g. TRF001" 
                 value={transferForm.reference} 
                 onChange={(e) => setTransferForm({...transferForm, reference: e.target.value})} 
               />
             </div>
             
             <div className="grid gap-2">
               <Label>Description</Label>
               <Input 
                 placeholder="Optional description" 
                 value={transferForm.description} 
                 onChange={(e) => setTransferForm({...transferForm, description: e.target.value})} 
               />
             </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button onClick={handleTransfer} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Transfer Funds
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-none border shadow-sm bg-white overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#0070ad]" />
            <p className="mt-4 text-sm text-muted-foreground">Loading accounts...</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[#535c69] hover:bg-[#535c69]">
              <TableRow className="hover:bg-[#535c69]">
                <TableHead className="w-[40px] text-white"><Checkbox className="border-white/50 data-[state=checked]:bg-[#0070ad] data-[state=checked]:border-[#0070ad]" /></TableHead>
                <TableHead className="text-white font-medium">Name <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-70" /></TableHead>
                <TableHead className="text-white font-medium">Bank Name</TableHead>
                <TableHead className="text-white font-medium">Account Number</TableHead>
                <TableHead className="text-white font-medium">Branch Name</TableHead>
                <TableHead className="text-white font-medium">Branch Code</TableHead>
                <TableHead className="text-white font-medium text-right">Balance</TableHead>
                <TableHead className="text-white font-medium text-center">Active</TableHead>
                <TableHead className="text-white font-medium text-center">Default</TableHead>
                <TableHead className="text-white font-medium text-right pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    No bank accounts found. Click "Add a Bank or Credit Card" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                banks.map((bank, index) => (
                  <TableRow key={bank.id} className="hover:bg-blue-50/50 transition-colors odd:bg-white even:bg-slate-50/50">
                    <TableCell><Checkbox /></TableCell>
                    <TableCell className="font-medium text-[#0070ad] cursor-pointer hover:underline">{bank.account_name}</TableCell>
                    <TableCell>{bank.bank_name}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{bank.account_number}</TableCell>
                    <TableCell className="text-slate-600">Main Branch</TableCell>
                    <TableCell className="text-slate-600">{getBranchCode(bank.bank_name)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      R {bank.current_balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                        <div className="flex justify-center">
                            <Checkbox checked={true} disabled />
                        </div>
                    </TableCell>
                    <TableCell className="text-center">
                        <div className="flex justify-center">
                             <Checkbox checked={index === 0} disabled />
                        </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 text-[#0070ad] font-medium hover:text-[#005a8b] hover:bg-blue-50">
                                Actions <ChevronDown className="ml-1 h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                    setSelectedBankForStatement(bank);
                                    setIsStatementDialogOpen(true);
                                }}>
                                    <FileText className="mr-2 h-4 w-4" /> Statement
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/bank-reconciliation?bankId=${bank.id}`)}>
                                    <CheckCircle2 className="mr-2 h-4 w-4" /> Reconcile Account
                                </DropdownMenuItem>
                                 <DropdownMenuItem>
                                    Edit Account Details
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600">
                                    Deactivate
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 select-none">
         <div className="flex items-center gap-1">
             <Button variant="outline" size="sm" className="h-8 bg-white" disabled>First</Button>
             <Button variant="default" size="sm" className="h-8 w-8 bg-[#0070ad] hover:bg-[#005a8b]">1</Button>
             <Button variant="outline" size="sm" className="h-8 bg-white" disabled>Last</Button>
         </div>
         <div className="text-sm text-slate-500">
            Display 1 - {banks.length} of {banks.length}
         </div>
      </div>

      <ConnectBank open={connectBankOpen} onOpenChange={setConnectBankOpen} />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Import Bank Accounts</DialogTitle>
            <DialogDescription>Upload a CSV file to import multiple bank accounts.</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors">
               <Upload className="h-8 w-8 text-slate-400 mb-2" />
               <p className="text-sm text-slate-600 mb-1">Drag and drop your CSV file here or click to browse</p>
               <Input 
                 type="file" 
                 accept=".csv" 
                 className="hidden" 
                 id="csv-upload"
                 onChange={(e) => setImportFile(e.target.files?.[0] || null)}
               />
               <Button variant="secondary" size="sm" onClick={() => document.getElementById('csv-upload')?.click()}>
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
               <p>Name, Bank Name, Account Number</p>
               <p className="font-medium mt-2">Optional Headers:</p>
               <p>Balance (Opening Balance)</p>
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
            <Button onClick={handleImportBanks} disabled={!importFile || isImporting}>
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              {isImporting ? 'Importing...' : 'Start Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
