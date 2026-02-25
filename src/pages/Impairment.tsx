import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { supabase, hasSupabaseEnv } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { AlertCircle, CheckCircle2, Lock, Unlock, RefreshCw, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type FnRpc = <T>(fn: string, params?: Record<string, any>) => Promise<{ data: T | null, error: any }>;

interface ImpairmentSettings {
  ecl_rate_0_30: number;
  ecl_rate_31_60: number;
  ecl_rate_61_90: number;
  ecl_rate_90_plus: number;
  discount_rate: number;
  sicr_threshold_days: number;
  pd_stage1: number;
  pd_stage2: number;
  pd_stage3: number;
  lgd_percent: number;
  macro_overlay: number;
}

interface ReceivableItem {
  id: string;
  invoice_number: string;
  outstanding: number;
  days_overdue: number;
  bucket: string;
  rate: number;
  expected_loss: number;
}

interface ReceivablesPreview {
  summary: {
    total_outstanding: number;
    total_expected_loss: number;
  };
  items: ReceivableItem[];
}

interface AssetItem {
  asset_id: string;
  description: string;
  carrying_amount: number;
  recoverable_amount: number;
  impairment_loss: number;
}

interface AssetsPreview {
  summary: {
    total_impairment: number;
    count: number;
  };
  items: AssetItem[];
}

interface InventoryItem {
  item_id: string;
  name: string;
  qty: number;
  carrying_amount: number;
  nrv_total: number;
  write_down: number;
}

interface InventoryPreview {
  summary: {
    total_write_down: number;
    count: number;
  };
  items: InventoryItem[];
}

const defaultSettings: ImpairmentSettings = {
  ecl_rate_0_30: 0.01,
  ecl_rate_31_60: 0.05,
  ecl_rate_61_90: 0.20,
  ecl_rate_90_plus: 0.50,
  discount_rate: 0.10,
  sicr_threshold_days: 30,
  pd_stage1: 0.02,
  pd_stage2: 0.15,
  pd_stage3: 0.90,
  lgd_percent: 0.50,
  macro_overlay: 0.00
};

export default function ImpairmentPage() {
  const [tab, setTab] = useState("receivables");
  const [periodEnd, setPeriodEnd] = useState<string>(new Date().toISOString().slice(0,10));
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<ImpairmentSettings>(defaultSettings);
  const [receivablesPreview, setReceivablesPreview] = useState<ReceivablesPreview | null>(null);
  const [assetsPreview, setAssetsPreview] = useState<AssetsPreview | null>(null);
  const [inventoryPreview, setInventoryPreview] = useState<InventoryPreview | null>(null);
  const [recoverables, setRecoverables] = useState<{ asset_id: string; recoverable_amount: number }[]>([]);
  const [nrvInputs, setNrvInputs] = useState<{ item_id: string; nrv_per_unit: number }[]>([]);
  const [lockModule, setLockModule] = useState<string>("receivables");
  const [lockState, setLockState] = useState<boolean>(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, isAccountant } = useRoles();

  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [manualRecoverable, setManualRecoverable] = useState<string>("");

  useEffect(() => {
    const uid = user?.id ? String(user.id) : "anonymous";
    const key = `tutorial_shown_impairment_${uid}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, "true");
    }
  }, [user?.id]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        toast({ title: "Supabase not configured", description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", variant: "destructive" });
        return;
      }
      const { data, error } = await (supabase as unknown as { rpc: FnRpc }).rpc<ImpairmentSettings>("impairment_get_settings", { _period_end: periodEnd });
      if (error) throw error;
      if (data) {
        // Merge with default settings to ensure all fields exist
        setSettings({ ...defaultSettings, ...data });
      }
    } catch (e: any) {
      toast({ title: "Error loading settings", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateSettings = async () => {
    if (!settings) return;
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        toast({ title: "Supabase not configured", description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", variant: "destructive" });
        return;
      }
      const { error } = await (supabase as unknown as { rpc: FnRpc }).rpc<void>("impairment_update_settings", { _settings: settings });
      if (error) throw error;
      toast({ title: "Settings saved", description: "Impairment settings updated successfully." });
    } catch (e: any) {
      toast({ title: "Error updating settings", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadLock = async () => {
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        setLockState(false);
        return;
      }
      const { data, error } = await (supabase as unknown as { rpc: FnRpc }).rpc<{ locked: boolean }>("impairment_get_lock", { _module: lockModule, _period_end: periodEnd });
      if (error) throw error;
      setLockState(Boolean(data?.locked));
    } catch {
      setLockState(false);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadLock(); }, [lockModule, periodEnd]);

  const toggleLock = async () => {
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        toast({ title: "Supabase not configured", description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", variant: "destructive" });
        return;
      }
      const { error } = await (supabase as unknown as { rpc: FnRpc }).rpc<void>("impairment_set_lock", { _module: lockModule, _period_end: periodEnd, _locked: !lockState });
      if (error) throw error;
      setLockState(!lockState);
      toast({ title: !lockState ? "Locked" : "Unlocked", description: `${lockModule} for ${periodEnd}` });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const previewReceivables = async () => {
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        toast({ title: "Supabase not configured", description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", variant: "destructive" });
        return;
      }
      const { data, error } = await (supabase as unknown as { rpc: FnRpc }).rpc<ReceivablesPreview>("impairment_preview_receivables", { _period_end: periodEnd });
      if (error) throw error;
      setReceivablesPreview(data);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const postReceivables = async () => {
    if (!(isAdmin || isAccountant)) { toast({ title: "Permission denied", variant: "destructive" }); return; }
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        toast({ title: "Supabase not configured", description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", variant: "destructive" });
        return;
      }
      const { data, error } = await (supabase as unknown as { rpc: FnRpc }).rpc<any>("impairment_post_receivables", { _period_end: periodEnd });
      if (error) throw error;
      toast({ title: "Posted", description: `Receivables impairment posted: ${Number((data as any)?.total || 0).toFixed(2)}` });
      setReceivablesPreview(null);
    } catch (e: any) {
      toast({ title: "Error posting", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const previewAssetsFn = async () => {
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        toast({ title: "Supabase not configured", description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", variant: "destructive" });
        return;
      }
      const recoverablesMap = recoverables.reduce((acc: any, curr) => ({ ...acc, [curr.asset_id]: curr.recoverable_amount }), {});
      const { data, error } = await (supabase as unknown as { rpc: FnRpc }).rpc<AssetsPreview>("impairment_preview_assets", { _period_end: periodEnd, _params: { recoverables: recoverablesMap } });
      if (error) throw error;
      setAssetsPreview(data);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const postAssetsFn = async () => {
    if (!(isAdmin || isAccountant)) { toast({ title: "Permission denied", variant: "destructive" }); return; }
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        toast({ title: "Supabase not configured", description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", variant: "destructive" });
        return;
      }
      const recoverablesMap = recoverables.reduce((acc: any, curr) => ({ ...acc, [curr.asset_id]: curr.recoverable_amount }), {});
      const { data, error } = await (supabase as unknown as { rpc: FnRpc }).rpc<any>("impairment_post_assets", { _period_end: periodEnd, _params: { recoverables: recoverablesMap } });
      if (error) throw error;
      toast({ title: "Posted", description: `Asset impairment posted: ${Number((data as any)?.total || 0).toFixed(2)}` });
      setAssetsPreview(null);
    } catch (e: any) {
      toast({ title: "Error posting", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const previewInventoryFn = async () => {
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        toast({ title: "Supabase not configured", description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", variant: "destructive" });
        return;
      }
      const nrvMap = nrvInputs.reduce((acc: any, curr) => ({ ...acc, [curr.item_id]: curr.nrv_per_unit }), {});
      const { data, error } = await (supabase as unknown as { rpc: FnRpc }).rpc<InventoryPreview>("impairment_preview_inventory", { _period_end: periodEnd, _params: { nrv: nrvMap } });
      if (error) throw error;
      setInventoryPreview(data);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const postInventoryFn = async () => {
    if (!(isAdmin || isAccountant)) { toast({ title: "Permission denied", variant: "destructive" }); return; }
    setLoading(true);
    try {
      if (!hasSupabaseEnv) {
        toast({ title: "Supabase not configured", description: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY", variant: "destructive" });
        return;
      }
      const nrvMap = nrvInputs.reduce((acc: any, curr) => ({ ...acc, [curr.item_id]: curr.nrv_per_unit }), {});
      const { data, error } = await (supabase as unknown as { rpc: FnRpc }).rpc<any>("impairment_post_inventory", { _period_end: periodEnd, _params: { nrv: nrvMap } });
      if (error) throw error;
      toast({ title: "Posted", description: `Inventory write-down posted: ${Number((data as any)?.total || 0).toFixed(2)}` });
      setInventoryPreview(null);
    } catch (e: any) {
      toast({ title: "Error posting", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <SEO title="Impairment" description="Receivables ECL, Asset Impairment, Inventory NRV" />
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Impairment</h1>
            <p className="text-muted-foreground">Manage ECL, asset impairments, and inventory write-downs.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="period-end" className="whitespace-nowrap">Period End</Label>
              <Input 
                id="period-end"
                type="date" 
                value={periodEnd} 
                onChange={(e) => setPeriodEnd(e.target.value)} 
                className="w-40"
              />
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList className="w-full md:w-auto grid grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="receivables">Receivables</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* RECEIVABLES TAB */}
          <TabsContent value="receivables" className="space-y-4">
            <div className="flex gap-2">
              <Button disabled={loading} onClick={previewReceivables} variant="outline">
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Preview ECL
              </Button>
              <Button disabled={loading || !receivablesPreview} onClick={postReceivables} className="bg-primary">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Post Journals
              </Button>
            </div>
            
            {receivablesPreview && (
              <Card>
                <CardHeader>
                  <CardTitle>Receivables ECL Preview</CardTitle>
                  <CardDescription>Expected Credit Loss calculation based on aging buckets</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="text-sm font-medium text-muted-foreground">Total Outstanding</div>
                      <div className="text-2xl font-bold">{Number(receivablesPreview?.summary?.total_outstanding || 0).toFixed(2)}</div>
                    </div>
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="text-sm font-medium text-muted-foreground">Total Expected Loss</div>
                      <div className="text-2xl font-bold text-destructive">{Number(receivablesPreview?.summary?.total_expected_loss || 0).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead className="text-center">Days Overdue</TableHead>
                          <TableHead>Bucket</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Expected Loss</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(receivablesPreview?.items || []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">No receivables found for this period.</TableCell>
                          </TableRow>
                        ) : (
                          (receivablesPreview?.items || []).map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{r.invoice_number || r.id}</TableCell>
                              <TableCell className="text-right">{Number(r.outstanding || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-center">{r.days_overdue}</TableCell>
                              <TableCell>{r.bucket}</TableCell>
                              <TableCell className="text-right">{(Number(r.rate) * 100).toFixed(1)}%</TableCell>
                              <TableCell className="text-right font-semibold">{Number(r.expected_loss || 0).toFixed(2)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ASSETS TAB */}
          <TabsContent value="assets" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Asset Impairment</CardTitle>
                <CardDescription>Calculate impairment loss where carrying amount exceeds recoverable amount.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Instructions</AlertTitle>
                  <AlertDescription>
                    1. Click "Preview" to load all fixed assets.<br/>
                    2. Use the "Select Asset" dropdown to choose an asset to override.<br/>
                    3. Enter "Recoverable Amount" and click "Set Override".<br/>
                    4. Click "Preview" again to recalculate.<br/>
                    5. Click "Post Journals" to finalize.
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end p-4 border rounded-lg bg-muted/20">
                    <div className="space-y-2">
                      <Label>Select Asset (Load Preview First)</Label>
                      <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                        <SelectTrigger><SelectValue placeholder="Choose asset..." /></SelectTrigger>
                        <SelectContent>
                          {(assetsPreview?.items || []).map(a => (
                            <SelectItem key={a.asset_id} value={a.asset_id}>{a.description || a.asset_id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Recoverable Amount</Label>
                      <Input 
                        type="number" 
                        value={manualRecoverable} 
                        onChange={(e) => setManualRecoverable(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <Button 
                      variant="secondary"
                      onClick={() => {
                        if(selectedAsset && manualRecoverable) {
                          const val = parseFloat(manualRecoverable);
                          setRecoverables(prev => {
                            const filtered = prev.filter(x => x.asset_id !== selectedAsset);
                            return [...filtered, { asset_id: selectedAsset, recoverable_amount: isNaN(val) ? 0 : val }];
                          });
                          setSelectedAsset("");
                          setManualRecoverable("");
                          toast({ title: "Override added", description: "Click Preview to apply changes." });
                        }
                      }}
                    >
                      Set Override
                    </Button>
                  </div>

                  {recoverables.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 border rounded-lg bg-muted/10">
                      <span className="text-sm font-medium text-muted-foreground self-center mr-2">Overrides:</span>
                      {recoverables.map(r => (
                        <div key={r.asset_id} className="text-xs bg-background px-2 py-1 rounded border flex items-center gap-2 shadow-sm">
                           <span className="font-medium">{r.asset_id}</span>: {r.recoverable_amount}
                           <button className="text-destructive font-bold ml-1 hover:bg-destructive/10 rounded px-1" onClick={() => setRecoverables(prev => prev.filter(x => x.asset_id !== r.asset_id))}>&times;</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button disabled={loading} onClick={() => previewAssetsFn()} variant="outline">
                      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      Preview
                    </Button>
                    <Button disabled={loading || !assetsPreview} onClick={() => postAssetsFn()} className="bg-primary">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Post Journals
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {assetsPreview && (
              <Card>
                <CardHeader>
                  <CardTitle>Impairment Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="text-sm font-medium text-muted-foreground">Total Impairment Loss</div>
                      <div className="text-2xl font-bold text-destructive">{Number(assetsPreview?.summary?.total_impairment || 0).toFixed(2)}</div>
                    </div>
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="text-sm font-medium text-muted-foreground">Assets Impaired</div>
                      <div className="text-2xl font-bold">{Number(assetsPreview?.summary?.count || 0)}</div>
                    </div>
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Asset</TableHead>
                          <TableHead className="text-right">Carrying Amount</TableHead>
                          <TableHead className="text-right">Recoverable Amount</TableHead>
                          <TableHead className="text-right">Impairment Loss</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(assetsPreview?.items || []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">No assets found or no impairment needed.</TableCell>
                          </TableRow>
                        ) : (
                          (assetsPreview?.items || []).map((r) => (
                            <TableRow key={r.asset_id}>
                              <TableCell className="font-medium">{r.description || r.asset_id}</TableCell>
                              <TableCell className="text-right">{Number(r.carrying_amount || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">{Number(r.recoverable_amount || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right font-semibold text-destructive">{Number(r.impairment_loss || 0).toFixed(2)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* INVENTORY TAB */}
          <TabsContent value="inventory" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Inventory Write-down</CardTitle>
                <CardDescription>Calculate write-downs where Cost exceeds Net Realizable Value (NRV).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Instructions</AlertTitle>
                  <AlertDescription>
                    1. Click "Preview" to load all inventory items.<br/>
                    2. Enter "NRV per Unit" in the table below for items that need write-down.<br/>
                    3. Click "Preview" again to recalculate write-downs.<br/>
                    4. Click "Post Journals" to finalize.
                  </AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  <Button disabled={loading} onClick={() => previewInventoryFn()} variant="outline">
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Preview / Refresh
                  </Button>
                  <Button disabled={loading || !inventoryPreview} onClick={() => postInventoryFn()} className="bg-primary">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Post Journals
                  </Button>
                </div>
              </CardContent>
            </Card>

            {inventoryPreview && (
              <Card>
                <CardHeader>
                  <CardTitle>Inventory Write-down Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="text-sm font-medium text-muted-foreground">Total Write-down</div>
                      <div className="text-2xl font-bold text-destructive">{Number(inventoryPreview?.summary?.total_write_down || 0).toFixed(2)}</div>
                    </div>
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="text-sm font-medium text-muted-foreground">Items Affected</div>
                      <div className="text-2xl font-bold">{Number(inventoryPreview?.summary?.count || 0)}</div>
                    </div>
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Cost / Unit</TableHead>
                          <TableHead className="text-right">NRV / Unit (Input)</TableHead>
                          <TableHead className="text-right">Write-down</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(inventoryPreview?.items || []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No inventory items found.</TableCell>
                          </TableRow>
                        ) : (
                          (inventoryPreview?.items || []).map((r) => {
                             const currentNRV = nrvInputs.find(x => x.item_id === r.item_id)?.nrv_per_unit;
                             const costPerUnit = r.qty > 0 ? (r.carrying_amount / r.qty) : 0;
                             return (
                            <TableRow key={r.item_id}>
                              <TableCell className="font-medium">
                                <div>{r.name}</div>
                                <div className="text-xs text-muted-foreground">{r.item_id}</div>
                              </TableCell>
                              <TableCell className="text-right">{Number(r.qty).toFixed(2)}</TableCell>
                              <TableCell className="text-right">{Number(costPerUnit).toFixed(2)}</TableCell>
                              <TableCell className="text-right">
                                <Input 
                                  type="number" 
                                  className="w-24 ml-auto text-right h-8" 
                                  placeholder={Number(costPerUnit).toFixed(2)}
                                  value={currentNRV !== undefined ? currentNRV : ''}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                    setNrvInputs(prev => {
                                      const filtered = prev.filter(x => x.item_id !== r.item_id);
                                      if (val !== undefined && !isNaN(val)) {
                                        return [...filtered, { item_id: r.item_id, nrv_per_unit: val }];
                                      }
                                      return filtered;
                                    });
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-right font-semibold text-destructive">{Number(r.write_down || 0).toFixed(2)}</TableCell>
                            </TableRow>
                          )})
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Impairment Parameters</CardTitle>
                <CardDescription>Configure global settings for ECL and impairment calculations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {/* ECL RATES */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">ECL Provision Matrix Rates</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Current (0–30 days)</Label>
                      <Input type="number" step="0.001" value={settings.ecl_rate_0_30} onChange={(e) => setSettings({...settings, ecl_rate_0_30: parseFloat(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Past Due (31–60 days)</Label>
                      <Input type="number" step="0.001" value={settings.ecl_rate_31_60} onChange={(e) => setSettings({...settings, ecl_rate_31_60: parseFloat(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Past Due (61–90 days)</Label>
                      <Input type="number" step="0.001" value={settings.ecl_rate_61_90} onChange={(e) => setSettings({...settings, ecl_rate_61_90: parseFloat(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Past Due (90+ days)</Label>
                      <Input type="number" step="0.001" value={settings.ecl_rate_90_plus} onChange={(e) => setSettings({...settings, ecl_rate_90_plus: parseFloat(e.target.value)})} />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                   <h3 className="text-lg font-semibold">General Parameters</h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Discount Rate (Effective Interest Rate)</Label>
                        <Input type="number" step="0.01" value={settings.discount_rate} onChange={(e) => setSettings({...settings, discount_rate: parseFloat(e.target.value)})} />
                        <p className="text-xs text-muted-foreground">Used for discounting future cash flows.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>SICR Threshold (Days)</Label>
                        <Input type="number" step="1" value={settings.sicr_threshold_days} onChange={(e) => setSettings({...settings, sicr_threshold_days: parseInt(e.target.value)})} />
                        <p className="text-xs text-muted-foreground">Significant Increase in Credit Risk threshold.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Macro-economic Overlay</Label>
                        <Input type="number" step="0.01" value={settings.macro_overlay} onChange={(e) => setSettings({...settings, macro_overlay: parseFloat(e.target.value)})} />
                        <p className="text-xs text-muted-foreground">Adjustment for forward-looking factors.</p>
                      </div>
                   </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                   <h3 className="text-lg font-semibold">Probability of Default (PD) & LGD</h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label>PD Stage 1</Label>
                        <Input type="number" step="0.01" value={settings.pd_stage1} onChange={(e) => setSettings({...settings, pd_stage1: parseFloat(e.target.value)})} />
                      </div>
                      <div className="space-y-2">
                        <Label>PD Stage 2</Label>
                        <Input type="number" step="0.01" value={settings.pd_stage2} onChange={(e) => setSettings({...settings, pd_stage2: parseFloat(e.target.value)})} />
                      </div>
                      <div className="space-y-2">
                        <Label>PD Stage 3</Label>
                        <Input type="number" step="0.01" value={settings.pd_stage3} onChange={(e) => setSettings({...settings, pd_stage3: parseFloat(e.target.value)})} />
                      </div>
                      <div className="space-y-2">
                        <Label>LGD (Loss Given Default)</Label>
                        <Input type="number" step="0.01" value={settings.lgd_percent} onChange={(e) => setSettings({...settings, lgd_percent: parseFloat(e.target.value)})} />
                      </div>
                   </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button disabled={loading} onClick={updateSettings} className="bg-primary">
                    <Save className="mr-2 h-4 w-4" />
                    Save Settings
                  </Button>
                  <Button variant="outline" onClick={loadSettings} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Reload
                  </Button>
                </div>

                <div className="pt-6 border-t space-y-4">
                  <h3 className="text-lg font-semibold">Period Locking</h3>
                  <div className="p-4 border rounded-lg bg-muted/20">
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                      <div className="space-y-2 w-full sm:w-auto">
                        <Label>Module</Label>
                        <Select value={lockModule} onValueChange={setLockModule}>
                          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Choose module" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="receivables">Receivables</SelectItem>
                            <SelectItem value="assets">Assets</SelectItem>
                            <SelectItem value="inventory">Inventory</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 w-full sm:w-auto">
                        <Label>Status</Label>
                        <div className="flex items-center gap-2 h-10 px-3 border rounded-md bg-background">
                          {lockState ? <Lock className="h-4 w-4 text-primary" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}
                          <span className={lockState ? "font-semibold text-primary" : "text-muted-foreground"}>{lockState ? "Locked" : "Unlocked"}</span>
                        </div>
                      </div>
                      <Button onClick={toggleLock} variant={lockState ? "destructive" : "secondary"}>
                        {lockState ? "Unlock Period" : "Lock Period"}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}