import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { DashboardOverview } from "@/components/Dashboard/DashboardOverview";
import SEO from "@/components/SEO";

const Index = () => {
  return (
    <>
      <SEO title="Dashboard | Rigel Business" description="Rigel Business dashboard with real-time financial data" />
      <DashboardLayout>
        <div className="space-y-6">
          <DashboardOverview />
        </div>
      </DashboardLayout>
    </>
  );
};

export default Index;
