import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface VatRow {
  period: string;
  salesExclVat: number;
  vatCollected: number; // output VAT (credits)
  vatRate: string;
}
interface DetailRow { date: string; description: string; net: number; vat: number; total: number }

function formatMonth(dateStr: string) {
  const d = new Date(dateStr + "-01");
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "long" });
}

export const SalesTaxReport = () => {
  const [rows, setRows] = useState<VatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const exportCsv = () => {
    const header = ['Period','Sales Excl VAT','VAT Collected','Tax Rate'];
    const lines = rows.map(r => [r.period, r.salesExclVat.toFixed(2), r.vatCollected.toFixed(2), r.vatRate]);
    const csv = [header.join(','), ...lines.map(l => l.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales-tax-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const load = async () => {
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

        // Remove strict date filter to include all historical sales VAT

        const { data: txs, error } = await supabase
          .from('transactions')
          .select('id, transaction_date, company_id, vat_rate, vat_inclusive, total_amount, description, status, transaction_type, vat_amount, base_amount')
          .eq('company_id', profile.company_id)
          .in('status', ['approved','posted','pending'])
          .order('transaction_date', { ascending: false });

        if (error) throw error;

        const byMonth: Record<string, { vatCollected: number; salesExclVat: number; rate: number }> = {};
        const detail: DetailRow[] = [];
        for (const t of (txs || []) as any[]) {
          const type = String(t.transaction_type || '').toLowerCase();
          const isIncome = type === 'income' || type === 'sales' || type === 'receipt';
          if (!isIncome) continue;
          const rate = Number(t.vat_rate || 0);
          const total = Number(t.total_amount || 0);
          const base = Number(t.base_amount || 0);
          const inclusive = Boolean(t.vat_inclusive);
          let vat = Number(t.vat_amount || 0);
          let net = base > 0 ? base : 0;
          if (net === 0) {
            if (inclusive && rate > 0) {
              net = total / (1 + rate / 100);
              vat = total - net;
            } else if (rate > 0 && vat > 0) {
              net = total - vat;
            } else {
              net = base > 0 ? base : total;
            }
          }
          const ym = String(t.transaction_date || '').slice(0, 7);
          if (!byMonth[ym]) byMonth[ym] = { vatCollected: 0, salesExclVat: 0, rate };
          byMonth[ym].vatCollected += Math.max(0, vat);
          byMonth[ym].salesExclVat += Math.max(0, net);
          detail.push({ date: String(t.transaction_date || ''), description: t.description || '', net, vat: Math.max(0, vat), total });
        }

        const result: VatRow[] = Object.keys(byMonth)
          .sort()
          .map((ym) => ({
            period: formatMonth(ym),
            salesExclVat: byMonth[ym].salesExclVat,
            vatCollected: byMonth[ym].vatCollected,
            vatRate: `${byMonth[ym].rate}%`,
          }))
          .reverse();

        setRows(result);
        setDetails(detail.slice(0, 20));
      } catch (e) {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Sales Tax Report</span>
          <Button variant="outline" onClick={exportCsv}>Export</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-muted-foreground">Loading VAT report…</div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Total Sales (excl. VAT)</TableHead>
                <TableHead className="text-right">VAT Collected</TableHead>
                <TableHead className="text-right">Tax Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.period}>
                  <TableCell className="font-medium">{row.period}</TableCell>
                  <TableCell className="text-right">R {row.salesExclVat.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">R {row.vatCollected.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right">{row.vatRate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-6">
            <CardTitle className="text-sm font-medium mb-2">Recent VAT-bearing Sales</CardTitle>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount (excl. VAT)</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Amount (incl. VAT)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell>{d.date}</TableCell>
                    <TableCell className="font-medium">{d.description}</TableCell>
                    <TableCell className="text-right">R {d.net.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">R {d.vat.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">R {d.total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
