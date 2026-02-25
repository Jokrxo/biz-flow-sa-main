import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { ArrowLeft, Printer, FileDown } from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PurchaseItem {
  id: string;
  date: string;
  documentNo: string;
  supplier: string;
  qtyPurchased: number;
  unitPrice: number;
  totalPurchases: number;
  itemName: string;
  itemId: string;
}

export const PurchasesByItemReport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, PurchaseItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompany() {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
      if (data?.company_id) setCompanyId(data.company_id);
    }
    fetchCompany();
  }, [user]);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Fetch Purchase Orders
      const { data: pos } = await supabase
        .from("purchase_orders")
        .select("id, po_number, po_date, supplier:suppliers(name), status")
        .eq("company_id", companyId)
        .in("status", ["sent", "processed", "partially_paid", "paid"]); // Valid purchases

      if (!pos?.length) {
        setData({});
        setLoading(false);
        return;
      }

      const poIds = pos.map(p => p.id);
      const poMap = new Map(pos.map(p => [p.id, p]));

      // Fetch Purchase Order Items
      // Assuming table is purchase_order_items or po_items. Standard is purchase_order_items.
      const { data: poItems } = await supabase
        .from("purchase_order_items")
        .select("*, item:items(name, sku)")
        .in("purchase_order_id", poIds); // Adjust foreign key if needed (po_id vs purchase_order_id)

      // Process Data
      const groupedData: Record<string, PurchaseItem[]> = {};

      poItems?.forEach((item: any) => {
        const po = poMap.get(item.purchase_order_id);
        if (!po) return;

        // If item relation exists use it, otherwise use description if available, else Unknown
        const itemName = item.item?.name || item.description || "Unknown Item";
        const unitPrice = item.unit_price || 0;
        const qty = item.quantity || 0;
        const totalPurchases = unitPrice * qty;

        // @ts-ignore
        const supplierName = po.supplier?.name || "Unknown Supplier";

        const purchaseItem: PurchaseItem = {
          id: item.id,
          date: po.po_date,
          documentNo: po.po_number,
          supplier: supplierName,
          qtyPurchased: qty,
          unitPrice: unitPrice,
          totalPurchases: totalPurchases,
          itemName: itemName,
          itemId: item.item_id || item.id // Fallback
        };

        if (!groupedData[itemName]) {
          groupedData[itemName] = [];
        }
        groupedData[itemName].push(purchaseItem);
      });

      setData(groupedData);

    } catch (error) {
      console.error("Error fetching purchase report:", error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text("Purchases By Item Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 28);
    
    let yPos = 35;

    Object.entries(data).forEach(([itemName, items]) => {
       doc.setFont("helvetica", "bold");
       doc.text(itemName, 14, yPos);
       yPos += 5;

       const tableColumn = ["Date", "Doc No", "Supplier", "Qty", "Unit Price", "Total"];
       const tableRows = items.map(item => [
         item.date,
         item.documentNo,
         item.supplier,
         item.qtyPurchased.toString(),
         item.unitPrice.toFixed(2),
         item.totalPurchases.toFixed(2)
       ]);

       autoTable(doc, {
         startY: yPos,
         head: [tableColumn],
         body: tableRows,
         theme: 'plain',
         styles: { fontSize: 8 },
         margin: { left: 14 }
       });

       // @ts-ignore
       yPos = doc.lastAutoTable.finalY + 10;
    });

    doc.save("PurchasesByItemReport.pdf");
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-800">Purchases By Item Report</h1>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" onClick={handleExportPDF}>
             <FileDown className="mr-2 h-4 w-4" /> PDF
           </Button>
           <Button variant="outline" onClick={handlePrint}>
             <Printer className="mr-2 h-4 w-4" /> Print
           </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="bg-gray-100 border-b">
          <div className="flex justify-between items-center">
             <div>
               <CardTitle className="text-lg">SuperCycle Wholesales</CardTitle>
               <p className="text-sm text-gray-500 mt-1">Purchases By Item Report</p>
             </div>
             <div className="text-right text-sm text-gray-500">
               <p>Date: {new Date().toLocaleDateString()}</p>
             </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {loading ? (
             <div className="text-center py-8">Loading...</div>
          ) : Object.keys(data).length === 0 ? (
             <div className="text-center py-8">No purchase data found</div>
          ) : (
             <div className="space-y-8">
               {Object.entries(data).map(([itemName, items]) => {
                 const totalQty = items.reduce((sum, i) => sum + i.qtyPurchased, 0);
                 const totalPurchases = items.reduce((sum, i) => sum + i.totalPurchases, 0);

                 return (
                   <div key={itemName} className="border rounded-lg overflow-hidden">
                     <div className="bg-blue-50 px-4 py-2 font-semibold text-blue-700 border-b border-blue-100">
                       {itemName}
                     </div>
                     <Table>
                       <TableHeader>
                         <TableRow className="bg-gray-50">
                           <TableHead>Date</TableHead>
                           <TableHead>Document No.</TableHead>
                           <TableHead>Supplier</TableHead>
                           <TableHead className="text-right">Qty Purchased</TableHead>
                           <TableHead className="text-right">Unit Price</TableHead>
                           <TableHead className="text-right">Total Purchases</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {items.map((item) => (
                           <TableRow key={item.id}>
                             <TableCell>{item.date}</TableCell>
                             <TableCell>{item.documentNo}</TableCell>
                             <TableCell>{item.supplier}</TableCell>
                             <TableCell className="text-right">{item.qtyPurchased}</TableCell>
                             <TableCell className="text-right">R {item.unitPrice.toFixed(2)}</TableCell>
                             <TableCell className="text-right">R {item.totalPurchases.toFixed(2)}</TableCell>
                           </TableRow>
                         ))}
                         <TableRow className="bg-gray-100 font-bold">
                           <TableCell colSpan={3}>Total for {itemName}</TableCell>
                           <TableCell className="text-right">{totalQty}</TableCell>
                           <TableCell className="text-right"></TableCell>
                           <TableCell className="text-right">R {totalPurchases.toFixed(2)}</TableCell>
                         </TableRow>
                       </TableBody>
                     </Table>
                   </div>
                 );
               })}
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
