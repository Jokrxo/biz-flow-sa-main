import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";

export const CorporateTaxSettings = () => {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [citRate, setCitRate] = useState<string>("27");
  const [wearTear, setWearTear] = useState<Array<{ asset: string; method: string; period: string; note?: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newRow, setNewRow] = useState<{ asset: string; method: string; period: string; note?: string }>({ asset: "", method: "Straight-line", period: "", note: "" });

  useEffect(() => {
    const init = async () => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const cid = profile?.company_id || null;
      setCompanyId(cid);
      if (!cid) { setLoading(false); return; }
      const { data: app } = await supabase
        .from("app_settings" as any)
        .select("*" as any)
        .eq("company_id", cid)
        .maybeSingle();
      const rate = Number((app as any)?.corporate_tax_rate || 0);
      if (rate > 0) setCitRate(String(rate));
      try {
        const raw = (app as any)?.wear_and_tear_json;
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) setWearTear(parsed);
      } catch {
        setWearTear([]);
      }
      setLoading(false);
    };
    init();
  }, [user]);

  const addWearTear = () => {
    if (!newRow.asset || !newRow.period) return;
    setWearTear(prev => [...prev, { ...newRow }]);
    setNewRow({ asset: "", method: "Straight-line", period: "", note: "" });
  };

  const removeWearTear = (idx: number) => {
    setWearTear(prev => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      await (supabase as any)
        .from("app_settings" as any)
        .update({
          corporate_tax_rate: Number(citRate || 0),
          wear_and_tear_json: JSON.stringify(wearTear || []),
        } as any)
        .eq("company_id", companyId);
    } catch {}
    setSaving(false);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading tax settings…</div>;

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-2">
            <Label>Corporate Income Tax Rate (%)</Label>
            <Input type="number" min="0" step="0.1" value={citRate} onChange={(e) => setCitRate(e.target.value)} />
            <div className="text-xs text-muted-foreground">Standard corporate tax rate applied to taxable income.</div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="text-sm font-semibold tracking-wide">Wear-and-Tear Schedules</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset class</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Note</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {wearTear.map((w, idx) => (
              <TableRow key={`${w.asset}-${idx}`} className="hover:bg-muted/20">
                <TableCell>{w.asset}</TableCell>
                <TableCell>{w.method}</TableCell>
                <TableCell>{w.period}</TableCell>
                <TableCell className="text-muted-foreground">{w.note || ""}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => removeWearTear(idx)}>Remove</Button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>
                <Input placeholder="Asset class" value={newRow.asset} onChange={(e) => setNewRow(prev => ({ ...prev, asset: e.target.value }))} />
              </TableCell>
              <TableCell>
                <Input placeholder="Method" value={newRow.method} onChange={(e) => setNewRow(prev => ({ ...prev, method: e.target.value }))} />
              </TableCell>
              <TableCell>
                <Input placeholder="Period" value={newRow.period} onChange={(e) => setNewRow(prev => ({ ...prev, period: e.target.value }))} />
              </TableCell>
              <TableCell>
                <Input placeholder="Note (optional)" value={newRow.note} onChange={(e) => setNewRow(prev => ({ ...prev, note: e.target.value }))} />
              </TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={addWearTear}>+ Add</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Settings"}</Button>
      </div>
    </div>
  );
};
