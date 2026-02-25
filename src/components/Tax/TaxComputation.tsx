import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Eye, Save, CheckCircle, Info, FileText, Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CountUp } from "@/components/ui/count-up";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { TaxSettingsDialog } from "./TaxSettingsDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface AdjustmentItem {
  id: string;
  name: string;
  amount: number;
  type: "Auto" | "Manual";
}

interface DeductionItem {
  id: string;
  name: string;
  amount: number;
  source: "COA" | "Schedule" | "Manual";
  isWearAndTear?: boolean;
}

export const TaxComputation = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [status, setStatus] = useState<"Draft" | "Finalised">("Draft");
  const [showSettings, setShowSettings] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  
  // Data State
  const [accountingProfit, setAccountingProfit] = useState<number>(0);
  const [addBacks, setAddBacks] = useState<AdjustmentItem[]>([]);
  const [deductions, setDeductions] = useState<DeductionItem[]>([]);

  // Manual Adjustment State
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [newAdjustment, setNewAdjustment] = useState<{ description: string; amount: string; type: "add_back" | "deduction" }>({ description: "", amount: "", type: "add_back" });

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);

      // 1. Get Chart of Accounts
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_name, account_type, is_tax_deductible, account_code, is_exempt_income")
        .eq("company_id", profile.company_id);

      if (!accounts) return;

      // 2. Get Ledger Entries
      const startOfYear = `${year}-01-01`;
      const endOfYear = `${year}-12-31`;

      const { data: entries } = await supabase
        .from("ledger_entries")
        .select("account_id, debit, credit")
        .eq("company_id", profile.company_id)
        .gte("entry_date", startOfYear)
        .lte("entry_date", endOfYear);

      // 3. Get Fixed Assets
      const { data: fixedAssets } = await supabase
        .from("fixed_assets")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("status", "active");

      // 4. Get Manual Adjustments
      const { data: manualAdjustments } = await supabase
        .from("tax_adjustments")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("tax_year", parseInt(year));

      if (!entries) return;

      // --- CALCULATIONS ---

      let totalIncome = 0;
      let totalExpenses = 0;
      
      const nonDeductibleMap = new Map<string, number>();
      const exemptIncomeMap = new Map<string, number>();

      entries.forEach(entry => {
        const account = accounts.find(a => a.id === entry.account_id);
        if (!account) return;

        const debit = Number(entry.debit || 0);
        const credit = Number(entry.credit || 0);
        const netExpense = debit - credit; 
        const netIncome = credit - debit;  

        if (account.account_type === 'revenue' || account.account_type === 'income') {
          totalIncome += netIncome;
          
          if ((account as any).is_exempt_income) {
             const currentAmount = exemptIncomeMap.get(account.id) || 0;
             exemptIncomeMap.set(account.id, currentAmount + netIncome);
          }

        } else if (account.account_type === 'expense' || account.account_type === 'cost_of_sales') {
          totalExpenses += netExpense;

          const isDepreciation = account.account_name.toLowerCase().includes('depreciation') || account.account_name.toLowerCase().includes('amortisation');
          
          if (account.is_tax_deductible === false || isDepreciation) {
             const currentAmount = nonDeductibleMap.get(account.id) || 0;
             nonDeductibleMap.set(account.id, currentAmount + netExpense);
          }
        }
      });

      const profit = totalIncome - totalExpenses;
      setAccountingProfit(profit);

      // Prepare Add Backs List
      const newAddBacks: AdjustmentItem[] = [];
      nonDeductibleMap.forEach((amount, accountId) => {
        if (amount > 0) {
          const acc = accounts.find(a => a.id === accountId);
          newAddBacks.push({
            id: accountId,
            name: acc?.account_name || "Unknown Expense",
            amount: amount,
            type: "Auto"
          });
        }
      });

      // Prepare Deductions List
      const newDeductions: DeductionItem[] = [];

      // Exempt Income
      exemptIncomeMap.forEach((amount, accountId) => {
        if (amount > 0) {
          const acc = accounts.find(a => a.id === accountId);
          newDeductions.push({
            id: accountId,
            name: `${acc?.account_name} (Exempt)`,
            amount: amount,
            source: "COA"
          });
        }
      });

      // Wear and Tear
      let totalWearAndTear = 0;
      if (fixedAssets && fixedAssets.length > 0) {
        fixedAssets.forEach((asset: any) => {
           const cost = Number(asset.cost || 0);
           const rate = Number(asset.wear_and_tear_rate || 0) / 100;
           
           if (rate > 0 && cost > 0) {
             const startDate = new Date(asset.tax_usage_start_date || asset.purchase_date);
             const periodStart = new Date(`${year}-01-01`);
             const periodEnd = new Date(`${year}-12-31`);
             
             if (startDate <= periodEnd) {
                const effectiveStart = startDate > periodStart ? startDate : periodStart;
                const effectiveEnd = periodEnd; 
                
                const diffTime = Math.abs(effectiveEnd.getTime() - effectiveStart.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
                
                const daysInYear = 365 + (Number(year) % 4 === 0 ? 1 : 0);
                const apportionment = Math.min(1, diffDays / daysInYear); 
                
                const allowance = cost * rate * apportionment;
                totalWearAndTear += allowance;
             }
           }
        });
      }

      if (totalWearAndTear > 0) {
        newDeductions.push({
          id: "wear-and-tear-total",
          name: "Wear & Tear Allowance (S11(e)/S12C)",
          amount: totalWearAndTear,
          source: "Schedule",
          isWearAndTear: true
        });
      }

      // Add Manual Adjustments
      if (manualAdjustments) {
        manualAdjustments.forEach(adj => {
           if (adj.type === 'add_back') {
              newAddBacks.push({
                  id: adj.id,
                  name: adj.description,
                  amount: Number(adj.amount),
                  type: "Manual"
              });
           } else {
              newDeductions.push({
                  id: adj.id,
                  name: adj.description,
                  amount: Number(adj.amount),
                  source: "Manual"
              });
           }
        });
      }

      setAddBacks(newAddBacks);
      setDeductions(newDeductions);

      setLoading(false);
    } catch (error) {
      console.error("Error loading tax data:", error);
      toast.error("Failed to load tax data");
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [year]);

  const handleAddAdjustment = async () => {
    if (!companyId || !newAdjustment.description || !newAdjustment.amount) return;

    try {
      setLoading(true);
      const { error } = await supabase.from("tax_adjustments").insert({
        company_id: companyId,
        tax_year: parseInt(year),
        description: newAdjustment.description,
        amount: parseFloat(newAdjustment.amount),
        type: newAdjustment.type,
        category: 'manual'
      });

      if (error) throw error;
      
      toast.success("Adjustment added");
      setShowAdjustmentDialog(false);
      setNewAdjustment({ description: "", amount: "", type: "add_back" });
      loadData();
    } catch (error) {
      toast.error("Failed to add adjustment");
      setLoading(false);
    }
  };

  const totalAddBacks = addBacks.reduce((sum, item) => sum + item.amount, 0);
  const totalDeductions = deductions.reduce((sum, item) => sum + item.amount, 0);
  const taxableIncome = accountingProfit + totalAddBacks - totalDeductions;

  const handleFinalise = () => {
    setStatus("Finalised");
    toast.success("Tax computation finalised successfully");
  };

  const handleSaveDraft = () => {
    toast.info("Draft saved");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
  };

  return (
    <div className="space-y-6 pb-24 relative">
      <TaxSettingsDialog 
        open={showSettings} 
        onOpenChange={setShowSettings} 
        companyId={companyId || ""}
        onSettingsChanged={loadData}
      />

       <Dialog open={showAdjustmentDialog} onOpenChange={setShowAdjustmentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Manual Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input 
                placeholder="e.g. Legal Fees (Capital)" 
                value={newAdjustment.description}
                onChange={(e) => setNewAdjustment({...newAdjustment, description: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Amount (R)</Label>
              <Input 
                type="number" 
                placeholder="0.00" 
                value={newAdjustment.amount}
                onChange={(e) => setNewAdjustment({...newAdjustment, amount: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <RadioGroup 
                value={newAdjustment.type} 
                onValueChange={(v: "add_back" | "deduction") => setNewAdjustment({...newAdjustment, type: v})}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="add_back" id="r1" />
                  <Label htmlFor="r1">Add Back (+)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="deduction" id="r2" />
                  <Label htmlFor="r2">Deduction (-)</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustmentDialog(false)}>Cancel</Button>
            <Button onClick={handleAddAdjustment} disabled={!newAdjustment.description || !newAdjustment.amount}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 1. Page Header (Sticky) */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 border-b -mx-6 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Taxable Income</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground">Company</span>
            <span>•</span>
            <Badge variant={status === "Draft" ? "secondary" : "default"} className="font-normal">
              {status}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Select Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">FY 2026</SelectItem>
              <SelectItem value="2025">FY 2025</SelectItem>
              <SelectItem value="2024">FY 2024</SelectItem>
              <SelectItem value="2023">FY 2023</SelectItem>
            </SelectContent>
          </Select>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setShowSettings(true)}>
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Set Tax Rules & Allowances</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* 2. Accounting Profit Card */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Accounting Profit (Before Tax)</span>
            {loading ? (
              <Skeleton className="h-10 w-48 mt-1" />
            ) : (
              <div className="text-4xl font-light tracking-tight text-foreground">
                <CountUp end={accountingProfit} decimals={2} prefix="R " duration={1000} />
              </div>
            )}
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>From Statement of Profit or Loss</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 3. Add Backs Section */}
        <Card className="border-border/60 shadow-sm h-full flex flex-col">
          <CardHeader className="pb-3 bg-muted/20 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Add Backs</CardTitle>
                <CardDescription>Expenses not deductible for tax purposes</CardDescription>
              </div>
              <Badge variant="outline" className="bg-background">
                {addBacks.length} items
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col">
             {loading ? (
               <div className="p-6 space-y-4">
                 {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
               </div>
             ) : (
               <>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50%]">Account Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {addBacks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          No non-deductible expenses found
                        </TableCell>
                      </TableRow>
                    ) : (
                      addBacks.map((item) => (
                        <TableRow key={item.id} className="group">
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs font-normal">
                              {item.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground group-hover:text-foreground">
                            {formatCurrency(item.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                
                <div className="p-4 mt-auto border-t border-border/40 bg-muted/10">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-primary hover:text-primary/80 hover:bg-primary/5 -ml-2"
                    onClick={() => {
                        setNewAdjustment({ description: "", amount: "", type: "add_back" });
                        setShowAdjustmentDialog(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Add Adjustment
                  </Button>
                </div>
               </>
             )}
          </CardContent>
          {!loading && (
            <div className="p-4 bg-muted/20 border-t border-border/40 flex justify-between items-center">
              <span className="font-medium text-sm text-muted-foreground">Subtotal</span>
              <span className="font-bold text-lg">{formatCurrency(totalAddBacks)}</span>
            </div>
          )}
        </Card>

        {/* 4. Deductions Section */}
        <Card className="border-border/60 shadow-sm h-full flex flex-col">
          <CardHeader className="pb-3 bg-muted/20 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Deductions</CardTitle>
                <CardDescription>Allowable deductions for tax purposes</CardDescription>
              </div>
              <Badge variant="outline" className="bg-background">
                {deductions.length} items
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col">
            {loading ? (
               <div className="p-6 space-y-4">
                 {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
               </div>
             ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[50%]">Account Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deductions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No deductions recorded
                      </TableCell>
                    </TableRow>
                  ) : (
                    deductions.map((item) => (
                      <TableRow key={item.id} className="group">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {item.name}
                            {item.isWearAndTear && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary">
                                      <FileText className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View Schedule</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                            {item.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground group-hover:text-foreground">
                          {formatCurrency(item.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
             )}
          </CardContent>
          {!loading && (
            <div className="p-4 bg-muted/20 border-t border-border/40 flex justify-between items-center mt-auto">
              <span className="font-medium text-sm text-muted-foreground">Subtotal</span>
              <span className="font-bold text-lg">{formatCurrency(totalDeductions)}</span>
            </div>
          )}
        </Card>
      </div>

      {/* 5. Taxable Income Summary (Highlighted) */}
      <Card className="border-primary/20 shadow-md bg-gradient-to-br from-background to-muted/20 overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
             <div className="p-8 space-y-4">
               <Skeleton className="h-8 w-full" />
               <Skeleton className="h-12 w-1/2" />
             </div>
          ) : (
            <div className="grid md:grid-cols-4 divide-y md:divide-y-0 md:divide-x border-b border-border/40">
               <div className="p-6 flex flex-col gap-1 text-center md:text-left">
                 <span className="text-xs font-medium uppercase text-muted-foreground tracking-wider">Accounting Profit</span>
                 <span className="text-xl font-semibold text-foreground/80">{formatCurrency(accountingProfit)}</span>
               </div>
               <div className="p-6 flex flex-col gap-1 text-center md:text-left">
                 <span className="text-xs font-medium uppercase text-emerald-600/80 tracking-wider">Add Backs (+)</span>
                 <span className="text-xl font-semibold text-emerald-700">{formatCurrency(totalAddBacks)}</span>
               </div>
               <div className="p-6 flex flex-col gap-1 text-center md:text-left">
                 <span className="text-xs font-medium uppercase text-rose-600/80 tracking-wider">Deductions (-)</span>
                 <span className="text-xl font-semibold text-rose-700">{formatCurrency(totalDeductions)}</span>
               </div>
               <div className="p-6 flex flex-col gap-1 bg-primary/5 text-center md:text-left">
                 <span className="text-xs font-bold uppercase text-primary tracking-wider">Taxable Income</span>
                 <span className="text-2xl font-bold text-foreground">
                   <CountUp end={taxableIncome} decimals={2} prefix="R " duration={1500} />
                 </span>
               </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6. Action Bar (Sticky Bottom) */}
      <div className="sticky bottom-4 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border rounded-xl p-4 flex justify-end gap-3 shadow-lg mt-6">
        <div className="flex items-center gap-4">
           {status === "Draft" && (
             <span className="text-sm text-muted-foreground hidden sm:inline-block">
               Last saved: Just now
             </span>
           )}
           <Button variant="outline" onClick={handleSaveDraft} disabled={loading}>
             <Save className="h-4 w-4 mr-2" />
             Save Draft
           </Button>
           <TooltipProvider>
             <Tooltip>
               <TooltipTrigger asChild>
                 <Button onClick={handleFinalise} disabled={loading || status === "Finalised"}>
                   <CheckCircle className="h-4 w-4 mr-2" />
                   Finalise
                 </Button>
               </TooltipTrigger>
               {status === "Finalised" && <TooltipContent>Computation already finalised</TooltipContent>}
             </Tooltip>
           </TooltipProvider>
        </div>
      </div>
    </div>
  );
};
