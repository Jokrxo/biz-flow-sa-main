import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { TrialBalanceAutoGenerate } from "@/components/TrialBalance/TrialBalanceAutoGenerate";
import SEO from "@/components/SEO";

export default function TrialBalancePage() {
  return (
    <>
      <SEO title="Trial Balance | SA Finance Manager" description="Auto-generated trial balance from transactions" />
      <DashboardLayout>
        <TrialBalanceAutoGenerate />
      </DashboardLayout>
    </>
  );
}
