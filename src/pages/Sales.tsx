import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ChevronDown, FileSpreadsheet } from "lucide-react";
import { ARDashboard } from "@/components/Sales/ARDashboard";
import { SalesInvoices } from "@/components/Sales/SalesInvoices";
import { SalesQuotes } from "@/components/Sales/SalesQuotes";
import { SalesCustomers } from "@/components/Sales/SalesCustomers";
import { SalesReceipts } from "@/components/Sales/SalesReceipts";
import { QuotesReport } from "@/components/Sales/QuotesReport";
import { CSVImportDialog, ImportType } from "@/components/Sales/CSVImportDialog";
import { useAuth } from "@/context/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function SalesPage({ tab: initialTab }: { tab?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab) return initialTab;
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    return tabParam || "customers";
  });
  const [quotesReportOpen, setQuotesReportOpen] = useState(false);
  const [invoicesReportOpen, setInvoicesReportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState<ImportType>('customer');
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(() => {
    return new URLSearchParams(window.location.search).get('action') === 'create-receipt';
  });
  const { user } = useAuth();

  const handleImportClick = (type: ImportType) => {
    setImportType(type);
    setImportOpen(true);
  };

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
    
    // Handle create-receipt action
    const actionParam = new URLSearchParams(location.search).get('action');
    if (actionParam === 'create-receipt') {
      setActiveTab('receipts');
      setReceiptDialogOpen(true);
      // Clear the URL parameter after handling
      navigate('/sales?tab=receipts', { replace: true });
    }
  }, [location.search, activeTab, navigate]);

  return (
    <>
      <SEO title="Customer Management | Rigel Business" description="Manage revenue, invoices, and quotes" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-end justify-between pb-6 border-b">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Customer Management</h1>
              <p className="text-muted-foreground mt-1 text-sm">Manage your entire revenue pipeline, from quotes to payments</p>
            </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9">
                    View Report
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setQuotesReportOpen(true)}>
                    Quotes Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setInvoicesReportOpen(true)}>
                    Tax Invoice Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-9 gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Import CSV
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleImportClick('customer')}>
                    Import Customers
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => handleImportClick('quote')}>
                    Import Quotes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleImportClick('invoice')}>
                    Import Tax Invoices
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start h-auto bg-transparent p-0 border-b rounded-none space-x-8 mb-8">
              <TabsTrigger 
                value="customers"
                className="rounded-none border-b-2 border-transparent px-0 py-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-none"
              >
                Customers
              </TabsTrigger>
              <TabsTrigger 
                value="quotes"
                className="rounded-none border-b-2 border-transparent px-0 py-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-none"
              >
                Quotes
              </TabsTrigger>
              <TabsTrigger 
                value="invoices"
                className="rounded-none border-b-2 border-transparent px-0 py-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-none"
              >
                Tax Invoices
              </TabsTrigger>
              <TabsTrigger 
                value="receipts"
                className="rounded-none border-b-2 border-transparent px-0 py-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-none"
              >
                Receipts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="customers">
              <SalesCustomers />
            </TabsContent>

            <TabsContent value="quotes">
              <SalesQuotes />
            </TabsContent>

            <TabsContent value="invoices">
              <SalesInvoices />
            </TabsContent>

            <TabsContent value="receipts">
              <SalesReceipts 
                dialogOpen={receiptDialogOpen} 
                setDialogOpen={setReceiptDialogOpen} 
              />
            </TabsContent>
          </Tabs>

          <Dialog open={quotesReportOpen} onOpenChange={setQuotesReportOpen}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Quotes Report</DialogTitle>
                <DialogDescription>Performance overview and status distribution</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <QuotesReport />
              </div>
              <DialogFooter>
                <Button onClick={() => setQuotesReportOpen(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={invoicesReportOpen} onOpenChange={setInvoicesReportOpen}>
            <DialogContent className="max-w-[95vw] h-[95vh] p-0 overflow-y-auto">
              <div className="p-6">
                <DialogHeader>
                  <DialogTitle>Accounts Receivable Report</DialogTitle>
                </DialogHeader>
                <div className="mt-4">
                  <ARDashboard />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <CSVImportDialog 
            isOpen={importOpen} 
            onClose={() => setImportOpen(false)} 
            type={importType} 
          />
        </div>
      </DashboardLayout>
    </>
  );
}

