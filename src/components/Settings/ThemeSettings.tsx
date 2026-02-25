import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, Check, Layout, PanelLeft, ArrowUpCircle } from "lucide-react";
import { useLayout } from "@/context/LayoutContext";
import { themes, applyTheme, ThemeKey } from "@/lib/theme-config";

export const ThemeSettings = () => {
  const [current, setCurrent] = useState<ThemeKey>("original");
  const { layoutMode, setLayoutMode } = useLayout();

  useEffect(() => {
    const saved = localStorage.getItem("app_theme") as ThemeKey | null;
    if (saved && themes.find(t => t.key === saved)) setCurrent(saved);
  }, []);

  const handleThemeChange = (key: ThemeKey) => {
    applyTheme(key);
    setCurrent(key);
  };

  return (
    <div className="space-y-6">
      {/* Layout Section */}
      <Card className="card-professional">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Layout className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>App Layout</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">Choose the navigation structure that works best for you.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sidebar Option */}
            <div 
              onClick={() => setLayoutMode('sidebar')}
              className={`
                group relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-200 hover:shadow-lg
                ${layoutMode === 'sidebar' ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-muted-foreground/25 bg-muted/20"}
              `}
            >
              <div className="aspect-[21/9] w-full bg-slate-100 dark:bg-slate-900 p-3 flex gap-2">
                <div className="w-1/4 h-full bg-slate-300 dark:bg-slate-700 rounded-md flex flex-col gap-1 p-1">
                   <div className="w-full h-2 bg-slate-400 dark:bg-slate-600 rounded-sm mb-1" />
                   <div className="w-3/4 h-1.5 bg-slate-400 dark:bg-slate-600 rounded-sm" />
                   <div className="w-3/4 h-1.5 bg-slate-400 dark:bg-slate-600 rounded-sm" />
                </div>
                <div className="flex-1 h-full flex flex-col gap-2">
                  <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-md" />
                  <div className="w-full h-full bg-white dark:bg-slate-950 rounded-md border border-slate-200 dark:border-slate-800" />
                </div>
              </div>
              <div className="p-3 bg-card flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <PanelLeft className="h-4 w-4" />
                    Sidebar Navigation
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Classic vertical menu for quick access.</p>
                </div>
                {layoutMode === 'sidebar' && <Check className="h-4 w-4 text-primary" />}
              </div>
            </div>

            {/* Horizontal Option */}
            <div 
              onClick={() => setLayoutMode('horizontal')}
              className={`
                group relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-200 hover:shadow-lg
                ${layoutMode === 'horizontal' ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-muted-foreground/25 bg-muted/20"}
              `}
            >
              <div className="aspect-[21/9] w-full bg-slate-100 dark:bg-slate-900 p-3 flex flex-col gap-2">
                <div className="w-full h-4 bg-slate-300 dark:bg-slate-700 rounded-md flex items-center gap-2 px-2">
                   <div className="w-4 h-2 bg-slate-400 dark:bg-slate-600 rounded-sm" />
                   <div className="w-1/6 h-1.5 bg-slate-400 dark:bg-slate-600 rounded-sm ml-auto" />
                   <div className="w-1/6 h-1.5 bg-slate-400 dark:bg-slate-600 rounded-sm" />
                </div>
                <div className="flex-1 w-full bg-white dark:bg-slate-950 rounded-md border border-slate-200 dark:border-slate-800" />
              </div>
              <div className="p-3 bg-card flex items-center justify-between">
                 <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <ArrowUpCircle className="h-4 w-4" />
                    Top Navigation
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Modern horizontal bar for more screen space.</p>
                </div>
                {layoutMode === 'horizontal' && <Check className="h-4 w-4 text-primary" />}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Theme Section */}
      <Card className="card-professional">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Palette className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Visual Theme</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">Select a color scheme that matches your brand or preference.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {themes.map(t => (
              <div 
                key={t.key}
                onClick={() => handleThemeChange(t.key)}
                className={`
                  group relative cursor-pointer overflow-hidden rounded-xl border-2 transition-all duration-200 hover:shadow-lg
                  ${current === t.key ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-muted-foreground/25 bg-muted/20"}
                `}
              >
                <div className="aspect-[16/9] w-full bg-gradient-to-br from-white to-slate-100 dark:from-slate-900 dark:to-slate-800 p-3 flex flex-col justify-between">
                  <div className="flex gap-2">
                    <div className="h-2 w-full rounded-full" style={{ backgroundColor: t.colors[0] }} />
                    <div className="h-2 w-1/3 rounded-full" style={{ backgroundColor: t.colors[1] }} />
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-2 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
                  </div>
                </div>
                <div className="p-3 bg-card">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{t.name}</span>
                    {current === t.key && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{t.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
