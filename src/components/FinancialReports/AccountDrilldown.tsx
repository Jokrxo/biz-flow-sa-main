import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  reference_number: string | null;
  debit: number;
  credit: number;
  status: string;
}

interface AccountDrilldownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  accountCode: string;
}

export const AccountDrilldown = ({ 
  open, 
  onOpenChange, 
  accountId, 
  accountName,
  accountCode 
}: AccountDrilldownProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && accountId) {
      loadTransactions();
    }
  }, [open, accountId]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("transaction_entries")
        .select(`
          id,
          debit,
          credit,
          description,
          transactions!inner (
            id,
            transaction_date,
            description,
            reference_number,
            status
          )
        `)
        .eq("account_id", accountId)
        .order("transactions(transaction_date)", { ascending: false });

      if (error) throw error;

      const formatted = data.map((entry: any) => ({
        id: entry.id,
        transaction_date: entry.transactions.transaction_date,
        description: entry.description || entry.transactions.description,
        reference_number: entry.transactions.reference_number,
        debit: entry.debit,
        credit: entry.credit,
        status: entry.transactions.status,
      }));

      setTransactions(formatted);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalDebit = transactions.reduce((sum, tx) => sum + tx.debit, 0);
  const totalCredit = transactions.reduce((sum, tx) => sum + tx.credit, 0);
  const balance = totalDebit - totalCredit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Account Ledger: {accountCode} - {accountName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No transactions found for this account
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Total Debits</p>
                <p className="text-xl font-bold">R {totalDebit.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Credits</p>
                <p className="text-xl font-bold">R {totalCredit.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Balance</p>
                <p className={`text-xl font-bold ${balance >= 0 ? "text-primary" : "text-destructive"}`}>
                  R {Math.abs(balance).toFixed(2)}
                </p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-sm">
                      {new Date(tx.transaction_date).toLocaleDateString("en-ZA")}
                    </TableCell>
                    <TableCell>{tx.description}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {tx.reference_number || "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {tx.debit > 0 ? `R ${tx.debit.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {tx.credit > 0 ? `R ${tx.credit.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.status === "posted" ? "default" : "outline"}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
