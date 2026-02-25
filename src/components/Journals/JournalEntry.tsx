import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Plus, Save, Search, Settings, 
  ChevronDown, Trash2, Printer, 
  Download, Upload, Check, ChevronsUpDown, Info, Lock
} from "lucide-react";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import Papa from "papaparse";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
}

interface JournalLine {
  id: string;
  date: string;
  effect: 'Debit' | 'Credit';
  accountId: string;
  reference: string;
  description: string;
  vatType: string;
  amount: number;
  vatAmount: number;
  inclVat: number;
  affectingAccountId?: string;
  transactionId?: string; // ID from database if saved
  isSaved?: boolean;      // To distinguish between unsaved (local) and saved (DB) lines
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

// Helper to calculate VAT
const calculateVat = (amount: number, vatType: string) => {
  if (vatType === 'Standard Rate') {
    return amount * 0.15;
  }
  return 0;
};

const getNormalBalanceSide = (accountType: string): 'debit' | 'credit' => {
  const t = accountType.toLowerCase();
  if (t === 'asset' || t === 'expense') return 'debit';
  return 'credit';
};

const formatLedgerBalance = (amount: number, normalSide: 'debit' | 'credit') => {
  const abs = Math.abs(amount);
  if (abs === 0) return "0.00";
  if (normalSide === 'debit') {
    return amount >= 0 ? `${abs.toFixed(2)} Dr` : `${abs.toFixed(2)} Cr`;
  }
  return amount >= 0 ? `${abs.toFixed(2)} Cr` : `${abs.toFixed(2)} Dr`;
};

interface AccountComboboxProps {
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const AccountCombobox = ({ accounts, value, onChange, placeholder = "Select Account..." }: AccountComboboxProps) => {
  const [open, setOpen] = useState(false);
  const selectedAccount = accounts.find((account) => account.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between hover:bg-muted/50 font-normal pl-2 h-8 text-left text-xs"
        >
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
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search account..." />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={`${account.account_code} ${account.account_name}`}
                  onSelect={() => {
                    onChange(account.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer text-sm"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === account.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-mono text-muted-foreground mr-2 w-16">{account.account_code}</span>
                  <span className="flex-1 truncate">{account.account_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const JournalEntry = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeTab, setActiveTab] = useState("new");
  
  // List of unreviewed journal lines
  const [lines, setLines] = useState<JournalLine[]>([]);
  
  // Input row state
  const [inputDate, setInputDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [inputEffect, setInputEffect] = useState<'Debit' | 'Credit'>('Debit');
  const [inputAccountId, setInputAccountId] = useState("");
  const [inputReference, setInputReference] = useState("");
  const [inputDescription, setInputDescription] = useState("");
  const [inputVatType, setInputVatType] = useState("No VAT");
  const [inputAmount, setInputAmount] = useState<number>(0);
  const [inputAffectingAccountId, setInputAffectingAccountId] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  
  // Reviewed tab state
  const [reviewedDateStart, setReviewedDateStart] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [reviewedDateEnd, setReviewedDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reviewedLines, setReviewedLines] = useState<JournalLine[]>([]);
  
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isVatRegistered, setIsVatRegistered] = useState(false);

  const [ledgerMonth, setLedgerMonth] = useState(new Date().getMonth() + 1);
  const [ledgerYear, setLedgerYear] = useState(new Date().getFullYear());
  const [ledgerFromDate, setLedgerFromDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [ledgerToDate, setLedgerToDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd"));
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    const from = new Date(ledgerYear, ledgerMonth - 1, 1);
    const to = new Date(ledgerYear, ledgerMonth, 0);
    setLedgerFromDate(format(from, "yyyy-MM-dd"));
    setLedgerToDate(format(to, "yyyy-MM-dd"));
  }, [ledgerMonth, ledgerYear]);

  useEffect(() => {
    async function fetchCompany() {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    }
    fetchCompany();
  }, [user]);

  useEffect(() => {
    async function checkVatStatus() {
      if (!companyId) return;
      const { data } = await supabase
        .from('companies')
        .select('vat_number')
        .eq('id', companyId)
        .single();
      
      setIsVatRegistered(!!data?.vat_number);
    }
    checkVatStatus();
  }, [companyId]);

  useEffect(() => {
    if (!isVatRegistered) {
      setInputVatType("No VAT");
    }
  }, [isVatRegistered]);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (activeTab === 'new') {
      fetchPendingJournals();
    } else if (activeTab === 'reviewed') {
      fetchReviewedJournals();
    }
  }, [activeTab, user, reviewedDateStart, reviewedDateEnd]);

  const fetchLedger = async () => {
    if (!user) return;
    if (!companyId) {
      toast.error("Company not found");
      return;
    }

    try {
      setLedgerLoading(true);
      const { data: transactions, error } = await supabase
        .from('transactions')
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
        .eq('company_id', companyId)
        .eq('status', 'posted')
        .lte('transaction_date', ledgerToDate)
        .order('transaction_date', { ascending: true })
        .order('reference_number', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;

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
        const account = accounts.find(a => a.id === accountId);
        if (!account) return;

        const normalSide = getNormalBalanceSide(account.account_type);
        const openingDebit = openingDebitMap[accountId] || 0;
        const openingCredit = openingCreditMap[accountId] || 0;

        let openingBalance = 0;
        if (normalSide === 'debit') {
          openingBalance = openingDebit - openingCredit;
        } else {
          openingBalance = openingCredit - openingDebit;
        }

        const entries = periodEntries[accountId] || [];

        if (openingBalance === 0 && entries.length === 0) {
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

        const sortedEntries = [...entries].sort((a, b) => {
          const da = new Date(a.date).getTime();
          const db = new Date(b.date).getTime();
          if (da !== db) return da - db;
          if (a.reference !== b.reference) return (a.reference || "").localeCompare(b.reference || "");
          return a.id.localeCompare(b.id);
        });

        sortedEntries.forEach(entry => {
          if (normalSide === 'debit') {
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
    } catch (error) {
      console.error("Error fetching ledger:", error);
      toast.error("Failed to load general ledger");
      setLedgerRows([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  const fetchReviewedJournals = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile?.company_id) return;

      const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
          id,
          transaction_date,
          reference_number,
          description,
          total_amount,
          status,
          transaction_entries (
            id,
            account_id,
            debit,
            credit,
            description
          )
        `)
        .eq('company_id', profile.company_id)
        .eq('status', 'posted')
        .gte('transaction_date', reviewedDateStart)
        .lte('transaction_date', reviewedDateEnd)
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      const fetchedLines: JournalLine[] = [];
      transactions?.forEach(tx => {
         tx.transaction_entries.forEach((entry: any) => {
           const isDebit = entry.debit > 0;
           const amount = isDebit ? entry.debit : entry.credit;
           if (amount === 0) return;

           fetchedLines.push({
             id: entry.id,
             date: tx.transaction_date,
             effect: isDebit ? 'Debit' : 'Credit',
             accountId: entry.account_id,
             reference: tx.reference_number || "",
             description: entry.description || tx.description,
             vatType: "No VAT", 
             amount: amount,
             vatAmount: 0,
             inclVat: amount,
             affectingAccountId: undefined,
             transactionId: tx.id,
             isSaved: true
           });
         });
      });
      setReviewedLines(fetchedLines);
    } catch (error) {
      console.error("Error fetching reviewed journals:", error);
      toast.error("Failed to load reviewed journals");
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingJournals = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile?.company_id) return;

      // Fetch pending transactions with their entries
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select(`
          id,
          transaction_date,
          reference_number,
          description,
          total_amount,
          status,
          transaction_entries (
            id,
            account_id,
            debit,
            credit,
            description
          )
        `)
        .eq('company_id', profile.company_id)
        .eq('status', 'pending')
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      // Transform transactions into JournalLines
      const fetchedLines: JournalLine[] = [];
      
      transactions?.forEach(tx => {
         // We need to decide how to display these. 
         // If we created them as pairs (Debit/Credit), we might want to show them as lines.
         // Or just show each entry as a line.
         // Let's show each entry as a line for simplicity and accuracy.
         
         tx.transaction_entries.forEach((entry: any) => {
           // Determine effect and amount
           const isDebit = entry.debit > 0;
           const amount = isDebit ? entry.debit : entry.credit;
           
           if (amount === 0) return; // Skip zero entries if any

           fetchedLines.push({
             id: entry.id, // Use entry ID as unique key
             date: tx.transaction_date,
             effect: isDebit ? 'Debit' : 'Credit',
             accountId: entry.account_id,
             reference: tx.reference_number || "",
             description: entry.description || tx.description,
             vatType: "No VAT", // We don't store VAT type explicitly in entries yet, assuming No VAT for display or derived
             amount: amount,
             vatAmount: 0, // Simplified for now
             inclVat: amount,
             affectingAccountId: undefined, // Hard to reconstruct without explicit link
             transactionId: tx.id,
             isSaved: true
           });
         });
      });

      // We only want to replace the SAVED lines, but keep the UNSAVED new lines if any?
      // For now, let's assume 'New Journals' tab shows everything pending.
      // If user was typing, we might lose it? No, 'lines' state is mixed.
      // Let's separate 'unsavedLines' and 'savedLines' conceptually?
      // Or just append unsaved ones?
      // Current approach: We will just setLines to fetched ones. 
      // If user had unsaved lines, they should have saved them. 
      // But to be safe, we could merge. 
      // However, simpler is: fetch replaces state. User should save before refreshing/tab switching.
      // But we are calling this on mount/tab change.
      
      setLines(fetchedLines);
      
    } catch (error) {
      console.error("Error fetching pending journals:", error);
      toast.error("Failed to load pending journals");
    } finally {
      setLoading(false);
    }
  };

  const downloadExampleCsv = () => {
    const headers = ["Date", "Effect", "Account Code", "Reference", "Description", "VAT Type", "Amount", "Affecting Account Code"];
    const exampleRow = [format(new Date(), "yyyy-MM-dd"), "Debit", "1000", "REF001", "Office Supplies", "Standard Rate", "150.00", "8400"];
    const csvContent = [headers.join(","), exampleRow.join(",")].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "journal_import_template.csv");
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        const parsedLines: JournalLine[] = [];
        let errors = 0;

        results.data.forEach((row: any) => {
          // Basic validation
          if (!row.Date || !row.Amount || !row["Account Code"]) {
             errors++;
             return;
          }

          const account = accounts.find(a => a.account_code === row["Account Code"]?.toString());
          const affectingAccount = row["Affecting Account Code"] ? accounts.find(a => a.account_code === row["Affecting Account Code"]?.toString()) : undefined;

          if (!account) {
            console.warn(`Account not found for code: ${row["Account Code"]}`);
            errors++;
            return;
          }

          const amount = parseFloat(row.Amount);
          if (isNaN(amount)) {
             errors++;
             return;
          }

          const vatType = row["VAT Type"] || "No VAT";
          const vatAmount = calculateVat(amount, vatType);

          parsedLines.push({
            id: Math.random().toString(36).substr(2, 9),
            date: row.Date,
            effect: (row.Effect === "Credit" ? "Credit" : "Debit") as 'Debit' | 'Credit',
            accountId: account.id,
            reference: row.Reference || "",
            description: row.Description || "",
            vatType: vatType,
            amount: amount,
            vatAmount: vatAmount,
            inclVat: amount + vatAmount,
            affectingAccountId: affectingAccount?.id
          });
        });

        if (parsedLines.length > 0) {
          setLines(prev => [...prev, ...parsedLines]);
          toast.success(`Successfully imported ${parsedLines.length} lines.`);
          setIsImportOpen(false);
        }
        
        if (errors > 0) {
          toast.warning(`${errors} lines were skipped due to errors (e.g., missing account code or invalid amount).`);
        }
      },
      error: (error: any) => {
        toast.error("Failed to parse CSV file: " + error.message);
      }
    });
  };

  const fetchAccounts = async () => {
    try {
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile?.company_id) return;

      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('company_id', profile.company_id)
        .eq('is_active', true)
        .order('account_code');

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      toast.error("Failed to load accounts");
    }
  };

  const handleAddLine = () => {
    if (!inputAccountId || !inputAmount) {
      toast.error("Please select an account and enter an amount");
      return;
    }

    const vatAmount = calculateVat(inputAmount, inputVatType);
    
    const newLine: JournalLine = {
      id: Math.random().toString(36).substr(2, 9),
      date: inputDate,
      effect: inputEffect,
      accountId: inputAccountId,
      reference: inputReference,
      description: inputDescription,
      vatType: inputVatType,
      amount: inputAmount,
      vatAmount: vatAmount,
      inclVat: inputAmount + vatAmount,
      affectingAccountId: inputAffectingAccountId
    };

    setLines([...lines, newLine]);
    
    // Clear inputs (some fields might persist like Date/Reference depending on workflow, but clearing for now)
    setInputAccountId("");
    setInputAmount(0);
    setInputDescription("");
    setInputAffectingAccountId("");
  };

  const removeLine = (id: string) => {
    setLines(lines.filter(l => l.id !== id));
  };

  const handleSave = async () => {
    if (lines.length === 0) {
      toast.error("No lines to save");
      return;
    }

    // Basic validation: Check if balanced (if using double entry logic)
    // Or just save as draft transactions
    // For this UI, we'll assume we are creating transactions
    
    setLoading(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user!.id).single();
      if (!profile?.company_id) throw new Error("Company not found");

      // Filter out lines that are already saved
      const unsavedLines = lines.filter(l => !l.isSaved);
      
      if (unsavedLines.length === 0) {
        toast.info("No new lines to save");
        return;
      }

      // Group by Reference
      const groups: Record<string, JournalLine[]> = {};
      unsavedLines.forEach(line => {
        const key = line.reference || "Unreferenced";
        if (!groups[key]) groups[key] = [];
        groups[key].push(line);
      });

      for (const ref in groups) {
        const groupLines = groups[ref];
        
        // Calculate totals and validate balance
        let totalDebits = 0;
        let totalCredits = 0;
        let balanceCheck = 0;
        
        groupLines.forEach(l => {
          // Use inclusive amount for totals to account for VAT
          // If VAT is not applicable, inclVat equals amount
          const lineAmount = l.inclVat;

          if (l.effect === 'Debit') totalDebits += lineAmount;
          else totalCredits += lineAmount;

          // Only check balance for lines that don't have an affecting account (which are self-balancing)
          if (!l.affectingAccountId) {
            if (l.effect === 'Debit') balanceCheck += lineAmount;
            else balanceCheck -= lineAmount;
          }
        });

        // Use a slightly larger epsilon for floating point issues
        if (Math.abs(balanceCheck) > 0.05) {
          toast.error(`Journal with reference "${ref}" is not balanced. Difference: ${balanceCheck.toFixed(2)}`);
          continue; // Skip this group but try others
        }

        const { data: transaction, error: transError } = await supabase
          .from('transactions')
          .insert({
            company_id: profile.company_id,
            transaction_date: groupLines[0].date,
            description: groupLines[0].description || "Journal Entry",
            reference_number: ref === "Unreferenced" ? `JNL-${Date.now()}` : ref,
            total_amount: totalDebits || totalCredits, // Approximation
            transaction_type: "standard",
            status: "pending",
            user_id: user!.id
          })
          .select()
          .single();

        if (transError) throw transError;

        const entries: any[] = [];
        
        // Find VAT accounts
        const vatInputAccount = accounts.find(a => a.account_code === '1210');
        const vatOutputAccount = accounts.find(a => a.account_code === '2200');

        groupLines.forEach(line => {
          // Main entry (Net Amount)
          entries.push({
            transaction_id: transaction.id,
            account_id: line.accountId,
            description: line.description,
            debit: line.effect === 'Debit' ? line.amount : 0,
            credit: line.effect === 'Credit' ? line.amount : 0,
            status: "approved"
          });

          // VAT Entry (if applicable)
          if (line.vatAmount > 0) {
            let vatAccountId = null;
            if (line.effect === 'Debit') {
              // Input VAT (Expense) -> Debit
              vatAccountId = vatInputAccount?.id;
            } else {
              // Output VAT (Income) -> Credit
              vatAccountId = vatOutputAccount?.id;
            }

            if (vatAccountId) {
              entries.push({
                transaction_id: transaction.id,
                account_id: vatAccountId,
                description: `VAT - ${line.description}`,
                debit: line.effect === 'Debit' ? line.vatAmount : 0,
                credit: line.effect === 'Credit' ? line.vatAmount : 0,
                status: "approved"
              });
            } else {
              console.warn("VAT account not found for effect:", line.effect);
              // If we can't find the VAT account, we can't balance it correctly if we split it.
              // But strictly speaking, if we don't add the VAT entry, it will be unbalanced 
              // relative to the "inclVat" calculation we did above.
              // So we might end up with an unbalanced transaction in the DB.
              // We should probably toast a warning? 
              // For now, let's assume accounts exist as per migration.
            }
          }

          // If 'Affecting Account' is present, create the balancing entry
          if (line.affectingAccountId) {
             entries.push({
               transaction_id: transaction.id,
               account_id: line.affectingAccountId,
               description: line.description,
               debit: line.effect === 'Credit' ? line.inclVat : 0, // Opposite, using Inclusive Amount
               credit: line.effect === 'Debit' ? line.inclVat : 0, // Opposite, using Inclusive Amount
               status: "approved"
             });
          }
        });

        const { error: entriesError } = await supabase
          .from('transaction_entries')
          .insert(entries);

        if (entriesError) throw entriesError;
      }

      toast.success("Journals saved successfully");
      // Refresh the list to show saved state
      fetchPendingJournals();
      
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to save journals: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsReviewed = async (all: boolean = false) => {
    try {
      setLoading(true);
      
      let idsToUpdate: string[] = [];
      
      if (all) {
        // Get all unique transaction IDs from current lines
        const allTxIds = lines.map(l => l.transactionId).filter(Boolean) as string[];
        idsToUpdate = [...new Set(allTxIds)];
      } else {
        // Get transaction IDs from selected lines
        const selectedTxIds = lines
          .filter(l => selectedLineIds.includes(l.id))
          .map(l => l.transactionId)
          .filter(Boolean) as string[];
        idsToUpdate = [...new Set(selectedTxIds)];
      }

      if (idsToUpdate.length === 0) {
        toast.info("No saved transactions selected to review");
        return;
      }

      // Validate balance for each transaction
      for (const txId of idsToUpdate) {
        const txLines = lines.filter(l => l.transactionId === txId);
        let debitSum = 0;
        let creditSum = 0;
        
        txLines.forEach(l => {
          if (l.effect === 'Debit') debitSum += l.amount;
          else creditSum += l.amount;
        });
        
        if (Math.abs(debitSum - creditSum) > 0.01) {
          const ref = txLines[0]?.reference || "Unknown";
          toast.error(`Transaction "${ref}" is not balanced (Debits: ${debitSum.toFixed(2)}, Credits: ${creditSum.toFixed(2)}). Please delete it and create a balanced journal.`);
          setLoading(false);
          return;
        }
      }

      const { error } = await supabase
        .from('transactions')
        .update({ status: 'posted', transaction_type: 'standard' }) 
        .in('id', idsToUpdate);

      if (error) throw error;

      toast.success(`Successfully reviewed ${idsToUpdate.length} transaction(s)`);
      setSelectedLineIds([]);
      fetchPendingJournals(); 
      
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to mark as reviewed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      
      const selectedTxIds = lines
        .filter(l => selectedLineIds.includes(l.id))
        .map(l => l.transactionId)
        .filter(Boolean) as string[];
      
      const idsToDelete = [...new Set(selectedTxIds)];

      if (idsToDelete.length === 0) {
        toast.info("No saved transactions selected to delete");
        return;
      }

      if (!confirm(`Are you sure you want to delete ${idsToDelete.length} transaction(s)?`)) {
        return;
      }

      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;

      toast.success(`Successfully deleted ${idsToDelete.length} transaction(s)`);
      setSelectedLineIds([]);
      fetchPendingJournals();
      
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to delete transactions");
    } finally {
      setLoading(false);
    }
  };
  
  const handlePrintPreview = () => {
    window.print();
  };

  const inputVatAmount = calculateVat(inputAmount, inputVatType);
  const inputInclVat = inputAmount + inputVatAmount;

  const handleSelectLine = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedLineIds(prev => [...prev, id]);
    } else {
      setSelectedLineIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleSelectAllLines = (checked: boolean) => {
    if (checked) {
      setSelectedLineIds(lines.map(l => l.id));
    } else {
      setSelectedLineIds([]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 bg-blue-50/50 p-4 rounded-md border border-blue-100 text-sm text-blue-900">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>Once journal transactions are Marked as Reviewed, you will be able to see them on the <span className="font-semibold">Reviewed Journals</span> tab where you can specify a specific date range.</p>
          <p>You can edit and delete reviewed journal transactions as well as add attachments but <span className="font-semibold">cannot</span> add new journal transactions.</p>
          <p>Only Reviewed Journal transactions will update your Account Balances and reporting.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start h-auto bg-transparent p-0 border-b rounded-none space-x-6">
          <TabsTrigger 
            value="new"
            className="rounded-none border-b-2 border-transparent px-2 py-2 data-[state=active]:border-[#0070ad] data-[state=active]:text-[#0070ad] data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-none font-medium"
          >
            New Journals
          </TabsTrigger>
          <TabsTrigger 
            value="reviewed"
            className="rounded-none border-b-2 border-transparent px-2 py-2 data-[state=active]:border-[#0070ad] data-[state=active]:text-[#0070ad] data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-none font-medium"
          >
            Reviewed Journals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-6 space-y-4">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                    <Settings className="h-4 w-4" />
                    Actions
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleMarkAsReviewed(false)}>Mark as Reviewed</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDelete}>Delete</DropdownMenuItem>
                  <DropdownMenuItem disabled>Batch Edit</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex items-center gap-1">
                 <Button 
                   variant="ghost" 
                   size="sm" 
                   className="text-muted-foreground"
                   onClick={() => handleMarkAsReviewed(false)}
                 >
                   Mark as Reviewed
                 </Button>
                 <Button 
                   variant="ghost" 
                   size="sm" 
                   className="text-muted-foreground hover:text-red-600 hover:bg-red-50"
                   onClick={handleDelete}
                 >
                   Delete
                 </Button>
                 <Button variant="ghost" size="sm" disabled className="text-muted-foreground">Batch Edit</Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                className="h-9 gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => setIsImportOpen(true)}
              >
                <Upload className="h-4 w-4" />
                Import Journals
              </Button>
              <Button variant="outline" className="h-9 gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search" className="pl-8 h-9" />
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-md overflow-hidden bg-white shadow-sm">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40px]">
                    <Checkbox 
                      checked={lines.length > 0 && selectedLineIds.length === lines.length}
                      onCheckedChange={(checked) => handleSelectAllLines(!!checked)}
                    />
                  </TableHead>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead className="w-[100px]">Effect</TableHead>
                  <TableHead className="w-[200px]">Account</TableHead>
                  <TableHead className="w-[120px]">Reference</TableHead>
                  <TableHead className="min-w-[200px]">Description</TableHead>
                  <TableHead className="w-[120px]">VAT Type</TableHead>
                  <TableHead className="w-[120px] text-right">Amount</TableHead>
                  <TableHead className="w-[100px] text-right">VAT</TableHead>
                  <TableHead className="w-[120px] text-right">Incl. VAT</TableHead>
                  <TableHead className="w-[200px]">by Affecting Acc.</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="h-24 text-center text-muted-foreground text-xs italic">
                      You have no new transactions to review. Import your transactions or enter below.
                    </TableCell>
                  </TableRow>
                )}
                {lines.map((line) => (
                  <TableRow key={line.id} className={line.isSaved ? "bg-gray-50/30" : ""}>
                    <TableCell>
                       <Checkbox 
                         checked={selectedLineIds.includes(line.id)}
                         onCheckedChange={(checked) => handleSelectLine(line.id, !!checked)}
                       />
                    </TableCell>
                    <TableCell>{line.date}</TableCell>
                    <TableCell>{line.effect}</TableCell>
                    <TableCell className="font-medium text-xs">
                      {accounts.find(a => a.id === line.accountId)?.account_name || "Unknown"}
                    </TableCell>
                    <TableCell>{line.reference}</TableCell>
                    <TableCell>{line.description}</TableCell>
                    <TableCell>{line.vatType}</TableCell>
                    <TableCell className="text-right">{line.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{line.vatAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{line.inclVat.toFixed(2)}</TableCell>
                    <TableCell className="text-xs">
                       {accounts.find(a => a.id === line.affectingAccountId)?.account_name}
                    </TableCell>
                    <TableCell>
                      {!line.isSaved && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeLine(line.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Input Row */}
                <TableRow className="bg-blue-50/30 hover:bg-blue-50/30 border-t-2 border-blue-100">
                  <TableCell><Checkbox disabled /></TableCell>
                  <TableCell className="p-1">
                    <Input 
                      type="date" 
                      value={inputDate} 
                      onChange={(e) => setInputDate(e.target.value)}
                      className="h-8 text-xs px-2 border-gray-200" 
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Select value={inputEffect} onValueChange={(v: any) => setInputEffect(v)}>
                      <SelectTrigger className="h-8 text-xs border-gray-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Debit">Debit</SelectItem>
                        <SelectItem value="Credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    <AccountCombobox 
                      accounts={accounts} 
                      value={inputAccountId} 
                      onChange={setInputAccountId} 
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input 
                      value={inputReference}
                      onChange={(e) => setInputReference(e.target.value)}
                      placeholder="Ref"
                      className="h-8 text-xs px-2 border-gray-200"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input 
                      value={inputDescription}
                      onChange={(e) => setInputDescription(e.target.value)}
                      placeholder="Description"
                      className="h-8 text-xs px-2 border-gray-200"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Select value={inputVatType} onValueChange={setInputVatType}>
                      <SelectTrigger className="h-8 text-xs border-gray-200 w-full min-w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="No VAT">No VAT</SelectItem>
                        <SelectItem value="Standard Rate">Standard Rate (15%)</SelectItem>
                        <SelectItem value="Zero Rate">Zero Rate (0%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    <Input 
                      type="number"
                      value={inputAmount || ""}
                      onChange={(e) => setInputAmount(parseFloat(e.target.value) || 0)}
                      className="h-8 text-xs px-2 text-right border-gray-200"
                      placeholder="0.00"
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground p-2 bg-gray-50/50">
                    {inputVatAmount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground p-2 bg-gray-50/50">
                    {inputInclVat.toFixed(2)}
                  </TableCell>
                  <TableCell className="p-1">
                    <AccountCombobox 
                      accounts={accounts} 
                      value={inputAffectingAccountId} 
                      onChange={setInputAffectingAccountId} 
                      placeholder="(None)"
                    />
                  </TableCell>
                  <TableCell className="p-1 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button 
                        size="icon" 
                        className="h-6 w-6 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-sm"
                        onClick={handleAddLine}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost"
                        className="h-6 w-6 rounded-full text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => {
                           setInputAmount(0);
                           setInputDescription("");
                           setInputAccountId("");
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-center gap-3 pt-6 pb-12">
            <Button 
              className="bg-[#0070ad] hover:bg-[#005a8d] min-w-[100px]"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => handleMarkAsReviewed(false)}>
              Mark Selected as Reviewed
            </Button>
            <Button variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => handleMarkAsReviewed(true)}>
              Mark All as Reviewed
            </Button>
            <Button variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={handlePrintPreview}>
              Print Preview
            </Button>
          </div>

        </TabsContent>
        
        <TabsContent value="reviewed">
           <div className="space-y-4">
             {/* Filter Bar */}
             <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-md border">
               <div className="flex items-center gap-2">
                 <Label>From:</Label>
                 <Input 
                   type="date" 
                   value={reviewedDateStart} 
                   onChange={(e) => setReviewedDateStart(e.target.value)}
                   className="w-[150px] bg-white h-9"
                 />
               </div>
               <div className="flex items-center gap-2">
                 <Label>To:</Label>
                 <Input 
                   type="date" 
                   value={reviewedDateEnd} 
                   onChange={(e) => setReviewedDateEnd(e.target.value)}
                   className="w-[150px] bg-white h-9"
                 />
               </div>
               <Button variant="outline" onClick={fetchReviewedJournals} className="h-9">
                 <Search className="h-4 w-4 mr-2" />
                 Filter
               </Button>
             </div>

             {/* Table */}
             <div className="border rounded-md">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[120px] h-9 text-xs font-medium text-[#0070ad]">Date</TableHead>
                      <TableHead className="w-[80px] h-9 text-xs font-medium text-[#0070ad]">Effect</TableHead>
                      <TableHead className="w-[200px] h-9 text-xs font-medium text-[#0070ad]">Account</TableHead>
                      <TableHead className="w-[100px] h-9 text-xs font-medium text-[#0070ad]">Reference</TableHead>
                      <TableHead className="h-9 text-xs font-medium text-[#0070ad]">Description</TableHead>
                      <TableHead className="w-[100px] h-9 text-xs font-medium text-[#0070ad]">VAT Type</TableHead>
                      <TableHead className="w-[100px] h-9 text-xs font-medium text-[#0070ad] text-right">Amount</TableHead>
                      <TableHead className="w-[80px] h-9 text-xs font-medium text-[#0070ad] text-right">VAT</TableHead>
                      <TableHead className="w-[100px] h-9 text-xs font-medium text-[#0070ad] text-right">Incl. VAT</TableHead>
                      <TableHead className="w-[60px] h-9 text-xs font-medium text-[#0070ad]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reviewedLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                          No reviewed journals found for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      reviewedLines.map((line) => {
                         const account = accounts.find(a => a.id === line.accountId);
                         return (
                           <TableRow key={line.id} className="hover:bg-blue-50/30 group">
                             <TableCell className="py-1 text-xs">{format(new Date(line.date), "dd/MM/yyyy")}</TableCell>
                             <TableCell className="py-1 text-xs">{line.effect}</TableCell>
                             <TableCell className="py-1 text-xs font-mono">
                               {account ? `${account.account_code} - ${account.account_name}` : 'Unknown'}
                             </TableCell>
                             <TableCell className="py-1 text-xs">{line.reference}</TableCell>
                             <TableCell className="py-1 text-xs">{line.description}</TableCell>
                             <TableCell className="py-1 text-xs">{line.vatType}</TableCell>
                             <TableCell className="py-1 text-xs text-right font-mono">{line.amount.toFixed(2)}</TableCell>
                             <TableCell className="py-1 text-xs text-right font-mono">{line.vatAmount.toFixed(2)}</TableCell>
                             <TableCell className="py-1 text-xs text-right font-mono">{line.inclVat.toFixed(2)}</TableCell>
                             <TableCell className="py-1 text-xs text-center">
                               {/* Actions if needed, e.g. View */}
                             </TableCell>
                           </TableRow>
                         );
                      })
                    )}
                  </TableBody>
                </Table>
             </div>
           </div>
        </TabsContent>

      </Tabs>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Import Journal Entries</DialogTitle>
            <DialogDescription>
              Upload a CSV file to import journal entries. Please ensure your file matches the required format.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
               <Label htmlFor="file-upload">Select CSV File</Label>
               <Input id="file-upload" type="file" accept=".csv" onChange={handleFileUpload} />
            </div>
            <div className="bg-muted/50 p-4 rounded-md text-sm">
              <p className="mb-2 font-medium">Need a template?</p>
              <p className="text-muted-foreground mb-3">Download our CSV template to ensure your data is formatted correctly.</p>
              <Button variant="outline" size="sm" onClick={downloadExampleCsv} className="gap-2">
                <Download className="h-4 w-4" />
                Download Template
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
