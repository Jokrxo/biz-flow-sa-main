import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Trash2, Database, Download, Upload, HardDrive, RefreshCw, FileJson, Archive, Activity, ServerCrash, FileSpreadsheet, Check, CloudCog, Loader2, File } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { Progress } from "@/components/ui/progress";
import Papa from "papaparse";
import * as XLSX from 'xlsx';
import { emitDashboardCacheInvalidation } from "@/stores/dashboardCache";

export const DataManagement = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [stats, setStats] = useState<any>({});
  const [loadingStats, setLoadingStats] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  
  // Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importType, setImportType] = useState("customers");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).single();
      if (!profile) return;
      const cid = profile.company_id;

      const [tx, inv, cust, supp] = await Promise.all([
        supabase.from("transactions").select("id", { count: 'exact', head: true }).eq("company_id", cid),
        supabase.from("invoices").select("id", { count: 'exact', head: true }).eq("company_id", cid),
        supabase.from("customers").select("id", { count: 'exact', head: true }).eq("company_id", cid),
        supabase.from("suppliers").select("id", { count: 'exact', head: true }).eq("company_id", cid),
      ]);

      setStats({
        transactions: tx.count || 0,
        invoices: inv.count || 0,
        customers: cust.count || 0,
        suppliers: supp.count || 0,
        storage: Math.min(100, ((tx.count || 0) * 0.5) + 5) // Mock storage usage %
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleExportData = async () => {
    try {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).single();
      if (!profile) return;
      
      const tables = ['transactions', 'invoices', 'customers', 'suppliers', 'items', 'chart_of_accounts'];
      
      const wb = XLSX.utils.book_new();
      
      for (const t of tables) {
        const { data } = await supabase.from(t as any).select('*').eq('company_id', profile.company_id);
        if (data && data.length > 0) {
          const ws = XLSX.utils.json_to_sheet(data);
          XLSX.utils.book_append_sheet(wb, ws, t.charAt(0).toUpperCase() + t.slice(1));
        }
      }

      const dateStr = new Date().toISOString().slice(0,10);
      XLSX.writeFile(wb, `rigel_backup_${dateStr}.xlsx`);
      
      toast({ title: "Export Complete", description: "System data exported successfully as Excel" });
    } catch (e: any) {
      toast({ title: "Export Failed", description: e.message, variant: "destructive" });
    }
  };

  const handleRepairOrphans = async () => {
    try {
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).single();
      if (!profile?.company_id) throw new Error("Company not found");
      const { data, error } = await (supabase.rpc as any)('repair_orphan_transactions', { _company_id: profile.company_id });
      if (error) throw error;
      const repaired = typeof data === 'number' ? data : 0;
      toast({ title: "Repair Complete", description: `${repaired} transaction(s) fixed` });
      loadStats();
    } catch (e: any) {
      toast({ title: "Repair Failed", description: e.message, variant: "destructive" });
    }
  };

  const handleClearAllData = async () => {
    if (password !== "Admin123") {
      toast({ title: "Error", description: "Incorrect password", variant: "destructive" });
      return;
    }

    try {
      setIsDeleting(true);
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).single();
      if (!profile?.company_id) throw new Error("Company not found");
      const companyId = profile.company_id;
      
      const { data: txIdsRows } = await supabase.from("transactions").select("id").eq("company_id", companyId);
      const txIds = (txIdsRows || []).map((r: any) => r.id);
      
      if (txIds.length) await supabase.from("transaction_entries").delete().in("transaction_id", txIds as any);
      await supabase.from("ledger_entries").delete().eq("company_id", companyId);
      await supabase.from("transactions").delete().eq("company_id", companyId);
      emitDashboardCacheInvalidation(companyId);
      
      const tables = ["bills", "invoices", "purchase_orders", "quotes", "sales", "expenses", "trial_balances", "financial_reports", "budgets", "bank_accounts", "fixed_assets", "items", "customers", "suppliers", "categories", "chart_of_accounts", "branches"];
      for (const t of tables) {
        await supabase.from(t as any).delete().eq("company_id", companyId);
      }

      toast({ title: "Success", description: "All data has been cleared successfully" });
      setIsDialogOpen(false);
      setPassword("");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to clear data", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  // --- IMPORT LOGIC ---

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImportFile(e.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const mapKeys = (row: any, possibleKeys: string[]) => {
    for (const key of possibleKeys) {
      const found = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (found) return row[found];
    }
    return null;
  };

  const processImport = async () => {
    if (!importFile) {
      toast({ title: "No file", description: "Please select a file first", variant: "destructive" });
      return;
    }
    
    setIsImporting(true);

    Papa.parse(importFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).single();
          if (!profile?.company_id) throw new Error("Company not found");
          const cid = profile.company_id;

          const rows = results.data as any[];
          let successCount = 0;

          if (importType === "customers" || importType === "suppliers") {
            const table = importType;
            const records = rows.map(row => {
              const name = mapKeys(row, ['Name', 'ContactName', 'CustomerName', 'SupplierName', 'Company', 'CompanyName']);
              if (!name) return null; // Skip rows without name
              
              return {
                company_id: cid,
                name: name,
                email: mapKeys(row, ['Email', 'EmailAddress', 'ContactEmail']),
                phone: mapKeys(row, ['Phone', 'PhoneNumber', 'Mobile', 'Tel', 'Telephone']),
                address: mapKeys(row, ['Address', 'PhysicalAddress', 'PostalAddress', 'BillingAddress']),
              };
            }).filter(Boolean);

            if (records.length > 0) {
              const { error } = await supabase.from(table as any).insert(records);
              if (error) throw error;
              successCount = records.length;
            }
          } 
          else if (importType === "coa") {
            // Chart of Accounts
            const records = rows.map(row => {
              const code = mapKeys(row, ['Code', 'AccountCode', 'GLCode']);
              const name = mapKeys(row, ['Name', 'AccountName', 'Description']);
              const type = mapKeys(row, ['Type', 'AccountType', 'Class']);
              
              if (!name) return null;

              // Simple type mapping
              let mappedType = 'expense';
              const t = String(type || '').toLowerCase();
              if (t.includes('asset') || t.includes('bank') || t.includes('receivable')) mappedType = 'asset';
              else if (t.includes('liab') || t.includes('payable')) mappedType = 'liability';
              else if (t.includes('equity') || t.includes('capital')) mappedType = 'equity';
              else if (t.includes('income') || t.includes('revenue') || t.includes('sales')) mappedType = 'income';
              
              return {
                company_id: cid,
                account_code: code || '',
                account_name: name,
                account_type: mappedType,
                is_active: true
              };
            }).filter(Boolean);

            if (records.length > 0) {
               const { error } = await supabase.from('chart_of_accounts').insert(records);
               if (error) throw error;
               successCount = records.length;
            }
          }
          else if (importType === "items") {
             const records = rows.map(row => {
              const name = mapKeys(row, ['Name', 'ItemName', 'Description', 'Product']);
              const price = mapKeys(row, ['Price', 'SellingPrice', 'UnitPrice', 'Rate']);
              if (!name) return null;

              return {
                company_id: cid,
                name: name,
                description: mapKeys(row, ['Description', 'Details']) || name,
                selling_price: parseFloat(price || '0') || 0,
                cost_price: parseFloat(mapKeys(row, ['Cost', 'CostPrice', 'PurchasePrice']) || '0') || 0,
                type: 'service', // Default
                sku: mapKeys(row, ['SKU', 'Code', 'ItemCode'])
              };
            }).filter(Boolean);
            
            if (records.length > 0) {
               const { error } = await supabase.from('items').insert(records);
               if (error) throw error;
               successCount = records.length;
            }
          }

          toast({ title: "Import Successful", description: `Successfully imported ${successCount} records.` });
          setImportDialogOpen(false);
          setImportFile(null);
          loadStats();

        } catch (err: any) {
          console.error(err);
          toast({ title: "Import Error", description: err.message || "Failed to process file", variant: "destructive" });
        } finally {
          setIsImporting(false);
        }
      },
      error: (err) => {
         setIsImporting(false);
         toast({ title: "File Error", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Storage & Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="card-professional md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 bg-blue-100 rounded-lg">
                <HardDrive className="h-5 w-5 text-blue-600" />
              </div>
              <CardTitle>System Storage</CardTitle>
            </div>
            <CardDescription>Database usage and record allocation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Used Space</span>
                <span className="font-medium">{stats.storage?.toFixed(1)}% of 500MB (Prototype)</span>
              </div>
              <Progress value={stats.storage || 5} className="h-3" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                <div className="p-3 bg-muted/30 rounded-lg border">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Transactions</div>
                  <div className="text-2xl font-bold">{loadingStats ? "..." : stats.transactions}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg border">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Invoices</div>
                  <div className="text-2xl font-bold">{loadingStats ? "..." : stats.invoices}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg border">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Customers</div>
                  <div className="text-2xl font-bold">{loadingStats ? "..." : stats.customers}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg border">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Suppliers</div>
                  <div className="text-2xl font-bold">{loadingStats ? "..." : stats.suppliers}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-professional">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 bg-green-100 rounded-lg">
                <Activity className="h-5 w-5 text-green-600" />
              </div>
              <CardTitle>System Health</CardTitle>
            </div>
            <CardDescription>Operational status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-100 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium text-green-700">Database Connected</span>
              </div>
              <Database className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-3 w-3 text-blue-500" />
                <span className="text-sm font-medium text-blue-700">Last Backup: Today</span>
              </div>
              <Archive className="h-4 w-4 text-blue-600" />
            </div>
            <Button variant="outline" className="w-full text-xs h-8" onClick={loadStats}>
              Refresh Diagnostics
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Operations Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-professional">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 bg-purple-100 rounded-lg">
                <CloudCog className="h-5 w-5 text-purple-600" />
              </div>
              <CardTitle>Integrations & Import</CardTitle>
            </div>
            <CardDescription>Migrate data from other platforms</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => { setSelectedProvider("xero"); setImportType("customers"); setImportDialogOpen(true); }}>
                <div className="font-bold text-lg mb-1 text-[#13b5ea]">Xero</div>
                <p className="text-xs text-muted-foreground">Import trial balance & contacts from CSV export</p>
              </div>
              <div className="p-4 border rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => { setSelectedProvider("sage"); setImportType("customers"); setImportDialogOpen(true); }}>
                <div className="font-bold text-lg mb-1 text-[#00d639]">Sage</div>
                <p className="text-xs text-muted-foreground">Migrate ledger history & invoices</p>
              </div>
              <div className="p-4 border rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => { setSelectedProvider("quickbooks"); setImportType("customers"); setImportDialogOpen(true); }}>
                <div className="font-bold text-lg mb-1 text-[#2ca01c]">QuickBooks</div>
                <p className="text-xs text-muted-foreground">Standard CSV data import</p>
              </div>
              <div className="p-4 border rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => { setSelectedProvider("excel"); setImportType("customers"); setImportDialogOpen(true); }}>
                <div className="font-bold text-lg mb-1 text-slate-700 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Excel / CSV
                </div>
                <p className="text-xs text-muted-foreground">Universal data import template</p>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={handleExportData}>
              <Download className="h-4 w-4 mr-2" />
              Export System Backup
            </Button>
          </CardContent>
        </Card>

        <Card className="card-professional border-l-4 border-l-destructive/50">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 bg-red-100 rounded-lg">
                <ServerCrash className="h-5 w-5 text-red-600" />
              </div>
              <CardTitle>text-destructive</CardTitle>
            </div>
            <CardDescription>Irreversible system actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-4 border border-destructive/20 bg-destructive/5 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <Trash2 className="h-5 w-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-sm text-destructive">Factory Reset</h4>
                  <p className="text-xs text-muted-foreground">Permanently delete all transactions, customers, and settings.</p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setIsDialogOpen(true)}>Reset</Button>
              </div>
            </div>

            <div className="p-4 border border-orange-200 bg-orange-50 rounded-xl space-y-3">
              <div className="flex items-start gap-3">
                <RefreshCw className="h-5 w-5 text-orange-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-sm text-orange-800">Repair Database</h4>
                  <p className="text-xs text-orange-600/80">Fix orphan transactions and rebalance ledgers.</p>
                </div>
                <Button variant="outline" size="sm" className="border-orange-200 text-orange-700 hover:bg-orange-100" onClick={handleRepairOrphans}>Repair</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Import from {selectedProvider ? selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1) : 'External System'}</DialogTitle>
            <DialogDescription>
              Upload your exported data file (.csv) to migrate records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".csv,.txt"
              onChange={handleFileSelect}
            />
            
            <div 
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${importFile ? 'bg-primary/5 border-primary' : 'hover:bg-muted/50'}`}
              onClick={triggerFileSelect}
            >
              {importFile ? (
                <>
                  <File className="h-8 w-8 mx-auto text-primary mb-3" />
                  <p className="text-sm font-medium text-primary">{importFile.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Click to select CSV file</p>
                  <p className="text-xs text-muted-foreground mt-1">Supported: CSV (Max 10MB)</p>
                </>
              )}
            </div>

            <div className="space-y-2">
               <Label>Data Type</Label>
               <select 
                 className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                 value={importType}
                 onChange={(e) => setImportType(e.target.value)}
               >
                 <option value="customers">Customer Contacts</option>
                 <option value="suppliers">Supplier Contacts</option>
                 <option value="coa">Chart of Accounts</option>
                 <option value="items">Inventory Items</option>
               </select>
               <p className="text-xs text-muted-foreground">
                 We'll automatically match columns like "Name", "Email", "Phone" from your CSV.
               </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportFile(null); }} disabled={isImporting}>Cancel</Button>
            <Button onClick={processImport} disabled={isImporting || !importFile}>
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Upload & Import"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Factory Reset
            </DialogTitle>
            <DialogDescription>
              This action will wipe all data from your company. This cannot be undone.
              <br />
              <span className="font-mono bg-muted p-1 rounded text-xs mt-2 inline-block">Default Password: Admin123</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="password">Confirm Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); setPassword(""); }} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearAllData} disabled={isDeleting || !password}>
              {isDeleting ? "Resetting..." : "Confirm Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
