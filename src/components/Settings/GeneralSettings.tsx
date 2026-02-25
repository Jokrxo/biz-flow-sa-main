import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Settings2, Save, Palette, Globe, CalendarClock, Bell, Database, Monitor, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";

export const GeneralSettings = () => {
  const [settings, setSettings] = useState({
    theme: "light",
    dateFormat: "DD/MM/YYYY",
    fiscalYearStart: "1",
    enableNotifications: true,
    enableAutoBackup: false,
    language: "en",
    invoiceTemplate: "template1",
  });
  const { toast } = useToast();
  const { user } = useAuth();

  const applyTheme = (theme: string) => {
    const root = document.documentElement;
    ["theme-corp-blue","theme-fintech-green","theme-premium-navy","theme-neutral-enterprise","theme-dark-pro","theme-exec-gold","theme-ocean-gradient","theme-purple-digital","theme-tech-silver","theme-eco-green"].forEach(c => root.classList.remove(c));
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.add('theme-dark-pro');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else if (theme === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) { root.classList.add('dark'); root.classList.add('theme-dark-pro'); }
      else { root.classList.remove('dark'); }
    }
  };

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
        theme: settings.theme,
        date_format: settings.dateFormat,
        fiscal_year_start: parseInt(settings.fiscalYearStart || '1'),
        enable_notifications: settings.enableNotifications,
        enable_auto_backup: settings.enableAutoBackup,
        language: settings.language,
        updated_at: new Date().toISOString(),
      };
      const existing = await supabase
        .from('app_settings')
        .select('id')
        .eq('company_id', profile.company_id)
        .maybeSingle();
      const { error } = existing.data
        ? await supabase.from('app_settings').update(payload).eq('id', existing.data.id)
        : await supabase.from('app_settings').insert(payload);
      if (error) throw error;
      localStorage.setItem('appSettings', JSON.stringify(settings));
      applyTheme(settings.theme);
      toast({ title: 'Success', description: 'General settings saved successfully' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save settings', variant: 'destructive' });
    }
  }, [settings, user?.id, toast]);

  const init = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user?.id)
        .maybeSingle();
      const savedLocal = localStorage.getItem('appSettings');
      let next = settings;
      if (profile?.company_id) {
        const { data } = await supabase
          .from('app_settings')
          .select('*')
          .eq('company_id', profile.company_id)
          .maybeSingle();
        if (data) {
          next = {
            theme: (data as any).theme || 'light',
            dateFormat: (data as any).date_format || 'DD/MM/YYYY',
            fiscalYearStart: String((data as any).fiscal_year_start || 1),
            enableNotifications: !!(data as any).enable_notifications,
            enableAutoBackup: !!(data as any).enable_auto_backup,
            language: (data as any).language || 'en',
            invoiceTemplate: (JSON.parse(localStorage.getItem('appSettings') || '{}')?.invoiceTemplate) || 'template1',
          };
        }
      } else if (savedLocal) {
        next = JSON.parse(savedLocal);
      }
      setSettings(next);
      applyTheme(next.theme);
    } catch {}
  }, [user?.id]);
  useEffect(() => { init(); }, [init]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Appearance & Localization */}
        <Card className="shadow-sm border-border/50 h-full">
          <CardHeader>
            <div className="mb-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Palette className="h-5 w-5 text-primary" />
                Appearance & Locale
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Customize visual preferences and regional formats
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Interface Theme</Label>
              <Select value={settings.theme} onValueChange={(val) => setSettings({ ...settings, theme: val })}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full bg-slate-200 border" />
                      Light Mode
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full bg-slate-900 border" />
                      Dark Mode
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      System Default
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={settings.language} onValueChange={(val) => setSettings({ ...settings, language: val })}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="af">Afrikaans</SelectItem>
                    <SelectItem value="zu">Zulu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Format</Label>
                <Select value={settings.dateFormat} onValueChange={(val) => setSettings({ ...settings, dateFormat: val })}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System & Financial */}
        <Card className="shadow-sm border-border/50 h-full">
          <CardHeader>
            <div className="mb-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarClock className="h-5 w-5 text-primary" />
                System & Financial
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Fiscal periods and document templates
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Fiscal Year Start</Label>
              <Select value={settings.fiscalYearStart} onValueChange={(val) => setSettings({ ...settings, fiscalYearStart: val })}>
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
              <Label>Invoice Template</Label>
              <Select value={settings.invoiceTemplate} onValueChange={(val) => setSettings({ ...settings, invoiceTemplate: val })}>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" /> Classic (Template 1)
                    </div>
                  </SelectItem>
                  <SelectItem value="template2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" /> Modern (Template 2)
                    </div>
                  </SelectItem>
                  <SelectItem value="template3" disabled>
                    <div className="flex items-center gap-2 opacity-50">
                      <FileText className="h-4 w-4" /> Advanced (Locked)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications & Data */}
      <Card className="card-professional">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Settings2 className="h-5 w-5 text-purple-600" />
            </div>
            <CardTitle>Automation & Alerts</CardTitle>
          </div>
          <CardDescription>Manage automated system behaviors</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-full">
                <Bell className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <Label className="text-base font-medium">Enable Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive in-app alerts for critical updates and messages</p>
              </div>
            </div>
            <Switch
              checked={settings.enableNotifications}
              onCheckedChange={(checked) => setSettings({ ...settings, enableNotifications: checked })}
            />
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-full">
                <Database className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <Label className="text-base font-medium">Auto-Backup</Label>
                <p className="text-sm text-muted-foreground">Automatically backup database daily at midnight</p>
              </div>
            </div>
            <Switch
              checked={settings.enableAutoBackup}
              onCheckedChange={(checked) => setSettings({ ...settings, enableAutoBackup: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4">
        <Button onClick={handleSave} size="lg" className="bg-gradient-primary shadow-lg hover:shadow-xl transition-all px-8">
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  );
};
