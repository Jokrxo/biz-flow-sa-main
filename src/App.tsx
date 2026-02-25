import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { LayoutProvider } from "@/context/LayoutContext";
import { ProtectedRoute } from "./components/Auth/ProtectedRoute";
import { TutorialProvider } from "./components/Tutorial/TutorialGuide";
import { AppShell } from "./components/Layout/AppShell";
import { PageLoader } from "./components/ui/loading-spinner";

const queryClient = new QueryClient();

// Pages
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Community = lazy(() => import("./pages/Community"));

// Transactions
const Purchase = lazy(() => import("./pages/Purchase"));
const Sales = lazy(() => import("./pages/Sales"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Journals = lazy(() => import("./pages/Journals"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Impairment = lazy(() => import("./pages/Impairment"));
const Payroll = lazy(() => import("./pages/Payroll"));

// Banking
const Bank = lazy(() => import("./pages/Bank"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));
const Allocate = lazy(() => import("./pages/Allocate"));

// Financing
const Loans = lazy(() => import("./pages/Loans"));
const Investments = lazy(() => import("./pages/Investments"));
const Directors = lazy(() => import("./pages/Directors"));

// Tax Management
const Tax = lazy(() => import("./pages/Tax"));
const CorporateTax = lazy(() => import("./pages/CorporateTax"));
const EmployeeTax = lazy(() => import("./pages/EmployeeTax"));

// Financial Reports
const TrialBalance = lazy(() => import("./pages/TrialBalance"));
const GeneralJournal = lazy(() => import("./pages/GeneralJournal"));
const FixedAssets = lazy(() => import("./pages/FixedAssets"));
const Reports = lazy(() => import("./pages/Reports"));
const BalanceSheet = lazy(() => import("./pages/BalanceSheet"));
const BalanceSheetIIV = lazy(() => import("./pages/BalanceSheetIIV"));
const IncomeStatement = lazy(() => import("./pages/IncomeStatement"));
const IncomeStatementIIV = lazy(() => import("./pages/IncomeStatementIIV"));
const CashFlow = lazy(() => import("./pages/CashFlow"));
const CashFlowIIV = lazy(() => import("./pages/CashFlowIIV"));
const ChangesInEquity = lazy(() => import("./pages/ChangesInEquity"));
const ChangesInEquityIIV = lazy(() => import("./pages/ChangesInEquityIIV"));
const IFRSNotes = lazy(() => import("./pages/IFRSNotes"));
const IFRSNotesIIV = lazy(() => import("./pages/IFRSNotesIIV"));
const Budget = lazy(() => import("./pages/Budget"));

// Administration
const Settings = lazy(() => import("./pages/Settings"));
const Companies = lazy(() => import("./pages/Companies"));
const Users = lazy(() => import("./pages/Users"));

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <LayoutProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Suspense fallback={<PageLoader />}><Login /></Suspense>} />
              <Route path="/signup" element={<Suspense fallback={<PageLoader />}><Signup /></Suspense>} />
              <Route path="/forgot-password" element={<Suspense fallback={<PageLoader />}><ForgotPassword /></Suspense>} />
              <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>} />
              
              <Route element={
                <ProtectedRoute>
                  <TutorialProvider>
                    <AppShell>
                      <Outlet />
                    </AppShell>
                  </TutorialProvider>
                </ProtectedRoute>
              }>
                <Route path="/" element={<Suspense fallback={<PageLoader />}><Index /></Suspense>} />
                <Route path="/community" element={<Suspense fallback={<PageLoader />}><Community /></Suspense>} />
                
                {/* Transactions */}
                <Route path="/purchase" element={<Suspense fallback={<PageLoader />}><Purchase /></Suspense>} />
                <Route path="/sales" element={<Suspense fallback={<PageLoader />}><Sales /></Suspense>} />
                <Route path="/customers" element={<Suspense fallback={<PageLoader />}><Sales /></Suspense>} />
                <Route path="/inventory" element={<Suspense fallback={<PageLoader />}><Inventory /></Suspense>} />
                <Route path="/journals" element={<Suspense fallback={<PageLoader />}><Journals /></Suspense>} />
                <Route path="/transactions" element={<Suspense fallback={<PageLoader />}><Transactions /></Suspense>} />
                <Route path="/impairment" element={<Suspense fallback={<PageLoader />}><Impairment /></Suspense>} />
                <Route path="/payroll" element={<Suspense fallback={<PageLoader />}><Payroll /></Suspense>} />
                
                {/* Banking */}
                <Route path="/bank" element={<Suspense fallback={<PageLoader />}><Bank /></Suspense>} />
                <Route path="/bank-reconciliation" element={<Suspense fallback={<PageLoader />}><BankReconciliation /></Suspense>} />
                <Route path="/allocate" element={<Suspense fallback={<PageLoader />}><Allocate /></Suspense>} />
                
                {/* Financing */}
                <Route path="/loans" element={<Suspense fallback={<PageLoader />}><Loans /></Suspense>} />
                <Route path="/investments" element={<Suspense fallback={<PageLoader />}><Investments /></Suspense>} />
                <Route path="/directors" element={<Suspense fallback={<PageLoader />}><Directors /></Suspense>} />
                
                {/* Tax Management */}
                <Route path="/tax" element={<Suspense fallback={<PageLoader />}><Tax /></Suspense>} />
                <Route path="/corporate-tax" element={<Suspense fallback={<PageLoader />}><CorporateTax /></Suspense>} />
                <Route path="/employee-tax" element={<Suspense fallback={<PageLoader />}><EmployeeTax /></Suspense>} />
                
                {/* Financial Reports */}
                <Route path="/trial-balance" element={<Suspense fallback={<PageLoader />}><TrialBalance /></Suspense>} />
                <Route path="/general-journal" element={<Suspense fallback={<PageLoader />}><GeneralJournal /></Suspense>} />
                <Route path="/fixed-assets" element={<Suspense fallback={<PageLoader />}><FixedAssets /></Suspense>} />
                <Route path="/reports" element={<Suspense fallback={<PageLoader />}><Reports /></Suspense>} />
                <Route path="/balance-sheet" element={<Suspense fallback={<PageLoader />}><BalanceSheet /></Suspense>} />
                <Route path="/balance-sheet-iiv" element={<Suspense fallback={<PageLoader />}><BalanceSheetIIV /></Suspense>} />
                <Route path="/income-statement" element={<Suspense fallback={<PageLoader />}><IncomeStatement /></Suspense>} />
                <Route path="/income-statement-iiv" element={<Suspense fallback={<PageLoader />}><IncomeStatementIIV /></Suspense>} />
                <Route path="/cash-flow" element={<Suspense fallback={<PageLoader />}><CashFlow /></Suspense>} />
                <Route path="/cash-flow-iiv" element={<Suspense fallback={<PageLoader />}><CashFlowIIV /></Suspense>} />
                <Route path="/changes-in-equity" element={<Suspense fallback={<PageLoader />}><ChangesInEquity /></Suspense>} />
                <Route path="/changes-in-equity-iiv" element={<Suspense fallback={<PageLoader />}><ChangesInEquityIIV /></Suspense>} />
                <Route path="/ifrs-notes" element={<Suspense fallback={<PageLoader />}><IFRSNotes /></Suspense>} />
                <Route path="/ifrs-notes-iiv" element={<Suspense fallback={<PageLoader />}><IFRSNotesIIV /></Suspense>} />
                <Route path="/budget" element={<Suspense fallback={<PageLoader />}><Budget /></Suspense>} />
                
                {/* Administration */}
                <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
                <Route path="/companies" element={<Suspense fallback={<PageLoader />}><Companies /></Suspense>} />
                <Route path="/users" element={<Suspense fallback={<PageLoader />}><Users /></Suspense>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </LayoutProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
