import { useEffect, useState, useMemo, useCallback, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowDownUp, Filter, Search, Download, ChevronRight, ChevronDown, MoreHorizontal, FileText, CheckCircle, AlertCircle, Clock, Check } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PayableItem {
  id: string;
  date: string;
  doc_type: "Invoice" | "Payment" | "Credit Note" | "PO" | "Deposit";
  doc_no: string;
  description: string;
  original_amount: number;
  allocated: number;
  outstanding: number;
  status: "Current" | "Partially Paid" | "Overdue" | "Paid" | "Pending" | "Credit";
  supplier_name: string;
  supplier_id: string;
  children?: PayableItem[]; // For Payment/Credit grouping
}

export const CreditorsControlReport = () => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showAllocated, setShowAllocated] = useState<boolean>(false);
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompany() {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    }
    fetchCompany();
  }, [user]);

  const [items, setItems] = useState<PayableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filteredItems, setFilteredItems] = useState<PayableItem[]>([]);

  const fetcher = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setIsSyncing(true);
    try {
      let cid = companyId;
      if (!cid) {
         const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
         cid = profile?.company_id || null;
      }
      
      if (!cid) return;
      const companyIdToUse = cid;

      // 1. Fetch Purchase Orders (acting as Supplier Invoices)
      const { data: pos } = await supabase
        .from("purchase_orders")
        .select("id, supplier_id, po_number, po_date, total_amount, status, notes")
        .eq("company_id", companyIdToUse)
        .neq("status", "draft")
        .neq("status", "placed order")
        .neq("status", "cancelled")
        .order("po_date", { ascending: false });

      // 1b. Fetch Bills (Supplier Invoices)
      const { data: bills } = await supabase
        .from("bills")
        .select("id, supplier_id, bill_number, bill_date, total_amount, status, notes")
        .eq("company_id", companyIdToUse)
        .neq("status", "Draft")
        .order("bill_date", { ascending: false });

      // 2. Fetch Suppliers for names
      const posSupplierIds = (pos || []).map((b: any) => b.supplier_id).filter(Boolean);
      const billsSupplierIds = (bills || []).map((b: any) => b.supplier_id).filter(Boolean);
      const supplierIds = Array.from(new Set([...posSupplierIds, ...billsSupplierIds]));
      
      const nameMap: Record<string, string> = {};
      if (supplierIds.length > 0) {
        const { data: supps } = await supabase
          .from("suppliers")
          .select("id, name")
          .in("id", supplierIds);
        (supps || []).forEach((s: any) => { nameMap[s.id] = s.name; });
      }

      // 3. Fetch All Transactions (Payments, Deposits, etc.)
      const poNumbers = (pos || []).map((b: any) => b.po_number).filter(Boolean);
      const billNumbers = (bills || []).map((b: any) => b.bill_number).filter(Boolean);
      const allDocNumbers = [...poNumbers, ...billNumbers];
      
      const { data: allTrans } = await supabase
          .from("transactions")
          .select("id, transaction_date, reference_number, description, total_amount, transaction_type, status")
          .eq("company_id", companyIdToUse)
          .in("transaction_type", ["payment", "bill_payment", "credit_note", "deposit"]);

      let paymentsMap: Record<string, any[]> = {};
      const standaloneDeposits: any[] = [];

      (allTrans || []).forEach((p: any) => {
          // If linked to a known PO or Bill
          if (allDocNumbers.includes(p.reference_number)) {
             if (!paymentsMap[p.reference_number]) paymentsMap[p.reference_number] = [];
             paymentsMap[p.reference_number].push(p);
          } else if (p.transaction_type === 'deposit') {
             // Check if it belongs to one of our suppliers via description matching
             const supplierId = Object.keys(nameMap).find(id => p.description?.toLowerCase().includes(nameMap[id].toLowerCase()));
             if (supplierId) {
                 // It's a deposit for a known supplier but not linked to a specific PO
                 // Treat as standalone item
                 standaloneDeposits.push({ ...p, supplier_id: supplierId });
             }
          }
      });

      // 4. Construct Data Structure
      const builtItems: PayableItem[] = [];

      // Process POs
      (pos || []).forEach((po: any) => {
        const poPayments = paymentsMap[po.po_number] || [];
        const paidAmount = poPayments.reduce((sum: number, p: any) => sum + Number(p.total_amount || 0), 0);
        const originalAmount = Number(po.total_amount || 0);
        const outstanding = Math.max(0, originalAmount - paidAmount);
        
        let status: PayableItem["status"] = "Current";
        if (Math.abs(outstanding) < 0.01) status = "Paid";
        else if (po.status === "paid") status = "Paid";
        else if (new Date(po.po_date) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) status = "Overdue";
        else if (paidAmount > 0) status = "Partially Paid";

        const children: PayableItem[] = poPayments.map((p: any) => ({
          id: p.id,
          date: p.transaction_date,
          doc_type: p.transaction_type === "credit_note" ? "Credit Note" : p.transaction_type === "deposit" ? "Deposit" : "Payment",
          doc_no: p.reference_number,
          description: p.description || "Payment Allocation",
          original_amount: Number(p.total_amount),
          allocated: Number(p.total_amount),
          outstanding: 0,
          status: "Paid",
          supplier_name: nameMap[po.supplier_id] || "Unknown",
          supplier_id: po.supplier_id,
        }));

        builtItems.push({
          id: po.id,
          date: po.po_date,
          doc_type: "PO", // Keep as PO to distinguish
          doc_no: po.po_number,
          description: `PO from ${nameMap[po.supplier_id] || "Unknown"}`,
          original_amount: originalAmount,
          allocated: paidAmount,
          outstanding: outstanding,
          status: status,
          supplier_name: nameMap[po.supplier_id] || "Unknown",
          supplier_id: po.supplier_id,
          children: children
        });
      });

      // Process Bills
      (bills || []).forEach((bill: any) => {
        const billPayments = paymentsMap[bill.bill_number] || [];
        const paidAmount = billPayments.reduce((sum: number, p: any) => sum + Number(p.total_amount || 0), 0);
        const originalAmount = Number(bill.total_amount || 0);
        const outstanding = Math.max(0, originalAmount - paidAmount);
        
        let status: PayableItem["status"] = "Current";
        if (Math.abs(outstanding) < 0.01) status = "Paid";
        else if (bill.status === "Paid" || bill.status === "paid") status = "Paid";
        else if (new Date(bill.bill_date) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) status = "Overdue";
        else if (paidAmount > 0) status = "Partially Paid";

        const children: PayableItem[] = billPayments.map((p: any) => ({
          id: p.id,
          date: p.transaction_date,
          doc_type: p.transaction_type === "credit_note" ? "Credit Note" : p.transaction_type === "deposit" ? "Deposit" : "Payment",
          doc_no: p.reference_number,
          description: p.description || "Payment Allocation",
          original_amount: Number(p.total_amount),
          allocated: Number(p.total_amount),
          outstanding: 0,
          status: "Paid",
          supplier_name: nameMap[bill.supplier_id] || "Unknown",
          supplier_id: bill.supplier_id,
        }));

        builtItems.push({
          id: bill.id,
          date: bill.bill_date,
          doc_type: "Invoice",
          doc_no: bill.bill_number,
          description: `Invoice from ${nameMap[bill.supplier_id] || "Unknown"}`,
          original_amount: originalAmount,
          allocated: paidAmount,
          outstanding: outstanding,
          status: status,
          supplier_name: nameMap[bill.supplier_id] || "Unknown",
          supplier_id: bill.supplier_id,
          children: children
        });
      });

      // Add Standalone Deposits
      standaloneDeposits.forEach((dep: any) => {
          builtItems.push({
              id: dep.id,
              date: dep.transaction_date,
              doc_type: "Deposit",
              doc_no: dep.reference_number,
              description: dep.description,
              original_amount: Number(dep.total_amount),
              allocated: 0,
              outstanding: -Number(dep.total_amount), // Negative outstanding means credit to us
              status: "Credit",
              supplier_name: nameMap[dep.supplier_id] || "Unknown",
              supplier_id: dep.supplier_id,
              children: []
          });
      });

      // Sort by date desc
      builtItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setItems(builtItems);
    } catch (error) {
      console.error("Error fetching creditors control data:", error);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [user, companyId]);

  useEffect(() => {
    fetcher();
  }, [fetcher]);

  const refresh = async (force?: boolean) => {
    await fetcher();
  };

  const filterData = useCallback(() => {
    let res = [...items];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      res = res.filter(i => 
        i.doc_no.toLowerCase().includes(q) || 
        i.supplier_name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
      );
    }

    if (!showAllocated) {
       res = res.filter(i => i.status !== 'Paid');
    }

    if (dateRange.from) {
      res = res.filter(i => i.date >= dateRange.from);
    }
    if (dateRange.to) {
      res = res.filter(i => i.date <= dateRange.to);
    }

    if (docTypeFilter && docTypeFilter !== "all") {
      if (docTypeFilter === "Invoice") {
        res = res.filter(i => i.doc_type === "Invoice");
      } else if (docTypeFilter === "Payment") {
        res = res.filter(i => i.children && i.children.some(c => c.doc_type === "Payment"));
      } else if (docTypeFilter === "Credit Note") {
        res = res.filter(i => i.children && i.children.some(c => c.doc_type === "Credit Note"));
      } else if (docTypeFilter === "PO") {
        res = res.filter(i => i.doc_no.toUpperCase().startsWith("PO"));
      } else if (docTypeFilter === "Deposit") {
        res = res.filter(i => i.doc_type === "Deposit" || (i.children && i.children.some(c => c.doc_type === "Deposit")));
      }
    }

    setFilteredItems(res);
  }, [items, searchQuery, showAllocated, dateRange, docTypeFilter]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, showAllocated, dateRange, docTypeFilter]);

  useEffect(() => {
    filterData();
  }, [filterData]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const totalBalance = filteredItems.reduce((sum, i) => sum + i.outstanding, 0);
  const currentBalance = filteredItems.filter(i => i.status === 'Current' || i.status === 'Partially Paid').reduce((sum, i) => sum + i.outstanding, 0);
  const overdueBalance = filteredItems.filter(i => i.status === 'Overdue').reduce((sum, i) => sum + i.outstanding, 0);
  
  const outstandingItems = filteredItems.filter(i => i.outstanding > 0);
  const oldestDate = outstandingItems.length > 0 
    ? outstandingItems.reduce((oldest, i) => i.date < oldest ? i.date : oldest, outstandingItems[0].date)
    : "-";

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Creditors Control – Supplier Ledger</h2>
              <p className="text-sm text-muted-foreground mt-1">
                As at {new Date().toLocaleDateString()} · Supplier-level view
              </p>
            </div>
            {isSyncing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                Syncing...
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 px-6 pb-4 border-b bg-muted/20">
          <SummaryBox label="Total Balance" value={formatCurrency(totalBalance)} />
          <SummaryBox label="Current (Not Due)" value={formatCurrency(currentBalance)} />
          <SummaryBox label="Overdue Balance" value={formatCurrency(overdueBalance)} className="text-destructive font-medium" />
          <SummaryBox label="Oldest Outstanding" value={oldestDate !== "-" ? new Date(oldestDate).toLocaleDateString() : "-"} />
        </div>

        <div className="flex items-center gap-3 px-6 py-3 border-b bg-card">
           <div className="flex items-center gap-2">
             <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Date Range:</span>
             <Input 
               type="date" 
               className="h-8 w-32" 
               value={dateRange.from} 
               onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))} 
             />
             <span className="text-muted-foreground">-</span>
             <Input 
               type="date" 
               className="h-8 w-32" 
               value={dateRange.to} 
               onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))} 
             />
           </div>
           
           <div className="h-6 w-px bg-border mx-2" />

           <div className="w-[180px]">
             <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
               <SelectTrigger className="h-8">
                 <SelectValue placeholder="Document Type" />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="all">All Documents</SelectItem>
                 <SelectItem value="Invoice">Invoice</SelectItem>
                 <SelectItem value="Payment">Payment</SelectItem>
                 <SelectItem value="Credit Note">Credit Note</SelectItem>
                 <SelectItem value="PO">Purchase Order</SelectItem>
                 <SelectItem value="Deposit">Deposit</SelectItem>
               </SelectContent>
             </Select>
           </div>

           <div className="h-6 w-px bg-border mx-2" />

           <div className="flex items-center space-x-2">
            <Checkbox 
              id="showAllocated" 
              checked={showAllocated} 
              onCheckedChange={(c) => setShowAllocated(!!c)} 
            />
            <label
              htmlFor="showAllocated"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Show Allocated
            </label>
          </div>

          <div className="h-6 w-px bg-border mx-2" />

          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search Invoice No, PO No, Supplier..." 
              className="h-8 pl-9 w-full max-w-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="ghost" size="icon" onClick={() => refresh(true)} title="Refresh Data">
            <ArrowDownUp className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : (
          <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[40px]"><Checkbox /></TableHead>
              <TableHead className="w-[100px]">Date</TableHead>
              <TableHead className="w-[120px]">Doc Type</TableHead>
              <TableHead className="w-[120px]">Doc No</TableHead>
              <TableHead className="min-w-[200px]">Description</TableHead>
              <TableHead className="text-right w-[120px]">Original</TableHead>
              <TableHead className="text-right w-[120px]">Allocated</TableHead>
              <TableHead className="text-right w-[120px]">Outstanding</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center h-32 text-muted-foreground">
                  No records found matching current filters.
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((item) => (
                <Fragment key={item.id}>
                  <TableRow 
                    className={cn(
                      "group hover:bg-muted/30 transition-colors cursor-default",
                      expandedRows[item.id] && "bg-muted/10"
                    )}
                  >
                    <TableCell><Checkbox /></TableCell>
                    <TableCell className="font-medium text-xs">{new Date(item.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-xs bg-slate-50 text-slate-700 border-slate-200">
                        {item.doc_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{item.doc_no}</TableCell>
                    <TableCell className="text-xs truncate max-w-[200px] text-muted-foreground group-hover:text-foreground">
                      {item.description}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatCurrency(item.original_amount)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(item.allocated)}
                    </TableCell>
                    <TableCell className={cn("text-right text-xs tabular-nums font-semibold", item.outstanding < 0 ? "text-green-600" : "")}>
                      {formatCurrency(item.outstanding)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {item.children && item.children.length > 0 && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6" 
                            onClick={() => toggleRow(item.id)}
                          >
                            {expandedRows[item.id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </Button>
                        )}
                        <RowActions />
                      </div>
                    </TableCell>
                  </TableRow>
                  
                  {expandedRows[item.id] && item.children && item.children.map(child => (
                    <TableRow key={child.id} className="bg-muted/5 hover:bg-muted/10 border-0">
                      <TableCell></TableCell>
                      <TableCell className="text-xs text-muted-foreground pl-8 border-l-2 border-l-muted">
                        {new Date(child.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                         <Badge variant="outline" className="font-normal text-[10px] bg-green-50 text-green-700 border-green-200">
                          {child.doc_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{child.doc_no}</TableCell>
                      <TableCell className="text-xs text-muted-foreground italic">{child.description}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {formatCurrency(child.original_amount)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">-</TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">-</TableCell>
                      <TableCell>
                         <Badge variant="outline" className="font-normal text-[10px] bg-gray-50 text-gray-600">Paid</Badge>
                      </TableCell>
                      <TableCell>
                        <RowActions />
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
        )}
      </div>

      <div className="sticky bottom-0 z-10 bg-background border-t p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium">Total Outstanding:</div>
          <div className="text-xl font-bold tracking-tight text-primary">
            {formatCurrency(totalBalance)}
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <div className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <FileText className="h-4 w-4" /> Export PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="default" size="sm">Close</Button>
        </div>
      </div>
    </div>
  );
};

const SummaryBox = ({ label, value, className }: { label: string, value: string, className?: string }) => (
  <div className="flex flex-col space-y-1">
    <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
    <span className={cn("text-lg font-semibold tracking-tight", className)}>{value}</span>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "Current") {
    return <Badge variant="outline" className="text-green-600 border-green-600 bg-green-50">Current</Badge>;
  }
  if (status === "Partially Paid") {
    return <Badge variant="outline" className="text-orange-600 border-orange-600 bg-orange-50">Partially Paid</Badge>;
  }
  if (status === "Overdue") {
    return <Badge variant="outline" className="text-red-600 border-red-600 bg-red-50">Overdue</Badge>;
  }
  if (status === "Paid") {
    return <Badge variant="outline" className="text-slate-500 border-slate-300 bg-slate-50">Paid</Badge>;
  }
  if (status === "Credit") {
    return <Badge variant="outline" className="text-purple-600 border-purple-600 bg-purple-50">Credit</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
};

const RowActions = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-6 w-6 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>View Source Document</DropdownMenuItem>
        <DropdownMenuItem>Allocate Payment</DropdownMenuItem>
        <DropdownMenuItem>View Allocation History</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Print</DropdownMenuItem>
        <DropdownMenuItem>Audit Trail</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
};
