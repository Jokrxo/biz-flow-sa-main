import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CalendarClock, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";

export const FiscalSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fiscalStart, setFiscalStart] = useState<string>("1");
  const [defaultYear, setDefaultYear] = useState<string>(new Date().getFullYear().toString());
  const [lockYear, setLockYear] = useState<boolean>(false);

  const init = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (!profile?.company_id) return;
      const { data } = await supabase
        .from('app_settings')
        .select('fiscal_year_start, fiscal_default_year, fiscal_lock_year')
        .eq('company_id', profile.company_id)
        .maybeSingle();
      if (data) {
        setFiscalStart(String((data as any).fiscal_year_start || 1));
        setDefaultYear(String((data as any).fiscal_default_year || new Date().getFullYear()));
        setLockYear(!!(data as any).fiscal_lock_year);
      }
    } catch {}
  }, [user?.id]);

  useEffect(() => { init(); }, [init]);

  const handleSave = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (!profile?.company_id) throw new Error('Profile not found');
      const payload = {
        company_id: profile.company_id,
        fiscal_year_start: parseInt(fiscalStart || '1'),
        fiscal_default_year: parseInt(defaultYear || String(new Date().getFullYear())),
        fiscal_lock_year: lockYear,
        updated_at: new Date().toISOString(),
      } as any;
      const existing = await supabase
        .from('app_settings')
        .select('id')
        .eq('company_id', profile.company_id)
        .maybeSingle();
      const { error } = existing.data
        ? await supabase.from('app_settings').update(payload).eq('id', existing.data.id)
        : await supabase.from('app_settings').insert(payload);
      if (error) throw error;
      // Remove legacy localStorage lock to avoid stale 2024
      try { localStorage.removeItem('currentFiscalYear'); } catch {}
      toast({ title: 'Saved', description: 'Fiscal settings updated successfully' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save fiscal settings', variant: 'destructive' });
    }
  }, [fiscalStart, defaultYear, lockYear, user?.id]);

  return (
    <div className="space-y-6">
      <Card className="card-professional h-full">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CalendarClock className="h-5 w-5 text-blue-600" />
            </div>
            <CardTitle>Fiscal Year & Periods</CardTitle>
          </div>
          <CardDescription>Control fiscal start month and default reporting year</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Fiscal Year Start</Label>
              <Select value={fiscalStart} onValueChange={setFiscalStart}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Default Fiscal Year</Label>
              <Select value={defaultYear} onValueChange={setDefaultYear}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                    <SelectItem key={y} value={String(y)}>
                      {parseInt(fiscalStart) === 1 ? y : `FY ${y}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Lock to Default Year</Label>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm">Use default year across all modules</p>
                  <p className="text-xs text-muted-foreground">Disable to auto-switch by current date</p>
                </div>
                <Switch checked={lockYear} onCheckedChange={setLockYear} />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} size="lg" className="bg-gradient-primary shadow-lg hover:shadow-xl transition-all px-8">
              <Save className="h-4 w-4 mr-2" />
              Save Fiscal Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

