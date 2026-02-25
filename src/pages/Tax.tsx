import { useState } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { VAT201 } from "@/components/Tax/VAT201";
import { TaxOverview } from "@/components/Tax/TaxOverview";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function TaxPage() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(1);
  const totalHelpSteps = 10;

  const nextHelpStep = () => {
    setHelpStep((prev) => (prev < totalHelpSteps ? prev + 1 : prev));
  };

  const prevHelpStep = () => {
    setHelpStep((prev) => (prev > 1 ? prev - 1 : prev));
  };

  return (
    <>
      <SEO title="Tax | Rigel Business" description="Manage tax rates, returns, and reports" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">VAT 201</h1>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 text-xs"
                  aria-label="VAT201 help"
                  onClick={() => setHelpOpen(true)}
                >
                  !
                </button>
              </div>
              <p className="text-muted-foreground">
                Manage your VAT periods, submissions, and payments
              </p>
            </div>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Report
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>VAT Report</DialogTitle>
                </DialogHeader>
                <TaxOverview />
              </DialogContent>
            </Dialog>
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
                  <DialogTitle>How to use the VAT201 module</DialogTitle>
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
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                          Overview
                        </div>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Track VAT201 periods, submissions, payments and refunds.</li>
                          <li>See Output VAT from sales and Input VAT from purchases in one place.</li>
                          <li>Quickly work out how much VAT you owe SARS or are owed as a refund.</li>
                          <li>Use the VAT report button to see the detailed transactions behind each period.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Layout (preview)
                        </div>
                        <div className="space-y-2 text-[10px]">
                          <div className="h-6 rounded bg-slate-100 flex items-center px-2 text-slate-500">
                            VAT 201
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-1">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[9px] text-slate-500">
                                !
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Tutorial
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full border text-slate-700 bg-white text-[10px]">
                              VAT Report
                            </span>
                          </div>
                          <div className="h-12 rounded bg-slate-50 border border-dashed flex items-center justify-center mt-2">
                            Current period card and previous periods table
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 2 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      VAT frequency and settings
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Choose how often you submit VAT: 1, 2, 4, 6 or 12 months.</li>
                          <li>The system uses this to calculate your VAT period start and end dates.</li>
                          <li>Use VAT Settings to change frequency if SARS changes your category.</li>
                          <li>Changes apply to future periods; past periods stay as they were.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          VAT settings (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Reporting Frequency: 2 Months
                          </div>
                          <div className="h-6 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Save / Done button
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 3 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Start or close the current VAT period
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ol className="list-decimal list-inside space-y-1">
                          <li>If you have no open period, click <span className="font-semibold">Start First VAT Period</span>.</li>
                          <li>The system creates the period based on your frequency and current date.</li>
                          <li>While the period is open, VAT totals update from all linked transactions.</li>
                          <li>When ready to submit, use <span className="font-semibold">Close VAT Period</span> to lock it.</li>
                        </ol>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Current period (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Current VAT Period and Return
                          </div>
                          <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Button: Start / Close VAT Period
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 4 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Understand payable vs refundable VAT
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Output VAT is VAT on sales; Input VAT is VAT on purchases and expenses.</li>
                          <li>The system calculates a net VAT figure for each period.</li>
                          <li>Positive net = VAT payable (you owe SARS). Negative net = VAT refundable.</li>
                          <li>Use the Payable / Refundable columns to see the position quickly.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          VAT totals (preview)
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span>Output VAT</span>
                            <span className="font-mono">R 15 000.00</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span>Input VAT</span>
                            <span className="font-mono">R 10 000.00</span>
                          </div>
                          <div className="flex justify-between text-[11px] border-t pt-1 mt-1">
                            <span>Net VAT (Payable)</span>
                            <span className="font-mono font-semibold text-red-600">R 5 000.00</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 5 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Work with the current VAT period grid
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the current period row to see due date and VAT amounts.</li>
                          <li>Click the VAT report link to see detailed transactions feeding the period.</li>
                          <li>Use Out of Period to see transactions that were linked but dated outside the range.</li>
                          <li>Check everything before you submit VAT on SARS eFiling.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Current period row (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Row showing Status, VAT Period, Due Date, Payable, Refundable, Report link
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 6 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Previous VAT periods and reopening
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Closed periods move into the Previous VAT Periods table.</li>
                          <li>Each row shows the period, submission date and settled / refund status.</li>
                          <li>Use the reopen link when an admin needs to correct a closed period.</li>
                          <li>Reopening requires extra confirmation and should be rare.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Previous periods (preview)
                        </div>
                        <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Table with Reopen, VAT Period, Payable / Refundable, Settled, Refund Received
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 7 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      VAT payments and refunds
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the VAT payment / refund actions to link bank movements to VAT periods.</li>
                          <li>Select the correct VAT period and bank account, then enter the payment date and amount.</li>
                          <li>For payable VAT, record a payment to SARS; for refunds, record the refund received.</li>
                          <li>Linked movements update the Settled and Refund Received indicators.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Record VAT transaction (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Period • Type • Date
                          </div>
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Bank Account • Amount • Reference
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 8 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      VAT adjustments and out-of-period items
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use VAT adjustments for journals like bad debts or manual SARS corrections.</li>
                          <li>Out-of-period items show VAT transactions linked to this period but dated outside the range.</li>
                          <li>Review these carefully so your VAT201 matches your accounting records.</li>
                          <li>Keep supporting documents ready in case SARS asks for explanations.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Adjustments (preview)
                        </div>
                        <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          List of adjustments and out-of-period transactions
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 9 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      VAT report and export for SARS eFiling
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the VAT Report button in the header to open the overview report.</li>
                          <li>Review Input and Output VAT totals, plus the transactions that make them up.</li>
                          <li>Use the totals to complete your VAT201 return on SARS eFiling.</li>
                          <li>Export data to Excel or PDF if you need to keep a working paper.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          VAT report (preview)
                        </div>
                        <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Summary of Input and Output VAT with export options
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
                        We hope this VAT201 tutorial makes your VAT submissions clearer and less stressful.
                        We look forward to helping you stay compliant with SARS over the next couple of years.
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

          <VAT201 />
        </div>
      </DashboardLayout>
    </>
  );
}
