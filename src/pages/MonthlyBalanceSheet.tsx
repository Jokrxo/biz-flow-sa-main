import React, { useState } from "react";
import { GAAPFinancialStatements } from "../components/FinancialReports/GAAPFinancialStatements";
import { Button } from "@/components/ui/button";
import { Eye, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const MonthlyBalanceSheet = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'single' | 'full'>('single');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button 
            variant={viewMode === 'full' ? 'default' : 'outline'}
            onClick={() => setViewMode(viewMode === 'single' ? 'full' : 'single')}
            className="gap-2"
        >
            <Eye className="h-4 w-4" />
            {viewMode === 'single' ? 'View Full Report' : 'View Monthly Balance Sheet'}
        </Button>
      </div>

      {/* 
          We use the key prop to force a re-mount when viewMode changes, 
          ensuring the component initializes with the correct tab.
      */}
      <GAAPFinancialStatements 
        key={viewMode} 
        initialTab={viewMode === 'single' ? 'balance-sheet' : 'monthly-report'} 
        initialMode="monthly" 
        hideControls={true} 
      />
    </div>
  );
};

export default MonthlyBalanceSheet;