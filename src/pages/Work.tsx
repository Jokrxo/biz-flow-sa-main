import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { WorkManager } from "@/components/Work/WorkManager";

export default function WorkPage() {
  return (
    <>
      <SEO title="Work / Tasks | Administration" description="Manage accounting tasks and workflows" />
      <DashboardLayout>
        <WorkManager />
      </DashboardLayout>
    </>
  );
}
