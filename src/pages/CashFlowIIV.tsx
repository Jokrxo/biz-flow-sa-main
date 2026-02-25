import { BalanceSheetIIVComponent } from "@/components/FinancialReports/BalanceSheetIIVComponent";
import SEO from "@/components/SEO";

export default function CashFlowIIV() {
  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <SEO title="Cash Flow IIV | Rigel Business" description="Statement of Cash Flows (Independent IIV layout)" />
      <BalanceSheetIIVComponent 
        title="Cash Flow IIV"
        subtitle="Statement of Cash Flows (Independent)"
        variant="cash-flow"
      />
    </div>
  );
}

