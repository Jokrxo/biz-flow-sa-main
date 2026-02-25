import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { ArrowLeft, Printer, FileDown, Mail } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Supplier {
  id: string;
  name: string;
  category?: string;
  phone?: string;
  outstanding_balance?: number;
  contact_person?: string; // Assuming this field exists or we map it
}

export const SupplierListingReport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
      // Fetch suppliers
      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("company_id", companyId)
        .order("name");
        
      if (suppliersError) throw suppliersError;

      // Fetch balances (simplified for report - ideally reuse logic from SupplierManagement)
      // For this report, let's try to get the balance if it's available in the table or calculate it
      // Reusing logic from SupplierManagement for consistency
      
      const { data: posData } = await supabase
        .from("purchase_orders")
        .select("supplier_id, total_amount, status, po_number")
        .eq("company_id", companyId)
        .in("status", ["sent", "processed", "partially_paid", "paid"]);

      const { data: transData } = await supabase
        .from("transactions")
        .select("reference_number, total_amount, transaction_type, description, supplier_id")
        .eq("company_id", companyId)
        .in("transaction_type", ["payment", "deposit"])
        .eq("status", "posted");

      const formatted = suppliersData.map((supplier: any) => {
         const supplierPOs = (posData || []).filter((p: any) => p.supplier_id === supplier.id);
         const totalLiability = supplierPOs.reduce((sum: number, p: any) => sum + (Number(p.total_amount) || 0), 0);
         
         const poRefs = new Set(supplierPOs.map((p: any) => p.po_number).filter(Boolean));
         const supplierNameLower = (supplier.name || "").toLowerCase();
         
         const supplierTrans = (transData || []).filter((t: any) => {
            if (t.supplier_id === supplier.id) return true;
            if (t.reference_number && poRefs.has(t.reference_number)) return true;
            if (t.reference_number && t.reference_number.includes(supplier.id)) return true;
            if (t.description && t.description.toLowerCase().includes(supplierNameLower)) return true;
            return false;
         });
         
         const totalPaid = supplierTrans.reduce((sum: number, t: any) => sum + (Number(t.total_amount) || 0), 0);
         const netBalance = totalLiability - totalPaid;

         return {
           ...supplier,
           outstanding_balance: netBalance,
           contact_person: supplier.contact_person || '' // Adjust field name if different
         };
       });
       
       setSuppliers(formatted);
    } catch (error) {
      console.error("Error fetching report data:", error);
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
    doc.text("Supplier Listing Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 28);
    
    const tableColumn = ["Name", "Category", "Active", "Contact Name", "Telephone", "Balance"];
    const tableRows = suppliers.map(s => {
      const isInactive = s.name.startsWith('[INACTIVE] ');
      const cleanName = isInactive ? s.name.replace('[INACTIVE] ', '') : s.name;
      return [
        cleanName,
        s.category || 'Local',
        isInactive ? 'No' : 'Yes',
        s.contact_person || '-',
        s.phone || '-',
        `R ${s.outstanding_balance?.toLocaleString('en-ZA', { minimumFractionDigits: 2 }) || '0.00'}`
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
    });

    doc.save("SupplierListingReport.pdf");
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-gray-800">Supplier Listing Report</h1>
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
               <p className="text-sm text-gray-500 mt-1">Supplier Listing Report</p>
             </div>
             <div className="text-right text-sm text-gray-500">
               <p>Date: {new Date().toLocaleDateString()}</p>
               <p>Page: 1/1</p>
             </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead>Contact Name</TableHead>
                <TableHead>Telephone</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">No suppliers found</TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => {
                  const isInactive = s.name.startsWith('[INACTIVE] ');
                  const cleanName = isInactive ? s.name.replace('[INACTIVE] ', '') : s.name;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{cleanName}</TableCell>
                      <TableCell>{s.category || 'Local'}</TableCell>
                      <TableCell className="text-center">{isInactive ? 'No' : 'Yes'}</TableCell>
                      <TableCell>{s.contact_person || '-'}</TableCell>
                      <TableCell>{s.phone || '-'}</TableCell>
                      <TableCell className="text-right">
                        R {s.outstanding_balance?.toLocaleString('en-ZA', { minimumFractionDigits: 2 }) || '0.00'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
