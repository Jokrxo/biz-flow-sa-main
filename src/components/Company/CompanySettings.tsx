import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Save, Upload, Image as ImageIcon, Mail, Phone, MapPin, Tag, Globe, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast as notify } from "sonner";
import { useAuth } from "@/context/useAuth";

interface CompanyData {
  name: string;
  code: string;
  email: string;
  phone: string;
  address: string;
  default_currency: string;
  business_type?: string;
  tax_number?: string;
  vat_number?: string;
}

export const CompanySettings = () => {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [companyData, setCompanyData] = useState<CompanyData>({
    name: "",
    code: "",
    email: "",
    phone: "",
    address: "",
    default_currency: "ZAR",
  });
  const { toast } = useToast();
  const { user } = useAuth();

  const loadCompanyData = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();
      if (!profile) throw new Error("Profile not found");
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", profile.company_id)
        .single();
      if (error) throw error;
      if (data) { setCompanyData(data); setLogoUrl(data.logo_url); }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [user?.id, toast]);
  useEffect(() => {
    loadCompanyData();
  }, [loadCompanyData]);


  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      
      setUploading(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath);

      // Update company with logo URL
      const { error: updateError } = await supabase
        .from("companies")
        .update({ logo_url: publicUrl })
        .eq("id", profile.company_id);

      if (updateError) throw updateError;

      setLogoUrl(publicUrl);
      notify.success("Logo uploaded", { description: "Your company logo has been updated", duration: 5000 });
    } catch (error: any) {
      notify.error("Logo upload failed", { description: error.message, duration: 6000 });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      // Only update fields that exist in the companies table
      const updateData: any = {
        name: companyData.name,
        code: companyData.code,
        email: companyData.email || null,
        phone: companyData.phone || null,
        address: companyData.address || null,
      };

      // Add optional fields if they exist in the table
      if (companyData.default_currency) {
        updateData.default_currency = companyData.default_currency;
      }
      if (companyData.business_type) {
        updateData.business_type = companyData.business_type;
      }
      if (companyData.tax_number) {
        updateData.tax_number = companyData.tax_number;
      }
      if (companyData.vat_number) {
        updateData.vat_number = companyData.vat_number;
      }

      const { error } = await supabase
        .from("companies")
        .update(updateData)
        .eq("id", profile.company_id);

      if (error) throw error;

      // Reload company data to show updated information
      await loadCompanyData();

      notify.success("Company details saved", { description: "Your changes have been applied", duration: 5000 });
    } catch (error: any) {
      notify.error("Update failed", { description: error.message, duration: 6000 });
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Company Information Display Card */}
      <Card className="bg-card border-border/50 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                Company Overview
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Your business profile and branding details
              </p>
            </div>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="w-12 h-12 rounded-lg border shadow-sm overflow-hidden">
                  <img src={logoUrl} alt="Company Logo" loading="lazy" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg border bg-muted flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              <div>
                <label className="inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors">
                  <Upload className="h-3.5 w-3.5" />
                  Change Logo
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Company Name</div>
              <div className="text-sm font-medium">{companyData.name || "Not set"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Company Code</div>
              <div className="text-sm font-medium">{companyData.code || "Not set"}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Currency</div>
              <div className="text-sm font-medium">{companyData.default_currency || "Not set"}</div>
            </div>
            
            {companyData.email && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</div>
                <div className="text-sm">{companyData.email}</div>
              </div>
            )}
            {companyData.phone && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</div>
                <div className="text-sm">{companyData.phone}</div>
              </div>
            )}
            {companyData.business_type && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Business Type</div>
                <div className="text-sm capitalize">{companyData.business_type.replace('_', ' ')}</div>
              </div>
            )}
            {companyData.address && (
              <div className="md:col-span-3 space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Address</div>
                <div className="text-sm">{companyData.address}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Company Settings Form */}
      <Card className="shadow-sm border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="h-5 w-5 text-primary" />
                Company Settings
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Update your organization details and contact info
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)}>{editing ? "Close" : "Edit Details"}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
        {editing ? (
        <>
        <div className="space-y-4">
          <Label>Company Logo</Label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                <img src={logoUrl} alt="Company Logo" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-32 h-32 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1">
              <Input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={uploading}
                className="cursor-pointer"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Upload your company logo (PNG, JPG, max 2MB)
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Company Name</Label>
            <Input
              value={companyData.name}
              onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Company Code</Label>
            <Input
              value={companyData.code}
              onChange={(e) => setCompanyData({ ...companyData, code: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={companyData.email || ""}
              onChange={(e) => setCompanyData({ ...companyData, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={companyData.phone || ""}
              onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })}
            />
          </div>
        </div>

        <div>
          <Label>Address</Label>
          <Input
            value={companyData.address || ""}
            onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Business Type</Label>
            <Select
              value={companyData.business_type || ""}
              onValueChange={(val) => setCompanyData({ ...companyData, business_type: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select business type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                <SelectItem value="partnership">Partnership</SelectItem>
                <SelectItem value="pty_ltd">Pty Ltd</SelectItem>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="npo">NPO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Currency</Label>
            <Select
              value={companyData.default_currency}
              onValueChange={(val) => setCompanyData({ ...companyData, default_currency: val })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ZAR">ZAR - South African Rand</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
                <SelectItem value="GBP">GBP - British Pound</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Tax Number</Label>
            <Input
              value={companyData.tax_number || ""}
              onChange={(e) => setCompanyData({ ...companyData, tax_number: e.target.value })}
              placeholder="Tax registration number"
            />
          </div>
          <div>
            <Label>VAT Number</Label>
            <Input
              value={companyData.vat_number || ""}
              onChange={(e) => setCompanyData({ ...companyData, vat_number: e.target.value })}
              placeholder="VAT registration number"
            />
          </div>
        </div>

        <Button onClick={handleSave} className="w-full bg-gradient-primary">
          <Save className="h-4 w-4 mr-2" />
          Save Company Details
        </Button>
        </>
        ) : (
          <div className="text-sm text-muted-foreground">Press Edit to modify company settings.</div>
        )}
      </CardContent>
    </Card>
    </div>
  );
};
