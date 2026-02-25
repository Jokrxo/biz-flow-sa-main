import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { transactionsApi } from "@/lib/transactions-api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Package, 
  Edit, 
  Search, 
  MoreHorizontal, 
  Briefcase,
  Box,
  History,
  Upload,
  Loader2,
  AlertTriangle,
  FileSpreadsheet
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRoles } from "@/hooks/use-roles";

interface Product {
  id: string;
  name: string;
  description: string | null;
  unit_price: number;
  cost_price?: number;
  quantity_on_hand: number;
  item_type: string;
}

export const SalesProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, isAccountant } = useRoles();
  const canEdit = isAdmin || isAccountant;
  const [companyId, setCompanyId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);

  // Forms
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    unit_price: "",
    cost_price: ""
  });

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    unit_price: "",
    cost_price: "",
    quantity_on_hand: "",
  });

  // Deactivate Dialog states
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [productToDeactivate, setProductToDeactivate] = useState<Product | null>(null);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const [serviceForm, setServiceForm] = useState({ name: "", description: "", unit_price: "" });
  const [openingForm, setOpeningForm] = useState({ productId: "", quantity: "", costPrice: "", date: new Date().toISOString().slice(0,10) });

  const loadProducts = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .maybeSingle();
      if (!profile) return;
      setCompanyId(profile.company_id as string);
      
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("item_type", "product")
        .order("name");
      if (error) throw error;
      setProducts(data || []);
      
      const { data: svc } = await supabase
        .from("items")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("item_type", "service")
        .order("name");
      setServices(svc || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    loadProducts();

    const channel = supabase
      .channel('products-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
        loadProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProducts]);

  const filteredItems = useMemo(() => {
    const allItems = [...products, ...services];
    if (!searchTerm) return allItems.sort((a, b) => a.name.localeCompare(b.name));
    
    return allItems.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, services, searchTerm]);

  const openDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      unit_price: product.unit_price.toString(),
      cost_price: (product.cost_price ?? 0).toString(),
      quantity_on_hand: product.quantity_on_hand.toString(),
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      unit_price: "",
      cost_price: "",
      quantity_on_hand: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin && !isAccountant) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }

    try {
      if (!editingProduct) return;
      const { error } = await supabase
        .from("items")
        .update({ unit_price: parseFloat(formData.unit_price) })
        .eq("id", editingProduct.id);
      if (error) throw error;
      toast({ title: "Success", description: "Selling price updated" });

      setDialogOpen(false);
      setEditingProduct(null);
      resetForm();
      loadProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeactivate = async () => {
    if (!productToDeactivate) return;
    if (!deactivateReason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for deactivation.", variant: "destructive" });
      return;
    }

    setIsDeactivating(true);
    try {
      const newName = `[INACTIVE] ${productToDeactivate.name}`;
      const newDesc = `${productToDeactivate.description || ''}\n[Deactivated: ${deactivateReason}]`;

      const { error } = await supabase
        .from("items")
        .update({ 
            name: newName,
            description: newDesc
        })
        .eq("id", productToDeactivate.id);

      if (error) throw error;
      toast({ title: "Success", description: "Item deactivated successfully." });
      setDeactivateOpen(false);
      setProductToDeactivate(null);
      setDeactivateReason("");
      loadProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }
    try {
      const name = createForm.name.trim();
      if (!name) {
        toast({ title: "Name required", description: "Enter a product name", variant: "destructive" });
        return;
      }
      const unit = parseFloat(createForm.unit_price || "0");
      if (!unit || unit <= 0) {
        toast({ title: "Invalid price", description: "Enter a valid selling price", variant: "destructive" });
        return;
      }
      const cost = createForm.cost_price ? parseFloat(createForm.cost_price) : 0;
      
      const { error } = await supabase
        .from("items")
        .insert({
          company_id: companyId,
          name,
          description: (createForm.description || "").trim(),
          item_type: "product",
          unit_price: unit,
          cost_price: cost,
          quantity_on_hand: 0
        } as any);
      if (error) throw error;
      toast({ title: "Product created", description: "Product added to catalog" });
      setCreateOpen(false);
      setCreateForm({ name: "", description: "", unit_price: "", cost_price: "" });
      loadProducts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) { toast({ title: "Permission denied", variant: "destructive" }); return; }
    try {
      const name = serviceForm.name.trim();
      if (!name) { toast({ title: "Name required", description: "Enter a service name", variant: "destructive" }); return; }
      const unit = parseFloat(serviceForm.unit_price || "0");
      if (!unit || unit <= 0) { toast({ title: "Invalid price", description: "Enter a valid service price", variant: "destructive" }); return; }
      
      const { error } = await supabase
        .from("items")
        .insert({ 
          company_id: companyId, 
          name, 
          description: (serviceForm.description || "").trim(), 
          item_type: "service", 
          unit_price: unit, 
          quantity_on_hand: 0 
        } as any);
      if (error) throw error;
      toast({ title: "Service created", description: "Service added to catalog" });
      setServiceOpen(false);
      setServiceForm({ name: "", description: "", unit_price: "" });
      loadProducts();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Sage-style Toolbar */}
      <div className="flex items-center justify-between bg-card p-2 rounded-md border shadow-sm">
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
               <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-[#0070ad] hover:bg-[#005a8b] text-white">
                    <Plus className="h-4 w-4 mr-2" />
                    New Item
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                    <Box className="h-4 w-4 mr-2" /> New Product
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setServiceOpen(true)}>
                    <Briefcase className="h-4 w-4 mr-2" /> New Service
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" size="sm" onClick={() => setOpeningOpen(true)} className="text-[#0070ad] border-[#0070ad] hover:bg-blue-50">
                <Plus className="h-4 w-4 mr-2" /> Opening Stock
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search products & services..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-[250px] h-9"
                />
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
                 <Button variant="outline" size="sm" className="h-9 gap-1 text-[#0070ad] border-[#0070ad] hover:bg-blue-50">
                     <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                 </Button>
            </div>
        </div>
      </div>

      <div className="border rounded-sm overflow-hidden bg-white shadow-sm">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No products or services found</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[#2e2e2e] sticky top-0 z-10">
              <TableRow className="hover:bg-[#2e2e2e] border-none">
                <TableHead className="text-white h-10">Type</TableHead>
                <TableHead className="text-white h-10">Name</TableHead>
                <TableHead className="text-white h-10">Description</TableHead>
                <TableHead className="text-right text-white h-10">Cost Price</TableHead>
                <TableHead className="text-right text-white h-10">Unit Price</TableHead>
                <TableHead className="text-right text-white h-10">Stock</TableHead>
                <TableHead className="text-right text-white h-10">Total Value</TableHead>
                <TableHead className="w-[50px] text-white h-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.item_type === 'service' ? (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Service</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Product</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                    {item.description || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.item_type === 'product' ? `R ${Number(item.cost_price ?? 0).toLocaleString('en-ZA')}` : '-'}
                  </TableCell>
                  <TableCell className="text-right">R {Number(item.unit_price).toLocaleString('en-ZA')}</TableCell>
                  <TableCell className="text-right">
                    {item.item_type === 'product' ? (
                      <Badge variant={item.quantity_on_hand < 10 ? "destructive" : "secondary"}>
                        {item.quantity_on_hand}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {item.item_type === 'product' 
                      ? `R ${(item.unit_price * item.quantity_on_hand).toLocaleString('en-ZA')}`
                      : '-'
                    }
                  </TableCell>
                  <TableCell>
                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openDialog(item)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit Price
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => {
                            setProductToDeactivate(item);
                            setDeactivateOpen(true);
                          }} className="text-amber-600">
                            <History className="mr-2 h-4 w-4" /> Deactivate / Adjust
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label>Product Name *</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Selling Price (R) *</Label>
                <Input type="number" step="0.01" value={createForm.unit_price} onChange={(e) => setCreateForm({ ...createForm, unit_price: e.target.value })} required />
              </div>
              <div>
                <Label>Cost Price (R)</Label>
                <Input type="number" step="0.01" value={createForm.cost_price} onChange={(e) => setCreateForm({ ...createForm, cost_price: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-primary">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openingOpen} onOpenChange={setOpeningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Opening Inventory</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Use this once-off form to bring in your opening inventory balance. This will debit your{" "}
              <span className="font-semibold">Inventory</span> asset account and credit{" "}
              <span className="font-semibold">Opening Equity / Share Capital</span> at cost.
            </p>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!canEdit) { toast({ title: "Permission denied", variant: "destructive" }); return; }
              try {
                const pid = openingForm.productId;
                const qty = parseFloat(openingForm.quantity || "0");
                const cp = parseFloat(openingForm.costPrice || "0");
                const dateStr = openingForm.date || new Date().toISOString().slice(0,10);
                if (!pid) { toast({ title: "Select product", description: "Choose a product", variant: "destructive" }); return; }
                if (!(qty > 0) || !(cp > 0)) { toast({ title: "Invalid values", description: "Enter quantity and cost price > 0", variant: "destructive" }); return; }
                await transactionsApi.postOpeningStock({ productId: pid, quantity: qty, costPrice: cp, date: dateStr });
                toast({ title: "Opening inventory posted", description: "Inventory asset and Opening Equity updated" });
                setOpeningOpen(false);
                setOpeningForm({ productId: "", quantity: "", costPrice: "", date: new Date().toISOString().slice(0,10) });
                loadProducts();
              } catch (err: any) {
                toast({ title: "Error", description: err.message || "Failed to post opening stock", variant: "destructive" });
              }
            }}
            className="space-y-4"
          >
            <div>
              <Label>Product *</Label>
              <Select value={openingForm.productId} onValueChange={(v: any) => setOpeningForm({ ...openingForm, productId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity *</Label>
                <Input type="number" step="1" min="1" value={openingForm.quantity} onChange={(e) => setOpeningForm({ ...openingForm, quantity: e.target.value })} required />
              </div>
              <div>
                <Label>Cost Price (R) *</Label>
                <Input type="number" step="0.01" value={openingForm.costPrice} onChange={(e) => setOpeningForm({ ...openingForm, costPrice: e.target.value })} required />
              </div>
            </div>
            {Number(openingForm.quantity || 0) > 0 && Number(openingForm.costPrice || 0) > 0 && (
              <div className="text-xs text-muted-foreground">
                Total opening inventory value:{" "}
                <span className="font-semibold">
                  R{" "}
                  {(Number(openingForm.quantity || 0) * Number(openingForm.costPrice || 0)).toFixed(2)}
                </span>
              </div>
            )}
            <div>
              <Label>Posting Date *</Label>
              <Input type="date" value={openingForm.date} onChange={(e) => setOpeningForm({ ...openingForm, date: e.target.value })} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpeningOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-primary">Post</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Selling Price</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Product</Label>
              <Input value={formData.name} disabled />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formData.description} rows={2} disabled />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cost Price (R)</Label>
                <Input value={formData.cost_price} disabled />
              </div>
              <div>
                <Label>Selling Price (R) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.unit_price}
                  onChange={(e) => setFormData({ ...formData, unit_price: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Quantity in Stock</Label>
                <Input value={formData.quantity_on_hand} disabled />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditingProduct(null); resetForm(); }}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-primary">Update Price</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Service (No Stock)</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Use this form to add services you sell, like labour or consulting. This does not create
              inventory or post any accounting entry now; it only saves the service and its selling price
              for use on quotes and invoices.
            </p>
          </DialogHeader>
          <form onSubmit={handleCreateService} className="space-y-5">
            <div className="space-y-1">
              <Label>Service Name *</Label>
              <Input
                value={serviceForm.name}
                onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                placeholder="e.g. Call-out fee, Consulting hour"
                required
              />
              <p className="text-xs text-muted-foreground">
                This name appears on customer quotes and invoices.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={serviceForm.description}
                onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                rows={3}
                placeholder="Short explanation for your customer (optional)"
              />
              <p className="text-xs text-muted-foreground">
                Extra detail shown to the customer, for example what is included in the service.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Price (R) *</Label>
              <Input
                type="number"
                step="0.01"
                value={serviceForm.unit_price}
                onChange={(e) => setServiceForm({ ...serviceForm, unit_price: e.target.value })}
                placeholder="e.g. 750.00"
                required
              />
              <p className="text-xs text-muted-foreground">
                Selling price per unit of this service. No stock is tracked for services.
              </p>
            </div>
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-slate-700">Accounting effect</div>
              <p>
                Adding a service here does not post anything to your ledger. Revenue is only recognised when
                you use this service on a customer document (quote, invoice, etc.).
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setServiceOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-primary">
                Create Service
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <History className="h-5 w-5" />
              Deactivate Item
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-sm font-medium flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                For audit compliance, items cannot be deleted. Use this form to deactivate them.
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Reason for Deactivation</Label>
              <Textarea 
                value={deactivateReason} 
                onChange={(e) => setDeactivateReason(e.target.value)} 
                placeholder="Reason for deactivation..."
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Supporting Document (Optional)</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => document.getElementById('product-file-upload')?.click()}>
                <input type="file" id="product-file-upload" className="hidden" onChange={handleFileChange} />
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8 opacity-50" />
                  <span className="text-sm">Click to upload document</span>
                  {file && <span className="text-xs text-primary font-medium">{file.name}</span>}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeactivateOpen(false)} className="w-full sm:w-auto">Dismiss</Button>
            <Button 
              onClick={handleDeactivate}
              disabled={isDeactivating || !deactivateReason.trim()}
              className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isDeactivating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <History className="mr-2 h-4 w-4" />
                  Confirm Deactivation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
