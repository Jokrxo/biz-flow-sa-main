import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { TransactionManagement } from "@/components/Transactions/TransactionManagement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Info, ArrowRightLeft, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/useAuth";
import SEO from "@/components/SEO";

export default function TransactionsPage() {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const uid = user?.id ? String(user.id) : "anonymous";
    const key = `tutorial_shown_transactions_${uid}`;
    const already = localStorage.getItem(key);
    if (!already) {
      setTutorialOpen(true);
      localStorage.setItem(key, "true");
    }
  }, [user]);

  return (
    <>
      <SEO title="Allocations | SA Finance Manager" description="Manage and track all allocations" />
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Allocations
                </h1>
                <p className="text-muted-foreground mt-1">Manage allocations and journal entries</p>
              </div>
              <Button variant="outline" className="gap-2 shadow-sm hover:shadow-md transition-all" onClick={() => setTutorialOpen(true)}>
                <Info className="h-4 w-4 text-primary" />
                Help & Tutorial
              </Button>
            </div>
          </div>

          <div className="animate-in fade-in-50 slide-in-from-bottom-2 duration-500">
            <TransactionManagement />
          </div>

          <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
            <DialogContent className="sm:max-w-[640px] p-6">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <FileText className="h-5 w-5 text-primary" />
                  Allocations Tutorial
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                <div className="p-4 bg-muted/30 rounded-lg border">
                  <p className="font-medium text-foreground mb-1">Overview</p>
                  <p>Use this module to create, review, and export accounting allocations. It serves as the heart of your financial record-keeping.</p>
                </div>
                
                <div className="grid gap-3">
                  <div className="flex gap-3 items-start">
                    <div className="bg-primary/10 p-2 rounded-full mt-0.5"><ArrowRightLeft className="h-3 w-3 text-primary" /></div>
                    <div>
                      <strong className="text-foreground">New Allocation:</strong> Click to open the double-entry form. Select Debit/Credit accounts, set a bank if applicable, and handle VAT automatically.
                    </div>
                  </div>
                </div>
                
                <p className="pt-2 border-t">
                  Common flows: <span className="text-foreground">Income received, Expense payment, Asset purchase, Loan management, and Depreciation.</span>
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setTutorialOpen(false)} className="w-full sm:w-auto">Got it</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </>
  );
}
