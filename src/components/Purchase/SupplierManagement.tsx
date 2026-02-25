import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Building2, Plus, Users, Mail, Phone, Info, FileDown, Search, MoreHorizontal, UserPlus, 
  FileText, 
  CreditCard, 
  MapPin,
  Check,
  XCircle,
  ArrowUpDown, ChevronDown, FileSpreadsheet, Settings, History, Upload, Loader2, AlertTriangle, Filter, ArrowRightLeft, Eye, Trash, ShoppingCart, Edit, Printer, Download, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { SupplierStatement } from "@/components/Purchase/SupplierStatement";

interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_number?: string;
  pending_bills_count?: number;
  outstanding_balance?: number;
  category?: string;
}

export const SupplierManagement = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompany() {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    }
    fetchCompany();
  }, [user]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [inactiveWarningOpen, setInactiveWarningOpen] = useState(false);
  const [inactiveActionMessage, setInactiveActionMessage] = useState("");

  const checkSupplierActive = (supplier: Supplier, action: string) => {
    if (supplier.name.startsWith('[INACTIVE] ')) {
        setInactiveActionMessage(`You cannot ${action} because this supplier is inactive.`);
        setInactiveWarningOpen(true);
        return false;
    }
    return true;
  };

  const fetchSuppliers = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
        let cid = companyId;
        if (!cid) {
            const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
            cid = profile?.company_id || null;
        }
        
        if (!cid) {
            setLoading(false);
            return;
        }
        
        // Fetch suppliers
        const { data: suppliersData, error: suppliersError } = await supabase
          .from("suppliers")
          .select("*")
          .eq("company_id", cid)
          .order("name");
          
        if (suppliersError) throw suppliersError;

        // Fetch processed POs (Invoices)
        const { data: posData } = await supabase
          .from("purchase_orders")
          .select("supplier_id, total_amount, status, po_number")
          .eq("company_id", cid)
          .in("status", ["sent", "processed", "partially_paid", "paid"]);

        // Fetch Bills (Invoices)
        const { data: billsData } = await supabase
          .from("bills")
          .select("supplier_id, total_amount, status, bill_number")
          .eq("company_id", cid)
          .neq("status", "Draft"); // Assume Draft bills don't count yet

        // Fetch Payments & Deposits & Refunds (Debit Notes)
        const { data: transData } = await supabase
          .from("transactions")
          .select("reference_number, total_amount, transaction_type, description, supplier_id, status") 
          .eq("company_id", cid)
          .in("transaction_type", ["payment", "deposit", "refund"])
          .in("status", ["posted", "approved"]);

        const formatted = suppliersData.map((supplier: any) => {
           // 1. Calculate Liability from Processed POs AND Bills
           const supplierPOs = (posData || []).filter((p: any) => p.supplier_id === supplier.id);
           const supplierBills = (billsData || []).filter((b: any) => b.supplier_id === supplier.id);
           
           const liabilityPOs = supplierPOs.reduce((sum: number, p: any) => sum + (Number(p.total_amount) || 0), 0);
           const liabilityBills = supplierBills.reduce((sum: number, b: any) => sum + (Number(b.total_amount) || 0), 0);
           
           const totalLiability = liabilityPOs + liabilityBills;
           
           // 2. Calculate Payments/Deposits
           // a) Linked via PO Number or Bill Number
           const poRefs = new Set([
              ...supplierPOs.map((p: any) => p.po_number).filter(Boolean),
              ...supplierBills.map((b: any) => b.bill_number).filter(Boolean)
           ]);
           
           // b) Linked via Description or Reference
           const supplierNameLower = (supplier.name || "").toLowerCase();
           
           const supplierTrans = (transData || []).filter((t: any) => {
              // Direct Link via ID (Best)
              if (t.supplier_id === supplier.id) return true;
              if (t.reference_number && poRefs.has(t.reference_number)) return true;
              // Check for ID in reference (new format: DEP-SUPPLIER_ID-TIMESTAMP)
              if (t.reference_number && t.reference_number.includes(supplier.id)) return true;
              // Legacy fuzzy match
              if (t.description && t.description.toLowerCase().includes(supplierNameLower)) return true;
              return false;
           });
           
           const totalPaid = supplierTrans.reduce((sum: number, t: any) => sum + (Number(t.total_amount) || 0), 0);

           // Net Balance = Liability - Paid
           // If Positive: We owe Supplier.
           // If Negative: Supplier owes us (Advance/Deposit).
           const netBalance = totalLiability - totalPaid;
           
           const pendingPOsCount = supplierPOs.filter((p: any) => p.status !== 'paid').length;
           const pendingBillsCount = supplierBills.filter((b: any) => b.status !== 'Paid').length;

           return {
             ...supplier,
             pending_bills_count: pendingPOsCount + pendingBillsCount,
             outstanding_balance: netBalance
           };
         }) as Supplier[];
         
         setSuppliers(formatted);
    } catch (error: any) {
        console.error("Error fetching suppliers:", error);
        toast({ title: "Error", description: "Failed to load suppliers", variant: "destructive" });
    } finally {
        setLoading(false);
    }
  }, [user, companyId, toast]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const refresh = fetchSuppliers;

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredSuppliers.map(s => {
      const isInactive = s.name.startsWith('[INACTIVE] ');
      const cleanName = isInactive ? s.name.replace('[INACTIVE] ', '') : s.name;
      
      return {
        Name: cleanName,
        Category: s.category || 'Local',
        Balance: s.outstanding_balance || 0,
        'Contact Name': '', // Placeholder for future use
        'Tel Number': s.phone || '',
        'Mobile Number': '', // Placeholder for future use
        Active: isInactive ? 'No' : 'Yes'
      };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
    XLSX.writeFile(wb, "SupplierExport.csv");
  };

  const generatePDF = (isPrint = false) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Suppliers List", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 22);
    
    const tableData = filteredSuppliers.map(s => [
      s.name,
      s.category || 'Local',
      s.email || '-',
      s.phone || '-',
      s.tax_number || '-',
      new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(s.outstanding_balance || 0)
    ]);

    autoTable(doc, {
      head: [['Name', 'Category', 'Email', 'Phone', 'Tax No', 'Balance']],
      body: tableData,
      startY: 25,
      headStyles: { fillColor: [66, 66, 66] },
    });

    if (isPrint) {
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    } else {
      doc.save("suppliers_list.pdf");
    }
  };


  const [dialogOpen, setDialogOpen] = useState(false);
  // user is already destructured at the top
  const { isAdmin, isAccountant } = useRoles();
  const [searchTerm, setSearchTerm] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(7);
  const [viewFilter, setViewFilter] = useState("all");
  const [sortConfig, setSortConfig] = useState<{ key: keyof Supplier; direction: 'asc' | 'desc' } | null>(null);

  // Import State
  const [importOpen, setImportOpen] = useState(false);
  const [importLogs, setImportLogs] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' }[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    setImportOpen(true);
    setImportLogs([{ message: "Reading your file... just a moment.", type: 'info' }]);
    setIsImporting(true);
    setImportProgress(0);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        await processImportData(data);
      } catch (error) {
        setImportLogs(prev => [...prev, { message: "I couldn't read that file. Is it a valid Excel file?", type: 'error' }]);
        setIsImporting(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    e.target.value = ''; // Reset
  };

  const processImportData = async (data: any[]) => {
    setImportLogs(prev => [...prev, { message: `I found ${data.length} suppliers in your list. Starting the import now...`, type: 'info' }]);
    
    // Fetch accounts once
    let apId = "";
    let equityObId = "";
    
    try {
        const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user?.id).single();
        const cid = profile?.company_id;
        
        if (cid) {
            const { data: accounts } = await supabase
                .from('chart_of_accounts')
                .select('id, account_name, account_type, account_code')
                .eq('company_id', cid)
                .eq('is_active', true);
                
            const list = (accounts || []).map(a => ({ id: String(a.id), name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
            
            const pick = (type: string, codes: string[], names: string[]) => {
                const byCode = list.find(a => a.type === type && codes.includes(a.code));
                if (byCode) return byCode.id;
                const byName = list.find(a => a.type === type && names.some(n => a.name.includes(n)));
                if (byName) return byName.id;
                return "";
            };
            
            apId = pick('liability', ['2000'], ['accounts payable','payable']);
            equityObId = pick('equity', ['3999'], ['opening balance','opening']);
        }
    } catch (err) {
        console.error("Error fetching accounts for import", err);
    }

    let successCount = 0;
    const total = data.length;

    for (let i = 0; i < total; i++) {
      const row = data[i];
      const name = row.Name || row.name; 
      
      if (!name) {
        continue; // Skip empty rows
      }

      // UX: Show "pop up" effect
      setImportLogs(prev => {
        const newLogs = [...prev, { message: `Processing: ${name}`, type: 'info' as const }];
        // Keep only last 5 logs to avoid clutter, plus specific errors/warnings
        // Actually, user wants to see them "pop up", maybe scrolling list is better.
        // Let's keep all logs but scroll to bottom.
        return newLogs;
      });
      
      // Artificial delay for "human" feel
      await new Promise(resolve => setTimeout(resolve, 800));

      try {
         const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user?.id).single();
         
         const supplierData = {
            company_id: profile!.company_id,
            name: name,
            email: row.Email || row.email || null,
            phone: row.Phone || row.phone || row['Tel Number'] || null,
            category: row.Category || 'Local',
            tax_number: row['Tax Number'] || row.tax_number || null,
         };

         // Insert Supplier
         const { data: inserted, error } = await supabase.from('suppliers').insert(supplierData).select('id').single();
         
         if (error) throw error;

         // Handle Opening Balance
         const balance = row.Balance || row['Opening Balance'] || row.outstanding_balance;
         const obAmt = parseFloat(balance);
         
         if (!isNaN(obAmt) && obAmt !== 0) {
            if (apId && equityObId) {
                try {
                     const { data: tx } = await supabase.from('transactions').insert({
                        company_id: profile!.company_id,
                        user_id: user?.id,
                        transaction_date: new Date().toISOString().slice(0, 10),
                        description: `Opening balance for supplier ${name}`,
                        reference_number: `SUP-OB-${inserted.id}`,
                        total_amount: Math.abs(obAmt),
                        transaction_type: 'opening',
                        status: 'posted'
                      }).select('id').single();

                     if (tx) {
                         // If Positive (We owe them): Credit AP, Debit Equity (Expenses/Opening Balance)
                         // Wait, Opening Balance for Supplier means we owe them (Liability).
                         // So Credit AP (Increase Liability). Debit Opening Balance Equity.
                         
                         const rows = [
                            { transaction_id: tx.id, account_id: equityObId, debit: Math.abs(obAmt), credit: 0, description: 'Opening Balance Equity', status: 'approved' },
                            { transaction_id: tx.id, account_id: apId, debit: 0, credit: Math.abs(obAmt), description: 'Accounts Payable', status: 'approved' }
                         ];
                         
                         await supabase.from('transaction_entries').insert(rows as any);
                         
                         // Ledger
                         const ledgerRows = rows.map(r => ({ 
                             company_id: profile!.company_id, 
                             account_id: r.account_id, 
                             debit: r.debit, 
                             credit: r.credit, 
                             entry_date: new Date().toISOString().slice(0, 10), 
                             is_reversed: false, 
                             transaction_id: tx.id, 
                             description: r.description 
                         }));
                         
                         await supabase.from('ledger_entries').insert(ledgerRows as any);
                         setImportLogs(prev => [...prev, { message: `Added ${name} with opening balance of ${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(obAmt)}.`, type: 'success' }]);
                     }
                } catch (obErr) {
                    console.error(obErr);
                    setImportLogs(prev => [...prev, { message: `Added ${name}, but I couldn't set the opening balance automatically. Please adjust it manually.`, type: 'warning' }]);
                }
            } else {
                 setImportLogs(prev => [...prev, { message: `Added ${name}, but I couldn't find the accounts for opening balance. Please adjust it manually.`, type: 'warning' }]);
            }
         } else {
            setImportLogs(prev => [...prev, { message: `Successfully added ${name}.`, type: 'success' }]);
         }
         
         successCount++;
      } catch (err: any) {
         setImportLogs(prev => [...prev, { message: `I couldn't add ${name}. Reason: ${err.message}`, type: 'error' }]);
      }
      
      setImportProgress(Math.round(((i + 1) / total) * 100));
    }

    setIsImporting(false);
    setImportLogs(prev => [...prev, { message: `All done! I've successfully added ${successCount} suppliers for you.`, type: 'success' }]);
    refresh();
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredSuppliers.map(s => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleSort = (key: keyof Supplier) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };


  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    tax_number: "",
    opening_balance: "",
    opening_balance_date: new Date().toISOString().slice(0, 10),
    category: "Local",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleEdit = (supplier: Supplier) => {
      setFormData({
        name: supplier.name,
        email: supplier.email || "",
        phone: supplier.phone || "",
        address: supplier.address || "",
        tax_number: supplier.tax_number || "",
        opening_balance: "", 
        opening_balance_date: new Date().toISOString().slice(0, 10),
        category: supplier.category || "Local"
      });
      setEditingId(supplier.id);
      setDialogOpen(true);
  };

  // Deactivate State
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [supplierToDeactivate, setSupplierToDeactivate] = useState<Supplier | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Return State
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnSupplier, setReturnSupplier] = useState<Supplier | null>(null);
  const [returnAmount, setReturnAmount] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [returnDescription, setReturnDescription] = useState("");
  const [returnType, setReturnType] = useState<'refund' | 'credit_note'>('credit_note');
  const [selectedCreditAccountId, setSelectedCreditAccountId] = useState("");
  const [isReturning, setIsReturning] = useState(false);
  const [creditAccounts, setCreditAccounts] = useState<any[]>([]);

  // Deposit State
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositSupplier, setDepositSupplier] = useState<Supplier | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [depositDescription, setDepositDescription] = useState("");
  const [selectedBankId, setSelectedBankId] = useState("");
  const [selectedReceivableId, setSelectedReceivableId] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [receivableAccounts, setReceivableAccounts] = useState<any[]>([]);

  useEffect(() => {
    const fetchAccounts = async () => {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) return;
       const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
       if (!profile) return;
       
       // Banks
       const { data: banks } = await supabase.from('bank_accounts').select('id, account_name').eq('company_id', profile.company_id);
       if (banks) setBankAccounts(banks);
       
       // Receivables (Assets)
       const { data: accounts } = await supabase
         .from('chart_of_accounts')
         .select('id, account_name, account_code')
         .eq('company_id', profile.company_id)
         .eq('account_type', 'asset') 
         .eq('is_active', true);
         
       if (accounts) {
         setReceivableAccounts(accounts);
         // Auto-select "1430 Deposits Paid"
         const depositAcc = accounts.find(a => a.account_code === '1430');
         if (depositAcc) {
            setSelectedReceivableId(depositAcc.id);
         }
       }

       // Credit Accounts for Returns (Assets or Expenses)
       const { data: cAccounts } = await supabase
         .from('chart_of_accounts')
         .select('id, account_name, account_code, account_type')
         .eq('company_id', profile.company_id)
         .or('account_type.eq.asset,account_type.eq.expense')
         .eq('is_active', true);
        
       if (cAccounts) setCreditAccounts(cAccounts);
    };
    fetchAccounts();
  }, []);

  const handleDeposit = async () => {
    if (!depositSupplier || !selectedBankId || !selectedReceivableId || !depositAmount) {
       toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
       return;
    }
    
    setIsDepositing(true);
    try {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) return;
       const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
       
       // 1. Find GL Account for Bank
       // Try to find a GL account with the same name as the bank account
       const selectedBank = bankAccounts.find(b => b.id === selectedBankId);
       let bankGLId = "";
       
       if (selectedBank) {
          const { data: glAccounts } = await supabase
             .from('chart_of_accounts')
             .select('id')
             .eq('company_id', profile!.company_id)
             .ilike('account_name', selectedBank.account_name)
             .maybeSingle();
             
          if (glAccounts) {
             bankGLId = glAccounts.id;
          } else {
             // Fallback: Find any asset account with 'bank' in name or code 1100
             const { data: fallback } = await supabase
                .from('chart_of_accounts')
                .select('id')
                .eq('company_id', profile!.company_id)
                .or('account_code.eq.1100,account_name.ilike.%bank%')
                .limit(1)
                .maybeSingle();
                
             if (fallback) bankGLId = fallback.id;
          }
       }
       
       if (!bankGLId) {
          // If still no GL account, we can't post double entry properly
          throw new Error("Could not find a GL Account for the selected Bank. Please ensure Chart of Accounts has a Bank account.");
       }

       const refNum = `DEP-${depositSupplier.id}-${Date.now()}`;

       // 2. Create Transaction
             const { data: tx, error: txError } = await supabase.from('transactions').insert({
                company_id: profile!.company_id,
                user_id: user.id,
                transaction_date: depositDate,
                description: depositDescription ? `${depositDescription} - ${depositSupplier.name}` : `Supplier Deposit - ${depositSupplier.name}`,
                reference_number: refNum,
                total_amount: parseFloat(depositAmount),
                transaction_type: 'deposit',
                status: 'pending', // Pending first, then posted after entries
                bank_account_id: selectedBankId,
                // @ts-ignore
                supplier_id: depositSupplier.id
             }).select('id').single();
       
       if (txError) throw txError;
       
       // 3. Entries: CR Bank, DR Receivable
       const entries = [
          {
             transaction_id: tx.id,
             account_id: bankGLId, // Credit Bank
             credit: parseFloat(depositAmount),
             debit: 0,
             description: `Deposit to ${depositSupplier.name}`,
             status: 'approved'
          },
          {
             transaction_id: tx.id,
             account_id: selectedReceivableId, // Debit Receivable
             credit: 0,
             debit: parseFloat(depositAmount),
             description: `Deposit to ${depositSupplier.name}`,
             status: 'approved'
          }
       ];
       
       const { error: entriesError } = await supabase.from('transaction_entries').insert(entries);
       if (entriesError) throw entriesError;
       
       // 4. Ledger Entries
       const ledgerEntries = entries.map(e => ({
          company_id: profile!.company_id,
          transaction_id: tx.id,
          account_id: e.account_id,
          debit: e.debit,
          credit: e.credit,
          entry_date: depositDate,
          description: e.description,
          is_reversed: false,
          reference_id: refNum
       }));
       
       const { error: ledgerError } = await supabase.from('ledger_entries').insert(ledgerEntries);
       if (ledgerError) throw ledgerError;

       // 5. Update Transaction Status
       const { error: updateError } = await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id);
       if (updateError) throw updateError;
       
       // 6. Update Bank Balance
       await supabase.rpc('update_bank_balance', { 
          _bank_account_id: selectedBankId, 
          _amount: parseFloat(depositAmount), 
          _operation: 'subtract' 
       });
       
       // 7. Create a Credit Note (Negative Bill) to track the deposit in Supplier Balance
       /*
       // Disabling Bills creation as per user request (module hidden)
       const { error: billError } = await supabase.from('bills').insert({
          company_id: profile!.company_id,
          supplier_id: depositSupplier.id,
          bill_date: depositDate,
          bill_number: refNum,
          total_amount: -parseFloat(depositAmount), // Negative amount for credit
          subtotal: -parseFloat(depositAmount),
          tax_amount: 0,
          status: 'open', // Open so it counts towards balance (reduces liability)
          notes: depositDescription || `Deposit to ${depositSupplier.name}`
       });

       if (billError) throw billError;
       */
       
       toast({ title: "Success", description: "Deposit recorded successfully" });
       setDepositOpen(false);
       setDepositAmount("");
       setDepositDescription("");
       setSelectedBankId("");
       setSelectedReceivableId("");
       refresh(); // Refresh list
    } catch (e: any) {
       console.error(e);
       toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
       setIsDepositing(false);
    }
  };

  const handleCreateReturn = async () => {
    if (!returnSupplier || !selectedCreditAccountId || !returnAmount) {
       toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
       return;
    }

    if (returnType === 'refund' && !selectedBankId) {
        toast({ title: "Error", description: "Please select a bank account for the refund", variant: "destructive" });
        return;
    }
    
    setIsReturning(true);
    try {
       const { data: { user } } = await supabase.auth.getUser();
       if (!user) return;
       const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
       
       let debitAccountId = "";

       if (returnType === 'credit_note') {
           // Find AP Account
           const { data: accounts } = await supabase
             .from('chart_of_accounts')
             .select('id, account_name, account_type, account_code')
             .eq('company_id', profile!.company_id)
             .eq('is_active', true);

           const list = (accounts || []).map(a => ({ id: String(a.id), name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
           const pick = (type: string, codes: string[], names: string[]) => {
             const byCode = list.find(a => a.type === type && codes.includes(a.code));
             if (byCode) return byCode.id;
             const byName = list.find(a => a.type === type && names.some(n => a.name.includes(n)));
             if (byName) return byName.id;
             return "";
           };
           
           debitAccountId = pick('liability', ['2000'], ['accounts payable','payable']);
           if (!debitAccountId) throw new Error("Could not find Accounts Payable account.");
       } else {
           // Refund: Find Bank GL Account
           const selectedBank = bankAccounts.find(b => b.id === selectedBankId);
           if (selectedBank) {
              const { data: glAccounts } = await supabase
                 .from('chart_of_accounts')
                 .select('id')
                 .eq('company_id', profile!.company_id)
                 .ilike('account_name', selectedBank.account_name)
                 .maybeSingle();
                 
              if (glAccounts) {
                 debitAccountId = glAccounts.id;
              } else {
                 const { data: fallback } = await supabase
                    .from('chart_of_accounts')
                    .select('id')
                    .eq('company_id', profile!.company_id)
                    .or('account_code.eq.1100,account_name.ilike.%bank%')
                    .limit(1)
                    .maybeSingle();
                 if (fallback) debitAccountId = fallback.id;
              }
           }
           if (!debitAccountId) throw new Error("Could not find a GL Account for the selected Bank.");
       }

       const refNum = `RET-${Date.now()}`;

       // Transaction
       const { data: tx, error: txError } = await supabase.from('transactions').insert({
          company_id: profile!.company_id,
          user_id: user.id,
          transaction_date: returnDate,
          description: returnDescription || `Return to ${returnSupplier.name} (${returnType === 'refund' ? 'Refund' : 'Credit Note'})`,
          reference_number: refNum,
          total_amount: parseFloat(returnAmount),
          transaction_type: 'refund',
          status: 'pending',
          // @ts-ignore
          supplier_id: returnSupplier.id,
          bank_account_id: returnType === 'refund' ? selectedBankId : null
       }).select('id').single();
       
       if (txError) throw txError;
       
       // Entries: 
       // If Credit Note: DR AP (Decrease Liability), CR Expense/Asset (Decrease Asset/Expense)
       // If Refund: DR Bank (Increase Asset), CR Expense/Asset (Decrease Asset/Expense)
       
       const entries = [
          {
             transaction_id: tx.id,
             account_id: debitAccountId, // Debit AP or Bank
             credit: 0,
             debit: parseFloat(returnAmount),
             description: `Return to ${returnSupplier.name}`,
             status: 'approved'
          },
          {
             transaction_id: tx.id,
             account_id: selectedCreditAccountId, // Credit Asset/Expense
             credit: parseFloat(returnAmount),
             debit: 0,
             description: `Return to ${returnSupplier.name}`,
             status: 'approved'
          }
       ];
       
       const { error: entriesError } = await supabase.from('transaction_entries').insert(entries);
       if (entriesError) throw entriesError;
       
       // Ledger
       const ledgerEntries = entries.map(e => ({
          company_id: profile!.company_id,
          transaction_id: tx.id,
          account_id: e.account_id,
          debit: e.debit,
          credit: e.credit,
          entry_date: returnDate,
          description: e.description,
          is_reversed: false,
          reference_id: refNum
       }));
       
       const { error: ledgerError } = await supabase.from('ledger_entries').insert(ledgerEntries);
       if (ledgerError) throw ledgerError;

       // Update Status to Posted
       await supabase.from('transactions').update({ status: 'posted' }).eq('id', tx.id);
       
       // If Refund, update bank balance
       if (returnType === 'refund') {
            await supabase.rpc('update_bank_balance', { 
              _bank_account_id: selectedBankId, 
              _amount: parseFloat(returnAmount), 
              _operation: 'add' // Refund increases bank balance
           });
       }
       
       toast({ title: "Success", description: "Return recorded successfully" });
       setReturnOpen(false);
       setReturnAmount("");
       setReturnDescription("");
       setSelectedCreditAccountId("");
       setReturnType("credit_note");
       setSelectedBankId("");
       refresh();
    } catch (e: any) {
       console.error(e);
       toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
       setIsReturning(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const filteredSuppliers = useMemo(() => {
    let result = suppliers;
    
    if (viewFilter !== 'all') {
      if (viewFilter === 'active') {
        result = result.filter(s => !s.name.startsWith('[INACTIVE]'));
      } else if (viewFilter === 'inactive') {
        result = result.filter(s => s.name.startsWith('[INACTIVE]'));
      }
    }
    
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(lower) || 
        (s.email && s.email.toLowerCase().includes(lower)) ||
        (s.phone && s.phone.includes(lower)) ||
        (s.tax_number && s.tax_number.includes(lower))
      );
    }

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (aValue === bValue) return 0;
        if (aValue === undefined || aValue === null) return 1;
        if (bValue === undefined || bValue === null) return -1;
        
        const comparison = aValue < bValue ? -1 : 1;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }
    
    return result;
  }, [suppliers, searchTerm, sortConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }

    try {
      if (formData.phone) {
        const { isTenDigitPhone } = await import("@/lib/validators");
        if (!isTenDigitPhone(formData.phone)) {
          toast({ title: "Invalid phone", description: "Phone number must be 10 digits", variant: "destructive" });
          return;
        }
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();

      const insertPayload: any = {
        company_id: profile!.company_id,
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        tax_number: formData.tax_number || null,
        category: formData.category,
      };

      if (editingId) {
          const { error } = await supabase.from('suppliers').update(insertPayload).eq('id', editingId);
          if (error) throw error;
          setSuccessMessage("Supplier updated successfully");
      } else {
          let { error, data: inserted } = await supabase.from("suppliers").insert(insertPayload).select('id').single();

          // Fallback for schema cache issues where category column might not be recognized
          if (error && (error.message.includes("schema cache") || error.message.includes("column"))) {
             delete insertPayload.category;
             const retry = await supabase.from("suppliers").insert(insertPayload).select('id').single();
             error = retry.error;
             inserted = retry.data;
             if (!error) {
                 toast({ title: "Note", description: "Supplier added, but category was omitted due to system update pending.", variant: "default" });
             }
          }

          if (error) throw error;
          
          // Post opening balance logic (only for new suppliers)
          try {
            const obAmt = Number(formData.opening_balance || 0);
            if (obAmt > 0) {
              const { data: accounts } = await supabase
                .from('chart_of_accounts')
                .select('id, account_name, account_type, account_code')
                .eq('company_id', profile!.company_id)
                .eq('is_active', true);
              const list = (accounts || []).map(a => ({ id: String(a.id), name: String(a.account_name || '').toLowerCase(), type: String(a.account_type || '').toLowerCase(), code: String(a.account_code || '') }));
              const pick = (type: string, codes: string[], names: string[]) => {
                const byCode = list.find(a => a.type === type && codes.includes(a.code));
                if (byCode) return byCode.id;
                const byName = list.find(a => a.type === type && names.some(n => a.name.includes(n)));
                if (byName) return byName.id;
                const byType = list.find(a => a.type === type);
                return byType?.id || "";
              };
              const apId = pick('liability', ['2000'], ['accounts payable','payable']);
              const equityObId = pick('equity', ['3999'], ['opening balance','opening']);
              if (apId) {
                const { data: tx } = await supabase
                  .from('transactions')
                  .insert({
                    company_id: profile!.company_id,
                    user_id: user?.id,
                    transaction_date: formData.opening_balance_date,
                    description: `Opening balance for supplier ${formData.name}`,
                    reference_number: `SUP-OB-${inserted?.id || ''}`,
                    total_amount: obAmt,
                    transaction_type: 'opening',
                    status: 'posted'
                  })
                  .select('id')
                  .single();
                if (tx?.id) {
                  const rows = [
                    { transaction_id: tx.id, account_id: equityObId || pick('equity', [], ['equity']), debit: obAmt, credit: 0, description: 'Opening Balance Equity', status: 'approved' },
                    { transaction_id: tx.id, account_id: apId, debit: 0, credit: obAmt, description: 'Accounts Payable', status: 'approved' }
                  ];
                  await supabase.from('transaction_entries').insert(rows as any);
                  const ledgerRows = rows.map(r => ({ company_id: profile!.company_id, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: formData.opening_balance_date, is_reversed: false, transaction_id: tx.id, description: r.description }));
                  await supabase.from('ledger_entries').insert(ledgerRows as any);
                }
              }
            }
          } catch {}
          setSuccessMessage("Supplier added successfully");
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setDialogOpen(false);
        setEditingId(null);
      }, 2000);
      
      setFormData({ name: "", email: "", phone: "", address: "", tax_number: "", opening_balance: "", opening_balance_date: new Date().toISOString().slice(0, 10), category: "Local" });
      refresh();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeactivate = async () => {
    if (!supplierToDeactivate) return;
    if (!deactivateReason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason.", variant: "destructive" });
      return;
    }
    
    setIsDeactivating(true);
    try {
      const newName = `[INACTIVE] ${supplierToDeactivate.name}`;
      
      const { error } = await supabase
        .from('suppliers')
        .update({ 
            name: newName
        })
        .eq('id', supplierToDeactivate.id);
        
      if (error) throw error;
      toast({ title: "Success", description: "Supplier deactivated" });
      setDeactivateOpen(false);
      setSupplierToDeactivate(null);
      setDeactivateReason("");
      refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleActivate = async (supplier: Supplier) => {
    if (!confirm(`Are you sure you want to activate this supplier?`)) return;
    
    try {
      const newName = supplier.name.replace('[INACTIVE] ', '');
      
      const { error } = await supabase
        .from('suppliers')
        .update({ 
            name: newName
        })
        .eq('id', supplier.id);
        
      if (error) throw error;
      toast({ title: "Success", description: "Supplier activated" });
      refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;
    
    // Check for outstanding balances
    const suppliersWithBalance = suppliers.filter(s => selectedIds.includes(s.id) && (s.outstanding_balance || 0) > 0);
    
    if (suppliersWithBalance.length > 0) {
        toast({
            title: "Cannot Deactivate Some Suppliers",
            description: `${suppliersWithBalance.length} supplier(s) have outstanding balances and cannot be deactivated.`,
            variant: "destructive"
        });
        return;
    }

    if (!confirm(`Are you sure you want to deactivate ${selectedIds.length} suppliers?`)) return;

    setIsDeactivating(true);
    try {
        await Promise.all(selectedIds.map(async (id) => {
            const supplier = suppliers.find(s => s.id === id);
            if (!supplier) return;
            // Skip if already inactive
            if (supplier.name.startsWith('[INACTIVE]')) return;
            
            const newName = `[INACTIVE] ${supplier.name}`;
            await supabase.from('suppliers').update({ name: newName }).eq('id', id);
        }));
        
        toast({ title: "Success", description: `${selectedIds.length} suppliers deactivated` });
        setSelectedIds([]);
        refresh();
    } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
        setIsDeactivating(false);
    }
  };

  const canEdit = isAdmin || isAccountant;
  const [statementOpen, setStatementOpen] = useState<boolean>(false);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);

  return (
    <div className="space-y-4 p-4">
      {/* Refined Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border shadow-sm">
        {/* Search & Filters */}
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                <Info className="h-5 w-5" />
                <span className="sr-only">Info</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 p-4">
               <div className="space-y-2">
                 <h1 className="text-xl font-bold text-[#111827]">Suppliers</h1>
                 <p className="text-sm text-muted-foreground">
                   Manage your supplier relationships and accounts
                 </p>


    </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search suppliers..."
              className="pl-9 bg-white border-gray-200 focus:border-[#2563eb] focus:ring-[#2563eb]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={viewFilter} onValueChange={setViewFilter}>
               <SelectTrigger className="w-[180px] bg-white border-gray-200">
                   <div className="flex items-center gap-2">
                       <Filter className="h-4 w-4 text-muted-foreground" />
                       <span className="font-medium text-foreground">{viewFilter === 'all' ? 'All Suppliers' : viewFilter.charAt(0).toUpperCase() + viewFilter.slice(1)}</span>
                   </div>
               </SelectTrigger>
               <SelectContent>
                   <SelectItem value="all">All Suppliers</SelectItem>
                   <SelectItem value="active">Active</SelectItem>
                   <SelectItem value="inactive">Inactive</SelectItem>
               </SelectContent>
           </Select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
           {canEdit && (
               <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                 <DialogTrigger asChild>
                   <Button id="AddSupplierButton" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all duration-200 ease-in-out gap-2">
                     <Plus className="h-4 w-4" />
                     Add Supplier
                   </Button>
                 </DialogTrigger>
                 <DialogContent className="max-h-[90vh] overflow-y-auto">
                   <DialogHeader>
                     <DialogTitle>Add New Supplier</DialogTitle>
                   </DialogHeader>
                   <form onSubmit={handleSubmit} className="space-y-4">
                     <div>
                       <Label>Supplier Name *</Label>
                       <Input
                         id="SupplierNameInput"
                         value={formData.name}
                         onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                         placeholder="Supplier name"
                         required
                       />
                     </div>
                     <div>
                       <Label>Category</Label>
                       <Select
                         value={formData.category}
                         onValueChange={(value) => setFormData({ ...formData, category: value })}
                       >
                         <SelectTrigger>
                           <SelectValue placeholder="Select category" />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="Local">Local</SelectItem>
                           <SelectItem value="National">National</SelectItem>
                           <SelectItem value="International">International</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                     <div>
                       <Label>Email</Label>
                       <Input
                         type="email"
                         value={formData.email}
                         onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                         placeholder="supplier@email.com"
                       />
                     </div>
                     <div>
                       <Label>Phone</Label>
                       <Input
                         value={formData.phone}
                         onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                         placeholder="Phone number"
                       />
                     </div>
                     <div>
                       <Label>Address</Label>
                       <Input
                         value={formData.address}
                         onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                         placeholder="Physical address"
                       />
                     </div>
                     <div>
                       <Label>Tax Number</Label>
                       <Input
                         value={formData.tax_number}
                         onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                         placeholder="Tax registration number"
                       />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                       <div id="SupplierOpeningBalanceInput">
                        <Label>Opening Balance</Label>
                        <Input
                          type="number"
                          value={formData.opening_balance}
                          onChange={(e) => setFormData({ ...formData, opening_balance: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                       <div>
                         <Label>Opening Balance Date</Label>
                         <Input
                           type="date"
                           value={formData.opening_balance_date}
                           onChange={(e) => setFormData({ ...formData, opening_balance_date: e.target.value })}
                           />
                       </div>
                     </div>
                     <Button id="SaveSupplierButton" type="submit" className="w-full bg-[#2563eb] hover:bg-[#1d4ed8]">
                       Add Supplier
                     </Button>
                   </form>
                 </DialogContent>
               </Dialog>
           )}

        {/* Import Dialog */}
        <Dialog open={importOpen} onOpenChange={(open) => { if (!isImporting) setImportOpen(open); }}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                 <Upload className="h-5 w-5 text-blue-600" />
                 Importing Suppliers
              </DialogTitle>
              <DialogDescription>
                Drag and drop your file here or click to browse.
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-4 flex-1 overflow-hidden flex flex-col gap-4">
               {/* Drag and Drop Zone */}
               {!isImporting && importLogs.length === 0 && (
                  <div 
                    className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('import-excel-input')?.click()}
                  >
                     <Upload className={`h-12 w-12 mb-4 ${isDragActive ? 'text-blue-500' : 'text-gray-400'}`} />
                     <p className="text-sm font-medium text-gray-900">
                        {isDragActive ? "Drop the file here" : "Drag & drop your Excel file here"}
                     </p>
                     <p className="text-xs text-gray-500 mt-1">or click to browse</p>
                  </div>
               )}

               {/* Progress Bar (Only visible when importing) */}
               {(isImporting || importLogs.length > 0) && (
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
               )}

               {/* Logs Area (Only visible when importing) */}
               {(isImporting || importLogs.length > 0) && (
                 <div className="flex-1 border rounded-lg bg-slate-50 p-4 overflow-y-auto font-mono text-sm space-y-2 min-h-[200px]">
                    {importLogs.length === 0 && <span className="text-gray-400 italic">Waiting to start...</span>}
                    {importLogs.map((log, i) => (
                       <div key={i} className={`flex gap-2 animate-in slide-in-from-left-2 duration-300 ${
                          log.type === 'error' ? 'text-red-600' : 
                          log.type === 'success' ? 'text-green-600' : 
                          log.type === 'warning' ? 'text-amber-600' : 
                          'text-gray-700'
                       }`}>
                          <span className="shrink-0">
                             {log.type === 'success' && <Check className="h-4 w-4 mt-0.5" />}
                             {log.type === 'error' && <XCircle className="h-4 w-4 mt-0.5" />}
                             {log.type === 'warning' && <AlertTriangle className="h-4 w-4 mt-0.5" />}
                             {log.type === 'info' && <span className="w-4 h-4 inline-block" />} 
                          </span>
                          <span>{log.message}</span>
                       </div>
                    ))}
                    <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                 </div>
               )}
            </div>

            <DialogFooter>
              <Button onClick={() => setImportOpen(false)} disabled={isImporting}>
                {isImporting ? "Importing..." : "Close"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />
          <Button variant="outline" size="icon" className="h-9 w-9 border-gray-200 hover:bg-gray-50 text-gray-600" title="Print List" onClick={() => generatePDF(true)}>
            <Printer className="h-4 w-4" />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 border-gray-200 hover:bg-gray-50 text-gray-600" title="Download">
                <Download className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setImportOpen(true)} className="cursor-pointer">
                 <Upload className="mr-2 h-4 w-4" /> Import from Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => generatePDF(false)} className="cursor-pointer">
                <FileText className="mr-2 h-4 w-4" /> Export to PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input 
             type="file" 
             id="import-excel-input" 
             accept=".xlsx, .xls" 
             className="hidden" 
             onChange={handleImportFileChange} 
          />
        </div>
      </div>

      {/* Batch Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-[#eff6ff] border border-[#bfdbfe] px-4 py-3 rounded-lg text-[#1e40af]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-[#2563eb] text-white text-xs font-medium">
              {selectedIds.length}
            </div>
            <span className="text-sm font-medium">suppliers selected</span>
          </div>
          <div className="flex items-center gap-2">
             <Button 
               variant="ghost" 
               size="sm" 
               className="hover:bg-[#dbeafe] text-[#1e40af] hover:text-[#1e3a8a]"
               onClick={() => handleSelectAll(false)}
             >
               Cancel
             </Button>
             <div className="h-4 w-px bg-[#bfdbfe] mx-2" />
             <Button 
               variant="ghost" 
               size="sm"
               className="hover:bg-[#dbeafe] text-[#1e40af] hover:text-[#1e3a8a]"
               onClick={handleBatchDelete}
             >
               Delete
             </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No suppliers found.</p>
        </div>
      ) : (
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
           <Table>
               <TableHeader className="bg-[#4b5563] hover:bg-[#4b5563]">
                   <TableRow className="hover:bg-[#4b5563] border-none">
                       <TableHead className="w-[40px] text-white/90 h-10"><Checkbox className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-[#4b5563]" /></TableHead>
                       <TableHead className="text-white font-medium h-10 cursor-pointer" onClick={() => handleSort('name')}>Name <ArrowUpDown className="inline h-3 w-3 ml-1" /></TableHead>
                       <TableHead className="text-white font-medium h-10">Category</TableHead>
                       <TableHead className="text-white font-medium h-10 text-right" onClick={() => handleSort('outstanding_balance')}>Balance <ArrowUpDown className="inline h-3 w-3 ml-1" /></TableHead>
                       <TableHead className="text-white font-medium h-10">Contact Name</TableHead>
                       <TableHead className="text-white font-medium h-10">Telephone</TableHead>
                       <TableHead className="text-white font-medium h-10">Mobile</TableHead>
                       <TableHead className="text-white font-medium h-10 text-center">Status</TableHead>
                       <TableHead className="text-white font-medium h-10 text-right">Actions</TableHead>
                   </TableRow>
               </TableHeader>
               <TableBody>
                     {filteredSuppliers.slice(page * pageSize, page * pageSize + pageSize).map((supplier, i) => (
                         <TableRow key={supplier.id} className={`hover:bg-blue-50/50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                             <TableCell className="py-2">
                                 <Checkbox 
                                     checked={selectedIds.includes(supplier.id)}
                                     onCheckedChange={(checked) => handleSelectRow(supplier.id, !!checked)}
                                 />
                             </TableCell>
                             <TableCell className="py-2 font-medium text-[#2563eb]">{supplier.name}</TableCell>
                             <TableCell className="py-2 text-gray-600">{supplier.category || 'Local'}</TableCell>
                             <TableCell className="py-2 text-right">
                                 <span className={supplier.outstanding_balance && supplier.outstanding_balance < 0 ? "text-green-600 font-medium" : ""}>
                                   {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Math.abs(supplier.outstanding_balance || 0))}
                                   {supplier.outstanding_balance && supplier.outstanding_balance < 0 ? " (Cr)" : ""}
                                 </span>
                             </TableCell>
                             <TableCell className="py-2 text-gray-600">{supplier.name.split(' ')[0]}</TableCell>
                             <TableCell className="py-2 text-gray-600">{supplier.phone || '-'}</TableCell>
                             <TableCell className="py-2 text-gray-600">{supplier.phone || '-'}</TableCell>
                            <TableCell className="py-2 text-center">
                                {supplier.name.startsWith('[INACTIVE]') ? (
                                    <XCircle className="h-5 w-5 text-red-500 mx-auto" />
                                ) : (
                                    <Check className="h-5 w-5 text-green-500 mx-auto" />
                                )}
                            </TableCell>
                            <TableCell className="py-2 text-right">
                                 <DropdownMenu>
                                     <DropdownMenuTrigger asChild>
                                         <Button variant="ghost" size="sm" className="h-7 text-[#2563eb] hover:text-[#1d4ed8] hover:bg-blue-50">
                                             Actions <ChevronDown className="h-3 w-3 ml-1" />
                                         </Button>
                                     </DropdownMenuTrigger>
                                     <DropdownMenuContent align="end">
                                         <DropdownMenuItem onClick={() => { setStatementSupplier(supplier); setStatementOpen(true); }}>
                                          Quick View
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleEdit(supplier)}>Edit</DropdownMenuItem>
                                       {supplier.name.startsWith('[INACTIVE]') ? (
                                           <DropdownMenuItem onClick={() => handleActivate(supplier)} className="text-green-600">Activate</DropdownMenuItem>
                                       ) : (
                                           <DropdownMenuItem onClick={() => {
                                               setSupplierToDeactivate(supplier);
                                               setDeactivateOpen(true);
                                           }} className="text-red-600">Delete</DropdownMenuItem>
                                       )}
                                       <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => {
                                           if (checkSupplierActive(supplier, "create a purchase order")) {
                                               navigate(`/purchase?tab=orders&action=new-order&supplierId=${supplier.id}`);
                                           }
                                       }}>Add Purchase Order</DropdownMenuItem>
                                       <DropdownMenuItem onClick={() => {
                                           if (checkSupplierActive(supplier, "create a supplier invoice")) {
                                               navigate(`/purchase?tab=orders&action=new-order&supplierId=${supplier.id}`);
                                           }
                                       }}>Add Supplier Invoice</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => { 
                                            if (checkSupplierActive(supplier, "add a deposit")) {
                                                setDepositSupplier(supplier); 
                                                setDepositOpen(true); 
                                            }
                                        }}>
                                          Deposit
                                        </DropdownMenuItem>
                                         <DropdownMenuItem onClick={() => { 
                                             if (checkSupplierActive(supplier, "process a return")) {
                                                 setReturnSupplier(supplier); 
                                                 setReturnOpen(true); 
                                             }
                                         }}>
                                            Return
                                         </DropdownMenuItem>
                                         <DropdownMenuItem onClick={() => { setStatementSupplier(supplier); setStatementOpen(true); }}>
                                            View Statement
                                         </DropdownMenuItem>
                                     </DropdownMenuContent>
                                 </DropdownMenu>
                             </TableCell>
                         </TableRow>
                     ))}
               </TableBody>
           </Table>
      </div>
      )}
      
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-gray-500">
            Showing {filteredSuppliers.length === 0 ? 0 : (page * pageSize) + 1} to {Math.min((page + 1) * pageSize, filteredSuppliers.length)} of {filteredSuppliers.length} entries
        </div>
        <div className="flex items-center gap-2">
          <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="h-8 w-8 p-0"
          >
              <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="h-8 w-8 p-0"
          >
              <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
              <Button variant="default" size="sm" className="h-8 w-8 bg-[#2563eb]">{page + 1}</Button>
          </div>
          <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(Math.min(Math.ceil(filteredSuppliers.length / pageSize) - 1, page + 1))}
              disabled={(page + 1) >= Math.ceil(filteredSuppliers.length / pageSize)}
              className="h-8 w-8 p-0"
          >
              <ChevronRight className="h-4 w-4" />
          </Button>
          <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(Math.ceil(filteredSuppliers.length / pageSize) - 1)}
              disabled={(page + 1) >= Math.ceil(filteredSuppliers.length / pageSize)}
              className="h-8 w-8 p-0"
          >
              <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

        <SupplierStatement
          supplierId={statementSupplier?.id || ""}
          supplierName={statementSupplier?.name || ""}
          open={statementOpen}
          onOpenChange={(v) => { setStatementOpen(v); if (!v) setStatementSupplier(null); }}
        />

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

        <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
          <DialogContent className="sm:max-w-[500px]">
            {(supplierToDeactivate?.outstanding_balance || 0) !== 0 ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Cannot Deactivate Supplier
                  </DialogTitle>
                  <DialogDescription className="pt-2">
                    This supplier has an outstanding balance.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-6">
                  <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-red-800 text-sm font-medium flex gap-3 items-start">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      You cannot deactivate <strong>{supplierToDeactivate?.name}</strong> because they have an outstanding balance of 
                      <span className="font-bold ml-1">
                        {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(supplierToDeactivate?.outstanding_balance || 0)}
                      </span>.
                      <br /><br />
                      Please settle all outstanding amounts before deactivating this supplier.
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeactivateOpen(false)} className="w-full">Close</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="text-amber-600 flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Deactivate Supplier
                  </DialogTitle>
                  <DialogDescription className="pt-2">
                    This will mark the supplier as inactive. They cannot be deleted for audit purposes.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-sm font-medium flex gap-3 items-start">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      For audit compliance, suppliers cannot be deleted. Use this form to deactivate them.
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Reason for Deactivation</Label>
                    <Textarea 
                      value={deactivateReason} 
                      onChange={(e) => setDeactivateReason(e.target.value)} 
                      placeholder="Reason for deactivation..."
                      className="min-h-[80px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Supporting Document (Optional)</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => document.getElementById('supplier-file-upload')?.click()}>
                      <input type="file" id="supplier-file-upload" className="hidden" onChange={handleFileChange} />
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Upload className="h-8 w-8 opacity-50" />
                        <span className="text-sm">Click to upload document</span>
                        {file && <span className="text-xs text-primary font-medium">{file.name}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setDeactivateOpen(false)} className="w-full sm:w-auto">Dismiss</Button>
                  <Button 
                    onClick={handleDeactivate}
                    disabled={isDeactivating || !deactivateReason.trim()}
                    className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {isDeactivating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <History className="mr-2 h-4 w-4" />
                        Confirm Deactivation
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
          <DialogContent className="sm:max-w-[500px]">
             <DialogHeader>
                <DialogTitle>Record Supplier Deposit</DialogTitle>
                <DialogDescription>
                   Record a prepayment/deposit to {depositSupplier?.name}.
                </DialogDescription>
             </DialogHeader>
             <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                   <Label>Bank Account (Credit)</Label>
                   <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                      <SelectTrigger>
                         <SelectValue placeholder="Select Bank Account" />
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
                <div className="grid gap-2">
                   <Label>Receivable Account (Debit)</Label>
                   <Select 
                      value={selectedReceivableId} 
                      onValueChange={setSelectedReceivableId}
                      disabled={!!receivableAccounts.find(a => a.account_code === '1430' && a.id === selectedReceivableId)}
                   >
                      <SelectTrigger>
                         <SelectValue placeholder="Select Receivable Account" />
                      </SelectTrigger>
                      <SelectContent>
                         {receivableAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                               {acc.account_name} ({acc.account_code})
                            </SelectItem>
                         ))}
                      </SelectContent>
                   </Select>
                </div>
                <div className="grid gap-2">
                   <Label>Amount</Label>
                   <Input 
                      type="number" 
                      value={depositAmount} 
                      onChange={(e) => setDepositAmount(e.target.value)} 
                      placeholder="0.00" 
                   />
                </div>
                <div className="grid gap-2">
                   <Label>Date</Label>
                   <Input 
                      type="date" 
                      value={depositDate} 
                      onChange={(e) => setDepositDate(e.target.value)} 
                   />
                </div>
                <div className="grid gap-2">
                   <Label>Description</Label>
                   <Input 
                      value={depositDescription} 
                      onChange={(e) => setDepositDescription(e.target.value)} 
                      placeholder="Optional description" 
                   />
                </div>
             </div>
             <DialogFooter>
                <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
                <Button onClick={handleDeposit} disabled={isDepositing}>
                   {isDepositing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                   {isDepositing ? "Processing..." : "Confirm Deposit"}
                </Button>
             </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
          <DialogContent className="sm:max-w-[500px]">
             <DialogHeader>
                <DialogTitle>Create Supply Return</DialogTitle>
                <DialogDescription>
                   Record a return to {returnSupplier?.name}.
                </DialogDescription>
             </DialogHeader>
             <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                   <Label>Return Type</Label>
                   <Select value={returnType} onValueChange={(v: any) => setReturnType(v)}>
                      <SelectTrigger>
                         <SelectValue placeholder="Select Return Type" />
                      </SelectTrigger>
                      <SelectContent>
                         <SelectItem value="credit_note">Credit Note (Decrease Account Payable)</SelectItem>
                         <SelectItem value="refund">Refund (Increase Bank)</SelectItem>
                      </SelectContent>
                   </Select>
                </div>
                
                {returnType === 'refund' && (
                    <div className="grid gap-2">
                       <Label>Bank Account</Label>
                       <Select value={selectedBankId} onValueChange={setSelectedBankId}>
                          <SelectTrigger>
                             <SelectValue placeholder="Select Bank Account" />
                          </SelectTrigger>
                          <SelectContent>
                             {bankAccounts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                   {acc.account_name}
                                </SelectItem>
                             ))}
                          </SelectContent>
                       </Select>
                    </div>
                )}

                <div className="grid gap-2">
                   <Label>Credit Account (Asset/Expense to decrease)</Label>
                   <Select value={selectedCreditAccountId} onValueChange={setSelectedCreditAccountId}>
                      <SelectTrigger>
                         <SelectValue placeholder="Select Account" />
                      </SelectTrigger>
                      <SelectContent>
                         {creditAccounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                               {acc.account_name} ({acc.account_code})
                            </SelectItem>
                         ))}
                      </SelectContent>
                   </Select>
                </div>
                <div className="grid gap-2">
                   <Label>Amount</Label>
                   <Input 
                      type="number" 
                      value={returnAmount} 
                      onChange={(e) => setReturnAmount(e.target.value)} 
                      placeholder="0.00" 
                   />
                </div>
                <div className="grid gap-2">
                   <Label>Date</Label>
                   <Input 
                      type="date" 
                      value={returnDate} 
                      onChange={(e) => setReturnDate(e.target.value)} 
                   />
                </div>
                <div className="grid gap-2">
                   <Label>Description</Label>
                   <Input 
                      value={returnDescription} 
                      onChange={(e) => setReturnDescription(e.target.value)} 
                      placeholder="Reason for return" 
                   />
                </div>
             </div>
             <DialogFooter>
                <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateReturn} disabled={isReturning} variant="destructive">
                   {isReturning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                   {isReturning ? "Processing..." : "Confirm Return"}
                </Button>
             </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Supplier Statement Modal */}
        {statementSupplier && (
          <SupplierStatement
            open={statementOpen}
            onOpenChange={(open) => {
              setStatementOpen(open);
              if (!open) setStatementSupplier(null);
            }}
            supplierId={statementSupplier.id}
            supplierName={statementSupplier.name}
          />
        )}
        <Dialog open={inactiveWarningOpen} onOpenChange={setInactiveWarningOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <XCircle className="h-5 w-5" />
                Action Not Allowed
              </DialogTitle>
              <DialogDescription>
                {inactiveActionMessage}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-gray-500">
                This supplier is currently marked as inactive. Please activate the supplier first if you wish to proceed with this action.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => setInactiveWarningOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
};
