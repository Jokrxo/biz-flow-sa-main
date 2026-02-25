import React from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { FixedAssetsManager } from "@/components/FixedAssets/FixedAssetsManager";

const FixedAssets = () => {
  return (
    <DashboardLayout>
      <div className="container mx-auto py-6">
        <FixedAssetsManager isManagementMode={false} />
      </div>
    </DashboardLayout>
  );
};

export default FixedAssets;
