import { useEffect, useState, useCallback, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowDownUp, Filter, Search, Download, ChevronRight, ChevronDown, FileText } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SupplierQuickView } from "./SupplierQuickView";

interface SupplierSummary {
  supplier_id: string;
  supplier_name: string;
  total_invoiced: number;
  total_paid: number;
  balance: number;
  current: number;
  days_30: number;
  days_60: number;
  days_90_plus: number;
}

export const CreditorsPerSupplierReport = ({ onCloseParent }: { onCloseParent?: () => void }) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [items, setItems] = useState<SupplierSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [quickViewId, setQuickViewId] = useState<string | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  useEffect(() => {
    async function fetchCompany() {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    }
    fetchCompany();
  }, [user]);

  const fetcher = useCallback(async () => {
    if (!user) return;

    setLoading(true);
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
        .select("id, supplier_id, po_number, po_date, total_amount, status")
        .eq("company_id", companyIdToUse)
        .neq("status", "draft")
        .neq("status", "placed order")
        .neq("status", "cancelled")
        .order("po_date", { ascending: false });

      // 2. Fetch Suppliers for names
      const supplierIds = Array.from(new Set((pos || []).map((b: any) => b.supplier_id).filter(Boolean)));
      const nameMap: Record<string, string> = {};
      if (supplierIds.length > 0) {
        const { data: supps } = await supabase
          .from("suppliers")
          .select("id, name")
          .in("id", supplierIds);
        (supps || []).forEach((s: any) => { nameMap[s.id] = s.name; });
      }

      // 3. Fetch Payments
      const poNumbers = (pos || []).map((b: any) => b.po_number).filter(Boolean);
      let paymentsMap: Record<string, number> = {};
      
      if (poNumbers.length > 0) {
        const { data: payments } = await supabase
          .from("transactions")
          .select("reference_number, total_amount")
          .in("reference_number", poNumbers)
          .eq("company_id", companyIdToUse)
          .in("transaction_type", ["payment", "bill_payment", "credit_note"]);

        (payments || []).forEach((p: any) => {
          const ref = p.reference_number;
          paymentsMap[ref] = (paymentsMap[ref] || 0) + Number(p.total_amount || 0);
        });
      }

      // 4. Aggregate by Supplier
      const summaryMap: Record<string, SupplierSummary> = {};

      (pos || []).forEach((po: any) => {
        const paid = paymentsMap[po.po_number] || 0;
        const total = Number(po.total_amount || 0);
        const outstanding = Math.max(0, total - paid);
        
        if (outstanding < 0.01) return; // Skip fully paid items for aged analysis usually, or keep them? 
        // Typically aged analysis shows outstanding balances. Let's show outstanding.

        const suppId = po.supplier_id || "unknown";
        if (!summaryMap[suppId]) {
          summaryMap[suppId] = {
            supplier_id: suppId,
            supplier_name: nameMap[suppId] || "Unknown Supplier",
            total_invoiced: 0,
            total_paid: 0,
            balance: 0,
            current: 0,
            days_30: 0,
            days_60: 0,
            days_90_plus: 0
          };
        }

        const s = summaryMap[suppId];
        s.total_invoiced += total;
        s.total_paid += paid;
        s.balance += outstanding;

        // Aging
        const ageInDays = Math.floor((new Date().getTime() - new Date(po.po_date).getTime()) / (1000 * 3600 * 24));
        
        if (ageInDays <= 30) s.current += outstanding;
        else if (ageInDays <= 60) s.days_30 += outstanding;
        else if (ageInDays <= 90) s.days_60 += outstanding;
        else s.days_90_plus += outstanding;
      });

      setItems(Object.values(summaryMap).sort((a, b) => b.balance - a.balance));
    } catch (error) {
      console.error("Error fetching supplier summary:", error);
    } finally {
      setLoading(false);
    }
  }, [user, companyId]);

  useEffect(() => {
    fetcher();
  }, [fetcher]);

  const filteredItems = items.filter(i => i.supplier_name.toLowerCase().includes(searchQuery.toLowerCase()));

  const totalBalance = filteredItems.reduce((sum, i) => sum + i.balance, 0);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="sticky top-0 z-10 bg-background border-b px-6 py-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Aged Creditors Analysis (Per Supplier)</h2>
            <p className="text-sm text-muted-foreground mt-1">Summary of outstanding balances by supplier</p>
          </div>
        </div>
        
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search Supplier..." 
              className="h-8 pl-9"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
             <span className="text-sm font-medium text-muted-foreground">Total Outstanding:</span>
             <span className="text-lg font-bold text-primary">{formatCurrency(totalBalance)}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 pt-0">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[250px]">Supplier Name</TableHead>
              <TableHead className="text-right">Total Balance</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">30 Days</TableHead>
              <TableHead className="text-right">60 Days</TableHead>
              <TableHead className="text-right">90+ Days</TableHead>
              <TableHead className="text-right w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No outstanding balances found.</TableCell></TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow 
                  key={item.supplier_id} 
                  className="hover:bg-muted/30 cursor-pointer group"
                  onClick={() => {
                    setQuickViewId(item.supplier_id);
                    setQuickViewOpen(true);
                    // if (onCloseParent) onCloseParent(); // Keep parent open so QuickView doesn't unmount
                  }}
                >
                  <TableCell className="font-medium">
                    <span className="group-hover:text-blue-600 group-hover:underline decoration-blue-600/50 underline-offset-4 transition-colors">
                      {item.supplier_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(item.balance)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.current)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.days_30)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.days_60)}</TableCell>
                  <TableCell className="text-right text-destructive">{formatCurrency(item.days_90_plus)}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent row click
                        setQuickViewId(item.supplier_id);
                        setQuickViewOpen(true);
                        // if (onCloseParent) onCloseParent(); // Keep parent open so QuickView doesn't unmount
                      }}
                    >
                      View Report
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SupplierQuickView 
        open={quickViewOpen} 
        onOpenChange={(open) => {
          setQuickViewOpen(open);
          if (!open && onCloseParent) {
            // Optional: Close parent report dialog when quick view closes? 
            // The user asked "when you press view the other dialog box colapse".
            // If they mean the parent dialog should close when opening the quick view, we should do it in onClick.
          }
        }} 
        supplierId={quickViewId} 
      />
    </div>
  );
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
};
