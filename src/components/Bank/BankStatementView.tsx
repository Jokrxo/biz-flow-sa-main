import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, FileText, ArrowUpDown, Loader2 } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  current_balance: number;
}

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  reference_number: string | null;
  total_amount: number;
  status: string;
  transaction_type: string;
}

interface BankStatementViewProps {
  bankAccount?: BankAccount | null;
  isOpen: boolean;
  onClose: () => void;
}

export const BankStatementView = ({ bankAccount: initialBankAccount, isOpen, onClose }: BankStatementViewProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  
  // Bank Selection State
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  
  // Derived current bank account
  const currentBank = banks.find(b => b.id === selectedBankId) || initialBankAccount || null;

  // Fetch all banks when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchBanks();
    }
  }, [isOpen]);

  // Set initial selected bank when props change
  useEffect(() => {
    if (initialBankAccount) {
        setSelectedBankId(initialBankAccount.id);
    } else if (banks.length > 0 && !selectedBankId) {
        setSelectedBankId(banks[0].id);
    }
  }, [initialBankAccount, banks]);

  const fetchBanks = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
  
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .single();
  
        if (!profile?.company_id) return;
  
        const { data: bankAccounts } = await supabase
          .from("bank_accounts")
          .select("id, account_name, account_number, bank_name, current_balance, opening_balance") // Added opening_balance just in case
          .eq("company_id", profile.company_id);
          
        if (bankAccounts) setBanks(bankAccounts as any);
      } catch (error) {
        console.error("Error fetching banks:", error);
      }
  };

  useEffect(() => {
    if (currentBank && isOpen) {
      loadTransactions();
    }
  }, [currentBank, isOpen]);

  const loadTransactions = async () => {
    if (!currentBank) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("bank_account_id", currentBank.id)
        .order("transaction_date", { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error("Error loading transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions
    .filter(tx => 
      tx.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.reference_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.total_amount.toString().includes(searchQuery)
    )
    .sort((a, b) => {
      const dateA = new Date(a.transaction_date).getTime();
      const dateB = new Date(b.transaction_date).getTime();
      return sortDesc ? dateB - dateA : dateA - dateB;
    });

  // Calculate running balance (simplified, assuming current balance is end state)
  // To do this accurately we need the opening balance and sum forward, or current and subtract backwards.
  // Given we may paginate or filter, showing running balance on filtered set is tricky.
  // For now, we will just list the transactions as requested "list of transaction affected bank".

  const exportPDF = () => {
    if (!currentBank) return;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Bank Statement", 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Account: ${currentBank.account_name}`, 14, 30);
    doc.text(`Bank: ${currentBank.bank_name}`, 14, 35);
    doc.text(`Account Number: ${currentBank.account_number}`, 14, 40);
    doc.text(`Date Generated: ${new Date().toLocaleDateString()}`, 14, 45);

    const tableData = filteredTransactions.map(tx => [
      format(new Date(tx.transaction_date), "yyyy-MM-dd"),
      tx.description || "",
      tx.reference_number || "-",
      Number(tx.total_amount || 0) >= 0 ? `R ${Number(tx.total_amount || 0).toFixed(2)}` : "",
      Number(tx.total_amount || 0) < 0 ? `R ${Math.abs(Number(tx.total_amount || 0)).toFixed(2)}` : "",
      tx.status
    ]);

    autoTable(doc, {
      startY: 55,
      head: [["Date", "Description", "Reference", "Debit", "Credit", "Status"]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 8 }
    });

    doc.save(`Statement_${currentBank.account_name}_${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between mr-8">
            <div className="flex flex-col gap-2">
              <DialogTitle className="text-xl">Bank Statement View</DialogTitle>
              {banks.length > 0 ? (
                 <Select value={selectedBankId || ""} onValueChange={setSelectedBankId}>
                    <SelectTrigger className="w-[280px]">
                       <SelectValue placeholder="Select Bank Account" />
                    </SelectTrigger>
                    <SelectContent>
                       {banks.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.bank_name} - {b.account_name}</SelectItem>
                       ))}
                    </SelectContent>
                 </Select>
              ) : (
                <DialogDescription className="mt-1">
                  {currentBank?.bank_name} - {currentBank?.account_name} ({currentBank?.account_number})
                </DialogDescription>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Current Balance</div>
              <div className={`text-2xl font-bold ${currentBank && (currentBank.current_balance || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {currentBank ? `R ${Number(currentBank.current_balance || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '---'}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between py-4 gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search transactions..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="pl-8"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSortDesc(!sortDesc)}>
              <ArrowUpDown className="h-4 w-4 mr-2" />
              {sortDesc ? "Newest First" : "Oldest First"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[120px]">Date</TableHead>
                <TableHead className="w-[300px]">Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Debit (In)</TableHead>
                <TableHead className="text-right">Credit (Out)</TableHead>
                <TableHead className="w-[100px] text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      Loading transactions...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No transactions found for this period.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => (
                  <TableRow key={tx.id} className="group hover:bg-muted/50">
                    <TableCell className="font-medium">
                      {format(new Date(tx.transaction_date), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{tx.description}</div>
                      <div className="text-xs text-muted-foreground">{tx.transaction_type}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {tx.reference_number || "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-600 font-medium">
                      {tx.total_amount > 0 ? `R ${tx.total_amount.toFixed(2)}` : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono text-rose-600 font-medium">
                      {tx.total_amount < 0 ? `R ${Math.abs(tx.total_amount).toFixed(2)}` : ""}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline" 
                        className={
                          tx.status === 'approved' || tx.status === 'posted' 
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                            : "bg-yellow-50 text-yellow-700 border-yellow-200"
                        }
                      >
                        {tx.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        <div className="py-2 text-xs text-muted-foreground text-center">
          Showing {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
        </div>
      </DialogContent>
    </Dialog>
  );
};
