import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface TaxSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onSettingsChanged: () => void;
}

export const TaxSettingsDialog = ({ open, onOpenChange, companyId, onSettingsChanged }: TaxSettingsDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);

  useEffect(() => {
    if (open && companyId) {
      loadData();
    }
  }, [open, companyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load COA
      const { data: accData } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('company_id', companyId)
        .order('account_code');
      setAccounts(accData || []);

      // Load Assets
      const { data: assetData } = await supabase
        .from('fixed_assets')
        .select('*')
        .eq('company_id', companyId);
      setAssets(assetData || []);

    } catch (error) {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const updateAccount = async (id: string, updates: any) => {
    try {
      const { error } = await supabase
        .from('chart_of_accounts')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
      
      setAccounts(accounts.map(a => a.id === id ? { ...a, ...updates } : a));
      toast.success("Updated successfully");
      onSettingsChanged();
    } catch (error) {
      toast.error("Failed to update");
    }
  };

  const updateAsset = async (id: string, updates: any) => {
    try {
      const { error } = await supabase
        .from('fixed_assets')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
      
      setAssets(assets.map(a => a.id === id ? { ...a, ...updates } : a));
      toast.success("Asset updated");
      onSettingsChanged();
    } catch (error) {
      toast.error("Failed to update asset");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Tax Settings & Rules</DialogTitle>
          <DialogDescription>Configure tax deductibility and capital allowances</DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="deductibility" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="deductibility">Income & Expenses</TabsTrigger>
              <TabsTrigger value="allowances">Wear & Tear (Assets)</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="deductibility" className="flex-1 overflow-auto p-6 pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Tax Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="text-center"><Loader2 className="animate-spin h-6 w-6 mx-auto"/></TableCell></TableRow>
                ) : (
                  accounts.filter(a => ['expense', 'revenue', 'income', 'cost_of_sales'].includes(a.account_type)).map(acc => (
                    <TableRow key={acc.id}>
                      <TableCell className="font-mono">{acc.account_code}</TableCell>
                      <TableCell>{acc.account_name}</TableCell>
                      <TableCell className="capitalize">{acc.account_type.replace('_', ' ')}</TableCell>
                      <TableCell className="text-center">
                        {['expense', 'cost_of_sales'].includes(acc.account_type) ? (
                          <div className="flex items-center justify-center gap-2">
                            <Switch 
                              checked={acc.is_tax_deductible !== false} 
                              onCheckedChange={(c) => updateAccount(acc.id, { is_tax_deductible: c })}
                            />
                            <span className="text-xs w-20 text-left">
                              {acc.is_tax_deductible !== false ? "Deductible" : "Non-Deductible"}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <Switch 
                              checked={!acc.is_exempt_income} 
                              onCheckedChange={(c) => updateAccount(acc.id, { is_exempt_income: !c })}
                            />
                            <span className="text-xs w-20 text-left">
                              {!acc.is_exempt_income ? "Taxable" : "Exempt"}
                            </span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="allowances" className="flex-1 overflow-auto p-6 pt-2">
             <div className="mb-4 bg-muted/30 p-4 rounded-lg text-sm space-y-1">
               <p className="font-medium">SARS Wear & Tear Rates:</p>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-muted-foreground">
                 <div>Computers: 33.3% (3y)</div>
                 <div>Furniture: 16.7% (6y)</div>
                 <div>Vehicles: 20% (5y)</div>
                 <div>Small Items (&lt;R7k): 100%</div>
               </div>
             </div>
             <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-24">Rate (%)</TableHead>
                  <TableHead>Tax Start Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center"><Loader2 className="animate-spin h-6 w-6 mx-auto"/></TableCell></TableRow>
                ) : (
                  assets.map(asset => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium">{asset.description}</TableCell>
                      <TableCell>{asset.cost}</TableCell>
                      <TableCell>
                        <Input 
                          className="h-8 w-40" 
                          value={asset.asset_type || ""} 
                          placeholder="e.g. Computer"
                          onChange={(e) => updateAsset(asset.id, { asset_type: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input 
                          type="number" 
                          className="h-8 w-20" 
                          value={asset.wear_and_tear_rate || 0} 
                          onChange={(e) => updateAsset(asset.id, { wear_and_tear_rate: parseFloat(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                         <Input 
                          type="date" 
                          className="h-8 w-36" 
                          value={asset.tax_usage_start_date || asset.purchase_date || ""} 
                          onChange={(e) => updateAsset(asset.id, { tax_usage_start_date: e.target.value })}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {assets.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No assets found. Add assets in Fixed Assets module.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
