import { BalanceSheetIIVComponent } from "@/components/FinancialReports/BalanceSheetIIVComponent";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";

export default function IFRSNotesIIV() {
  return (
    <>
      <SEO title="IFRS Notes IIV | Rigel Business" description="Notes to Financial Statements (Independent IIV layout)" />
      <DashboardLayout>
        <BalanceSheetIIVComponent
          title="IFRS Notes IIV"
          subtitle="Notes to Financial Statements (Independent)"
          variant="ifrs-notes"
        />
      </DashboardLayout>
    </>
  );
}

