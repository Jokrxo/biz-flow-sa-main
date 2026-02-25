import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { ChartOfAccountsManagement } from "@/components/Transactions/ChartOfAccountsManagement";
import { CompanySettings } from "@/components/Company/CompanySettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralSettings } from "@/components/Settings/GeneralSettings";
import { AdministrationSettings } from "@/components/Settings/AdministrationSettings";
import { DataManagement } from "@/components/Settings/DataManagement";
import { ThemeSettings } from "@/components/Settings/ThemeSettings";
import { SecuritySettings } from "@/components/Settings/SecuritySettings";
import { Button } from "@/components/ui/button";
import { OpeningBalancesAdjustments } from "@/components/Settings/OpeningBalancesAdjustments";
import { AccountMapping } from "@/components/Settings/AccountMapping";
import { CommunicationSettings } from "@/components/Settings/CommunicationSettings";
import { TaxAndInvoicingSettings } from "@/components/Settings/TaxAndInvoicingSettings";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Info, Building2, Settings2, Users, Database, Shield, Palette, Scale, ChevronRight, Calculator, Mail, Calendar, FolderTree, BookOpen, ListChecks } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FiscalSettings } from "@/components/Settings/FiscalSettings";
import { WorkManager } from "@/components/Work/WorkManager";
import { CorporateTaxSettings } from "@/components/Settings/CorporateTaxSettings";

export default function SettingsPage() {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("company");
  const { user } = useAuth();

  useEffect(() => {
    const uid = user?.id ? String(user.id) : "anonymous";
    const key = `tutorial_shown_settings_${uid}`;
    const already = localStorage.getItem(key);
    if (!already) {
      setTutorialOpen(true);
      localStorage.setItem(key, "true");
    }
  }, [user]);

  const tabs = [
    { id: "company", label: "Company Profile", icon: Building2, desc: "Manage business details & branding" },
    { id: "work", label: "Work & Tasks", icon: ListChecks, desc: "Manage team tasks & workflows" },
    { id: "general", label: "Preferences", icon: Settings2, desc: "System defaults & localization" },
    { id: "fiscal", label: "Fiscal", icon: Calendar, desc: "Fiscal year and period settings" },
    { id: "tax_invoice", label: "Tax & Invoicing", icon: Calculator, desc: "VAT rates, currency & prefixes" },
    { id: "corporate_tax", label: "Corporate Tax", icon: Scale, desc: "CIT rate & wear-and-tear" },
    { id: "account_mapping", label: "Account Mapping", icon: FolderTree, desc: "Map accounts to reporting categories" },
    { id: "coa", label: "Chart of Accounts", icon: BookOpen, desc: "Manage ledger accounts" },
    { id: "communication", label: "Email & Templates", icon: Mail, desc: "Notifications & document emails" },
    { id: "administration", label: "Team & Roles", icon: Users, desc: "Manage users and permissions" },
    { id: "data", label: "Data Management", icon: Database, desc: "Backup, restore & imports" },
    { id: "security", label: "Security", icon: Shield, desc: "Password policy & sessions" },
    { id: "theme", label: "Appearance", icon: Palette, desc: "Theme & visual customization" },
    { id: "adjustment", label: "Opening Balances", icon: Scale, desc: "Adjust historical financial data" },
  ];

  return (
    <>
      <SEO title="Settings | Rigel Business" description="Company settings and preferences" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b pb-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Manage your organization's profile, system preferences, and security controls.
              </p>
            </div>
            <div>
              <Button variant="outline" size="sm" onClick={() => setTutorialOpen(true)}>
                <Info className="h-4 w-4 mr-2" />
                Help Guide
              </Button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar Navigation */}
            <div className="w-full lg:w-64 flex-shrink-0">
              <nav className="space-y-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 group",
                      activeTab === tab.id 
                        ? "bg-muted text-foreground font-semibold" 
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <tab.icon className={cn("h-3.5 w-3.5", activeTab === tab.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      <span>{tab.label}</span>
                    </div>
                  </button>
                ))}
              </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-w-0">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    {tabs.find(t => t.id === activeTab)?.icon && (() => {
                      const Icon = tabs.find(t => t.id === activeTab)!.icon;
                      return <Icon className="h-6 w-6 text-primary" />;
                    })()}
                    {tabs.find(t => t.id === activeTab)?.label}
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    {tabs.find(t => t.id === activeTab)?.desc}
                  </p>
                </div>

                <div className="animate-in fade-in-50 slide-in-from-bottom-2 duration-500">
                  <TabsContent value="company" className="mt-0">
                    <CompanySettings />
                  </TabsContent>
                  
                  <TabsContent value="work" className="mt-0">
                    <WorkManager />
                  </TabsContent>
                  
                  <TabsContent value="general" className="mt-0">
                    <GeneralSettings />
                  </TabsContent>
                  
                  <TabsContent value="fiscal" className="mt-0">
                    <FiscalSettings />
                  </TabsContent>
                  
                  <TabsContent value="tax_invoice" className="mt-0">
                    <TaxAndInvoicingSettings />
                  </TabsContent>
                  
                  <TabsContent value="corporate_tax" className="mt-0">
                    <CorporateTaxSettings />
                  </TabsContent>

                  <TabsContent value="account_mapping" className="mt-0">
                    <AccountMapping />
                  </TabsContent>

                  <TabsContent value="coa" className="mt-0">
                    <ChartOfAccountsManagement />
                  </TabsContent>

                  <TabsContent value="communication" className="mt-0">
                    <CommunicationSettings />
                  </TabsContent>

                  <TabsContent value="administration" className="mt-0">
                    <AdministrationSettings />
                  </TabsContent>
                  
                  <TabsContent value="data" className="mt-0">
                    <DataManagement />
                  </TabsContent>

                  <TabsContent value="security" className="mt-0">
                    <SecuritySettings />
                  </TabsContent>

                  <TabsContent value="theme" className="mt-0">
                    <ThemeSettings />
                  </TabsContent>

                  <TabsContent value="adjustment" className="mt-0">
                    <OpeningBalancesAdjustments />
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>

          <Dialog open={tutorialOpen} onOpenChange={setTutorialOpen}>
            <DialogContent className="sm:max-w-[640px] p-4">
              <DialogHeader>
                <DialogTitle>Settings Tutorial</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p>Use the sidebar to navigate between different configuration categories.</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li><strong>Company Profile:</strong> Update logo, address, and contact info.</li>
                  <li><strong>Preferences:</strong> Set date formats, notifications, and language.</li>
                  <li><strong>Team & Roles:</strong> Invite users and assign permissions.</li>
                  <li><strong>Data:</strong> Backup your database or restore from a file.</li>
                </ul>
              </div>
              <div className="pt-4">
                <Button onClick={() => setTutorialOpen(false)} className="w-full bg-gradient-primary">Got it</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </>
  );
}
