import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, FileSpreadsheet, Check, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import Papa from 'papaparse';

interface BankAccount {
  id: string;
  account_name: string;
  current_balance: number;
}

interface CSVImportProps {
  bankAccounts: BankAccount[];
  onImportComplete: () => void;
}

// Define a type for our chart of accounts for easier access
type ChartOfAccount = {
  id: string;
  account_name: string;
  account_code: string;
  account_type: string;
};

export const CSVImport = ({ bankAccounts, onImportComplete }: CSVImportProps) => {
  const [open, setOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
  const [importLogs, setImportLogs] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' }[]>([]);
  const [importProgress, setImportProgress] = useState(0);

  // Fetch Chart of Accounts on component mount
  useEffect(() => {
    const fetchChartOfAccounts = async () => {
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .single();

        if (profile) {
          console.log("Fetching chart of accounts for company:", profile.company_id);
          const { data, error } = await supabase
            .from('chart_of_accounts')
            .select('id, account_name, account_code, account_type')
            .eq('company_id', profile.company_id)
            .eq('is_active', true);

          if (error) {
            console.error("Chart of accounts fetch error:", error);
            toast({ title: "Error fetching accounts", description: error.message, variant: "destructive" });
          } else {
            console.log("Chart of accounts fetched successfully:", data?.length, "accounts");
            setChartOfAccounts(data || []);
          }
        }
      }
    };
    fetchChartOfAccounts();
  }, [user, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const parseCSV = (text: string): Record<string, unknown>[] => {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    return result.data;
  };

  // Heuristic-based account mapping
  const mapRowToAccounts = (row: Record<string, unknown>, accounts: ChartOfAccount[]) => {
    if (!accounts || accounts.length === 0) {
      console.warn("No chart of accounts available for mapping");
      return { debitAccountId: null, creditAccountId: null, confidence: 'low' };
    }

    const getField = (r: Record<string, unknown>, keys: string[]) => {
      const keyMap: Record<string, string> = {};
      Object.keys(r).forEach(k => { keyMap[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = k; });
      for (const candidate of keys) {
        const norm = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (keyMap[norm] !== undefined) return r[keyMap[norm]] as unknown;
      }
      return null;
    };

    const parseMoneyValue = (v: unknown): number => {
      if (v === null || v === undefined) return 0;
      let s = String(v).trim();
      if (s === '') return 0;
      s = s.replace(/\s/g, '').replace(/R/ig, '').replace(/,/g, '');
      if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
      s = s.replace(/^\+/, '');
      if (/^-?\d+\.?\d*-$/.test(s)) s = s.replace(/-$/, '');
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    const description = String(getField(row, ['Description', 'Details', 'Narrative', 'Transaction Description', 'Particulars', 'Beneficiary', 'Payee']) || '').toLowerCase();
    const debit = parseMoneyValue(getField(row, ['Debit', 'Dr', 'Withdrawal', 'Payments', 'Out']));
    const credit = parseMoneyValue(getField(row, ['Credit', 'Cr', 'Deposit', 'Receipts', 'In']));
    const standalone = parseMoneyValue(getField(row, ['Amount', 'Transaction Amount', 'Amt', 'Value', 'Amount ZAR', 'Total']));
    const amount = credit - debit || standalone;

    let debitAccountId: string | null = null;
    let creditAccountId: string | null = null;
    let confidence: 'high' | 'low' = 'low';

    const bankAssetAccount = accounts.find(a => a.account_type === 'asset' && a.account_name.toLowerCase().includes('bank'));
    const incomeAccount = accounts.find(a => a.account_type === 'income');
    const expenseAccount = accounts.find(a => a.account_type === 'expense');

    if (amount > 0) { // Income
      creditAccountId = incomeAccount?.id || null;
      debitAccountId = bankAssetAccount?.id || null;
      if (description.includes("invoice") || description.includes("payment")) {
        const arAccount = accounts.find(a => a.account_name.toLowerCase().includes('accounts receivable'));
        creditAccountId = arAccount?.id || creditAccountId;
      }
    } else { // Expense
      debitAccountId = expenseAccount?.id || null;
      creditAccountId = bankAssetAccount?.id || null;
      if (description.includes("bill") || description.includes("vendor")) {
        const apAccount = accounts.find(a => a.account_name.toLowerCase().includes('accounts payable'));
        debitAccountId = apAccount?.id || debitAccountId;
      }
    }

    if (debitAccountId && creditAccountId) {
      confidence = 'high';
    }

    return { debitAccountId, creditAccountId, confidence };
  };

  const handleImport = async () => {
    if (!file || !selectedBank) {
      toast({ title: "Error", description: "Please select a bank account and file", variant: "destructive" });
      return;
    }

    setImporting(true);
    setImportLogs([]);
    setImportProgress(0);
    
    try {
      setImportLogs([{ message: "Reading your file...", type: 'info' }]);
      const text = await file.text();
      const rows = parseCSV(text);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user!.id)
        .single();

      if (!profileData) throw new Error("Profile not found");
      const profile = profileData;

      // Validate that the selected bank account still exists
      const { data: bankAccount, error: bankError } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("id", selectedBank)
        .eq("company_id", profile.company_id)
        .single();

      if (bankError || !bankAccount) {
        toast({ title: "Error", description: "Selected bank account no longer exists. Please refresh the page and try again.", variant: "destructive" });
        setSelectedBank("");
        return;
      }

      const getField = (r: Record<string, unknown>, keys: string[]) => {
        const keyMap: Record<string, string> = {};
        Object.keys(r).forEach(k => { keyMap[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = k; });
        for (const candidate of keys) {
          const norm = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (keyMap[norm] !== undefined) return r[keyMap[norm]] as unknown;
        }
        return null;
      };

      const parseMoneyValue = (v: unknown): number => {
        if (v === null || v === undefined) return 0;
        let s = String(v).trim();
        if (s === '') return 0;
        s = s.replace(/\s/g, '').replace(/R/ig, '').replace(/,/g, '');
        if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
        s = s.replace(/^\+/, '');
        if (/^-?\d+\.?\d*-$/.test(s)) s = s.replace(/-$/, '');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };

      const normalizeDate = (s: string): string => {
        const str = String(s || '').trim();
        if (!str) return new Date().toISOString().split('T')[0];
        let d: Date | null = null;
        const m = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
        if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const m2 = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
        if (!d && m2) {
          const day = Number(m2[1]);
          const month = Number(m2[2]) - 1;
          const year = Number(m2[3].length === 2 ? '20' + m2[3] : m2[3]);
          d = new Date(year, month, day);
        }
        if (!d) {
          const parsed = new Date(str);
          if (!Number.isNaN(parsed.getTime())) d = parsed;
        }
        if (!d) d = new Date();
        return d.toISOString().split('T')[0];
      };
      const { data: companyProfile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user!.id)
        .single();

      if (!companyProfile) throw new Error("Profile not found");

      // Validate that the selected bank account still exists
      const { data: selectedBankAccount, error: bankAcctError } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("id", selectedBank)
        .eq("company_id", companyProfile.company_id)
        .single();

      if (bankAcctError || !selectedBankAccount) {
        toast({ title: "Error", description: "Selected bank account no longer exists. Please refresh the page and try again.", variant: "destructive" });
        setSelectedBank("");
        return;
      }

      setImportLogs(prev => [...prev, { message: "Mapping transactions...", type: 'info' }]);

      // Map CSV rows to transactions (header + accounts)
      const importedTransactions = rows.map((row: Record<string, unknown>) => {
        const debit = parseMoneyValue(getField(row, ['Debit', 'Dr', 'Withdrawal', 'Payments', 'Out']));
        const credit = parseMoneyValue(getField(row, ['Credit', 'Cr', 'Deposit', 'Receipts', 'In']));
        const standalone = parseMoneyValue(getField(row, ['Amount', 'Transaction Amount', 'Amt', 'Value', 'Amount ZAR', 'Total']));
        const amount = credit - debit || standalone;
        const { debitAccountId, creditAccountId } = mapRowToAccounts(row, chartOfAccounts);
        const dateRaw = getField(row, ['Date', 'Transaction Date', 'Txn Date', 'Posting Date', 'Value Date']);
        const dateStr = normalizeDate(dateRaw || new Date().toISOString().split('T')[0]);
        const desc = String(getField(row, ['Description', 'Details', 'Narrative', 'Transaction Description', 'Particulars', 'Beneficiary', 'Payee']) || 'Bank transaction');
        const ref = getField(row, ['Reference', 'Ref', 'Transaction ID', 'Channel', 'Doc No', 'Cheque Number', 'Payment Reference']) || null;
        const isInflow = amount >= 0;

        // Fallbacks if mapping didn't find accounts
        const bankAsset = chartOfAccounts.find(a => a.account_type === 'asset' && a.account_name.toLowerCase().includes('bank'))
          || chartOfAccounts.find(a => a.account_type === 'asset' && a.account_name.toLowerCase().includes('cash'));
        const incomeAcc = chartOfAccounts.find(a => a.account_type === 'income');
        const expenseAcc = chartOfAccounts.find(a => a.account_type === 'expense');

        const debitId = debitAccountId || (isInflow ? bankAsset?.id || null : expenseAcc?.id || null);
        const creditId = creditAccountId || (isInflow ? incomeAcc?.id || null : bankAsset?.id || null);

        return {
          company_id: companyProfile.company_id,
          user_id: user!.id,
          bank_account_id: selectedBank,
          transaction_date: dateStr,
          description: desc,
          reference_number: ref,
          total_amount: amount,
          status: 'pending',
          transaction_type: isInflow ? "income" : "expense",
          category: "Bank Import",
          debit_account_id: debitId,
          credit_account_id: creditId,
        };
      }).filter(tx => tx.total_amount !== 0);

      console.log("Transactions to import:", importedTransactions.length, importedTransactions);

      if (importedTransactions.length === 0) {
        toast({ title: "Warning", description: "No valid transactions found in CSV" });
        setImportLogs(prev => [...prev, { message: "No valid transactions found.", type: 'warning' }]);
        return;
      }

      setImportLogs(prev => [...prev, { message: `Found ${importedTransactions.length} transactions. Starting import...`, type: 'info' }]);

      // Check for duplicates before inserting
      let imported = 0;
      let duplicates = 0;
      let errors = 0;
      const total = importedTransactions.length;

      for (let i = 0; i < total; i++) {
        const tx = importedTransactions[i];
        
        const { data: isDuplicate } = await supabase.rpc("check_duplicate_transaction", {
          _company_id: profile.company_id,
          _bank_account_id: selectedBank,
          _transaction_date: tx.transaction_date,
          _total_amount: tx.total_amount,
          _description: tx.description,
        });

        if (isDuplicate) {
          duplicates++;
          setImportLogs(prev => [...prev, { message: `Skipped duplicate: ${tx.description}`, type: 'warning' }]);
        } else {
          const { data: inserted, error } = await supabase
            .from("transactions")
            .insert(tx)
            .select('id, transaction_type')
            .single();
            
          if (error || !inserted) {
            console.error("Import error:", error);
            errors++;
            setImportLogs(prev => [...prev, { message: `Error importing ${tx.description}: ${error?.message || 'Unknown error'}`, type: 'error' }]);
          } else {
            imported++;
            setImportLogs(prev => [...prev, { message: `Imported: ${tx.description}`, type: 'success' }]);
          }
        }
        
        const progress = Math.round(((i + 1) / total) * 100);
        setImportProgress(progress);
        await new Promise(res => setTimeout(res, 100)); // Small delay for visual effect
      }

      setImportLogs(prev => [...prev, { message: `Import completed. ${imported} imported, ${duplicates} skipped, ${errors} errors.`, type: 'success' }]);

      toast({ 
        title: "Import Complete", 
        description: `${imported} imported | ${duplicates} duplicates skipped${errors > 0 ? ` | ${errors} errors` : ""}` 
      });
      
      await new Promise(res => setTimeout(res, 1500)); // Wait a bit before closing
      setOpen(false);
      setFile(null);
      setSelectedBank("");
      onImportComplete();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportLogs(prev => [...prev, { message: `Fatal Error: ${message}`, type: 'error' }]);
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = "Date,Description,Reference,Amount\n2024-01-15,Sample Transaction,REF001,1500.00\n2024-01-16,Sample Payment,REF002,-750.00";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bank_statement_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-sm transition-all hover:border-slate-400">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          Import Statement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Bank Statement</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Select Bank Account</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger>
                <SelectValue placeholder="Choose bank account" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.account_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Upload CSV File</Label>
            <Input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Format: Date, Description, Reference, Amount
            </p>
          </div>

          <Button variant="outline" onClick={downloadTemplate} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Download CSV Template
          </Button>

          {importLogs.length > 0 && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Progress</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300 ease-out"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
              </div>
              <div className="flex-1 border rounded-lg bg-slate-50 p-4 overflow-y-auto font-mono text-sm space-y-2 max-h-[200px]">
                {importLogs.map((log, i) => (
                  <div key={i} className={`flex gap-2 ${log.type === 'error' ? 'text-red-600' : log.type === 'success' ? 'text-green-600' : log.type === 'warning' ? 'text-amber-600' : 'text-gray-700'}`}>
                    <span className="shrink-0">
                      {log.type === 'success' && <Check className="h-4 w-4 mt-0.5" />}
                      {log.type === 'error' && <XCircle className="h-4 w-4 mt-0.5" />}
                      {log.type === 'warning' && <AlertTriangle className="h-4 w-4 mt-0.5" />}
                      {log.type === 'info' && <span className="w-4 h-4 inline-block" />}
                    </span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <Button 
            onClick={handleImport} 
            disabled={importing || !file || !selectedBank}
            className="w-full bg-gradient-primary"
          >
            {importing ? "Importing..." : "Import Transactions"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

