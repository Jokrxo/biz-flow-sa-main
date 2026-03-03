import { 
  LayoutDashboard,  
  Receipt, 
  FileText, 
  TrendingUp, 
  DollarSign, 
  Calculator,
  Users,
  PieChart,
  CreditCard,
  Building2,
  Building,
  Wallet,
  BookOpen,
  Settings,
  Shield,
  HelpCircle,
  AlertCircle,
  Scale,
  Banknote,
  ScrollText,
  Layers,
  ListChecks,
  Briefcase,
  LineChart,
  CalendarRange,
  Stamp,
  ArrowLeftRight,
  Landmark,
  ArrowUpRight,
  User
} from "lucide-react";

export const navGroups = [
  {
    title: "Transactions",
    icon: ArrowLeftRight,
    items: [
      { icon: Receipt, label: "Supplier Management", href: "/purchase" },
      { icon: TrendingUp, label: "Customer Management", href: "/sales" },
      { icon: FileText, label: "Items", href: "/inventory" },
      { icon: BookOpen, label: "Journals", href: "/journals" },
      { icon: AlertCircle, label: "Impairment", href: "/impairment" },
      { icon: Users, label: "Payroll", href: "/payroll" },
    ]
  },
  {
    title: "Banking",
    icon: Landmark,
    items: [
      { icon: Building, label: "Add Bank", href: "/bank" },
      { icon: FileText, label: "Bank Reconciliation", href: "/bank-reconciliation" },
      { icon: Calculator, label: "Bank Transactions", href: "/allocate" },
    ]
  },
  {
    title: "Financing",
    icon: DollarSign,
    items: [
      { icon: CreditCard, label: "Loan Management", href: "/loans/overview" },
      { icon: TrendingUp, label: "All Loans", href: "/loans/list" },
      { icon: ArrowUpRight, label: "Record Payment", href: "/loans/payments" },
      { icon: FileText, label: "Loan Reports", href: "/loans/reports" },
      { icon: Calculator, label: "Amortization", href: "/loans/amortization" },
      { icon: User, label: "Directors", href: "/loans/director" },
      { icon: PieChart, label: "Investment", href: "/investments" },
    ]
  },
  {
    title: "Tax management",
    icon: Stamp,
    items: [
      { icon: Receipt, label: "VAT201", href: "/tax" },
      { icon: ScrollText, label: "Corporate Tax", href: "/corporate-tax" },
      { icon: Users, label: "Employee Tax", href: "/employee-tax" },
    ]
  },
  {
    title: "Financial reporting",
    icon: LineChart,
    items: [
      { icon: Calculator, label: "Trial Balance", href: "/trial-balance" },
      { icon: BookOpen, label: "General Journal", href: "/general-journal" },
      { icon: Building2, label: "Fixed Assets Register", href: "/fixed-assets" },
      { icon: Scale, label: "Balance Sheet", href: "/balance-sheet-iiv" },
      { icon: FileText, label: "Income Statement", href: "/income-statement-iiv" },
      { icon: Banknote, label: "Cash Flow", href: "/cash-flow-iiv" },
      { icon: Layers, label: "Changes in Equity", href: "/changes-in-equity-iiv" },
      { icon: ScrollText, label: "IFRS Notes", href: "/ifrs-notes-iiv" },
      { icon: Wallet, label: "Budget Report", href: "/budget" },
    ]
  },
  {
    title: "Administration",
    icon: Briefcase,
    items: [
      { icon: Settings, label: "Settings", href: "/settings" },
      { icon: Building, label: "Organisation", href: "/companies" },
      { icon: Users, label: "Users", href: "/users" },
    ]
  },
];
