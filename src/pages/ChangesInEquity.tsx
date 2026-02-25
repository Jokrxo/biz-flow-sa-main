import { GAAPFinancialStatements } from "@/components/FinancialReports/GAAPFinancialStatements";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";

// Changes in Equity page wrapper
export default function ChangesInEquity() {
  return (
    <>
      <SEO title="Changes in Equity | Rigel Business" description="Statement of Changes in Equity" />
      <DashboardLayout>
         <GAAPFinancialStatements 
           initialTab="retained-earnings" 
           initialMode="annual" 
           title="Changes in Equity"
           subtitle="Statement of Changes in Equity"
           hideBackToMenu={true}
           hideControls={true}
         />
      </DashboardLayout>
    </>
  );
}
