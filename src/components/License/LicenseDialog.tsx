import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import { Key, Phone, Info, Loader2, Download } from "lucide-react";
import jsPDF from "jspdf";

const mask = (key: string) => key ? `${key.slice(0,4)}-****-****-${key.slice(-4)}` : "—";
const whatsapp = (plan: string) => `https://wa.me/27790120072?text=${encodeURIComponent(`Request License: ${plan}`)}`;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mailto = (plan: string) => `mailto:license@stella-lumen.com?subject=${encodeURIComponent(`License Request: ${plan}`)}&body=${encodeURIComponent('Please share pricing and next steps.')}`;

interface LicenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LicenseDialog({ open, onOpenChange }: LicenseDialogProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [status, setStatus] = useState<{ plan?: string; status?: string; expiry?: string; key?: string }>({});
  const [seats, setSeats] = useState<{ used: number; available: string }>({ used: 0, available: 'Unlimited (prototype)' });
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (open) loadStatus();
  }, [open]);

  async function loadStatus() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('subscription_status, plan, subscription_expiry, license_key, company_id').eq('user_id', user.id).maybeSingle();
      setStatus({ 
        plan: profile?.plan || 'Prototype', 
        status: profile?.subscription_status || 'OPEN', 
        expiry: profile?.subscription_expiry || '—', 
        key: profile?.license_key || '' 
      });
      if (profile?.company_id) {
        const { count } = await supabase.from('profiles').select('id', { count: 'exact' }).eq('company_id', profile.company_id).limit(1);
        setSeats({ used: (count as number) || 1, available: 'Unlimited (prototype)' });
      }
    } catch (e) {
      console.error("Error loading license status:", e);
    } finally {
      setLoading(false);
    }
  }

  async function activateLicense() {
    setActivating(true);
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
      
      toast({ title: 'License', description: 'License activated successfully' });
      setStatus({ plan, status: 'ACTIVE', expiry: expiry || '—', key });
      setLicenseKey('');
      loadStatus();
    } catch (e: any) {
      toast({ title: 'License error', description: e?.message || 'Activation failed', variant: 'destructive' });
    } finally { setActivating(false); }
  }

  const downloadCertificate = async () => {
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
      try {
        // Convert logo to base64 to ensure it works in PDF
        const img = new Image();
        img.src = logo;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            doc.addImage(dataUrl, 'PNG', 140, 10, logoSize, logoSize, undefined, 'FAST');
        }
      } catch (e) { console.warn('Logo missing for PDF', e); }
      
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
      
      doc.setDrawColor(226, 232, 240);
      doc.line(20, 55, 190, 55);

      // Details
      let y = 70;
      const addRow = (label: string, value: string) => {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(label, 20, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(value, 80, y);
        y += 12;
      };

      addRow("License Holder", "Authorized User"); 
      addRow("Plan Type", status.plan || "Standard");
      addRow("Status", status.status || "Active");
      addRow("Expiry Date", status.expiry || "Lifetime");
      addRow("License Key", status.key || "N/A");

      doc.save("rigel-license-certificate.pdf");
      toast({ title: "Downloaded", description: "License certificate saved." });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Could not generate PDF", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden gap-0">
        <DialogHeader className="p-6 pb-2 bg-gradient-to-r from-slate-50 to-white border-b">
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center p-4">
              <img src={logo} alt="System Logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <DialogTitle className="text-xl">License Management</DialogTitle>
              <DialogDescription>Manage your subscription and usage rights</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Status Card */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Current Plan</h3>
                    <div className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                      {status.plan}
                      <Badge variant={status.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">
                        {status.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                     <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">Expiry</h3>
                     <div className="text-sm font-medium text-slate-900">{status.expiry}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/50">
                   <div>
                      <div className="text-xs text-slate-500 mb-1">License Key</div>
                      <div className="font-mono text-sm bg-white px-2 py-1 rounded border border-slate-200 inline-block">
                        {mask(status.key || '')}
                      </div>
                   </div>
                   <div>
                      <div className="text-xs text-slate-500 mb-1">Seats Used</div>
                      <div className="text-sm font-medium">
                        {seats.used} <span className="text-slate-400">/ {seats.available}</span>
                      </div>
                   </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="license-key">Activate New License</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="license-key" 
                        placeholder="XXXX-XXXX-XXXX-XXXX" 
                        className="pl-9 font-mono uppercase"
                        value={licenseKey}
                        onChange={(e) => setLicenseKey(e.target.value)}
                      />
                    </div>
                    <Button onClick={activateLicense} disabled={activating || !licenseKey}>
                      {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Activate'}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={downloadCertificate} disabled={status.status !== 'ACTIVE' && status.plan !== 'Prototype'}>
                    <Download className="h-4 w-4" />
                    Download Certificate
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" asChild>
                    <a href={whatsapp(status.plan || 'Inquiry')} target="_blank" rel="noopener noreferrer">
                      <Phone className="h-4 w-4" />
                      Contact Sales
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
        
        <DialogFooter className="p-4 bg-slate-50 border-t flex justify-between items-center sm:justify-between">
           <div className="text-xs text-slate-400 flex items-center gap-1">
             <Info className="h-3 w-3" />
             Need help? Contact support@stella-lumen.com
           </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
