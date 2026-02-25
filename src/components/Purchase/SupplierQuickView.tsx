import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Mail, Phone, Smartphone, Edit, FileText, Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface SupplierQuickViewProps {
  supplierId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SupplierQuickView = ({ supplierId, open, onOpenChange }: SupplierQuickViewProps) => {
  const [supplier, setSupplier] = useState<any>(null);
  const [stats, setStats] = useState({
    balance: 0,
    purchasesYTD: 0,
    outstandingPOs: 0,
    outstandingPOsValue: 0
  });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [agingData, setAgingData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const contentRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open && supplierId) {
      loadData(supplierId);
    }
  }, [open, supplierId]);

  const loadData = async (id: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
      if (!profile?.company_id) return;
      const companyId = profile.company_id;

      // 1. Fetch Supplier Details
      const { data: supp } = await supabase.from("suppliers").select("*").eq("id", id).single();
      setSupplier(supp);

      // 2. Fetch Transactions (POs as Invoices, Payments)
      const { data: pos } = await supabase
        .from("purchase_orders")
        .select("id, po_number, po_date, total_amount, status")
        .eq("company_id", companyId)
        .eq("supplier_id", id)
        .neq("status", "draft")
        .neq("status", "cancelled")
        .order("po_date", { ascending: false });

      const poNumbers = (pos || []).map(p => p.po_number);
      let payments: any[] = [];
      if (poNumbers.length > 0) {
        const { data: pays } = await supabase
          .from("transactions")
          .select("id, transaction_date, reference_number, total_amount, transaction_type, description")
          .eq("company_id", companyId)
          .in("reference_number", poNumbers)
          .in("transaction_type", ["payment", "bill_payment", "credit_note"]);
        payments = pays || [];
      }

      // 3. Calculate Stats & Aging
      let balance = 0;
      let purchasesYTD = 0;
      let outstandingPOs = 0;
      let outstandingPOsValue = 0;
      const currentYear = new Date().getFullYear();
      
      // Aging Buckets
      let current = 0;
      let d30 = 0;
      let d60 = 0;
      let d90 = 0;
      let d120 = 0;

      // Process POs (Invoices)
      const processedTxns: any[] = [];

      (pos || []).forEach(po => {
        const poPayments = payments.filter(p => p.reference_number === po.po_number);
        const paid = poPayments.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
        const total = Number(po.total_amount || 0);
        const outstanding = Math.max(0, total - paid);
        
        balance += outstanding;

        if (new Date(po.po_date).getFullYear() === currentYear) {
          purchasesYTD += total;
        }

        if (po.status === 'placed order' || po.status === 'open') {
           outstandingPOs++;
           outstandingPOsValue += outstanding;
        }

        // Aging
        if (outstanding > 0.01) {
            const days = Math.floor((new Date().getTime() - new Date(po.po_date).getTime()) / (1000 * 3600 * 24));
            if (days <= 30) current += outstanding;
            else if (days <= 60) d30 += outstanding;
            else if (days <= 90) d60 += outstanding;
            else if (days <= 120) d90 += outstanding;
            else d120 += outstanding;
        }

        // Add to txn list
        processedTxns.push({
            id: po.id,
            date: po.po_date,
            type: 'Supplier Invoice',
            reference: po.po_number,
            amount: total,
            outstanding: outstanding,
            status: po.status
        });
        
        // Add payments to txn list
        poPayments.forEach(pay => {
            processedTxns.push({
                id: pay.id,
                date: pay.transaction_date,
                type: 'Payment',
                reference: pay.reference_number,
                amount: -Number(pay.total_amount), // Negative for payment
                outstanding: 0,
                status: 'Paid'
            });
        });
      });

      // Sort txns by date desc
      processedTxns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(processedTxns);

      setStats({
        balance,
        purchasesYTD,
        outstandingPOs,
        outstandingPOsValue
      });

      setAgingData([
        { name: '120+ Days', value: d120 },
        { name: '90 Days', value: d90 },
        { name: '60 Days', value: d60 },
        { name: '30 Days', value: d30 },
        { name: 'Current', value: current },
      ]);

      // 4. Purchase History (Monthly)
      const historyMap: Record<string, number> = {};
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      // Initialize
      months.forEach(m => {
          historyMap[`${m} ${currentYear}`] = 0;
          historyMap[`${m} ${currentYear - 1}`] = 0;
      });

      (pos || []).forEach(po => {
          const d = new Date(po.po_date);
          const m = months[d.getMonth()];
          const y = d.getFullYear();
          if (y === currentYear || y === currentYear - 1) {
              historyMap[`${m} ${y}`] = (historyMap[`${m} ${y}`] || 0) + Number(po.total_amount);
          }
      });

      const historyChartData = months.map(m => ({
          name: m,
          thisYear: historyMap[`${m} ${currentYear}`] || 0,
          lastYear: historyMap[`${m} ${currentYear - 1}`] || 0
      }));
      setPurchaseHistory(historyChartData);

    } catch (error) {
      console.error("Error loading supplier details:", error);
      toast({ title: "Error", description: "Failed to load supplier details", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(val);

  const handleDownloadPDF = async () => {
    if (!contentRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`${supplier?.name || 'Supplier'}_Report.pdf`);
      
      toast({ title: "Success", description: "Report downloaded successfully." });
    } catch (error) {
      console.error("PDF download failed", error);
      toast({ title: "Error", description: "Failed to download PDF.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  if (!supplierId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-full h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50/50 rounded-xl border-none shadow-2xl">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden" ref={contentRef}>
            {/* Top Navigation Bar */}
            <div className="bg-[#2c3e50] text-white px-6 py-3 flex justify-between items-center shrink-0 shadow-md z-10">
               <div className="flex items-center gap-4">
                  <DialogTitle className="text-lg font-bold tracking-wide text-white">Supplier Quick View</DialogTitle>
                  <div className="h-6 w-px bg-white/20"></div>
                  <div className="text-sm text-white/80">{supplier?.name}</div>
               </div>
               <div className="flex items-center gap-3">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-white hover:bg-white/10 hover:text-white"
                    onClick={handleDownloadPDF} 
                    disabled={downloading}
                  >
                     {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                     Download Report
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-white hover:bg-white/10 hover:text-white rounded-full"
                    onClick={() => onOpenChange(false)}
                  >
                     <span className="sr-only">Close</span>
                     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </Button>
               </div>
            </div>

            {/* Header Section */}
            <div className="bg-white border-b px-6 py-4 shrink-0">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-slate-800">{supplier?.name}</h2>
                  <Button variant="link" className="h-auto p-0 text-blue-600 text-xs" onClick={() => toast({ title: "Edit", description: "Edit supplier not implemented in this view" })}>
                    <Edit className="h-3 w-3 mr-1" /> Edit this supplier
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground uppercase tracking-wide font-medium">Balance</div>
                    <div className="text-2xl font-bold text-orange-500">{formatCurrency(stats.balance)}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                <div className="space-y-1">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24">Contact Name:</span>
                    <span className="font-medium">{supplier?.contact_person || "-"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24">Email:</span>
                    <a href={`mailto:${supplier?.email}`} className="text-blue-600 hover:underline">{supplier?.email || "-"}</a>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24">Telephone:</span>
                    <span>{supplier?.phone || "-"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between border-b border-dashed border-slate-200 pb-1">
                    <span className="text-muted-foreground">Amount Outstanding:</span>
                    <span className="font-medium">{formatCurrency(stats.balance)}</span>
                  </div>
                  <div className="flex justify-between border-b border-dashed border-slate-200 pb-1">
                    <span className="text-muted-foreground">Purchases this year:</span>
                    <span className="font-medium">{formatCurrency(stats.purchasesYTD)}</span>
                  </div>
                  <div className="flex justify-between border-b border-dashed border-slate-200 pb-1">
                    <span className="text-muted-foreground">Total PO's Outstanding:</span>
                    <span className="font-medium">{stats.outstandingPOs}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Value of Outstanding PO's:</span>
                    <span className="font-medium">{formatCurrency(stats.outstandingPOsValue)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Section */}
            <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
              <Tabs defaultValue="overview" className="flex-1 flex flex-col">
                <div className="px-6 pt-4 bg-white border-b">
                  <TabsList className="bg-transparent p-0 h-auto space-x-6">
                    <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent px-0 py-2 data-[state=active]:border-primary data-[state=active]:shadow-none bg-transparent">Overview</TabsTrigger>
                    <TabsTrigger value="unpaid" className="rounded-none border-b-2 border-transparent px-0 py-2 data-[state=active]:border-primary data-[state=active]:shadow-none bg-transparent">Unpaid Invoices</TabsTrigger>
                    <TabsTrigger value="all" className="rounded-none border-b-2 border-transparent px-0 py-2 data-[state=active]:border-primary data-[state=active]:shadow-none bg-transparent">All Transactions</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <TabsContent value="overview" className="m-0 h-full space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Recent Transactions */}
                      <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <h3 className="font-semibold mb-4 text-slate-700">Recent Transactions</h3>
                        <div className="space-y-3">
                          {transactions.slice(0, 5).map((txn) => (
                            <div key={txn.id} className="flex justify-between items-center text-sm py-2 border-b last:border-0 border-slate-100">
                              <div className="flex gap-3">
                                <span className="text-blue-600 cursor-pointer hover:underline text-xs">detail</span>
                                <span className="text-slate-500">{new Date(txn.date).toLocaleDateString()}</span>
                                <span className="font-medium text-slate-700">{txn.type}</span>
                              </div>
                              <span className="font-mono">{formatCurrency(Math.abs(txn.amount))}</span>
                            </div>
                          ))}
                          {transactions.length === 0 && <div className="text-muted-foreground text-sm italic">No recent transactions</div>}
                        </div>
                      </div>

                      {/* Quick Reports & Links */}
                      <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <h3 className="font-semibold mb-4 text-slate-700">Quick Reports</h3>
                        <div className="space-y-2">
                          <Button variant="link" className="h-auto p-0 text-blue-600 justify-start" onClick={() => toast({ title: "Coming Soon", description: "Supplier Statement report" })}>
                            Supplier Statement
                          </Button>
                          <br />
                          <Button variant="link" className="h-auto p-0 text-blue-600 justify-start" onClick={() => toast({ title: "Coming Soon", description: "Supplier Purchases report" })}>
                            Supplier Purchases
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Purchase History Graph */}
                      <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-semibold text-slate-700">Supplier Purchase History</h3>
                          <Button variant="link" className="text-xs h-auto p-0">Show Settings</Button>
                        </div>
                        <div className="h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={purchaseHistory}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                              <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `R${val/1000}k`} />
                              <Tooltip 
                                formatter={(val: number) => formatCurrency(val)}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                              />
                              <Bar dataKey="lastYear" name="Last Year" fill="#94a3b8" radius={[2, 2, 0, 0]} />
                              <Bar dataKey="thisYear" name="This Year" fill="#22c55e" radius={[2, 2, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex justify-center gap-4 mt-2 text-xs">
                           <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-400 rounded-sm"></div> Last Year</div>
                           <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> This Year</div>
                        </div>
                      </div>

                      {/* Days Outstanding Graph */}
                      <div className="bg-white p-4 rounded-lg border shadow-sm">
                        <h3 className="font-semibold mb-4 text-slate-700">Supplier Days Outstanding</h3>
                        <div className="h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={agingData} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" width={80} fontSize={11} tickLine={false} axisLine={false} />
                              <Tooltip formatter={(val: number) => formatCurrency(val)} cursor={{fill: 'transparent'}} />
                              <Bar dataKey="value" fill="#22c55e" barSize={20} radius={[0, 4, 4, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="unpaid" className="m-0">
                    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Ref</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Original</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.filter(t => t.outstanding > 0.01).map((txn) => (
                            <TableRow key={txn.id}>
                              <TableCell>{new Date(txn.date).toLocaleDateString()}</TableCell>
                              <TableCell>{txn.reference}</TableCell>
                              <TableCell>{txn.type}</TableCell>
                              <TableCell className="text-right">{formatCurrency(txn.amount)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(txn.outstanding)}</TableCell>
                            </TableRow>
                          ))}
                          {transactions.filter(t => t.outstanding > 0.01).length === 0 && (
                            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No unpaid invoices</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="all" className="m-0">
                    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Ref</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.map((txn) => (
                            <TableRow key={txn.id}>
                              <TableCell>{new Date(txn.date).toLocaleDateString()}</TableCell>
                              <TableCell><Badge variant="outline">{txn.type}</Badge></TableCell>
                              <TableCell>{txn.reference}</TableCell>
                              <TableCell className={cn("text-right font-mono", txn.amount < 0 ? "text-green-600" : "")}>
                                {formatCurrency(txn.amount)}
                              </TableCell>
                              <TableCell className="text-right text-xs">{txn.status}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
