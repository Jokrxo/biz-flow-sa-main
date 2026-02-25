import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Download } from "lucide-react";
import { exportFinancialReportToPDF } from "@/lib/export-utils";
import { useFiscalYear } from "@/hooks/use-fiscal-year";

type Position = "VAT Payable" | "VAT Receivable" | "Neutral";

interface AnnualVatRow {
  monthIndex: number; // 0-11
  monthName: string;
  vatOutput: number;
  vatInput: number;
  net: number;
  position: Position;
}

export const AnnualVATReport = () => {
  const { fiscalStartMonth, selectedFiscalYear, setSelectedFiscalYear, getFiscalYearDates, loading: fiscalLoading } = useFiscalYear();
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [rows, setRows] = useState<AnnualVatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({ output: 0, input: 0, net: 0 });

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
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (!profile?.company_id) return;

      const { startDate: startObj, endDate: endObj, startStr, endStr } = getFiscalYearDates(parseInt(year));

      const { data: txs, error } = await supabase
        .from('transactions')
        .select('transaction_date, transaction_type, vat_rate, vat_inclusive, total_amount, vat_amount, base_amount')
        .eq('company_id', profile.company_id)
        .in('status', ['approved','posted','pending']) // Include pending? Usually approved/posted for reports
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr);
      
      if (error) throw error;

      // Initialize all 12 months with 0
      const monthlyData = Array.from({ length: 12 }, (_, i) => ({
        out: 0,
        inn: 0
      }));

      (txs || []).forEach((t: any) => {
        const d = new Date(t.transaction_date);
        
        // Ensure date is within range (though API filtered, good to be safe)
        if (d >= startObj && d <= endObj) {
            const m = d.getMonth() + 1; // 1-12
            // Map to fiscal index (0-11)
            const fiscalIndex = (m - fiscalStartMonth + 12) % 12;

            const type = String(t.transaction_type || '').toLowerCase();
            const isIncome = ['income','sales','receipt'].includes(type);
            const isPurchase = ['expense','purchase','bill','product_purchase'].includes(type);
            const rate = Number(t.vat_rate || 0);
            const total = Number(t.total_amount || 0);
            const base = Number(t.base_amount || 0);
            const inclusive = Boolean(t.vat_inclusive);
            
            let vat = Number(t.vat_amount || 0);

            // Calculate VAT if not stored or if 0 but rate > 0
            if (vat === 0 && rate > 0) {
                if (inclusive) {
                    const net = base > 0 ? base : total / (1 + rate / 100);
                    vat = total - net;
                } else {
                    vat = total - (base > 0 ? base : total);
                }
            }

            if (isIncome) {
                monthlyData[fiscalIndex].out += Math.max(0, vat);
            } else if (isPurchase) {
                monthlyData[fiscalIndex].inn += Math.max(0, vat);
            }
        }
      });

      let totOut = 0;
      let totIn = 0;

      const results: AnnualVatRow[] = monthlyData.map((d, i) => {
        const net = d.inn - d.out;
        totOut += d.out;
        totIn += d.inn;
        // Calculate month name
        const monthIndex = (fiscalStartMonth - 1 + i) % 12;
        return {
            monthIndex: i,
            monthName: months[monthIndex],
            vatOutput: d.out,
            vatInput: d.inn,
            net: net,
            position: net > 0 ? "VAT Receivable" : net < 0 ? "VAT Payable" : "Neutral"
        };
      });

      setRows(results);
      setTotals({ output: totOut, input: totIn, net: totIn - totOut });

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    const lines = [
        { account: "ANNUAL VAT REPORT", amount: 0, type: "header" },
        { account: `Year: ${year}`, amount: 0, type: "spacer" },
        ...rows.map(r => ({
            account: r.monthName,
            amount: r.net,
            type: "detail", // We might need to adjust export util to handle multi-column, but typically it takes key-value. 
                            // Since export util is simple, let's just dump net or maybe just list them.
                            // Actually, let's just use the table export logic if possible or just skip for now if complex.
                            // Let's stick to standard single column export for now or just basic CSV.
        }))
    ];
    // Re-using the CSV export logic from VAT201 for simplicity and consistency with previous request
    const header = ["Month", "VAT Output", "VAT Input", "Net (Input - Output)", "Position"];
    const csvLines = rows.map((r) => [
      r.monthName,
      r.vatOutput.toFixed(2),
      r.vatInput.toFixed(2),
      r.net.toFixed(2),
      r.position,
    ]);
    const csv = [header.join(","), ...csvLines.map((l) => l.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Annual_VAT_Report_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="mt-6 border-none shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/10 border-b">
        <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Annual VAT Report
            </CardTitle>
            <p className="text-sm text-muted-foreground">Yearly summary of Output and Input VAT</p>
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
            <Button variant="outline" size="sm" onClick={exportPDF}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
            <TableHeader className="bg-muted/30">
                <TableRow>
                    <TableHead className="pl-6">Month</TableHead>
                    <TableHead className="text-right">VAT Output (Sales)</TableHead>
                    <TableHead className="text-right">VAT Input (Purchases)</TableHead>
                    <TableHead className="text-right">Net VAT</TableHead>
                    <TableHead className="text-right pr-6">Position</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell></TableRow>
                ) : (
                    <>
                        {rows.map((row) => (
                            <TableRow key={row.monthIndex} className="hover:bg-muted/50 border-b border-muted/40">
                                <TableCell className="pl-6 font-medium">{row.monthName}</TableCell>
                                <TableCell className="text-right font-mono text-muted-foreground">R {row.vatOutput.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className="text-right font-mono text-muted-foreground">R {row.vatInput.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                                <TableCell className={`text-right font-mono font-bold ${row.net > 0 ? 'text-emerald-600' : row.net < 0 ? 'text-red-600' : ''}`}>
                                    R {Math.abs(row.net).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right pr-6">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        row.position === 'VAT Receivable' ? 'bg-emerald-100 text-emerald-800' :
                                        row.position === 'VAT Payable' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                    }`}>
                                        {row.position}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}
                        <TableRow className="bg-muted/20 font-bold border-t-2 border-primary/20">
                            <TableCell className="pl-6">TOTAL</TableCell>
                            <TableCell className="text-right font-mono">R {totals.output.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right font-mono">R {totals.input.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className={`text-right font-mono ${totals.net > 0 ? 'text-emerald-700' : totals.net < 0 ? 'text-red-700' : ''}`}>
                                R {Math.abs(totals.net).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right pr-6">
                                {totals.net > 0 ? "TOTAL RECEIVABLE" : totals.net < 0 ? "TOTAL PAYABLE" : "-"}
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
