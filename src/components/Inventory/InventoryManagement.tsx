import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from 'xlsx';
import { useNavigate } from "react-router-dom";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  ShoppingCart,
  ChevronDown,
  FileText,
  Trash,
  RefreshCw,
  Layers,
  Eye,
  ClipboardList,
  Check,
  XCircle,
  Download,
  Info
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
  sku?: string;
  name: string;
  description: string | null;
  unit_price: number;
  cost_price?: number;
  quantity_on_hand: number;
  item_type: string;
}

const StockStatusBadge = ({ quantity, isProduct }: { quantity: number; isProduct: boolean }) => {
  if (!isProduct) {
    return (
      <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200 rounded-full px-2 py-0.5">
        N/A
      </Badge>
    );
  }
  if (quantity <= 0) {
    return (
      <Badge variant="outline" className="text-xs text-red-700 border-red-200 bg-red-50 rounded-full px-2 py-0.5">
        Out of stock
      </Badge>
    );
  }
  if (quantity <= 5) {
    return (
      <Badge variant="outline" className="text-xs text-orange-700 border-orange-200 bg-orange-50 rounded-full px-2 py-0.5">
        Need to order
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-green-700 border-green-200 bg-green-50 rounded-full px-2 py-0.5">
      Stock healthy
    </Badge>
  );
};

export const InventoryManagement = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Product[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, isAccountant } = useRoles();
  const canEdit = isAdmin || isAccountant;
  const [companyId, setCompanyId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewFilter, setViewFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [productInfoOpen, setProductInfoOpen] = useState(false);

  // Forms
  const [createForm, setCreateForm] = useState({
    name: "",
    sku: "",
    description: "",
    unit_price: "",
    cost_price: ""
  });

  const [serviceForm, setServiceForm] = useState({
    name: "",
    description: "",
    unit_price: ""
  });

  const [formData, setFormData] = useState({
    name: "",
    sku: "",
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
  const [itemImageUrls, setItemImageUrls] = useState<Record<string, string>>({});
  const [imageUploadItem, setImageUploadItem] = useState<Product | null>(null);
  const [imageUploadingId, setImageUploadingId] = useState<string | null>(null);
  const [imageErrorIds, setImageErrorIds] = useState<Record<string, boolean>>({});
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageDialogError, setImageDialogError] = useState<string | null>(null);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockDialogItem, setStockDialogItem] = useState<Product | null>(null);
  const [stockDialogLoading, setStockDialogLoading] = useState(false);
  const [stockSummary, setStockSummary] = useState<{
    purchasedQty: number;
    soldQty: number;
    returnedQty: number;
    netSoldQty: number;
    expectedOnHand: number;
    variance: number;
  } | null>(null);
  const [stockPurchases, setStockPurchases] = useState<any[]>([]);
  const [stockSales, setStockSales] = useState<any[]>([]);
  const [stockReturns, setStockReturns] = useState<any[]>([]);
  const [supplierReportOpen, setSupplierReportOpen] = useState(false);
  const [supplierReportLoading, setSupplierReportLoading] = useState(false);
  const [supplierReportRows, setSupplierReportRows] = useState<any[]>([]);
  const [salesReportOpen, setSalesReportOpen] = useState(false);
  const [salesReportLoading, setSalesReportLoading] = useState(false);
  const [salesReportRows, setSalesReportRows] = useState<any[]>([]);
  const [purchasesReportOpen, setPurchasesReportOpen] = useState(false);
  const [purchasesReportLoading, setPurchasesReportLoading] = useState(false);
  const [purchasesReportRows, setPurchasesReportRows] = useState<any[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  
  // Stock Warning Dialog
  const [stockWarningOpen, setStockWarningOpen] = useState(false);
  const [stockWarningMessage, setStockWarningMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryProduct, setCategoryProduct] = useState<Product | null>(null);
  const [categoryValue, setCategoryValue] = useState("");

  const generateNextSku = async () => {
    if (!companyId) return "item001";
    try {
      const { data } = await supabase
        .from('items')
        .select('name')
        .eq('company_id', companyId)
        .ilike('name', 'item%')
        .order('name', { ascending: false })
        .limit(1);

      if (data && data.length > 0 && data[0].name) {
        const lastSku = data[0].name;
        const match = lastSku.match(/^item(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          const nextNum = num + 1;
          return `item${nextNum.toString().padStart(3, '0')}`;
        }
      }
      return 'item001';
    } catch (e) {
      console.error(e);
      return 'item001';
    }
  };

  const handleOpenCreate = async () => {
    setProductInfoOpen(true);
  };

  // Inventory Adjustment Dialog states
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({
    productId: "",
    quantityChange: "",
    costPrice: "",
    reason: "",
    date: new Date().toISOString().slice(0, 10)
  });
  const [adjustmentProduct, setAdjustmentProduct] = useState<Product | null>(null);

  const openAdjustmentDialog = (product: Product) => {
    setAdjustmentProduct(product);
    setAdjustmentForm({
      productId: product.id,
      quantityChange: "",
      costPrice: (product.cost_price ?? 0).toString(),
      reason: "",
      date: new Date().toISOString().slice(0, 10)
    });
    setAdjustmentOpen(true);
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }
    try {
      const qtyChange = parseFloat(adjustmentForm.quantityChange);
      const cost = parseFloat(adjustmentForm.costPrice);
      
      if (isNaN(qtyChange) || qtyChange === 0) {
        toast({ title: "Invalid quantity", description: "Please enter a valid quantity change (positive or negative)", variant: "destructive" });
        return;
      }

      // Check if trying to decrease more than available stock
      if (adjustmentProduct && qtyChange < 0) {
        const currentQty = adjustmentProduct.quantity_on_hand;
        const decreaseAmount = Math.abs(qtyChange);
        
        if (decreaseAmount > currentQty) {
          setStockWarningMessage(
            `You are trying to remove ${decreaseAmount} units, but you only have ${currentQty} units in stock.\n\n` +
            `You cannot reduce the stock below zero.`
          );
          setStockWarningOpen(true);
          return;
        }
      }

      if (isNaN(cost) || cost < 0) {
        toast({ title: "Invalid cost", description: "Please enter a valid cost price", variant: "destructive" });
        return;
      }
      if (!adjustmentForm.reason.trim()) {
        toast({ title: "Reason required", description: "Please provide a reason for the adjustment", variant: "destructive" });
        return;
      }

      await transactionsApi.postInventoryAdjustment({
        productId: adjustmentForm.productId,
        quantityChange: qtyChange,
        costPrice: cost,
        date: adjustmentForm.date,
        reason: adjustmentForm.reason
      });

      toast({ title: "Stock adjusted", description: "Inventory adjustment posted successfully" });
      setAdjustmentOpen(false);
      loadProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const openCategoryDialog = (product: Product) => {
    setCategoryProduct(product);
    const currentType = (product.item_type || "").toLowerCase() === "service" ? "Service" : "Parts";
    setCategoryValue(currentType);
    setCategoryDialogOpen(true);
  };

  const handleCategorySave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast({ title: "Permission denied", description: "You do not have permission to change categories.", variant: "destructive" });
      return;
    }
    if (!categoryProduct) return;
    try {
      const raw = (categoryValue || "").toLowerCase().trim();
      const itemType = raw.includes("service") ? "service" : "product";
      const { error } = await supabase
        .from("items")
        .update({ item_type: itemType })
        .eq("id", categoryProduct.id);
      if (error) throw error;
      toast({
        title: "Category updated",
        description:
          itemType === "service"
            ? "This item is now treated as a service and will not track stock."
            : "This item is now treated as a stock item (parts) and will track quantity on hand.",
      });
      setCategoryDialogOpen(false);
      setCategoryProduct(null);
      loadProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const openStockDialog = (product: Product) => {
    setStockDialogItem(product);
    setStockDialogOpen(true);
  };

  const loadItemStockTracking = useCallback(
    async (product: Product) => {
      if (!companyId) return;
      setStockDialogLoading(true);
      try {
        const cleanName = product.name.startsWith("[INACTIVE] ")
          ? product.name.replace("[INACTIVE] ", "")
          : product.name;

        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, customer_name, status")
          .eq("company_id", companyId)
          .in("status", ["sent", "paid", "partially_paid"]);

        let sales: any[] = [];
        let returns: any[] = [];
        let totalSoldQty = 0;
        let totalReturnedQty = 0;

        if (invoices && invoices.length > 0) {
          const invoiceIds = invoices.map((i: any) => i.id);
          const invoiceMap = new Map(invoices.map((i: any) => [i.id, i]));

          const { data: invoiceItems } = await supabase
            .from("invoice_items")
            .select("id, invoice_id, quantity, unit_price, item_id")
            .eq("item_id", product.id)
            .in("invoice_id", invoiceIds);

          (invoiceItems || []).forEach((row: any) => {
            const inv = invoiceMap.get(row.invoice_id);
            if (!inv) return;
            const qty = row.quantity || 0;
            const unitPrice = row.unit_price || 0;
            if (qty > 0) {
              totalSoldQty += qty;
              sales.push({
                id: row.id,
                date: inv.invoice_date,
                documentNo: inv.invoice_number,
                customer: inv.customer_name || "Unknown",
                qty,
                unitPrice,
                total: unitPrice * qty,
              });
            } else if (qty < 0) {
              const absQty = Math.abs(qty);
              totalReturnedQty += absQty;
              returns.push({
                id: row.id,
                date: inv.invoice_date,
                documentNo: inv.invoice_number,
                customer: inv.customer_name || "Unknown",
                qty: absQty,
                unitPrice,
                total: unitPrice * absQty,
              });
            }
          });
        }

        const { data: pos } = await supabase
          .from("purchase_orders")
          .select("id, po_number, po_date, supplier:suppliers(name), status")
          .eq("company_id", companyId)
          .in("status", ["sent", "processed", "partially_paid", "paid"]);

        let purchases: any[] = [];
        let totalPurchasedQty = 0;

        if (pos && pos.length > 0) {
          const poIds = pos.map((p: any) => p.id);
          const poMap = new Map(pos.map((p: any) => [p.id, p]));

          const { data: poItems } = await supabase
            .from("purchase_order_items")
            .select("id, purchase_order_id, quantity, unit_price, item_id")
            .eq("item_id", product.id)
            .in("purchase_order_id", poIds);

          (poItems || []).forEach((row: any) => {
            const po = poMap.get(row.purchase_order_id);
            if (!po) return;
            const qty = row.quantity || 0;
            const unitPrice = row.unit_price || 0;
            totalPurchasedQty += qty;
            purchases.push({
              id: row.id,
              date: po.po_date,
              documentNo: po.po_number,
              supplier: (po as any).supplier?.name || "Unknown Supplier",
              qty,
              unitPrice,
              total: unitPrice * qty,
            });
          });
        }

        purchases.sort((a, b) => (a.date || "").localeCompare(b.date || "")).reverse();
        sales.sort((a, b) => (a.date || "").localeCompare(b.date || "")).reverse();
        returns.sort((a, b) => (a.date || "").localeCompare(b.date || "")).reverse();

        const netSoldQty = totalSoldQty - totalReturnedQty;
        const expectedOnHand = totalPurchasedQty - netSoldQty;
        const variance = product.quantity_on_hand - expectedOnHand;

        setStockSummary({
          purchasedQty: totalPurchasedQty,
          soldQty: totalSoldQty,
          returnedQty: totalReturnedQty,
          netSoldQty,
          expectedOnHand,
          variance,
        });
        setStockPurchases(purchases.slice(0, 10));
        setStockSales(sales.slice(0, 10));
        setStockReturns(returns.slice(0, 10));
      } catch (error: any) {
        toast({ title: "Error loading stock history", description: error.message, variant: "destructive" });
      } finally {
        setStockDialogLoading(false);
      }
    },
    [companyId, toast]
  );

  useEffect(() => {
    if (stockDialogOpen && stockDialogItem) {
      loadItemStockTracking(stockDialogItem);
    }
  }, [stockDialogOpen, stockDialogItem, loadItemStockTracking]);

  const handleImageClick = (product: Product) => {
    if (!canEdit) return;
    setImageUploadItem(product);
    setImageDialogError(null);
    setImageDialogOpen(true);
  };

  const handleItemImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || e.target.files.length === 0) return;
      if (!imageUploadItem) return;
      if (!companyId) {
        toast({ title: "Company not loaded", description: "Please try again in a moment.", variant: "destructive" });
        return;
      }
      const fileToUpload = e.target.files[0];
      const maxBytes = 1 * 1024 * 1024;
      if (fileToUpload.size > maxBytes) {
        setImageDialogError("File is too large. Please upload an image smaller than 1 MB.");
        if (imageInputRef.current) {
          imageInputRef.current.value = "";
        }
        return;
      }
      setImageUploadingId(imageUploadItem.id);
      const filePath = `item-images/${companyId}/${imageUploadItem.id}`;
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(filePath, fileToUpload, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage
        .from("company-logos")
        .getPublicUrl(filePath);
      const publicUrl = data?.publicUrl || "";
      if (publicUrl) {
        setItemImageUrls(prev => ({ ...prev, [imageUploadItem.id]: publicUrl }));
        setImageErrorIds(prev => {
          const next = { ...prev };
          delete next[imageUploadItem.id];
          return next;
        });
      }
      toast({ title: "Product image updated", description: "The picture has been saved.", variant: "default" });
      setImageDialogOpen(false);
      setImageDialogError(null);
    } catch (error: any) {
      toast({ title: "Image upload failed", description: error.message, variant: "destructive" });
    } finally {
      setImageUploadingId(null);
      setImageUploadItem(null);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  const [openingForm, setOpeningForm] = useState({ productId: "", quantity: "", costPrice: "", date: new Date().toISOString().slice(0,10) });

  const loadProducts = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user?.id)
        .maybeSingle();
      if (!profile) return;
      const cid = profile.company_id as string;
      setCompanyId(cid);
      
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("company_id", cid)
        .order("name");
      if (error) throw error;
      setProducts(data || []);

      const urlMap: Record<string, string> = {};
      (data || []).forEach((item: any) => {
        const { data: urlData } = supabase.storage
          .from("company-logos")
          .getPublicUrl(`item-images/${cid}/${item.id}`);
        if (urlData?.publicUrl) {
          urlMap[item.id] = urlData.publicUrl;
        }
      });
      setItemImageUrls(urlMap);
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
    let allItems = [...products];
    
    // Apply View Filter
    if (viewFilter === 'active') {
        allItems = allItems.filter(i => !i.name.startsWith('[INACTIVE]'));
    } else if (viewFilter === 'inactive') {
        allItems = allItems.filter(i => i.name.startsWith('[INACTIVE]'));
    }

    if (!searchTerm) return allItems.sort((a, b) => a.name.localeCompare(b.name));
    
    return allItems.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, searchTerm, viewFilter]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage]);

  const openDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku || "",
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
      sku: "",
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
          sku: createForm.sku,
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
      setCreateForm({ name: "", sku: "", description: "", unit_price: "", cost_price: "" });
      loadProducts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast({ title: "Permission denied", variant: "destructive" });
      return;
    }
    try {
      const name = serviceForm.name.trim();
      if (!name) {
        toast({ title: "Name required", description: "Enter a service name", variant: "destructive" });
        return;
      }
      const unit = parseFloat(serviceForm.unit_price || "0");
      if (!unit || unit <= 0) {
        toast({ title: "Invalid price", description: "Enter a valid service price", variant: "destructive" });
        return;
      }

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


  const checkStockBeforeAction = (item: Product, action: string = "delete") => {
    if (item.item_type === 'product' && item.quantity_on_hand > 0) {
        setStockWarningMessage(`You cannot ${action} "${item.name}" because it still has ${item.quantity_on_hand} items in stock. Please adjust stock to 0 first.`);
        setStockWarningOpen(true);
        return false;
    }
    return true;
  };

  const handleDeleteClick = (item: Product) => {
      if (checkStockBeforeAction(item, "delete")) {
          setProductToDeactivate(item);
          setDeactivateOpen(true);
      }
  };

  const handleBatchDelete = async () => {
      const itemsToDelete = filteredItems.filter(i => selectedIds.includes(i.id));
      
      // Check for stock in batch
      const itemsWithStock = itemsToDelete.filter(i => i.item_type === 'product' && i.quantity_on_hand > 0);
      if (itemsWithStock.length > 0) {
          setStockWarningMessage(`Cannot delete the following items because they have stock on hand:\n${itemsWithStock.map(i => i.name).join(', ')}`);
          setStockWarningOpen(true);
          return;
      }

      // Proceed with batch deactivation (simulated delete)
      if (!confirm(`Are you sure you want to delete ${selectedIds.length} items? This will mark them as inactive.`)) return;

      try {
          for (const item of itemsToDelete) {
              const newName = `[INACTIVE] ${item.name}`;
              await supabase.from("items").update({ name: newName }).eq("id", item.id);
          }
          toast({ title: "Success", description: `${selectedIds.length} items deleted (deactivated).` });
          setSelectedIds([]);
          loadProducts();
      } catch (error: any) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
      }
  };

  const handleBulkToggleActive = async () => {
      const itemsToToggle = filteredItems.filter(i => selectedIds.includes(i.id));
      try {
          for (const item of itemsToToggle) {
              const isInactive = item.name.startsWith('[INACTIVE]');
              let newName = item.name;
              if (isInactive) {
                  newName = item.name.replace('[INACTIVE] ', '');
              } else {
                  newName = `[INACTIVE] ${item.name}`;
              }
              await supabase.from("items").update({ name: newName }).eq("id", item.id);
          }
          toast({ title: "Success", description: "Status updated for selected items." });
          setSelectedIds([]);
          loadProducts();
      } catch (error: any) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
      }
  };

  // Import State
  const [importOpen, setImportOpen] = useState(false);
  const [importLogs, setImportLogs] = useState<{ message: string; type: 'info' | 'success' | 'error' | 'warning' }[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMode, setImportMode] = useState<'inventory' | 'service'>('inventory');

  const handleImportClick = (mode: 'inventory' | 'service') => {
    if (isImporting) return;
    setImportMode(mode);
    setImportLogs([]);
    setImportProgress(0);
    setImportOpen(true);
  };

  const triggerFileSelect = () => {
    document.getElementById('import-file-input')?.click();
  };

  const handleDownloadTemplate = () => {
    const headers = ['Code', 'Description', 'Category', 'Price Excl.', 'Price Incl.', 'Avg Cost', 'Last Cost', 'Qty On Hand', 'Active'];
    const sampleRow = ['ITEM-001', 'Sample Item', 'Parts', '100.00', '115.00', '80.00', '85.00', '10', 'Yes'];
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), sampleRow.join(',')].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "item_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportOpen(true);
    setImportLogs([{ message: "Reading your file... just a moment.", type: 'info' }]);
    setIsImporting(true);
    setImportProgress(0);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        await processImportItemsData(data, importMode);
      } catch (error) {
        setImportLogs(prev => [...prev, { message: "I couldn't read that file. Is it a valid Excel/CSV file?", type: 'error' }]);
        setIsImporting(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset
  };

  const processImportItemsData = async (data: any[], mode: 'inventory' | 'service') => {
    setImportLogs(prev => [...prev, { message: `I found ${data.length} items in your list. Starting the import now...`, type: 'info' }]);
    
    try {
        if (!companyId) {
             const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user?.id).single();
             if (profile) setCompanyId(profile.company_id);
             else throw new Error("Company ID not found");
        }
        
        let successCount = 0;
        let errorCount = 0;
        const total = data.length;

        for (let i = 0; i < total; i++) {
            const row = data[i];
            setImportProgress(Math.round(((i + 1) / total) * 100));

            // Map fields based on CSV headers: Code,Description,Category,Price Excl.,Price Incl.,Avg Cost,Last Cost,Qty On Hand,Active
            const sku = row['Code'] ? String(row['Code']).trim() : '';
            const name = row['Description'] ? String(row['Description']).trim() : ''; // Using Description as Name based on file
            // If Description is actually the name, and there is no separate name, we use it.
            
            if (!name) {
                setImportLogs(prev => [...prev, { message: `Skipping row ${i + 1}: Missing Description/Name`, type: 'warning' }]);
                errorCount++;
                continue;
            }

            const category = row['Category'] ? String(row['Category']).toLowerCase() : 'parts';
            let itemType: 'product' | 'service' = mode === 'service' ? 'service' : 'product';

            if (mode === 'inventory' && category === 'services') {
                setImportLogs(prev => [...prev, { message: `Skipping row ${i + 1}: Category is Services, please use Service import instead`, type: 'warning' }]);
                errorCount++;
                continue;
            }
            
            const unitPrice = row['Price Excl.'] ? parseFloat(row['Price Excl.']) : 0;
            const costPrice = row['Last Cost'] ? parseFloat(row['Last Cost']) : 0;
            const qty = row['Qty On Hand'] ? parseFloat(row['Qty On Hand']) : 0;
            const active = row['Active'] ? String(row['Active']).toLowerCase() : 'yes';

            const itemName = active === 'no' ? `[INACTIVE] ${name}` : name;

            // Check if item exists by Code (we don't have an explicit 'sku' column, assuming 'name' or 'description' might be unique, or just insert new)
            // Correction: Based on schema, we don't have 'sku' or 'item_code'. We will check by 'name'.
            let existingId = null;
            if (sku) {
                // Try to find by name since that's likely unique
                const { data: existing } = await supabase
                    .from('items')
                    .select('id')
                    .eq('company_id', companyId)
                    .eq('name', sku) // Using sku as name for lookup
                    .maybeSingle();
                existingId = existing?.id;
            }

            const itemData = {
                company_id: companyId,
                name: sku, // Map 'Code' to 'name'
                description: name, // Map 'Description' to 'description'
                item_type: itemType,
                unit_price: unitPrice,
                cost_price: costPrice,
                quantity_on_hand: 0
            };

            let error: any = null;
            let productId = existingId;
            if (existingId) {
                const { error: err } = await supabase
                    .from('items')
                    .update(itemData)
                    .eq('id', existingId);
                error = err;
            } else {
                const { data: created, error: err } = await supabase
                    .from('items')
                    .insert(itemData)
                    .select('id')
                    .single();
                error = err;
                productId = (created as any)?.id || null;
            }

            if (error || !productId) {
                setImportLogs(prev => [...prev, { message: `Failed to save ${name}: ${error?.message || 'Unknown error'}`, type: 'error' }]);
                errorCount++;
            } else {
                successCount++;

                if (mode === 'inventory' && qty > 0 && costPrice > 0) {
                  try {
                    await transactionsApi.postOpeningStock({
                      productId,
                      quantity: qty,
                      costPrice,
                      date: new Date().toISOString().slice(0,10),
                    });
                  } catch (err: any) {
                    setImportLogs(prev => [...prev, { message: `Saved ${name}, but failed to post opening stock: ${err.message}`, type: 'error' }]);
                    errorCount++;
                  }
                }
            }
        }

        setImportLogs(prev => [...prev, { message: `Import completed! Successfully imported: ${successCount}. Failed: ${errorCount}.`, type: 'success' }]);
        loadProducts();

    } catch (error: any) {
        setImportLogs(prev => [...prev, { message: `Critical error during import: ${error.message}`, type: 'error' }]);
    } finally {
        setIsImporting(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredItems.map(i => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const loadSupplierReport = useCallback(async () => {
    if (!user) return;
    try {
      setSupplierReportLoading(true);

      let activeCompanyId = companyId;
      if (!activeCompanyId) {
        const { data } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.company_id) {
          activeCompanyId = data.company_id;
          setCompanyId(data.company_id);
        }
      }

      if (!activeCompanyId) return;

      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("name");

      if (suppliersError) throw suppliersError;

      const { data: posData } = await supabase
        .from("purchase_orders")
        .select("supplier_id, total_amount, status, po_number")
        .eq("company_id", activeCompanyId)
        .in("status", ["sent", "processed", "partially_paid", "paid"]);

      const { data: transData } = await supabase
        .from("transactions")
        .select("reference_number, total_amount, transaction_type, description, supplier_id")
        .eq("company_id", activeCompanyId)
        .in("transaction_type", ["payment", "deposit"])
        .eq("status", "posted");

      const formatted = (suppliersData || []).map((supplier: any) => {
        const supplierPOs = (posData || []).filter((p: any) => p.supplier_id === supplier.id);
        const totalLiability = supplierPOs.reduce(
          (sum: number, p: any) => sum + (Number(p.total_amount) || 0),
          0
        );

        const poRefs = new Set(
          supplierPOs.map((p: any) => p.po_number).filter(Boolean)
        );
        const supplierNameLower = (supplier.name || "").toLowerCase();

        const supplierTrans = (transData || []).filter((t: any) => {
          if (t.supplier_id === supplier.id) return true;
          if (t.reference_number && poRefs.has(t.reference_number)) return true;
          if (t.reference_number && t.reference_number.includes(supplier.id)) return true;
          if (t.description && t.description.toLowerCase().includes(supplierNameLower)) return true;
          return false;
        });

        const totalPaid = supplierTrans.reduce(
          (sum: number, t: any) => sum + (Number(t.total_amount) || 0),
          0
        );
        const netBalance = totalLiability - totalPaid;

        const isInactive = (supplier.name || "").startsWith("[INACTIVE] ");
        const cleanName = isInactive
          ? supplier.name.replace("[INACTIVE] ", "")
          : supplier.name;

        return {
          id: supplier.id,
          name: cleanName,
          isInactive,
          category: supplier.category || "Local",
          contact_person: supplier.contact_person || "",
          phone: supplier.phone || "",
          outstanding_balance: netBalance,
        };
      });

      setSupplierReportRows(formatted);
    } catch (error: any) {
      console.error("Error loading supplier report:", error);
      toast({
        title: "Error loading supplier report",
        description: error.message || "Could not load suppliers.",
        variant: "destructive",
      });
    } finally {
      setSupplierReportLoading(false);
    }
  }, [user, companyId, toast]);

  const openSupplierReportDialog = () => {
    setSupplierReportOpen(true);
    loadSupplierReport();
  };

  const loadSalesReport = useCallback(async () => {
    if (!user) return;
    try {
      setSalesReportLoading(true);

      let activeCompanyId = companyId;
      if (!activeCompanyId) {
        const { data } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.company_id) {
          activeCompanyId = data.company_id;
          setCompanyId(data.company_id);
        }
      }

      if (!activeCompanyId) return;

      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, customer_name, status")
        .eq("company_id", activeCompanyId)
        .in("status", ["sent", "paid", "partially_paid"]);

      if (!invoices || invoices.length === 0) {
        setSalesReportRows([]);
        return;
      }

      const invoiceIds = invoices.map((i: any) => i.id);

      const { data: invoiceItems } = await supabase
        .from("invoice_items")
        .select("id, invoice_id, quantity, unit_price, item:items(name, cost_price)")
        .in("invoice_id", invoiceIds);

      const totalsMap = new Map<
        string,
        {
          itemName: string;
          totalQty: number;
          totalCost: number;
          totalSelling: number;
        }
      >();

      (invoiceItems || []).forEach((row: any) => {
        const qty = row.quantity || 0;
        if (!qty) return;
        const itemName = row.item?.name || "Unknown Item";
        const unitCost = row.item?.cost_price || 0;
        const unitPrice = row.unit_price || 0;

        const key = itemName;
        const existing = totalsMap.get(key) || {
          itemName,
          totalQty: 0,
          totalCost: 0,
          totalSelling: 0,
        };

        existing.totalQty += qty;
        existing.totalCost += unitCost * qty;
        existing.totalSelling += unitPrice * qty;
        totalsMap.set(key, existing);
      });

      const rows = Array.from(totalsMap.values()).map((t) => {
        const gpAmount = t.totalSelling - t.totalCost;
        const gpPercent = t.totalSelling ? (gpAmount / t.totalSelling) * 100 : 0;
        return {
          itemName: t.itemName,
          totalQty: t.totalQty,
          totalCost: t.totalCost,
          totalSelling: t.totalSelling,
          gpAmount,
          gpPercent,
        };
      });

      rows.sort((a, b) => a.itemName.localeCompare(b.itemName));
      setSalesReportRows(rows);
    } catch (error: any) {
      console.error("Error loading sales report:", error);
      toast({
        title: "Error loading sales report",
        description: error.message || "Could not load sales data.",
        variant: "destructive",
      });
    } finally {
      setSalesReportLoading(false);
    }
  }, [user, companyId, toast]);

  const openSalesReportDialog = () => {
    setSalesReportOpen(true);
    loadSalesReport();
  };

  const loadPurchasesReport = useCallback(async () => {
    if (!user) return;
    try {
      setPurchasesReportLoading(true);

      let activeCompanyId = companyId;
      if (!activeCompanyId) {
        const { data } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.company_id) {
          activeCompanyId = data.company_id;
          setCompanyId(data.company_id);
        }
      }

      if (!activeCompanyId) return;

      const { data: pos } = await supabase
        .from("purchase_orders")
        .select("id, po_number, po_date, supplier:suppliers(name), status")
        .eq("company_id", activeCompanyId)
        .in("status", ["sent", "processed", "partially_paid", "paid"]);

      if (!pos || pos.length === 0) {
        setPurchasesReportRows([]);
        return;
      }

      const poIds = pos.map((p: any) => p.id);

      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("id, purchase_order_id, quantity, unit_price, item:items(name)")
        .in("purchase_order_id", poIds);

      const totalsMap = new Map<
        string,
        {
          itemName: string;
          totalQty: number;
          totalPurchases: number;
        }
      >();

      (poItems || []).forEach((row: any) => {
        const qty = row.quantity || 0;
        if (!qty) return;
        const itemName = row.item?.name || row.description || "Unknown Item";
        const unitPrice = row.unit_price || 0;

        const key = itemName;
        const existing = totalsMap.get(key) || {
          itemName,
          totalQty: 0,
          totalPurchases: 0,
        };

        existing.totalQty += qty;
        existing.totalPurchases += unitPrice * qty;
        totalsMap.set(key, existing);
      });

      const rows = Array.from(totalsMap.values());
      rows.sort((a, b) => a.itemName.localeCompare(b.itemName));
      setPurchasesReportRows(rows);
    } catch (error: any) {
      console.error("Error loading purchases report:", error);
      toast({
        title: "Error loading purchases report",
        description: error.message || "Could not load purchases data.",
        variant: "destructive",
      });
    } finally {
      setPurchasesReportLoading(false);
    }
  }, [user, companyId, toast]);

  const openPurchasesReportDialog = () => {
    setPurchasesReportOpen(true);
    loadPurchasesReport();
  };

  const handleExportItems = (format: "excel" | "csv" | "pdf") => {
    if (!filteredItems.length) {
      toast({ title: "Nothing to export", description: "There are no items in the current view.", variant: "destructive" });
      return;
    }

    const rows = filteredItems.map((item) => {
      const isInactive = item.name.startsWith("[INACTIVE]");
      const cleanName = isInactive ? item.name.replace("[INACTIVE] ", "") : item.name;
      const category = item.item_type === "service" ? "Services" : "Parts";
      return {
        Name: cleanName,
        Description: item.description || "",
        Category: category,
        "Price Excl": Number(item.unit_price || 0),
        "Avg Cost": Number(item.cost_price ?? 0),
        "Qty On Hand": item.item_type === "product" ? Number(item.quantity_on_hand || 0) : 0,
        Active: isInactive ? "No" : "Yes",
      };
    });

    const fileBase = "inventory-items";

    if (format === "excel" || format === "csv") {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Items");

      if (format === "excel") {
        XLSX.writeFile(workbook, `${fileBase}.xlsx`);
      } else {
        XLSX.writeFile(workbook, `${fileBase}.csv`, { bookType: "csv" });
      }
      return;
    }

    if (format === "pdf") {
      import("jspdf").then(({ default: jsPDF }) => {
        return import("jspdf-autotable").then((autoTableModule) => {
          const doc = new jsPDF();
          // @ts-ignore
          const autoTable = autoTableModule.default || autoTableModule;

          doc.text("Inventory Items", 14, 18);

          const head = [["Name", "Category", "Price Excl", "Avg Cost", "Qty On Hand", "Active"]];
          const body = rows.map((r) => [
            r.Name,
            r.Category,
            r["Price Excl"].toFixed(2),
            r["Avg Cost"].toFixed(2),
            r["Qty On Hand"].toFixed(2),
            r.Active,
          ]);

          autoTable(doc, {
            startY: 24,
            head,
            body,
            styles: { fontSize: 8 },
          });

          doc.save(`${fileBase}.pdf`);
        });
      }).catch((error: any) => {
        toast({ title: "Export failed", description: error.message || "Could not generate PDF.", variant: "destructive" });
      });
    }
  };

  return (
    <div className="space-y-4 bg-gray-50/50 p-6 min-h-screen font-sans">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
           <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-[#0052cc] hover:bg-[#0043a8] text-white font-medium px-6">
                  Add Item
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handleOpenCreate}>
                  <Box className="mr-2 h-4 w-4" /> Add Product
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setServiceOpen(true)}>
                  <Briefcase className="mr-2 h-4 w-4" /> Add Service
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOpeningOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Opening Stock
                </DropdownMenuItem>
              </DropdownMenuContent>
           </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="bg-white border-blue-200 text-[#0052cc] hover:bg-blue-50 flex items-center gap-1"
              >
                Import
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => handleImportClick('inventory')}>
                <Upload className="mr-2 h-4 w-4" />
                Inventory (Opening Stock)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleImportClick('service')}>
                <Upload className="mr-2 h-4 w-4" />
                Services
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="bg-white border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => handleExportItems("excel")}>
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportItems("csv")}>
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportItems("pdf")}>
                PDF (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input 
            type="file" 
            id="import-file-input" 
            className="hidden" 
            accept=".csv,.xlsx" 
            onChange={handleImportFileChange} 
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
           <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 bg-white border-gray-300"
              />
           </div>
           <Button variant="outline" className="bg-white border-gray-300 text-gray-700 h-10 w-10 p-0">
             <Search className="h-4 w-4 text-blue-600" />
           </Button>
           
           <Select value={viewFilter} onValueChange={setViewFilter}>
             <SelectTrigger className="w-[140px] bg-white">
               <SelectValue placeholder="View: All" />
             </SelectTrigger>
             <SelectContent>
               <SelectItem value="all">View: All</SelectItem>
               <SelectItem value="active">Active</SelectItem>
               <SelectItem value="inactive">Inactive</SelectItem>
             </SelectContent>
           </Select>

           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="bg-white border-blue-200 text-[#0052cc] hover:bg-blue-50">
                Quick Reports <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openSupplierReportDialog}>
                List of Supplier
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openSalesReportDialog}>
                Sale by Item
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openPurchasesReportDialog}>
                Purchase by Item
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Secondary Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-1 text-sm border-b border-gray-200 pb-2">
          <Button variant="ghost" className="text-[#0052cc] hover:bg-blue-50 h-8 px-2 font-medium">
            Actions <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
          <Button variant="ghost" className="text-gray-600 hover:text-gray-900 h-8 px-2" onClick={handleBatchDelete}>
            Delete
          </Button>
          <Button variant="ghost" className="text-gray-600 hover:text-gray-900 h-8 px-2" onClick={handleBulkToggleActive}>
            Mark As Active/Inactive
          </Button>
          <Button
            variant="ghost"
            className="text-gray-600 hover:text-gray-900 h-8 px-2"
            onClick={() =>
              toast({
                title: "Feature coming soon",
                description: "Batch update is under development",
              })
            }
          >
            Update
          </Button>
          <Button
            variant="ghost"
            className="text-gray-600 hover:text-gray-900 h-8 px-2"
            onClick={() =>
              toast({
                title: "Feature coming soon",
                description: "Item bundles are under development",
              })
            }
          >
            Create Item Bundle
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border rounded-sm shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-8">Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No items found</p>
          </div>
        ) : (
          <>
          <Table>
            <TableHeader className="bg-[#5e6977] hover:bg-[#5e6977]">
              <TableRow className="hover:bg-[#5e6977] border-none">
                <TableHead className="w-[40px] text-white h-10">
                   <Checkbox 
                      checked={selectedIds.length === filteredItems.length && filteredItems.length > 0}
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      className="border-white/50 data-[state=checked]:bg-white data-[state=checked]:text-[#5e6977]"
                   />
                </TableHead>
                <TableHead className="text-white font-medium h-10 text-center">Image</TableHead>
                <TableHead className="text-white font-medium h-10">Item Name</TableHead>
                <TableHead className="text-white font-medium h-10">Description</TableHead>
                <TableHead className="text-white font-medium h-10">Category</TableHead>
                <TableHead className="text-white font-medium h-10 text-right">Price Excl.</TableHead>
                <TableHead className="text-white font-medium h-10 text-right">Price Incl.</TableHead>
                <TableHead className="text-white font-medium h-10 text-right">Avg Cost</TableHead>
                <TableHead className="text-white font-medium h-10 text-right">Last Cost</TableHead>
                <TableHead className="text-white font-medium h-10 text-right">Qty On Hand</TableHead>
                <TableHead className="text-white font-medium h-10 text-center">Stock Status</TableHead>
                <TableHead className="text-white font-medium h-10 text-center">Active</TableHead>
                <TableHead className="text-white font-medium h-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedItems.map((item, i) => {
                 const isInactive = item.name.startsWith('[INACTIVE]');
                 const cleanName = isInactive ? item.name.replace('[INACTIVE] ', '') : item.name;
                 return (
                <TableRow key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <TableCell className="py-2">
                     <Checkbox 
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={(checked) => handleSelectRow(item.id, !!checked)}
                     />
                  </TableCell>
                  <TableCell className="py-2">
                    <button
                      type="button"
                      onClick={() => handleImageClick(item)}
                      className="flex items-center justify-center w-10 h-10 mx-auto rounded-full border border-gray-200 bg-gray-50 overflow-hidden hover:ring-2 hover:ring-blue-200 transition"
                    >
                      {itemImageUrls[item.id] && !imageErrorIds[item.id] ? (
                        <img
                          src={itemImageUrls[item.id]}
                          alt={cleanName}
                          className="w-full h-full object-cover"
                          onError={() =>
                            setImageErrorIds(prev => ({ ...prev, [item.id]: true }))
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-100 text-xs font-semibold text-gray-500">
                          {cleanName
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map(part => part[0])
                            .join("")
                            .toUpperCase()}
                        </div>
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="py-2">
                    <button
                      type="button"
                      className="text-[#0052cc] hover:underline cursor-pointer font-medium"
                      onClick={() => openStockDialog(item)}
                    >
                      {cleanName}
                    </button>
                  </TableCell>
                  <TableCell className="py-2 text-gray-600 text-sm">
                    {item.description || item.name}
                  </TableCell>
                  <TableCell className="py-2 text-gray-600 text-sm">
                    <button
                      type="button"
                      className="text-[#0052cc] hover:underline hover:text-[#003f9e] text-sm font-medium"
                      onClick={() => openCategoryDialog(item)}
                    >
                      {item.item_type === 'service' ? 'Service' : 'Parts'}
                    </button>
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm">
                    R {Number(item.unit_price).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm">
                    R {(Number(item.unit_price) * 1.15).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm">
                    {item.item_type === 'product'
                      ? `R ${Number(item.cost_price ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                      : '-'}
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm">
                    {item.item_type === 'product'
                      ? `R ${Number(item.cost_price ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`
                      : '-'}
                  </TableCell>
                  <TableCell className="py-2 text-right text-sm">
                    {item.item_type === 'product' ? item.quantity_on_hand.toFixed(2) : '-'}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <StockStatusBadge quantity={item.quantity_on_hand} isProduct={item.item_type === 'product'} />
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Checkbox checked={!isInactive} disabled />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 text-[#0052cc] hover:text-[#0043a8] px-2 font-medium">
                          Actions <ChevronDown className="h-3 w-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openDialog(item)}>
                           <Eye className="mr-2 h-4 w-4" /> Quick View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDialog(item)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        {item.item_type === 'product' && (
                          <DropdownMenuItem onClick={() => openAdjustmentDialog(item)}>
                            <ClipboardList className="mr-2 h-4 w-4" /> Adjust Stock
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDeleteClick(item)} className="text-red-600">
                          <Trash className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between px-4 py-2 border-t bg-gray-50">
            <div className="text-xs text-gray-600">
              Showing{" "}
              {filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
              {" - "}
              {Math.min(currentPage * pageSize, filteredItems.length)} of{" "}
              {filteredItems.length} items
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={currentPage === totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
          </>
        )}
      </div>

      <Dialog open={productInfoOpen} onOpenChange={setProductInfoOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600" />
              Add Product from Supplier Management
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              To create new stock products, go to the{" "}
              <span className="font-semibold">Supplier Management</span> module. That is where you capture
              full product details linked to suppliers.
            </p>
            <p>
              The <span className="font-semibold">Items</span> module is designed for:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>Posting <span className="font-semibold">opening inventory</span> balances</li>
              <li>Importing items from <span className="font-semibold">CSV / Excel</span></li>
              <li>Adding <span className="font-semibold">services</span> and their selling prices</li>
            </ul>
            <p>
              Use Supplier Management when you want to add a brand new product to your catalog.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setProductInfoOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              className="bg-gradient-primary"
              onClick={() => {
                setProductInfoOpen(false);
                navigate("/purchase");
              }}
            >
              Go to Supplier Management
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={serviceOpen} onOpenChange={setServiceOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
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

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Item Category</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Type how you want to classify this item. Use{" "}
              <span className="font-semibold">Services</span> for non-stock work you do, and{" "}
              <span className="font-semibold">Parts</span> (or similar) for stock items you keep on hand.
              This controls whether stock quantities are tracked.
            </p>
          </DialogHeader>
          <form onSubmit={handleCategorySave} className="space-y-4">
            <div className="space-y-1">
              <Label>Item</Label>
              <Input value={categoryProduct?.name || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Category (you can type)</Label>
              <Input
                value={categoryValue}
                onChange={(e) => setCategoryValue(e.target.value)}
                placeholder="Examples: Parts, Services"
              />
              <p className="text-xs text-muted-foreground">
                If the text contains the word <span className="font-semibold">service</span> the item will be
                treated as a Service (no stock). Anything else is treated as Parts (stock item).
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-gradient-primary">
                Save Category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={stockDialogOpen}
        onOpenChange={(open) => {
          setStockDialogOpen(open);
          if (!open) {
            setStockDialogItem(null);
            setStockSummary(null);
            setStockPurchases([]);
            setStockSales([]);
            setStockReturns([]);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" />
              Stock Tracking
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              See what has been purchased, what has been sold, and what is left for this item.
            </p>
          </DialogHeader>
          {stockDialogItem && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Item: <span className="font-semibold">{stockDialogItem.name.startsWith("[INACTIVE] ") ? stockDialogItem.name.replace("[INACTIVE] ", "") : stockDialogItem.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Current quantity on hand: {stockDialogItem.quantity_on_hand.toFixed(2)}
                </p>
              </div>
              {stockDialogLoading ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading stock movements...
                </div>
              ) : (
                <>
                  {stockSummary && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                      <div className="p-3 rounded-md bg-blue-50 border border-blue-100">
                        <div className="text-[10px] text-blue-700 uppercase tracking-wide">Total Purchased</div>
                        <div className="text-lg font-semibold text-blue-900">
                          {stockSummary.purchasedQty.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-3 rounded-md bg-emerald-50 border border-emerald-100">
                        <div className="text-[10px] text-emerald-700 uppercase tracking-wide">Total Sold</div>
                        <div className="text-lg font-semibold text-emerald-900">
                          {stockSummary.soldQty.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-3 rounded-md bg-sky-50 border border-sky-100">
                        <div className="text-[10px] text-sky-700 uppercase tracking-wide">Total Returned</div>
                        <div className="text-lg font-semibold text-sky-900">
                          {stockSummary.returnedQty.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-3 rounded-md bg-indigo-50 border border-indigo-100">
                        <div className="text-[10px] text-indigo-700 uppercase tracking-wide">Net Sold (Sold - Returned)</div>
                        <div className="text-lg font-semibold text-indigo-900">
                          {stockSummary.netSoldQty.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-3 rounded-md bg-purple-50 border border-purple-100">
                        <div className="text-[10px] text-purple-700 uppercase tracking-wide">Expected On Hand</div>
                        <div className="text-lg font-semibold text-purple-900">
                          {stockSummary.expectedOnHand.toFixed(2)}
                        </div>
                      </div>
                      <div className="p-3 rounded-md bg-amber-50 border border-amber-100">
                        <div className="text-[10px] text-amber-700 uppercase tracking-wide">Variance</div>
                        <div className={`text-lg font-semibold ${stockSummary.variance === 0 ? "text-amber-900" : stockSummary.variance > 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {stockSummary.variance.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="border rounded-md">
                      <div className="px-3 py-2 border-b bg-gray-50 text-xs font-semibold text-gray-700 tracking-wide uppercase">
                        Purchases
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {stockPurchases.length === 0 ? (
                          <div className="text-sm text-muted-foreground px-3 py-4">
                            No purchases found for this item.
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[11px]">Date</TableHead>
                                <TableHead className="text-[11px]">Doc</TableHead>
                                <TableHead className="text-[11px]">Supplier</TableHead>
                                <TableHead className="text-[11px] text-right">Qty</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {stockPurchases.map((row: any) => (
                                <TableRow key={row.id}>
                                  <TableCell className="text-[11px]">{row.date}</TableCell>
                                  <TableCell className="text-[11px]">{row.documentNo}</TableCell>
                                  <TableCell className="text-[11px] truncate max-w-[120px]">{row.supplier}</TableCell>
                                  <TableCell className="text-[11px] text-right">{row.qty}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-md">
                      <div className="px-3 py-2 border-b bg-gray-50 text-xs font-semibold text-gray-700 tracking-wide uppercase">
                        Sales
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {stockSales.length === 0 ? (
                          <div className="text-sm text-muted-foreground px-3 py-4">
                            No sales found for this item.
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[11px]">Date</TableHead>
                                <TableHead className="text-[11px]">Doc</TableHead>
                                <TableHead className="text-[11px]">Customer</TableHead>
                                <TableHead className="text-[11px] text-right">Qty</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {stockSales.map((row: any) => (
                                <TableRow key={row.id}>
                                  <TableCell className="text-[11px]">{row.date}</TableCell>
                                  <TableCell className="text-[11px]">{row.documentNo}</TableCell>
                                  <TableCell className="text-[11px] truncate max-w-[120px]">{row.customer}</TableCell>
                                  <TableCell className="text-[11px] text-right">{row.qty}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-md">
                      <div className="px-3 py-2 border-b bg-gray-50 text-xs font-semibold text-gray-700 tracking-wide uppercase">
                        Returns
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {stockReturns.length === 0 ? (
                          <div className="text-sm text-muted-foreground px-3 py-4">
                            No returns found for this item.
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[11px]">Date</TableHead>
                                <TableHead className="text-[11px]">Doc</TableHead>
                                <TableHead className="text-[11px]">Customer</TableHead>
                                <TableHead className="text-[11px] text-right">Qty</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {stockReturns.map((row: any) => (
                                <TableRow key={row.id}>
                                  <TableCell className="text-[11px]">{row.date}</TableCell>
                                  <TableCell className="text-[11px]">{row.documentNo}</TableCell>
                                  <TableCell className="text-[11px] truncate max-w-[120px]">{row.customer}</TableCell>
                                  <TableCell className="text-[11px] text-right">{row.qty}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={imageDialogOpen} onOpenChange={(open) => { setImageDialogOpen(open); if (!open) { setImageUploadItem(null); setImageDialogError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Product Image</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Add a picture for this item so it is easy to recognise on screens and reports.
            </p>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-sm text-muted-foreground">
              <p>Guidelines:</p>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Maximum file size: <span className="font-semibold">1 MB</span></li>
                <li>Use common image types like JPG or PNG</li>
                <li>Square images work best in the round avatar</li>
              </ul>
            </div>
            {imageDialogError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {imageDialogError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setImageDialogOpen(false); setImageUploadItem(null); }}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-gradient-primary"
              onClick={() => {
                setImageDialogError(null);
                if (imageInputRef.current) {
                  imageInputRef.current.value = "";
                  imageInputRef.current.click();
                }
              }}
            >
              {imageUploadingId && imageUploadItem && imageUploadingId === imageUploadItem.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>Upload Image</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={supplierReportOpen}
        onOpenChange={(open) => {
          setSupplierReportOpen(open);
          if (!open) {
            setSupplierReportRows([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Supplier Listing
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Quick view of your suppliers, their contact details, and current balances.
            </p>
          </DialogHeader>
          <div className="border rounded-sm max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-[#5e6977] hover:bg-[#5e6977]">
                <TableRow className="hover:bg-[#5e6977] border-none">
                  <TableHead className="whitespace-nowrap text-white text-xs font-medium h-9">Name</TableHead>
                  <TableHead className="whitespace-nowrap text-white text-xs font-medium h-9">Category</TableHead>
                  <TableHead className="text-center whitespace-nowrap text-white text-xs font-medium h-9">Active</TableHead>
                  <TableHead className="whitespace-nowrap text-white text-xs font-medium h-9">Contact Name</TableHead>
                  <TableHead className="whitespace-nowrap text-white text-xs font-medium h-9">Telephone</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-white text-xs font-medium h-9">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierReportLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 mr-2 inline-block animate-spin" />
                      Loading suppliers...
                    </TableCell>
                  </TableRow>
                ) : supplierReportRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                      No suppliers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  supplierReportRows.map((s, index) => (
                    <TableRow
                      key={s.id}
                      className={index % 2 === 0 ? "bg-white" : "bg-gray-50/60"}
                    >
                      <TableCell className="font-medium text-sm">
                        {s.name}
                      </TableCell>
                      <TableCell className="text-sm">{s.category}</TableCell>
                      <TableCell className="text-center text-sm">
                        {s.isInactive ? "No" : "Yes"}
                      </TableCell>
                      <TableCell className="text-sm">{s.contact_person || "-"}</TableCell>
                      <TableCell className="text-sm">{s.phone || "-"}</TableCell>
                      <TableCell className="text-right text-sm">
                        R{" "}
                        {Number(s.outstanding_balance || 0).toLocaleString("en-ZA", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={salesReportOpen}
        onOpenChange={(open) => {
          setSalesReportOpen(open);
          if (!open) {
            setSalesReportRows([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Sales By Item
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Quick view of how much you have sold per item and gross profit.
            </p>
          </DialogHeader>
          <div className="border rounded-sm max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-[#5e6977] hover:bg-[#5e6977]">
                <TableRow className="hover:bg-[#5e6977] border-none">
                  <TableHead className="whitespace-nowrap text-white text-xs font-medium h-9">Item</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-white text-xs font-medium h-9">Qty Sold</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-white text-xs font-medium h-9">Total Cost</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-white text-xs font-medium h-9">Total Selling</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-white text-xs font-medium h-9">GP Amount</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-white text-xs font-medium h-9">GP %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesReportLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 mr-2 inline-block animate-spin" />
                      Loading sales...
                    </TableCell>
                  </TableRow>
                ) : salesReportRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-sm text-muted-foreground">
                      No sales data found.
                    </TableCell>
                  </TableRow>
                ) : (
                  salesReportRows.map((row, index) => (
                    <TableRow
                      key={row.itemName}
                      className={index % 2 === 0 ? "bg-white" : "bg-gray-50/60"}
                    >
                      <TableCell className="font-medium text-sm">{row.itemName}</TableCell>
                      <TableCell className="text-right text-sm">{row.totalQty}</TableCell>
                      <TableCell className="text-right text-sm">
                        R{" "}
                        {Number(row.totalCost || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        R{" "}
                        {Number(row.totalSelling || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        R{" "}
                        {Number(row.gpAmount || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {Number(row.gpPercent || 0).toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={purchasesReportOpen}
        onOpenChange={(open) => {
          setPurchasesReportOpen(open);
          if (!open) {
            setPurchasesReportRows([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Purchases By Item
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Quick view of how much you have purchased per item from suppliers.
            </p>
          </DialogHeader>
          <div className="border rounded-sm max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader className="bg-[#5e6977] hover:bg-[#5e6977]">
                <TableRow className="hover:bg-[#5e6977] border-none">
                  <TableHead className="whitespace-nowrap text-white text-xs font-medium h-9">Item</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-white text-xs font-medium h-9">Qty Purchased</TableHead>
                  <TableHead className="text-right whitespace-nowrap text-white text-xs font-medium h-9">Total Purchases</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasesReportLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 mr-2 inline-block animate-spin" />
                      Loading purchases...
                    </TableCell>
                  </TableRow>
                ) : purchasesReportRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-sm text-muted-foreground">
                      No purchase data found.
                    </TableCell>
                  </TableRow>
                ) : (
                  purchasesReportRows.map((row, index) => (
                    <TableRow
                      key={row.itemName}
                      className={index % 2 === 0 ? "bg-white" : "bg-gray-50/60"}
                    >
                      <TableCell className="font-medium text-sm">{row.itemName}</TableCell>
                      <TableCell className="text-right text-sm">{row.totalQty}</TableCell>
                      <TableCell className="text-right text-sm">
                        R{" "}
                        {Number(row.totalPurchases || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleItemImageUpload}
      />


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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleDeactivate}
              disabled={isDeactivating || !deactivateReason.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white"
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
      <Dialog open={adjustmentOpen} onOpenChange={setAdjustmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Inventory Stock</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded text-sm text-blue-800">
              <p className="font-medium">Adjustment Rules:</p>
              <ul className="list-disc pl-4 mt-1 space-y-1">
                <li>Positive value (+): Increases stock (Debit Inventory, Credit <b>Inventory Gain</b>)</li>
                <li>Negative value (-): Decreases stock (Credit Inventory, Debit <b>Inventory Loss</b>)</li>
              </ul>
            </div>
            
            <div>
              <Label>Product</Label>
              <Input value={adjustmentProduct?.name || ''} disabled />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Current Qty</Label>
                <Input value={adjustmentProduct?.quantity_on_hand || 0} disabled />
              </div>
              <div>
                <Label>Qty Change (+/-) *</Label>
                <Input 
                  type="number" 
                  step="any" 
                  placeholder="+10 or -5"
                  value={adjustmentForm.quantityChange} 
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, quantityChange: e.target.value })} 
                  required 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cost Price (R) *</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  value={adjustmentForm.costPrice} 
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, costPrice: e.target.value })} 
                  required 
                />
              </div>
              <div>
                <Label>Date *</Label>
                <Input 
                  type="date" 
                  value={adjustmentForm.date} 
                  onChange={(e) => setAdjustmentForm({ ...adjustmentForm, date: e.target.value })} 
                  required 
                />
              </div>
            </div>

            <div>
              <Label>Reason *</Label>
              <Textarea 
                value={adjustmentForm.reason} 
                onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} 
                placeholder="e.g., Stock take correction, Damaged goods, Found inventory"
                required 
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdjustmentOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-primary">Post Adjustment</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={stockWarningOpen} onOpenChange={setStockWarningOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {stockWarningMessage.toLowerCase().includes("delete") ? "Cannot Delete Item" : "Action Blocked"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-gray-700">
            {stockWarningMessage.split('\n').map((line, i) => (
              <p key={i} className={i > 0 ? "mt-2 font-medium" : ""}>{line}</p>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setStockWarningOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={importOpen} onOpenChange={(open) => { if (!isImporting) setImportOpen(open); }}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-600" />
                {importMode === 'inventory' ? 'Import Inventory (Opening Stock)' : 'Import Services'}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {importMode === 'inventory' ? 'Inventory import' : 'Service import'}
                </span>
                {!isImporting && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownloadTemplate}
                    className="text-xs h-7 gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    <Download className="h-3 w-3" />
                    Template
                  </Button>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
             {/* Instructions Panel */}
             <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 space-y-2">
               <div className="font-semibold flex items-center gap-2">
                 <FileText className="h-4 w-4" />
                 {importMode === 'inventory' ? 'Inventory CSV format' : 'Service CSV format'}
               </div>
               <p>
                 Ensure your file has the following columns (case-sensitive):
               </p>
               <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] bg-white/50 p-2 rounded">
                 <span>Code</span>
                 <span>Description</span>
                 <span>Category</span>
                 <span>Price Excl.</span>
                 <span>Price Incl.</span>
                 {importMode === 'inventory' && <span>Last Cost</span>}
                 {importMode === 'inventory' && <span>Qty On Hand</span>}
                 <span>Active</span>
               </div>
               {importMode === 'inventory' ? (
                 <p className="text-[10px] text-blue-600 mt-1">
                   * Code → SKU, Description → Name<br />
                   * Qty On Hand × Last Cost will post opening inventory against Opening Equity.
                 </p>
               ) : (
                 <p className="text-[10px] text-blue-600 mt-1">
                   * Code → SKU, Description → Service Name<br />
                   * Qty On Hand and Last Cost are ignored. Only selling price is used, no accounting entry is posted now.
                 </p>
               )}
             </div>

             {/* Progress Bar */}
             {isImporting && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Importing...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                </div>
             )}

             {/* Log Window */}
             <div className="h-[120px] overflow-y-auto border rounded-md bg-slate-50 p-2 space-y-1 font-mono text-xs">
               {importLogs.length === 0 ? (
                 <div className="text-gray-400 italic text-center mt-10">Waiting for file...</div>
               ) : (
                 importLogs.map((log, i) => (
                   <div key={i} className={`flex items-start gap-2 p-1.5 rounded ${
                     log.type === 'error' ? 'bg-red-50 text-red-700' :
                     log.type === 'success' ? 'bg-green-50 text-green-700' :
                     log.type === 'warning' ? 'bg-amber-50 text-amber-700' :
                     'text-gray-600'
                   }`}>
                     {log.type === 'success' && <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                     {log.type === 'error' && <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                     {log.type === 'warning' && <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                     {log.type === 'info' && <Loader2 className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isImporting ? 'animate-spin' : ''}`} />}
                     <span>{log.message}</span>
                   </div>
                 ))
               )}
             </div>
          </div>

          <DialogFooter>
             <Button 
               variant="outline" 
               onClick={() => setImportOpen(false)} 
               disabled={isImporting}
             >
               Close
             </Button>
             {!isImporting && (
               <Button onClick={triggerFileSelect} className="gap-2">
                 <Upload className="h-4 w-4" />
                 Select File
               </Button>
             )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
