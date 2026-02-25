import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Download } from "lucide-react";
import { exportFinancialReportToPDF } from "@/lib/export-utils";
import { useFiscalYear } from "@/hooks/use-fiscal-year";

interface AnnualBudgetRow {
  monthIndex: number; // 0-11
  monthName: string;
  totalBudgeted: number;
  totalActual: number;
  variance: number;
  utilization: number;
}

export const AnnualBudgetReport = () => {
  const { fiscalStartMonth, selectedFiscalYear, setSelectedFiscalYear, getFiscalYearDates, loading: fiscalLoading } = useFiscalYear();
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [rows, setRows] = useState<AnnualBudgetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({ budgeted: 0, actual: 0, variance: 0 });

  useEffect(() => {
    if (!fiscalLoading && typeof selectedFiscalYear === 'number') {
      setYear(String(selectedFiscalYear));
    }
  }, [fiscalLoading, selectedFiscalYear]);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  useEffect(() => {
    loadData();
  }, [year, fiscalStartMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
      if (!profile?.company_id) return;

      const { startDate: startObj, endDate: endObj, startStr, endStr } = getFiscalYearDates(parseInt(year));

      // 1. Fetch Budgets for the whole year
      const { data: budgets, error: budgetError } = await supabase
        .from('budgets')
        .select('budget_month, budgeted_amount, budget_year')
        .eq('company_id', profile.company_id)
        .gte('budget_year', startObj.getFullYear())
        .lte('budget_year', endObj.getFullYear());
      
      if (budgetError) throw budgetError;

      // 2. Fetch Actuals (Transactions) for the whole year
      // Note: We need to sum actuals based on transaction type (Expenses usually) or just match what BudgetManagement does.
      // BudgetManagement sums all budget items.
      // Usually "Budget vs Actual" is mostly relevant for Expenses (and sometimes Income).
      // For a high-level report, we'll sum ALL budgeted amounts per month vs ALL actuals for those accounts.
      // To keep it simple and consistent with the "Total Budgeted" vs "Total Spent" cards in the main view:
      // We will sum ALL transactions that hit accounts which have budgets, OR simply sum all expenses if that's the intent.
      // Given the previous module shows "Total Budgeted" and "Total Spent", let's replicate that logic per month.
      
      // Fetch Chart of Accounts to identify types
      const { data: accounts } = await supabase
        .from('chart_of_accounts')
        .select('id, account_type, normal_balance')
        .eq('company_id', profile.company_id);
        
      const accountMap = new Map(accounts?.map(a => [a.id, a]));

      // Fetch Transaction Entries
      const { data: entries, error: entryError } = await supabase
        .from('transaction_entries')
        .select('account_id, debit, credit, transactions!inner(transaction_date, status)')
        .eq('transactions.company_id', profile.company_id)
        .eq('transactions.status', 'posted') // Only posted/approved? The main module uses approved/posted
        .gte('transactions.transaction_date', startStr)
        .lte('transactions.transaction_date', endStr);
        
      if (entryError) throw entryError;

      // Process Data
      // We want to order rows by Fiscal Month (starting from fiscalStartMonth)
      const monthlyData = Array.from({ length: 12 }, (_, i) => ({
        budgeted: 0,
        actual: 0
      }));

      // Aggregate Budgets
      // We need to filter budgets that fall within our fiscal range.
      // A budget has (year, month).
      // If FY starts June (6) 2024.
      // June 2024 -> Year 2024, Month 6.
      // Jan 2025 -> Year 2025, Month 1.
      
      const isBudgetInPeriod = (bYear: number, bMonth: number) => {
        // Construct a date and check if it falls in [startObj, endObj]
        // Use day 15 to avoid timezone edge cases
        const d = new Date(bYear, bMonth - 1, 15);
        return d >= startObj && d <= endObj;
      };

      (budgets || []).forEach((b: any) => {
        const bYear = Number(b.budget_year);
        const bMonth = Number(b.budget_month); // 1-12
        if (isBudgetInPeriod(bYear, bMonth)) {
             // Map calendar month to fiscal index (0-11)
             // If start is June (6). June is index 0.
             // (Month - Start + 12) % 12
             const fiscalIndex = (bMonth - fiscalStartMonth + 12) % 12;
             monthlyData[fiscalIndex].budgeted += Number(b.budgeted_amount || 0);
        }
      });

      // Aggregate Actuals
      // Logic: For expense accounts (debit normal), actual = debit - credit. For income (credit normal), actual = credit - debit.
      // However, "Total Spent" usually implies Expenses. "Total Budgeted" in the main view sums EVERYTHING.
      // If we sum Income + Expense budgets, the "Total Budgeted" is mixed.
      // Let's assume the user wants to track **Spending** (Expenses) primarily, as that's the common use case for "Budget vs Actual".
      // But the main module sums ALL budgets. Let's follow the main module's "Total Actual" logic:
      // It sums actuals for ALL accounts that have a budget entry.
      // Here we don't know which specific accounts have budgets easily without iterating.
      // Let's broaden it: Sum Actuals for Expense accounts vs Budget for Expense accounts?
      // OR: Just sum ALL actuals for ALL accounts.
      // Let's refine: The main module calculates `totalActual` by iterating `budgets` and finding actuals for those specific accounts.
      // This is safer. But we want a high level overview.
      // Let's sum ALL Expense Accounts Actuals and ALL Expense Budgets. This is more meaningful for an "Annual Budget Report".
      // Mixing Income and Assets makes "Total Spent" confusing.
      // Let's filter for **Expense** type accounts to give a "Spending Report".
      
      const expenseAccountIds = new Set(accounts?.filter(a => String(a.account_type).toLowerCase() === 'expense').map(a => a.id));

      // Re-aggregate Budgets for EXPENSES only
      const monthlyExpenses = Array.from({ length: 12 }, (_, i) => ({
        budgeted: 0,
        actual: 0
      }));

      // We need budget account_ids. The previous fetch didn't get them. Let's re-fetch with account_id.
       const { data: expenseBudgets } = await supabase
        .from('budgets')
        .select('budget_month, budgeted_amount, account_id, budget_year')
        .eq('company_id', profile.company_id)
        .gte('budget_year', startObj.getFullYear())
        .lte('budget_year', endObj.getFullYear());

       (expenseBudgets || []).forEach((b: any) => {
           if (expenseAccountIds.has(b.account_id)) {
               const bYear = Number(b.budget_year);
               const bMonth = Number(b.budget_month);
               if (isBudgetInPeriod(bYear, bMonth)) {
                   const fiscalIndex = (bMonth - fiscalStartMonth + 12) % 12;
                   monthlyExpenses[fiscalIndex].budgeted += Number(b.budgeted_amount || 0);
               }
           }
       });

       (entries || []).forEach((e: any) => {
           if (expenseAccountIds.has(e.account_id)) {
               const d = new Date(e.transactions.transaction_date);
               if (d >= startObj && d <= endObj) {
                   const m = d.getMonth() + 1; // 1-12
                   const fiscalIndex = (m - fiscalStartMonth + 12) % 12;
                   // Expense is Debit normal: Debit - Credit
                   const val = Number(e.debit || 0) - Number(e.credit || 0);
                   monthlyExpenses[fiscalIndex].actual += val;
               }
           }
       });

       let totBud = 0;
       let totAct = 0;

       const results: AnnualBudgetRow[] = monthlyExpenses.map((d, i) => {
           totBud += d.budgeted;
           totAct += d.actual;
           // Calculate month name based on fiscal start
           const monthIndex = (fiscalStartMonth - 1 + i) % 12;
           return {
               monthIndex: i,
               monthName: months[monthIndex],
               totalBudgeted: d.budgeted,
               totalActual: d.actual,
               variance: d.budgeted - d.actual,
               utilization: d.budgeted > 0 ? (d.actual / d.budgeted) * 100 : 0
           };
       });

       setRows(results);
       setTotals({ budgeted: totBud, actual: totAct, variance: totBud - totAct });

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const header = ["Month", "Total Budgeted (Expenses)", "Total Spent", "Variance", "Utilization %", "Status"];
    const csvLines = rows.map((r) => [
      r.monthName,
      r.totalBudgeted.toFixed(2),
      r.totalActual.toFixed(2),
      r.variance.toFixed(2),
      r.utilization.toFixed(1) + "%",
      r.variance >= 0 ? "Under Budget" : "Over Budget"
    ]);
    const csv = [header.join(","), ...csvLines.map((l) => l.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Annual_Budget_Report_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-none shadow-md mt-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/10 border-b">
        <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Annual Budget Overview (Expenses)
            </CardTitle>
            <p className="text-sm text-muted-foreground">Yearly tracking of budgeted vs actual expenses</p>
        </div>
        <div className="flex items-center gap-2">
            <Select value={year} onValueChange={(val) => { setYear(val); const y = parseInt(val, 10); setSelectedFiscalYear(y); }}>
                <SelectTrigger className="w-[120px] bg-background">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {[2023, 2024, 2025, 2026, 2027].map(y => (
                        <SelectItem key={y} value={y.toString()}>
                            {fiscalStartMonth === 1 ? y : `FY ${y}`}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
            <TableHeader className="bg-muted/30">
                <TableRow>
                    <TableHead className="pl-6">Month</TableHead>
                    <TableHead className="text-right">Total Budgeted</TableHead>
                    <TableHead className="text-right">Total Spent</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                    <TableHead className="text-right pr-6">Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
                ) : (
                    <>
                        {rows.map((row) => (
                            <TableRow key={row.monthIndex} className="hover:bg-muted/50 border-b border-muted/40">
                                <TableCell className="pl-6 font-medium">{row.monthName}</TableCell>
                                <TableCell className="text-right font-mono text-muted-foreground">R {row.totalBudgeted.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-muted-foreground">R {row.totalActual.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className={`text-right font-mono font-bold ${row.variance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    R {Math.abs(row.variance).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm">{row.utilization.toFixed(1)}%</TableCell>
                                <TableCell className="text-right pr-6">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        row.variance >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {row.variance >= 0 ? 'Under Budget' : 'Over Budget'}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow className="bg-muted/20 font-bold border-t-2 border-primary/20">
                            <TableCell className="pl-6">TOTAL</TableCell>
                            <TableCell className="text-right font-mono">R {totals.budgeted.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right font-mono">R {totals.actual.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className={`text-right font-mono ${totals.variance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                R {Math.abs(totals.variance).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                                {totals.budgeted > 0 ? ((totals.actual / totals.budgeted) * 100).toFixed(1) : 0}%
                            </TableCell>
                            <TableCell className="text-right pr-6">
                                {totals.variance >= 0 ? "TOTAL UNDER BUDGET" : "TOTAL OVER BUDGET"}
                            </TableCell>
                        </TableRow>
                    </>
                )}
            </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
