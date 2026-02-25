import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { BankManagement } from "@/components/Bank/BankManagement";
import SEO from "@/components/SEO";

export default function BankPage() {
  return (
    <>
      <SEO title="Bank | Rigel Business" description="Manage bank accounts and transactions" />
      <DashboardLayout>
        <BankManagement />
      </DashboardLayout>
    </>
  );
}
