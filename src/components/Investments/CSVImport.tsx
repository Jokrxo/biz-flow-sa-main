import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export function InvestmentsCSVImport({ accountId }: { accountId: string }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);

  const parse = async () => {
    if (!file) { toast({ title: 'Choose file', variant: 'destructive' }); return; }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = lines.shift() || '';
    const cols = header.split(',').map(s => s.trim().toLowerCase());
    const idx = (name: string) => cols.indexOf(name);
    const out: Array<any> = [];
    lines.forEach(line => {
      const parts = line.split(',');
      const type = String(parts[idx('type')] || '').toLowerCase();
      const symbol = String(parts[idx('symbol')] || '');
      const date = String(parts[idx('date')] || new Date().toISOString().slice(0,10));
      const qty = Number(parts[idx('quantity')] || 0);
      const price = Number(parts[idx('price')] || 0);
      const total = Number(parts[idx('total')] || (qty * price));
      out.push({ type, symbol, trade_date: date, quantity: qty, price, total_amount: total });
    });
    try {
      for (const r of out) {
        await supabase.from('investment_transactions').insert({ account_id: accountId, ...r });
      }
      toast({ title: 'Imported', description: `${out.length} rows` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Import Investment CSV</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} />
          <Button onClick={parse}>Import</Button>
        </div>
      </CardContent>
    </Card>
  );
}
