import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { RealAnalytics } from "@/components/Analytics/RealAnalytics";

export default function AnalyticsPage() {
  return (
    <>
      <SEO title="Analytics | Rigel Business" description="Business analytics and insights" />
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Analytics</h1>
            <p className="text-muted-foreground mt-1">Business intelligence and performance insights</p>
          </div>

          <RealAnalytics />
        </div>
      </DashboardLayout>
    </>
  );
}
