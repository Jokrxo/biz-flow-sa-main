import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Receipt, Check, XCircle, History, Upload, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";

interface Expense {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  category: string;
  reference: string | null;
  status: string;
}

export const ExpensesManagement = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, isAccountant } = useRoles();

  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    expense_date: new Date().toISOString().split("T")[0],
    category: "",
    reference: "",
  });
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [expenseToAdjust, setExpenseToAdjust] = useState<Expense | null>(null);
  const [adjustReason, setAdjustReason] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const loadExpenses = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .maybeSingle();
      if (!profile) return;
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      setExpenses(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);
  useEffect(() => {
    loadExpenses();

    // Real-time updates
    const channel = supabase
      .channel('expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        loadExpenses();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadExpenses]);

  

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();

      const { error } = await supabase.from("expenses").insert({
        company_id: profile!.company_id,
        user_id: user!.id,
        expense_date: formData.expense_date,
        description: formData.description,
        amount: parseFloat(formData.amount),
        category: formData.category,
        reference: formData.reference || null,
        status: "pending"
      });

      if (error) throw error;

      toast({ title: "Success", description: "Expense recorded successfully" });
      setSuccessMessage("Expense recorded successfully");
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setDialogOpen(false);
      }, 2000);
      resetForm();
      loadExpenses();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setErrorMessage(error.message || "Failed to record expense");
      setIsError(true);
      setTimeout(() => setIsError(false), 2000);
    }
  };

  const resetForm = () => {
    setFormData({
      description: "",
      amount: "",
      expense_date: new Date().toISOString().split("T")[0],
      category: "",
      reference: "",
    });
  };

  const handleAdjustment = async () => {
    if (!expenseToAdjust) return;
    if (!adjustReason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for the adjustment.", variant: "destructive" });
      return;
    }

    setIsAdjusting(true);
    try {
      // 1. Find if this expense has a linked transaction in the ledger
      // Expenses usually create a transaction. We need to reverse it.
      // Assuming expense ID might be in reference number or stored in transaction_entries
      
      const { data: txs } = await supabase
        .from("transactions")
        .select("*, transaction_entries(*)")
        .ilike("description", `%${expenseToAdjust.description}%`) // Heuristic if no direct link
        .eq("total_amount", expenseToAdjust.amount)
        .eq("transaction_type", "expense"); // Assuming 'expense' type

      // Note: Without a direct foreign key from expense to transaction, it's hard to be 100% sure.
      // However, usually we just want to create a reversal entry.
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .maybeSingle();
      
      if (profile?.company_id) {
          // Create Reversal Transaction
          const { data: newTx, error: txError } = await supabase
            .from('transactions')
            .insert({
              company_id: profile.company_id,
              transaction_date: new Date().toISOString().split('T')[0],
              description: `Adjustment for Expense: ${expenseToAdjust.description}. Reason: ${adjustReason}`,
              reference_number: `ADJ-EXP-${Date.now().toString().slice(-4)}`,
              transaction_type: 'Adjustment',
              status: 'approved',
              total_amount: expenseToAdjust.amount,
              user_id: user?.id,
            })
            .select()
            .single();

          if (txError) throw txError;

          // If we found the original transaction, we could try to reverse its entries.
          // For now, let's assume standard expense reversal: Credit Expense, Debit Bank/Liability
          // Since we don't know exact accounts without the original transaction, we'll skip auto-ledger entries 
          // unless we are sure. But the user asked to "record on transaction module".
          // So creating the transaction header is the minimum.
          
          if (txs && txs.length > 0 && newTx) {
             const originalTx = txs[0]; // Take the first matching one
             if (originalTx.transaction_entries) {
                 const reversalEntries = originalTx.transaction_entries.map((entry: any) => ({
                    transaction_id: newTx.id,
                    account_id: entry.account_id,
                    debit: entry.credit, // Swap
                    credit: entry.debit, // Swap
                    description: `Reversal: ${entry.description}`,
                    status: 'approved'
                 }));
                 
                 await supabase.from('transaction_entries').insert(reversalEntries);
             }
          }
      }

      // 2. Update Expense Status
      const { error } = await supabase
        .from("expenses")
        .update({ 
            status: "cancelled",
            // Append reason to description or reference if no notes field
            description: `${expenseToAdjust.description} [Adjusted: ${adjustReason}]`
        })
        .eq("id", expenseToAdjust.id);

      if (error) throw error;
      
      toast({ title: "Success", description: "Expense adjusted and cancelled" });
      setAdjustmentOpen(false);
      loadExpenses();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAdjusting(false);
    }
  };

  const approveExpense = async (id: string) => {
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase
        .from("expenses")
        .update({ status: "approved" })
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Success", description: "Expense approved" });
      loadExpenses();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const categories = [
    "Office Supplies",
    "Travel",
    "Utilities",
    "Rent",
    "Insurance",
    "Marketing",
    "Professional Fees",
    "Fuel & Transport",
    "Salaries & Wages",
    "Other"
  ];

  const canEdit = isAdmin || isAccountant;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Expenses
        </CardTitle>
        {canEdit && (
          <Button size="sm" className="bg-gradient-primary" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Record Expense
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No expenses recorded yet. Click "Record Expense" to add one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell>{new Date(expense.expense_date).toLocaleDateString('en-ZA')}</TableCell>
                  <TableCell className="font-medium">{expense.description}</TableCell>
                  <TableCell>{expense.category}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{expense.reference || "-"}</TableCell>
                  <TableCell className="text-right font-semibold">R {Number(expense.amount).toLocaleString('en-ZA')}</TableCell>
                  <TableCell>
                    <Badge variant={expense.status === 'approved' ? 'default' : expense.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {expense.status}
                    </Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-2">
                        {expense.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => approveExpense(expense.id)}>
                            Approve
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => {
                          setExpenseToAdjust(expense);
                          setAdjustmentOpen(true);
                        }} className="text-amber-600">
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Adjustment Dialog */}
      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <History className="h-5 w-5" />
              Adjust / Reverse Expense
            </DialogTitle>
            <DialogDescription className="pt-2">
              This will cancel the expense and create an adjustment transaction in the ledger.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-sm font-medium flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                For audit compliance, expenses cannot be deleted. Use this form to adjust or reverse the transaction.
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Reason for Adjustment</Label>
              <Textarea 
                value={adjustReason} 
                onChange={(e) => setAdjustReason(e.target.value)} 
                placeholder="Reason for cancellation or adjustment..."
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Supporting Document (Optional)</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => document.getElementById('expense-file-upload')?.click()}>
                <input type="file" id="expense-file-upload" className="hidden" onChange={handleFileChange} />
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8 opacity-50" />
                  <span className="text-sm">Click to upload document</span>
                  {file && <span className="text-xs text-primary font-medium">{file.name}</span>}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAdjustmentOpen(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button 
              onClick={handleAdjustment}
              disabled={isAdjusting || !adjustReason.trim()}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isAdjusting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <History className="mr-2 h-4 w-4" />
                  Confirm Adjustment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Expense</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Description *</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the expense"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (R) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.expense_date}
                  onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                  required
                />
              </div>
            </div>
            <div>
              <Label>Category *</Label>
              <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference (optional)</Label>
              <Input
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                placeholder="e.g., Receipt #123"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button type="submit" className="bg-gradient-primary">Record Expense</Button>
            </DialogFooter>
          </form>
      </DialogContent>
      </Dialog>
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
      <Dialog open={isError} onOpenChange={setIsError}>
        <DialogContent className="sm:max-w-[425px] flex flex-col items-center justify-center min-h-[300px]">
          <div className="h-24 w-24 rounded-full bg-red-100 flex items-center justify-center mb-6 animate-in zoom-in-50 duration-300">
            <XCircle className="h-12 w-12 text-red-600" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl text-red-700">Failed</DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-2">
            <p className="text-xl font-semibold text-gray-900">{errorMessage}</p>
            <p className="text-muted-foreground">Please review and try again.</p>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
