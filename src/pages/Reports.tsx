import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { GAAPFinancialStatements } from "@/components/FinancialReports/GAAPFinancialStatements";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info } from "lucide-react";
import { useAuth } from "@/context/useAuth";

export default function ReportsPage() {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const uid = user?.id ? String(user.id) : "anonymous";
    const key = `tutorial_shown_reports_${uid}`;
    const already = localStorage.getItem(key);
    if (!already) {
      setTutorialOpen(true);
      localStorage.setItem(key, "true");
    }
  }, [user]);
  return (
    <>
      <SEO title="Financial Reports | Rigel Business" description="GAAP-compliant annual financial statements with drill-down capabilities" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Financial Reporting</h1>
              <p className="text-muted-foreground mt-1">View GAAP financial statements and detailed breakdowns</p>
            </div>
            <Button variant="outline" onClick={() => setTutorialOpen(true)}>
              <Info className="h-4 w-4 mr-2" />
              Help & Tutorial
            </Button>
          </div>

          <GAAPFinancialStatements />

          <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
            <DialogContent className="sm:max-w-[640px] p-4">
              <DialogHeader>
                <DialogTitle>Financial Reporting Tutorial</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>This module is for viewing financial reports.</p>
                <p>Open the statements to see Income Statement, Balance Sheet, and Cash Flow, with drill-down to underlying entries.</p>
              </div>
              <div className="pt-4">
                <Button onClick={() => setTutorialOpen(false)}>Got it</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </>
  );
}
