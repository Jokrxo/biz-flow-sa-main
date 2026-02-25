import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import stellaLogo from "@/assets/stella-sign-up.jpg";

interface QuickSetupSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const QuickSetupSheet = ({ open, onOpenChange }: QuickSetupSheetProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [setupStatus, setSetupStatus] = useState({
    hasCoa: false,
    hasBank: false,
    hasProducts: false,
    hasCustomers: false,
    hasSuppliers: false,
    hasEmployees: false
  });

  useEffect(() => {
    const loadSetupStatus = async () => {
      if (!user?.id || !open) return;

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile?.company_id) {
          const { count: coaCount } = await supabase.from("chart_of_accounts").select("id", { count: "exact" }).eq("company_id", profile.company_id).eq("is_active", true).limit(1);
          const { count: banksCount } = await supabase.from("bank_accounts").select("id", { count: "exact" }).eq("company_id", profile.company_id).limit(1);
          const { count: productsCount } = await supabase.from("items").select("id", { count: "exact" }).eq("company_id", profile.company_id).eq("item_type", "product").limit(1);
          const { count: customersCount } = await supabase.from("customers").select("id", { count: "exact" }).eq("company_id", profile.company_id).limit(1);
          const { count: suppliersCount } = await supabase.from("suppliers").select("id", { count: "exact" }).eq("company_id", profile.company_id).limit(1);
          const { count: employeesCount } = await supabase.from("employees").select("id", { count: "exact" }).eq("company_id", profile.company_id).limit(1);
          
          setSetupStatus({
            hasCoa: (coaCount || 0) > 0,
            hasBank: (banksCount || 0) > 0,
            hasProducts: (productsCount || 0) > 0,
            hasCustomers: (customersCount || 0) > 0,
            hasSuppliers: (suppliersCount || 0) > 0,
            hasEmployees: (employeesCount || 0) > 0
          });
        }
      } catch (error) {
        console.error("Error loading setup status:", error);
      }
    };

    loadSetupStatus();
  }, [user, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Company Setup
          </DialogTitle>
          <DialogDescription>Add core records to get your business up and running.</DialogDescription>
        </DialogHeader>
        <div className="relative space-y-4 mt-6">
          {/* Watermark */}
          <div className="absolute inset-0 z-0 flex items-center justify-center opacity-5 pointer-events-none">
             <img src={stellaLogo} alt="Watermark" className="w-2/3 h-auto object-contain" />
          </div>
          <div className="grid gap-3 relative z-10">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-medium">Chart of Accounts</div>
                  <div className="text-xs text-muted-foreground">Define your ledger accounts</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={setupStatus.hasCoa ? 'default' : 'outline'}>{setupStatus.hasCoa ? 'Done' : 'Pending'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => { navigate('/transactions?tab=chart'); onOpenChange(false); }}>Go</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-medium">Bank Account</div>
                  <div className="text-xs text-muted-foreground">Connect your business bank</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={setupStatus.hasBank ? 'default' : 'outline'}>{setupStatus.hasBank ? 'Done' : 'Pending'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => { navigate('/bank'); onOpenChange(false); }}>Go</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-medium">Products & Services</div>
                  <div className="text-xs text-muted-foreground">Add items you sell</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={setupStatus.hasProducts ? 'default' : 'outline'}>{setupStatus.hasProducts ? 'Done' : 'Pending'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => { navigate('/sales?tab=products'); onOpenChange(false); }}>Go</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-medium">Customers</div>
                  <div className="text-xs text-muted-foreground">Add your clients</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={setupStatus.hasCustomers ? 'default' : 'outline'}>{setupStatus.hasCustomers ? 'Done' : 'Pending'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => { navigate('/customers'); onOpenChange(false); }}>Go</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-medium">Suppliers</div>
                  <div className="text-xs text-muted-foreground">Add your vendors</div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={setupStatus.hasSuppliers ? 'default' : 'outline'}>{setupStatus.hasSuppliers ? 'Done' : 'Pending'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => { navigate('/purchase'); onOpenChange(false); }}>Go</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
