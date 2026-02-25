import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import React from "react";
import { isDemoMode } from "@/lib/demo-data";
import { AlertCircle } from "lucide-react";
import { PageLoader } from "../ui/loading-spinner";

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, subscriptionStatus } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageLoader />;
  }
  
  if (!user && !isDemoMode()) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  if (subscriptionStatus === 'SUSPENDED' && !isDemoMode()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-xl text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-900">Account Suspended</h2>
          <p className="mb-6 text-gray-600">
            Your account has been suspended by the administrator. Please contact support to restore access.
          </p>
          <button 
            onClick={() => window.location.href = '/login'}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
