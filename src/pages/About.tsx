import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Globe, ExternalLink } from "lucide-react";

const About = () => {
  const appVersion = (import.meta as any).env?.VITE_APP_VERSION || "2025.12.04";
  const buildDate = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <SEO title="About | Rigel Business" description="System information and licensing details" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Standard Page Header */}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">About</h1>
            <p className="text-muted-foreground mt-1">System information and application details.</p>
          </div>

          {/* Main Content Container - Flat System Style */}
          <div className="bg-white border rounded-lg shadow-sm p-8">
            
            {/* App Identity Section */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
              <div className="flex gap-5">
                <div className="h-16 w-16 bg-slate-100 rounded-lg border flex items-center justify-center overflow-hidden">
                   <img src="/logo.png" alt="Rigel" className="h-full w-full object-cover" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">Rigel Business</h2>
                  <p className="text-slate-500">Next-generation financial management.</p>
                  <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
                    <span>Version {appVersion}</span>
                    <span>•</span>
                    <span>© {new Date().getFullYear()} Stella Lumen</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" asChild>
                  <a href="https://stella-lumen.com" target="_blank" rel="noreferrer">
                    <Globe className="mr-2 h-4 w-4" /> Website
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="/license">
                    Manage License
                  </a>
                </Button>
              </div>
            </div>

            <Separator className="my-8" />

            {/* System Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-slate-500">Build Version</h3>
                <p className="font-mono text-sm font-medium text-slate-900">{appVersion}-stable</p>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-slate-500">Release Date</h3>
                <p className="text-sm font-medium text-slate-900">{buildDate}</p>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-slate-500">Environment</h3>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500" />
                  <p className="text-sm font-medium text-slate-900">Production</p>
                </div>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium text-slate-500">Database Status</h3>
                <p className="text-sm font-medium text-emerald-600">Connected & Synced</p>
              </div>
            </div>

            <Separator className="my-8" />

            {/* Technical Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-slate-900">System Core</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-50">
                  <span className="text-slate-500">Framework</span>
                  <span className="font-medium text-slate-900">React 18</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-50">
                  <span className="text-slate-500">Language</span>
                  <span className="font-medium text-slate-900">TypeScript 5</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-50">
                  <span className="text-slate-500">Backend</span>
                  <span className="font-medium text-slate-900">Supabase</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-50">
                  <span className="text-slate-500">Build Tool</span>
                  <span className="font-medium text-slate-900">Vite</span>
                </div>
              </div>
            </div>

            <Separator className="my-8" />

            {/* Release Notes */}
            <div>
              <h3 className="text-lg font-medium text-slate-900 mb-4">Release Notes</h3>
              <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <span><strong>Cash Flow Analytics:</strong> Comparative year-over-year reporting.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <span><strong>VAT Compliance:</strong> Enhanced SA tax validation.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <span><strong>Stella Advisor:</strong> AI-driven insights.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <span><strong>Data Export:</strong> Multi-sheet Excel backups.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <span><strong>Security:</strong> Advanced IP whitelisting.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <span><strong>Performance:</strong> Optimized query speeds.</span>
                </li>
              </ul>
            </div>

            {/* Simple Footer Link */}
            <div className="mt-8 pt-6 border-t flex justify-center">
               <a href="mailto:support@stella-lumen.com" className="text-xs text-slate-400 hover:text-slate-600">
                 Need help? Contact Support
               </a>
            </div>

          </div>
        </div>
      </DashboardLayout>
    </>
  );
};

export default About;