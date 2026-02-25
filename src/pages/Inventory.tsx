import { useState } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { InventoryManagement } from "@/components/Inventory/InventoryManagement";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, X } from "lucide-react";

export default function InventoryPage() {
  const [showSellingPriceBanner, setShowSellingPriceBanner] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(1);

  const totalHelpSteps = 6;

  const nextHelpStep = () => {
    setHelpStep((prev) => (prev < totalHelpSteps ? prev + 1 : prev));
  };

  const prevHelpStep = () => {
    setHelpStep((prev) => (prev > 1 ? prev - 1 : prev));
  };

  return (
    <>
      <SEO title="Inventory Management | Rigel Business" description="Manage your inventory and products" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">Inventory Management</h1>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 text-xs"
                aria-label="Inventory help"
                onClick={() => setHelpOpen(true)}
              >
                !
              </button>
            </div>
          </div>
          {showSellingPriceBanner && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <div className="mt-0.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="text-sm font-medium text-amber-900">
                  Set selling prices before customer transactions
                </div>
                <p className="text-xs text-amber-800">
                  Before you create quotes or invoices in the{" "}
                  <span className="font-semibold">Customer</span> module, make sure every product here has a correct
                  selling price.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSellingPriceBanner(false)}
                className="ml-2 mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-700 hover:bg-amber-100"
                aria-label="Dismiss selling price reminder"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <Dialog
            open={helpOpen}
            onOpenChange={(open) => {
              setHelpOpen(open);
              if (!open) setHelpStep(1);
            }}
          >
            <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle>How to use the Items / Inventory module</DialogTitle>
                  <div className="flex items-center gap-2">
                    <img
                      src="/logo.png"
                      alt="System logo"
                      className="h-7 w-auto rounded-sm shadow-sm"
                    />
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
                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                          Overview
                        </div>
                        <ul className="list-disc list-inside space-y-1">
                          <li>See all products and services in one place.</li>
                          <li>Post opening inventory balances against Opening Equity.</li>
                          <li>Import items from CSV / Excel (inventory or services).</li>
                          <li>Quickly see stock levels, costs and selling prices.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Screen layout (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-6 rounded bg-slate-100 flex items-center px-2 text-[10px] text-slate-500">
                            Inventory Management
                          </div>
                          <div className="h-8 rounded bg-slate-100 flex items-center gap-2 px-2 text-[10px] text-slate-600">
                            <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-semibold">
                              Add Item ▾
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                              Import ▾
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              Export ▾
                            </span>
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-500">
                            Items table (image preview)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 2 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Add services and opening stock
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>
                            Click <span className="font-semibold">Add Item ▾</span>.
                          </li>
                          <li>
                            Choose <span className="font-semibold">Add Service</span> to add non-stock services with a
                            selling price only.
                          </li>
                          <li>
                            Choose <span className="font-semibold">Add Opening Stock</span> to bring in quantities and
                            cost price. This posts to <span className="font-semibold">Inventory</span> and{" "}
                            <span className="font-semibold">Opening Equity / Share Capital</span>.
                          </li>
                          <li>
                            To add a brand new <span className="font-semibold">product</span>, go to{" "}
                            <span className="font-semibold">Supplier Management</span> instead.
                          </li>
                        </ol>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Add Item menu (preview)
                        </div>
                        <div className="space-y-1 text-[11px]">
                          <div className="rounded border px-2 py-1 bg-slate-50 flex justify-between">
                            <span>Add Product</span>
                            <span className="text-slate-400 text-[10px]">Go to Supplier Management</span>
                          </div>
                          <div className="rounded border px-2 py-1 bg-blue-50 flex justify-between">
                            <span>Add Service</span>
                            <span className="text-blue-500 text-[10px]">No stock, price only</span>
                          </div>
                          <div className="rounded border px-2 py-1 bg-slate-50 flex justify-between">
                            <span>Add Opening Stock</span>
                            <span className="text-slate-500 text-[10px]">Posts to Opening Equity</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 3 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Import inventory vs services
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>
                            Click <span className="font-semibold">Import ▾</span> and select{" "}
                            <span className="font-semibold">Inventory (Opening Stock)</span> to import stock quantities
                            and costs.
                          </li>
                          <li>
                            Inventory import behaves like the opening stock form: quantities and cost prices post to
                            Inventory and Opening Equity.
                          </li>
                          <li>
                            Select <span className="font-semibold">Services</span> to import non-stock services with
                            selling prices only (no stock, no immediate accounting entry).
                          </li>
                          <li>
                            Use the <span className="font-semibold">Template</span> button in the import dialog to see
                            the CSV layout.
                          </li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Import mode (preview)
                        </div>
                        <div className="space-y-2 text-[11px]">
                          <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-semibold">
                              Inventory (Opening Stock)
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              Services
                            </span>
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-500">
                            CSV columns preview (Code, Description, Category, Price, Qty, Active)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 4 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Use the items table
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>
                            Tick checkboxes on the left to enable bulk actions like{" "}
                            <span className="font-semibold">Delete</span> and{" "}
                            <span className="font-semibold">Mark As Active / Inactive</span>.
                          </li>
                          <li>
                            Click the <span className="font-semibold">item name</span> to open stock tracking (purchases,
                            sales, returns).
                          </li>
                          <li>
                            Click the <span className="font-semibold">Category</span> to switch between{" "}
                            <span className="font-semibold">Parts</span> and{" "}
                            <span className="font-semibold">Service</span>.
                          </li>
                          <li>
                            Use the coloured <span className="font-semibold">Stock Status</span> chip to see low or
                            healthy stock at a glance.
                          </li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Table (preview)
                        </div>
                        <div className="space-y-1 text-[10px]">
                          <div className="grid grid-cols-[24px,1fr,1fr,1fr,1fr] gap-1 text-slate-500 mb-1">
                            <span>✓</span>
                            <span>Item</span>
                            <span>Category</span>
                            <span>Qty</span>
                            <span>Status</span>
                          </div>
                          <div className="grid grid-cols-[24px,1fr,1fr,1fr,1fr] gap-1 items-center text-slate-700">
                            <span>□</span>
                            <span className="text-blue-600 underline-offset-2">Sample Item A</span>
                            <span className="text-blue-600 underline-offset-2">Parts</span>
                            <span>12</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] text-center">
                              Stock healthy
                            </span>
                          </div>
                          <div className="grid grid-cols-[24px,1fr,1fr,1fr,1fr] gap-1 items-center text-slate-700">
                            <span>□</span>
                            <span className="text-blue-600 underline-offset-2">Consulting Hour</span>
                            <span className="text-blue-600 underline-offset-2">Service</span>
                            <span>-</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[9px] text-center">
                              N/A
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 5 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Quick reports and next steps
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>
                            Use <span className="font-semibold">Quick Reports ▾</span> to open supplier lists, sales by
                            item and purchases by item.
                          </li>
                          <li>Reports open in dialogs with the same modern table styling as this screen.</li>
                          <li>
                            After setting up items and opening balances, move on to Customer and Supplier modules to use
                            them on quotes, invoices and purchases.
                          </li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Quick Reports (preview)
                        </div>
                        <div className="space-y-1 text-[11px]">
                          <div className="px-2 py-1 rounded border bg-slate-50 flex justify-between">
                            <span>List of Supplier</span>
                            <span className="text-slate-400">Dialog</span>
                          </div>
                          <div className="px-2 py-1 rounded border bg-slate-50 flex justify-between">
                            <span>Sale by Item</span>
                            <span className="text-slate-400">Dialog</span>
                          </div>
                          <div className="px-2 py-1 rounded border bg-slate-50 flex justify-between">
                            <span>Purchase by Item</span>
                            <span className="text-slate-400">Dialog</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                      You can always reopen this tutorial using the{" "}
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-blue-200 text-[#0052cc] text-xs font-semibold mx-1">
                        !
                      </span>
                      button next to the Inventory Management title.
                    </div>
                  </div>
                )}

                {helpStep === 6 && (
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
                        We hope you enjoyed this short Inventory tutorial. We look forward to
                        growing with you and supporting your business for the next couple of years.
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
          <InventoryManagement />
        </div>
      </DashboardLayout>
    </>
  );
}
