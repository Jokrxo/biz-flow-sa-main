import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const PurchaseTransactions = () => {
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; date: string; description: string; reference: string; amount: number; status: string }>>([]);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(10);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setRows([]); return; }
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const companyId = (profile as any)?.company_id;
        if (!companyId) { setRows([]); return; }

        const { data: txs } = await supabase
          .from("transactions")
          .select(`id, description, transaction_date, reference_number, total_amount, status,
            entries:transaction_entries(id, debit, credit, chart_of_accounts(account_type, account_name))
          `)
          .eq("company_id", companyId)
          .order("transaction_date", { ascending: false });

        const mapped = (txs || []).filter((t: any) => {
          const hasExpense = (t.entries || []).some((e: any) => String(e.chart_of_accounts?.account_type || "").toLowerCase().includes("expense"));
          return hasExpense;
        }).map((t: any) => ({
          id: t.id,
          date: new Date(t.transaction_date).toLocaleDateString('en-ZA'),
          description: t.description || "",
          reference: t.reference_number || "",
          amount: Math.abs(Number(t.total_amount || 0)),
          status: String(t.status || "").toLowerCase()
        }));
        setRows(mapped);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = rows.filter(r => (
    r.description.toLowerCase().includes(search.toLowerCase()) ||
    r.reference.toLowerCase().includes(search.toLowerCase())
  ));
  const totalCount = filtered.length;
  const start = page * pageSize;
  const pagedRows = filtered.slice(start, start + pageSize);
  useEffect(() => { setPage(0); }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {showFilters && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transactions..."
              className="pl-8"
            />
          </div>
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No purchase transactions found</p>
                </TableCell>
              </TableRow>
            ) : pagedRows.map(r => (
              <TableRow key={r.id}>
                <TableCell>{r.date}</TableCell>
                <TableCell className="font-medium">{r.description}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.reference || "–"}</TableCell>
                <TableCell className="text-right font-medium">R {r.amount.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</TableCell>
                <TableCell>
                  <Badge variant={
                    r.status === 'approved' ? 'secondary' :
                    r.status === 'posted' ? 'default' :
                    'outline'
                  } className={
                    r.status === 'approved' ? 'bg-green-100 text-green-700 hover:bg-green-100 border-green-200' :
                    r.status === 'posted' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200' : ''
                  }>
                    {r.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t">
            <div className="text-sm text-muted-foreground">
              Page {page + 1} of {Math.max(1, Math.ceil(totalCount / pageSize))} • Showing {pagedRows.length} of {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={(page + 1) >= Math.ceil(totalCount / pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
