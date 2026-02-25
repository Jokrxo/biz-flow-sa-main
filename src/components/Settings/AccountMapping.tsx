import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { Loader2, Plus, Save, RefreshCw, FolderTree, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

interface Account {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  category_id?: string;
  category_name?: string;
}

interface Category {
  id: string;
  name: string;
  type: string; // 'asset', 'liability', 'equity', 'revenue', 'expense'
}

export const AccountMapping = () => {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // New Category State
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState("asset");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [generatingDefaults, setGeneratingDefaults] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();

  const DEFAULT_CATEGORIES = [
    { name: "Current Assets", type: "asset" },
    { name: "Non-Current Assets", type: "asset" },
    { name: "Current Liabilities", type: "liability" },
    { name: "Non-Current Liabilities", type: "liability" },
    { name: "Equity", type: "equity" },
    { name: "Revenue", type: "revenue" },
    { name: "Other Income", type: "revenue" },
    { name: "Cost of Sales", type: "expense" },
    { name: "Operating Expenses", type: "expense" },
    { name: "Tax", type: "expense" },
    { name: "Interest", type: "expense" }
  ];

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleGenerateDefaults = async () => {
    try {
      setGeneratingDefaults(true);
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).single();
      if (!profile?.company_id) return;

      const newCategories = [];
      for (const cat of DEFAULT_CATEGORIES) {
        // Check if exists
        const exists = categories.some(c => c.name === cat.name && c.type === cat.type);
        if (!exists) {
          const { data, error } = await supabase.from("categories").insert({
            company_id: profile.company_id,
            name: cat.name,
            type: cat.type
          }).select().single();
          
          if (error) throw error;
          if (data) newCategories.push(data);
        }
      }

      if (newCategories.length > 0) {
        setCategories(prev => [...prev, ...newCategories]);
        toast({
          title: "Defaults Generated",
          description: `Created ${newCategories.length} default categories.`,
        });
      } else {
        toast({
          title: "No changes",
          description: "All default categories already exist.",
        });
      }

    } catch (error: any) {
      toast({
        title: "Error generating defaults",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setGeneratingDefaults(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).single();
      if (!profile?.company_id) return;

      // Fetch accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("company_id", profile.company_id)
        .order('account_code');

      if (accountsError) throw accountsError;

      // Fetch categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("categories")
        .select("id, name, type")
        .eq("company_id", profile.company_id)
        .order('name');

      if (categoriesError) throw categoriesError;

      // Fetch existing mappings
      let mappingsData: any[] = [];
      if (accountsData && accountsData.length > 0) {
        const { data, error: mappingsError } = await supabase
          .from("account_categories")
          .select("account_id, category_id, categories(name)")
          .in('account_id', accountsData.map(a => a.id));
        
        if (mappingsError) throw mappingsError;
        mappingsData = data || [];
      }

      // Merge data
      const mergedAccounts = accountsData.map(acc => {
        const mapping = mappingsData.find(m => m.account_id === acc.id);
        return {
          ...acc,
          category_id: mapping?.category_id,
          category_name: mapping?.categories ? (mapping.categories as any).name : undefined
        };
      });

      setAccounts(mergedAccounts);
      setCategories(categoriesData);

    } catch (error: any) {
      console.error("Error fetching mapping data:", error);
      toast({
        title: "Error loading data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = async (accountId: string, categoryId: string) => {
    // Optimistic update
    setAccounts(prev => prev.map(acc => 
      acc.id === accountId 
        ? { ...acc, category_id: categoryId, category_name: categories.find(c => c.id === categoryId)?.name } 
        : acc
    ));

    try {
      // Upsert into account_categories
      // First check if mapping exists to update or insert
      // Wait, Supabase upsert works with primary key. account_categories doesn't have a composite PK on (account_id), but it has a unique constraint?
      // Let's check the schema. account_categories has `id` as PK.
      // But we want to ensure one category per account.
      // If the schema allows multiple categories per account, we need to delete old ones or update.
      // Assuming 1:1 mapping for financial reporting purposes.

      const { data: existingMapping } = await supabase
        .from("account_categories")
        .select("id")
        .eq("account_id", accountId)
        .maybeSingle();

      if (existingMapping) {
        await supabase
          .from("account_categories")
          .update({ category_id: categoryId })
          .eq("id", existingMapping.id);
      } else {
        await supabase
          .from("account_categories")
          .insert({ account_id: accountId, category_id: categoryId });
      }
      
      toast({
        title: "Mapping updated",
        description: "Account category has been saved.",
      });
    } catch (error: any) {
      console.error("Error updating category:", error);
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
      fetchData(); // Revert on error
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName) return;
    
    try {
      setCreatingCategory(true);
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user?.id).single();
      
      const { data, error } = await supabase
        .from("categories")
        .insert({
          company_id: profile?.company_id,
          name: newCategoryName,
          type: newCategoryType
        })
        .select()
        .single();

      if (error) throw error;

      setCategories(prev => [...prev, data]);
      setNewCategoryName("");
      setIsAddCategoryOpen(false);
      
      toast({
        title: "Category created",
        description: `Created new category: ${data.name}`,
      });
    } catch (error: any) {
      toast({
        title: "Failed to create category",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreatingCategory(false);
    }
  };

  const filteredAccounts = accounts.filter(acc => {
    const matchesType = filterType === "all" || acc.account_type === filterType;
    const matchesSearch = 
      acc.account_code.toLowerCase().includes(searchQuery.toLowerCase()) || 
      acc.account_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Chart of Accounts Mapping</h2>
          <p className="text-muted-foreground">
            Map your accounts to standard GAAP categories for accurate financial reporting.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {categories.length === 0 && (
            <Button variant="outline" onClick={handleGenerateDefaults} disabled={generatingDefaults}>
              {generatingDefaults && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate Defaults
            </Button>
          )}
          <Button onClick={() => setIsAddCategoryOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Category
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="flex gap-2 items-center">
              <Input 
                placeholder="Search accounts..." 
                className="w-[250px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="asset">Assets</SelectItem>
                  <SelectItem value="liability">Liabilities</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="expense">Expenses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-[300px]">Reporting Category</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No accounts found matching your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAccounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono">{account.account_code}</TableCell>
                        <TableCell className="font-medium">{account.account_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {account.account_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={account.category_id || "unmapped"} 
                            onValueChange={(val) => val !== "unmapped" && handleCategoryChange(account.id, val)}
                          >
                            <SelectTrigger className={!account.category_id ? "text-muted-foreground" : ""}>
                              <SelectValue placeholder="Select Category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unmapped">-- Unmapped --</SelectItem>
                              {categories
                                .filter(c => c.type === account.account_type || !c.type) // Filter categories by type match
                                .map((cat) => (
                                  <SelectItem key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </SelectItem>
                                ))
                              }
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {account.category_id ? (
                            <div className="flex items-center text-green-600 text-sm">
                              <ArrowRight className="h-3 w-3 mr-1" /> Mapped
                            </div>
                          ) : (
                            <div className="text-amber-500 text-sm">Pending</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
            <DialogDescription>
              Create a new financial reporting category.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="cat-name">Category Name</Label>
              <Input 
                id="cat-name" 
                value={newCategoryName} 
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Current Assets, Operating Expenses"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-type">Account Type</Label>
              <Select value={newCategoryType} onValueChange={setNewCategoryType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddCategoryOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCategory} disabled={creatingCategory}>
              {creatingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
