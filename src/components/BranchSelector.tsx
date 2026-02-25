import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Branch {
  id: string;
  name: string;
  address: string | null;
}

interface BranchSelectorProps {
  companyId: string;
  onBranchChange: (branchId: string) => void;
}

export const BranchSelector = ({ companyId, onBranchChange }: BranchSelectorProps) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadBranches();
  }, [companyId]);

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, address")
        .eq("company_id", companyId)
        .order("name");

      if (error) throw error;

      setBranches(data || []);
      if (data && data.length > 0 && !selectedBranch) {
        setSelectedBranch(data[0].id);
        onBranchChange(data[0].id);
      }
    } catch (error: any) {
      toast({
        title: "Error loading branches",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBranchChange = (branchId: string) => {
    setSelectedBranch(branchId);
    onBranchChange(branchId);
  };

  // Only show if company has 3 or more branches
  if (branches.length < 3 || loading) return null;

  return (
    <Select value={selectedBranch} onValueChange={handleBranchChange}>
      <SelectTrigger className="w-[200px]">
        <Building2 className="h-4 w-4 mr-2" />
        <SelectValue placeholder="Select branch" />
      </SelectTrigger>
      <SelectContent>
        {branches.map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            {branch.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
