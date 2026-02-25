import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { BudgetManagement } from "@/components/Budget/BudgetManagement";
import { AnnualBudgetReport } from "@/components/Budget/AnnualBudgetReport";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info, BarChart3, PieChart } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function BudgetPage() {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const uid = user?.id ? String(user.id) : "anonymous";
    const key = `tutorial_shown_budget_${uid}`;
    const already = localStorage.getItem(key);
    if (!already) {
      setTutorialOpen(true);
      localStorage.setItem(key, "true");
    }
  }, [user]);
  return (
    <>
      <SEO title="Budget | Rigel Business" description="Manage budgets and track spending" />
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Budget</h1>
              <p className="text-muted-foreground mt-1">Manage budgets and track spending</p>
            </div>
            <Button variant="outline" onClick={() => setTutorialOpen(true)}>
              <Info className="h-4 w-4 mr-2" />
              Help & Tutorial
            </Button>
          </div>

          <Tabs defaultValue="management" className="space-y-6">
            <div className="border-b pb-px overflow-x-auto">
              <TabsList className="h-auto w-full justify-start gap-2 bg-transparent p-0 rounded-none">
                <TabsTrigger 
                  value="management"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary flex items-center gap-2"
                >
                  <PieChart className="h-4 w-4" />
                  Budget Management
                </TabsTrigger>
                <TabsTrigger 
                  value="annual"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary flex items-center gap-2"
                >
                  <BarChart3 className="h-4 w-4" />
                  Annual Overview
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="management">
              <BudgetManagement />
            </TabsContent>

            <TabsContent value="annual">
              <AnnualBudgetReport />
            </TabsContent>
          </Tabs>

          <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
            <DialogContent className="sm:max-w-[640px] p-4">
              <DialogHeader>
                <DialogTitle>Budget Tutorial</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>Use this module to create, view, and manage budgets.</p>
                <p>Track spending against plan and review variances by category.</p>
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
