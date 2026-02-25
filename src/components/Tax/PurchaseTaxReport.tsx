import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface VatRow { period: string; purchasesExclVat: number; vatInput: number; vatRate: string }
interface DetailRow { date: string; description: string; net: number; vat: number; total: number }

function formatMonth(dateStr: string) {
  const d = new Date(dateStr + "-01");
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "long" });
}

export const PurchaseTaxReport = () => {
  const [rows, setRows] = useState<VatRow[]>([]);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);

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

        const fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - 6);
        const from = fromDate.toISOString().slice(0, 10);

        const deriveNetAndVat = (total: number, base: number, vat: number, rate: number, inclusive: boolean): { net: number; vat: number } => {
          // Prefer recomputation for VAT-inclusive rows even if base is present
          if (inclusive && rate > 0) {
            const net = total / (1 + rate / 100);
            const v = Math.max(0, total - net);
            return { net: Math.max(0, net), vat: Math.max(0, v) };
          }
          let net = base > 0 ? base : 0;
          const v = Math.max(0, vat);
          if (net === 0) {
            if (v > 0) {
              net = Math.max(0, total - v);
            } else {
              net = base > 0 ? base : total;
            }
          }
          return { net: Math.max(0, net), vat: Math.max(0, v) };
        };

        const byMonth: Record<string, { vatInput: number; purchasesExclVat: number; rateWeighted: number; baseForRate: number }> = {};
        const detail: DetailRow[] = [];

        const { data: txs } = await supabase
          .from('transactions')
          .select('id, transaction_date, company_id, vat_rate, vat_inclusive, total_amount, description, status, transaction_type, vat_amount, base_amount')
          .eq('company_id', profile.company_id)
          .gte('transaction_date', from)
          .in('status', ['approved','posted','pending']);
        for (const t of (txs || []) as any[]) {
          const type = String(t.transaction_type || '').toLowerCase();
          const isPurchase = type === 'expense' || type === 'purchase' || type === 'bill' || type === 'product_purchase';
          if (!isPurchase) continue;
          const ym = String(t.transaction_date || '').slice(0, 7);
          if (!byMonth[ym]) byMonth[ym] = { vatInput: 0, purchasesExclVat: 0, rateWeighted: 0, baseForRate: 0 };
          const total = Number(t.total_amount || 0);
          const base = Number(t.base_amount || 0);
          const vat = Number(t.vat_amount || 0);
          const rate = Number(t.vat_rate || 0);
          const inclusive = Boolean(t.vat_inclusive);
          const { net, vat: vAdj } = deriveNetAndVat(total, base, vat, rate, inclusive);
          byMonth[ym].vatInput += Math.max(0, vAdj);
          byMonth[ym].purchasesExclVat += Math.max(0, net);
          if (rate > 0 && net > 0) {
            byMonth[ym].rateWeighted += rate * net;
            byMonth[ym].baseForRate += net;
          }
          detail.push({ date: String(t.transaction_date || ''), description: t.description || '', net: Math.max(0, net), vat: Math.max(0, vAdj), total });
        }

        const result: VatRow[] = Object.keys(byMonth)
          .sort()
          .map((ym) => ({
            period: formatMonth(ym),
            purchasesExclVat: byMonth[ym].purchasesExclVat,
            vatInput: byMonth[ym].vatInput,
            vatRate: (byMonth[ym].baseForRate > 0)
              ? `${(byMonth[ym].rateWeighted / byMonth[ym].baseForRate).toFixed(2)}%`
              : ''
          }))
          .reverse();

        setRows(result);
        setDetails(detail.slice(0, 20));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const exportCsv = () => {
    const header = ['Period','Purchases Excl VAT','VAT Input','VAT Rate'];
    const lines = rows.map(r => [r.period, r.purchasesExclVat.toFixed(2), r.vatInput.toFixed(2), r.vatRate]);
    const csv = [header.join(','), ...lines.map(l => l.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tax-expense-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> Tax on Expense (Purchases from Transactions)</span>
          <Button variant="outline" onClick={exportCsv}>Export</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-muted-foreground">Loading tax on expense…</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Purchases (excl. VAT)</TableHead>
                  <TableHead className="text-right">VAT Input</TableHead>
                  <TableHead className="text-right">Tax Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.period}>
                    <TableCell className="font-medium">{row.period}</TableCell>
                    <TableCell className="text-right">R {row.purchasesExclVat.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right font-semibold text-primary">R {row.vatInput.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">{row.vatRate}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-6">
              <CardTitle className="text-sm font-medium mb-2">Recent Purchases and Expenses (excl. VAT)</CardTitle>
              <Table>
                <TableHeader>
                  <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount (incl. VAT)</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Amount (excl. VAT)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell>{d.date}</TableCell>
                      <TableCell className="font-medium">{d.description}</TableCell>
                      <TableCell className="text-right">R {d.total.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">R {d.vat.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">R {d.net.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
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
