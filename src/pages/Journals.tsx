import React, { useState } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { JournalEntry } from "@/components/Journals/JournalEntry";
import SEO from "@/components/SEO";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function JournalsPage() {
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
      <SEO title="Journal Entry | Rigel Business" description="Post general journal entries" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Journal Entry</h1>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 text-xs"
                  aria-label="Journal entry help"
                  onClick={() => setHelpOpen(true)}
                >
                  !
                </button>
              </div>
              <p className="text-muted-foreground mt-1">
                Post manual journals for adjustments, corrections and one-off entries.
              </p>
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
                  <DialogTitle>How to use the Journal Entry module</DialogTitle>
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
                          <li>Use this screen to post manual journals directly into the general ledger.</li>
                          <li>Typical uses: year-end adjustments, corrections, reclassifications and accruals.</li>
                          <li>New Journals tab is for capturing and reviewing entries before posting.</li>
                          <li>Reviewed Journals tab is for posted entries that already affect balances.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Layout (preview)
                        </div>
                        <div className="space-y-2 text-[10px]">
                          <div className="h-6 rounded bg-slate-100 flex items-center px-2 text-slate-500">
                            Journal Entry – New Journals | Reviewed Journals
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[9px] text-slate-500">
                              !
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Tutorial
                            </span>
                          </div>
                          <div className="h-12 rounded bg-slate-50 border border-dashed flex items-center justify-center mt-2">
                            Action bar, journal table and input row
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 2 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      When to use journals
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use journals for adjustments that are not captured through normal modules.</li>
                          <li>Examples: depreciation, provisions, prior period corrections, reclassifications.</li>
                          <li>Avoid using journals for day-to-day invoices, receipts or payments.</li>
                          <li>This keeps operational modules and audit trail clean and consistent.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Examples (preview)
                        </div>
                        <div className="space-y-1">
                          <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Dr Depreciation Expense, Cr Accumulated Depreciation
                          </div>
                          <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Dr Sales, Cr Deferred Income (reclassification)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 3 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      New vs Reviewed journals
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>New Journals tab shows lines that are still being prepared and reviewed.</li>
                          <li>Use Mark as Reviewed when you are satisfied that a journal is correct and balanced.</li>
                          <li>Reviewed Journals tab shows posted entries by date range for reference and editing.</li>
                          <li>Only Reviewed journals update account balances and reporting.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text=[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Tabs (preview)
                        </div>
                        <div className="flex gap-3">
                          <div className="px-3 py-1.5 rounded border-b-2 border-blue-600 text-blue-700 text-[11px]">
                            New Journals
                          </div>
                          <div className="px-3 py-1.5 rounded border-b-2 border-transparent text-slate-500 text-[11px]">
                            Reviewed Journals
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 4 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Capturing a journal line
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the blue input row at the bottom of the table to capture a new line.</li>
                          <li>Set date, effect (Debit/Credit), account, reference, description and VAT type.</li>
                          <li>Amount and VAT are calculated separately and you can see the inclusive amount.</li>
                          <li>Choose an affecting account for the balancing side of the journal.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Input row (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Date • Effect • Account • Ref • Description • VAT • Amount
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 5 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Debits, credits and balancing
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Every journal should balance: total debits must equal total credits.</li>
                          <li>The system checks the group of lines with the same reference when posting.</li>
                          <li>If a journal does not balance, you will see a warning with the difference amount.</li>
                          <li>Correct the figures before marking the journal as reviewed.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Balance check (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Total Debits = Total Credits, otherwise show difference
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 6 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      VAT on journals
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>If your company is VAT registered, you can choose a VAT type for each line.</li>
                          <li>Use No VAT for pure reclassifications and non-VAT adjustments.</li>
                          <li>Be careful with VAT journals: they affect your VAT 201 reporting.</li>
                          <li>When in doubt, use operational modules for VAT transactions instead of journals.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          VAT types (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Dropdown with No VAT, Standard Rated, Zero Rated, etc.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 7 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Importing and managing journals
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the Import Journals button to load bulk entries from a spreadsheet.</li>
                          <li>You can delete pending journals if they were captured in error.</li>
                          <li>Reviewed journals can be edited or reversed, but you cannot add new lines there.</li>
                          <li>Use Export and Print options when you need a working paper for auditors.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Actions (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Mark as Reviewed • Delete • Import Journals • Export
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 8 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Journals and the general ledger
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Reviewed journals post to the general ledger and appear in account activity.</li>
                          <li>You can view the impact in ledger and trial balance reports.</li>
                          <li>Use clear references and descriptions so each journal is self-explanatory.</li>
                          <li>This makes tracing adjustments easy during reviews and audits.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Ledger link (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Journal entries flowing into account activity and trial balance
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 9 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Good practices for journals
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Group lines with the same reference for each complete journal.</li>
                          <li>Use detailed descriptions that explain why the adjustment is needed.</li>
                          <li>Avoid large, complex journals when smaller targeted entries will do.</li>
                          <li>Where possible, link back to source documents or working papers.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Best practice (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Clear references, grouped lines and concise explanations
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
                        This Journal Entry tutorial is designed to help you post clean, well-documented adjustments.
                        We look forward to supporting your financial reporting over the next couple of years.
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

          <JournalEntry />
        </div>
      </DashboardLayout>
    </>
  );
}
