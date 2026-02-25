import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info, ChevronDown, FileSpreadsheet } from "lucide-react";
import { PurchaseOverview } from "@/components/Purchase/PurchaseOverview";
import { PurchaseOrders } from "@/components/Purchase/PurchaseOrders";
import { SupplierInvoice } from "@/components/Purchase/SupplierInvoice";
import { Suppliers } from "@/components/Purchase/Suppliers";
import { APDashboard } from "@/components/Purchase/APDashboard";
import { Assets } from "@/components/Purchase/Assets";
import { AssetsPurchaseGraph } from "@/components/Purchase/AssetsPurchaseGraph";
import { CreditorsControlReport } from "@/components/Purchase/CreditorsControlReport";
import { CreditorsPerSupplierReport } from "@/components/Purchase/CreditorsPerSupplierReport";
import { PaymentReport } from "@/components/Purchase/PaymentReport";
import { ReturnReport } from "@/components/Purchase/ReturnReport";
import { CSVImportDialog, ImportType } from "@/components/Purchase/CSVImportDialog";
import { useAuth } from "@/context/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useTutorial } from "@/components/Tutorial/TutorialGuide";
import { purchaseTutorialSteps } from "@/data/purchaseTutorialSteps";

export default function PurchasePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { startTutorial } = useTutorial();

  useEffect(() => {
    startTutorial("Purchase", purchaseTutorialSteps);
  }, [startTutorial]);

  const [activeTab, setActiveTab] = useState("suppliers");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<"purchase" | "assets" | "creditors" | "creditors-supplier" | "payment" | "return">("purchase");
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState<ImportType>("supplier");
  const { user } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(1);

  const totalHelpSteps = 10;

  const nextHelpStep = () => {
    setHelpStep((prev) => (prev < totalHelpSteps ? prev + 1 : prev));
  };

  const prevHelpStep = () => {
    setHelpStep((prev) => (prev > 1 ? prev - 1 : prev));
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <>
      <SEO title="Purchase | Rigel Business" description="Manage purchase orders, expenses, transactions, and suppliers" />
      <DashboardLayout>
        <div className="space-y-6" id="PurchaseModuleContainer">
          <div className="flex items-center justify-between pb-6 border-b" id="PurchaseHeader">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Purchase</h1>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                aria-label="Purchase module help"
                onClick={() => setHelpOpen(true)}
              >
                <Info className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9 gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Import CSV
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setImportType("supplier"); setImportOpen(true); }}>
                    Import Suppliers
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setImportType("purchase-order"); setImportOpen(true); }}>
                    Import Purchase Orders
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setImportType("invoice"); setImportOpen(true); }}>
                    Import Invoices
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setImportType("asset"); setImportOpen(true); }}>
                    Import Assets
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-9">
                    View Reports <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => { setReportType("purchase"); setReportOpen(true); }}>
                    Purchase Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setReportType("assets"); setReportOpen(true); }}>
                    Assets Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setReportType("creditors"); setReportOpen(true); }}>
                    Creditors Control (Detailed)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setReportType("creditors-supplier"); setReportOpen(true); }}>
                    Creditors Summary (Per Supplier)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setReportType("payment"); setReportOpen(true); }}>
                    Payment Report
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setReportType("return"); setReportOpen(true); }}>
                    Return Report
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Dialog
            open={helpOpen}
            onOpenChange={(open) => {
              setHelpOpen(open);
              if (!open) setHelpStep(1);
            }}
          >
            <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle>How to use Supplier Management (Purchase module)</DialogTitle>
                  <div className="flex items-center gap-2">
                    <img src="/logo.png" alt="System logo" className="h-7 w-auto rounded-sm shadow-sm" />
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Step {helpStep} of {totalHelpSteps}
                  </span>
                  <div className="flex gap-1">
                    {Array.from({ length: totalHelpSteps }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-4 rounded-full ${i + 1 === helpStep ? "bg-blue-600" : "bg-slate-200"}`}
                      />
                    ))}
                  </div>
                </div>

                {helpStep === 1 && (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                          Overview
                        </div>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Manage suppliers, purchase orders, supplier invoices and assets.</li>
                          <li>Track what you owe, when to pay and who you owe.</li>
                          <li>Import suppliers and purchases from CSV templates.</li>
                          <li>View creditors control and payment history reports.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Layout (preview)
                        </div>
                        <div className="space-y-2 text-[10px]">
                          <div className="h-6 rounded bg-slate-100 flex items-center px-2 text-slate-500">
                            Purchase
                          </div>
                          <div className="flex items-center gap-2 h-8">
                            <span className="px-2 py-0.5 rounded-full border text-slate-700 bg-white text-[10px]">
                              Import CSV ▾
                            </span>
                            <span className="px-2 py-0.5 rounded-full border text-slate-700 bg-white text-[10px]">
                              View Reports ▾
                            </span>
                          </div>
                          <div className="flex gap-3 text-slate-600">
                            <div className="flex-1 space-y-1">
                              <div className="h-6 rounded bg-slate-50 border border-dashed flex items-center px-2">
                                Tabs: Suppliers, Purchase Orders, Supplier Invoice, Assets
                              </div>
                              <div className="h-12 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                                Content area (table / forms)
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 2 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Suppliers tab – set up your suppliers
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the Suppliers tab to create and maintain supplier records.</li>
                          <li>Capture contact details, tax numbers and payment terms.</li>
                          <li>Imported suppliers will appear here after using Import CSV.</li>
                          <li>Suppliers link through to purchase orders, invoices and payments.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Suppliers tab (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px]">
                              List of Supplier
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                              Purchase Orders
                            </span>
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center">
                            Supplier table (Name, Contact, Balance)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 3 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Purchase Orders tab – control what you are ordering
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Create purchase orders for stock and services before the invoice arrives.</li>
                          <li>Track order status and link orders to supplier invoices later.</li>
                          <li>Use the table filters to see open vs completed orders.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Purchase Orders (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            New Order button • Search • Status filter
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Orders table (PO No, Supplier, Date, Status, Total)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 4 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Supplier Invoice tab – capture bills from suppliers
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the Supplier Invoice tab to capture supplier bills and purchase orders.</li>
                          <li>Search and filter invoices by supplier, status or date.</li>
                          <li>Click a document number to download a PDF copy.</li>
                          <li>Use batch actions to select multiple invoices for export or printing.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Supplier invoices (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Search box • Status filter • Refresh • Import • Download
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Invoices table (Supplier, Doc No, Date, Total, Amount Due, Status)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 5 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Create a new supplier invoice
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Open the Supplier Invoice tab.</li>
                          <li>Click the button to create a new supplier invoice (when enabled in your layout).</li>
                          <li>Select the supplier, enter bill number, dates and notes.</li>
                          <li>Add line items as services or inventory, with quantities and unit prices.</li>
                        </ol>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Invoice form (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-10 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Supplier • Bill No • Dates
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Line items grid (Type, Item, Qty, Unit Price, Tax)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 6 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Record payments and use supplier credit
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the Pay dialog to record payments against unpaid invoices.</li>
                          <li>See available supplier deposits and credits before paying.</li>
                          <li>Apply credit first, then pay the remaining balance from the bank.</li>
                          <li>Ensure payment dates respect your locked financial periods.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Payment summary (preview)
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>Invoice amount</span>
                            <span className="font-medium">R 10 000.00</span>
                          </div>
                          <div className="flex justify-between text-emerald-600">
                            <span>Credit available</span>
                            <span className="font-medium">R 2 000.00</span>
                          </div>
                          <div className="flex justify-between border-t pt-1 mt-1">
                            <span>Remaining to pay</span>
                            <span className="font-semibold">R 8 000.00</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 7 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Handle supplier returns and credits
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the returns dialog to send goods or services back to suppliers.</li>
                          <li>Choose inventory vs service and specify quantities to return.</li>
                          <li>System calculates return amounts and posts them correctly.</li>
                          <li>Returned amounts affect the supplier balance and stock levels.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Return screen (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Filter: Inventory • Service
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Lines to return with Qty, Price and Total
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 8 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Import suppliers and purchases from CSV
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the Import CSV button to import suppliers, purchase orders, invoices or assets.</li>
                          <li>Choose the correct import type from the dropdown before selecting a file.</li>
                          <li>Download or follow the template description to match required columns.</li>
                          <li>Review import logs for any rows that failed or were skipped.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Import CSV (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px]">
                              Import Suppliers
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                              Import Purchase Orders
                            </span>
                          </div>
                          <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Drag & drop CSV area
                          </div>
                          <div className="bg-slate-50 rounded px-2 py-1">
                            <div className="text-[10px] font-medium">Example headers:</div>
                            <div className="text-[10px] text-slate-600">
                              Supplier Name, Document No, Date, Amount, Description
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 9 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Reports and creditors control
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>
                            Use <span className="font-semibold">View Reports</span> to open Accounts Payable, Assets,
                            Creditors and Payment reports.
                          </li>
                          <li>See outstanding balances per supplier and overall creditors position.</li>
                          <li>Use payment and return reports to explain movement in supplier balances.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Reports (preview)
                        </div>
                        <div className="space-y-1">
                          <div className="px-2 py-1 rounded border bg-slate-50 flex justify-between">
                            <span>Accounts Payable Report</span>
                            <span className="text-slate-400">Dashboard</span>
                          </div>
                          <div className="px-2 py-1 rounded border bg-slate-50 flex justify-between">
                            <span>Creditors per Supplier</span>
                            <span className="text-slate-400">Detail</span>
                          </div>
                          <div className="px-2 py-1 rounded border bg-slate-50 flex justify-between">
                            <span>Payment Report</span>
                            <span className="text-slate-400">History</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 10 && (
                  <div className="space-y-6">
                    <div className="flex flex-col items-center justify-center text-center space-y-3 py-4">
                      <img
                        src="/logo.png"
                        alt="System logo"
                        className="h-12 w-auto rounded-md shadow-sm mb-1"
                      />
                      <div className="text-lg font-semibold text-slate-900">
                        Thank you
                      </div>
                      <p className="max-w-md text-sm text-slate-600">
                        We hope this Supplier Management tutorial makes your purchase workflows clearer and faster.
                        We look forward to working with you for the next couple of years and beyond.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700 disabled:opacity-40"
                    onClick={prevHelpStep}
                    disabled={helpStep === 1}
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700"
                      onClick={() => setHelpOpen(false)}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-40"
                      onClick={helpStep === totalHelpSteps ? () => setHelpOpen(false) : nextHelpStep}
                    >
                      {helpStep === totalHelpSteps
                        ? "Close"
                        : helpStep === totalHelpSteps - 1
                        ? "Finish"
                        : "Next"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-[10px] text-slate-400 text-right">
                  stella-lumen
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start h-auto bg-transparent p-0 border-b rounded-none space-x-8 mb-8">
              <TabsTrigger 
                id="Tab_ListOfSupplier"
                value="suppliers"
                className="rounded-none border-b-2 border-transparent px-0 py-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-none"
              >
                List of Supplier
              </TabsTrigger>
              <TabsTrigger 
                id="Tab_PurchaseOrders"
                value="orders"
                className="rounded-none border-b-2 border-transparent px-0 py-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-none"
              >
                Purchase Orders
              </TabsTrigger>
              <TabsTrigger 
                id="Tab_SupplierInvoice"
                value="invoices"
                className="rounded-none border-b-2 border-transparent px-0 py-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-none"
              >
                Supplier Invoice
              </TabsTrigger>
              <TabsTrigger 
                id="Tab_Assets"
                value="assets"
                className="rounded-none border-b-2 border-transparent px-0 py-4 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-none"
              >
                Assets
              </TabsTrigger>
            </TabsList>



            <TabsContent value="suppliers">
              <Suppliers />
            </TabsContent>

            <TabsContent value="orders">
              <PurchaseOrders />
            </TabsContent>

            <TabsContent value="invoices">
              <SupplierInvoice />
            </TabsContent>

            <TabsContent value="assets">
              <Assets />
            </TabsContent>
          </Tabs>

          <Dialog open={reportOpen} onOpenChange={setReportOpen}>
            <DialogContent className="max-w-[90vw] h-[95vh] p-0 overflow-y-auto">
              <div className={(reportType === "creditors" || reportType === "creditors-supplier" || reportType === "payment" || reportType === "return") ? "h-full" : "p-6"}>
                <DialogHeader className={(reportType === "creditors" || reportType === "creditors-supplier" || reportType === "payment" || reportType === "return") ? "sr-only" : ""}>
                  <DialogTitle>
                    {reportType === "purchase" && "Accounts Payable Report"}
                    {reportType === "assets" && "Assets Purchase Report"}
                    {reportType === "creditors" && "Creditors Control Account"}
                    {reportType === "creditors-supplier" && "Creditors per Supplier"}
                    {reportType === "payment" && "Payment Report"}
                    {reportType === "return" && "Return Report"}
                  </DialogTitle>
                </DialogHeader>
                <div className={(reportType === "creditors" || reportType === "creditors-supplier" || reportType === "payment" || reportType === "return") ? "h-full" : "mt-4"}>
                  {reportType === "purchase" && <APDashboard />}
                  {reportType === "assets" && <AssetsPurchaseGraph />}
                  {reportType === "creditors" && <CreditorsControlReport />}
                  {reportType === "creditors-supplier" && <CreditorsPerSupplierReport onCloseParent={() => setReportOpen(false)} />}
                  {reportType === "payment" && <PaymentReport onCloseParent={() => setReportOpen(false)} />}
                  {reportType === "return" && <ReturnReport onCloseParent={() => setReportOpen(false)} />}
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
