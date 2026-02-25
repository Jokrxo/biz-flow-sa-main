import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BankReconciliation as BankReconciliationComponent } from "@/components/Bank/BankReconciliation";
import { PageLoader } from "@/components/ui/loading-spinner";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import SEO from "@/components/SEO";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  opening_balance: number;
  current_balance: number;
  created_at: string;
}

const BankReconciliationPage = () => {
  const [searchParams] = useSearchParams();
  const bankId = searchParams.get("bankId");
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(1);
  const totalHelpSteps = 10;

  useEffect(() => {
    loadBanks();
  }, []);

  const loadBanks = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return;

      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBanks(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const nextHelpStep = () => {
    setHelpStep((prev) => (prev < totalHelpSteps ? prev + 1 : prev));
  };

  const prevHelpStep = () => {
    setHelpStep((prev) => (prev > 1 ? prev - 1 : prev));
  };

  return (
    <>
      <SEO title="Bank Reconciliation | Rigel Business" description="Reconcile your bank transactions" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Bank Reconciliation</h1>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 text-xs"
                  aria-label="Bank reconciliation help"
                  onClick={() => setHelpOpen(true)}
                >
                  !
                </button>
              </div>
              <p className="text-muted-foreground mt-1">Match your system transactions with your bank statement.</p>
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
                  <DialogTitle>How to use the Bank Reconciliation module</DialogTitle>
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
                          <li>Use this screen to match your system bank transactions to your bank statement.</li>
                          <li>Tick cleared items, compare to the statement and update reconciliation status.</li>
                          <li>See opening balance, prior cleared, current cleared and any difference.</li>
                          <li>Finish reconciliation only when the difference is zero.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Layout (preview)
                        </div>
                        <div className="space-y-2 text-[10px]">
                          <div className="h-6 rounded bg-slate-100 flex items-center px-2 text-slate-500">
                            Bank Reconciliation – Bank Account Matcher
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
                            Account selection, dates and reconciliation summary
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 2 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Choose the correct bank account
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Select the financial institution account that matches your bank statement.</li>
                          <li>System Balance shows the current balance from your ledger for that account.</li>
                          <li>Opening Balance is the starting point for this account in your system.</li>
                          <li>Make sure you reconcile only one bank account at a time.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Account selection (preview)
                        </div>
                        <div className="space-y-1">
                          <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Financial Institution Account: ABSA - Business Cheque
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-slate-500">System Balance</span>
                            <span className="font-mono font-semibold text-slate-800">R 125 430.00</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-blue-700">Opening Balance</span>
                            <span className="font-mono font-semibold text-blue-800">R 10 000.00</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 3 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Set the statement period
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use Period From and Period To to match your bank statement dates.</li>
                          <li>Uncleared items up to Period To and cleared items in the range are shown.</li>
                          <li>Prior cleared transactions before the period are included in the cleared balance.</li>
                          <li>Adjust dates if your statement covers a different period.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Dates (preview)
                        </div>
                        <div className="space-y-1">
                          <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Period From: 2026-03-01
                          </div>
                          <div className="h-7 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Period To: 2026-03-31
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 4 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Enter statement balance and cleared items
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Enter the closing balance from your bank statement into the statement balance field.</li>
                          <li>Cleared Balance is calculated from opening, prior cleared and currently ticked items.</li>
                          <li>The Difference shows how far you are from matching the statement balance.</li>
                          <li>Work until the Difference is zero before you finish reconciliation.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Summary (preview)
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>Statement Balance</span>
                            <span className="font-mono">R 130 000.00</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Cleared Balance</span>
                            <span className="font-mono">R 130 000.00</span>
                          </div>
                          <div className="flex justify-between text-emerald-700">
                            <span>Difference</span>
                            <span className="font-mono">R 0.00</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 5 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Tick cleared transactions
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the checkboxes to mark which transactions have cleared the bank.</li>
                          <li>Use Select All and Deselect All when dealing with long lists.</li>
                          <li>Approved transactions in the period are pre-selected as cleared.</li>
                          <li>Unticking an approved item will remove it from the cleared balance.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Cleared items (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Checkbox column with Select All / Deselect All
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 6 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Understand prior cleared vs current session
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Prior cleared total is the sum of all approved items before the period.</li>
                          <li>Current session cleared total is everything you tick in the visible list.</li>
                          <li>Together they form the cleared balance used for the reconciliation.</li>
                          <li>This keeps long-running reconciliations efficient month after month.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Totals (preview)
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>Prior Cleared</span>
                            <span className="font-mono">R 95 000.00</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Current Cleared</span>
                            <span className="font-mono">R 35 000.00</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 7 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Dealing with differences
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>If the difference is not zero, check for missing or duplicated transactions.</li>
                          <li>Confirm all bank charges, interest, and deposits are captured in the system.</li>
                          <li>Use the Bank Transactions module to capture missing items and then refresh here.</li>
                          <li>A clean reconciliation should explain every difference to the cent.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Differences (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Difference banner with guidance when not zero
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 8 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Finishing the reconciliation
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>You can only finish when the difference is zero (or within rounding tolerance).</li>
                          <li>Finishing updates transactions to approved or pending based on your selections.</li>
                          <li>This locks in which items are treated as cleared for this period.</li>
                          <li>Run a reconciled report for printouts or auditor support.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Finish (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Finish Reconciliation and Reconciled Report buttons
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 9 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Impact on your financials
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Approved bank transactions feed into your trial balance and financial statements.</li>
                          <li>Unapproved items remain in “to review” lists and do not complete the reconciliation.</li>
                          <li>Regular reconciliation keeps bank, cash and VAT balances accurate.</li>
                          <li>Auditors rely on reconciled reports to trust your bank balances.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Financial impact (preview)
                        </div>
                        <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                          Bank GL, VAT and retained earnings all in sync
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
                        This Bank Reconciliation tutorial is designed to help you close each period with confidence.
                        We look forward to supporting your cash and bank control over the next couple of years.
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
          
          {loading ? (
            <div className="h-[400px] flex items-center justify-center">
              <PageLoader />
            </div>
          ) : (
            <BankReconciliationComponent bankAccounts={banks} initialBankId={bankId} />
          )}
        </div>
      </DashboardLayout>
    </>
  );
};

export default BankReconciliationPage;
