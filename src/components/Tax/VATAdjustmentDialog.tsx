import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Minus, Search, Settings, HelpCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface VATAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onSuccess: () => void;
}

interface AdjustmentRow {
  id: string;
  date: string;
  type: string;
  description: string;
  amount: number;
}

export const VATAdjustmentDialog = ({ open, onOpenChange, companyId, onSuccess }: VATAdjustmentDialogProps) => {
  const [activeTab, setActiveTab] = useState("new");
  const [rows, setRows] = useState<AdjustmentRow[]>([
    { id: '1', date: new Date().toISOString().split('T')[0], type: '', description: '', amount: 0 }
  ]);
  const [loading, setLoading] = useState(false);
  const [processedAdjustments, setProcessedAdjustments] = useState<any[]>([]);

  // Calculate total
  const totalAmount = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  useEffect(() => {
    if (open && activeTab === "processed") {
      fetchProcessedAdjustments();
    }
  }, [open, activeTab]);

  const fetchProcessedAdjustments = async () => {
    try {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('company_id', companyId)
            .ilike('description', '%VAT Adjustment%')
            .order('transaction_date', { ascending: false });
        
        if (error) throw error;
        setProcessedAdjustments(data || []);
    } catch (error) {
        console.error("Error fetching adjustments:", error);
    }
  };

  const handleAddRow = () => {
    setRows([...rows, { id: Math.random().toString(), date: new Date().toISOString().split('T')[0], type: '', description: '', amount: 0 }]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
    }
  };

  const updateRow = (id: string, field: keyof AdjustmentRow, value: any) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const getEffectText = (type: string) => {
    if (!type) return null;
    if (type.includes('input')) return { text: "Decrease your VAT balance", color: "text-orange-600 bg-orange-50 border-orange-200" };
    if (type.includes('output')) return { text: "Increase your VAT balance", color: "text-green-600 bg-green-50 border-green-200" };
    return null;
  };

  const handleProcess = async () => {
    if (!companyId) return;

    // Validate
    const validRows = rows.filter(r => r.type && r.amount > 0);
    if (validRows.length === 0) {
      toast.error("Please add at least one valid adjustment with type and amount.");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user found");

      // 1. Fetch Chart of Accounts
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_name, account_type, account_code, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true);

      const list = (accounts || []).map(a => ({ 
        id: a.id as string, 
        name: String(a.account_name || '').toLowerCase(), 
        type: String(a.account_type || '').toLowerCase(), 
        code: String(a.account_code || '') 
      }));

      const pick = (type: string, codes: string[], names: string[]) => { 
        const byType = list.filter(a => a.type === type.toLowerCase()); 
        const byCode = byType.find(a => codes.includes(a.code)); 
        if (byCode) return byCode.id; 
        const byName = byType.find(a => names.some(n => a.name.includes(n))); 
        return byName?.id || ''; 
      };

      // Identify VAT Accounts
      // Output VAT (Liability)
      let outputVatId = pick('liability', ['2500', '2550'], ['output vat', 'vat output', 'vat control']);
      if (!outputVatId) {
         // Create if missing (simplified fallback)
         const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '2500', account_name: 'VAT Output Control', account_type: 'liability', is_active: true }).select('id').single(); 
         outputVatId = (created as any)?.id || '';
      }

      // Input VAT (Asset)
      let inputVatId = pick('asset', ['1500', '1550'], ['input vat', 'vat input']);
      if (!inputVatId) {
         const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '1500', account_name: 'VAT Input Control', account_type: 'asset', is_active: true }).select('id').single(); 
         inputVatId = (created as any)?.id || '';
      }

      // VAT Adjustment Account (Expense/Income)
      let vatAdjId = pick('expense', ['6000'], ['vat adjustment', 'vat expense', 'bank charges']);
      if (!vatAdjId) {
         const { data: created } = await supabase.from('chart_of_accounts').insert({ company_id: companyId, account_code: '6999', account_name: 'VAT Adjustments', account_type: 'expense', is_active: true }).select('id').single(); 
         vatAdjId = (created as any)?.id || '';
      }

      for (const row of validRows) {
        const amount = Number(row.amount);
        let vatAmount = amount;
        let txType = 'journal';
        let debitAccountId = '';
        let creditAccountId = '';

        // Logic mapping
        if (row.type.includes('output')) {
            txType = 'sales';
            // Output Increase (Liability Increase) -> Cr Output VAT, Dr Adjustment
            if (row.type === 'output_increase') {
                vatAmount = Math.abs(amount);
                creditAccountId = outputVatId;
                debitAccountId = vatAdjId;
            } else { 
                // Output Decrease (Liability Decrease) -> Dr Output VAT, Cr Adjustment
                vatAmount = -Math.abs(amount);
                debitAccountId = outputVatId;
                creditAccountId = vatAdjId;
            }
        } else {
            txType = 'expense';
             // Input Increase (Asset Increase) -> Dr Input VAT, Cr Adjustment
             if (row.type === 'input_increase') {
                vatAmount = Math.abs(amount);
                debitAccountId = inputVatId;
                creditAccountId = vatAdjId;
            } else {
                // Input Decrease (Asset Decrease) -> Cr Input VAT, Dr Adjustment
                vatAmount = -Math.abs(amount);
                creditAccountId = inputVatId;
                debitAccountId = vatAdjId;
            }
        }

        // 2. Insert Transaction (Pending)
        const { data: tx, error: txError } = await supabase.from('transactions').insert({
            company_id: companyId,
            user_id: user.id,
            transaction_date: row.date,
            description: row.description || `VAT Adjustment - ${row.type}`,
            total_amount: 0, // Net 0 for adjustment journal
            base_amount: -vatAmount,
            vat_amount: vatAmount,
            vat_rate: 0,
            transaction_type: txType,
            status: 'pending' // Must be pending to insert entries
        }).select('id').single();

        if (txError) throw txError;
        const txId = (tx as any).id;

        // 3. Insert Transaction Entries (Double Entry)
        const entries = [
            { transaction_id: txId, account_id: debitAccountId, debit: amount, credit: 0, description: row.description, status: 'approved' },
            { transaction_id: txId, account_id: creditAccountId, debit: 0, credit: amount, description: row.description, status: 'approved' }
        ];

        const { error: entriesError } = await supabase.from('transaction_entries').insert(entries);
        if (entriesError) throw entriesError;

        // 4. Insert Ledger Entries
        const ledgerRows = entries.map(r => ({
            company_id: companyId,
            account_id: r.account_id,
            debit: r.debit,
            credit: r.credit,
            entry_date: row.date,
            is_reversed: false,
            transaction_id: txId,
            description: r.description
        }));

        const { error: ledgerError } = await supabase.from('ledger_entries').insert(ledgerRows);
        if (ledgerError) throw ledgerError;

        // 5. Update Transaction to Posted
        const { error: updateError } = await supabase
            .from('transactions')
            .update({ status: 'posted' })
            .eq('id', txId);
            
        if (updateError) throw updateError;
      }

      toast.success("VAT Adjustments processed successfully");
      onSuccess();
      onOpenChange(false);
      // Reset rows
      setRows([{ id: '1', date: new Date().toISOString().split('T')[0], type: '', description: '', amount: 0 }]);

    } catch (e: any) {
      console.error("Error processing adjustments:", e);
      toast.error(e.message || "Failed to process adjustments");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col p-0 gap-0 bg-[#f4f4f4]">
        <div className="bg-white p-4 border-b flex justify-between items-center">
            <div className="flex items-center gap-2">
                <img src="/lovable-uploads/sage-logo.png" alt="Logo" className="h-8 w-auto hidden" /> 
                {/* Fallback title if logo missing, or just keep it simple */}
                <DialogTitle className="text-xl font-semibold text-gray-800">VAT Adjustments</DialogTitle>
            </div>
            <div className="flex items-center gap-4 text-sm text-[#0070ad] font-medium cursor-pointer">
                <div className="flex items-center gap-1 hover:underline"><HelpCircle className="w-4 h-4"/> Information Centre</div>
            </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
            <div className="bg-white rounded-sm shadow-sm border border-gray-200 min-h-full flex flex-col">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
                    <div className="px-6 pt-6 pb-0 border-b border-gray-200">
                        <TabsList className="bg-transparent p-0 h-auto gap-6">
                            <TabsTrigger 
                                value="new" 
                                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#0070ad] data-[state=active]:text-[#0070ad] rounded-none px-0 pb-2 font-semibold text-gray-500"
                            >
                                New VAT Adjustments
                            </TabsTrigger>
                            <TabsTrigger 
                                value="processed" 
                                className="bg-transparent border-b-2 border-transparent data-[state=active]:border-[#0070ad] data-[state=active]:text-[#0070ad] rounded-none px-0 pb-2 font-semibold text-gray-500"
                            >
                                Processed VAT Adjustments
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="new" className="flex-1 flex flex-col p-6 gap-6 m-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" className="text-[#0070ad] border-gray-300 bg-white hover:bg-gray-50">
                                    <span className="mr-2">Actions</span> <span className="text-xs">▼</span>
                                </Button>
                                <Button variant="ghost" size="sm" className="text-gray-400 cursor-not-allowed">Delete</Button>
                                <Button variant="ghost" size="sm" className="text-gray-400 cursor-not-allowed">Batch Edit</Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                                    <Input placeholder="Search" className="pl-9 w-64 h-9" />
                                </div>
                                <Button variant="ghost" size="icon"><Settings className="h-4 w-4 text-gray-500" /></Button>
                            </div>
                        </div>

                        <div className="border border-gray-200 rounded-sm flex-1">
                            <Table>
                                <TableHeader className="bg-[#535c68] hover:bg-[#535c68]">
                                    <TableRow className="border-b-0 hover:bg-[#535c68]">
                                        <TableHead className="w-10 text-white"><Checkbox className="border-white data-[state=checked]:bg-[#0070ad] data-[state=checked]:text-white" /></TableHead>
                                        <TableHead className="text-white font-semibold">Date</TableHead>
                                        <TableHead className="text-white font-semibold w-[250px]">Adjustment</TableHead>
                                        <TableHead className="text-white font-semibold w-[300px]">Description</TableHead>
                                        <TableHead className="text-white font-semibold text-right">Amount</TableHead>
                                        <TableHead className="text-white font-semibold w-[200px]">Effect on VAT Balance</TableHead>
                                        <TableHead className="text-white font-semibold w-20 text-center">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.map((row) => {
                                        const effect = getEffectText(row.type);
                                        return (
                                            <TableRow key={row.id} className="hover:bg-gray-50">
                                                <TableCell><Checkbox /></TableCell>
                                                <TableCell>
                                                    <Input 
                                                        type="date" 
                                                        value={row.date} 
                                                        onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                                                        className="h-8 w-full"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Select value={row.type} onValueChange={(v) => updateRow(row.id, 'type', v)}>
                                                        <SelectTrigger className="h-8 w-full bg-white">
                                                            <SelectValue placeholder="Select Adjustment" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="input_increase">Input VAT Adjustment (Claim)</SelectItem>
                                                            <SelectItem value="output_increase">Output VAT Adjustment (Liability)</SelectItem>
                                                            <SelectItem value="input_decrease">Input VAT Decrease</SelectItem>
                                                            <SelectItem value="output_decrease">Output VAT Decrease</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                                <TableCell>
                                                    <Input 
                                                        value={row.description} 
                                                        onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                                                        className="h-8 w-full"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input 
                                                        type="number" 
                                                        value={row.amount} 
                                                        onChange={(e) => updateRow(row.id, 'amount', e.target.value)}
                                                        className="h-8 w-full text-right"
                                                        placeholder="R 0.00"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    {effect && (
                                                        <span className={`text-xs px-2 py-1 rounded border ${effect.color}`}>
                                                            {effect.text}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-full"
                                                            onClick={handleAddRow}
                                                        >
                                                            <Plus className="h-4 w-4" />
                                                        </Button>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full"
                                                            onClick={() => handleRemoveRow(row.id)}
                                                            disabled={rows.length === 1}
                                                        >
                                                            <Minus className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                    {/* Footer Row */}
                                    <TableRow className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                                        <TableCell colSpan={4} className="text-right text-gray-600">Total VAT Adjustments</TableCell>
                                        <TableCell className="text-right text-gray-800">
                                            R {totalAmount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell colSpan={2}></TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex justify-center mt-auto pt-4">
                            <Button 
                                className="bg-[#0070ad] hover:bg-[#005a8b] text-white px-8 py-2 min-w-[120px]"
                                onClick={handleProcess}
                                disabled={loading}
                            >
                                {loading ? 'Processing...' : 'Process'}
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="processed" className="flex-1 p-6 m-0">
                        <Table>
                            <TableHeader className="bg-[#535c68]">
                                <TableRow className="hover:bg-[#535c68]">
                                    <TableHead className="text-white">Date</TableHead>
                                    <TableHead className="text-white">Description</TableHead>
                                    <TableHead className="text-white text-right">VAT Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {processedAdjustments.map((tx) => (
                                    <TableRow key={tx.id}>
                                        <TableCell>{new Date(tx.transaction_date).toLocaleDateString()}</TableCell>
                                        <TableCell>{tx.description}</TableCell>
                                        <TableCell className="text-right">R {Math.abs(tx.vat_amount).toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                                {processedAdjustments.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                                            No processed adjustments found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
