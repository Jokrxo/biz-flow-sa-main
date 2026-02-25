import { GAAPFinancialStatements } from "@/components/FinancialReports/GAAPFinancialStatements";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";

// Income Statement page wrapper
export default function IncomeStatement() {
  return (
    <>
      <SEO title="Income Statement | Rigel Business" description="Statement of Profit or Loss" />
      <DashboardLayout>
         <GAAPFinancialStatements 
           initialTab="income" 
           initialMode="annual" 
           title="Income Statement"
           subtitle="Statement of Profit or Loss"
           hideBackToMenu={true}
           hideControls={true}
         />
      </DashboardLayout>
    </>
  );
}
