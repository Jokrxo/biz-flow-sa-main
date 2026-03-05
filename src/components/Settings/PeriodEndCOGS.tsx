/**
 * ============================================================================
 * PERIOD-END COGS WIZARD - For Periodic Inventory System
 * ============================================================================
 * Calculate and post Cost of Goods Sold at period-end
 * Formula: COGS = Beginning Inventory + Purchases - Ending Inventory
 * Only used when Inventory System is set to "periodic"
 * ============================================================================
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";
import { 
  Calculator, 
  Save, 
  CheckCircle, 
  AlertTriangle, 
  ArrowRight, 
  ArrowLeft,
  Package,
  DollarSign,
  Calendar
} from "lucide-react";
import { calculatePeriodicCOGS, getPeriodPurchases } from "@/utils/inventoryCosting";

interface PeriodEndCOGSProps {
  companyId: string;
}

type WizardStep = "inputs" | "review" | "confirmation";

export function PeriodEndCOGS({ companyId }: PeriodEndCOGSProps) {
  const [step, setStep] = useState<WizardStep>("inputs");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Current period
  const currentDate = new Date();
  const [periodYear, setPeriodYear] = useState(currentDate.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(currentDate.getMonth() + 1);
  
  // Input values
  const [beginningInventory, setBeginningInventory] = useState<string>("");
  const [endingInventory, setEndingInventory] = useState<string>("");
  const [calculatedPurchases, setCalculatedPurchases] = useState<number>(0);
  const [manualPurchases, setManualPurchases] = useState<string>("");
  
  // Calculated results
  const [cogsAmount, setCogsAmount] = useState<number>(0);
  const [formula, setFormula] = useState<string>("");
  
  const { toast } = useToast();

  useEffect(() => {
    loadPreviousPeriodData();
  }, [periodYear, periodMonth]);

  const loadPreviousPeriodData = async () => {
    setLoading(true);
    try {
      // Get previous period ending inventory as beginning
      const prevMonth = periodMonth === 1 ? 12 : periodMonth - 1;
      const prevYear = periodMonth === 1 ? periodYear - 1 : periodYear;
      
      const { data: prevPeriod } = await supabase
        .from("period_end_inventory")
        .select("ending_inventory")
        .eq("company_id", companyId)
        .eq("period_year", prevYear)
        .eq("period_month", prevMonth)
        .single();

      if (prevPeriod) {
        setBeginningInventory(prevPeriod.ending_inventory.toString());
      } else {
        setBeginningInventory("0");
      }

      // Get auto-calculated purchases for current period
      const purchases = await getPeriodPurchases(companyId, periodYear, periodMonth);
      setCalculatedPurchases(purchases);
      setManualPurchases(purchases.toString());

      // Check if already submitted for this period
      const { data: existing } = await supabase
        .from("period_end_inventory")
        .select("id, cogs_amount")
        .eq("company_id", companyId)
        .eq("period_year", periodYear)
        .eq("period_month", periodMonth)
        .single();

      if (existing) {
        setCogsAmount(existing.cogs_amount);
        setStep("confirmation");
      }
    } catch (error) {
      console.error("Error loading period data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = () => {
    const begInv = parseFloat(beginningInventory) || 0;
    const purchases = parseFloat(manualPurchases) || 0;
    const endInv = parseFloat(endingInventory) || 0;

    const result = calculatePeriodicCOGS({
      beginningInventory: begInv,
      totalPurchases: purchases,
      endingInventory: endInv,
    });

    setCogsAmount(result.cogsAmount);
    setFormula(result.formula);
    setStep("review");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // Get COGS and Inventory Adjustment accounts
      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code")
        .eq("company_id", companyId)
        .in("account_code", ["5000", "5020"]);

      const cogsAccount = accounts?.find(a => a.account_code === "5000");
      const adjustmentAccount = accounts?.find(a => a.account_code === "5020");

      if (!cogsAccount || !adjustmentAccount) {
        throw new Error("COGS accounts not found. Please ensure accounts 5000 and 5020 exist.");
      }

      // Create journal entry for COGS adjustment
      const { data: { user } } = await supabase.auth.getUser();
      const postDate = `${periodYear}-${String(periodMonth).padStart(2, "0")}-28`;

      const { data: transaction, error: txError } = await supabase
        .from("transactions")
        .insert({
          company_id: companyId,
          user_id: user?.id,
          transaction_date: postDate,
          description: `Period-End COGS Adjustment - ${periodYear}/${periodMonth}`,
          reference_number: `COGS-${periodYear}${String(periodMonth).padStart(2, "0")}`,
          total_amount: cogsAmount,
          transaction_type: "adjustment",
          status: "posted",
        })
        .select("id")
        .single();

      if (txError) throw txError;

      // Create journal entry lines
      const entries = [
        {
          transaction_id: transaction.id,
          account_id: cogsAccount.id,
          debit: cogsAmount,
          credit: 0,
          description: "COGS Adjustment - Period End",
          status: "approved",
        },
        {
          transaction_id: transaction.id,
          account_id: adjustmentAccount.id,
          debit: 0,
          credit: cogsAmount,
          description: "Inventory Adjustment - Period End",
          status: "approved",
        },
      ];

      const { error: entryError } = await supabase
        .from("transaction_entries")
        .insert(entries);

      if (entryError) throw entryError;

      // Create ledger entries
      const ledgerEntries = entries.map(e => ({
        company_id: companyId,
        account_id: e.account_id,
        debit: e.debit,
        credit: e.credit,
        entry_date: postDate,
        is_reversed: false,
        transaction_id: transaction.id,
        description: e.description,
      }));

      const { error: ledgerError } = await supabase
        .from("ledger_entries")
        .insert(ledgerEntries);

      if (ledgerError) throw ledgerError;

      // Save period-end record
      const { error: periodError } = await supabase
        .from("period_end_inventory")
        .upsert({
          company_id: companyId,
          period_year: periodYear,
          period_month: periodMonth,
          beginning_inventory: parseFloat(beginningInventory) || 0,
          total_purchases: parseFloat(manualPurchases) || 0,
          ending_inventory: parseFloat(endingInventory) || 0,
          cogs_amount: cogsAmount,
          cogs_journal_id: transaction.id,
          calculated_at: new Date().toISOString(),
        }, {
          onConflict: "company_id,period_year,period_month"
        });

      if (periodError) throw periodError;

      toast({
        title: "COGS Posted Successfully",
        description: `COGS of R${cogsAmount.toFixed(2)} has been posted for ${periodYear}/${periodMonth}.`,
      });

      setStep("confirmation");
    } catch (error) {
      console.error("Error posting COGS:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to post COGS",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Period-End COGS Calculation
        </CardTitle>
        <CardDescription>
          Calculate and post Cost of Goods Sold for the selected period.
          This is only used when Inventory System is set to "Periodic".
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Period Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Year</Label>
            <Select
              value={periodYear.toString()}
              onValueChange={(v) => setPeriodYear(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025, 2026, 2027].map((year) => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Month</Label>
            <Select
              value={periodMonth.toString()}
              onValueChange={(v) => setPeriodMonth(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthNames.map((name, idx) => (
                  <SelectItem key={idx + 1} value={(idx + 1).toString()}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Step 1: Inputs */}
        {step === "inputs" && (
          <div className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Formula</AlertTitle>
              <AlertDescription>
                COGS = Beginning Inventory + Purchases - Ending Inventory
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Beginning Inventory (R)
                </Label>
                <Input
                  type="number"
                  value={beginningInventory}
                  onChange={(e) => setBeginningInventory(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Value from previous period's ending inventory
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Purchases (R)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={manualPurchases}
                    onChange={(e) => setManualPurchases(e.target.value)}
                    placeholder={calculatedPurchases.toString()}
                  />
                  <span className="text-xs text-muted-foreground">
                    Auto: R{calculatedPurchases.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Ending Inventory (R)
                </Label>
                <Input
                  type="number"
                  value={endingInventory}
                  onChange={(e) => setEndingInventory(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Physical count or stock valuation at period end
                </p>
              </div>
            </div>

            <Button 
              onClick={handleCalculate}
              disabled={loading || !beginningInventory || !endingInventory}
              className="w-full"
            >
              Calculate COGS
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 2: Review */}
        {step === "review" && (
          <div className="space-y-6">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Calculation Result</AlertTitle>
              <AlertDescription className="font-mono text-lg font-bold">
                R{cogsAmount.toFixed(2)}
              </AlertDescription>
            </Alert>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h4 className="font-semibold">Calculation Breakdown:</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span>Beginning Inventory:</span>
                <span className="font-mono">R{parseFloat(beginningInventory || "0").toFixed(2)}</span>
                <span>Purchases:</span>
                <span className="font-mono">R{parseFloat(manualPurchases || "0").toFixed(2)}</span>
                <span>Ending Inventory:</span>
                <span className="font-mono">R{parseFloat(endingInventory || "0").toFixed(2)}</span>
                <span className="font-bold">COGS:</span>
                <span className="font-mono font-bold">R{cogsAmount.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                {formula}
              </p>
            </div>

            <div className="flex gap-4">
              <Button 
                variant="outline" 
                onClick={() => setStep("inputs")}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {submitting ? "Posting..." : "Post COGS"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === "confirmation" && (
          <div className="space-y-6">
            <Alert variant="default" className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>COGS Already Posted</AlertTitle>
              <AlertDescription>
                COGS for {monthNames[periodMonth - 1]} {periodYear} has already been posted.
              </AlertDescription>
            </Alert>

            <div className="bg-muted p-4 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Posted COGS Amount</p>
                <p className="text-3xl font-bold">R{cogsAmount.toFixed(2)}</p>
              </div>
            </div>

            <Button 
              variant="outline" 
              onClick={() => setStep("inputs")}
              className="w-full"
            >
              Calculate for Different Period
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
