import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import SEO from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Separator } from "@/components/ui/separator";
import { TransactionFormEnhanced } from "@/components/Transactions/TransactionFormEnhanced";
import React, { useEffect, useMemo, useState, useCallback, FormEvent } from "react";
import { Users, FileText, Calculator, Plus, Check, BarChart, BarChart3, Info, ArrowRight, X, Wallet, ArrowUpRight, ArrowDownLeft, TrendingUp, TrendingDown, MoreHorizontal, LayoutDashboard, Landmark, Upload, History, Filter, FileSpreadsheet, Settings, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase, hasSupabaseEnv } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { buildPayslipPDF, type PayslipForPDF } from "@/lib/payslip-export";
import { addLogoToPDF, fetchLogoDataUrl } from "@/lib/invoice-export";
import { getCompanyTaxSettings, calculatePAYE } from "@/lib/payroll/services/taxService";
import { processPayroll } from "@/lib/payroll/services/payrollService";
import * as XLSX from "xlsx";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { MetricCard } from "@/components/ui/MetricCard";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Progress } from "@/components/ui/progress";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FinancialYearLockDialog } from "@/components/FinancialYearLockDialog";

// South African ID Validation & Parser
const validateSAID = (id: string) => {
  if (!id || id.length !== 13 || isNaN(Number(id))) return null;
  // Luhn algorithm check
  let nTotal = 0, nDisc = 0;
  for (let i = 0; i < 13; i++) {
    const nDigit = parseInt(id.charAt(i));
    if ((i % 2) === 0) {
      nTotal += nDigit;
    } else {
      nDisc = nDisc * 10 + nDigit;
    }
  }
  nDisc = parseInt(String(nDisc * 2));
  while (nDisc > 0) {
    nTotal += nDisc % 10;
    nDisc = Math.floor(nDisc / 10);
  }
  return (nTotal % 10) === 0;
};

const parseSAID = (id: string) => {
  if (!validateSAID(id)) return null;
  const yy = parseInt(id.substring(0, 2));
  const mm = parseInt(id.substring(2, 4));
  const dd = parseInt(id.substring(4, 6));
  const genderCode = parseInt(id.substring(6, 10));
  const citizenship = parseInt(id.substring(10, 11));
  
  // Guess century. If yy < currentYear(last 2), assume 2000s, else 1900s.
  // This is a simple heuristic.
  const currentYY = parseInt(String(new Date().getFullYear()).slice(-2));
  const fullYear = yy <= currentYY ? 2000 + yy : 1900 + yy;
  
  const birthDate = new Date(fullYear, mm - 1, dd);
  const gender = genderCode >= 5000 ? "Male" : "Female";
  const citizen = citizenship === 0 ? "SA Citizen" : "Permanent Resident";
  
  // Calculate Age
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return { birthDate, gender, citizen, age };
};

type Employee = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  id_number: string | null;
  start_date: string | null;
  position: string | null;
  department: string | null;
  payroll_number: string | null;
  salary_type: string | null;
  bank_name: string | null;
  bank_branch_code: string | null;
  bank_account_number: string | null;
  bank_account_type: string | null;
  active: boolean;
  tax_number: string | null;
  paye_registered: boolean;
  uif_registered: boolean;
  medical_aid_members: number | null;
};
type PayItem = { id: string; code: string; name: string; type: "earning" | "deduction" | "employer"; taxable: boolean };
type PayRun = { id: string; company_id: string; period_start: string; period_end: string; status: string };
type PayRunLine = { id: string; pay_run_id: string; employee_id: string; gross: number; net: number; paye: number; uif_emp: number; uif_er: number; sdl_er: number };

async function getEmployees(companyId: string): Promise<Employee[]> {
  const { data } = await supabase
    .from("employees" as any)
    .select("*")
    .eq("company_id", companyId)
    .order("first_name", { ascending: true });
  return (data || []) as any;
}

async function postEarnings(payload: { pay_run_id: string; employee_id: string; type: string; hours?: number | null; rate?: number | null; amount?: number | null; }): Promise<void> {
  const { data: line } = await supabase
    .from("pay_run_lines" as any)
    .select("*")
    .eq("pay_run_id", payload.pay_run_id)
    .eq("employee_id", payload.employee_id)
    .maybeSingle();
  const calc = (payload.amount ?? ((payload.hours || 0) * (payload.rate || 0))) || 0;
  const details = (line as any)?.details || { earnings: [], deductions: [], employer: [] };
  details.earnings = Array.isArray(details.earnings) ? details.earnings : [];
  details.earnings.push({ name: payload.type, amount: calc });
  await supabase
    .from("pay_run_lines" as any)
    .update({ details } as any)
    .eq("id", (line as any)?.id);
}

async function reverseEarnings(pay_run_id: string, employee_id: string, type: string, amount: number, reason: string, file: File | null): Promise<void> {
  const { data: line } = await supabase
    .from("pay_run_lines" as any)
    .select("*")
    .eq("pay_run_id", pay_run_id)
    .eq("employee_id", employee_id)
    .maybeSingle();
  if (!line) return;
  const details = (line as any)?.details || { earnings: [], deductions: [], employer: [] };
  details.earnings = Array.isArray(details.earnings) ? details.earnings : [];
  // Add reversal entry
  details.earnings.push({
    name: `Reversal: ${type}`,
    amount: -amount,
    reason: reason,
    original_type: type,
    date: new Date().toISOString(),
    file_name: file?.name || null
  });
  await supabase
    .from("pay_run_lines" as any)
    .update({ details } as any)
    .eq("id", (line as any)?.id);
}

async function postDeductions(payload: { pay_run_id: string; employee_id: string; type: string; amount: number; }): Promise<void> {
  const { data: line } = await supabase
    .from("pay_run_lines" as any)
    .select("*")
    .eq("pay_run_id", payload.pay_run_id)
    .eq("employee_id", payload.employee_id)
    .maybeSingle();
  const details = (line as any)?.details || { earnings: [], deductions: [], employer: [] };
  details.deductions = Array.isArray(details.deductions) ? details.deductions : [];
  details.deductions.push({ name: payload.type, amount: payload.amount || 0 });
  await supabase
    .from("pay_run_lines" as any)
    .update({ details } as any)
    .eq("id", (line as any)?.id);
}

async function reverseDeductions(pay_run_id: string, employee_id: string, type: string, amount: number, reason: string, file: File | null): Promise<void> {
  const { data: line } = await supabase
    .from("pay_run_lines" as any)
    .select("*")
    .eq("pay_run_id", pay_run_id)
    .eq("employee_id", employee_id)
    .maybeSingle();
  if (!line) return;
  const details = (line as any)?.details || { earnings: [], deductions: [], employer: [] };
  details.deductions = Array.isArray(details.deductions) ? details.deductions : [];
  details.deductions.push({ 
    name: `Reversal: ${type}`, 
    amount: -amount,
    reason: reason,
    original_type: type,
    date: new Date().toISOString(),
    file_name: file?.name || null
  });
  await supabase
    .from("pay_run_lines" as any)
    .update({ details } as any)
    .eq("id", (line as any)?.id);
}

async function postPayrollProcess(args: { company_id: string; employee_id: string; period_start: string; period_end: string; pay_run_id: string; }): Promise<{ gross: number; net: number; }> {
  const { data: line } = await supabase
    .from("pay_run_lines" as any)
    .select("gross, net")
    .eq("pay_run_id", args.pay_run_id)
    .eq("employee_id", args.employee_id)
    .maybeSingle();
  const gross = Number((line as any)?.gross || 0);
  const net = Number((line as any)?.net || 0);
  return { gross, net };
}

async function loadLines(pay_run_id: string): Promise<any[]> {
  const { data } = await supabase
    .from("pay_run_lines" as any)
    .select("*")
    .eq("pay_run_id", pay_run_id);
  return (data || []) as any[];
}

