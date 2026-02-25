import { BalanceSheetIIVComponent } from "@/components/FinancialReports/BalanceSheetIIVComponent";
import SEO from "@/components/SEO";

export default function IncomeStatementIIV() {
  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <SEO title="Income Statement IIV | Rigel Business" description="Income Statement (Independent IIV layout)" />
      <BalanceSheetIIVComponent 
        title="Income Statement IIV"
        subtitle="Statement of Profit or Loss (Independent)"
        variant="income"
      />
    </div>
  );
}

