import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Loader2, FileText, Download, Calendar, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { fetchCompanyFinancialMetrics, FinancialMetrics } from "@/lib/financial-utils";
import { exportFinancialRatiosToPDF } from "@/lib/export-utils";

interface FinancialHealthInsightProps {
  metrics?: FinancialMetrics;
  companyId?: string;
  trigger?: React.ReactNode;
}

export const FinancialHealthInsight = ({ metrics: initialMetrics, companyId, trigger }: FinancialHealthInsightProps) => {
  const [metrics, setMetrics] = useState<FinancialMetrics | undefined>(initialMetrics);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  
  // Date State (Sage Style Filter)
  const [startDate, setStartDate] = useState<string>(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const loadMetrics = async () => {
    if (companyId) {
      setLoading(true);
      try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        // Adjust end date to end of day
        end.setHours(23, 59, 59, 999);
        
        const data = await fetchCompanyFinancialMetrics(companyId, start, end);
        setMetrics(data);
      } catch (error) {
        console.error("Failed to load metrics", error);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (open && companyId && !initialMetrics) {
      loadMetrics();
    }
  }, [open, companyId, initialMetrics]);

  // Use initialMetrics if provided (dashboard), otherwise state metrics (company list)
  const activeMetrics = initialMetrics || metrics;

  const safeMetrics = activeMetrics || {
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    totalIncome: 0,
    totalExpenses: 0,
    currentAssets: 0,
    currentLiabilities: 0,
    bankBalance: 0
  };

  if (!activeMetrics && !loading && open) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
         <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" className="gap-2">
              <Activity className="h-4 w-4" />
              Financial Health
            </Button>
          )}
        </DialogTrigger>
        <DialogContent>
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const { totalAssets, totalLiabilities, totalEquity, totalIncome, totalExpenses } = safeMetrics;
  
  const netProfit = totalIncome - totalExpenses;
  const isSolvent = totalAssets >= totalLiabilities;
  const isProfitable = netProfit > 0;
  
  // Profitability Ratios
  const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;
  const roa = totalAssets > 0 ? (netProfit / totalAssets) * 100 : 0; // Return on Assets
  const roe = totalEquity > 0 ? (netProfit / totalEquity) * 100 : 0; // Return on Equity

  // Solvency Ratios
  const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
  const equityMultiplier = totalEquity > 0 ? totalAssets / totalEquity : 0;

  // Liquidity Ratios
  const currentRatio = safeMetrics.currentLiabilities > 0 ? safeMetrics.currentAssets / safeMetrics.currentLiabilities : (safeMetrics.currentAssets > 0 ? 10 : 0);
  const cashRatio = safeMetrics.currentLiabilities > 0 ? safeMetrics.bankBalance / safeMetrics.currentLiabilities : (safeMetrics.bankBalance > 0 ? 10 : 0);
  const cashToDebt = totalLiabilities > 0 ? (safeMetrics.bankBalance / totalLiabilities) * 100 : (safeMetrics.bankBalance > 0 ? 100 : 0); // Cash Coverage
  
  // Determine health status and message
  let healthStatus: "Strong" | "Stable" | "Attention" | "Critical" = "Stable";
  let healthMessage = "";
  let HealthIcon = Activity;

  if (isSolvent && isProfitable && profitMargin > 15) {
    healthStatus = "Strong";
    healthMessage = "The company is in a strong financial position with healthy profitability and solvency.";
    HealthIcon = CheckCircle2;
  } else if (isSolvent && isProfitable) {
    healthStatus = "Stable";
    healthMessage = "The company maintains a stable financial position with positive profitability.";
    HealthIcon = TrendingUp;
  } else if (isSolvent && !isProfitable) {
    healthStatus = "Attention";
    healthMessage = "The company is currently solvent but has reported a net loss for the period.";
    HealthIcon = AlertTriangle;
  } else {
    healthStatus = "Critical";
    healthMessage = "Attention required: The company is currently reporting liabilities in excess of assets.";
    HealthIcon = TrendingDown;
  }

  const colorMap = {
    Strong: "text-emerald-700 bg-emerald-50 border-emerald-200",
    Stable: "text-blue-700 bg-blue-50 border-blue-200",
    Attention: "text-amber-700 bg-amber-50 border-amber-200",
    Critical: "text-red-700 bg-red-50 border-red-200",
  };

  const statusColor = colorMap[healthStatus];

  // Recommendations Logic
  const recommendations = [];
  if (profitMargin < 10 && profitMargin > 0) recommendations.push("Profit margin is below 10%, indicating potential pressure on operating efficiency.");
  if (!isProfitable) recommendations.push("The company is not currently profitable. Review of revenue vs expenses is advised.");
  if (debtRatio > 50) recommendations.push("Debt ratio exceeds 50%, indicating a higher reliance on external liabilities.");
  if (currentRatio < 1.5) recommendations.push("Current Ratio is below 1.5, which may impact short-term liquidity.");
  if (cashRatio < 0.2) recommendations.push("Cash reserves are low relative to current liabilities.");
  if (roa < 5 && roa > 0) recommendations.push("Return on Assets is currently below 5%.");
  if (totalAssets > 0 && (totalIncome / totalAssets) < 0.5) recommendations.push("Asset turnover ratio indicates slower revenue generation relative to asset base.");
  if (recommendations.length === 0) recommendations.push("All key ratios appear to be within standard ranges.");

  const handleExport = () => {
    const periodLabel = `${startDate} to ${endDate}`;
    const items = [
      { category: 'Overview', metric: 'Financial Status', value: healthStatus, status: healthStatus },
      { category: 'Profitability', metric: 'Profit Margin', value: `${profitMargin.toFixed(1)}%`, status: profitMargin > 15 ? 'Strong' : profitMargin > 0 ? 'Stable' : 'Attention' },
      { category: 'Profitability', metric: 'Return on Assets', value: `${roa.toFixed(1)}%`, status: roa > 10 ? 'Strong' : 'Stable' },
      { category: 'Profitability', metric: 'Return on Equity', value: `${roe.toFixed(1)}%`, status: '-' },
      { category: 'Liquidity', metric: 'Current Ratio', value: currentRatio.toFixed(2), status: currentRatio > 1.5 ? 'Strong' : currentRatio > 1 ? 'Stable' : 'Attention' },
      { category: 'Liquidity', metric: 'Cash Ratio', value: cashRatio.toFixed(2), status: cashRatio > 0.5 ? 'Strong' : 'Stable' },
      { category: 'Liquidity', metric: 'Cash Coverage', value: `${cashToDebt.toFixed(1)}%`, status: '-' },
      { category: 'Solvency', metric: 'Debt Ratio', value: `${debtRatio.toFixed(1)}%`, status: debtRatio < 40 ? 'Strong' : debtRatio < 60 ? 'Stable' : 'Attention' },
      { category: 'Solvency', metric: 'Equity Multiplier', value: `${equityMultiplier.toFixed(2)}x`, status: '-' },
      { category: 'Balance Sheet', metric: 'Total Assets', value: `R ${totalAssets.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, status: '-' },
      { category: 'Balance Sheet', metric: 'Total Liabilities', value: `R ${totalLiabilities.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, status: '-' },
      { category: 'Balance Sheet', metric: 'Total Equity', value: `R ${totalEquity.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, status: '-' },
      { category: 'Operating', metric: 'Total Income', value: `R ${totalIncome.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, status: '-' },
      { category: 'Operating', metric: 'Total Expenses', value: `R ${totalExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, status: '-' },
      { category: 'Operating', metric: 'Net Profit', value: `R ${netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`, status: '-' },
    ];
    
    exportFinancialRatiosToPDF(items, periodLabel);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2 border-primary/20 hover:bg-primary/5 hover:text-primary">
            <Activity className="h-4 w-4" />
            Ratios Report
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Activity className="h-5 w-5 text-primary" />
              Financial Ratios Report
            </DialogTitle>
            <DialogDescription>
              Overview of key financial metrics and performance ratios.
            </DialogDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Export PDF
          </Button>
        </DialogHeader>

        {/* Filter Bar */}
        <div className="bg-slate-50 border-b p-4 flex items-center gap-4 flex-wrap">
           <div className="flex items-center gap-2">
             <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">From:</span>
             <Input 
               type="date" 
               value={startDate} 
               onChange={(e) => setStartDate(e.target.value)}
               className="h-8 w-[140px] bg-white"
             />
           </div>
           <div className="flex items-center gap-2">
             <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">To:</span>
             <Input 
               type="date" 
               value={endDate} 
               onChange={(e) => setEndDate(e.target.value)}
               className="h-8 w-[140px] bg-white"
             />
           </div>
           <Button size="sm" onClick={loadMetrics} className="h-8 gap-2 bg-[#0070ad] hover:bg-[#005a8d]">
             <RefreshCw className="h-3 w-3" />
             Refresh
           </Button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading report data...</p>
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Verdict Card */}
            <div className={`p-4 rounded-lg border flex gap-4 ${statusColor}`}>
              <div className={`p-2 rounded-full bg-white h-fit shadow-sm`}>
                <HealthIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg capitalize mb-1">Financial Status: {healthStatus}</h3>
                <p className="text-sm opacity-90 leading-relaxed">
                  {healthMessage}
                </p>
              </div>
            </div>

            {/* Profitability Ratios */}
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                Profitability
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="shadow-sm bg-slate-50/50 border">
                  <CardContent className="p-4 text-center">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Profit Margin</div>
                    <div className={`text-xl font-bold ${profitMargin > 15 ? 'text-emerald-600' : profitMargin > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {profitMargin.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm bg-slate-50/50 border">
                  <CardContent className="p-4 text-center">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Return on Assets</div>
                    <div className={`text-xl font-bold ${roa > 10 ? 'text-emerald-600' : 'text-primary'}`}>
                      {roa.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm bg-slate-50/50 border">
                  <CardContent className="p-4 text-center">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Return on Equity</div>
                    <div className="text-xl font-bold text-purple-600">
                      {roe.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Liquidity Ratios */}
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                Liquidity
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="shadow-sm bg-slate-50/50 border">
                  <CardContent className="p-4 text-center">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Current Ratio</div>
                    <div className={`text-xl font-bold ${currentRatio > 1.5 ? 'text-emerald-600' : currentRatio > 1 ? 'text-amber-600' : 'text-red-600'}`}>
                      {currentRatio.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm bg-slate-50/50 border">
                  <CardContent className="p-4 text-center">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Cash Ratio</div>
                    <div className={`text-xl font-bold ${cashRatio > 0.5 ? 'text-emerald-600' : 'text-primary'}`}>
                      {cashRatio.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm bg-slate-50/50 border">
                  <CardContent className="p-4 text-center">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Cash Coverage</div>
                    <div className={`text-xl font-bold ${cashToDebt > 50 ? 'text-emerald-600' : 'text-indigo-600'}`}>
                      {cashToDebt.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Solvency Ratios */}
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                Solvency
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="shadow-sm bg-slate-50/50 border">
                  <CardContent className="p-4 text-center">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Debt Ratio</div>
                    <div className={`text-xl font-bold ${debtRatio < 40 ? 'text-emerald-600' : debtRatio < 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {debtRatio.toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm bg-slate-50/50 border">
                  <CardContent className="p-4 text-center">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Equity Multiplier</div>
                    <div className="text-xl font-bold text-cyan-600">
                      {equityMultiplier.toFixed(2)}x
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Balance Sheet Summary */}
              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-3">
                  <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider mb-4 border-b pb-2">Balance Sheet Position</h4>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Assets</span>
                    <span className="font-bold text-emerald-600">R {totalAssets.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Liabilities</span>
                    <span className="font-bold text-red-600">R {totalLiabilities.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t mt-2">
                    <span className="text-sm font-medium">Total Equity</span>
                    <span className="font-bold text-purple-600">R {totalEquity.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Income Statement Summary */}
              <Card className="shadow-sm">
                <CardContent className="pt-6 space-y-3">
                  <h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider mb-4 border-b pb-2">Operating Performance (YTD)</h4>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Income</span>
                    <span className="font-bold text-emerald-600">R {totalIncome.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Expenses</span>
                    <span className="font-bold text-amber-600">R {totalExpenses.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t mt-2">
                    <span className="text-sm font-medium">Net Profit</span>
                    <span className={`font-bold ${isProfitable ? 'text-emerald-600' : 'text-red-600'}`}>
                      R {netProfit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Notes */}
            <div className="bg-muted/30 rounded-lg p-4 border border-dashed">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Notes & Observations
              </h4>
              <ul className="space-y-2">
                {recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="text-[10px] text-center text-muted-foreground mt-2">
              * Figures are based on posted ledger entries.
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
};