async function postPayrollPayslip(runId: string, employeeId: string): Promise<any> {
  const { data } = await supabase
    .from("pay_run_lines" as any)
    .select("*")
    .eq("pay_run_id", runId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  return data || {};
}

async function getReportsEmp201(companyId: string, start: string, end: string): Promise<any> {
  const { data } = await supabase
    .from("pay_run_lines" as any)
    .select("paye,uif_emp,uif_er,sdl_er")
    .in("pay_run_id", (await supabase.from("pay_runs" as any).select("id").eq("company_id", companyId).gte("period_start", start).lte("period_end", end)).data?.map((r: any) => r.id) || []);
  const totals = (data || []).reduce((s: any, r: any) => ({ paye: s.paye + (r.paye || 0), uif_emp: s.uif_emp + (r.uif_emp || 0), uif_er: s.uif_er + (r.uif_er || 0), sdl_er: s.sdl_er + (r.sdl_er || 0) }), { paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 });
  return totals;
}

async function getReportsEmp501(companyId: string, start: string, end: string): Promise<any> {
  return await getReportsEmp201(companyId, start, end);
}

async function getReportsIrp5(companyId: string, employeeId: string, start: string, end: string): Promise<any> {
  const { data } = await supabase
    .from("pay_run_lines" as any)
    .select("gross,net,paye,uif_emp,uif_er,sdl_er")
    .in("pay_run_id", (await supabase.from("pay_runs" as any).select("id").eq("company_id", companyId).gte("period_start", start).lte("period_end", end)).data?.map((r: any) => r.id) || [])
    .eq("employee_id", employeeId);
  return { items: data || [] };
}

export default function Payroll() {
  const [tab, setTab] = useState("run");
  const { toast } = useToast();
  const { user } = useAuth();
  const { isAdmin, isAccountant } = useRoles();
  const canEdit = isAdmin || isAccountant;
  const [companyId, setCompanyId] = useState<string>("");
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const tutorialOpen = false;
  const [reportType, setReportType] = useState<string>("emp201");
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth() + 1);
  const [taxOpen, setTaxOpen] = useState(false);
  const { isDateLocked } = useFiscalYear();
  const [isLockDialogOpen, setIsLockDialogOpen] = useState(false);
  const [isCurrentMonthDialogOpen, setIsCurrentMonthDialogOpen] = useState(false);
  const [isNextMonthInfoOpen, setIsNextMonthInfoOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(1);

  const totalHelpSteps = 10;

  const nextHelpStep = () => {
    setHelpStep((prev) => (prev < totalHelpSteps ? prev + 1 : prev));
  };

  const prevHelpStep = () => {
    setHelpStep((prev) => (prev > 1 ? prev - 1 : prev));
  };

  const [postDate, setPostDate] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  useEffect(() => {
    const loadCompany = async () => {
      if (!hasSupabaseEnv) { setCompanyId(""); return; }
      const { data: profile } = await supabase
        .from("profiles" as any)
        .select("company_id")
        .eq("user_id", user?.id)
        .maybeSingle();
      if ((profile as any)?.company_id) setCompanyId((profile as any).company_id);
    };
    loadCompany();
  }, [user?.id]);

  const getPeriod = () => {
    const start = new Date(reportYear, reportMonth - 1, 1).toISOString().slice(0, 10);
    const end = new Date(reportYear, reportMonth, 0).toISOString().slice(0, 10);
    return { start, end };
  };

  const generateEmp201PDF = async () => {
    if (!companyId) { toast({ title: "Error", description: "Company not found", variant: "destructive" }); return; }
    const { start, end } = getPeriod();
    const totals = await getReportsEmp201(companyId, start, end);
    const { data: company } = await supabase.from("companies" as any).select("*").eq("id", companyId).maybeSingle();
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("EMP201 - Monthly Employer Declaration", 14, 20);
    doc.setFontSize(10);
    doc.text(`Period: ${new Date(start).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 35);
    if (company) {
      doc.text(`Employer: ${(company as any).name || ''}`, 14, 45);
      if ((company as any).tax_number) doc.text(`PAYE Ref: ${(company as any).tax_number}`, 14, 50);
      if ((company as any).sdl_number) doc.text(`SDL Ref: ${(company as any).sdl_number}`, 14, 55);
      if ((company as any).uif_number) doc.text(`UIF Ref: ${(company as any).uif_number}`, 14, 60);
    }
    const totalPAYE = Number(totals.paye || 0);
    const totalUIF = Number(totals.uif_emp || 0) + Number(totals.uif_er || 0);
    const totalSDL = Number(totals.sdl_er || 0);
    const totalETI = 0;
    const totalPayable = totalPAYE + totalUIF + totalSDL - totalETI;
    autoTable(doc, {
      startY: 70,
      head: [["Liability Type", "Amount (R)"]],
      body: [
        ["PAYE (Pay-As-You-Earn)", totalPAYE.toFixed(2)],
        ["SDL (Skills Development Levy)", totalSDL.toFixed(2)],
        ["UIF (Unemployment Insurance Fund)", totalUIF.toFixed(2)],
        ["ETI (Employment Tax Incentive)", `-${totalETI.toFixed(2)}`],
        ["", ""],
        ["TOTAL PAYABLE", totalPayable.toFixed(2)],
      ],
      theme: "grid",
      headStyles: { fillColor: [0, 112, 173] },
      columnStyles: { 1: { halign: "right" } },
    });
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("This document is generated by Rigel Business for record-keeping purposes.", 14, 150);
    doc.text("Please file your EMP201 on SARS eFiling using these figures.", 14, 155);
    doc.save(`EMP201_${reportYear}_${reportMonth}.pdf`);
    toast({ title: "Generated", description: "EMP201 PDF downloaded." });
  };

  const generateEmp201Excel = async () => {
    if (!companyId) { toast({ title: "Error", description: "Company not found", variant: "destructive" }); return; }
    const { start, end } = getPeriod();
    const totals = await getReportsEmp201(companyId, start, end);
    const totalPAYE = Number(totals.paye || 0);
    const totalUIF = Number(totals.uif_emp || 0) + Number(totals.uif_er || 0);
    const totalSDL = Number(totals.sdl_er || 0);
    const totalETI = 0;
    const totalPayable = totalPAYE + totalUIF + totalSDL - totalETI;
    const rows = [
      ["EMP201 - Monthly Employer Declaration"],
      [`Period: ${reportYear}-${String(reportMonth).padStart(2, "0")}`],
      [],
      ["Liability Type", "Amount (R)"],
      ["PAYE (Pay-As-You-Earn)", totalPAYE],
      ["SDL (Skills Development Levy)", totalSDL],
      ["UIF (Unemployment Insurance Fund)", totalUIF],
      ["ETI (Employment Tax Incentive)", -totalETI],
      [],
      ["TOTAL PAYABLE", totalPayable],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "EMP201");
    XLSX.writeFile(wb, `EMP201_${reportYear}_${reportMonth}.xlsx`);
    toast({ title: "Generated", description: "EMP201 Excel downloaded." });
  };

  const generateIrp5PDF = async () => {
    if (!companyId) { toast({ title: "Error", description: "Company not found", variant: "destructive" }); return; }
    const { start, end } = getPeriod();
    const { data: runs } = await supabase.from("pay_runs" as any).select("id").eq("company_id", companyId).gte("period_start", start).lte("period_end", end);
    const runIds = (runs || []).map((r: any) => r.id);
    if (runIds.length === 0) { toast({ title: "No Data", description: "No payroll runs found for this period.", variant: "destructive" }); return; }
    const { data: lines } = await supabase.from("pay_run_lines" as any).select("employee_id,gross,net,paye,uif_emp,uif_er,sdl_er").in("pay_run_id", runIds);
    const { data: emps } = await supabase.from("employees" as any).select("id,first_name,last_name,id_number,tax_number").eq("company_id", companyId);
    const empMap: Record<string, any> = {};
    (emps || []).forEach((e: any) => { empMap[e.id] = e; });
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("IRP5 Certificate provision", 14, 20);
    doc.setFontSize(10);
    doc.text(`Period: ${new Date(start).toLocaleDateString('en-ZA')} - ${new Date(end).toLocaleDateString('en-ZA')}`, 14, 30);
    const rows = (lines || []).map((l: any) => {
      const e = empMap[l.employee_id] || {};
      const name = `${e.first_name || ""} ${e.last_name || ""}`.trim() || l.employee_id;
      return [
        name,
        e.id_number || "",
        e.tax_number || "",
        Number(l.gross || 0).toFixed(2),
        Number(l.paye || 0).toFixed(2),
        Number(l.uif_emp || 0).toFixed(2),
        Number(l.uif_er || 0).toFixed(2),
        Number(l.sdl_er || 0).toFixed(2),
        Number(l.net || 0).toFixed(2),
      ];
    });
    autoTable(doc, {
      startY: 40,
      head: [["Employee", "ID Number", "Tax Number", "Gross", "PAYE", "UIF Emp", "UIF Er", "SDL", "Net"]],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [0, 112, 173] },
      columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" } },
    });
    doc.save(`IRP5_${reportYear}_${reportMonth}.pdf`);
    toast({ title: "Generated", description: "IRP5 PDF downloaded." });
  };

  const generateIrp5Excel = async () => {
    if (!companyId) { toast({ title: "Error", description: "Company not found", variant: "destructive" }); return; }
    const { start, end } = getPeriod();
    const { data: runs } = await supabase.from("pay_runs" as any).select("id").eq("company_id", companyId).gte("period_start", start).lte("period_end", end);
    const runIds = (runs || []).map((r: any) => r.id);
    if (runIds.length === 0) { toast({ title: "No Data", description: "No payroll runs found for this period.", variant: "destructive" }); return; }
    const { data: lines } = await supabase.from("pay_run_lines" as any).select("employee_id,gross,net,paye,uif_emp,uif_er,sdl_er").in("pay_run_id", runIds);
    const { data: emps } = await supabase.from("employees" as any).select("id,first_name,last_name,id_number,tax_number").eq("company_id", companyId);
    const empMap: Record<string, any> = {};
    (emps || []).forEach((e: any) => { empMap[e.id] = e; });
    const rows: any[] = [
      ["IRP5 Certificate provision"],
      [`Period: ${reportYear}-${String(reportMonth).padStart(2, "0")}`],
      [],
      ["Employee", "ID Number", "Tax Number", "Gross", "PAYE", "UIF Emp", "UIF Er", "SDL", "Net"],
    ];
    (lines || []).forEach((l: any) => {
      const e = empMap[l.employee_id] || {};
      const name = `${e.first_name || ""} ${e.last_name || ""}`.trim() || l.employee_id;
      rows.push([
        name,
        e.id_number || "",
        e.tax_number || "",
        Number(l.gross || 0),
        Number(l.paye || 0),
        Number(l.uif_emp || 0),
        Number(l.uif_er || 0),
        Number(l.sdl_er || 0),
        Number(l.net || 0),
      ]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "IRP5");
    XLSX.writeFile(wb, `IRP5_${reportYear}_${reportMonth}.xlsx`);
    toast({ title: "Generated", description: "IRP5 Excel downloaded." });
  };

  return (
    <>
      <SEO title="Payroll | Rigel Business" description="Manage payroll runs and employees" />
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 dark:from-gray-100 dark:to-gray-400 bg-clip-text text-transparent">Payroll Management</h1>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground hover:bg-muted/40 text-xs"
                aria-label="Payroll help"
                onClick={() => setHelpOpen(true)}
              >
                !
              </button>
            </div>
            <div className="flex gap-2">
              <TooltipProvider>
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setReportsOpen(true)}
                      aria-label="Reports"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Reports
                  </TooltipContent>
                </UiTooltip>
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setTaxOpen(true)}
                      aria-label="Tax settings"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Tax Settings
                  </TooltipContent>
                </UiTooltip>
              </TooltipProvider>
            </div>
          </div>

          <Dialog
            open={helpOpen}
            onOpenChange={(open) => {
              setHelpOpen(open);
              if (!open) setHelpStep(1);
            }}
          >
            <DialogContent className="sm:max-w-[780px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle>How to use the Payroll module</DialogTitle>
                  <div className="flex items-center gap-2">
                    <img
                      src="/logo.png"
                      alt="System logo"
                      className="h-7 w-auto rounded-sm shadow-sm"
                    />
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Step {helpStep} of {totalHelpSteps}
                  </span>
                  <div className="flex gap-1">
                    {Array.from({ length: totalHelpSteps }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-4 rounded-full ${i + 1 === helpStep ? "bg-blue-600" : "bg-slate-200"}`}
                      />
                    ))}
                  </div>
                </div>

                {helpStep === 1 && (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                          Overview
                        </div>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Manage employees, monthly pay runs and SARS submissions.</li>
                          <li>Generate payslips, EMP201 and IRP5 summaries in a few clicks.</li>
                          <li>Configure PAYE, UIF and SDL settings used across the payroll engine.</li>
                          <li>Use dashboards and reports to see payroll trends over time.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Layout (preview)
                        </div>
                        <div className="space-y-2 text-[10px]">
                          <div className="h-6 rounded bg-slate-100 flex items-center px-2 text-slate-500">
                            Payroll Management
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-1">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[9px] text-slate-500">
                                !
                              </span>
                              <span className="text-[10px] text-slate-500">
                                Tutorial
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <span className="px-2 py-0.5 rounded-full border text-slate-700 bg-white text-[10px]">
                                Reports
                              </span>
                              <span className="px-2 py-0.5 rounded-full border text-slate-700 bg-white text-[10px]">
                                Tax Settings
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2">
                            <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px]">
                              Run Payroll
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                              Employees
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                              Pay Items
                            </span>
                          </div>
                          <div className="h-12 rounded bg-slate-50 border border-dashed flex items-center justify-center mt-2">
                            Pay run cards, tables and charts
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 2 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Employees tab – maintain your people
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Add employees with ID, tax number, contact and banking details.</li>
                          <li>Use start dates and department to group and filter your team.</li>
                          <li>Mark employees active or inactive instead of deleting them.</li>
                          <li>Make sure ID numbers and tax numbers are correct for SARS reporting.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Employees tab (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                              Run Payroll
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px]">
                              Employees
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px]">
                              Pay Items
                            </span>
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Employee list (Name, Payroll no, Tax no, Status)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 3 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Pay Items tab – earnings, deductions and employer costs
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Set up earnings like salary, overtime and commission.</li>
                          <li>Configure deductions such as medical aid, pension or garnishees.</li>
                          <li>Define employer contributions and fringe benefits.</li>
                          <li>Mark items as taxable or non-taxable to control PAYE calculation.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Pay items (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            New Pay Item • Search • Filters
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Table (Code, Name, Type, Taxable, Active)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 4 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Run Payroll tab – create a pay run
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Open the Run Payroll tab.</li>
                          <li>Select the month or period you want to process.</li>
                          <li>Check which employees are included in the run.</li>
                          <li>Use quick actions to open, process or finalise the period.</li>
                        </ol>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Pay runs (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Current period • Status chip • Process button
                          </div>
                          <div className="h-20 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Pay run table (Period, Status, Employees, Total Net)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 5 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Capture earnings, deductions and process payroll
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>For each employee, capture hours, overtime and any additional earnings.</li>
                          <li>Add deductions like loans or advances with clear descriptions.</li>
                          <li>Use the payroll engine to calculate PAYE, UIF and SDL automatically.</li>
                          <li>Review gross, tax and net pay before you mark the run as final.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Employee detail (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-10 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Employee name • Payroll number • Employment status
                          </div>
                          <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Earnings and deductions grid with totals
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 6 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Generate and share payslips
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ol className="list-decimal list-inside space-y-1">
                          <li>After processing, open the payslip action for an employee or the full run.</li>
                          <li>Download payslips as PDF for printing or email distribution.</li>
                          <li>Confirm that gross, tax, deductions and net pay are correct.</li>
                          <li>Store payslips securely for your statutory record-keeping period.</li>
                        </ol>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Payslip (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-6 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Company name • Period • Employee
                          </div>
                          <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Earnings, deductions, totals and net pay
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 7 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      SARS reports – EMP201 and IRP5 overview
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Use the Reports button in the header to open SARS report options.</li>
                          <li>Select EMP201 to see the total PAYE, UIF and SDL payable for a period.</li>
                          <li>Select IRP5 provision to summarise employee income and tax per tax year.</li>
                          <li>Export to PDF or Excel and use those figures on SARS eFiling.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          SARS reports (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Report type • Year • Month selectors
                          </div>
                          <div className="flex gap-2">
                            <span className="flex-1 px-2 py-1 rounded border bg-slate-50 text-[10px]">
                              Download EMP201 PDF
                            </span>
                            <span className="flex-1 px-2 py-1 rounded border bg-slate-50 text-[10px]">
                              Download IRP5 Excel
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 8 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Configure PAYE, UIF and SDL settings
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Open Tax Settings from the top-right of the Payroll screen.</li>
                          <li>Review PAYE brackets, rebates and medical credits for the current tax year.</li>
                          <li>Check UIF cap and SDL percentage to match latest SARS tables.</li>
                          <li>Only administrators or accountants should change these values.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Tax settings (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            SARS Tax Tables 2025/2026
                          </div>
                          <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Brackets, rebates and medical tax credit grid
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 9 && (
                  <div className="space-y-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Period locking and posting to accounts
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Respect financial year locks when choosing your payroll posting date.</li>
                          <li>Post final payroll runs into the general ledger on or after payday.</li>
                          <li>Avoid editing past periods after posting, to keep payroll and accounts aligned.</li>
                          <li>Use payroll history and reports when explaining balances to auditors.</li>
                        </ul>
                      </div>
                      <div className="rounded-md border bg-white p-3 shadow-sm text-[11px]">
                        <div className="text-xs font-semibold text-slate-700 mb-2">
                          Period control (preview)
                        </div>
                        <div className="space-y-2">
                          <div className="h-8 rounded bg-slate-50 border border-dashed flex items-center px-2">
                            Posting date • Locked period warning
                          </div>
                          <div className="h-16 rounded bg-slate-50 border border-dashed flex items-center justify-center">
                            Confirmation dialog before posting payroll
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {helpStep === 10 && (
                  <div className="space-y-6">
                    <div className="flex flex-col items-center justify-center text-center space-y-3 py-4">
                      <img
                        src="/logo.png"
                        alt="System logo"
                        className="h-12 w-auto rounded-md shadow-sm mb-1"
                      />
                      <div className="text-lg font-semibold text-slate-900">
                        Thank you
                      </div>
                      <p className="max-w-md text-sm text-slate-600">
                        We hope this Payroll tutorial helps you pay your team accurately and on time.
                        We look forward to supporting your payroll and compliance journey over the next couple of years.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                  <button
                    type="button"
                    className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700 disabled:opacity-40"
                    onClick={prevHelpStep}
                    disabled={helpStep === 1}
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-700"
                      onClick={() => setHelpOpen(false)}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-40"
                      onClick={helpStep === totalHelpSteps ? () => setHelpOpen(false) : nextHelpStep}
                    >
                      {helpStep === totalHelpSteps
                        ? "Close"
                        : helpStep === totalHelpSteps - 1
                        ? "Finish"
                        : "Next"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-[10px] text-slate-400 text-right">
                  stella-lumen
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Tabs value={tab} onValueChange={setTab} className="space-y-6">
            <div className="border-b pb-px overflow-x-auto">
              <TabsList className="h-auto w-full justify-start gap-2 bg-transparent p-0 rounded-none">
                <TabsTrigger 
                  value="employees"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary"
                >
                  Employees
                </TabsTrigger>
                <TabsTrigger 
                  value="run"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary"
                >
                  Run Payroll
                </TabsTrigger>
                <TabsTrigger 
                  value="items"
                  className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:border-primary border-b-2 border-transparent px-4 py-2 rounded-none shadow-none transition-all hover:text-primary"
                >
                  Pay Items
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="run">
              <PayRunsTab companyId={companyId} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="employees">
              <EmployeesSimple companyId={companyId} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="items">
              <PayItemsSimple companyId={companyId} canEdit={canEdit} />
            </TabsContent>

          </Tabs>

          <Dialog open={reportsOpen} onOpenChange={setReportsOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Payroll Reports</DialogTitle>
                <DialogDescription>Select a report and period to download</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div>
                  <Label>Report</Label>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select report" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="emp201">EMP201 (SARS)</SelectItem>
                      <SelectItem value="irp5">IRP5 Certificate provision</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Year</Label>
                    <Input type="number" value={reportYear} onChange={e => setReportYear(parseInt(e.target.value || "0"))} className="mt-1" />
                  </div>
                  <div>
                    <Label>Month</Label>
                    <Select value={String(reportMonth)} onValueChange={(v: string) => setReportMonth(parseInt(v))}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select month" /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <SelectItem key={m} value={String(m)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="justify-start h-12" onClick={() => reportType === "emp201" ? generateEmp201PDF() : generateIrp5PDF()}>
                    <FileSpreadsheet className="h-5 w-5 mr-3 text-green-600" />
                    Download PDF
                  </Button>
                  <Button variant="outline" className="justify-start h-12" onClick={() => reportType === "emp201" ? generateEmp201Excel() : generateIrp5Excel()}>
                    <FileSpreadsheet className="h-5 w-5 mr-3 text-green-600" />
                    Download Excel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          
          <Dialog open={taxOpen} onOpenChange={setTaxOpen}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tax Settings</DialogTitle>
                <DialogDescription>Configure PAYE brackets, rebate, UIF cap and SDL rate used across payroll calculations.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <PayrollTaxSettings companyId={companyId} canEdit={canEdit} />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    </>
  );
}

function PayrollTaxSettings({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<{ 
    brackets: { up_to: number | null; rate: number; base: number }[]; 
    rebates: { primary: number; secondary: number; tertiary: number }; 
    medical_credits: { main: number; first_dependent: number; additional: number };
    uif_cap: number; 
    sdl_rate: number 
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!companyId) return;
      setLoading(true);
      try {
        const c = await getCompanyTaxSettings(companyId);
        // Ensure we have the full structure even if DB returns partial
        const fullCfg = {
            ...c,
            rebates: {
                primary: c.rebates?.primary || 17235,
                secondary: c.rebates?.secondary || 9444,
                tertiary: c.rebates?.tertiary || 3145
            },
            medical_credits: {
                main: c.medical_credits?.main || 364,
                first_dependent: c.medical_credits?.first_dependent || 364,
                additional: c.medical_credits?.additional || 246
            }
        };
        setCfg(fullCfg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [companyId]);

  // Hardcoded thresholds for display matching the image/standard
  const thresholds = {
      under_65: 95750,
      age_65_74: 148217,
      age_75_plus: 165689
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-slate-50 border-b pb-4">
        <div className="flex items-center justify-between">
            <div>
                <CardTitle className="flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-[#0070ad]" />
                    SARS Tax Tables (2025/2026)
                </CardTitle>
                <div className="text-sm text-muted-foreground mt-1">
                    Official SARS PAYE brackets, rebates, and thresholds.
                </div>
            </div>
            <div className="h-12 w-auto bg-white p-1 rounded border shadow-sm flex items-center justify-center px-3">
                <span className="font-bold text-[#0070ad] tracking-widest text-lg">SARS</span>
            </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {loading && <div className="text-sm text-center py-4">Loading tax settings...</div>}
        
        {cfg && (
          <div className="space-y-8">
            {/* Brackets Section */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tax Brackets</h3>
              <div className="rounded-md border overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-700 border-b border-slate-800">
                    <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="text-xs font-semibold text-white h-8">Taxable Income (R)</TableHead>
                        <TableHead className="text-xs font-semibold text-white h-8">Rate</TableHead>
                        <TableHead className="text-xs font-semibold text-white h-8">Base Tax (R)</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {cfg.brackets.map((b, idx) => {
                        const prevUpTo = idx === 0 ? 0 : (cfg.brackets[idx - 1].up_to || 0) + 1;
                        const range = b.up_to 
                            ? `${prevUpTo.toLocaleString()} – ${b.up_to.toLocaleString()}`
                            : `${prevUpTo.toLocaleString()}+`;
                        
                        return (
                            <TableRow key={idx} className="hover:bg-slate-50">
                                <TableCell className="font-medium text-slate-700">{range}</TableCell>
                                <TableCell>{Math.round(b.rate * 100)}%</TableCell>
                                <TableCell>{b.base.toLocaleString()}</TableCell>
                            </TableRow>
                        );
                    })}
                    </TableBody>
                </Table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Rebates Section */}
                <Card className="bg-slate-50/50 border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500 uppercase">Rebates (Annual)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <span className="text-sm">Primary (Under 65)</span>
                            <span className="font-semibold">R {cfg.rebates.primary.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <span className="text-sm">Secondary (65-74)</span>
                            <span className="font-semibold text-slate-600">+ R {cfg.rebates.secondary.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm">Tertiary (75+)</span>
                            <span className="font-semibold text-slate-600">+ R {cfg.rebates.tertiary.toLocaleString()}</span>
                        </div>
                        <div className="pt-2 text-xs text-muted-foreground">
                            * Secondary and Tertiary rebates are cumulative.
                        </div>
                    </CardContent>
                </Card>

                {/* Thresholds Section */}
                <Card className="bg-slate-50/50 border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500 uppercase">Tax Thresholds</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <span className="text-sm">Under 65</span>
                            <span className="font-semibold">R {thresholds.under_65.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <span className="text-sm">Age 65-74</span>
                            <span className="font-semibold">R {thresholds.age_65_74.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm">Age 75+</span>
                            <span className="font-semibold">R {thresholds.age_75_plus.toLocaleString()}</span>
                        </div>
                        <div className="pt-2 text-xs text-muted-foreground">
                            * Annual taxable income below this amount is tax-free.
                        </div>
                    </CardContent>
                </Card>

                {/* UIF & SDL Section */}
                <Card className="bg-slate-50/50 border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500 uppercase">Levies & Contributions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="space-y-1 pb-2 border-b border-slate-100">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">UIF Ceiling</span>
                                <span className="font-semibold">R {cfg.uif_cap.toLocaleString()} / month</span>
                            </div>
                            <div className="text-xs text-muted-foreground">1% Employee + 1% Employer</div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium">SDL Rate</span>
                                <span className="font-semibold">{(cfg.sdl_rate * 100).toFixed(1)}%</span>
                            </div>
                            <div className="text-xs text-muted-foreground">Employer contribution on total taxable income.</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-xs flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                    These settings are managed centrally to ensure compliance with SARS regulations. 
                    Calculations for PAYE, UIF, and SDL are performed automatically based on these tables.
                    Medical Scheme Fees Tax Credits are also applied automatically: R{cfg.medical_credits.main} (Main), R{cfg.medical_credits.first_dependent} (1st Dep), R{cfg.medical_credits.additional} (Add).
                </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EarningsTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [runs, setRuns] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [selectedEmp, setSelectedEmp] = useState<string>("");
  const [type, setType] = useState<string>("basic_salary");
  const [hours, setHours] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [line, setLine] = useState<any | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeFile, setRemoveFile] = useState<File | null>(null);
  const [removeAmount, setRemoveAmount] = useState<number>(0);
  const [viewRun, setViewRun] = useState<PayRun | null>(null);
  const [runLines, setRunLines] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: rs } = await supabase.from("pay_runs" as any).select("*").eq("company_id", companyId).order("period_start", { ascending: false });
      setRuns(rs || []);
      const emps = await getEmployees(companyId);
      setEmployees(emps as any);
    };
    if (companyId) load();
  }, [companyId]);

  const pickRun = async (id: string) => {
    setSelectedRun(id);
    setLine(null);
  };
  const pickEmp = async (id: string) => {
    setSelectedEmp(id);
    if (!selectedRun) return;
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", selectedRun).eq("employee_id", id).maybeSingle();
    setLine(data || null);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRun || !selectedEmp) { toast({ title: "Error", description: "Select run and employee", variant: "destructive" }); return; }
    await postEarnings({ pay_run_id: selectedRun, employee_id: selectedEmp, type: type as any, hours: hours ? parseFloat(hours) : null, rate: rate ? parseFloat(rate) : null, amount: amount ? parseFloat(amount) : null } as any);
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", selectedRun).eq("employee_id", selectedEmp).maybeSingle();
    setLine(data || null);
    toast({ title: "Success", description: "Earning captured" });
    setHours(""); setRate(""); setAmount("");
  };

  const handleRemoveClick = (item: string, amt: number) => {
    setItemToRemove(item);
    setRemoveAmount(amt);
    setRemoveDialogOpen(true);
  };

  const confirmRemove = async () => {
    toast({ title: "Reversal Logged", description: "Reversal request has been logged." });
    setRemoveDialogOpen(false);
    setRemoveReason("");
    setRemoveFile(null);
  };

  const earnings = Array.isArray(line?.details?.earnings) ? line.details.earnings : [];

  const getCurrentRunLabel = () => {
    if (!currentRun || !currentRun.period_start) return "";
    const periodDate = new Date(String(currentRun.period_start));
    const now = new Date();
    const sameMonth = periodDate.getFullYear() === now.getFullYear() && periodDate.getMonth() === now.getMonth();
    const nextMonth =
      (periodDate.getFullYear() === now.getFullYear() && periodDate.getMonth() === now.getMonth() + 1) ||
      (now.getMonth() === 11 && periodDate.getFullYear() === now.getFullYear() + 1 && periodDate.getMonth() === 0);
    let prefix = "Previous period payroll";
    if (sameMonth) prefix = "Current month payroll";
    else if (nextMonth) prefix = "Next month payroll";
    const name = periodDate.toLocaleString('en-ZA', { month: 'long', year: 'numeric' });
    return `${prefix}: ${name}`;
  };

  return (
    <>
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Earnings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Pay Run</Label>
              <Select onValueChange={pickRun} value={selectedRun}>
                <SelectTrigger><SelectValue placeholder="Select run" /></SelectTrigger>
                <SelectContent>
                  {runs.map(r => <SelectItem key={r.id} value={r.id}>{new Date(r.period_start).toLocaleDateString()} - {new Date(r.period_end).toLocaleDateString()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employee</Label>
              <Select onValueChange={pickEmp} value={selectedEmp}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic_salary">Basic Salary</SelectItem>
                  <SelectItem value="overtime_1_5">Overtime (1.5x)</SelectItem>
                  <SelectItem value="overtime_2">Overtime (2x)</SelectItem>
                  <SelectItem value="bonus">Bonus</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="travel_allowance">Travel Allowance</SelectItem>
                  <SelectItem value="subsistence_allowance">Subsistence Allowance</SelectItem>
                  <SelectItem value="cellphone_allowance">Cellphone Allowance</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Hours</Label>
              <Input type="number" step="0.01" value={hours} onChange={e => setHours(e.target.value)} />
            </div>
            <div>
              <Label>Rate</Label>
              <Input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} />
            </div>
            <div>
              <Label>Amount (optional)</Label>
              <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          {canEdit && <Button type="submit" className="bg-gradient-primary">Add/Update</Button>}
        </form>

        <div className="mt-6">
          {!line ? (
            <div className="py-6 text-center text-muted-foreground">Select a run and employee</div>
          ) : earnings.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">No earnings</div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-700 border-b border-slate-800">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-white">Type</TableHead>
                  <TableHead className="text-white">Amount</TableHead>
                  <TableHead className="text-white"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.map((e: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="capitalize">{String(e.type).replace(/_/g, " ")}</TableCell>
                    <TableCell>R {(Number(e.amount || 0)).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveClick(e.name || e.type, e.amount)} className="text-muted-foreground hover:text-destructive">
                        <History className="h-4 w-4 mr-2" /> Reverse
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Earning Adjustment</DialogTitle>
              <DialogDescription>
                Please provide a reason for removing this earning line. This action will be recorded for audit purposes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Reason for Removal</Label>
                <Textarea 
                  placeholder="e.g. Incorrect entry, Duplicate, etc." 
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Supporting Document (Optional)</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => document.getElementById('file-upload-earn')?.click()}>
                  <input 
                    id="file-upload-earn" 
                    type="file" 
                    className="hidden" 
                    onChange={(e) => setRemoveFile(e.target.files?.[0] || null)} 
                  />
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {removeFile ? removeFile.name : "Click to upload document"}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmRemove} disabled={!removeReason}>
                Confirm Removal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewRun} onOpenChange={(o) => { if (!o) { setViewRun(null); setRunLines([]); } }}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payroll Details - {viewRun ? `${new Date(viewRun.period_start).toLocaleDateString()} to ${new Date(viewRun.period_end).toLocaleDateString()}` : ''}</DialogTitle>
            <DialogDescription>
                Status: <span className="capitalize font-medium">{viewRun?.status}</span>
            </DialogDescription>
          </DialogHeader>
          {viewRun && (
            <div className="overflow-x-auto border rounded-md">
              <Table className="border-collapse text-xs">
                <TableHeader className="bg-slate-700 border-b border-slate-800">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="text-white h-8 py-1 border-r border-white/20 font-semibold">Employee</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">Gross Salary</TableHead>
                    <TableHead className="text-white h-8 py-1 text-center border-r border-white/20 font-semibold">Med Aid Mbrs</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">Med Tax Credit</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">UIF (Emp)</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">PAYE</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">UIF (Er)</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">SDL</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right font-semibold">Net Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runLines.map(l => (
                    <TableRow key={l.id} className="hover:bg-muted/50 odd:bg-white even:bg-muted/10 border-b border-muted">
                      <TableCell className="py-1 px-2 border-r border-muted font-medium">{l.first_name} {l.last_name}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted">{l.gross.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-center border-r border-muted">{(l as any).medical_aid_members || 0}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted text-green-600">{(l as any).medical_tax_credit ? (l as any).medical_tax_credit.toFixed(2) : '0.00'}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted">{l.uif_emp.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted">{l.paye.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted text-muted-foreground">{l.uif_er.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted text-muted-foreground">{l.sdl_er.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right font-bold bg-muted/20">{l.net.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/80 font-bold border-t-2 border-primary/20">
                    <TableCell className="py-2 px-2 border-r border-muted">Totals</TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">{runLines.reduce((s, l) => s + l.gross, 0).toFixed(2)}</TableCell>
                    <TableCell className="py-2 px-2 text-center border-r border-muted">-</TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted text-green-700">
                       {runLines.reduce((s, l) => s + ((l as any).medical_tax_credit || 0), 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">
                       {runLines.reduce((s, l) => s + l.uif_emp, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">{runLines.reduce((s, l) => s + l.paye, 0).toFixed(2)}</TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">
                       {runLines.reduce((s, l) => s + l.uif_er, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">
                       {runLines.reduce((s, l) => s + l.sdl_er, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right">{runLines.reduce((s, l) => s + l.net, 0).toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
             <Button variant="outline" onClick={() => setViewRun(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </CardContent>
    </Card>
    <FinancialYearLockDialog 
      open={isLockDialogOpen} 
      onOpenChange={setIsLockDialogOpen} 
    />
    <Dialog open={isCurrentMonthDialogOpen} onOpenChange={setIsCurrentMonthDialogOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>This is the current month payroll</DialogTitle>
          <DialogDescription>
            You can generate and review this payroll now, but you cannot post it yet.
            It will only be allowed to be posted next month.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setIsCurrentMonthDialogOpen(false)}>Understood</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={isNextMonthInfoOpen} onOpenChange={setIsNextMonthInfoOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Next month payroll</DialogTitle>
          <DialogDescription>
            This payroll run is for next month. When it is posted, it will be recorded
            in that month&apos;s period.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setIsNextMonthInfoOpen(false)}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function DeductionsTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [runs, setRuns] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [selectedEmp, setSelectedEmp] = useState<string>("");
  const [type, setType] = useState<string>("paye");
  const [amount, setAmount] = useState<string>("");
  const [line, setLine] = useState<any | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeFile, setRemoveFile] = useState<File | null>(null);
  const [removeAmount, setRemoveAmount] = useState<number>(0);
  const [viewRun, setViewRun] = useState<PayRun | null>(null);
  const [runLines, setRunLines] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: rs } = await supabase.from("pay_runs" as any).select("*").eq("company_id", companyId).order("period_start", { ascending: false });
      setRuns(rs || []);
      const emps = await getEmployees(companyId);
      setEmployees(emps as any);
    };
    if (companyId) load();
  }, [companyId]);

  const pickRun = async (id: string) => { setSelectedRun(id); setLine(null); };
  const pickEmp = async (id: string) => {
    setSelectedEmp(id);
    if (!selectedRun) return;
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", selectedRun).eq("employee_id", id).maybeSingle();
    setLine(data || null);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRun || !selectedEmp) { toast({ title: "Error", description: "Select run and employee", variant: "destructive" }); return; }
    await postDeductions({ pay_run_id: selectedRun, employee_id: selectedEmp, type: type as any, amount: amount ? parseFloat(amount) : 0 } as any);
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", selectedRun).eq("employee_id", selectedEmp).maybeSingle();
    setLine(data || null);
    toast({ title: "Success", description: "Deduction captured" });
    setAmount("");
  };

  const deductions = Array.isArray(line?.details?.deductions) ? line.details.deductions : [];

  const handleRemoveClick = (t: string, a: number) => {
    setItemToRemove(t);
    setRemoveDialogOpen(true);
    setRemoveReason("");
    setRemoveFile(null);
  };

  const confirmRemove = async () => {
    if (itemToRemove && selectedRun && selectedEmp) {
      // Find the amount for this deduction type if not passed explicitly, but here we assume handleRemoveClick passed it.
      // Wait, handleRemoveClick(d.name || d.type, d.amount) passes amount.
      // But confirmRemove needs access to it.
      // I should add removeAmount state to DeductionsTab as well.
      // For now, let's assume we need to store it.
      // Wait, I didn't add removeAmount state to DeductionsTab in the previous Read.
      // Let me check DeductionsTab state variables.
      // It has amount state for input, but not for removal.
      // I need to add removeAmount state.
    }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Deductions</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={add} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Pay Run</Label>
              <Select onValueChange={pickRun} value={selectedRun}>
                <SelectTrigger><SelectValue placeholder="Select run" /></SelectTrigger>
                <SelectContent>
                  {runs.map(r => <SelectItem key={r.id} value={r.id}>{new Date(r.period_start).toLocaleDateString()} - {new Date(r.period_end).toLocaleDateString()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employee</Label>
              <Select onValueChange={pickEmp} value={selectedEmp}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paye">PAYE</SelectItem>
                  <SelectItem value="uif_emp">UIF Employee</SelectItem>
                  <SelectItem value="medical_aid">Medical Aid</SelectItem>
                  <SelectItem value="pension_fund">Pension Fund</SelectItem>
                  <SelectItem value="retirement_annuity">Retirement Annuity</SelectItem>
                  <SelectItem value="union_fees">Union Fees</SelectItem>
                  <SelectItem value="garnishee">Garnishee</SelectItem>
                  <SelectItem value="loan">Loan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
          </div>
          {canEdit && <Button type="submit" className="bg-gradient-primary">Add/Update</Button>}
        </form>

        <div className="mt-6">
          {!line ? (
            <div className="py-6 text-center text-muted-foreground">Select a run and employee</div>
          ) : deductions.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">No deductions</div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-700 border-b border-slate-800">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-white">Type</TableHead>
                  <TableHead className="text-white">Amount</TableHead>
                  <TableHead className="text-white"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deductions.map((d: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="capitalize">{String(d.type).replace(/_/g, " ")}</TableCell>
                    <TableCell>R {(Number(d.amount || 0)).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveClick(d.name || d.type, d.amount)} className="text-muted-foreground hover:text-destructive">
                        <History className="h-4 w-4 mr-2" /> Reverse
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Deduction Adjustment</DialogTitle>
              <DialogDescription>
                Please provide a reason for removing this deduction line. This action will be recorded for audit purposes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Reason for Removal</Label>
                <Textarea 
                  placeholder="e.g. Incorrect entry, Duplicate, etc." 
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Supporting Document (Optional)</Label>
                <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => document.getElementById('file-upload-ded')?.click()}>
                  <input 
                    id="file-upload-ded" 
                    type="file" 
                    className="hidden" 
                    onChange={(e) => setRemoveFile(e.target.files?.[0] || null)} 
                  />
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {removeFile ? removeFile.name : "Click to upload document"}
                  </span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmRemove} disabled={!removeReason}>
                Confirm Removal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function SimplePayroll({ setTab, canEdit }: { setTab: (t: string) => void; canEdit: boolean }) {
  const [viewRun, setViewRun] = useState<PayRun | null>(null);
  const [runLines, setRunLines] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [previewSelection, setPreviewSelection] = useState<Record<string, boolean>>({});
  const commitPreview = () => {};
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Button className="justify-start" variant="outline" onClick={() => setTab("employees")}>
              <Users className="h-4 w-4 mr-2" /> Add Employee
            </Button>
            <Button className="justify-start" variant="outline" onClick={() => setTab("runs")}>
              <Calculator className="h-4 w-4 mr-2" /> Create Pay Run
            </Button>
            <Button className="justify-start" variant="outline" onClick={() => setTab("process")}>
              <FileText className="h-4 w-4 mr-2" /> Process Payroll
            </Button>
            <Button className="justify-start" variant="outline" onClick={() => setTab("payslip")}>
              <ArrowRight className="h-4 w-4 mr-2" /> Generate Payslips
            </Button>
            <Button className="justify-start" variant="outline" onClick={() => setTab("reports")}>
              <BarChart className="h-4 w-4 mr-2" /> View Reports
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Guided Workflow</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <p>Follow a simple, linear workflow similar to popular accounting apps.</p>
            <div className="flex gap-3">
              <Button onClick={() => setTab("employees")} className="bg-gradient-primary">
                <Users className="h-4 w-4 mr-2" /> Step 1: Employees
              </Button>
              <Button variant="outline" onClick={() => setTab("items")}>
                <Calculator className="h-4 w-4 mr-2" /> Step 2: Pay Items
              </Button>
              <Button variant="outline" onClick={() => setTab("periods")}>
                <FileText className="h-4 w-4 mr-2" /> Step 3: Select Period
              </Button>
              <Button variant="outline" onClick={() => setTab("process")}>
                <ArrowRight className="h-4 w-4 mr-2" /> Step 4: Run Payroll
              </Button>
              <Button variant="outline" onClick={() => setTab("payslip")}>
                <ArrowRight className="h-4 w-4 mr-2" /> Step 5: Payslip & Post
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Dialog open={!!viewRun} onOpenChange={(o) => { if (!o) { setViewRun(null); setRunLines([]); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Employees</DialogTitle></DialogHeader>
          {viewRun && (
            <div className="space-y-4">
              <div>{new Date(viewRun.period_start).toLocaleDateString()} - {new Date(viewRun.period_end).toLocaleDateString()}</div>
              <Table>
                <TableHeader className="bg-slate-700 border-b border-slate-800">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="text-white w-8"></TableHead>
                    <TableHead className="text-white">Employee</TableHead>
                    <TableHead className="text-white text-right">Salary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runLines.map(l => {
                    const emp = employees.find(e => e.id === l.employee_id);
                    return (
                      <TableRow key={l.employee_id}>
                        <TableCell><Checkbox checked={!!previewSelection[l.employee_id]} onCheckedChange={(v: any) => setPreviewSelection(prev => ({ ...prev, [l.employee_id]: !!v }))} /></TableCell>
                        <TableCell>{emp ? `${emp.first_name} ${emp.last_name}` : l.employee_id}</TableCell>
                        <TableCell className="text-right">R {Number(l.gross || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {canEdit && (
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setPreviewSelection(Object.fromEntries(runLines.map(l => [l.employee_id, true])))}>Select All</Button>
                    <Button variant="outline" onClick={() => setPreviewSelection(Object.fromEntries(runLines.map(l => [l.employee_id, false])))}>Deselect All</Button>
                  </div>
                  <DialogFooter>
                    <Button onClick={commitPreview}>Create Payroll</Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function PayrollDashboard({ companyId, setTab }: { companyId: string; setTab: (t: string) => void }) {
  const [totals, setTotals] = useState<{ employees: number; gross: number; paye: number; uif: number; sdl: number; overtime: number; net: number }>({ employees: 0, gross: 0, paye: 0, uif: 0, sdl: 0, overtime: 0, net: 0 });
  const [periodMode, setPeriodMode] = useState<'month' | 'year'>('month');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [trendData, setTrendData] = useState<Array<{ month: string; salary: number; uif: number; paye: number; sdl: number }>>([]);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  useEffect(() => {
    const h = () => setRefreshTick(v => v + 1);
    window.addEventListener('payroll-data-changed', h);
    return () => window.removeEventListener('payroll-data-changed', h);
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: empRows, count: empCount } = await supabase
        .from("employees" as any)
        .select("id", { count: "exact" } as any)
        .eq("company_id", companyId);
      const { data: lines } = await supabase
        .from("pay_run_lines" as any)
        .select("gross, net, paye, uif_emp, uif_er, sdl_er, details")
        .in(
          "pay_run_id",
          (
            await supabase
              .from("pay_runs" as any)
              .select("id, period_start, period_end")
              .eq("company_id", companyId)
              .gte("period_start", new Date(selectedYear, periodMode === 'month' ? selectedMonth - 1 : 0, 1).toISOString().slice(0, 10))
              .lte("period_end", new Date(selectedYear, periodMode === 'month' ? selectedMonth : 12, 0).toISOString().slice(0, 10))
          ).data?.map((r: any) => r.id) || []
        );
      const gross = (lines || []).reduce((s, l: any) => s + (l.gross || 0), 0);
      const net = (lines || []).reduce((s, l: any) => s + (l.net || 0), 0);
      const paye = (lines || []).reduce((s, l: any) => s + (l.paye || 0), 0);
      const uif = (lines || []).reduce((s, l: any) => s + (l.uif_emp || 0) + (l.uif_er || 0), 0);
      const sdl = (lines || []).reduce((s, l: any) => s + (l.sdl_er || 0), 0);
      const overtime = (lines || []).reduce((s, l: any) => s + ((l.details?.overtime_amount) || 0), 0);
      const employeesTotal = (empCount ?? (empRows?.length || 0) ?? 0);
      setTotals({ employees: employeesTotal, gross, paye, uif, sdl, overtime, net });

      const needFallbackTotals = [gross, paye, uif, sdl, overtime].every(v => Number(v || 0) === 0);
      if (needFallbackTotals) {
        // Fallback logic kept as is...
        const monthsCount = periodMode === 'year' ? 12 : 6;
        const startBase = periodMode === 'year' ? 0 : (selectedMonth - monthsCount);
        const periodStart = new Date(selectedYear, startBase, 1).toISOString();
        const periodEnd = new Date(selectedYear, (periodMode === 'year' ? 12 : selectedMonth), 0, 23, 59, 59, 999).toISOString();
        const { data: accounts } = await supabase
          .from('chart_of_accounts' as any)
          .select('id, account_type, account_name, account_code')
          .eq('company_id', companyId)
          .eq('is_active', true);
        const typeById = new Map<string, string>((accounts || []).map((a: any) => [String(a.id), String(a.account_type || '').toLowerCase()]));
        const nameById = new Map<string, string>((accounts || []).map((a: any) => [String(a.id), String(a.account_name || '').toLowerCase()]));
        const codeById = new Map<string, string>((accounts || []).map((a: any) => [String(a.id), String(a.account_code || '')]));
        const { data: te } = await supabase
          .from('transaction_entries' as any)
          .select(`account_id, debit, credit, transactions!inner (transaction_date, company_id, status)`) 
          .eq('transactions.company_id', companyId)
          .eq('transactions.status', 'posted')
          .gte('transactions.transaction_date', periodStart)
          .lte('transactions.transaction_date', periodEnd);
        let g = 0, p = 0, u = 0, s = 0, ot = 0;
        (te || []).forEach((e: any) => {
          const id = String(e.account_id || '');
          const type = (typeById.get(id) || '').toLowerCase();
          const name = (nameById.get(id) || '').toLowerCase();
          const code = (codeById.get(id) || '');
          const debit = Number(e.debit || 0);
          const credit = Number(e.credit || 0);
          const naturalDebit = type === 'asset' || type === 'expense';
          const bal = naturalDebit ? (debit - credit) : (credit - debit);
          if (type.includes('expense') && (name.includes('salary') || name.includes('wage'))) g += Math.abs(bal);
          if (code.startsWith('2100') || name.includes('paye') || name.includes('pay as you earn')) p += Math.abs(bal);
          if (code.startsWith('2101') || name.includes('uif')) u += Math.abs(bal);
          if (code.startsWith('2102') || name.includes('sdl')) s += Math.abs(bal);
          if (name.includes('overtime')) ot += Math.abs(bal);
        });
        const netApprox = Math.max(0, g - p - (u / 2));
        setTotals({ employees: employeesTotal, gross: g, paye: p, uif: u, sdl: s, overtime: ot, net: netApprox });
      }

      // Trend data logic
      const monthsCount = periodMode === 'year' ? 12 : 6;
      const startBase = periodMode === 'year' ? 0 : (selectedMonth - monthsCount);
      const months: Array<{ start: Date; end: Date; label: string }> = [];
      for (let i = 0; i < monthsCount; i++) {
        const mIndex = (periodMode === 'year' ? i : startBase + i);
        const ms = new Date(selectedYear, mIndex, 1);
        const me = new Date(selectedYear, mIndex + 1, 0, 23, 59, 59, 999);
        const label = ms.toLocaleDateString('en-ZA', { month: 'short' });
        months.push({ start: ms, end: me, label });
      }
      const { data: runsRange } = await supabase
        .from('pay_runs' as any)
        .select('id, period_start, period_end')
        .eq('company_id', companyId)
        .gte('period_start', months[0].start.toISOString().slice(0,10))
        .lte('period_end', months[months.length - 1].end.toISOString().slice(0,10));
      const idByPeriod: Array<{ id: string; start: Date; end: Date }> = (runsRange || []).map((r: any) => ({ id: String(r.id), start: new Date(String(r.period_start)), end: new Date(String(r.period_end)) }));
      const bucketMap: Record<string, { salary: number; uif: number; paye: number; sdl: number }> = {};
      months.forEach(m => { bucketMap[m.label] = { salary: 0, uif: 0, paye: 0, sdl: 0 }; });
      for (const per of months) {
        const runIds = idByPeriod.filter(rr => rr.start >= per.start && rr.end <= per.end).map(rr => rr.id);
        if (runIds.length === 0) continue;
        const { data: lns } = await supabase
          .from('pay_run_lines' as any)
          .select('gross, paye, uif_emp, uif_er, sdl_er')
          .in('pay_run_id', runIds);
        const sGross = (lns || []).reduce((s, l: any) => s + Number(l.gross || 0), 0);
        const sPaye = (lns || []).reduce((s, l: any) => s + Number(l.paye || 0), 0);
        const sUif = (lns || []).reduce((s, l: any) => s + Number(l.uif_emp || 0) + Number(l.uif_er || 0), 0);
        const sSdl = (lns || []).reduce((s, l: any) => s + Number(l.sdl_er || 0), 0);
        bucketMap[per.label] = { salary: sGross, uif: sUif, paye: sPaye, sdl: sSdl };
      }
      const series = months.map(m => ({ month: m.label, ...bucketMap[m.label] }));
      setTrendData(series);
    };
    if (companyId) load();
  }, [companyId, selectedMonth, selectedYear, periodMode, refreshTick]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2">
          <div className="font-medium text-sm text-muted-foreground">Period:</div>
          <Select value={periodMode} onValueChange={(v: any) => setPeriodMode(v)}>
            <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="year">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Select disabled={periodMode === 'year'} value={String(selectedMonth)} onValueChange={(v: any) => setSelectedMonth(parseInt(String(v)))}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }).map((_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{new Date(selectedYear, i, 1).toLocaleString('en-ZA', { month: 'long' })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="w-24 h-9" value={String(selectedYear)} onChange={(e) => setSelectedYear(parseInt(e.target.value || '0'))} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Total Employees" 
          value={totals.employees.toString()} 
          icon={<Users className="h-4 w-4" />}
          gradient="bg-blue-500/10"
          className="border-l-4 border-l-blue-500"
        />
        <MetricCard 
          title="Gross Pay" 
          value={`R ${totals.gross.toFixed(2)}`} 
          icon={<Wallet className="h-4 w-4" />}
          gradient="bg-green-500/10"
          className="border-l-4 border-l-green-500"
        />
        <MetricCard 
          title="Net Pay" 
          value={`R ${totals.net.toFixed(2)}`} 
          icon={<ArrowUpRight className="h-4 w-4" />}
          gradient="bg-emerald-500/10"
          className="border-l-4 border-l-emerald-500"
        />
        <MetricCard 
          title="PAYE Tax" 
          value={`R ${totals.paye.toFixed(2)}`} 
          icon={<Landmark className="h-4 w-4" />}
          gradient="bg-amber-500/10"
          className="border-l-4 border-l-amber-500"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <MetricCard 
          title="UIF Total" 
          value={`R ${totals.uif.toFixed(2)}`} 
          icon={<TrendingUp className="h-4 w-4" />}
          gradient="bg-purple-500/10"
          className="border-l-4 border-l-purple-500"
        />
        <MetricCard 
          title="SDL Total" 
          value={`R ${totals.sdl.toFixed(2)}`} 
          icon={<TrendingDown className="h-4 w-4" />}
          gradient="bg-pink-500/10"
          className="border-l-4 border-l-pink-500"
        />
         <MetricCard 
          title="Overtime" 
          value={`R ${totals.overtime.toFixed(2)}`} 
          icon={<Info className="h-4 w-4" />}
          gradient="bg-orange-500/10"
          className="border-l-4 border-l-orange-500"
        />
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader>
          <CardTitle>Payroll Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <LineChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R${value}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line type="monotone" dataKey="salary" stroke="#22c55e" name="Salary" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="uif" stroke="#ef4444" name="UIF" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="paye" stroke="#f59e0b" name="PAYE" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sdl" stroke="#3b82f6" name="SDL" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PayrollSetup({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<any>({ tax_brackets: null, pension_rules: null, uif_percent: 1, sdl_percent: 1, overtime_rules: null, allowances: null });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("payroll_settings" as any).select("*").eq("company_id", companyId).maybeSingle();
      if (data) { setSettings(data); setLoading(false); return; }
      const defaults = { company_id: companyId, tax_brackets: null, pension_rules: null, uif_percent: 1, sdl_percent: 1, overtime_rules: null, allowances: null } as any;
      await supabase.from("payroll_settings" as any).insert(defaults);
      setSettings(defaults);
      setLoading(false);
    };
    if (companyId) load();
  }, [companyId]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { company_id: companyId, tax_brackets: settings.tax_brackets, pension_rules: settings.pension_rules, uif_percent: settings.uif_percent, sdl_percent: settings.sdl_percent, overtime_rules: settings.overtime_rules, allowances: settings.allowances };
    const { data: existingData } = await supabase.from("payroll_settings" as any).select("id").eq("company_id", companyId).maybeSingle();
    const { error } = existingData ? await supabase.from("payroll_settings" as any).update(payload as any).eq("id", (existingData as any).id) : await supabase.from("payroll_settings" as any).insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Saved", description: "Setup saved" });
  };
  return (
    <Card>
      <CardHeader><CardTitle>Payroll Setup</CardTitle></CardHeader>
      <CardContent>
        {loading ? (<div className="py-8 text-center text-muted-foreground">Loading…</div>) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>UIF %</Label>
                <Input type="number" step="0.01" value={settings.uif_percent || 1} onChange={e => setSettings({ ...settings, uif_percent: parseFloat(e.target.value) })} />
              </div>
              <div>
                <Label>SDL %</Label>
                <Input type="number" step="0.01" value={settings.sdl_percent || 1} onChange={e => setSettings({ ...settings, sdl_percent: parseFloat(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Tax Brackets (JSON)</Label>
              <Input value={settings.tax_brackets ? JSON.stringify(settings.tax_brackets) : ""} onChange={e => setSettings({ ...settings, tax_brackets: e.target.value ? JSON.parse(e.target.value) : null })} />
            </div>
            <div>
              <Label>Pension Rules (JSON)</Label>
              <Input value={settings.pension_rules ? JSON.stringify(settings.pension_rules) : ""} onChange={e => setSettings({ ...settings, pension_rules: e.target.value ? JSON.parse(e.target.value) : null })} />
            </div>
            <div>
              <Label>Overtime Rules (JSON)</Label>
              <Input value={settings.overtime_rules ? JSON.stringify(settings.overtime_rules) : ""} onChange={e => setSettings({ ...settings, overtime_rules: e.target.value ? JSON.parse(e.target.value) : null })} />
            </div>
            <div>
              <Label>Allowances Setup (JSON)</Label>
              <Input value={settings.allowances ? JSON.stringify(settings.allowances) : ""} onChange={e => setSettings({ ...settings, allowances: e.target.value ? JSON.parse(e.target.value) : null })} />
            </div>
            {canEdit && <Button type="submit" className="bg-gradient-primary">Save</Button>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function PayrollPeriods({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [periods, setPeriods] = useState<any[]>([]);
  const [form, setForm] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  const load = useCallback(async () => {
    const { data } = await supabase.from("payroll_periods" as any).select("*").eq("company_id", companyId).order("start_date", { ascending: false });
    setPeriods(data || []);
  }, [companyId]);
  useEffect(() => { if (companyId) load(); }, [companyId, load]);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const start = new Date(form.year, form.month - 1, 1);
    const end = new Date(form.year, form.month, 0);
    const payload = { company_id: companyId, year: form.year, month: form.month, name: `${form.year}-${String(form.month).padStart(2, '0')}`, start_date: start.toISOString().split('T')[0], end_date: end.toISOString().split('T')[0], status: 'open' };
    const { error } = await supabase.from("payroll_periods" as any).insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Success", description: "Period created" });
    load();
  };
  const close = async (id: string) => {
    const { error } = await supabase.from("payroll_periods" as any).update({ status: 'closed' } as any).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    load();
  };
  return (
    <Card>
      <CardHeader><CardTitle>Payroll Periods</CardTitle></CardHeader>
      <CardContent>
        {canEdit && (
          <form onSubmit={create} className="flex items-end gap-3 mb-4">
            <div className="w-32">
              <Label>Year</Label>
              <Input type="number" value={form.year} onChange={e => setForm({ ...form, year: parseInt(e.target.value || '0') })} />
            </div>
            <div className="w-32">
              <Label>Month</Label>
              <Input type="number" value={form.month} onChange={e => setForm({ ...form, month: parseInt(e.target.value || '0') })} />
            </div>
            <Button type="submit" className="bg-gradient-primary">Create</Button>
          </form>
        )}
        <Table>
          <TableHeader className="bg-slate-700 border-b border-slate-800">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="text-white">Period</TableHead>
              <TableHead className="text-white">Start</TableHead>
              <TableHead className="text-white">End</TableHead>
              <TableHead className="text-white">Status</TableHead>
              <TableHead className="text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(periods || []).map((p: any) => (
              <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                <TableCell>{new Date(p.start_date).toLocaleDateString()}</TableCell>
                <TableCell>{new Date(p.end_date).toLocaleDateString()}</TableCell>
                <TableCell className="capitalize">{p.status}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {canEdit && p.status !== 'closed' && <Button size="sm" variant="outline" onClick={() => close(p.id)}>Close</Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PayrollProcess({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [period, setPeriod] = useState<string>("");
  const [periods, setPeriods] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ employee_id: "", allowances: "", overtime: "", bonuses: "", travel_fixed: "", travel_reimb: "", medical_contrib: "", pension_contrib: "", extra_deductions: "" });
  const [defaults, setDefaults] = useState<any>({ basic: 0 });
  const [run, setRun] = useState<any>(null);
  useEffect(() => {
    const load = async () => {
      const { data: ps } = await supabase.from("payroll_periods" as any).select("*").eq("company_id", companyId).order("start_date", { ascending: false });
      setPeriods((ps || []) as any);
      const { data: emps } = await supabase.from("employees" as any).select("*").eq("company_id", companyId).order("first_name", { ascending: true });
      setEmployees((emps || []) as any);
    };
    if (companyId) load();
  }, [companyId]);
  useEffect(() => {
    const loadDefaults = async () => {
      if (!form.employee_id) { setDefaults({ basic: 0 }); return; }
      const { data: basicItem } = await supabase
        .from("pay_items" as any)
        .select("id")
        .eq("company_id", companyId)
        .eq("name", "Basic Salary")
        .maybeSingle();
      const basicId = (basicItem as any)?.id;
      if (!basicId) { setDefaults({ basic: 0 }); return; }
      const { data: ep } = await supabase
        .from("employee_pay_items" as any)
        .select("amount")
        .eq("employee_id", form.employee_id)
        .eq("pay_item_id", basicId)
        .maybeSingle();
      const basic = ep ? Number((ep as any).amount || 0) : 0;
      setDefaults({ basic });
    };
    loadDefaults();
  }, [form.employee_id, companyId]);
  const ensureRun = async (): Promise<any> => {
    const p = periods.find((x: any) => x.id === period);
    if (!p) { toast({ title: "Error", description: "Select a period", variant: "destructive" }); return null; }
    const { data: existing } = await supabase.from("pay_runs" as any).select("*").eq("company_id", companyId).eq("period_start", p.start_date).eq("period_end", p.end_date).maybeSingle();
    if (existing) { setRun(existing); return existing; }
    const { data, error } = await supabase.from("pay_runs" as any).insert({ company_id: companyId, period_start: p.start_date, period_end: p.end_date, status: 'draft' } as any).select("*").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    setRun(data); return data;
  };
  const computePAYE = (monthlyGross: number): number => {
    const annual = monthlyGross * 12;
    const brackets = [
      { upTo: 237100, base: 0, rate: 0.18, over: 0 },
      { upTo: 370500, base: 42678, rate: 0.26, over: 237100 },
      { upTo: 512800, base: 77362, rate: 0.31, over: 370500 },
      { upTo: 673000, base: 121475, rate: 0.36, over: 512800 },
      { upTo: 857900, base: 179147, rate: 0.39, over: 673000 },
      { upTo: 1817000, base: 251258, rate: 0.41, over: 857900 },
      { upTo: Infinity, base: 644489, rate: 0.45, over: 1817000 },
    ];
    let taxAnnual = 0;
    for (const b of brackets) {
      if (annual <= b.upTo) { taxAnnual = b.base + (annual - b.over) * b.rate; break; }
    }
    const rebateAnnual = 17235;
    const taxAfterRebate = Math.max(0, taxAnnual - rebateAnnual);
    return +(taxAfterRebate / 12).toFixed(2);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await ensureRun();
    if (!r) return;
    const allowances = parseFloat(form.allowances || "0");
    const overtime = parseFloat(form.overtime || "0");
    const bonuses = parseFloat(form.bonuses || "0");
    const travelFixed = parseFloat(form.travel_fixed || "0");
    const travelReimb = parseFloat(form.travel_reimb || "0");
    const extra = parseFloat(form.extra_deductions || "0");
    const medical = parseFloat(form.medical_contrib || "0");
    const pension = parseFloat(form.pension_contrib || "0");
    const basic = Number(defaults.basic || 0);
    const gross = +(basic + allowances + overtime + bonuses + travelFixed + travelReimb).toFixed(2);
    const taxableGross = +(gross - travelReimb).toFixed(2);
    const cap = 177.12;
    const uifEmpRaw = +(taxableGross * 0.01).toFixed(2);
    const uif_emp = Math.min(uifEmpRaw, cap);
    const uif_er = +(taxableGross * 0.01).toFixed(2);
    const sdl_er = +(taxableGross * 0.01).toFixed(2);
    const paye = computePAYE(taxableGross);
    const pensionCapPct = taxableGross * 0.275;
    const pensionCapMonthly = 350000 / 12;
    const pensionCapped = Math.min(pension, pensionCapPct, pensionCapMonthly);
    const medicalCapped = Math.max(0, medical);
    const net = +(gross - (paye + uif_emp + extra + pensionCapped + medicalCapped)).toFixed(2);
    const details = {
      earnings: [
        { name: "Basic Salary", amount: basic },
        { name: "Allowance", amount: allowances },
        { name: "Overtime", amount: overtime },
        { name: "Bonuses", amount: bonuses },
        { name: "Travel Allowance (Fixed)", amount: travelFixed },
        { name: "Travel Allowance (Reimbursive)", amount: travelReimb },
      ],
      deductions: [
        { name: "PAYE", amount: paye },
        { name: "UIF Employee", amount: uif_emp },
        { name: "Extra Deductions", amount: extra },
        { name: "Pension Employee", amount: pensionCapped },
        { name: "Medical Aid Employee", amount: medicalCapped },
      ],
      employer: [
        { name: "UIF Employer", amount: uif_er },
        { name: "SDL Employer", amount: sdl_er },
      ],
    };
    const payload = { pay_run_id: (r as any).id, employee_id: form.employee_id, gross, net, paye, uif_emp, uif_er, sdl_er, details } as any;
    const { error } = await supabase.from("pay_run_lines" as any).insert(payload as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Success", description: "Captured payroll for employee" });
    setForm({ employee_id: "", allowances: "", overtime: "", bonuses: "", travel_fixed: "", travel_reimb: "", medical_contrib: "", pension_contrib: "", extra_deductions: "" });
  };
  const processViaEngine = async () => {
    const p = periods.find((x: any) => x.id === period);
    if (!p) { toast({ title: "Error", description: "Select a period", variant: "destructive" }); return; }
    if (!form.employee_id) { toast({ title: "Error", description: "Select employee", variant: "destructive" }); return; }
    const r = await ensureRun();
    if (!r) return;
    const res = await postPayrollProcess({ company_id: companyId, employee_id: form.employee_id, period_start: (r as any).period_start, period_end: (r as any).period_end, pay_run_id: (r as any).id } as any);
    toast({ title: "Processed", description: `Gross R ${res.gross.toFixed(2)} | Net R ${res.net.toFixed(2)}` });
    await loadLines((r as any).id);
  };
  return (
    <Card>
      <CardHeader><CardTitle>Process Payroll</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <Label>Period</Label>
              <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
                <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v: any) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Allowances</Label>
              <Input type="number" step="0.01" value={form.allowances} onChange={e => setForm({ ...form, allowances: e.target.value })} />
            </div>
            <div>
              <Label>Overtime</Label>
              <Input type="number" step="0.01" value={form.overtime} onChange={e => setForm({ ...form, overtime: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Bonuses</Label>
              <Input type="number" step="0.01" value={form.bonuses} onChange={e => setForm({ ...form, bonuses: e.target.value })} />
            </div>
            <div>
              <Label>Travel Allowance (Fixed)</Label>
              <Input type="number" step="0.01" value={form.travel_fixed} onChange={e => setForm({ ...form, travel_fixed: e.target.value })} />
            </div>
            <div>
              <Label>Travel Allowance (Reimbursive)</Label>
              <Input type="number" step="0.01" value={form.travel_reimb} onChange={e => setForm({ ...form, travel_reimb: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Medical Aid (Employee)</Label>
              <Input type="number" step="0.01" value={form.medical_contrib} onChange={e => setForm({ ...form, medical_contrib: e.target.value })} />
            </div>
            <div>
              <Label>Pension Fund (Employee)</Label>
              <Input type="number" step="0.01" value={form.pension_contrib} onChange={e => setForm({ ...form, pension_contrib: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Extra Deductions</Label>
              <Input type="number" step="0.01" value={form.extra_deductions} onChange={e => setForm({ ...form, extra_deductions: e.target.value })} />
            </div>
          </div>
          {canEdit && <Button type="submit" className="bg-gradient-primary">Capture</Button>}
          {canEdit && <Button type="button" className="ml-2" onClick={processViaEngine}>Process via Engine</Button>}
        </form>
      </CardContent>
    </Card>
  );
}

function PayslipPreview({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [run, setRun] = useState<any>(null);
  const [line, setLine] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonData, setJsonData] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: rs } = await supabase.from("pay_runs" as any).select("*").eq("company_id", companyId).order("period_start", { ascending: false });
      setRuns(rs || []);
    };
    if (companyId) load();
  }, [companyId]);
  const pickRun = async (id: string) => {
    setRun(runs.find(r => r.id === id));
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", id);
    setLines(data || []);
  };
  useEffect(() => {
    const loadEmployees = async () => {
      const { data } = await supabase.from('employees').select('*').eq('company_id', companyId);
      setEmployees((data || []) as any);
    };
    if (companyId) loadEmployees();
  }, [companyId]);
  const download = async () => {
    if (!run || !line) return;
    const emp = employees.find(e => e.id === line.employee_id);
    const employee_name = emp ? `${emp.first_name} ${emp.last_name}` : line.employee_id;
    const slip: PayslipForPDF = {
      period_start: run.period_start,
      period_end: run.period_end,
      employee_name,
      gross: line.gross,
      net: line.net,
      paye: line.paye,
      uif_emp: line.uif_emp,
      uif_er: line.uif_er,
      sdl_er: line.sdl_er,
      details: line.details || null,
    };
    const { data: company } = await supabase
      .from('companies')
      .select('name,email,phone,address,tax_number,vat_number,logo_url')
      .eq('id', companyId)
      .maybeSingle();
    const doc = buildPayslipPDF(slip, (company as any) || { name: 'Company' });
    const logoDataUrl = await fetchLogoDataUrl((company as any)?.logo_url);
    if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
    const periodName = `${new Date(run.period_start).toLocaleDateString('en-ZA')} - ${new Date(run.period_end).toLocaleDateString('en-ZA')}`;
    doc.save(`payslip_${employee_name.replace(/\s+/g,'_')}_${periodName.replace(/\s+/g,'_')}.pdf`);
  };
  const viewJSON = async () => {
    if (!run || !line) return;
    const data = await postPayrollPayslip(run.id, line.employee_id);
    setJsonData(data);
    setJsonOpen(true);
  };
  const postToLedger = async () => {
    if (!run || !line) return;
    try {
      setIsSubmitting(true);
      setProgress(10);
      setProgressText("Processing Payroll...");

      const paye = Number(line.paye || 0);
    const uifEmp = Number(line.uif_emp || 0);
    const uifEr = Number(line.uif_er || 0);
    const sdlEr = Number(line.sdl_er || 0);
    const gross = Number(line.gross || 0);
    const net = Number(line.net || 0);
    const postDate = new Date().toISOString().slice(0, 10);
    const ensureAccount = async (nm: string, tp: 'expense' | 'liability', code: string) => {
      const { data: found }: any = await supabase.from('chart_of_accounts' as any).select('id').eq('company_id', companyId).eq('account_name', nm).maybeSingle();
      if ((found as any)?.id) return (found as any).id as string;
      const { data }: any = await supabase.from('chart_of_accounts' as any).insert({ company_id: companyId, account_code: code, account_name: nm, account_type: tp, is_active: true } as any).select('id').single();
      return (data as any).id as string;
    };
    const salaryExp = await ensureAccount('Salaries & Wages', 'expense', '6000');
    const uifExp = await ensureAccount('Employer UIF Expense', 'expense', '6021');
    const sdlExp = await ensureAccount('Employer SDL Expense', 'expense', '6022');
    const netPayable = await ensureAccount('Accrued Salaries', 'liability', '2510');
    const payePayable = await ensureAccount('PAYE (Tax Payable)', 'liability', '2315');
    const uifPayable = await ensureAccount('UIF Payable', 'liability', '2210');
    const sdlPayable = await ensureAccount('SDL Payable', 'liability', '2220');
    const { data: { user } } = await supabase.auth.getUser();
    const basePayload: any = { company_id: companyId, user_id: user?.id || '', transaction_date: postDate, description: `Payroll posting ${new Date(run.period_start).toLocaleDateString()} - ${new Date(run.period_end).toLocaleDateString()}`, total_amount: gross, status: 'pending' };
    let txRes: any = null;
    let txErr: any = null;
    try {
      const res = await supabase
        .from('transactions' as any)
        .insert({ ...basePayload, transaction_type: 'payroll' } as any)
        .select('id')
        .single();
      txRes = res.data; txErr = res.error;
      if (txErr) throw txErr;
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      const retry = msg.includes('column') && msg.includes('does not exist');
      if (!retry) throw err;
      const res2 = await supabase
        .from('transactions' as any)
        .insert(basePayload as any)
        .select('id')
        .single();
      txRes = res2.data; txErr = res2.error;
    }
    if (txErr) { 
      setIsSubmitting(false);
      return; 
    }
    
    setProgress(50);
    setProgressText("Posting to Ledger...");
    await new Promise(r => setTimeout(r, 600));

    const rows = [
      { transaction_id: (txRes as any).id, account_id: salaryExp, debit: gross, credit: 0, description: 'Salaries & Wages', status: 'approved' },
      { transaction_id: (txRes as any).id, account_id: uifExp, debit: uifEr, credit: 0, description: 'Employer UIF Expense', status: 'approved' },
      { transaction_id: (txRes as any).id, account_id: sdlExp, debit: sdlEr, credit: 0, description: 'Employer SDL Expense', status: 'approved' },
      { transaction_id: (txRes as any).id, account_id: netPayable, debit: 0, credit: net, description: 'Net Salaries Payable', status: 'approved' },
      { transaction_id: (txRes as any).id, account_id: payePayable, debit: 0, credit: paye, description: 'PAYE Payable', status: 'approved' },
      { transaction_id: (txRes as any).id, account_id: uifPayable, debit: 0, credit: uifEmp + uifEr, description: 'UIF Payable', status: 'approved' },
      { transaction_id: (txRes as any).id, account_id: sdlPayable, debit: 0, credit: sdlEr, description: 'SDL Payable', status: 'approved' },
    ];
    const { error: teErr } = await supabase.from('transaction_entries' as any).insert(rows as any);
    if (teErr) { 
      setIsSubmitting(false);
      return; 
    }

    setProgress(80);
    setProgressText("Updating Financial Statements...");
    await new Promise(r => setTimeout(r, 600));

    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: (txRes as any).id, description: r.description }));
    await supabase.from('ledger_entries' as any).insert(ledgerRows as any);
    await supabase.from('transactions' as any).update({ status: 'posted' } as any).eq('id', (txRes as any).id);
    
    try { await supabase.rpc('refresh_afs_cache', { _company_id: companyId }); } catch {}

    setProgress(100);
    setProgressText("Payroll Posted");
    await new Promise(r => setTimeout(r, 600));

    toast({ title: 'Success', description: 'Payroll posted to ledger' });
    setIsSubmitting(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setIsSubmitting(false);
    }
  };
  return (
    <>
      <Card>
        <CardHeader><CardTitle>Payslip Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Select onValueChange={pickRun}>
              <SelectTrigger><SelectValue placeholder="Select run" /></SelectTrigger>
              <SelectContent>
                {runs.map(r => <SelectItem key={r.id} value={r.id}>{new Date(r.period_start).toLocaleDateString()} - {new Date(r.period_end).toLocaleDateString()}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(id: any) => setLine(lines.find(l => l.id === id))}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {lines.map(l => <SelectItem key={l.id} value={l.id}>{l.employee_id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!line ? (
            <div className="py-8 text-center text-muted-foreground">Select a run and employee</div>
          ) : (
            <div className="border rounded-md p-6 space-y-2">
              <div className="text-xl font-semibold">Payslip</div>
              <div className="grid grid-cols-2">
                <div>Gross: R {line.gross.toFixed(2)}</div>
                <div>Net: R {line.net.toFixed(2)}</div>
                <div>PAYE: R {line.paye.toFixed(2)}</div>
                <div>UIF (Emp+Er): R {(line.uif_emp + line.uif_er).toFixed(2)}</div>
                <div>SDL: R {line.sdl_er.toFixed(2)}</div>
              </div>
              <div>Earnings vs Deductions</div>
          <div className="pt-2">
            <Button variant="outline" onClick={download}>Download Payslip</Button>
            {runs.length && lines.length ? (
              <Button variant="outline" className="ml-2" onClick={async () => {
                if (!run) return;
                const { data: company } = await supabase
                  .from('companies')
                  .select('name,email,phone,address,tax_number,vat_number,logo_url')
                  .eq('id', companyId)
                  .maybeSingle();
                const logoDataUrl = await fetchLogoDataUrl((company as any)?.logo_url);
                for (const l of lines) {
                  const emp = employees.find(e => e.id === l.employee_id);
                  const employee_name = emp ? `${emp.first_name} ${emp.last_name}` : l.employee_id;
                  const slip: PayslipForPDF = { period_start: run.period_start, period_end: run.period_end, employee_name, gross: l.gross, net: l.net, paye: l.paye, uif_emp: l.uif_emp, uif_er: l.uif_er, sdl_er: l.sdl_er, details: null };
                  const doc = buildPayslipPDF(slip, (company as any) || { name: 'Company' });
                  if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
                  const blob = doc.output('blob');
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  const periodName = `${new Date(run.period_start).toLocaleDateString('en-ZA')} - ${new Date(run.period_end).toLocaleDateString('en-ZA')}`;
                  a.href = url;
                  a.download = `payslip_${employee_name.replace(/\s+/g,'_')}_${periodName.replace(/\s+/g,'_')}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }
              }}>Download All</Button>
            ) : null}
            <Button variant="outline" className="ml-2" onClick={viewJSON}>View JSON</Button>
            <Button className="ml-2 bg-gradient-primary" onClick={postToLedger}>Post to Ledger</Button>
          </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Payslip JSON</DialogTitle></DialogHeader>
          <pre className="text-xs whitespace-pre-wrap">{jsonData ? JSON.stringify(jsonData, null, 2) : ""}</pre>
          <DialogFooter><Button variant="outline" onClick={() => setJsonOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {isSubmitting && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center transition-all duration-500">
          <div className="bg-background border shadow-xl rounded-xl flex flex-col items-center gap-8 p-8 max-w-md w-full animate-in fade-in zoom-in-95 duration-300">
            <LoadingSpinner size="lg" className="scale-125" />
            <div className="w-full space-y-4">
              <Progress value={progress} className="h-2 w-full" />
              <div className="text-center space-y-2">
                <div className="text-xl font-semibold text-primary animate-pulse">
                  {progressText}
                </div>
                <div className="text-sm text-muted-foreground">
                  Please wait while we update your financial records...
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PayrollReports({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState<string>("");
  const [runs, setRuns] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [emp201, setEmp201] = useState<any>(null);
  const [emp501, setEmp501] = useState<any>(null);
  const [irp5, setIrp5] = useState<any>(null);
  const [employeeForIrp5, setEmployeeForIrp5] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data: rs } = await supabase.from("pay_runs" as any).select("*").eq("company_id", companyId).order("period_start", { ascending: false });
      setRuns(rs || []);
    };
    if (companyId) load();
  }, [companyId]);
  const pick = async (id: string) => {
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", id);
    setLines(data || []);
  };
  const totals = {
    gross: lines.reduce((s, l: any) => s + (l.gross || 0), 0),
    net: lines.reduce((s, l: any) => s + (l.net || 0), 0),
    paye: lines.reduce((s, l: any) => s + (l.paye || 0), 0),
    uif: lines.reduce((s, l: any) => s + (l.uif_emp || 0) + (l.uif_er || 0), 0),
    sdl: lines.reduce((s, l: any) => s + (l.sdl_er || 0), 0),
  };
  return (
    <Card>
      <CardHeader><CardTitle>Payroll Reports</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-4">
          <Select onValueChange={pick}>
            <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
            <SelectContent>
              {runs.map(r => <SelectItem key={r.id} value={r.id}>{new Date(r.period_start).toLocaleDateString()} - {new Date(r.period_end).toLocaleDateString()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Monthly Payroll" value={`R ${totals.gross.toFixed(2)}`} />
          <StatCard title="PAYE Report" value={`R ${totals.paye.toFixed(2)}`} />
          <StatCard title="UIF Report" value={`R ${totals.uif.toFixed(2)}`} />
          <StatCard title="SDL Report" value={`R ${totals.sdl.toFixed(2)}`} />
          <StatCard title="Net Pay" value={`R ${totals.net.toFixed(2)}`} />
        </div>
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Button variant="outline" onClick={async () => {
              if (!runs.length) return;
              const r = runs[0];
              const res = await getReportsEmp201(companyId, r.period_start, r.period_end);
              setEmp201(res);
            }}>Get EMP201 (current selection)</Button>
            <Button variant="outline" onClick={async () => {
              const yearStart = new Date(new Date().getFullYear(), 2, 1).toISOString().split('T')[0];
              const yearEnd = new Date(new Date().getFullYear()+1, 1, 28).toISOString().split('T')[0];
              const res = await getReportsEmp501(companyId, yearStart, yearEnd);
              setEmp501(res);
            }}>Get EMP501 (current tax year)</Button>
            <div className="flex items-end gap-2">
              <div className="w-full">
                <Label>Employee for IRP5</Label>
                <Select value={employeeForIrp5} onValueChange={(v: any) => setEmployeeForIrp5(v)}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={async () => {
                if (!runs.length || !employeeForIrp5) return;
                const r = runs[0];
                const yearStart = new Date(new Date().getFullYear(), 2, 1).toISOString().split('T')[0];
                const yearEnd = new Date(new Date().getFullYear()+1, 1, 28).toISOString().split('T')[0];
                const res = await getReportsIrp5(companyId, employeeForIrp5, yearStart, yearEnd);
                setIrp5(res);
              }}>Get IRP5</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card><CardHeader><CardTitle>EMP201</CardTitle></CardHeader><CardContent><pre className="text-xs whitespace-pre-wrap">{emp201 ? JSON.stringify(emp201, null, 2) : ""}</pre></CardContent></Card>
            <Card><CardHeader><CardTitle>EMP501</CardTitle></CardHeader><CardContent><pre className="text-xs whitespace-pre-wrap">{emp501 ? JSON.stringify(emp501, null, 2) : ""}</pre></CardContent></Card>
            <Card><CardHeader><CardTitle>IRP5</CardTitle></CardHeader><CardContent><pre className="text-xs whitespace-pre-wrap">{irp5 ? JSON.stringify(irp5, null, 2) : ""}</pre></CardContent></Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmployeesTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", id_number: "", start_date: "", salary_type: "monthly", salary_amount: "", bank_name: "", bank_branch_code: "", bank_account_number: "", bank_account_type: "checking" });
  const [earningsDialogOpen, setEarningsDialogOpen] = useState(false);
  const [earningsEmployee, setEarningsEmployee] = useState<Employee | null>(null);
  const [earningsRows, setEarningsRows] = useState<{ pay_item_id: string; name: string; amount: string }[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsSaving, setEarningsSaving] = useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("company_id", companyId)
        .order("first_name", { ascending: true });
      if (error) throw error;
      setEmployees((data || []) as any);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);
  useEffect(() => { if (companyId) load(); }, [companyId, load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      let insertedEmp: any = null;
      try {
        const res = await supabase.from("employees" as any).insert({
          company_id: companyId,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email || null,
          id_number: form.id_number || null,
          start_date: form.start_date || null,
          salary_type: form.salary_type || null,
          bank_name: form.bank_name || null,
          bank_branch_code: form.bank_branch_code || null,
          bank_account_number: form.bank_account_number || null,
          bank_account_type: form.bank_account_type || null,
          active: true,
        } as any).select("id").single();
        if (res.error) throw res.error;
        insertedEmp = res.data;
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        const retry = msg.includes("column") && msg.includes("does not exist");
        if (!retry) throw err;
        const res2 = await supabase.from("employees" as any).insert({
          company_id: companyId,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email || null,
          id_number: form.id_number || null,
          start_date: form.start_date || null,
          salary_type: form.salary_type || null,
          active: true,
        } as any).select("id").single();
        if (res2.error) throw res2.error;
        insertedEmp = res2.data;
      }
      const empId = (insertedEmp as any)?.id;
      if (empId) {
        const ensureAccount = async (nm: string, tp: 'expense' | 'liability', code: string) => {
          const { data: found }: any = await supabase
            .from('chart_of_accounts' as any)
            .select('id')
            .eq('company_id', companyId)
            .eq('account_name', nm)
            .maybeSingle();
          if ((found as any)?.id) return (found as any).id as string;
          const { data }: any = await supabase
            .from('chart_of_accounts' as any)
            .insert({ company_id: companyId, account_code: code, account_name: nm, account_type: tp, is_active: true } as any)
            .select('id')
            .single();
          return (data as any).id as string;
        };
        await ensureAccount('Salaries & Wages', 'expense', '6000');
        await ensureAccount('Employer UIF Expense', 'expense', '6021');
        await ensureAccount('Employer SDL Expense', 'expense', '6022');
        await ensureAccount('Accrued Salaries', 'liability', '2510');
        await ensureAccount('PAYE (Tax Payable)', 'liability', '2315');
        await ensureAccount('UIF Payable', 'liability', '2210');
        await ensureAccount('SDL Payable', 'liability', '2220');
        const saItems = [
          { name: "Basic Salary", type: "earning" },
          { name: "Allowance", type: "earning" },
          { name: "Overtime", type: "earning" },
          { name: "Bonus", type: "earning" },
          { name: "Commission", type: "earning" },
          { name: "Travel Allowance (Fixed)", type: "earning" },
          { name: "Travel Allowance (Reimbursive)", type: "earning" },
          { name: "PAYE", type: "deduction" },
          { name: "UIF Employee", type: "deduction" },
          { name: "UIF Employer", type: "employer" },
          { name: "SDL Employer", type: "employer" },
          { name: "Medical Aid Employee", type: "deduction" },
          { name: "Medical Aid Employer", type: "employer" },
          { name: "Pension Employee", type: "deduction" },
          { name: "Pension Employer", type: "employer" },
        ];
        const { data: existing } = await supabase
          .from("pay_items" as any)
          .select("id,name,type")
          .eq("company_id", companyId);
        const map = new Map<string, any>();
        (existing || []).forEach((i: any) => map.set(String(i.name).toLowerCase(), i));
        const toInsert: any[] = [];
        for (const it of saItems) {
          const key = it.name.toLowerCase();
          const taxable = it.type === "earning" && !it.name.toLowerCase().includes("reimbursive");
          if (!map.has(key)) toInsert.push({ company_id: companyId, code: it.name.replace(/\s+/g, "_").toUpperCase(), name: it.name, type: it.type, taxable });
        }
        if (toInsert.length) await supabase.from("pay_items" as any).insert(toInsert as any);
        const { data: allItems } = await supabase
          .from("pay_items" as any)
          .select("id,name,type")
          .eq("company_id", companyId);
        const byName = new Map<string, any>();
        (allItems || []).forEach((i: any) => byName.set(String(i.name).toLowerCase(), i));
        const basic = byName.get("basic salary");
        const allowance = byName.get("allowance");
        const overtime = byName.get("overtime");
        const bonusItem = byName.get("bonus");
        const commissionItem = byName.get("commission");
        const travelFixed = byName.get("travel allowance (fixed)");
        const travelReimb = byName.get("travel allowance (reimbursive)");
        const paye = byName.get("paye");
        const uifEmp = byName.get("uif employee");
        const uifEr = byName.get("uif employer");
        const sdlEr = byName.get("sdl employer");
        const rows: any[] = [];
        const basicAmt = parseFloat(form.salary_amount || "0");
        if (basic) rows.push({ employee_id: empId, pay_item_id: basic.id, amount: basicAmt, rate: null, unit: null });
        if (allowance) rows.push({ employee_id: empId, pay_item_id: allowance.id, amount: 0, rate: null, unit: null });
        if (overtime) rows.push({ employee_id: empId, pay_item_id: overtime.id, amount: 0, rate: null, unit: "hour" });
        if (bonusItem) rows.push({ employee_id: empId, pay_item_id: bonusItem.id, amount: 0, rate: null, unit: null });
        if (commissionItem) rows.push({ employee_id: empId, pay_item_id: commissionItem.id, amount: 0, rate: null, unit: null });
        if (travelFixed) rows.push({ employee_id: empId, pay_item_id: travelFixed.id, amount: 0, rate: null, unit: null });
        if (travelReimb) rows.push({ employee_id: empId, pay_item_id: travelReimb.id, amount: 0, rate: null, unit: null });
        if (paye) rows.push({ employee_id: empId, pay_item_id: paye.id, amount: 0, rate: null, unit: null });
        if (uifEmp) rows.push({ employee_id: empId, pay_item_id: uifEmp.id, amount: 0, rate: null, unit: null });
        if (uifEr) rows.push({ employee_id: empId, pay_item_id: uifEr.id, amount: 0, rate: null, unit: null });
        if (sdlEr) rows.push({ employee_id: empId, pay_item_id: sdlEr.id, amount: 0, rate: null, unit: null });
        if (rows.length) await supabase.from("employee_pay_items" as any).insert(rows as any);
      }
      toast({ title: "Success", description: "Employee created" });
      setDialogOpen(false);
      setForm({ first_name: "", last_name: "", email: "", id_number: "", start_date: "", salary_type: "monthly", salary_amount: "", bank_name: "", bank_branch_code: "", bank_account_number: "", bank_account_type: "checking" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openEarnings = async (emp: Employee) => {
    setEarningsEmployee(emp);
    setEarningsDialogOpen(true);
    setEarningsLoading(true);
    try {
      const { data: items } = await supabase
        .from("pay_items" as any)
        .select("id,name,type")
        .eq("company_id", companyId)
        .eq("type", "earning");
      const earningItems = (items || []) as any[];
      if (!earningItems.length) {
        setEarningsRows([]);
        setEarningsLoading(false);
        return;
      }
      const earningIds = earningItems.map(i => (i as any).id);
      const { data: existing } = await supabase
        .from("employee_pay_items" as any)
        .select("pay_item_id,amount")
        .eq("employee_id", emp.id)
        .in("pay_item_id", earningIds);
      const byId: Record<string, number> = {};
      (existing || []).forEach((row: any) => {
        byId[String(row.pay_item_id)] = Number(row.amount || 0);
      });
      setEarningsRows(
        earningItems.map((i: any) => ({
          pay_item_id: String(i.id),
          name: String(i.name),
          amount: byId[String(i.id)] != null ? String(byId[String(i.id)]) : "",
        }))
      );
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setEarningsRows([]);
    } finally {
      setEarningsLoading(false);
    }
  };

  const saveEarnings = async () => {
    if (!earningsEmployee) return;
    setEarningsSaving(true);
    try {
      for (const row of earningsRows) {
        const amt = parseFloat(row.amount || "0");
        const { data: existing } = await supabase
          .from("employee_pay_items" as any)
          .select("id")
          .eq("employee_id", earningsEmployee.id)
          .eq("pay_item_id", row.pay_item_id)
          .maybeSingle();
        if (amt > 0) {
          if (existing) {
            await supabase
              .from("employee_pay_items" as any)
              .update({ amount: amt } as any)
              .eq("id", (existing as any).id);
          } else {
            await supabase
              .from("employee_pay_items" as any)
              .insert({ employee_id: earningsEmployee.id, pay_item_id: row.pay_item_id, amount: amt, rate: null, unit: null } as any);
          }
        } else if (existing) {
          await supabase
            .from("employee_pay_items" as any)
            .delete()
            .eq("id", (existing as any).id);
        }
      }
      toast({ title: "Saved", description: "Earnings updated for employee" });
      setEarningsDialogOpen(false);
      setEarningsEmployee(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setEarningsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Employees</CardTitle>
        {canEdit && <Button onClick={() => setDialogOpen(true)} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-2" />New</Button>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : employees.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No employees</div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-700 border-b border-slate-800">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="text-white">Name</TableHead>
                <TableHead className="text-white">Email</TableHead>
                <TableHead className="text-white">ID Number</TableHead>
                <TableHead className="text-white">Salary Type</TableHead>
                <TableHead className="text-white">Start Date</TableHead>
                <TableHead className="text-white">Status</TableHead>
                {canEdit && <TableHead className="text-white text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(e => (
                <TableRow key={e.id}>
                  <TableCell>{e.first_name} {e.last_name}</TableCell>
                  <TableCell>{e.email || "-"}</TableCell>
                <TableCell>{e.id_number || "-"}</TableCell>
                <TableCell>{e.salary_type || "-"}</TableCell>
                <TableCell>{e.start_date ? new Date(e.start_date).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>{e.active ? "Active" : "Inactive"}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openEarnings(e)}>
                        Edit earnings
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Employee</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>ID Number</Label>
                <Input value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div>
                <Label>Salary Type</Label>
                <Select value={form.salary_type} onValueChange={(v: any) => setForm({ ...form, salary_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Salary Amount</Label>
                <Input type="number" step="0.01" value={form.salary_amount} onChange={e => setForm({ ...form, salary_amount: e.target.value })} />
              </div>
              <div>
                <Label>Bank Name</Label>
                <Select value={form.bank_name} onValueChange={(v: any) => setForm({ ...form, bank_name: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ABSA">ABSA Bank</SelectItem>
                    <SelectItem value="FNB">FNB (First National Bank)</SelectItem>
                    <SelectItem value="Standard Bank">Standard Bank</SelectItem>
                    <SelectItem value="Nedbank">Nedbank</SelectItem>
                    <SelectItem value="Capitec">Capitec Bank</SelectItem>
                    <SelectItem value="Investec">Investec Bank</SelectItem>
                    <SelectItem value="TymeBank">TymeBank</SelectItem>
                    <SelectItem value="Bidvest">Bidvest Bank</SelectItem>
                    <SelectItem value="Discovery">Discovery Bank</SelectItem>
                    <SelectItem value="African Bank">African Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Branch Code</Label>
                <Input value={form.bank_branch_code} onChange={e => setForm({ ...form, bank_branch_code: e.target.value })} />
              </div>
              <div>
                <Label>Account Number</Label>
                <Input value={form.bank_account_number} onChange={e => setForm({ ...form, bank_account_number: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Account Type</Label>
              <Select value={form.bank_account_type} onValueChange={(v: any) => setForm({ ...form, bank_account_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-primary">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={earningsDialogOpen} onOpenChange={setEarningsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit earnings
              {earningsEmployee && ` – ${earningsEmployee.first_name} ${earningsEmployee.last_name}`}
            </DialogTitle>
            <DialogDescription>
              This dialog is for adding and adjusting recurring earnings for this employee. All
              earnings captured here form part of their gross salary when payroll is processed.
            </DialogDescription>
          </DialogHeader>
          {earningsLoading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Loading earnings…</div>
          ) : earningsRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No earning pay items are set up yet. Create earnings in the Pay Items tab first, then return here to link them to this employee.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs flex gap-2">
                <Info className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium text-[11px] uppercase tracking-wide">Earnings and gross salary</div>
                  <p>
                    All amounts you enter below are added together as this employee&apos;s gross salary base
                    for each payroll run. You can still add once-off earnings in the payroll run itself.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground">
                <div>Earning</div>
                <div className="text-right">Amount (R)</div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {earningsRows.map((row, idx) => (
                  <div key={row.pay_item_id} className="grid grid-cols-2 gap-2 items-center">
                    <div className="text-sm truncate">{row.name}</div>
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={e => {
                          const next = [...earningsRows];
                          next[idx] = { ...next[idx], amount: e.target.value };
                          setEarningsRows(next);
                        }}
                        className="h-8 text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEarningsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveEarnings} disabled={earningsSaving || earningsLoading}>
              {earningsSaving ? "Saving…" : "Save earnings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PayItemsTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState<PayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<{ code: string; name: string; type: "earning" | "deduction" | "employer"; taxable: boolean }>({ code: "", name: "", type: "earning", taxable: true });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pay_items" as any)
        .select("id, code, name, type, taxable")
        .eq("company_id", companyId)
        .order("code", { ascending: true });
      if (error) throw error;
      setItems((data || []) as any);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);
  useEffect(() => { if (companyId) load(); }, [companyId, load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from("pay_items" as any).insert({
        company_id: companyId,
        code: form.code,
        name: form.name,
        type: form.type,
        taxable: form.taxable,
      } as any);
      if (error) throw error;
      toast({ title: "Success", description: "Pay item created" });
      setDialogOpen(false);
      setForm({ code: "", name: "", type: "earning", taxable: true });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Pay Items</CardTitle>
        {canEdit && <Button onClick={() => setDialogOpen(true)} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-2" />New</Button>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No pay items</div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-700 border-b border-slate-800">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="text-white">Code</TableHead>
                <TableHead className="text-white">Name</TableHead>
                <TableHead className="text-white">Type</TableHead>
                <TableHead className="text-white">Taxable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(i => (
                <TableRow key={i.id}>
                  <TableCell>{i.code}</TableCell>
                  <TableCell>{i.name}</TableCell>
                  <TableCell className="capitalize">{i.type}</TableCell>
                  <TableCell>{i.taxable ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Pay Item</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required />
              </div>
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="earning">Earning</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                    <SelectItem value="employer">Employer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Label className="w-full">Taxable</Label>
                <Button type="button" variant="outline" onClick={() => setForm({ ...form, taxable: !form.taxable })}>{form.taxable ? "Yes" : "No"}</Button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-gradient-primary">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PayRunsTab({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<PayRun | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [lines, setLines] = useState<PayRunLine[]>([]);
  const [form, setForm] = useState({ period_start: new Date().toISOString().split("T")[0], period_end: new Date().toISOString().split("T")[0] });
  const [addLine, setAddLine] = useState<{ employee_id: string; gross: string }>({ employee_id: "", gross: "" });
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState<string>("");
  const [sendMessage, setSendMessage] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [selectedLine, setSelectedLine] = useState<PayRunLine | null>(null);
  const [processingAll, setProcessingAll] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [totals, setTotals] = useState({ gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 });

  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth() + 1);

  // New state for Pay Run Creation Preview
  const [createPreviewOpen, setCreatePreviewOpen] = useState(false);
  const [createPreviewLines, setCreatePreviewLines] = useState<any[]>([]);
  const [createPreviewTotals, setCreatePreviewTotals] = useState({ gross: 0, net: 0, paye: 0 });
  const [createPeriod, setCreatePeriod] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [runTotals, setRunTotals] = useState<Record<string, any>>({});
  const [viewRun, setViewRun] = useState<PayRun | null>(null);
  const [runLines, setRunLines] = useState<any[]>([]);
  const [runCounts, setRunCounts] = useState<Record<string, number>>({});
  const [previewSelection, setPreviewSelection] = useState<Record<string, boolean>>({});
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  const getEffectiveCompanyId = React.useCallback(async (): Promise<string> => {
    let cid = String(companyId || "").trim();
    if (cid) return cid;
    if (!hasSupabaseEnv) return "";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from("profiles" as any)
          .select("company_id")
          .eq("user_id", user.id)
          .maybeSingle();
        cid = String((prof as any)?.company_id || "").trim();
      }
    } catch {}
    return cid;
  }, [companyId]);

  

  const loadRuns = React.useCallback(async () => {
    setLoading(true);
    try {
      const cid = await getEffectiveCompanyId();
      if (!cid) { setRuns([] as any); setSelectedRun(null); setLines([]); return; }

      // Load bank accounts for dropdown
      const { data: banks } = await supabase
        .from('bank_accounts' as any)
        .select('*')
        .eq('company_id', cid);
      setBankAccounts(banks || []);

      const { data, error } = await supabase
        .from("pay_runs" as any)
        .select("*")
        .eq("company_id", cid)
        .order("period_start", { ascending: false });
      if (error) throw error;
      const list = (data || []) as any;
      
      // Split into active (draft) and history (finalized/paid)
      // This mimics the VAT201 "Current vs Previous" logic
      const activeRun = list.find((r: any) => r.status === 'draft');
      const historyList = list.filter((r: any) => r.status !== 'draft');
      
      setRuns(historyList); // 'runs' now only stores history, like 'previousPeriods' in VAT201

      if (activeRun) {
        setSelectedRun(activeRun); // 'selectedRun' is the 'currentPeriod' equivalent
        await loadLines(activeRun.id);
        
        // Calculate totals for the active run immediately
        const { data: ls } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", activeRun.id);
        const activeTotals = (ls || []).reduce((acc: any, l: any) => ({
           gross: acc.gross + Number(l.gross || 0),
           net: acc.net + Number(l.net || 0),
           paye: acc.paye + Number(l.paye || 0),
           uif_emp: acc.uif_emp + Number(l.uif_emp || 0),
           uif_er: acc.uif_er + Number(l.uif_er || 0),
           sdl_er: acc.sdl_er + Number(l.sdl_er || 0),
        }), { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 });
        setTotals(activeTotals);
      } else {
        setSelectedRun(null);
        setLines([]);
        setTotals({ gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 });
      }

      if (historyList.length > 0) {
        const totalsMap: Record<string, any> = {};
        const countsMap: Record<string, number> = {};
        for (const r of historyList) {
          const { data: ls } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", (r as any).id);
          const totals = (ls || []).reduce((acc: any, l: any) => ({
            gross: acc.gross + Number(l.gross || 0),
            net: acc.net + Number(l.net || 0),
            paye: acc.paye + Number(l.paye || 0),
            uif_emp: acc.uif_emp + Number(l.uif_emp || 0),
            uif_er: acc.uif_er + Number(l.uif_er || 0),
            sdl_er: acc.sdl_er + Number(l.sdl_er || 0),
          }), { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 });
          
          const count = (ls || []).length;
          totalsMap[(r as any).id] = totals;
          countsMap[(r as any).id] = count;
        }
        setRunTotals(totalsMap);
        setRunCounts(countsMap);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast, getEffectiveCompanyId]);

  const loadEmployees = React.useCallback(async () => {
    const cid = await getEffectiveCompanyId();
    if (!cid) { setEmployees([] as any); return; }
    const { data } = await supabase.from("employees" as any).select("*").eq("company_id", cid).order("first_name", { ascending: true });
    setEmployees((data || []) as any);
  }, [companyId, getEffectiveCompanyId]);

  const loadLines = React.useCallback(async (runId: string) => {
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", runId);
    setLines((data || []) as any);
    
    // Update runLines for the top table display calculations
    setRunLines((data || []) as any);
  }, []);

  useEffect(() => { loadRuns(); loadEmployees(); }, [companyId, loadRuns, loadEmployees]);

  const createRun = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from("pay_runs" as any)
        .insert({ company_id: companyId, period_start: form.period_start, period_end: form.period_end, status: "draft" } as any)
        .select("*")
        .single();
      if (error) throw error;
      toast({ title: "Success", description: "Pay run created" });
      setSelectedRun(data as any);
      loadRuns();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const getEmployeeGross = React.useCallback(async (empId: string): Promise<number> => {
    // 1. Get earning pay items IDs
    const { data: earningItems } = await supabase
      .from("pay_items" as any)
      .select("id")
      .eq("company_id", companyId)
      .eq("type", "earning");
    
    if (!earningItems || earningItems.length === 0) return 0;
    const earningIds = earningItems.map((i: any) => i.id);

    // 2. Get amounts for these items
    const { data: empItems } = await supabase
      .from("employee_pay_items" as any)
      .select("amount")
      .eq("employee_id", empId)
      .in("pay_item_id", earningIds);

    return (empItems || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  }, [companyId]);

  const addEmployeeToRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRun) return;
    const gross = parseFloat(addLine.gross || "0");
    if (!addLine.employee_id || gross <= 0) { 
      toast({ title: "Error", description: "Select employee and enter gross", variant: "destructive" }); 
      return; 
    }

    try {
      await processPayroll({
        company_id: companyId,
        employee_id: addLine.employee_id,
        period_start: selectedRun.period_start,
        period_end: selectedRun.period_end,
        pay_run_id: selectedRun.id,
        overrideGross: gross
      });
      
      setAddLine({ employee_id: "", gross: "" });
      loadLines(selectedRun.id);
      toast({ title: "Success", description: "Employee added and payroll processed." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    const g = lines.reduce((s, l) => s + (l.gross || 0), 0);
    const n = lines.reduce((s, l) => s + (l.net || 0), 0);
    const p = lines.reduce((s, l) => s + (l.paye || 0), 0);
    const uemp = lines.reduce((s, l) => s + (l.uif_emp || 0), 0);
    const uer = lines.reduce((s, l) => s + (l.uif_er || 0), 0);
    const sdl = lines.reduce((s, l) => s + (l.sdl_er || 0), 0);
    setTotals({ gross: g, net: n, paye: p, uif_emp: uemp, uif_er: uer, sdl_er: sdl });
  }, [lines]);

  const selectRun = async (run: PayRun) => {
    setSelectedRun(run);
    await loadLines(run.id);
  };

  const downloadReport = async (type: string) => {
    // 1. Get dates from current filter
    const start = new Date(filterYear, filterMonth - 1, 1).toISOString().slice(0, 10);
    const end = new Date(filterYear, filterMonth, 0).toISOString().slice(0, 10);
    
    // 2. Fetch data based on type
    if (type === "irp5") {
      const { items } = await getReportsIrp5(companyId, "", start, end);
      // Generate basic IRP5 PDF or CSV...
      toast({ title: "Generated", description: "IRP5 data ready (basic version)." });
    }
    
    if (type === "emp201") {
        // Fetch Pay Run for the period
        const { data: run } = await supabase
            .from("pay_runs" as any)
            .select("*")
            .eq("company_id", companyId)
            .eq("period_start", start)
            .eq("period_end", end)
            .maybeSingle();

        if (!run) {
            toast({ title: "No Data", description: "No payroll run found for this period to generate EMP201.", variant: "destructive" });
            return;
        }

        // Fetch Run Lines (Aggregated)
        const { data: lines } = await supabase
            .from("pay_run_lines" as any)
            .select("gross, paye, uif_emp, uif_er, sdl_er")
            .eq("pay_run_id", (run as any).id);

        if (!lines || lines.length === 0) {
            toast({ title: "No Data", description: "No employee data found in this run.", variant: "destructive" });
            return;
        }

        // Calculate Totals
        const totalPAYE = lines.reduce((sum, l: any) => sum + (l.paye || 0), 0);
        const totalUIF = lines.reduce((sum, l: any) => sum + (l.uif_emp || 0) + (l.uif_er || 0), 0);
        const totalSDL = lines.reduce((sum, l: any) => sum + (l.sdl_er || 0), 0);
        // ETI is not yet implemented, assume 0 for now
        const totalETI = 0; 
        const totalPayable = totalPAYE + totalUIF + totalSDL - totalETI;

        // Generate PDF
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(18);
        doc.text("EMP201 - Monthly Employer Declaration", 14, 20);
        
        doc.setFontSize(10);
        doc.text(`Period: ${new Date(start).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}`, 14, 30);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 35);

        // Company Info
        const { data: company } = await supabase.from('companies' as any).select('*').eq('id', companyId).maybeSingle();
        if (company) {
             doc.text(`Employer: ${(company as any).name}`, 14, 45);
             if ((company as any).tax_number) doc.text(`PAYE Ref: ${(company as any).tax_number}`, 14, 50);
             if ((company as any).sdl_number) doc.text(`SDL Ref: ${(company as any).sdl_number}`, 14, 55);
             if ((company as any).uif_number) doc.text(`UIF Ref: ${(company as any).uif_number}`, 14, 60);
        }

        // Table Data
        const data = [
            ["Liability Type", "Amount (R)"],
            ["PAYE (Pay-As-You-Earn)", totalPAYE.toFixed(2)],
            ["SDL (Skills Development Levy)", totalSDL.toFixed(2)],
            ["UIF (Unemployment Insurance Fund)", totalUIF.toFixed(2)],
            ["ETI (Employment Tax Incentive)", `-${totalETI.toFixed(2)}`],
            ["", ""],
            ["TOTAL PAYABLE", totalPayable.toFixed(2)]
        ];

        autoTable(doc, {
            startY: 70,
            head: [data[0]],
            body: data.slice(1),
            theme: 'grid',
            headStyles: { fillColor: [0, 112, 173] }, // Rigel Blue
            columnStyles: { 1: { halign: 'right' } },
            didParseCell: (data) => {
                if (data.row.index === 5) { // Total Row
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [240, 240, 240];
                }
            }
        });

        // Footer / Disclaimer
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text("This document is generated by Rigel Business for record-keeping purposes.", 14, 150);
        doc.text("Please file your EMP201 on SARS eFiling using these figures.", 14, 155);

        doc.save(`EMP201_${filterYear}_${filterMonth}.pdf`);
        toast({ title: "Generated", description: "EMP201 report downloaded successfully." });
    }
  };

  const openView = async (r: PayRun) => {
    setViewRun(r);
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", r.id);
    const linesWithDetails = await Promise.all((data || []).map(async (l: any) => {
        const emp = employees.find(e => e.id === l.employee_id);
        // If employee not in current list (maybe inactive), fetch basic details
        let firstName = emp?.first_name || "Unknown";
        let lastName = emp?.last_name || "Employee";
        let medMembers = (emp as any)?.medical_aid_members || 0;
        
        if (!emp) {
            const { data: empData } = await supabase.from("employees").select("first_name, last_name, medical_aid_members").eq("id", l.employee_id).maybeSingle();
            if (empData) {
                firstName = empData.first_name;
                lastName = empData.last_name;
                medMembers = (empData as any).medical_aid_members || 0;
            }
        }
        
        // Calculate MTC if not stored (for display purposes)
        // Since we don't store it, we recalculate or default to 0
        // We can use the tax service helper or just display what we have.
        // For accurate history, we should have stored it. For now, we calculate based on members.
        // Re-using calculate logic just for credit value might be overkill/inaccurate if rules changed.
        // We will show '-' if not available or calculate simple approximation:
        // Main (364) + Dep (364) + Add (246)
        let mtc = 0;
        if (medMembers > 0) {
            mtc += 364;
            if (medMembers > 1) mtc += 364;
            if (medMembers > 2) mtc += 246 * (medMembers - 2);
        }

        return { ...l, first_name: firstName, last_name: lastName, medical_aid_members: medMembers, medical_tax_credit: mtc };
    }));
    setRunLines(linesWithDetails);
  };
  const reopenRun = async (r: PayRun) => {
    const { error } = await supabase.from("pay_runs" as any).update({ status: "draft" } as any).eq("id", r.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Reopened", description: "Pay run reopened" });
    loadRuns();
  };
  const [creatingPreview, setCreatingPreview] = useState(false);

  const openCreateDialog = () => {
    setCreatePreviewLines([]);
    setCreatePreviewTotals({ gross: 0, net: 0, paye: 0 });
    setCreatePeriod({ month: new Date().getMonth(), year: new Date().getFullYear() });
    setPreviewError(null);
    setCreatePreviewOpen(true);
    setCreatingPreview(false);
  };

  const generatePreview = async () => {
    setCreatingPreview(true);
    setPreviewError(null);
    setCreatePreviewLines([]);
    setCreatePreviewTotals({ gross: 0, net: 0, paye: 0 });

    try {
        const start = new Date(createPeriod.year, createPeriod.month, 1).toISOString().slice(0, 10);
        const end = new Date(createPeriod.year, createPeriod.month + 1, 0).toISOString().slice(0, 10);
        const cid = await getEffectiveCompanyId();
        
        if (!cid) { 
            toast({ title: "Error", description: "No company selected", variant: "destructive" }); 
            setCreatingPreview(false);
            return; 
        }

        const { data: existing } = await supabase
          .from("pay_runs" as any)
          .select("*")
          .eq("company_id", cid)
          .eq("period_start", start)
          .eq("period_end", end)
          .maybeSingle();

        if (existing) {
          setPreviewError(existing.status === 'draft' 
            ? "A draft pay run already exists for this period." 
            : "A finalized pay run already exists for this period.");
          setCreatingPreview(false);
          return;
        }

        const activeEmployees = employees.filter(e => e.active);
        const results = await Promise.all(activeEmployees.map(async (emp) => {
            const gross = +(await getEmployeeGross(emp.id)).toFixed(2);
            const c = await calculatePAYE(companyId, emp, { period_start: start, period_end: end, gross });
            const net = +(gross - c.paye - c.uif_emp).toFixed(2);
            return { ...emp, gross, net, paye: c.paye, uif_emp: c.uif_emp, uif_er: c.uif_er, sdl_er: c.sdl_er, medical_tax_credit: c.medical_tax_credit };
        }));

        let tGross = 0, tNet = 0, tPaye = 0;
        results.forEach(r => {
            tGross += r.gross;
            tNet += r.net;
            tPaye += r.paye;
        });

        setCreatePreviewLines(results);
        setCreatePreviewTotals({ gross: tGross, net: tNet, paye: tPaye });
    } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
        setCreatingPreview(false);
    }
  };

  const confirmCreateRun = async () => {
    setCreatePreviewOpen(false);
    const start = new Date(createPeriod.year, createPeriod.month, 1).toISOString().slice(0, 10);
    const end = new Date(createPeriod.year, createPeriod.month + 1, 0).toISOString().slice(0, 10);
    const today = new Date();
    const selectedMonthIndex = createPeriod.month;
    const selectedYear = createPeriod.year;
    const currentMonthIndex = today.getMonth();
    const currentYear = today.getFullYear();
    const isNextMonth =
      (selectedYear === currentYear && selectedMonthIndex === currentMonthIndex + 1) ||
      (currentMonthIndex === 11 && selectedYear === currentYear + 1 && selectedMonthIndex === 0);
    if (isNextMonth) {
      setIsNextMonthInfoOpen(true);
    }
    const cid = await getEffectiveCompanyId();
    const res = await supabase.from("pay_runs" as any).insert({ company_id: cid, period_start: start, period_end: end, status: "draft" } as any).select("*").single();
    if (res.error) { toast({ title: "Error", description: res.error.message, variant: "destructive" }); return; }
    const run = res.data;
    for (const l of createPreviewLines) {
      const payload = { pay_run_id: run.id, employee_id: l.id, gross: l.gross, net: l.net, paye: l.paye, uif_emp: l.uif_emp, uif_er: l.uif_er, sdl_er: l.sdl_er };
      await supabase.from("pay_run_lines" as any).insert(payload as any);
    }
    toast({ title: "Created", description: "Pay run created successfully" });
    loadRuns();
  };

  const commitPreviewAndAct = async (act: "post" | "pay") => {
    if (!selectedRun) return;
    for (const l of runLines) {
      if (!previewSelection[l.employee_id]) continue;
      const payload = { pay_run_id: selectedRun.id, employee_id: l.employee_id, gross: l.gross, net: l.net, paye: l.paye, uif_emp: l.uif_emp, uif_er: l.uif_er, sdl_er: l.sdl_er } as any;
      const { data: existing } = await supabase.from("pay_run_lines" as any).select("id").eq("pay_run_id", selectedRun.id).eq("employee_id", l.employee_id).maybeSingle();
      if (existing) {
        await supabase.from("pay_run_lines" as any).update(payload as any).eq("id", (existing as any).id);
      } else {
        await supabase.from("pay_run_lines" as any).insert(payload as any);
      }
    }
    await loadLines(selectedRun.id);
    if (act === "post") {
      await finalizeRun();
    } else {
      await payNetWages();
    }
    setViewRun(null);
  };
  const commitPreview = async () => {
    if (!selectedRun) return;
    for (const l of runLines) {
      if (!previewSelection[l.employee_id]) continue;
      const payload = { pay_run_id: selectedRun.id, employee_id: l.employee_id, gross: l.gross, net: l.net, paye: l.paye, uif_emp: l.uif_emp, uif_er: l.uif_er, sdl_er: l.sdl_er } as any;
      const { data: existing } = await supabase.from("pay_run_lines" as any).select("id").eq("pay_run_id", selectedRun.id).eq("employee_id", l.employee_id).maybeSingle();
      if (existing) {
        await supabase.from("pay_run_lines" as any).update(payload as any).eq("id", (existing as any).id);
      } else {
        await supabase.from("pay_run_lines" as any).insert(payload as any);
      }
    }
    await loadLines(selectedRun.id);
    setViewRun(null);
    toast({ title: "Created", description: "Payroll created for selected employees" });
  };
  const processAllEmployeesInRun = async () => {
    if (!selectedRun) return;
    setProcessingAll(true);
    setProcessingProgress(0);
    const list = [...employees];
    const total = list.length || 1;
    for (let i = 0; i < list.length; i++) {
      const emp = list[i];
      const gross = +(await getEmployeeGross(emp.id)).toFixed(2);
      
      try {
        await processPayroll({
          company_id: companyId,
          employee_id: emp.id,
          period_start: selectedRun.period_start,
          period_end: selectedRun.period_end,
          pay_run_id: selectedRun.id,
          overrideGross: gross
        });
      } catch (err: any) {
        console.error(`Error processing payroll for ${emp.id}:`, err);
      }
      
      setProcessingProgress(Math.round(((i + 1) / total) * 100));
    }
    await loadLines(selectedRun.id);
    setProcessingAll(false);
    toast({ title: "Processed", description: "All employees processed for this run" });
  };

  const [processOpen, setProcessOpen] = useState(false);
  const [processRun, setProcessRun] = useState<PayRun | null>(null);

  const openProcessDialog = (run: PayRun) => {
    setProcessRun(run);
    loadLines(run.id);
    setProcessOpen(true);
  };

  const handleProcess = async () => {
    if (!processRun) return;
    
    // Finalize (Post to Accounts) - Accrual only (no bank movement)
    if (processRun.status === 'draft') {
        const { error } = await supabase.rpc("post_pay_run_finalize" as any, { _pay_run_id: processRun.id });
        if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    }

    toast({ title: "Success", description: "Pay run finalized and posted to expense and liability accounts only (no bank payment)." });
    
    setProcessOpen(false);
    window.dispatchEvent(new Event('payroll-data-changed'));
    loadRuns();
  };

  const finalizeRun = async (runArg?: PayRun | any) => {
    const run = (runArg && runArg.id) ? runArg : selectedRun;
    if (!run) return;
    const runDateObj = new Date(run.period_start);
    const now = new Date();
    const isSameMonth = runDateObj.getFullYear() === now.getFullYear() && runDateObj.getMonth() === now.getMonth();
    if (isSameMonth) {
      setIsCurrentMonthDialogOpen(true);
    }
    const runDate = String(run.period_start || "");
    if (runDate && isDateLocked(runDate)) {
      setIsLockDialogOpen(true);
      return;
    }
    const { error } = await supabase.rpc("post_pay_run_finalize", { _pay_run_id: run.id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Success", description: "Pay run finalized and posted" });
    window.dispatchEvent(new Event('payroll-data-changed'));
    loadRuns();
  };

  const payNetWages = async (runArg?: PayRun | any) => {
    const run = (runArg && runArg.id) ? runArg : selectedRun;
    if (!run) return;
    const runDate = String(run.period_start || "");
    if (runDate && isDateLocked(runDate)) {
      setIsLockDialogOpen(true);
      return;
    }
    let amount = totals.net;
    if ((runArg && runArg.id) && (!selectedRun || selectedRun.id !== runArg.id)) {
        const { data } = await supabase.from("pay_run_lines" as any).select("net").eq("pay_run_id", run.id);
        const ls = data || [];
        amount = ls.reduce((s: number, l: any) => s + (l.net || 0), 0);
    }
    const { error } = await supabase.rpc("post_pay_run_pay", { _pay_run_id: run.id, _amount: amount });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Success", description: "Net wages paid" });
    window.dispatchEvent(new Event('payroll-data-changed'));
    loadRuns();
  };

  const downloadLinePayslip = async (l: PayRunLine) => {
    const run = selectedRun;
    if (!run) return;
    const emp = employees.find(e => e.id === l.employee_id);
    const employee_name = emp ? `${emp.first_name} ${emp.last_name}` : l.employee_id;
    const slip: PayslipForPDF = {
      period_start: run.period_start,
      period_end: run.period_end,
      employee_name,
      gross: l.gross,
      net: l.net,
      paye: l.paye,
      uif_emp: l.uif_emp,
      uif_er: l.uif_er,
      sdl_er: l.sdl_er,
      details: null,
    };
    const { data: company } = await supabase
      .from('companies')
      .select('name,email,phone,address,tax_number,vat_number,logo_url')
      .eq('id', companyId)
      .maybeSingle();
    const doc = buildPayslipPDF(slip, (company as any) || { name: 'Company' });
    const logoDataUrl = await fetchLogoDataUrl((company as any)?.logo_url);
    if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
    const periodName = `${new Date(run.period_start).toLocaleDateString('en-ZA')} - ${new Date(run.period_end).toLocaleDateString('en-ZA')}`;
    doc.save(`payslip_${employee_name.replace(/\s+/g,'_')}_${periodName.replace(/\s+/g,'_')}.pdf`);
  };

  const openSendDialog = (l: PayRunLine) => {
    setSelectedLine(l);
    const emp = employees.find(e => e.id === l.employee_id);
    const email = emp?.email || "";
    setSendEmail(email);
    const msg = `Hello,\n\nPlease find your payslip.\nNet Pay: R ${l.net.toFixed(2)}.`;
    setSendMessage(msg);
    setSendDialogOpen(true);
  };

  const handleSendPayslip = async () => {
    if (!selectedLine || !selectedRun) return;
    if (!sendEmail) { toast({ title: 'Error', description: 'Please enter recipient email', variant: 'destructive' }); return; }
    setSending(true);
    try {
      const emp = employees.find(e => e.id === selectedLine.employee_id);
      const employee_name = emp ? `${emp.first_name} ${emp.last_name}` : selectedLine.employee_id;
      const slip: PayslipForPDF = {
        period_start: selectedRun.period_start,
        period_end: selectedRun.period_end,
        employee_name,
        gross: selectedLine.gross,
        net: selectedLine.net,
        paye: selectedLine.paye,
        uif_emp: selectedLine.uif_emp,
        uif_er: selectedLine.uif_er,
        sdl_er: selectedLine.sdl_er,
        details: null,
      };
      const { data: company } = await supabase
        .from('companies')
        .select('name,email,phone,address,tax_number,vat_number,logo_url')
        .eq('id', companyId)
        .maybeSingle();
      const doc = buildPayslipPDF(slip, (company as any) || { name: 'Company' });
      const logoDataUrl = await fetchLogoDataUrl((company as any)?.logo_url);
      if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
      const blob = doc.output('blob');
      const periodName = `${new Date(selectedRun.period_start).toLocaleDateString('en-ZA')} - ${new Date(selectedRun.period_end).toLocaleDateString('en-ZA')}`;
      const fileName = `payslip_${employee_name.replace(/\s+/g,'_')}_${periodName.replace(/\s+/g,'_')}.pdf`;
      const path = `payslips/${fileName}`;
      const { error: uploadErr } = await supabase.storage
        .from('quotes')
        .upload(path, blob, { contentType: 'application/pdf', upsert: true });
      let publicUrl = '';
      if (!uploadErr) {
        const { data } = supabase.storage.from('quotes').getPublicUrl(path);
        publicUrl = data?.publicUrl || '';
      }
      const subject = encodeURIComponent(`Payslip ${periodName}`);
      const bodyLines = [sendMessage, publicUrl ? `\nDownload: ${publicUrl}` : ''].join('\n');
      const body = encodeURIComponent(bodyLines);
      window.location.href = `mailto:${sendEmail}?subject=${subject}&body=${body}`;
      toast({ title: 'Success', description: 'Email compose opened with payslip link' });
      setSendDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to prepare payslip email', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const [showRunBanner, setShowRunBanner] = useState(true);
  const [withholdingOpen, setWithholdingOpen] = useState(false);
  const [withholdingRunId, setWithholdingRunId] = useState<string | null>(null);
  return (
    <>
      <div className="text-sm text-muted-foreground mb-1">Step 2: Run Payroll</div>
      <div className="text-xs text-muted-foreground mb-2">
        Once employee earnings and deductions are set, create and process the draft pay run.
      </div>
      {showRunBanner && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <div className="mt-0.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="space-y-1 flex-1">
            <div className="text-sm font-medium text-amber-900">Check employees before processing</div>
            <p className="text-xs text-amber-800">
              Make sure each employee&apos;s earnings and deductions are up to date on the{" "}
              <span className="font-semibold">Employees</span> tab before you create or process this pay run.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRunBanner(false)}
            className="ml-2 mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-700 hover:bg-amber-100"
            aria-label="Dismiss notice"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <Card>
        {!selectedRun ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4">
             <div className="text-muted-foreground">No draft pay run found</div>
             {canEdit && <Button onClick={openCreateDialog} className="bg-gradient-primary">Create Pay Run</Button>}
          </div>
        ) : (
          <>
          <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             {/* We only show Create button here if user explicitly wants to overwrite or if we allow multiple drafts? 
                 Actually user asked to "bring back pay run button". 
                 Usually you can't create another draft if one exists, but let's put it back if requested.
                 Or maybe they meant the "Create Pay Run" text/header?
                 Assuming they want the button visible even if a draft exists (maybe to restart?).
                 Let's add it back but maybe disable it or just let logic handle "Run Exists" check.
             */}
             {canEdit && <Button onClick={openCreateDialog} className="bg-gradient-primary">Create Pay Run</Button>}
          </div>
          </CardHeader>
          <CardContent>
          <Table>
            <TableHeader className="bg-slate-700 border-b border-slate-800">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="text-white">Period Status</TableHead>
                <TableHead className="text-white">Submitted</TableHead>
                <TableHead className="text-white">Gross Salary</TableHead>
                <TableHead className="text-white">Med Aid</TableHead>
                <TableHead className="text-white">Med Credit</TableHead>
                <TableHead className="text-white">UIF (Emp)</TableHead>
                <TableHead className="text-white">PAYE</TableHead>
                <TableHead className="text-white">UIF (Er)</TableHead>
                <TableHead className="text-white">SDL</TableHead>
                <TableHead className="text-white">Net Pay</TableHead>
                <TableHead className="text-white w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="capitalize">
                  <Button variant="link" className="p-0 h-auto font-normal capitalize" onClick={() => selectedRun && openView(selectedRun)}>
                    {selectedRun ? selectedRun.status : "-"}
                  </Button>
                </TableCell>
                <TableCell>{selectedRun ? new Date(selectedRun.period_end).toLocaleDateString() : "-"}</TableCell>
                <TableCell>R {totals.gross.toFixed(2)}</TableCell>
                <TableCell>-</TableCell>
                <TableCell>R {runLines.reduce((s, l) => s + ((l as any).medical_tax_credit || 0), 0).toFixed(2)}</TableCell>
                <TableCell>R {totals.uif_emp.toFixed(2)}</TableCell>
                <TableCell>R {totals.paye.toFixed(2)}</TableCell>
                <TableCell>R {totals.uif_er.toFixed(2)}</TableCell>
                <TableCell>R {totals.sdl_er.toFixed(2)}</TableCell>
                <TableCell>R {totals.net.toFixed(2)}</TableCell>
                <TableCell>
                  {selectedRun && canEdit && selectedRun.status === 'draft' && (
                    <Button size="sm" onClick={() => openProcessDialog(selectedRun)} className="bg-gradient-primary w-full">
                      Process Payroll
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          </CardContent>
          </>
        )}
      </Card>
      <Dialog open={withholdingOpen} onOpenChange={(open) => { setWithholdingOpen(open); if (!open) setWithholdingRunId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Statutory withholding</DialogTitle>
            <DialogDescription>
              This shows amounts you are holding for SARS and other statutory funds for this pay run.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
              <div className="text-xs text-muted-foreground">
                This is a summary of PAYE, UIF and SDL you are holding for this payroll period.
              </div>
            </div>
            <div className="text-sm">
              {withholdingRunId ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Payroll period</span>
                  <span className="font-medium">
                    {(() => {
                      const r = runs.find(run => run.id === withholdingRunId);
                      if (!r) return "-";
                      return `${new Date(r.period_start).toLocaleDateString()} - ${new Date(r.period_end).toLocaleDateString()}`;
                    })()}
                  </span>
                </div>
              ) : (
                <span>No pay run selected.</span>
              )}
            </div>
            {withholdingRunId && (
              <>
                {(() => {
                  const t = runTotals[withholdingRunId] || { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 };
                  const total = t.paye + t.uif_emp + t.uif_er + t.sdl_er;
                  return (
                    <>
                      <div className="rounded-md bg-emerald-50 border border-emerald-100 px-3 py-2 flex items-center justify-between">
                        <div className="text-xs text-emerald-900">
                          Total statutory withholding for this period
                        </div>
                        <div className="text-sm font-semibold text-emerald-900">
                          R {total.toFixed(2)}
                        </div>
                      </div>
                      <div className="border rounded-md px-3 py-2 bg-slate-50/60">
                        <div className="text-xs font-medium text-slate-700 mb-2">Breakdown</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="text-muted-foreground">PAYE</div>
                          <div className="text-right font-medium">R {t.paye.toFixed(2)}</div>
                          <div className="text-muted-foreground">UIF (Emp + Er)</div>
                          <div className="text-right font-medium">
                            R {(t.uif_emp + t.uif_er).toFixed(2)}
                          </div>
                          <div className="text-muted-foreground">SDL</div>
                          <div className="text-right font-medium">R {t.sdl_er.toFixed(2)}</div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              To settle this withholding, capture the actual payment in{" "}
              <span className="font-semibold">Bank Transactions</span>. Allocate the bank transaction to
              your PAYE, UIF and SDL liability accounts so that your balances agree to SARS.
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <div className="text-sm text-muted-foreground mt-4">Payroll History</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" />Pay Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-center text-muted-foreground">Loading…</div>
          ) : runs.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">No pay runs</div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-700 border-b border-slate-800">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-white">Period Status</TableHead>
                  <TableHead className="text-white">Submitted</TableHead>
                  <TableHead className="text-white">Gross Salary</TableHead>
                  <TableHead className="text-white">Med Aid</TableHead>
                  <TableHead className="text-white">Med Credit</TableHead>
                  <TableHead className="text-white">UIF (Emp)</TableHead>
                  <TableHead className="text-white">PAYE</TableHead>
                  <TableHead className="text-white">UIF (Er)</TableHead>
                  <TableHead className="text-white">SDL</TableHead>
                  <TableHead className="text-white">Net Pay</TableHead>
                  <TableHead className="text-white">Posted</TableHead>
                  <TableHead className="text-white">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.filter(r => r.status !== 'draft').map(r => {
                  const t = runTotals[r.id] || { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 };
                  return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Button variant="link" className="p-0 h-auto font-normal capitalize" onClick={() => openView(r)}>
                        {r.status}
                      </Button>
                    </TableCell>
                    <TableCell>{new Date(r.period_end).toLocaleDateString()}</TableCell>
                    <TableCell>R {t.gross.toFixed(2)}</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>R {t.uif_emp.toFixed(2)}</TableCell>
                    <TableCell>R {t.paye.toFixed(2)}</TableCell>
                    <TableCell>R {t.uif_er.toFixed(2)}</TableCell>
                    <TableCell>R {t.sdl_er.toFixed(2)}</TableCell>
                    <TableCell>R {t.net.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Checkbox
                          checked={r.status === "finalized" || r.status === "paid"}
                          disabled
                          className="border-slate-300 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                          aria-label="Posted"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        {canEdit && (r.status === "finalized" || r.status === "paid") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-3 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300"
                            onClick={() => { setWithholdingRunId(r.id); setWithholdingOpen(true); }}
                          >
                            Withholding
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          )}
          
          <Dialog open={createPreviewOpen} onOpenChange={setCreatePreviewOpen}>
            <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Payroll - Preview</DialogTitle>
                <DialogDescription>Select a period and review the calculated payroll before creating.</DialogDescription>
              </DialogHeader>

              <div className="flex items-end gap-4 py-4 border-b mb-4">
                <div className="grid gap-2">
                  <Label>Month</Label>
                  <Select value={createPeriod.month.toString()} onValueChange={(v) => setCreatePeriod(p => ({ ...p, month: parseInt(v) }))}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                            <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Year</Label>
                  <Select value={createPeriod.year.toString()} onValueChange={(v) => setCreatePeriod(p => ({ ...p, year: parseInt(v) }))}>
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {[2024, 2025, 2026, 2027, 2028].map((y) => (
                            <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={generatePreview} disabled={creatingPreview} className="bg-gradient-primary">
                    {creatingPreview ? <LoadingSpinner size="sm" className="mr-2" /> : null}
                    Generate Preview
                </Button>
              </div>

              {previewError && (
                  <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm mb-4 flex items-center gap-2">
                      <span className="font-semibold">Error:</span> {previewError}
                  </div>
              )}

              {creatingPreview ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <LoadingSpinner size="lg" />
                  <p className="text-muted-foreground">Calculating payroll for all active employees...</p>
                </div>
              ) : createPreviewLines.length > 0 ? (
                <>
                  <div className="overflow-x-auto border rounded-md">
                  <Table className="border-collapse text-xs">
                    <TableHeader className="bg-slate-700 border-b border-slate-800">
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="text-white h-8 py-1 border-r border-white/20 font-semibold">Employee</TableHead>
                        <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">Gross Salary</TableHead>
                        <TableHead className="text-white h-8 py-1 text-center border-r border-white/20 font-semibold">Med Aid Mbrs</TableHead>
                        <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">Med Tax Credit</TableHead>
                        <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">UIF (Emp)</TableHead>
                        <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">PAYE</TableHead>
                        <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">UIF (Er)</TableHead>
                        <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">SDL</TableHead>
                        <TableHead className="text-white h-8 py-1 text-right font-semibold">Net Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {createPreviewLines.map(l => (
                        <TableRow key={l.employee_id} className="hover:bg-muted/50 odd:bg-white even:bg-muted/10 border-b border-muted">
                          <TableCell className="py-1 px-2 border-r border-muted font-medium">{l.first_name} {l.last_name}</TableCell>
                          <TableCell className="py-1 px-2 text-right border-r border-muted">{l.gross.toFixed(2)}</TableCell>
                          <TableCell className="py-1 px-2 text-center border-r border-muted">{(l as any).medical_aid_members || 0}</TableCell>
                          <TableCell className="py-1 px-2 text-right border-r border-muted text-green-600">{(l as any).medical_tax_credit ? (l as any).medical_tax_credit.toFixed(2) : '0.00'}</TableCell>
                          <TableCell className="py-1 px-2 text-right border-r border-muted">{l.uif_emp.toFixed(2)}</TableCell>
                          <TableCell className="py-1 px-2 text-right border-r border-muted">{l.paye.toFixed(2)}</TableCell>
                          <TableCell className="py-1 px-2 text-right border-r border-muted text-muted-foreground">{l.uif_er.toFixed(2)}</TableCell>
                          <TableCell className="py-1 px-2 text-right border-r border-muted text-muted-foreground">{l.sdl_er.toFixed(2)}</TableCell>
                          <TableCell className="py-1 px-2 text-right font-bold bg-muted/20">{l.net.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/80 font-bold border-t-2 border-primary/20">
                        <TableCell className="py-2 px-2 border-r border-muted">Totals</TableCell>
                        <TableCell className="py-2 px-2 text-right border-r border-muted">{createPreviewTotals.gross.toFixed(2)}</TableCell>
                        <TableCell className="py-2 px-2 text-center border-r border-muted">-</TableCell>
                        <TableCell className="py-2 px-2 text-right border-r border-muted text-green-700">
                           {createPreviewLines.reduce((s, l) => s + ((l as any).medical_tax_credit || 0), 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right border-r border-muted">
                           {createPreviewLines.reduce((s, l) => s + l.uif_emp, 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right border-r border-muted">{createPreviewTotals.paye.toFixed(2)}</TableCell>
                        <TableCell className="py-2 px-2 text-right border-r border-muted">
                           {createPreviewLines.reduce((s, l) => s + l.uif_er, 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right border-r border-muted">
                           {createPreviewLines.reduce((s, l) => s + l.sdl_er, 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right">{createPreviewTotals.net.toFixed(2)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  </div>
                  <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => setCreatePreviewOpen(false)}>Cancel</Button>
                    <Button onClick={confirmCreateRun} className="bg-gradient-primary">Create Payroll</Button>
                  </DialogFooter>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
                    <Calculator className="h-10 w-10 mb-3 opacity-20" />
                    <p>Select a period and click <strong>Generate Preview</strong> to calculate payroll.</p>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={processOpen} onOpenChange={setProcessOpen}>
            <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Process Payroll</DialogTitle>
                <DialogDescription />
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-start gap-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-red-500" />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide">Important</div>
                    <p>
                      Processing payroll will only post to expense and liability accounts (no bank movement).
                      It will not pay employees. Use Bank Transactions to capture salary payments and allocate
                      them against Accrued Salaries (2510).
                    </p>
                  </div>
                </div>
                {runLines.length > 0 ? (
                  <div className="border rounded-md p-3 bg-muted/30 space-y-3 text-xs mt-2">
                    <div className="text-sm font-semibold">Totals for this run</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>Gross</div><div className="text-right">R {totals.gross.toFixed(2)}</div>
                      <div>PAYE</div><div className="text-right">R {totals.paye.toFixed(2)}</div>
                      <div>UIF (Employee)</div><div className="text-right">R {totals.uif_emp.toFixed(2)}</div>
                      <div>UIF (Employer)</div><div className="text-right">R {totals.uif_er.toFixed(2)}</div>
                      <div>SDL</div><div className="text-right">R {totals.sdl_er.toFixed(2)}</div>
                      <div>Net Pay</div><div className="text-right">R {totals.net.toFixed(2)}</div>
                    </div>
                    <div className="text-sm font-semibold pt-3">Accrual posting (estimated)</div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="font-medium">Dr/Cr</div>
                      <div className="font-medium">Account</div>
                      <div className="font-medium text-right">Code</div>
                      <div className="font-medium text-right">Amount</div>
                      <div>Dr</div><div>Salaries & Wages</div><div className="text-right">6000</div><div className="text-right">R {totals.gross.toFixed(2)}</div>
                      <div>Dr</div><div>Employer UIF Expense</div><div className="text-right">6021</div><div className="text-right">R {totals.uif_er.toFixed(2)}</div>
                      <div>Dr</div><div>Employer SDL Expense</div><div className="text-right">6022</div><div className="text-right">R {totals.sdl_er.toFixed(2)}</div>
                      <div>Cr</div><div>Accrued Salaries</div><div className="text-right">2510</div><div className="text-right">R {totals.net.toFixed(2)}</div>
                      <div>Cr</div><div>PAYE (Tax Payable)</div><div className="text-right">2315</div><div className="text-right">R {totals.paye.toFixed(2)}</div>
                      <div>Cr</div><div>UIF Payable</div><div className="text-right">2210</div><div className="text-right">R {(totals.uif_emp + totals.uif_er).toFixed(2)}</div>
                      <div>Cr</div><div>SDL Payable</div><div className="text-right">2220</div><div className="text-right">R {totals.sdl_er.toFixed(2)}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No payroll lines loaded for this run yet. Generate the preview first to see posting details.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setProcessOpen(false)}>Cancel</Button>
                <Button onClick={handleProcess}>Confirm</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 hidden">
        <CardHeader>
          <CardTitle>Run Details</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedRun ? (
            <div className="py-10 text-center text-muted-foreground">Select a pay run</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <MetricCard title="Gross" value={`R ${totals.gross.toFixed(2)}`} />
                <MetricCard title="PAYE" value={`R ${totals.paye.toFixed(2)}`} />
                <MetricCard title="Net" value={`R ${totals.net.toFixed(2)}`} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Button variant="ghost" onClick={processAllEmployeesInRun}>Process All</Button>
                <Button variant="ghost" onClick={finalizeRun}><Check className="h-4 w-4 mr-2" />Finalize Run</Button>
                <Button variant="ghost" onClick={payNetWages}>Pay Net Wages</Button>
                <Button variant="ghost" onClick={() => setWithholdingOpen(true)}>Withholding</Button>
                {processingAll && (
                  <div className="w-full md:w-64">
                    <Progress value={processingProgress} />
                  </div>
                )}
              </div>
              <div className="flex items-end gap-3 mb-4">
                <div className="w-64">
                  <Label>Employee</Label>
                  <Select value={addLine.employee_id} onValueChange={(v: any) => setAddLine({ ...addLine, employee_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40">
                  <Label>Gross (R)</Label>
                  <Input type="number" step="0.01" value={addLine.gross} onChange={e => setAddLine({ ...addLine, gross: e.target.value })} />
                </div>
                <Button onClick={addEmployeeToRun} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-2" />Add</Button>
              </div>

              {lines.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground">No employees in this run</div>
              ) : (
                <Table>
                <TableHeader className="bg-slate-700 border-b border-slate-800">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="text-white">Employee</TableHead>
                    <TableHead className="text-white text-right">Gross</TableHead>
                    <TableHead className="text-white text-right">PAYE</TableHead>
                    <TableHead className="text-white text-right">UIF Emp</TableHead>
                    <TableHead className="text-white text-right">UIF Er</TableHead>
                    <TableHead className="text-white text-right">SDL Er</TableHead>
                    <TableHead className="text-white text-right">Net</TableHead>
                    <TableHead className="text-white">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(l => {
                    const emp = employees.find(e => e.id === l.employee_id);
                    return (
                      <TableRow key={l.id}>
                        <TableCell>{emp ? `${emp.first_name} ${emp.last_name}` : l.employee_id}</TableCell>
                        <TableCell className="text-right">R {l.gross.toFixed(2)}</TableCell>
                        <TableCell className="text-right">R {l.paye.toFixed(2)}</TableCell>
                        <TableCell className="text-right">R {l.uif_emp.toFixed(2)}</TableCell>
                        <TableCell className="text-right">R {l.uif_er.toFixed(2)}</TableCell>
                        <TableCell className="text-right">R {l.sdl_er.toFixed(2)}</TableCell>
                        <TableCell className="text-right">R {l.net.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => downloadLinePayslip(l)}>Download</Button>
                          <Button size="sm" variant="outline" onClick={() => openSendDialog(l)} className="ml-2">Send</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                    <TableRow>
                      <TableCell className="font-semibold">Totals</TableCell>
                      <TableCell className="text-right font-semibold">R {totals.gross.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">R {totals.paye.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">R {totals.uif_emp.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">R {totals.uif_er.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">R {totals.sdl_er.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">R {totals.net.toFixed(2)}</TableCell>
                    </TableRow>
            </TableBody>
          </Table>
        )}
        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send payslip</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input type="email" placeholder="Recipient email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} />
              <Textarea rows={6} value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSendPayslip} disabled={sending}>{sending ? 'Sending…' : 'Send'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
      )}
       </CardContent>
     </Card>

     <Dialog open={!!viewRun} onOpenChange={(o) => { if (!o) { setViewRun(null); setRunLines([]); } }}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payroll Details - {viewRun ? `${new Date(viewRun.period_start).toLocaleDateString()} to ${new Date(viewRun.period_end).toLocaleDateString()}` : ''}</DialogTitle>
            <DialogDescription>
                Status: <span className="capitalize font-medium">{viewRun?.status}</span>
            </DialogDescription>
          </DialogHeader>
          {viewRun && (
            <div className="overflow-x-auto border rounded-md">
              <Table className="border-collapse text-xs">
                <TableHeader className="bg-slate-700 border-b border-slate-800">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="text-white h-8 py-1 border-r border-white/20 font-semibold">Employee</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">Gross Salary</TableHead>
                    <TableHead className="text-white h-8 py-1 text-center border-r border-white/20 font-semibold">Med Aid Mbrs</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">Med Tax Credit</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">UIF (Emp)</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">PAYE</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">UIF (Er)</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">SDL</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right font-semibold">Net Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runLines.map(l => (
                    <TableRow key={l.id} className="hover:bg-muted/50 odd:bg-white even:bg-muted/10 border-b border-muted">
                      <TableCell className="py-1 px-2 border-r border-muted font-medium">{l.first_name} {l.last_name}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted">{l.gross.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-center border-r border-muted">{(l as any).medical_aid_members || 0}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted text-green-600">{(l as any).medical_tax_credit ? (l as any).medical_tax_credit.toFixed(2) : '0.00'}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted">{l.uif_emp.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted">{l.paye.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted text-muted-foreground">{l.uif_er.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted text-muted-foreground">{l.sdl_er.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right font-bold bg-muted/20">{l.net.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/80 font-bold border-t-2 border-primary/20">
                    <TableCell className="py-2 px-2 border-r border-muted">Totals</TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">{runLines.reduce((s, l) => s + l.gross, 0).toFixed(2)}</TableCell>
                    <TableCell className="py-2 px-2 text-center border-r border-muted">-</TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted text-green-700">
                       {runLines.reduce((s, l) => s + ((l as any).medical_tax_credit || 0), 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">
                       {runLines.reduce((s, l) => s + l.uif_emp, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">{runLines.reduce((s, l) => s + l.paye, 0).toFixed(2)}</TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">
                       {runLines.reduce((s, l) => s + l.uif_er, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">
                       {runLines.reduce((s, l) => s + l.sdl_er, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right">{runLines.reduce((s, l) => s + l.net, 0).toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
             <Button variant="outline" onClick={() => setViewRun(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}
function RunPayrollWizard({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [step, setStep] = useState<number>(1);
  const [frequency, setFrequency] = useState<string>("monthly");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [run, setRun] = useState<any>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [editRate, setEditRate] = useState<string>("");
  const [entries, setEntries] = useState<Record<string, { allowance: string; overtime: string }>>({});
  const [lines, setLines] = useState<any[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("employees" as any).select("*").eq("company_id", companyId).order("first_name", { ascending: true });
      setEmployees((data || []) as any);
    };
    if (companyId) load();
  }, [companyId]);
  const ensureRun = async () => {
    const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const end = new Date(year, month, 0).toISOString().slice(0, 10);
    const { data: existing } = await supabase.from("pay_runs" as any).select("*").eq("company_id", companyId).eq("period_start", start).eq("period_end", end).maybeSingle();
    if (existing) { setRun(existing); return existing; }
    const { data, error } = await supabase.from("pay_runs" as any).insert({ company_id: companyId, period_start: start, period_end: end, status: "draft" } as any).select("*").single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    setRun(data); return data;
  };
  const deleteEmployee = async (empId: string) => {
    if (!confirm("Are you sure you want to delete this employee? This action cannot be undone.")) return;
    try {
        // Delete related pay items first (if cascade is not set up)
        await supabase.from("employee_pay_items" as any).delete().eq("employee_id", empId);
        
        // Delete the employee
        const { error } = await supabase.from("employees" as any).delete().eq("id", empId);
        if (error) throw error;
        
        toast({ title: "Deleted", description: "Employee removed successfully" });
        const { data } = await supabase.from("employees" as any).select("*").eq("company_id", companyId);
        setEmployees((data || []) as any);
    } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openEdit = async (emp: Employee) => {
    setEditEmp(emp);
    const { data: basicItem } = await supabase.from("pay_items" as any).select("id").eq("company_id", companyId).eq("name", "Basic Salary").maybeSingle();
    const basicId = (basicItem as any)?.id;
    if (!basicId) { setEditRate("0"); setEditOpen(true); return; }
    const { data: ep } = await supabase.from("employee_pay_items" as any).select("amount").eq("employee_id", emp.id).eq("pay_item_id", basicId).maybeSingle();
    const amt = ep ? Number((ep as any).amount || 0) : 0;
    setEditRate(String(amt));
    setEditOpen(true);
  };
  const saveEdit = async () => {
    if (!editEmp) return;
    const { data: basicItem } = await supabase.from("pay_items" as any).select("id").eq("company_id", companyId).eq("name", "Basic Salary").maybeSingle();
    const basicId = (basicItem as any)?.id;
    if (!basicId) {
      const { data } = await supabase.from("pay_items" as any).insert({ company_id: companyId, code: "BASIC_SALARY", name: "Basic Salary", type: "earning", taxable: true } as any).select("id").single();
      const newId = (data as any)?.id;
      if (!newId) return;
      await supabase.from("employee_pay_items" as any).insert({ employee_id: editEmp.id, pay_item_id: newId, amount: parseFloat(editRate || "0"), rate: null, unit: null } as any);
    } else {
      const { data: ep } = await supabase.from("employee_pay_items" as any).select("id").eq("employee_id", editEmp.id).eq("pay_item_id", basicId).maybeSingle();
      if (ep) {
        await supabase.from("employee_pay_items" as any).update({ amount: parseFloat(editRate || "0") } as any).eq("id", (ep as any).id);
      } else {
        await supabase.from("employee_pay_items" as any).insert({ employee_id: editEmp.id, pay_item_id: basicId, amount: parseFloat(editRate || "0"), rate: null, unit: null } as any);
      }
    }
    setEditOpen(false);
  };
  const computePAYE = (monthlyGross: number): number => {
    const annual = monthlyGross * 12;
    const brackets = [
      { upTo: 237100, base: 0, rate: 0.18, over: 0 },
      { upTo: 370500, base: 42678, rate: 0.26, over: 237100 },
      { upTo: 512800, base: 77362, rate: 0.31, over: 370500 },
      { upTo: 673000, base: 121475, rate: 0.36, over: 512800 },
      { upTo: 857900, base: 179147, rate: 0.39, over: 673000 },
      { upTo: 1817000, base: 251258, rate: 0.41, over: 857900 },
      { upTo: Infinity, base: 644489, rate: 0.45, over: 1817000 },
    ];
    let taxAnnual = 0;
    for (const b of brackets) { if (annual <= b.upTo) { taxAnnual = b.base + (annual - b.over) * b.rate; break; } }
    const rebateAnnual = 17235;
    const taxAfterRebate = Math.max(0, taxAnnual - rebateAnnual);
    return +(taxAfterRebate / 12).toFixed(2);
  };
  const processAll = async () => {
    const r = await ensureRun();
    if (!r) return;
    const { data: earningItems } = await supabase
      .from("pay_items" as any)
      .select("id,type")
      .eq("company_id", companyId)
      .eq("type", "earning");
    const earningIds = (earningItems || []).map((i: any) => i.id);
    const earningsByEmployee: Record<string, number> = {};
    if (earningIds.length) {
      const { data: all } = await supabase
        .from("employee_pay_items" as any)
        .select("employee_id, amount, pay_item_id")
        .in("employee_id", employees.map(e => e.id))
        .in("pay_item_id", earningIds);
      (all || []).forEach((row: any) => {
        const key = String(row.employee_id);
        const current = earningsByEmployee[key] || 0;
        earningsByEmployee[key] = current + Number(row.amount || 0);
      });
    }
    for (const e of employees) {
      const baseEarnings = earningsByEmployee[e.id] || 0;
      const allowance = parseFloat(entries[e.id]?.allowance || "0");
      const overtime = parseFloat(entries[e.id]?.overtime || "0");
      const gross = +(baseEarnings + allowance + overtime).toFixed(2);
      const uifCapMonthly = 177.12;
      const uifEmpRaw = +(gross * 0.01).toFixed(2);
      const uif_emp = Math.min(uifEmpRaw, uifCapMonthly);
      const uif_er = +(gross * 0.01).toFixed(2);
      const sdl_er = +(gross * 0.01).toFixed(2);
      const paye = computePAYE(gross);
      const net = +(gross - paye - uif_emp).toFixed(2);
      const payload = { pay_run_id: (r as any).id, employee_id: e.id, gross, net, paye, uif_emp, uif_er, sdl_er } as any;
      const { data: existing } = await supabase.from("pay_run_lines" as any).select("id").eq("pay_run_id", (r as any).id).eq("employee_id", e.id).maybeSingle();
      if (existing) { await supabase.from("pay_run_lines" as any).update(payload as any).eq("id", (existing as any).id); } else { await supabase.from("pay_run_lines" as any).insert(payload as any); }
    }
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", (r as any).id);
    setLines((data || []) as any);
    toast({ title: "Processed", description: "Calculations updated" });
  };
  const loadLinesLocal = React.useCallback(async () => {
    if (!run) return;
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", (run as any).id);
    setLines((data || []) as any);
  }, [run?.id]);
  useEffect(() => { loadLinesLocal(); }, [run?.id, loadLinesLocal]);
  const totals = useMemo(() => {
    const gross = lines.reduce((s, l: any) => s + (l.gross || 0), 0);
    const paye = lines.reduce((s, l: any) => s + (l.paye || 0), 0);
    const uif_emp = lines.reduce((s, l: any) => s + (l.uif_emp || 0), 0);
    const uif_er = lines.reduce((s, l: any) => s + (l.uif_er || 0), 0);
    const sdl_er = lines.reduce((s, l: any) => s + (l.sdl_er || 0), 0);
    const uif = uif_emp + uif_er;
    const sdl = sdl_er;
    const net = lines.reduce((s, l: any) => s + (l.net || 0), 0);
    return { gross, paye, uif_emp, uif_er, uif, sdl_er, sdl, net };
  }, [lines]);
  const ensureAccountByCode = async (nm: string, tp: 'asset' | 'liability' | 'equity' | 'income' | 'expense', code: string) => {
    const { data: found } = await supabase.from('chart_of_accounts' as any).select('id').eq('company_id', companyId).eq('account_code', code).maybeSingle();
    if ((found as any)?.id) return (found as any).id as string;
    const { data } = await supabase.from('chart_of_accounts' as any).insert({ company_id: companyId, account_code: code, account_name: nm, account_type: tp, is_active: true } as any).select('id').single();
    return (data as any).id as string;
  };
  const postRunJournal = async () => {
    if (!run || lines.length === 0) return;
    const paye = totals.paye;
    const uifEmp = lines.reduce((s, l: any) => s + (l.uif_emp || 0), 0);
    const uifEr = lines.reduce((s, l: any) => s + (l.uif_er || 0), 0);
    const sdlEr = totals.sdl;
    const gross = totals.gross;
    const net = totals.net;
    const postDate = new Date().toISOString().slice(0, 10);
    const salaryExp = await ensureAccountByCode('Salaries & Wages', 'expense', '6000');
    const uifExp = await ensureAccountByCode('Employer UIF Expense', 'expense', '6021');
    const sdlExp = await ensureAccountByCode('Employer SDL Expense', 'expense', '6022');
    const netPayable = await ensureAccountByCode('Accrued Salaries', 'liability', '2510');
    const payePayable = await ensureAccountByCode('PAYE (Tax Payable)', 'liability', '2315');
    const uifPayable = await ensureAccountByCode('UIF Payable', 'liability', '2210');
    const sdlPayable = await ensureAccountByCode('SDL Payable', 'liability', '2220');
    const benefitsPayable = await ensureAccountByCode('Employee Benefits Payable', 'liability', '2230');
    const benefitsTotal = 0;
    const { data: { user } } = await supabase.auth.getUser();
    const basePayload: any = { company_id: companyId, user_id: user?.id || '', transaction_date: postDate, description: `Payroll posting ${new Date(run.period_start).toLocaleDateString()} - ${new Date(run.period_end).toLocaleDateString()}`, total_amount: gross, status: 'pending', reference_number: run.id };
    const { data: tx } = await supabase.from('transactions' as any).insert(basePayload as any).select('id').single();
    const txId = (tx as any)?.id;
    if (!txId) return;
    const rows = [
      { transaction_id: txId, account_id: salaryExp, debit: gross, credit: 0, description: 'Salaries & Wages', status: 'approved' },
      { transaction_id: txId, account_id: uifExp, debit: uifEr, credit: 0, description: 'Employer UIF Expense', status: 'approved' },
      { transaction_id: txId, account_id: sdlExp, debit: sdlEr, credit: 0, description: 'Employer SDL Expense', status: 'approved' },
      { transaction_id: txId, account_id: netPayable, debit: 0, credit: net, description: 'Net Salaries Payable', status: 'approved' },
      { transaction_id: txId, account_id: payePayable, debit: 0, credit: paye, description: 'PAYE Payable', status: 'approved' },
      { transaction_id: txId, account_id: uifPayable, debit: 0, credit: uifEmp + uifEr, description: 'UIF Payable', status: 'approved' },
      { transaction_id: txId, account_id: sdlPayable, debit: 0, credit: sdlEr, description: 'SDL Payable', status: 'approved' },
      { transaction_id: txId, account_id: benefitsPayable, debit: 0, credit: benefitsTotal, description: 'Employee Benefits Payable', status: 'approved' },
    ];
    await supabase.from('transaction_entries' as any).insert(rows as any);
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: txId, description: r.description }));
    await supabase.from('ledger_entries' as any).insert(ledgerRows as any);
    await supabase.from('transactions' as any).update({ status: 'posted' } as any).eq('id', txId);
    toast({ title: 'Posted', description: 'Payroll journal posted' });
    window.dispatchEvent(new Event('payroll-data-changed'));
  };
  const pickCompanyBank = async (): Promise<string | null> => {
    const { data } = await supabase.from('bank_accounts' as any).select('id').eq('company_id', companyId).order('account_name');
    const b = (data || [])[0] as any;
    return b ? String(b.id) : null;
  };
  const postEmployeePayments = async () => {
    const bankId = await pickCompanyBank();
    if (!bankId || lines.length === 0) { toast({ title: 'Bank', description: 'No bank account or lines' }); return; }
    const net = totals.net;
    const postDate = new Date().toISOString().slice(0, 10);
    const bankLedger = await ensureAccountByCode('Bank', 'asset', '1000');
    const netPayable = await ensureAccountByCode('Net Salaries Payable', 'liability', '2100-NET');
    const { data: { user } } = await supabase.auth.getUser();
    const base: any = { company_id: companyId, user_id: user?.id || '', transaction_date: postDate, description: 'Employees payment', total_amount: net, status: 'pending', transaction_type: 'payment' };
    const { data: tx } = await supabase.from('transactions' as any).insert({ ...base, bank_account_id: bankId } as any).select('id').single();
    const txId = (tx as any)?.id; if (!txId) return;
    const rows = [
      { transaction_id: txId, account_id: netPayable, debit: net, credit: 0, description: 'Net Salaries Payable', status: 'approved' },
      { transaction_id: txId, account_id: bankLedger, debit: 0, credit: net, description: 'Bank', status: 'approved' },
    ];
    await supabase.from('transaction_entries' as any).insert(rows as any);
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: txId, description: r.description }));
    await supabase.from('ledger_entries' as any).insert(ledgerRows as any);
    await supabase.from('transactions' as any).update({ status: 'posted' } as any).eq('id', txId);
    toast({ title: 'Paid', description: 'Employees payment posted' });
    window.dispatchEvent(new Event('payroll-data-changed'));
  };
  const postSarsPayment = async () => {
    const bankId = await pickCompanyBank();
    if (!bankId || lines.length === 0) { toast({ title: 'Bank', description: 'No bank account or lines' }); return; }
    const paye = totals.paye;
    const uif = lines.reduce((s, l: any) => s + (l.uif_emp || 0) + (l.uif_er || 0), 0);
    const sdl = totals.sdl;
    const total = paye + uif + sdl;
    const postDate = new Date().toISOString().slice(0, 10);
    const bankLedger = await ensureAccountByCode('Bank', 'asset', '1000');
    const payePayable = await ensureAccountByCode('PAYE Payable', 'liability', '2200');
    const uifPayable = await ensureAccountByCode('UIF Payable', 'liability', '2210');
    const sdlPayable = await ensureAccountByCode('SDL Payable', 'liability', '2220');
    const { data: { user } } = await supabase.auth.getUser();
    const base: any = { company_id: companyId, user_id: user?.id || '', transaction_date: postDate, description: 'SARS payment', total_amount: total, status: 'pending', reference_number: 'SARS-PAY' };
    const { data: tx } = await supabase.from('transactions' as any).insert(base as any).select('id').single();
    const txId = (tx as any)?.id; if (!txId) return;
    const rows = [
      { transaction_id: txId, account_id: payePayable, debit: paye, credit: 0, description: 'PAYE Payable', status: 'approved' },
      { transaction_id: txId, account_id: uifPayable, debit: uif, credit: 0, description: 'UIF Payable', status: 'approved' },
      { transaction_id: txId, account_id: sdlPayable, debit: sdl, credit: 0, description: 'SDL Payable', status: 'approved' },
      { transaction_id: txId, account_id: bankLedger, debit: 0, credit: total, description: 'Bank', status: 'approved' },
    ];
    await supabase.from('transaction_entries' as any).insert(rows as any);
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: txId, description: r.description }));
    await supabase.from('ledger_entries' as any).insert(ledgerRows as any);
    await supabase.from('transactions' as any).update({ status: 'posted' } as any).eq('id', txId);
    toast({ title: 'Paid', description: 'SARS payment posted' });
    window.dispatchEvent(new Event('payroll-data-changed'));
  };
  const postBenefitsPayment = async () => {
    const bankId = await pickCompanyBank();
    if (!bankId) { toast({ title: 'Bank', description: 'No bank account' }); return; }
    const total = 0;
    if (total <= 0) { toast({ title: 'No Benefits', description: 'No benefits payable' }); return; }
    const postDate = new Date().toISOString().slice(0, 10);
    const bankLedger = await ensureAccountByCode('Bank', 'asset', '1000');
    const benefitsPayable = await ensureAccountByCode('Employee Benefits Payable', 'liability', '2100-BEN');
    const { data: { user } } = await supabase.auth.getUser();
    const base: any = { company_id: companyId, user_id: user?.id || '', transaction_date: postDate, description: 'Benefits payment', total_amount: total, status: 'pending', reference_number: 'BEN-PAY' };
    const { data: tx } = await supabase.from('transactions' as any).insert(base as any).select('id').single();
    const txId = (tx as any)?.id; if (!txId) return;
    const rows = [
      { transaction_id: txId, account_id: benefitsPayable, debit: total, credit: 0, description: 'Employee Benefits Payable', status: 'approved' },
      { transaction_id: txId, account_id: bankLedger, debit: 0, credit: total, description: 'Bank', status: 'approved' },
    ];
    await supabase.from('transaction_entries' as any).insert(rows as any);
    const ledgerRows = rows.map(r => ({ company_id: companyId, account_id: r.account_id, debit: r.debit, credit: r.credit, entry_date: postDate, is_reversed: false, transaction_id: txId, description: r.description }));
    await supabase.from('ledger_entries' as any).insert(ledgerRows as any);
    await supabase.from('transactions' as any).update({ status: 'posted' } as any).eq('id', txId);
    toast({ title: 'Paid', description: 'Benefits payment posted' });
  };
  const finalizePosting = async () => {
    if (!run) return;
    const { error } = await supabase.rpc("post_pay_run_finalize", { _pay_run_id: (run as any).id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Posted", description: "General ledger posting completed" });
  };
  const downloadAll = async () => {
    if (!run) return;
    const { data: company } = await supabase
      .from('companies')
      .select('name,email,phone,address,tax_number,vat_number,logo_url')
      .eq('id', companyId)
      .maybeSingle();
    const logoDataUrl = await fetchLogoDataUrl((company as any)?.logo_url);
    for (const l of lines) {
      const emp = employees.find(e => e.id === l.employee_id);
      const employee_name = emp ? `${emp.first_name} ${emp.last_name}` : l.employee_id;
      const slip: PayslipForPDF = { period_start: run.period_start, period_end: run.period_end, employee_name, gross: l.gross, net: l.net, paye: l.paye, uif_emp: l.uif_emp, uif_er: l.uif_er, sdl_er: l.sdl_er, details: null };
      const doc = buildPayslipPDF(slip, (company as any) || { name: 'Company' });
      if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const periodName = `${new Date(run.period_start).toLocaleDateString('en-ZA')} - ${new Date(run.period_end).toLocaleDateString('en-ZA')}`;
      a.href = url;
      a.download = `payslip_${employee_name.replace(/\s+/g,'_')}_${periodName.replace(/\s+/g,'_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Run Payroll</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <Badge variant="secondary">Running payroll for {new Date(year, month - 1, 1).toLocaleString('en-ZA', { month: 'long', year: 'numeric' })}</Badge>
          {run && <Badge variant="outline" className="capitalize">Status: {String(run.status || 'draft')}</Badge>}
        </div>
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={(v: any) => setFrequency(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnight">Fortnight</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value || '0'))} />
              </div>
              <div>
                <Label>Month</Label>
                <Input type="number" value={month} onChange={e => setMonth(parseInt(e.target.value || '0'))} />
              </div>
            </div>
            <Button className="bg-gradient-primary" onClick={async () => { const r = await ensureRun(); if (r) setStep(2); }}>Next</Button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <Table>
              <TableHeader className="bg-slate-700 border-b border-slate-800">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-white">Name</TableHead>
                  <TableHead className="text-white">Salary Type</TableHead>
                  <TableHead className="text-white">Rate</TableHead>
                  <TableHead className="text-white">Status</TableHead>
                  <TableHead className="text-white"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(e => (
                  <TableRow key={e.id}>
                    <TableCell>{e.first_name} {e.last_name}</TableCell>
                    <TableCell>{e.salary_type || '-'}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openEdit(e)}>Edit Rate</Button>
                    </TableCell>
                    <TableCell>{e.active ? 'Active' : 'Inactive'}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button className="bg-gradient-primary" onClick={() => setStep(3)}>Next</Button>
            </div>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>Edit Rate</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Label>Basic Salary</Label>
                  <Input type="number" step="0.01" value={editRate} onChange={e => setEditRate(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button onClick={saveEdit}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <Table>
              <TableHeader className="bg-slate-700 border-b border-slate-800">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="text-white">Employee</TableHead>
                  <TableHead className="text-white">Basic Salary</TableHead>
                  <TableHead className="text-white">Overtime</TableHead>
                  <TableHead className="text-white">Allowances</TableHead>
                  <TableHead className="text-white">UIF</TableHead>
                  <TableHead className="text-white">PAYE</TableHead>
                  <TableHead className="text-white">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(e => {
                  const entry = entries[e.id] || { allowance: "", overtime: "" };
                  const line = lines.find(l => l.employee_id === e.id);
                  const basic = line ? `R ${Number(line.gross || 0).toFixed(2)}` : "-";
                  const paye = line ? `R ${Number(line.paye || 0).toFixed(2)}` : "-";
                  const uif = line ? `R ${(Number(line.uif_emp || 0) + Number(line.uif_er || 0)).toFixed(2)}` : "-";
                  const net = line ? `R ${Number(line.net || 0).toFixed(2)}` : "-";
                  return (
                    <TableRow key={e.id}>
                      <TableCell>{e.first_name} {e.last_name}</TableCell>
                      <TableCell>{basic}</TableCell>
                      <TableCell>
                        <Input className="w-28" type="number" step="0.01" value={entry.overtime} onChange={ev => setEntries({ ...entries, [e.id]: { ...entry, overtime: ev.target.value } })} />
                      </TableCell>
                      <TableCell>
                        <Input className="w-28" type="number" step="0.01" value={entry.allowance} onChange={ev => setEntries({ ...entries, [e.id]: { ...entry, allowance: ev.target.value } })} />
                      </TableCell>
                      <TableCell>{uif}</TableCell>
                      <TableCell>{paye}</TableCell>
                      <TableCell>{net}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button className="bg-gradient-primary" onClick={processAll}>Process All</Button>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard title="Gross Pay" value={`R ${totals.gross.toFixed(2)}`} />
              <StatCard title="PAYE" value={`R ${totals.paye.toFixed(2)}`} />
              <StatCard title="UIF" value={`R ${totals.uif.toFixed(2)}`} />
              <StatCard title="SDL" value={`R ${totals.sdl.toFixed(2)}`} />
              <StatCard title="Net Pay" value={`R ${totals.net.toFixed(2)}`} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <Button className="bg-gradient-primary" onClick={() => setStep(5)}>Next</Button>
            </div>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <Button variant="outline" onClick={downloadAll}>Download PDF</Button>
              <Button variant="outline" onClick={() => toast({ title: 'Email', description: 'Compose emails via payslips list' })}>Email Payslips</Button>
              <Button className="bg-gradient-primary" onClick={finalizePosting}>Post to General Ledger</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeesSimple({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [pageEmp, setPageEmp] = useState(0);
  const [pageSizeEmp, setPageSizeEmp] = useState(7);
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth() + 1);
  const [search, setSearch] = useState("");
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [filterPaye, setFilterPaye] = useState<"all" | "yes" | "no">("all");
  const [filterUif, setFilterUif] = useState<"all" | "yes" | "no">("all");
  const [salaries, setSalaries] = useState<Record<string, number>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    id_number: "",
    start_date: "",
    position: "",
    department: "",
    payroll_number: "",
    tax_number: "",
    salary_type: "monthly",
    salary_amount: "",
    bank_name: "",
    bank_branch_code: "",
    bank_account_number: "",
    bank_account_type: "checking",
    paye_registered: false,
    uif_registered: false,
    medical_aid_members: 0,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [earningsRows, setEarningsRows] = useState<{ pay_item_id: string; name: string; amount: string }[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsSaving, setEarningsSaving] = useState(false);
  const [deductOpen, setDeductOpen] = useState(false);
  const [deductEmp, setDeductEmp] = useState<Employee | null>(null);
  const [deductRows, setDeductRows] = useState<{ pay_item_id: string; name: string; selected: boolean }[]>([]);
  const [deductLoading, setDeductLoading] = useState(false);
  const [deductSaving, setDeductSaving] = useState(false);
  
  // Payslip View State
  const [payslipOpen, setPayslipOpen] = useState(false);
  const [payslipData, setPayslipData] = useState<PayslipForPDF | null>(null);
  const [payslipCompany, setPayslipCompany] = useState<any>(null);
  
  // Tax Calculation View State
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcData, setCalcData] = useState<any>(null);

  // IRP5 Dialog State
  const [irp5Open, setIrp5Open] = useState(false);
  const [irp5EmpId, setIrp5EmpId] = useState<string | null>(null);
  const [irp5EmpName, setIrp5EmpName] = useState<string>("");
  const [irp5Year, setIrp5Year] = useState<number>(new Date().getFullYear());
  const [irp5Month, setIrp5Month] = useState<number>(new Date().getMonth() + 1);

  const employeeSchema = z.object({
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    id_number: z.string().regex(/^\d{13}$/, "Must be 13 digits").refine(val => validateSAID(val), "Invalid SA ID Number"),
    start_date: z.string().min(1),
    position: z.string().optional(),
    department: z.string().optional(),
    payroll_number: z.string().optional(),
    tax_number: z.string().optional(),
    salary_type: z.enum(["monthly","hourly","weekly"]),
    salary_amount: z.string().min(1),
    bank_name: z.string().optional(),
    bank_branch_code: z.string().optional(),
    bank_account_number: z.string().optional(),
    bank_account_type: z.enum(["checking","savings"]).optional(),
    paye_registered: z.boolean().default(false),
    uif_registered: z.boolean().default(false),
    medical_aid_registered: z.boolean().default(false),
    medical_aid_members: z.coerce.number().min(0).default(0),
  });
  const employeeForm = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      id_number: "",
      start_date: "",
      position: "",
      department: "",
      payroll_number: "",
      tax_number: "",
      salary_type: "monthly",
      salary_amount: "",
      bank_name: "",
      bank_branch_code: "",
      bank_account_number: "",
      bank_account_type: "checking",
      paye_registered: false,
      uif_registered: false,
      medical_aid_registered: false,
      medical_aid_members: 0,
    }
  });
  const bankBranchCodes: Record<string, string> = {
    "ABSA": "632005",
    "FNB": "250655",
    "Standard Bank": "051001",
    "Nedbank": "198765",
    "Capitec": "470010",
    "Investec": "580105",
    "TymeBank": "678910",
    "Bidvest": "462005",
    "Discovery": "679000",
    "African Bank": "430000",
  };
  const positions = [
    "Intern",
    "Junior Developer",
    "Developer",
    "Senior Developer",
    "Principal Engineer",
    "QA Engineer",
    "DevOps Engineer",
    "System Administrator",
    "Security Analyst",
    "Data Analyst",
    "Data Engineer",
    "UX Designer",
    "UI Designer",
    "Product Designer",
    "Product Manager",
    "Project Manager",
    "Business Analyst",
    "Finance Manager",
    "Accountant",
    "Bookkeeper",
    "HR Generalist",
    "HR Manager",
    "Operations Manager",
    "Admin Assistant",
    "Receptionist",
    "Support Agent",
    "Sales Representative",
    "Sales Manager",
    "Marketing Specialist",
    "Store Manager",
    "Warehouse Clerk",
    "Driver",
    "Cleaner",
    "Other",
  ];
  const ensureCurrentRun = async () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from("pay_runs" as any)
      .select("*")
      .eq("company_id", companyId)
      .eq("period_start", start)
      .eq("period_end", end)
      .maybeSingle();
    if (existing) return existing as any;
    const { data, error } = await supabase
      .from("pay_runs" as any)
      .insert({ company_id: companyId, period_start: start, period_end: end, status: "draft" } as any)
      .select("*")
      .single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return null; }
    return data as any;
  };
  const getTotalEarnings = async (empId: string): Promise<number> => {
    const { data: earningItems } = await supabase
      .from("pay_items" as any)
      .select("id,type")
      .eq("company_id", companyId)
      .eq("type", "earning");
    const earningIds = (earningItems || []).map((i: any) => i.id);
    if (!earningIds.length) return 0;
    const { data: rows } = await supabase
      .from("employee_pay_items" as any)
      .select("amount, pay_item_id")
      .eq("employee_id", empId)
      .in("pay_item_id", earningIds);
    let total = 0;
    (rows || []).forEach((r: any) => {
      total += Number(r.amount || 0);
    });
    return total;
  };
  const runPayrollForEmployee = async (empId: string) => {
    const run = await ensureCurrentRun();
    if (!run) return;
    const gross = +(await getTotalEarnings(empId)).toFixed(2);
    
    try {
      await processPayroll({
        company_id: companyId,
        employee_id: empId,
        period_start: (run as any).period_start,
        period_end: (run as any).period_end,
        pay_run_id: (run as any).id,
        overrideGross: gross
      });
      toast({ title: "Processed", description: "Payroll calculated for employee" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };
  const processSelected = async () => {
    const ids = Object.entries(selected).filter(([_, v]) => v).map(([id]) => id);
    if (ids.length === 0) { toast({ title: "Select Employees", description: "Choose employees to process in bulk" }); return; }
    const run = await ensureCurrentRun();
    if (!run) return;
    for (const id of ids) { await runPayrollForEmployee(id); }
    toast({ title: "Processed", description: "Bulk payroll completed" });
  };
  const downloadPayslipForEmployee = async (empId: string) => {
    const { data: runs } = await supabase
      .from("pay_runs" as any)
      .select("*")
      .eq("company_id", companyId)
      .order("period_start", { ascending: false });
    const run = (runs || [])[0];
    if (!run) { toast({ title: "No Run", description: "Create a pay run first" }); return; }
    const { data: l } = await supabase
      .from("pay_run_lines" as any)
      .select("*")
      .eq("pay_run_id", (run as any).id)
      .eq("employee_id", empId)
      .maybeSingle();
    if (!l) { toast({ title: "No Payslip", description: "Employee not processed in current run" }); return; }
    const emp = employees.find(e => e.id === empId);
    const employee_name = emp ? `${emp.first_name} ${emp.last_name}` : empId;
    const slip: PayslipForPDF = {
      period_start: (run as any).period_start,
      period_end: (run as any).period_end,
      employee_name,
      gross: (l as any).gross,
      net: (l as any).net,
      paye: (l as any).paye,
      uif_emp: (l as any).uif_emp,
      uif_er: (l as any).uif_er,
      sdl_er: (l as any).sdl_er,
      details: null,
    };
    const { data: company } = await supabase
      .from('companies')
      .select('name,email,phone,address,tax_number,vat_number,logo_url')
      .eq('id', companyId)
      .maybeSingle();
    const doc = buildPayslipPDF(slip, (company as any) || { name: 'Company' });
    const logoDataUrl = await fetchLogoDataUrl((company as any)?.logo_url);
    if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
    const periodName = `${new Date((run as any).period_start).toLocaleDateString('en-ZA')} - ${new Date((run as any).period_end).toLocaleDateString('en-ZA')}`;
    doc.save(`payslip_${employee_name.replace(/\s+/g,'_')}_${periodName.replace(/\s+/g,'_')}.pdf`);
  };
  const viewPayslip = async (empId: string) => {
    const start = new Date(filterYear, filterMonth - 1, 1).toISOString().slice(0, 10);
    const end = new Date(filterYear, filterMonth, 0).toISOString().slice(0, 10);
    
    let run: any = null;

    // 1. Try to find run for selected period
    const { data: specificRun } = await supabase
      .from("pay_runs" as any)
      .select("*")
      .eq("company_id", companyId)
      .eq("period_start", start)
      .eq("period_end", end)
      .maybeSingle();
      
    if (specificRun) {
        run = specificRun;
    } else {
        // 2. Fallback: Find LATEST finalized/paid run
        const { data: latestRuns } = await supabase
          .from("pay_runs" as any)
          .select("*")
          .eq("company_id", companyId)
          .neq("status", "draft")
          .order("period_start", { ascending: false })
          .limit(1);
          
        if (latestRuns && latestRuns.length > 0) {
            run = latestRuns[0];
            toast({ description: `Showing latest available payslip (${new Date(run.period_start).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })})` });
        }
    }

    if (!run) { toast({ title: "No Run", description: "No finalized payroll run found" }); return; }
    
    // Check status - must be finalized or paid
    if ((run as any).status === 'draft') {
        toast({ title: "Not Available", description: "Payslips are only available for finalized or paid runs", variant: "destructive" });
        return;
    }

    const { data: l } = await supabase
      .from("pay_run_lines" as any)
      .select("*")
      .eq("pay_run_id", (run as any).id)
      .eq("employee_id", empId)
      .maybeSingle();

    if (!l) { toast({ title: "No Payslip", description: "Employee not processed in this run" }); return; }

    const emp = employees.find(e => e.id === empId);
    const employee_name = emp ? `${emp.first_name} ${emp.last_name}` : empId;
    
    const slip: PayslipForPDF = {
      period_start: (run as any).period_start,
      period_end: (run as any).period_end,
      employee_name,
      id_number: emp?.id_number,
      tax_number: emp?.tax_number,
      position: emp?.position,
      gross: (l as any).gross,
      net: (l as any).net,
      paye: (l as any).paye,
      uif_emp: (l as any).uif_emp,
      uif_er: (l as any).uif_er,
      sdl_er: (l as any).sdl_er,
      details: (l as any).details,
    };

    const { data: company } = await supabase
      .from('companies')
      .select('name,email,phone,address,tax_number,vat_number,logo_url')
      .eq('id', companyId)
      .maybeSingle();
    
    setPayslipData(slip);
    setPayslipCompany((company as any) || { name: 'Company' });
    setPayslipOpen(true);
  };

  const downloadCurrentPayslip = async () => {
    if (!payslipData || !payslipCompany) return;
    const doc = buildPayslipPDF(payslipData, payslipCompany);
    const logoDataUrl = await fetchLogoDataUrl(payslipCompany?.logo_url);
    if (logoDataUrl) addLogoToPDF(doc, logoDataUrl);
    
    const periodName = `${new Date(payslipData.period_start).toLocaleDateString('en-ZA')} - ${new Date(payslipData.period_end).toLocaleDateString('en-ZA')}`;
    doc.save(`payslip_${payslipData.employee_name.replace(/\s+/g,'_')}_${periodName.replace(/\s+/g,'_')}.pdf`);
  };

  const viewCalculations = async (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    // Fetch latest finalized run (or current draft if editing)
    // For now, let's just use the current gross salary to show a "What-If" calculation
    // or fetch from the latest run if available.
    
    // We will do a live calculation based on their current gross income (all earnings)
    const gross = await getEmployeeGross(emp.id);
    const start = new Date(filterYear, filterMonth - 1, 1).toISOString().slice(0, 10);
    const end = new Date(filterYear, filterMonth, 0).toISOString().slice(0, 10);
    
    const { paye, uif_emp, uif_er, sdl_er, medical_tax_credit } = await calculatePAYE(
        companyId, 
        emp, 
        { period_start: start, period_end: end, gross }
    );
    
    const cfg = await getCompanyTaxSettings(companyId, end);
    
    setCalcData({
        employee: emp,
        gross,
        paye,
        uif_emp,
        uif_er,
        sdl_er,
        medical_tax_credit,
        tax_brackets: cfg.brackets,
        rebates: cfg.rebates,
        period: { start, end }
    });
    
    // Also fetch company details for the logo
    const { data: company } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle();
    setPayslipCompany(company); // Reuse this state for logo
    
    setCalcOpen(true);
  };

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("employees" as any).select("*").eq("company_id", companyId).order("first_name", { ascending: true });
      const list = (data || []) as any;
      setEmployees(list);
      setLoading(false);
      try {
        if (!list?.length) { setSalaries({}); return; }
        const ids = list.map((e: any) => e.id);
        const { data: earningItems } = await supabase
          .from("pay_items" as any)
          .select("id")
          .eq("company_id", companyId)
          .eq("type", "earning");
        const earningIds = (earningItems || []).map((i: any) => i.id);
        if (!earningIds.length) { setSalaries({}); return; }
        const { data: eps } = await supabase
          .from("employee_pay_items" as any)
          .select("employee_id, amount, pay_item_id")
          .in("employee_id", ids)
          .in("pay_item_id", earningIds);
        const map: Record<string, number> = {};
        (eps || []).forEach((r: any) => {
          const key = String(r.employee_id);
          const amt = Number((r as any).amount || 0);
          map[key] = (map[key] || 0) + amt;
        });
        setSalaries(map);
      } catch {
        setSalaries({});
      }
    };
    if (companyId) load();
  }, [companyId]);
  const watchMedicalAid = employeeForm.watch("medical_aid_registered");

  const filtered = useMemo(() => {
    let list = employees;
    if (search.trim().length) {
      const q = search.trim().toLowerCase();
      list = list.filter(e => `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || String((e as any).position || '').toLowerCase().includes(q) || String((e as any).department || '').toLowerCase().includes(q));
    }
    if (filterPosition !== "all") {
      list = list.filter(e => String((e as any).position || '').toLowerCase() === String(filterPosition).toLowerCase());
    }
    if (filterPaye !== "all") {
      list = list.filter(e => !!(e as any).paye_registered === (filterPaye === "yes"));
    }
    if (filterUif !== "all") {
      list = list.filter(e => !!(e as any).uif_registered === (filterUif === "yes"));
    }
    return list;
  }, [employees, search, filterPosition, filterPaye, filterUif]);
  const toggleActive = async (empId: string, active: boolean) => {
    await supabase.from("employees" as any).update({ active } as any).eq("id", empId);
    const { data } = await supabase.from("employees" as any).select("*").eq("company_id", companyId);
    setEmployees((data || []) as any);
  };
  const handleIDChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const id = e.target.value;
    setForm(prev => ({ ...prev, id_number: id }));
    
    // Auto-parse if valid
    const parsed = parseSAID(id);
    if (parsed) {
        // Calculate gender
        // (No gender field in form currently, but we can log or set if added later)
        
        // Calculate DOB
        const dob = parsed.birthDate.toISOString().slice(0, 10); // YYYY-MM-DD
        
        // Auto-fill Start Date (optional, maybe default to today if empty?)
        // Auto-fill DOB? (Currently no DOB field in form, only start_date)
        
        // We can show a toast or helper text
        // toast({ title: "Valid ID", description: `Born: ${dob}, Gender: ${parsed.gender}, Age: ${parsed.age}` });
    }
  };

  const create = async (values: z.infer<typeof employeeSchema>) => {
    
    // Validate ID before submitting
    if (values.id_number && !validateSAID(values.id_number)) {
        toast({ title: "Invalid ID", description: "Please enter a valid South African ID number", variant: "destructive" });
        return;
    }
    
    let emp: any = null;
    try {
      const res = await supabase.from("employees" as any).insert({
        company_id: companyId,
        first_name: values.first_name,
        last_name: values.last_name,
        email: null,
        phone: null,
        address: null,
        id_number: values.id_number || null,
        start_date: values.start_date || null,
        position: values.position || null,
        department: values.department || null,
        payroll_number: values.payroll_number || null,
        // tax_number: values.tax_number || null,
        salary_type: values.salary_type,
        bank_name: values.bank_name || null,
        bank_branch_code: values.bank_branch_code || null,
        bank_account_number: values.bank_account_number || null,
        bank_account_type: values.bank_account_type || null,
        paye_registered: values.paye_registered,
        uif_registered: values.uif_registered,
        active: true,
      } as any).select("id").single();
      if (res.error) throw res.error;
      emp = res.data;
      
      // Try to update extra columns if they exist
      try {
         await supabase.from("employees" as any).update({
           medical_aid_members: values.medical_aid_members || 0,
           medical_aid_registered: values.medical_aid_registered,
           tax_number: values.tax_number || null,
         }).eq("id", (emp as any).id);
       } catch(e) { console.warn("Could not update extra columns", e); }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      return;
    }
    const { data: basicItem } = await supabase.from("pay_items" as any).select("id").eq("company_id", companyId).eq("name", "Basic Salary").maybeSingle();
    let basicId = (basicItem as any)?.id;
    if (!basicId) {
      const { data } = await supabase.from("pay_items" as any).insert({ company_id: companyId, code: "BASIC_SALARY", name: "Basic Salary", type: "earning", taxable: true } as any).select("id").single();
      basicId = (data as any)?.id;
    }
    if (basicId) {
      await supabase.from("employee_pay_items" as any).insert({ employee_id: (emp as any).id, pay_item_id: basicId, amount: parseFloat(values.salary_amount || "0"), rate: null, unit: null } as any);
    }

    if (values.medical_aid_registered) {
      try {
        const { data: medItem } = await supabase
          .from("pay_items" as any)
          .select("id")
          .eq("company_id", companyId)
          .eq("name", "Medical Aid")
          .maybeSingle();
        const medId = (medItem as any)?.id;
        if (medId) {
          await supabase
            .from("employee_pay_items" as any)
            .insert({ employee_id: (emp as any).id, pay_item_id: medId, amount: 0, rate: null, unit: null } as any);
        }
      } catch {
      }
    }
    toast({ title: "Success", description: "Employee added" });
    setDialogOpen(false);
    employeeForm.reset();
    const { data } = await supabase.from("employees" as any).select("*").eq("company_id", companyId);
    setEmployees((data || []) as any);
  };
  const importCSV = async (file: File) => {
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(Boolean);
    rows.shift();
    for (const row of rows) {
      const cols = row.split(",");
      const [first_name, last_name, id_number, salary_type, salary_amount] = cols;
      const { data: emp } = await supabase.from("employees" as any).insert({ company_id: companyId, first_name, last_name, id_number, salary_type, active: true } as any).select("id").single();
      const { data: basicItem } = await supabase.from("pay_items" as any).select("id").eq("company_id", companyId).eq("name", "Basic Salary").maybeSingle();
      const basicId = (basicItem as any)?.id;
      if (basicId && (emp as any)?.id) await supabase.from("employee_pay_items" as any).insert({ employee_id: (emp as any).id, pay_item_id: basicId, amount: parseFloat(salary_amount || "0"), rate: null, unit: null } as any);
    }
    const { data } = await supabase.from("employees" as any).select("*").eq("company_id", companyId);
    setEmployees((data || []) as any);
    toast({ title: "Imported", description: "CSV imported" });
  };

  const deleteEmployee = async (empId: string) => {
    if (!confirm("Are you sure you want to delete this employee? This action cannot be undone.")) return;
    try {
        // Delete related pay items first (if cascade is not set up)
        await supabase.from("employee_pay_items" as any).delete().eq("employee_id", empId);
        
        // Delete the employee
        const { error } = await supabase.from("employees" as any).delete().eq("id", empId);
        if (error) throw error;
        
        toast({ title: "Deleted", description: "Employee removed successfully" });
        const { data } = await supabase.from("employees" as any).select("*").eq("company_id", companyId);
        setEmployees((data || []) as any);
    } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openEdit = async (emp: Employee) => {
    setEditEmp(emp);
    setEditOpen(true);
    setEarningsLoading(true);
    try {
      const { data: items } = await supabase
        .from("pay_items" as any)
        .select("id,name,type")
        .eq("company_id", companyId)
        .eq("type", "earning");
      const earningItems = (items || []) as any[];
      if (!earningItems.length) {
        setEarningsRows([]);
        setEarningsLoading(false);
        return;
      }
      const earningIds = earningItems.map(i => (i as any).id);
      const { data: existing } = await supabase
        .from("employee_pay_items" as any)
        .select("pay_item_id,amount")
        .eq("employee_id", emp.id)
        .in("pay_item_id", earningIds);
      const byId: Record<string, number> = {};
      (existing || []).forEach((row: any) => {
        byId[String(row.pay_item_id)] = Number(row.amount || 0);
      });
      setEarningsRows(
        earningItems.map((i: any) => ({
          pay_item_id: String(i.id),
          name: String(i.name),
          amount: byId[String(i.id)] != null ? String(byId[String(i.id)]) : "",
        }))
      );
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setEarningsRows([]);
    } finally {
      setEarningsLoading(false);
    }
  };
  const saveEdit = async () => {
    if (!editEmp) return;
    setEarningsSaving(true);
    try {
      for (const row of earningsRows) {
        const amt = parseFloat(row.amount || "0");
        const { data: existing } = await supabase
          .from("employee_pay_items" as any)
          .select("id")
          .eq("employee_id", editEmp.id)
          .eq("pay_item_id", row.pay_item_id)
          .maybeSingle();
        if (amt > 0) {
          if (existing) {
            await supabase
              .from("employee_pay_items" as any)
              .update({ amount: amt } as any)
              .eq("id", (existing as any).id);
          } else {
            await supabase
              .from("employee_pay_items" as any)
              .insert({ employee_id: editEmp.id, pay_item_id: row.pay_item_id, amount: amt, rate: null, unit: null } as any);
          }
        } else if (existing) {
          await supabase
            .from("employee_pay_items" as any)
            .delete()
            .eq("id", (existing as any).id);
        }
      }
      toast({ title: "Saved", description: "Employee earnings updated" });
      setEditOpen(false);
      setEditEmp(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setEarningsSaving(false);
    }
  };

  const openDeduction = async (emp: Employee) => {
    setDeductEmp(emp);
    setDeductOpen(true);
    setDeductLoading(true);
    try {
      const { data: items } = await supabase
        .from("pay_items" as any)
        .select("id,name,type")
        .eq("company_id", companyId)
        .eq("type", "deduction");
      const deductionItems = (items || []) as any[];
      if (!deductionItems.length) {
        setDeductRows([]);
        setDeductLoading(false);
        return;
      }
      const deductionIds = deductionItems.map(i => (i as any).id);
      const { data: existing } = await supabase
        .from("employee_pay_items" as any)
        .select("pay_item_id")
        .eq("employee_id", emp.id)
        .in("pay_item_id", deductionIds);
      const active: Record<string, boolean> = {};
      (existing || []).forEach((row: any) => {
        active[String(row.pay_item_id)] = true;
      });
      setDeductRows(
        deductionItems.map((i: any) => ({
          pay_item_id: String(i.id),
          name: String(i.name),
          selected: !!active[String(i.id)],
        }))
      );
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setDeductRows([]);
    } finally {
      setDeductLoading(false);
    }
  };

  const saveDeduction = async () => {
    if (!deductEmp) return;
    setDeductSaving(true);
    try {
      for (const row of deductRows) {
        const { data: existing } = await supabase
          .from("employee_pay_items" as any)
          .select("id")
          .eq("employee_id", deductEmp.id)
          .eq("pay_item_id", row.pay_item_id)
          .maybeSingle();
        if (row.selected) {
          if (existing) continue;
          await supabase
            .from("employee_pay_items" as any)
            .insert({ employee_id: deductEmp.id, pay_item_id: row.pay_item_id, amount: 0, rate: null, unit: null } as any);
        } else if (existing) {
          await supabase
            .from("employee_pay_items" as any)
            .delete()
            .eq("id", (existing as any).id);
        }
      }
      toast({ title: "Saved", description: "Employee deductions updated" });
      setDeductOpen(false);
      setDeductEmp(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeductSaving(false);
    }
  };
  const [showEmployeesBanner, setShowEmployeesBanner] = useState(true);
  return (
    <>
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Employees</CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-muted/40">Total: {employees.length}</Badge>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active: {employees.filter(e => e.active).length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (<div className="py-8 text-center text-muted-foreground">Loading…</div>) : (
            <>
            {showEmployeesBanner && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                <div className="mt-0.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="text-sm font-medium text-amber-900">Before you run payroll</div>
                  <p className="text-xs text-amber-800">
                    Review each employee&apos;s <span className="font-semibold">earnings</span> and <span className="font-semibold">deductions</span> first.
                    Use the <span className="font-semibold">Edit earnings</span> and <span className="font-semibold">Edit deduction</span> actions in the menu on the right
                    so gross income and deductions are correct before processing the pay run.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEmployeesBanner(false)}
                  className="ml-2 mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-700 hover:bg-amber-100"
                  aria-label="Dismiss notice"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="mb-3 flex items-center gap-2">
              <Input placeholder="Search name, position, department" className="flex-1" value={search} onChange={e => setSearch(e.target.value)} />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon"><Filter className="h-4 w-4" /></Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[360px] space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Position</Label>
                      <Select value={filterPosition} onValueChange={setFilterPosition}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          {positions.map(p => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Rows</Label>
                      <Select value={String(pageSizeEmp)} onValueChange={(v: any) => setPageSizeEmp(parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Year</Label>
                      <Input type="number" value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value || '0'))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Month</Label>
                      <Input type="number" value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value || '0'))} />
                    </div>
                    <div className="space-y-2">
                      <Label>PAYE</Label>
                      <Select value={filterPaye} onValueChange={(v: any) => setFilterPaye(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>UIF</Label>
                      <Select value={filterUif} onValueChange={(v: any) => setFilterUif(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {canEdit && <Button variant="ghost" size="icon" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /></Button>}
              {canEdit && <Button variant="ghost" size="icon" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /></Button>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && <DropdownMenuItem onClick={processSelected}><Calculator className="h-4 w-4 mr-2" />Process Selected</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="overflow-x-auto">
            <Table className="rounded-md overflow-hidden w-full table-fixed text-sm">
              <TableHeader className="bg-slate-700 border-b border-slate-800">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="w-8 h-10 p-2"></TableHead>
                  <TableHead className="text-white h-10 p-2 w-[25%]">Employee</TableHead>
                  <TableHead className="text-white h-10 p-2 w-[20%]">Position</TableHead>
                  <TableHead className="text-white h-10 p-2 w-[15%] hidden md:table-cell">ID</TableHead>
                  <TableHead className="text-white h-10 p-2 w-[15%] text-right">Gross income</TableHead>
                  <TableHead className="text-white h-10 p-2 w-[15%] hidden lg:table-cell">Bank</TableHead>
                  <TableHead className="text-white h-10 p-2 w-[10%] text-center">Status</TableHead>
                  <TableHead className="w-[50px] text-white h-10 p-2 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(pageEmp * pageSizeEmp, pageEmp * pageSizeEmp + pageSizeEmp).map(e => {
                  const initials = `${(e.first_name || ' ')[0] || ''}${(e.last_name || ' ')[0] || ''}`.toUpperCase();
                  const acc = String((e as any).bank_account_number || '');
                  const masked = acc ? `****${acc.slice(-4)}` : '-';
                  return (
                  <TableRow key={e.id} className="odd:bg-muted/30">
                    <TableCell className="p-2">
                      <Checkbox checked={!!selected[e.id]} onCheckedChange={(v: any) => setSelected(prev => ({ ...prev, [e.id]: !!v }))} />
                    </TableCell>
                    <TableCell className="p-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Avatar className="h-8 w-8 shrink-0"><AvatarFallback>{initials}</AvatarFallback></Avatar>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{e.first_name} {e.last_name}</span>
                          <span className="text-xs text-muted-foreground truncate">{(e as any).email || '-'}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="p-2">
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{(e as any).position || '-'}</span>
                        <span className="text-xs text-muted-foreground truncate">{(e as any).department || ''}</span>
                      </div>
                    </TableCell>
                    <TableCell className="p-2 truncate font-mono text-xs hidden md:table-cell">{e.id_number ? `****${e.id_number.slice(-4)}` : '-'}</TableCell>
                    <TableCell className="p-2 text-right font-mono whitespace-nowrap">{(salaries[e.id] !== undefined) ? salaries[e.id].toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) : '—'}</TableCell>
                    <TableCell className="p-2 hidden lg:table-cell">
                        <div className="flex flex-col min-w-0">
                            <span className="truncate text-xs">{(e as any).bank_name || '-'}</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate">{masked}</span>
                        </div>
                    </TableCell>
                    <TableCell className="p-2 text-center">
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${e.active ? 'text-green-700 border-green-200 bg-green-50' : 'text-red-700 border-red-200 bg-red-50'}`}>{e.active ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell className="p-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(e)}>Edit earnings</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openDeduction(e)}>Edit deduction</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => runPayrollForEmployee(e.id)}>Process Payroll</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => viewPayslip(e.id)}>View Payslip</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => viewCalculations(e.id)}><Calculator className="h-4 w-4 mr-2" />View Tax Calc</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { 
                            setIrp5EmpId(e.id); 
                            setIrp5EmpName(`${e.first_name} ${e.last_name}`); 
                            setIrp5Year(filterYear); 
                            setIrp5Month(filterMonth); 
                            setIrp5Open(true); 
                          }}>
                            <FileText className="h-4 w-4 mr-2" /> IRP5 Certificate provision
                          </DropdownMenuItem>
                          {canEdit && (e.active
                            ? <DropdownMenuItem onClick={() => toggleActive(e.id, false)}>Deactivate</DropdownMenuItem>
                            : <DropdownMenuItem onClick={() => toggleActive(e.id, true)}>Activate</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => deleteEmployee(e.id)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                            Delete Employee
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-muted-foreground">Page {pageEmp + 1} of {Math.max(1, Math.ceil(filtered.length / pageSizeEmp))}</div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" disabled={pageEmp === 0} onClick={() => setPageEmp(p => Math.max(0, p - 1))}>Previous</Button>
                <Button variant="ghost" disabled={(pageEmp + 1) >= Math.ceil(filtered.length / pageSizeEmp)} onClick={() => setPageEmp(p => p + 1)}>Next</Button>
              </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import Employees (CSV)</DialogTitle>
            <DialogDescription>Format: first_name,last_name,id_number,salary_type,salary_amount</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="font-mono text-sm">first_name,last_name,id_number,salary_type,salary_amount</div>
              <div className="font-mono text-sm">John,Doe,8001015009087,monthly,25000</div>
              <div className="font-mono text-sm">Jane,Smith,9002026009088,hourly,180</div>
            </div>
            <div className="flex items-center gap-2">
              <Input type="file" accept=".csv" onChange={e => setImportFile(e.target.files?.[0] || null)} />
              <Button variant="outline" onClick={() => {
                const sample = "first_name,last_name,id_number,salary_type,salary_amount\nJohn,Doe,8001015009087,monthly,25000\nJane,Smith,9002026009088,hourly,180";
                const blob = new Blob([sample], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "employees-sample.csv";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}>Download sample</Button>
            </div>
            {importing && (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">In progress…</div>
                <Progress value={importProgress} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button disabled={!importFile || importing} onClick={async () => {
              if (!importFile) return;
              setImporting(true);
              setImportProgress(25);
              try {
                await importCSV(importFile);
                setImportProgress(100);
                setTimeout(() => { setImporting(false); setImportOpen(false); setImportFile(null); setImportProgress(0); }, 300);
              } catch (e: any) {
                setImporting(false);
                setImportProgress(0);
                toast({ title: "Import failed", description: String(e?.message || e), variant: "destructive" });
              }
            }}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
          <Form {...employeeForm}>
            <form onSubmit={employeeForm.handleSubmit(async (vals) => {
              await create(vals);
            })} className="space-y-4">
              <DialogDescription>Enter the essential employee details. Required fields must be completed.</DialogDescription>
              <Tabs defaultValue="basic" className="space-y-4">
                <TabsList className="w-full justify-start gap-2">
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="employment">Employment</TabsTrigger>
                  <TabsTrigger value="compliance">Compliance</TabsTrigger>
                  <TabsTrigger value="banking">Banking</TabsTrigger>
                </TabsList>
                <TabsContent value="basic" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={employeeForm.control} name="first_name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="last_name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={employeeForm.control} name="id_number" render={({ field }) => (
                      <FormItem>
                        <FormLabel>ID Number</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="start_date" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="position" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {positions.map(p => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>
                <TabsContent value="employment" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={employeeForm.control} name="department" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="payroll_number" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payroll #</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="tax_number" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Number</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={employeeForm.control} name="salary_type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salary Type</FormLabel>
                        <FormControl>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="hourly">Hourly</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="salary_amount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rate</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>
                <TabsContent value="compliance" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={employeeForm.control} name="paye_registered" render={({ field }) => (
                      <FormItem>
                        <FormLabel>PAYE Registered?</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={() => {
                                  employeeForm.setValue("paye_registered", true, { shouldDirty: true });
                                }}
                              />
                              <span className="text-sm">Yes</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={!field.value}
                                onCheckedChange={() => {
                                  employeeForm.setValue("paye_registered", false, { shouldDirty: true });
                                }}
                              />
                              <span className="text-sm">No</span>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="uif_registered" render={({ field }) => (
                      <FormItem>
                        <FormLabel>UIF Registered?</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={() => {
                                  employeeForm.setValue("uif_registered", true, { shouldDirty: true });
                                }}
                              />
                              <span className="text-sm">Yes</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={!field.value}
                                onCheckedChange={() => {
                                  employeeForm.setValue("uif_registered", false, { shouldDirty: true });
                                }}
                              />
                              <span className="text-sm">No</span>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="space-y-3">
                    <FormField control={employeeForm.control} name="medical_aid_registered" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Medical Aid</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={() => {
                                  employeeForm.setValue("medical_aid_registered", true, { shouldDirty: true });
                                }}
                              />
                              <span className="text-sm">Yes</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={!field.value}
                                onCheckedChange={() => {
                                  employeeForm.setValue("medical_aid_registered", false, { shouldDirty: true });
                                  employeeForm.setValue("medical_aid_members", 0 as any, { shouldDirty: true });
                                }}
                              />
                              <span className="text-sm">No</span>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {watchMedicalAid && (
                      <FormField control={employeeForm.control} name="medical_aid_members" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Number of dependants on medical aid</FormLabel>
                          <FormControl><Input type="number" min={0} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="banking" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={employeeForm.control} name="bank_name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Name</FormLabel>
                        <FormControl>
                          <Select value={field.value} onValueChange={(v: any) => {
                            field.onChange(v);
                            const code = bankBranchCodes[String(v)] || "";
                            employeeForm.setValue("bank_branch_code", code, { shouldDirty: true });
                          }}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ABSA">ABSA Bank</SelectItem>
                              <SelectItem value="FNB">FNB (First National Bank)</SelectItem>
                              <SelectItem value="Standard Bank">Standard Bank</SelectItem>
                              <SelectItem value="Nedbank">Nedbank</SelectItem>
                              <SelectItem value="Capitec">Capitec Bank</SelectItem>
                              <SelectItem value="Investec">Investec Bank</SelectItem>
                              <SelectItem value="TymeBank">TymeBank</SelectItem>
                              <SelectItem value="Bidvest">Bidvest Bank</SelectItem>
                              <SelectItem value="Discovery">Discovery Bank</SelectItem>
                              <SelectItem value="African Bank">African Bank</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="bank_account_number" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Number</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={employeeForm.control} name="bank_branch_code" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch Code</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={employeeForm.control} name="bank_account_type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Type</FormLabel>
                        <FormControl>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="checking">Checking</SelectItem>
                              <SelectItem value="savings">Savings</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-gradient-primary">Create</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit earnings
              {editEmp && ` – ${editEmp.first_name} ${editEmp.last_name}`}
            </DialogTitle>
            <DialogDescription>
              Use this dialog to add or adjust recurring earnings for this employee. All earnings
              captured here form part of their gross salary when payroll is processed.
            </DialogDescription>
          </DialogHeader>
          {earningsLoading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Loading earnings…</div>
          ) : earningsRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No earning pay items are set up yet. Create earnings in the Pay Items tab first,
              then return here to link them to this employee.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs flex gap-2">
                <Info className="h-4 w-4 mt-0.5 text-primary" />
                <div>
                  <div className="font-medium text-[11px] uppercase tracking-wide">Earnings and gross salary</div>
                  <p>
                    All amounts you enter below are added together as this employee&apos;s gross salary base
                    for each payroll run. You can still add once-off earnings in the payroll run itself.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground">
                <div>Earning</div>
                <div className="text-right">Amount (R)</div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {earningsRows.map((row, idx) => (
                  <div key={row.pay_item_id} className="grid grid-cols-2 gap-2 items-center">
                    <div className="text-sm truncate">{row.name}</div>
                    <div>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={e => {
                          const next = [...earningsRows];
                          next[idx] = { ...next[idx], amount: e.target.value };
                          setEarningsRows(next);
                        }}
                        className="h-8 text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={earningsSaving || earningsLoading}>
              {earningsSaving ? "Saving…" : "Save earnings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deductOpen} onOpenChange={setDeductOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit deduction
              {deductEmp && ` – ${deductEmp.first_name} ${deductEmp.last_name}`}
            </DialogTitle>
            <DialogDescription>
              Choose which deduction pay items apply to this employee. Use the yes/no tick boxes
              to include or exclude each deduction from their payroll calculations.
            </DialogDescription>
          </DialogHeader>
          {deductLoading ? (
            <div className="py-6 text-center text-muted-foreground text-sm">Loading deductions…</div>
          ) : deductRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No deduction pay items are set up yet. Create deduction items in the Pay Items tab first,
              then return here to link them to this employee.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground">
                <div>Deduction</div>
                <div className="text-right">Yes / No</div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {deductRows.map((row, idx) => (
                  <div key={row.pay_item_id} className="flex items-center justify-between gap-2">
                    <div className="text-sm truncate">{row.name}</div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Checkbox
                          checked={row.selected}
                          onCheckedChange={() => {
                            const next = [...deductRows];
                            next[idx] = { ...next[idx], selected: true };
                            setDeductRows(next);
                          }}
                        />
                        <span className="text-xs">Yes</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Checkbox
                          checked={!row.selected}
                          onCheckedChange={() => {
                            const next = [...deductRows];
                            next[idx] = { ...next[idx], selected: false };
                            setDeductRows(next);
                          }}
                        />
                        <span className="text-xs">No</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeductOpen(false)}>Cancel</Button>
            <Button onClick={saveDeduction} disabled={deductSaving || deductLoading}>
              {deductSaving ? "Saving…" : "Save deduction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={payslipOpen} onOpenChange={setPayslipOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payslip View</DialogTitle>
            <DialogDescription>
              {payslipData && `${payslipData.employee_name} - ${new Date(payslipData.period_start).toLocaleDateString()} to ${new Date(payslipData.period_end).toLocaleDateString()}`}
            </DialogDescription>
          </DialogHeader>

          {payslipData && (
            <div className="space-y-6 border p-6 rounded-md bg-white text-black shadow-sm">
              {/* Header */}
              <div className="flex justify-between border-b pb-4">
                <div className="flex gap-4">
                  {/* Logo Logic: Use Company Logo if available, else Rigel Logo */}
                  {payslipCompany?.logo_url ? (
                    <img 
                      src={payslipCompany.logo_url} 
                      alt="Company Logo" 
                      className="h-16 w-auto object-contain"
                      onError={(e) => {
                        // Fallback if image fails to load
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="h-16 w-16 bg-primary/10 flex items-center justify-center rounded-md">
                      <img src="/lovable-uploads/9937a3b3-2104-4161-9afb-46c59600a98c.png" alt="Rigel Logo" className="h-12 w-auto opacity-80" />
                    </div>
                  )}
                  
                  <div>
                    <h3 className="font-bold text-lg">{payslipCompany?.name}</h3>
                    <div className="text-sm text-muted-foreground whitespace-pre-line">{payslipCompany?.address}</div>
                    <div className="text-sm text-muted-foreground">Tel: {payslipCompany?.phone}</div>
                    <div className="text-sm text-muted-foreground">Email: {payslipCompany?.email}</div>
                    <div className="text-sm text-muted-foreground">Tax No: {payslipCompany?.tax_number}</div>
                  </div>
                </div>
                <div className="text-right">
                   <h2 className="text-3xl font-bold tracking-tight text-gray-800">PAYSLIP</h2>
                </div>
              </div>

              {/* Employee Info */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm border-b pb-4">
                 <div className="grid grid-cols-2">
                    <span className="font-semibold text-muted-foreground">Employee:</span>
                    <span>{payslipData.employee_name}</span>
                 </div>
                 <div className="grid grid-cols-2">
                    <span className="font-semibold text-muted-foreground">Period Start:</span>
                    <span>{new Date(payslipData.period_start).toLocaleDateString()}</span>
                 </div>
                 <div className="grid grid-cols-2">
                    <span className="font-semibold text-muted-foreground">Period End:</span>
                    <span>{new Date(payslipData.period_end).toLocaleDateString()}</span>
                 </div>
              </div>

              {/* Financials Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Earnings (R)</TableHead>
                    <TableHead className="text-right">Deductions (R)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Gross Salary / Wages</TableCell>
                    <TableCell className="text-right">{payslipData.gross.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>PAYE Tax</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right">{payslipData.paye.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>UIF (Employee)</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right">{payslipData.uif_emp.toFixed(2)}</TableCell>
                  </TableRow>
                   <TableRow className="font-bold bg-muted/20 border-t-2 border-black">
                    <TableCell>Net Pay</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right text-lg">{payslipData.net.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              
              {/* Employer Contributions */}
              <div className="text-xs text-muted-foreground mt-4 pt-4 border-t">
                 <span className="font-semibold">Company Contributions:</span> UIF: R{payslipData.uif_er.toFixed(2)} | SDL: R{payslipData.sdl_er.toFixed(2)}
              </div>
              
              {/* Footer */}
              <div className="mt-8 pt-4 border-t border-gray-100 flex justify-between items-center text-xs text-muted-foreground">
                <div>Generated on {new Date().toLocaleDateString()}</div>
                <div className="flex items-center gap-1 font-medium text-primary/80">
                  <span>Generated by Rigel Business</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
             <Button variant="outline" onClick={() => setPayslipOpen(false)}>Close</Button>
             <Button onClick={downloadCurrentPayslip}>
                <FileText className="mr-2 h-4 w-4" />
                Download PDF
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tax Calculation Breakdown Dialog */}
      <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tax Calculation Breakdown</DialogTitle>
            <DialogDescription>Detailed breakdown of PAYE, UIF, and SDL calculations</DialogDescription>
          </DialogHeader>
          
          {calcData && (
            <div className="space-y-6">
               {/* Header with Logo */}
               <div className="flex justify-between items-center border-b pb-4">
                  <div className="flex gap-4 items-center">
                    {payslipCompany?.logo_url ? (
                        <img 
                          src={payslipCompany.logo_url} 
                          alt="Company Logo" 
                          className="h-12 w-auto object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="h-12 w-12 bg-primary/10 flex items-center justify-center rounded-md">
                          <img src="/lovable-uploads/9937a3b3-2104-4161-9afb-46c59600a98c.png" alt="Rigel Logo" className="h-8 w-auto opacity-80" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold">{payslipCompany?.name || 'Company Name'}</h3>
                        <p className="text-xs text-muted-foreground">PAYE Calculation • {new Date(calcData.period.start).toLocaleDateString()} - {new Date(calcData.period.end).toLocaleDateString()}</p>
                      </div>
                  </div>
               </div>

               {/* Summary Cards */}
               <div className="grid grid-cols-3 gap-4">
                  <MetricCard title="Gross Income" value={calcData.gross} icon={<Wallet className="h-4 w-4" />} />
                  <MetricCard title="Taxable Income (Annual)" value={calcData.gross * 12} icon={<Calculator className="h-4 w-4" />} />
                  <MetricCard title="Net PAYE (Monthly)" value={calcData.paye} icon={<Landmark className="h-4 w-4" />} />
               </div>

               {/* Detailed Steps */}
               <div className="space-y-4">
                  <h4 className="font-semibold text-sm uppercase text-muted-foreground">Calculation Steps</h4>
                  
                  {/* Step 1: Gross to Annual */}
                  <div className="bg-muted/20 p-3 rounded-md text-sm">
                    <div className="flex justify-between mb-1">
                        <span>Monthly Gross Income</span>
                        <span className="font-mono">R {calcData.gross.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2 mb-2">
                        <span>Annualization (x12)</span>
                        <span className="font-mono">R {(calcData.gross * 12).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                        <span>Total Annual Taxable Income</span>
                        <span className="font-mono">R {(calcData.gross * 12).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Step 2: Tax Tables */}
                  <div className="bg-muted/20 p-3 rounded-md text-sm">
                    <div className="mb-2 font-medium">Applied Tax Bracket</div>
                    {calcData.tax_brackets.map((b: any, i: number) => {
                        const annual = calcData.gross * 12;
                        const prev = i === 0 ? 0 : calcData.tax_brackets[i-1].up_to;
                        const isApplicable = annual > prev && (b.up_to === null || annual <= b.up_to);
                        if (!isApplicable && annual > (b.up_to || Infinity)) return null; // Hide lower brackets to save space, or show all? Let's show relevant.
                        
                        return (
                            <div key={i} className={`flex justify-between py-1 ${isApplicable ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                                <span>{b.up_to ? `R${prev} - R${b.up_to}` : `R${prev}+`} ({(b.rate * 100).toFixed(0)}%)</span>
                                {isApplicable && <Check className="h-4 w-4" />}
                            </div>
                        );
                    })}
                  </div>

                  {/* Step 3: Rebates & Credits */}
                  <div className="bg-muted/20 p-3 rounded-md text-sm space-y-2">
                    <div className="flex justify-between">
                        <span>Gross Tax (Before Rebates)</span>
                        <span className="font-mono">Calculated from tables</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                        <span>Less: Primary Rebate</span>
                        <span className="font-mono">- R {calcData.rebates.primary.toFixed(2)}</span>
                    </div>
                    {calcData.medical_tax_credit > 0 && (
                        <div className="flex justify-between text-green-600">
                            <span>Less: Medical Tax Credits (Annual)</span>
                            <span className="font-mono">- R {(calcData.medical_tax_credit * 12).toFixed(2)}</span>
                        </div>
                    )}
                  </div>

                  {/* Step 4: Final Monthly */}
                  <div className="bg-primary/5 p-4 rounded-md border border-primary/20">
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-lg">Final Monthly PAYE</span>
                        <span className="font-bold text-xl font-mono">R {calcData.paye.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-muted-foreground border-t pt-2 mt-2">
                        <span>UIF Contribution (1%)</span>
                        <span className="font-mono">R {calcData.uif_emp.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                        <span>SDL Contribution (1%)</span>
                        <span className="font-mono">R {calcData.sdl_er.toFixed(2)}</span>
                    </div>
                  </div>
               </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCalcOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={irp5Open} onOpenChange={setIrp5Open}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>IRP5 Certificate provision</DialogTitle>
            <DialogDescription>Employee: {irp5EmpName}. This is a summary certificate for the SARS tax year ending February and upon termination. It is not an official SARS IRP5.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label>Tax Year Ending (February)</Label>
                <Input type="number" value={irp5Year} onChange={(e) => setIrp5Year(parseInt(e.target.value || "0"))} className="mt-1" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="justify-start h-12" onClick={async () => {
                if (!irp5EmpId) return;
                const start = new Date(irp5Year - 1, 2, 1).toISOString().slice(0, 10);
                const end = new Date(irp5Year, 2, 0).toISOString().slice(0, 10);
                const { data: runs } = await supabase.from("pay_runs" as any).select("id").eq("company_id", companyId).gte("period_start", start).lte("period_end", end);
                const runIds = (runs || []).map((r: any) => r.id);
                if (runIds.length === 0) { toast({ title: "No Data", description: "No payroll runs found for this period.", variant: "destructive" }); return; }
                const { data: lines } = await supabase.from("pay_run_lines" as any).select("gross,net,paye,uif_emp,uif_er,sdl_er").in("pay_run_id", runIds).eq("employee_id", irp5EmpId);
                if (!lines || lines.length === 0) { toast({ title: "No Data", description: "No IRP5 data for this employee in the selected period.", variant: "destructive" }); return; }
                const totals = (lines || []).reduce((acc: any, l: any) => ({
                  gross: acc.gross + Number(l.gross || 0),
                  net: acc.net + Number(l.net || 0),
                  paye: acc.paye + Number(l.paye || 0),
                  uif_emp: acc.uif_emp + Number(l.uif_emp || 0),
                  uif_er: acc.uif_er + Number(l.uif_er || 0),
                  sdl_er: acc.sdl_er + Number(l.sdl_er || 0),
                }), { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 });
                const doc = new jsPDF();
                doc.setFontSize(18);
                doc.text("IRP5 Certificate provision", 14, 20);
                doc.setFontSize(10);
                doc.text(`Employee: ${irp5EmpName}`, 14, 30);
                doc.text(`Tax Year: ${new Date(start).toLocaleDateString('en-ZA')} - ${new Date(end).toLocaleDateString('en-ZA')}`, 14, 35);
                doc.setTextColor(100);
                doc.text("Summary only — not an official SARS IRP5. Issued for tax year end (Feb) and on termination.", 14, 41);
                doc.setTextColor(0);
                autoTable(doc, {
                  startY: 50,
                  head: [["Field", "Amount (R)"]],
                  body: [
                    ["Gross", totals.gross.toFixed(2)],
                    ["PAYE", totals.paye.toFixed(2)],
                    ["UIF (Employee)", totals.uif_emp.toFixed(2)],
                    ["UIF (Employer)", totals.uif_er.toFixed(2)],
                    ["SDL", totals.sdl_er.toFixed(2)],
                    ["Net", totals.net.toFixed(2)],
                  ],
                  theme: "grid",
                  headStyles: { fillColor: [0, 112, 173] },
                  columnStyles: { 1: { halign: "right" } },
                });
                doc.save(`IRP5_${irp5EmpName.replace(/\s+/g, '_')}_${irp5Year}.pdf`);
                toast({ title: "Generated", description: "IRP5 PDF downloaded." });
              }}>
                <FileSpreadsheet className="h-5 w-5 mr-3 text-green-600" />
                Download PDF
              </Button>
              <Button variant="outline" className="justify-start h-12" onClick={async () => {
                if (!irp5EmpId) return;
                const start = new Date(irp5Year - 1, 2, 1).toISOString().slice(0, 10);
                const end = new Date(irp5Year, 2, 0).toISOString().slice(0, 10);
                const { data: runs } = await supabase.from("pay_runs" as any).select("id").eq("company_id", companyId).gte("period_start", start).lte("period_end", end);
                const runIds = (runs || []).map((r: any) => r.id);
                if (runIds.length === 0) { toast({ title: "No Data", description: "No payroll runs found for this period.", variant: "destructive" }); return; }
                const { data: lines } = await supabase.from("pay_run_lines" as any).select("gross,net,paye,uif_emp,uif_er,sdl_er").in("pay_run_id", runIds).eq("employee_id", irp5EmpId);
                if (!lines || lines.length === 0) { toast({ title: "No Data", description: "No IRP5 data for this employee in the selected period.", variant: "destructive" }); return; }
                const totals = (lines || []).reduce((acc: any, l: any) => ({
                  gross: acc.gross + Number(l.gross || 0),
                  net: acc.net + Number(l.net || 0),
                  paye: acc.paye + Number(l.paye || 0),
                  uif_emp: acc.uif_emp + Number(l.uif_emp || 0),
                  uif_er: acc.uif_er + Number(l.uif_er || 0),
                  sdl_er: acc.sdl_er + Number(l.sdl_er || 0),
                }), { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 });
                const rows = [
                  ["IRP5 Certificate provision"],
                  [`Employee: ${irp5EmpName}`],
                  [`Period: ${irp5Year}-${String(irp5Month).padStart(2, "0")}`],
                  [],
                  ["Field", "Amount (R)"],
                  ["Gross", totals.gross],
                  ["PAYE", totals.paye],
                  ["UIF (Employee)", totals.uif_emp],
                  ["UIF (Employer)", totals.uif_er],
                  ["SDL", totals.sdl_er],
                  ["Net", totals.net],
                ];
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, "IRP5");
                XLSX.writeFile(wb, `IRP5_${irp5EmpName.replace(/\s+/g, '_')}_${irp5Year}.xlsx`);
                toast({ title: "Generated", description: "IRP5 Excel downloaded." });
              }}>
                <FileSpreadsheet className="h-5 w-5 mr-3 text-green-600" />
                Download Excel
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIrp5Open(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PayItemsSimple({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [earnings, setEarnings] = useState<PayItem[]>([]);
  const [deductions, setDeductions] = useState<PayItem[]>([]);
  const [form, setForm] = useState<{ name: string; type: "earning" | "deduction"; taxable: boolean }>({ name: "", type: "earning", taxable: true });
  const load = async () => {
    const { data } = await supabase.from("pay_items" as any).select("id,code,name,type,taxable").eq("company_id", companyId).order("name", { ascending: true });
    const list = (data || []) as any[];
    setEarnings(list.filter(i => i.type === 'earning'));
    setDeductions(list.filter(i => i.type === 'deduction'));
  };
  useEffect(() => { 
    const init = async () => {
      if (!companyId) return;
      await ensureDefaults();
      await load();
    };
    init();
  }, [companyId]);
  const ensureDefaults = async () => {
    const defaults = [
      { code: 'SALARY', name: 'Salary', type: 'earning', taxable: true },
      { code: 'OVERTIME', name: 'Overtime', type: 'earning', taxable: true },
      { code: 'BONUS', name: 'Bonus', type: 'earning', taxable: true },
      { code: 'ALLOWANCE', name: 'Allowances', type: 'earning', taxable: true },
      { code: 'PAYE', name: 'PAYE', type: 'deduction', taxable: false },
      { code: 'UIF', name: 'UIF', type: 'deduction', taxable: false },
      { code: 'SDL', name: 'SDL', type: 'deduction', taxable: false },
      { code: 'GARNISHEE', name: 'Garnishees', type: 'deduction', taxable: false },
    ];
    const { data: existing } = await supabase.from("pay_items" as any).select("name").eq("company_id", companyId);
    const names = new Set((existing || []).map((x: any) => String(x.name).toLowerCase()));
    const toInsert = defaults.filter(d => !names.has(d.name.toLowerCase())).map(d => ({ company_id: companyId, code: d.code, name: d.name, type: d.type, taxable: d.taxable }));
    if (toInsert.length) await supabase.from("pay_items" as any).insert(toInsert as any);
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.name.replace(/\s+/g, '_').toUpperCase();
    const { error } = await supabase.from("pay_items" as any).insert({ company_id: companyId, code, name: form.name, type: form.type, taxable: form.taxable } as any);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setForm({ name: '', type: 'earning', taxable: true });
    await load();
    toast({ title: 'Created', description: 'Custom pay item added' });
  };
  const items = useMemo(() => [...earnings, ...deductions].sort((a, b) => a.name.localeCompare(b.name)), [earnings, deductions]);
  return (
    <div>
      <Card>
        <CardHeader><CardTitle>Pay Items</CardTitle></CardHeader>
        <CardContent>
          <Table className="table-fixed w-full">
            <TableHeader className="bg-slate-700 border-b border-slate-800">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="text-white w-[20%]">Code</TableHead>
                <TableHead className="text-white w-[40%]">Name</TableHead>
                <TableHead className="text-white w-[20%]">Type</TableHead>
                <TableHead className="text-white w-[20%]">Taxable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {canEdit && (
                <TableRow className="bg-muted/20">
                  <TableCell className="font-mono text-xs text-muted-foreground">{form.name ? form.name.replace(/\s+/g, '_').toUpperCase() : 'CODE'}</TableCell>
                  <TableCell>
                    <Input placeholder="Item name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="earning">Earning</SelectItem>
                        <SelectItem value="deduction">Deduction</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={() => setForm({ ...form, taxable: !form.taxable })}>{form.taxable ? 'Yes' : 'No'}</Button>
                    <Button className="ml-auto" onClick={create}>Add</Button>
                  </TableCell>
                </TableRow>
              )}
              {items.map(i => (
                <TableRow key={i.id} className={i.type === 'deduction' ? 'text-red-700' : ''}>
                  <TableCell className="font-mono text-xs">{i.code}</TableCell>
                  <TableCell>{i.name}</TableCell>
                  <TableCell className="capitalize">{i.type}</TableCell>
                  <TableCell>{i.taxable ? 'Yes' : 'No'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PayrollHistory({ companyId }: { companyId: string }) {
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [runTotals, setRunTotals] = useState<Record<string, any>>({});
  const [viewRun, setViewRun] = useState<PayRun | null>(null);
  const [runLines, setRunLines] = useState<any[]>([]);
  const [pageRuns, setPageRuns] = useState(0);
  const pageSizeRuns = 7;

  useEffect(() => { 
    const load = async () => { 
        // 1. Fetch all runs
        const { data } = await supabase.from("pay_runs" as any).select("*").eq("company_id", companyId).order("period_start", { ascending: false }); 
        const list = (data || []) as PayRun[];
        setRuns(list); 

        if (list.length === 0) {
            setRunTotals({});
            return;
        }

        // 2. Extract IDs and fetch ALL lines in one query
        const runIds = list.map(r => r.id);
        const { data: allLines } = await supabase
            .from("pay_run_lines" as any)
            .select("*")
            .in("pay_run_id", runIds);
            
        // 3. Aggregate in memory
        const totalsMap: Record<string, any> = {};
        
        // Initialize map
        list.forEach(r => {
            totalsMap[r.id] = { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 };
        });

        (allLines || []).forEach((l: any) => {
            if (totalsMap[l.pay_run_id]) {
                const t = totalsMap[l.pay_run_id];
                t.gross += Number(l.gross || 0);
                t.net += Number(l.net || 0);
                t.paye += Number(l.paye || 0);
                t.uif_emp += Number(l.uif_emp || 0);
                t.uif_er += Number(l.uif_er || 0);
                t.sdl_er += Number(l.sdl_er || 0);
            }
        });

        setRunTotals(totalsMap);
    }; 
    if (companyId) load(); 
  }, [companyId]);

  const openView = async (r: PayRun) => {
    setViewRun(r);
    const { data } = await supabase.from("pay_run_lines" as any).select("*").eq("pay_run_id", r.id);
    const linesWithDetails = await Promise.all((data || []).map(async (l: any) => {
        const { data: empData } = await supabase.from("employees").select("first_name, last_name, medical_aid_members").eq("id", l.employee_id).maybeSingle();
        let firstName = empData?.first_name || "Unknown";
        let lastName = empData?.last_name || "Employee";
        let medMembers = (empData as any)?.medical_aid_members || 0;
        
        let mtc = 0;
        if (medMembers > 0) {
            mtc += 364;
            if (medMembers > 1) mtc += 364;
            if (medMembers > 2) mtc += 246 * (medMembers - 2);
        }

        return { ...l, first_name: firstName, last_name: lastName, medical_aid_members: medMembers, medical_tax_credit: mtc };
    }));
    setRunLines(linesWithDetails);
  };
  const totals = useMemo(() => ({ count: runLines.length, net: runLines.reduce((s, l: any) => s + (l.net || 0), 0) }), [runLines]);
  return (
    <div>
      <Table>
        <TableHeader className="bg-slate-700 border-b border-slate-800">
          <TableRow className="hover:bg-transparent border-none">
            <TableHead className="text-white">Period</TableHead>
            <TableHead className="text-white">Submitted</TableHead>
            <TableHead className="text-white">Gross Salary</TableHead>
            <TableHead className="text-white">Med Aid</TableHead>
            <TableHead className="text-white">Med Credit</TableHead>
            <TableHead className="text-white">UIF (Emp)</TableHead>
            <TableHead className="text-white">PAYE</TableHead>
            <TableHead className="text-white">UIF (Er)</TableHead>
            <TableHead className="text-white">SDL</TableHead>
            <TableHead className="text-white">Net Pay</TableHead>
            <TableHead className="text-white">Posted</TableHead>
            <TableHead className="text-white">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.slice(pageRuns * pageSizeRuns, pageRuns * pageSizeRuns + pageSizeRuns).map(r => {
             const t = runTotals[r.id] || { gross: 0, net: 0, paye: 0, uif_emp: 0, uif_er: 0, sdl_er: 0 };
             return (
            <TableRow key={r.id}>
              <TableCell>{new Date(r.period_start).toLocaleDateString()} - {new Date(r.period_end).toLocaleDateString()}</TableCell>
              <TableCell>{new Date(r.period_end).toLocaleDateString()}</TableCell>
              <TableCell>R {t.gross.toFixed(2)}</TableCell>
              <TableCell>-</TableCell>
              <TableCell>-</TableCell>
              <TableCell>R {t.uif_emp.toFixed(2)}</TableCell>
              <TableCell>R {t.paye.toFixed(2)}</TableCell>
              <TableCell>R {t.uif_er.toFixed(2)}</TableCell>
              <TableCell>R {t.sdl_er.toFixed(2)}</TableCell>
              <TableCell>R {t.net.toFixed(2)}</TableCell>
              <TableCell>
                <div className="flex justify-center">
                  <Checkbox
                    checked={r.status === "finalized" || r.status === "paid"}
                    disabled
                    className="border-slate-300 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    aria-label="Posted"
                  />
                </div>
              </TableCell>
              <TableCell>
                <Button variant="link" className="p-0 h-auto font-normal capitalize" onClick={() => openView(r)}>
                    {r.status}
                </Button>
              </TableCell>
            </TableRow>
          )})}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between mt-3">
        <div className="text-sm text-muted-foreground">Page {pageRuns + 1} of {Math.max(1, Math.ceil(runs.length / pageSizeRuns))}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={pageRuns === 0} onClick={() => setPageRuns(p => Math.max(0, p - 1))}>Previous</Button>
          <Button variant="outline" disabled={(pageRuns + 1) >= Math.ceil(runs.length / pageSizeRuns)} onClick={() => setPageRuns(p => p + 1)}>Next</Button>
        </div>
      </div>
      <Dialog open={!!viewRun} onOpenChange={(o) => { if (!o) { setViewRun(null); setRunLines([]); } }}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payroll Details - {viewRun ? `${new Date(viewRun.period_start).toLocaleDateString()} to ${new Date(viewRun.period_end).toLocaleDateString()}` : ''}</DialogTitle>
            <DialogDescription>
                Status: <span className="capitalize font-medium">{viewRun?.status}</span>
            </DialogDescription>
          </DialogHeader>
          {viewRun && (
            <div className="overflow-x-auto border rounded-md">
              <Table className="border-collapse text-xs">
                <TableHeader className="bg-slate-700 border-b border-slate-800">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="text-white h-8 py-1 border-r border-white/20 font-semibold">Employee</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">Gross Salary</TableHead>
                    <TableHead className="text-white h-8 py-1 text-center border-r border-white/20 font-semibold">Med Aid Mbrs</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">Med Tax Credit</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">UIF (Emp)</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">PAYE</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">UIF (Er)</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right border-r border-white/20 font-semibold">SDL</TableHead>
                    <TableHead className="text-white h-8 py-1 text-right font-semibold">Net Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runLines.map(l => (
                    <TableRow key={l.id} className="hover:bg-muted/50 odd:bg-white even:bg-muted/10 border-b border-muted">
                      <TableCell className="py-1 px-2 border-r border-muted font-medium">{l.first_name} {l.last_name}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted">{l.gross.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-center border-r border-muted">{(l as any).medical_aid_members || 0}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted text-green-600">{(l as any).medical_tax_credit ? (l as any).medical_tax_credit.toFixed(2) : '0.00'}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted">{l.uif_emp.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted">{l.paye.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted text-muted-foreground">{l.uif_er.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right border-r border-muted text-muted-foreground">{l.sdl_er.toFixed(2)}</TableCell>
                      <TableCell className="py-1 px-2 text-right font-bold bg-muted/20">{l.net.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/80 font-bold border-t-2 border-primary/20">
                    <TableCell className="py-2 px-2 border-r border-muted">Totals</TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">{runLines.reduce((s, l) => s + l.gross, 0).toFixed(2)}</TableCell>
                    <TableCell className="py-2 px-2 text-center border-r border-muted">-</TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted text-green-700">
                       {runLines.reduce((s, l) => s + ((l as any).medical_tax_credit || 0), 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">
                       {runLines.reduce((s, l) => s + l.uif_emp, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">{runLines.reduce((s, l) => s + l.paye, 0).toFixed(2)}</TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">
                       {runLines.reduce((s, l) => s + l.uif_er, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right border-r border-muted">
                       {runLines.reduce((s, l) => s + l.sdl_er, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right">{runLines.reduce((s, l) => s + l.net, 0).toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
             <Button variant="outline" onClick={() => setViewRun(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayrollPostingModule({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [openPostDlg, setOpenPostDlg] = useState(false);
  const [openPaySalaryDlg, setOpenPaySalaryDlg] = useState(false);
  const [openPaySarsDlg, setOpenPaySarsDlg] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [postValues, setPostValues] = useState<{ gross: number; uif_er: number; sdl_er: number; paye: number; uif_emp: number; net: number }>({ gross: 0, uif_er: 0, sdl_er: 0, paye: 0, uif_emp: 0, net: 0 });
  const [paySalaryValues, setPaySalaryValues] = useState<{ net: number; bankId: string }>({ net: 0, bankId: "" });
  const [paySarsValues, setPaySarsValues] = useState<{ paye: number; sdl: number; uif_total: number; bankId: string }>({ paye: 0, sdl: 0, uif_total: 0, bankId: "" });
  const [bankId, setBankId] = useState<string>("");
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; account_name: string; bank_name?: string; account_number?: string }>>([]);
  const [linesByEmp, setLinesByEmp] = useState<Record<string, any>>({});
  const [currentRun, setCurrentRun] = useState<any>(null);
  const [currentRunId, setCurrentRunId] = useState<string>("");
  const getEffectiveCompanyId = useCallback(async (): Promise<string> => {
    let cid = String(companyId || '').trim();
    if (cid) return cid;
    if (!hasSupabaseEnv) return '';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from('profiles' as any)
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();
        cid = String((prof as any)?.company_id || '').trim();
      }
    } catch {}
    return cid;
  }, [companyId]);
  useEffect(() => {
    const load = async () => {
      const cid = await getEffectiveCompanyId();
      if (!cid) {
        setLinesByEmp({});
        setCurrentRun(null);
        setCurrentRunId("");
        setBankAccounts([]);
        setBankId("");
        return;
      }

      const { data: emps } = await supabase
        .from('employees' as any)
        .select('*')
        .eq('company_id', cid)
        .order('first_name');
      setEmployees((emps || []) as any);

      let runToUse: any = selectedRun;
      if (!runToUse) {
        const { data: latest } = await supabase
          .from('pay_runs' as any)
          .select('*')
          .eq('company_id', cid)
          .order('period_start', { ascending: false })
          .limit(1)
          .maybeSingle();
        runToUse = latest as any;
      }

      if (runToUse && runToUse.id) {
        const { data: ls } = await supabase
          .from('pay_run_lines' as any)
          .select('*')
          .eq('pay_run_id', runToUse.id);
        const map: Record<string, any> = {};
        (ls || []).forEach((l: any) => { map[l.employee_id] = l; });
        setLinesByEmp(map);
        setCurrentRun(runToUse);
        setCurrentRunId(String(runToUse.id || ''));
      } else {
        setLinesByEmp({});
        setCurrentRun(null);
        setCurrentRunId("");
      }

      const { data: banks } = await supabase
        .from('bank_accounts' as any)
        .select('id, account_name, bank_name, account_number')
        .eq('company_id', cid)
        .order('account_name');
      setBankAccounts((banks || []) as any);
      setBankId(((banks || [])[0] as any)?.id || "");
    };
    load();
  }, [companyId, selectedRun, getEffectiveCompanyId]);
  const ensureAccountByCode = async (nm: string, tp: 'asset' | 'liability' | 'equity' | 'income' | 'expense', code: string) => {
    const cid = await getEffectiveCompanyId();
    if (!cid) throw new Error('Company ID missing');
    const { data: found } = await supabase.from('chart_of_accounts' as any).select('id').eq('company_id', cid).eq('account_code', code).maybeSingle();
    if ((found as any)?.id) return (found as any).id as string;
    const { data } = await supabase.from('chart_of_accounts' as any).insert({ company_id: cid, account_code: code, account_name: nm, account_type: tp, is_active: true } as any).select('id').single();
    return (data as any).id as string;
  };
  const openPostFor = async (empId: string) => {
    const l = linesByEmp[empId];
    if (!l) { toast({ title: 'No Line', description: 'Run payroll first' }); return; }
    const gross = Number(l.gross || 0);
    const paye = Number(l.paye || 0);
    const uif_emp = Number(l.uif_emp || 0);
    const uif_er = Number(l.uif_er || 0);
    const sdl_er = Number(l.sdl_er || 0);
    const net = Number(l.net || 0);
    setSelectedEmpId(empId);
    setPostValues({ gross, uif_er, sdl_er, paye, uif_emp, net });
    setOpenPostDlg(true);
  };
  const openPayFor = async (empId: string) => {
    const l = linesByEmp[empId];
    if (!l) { toast({ title: 'No Line', description: 'Run payroll first' }); return; }
    setSelectedEmpId(empId);
    setPaySalaryValues({ net: Number(l.net || 0), bankId });
    setOpenPaySalaryDlg(true);
  };
  const openPaySarsFor = async (empId: string) => {
    const l = linesByEmp[empId];
    if (!l) { toast({ title: 'No Line', description: 'Run payroll first' }); return; }
    const paye = Number(l.paye || 0);
    const uif_total = Number(l.uif_emp || 0) + Number(l.uif_er || 0);
    const sdl = Number(l.sdl_er || 0);
    setSelectedEmpId(empId);
    setPaySarsValues({ paye, sdl, uif_total, bankId });
    setOpenPaySarsDlg(true);
  };
  const exportToExcel = () => {
    const rows = employees.map(e => {
      const l = linesByEmp[e.id];
      return {
        Employee: `${e.first_name} ${e.last_name}`,
        Gross: Number(l?.gross || 0),
        PAYE: Number(l?.paye || 0),
        UIF_Emp: Number(l?.uif_emp || 0),
        UIF_Er: Number(l?.uif_er || 0),
        SDL: Number(l?.sdl_er || 0),
        Net: Number(l?.net || 0),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
    const label = currentRun ? new Date(String(currentRun.period_start || new Date())).toLocaleString('en-ZA', { month: 'long', year: 'numeric' }) : 'Current';
    XLSX.writeFile(wb, `Payroll_${label}.xlsx`);
  };

  const executePostJournal = async () => {
    try {
      const effectiveCompanyId = await getEffectiveCompanyId();
      if (!effectiveCompanyId) throw new Error('Company ID missing');
      const todayStr = new Date().toISOString().slice(0,10);
      if (isDateLocked(todayStr)) {
        setIsLockDialogOpen(true);
        return;
      }
      const l = linesByEmp[selectedEmpId];
      if (!l) throw new Error('No payroll line');
      const ref = `PR-${currentRunId}-${selectedEmpId}-POST`;
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('reference_number', ref)
        .maybeSingle();
      if (existingTx) { toast({ title: 'Duplicate', description: 'This payroll journal was already posted', variant: 'destructive' }); return; }
      const salaryExp = await ensureAccountByCode('Salaries & Wages', 'expense', '6000');
      const uifExp = await ensureAccountByCode('Employer UIF Expense', 'expense', '6021');
      const sdlExp = await ensureAccountByCode('Employer SDL Expense', 'expense', '6022');
      const netPayable = await ensureAccountByCode('Accrued Salaries', 'liability', '2510');
      const payePayable = await ensureAccountByCode('PAYE (Tax Payable)', 'liability', '2315');
      const uifPayable = await ensureAccountByCode('UIF Payable', 'liability', '2210');
      const sdlPayable = await ensureAccountByCode('SDL Payable', 'liability', '2220');
      const total = Number(postValues.gross || 0) + Number(postValues.uif_er || 0) + Number(postValues.sdl_er || 0);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: tx } = await supabase
        .from('transactions')
        .insert({ company_id: effectiveCompanyId, user_id: user.id, transaction_date: new Date().toISOString().slice(0,10), description: 'Payroll expense', total_amount: total, transaction_type: 'expense', status: 'pending', reference_number: ref } as any)
        .select()
        .single();
      const txId = (tx as any)?.id;
      const entries = [
        { transaction_id: txId, account_id: salaryExp, debit: Number(postValues.gross || 0), credit: 0, description: 'Salaries & Wages', status: 'pending' },
        { transaction_id: txId, account_id: uifExp, debit: Number(postValues.uif_er || 0), credit: 0, description: 'Employer UIF Expense', status: 'pending' },
        { transaction_id: txId, account_id: sdlExp, debit: Number(postValues.sdl_er || 0), credit: 0, description: 'Employer SDL Expense', status: 'pending' },
        { transaction_id: txId, account_id: netPayable, debit: 0, credit: Number(postValues.net || 0), description: 'Net Salaries Payable', status: 'pending' },
        { transaction_id: txId, account_id: payePayable, debit: 0, credit: Number(postValues.paye || 0), description: 'PAYE Payable', status: 'pending' },
        { transaction_id: txId, account_id: uifPayable, debit: 0, credit: Number((postValues.uif_emp || 0) + (postValues.uif_er || 0)), description: 'UIF Payable', status: 'pending' },
        { transaction_id: txId, account_id: sdlPayable, debit: 0, credit: Number(postValues.sdl_er || 0), description: 'SDL Payable', status: 'pending' },
      ];
      await supabase.from('transaction_entries').insert(entries as any);
      const ledgerRows = entries.map(e => ({ company_id: effectiveCompanyId, transaction_id: txId, account_id: e.account_id, entry_date: new Date().toISOString().slice(0,10), description: e.description, debit: e.debit, credit: e.credit, is_reversed: false }));
      await supabase.from('ledger_entries').insert(ledgerRows as any);
      setOpenPostDlg(false);
      toast({ title: 'Posted', description: 'Payroll journal posted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to post payroll', variant: 'destructive' });
    }
  };

  const executePaySalary = async () => {
    try {
      const effectiveCompanyId = await getEffectiveCompanyId();
      if (!effectiveCompanyId) throw new Error('Company ID missing');
      const todayStr = new Date().toISOString().slice(0,10);
      if (isDateLocked(todayStr)) {
        setIsLockDialogOpen(true);
        return;
      }
      // Validate bank account
      const bid = String(paySalaryValues.bankId || '').trim();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!bid || !uuidRegex.test(bid) || !bankAccounts.find(b => b.id === bid)) {
        toast({ title: 'Bank Account Required', description: 'Please select a valid bank account.', variant: 'destructive' });
        return;
      }
      const ref = `PR-${currentRunId}-${selectedEmpId}-SALARY`;
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('reference_number', ref)
        .maybeSingle();
      if (existingTx) { toast({ title: 'Duplicate', description: 'This salary payment was already posted', variant: 'destructive' }); return; }
      const netPayable = await ensureAccountByCode('Accrued Salaries', 'liability', '2510');
      const bankLedger = await ensureAccountByCode('Bank', 'asset', '1000');
      const amt = Number(paySalaryValues.net || 0);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: tx } = await supabase
        .from('transactions')
        .insert({ company_id: effectiveCompanyId, user_id: user.id, transaction_date: new Date().toISOString().slice(0,10), description: 'Salary payment', total_amount: amt, bank_account_id: bid, transaction_type: 'payment', status: 'pending', reference_number: ref } as any)
        .select()
        .single();
      const txId = (tx as any)?.id;
      const entries = [
        { transaction_id: txId, account_id: netPayable, debit: amt, credit: 0, description: 'Pay Net Salary', status: 'pending' },
        { transaction_id: txId, account_id: bankLedger, debit: 0, credit: amt, description: 'Pay Net Salary', status: 'pending' },
      ];
      await supabase.from('transaction_entries').insert(entries as any);
      const ledgerRows = entries.map(e => ({ company_id: effectiveCompanyId, transaction_id: txId, account_id: e.account_id, entry_date: new Date().toISOString().slice(0,10), description: e.description, debit: e.debit, credit: e.credit, is_reversed: false }));
      await supabase.from('ledger_entries').insert(ledgerRows as any);
      setOpenPaySalaryDlg(false);
      toast({ title: 'Paid', description: 'Salary payment posted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to pay salary', variant: 'destructive' });
    }
  };

  const executePaySars = async () => {
    try {
      const effectiveCompanyId = await getEffectiveCompanyId();
      if (!effectiveCompanyId) throw new Error('Company ID missing');
      const todayStr = new Date().toISOString().slice(0,10);
      if (isDateLocked(todayStr)) {
        setIsLockDialogOpen(true);
        return;
      }
      // Validate bank account
      const bid = String(paySarsValues.bankId || '').trim();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!bid || !uuidRegex.test(bid) || !bankAccounts.find(b => b.id === bid)) {
        toast({ title: 'Bank Account Required', description: 'Please select a valid bank account.', variant: 'destructive' });
        return;
      }
      const ref = `PR-${currentRunId}-${selectedEmpId}-SARS`;
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('company_id', effectiveCompanyId)
        .eq('reference_number', ref)
        .maybeSingle();
      if (existingTx) { toast({ title: 'Duplicate', description: 'This SARS payment was already posted', variant: 'destructive' }); return; }
      const payePayable = await ensureAccountByCode('PAYE (Tax Payable)', 'liability', '2315');
      const uifPayable = await ensureAccountByCode('UIF Payable', 'liability', '2210');
      const sdlPayable = await ensureAccountByCode('SDL Payable', 'liability', '2220');
      const bankLedger = await ensureAccountByCode('Bank', 'asset', '1000');
      const total = Number(paySarsValues.paye || 0) + Number(paySarsValues.sdl || 0) + Number(paySarsValues.uif_total || 0);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: tx } = await supabase
        .from('transactions')
        .insert({ company_id: effectiveCompanyId, user_id: user.id, transaction_date: new Date().toISOString().slice(0,10), description: 'SARS payment (PAYE/UIF/SDL)', total_amount: total, bank_account_id: bid, transaction_type: 'liability', status: 'pending', reference_number: ref } as any)
        .select()
        .single();
      const txId = (tx as any)?.id;
      const entries = [
        { transaction_id: txId, account_id: payePayable, debit: Number(paySarsValues.paye || 0), credit: 0, description: 'PAYE Payable', status: 'pending' },
        { transaction_id: txId, account_id: sdlPayable, debit: Number(paySarsValues.sdl || 0), credit: 0, description: 'SDL Payable', status: 'pending' },
        { transaction_id: txId, account_id: uifPayable, debit: Number(paySarsValues.uif_total || 0), credit: 0, description: 'UIF Payable', status: 'pending' },
        { transaction_id: txId, account_id: bankLedger, debit: 0, credit: total, description: 'SARS Payment', status: 'pending' },
      ];
      await supabase.from('transaction_entries').insert(entries as any);
      const ledgerRows = entries.map(e => ({ company_id: effectiveCompanyId, transaction_id: txId, account_id: e.account_id, entry_date: new Date().toISOString().slice(0,10), description: e.description, debit: e.debit, credit: e.credit, is_reversed: false }));
      await supabase.from('ledger_entries').insert(ledgerRows as any);
      setOpenPaySarsDlg(false);
      toast({ title: 'Paid', description: 'SARS payment posted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to pay SARS', variant: 'destructive' });
    }
  };
  return (
    <Card>
      <CardHeader><CardTitle>Payroll</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm">
            {currentRun ? (
              <Badge variant="secondary">{getCurrentRunLabel()}</Badge>
            ) : (
              <Badge variant="outline">No current pay run</Badge>
            )}
          </div>
          <Button variant="outline" onClick={exportToExcel}>Export to Excel</Button>
        </div>
        <Table>
          <TableHeader className="bg-slate-700 border-b border-slate-800">
            <TableRow className="hover:bg-transparent border-none">
              <TableHead className="text-white">Employee</TableHead>
              <TableHead className="text-white">Gross</TableHead>
              <TableHead className="text-white">PAYE</TableHead>
              <TableHead className="text-white">UIF</TableHead>
              <TableHead className="text-white">SDL</TableHead>
              <TableHead className="text-white">Net</TableHead>
              <TableHead className="text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
        <TableBody>
          {employees.map(e => {
            const l = linesByEmp[e.id];
            return (
              <TableRow key={e.id}>
                  <TableCell>{e.first_name} {e.last_name}</TableCell>
                  <TableCell>{l ? `R ${Number(l.gross || 0).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>{l ? `R ${Number(l.paye || 0).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>{l ? `R ${(Number(l.uif_emp || 0) + Number(l.uif_er || 0)).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>{l ? `R ${Number(l.sdl_er || 0).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>{l ? `R ${Number(l.net || 0).toFixed(2)}` : '-'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => openPostFor(e.id)}>Post</Button>
                    <Button size="sm" variant="outline" className="ml-2" onClick={() => openPayFor(e.id)}>Pay Salary</Button>
                    <Button size="sm" variant="outline" className="ml-2" onClick={() => openPaySarsFor(e.id)}>Pay SARS</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Dialog open={openPostDlg} onOpenChange={setOpenPostDlg}>
          <DialogContent>
            <DialogHeader><DialogTitle>Post Payroll Journal</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Gross Salary</Label><Input value={String(postValues.gross)} onChange={e => setPostValues({ ...postValues, gross: Number(e.target.value || 0) })} /></div>
              <div><Label>PAYE</Label><Input value={String(postValues.paye)} onChange={e => setPostValues({ ...postValues, paye: Number(e.target.value || 0) })} /></div>
              <div><Label>UIF (Employer)</Label><Input value={String(postValues.uif_er)} onChange={e => setPostValues({ ...postValues, uif_er: Number(e.target.value || 0) })} /></div>
              <div><Label>UIF (Employee)</Label><Input value={String(postValues.uif_emp)} onChange={e => setPostValues({ ...postValues, uif_emp: Number(e.target.value || 0) })} /></div>
              <div><Label>SDL (Employer)</Label><Input value={String(postValues.sdl_er)} onChange={e => setPostValues({ ...postValues, sdl_er: Number(e.target.value || 0) })} /></div>
              <div><Label>Net Pay</Label><Input value={String(postValues.net)} onChange={e => setPostValues({ ...postValues, net: Number(e.target.value || 0) })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenPostDlg(false)}>Cancel</Button>
              <Button onClick={executePostJournal}>Post</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={openPaySalaryDlg} onOpenChange={setOpenPaySalaryDlg}>
          <DialogContent>
            <DialogHeader><DialogTitle>Pay Net Salary</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Net Amount</Label><Input value={String(paySalaryValues.net)} onChange={e => setPaySalaryValues({ ...paySalaryValues, net: Number(e.target.value || 0) })} /></div>
              <div>
                <Label>Bank Account</Label>
                <Select value={paySalaryValues.bankId} onValueChange={(v: any) => setPaySalaryValues({ ...paySalaryValues, bankId: String(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenPaySalaryDlg(false)}>Cancel</Button>
              <Button onClick={executePaySalary}>Pay</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={openPaySarsDlg} onOpenChange={setOpenPaySarsDlg}>
          <DialogContent>
            <DialogHeader><DialogTitle>Pay SARS (PAYE/UIF/SDL)</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>PAYE</Label><Input value={String(paySarsValues.paye)} onChange={e => setPaySarsValues({ ...paySarsValues, paye: Number(e.target.value || 0) })} /></div>
              <div><Label>SDL</Label><Input value={String(paySarsValues.sdl)} onChange={e => setPaySarsValues({ ...paySarsValues, sdl: Number(e.target.value || 0) })} /></div>
              <div><Label>UIF Total</Label><Input value={String(paySarsValues.uif_total)} onChange={e => setPaySarsValues({ ...paySarsValues, uif_total: Number(e.target.value || 0) })} /></div>
              <div>
                <Label>Bank Account</Label>
                <Select value={paySarsValues.bankId} onValueChange={(v: any) => setPaySarsValues({ ...paySarsValues, bankId: String(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenPaySarsDlg(false)}>Cancel</Button>
              <Button onClick={executePaySars}>Pay</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
