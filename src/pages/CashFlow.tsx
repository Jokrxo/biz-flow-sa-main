import { GAAPFinancialStatements } from "@/components/FinancialReports/GAAPFinancialStatements";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";

// Cash Flow page wrapper
export default function CashFlow() {
  return (
    <>
      <SEO title="Cash Flow Statement | Rigel Business" description="Statement of Cash Flows" />
      <DashboardLayout>
         <GAAPFinancialStatements 
           initialTab="cash-flow" 
           initialMode="annual" 
           title="Cash Flow Statement"
           subtitle="Statement of Cash Flows"
           hideBackToMenu={true}
           hideControls={true}
         />
      </DashboardLayout>
    </>
  );
}
