import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import { Key, RefreshCw, CheckCircle2, Download, ChevronDown, ChevronUp, Mail, Phone, Info } from "lucide-react";
import jsPDF from "jspdf";

const mask = (key: string) => key ? `${key.slice(0,4)}-****-****-${key.slice(-4)}` : "—";
// South Africa WhatsApp number (country code 27, remove leading 0)
const whatsapp = (plan: string) => `https://wa.me/27790120072?text=${encodeURIComponent(`Request License: ${plan}`)}`;
const mailto = (plan: string) => `mailto:license@stella-lumen.com?subject=${encodeURIComponent(`License Request: ${plan}`)}&body=${encodeURIComponent('Please share pricing and next steps.')}`;

export default function License() {
  const [licenseKey, setLicenseKey] = useState("");
  const [status, setStatus] = useState<{ plan?: string; status?: string; expiry?: string; key?: string }>({});
  const [seats, setSeats] = useState<{ used: number; available: string }>({ used: 0, available: 'Unlimited (prototype)' });
  const [loading, setLoading] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  useEffect(() => { void loadStatus(); }, []);

  async function loadStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('subscription_status, plan, subscription_expiry, license_key, company_id').eq('user_id', user.id).maybeSingle();
      setStatus({ plan: profile?.plan || 'Prototype', status: profile?.subscription_status || 'OPEN', expiry: profile?.subscription_expiry || '—', key: profile?.license_key || '' });
      if (profile?.company_id) {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact' }).eq('company_id', profile.company_id).limit(1);
        setSeats({ used: (count as number) || 1, available: 'Unlimited (prototype)' });
      }
    } catch {}
  }

  async function activateLicense() {
    setLoading(true);
    try {
      const key = licenseKey.trim();
      if (!key) { toast({ title: 'License', description: 'Enter a license key', variant: 'destructive' }); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast({ title: 'License', description: 'Not authenticated', variant: 'destructive' }); return; }
      const { data: found } = await supabase.from('licenses').select('id, plan_type, status, expiry_date').eq('license_key', key).limit(1);
      const lic = (found || [])[0];
      if (!lic) { toast({ title: 'License', description: 'Invalid license key', variant: 'destructive' }); return; }
      if (String(lic.status || '').toUpperCase() === 'ACTIVE') { toast({ title: 'License', description: 'License already active', variant: 'destructive' }); return; }
      await supabase.from('licenses').update({ status: 'ACTIVE', assigned_user_id: user.id }).eq('id', lic.id);
      const plan = lic.plan_type || 'Professional';
      const expiry = lic.expiry_date || null;
      await supabase.from('profiles').update({ subscription_status: 'ACTIVE', plan, subscription_expiry: expiry, license_key: key }).eq('user_id', user.id);
      toast({ title: 'License', description: 'License activated' });
      setStatus({ plan, status: 'ACTIVE', expiry: expiry || '—', key });
      setLicenseKey('');
    } catch (e: any) {
      toast({ title: 'License error', description: e?.message || 'Activation failed', variant: 'destructive' });
    } finally { setLoading(false); }
  }

  const downloadCertificate = () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // Background Color
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(0, 0, 210, 297, 'F');

      // --- Watermarks ---
      // Stella Lumen Watermark (Top Right)
      const logoSize = 60;
      try { doc.addImage(logo, 'PNG', 140, 10, logoSize, logoSize, undefined, 'FAST'); } catch (e) { console.warn('Logo missing for PDF', e); }
      
      // Rigel Business Watermark (Center Page - Faded)
      doc.setFontSize(80);
      doc.setTextColor(200, 200, 200);
      doc.saveGraphicsState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
      doc.text("RIGEL BUSINESS", 105, 150, { align: "center", angle: 45 });
      doc.restoreGraphicsState();

      // --- Header Content ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text("License Certificate", 20, 40);

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text("Proof of Subscription & Usage Rights", 20, 48);

      // Separator Line
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.line(20, 55, 190, 55);

      // --- License Details Section ---
      const startY = 70;
      const lineHeight = 12;

      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFont("helvetica", "bold");
      doc.text("License Information", 20, startY);

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      
      // Row 1: Plan
      doc.setTextColor(100, 116, 139);
      doc.text("Subscription Plan:", 20, startY + lineHeight);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(status.plan || "Prototype", 80, startY + lineHeight);

      // Row 2: Status
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.text("License Status:", 20, startY + (lineHeight * 2));
      doc.setTextColor(22, 163, 74); // green-600
      doc.setFont("helvetica", "bold");
      doc.text((status.status || "OPEN").toUpperCase(), 80, startY + (lineHeight * 2));

      // Row 3: Product Key
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.text("Product Key:", 20, startY + (lineHeight * 3));
      doc.setTextColor(15, 23, 42);
      doc.setFont("courier", "bold");
      doc.text(status.key || "Not Activated", 80, startY + (lineHeight * 3));

      // Row 4: Expiry
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text("Valid Until:", 20, startY + (lineHeight * 4));
      doc.setTextColor(15, 23, 42);
      doc.text(status.expiry && status.expiry !== '—' ? new Date(status.expiry).toLocaleDateString() : 'Lifetime / Indefinite', 80, startY + (lineHeight * 4));

      // --- Footer Section ---
      const footerY = 250;
      doc.setDrawColor(226, 232, 240);
      doc.line(20, footerY, 190, footerY);

      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("Powered by Stella Lumen", 105, footerY + 10, { align: "center" });
      doc.text("www.stella-lumen.com", 105, footerY + 16, { align: "center" });
      
      doc.text(`Generated on ${new Date().toLocaleDateString()}`, 20, 280);

      doc.save("Rigel_License_Certificate.pdf");
      toast({ title: "Certificate Downloaded", description: "Your license proof has been saved." });
    } catch (e) {
      console.error(e);
      toast({ title: "Download Failed", description: "Could not generate PDF.", variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8 p-6">
        {/* Header - Simple & Clean */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">License Management</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage system subscription, activation, and usage.</p>
          </div>
        </div>

        {/* Primary License Panel - Single Container */}
        <Card className="shadow-sm border-slate-200 bg-white">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* Current Plan */}
              <div className="p-6 space-y-1">
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Current Plan</h3>
                <div className="font-semibold text-lg text-slate-900 flex items-center gap-2">
                   {status.plan || 'Prototype'}
                </div>
              </div>
              
              {/* License Status */}
              <div className="p-6 space-y-1">
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">License Status</h3>
                <Badge variant={status.status === 'ACTIVE' ? 'default' : 'secondary'} className="font-normal px-2.5 py-0.5">
                  {status.status || 'OPEN'}
                </Badge>
              </div>

              {/* Expiry Date */}
              <div className="p-6 space-y-1">
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Expiry Date</h3>
                <div className="font-medium text-slate-900">
                  {status.expiry && status.expiry !== '—' ? new Date(status.expiry).toLocaleDateString() : 'Lifetime / Indefinite'}
                </div>
              </div>

              {/* Seats Usage */}
              <div className="p-6 space-y-1">
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Seats Usage</h3>
                <div className="font-medium text-slate-900">
                  {seats.used} <span className="text-muted-foreground text-sm font-normal">/ {seats.available}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions & Details Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* License Actions (Middle) */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-medium text-slate-900">License Actions</h2>
            <Card className="shadow-sm border-slate-200 bg-white">
              <CardContent className="p-6">
                <div className="space-y-6">
                  {/* Activation Input */}
                  <div className="space-y-3">
                    <Label htmlFor="licenseKey" className="text-sm font-medium text-slate-700">Activate New License</Label>
                    <div className="flex gap-3">
                      <div className="relative flex-1 max-w-md">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="licenseKey"
                          placeholder="Enter product key..."
                          value={licenseKey}
                          onChange={(e) => setLicenseKey(e.target.value)}
                          className="pl-9 font-mono text-sm"
                        />
                      </div>
                      <Button 
                        onClick={activateLicense} 
                        disabled={loading}
                        variant="secondary"
                        className="bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 shadow-none"
                      >
                        {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                        Activate
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5" />
                      Enter the product key provided in your confirmation email.
                    </p>
                  </div>

                  <div className="border-t border-slate-100"></div>

                  {/* Secondary Actions */}
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" size="sm" onClick={loadStatus} className="text-slate-600 border-slate-200">
                      <RefreshCw className="mr-2 h-4 w-4" /> Refresh Status
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadCertificate} className="text-slate-600 border-slate-200">
                      <Download className="mr-2 h-4 w-4" /> Download Certificate
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* License Details (Right) */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-slate-900">Technical Details</h2>
            <Card className="shadow-sm border-slate-200 bg-slate-50/50">
              <CardContent className="p-0">
                <div className="divide-y divide-slate-200/60">
                  <div className="flex justify-between items-center py-3 px-4">
                    <span className="text-sm text-slate-500">Product Key</span>
                    <span className="text-sm font-mono text-slate-700">{mask(status.key || '')}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 px-4">
                    <span className="text-sm text-slate-500">Activated On</span>
                    <span className="text-sm text-slate-700">{status.status === 'ACTIVE' ? new Date().toLocaleDateString() : '—'}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 px-4">
                    <span className="text-sm text-slate-500">Company ID</span>
                    <span className="text-sm text-slate-700">Rigel Business</span>
                  </div>
                  <div className="flex justify-between items-center py-3 px-4">
                    <span className="text-sm text-slate-500">Provider</span>
                    <span className="text-sm text-slate-700">Stella Lumen</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Pricing Section (Bottom - Collapsible) */}
        <div className="pt-8 border-t border-slate-200">
          <div className="flex items-center justify-between mb-6">
             <div>
                <h2 className="text-lg font-medium text-slate-900">Available Plans</h2>
                <p className="text-sm text-muted-foreground mt-1">Upgrade your license to unlock more features.</p>
             </div>
             <Button 
                variant="ghost" 
                onClick={() => setShowPricing(!showPricing)} 
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
             >
                {showPricing ? 'Hide Plans' : 'View Upgrade Options'}
                {showPricing ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
             </Button>
          </div>

          {showPricing && (
            <div className="grid gap-6 md:grid-cols-3 animate-in fade-in slide-in-from-top-4 duration-300">
              {[
                { 
                  name: 'Basic', 
                  price: 'R250', 
                  period: '/month',
                  desc: 'Essentials for small teams.', 
                  features: ['Single User License', 'Basic Financial Reports', 'Email Support', '1GB Storage'],
                },
                { 
                  name: 'Pro', 
                  price: 'R300', 
                  period: '/month',
                  desc: 'Advanced features for growing businesses.', 
                  features: ['Up to 5 Users', 'Advanced Analytics', 'Priority Email Support', '10GB Storage', 'Custom Invoicing'],
                },
                { 
                  name: 'Enterprise', 
                  price: 'R350', 
                  period: '/month',
                  desc: 'Full suite for established organizations.', 
                  features: ['Unlimited Users', 'Dedicated Account Manager', '24/7 Phone Support', 'Unlimited Storage', 'API Access'],
                },
              ].map((p) => (
                <Card key={p.name} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-lg text-slate-900">{p.name}</h3>
                        <p className="text-sm text-muted-foreground">{p.desc}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-slate-900">{p.price}</div>
                        <div className="text-xs text-muted-foreground">{p.period}</div>
                      </div>
                    </div>
                    
                    <ul className="space-y-2 mb-6">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <div className="space-y-2">
                      <Button asChild variant="outline" className="w-full text-slate-700 border-slate-200 hover:bg-slate-50">
                        <a href={mailto(p.name)}>
                          <Mail className="mr-2 h-4 w-4" /> Request via Email
                        </a>
                      </Button>
                      <Button asChild variant="ghost" className="w-full text-slate-500 hover:text-slate-900">
                        <a href={whatsapp(p.name)} target="_blank" rel="noreferrer">
                          <Phone className="mr-2 h-4 w-4" /> Chat on WhatsApp
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
