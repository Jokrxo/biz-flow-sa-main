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

interface SalesItem {
  id: string;
  date: string;
  documentNo: string;
  customer: string;
  qtySold: number;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalSelling: number;
  gpAmount: number;
  gpPercent: number;
  itemName: string;
  itemId: string;
}

export const SalesByItemReport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, SalesItem[]>>({});
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
      // Fetch Invoices
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, customer_name, status")
        .eq("company_id", companyId)
        .in("status", ["sent", "paid", "partially_paid"]); // Assuming these are valid sales

      if (!invoices?.length) {
        setData({});
        setLoading(false);
        return;
      }

      const invoiceIds = invoices.map(i => i.id);
      const invoiceMap = new Map(invoices.map(i => [i.id, i]));

      // Fetch Invoice Items
      const { data: invoiceItems } = await supabase
        .from("invoice_items")
        .select("*, item:items(name, cost_price, sku)")
        .in("invoice_id", invoiceIds);

      // Process Data
      const groupedData: Record<string, SalesItem[]> = {};

      invoiceItems?.forEach((item: any) => {
        const invoice = invoiceMap.get(item.invoice_id);
        if (!invoice) return;

        const itemName = item.item?.name || "Unknown Item";
        // Use cost from item definition (current cost) as fallback if not stored on line
        // Ideally, we should store cost_at_sale on invoice_items
        const unitCost = item.item?.cost_price || 0; 
        const unitPrice = item.unit_price || 0;
        const qty = item.quantity || 0;
        const totalSelling = unitPrice * qty;
        const totalCost = unitCost * qty;
        const gpAmount = totalSelling - totalCost;
        const gpPercent = totalSelling ? (gpAmount / totalSelling) * 100 : 0;

        const salesItem: SalesItem = {
          id: item.id,
          date: invoice.invoice_date,
          documentNo: invoice.invoice_number,
          customer: invoice.customer_name || "Unknown",
          qtySold: qty,
          unitCost: unitCost,
          unitPrice: unitPrice,
          totalCost: totalCost,
          totalSelling: totalSelling,
          gpAmount: gpAmount,
          gpPercent: gpPercent,
          itemName: itemName,
          itemId: item.item_id
        };

        if (!groupedData[itemName]) {
          groupedData[itemName] = [];
        }
        groupedData[itemName].push(salesItem);
      });

      setData(groupedData);

    } catch (error) {
      console.error("Error fetching sales report:", error);
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
    doc.text("Sales By Item Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 28);
    
    let yPos = 35;

    Object.entries(data).forEach(([itemName, items]) => {
       doc.setFont("helvetica", "bold");
       doc.text(itemName, 14, yPos);
       yPos += 5;

       const tableColumn = ["Date", "Doc No", "Customer", "Qty", "Cost", "Selling", "GP", "GP%"];
       const tableRows = items.map(item => [
         item.date,
         item.documentNo,
         item.customer,
         item.qtySold.toString(),
         item.totalCost.toFixed(2),
         item.totalSelling.toFixed(2),
         item.gpAmount.toFixed(2),
         item.gpPercent.toFixed(2) + '%'
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

    doc.save("SalesByItemReport.pdf");
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-800">Sales By Item Report</h1>
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
               <p className="text-sm text-gray-500 mt-1">Sales By Item Report</p>
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
             <div className="text-center py-8">No sales data found</div>
          ) : (
             <div className="space-y-8">
               {Object.entries(data).map(([itemName, items]) => {
                 const totalQty = items.reduce((sum, i) => sum + i.qtySold, 0);
                 const totalCost = items.reduce((sum, i) => sum + i.totalCost, 0);
                 const totalSelling = items.reduce((sum, i) => sum + i.totalSelling, 0);
                 const totalGP = items.reduce((sum, i) => sum + i.gpAmount, 0);
                 const avgGPPercent = totalSelling ? (totalGP / totalSelling) * 100 : 0;

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
                           <TableHead>Customer</TableHead>
                           <TableHead className="text-right">Qty Sold</TableHead>
                           <TableHead className="text-right">Total Cost</TableHead>
                           <TableHead className="text-right">Total Selling</TableHead>
                           <TableHead className="text-right">GP Amount</TableHead>
                           <TableHead className="text-right">GP %</TableHead>
                         </TableRow>
                       </TableHeader>
                       <TableBody>
                         {items.map((item) => (
                           <TableRow key={item.id}>
                             <TableCell>{item.date}</TableCell>
                             <TableCell>{item.documentNo}</TableCell>
                             <TableCell>{item.customer}</TableCell>
                             <TableCell className="text-right">{item.qtySold}</TableCell>
                             <TableCell className="text-right">R {item.totalCost.toFixed(2)}</TableCell>
                             <TableCell className="text-right">R {item.totalSelling.toFixed(2)}</TableCell>
                             <TableCell className="text-right">R {item.gpAmount.toFixed(2)}</TableCell>
                             <TableCell className="text-right">{item.gpPercent.toFixed(2)}%</TableCell>
                           </TableRow>
                         ))}
                         <TableRow className="bg-gray-100 font-bold">
                           <TableCell colSpan={3}>Total for {itemName}</TableCell>
                           <TableCell className="text-right">{totalQty}</TableCell>
                           <TableCell className="text-right">R {totalCost.toFixed(2)}</TableCell>
                           <TableCell className="text-right">R {totalSelling.toFixed(2)}</TableCell>
                           <TableCell className="text-right">R {totalGP.toFixed(2)}</TableCell>
                           <TableCell className="text-right">{avgGPPercent.toFixed(2)}%</TableCell>
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
