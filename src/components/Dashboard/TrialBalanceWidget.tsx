import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TrialBalanceWidgetProps {
  metrics: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalIncome: number;
    totalExpenses: number;
  };
  lastUpdated?: Date;
}

export const TrialBalanceWidget = ({ metrics, lastUpdated = new Date() }: TrialBalanceWidgetProps) => {
  const navigate = useNavigate();
  const [showTable, setShowTable] = useState(false);

  // Calculate totals
  const totalDebits = metrics.totalAssets + metrics.totalExpenses;
  const totalCredits = metrics.totalLiabilities + metrics.totalEquity + metrics.totalIncome;
  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference < 0.01;

  // Formatting helper
  const formatCurrency = (amount: number) => 
    `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Bar heights calculation (max height 120px) with simple CSS animation
  const maxValue = Math.max(totalDebits, totalCredits) || 1;
  const [debitHeight, setDebitHeight] = useState(0);
  const [creditHeight, setCreditHeight] = useState(0);

  useEffect(() => {
    const dh = (totalDebits / maxValue) * 100;
    const ch = (totalCredits / maxValue) * 100;
    setDebitHeight(isFinite(dh) ? dh : 0);
    setCreditHeight(isFinite(ch) ? ch : 0);
  }, [totalDebits, totalCredits, maxValue]);

  return (
    <Card className="card-professional shadow-md hover:shadow-lg transition-all duration-300 relative overflow-hidden group cursor-pointer h-full" onClick={() => !showTable && setShowTable(true)}>
      <CardContent className="p-6 h-full flex flex-col justify-between">
        
        {/* Main Graph View */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-lg text-foreground/80">Trial Balance</h3>
            <div className="text-[10px] text-muted-foreground bg-muted/30 px-2 py-1 rounded-full">
               Tap to view details
            </div>
          </div>

          <div className="flex-1 flex items-end justify-center gap-8 min-h-[160px] pb-4 relative">
             {/* Center Status Indicator */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10 flex flex-col items-center">
                {isBalanced ? (
                  <div className="bg-white/80 backdrop-blur-sm p-2 rounded-full shadow-sm border border-emerald-100 transition-transform duration-300">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="bg-white/80 backdrop-blur-sm p-2 rounded-full shadow-sm border border-red-100 mb-1 transition-transform duration-300">
                       <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200">
                      Diff: {formatCurrency(difference)}
                    </span>
                  </div>
                )}
             </div>

             {/* Debit Column */}
             <div className="flex flex-col items-center gap-2 w-1/3 group-hover:scale-105 transition-transform duration-300">
                <span className="text-xl font-bold text-blue-600 tracking-tight">{formatCurrency(totalDebits)}</span>
                <div className="w-full bg-blue-100/30 rounded-t-lg relative h-[140px] flex items-end justify-center overflow-hidden">
                   <div 
                     className={`w-full ${!isBalanced && totalDebits > totalCredits ? 'bg-red-400/80' : 'bg-blue-500'} rounded-t-lg opacity-90 transition-all duration-700 ease-out`}
                     style={{ height: `${debitHeight}%` }}
                   />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Debits</span>
             </div>

             {/* Credit Column */}
             <div className="flex flex-col items-center gap-2 w-1/3 group-hover:scale-105 transition-transform duration-300">
                <span className="text-xl font-bold text-emerald-600 tracking-tight">{formatCurrency(totalCredits)}</span>
                <div className="w-full bg-emerald-100/30 rounded-t-lg relative h-[140px] flex items-end justify-center overflow-hidden">
                   <div 
                     className={`w-full ${!isBalanced && totalCredits > totalDebits ? 'bg-red-400/80' : 'bg-emerald-500'} rounded-t-lg opacity-90 transition-all duration-700 ease-out`}
                     style={{ height: `${creditHeight}%` }}
                   />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Credits</span>
             </div>
          </div>
        </div>

        {/* Footer Distribution Strip */}
        <div className="mt-4 pt-4 border-t border-dashed">
           <div className="flex h-2 w-full rounded-full overflow-hidden mb-2">
              <div className="bg-blue-400" style={{ width: `${(metrics.totalAssets / totalDebits) * 100}%` }} title="Assets" />
              <div className="bg-blue-300" style={{ width: `${(metrics.totalExpenses / totalDebits) * 100}%` }} title="Expenses" />
              <div className="w-1 bg-white" />
              <div className="bg-emerald-400" style={{ width: `${(metrics.totalLiabilities / totalCredits) * 100}%` }} title="Liabilities" />
              <div className="bg-emerald-300" style={{ width: `${(metrics.totalEquity / totalCredits) * 100}%` }} title="Equity" />
              <div className="bg-emerald-500" style={{ width: `${(metrics.totalIncome / totalCredits) * 100}%` }} title="Income" />
           </div>
           <div className="flex justify-between items-center text-[10px] text-muted-foreground">
              <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
              <span>{lastUpdated.toLocaleDateString()}</span>
           </div>
        </div>
      </CardContent>

      {/* Table Overlay */}
      {showTable && (
          <div 
            className="absolute inset-0 bg-background/95 backdrop-blur-md z-20 flex flex-col p-6 transition-transform duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
               <h3 className="font-semibold text-lg">Summary Table</h3>
               <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted" onClick={() => setShowTable(false)}>
                 <X className="h-4 w-4" />
               </Button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase tracking-wider text-left">
                    <th className="pb-2 font-medium">Account Type</th>
                    <th className="pb-2 font-medium text-right text-blue-600">Debit</th>
                    <th className="pb-2 font-medium text-right text-emerald-600">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr>
                    <td className="py-3 font-medium">Assets</td>
                    <td className="py-3 text-right">{formatCurrency(metrics.totalAssets)}</td>
                    <td className="py-3 text-right text-muted-foreground">-</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium">Liabilities</td>
                    <td className="py-3 text-right text-muted-foreground">-</td>
                    <td className="py-3 text-right">{formatCurrency(metrics.totalLiabilities)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium">Equity</td>
                    <td className="py-3 text-right text-muted-foreground">-</td>
                    <td className="py-3 text-right">{formatCurrency(metrics.totalEquity)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium">Income</td>
                    <td className="py-3 text-right text-muted-foreground">-</td>
                    <td className="py-3 text-right">{formatCurrency(metrics.totalIncome)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium">Expenses</td>
                    <td className="py-3 text-right">{formatCurrency(metrics.totalExpenses)}</td>
                    <td className="py-3 text-right text-muted-foreground">-</td>
                  </tr>
                </tbody>
                <tfoot className="bg-muted/30 font-bold">
                  <tr>
                    <td className="py-3 pl-2">Totals</td>
                    <td className={`py-3 text-right ${!isBalanced && totalDebits > totalCredits ? 'text-red-500' : 'text-blue-700'}`}>
                      {formatCurrency(totalDebits)}
                    </td>
                    <td className={`py-3 text-right ${!isBalanced && totalCredits > totalDebits ? 'text-red-500' : 'text-emerald-700'}`}>
                      {formatCurrency(totalCredits)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4 pt-4 border-t flex justify-between items-center">
               <span className="text-xs text-muted-foreground">
                 {isBalanced ? "All accounts balanced" : "Discrepancy detected"}
               </span>
               <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => navigate('/trial-balance')}>
                  Open Full Trial Balance
                  <ArrowRight className="h-3 w-3" />
               </Button>
            </div>
          </div>
        )}
    </Card>
  );
};
