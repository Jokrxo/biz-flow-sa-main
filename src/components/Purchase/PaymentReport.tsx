import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { Loader2, Search, Download, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import "jspdf-autotable";

interface Transaction {
  id: string;
  transaction_date: string;
  reference_number: string;
  description: string;
  total_amount: number;
  supplier_id: string | null;
  transaction_type: string;
}

interface Supplier {
  id: string;
  name: string;
}

export const PaymentReport = ({ onCloseParent }: { onCloseParent?: () => void }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Fetch Suppliers for mapping
      const { data: suppliersData } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId);
      
      const supplierMap: Record<string, string> = {};
      suppliersData?.forEach(s => {
        supplierMap[s.id] = s.name;
      });
      setSuppliers(supplierMap);

      // Fetch Payment Transactions
      const { data: txs, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("company_id", companyId)
        .eq("transaction_type", "payment")
        .order("transaction_date", { ascending: false });

      if (error) throw error;
      setTransactions(txs || []);
    } catch (error) {
      console.error("Error fetching payment report:", error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      fetchData();
    }
  }, [companyId, fetchData]);

  const filteredTransactions = transactions.filter(tx => {
    const searchLower = searchQuery.toLowerCase();
    const supplierName = tx.supplier_id ? suppliers[tx.supplier_id] || "" : "";
    return (
      tx.reference_number?.toLowerCase().includes(searchLower) ||
      tx.description?.toLowerCase().includes(searchLower) ||
      supplierName.toLowerCase().includes(searchLower)
    );
  });

  const totalAmount = filteredTransactions.reduce((sum, tx) => sum + Number(tx.total_amount), 0);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Payment Report", 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated on: ${format(new Date(), "dd/MM/yyyy")}`, 14, 30);

    const tableData = filteredTransactions.map(tx => [
      format(new Date(tx.transaction_date), "dd/MM/yyyy"),
      tx.reference_number || "-",
      tx.supplier_id ? suppliers[tx.supplier_id] || "Unknown" : "-",
      tx.description || "-",
      `R ${Number(tx.total_amount).toFixed(2)}`
    ]);

    (doc as any).autoTable({
      startY: 40,
      head: [["Date", "Reference", "Supplier", "Description", "Amount"]],
      body: tableData,
      foot: [["", "", "", "Total", `R ${totalAmount.toFixed(2)}`]],
    });

    doc.save("payment-report.pdf");
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="sticky top-0 z-10 bg-background border-b px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Payment Report</h2>
            <p className="text-sm text-muted-foreground">
              View all payment transactions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search payments..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No payment records found
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{format(new Date(tx.transaction_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{tx.reference_number}</TableCell>
                    <TableCell>{tx.supplier_id ? suppliers[tx.supplier_id] || "Unknown" : "-"}</TableCell>
                    <TableCell>{tx.description}</TableCell>
                    <TableCell className="text-right font-medium">
                      R {Number(tx.total_amount).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={4} className="text-right">Total</TableCell>
                  <TableCell className="text-right">R {totalAmount.toFixed(2)}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
