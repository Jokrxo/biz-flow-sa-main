import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Download, Upload, AlertCircle, Check, XCircle, AlertTriangle, Construction } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Papa from "papaparse";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { calculateDepreciation } from "@/components/FixedAssets/DepreciationCalculator";
import { cn } from "@/lib/utils";

export type ImportType = 'supplier' | 'purchase-order' | 'invoice' | 'asset';

interface CSVImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  type: ImportType;
}

export function CSVImportDialog({ isOpen, onClose, type }: CSVImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [importProgress, setImportProgress] = useState(0);
  const [importLogs, setImportLogs] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' }[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === "text/csv" || droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile);
        toast({ title: "File Selected", description: droppedFile.name });
      } else {
        toast({ 
          title: "Invalid File", 
          description: "Please upload a CSV file", 
          variant: "destructive" 
        });
      }
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'supplier': return 'Suppliers';
      case 'purchase-order': return 'Purchase Orders';
      case 'invoice': return 'Supplier Invoices';
      case 'asset': return 'Assets';
      default: return 'Data';
    }
  };

  const handleDownloadTemplate = () => {
    let headers = "";
    let example = "";
    let filename = "";

    switch (type) {
      case 'supplier':
        headers = "Name,Email,Phone,Address,Tax Number,Category";
        example = "Acme Supplies,contact@acmesupplies.com,1234567890,123 Industrial Park,4000123456,Raw Materials";
        filename = "supplier_import_template.csv";
        break;
      case 'purchase-order':
        headers = "Supplier Name,Doc. No.,Order Number,Date,Total,Printed,Status";
        example = "Falcon Bicycle Fittings,PO0000001,,03/02/2026,230.0000,No,Overdue";
        filename = "purchase_order_import_template.csv";
        break;
      case 'invoice':
        headers = "Supplier Name,Invoice Number,Document Number,Date,Due Date,Total,Status,Items (JSON),Notes";
        example = "Acme Supplies,INV-2024-001,,2024-03-20,2024-04-20,5000.00,pending,\"[{'description':'Raw Material A','quantity':100,'unit_price':50}]\",Standard invoice";
        filename = "supplier_invoice_import_template.csv";
        break;
      case 'asset':
        headers = "Description,Asset Type,Purchase Date,Cost,Useful Life (Years),Status";
        example = "MacBook Pro M3,Computer Equipment,2024-01-15,35000.00,3,active";
        filename = "asset_import_template.csv";
        break;
    }

    const csvContent = `${headers}\n${example}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const getCompanyId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.company_id) throw new Error("No company profile found");
    return profile.company_id;
  };

  const parseJSON = (jsonStr: string) => {
    try {
      // Handle single quotes which are common in CSV manual entry but invalid JSON
      const validJson = jsonStr.replace(/'/g, '"');
      return JSON.parse(validJson);
    } catch (e) {
      console.error("JSON Parse error", e);
      return [];
    }
  };

  const processSuppliers = async (data: any[], companyId: string) => {
    let successCount = 0;
    const rows = data.filter(r => r && r['Name']);
    const total = rows.length;
    if (total === 0) throw new Error("No valid supplier data found");
    setImportLogs([{ message: "Reading your file... just a moment.", type: 'info' }]);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row['Name']).trim();
      const payload: any = {
        company_id: companyId,
        name,
        email: row['Email'],
        phone: row['Phone'],
        address: row['Address'],
        tax_number: row['Tax Number'],
        category: row['Category']
      };
      try {
        const { error: insertError } = await supabase.from('suppliers').insert(payload);
        if (insertError) {
          if (insertError.message.includes("schema cache") || insertError.message.includes("column") || insertError.message.includes("Could not find the 'category' column")) {
            const { error: retryError } = await supabase.from('suppliers').insert({
              company_id: companyId,
              name,
              email: row['Email'],
              phone: row['Phone'],
              address: row['Address'],
              tax_number: row['Tax Number']
            });
            if (retryError) throw retryError;
          } else {
            throw insertError;
          }
        }
        setImportLogs(prev => [...prev, { message: `Added ${name}`, type: 'success' }]);
        successCount++;
      } catch (e: any) {
        setImportLogs(prev => [...prev, { message: `Couldn't add ${name}: ${e.message || 'Error'}`, type: 'error' }]);
      }
      const progress = Math.round(((i + 1) / total) * 100);
      setImportProgress(progress);
      await new Promise(res => setTimeout(res, 800));
    }
    setImportLogs(prev => [...prev, { message: "If opening balances were not captured automatically, please adjust them manually.", type: 'warning' }]);
    return successCount;
  };

  const processPurchaseOrders = async (data: any[], companyId: string) => {
    let successCount = 0;
    setImportLogs([{ message: "Starting purchase order import...", type: 'info' }]);
    
    // 1. Fetch all suppliers with comprehensive details for smart matching
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name, email, tax_number')
      .eq('company_id', companyId);
    
    const supplierList = suppliers || [];

    // Smart lookup function: checks Name, then Email, then Tax Number
    const findSupplier = (row: any) => {
      const name = String(row['Supplier Name'] || '').trim().toLowerCase();
      // Check for other potential identifying columns in the CSV
      const email = String(row['Email'] || row['Supplier Email'] || '').trim().toLowerCase();
      const tax = String(row['Tax Number'] || row['Tax ID'] || '').trim().toLowerCase();

      return supplierList.find(s => 
        (name && String(s.name || '').trim().toLowerCase() === name) ||
        (email && String(s.email || '').trim().toLowerCase() === email) ||
        (tax && String(s.tax_number || '').trim().toLowerCase() === tax)
      );
    };

    const parseDate = (val: string) => {
      if (!val) return null;
      const v = String(val).trim();
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
        const [d, m, y] = v.split('/');
        return `${y}-${m}-${d}`;
      }
      return v;
    };

    const rows = data.filter(r => r && r['Supplier Name']);
    const totalRows = rows.length;

    // 2. Pre-scan for missing suppliers
    const missingSuppliers = new Set<string>();
    for (const row of rows) {
      const supplierName = String(row['Supplier Name'] || '').trim();
      if (!supplierName) continue;
      
      const supplier = findSupplier(row);
      if (!supplier) {
        missingSuppliers.add(supplierName);
      }
    }

    // 3. Abort if missing suppliers found
    if (missingSuppliers.size > 0) {
      const missingList = Array.from(missingSuppliers).join(', ');
      setImportLogs(prev => [
        ...prev, 
        { message: `Validation Failed: The following suppliers do not exist in the system: ${missingList}.`, type: 'error' },
        { message: "Please create these suppliers first before importing orders.", type: 'warning' }
      ]);
      return 0; // Stop execution
    }

    // 4. Process Rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const supplierName = String(row['Supplier Name'] || '').trim();
      
      const supplier = findSupplier(row);
      // Should exist due to pre-scan, but safe check
      if (!supplier) continue; 
      
      const supplierId = supplier.id;

      const poNumber = row['Doc. No.'] || row['PO Number'] || row['Order Number'];
      const poDate = parseDate(String(row['Date'] || ''));
      const total = Number(String(row['Total'] || '0').replace(/[^0-9.-]/g, '')) || 0;
      // Force status to be 'placed order' as per user requirement, ignoring CSV status column if present
      const status = 'placed order';
      const printed = String(row['Printed'] || '').toLowerCase();
      const notes = row['Notes'] || (printed ? `Printed: ${printed}` : null);
      try {
        const { error: poError } = await supabase
          .from('purchase_orders')
          .insert({
            company_id: companyId,
            supplier_id: supplierId,
            po_number: String(poNumber || `PO-${Date.now()}`),
            po_date: String(poDate || new Date().toISOString().slice(0, 10)),
            status,
            subtotal: total,
            total_amount: total,
            notes: notes
          });
        if (poError) throw poError;
        setImportLogs(prev => [...prev, { message: `Added PO ${String(poNumber || '').trim() || '(auto)'} for ${supplierName}`, type: 'success' }]);
        successCount++;
      } catch (e: any) {
        setImportLogs(prev => [...prev, { message: `Couldn't add PO ${String(poNumber || '').trim() || '(auto)'} for ${supplierName}: ${e.message || 'Error'}`, type: 'error' }]);
      }
      const progress = Math.round(((i + 1) / totalRows) * 100);
      setImportProgress(progress);
      await new Promise(res => setTimeout(res, 300)); // Slightly faster delay
    }
    return successCount;
  };

  const processInvoices = async (data: any[], companyId: string) => {
    let successCount = 0;
    setImportLogs([{ message: "Starting invoice import...", type: 'info' }]);
    
    // 1. Fetch suppliers with details for smart matching
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name, email, tax_number')
      .eq('company_id', companyId);
      
    const supplierList = suppliers || [];

    // Smart lookup function
    const findSupplier = (row: any) => {
      const name = String(row['Supplier Name'] || '').trim().toLowerCase();
      const email = String(row['Email'] || row['Supplier Email'] || '').trim().toLowerCase();
      const tax = String(row['Tax Number'] || row['Tax ID'] || '').trim().toLowerCase();

      return supplierList.find(s => 
        (name && String(s.name || '').trim().toLowerCase() === name) ||
        (email && String(s.email || '').trim().toLowerCase() === email) ||
        (tax && String(s.tax_number || '').trim().toLowerCase() === tax)
      );
    };

    // Pre-scan for missing suppliers
    const missingSuppliers = new Set<string>();
    const rows = data.filter(r => r && r['Supplier Name']);
    
    for (const row of rows) {
      const supplierName = String(row['Supplier Name'] || '').trim();
      if (!supplierName) continue;
      
      const supplier = findSupplier(row);
      if (!supplier) {
        missingSuppliers.add(supplierName);
      }
    }

    if (missingSuppliers.size > 0) {
      const missingList = Array.from(missingSuppliers).join(', ');
      setImportLogs(prev => [
        ...prev, 
        { message: `Validation Failed: The following suppliers do not exist: ${missingList}.`, type: 'error' },
        { message: "Please create these suppliers first.", type: 'warning' }
      ]);
      return 0;
    }

    // Fetch necessary accounts for Ledger Posting
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code')
      .eq('company_id', companyId)
      .eq('is_active', true);
    
    const accountList = (accounts || []).map(a => ({ 
      id: String(a.id), 
      name: String(a.account_name || '').toLowerCase(), 
      type: String(a.account_type || '').toLowerCase(), 
      code: String(a.account_code || '') 
    }));

    const pickAccount = (type: string, codes: string[], names: string[]) => {
      const byCode = accountList.find(a => a.type === type && codes.includes(a.code));
      if (byCode) return byCode.id;
      const byName = accountList.find(a => a.type === type && names.some(n => a.name.includes(n)));
      if (byName) return byName.id;
      // Fallback: any account of that type
      const byType = accountList.find(a => a.type === type);
      return byType?.id;
    };

    // Credit Account: Accounts Payable (Liability)
    const apId = pickAccount('liability', ['2000'], ['accounts payable', 'payable']);
    
    // Debit Account: Inventory (Asset) or Cost of Goods Sold (Expense)
    // Defaulting to Inventory for now as per typical flow
    const invId = pickAccount('asset', ['1300'], ['inventory', 'stock']);

    if (!apId || !invId) {
      setImportLogs(prev => [...prev, { message: "Warning: Could not find Accounts Payable or Inventory accounts. Ledger entries will be skipped.", type: 'warning' }]);
    }

    const { data: { user } } = await supabase.auth.getUser();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const supplierName = String(row['Supplier Name'] || '').trim();
      
      const supplier = findSupplier(row);
      if (!supplier) continue; // Should be caught by pre-scan
      const supplierId = supplier.id;

      const items = parseJSON(row['Items (JSON)'] || '[]');
      let subtotal = 0;
      
      if (items.length > 0) {
        subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.quantity) * Number(item.unit_price)), 0);
      } else {
        // Fallback for summary CSVs (like SupplierInvoiceExport) where no items exist
        // Clean currency string (remove currency symbols, keep digits and dots)
        const totalStr = String(row['Total'] || row['Amount'] || '0').replace(/[^0-9.-]/g, '');
        subtotal = Number(totalStr) || 0;
      }

      // Create Bill Header
      const { data: bill, error: billError } = await supabase
        .from('bills')
        .insert({
          company_id: companyId,
          supplier_id: supplierId,
          bill_number: row['Invoice Number'] || row['Document Number'],
          bill_date: row['Date'],
          due_date: row['Due Date'],
          status: String(row['Status'] || 'pending').toLowerCase(),
          subtotal: subtotal,
          total_amount: subtotal,
          notes: row['Notes'] || (row['Printed'] ? `Printed: ${row['Printed']}` : null)
        })
        .select()
        .single();

      if (billError) {
        setImportLogs(prev => [...prev, { message: `Error creating bill for ${supplierName}: ${billError.message}`, type: 'error' }]);
        continue;
      }

      // Create Bill Items
      if (items.length > 0) {
        const billItems = items.map((item: any) => ({
          bill_id: bill.id,
          description: item.description,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          amount: Number(item.quantity) * Number(item.unit_price)
        }));

        const { error: itemsError } = await supabase
          .from('bill_items')
          .insert(billItems);
          
        if (itemsError) console.error("Error creating Bill items", itemsError);
      } else {
        // Create a default single line item for summary imports
        const { error: singleItemError } = await supabase
          .from('bill_items')
          .insert({
            bill_id: bill.id,
            description: 'Invoice Total',
            quantity: 1,
            unit_price: subtotal,
            amount: subtotal
          });
          
        if (singleItemError) console.error("Error creating default Bill item", singleItemError);
      }
      
      // POST TO LEDGER (Transactions & Entries)
      if (apId && invId && user) {
        try {
          const refNum = bill.bill_number || `INV-${Date.now()}`;
          
          // 1. Create Transaction
          const { data: tx, error: txError } = await supabase.from('transactions').insert({
             company_id: companyId,
             user_id: user.id,
             transaction_date: row['Date'],
             description: `Invoice Import ${refNum} from ${supplierName}`,
             reference_number: refNum,
             total_amount: subtotal,
             transaction_type: 'bill',
             status: 'posted'
          }).select('id').single();
          
          if (txError) throw txError;
          
          // 2. Transaction Entries
          const entries = [
             {
                transaction_id: tx.id,
                account_id: apId, // Credit AP
                credit: subtotal,
                debit: 0,
                description: `Invoice ${refNum}`,
                status: 'approved'
             },
             {
                transaction_id: tx.id,
                account_id: invId, // Debit Inventory
                credit: 0,
                debit: subtotal,
                description: `Invoice ${refNum}`,
                status: 'approved'
             }
          ];
          
          const { error: entriesError } = await supabase.from('transaction_entries').insert(entries);
          if (entriesError) throw entriesError;
          
          // 3. Ledger Entries
          const ledgerEntries = entries.map(e => ({
             company_id: companyId,
             transaction_id: tx.id,
             account_id: e.account_id,
             debit: e.debit,
             credit: e.credit,
             entry_date: row['Date'],
             description: e.description,
             is_reversed: false,
             reference_id: refNum
          }));
          
          const { error: ledgerError } = await supabase.from('ledger_entries').insert(ledgerEntries);
          if (ledgerError) throw ledgerError;

        } catch (ledgerErr) {
          console.error("Failed to post ledger entries for invoice", ledgerErr);
        }
      }

      setImportLogs(prev => [...prev, { message: `Imported invoice ${bill.bill_number} for ${supplierName}`, type: 'success' }]);
      successCount++;
      
      const progress = Math.round(((i + 1) / rows.length) * 100);
      setImportProgress(progress);
      await new Promise(res => setTimeout(res, 300));
    }
    return successCount;
  };

  const processAssets = async (data: any[], companyId: string) => {
    // 1. Fetch Accounts
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_name, account_type, account_code')
      .eq('company_id', companyId)
      .eq('is_active', true);
    
    // Helper to find accounts
    const findAccount = (type: string, name: string, codePrefix: string) => {
        return accounts?.find(a => 
            (String(a.account_type || '').toLowerCase() === type) && 
            (String(a.account_name || '').toLowerCase().includes(name.toLowerCase()) || String(a.account_code || '').startsWith(codePrefix))
        );
    };

    // Find or Create Opening Equity Account
    let equityAccount = findAccount('equity', 'opening equity', '3100');
    if (!equityAccount) {
        // Create if missing
        try {
          const { data: newEquity } = await supabase.from('chart_of_accounts').insert({
              company_id: companyId,
              account_name: 'Opening Equity',
              account_code: '3100',
              account_type: 'equity',
              is_active: true,
              normal_balance: 'credit'
          }).select().single();
          equityAccount = newEquity;
        } catch (e) {
          console.warn("Could not create equity account", e);
        }
    }
    const equityId = equityAccount?.id;

    // Get all asset accounts for lookup
    const assetAccounts = accounts?.filter(a => String(a.account_type || '').toLowerCase() === 'asset' || String(a.account_type || '').toLowerCase() === 'fixed_asset') || [];

    const { data: { user } } = await supabase.auth.getUser();

    let successCount = 0;

    for (const row of data) {
      const description = row['Description'];
      if (!description) continue;

      const cost = Number(row['Cost'] || 0);
      const purchaseDate = row['Purchase Date'];
      const usefulLife = Number(row['Useful Life (Years)'] || 5);
      const status = row['Status'] || 'active';
      const assetType = row['Asset Type'] || '';

      // Determine Asset Account
      // Try to match Asset Type to Account Name, else generic
      let assetAccountId = assetAccounts.find(a => String(a.account_name || '').toLowerCase().includes(assetType.toLowerCase()))?.id;
      if (!assetAccountId) {
          assetAccountId = assetAccounts.find(a => String(a.account_code || '').startsWith('15'))?.id; // Default to Class 15
      }

      // Calculate Depreciation and NBV
      const dep = calculateDepreciation(cost, purchaseDate, usefulLife);
      const accumDep = Number(dep.accumulatedDepreciation.toFixed(2));
      const nbv = Number((cost - accumDep).toFixed(2));

      // 1. Create Fixed Asset Record
      // Append [opening] tag for consistency with Manager
      const finalDescription = `${description} [opening]`;
      
      const { data: asset, error: assetError } = await supabase.from('fixed_assets').insert({
          company_id: companyId,
          description: finalDescription,
          asset_type: assetType,
          purchase_date: purchaseDate,
          cost: cost,
          useful_life_years: usefulLife,
          status: status,
          asset_account_id: assetAccountId || null,
          accumulated_depreciation: accumDep
      }).select().single();

      if (assetError) {
          console.error("Error creating asset", assetError);
          continue;
      }

      // 2. Financial Postings (Opening Balance)
      if (assetAccountId && equityId && user && nbv > 0) {
           try {
             // Create Transaction
             const { data: tx, error: txError } = await supabase.from('transactions').insert({
                 company_id: companyId,
                 user_id: user.id,
                 transaction_date: purchaseDate,
                 description: `Opening Fixed Asset - ${description}`,
                 reference_number: `OPEN-FA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                 total_amount: nbv,
                 transaction_type: 'opening_balance',
                 status: 'posted'
             }).select('id').single();

             if (!txError && tx) {
                 // Entries
                 const entries = [
                     {
                         transaction_id: tx.id,
                         account_id: assetAccountId,
                         debit: nbv,
                         credit: 0,
                         description: `Opening Asset - ${description}`,
                         status: 'approved'
                     },
                     {
                         transaction_id: tx.id,
                         account_id: equityId,
                         debit: 0,
                         credit: nbv,
                         description: `Opening Equity - ${description}`,
                         status: 'approved'
                     }
                 ];

                 await supabase.from('transaction_entries').insert(entries);

                 const ledgerEntries = entries.map(e => ({
                     company_id: companyId,
                     transaction_id: tx.id,
                     account_id: e.account_id,
                     debit: e.debit,
                     credit: e.credit,
                     entry_date: purchaseDate,
                     description: e.description,
                     reference_id: tx.id
                 }));

                 await supabase.from('ledger_entries').insert(ledgerEntries);
             }
           } catch (finErr) {
             console.error("Error posting financials for asset", finErr);
             // Don't stop import if financials fail
           }
      }
      successCount++;
    }

    // Trigger AFS refresh if possible
    try { await supabase.rpc('refresh_afs_cache', { _company_id: companyId }); } catch {}

    return successCount;
  };

  const handleImport = async () => {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    setImportLogs([]);
    setImportProgress(0);

    try {
      const companyId = await getCompanyId();

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            let count = 0;
            if (type === 'supplier') {
              count = await processSuppliers(results.data, companyId);
            } else if (type === 'purchase-order') {
              count = await processPurchaseOrders(results.data, companyId);
            } else if (type === 'invoice') {
              count = await processInvoices(results.data, companyId);
            } else if (type === 'asset') {
              count = await processAssets(results.data, companyId);
            }
            toast({ title: "Import Completed", description: `Imported ${count} records.` });
            setFile(null);
          } catch (err: any) {
            setError(err.message || "Failed to process data");
            console.error(err);
          } finally {
            setIsUploading(false);
          }
        },
        error: (err) => {
          setError(`CSV Parsing Error: ${err.message}`);
          setIsUploading(false);
        }
      });
    } catch (err: any) {
      setError(err.message || "Authentication or Setup Error");
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isUploading) onClose(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import {getTitle()}</DialogTitle>
          <DialogDescription>Upload your CSV and watch the import progress.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4 flex-1 overflow-hidden">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>Download Template</Label>
                <p className="text-xs text-muted-foreground">Use this template to format your data correctly.</p>
                <Button variant="outline" className="w-full justify-start border-dashed" onClick={handleDownloadTemplate} disabled={isUploading}>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV Template
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Upload CSV File</Label>
                <div 
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer",
                    isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('csv-file')?.click()}
                >
                  <Upload className={cn("h-8 w-8 mb-2", isDragActive ? "text-blue-500" : "text-slate-400")} />
                  <p className={cn("text-sm mb-1", isDragActive ? "text-blue-700 font-medium" : "text-slate-600")}>
                    {isDragActive ? "Drop CSV file here" : "Drag and drop your CSV file here or click to browse"}
                  </p>
                  <Input 
                    id="csv-file" 
                    type="file" 
                    accept=".csv" 
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    disabled={isUploading}
                  />
                  <Button variant="secondary" size="sm" className="mt-2 pointer-events-none">
                    Select File
                  </Button>
                </div>
                {file && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>
              
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
              <div className="flex-1 border rounded-lg bg-slate-50 p-4 overflow-y-auto font-mono text-sm space-y-2 min-h-[160px]">
                {importLogs.length === 0 && <span className="text-gray-400 italic">Waiting to start...</span>}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUploading}>Close</Button>
          <Button onClick={handleImport} disabled={!file || isUploading}>
            {isUploading ? (
              <>Uploading...</>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import Data
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
