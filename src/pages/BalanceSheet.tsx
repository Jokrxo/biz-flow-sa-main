import { GAAPFinancialStatements } from "@/components/FinancialReports/GAAPFinancialStatements";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";

// Balance Sheet page wrapper
export default function BalanceSheet() {
  return (
    <>
      <SEO title="Balance Sheet | Rigel Business" description="Statement of Financial Position" />
      <DashboardLayout>
         <GAAPFinancialStatements 
           initialTab="balance-sheet" 
           initialMode="annual" 
           title="Balance Sheet"
           subtitle="Statement of Financial Position"
           hideBackToMenu={true}
           hideControls={true}
         />
      </DashboardLayout>
    </>
  );
}
