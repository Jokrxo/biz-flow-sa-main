
import { GAAPFinancialStatements } from "@/components/FinancialReports/GAAPFinancialStatements";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";

export default function IFRSNotes() {
  return (
    <>
      <SEO title="IFRS Notes | Rigel Business" description="Notes to Financial Statements (IFRS)" />
      <DashboardLayout>
         <GAAPFinancialStatements 
           initialTab="ifrs-notes" 
           initialMode="annual" 
           title="IFRS Notes"
           subtitle="Notes to Financial Statements"
           hideBackToMenu={true}
           hideControls={true}
         />
      </DashboardLayout>
    </>
  );
}
