import { BalanceSheetIIVComponent } from "@/components/FinancialReports/BalanceSheetIIVComponent";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";

export default function BalanceSheetIIV() {
  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <SEO title="Balance Sheet IIV | Rigel Business" description="Statement of Financial Position (IIV)" />
      <BalanceSheetIIVComponent 
        title="Balance Sheet IIV"
        subtitle="Statement of Financial Position (Independent)"
      />
    </div>
  );
}
