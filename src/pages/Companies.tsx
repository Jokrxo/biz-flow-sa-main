import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { CompanyList } from "@/components/Company/CompanyList";
import SEO from "@/components/SEO";

const Companies = () => {
  return (
    <>
      <SEO title="Company Management | Rigel Business" description="Manage your companies and organizations" />
      <DashboardLayout>
        <div className="space-y-6">
          <CompanyList />
        </div>
      </DashboardLayout>
    </>
  );
};

export default Companies;
