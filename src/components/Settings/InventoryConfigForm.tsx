/**
 * ============================================================================
 * INVENTORY CONFIGURATION FORM - IFRS/SA GAAP Compliant COGS Settings
 * ============================================================================
 * Configure inventory system and costing method for the company
 * - Perpetual or Periodic inventory
 * - FIFO (default) or Weighted Average Cost
 * - LIFO is PROHIBITED for SA/IFRS compliance
 * ============================================================================
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Info, AlertTriangle, Save, Package, Calculator, Lock } from "lucide-react";
import type { InventorySystem, CostingMethod } from "@/types/inventory";

interface InventoryConfigFormProps {
  companyId: string;
  onSave?: () => void;
}

export function InventoryConfigForm({ companyId, onSave }: InventoryConfigFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inventorySystem, setInventorySystem] = useState<InventorySystem>("perpetual");
  const [costingMethod, setCostingMethod] = useState<CostingMethod>("fifo");
  const [markupPercentage, setMarkupPercentage] = useState<string>("");
  const [periodLocked, setPeriodLocked] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, [companyId]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from("company_settings")
        .select("inventory_system, costing_method, markup_percentage, period_locked")
        .eq("company_id", companyId)
        .single();

      if (data) {
        setInventorySystem(data.inventory_system || "perpetual");
        setCostingMethod(data.costing_method || "fifo");
        setMarkupPercentage(data.markup_percentage?.toString() || "");
        setPeriodLocked(data.period_locked || false);
      }
    } catch (error) {
      console.error("Error loading inventory config:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Validate LIFO selection
      if (costingMethod === "lifo") {
        toast({
          title: "Invalid Costing Method",
          description: "LIFO is prohibited under IFRS / SA GAAP. Use FIFO or Weighted Average.",
          variant: "destructive",
        });
        return;
      }

      const configData = {
        company_id: companyId,
        inventory_system: inventorySystem,
        costing_method: costingMethod,
        markup_percentage: markupPercentage ? parseFloat(markupPercentage) : null,
        period_locked: periodLocked,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("company_settings")
        .upsert(configData, { onConflict: "company_id" });

      if (error) throw error;

      // Auto-create COGS accounts if they don't exist
      await ensureCOGSAccounts(companyId);

      toast({
        title: "Settings Saved",
        description: "Inventory configuration has been updated successfully.",
      });

      setHasChanges(false);
      onSave?.();
    } catch (error) {
      console.error("Error saving inventory config:", error);
      toast({
        title: "Error",
        description: "Failed to save inventory configuration.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const ensureCOGSAccounts = async (companyId: string) => {
    // Standard COGS accounts to create if missing
    const cogsAccounts = [
      { code: "5000", name: "Cost of Goods Sold", type: "expense" },
      { code: "5010", name: "Purchases", type: "expense" },
      { code: "5020", name: "Inventory Adjustment", type: "expense" },
    ];

    for (const acc of cogsAccounts) {
      const { data: existing } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("account_code", acc.code)
        .single();

      if (!existing) {
        await supabase.from("chart_of_accounts").insert({
          company_id: companyId,
          account_code: acc.code,
          account_name: acc.name,
          account_type: acc.type,
          is_active: true,
          is_cogs: true, // Mark as COGS account
        });
      }
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading inventory settings...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Inventory & COGS Settings
        </CardTitle>
        <CardDescription>
          Configure how inventory and Cost of Goods Sold are calculated. 
          These settings affect financial reporting and must comply with IFRS/SA GAAP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* IFRS Compliance Warning */}
        <Alert variant="default" className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4" />
          <AlertTitle>South African / IFRS Compliance</AlertTitle>
          <AlertDescription>
            LIFO (Last In, First Out) is <strong>prohibited</strong> under IFRS and SA GAAP. 
            This system supports FIFO and Weighted Average Cost methods only.
          </AlertDescription>
        </Alert>

        {/* Inventory System Selection */}
        <div className="space-y-2">
          <Label htmlFor="inventory-system" className="flex items-center gap-2">
            Inventory System
            <span className="text-red-500">*</span>
          </Label>
          <Select
            value={inventorySystem}
            onValueChange={(value: InventorySystem) => {
              setInventorySystem(value);
              setHasChanges(true);
            }}
          >
            <SelectTrigger id="inventory-system">
              <SelectValue placeholder="Select inventory system" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="perpetual">
                <div className="flex flex-col">
                  <span>Perpetual (Real-time)</span>
                  <span className="text-xs text-muted-foreground">
                    COGS posted immediately on every sale
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="periodic">
                <div className="flex flex-col">
                  <span>Periodic (Manual)</span>
                  <span className="text-xs text-muted-foreground">
                    COGS calculated at period-end only
                  </span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {inventorySystem === "perpetual"
              ? "Inventory quantities and COGS are updated in real-time when invoices are posted."
              : "Inventory values are updated manually at the end of each accounting period."}
          </p>
        </div>

        {/* Costing Method Selection */}
        <div className="space-y-2">
          <Label htmlFor="costing-method" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Costing Method
            <span className="text-red-500">*</span>
          </Label>
          <Select
            value={costingMethod}
            onValueChange={(value: CostingMethod) => {
              if (value === "lifo") {
                toast({
                  title: "Method Not Allowed",
                  description: "LIFO is prohibited under IFRS / SA GAAP",
                  variant: "destructive",
                });
                return;
              }
              setCostingMethod(value);
              setHasChanges(true);
            }}
          >
            <SelectTrigger id="costing-method">
              <SelectValue placeholder="Select costing method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fifo">
                <div className="flex flex-col">
                  <span>FIFO (First In, First Out)</span>
                  <span className="text-xs text-muted-foreground">
                    Default method - oldest inventory sold first
                  </span>
                </div>
              </SelectItem>
              <SelectItem value="weighted_average">
                <div className="flex flex-col">
                  <span>Weighted Average Cost</span>
                  <span className="text-xs text-muted-foreground">
                    Average cost of all units in inventory
                  </span>
                </div>
              </SelectItem>
              {/* LIFO hidden - prohibited */}
              {costingMethod === "lifo" && (
                <SelectItem value="lifo" disabled>
                  <div className="flex flex-col">
                    <span>LIFO (Last In, First Out)</span>
                    <span className="text-xs text-red-500">
                      Not permitted under IFRS / SA GAAP
                    </span>
                  </div>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {costingMethod === "fifo"
              ? "FIFO assumes the oldest inventory items are sold first. This is the default and most commonly used method."
              : "Weighted Average calculates the average cost of all inventory items and applies it to all sales."}
          </p>
        </div>

        {/* Markup Percentage (Perpetual fallback) */}
        {inventorySystem === "perpetual" && (
          <div className="space-y-2">
            <Label htmlFor="markup-percentage">
              Fixed Markup Percentage (Optional)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="markup-percentage"
                type="number"
                min="0"
                max="500"
                step="0.01"
                placeholder="e.g., 30"
                value={markupPercentage}
                onChange={(e) => {
                  setMarkupPercentage(e.target.value);
                  setHasChanges(true);
                }}
                className="w-32"
              />
              <span className="text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Fallback for calculating COGS when detailed inventory tracking is not used.
              COGS = Invoice Amount / (1 + Markup%). Leave empty to use detailed tracking.
            </p>
          </div>
        )}

        {/* Period Lock Warning */}
        {periodLocked && (
          <Alert variant="destructive" className="bg-amber-50 border-amber-200">
            <Lock className="h-4 w-4" />
            <AlertTitle>Period is Locked</AlertTitle>
            <AlertDescription>
              The current period is locked. You cannot change inventory settings mid-period.
              Contact your administrator to unlock.
            </AlertDescription>
          </Alert>
        )}

        {/* Period Lock Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="period-lock">Lock Period</Label>
            <p className="text-xs text-muted-foreground">
              Prevent changing settings during an active period
            </p>
          </div>
          <input
            type="checkbox"
            id="period-lock"
            checked={periodLocked}
            onChange={(e) => {
              setPeriodLocked(e.target.checked);
              setHasChanges(true);
            }}
            className="h-4 w-4"
          />
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
