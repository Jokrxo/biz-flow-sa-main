import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";

export const OpeningBalancesAdjustments = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Array<{ id: string; account_code: string; account_name: string; account_type: string; normal_balance?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 7;
  const [openingMap, setOpeningMap] = useState<Record<string, { amount: number; side: 'debit'|'credit'; note: string; offsetAccountId?: string }>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user?.id)
          .maybeSingle();
        const companyId = (profile as any)?.company_id;
        if (!companyId) { setAccounts([]); return; }
        const { data } = await supabase
          .from('chart_of_accounts' as any)
          .select('id, account_code, account_name, account_type, normal_balance, is_active')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('account_code');
        const rows = (data || []).map((a: any) => ({
          id: String(a.id),
          account_code: String(a.account_code || ''),
          account_name: String(a.account_name || ''),
          account_type: String(a.account_type || ''),
          normal_balance: String(a.normal_balance || '').toLowerCase() || undefined,
        }));
        setAccounts(rows);
      } catch (e: any) {
        toast({ title: 'Error', description: e.message || 'Failed to load chart of accounts', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, toast]);

  useEffect(() => { setPage(0); }, [search, typeFilter]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return accounts.filter(a => {
      const matchesType = typeFilter === 'all' || a.account_type.toLowerCase() === typeFilter.toLowerCase();
      const matchesSearch = a.account_name.toLowerCase().includes(q) || a.account_code.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [accounts, search, typeFilter]);

  const start = page * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const totalDebit = Object.values(openingMap).reduce((s, v) => s + (v.side === 'debit' ? (Number(v.amount) || 0) : 0), 0);
  const totalCredit = Object.values(openingMap).reduce((s, v) => s + (v.side === 'credit' ? (Number(v.amount) || 0) : 0), 0);

  const updateOpening = (id: string, updates: Partial<{ amount: number; side: 'debit'|'credit'; note: string; offsetAccountId: string }>) => {
    setOpeningMap(prev => ({
      ...prev,
      [id]: {
        amount: updates.amount !== undefined ? Number(updates.amount || 0) : (prev[id]?.amount || 0),
        side: updates.side || prev[id]?.side || 'debit',
        note: updates.note !== undefined ? updates.note || '' : (prev[id]?.note || ''),
        offsetAccountId: updates.offsetAccountId !== undefined ? updates.offsetAccountId : prev[id]?.offsetAccountId,
      }
    }));
  };

  const [postDate, setPostDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [posting, setPosting] = useState(false);
  const postBalances = async () => {
    try {
      const src = Object.entries(openingMap).filter(([id, ob]) => Number((ob as any).amount || 0) > 0);
      if (src.length === 0) { toast({ title: 'No amounts', description: 'Enter opening amounts first', variant: 'destructive' }); return; }
      const missing = src.some(([id, ob]) => !(ob as any).offsetAccountId);
      if (missing) { toast({ title: 'Offset required', description: 'Select an offset account for each amount', variant: 'destructive' }); return; }
      if (Number(totalDebit.toFixed(2)) !== Number(totalCredit.toFixed(2))) { toast({ title: 'Not balanced', description: 'Debit and Credit totals must match', variant: 'destructive' }); return; }
      setPosting(true);
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) throw new Error('User not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', u.id)
        .maybeSingle();
      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error('Company not found');
      const { data: tx, error: txErr } = await supabase
        .from('transactions' as any)
        .insert({ company_id: companyId, user_id: u.id, transaction_date: postDate, description: 'Opening balances adjustment', reference_number: `OPENING-${postDate}`, total_amount: 0, status: 'pending' })
        .select('id')
        .single();
      if (txErr) throw txErr;
      const txId = (tx as any)?.id;
      if (!txId) throw new Error('Failed to create transaction');
      const rows: Array<{ transaction_id: string; account_id: string; debit: number; credit: number; description: string; status: string }> = [];
      src.forEach(([id, ob]) => {
        const acc = accounts.find(a => a.id === id);
        const off = accounts.find(a => a.id === (ob as any).offsetAccountId);
        const amt = Number((ob as any).amount || 0);
        const side = (ob as any).side === 'credit' ? 'credit' : 'debit';
        const note = String((ob as any).note || '');
        if (acc && off && amt > 0) {
          rows.push({ transaction_id: txId, account_id: acc.id, debit: side === 'debit' ? amt : 0, credit: side === 'credit' ? amt : 0, description: note || `Opening for ${acc.account_code} - ${acc.account_name}`, status: 'approved' });
          rows.push({ transaction_id: txId, account_id: off.id, debit: side === 'credit' ? amt : 0, credit: side === 'debit' ? amt : 0, description: note || `Offset for ${acc.account_code} - ${acc.account_name}`, status: 'approved' });
        }
      });
      const { error: teErr } = await supabase.from('transaction_entries' as any).insert(rows);
      if (teErr) throw teErr;
      const { error: updErr } = await supabase.from('transactions' as any).update({ status: 'approved' }).eq('id', txId);
      if (updErr) throw updErr;
      try { await supabase.rpc('refresh_afs_cache' as any, { _company_id: companyId }); } catch {}
      toast({ title: 'Success', description: 'Opening balances posted to ledger' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to post opening balances', variant: 'destructive' });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Opening Balances (Chart of Accounts)</CardTitle>
          <CardDescription>List accounts and capture opening balances using your chart of accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Input placeholder="Search code or name" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="asset">Asset</SelectItem>
                <SelectItem value="liability">Liability</SelectItem>
                <SelectItem value="equity">Equity</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading accounts…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No accounts match</div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Normal</TableHead>
                  <TableHead className="text-right">Opening Amount</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map(a => {
                  const ob = openingMap[a.id] || { amount: 0, side: (a.normal_balance === 'credit' ? 'credit' : 'debit'), note: '', offsetAccountId: undefined };
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono">{a.account_code}</TableCell>
                      <TableCell>{a.account_name}</TableCell>
                      <TableCell className="capitalize">{a.account_type}</TableCell>
                      <TableCell className="capitalize">{a.normal_balance || '—'}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" value={String(ob.amount)} onChange={(e) => updateOpening(a.id, { amount: Number(e.target.value || 0) })} />
                      </TableCell>
                      <TableCell>
                        <Select value={ob.side} onValueChange={(v: any) => updateOpening(a.id, { side: v })}>
                          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="debit">Debit</SelectItem>
                            <SelectItem value="credit">Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input placeholder="Note" value={ob.note} onChange={(e) => updateOpening(a.id, { note: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Select value={ob.offsetAccountId || ''} onValueChange={(v: any) => updateOpening(a.id, { offsetAccountId: v })}>
                          <SelectTrigger className="w-48"><SelectValue placeholder="Offset account" /></SelectTrigger>
                          <SelectContent>
                            {accounts.map(x => (
                              <SelectItem key={x.id} value={x.id}>{x.account_code} - {x.account_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-muted-foreground">Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / pageSize))} • Showing {paged.length} of {filtered.length}</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
                <Button variant="outline" disabled={(page + 1) >= Math.ceil(filtered.length / pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
            <div className="mt-4 p-3 border rounded">
              <div className="flex items-center justify-between">
                <div className="text-sm">Totals</div>
                <div className="text-sm">Debit: R {totalDebit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} • Credit: R {totalCredit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Tip: Post these via Transactions journal to ensure balanced opening entries.</div>
              <div className="mt-2 flex gap-2 items-center">
                <Label className="text-xs">Posting Date</Label>
                <Input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} className="w-40" />
                <Button variant="outline" onClick={() => window.open('/transactions', '_blank')}>Open Transactions</Button>
                <Button className="bg-gradient-primary" disabled={posting} onClick={postBalances}>Update Balances</Button>
              </div>
            </div>
            <div className="mt-6">
              <div className="font-medium mb-2">Journal Preview (double-entry)</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead>Offset Account</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.flatMap(a => {
                    const ob = openingMap[a.id] || { amount: 0, side: (a.normal_balance === 'credit' ? 'credit' : 'debit'), note: '', offsetAccountId: undefined };
                    const amt = Number(ob.amount || 0);
                    if (!amt) return [] as any[];
                    const offset = accounts.find(x => x.id === ob.offsetAccountId);
                    const mainDebit = ob.side === 'debit' ? amt : 0;
                    const mainCredit = ob.side === 'credit' ? amt : 0;
                    const offDebit = ob.side === 'credit' ? amt : 0; // opposite
                    const offCredit = ob.side === 'debit' ? amt : 0;
                    return [
                      (
                        <TableRow key={a.id + '-main'}>
                          <TableCell className="font-mono">{a.account_code} - {a.account_name}</TableCell>
                          <TableCell className="text-right">{mainDebit ? `R ${mainDebit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                          <TableCell className="text-right">{mainCredit ? `R ${mainCredit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                          <TableCell>{offset ? `${offset.account_code} - ${offset.account_name}` : '—'}</TableCell>
                          <TableCell className="text-sm">{ob.note || '—'}</TableCell>
                        </TableRow>
                      ),
                      (
                        <TableRow key={a.id + '-offset'}>
                          <TableCell className="font-mono">{offset ? `${offset.account_code} - ${offset.account_name}` : 'Select offset'}</TableCell>
                          <TableCell className="text-right">{offDebit ? `R ${offDebit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                          <TableCell className="text-right">{offCredit ? `R ${offCredit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                          <TableCell>{a.account_code} - {a.account_name}</TableCell>
                          <TableCell className="text-sm">{ob.note || '—'}</TableCell>
                        </TableRow>
                      )
                    ];
                  })}
                </TableBody>
              </Table>
              <div className="mt-2 text-sm">Balanced: {Number(totalDebit.toFixed(2)) === Number(totalCredit.toFixed(2)) ? 'Yes' : 'No'} • Debit R {totalDebit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} • Credit R {totalCredit.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</div>
            </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Adjustments</CardTitle>
          <CardDescription>Record period-end adjustments (accruals, reclassifications, corrections).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Adjustment Date</Label>
              <Input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} />
            </div>
            <div>
              <Label>Reference</Label>
              <Input id="adjRefInput" placeholder="e.g. Correction for INV-100123" />
            </div>
            <div>
              <Label>Affected Transaction (optional)</Label>
              <Input id="adjAffectedInput" placeholder="Enter transaction reference or ID" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea id="adjNotesInput" rows={2} placeholder="Describe the reason for this adjustment" />
          </div>

          <div className="mt-2 font-medium">Journal Lines</div>
          <AdjustmentsJournal accounts={accounts} postDate={postDate} />
        </CardContent>
      </Card>
    </div>
  );
};

const AdjustmentsJournal = ({ accounts, postDate }: { accounts: Array<{ id: string; account_code: string; account_name: string; account_type: string }>; postDate: string }) => {
  const { toast } = useToast();
  const [lines, setLines] = useState<Array<{ accountId: string; side: 'debit'|'credit'; amount: number; offsetAccountId?: string; note?: string }>>([
    { accountId: '', side: 'debit', amount: 0, offsetAccountId: '', note: '' },
  ]);
  const addLine = () => setLines(prev => ([...prev, { accountId: '', side: 'debit', amount: 0, offsetAccountId: '', note: '' }]));
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const update = (idx: number, patch: Partial<{ accountId: string; side: 'debit'|'credit'; amount: number; offsetAccountId: string; note: string }>) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };
  const debitTotal = lines.reduce((s, l) => s + (l.side === 'debit' ? (Number(l.amount) || 0) : 0), 0);
  const creditTotal = lines.reduce((s, l) => s + (l.side === 'credit' ? (Number(l.amount) || 0) : 0), 0);

  const postAdjustment = async () => {
    try {
      const valid = lines.filter(l => (l.accountId && l.offsetAccountId && Number(l.amount) > 0));
      if (valid.length === 0) { toast({ title: 'No lines', description: 'Add at least one valid journal line', variant: 'destructive' }); return; }
      if (Number(debitTotal.toFixed(2)) !== Number(creditTotal.toFixed(2))) { toast({ title: 'Not balanced', description: 'Debit and Credit totals must match', variant: 'destructive' }); return; }
      const ref = (document.getElementById('adjRefInput') as HTMLInputElement | null)?.value || '';
      const affected = (document.getElementById('adjAffectedInput') as HTMLInputElement | null)?.value || '';
      const notes = (document.getElementById('adjNotesInput') as HTMLTextAreaElement | null)?.value || '';
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const companyId = (profile as any)?.company_id;
      if (!companyId) throw new Error('Company not found');
      const description = ref ? `Adjustment: ${ref}` : 'Adjustment';
      const { data: tx, error: txErr } = await supabase
        .from('transactions' as any)
        .insert({ company_id: companyId, user_id: user.id, transaction_date: postDate, description, reference_number: ref || null, total_amount: 0, status: 'pending' })
        .select('id')
        .single();
      if (txErr) throw txErr;
      const txId = (tx as any)?.id;
      if (!txId) throw new Error('Failed to create transaction');
      const entries: Array<{ transaction_id: string; account_id: string; debit: number; credit: number; description: string; status: string }> = [];
      valid.forEach(l => {
        const acc = accounts.find(a => a.id === l.accountId);
        const off = accounts.find(a => a.id === l.offsetAccountId);
        if (!acc || !off) return;
        const amt = Number(l.amount || 0);
        const side = l.side === 'credit' ? 'credit' : 'debit';
        const lineNote = (l.note || notes || '').trim();
        entries.push({ transaction_id: txId, account_id: acc.id, debit: side === 'debit' ? amt : 0, credit: side === 'credit' ? amt : 0, description: lineNote || `Adjust ${acc.account_code} - ${acc.account_name}`, status: 'approved' });
        entries.push({ transaction_id: txId, account_id: off.id, debit: side === 'credit' ? amt : 0, credit: side === 'debit' ? amt : 0, description: lineNote || `Offset ${acc.account_code} - ${acc.account_name}`, status: 'approved' });
      });
      const { error: teErr } = await supabase.from('transaction_entries' as any).insert(entries);
      if (teErr) throw teErr;
      const { error: updErr } = await supabase.from('transactions' as any).update({ status: 'approved' }).eq('id', txId);
      if (updErr) throw updErr;
      try { await supabase.rpc('refresh_afs_cache' as any, { _company_id: companyId }); } catch {}
      toast({ title: 'Success', description: 'Adjustment posted' });
      setLines([{ accountId: '', side: 'debit', amount: 0, offsetAccountId: '', note: '' }]);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to post adjustment', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead className="w-28">Side</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Offset Account</TableHead>
            <TableHead>Note</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l, idx) => (
            <TableRow key={`adj-${idx}`}>
              <TableCell>
                <Select value={l.accountId} onValueChange={(v: any) => update(idx, { accountId: v })}>
                  <SelectTrigger className="w-60"><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.account_code} - {a.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select value={l.side} onValueChange={(v: any) => update(idx, { side: v })}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                <Input type="number" step="0.01" value={String(l.amount || 0)} onChange={(e) => update(idx, { amount: Number(e.target.value || 0) })} />
              </TableCell>
              <TableCell>
                <Select value={l.offsetAccountId || ''} onValueChange={(v: any) => update(idx, { offsetAccountId: v })}>
                  <SelectTrigger className="w-60"><SelectValue placeholder="Select offset" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.account_code} - {a.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input placeholder="Line note" value={l.note || ''} onChange={(e) => update(idx, { note: e.target.value })} />
              </TableCell>
              <TableCell>
                <Button variant="ghost" onClick={() => removeLine(idx)} disabled={lines.length === 1}>Remove</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between">
        <div className="text-sm">Totals • Debit R {debitTotal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} • Credit R {creditTotal.toLocaleString('en-ZA', { minimumFractionDigits: 2 })} • Balanced: {Number(debitTotal.toFixed(2)) === Number(creditTotal.toFixed(2)) ? 'Yes' : 'No'}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={addLine}>Add Line</Button>
          <Button className="bg-gradient-primary" onClick={postAdjustment}>Post Adjustment</Button>
        </div>
      </div>
    </div>
  );
};
