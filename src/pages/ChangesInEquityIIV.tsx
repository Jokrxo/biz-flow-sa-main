import { BalanceSheetIIVComponent } from "@/components/FinancialReports/BalanceSheetIIVComponent";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";

export default function ChangesInEquityIIV() {
  return (
    <>
      <SEO
        title="Changes in Equity IIV | Rigel Business"
        description="Statement of Changes in Equity (Independent IIV layout)"
      />
      <DashboardLayout>
        <BalanceSheetIIVComponent
          title="Changes in Equity IIV"
          subtitle="Statement of Changes in Equity (Independent)"
          variant="retained-earnings"
        />
      </DashboardLayout>
    </>
  );
}

