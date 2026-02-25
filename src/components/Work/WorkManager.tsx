import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { CalendarDays, User, Layers, Building2, CheckCircle2, AlertCircle, Clock, ArrowRight } from "lucide-react";

type TaskType = "system" | "assigned" | "recurring" | "transaction" | "allocation";
type ModuleType = "GL" | "Payroll" | "VAT" | "Assets" | "Sales" | "Purchases" | "Banking";
type StatusType = "todo" | "in_progress" | "review" | "completed" | "pending_approval";

interface WorkTask {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  module: ModuleType;
  assignedToUserId?: string;
  assignedToName?: string;
  dueDate: string;
  status: StatusType;
  periodLabel: string;
  financialYearLabel: string;
  isOverdue: boolean;
  link?: string;
  linkLabel?: string;
}

const fixLink = (link?: string) => {
  if (!link) return undefined;
  const patterns: Array<{ re: RegExp; to: string }> = [
    { re: /^\/sales\/invoices\/?$/i, to: "/invoices" },
    { re: /^\/purchases\/?$/i, to: "/purchase" },
    { re: /^\/banking\/?$/i, to: "/bank" },
    { re: /^\/assets\/?$/i, to: "/fixed-assets" },
    { re: /^\/expenses\/?$/i, to: "/transactions" },
    { re: /^\/tax\/vat-201\/?$/i, to: "/tax" }
  ];
  for (const p of patterns) {
    if (p.re.test(link)) return p.to;
  }
  return link;
};

const sampleTasks: WorkTask[] = [
  {
    id: "t1",
    title: "January 2026 bank reconciliation",
    description: "Ensure all bank transactions are reconciled for Jan 2026. This is a critical control task.",
    type: "system",
    module: "GL",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-02-05",
    status: "todo",
    periodLabel: "January 2026",
    financialYearLabel: "FY 2025/26",
    isOverdue: true,
    link: "/bank",
    linkLabel: "Go to Banking"
  },
  {
    id: "t2",
    title: "Unposted journals review",
    description: "Review and post pending journals to close the period.",
    type: "system",
    module: "GL",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-02-03",
    status: "in_progress",
    periodLabel: "January 2026",
    financialYearLabel: "FY 2025/26",
    isOverdue: true,
    link: "/general-journal",
    linkLabel: "Go to Journals"
  },
  {
    id: "t3",
    title: "VAT review Q1",
    description: "Prepare VAT workings for quarterly submission. Check input/output tax reports.",
    type: "system",
    module: "VAT",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-03-10",
    status: "review",
    periodLabel: "Q1 FY 2025/26",
    financialYearLabel: "FY 2025/26",
    isOverdue: false,
    link: "/tax",
    linkLabel: "Go to VAT Report"
  },
  {
    id: "t4",
    title: "Month-end close",
    description: "Close the books for January 2026. Run depreciation and accruals.",
    type: "recurring",
    module: "GL",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-02-07",
    status: "in_progress",
    periodLabel: "January 2026",
    financialYearLabel: "FY 2025/26",
    isOverdue: false,
  },
  {
    id: "t5",
    title: "Payroll processing",
    description: "Process payroll and post entries for the month.",
    type: "recurring",
    module: "Payroll",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-02-25",
    status: "todo",
    periodLabel: "February 2026",
    financialYearLabel: "FY 2025/26",
    isOverdue: false,
    link: "/payroll",
    linkLabel: "Go to Payroll"
  },
  {
    id: "t6",
    title: "Approve Purchase Order #PO-2026-001",
    description: "Review and approve purchase order for IT equipment.",
    type: "transaction",
    module: "Purchases",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-02-01",
    status: "pending_approval",
    periodLabel: "February 2026",
    financialYearLabel: "FY 2025/26",
    isOverdue: true,
    link: "/purchase",
    linkLabel: "View Purchase Order"
  },
  {
    id: "t7",
    title: "Review Allocation for Inv #INV-2026-104",
    description: "Payment received but not fully allocated. Please review.",
    type: "allocation",
    module: "Sales",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-02-02",
    status: "todo",
    periodLabel: "February 2026",
    financialYearLabel: "FY 2025/26",
    isOverdue: true,
    link: "/invoices",
    linkLabel: "Go to Invoices"
  },
  {
    id: "t8",
    title: "Pending Expense Approval: Travel",
    description: "Travel expense claim from Sales Dept requires approval.",
    type: "transaction",
    module: "Purchases",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-02-05",
    status: "pending_approval",
    periodLabel: "February 2026",
    financialYearLabel: "FY 2025/26",
    isOverdue: false,
    link: "/transactions",
    linkLabel: "View Expenses"
  },
  {
    id: "t9",
    title: "Quarterly Asset Depreciation",
    description: "Run depreciation for all fixed assets for the quarter.",
    type: "recurring",
    module: "Assets",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-03-31",
    status: "todo",
    periodLabel: "Q1 FY 2025/26",
    financialYearLabel: "FY 2025/26",
    isOverdue: false,
    link: "/fixed-assets",
    linkLabel: "Go to Assets"
  },
  {
    id: "t10",
    title: "Annual Financial Review 2025",
    description: "Review financial statements for previous year closure.",
    type: "system",
    module: "GL",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-01-15",
    status: "completed",
    periodLabel: "FY 2024/25",
    financialYearLabel: "FY 2024/25",
    isOverdue: false,
    link: "/reports",
    linkLabel: "View Reports"
  },
  {
    id: "t11",
    title: "Bank Recon December 2025",
    description: "Reconcile December bank statements.",
    type: "system",
    module: "Banking",
    assignedToUserId: undefined,
    assignedToName: "Unassigned",
    dueDate: "2026-01-05",
    status: "completed",
    periodLabel: "December 2025",
    financialYearLabel: "FY 2025/26",
    isOverdue: false,
    link: "/bank",
    linkLabel: "Go to Banking"
  }
];

const statusBadge = (s: StatusType) => {
  if (s === "todo") return { variant: "outline" as const, className: "bg-slate-100 text-slate-700 border-slate-200" };
  if (s === "in_progress") return { variant: "secondary" as const, className: "bg-blue-50 text-blue-700 border-blue-200" };
  if (s === "review") return { variant: "secondary" as const, className: "bg-amber-50 text-amber-700 border-amber-200" };
  if (s === "pending_approval") return { variant: "secondary" as const, className: "bg-orange-50 text-orange-700 border-orange-200" };
  return { variant: "default" as const, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
};

export function WorkManager() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentUserId = user?.id ? String(user.id) : "";
  
  const [users, setUsers] = useState<{id: string, name: string}[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [rawTasks, setRawTasks] = useState<WorkTask[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, setLoading] = useState(true);

  // Fetch Context (Users & Company)
  useEffect(() => {
    const fetchContext = async () => {
      if (!user?.id) return;
      try {
        const { data: myProfile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
        if (myProfile?.company_id) {
          setCompanyId(myProfile.company_id);
          const { data: companyUsers } = await supabase.from('profiles').select('user_id, first_name, last_name, email').eq('company_id', myProfile.company_id);
          if (companyUsers) {
            setUsers(companyUsers.map(u => ({
              id: u.user_id,
              name: u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email || "Unknown User"
            })));
          }
        }
      } catch (error) { console.error("Error fetching context:", error); }
    };
    fetchContext();
  }, [user]);

  // Fetch Tasks & Seed if empty
  useEffect(() => {
    const fetchTasks = async () => {
      if (!companyId) return;
      setLoading(true);
      
      const { data: existing, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true });
      
      if (error) {
        console.error("Error fetching tasks:", error);
      }

      if (existing && existing.length > 0) {
        setRawTasks(existing.map(t => ({
          id: t.id,
          title: t.title,
          description: t.description,
          type: t.type as TaskType,
          module: t.module as ModuleType,
          assignedToUserId: t.assigned_to,
          assignedToName: "Loading...",
          dueDate: t.due_date,
          status: t.status as StatusType,
          periodLabel: t.period_label,
          financialYearLabel: t.financial_year_label,
          isOverdue: false,
          link: fixLink(t.link),
          linkLabel: t.link_label
        })));
      } else {
        // Seed if empty
        console.log("No tasks found, attempting to seed sample data...");
        
        const toInsert = sampleTasks.map(t => ({
          company_id: companyId,
          title: t.title,
          description: t.description,
          type: t.type,
          module: t.module,
          due_date: t.dueDate,
          status: t.status,
          period_label: t.periodLabel,
          financial_year_label: t.financialYearLabel,
          link: t.link,
          link_label: t.linkLabel
        }));
        
        const { data: inserted, error: insertError } = await supabase
          .from('tasks')
          .upsert(toInsert, { onConflict: 'company_id,title,due_date,type,module' })
          .select();
          
        if (insertError) {
          console.error("Error seeding tasks:", insertError);
          toast.error("Failed to seed tasks: " + insertError.message);
        }
        
        if (inserted) {
          toast.success("Sample tasks loaded successfully");
          setRawTasks(inserted.map(t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            type: t.type as TaskType,
            module: t.module as ModuleType,
            assignedToUserId: t.assigned_to,
            assignedToName: "Unassigned",
            dueDate: t.due_date,
            status: t.status as StatusType,
            periodLabel: t.period_label,
            financialYearLabel: t.financial_year_label,
            isOverdue: false,
            link: fixLink(t.link),
            linkLabel: t.link_label
          })));
        }
      }
      setLoading(false);
    };
    fetchTasks();
  }, [companyId]);

  const isAccountant = true; 
  const [filterMine, setFilterMine] = useState("all");
  const [filterModule, setFilterModule] = useState<"all" | ModuleType>("all");
  const [filterType, setFilterType] = useState<"all" | TaskType>("all");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<WorkTask | null>(null);

  const tasks = useMemo(() => {
    const now = new Date();
    return rawTasks.map(t => {
       const u = users.find(u => u.id === t.assignedToUserId);
       const due = new Date(t.dueDate);
       return { ...t, assignedToName: u ? u.name : "Unassigned", isOverdue: due < now && t.status !== "completed" };
    })
    .filter(t => filterMine === "mine" ? t.assignedToUserId === currentUserId : true)
    .filter(t => filterModule === "all" ? true : t.module === filterModule)
    .filter(t => filterType === "all" ? true : t.type === filterType);
  }, [rawTasks, users, filterMine, filterModule, filterType, currentUserId]);

  const grouped = useMemo(() => {
    const now = new Date();
    const isDueSoon = (d: string) => {
      const due = new Date(d);
      const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    };
    const upcoming = (d: string) => {
      const due = new Date(d);
      const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff > 7;
    };
    return {
      overdue: tasks.filter(t => t.isOverdue && t.status !== "completed"),
      dueSoon: tasks.filter(t => !t.isOverdue && isDueSoon(t.dueDate) && t.status !== "completed"),
      upcoming: tasks.filter(t => upcoming(t.dueDate) && t.status !== "completed"),
      completed: tasks.filter(t => t.status === "completed"),
    };
  }, [tasks]);

  const openDetails = (t: WorkTask) => {
    setSelected(t);
    setOpen(true);
  };

  const handleStatusChange = async (newStatus: StatusType) => {
    if (!selected) return;
    
    const updated = { ...selected, status: newStatus };
    setRawTasks(prev => prev.map(t => t.id === selected.id ? updated : t));
    setSelected(updated);

    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', selected.id);
      
    if (error) console.error("Error updating status:", error);
  };

  const handleAssignChange = async (userId: string) => {
    if (!selected) return;
    const assignee = users.find(u => u.id === userId);
    const assignedTo = userId === "unassigned" ? null : userId;
    
    const updated = { 
      ...selected, 
      assignedToUserId: assignedTo || undefined,
      assignedToName: assignee ? assignee.name : "Unassigned"
    };
    
    setRawTasks(prev => prev.map(t => t.id === selected.id ? updated : t));
    setSelected(updated);
    
    const { error } = await supabase
      .from('tasks')
      .update({ assigned_to: assignedTo })
      .eq('id', selected.id);
      
    if (error) console.error("Error assigning task:", error);
  };
  
  const handleNavigate = () => {
    if (selected?.link) {
      setOpen(false);
      const l = fixLink(selected.link);
      if (l) navigate(l);
    }
  };

  const TaskCard = ({ t }: { t: WorkTask }) => {
    const isMine = t.assignedToUserId === currentUserId;
    const s = t.status;
    const badge = statusBadge(s);

    return (
      <Card 
        className={cn(
          "hover:shadow-md transition-shadow cursor-pointer group relative overflow-hidden border-l-4",
          t.isOverdue && t.status !== "completed" ? "border-l-red-500" : 
          t.status === "completed" ? "border-l-emerald-500" : "border-l-transparent"
        )}
        onClick={() => openDetails(t)}
      >
        <CardHeader className="p-4 pb-2">
          <div className="flex justify-between items-start gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {t.type === "system" && <Badge variant="outline" className="text-[10px] h-5 px-1 bg-purple-50 text-purple-700 border-purple-200">System</Badge>}
                {t.type === "recurring" && <Badge variant="outline" className="text-[10px] h-5 px-1 bg-indigo-50 text-indigo-700 border-indigo-200">Recurring</Badge>}
                {t.type === "transaction" && <Badge variant="outline" className="text-[10px] h-5 px-1 bg-orange-50 text-orange-700 border-orange-200">Transaction</Badge>}
                {t.type === "allocation" && <Badge variant="outline" className="text-[10px] h-5 px-1 bg-cyan-50 text-cyan-700 border-cyan-200">Allocation</Badge>}
                <span className="text-xs font-medium text-muted-foreground">{t.module}</span>
              </div>
              <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
                {t.title}
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2 pb-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span className={cn("text-xs", isMine && "font-medium text-primary")}>
                {t.assignedToName || "Unassigned"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <CalendarDays className={cn("h-3.5 w-3.5", t.isOverdue && s !== "completed" && "text-red-500")} />
              <span className={cn("text-xs", t.isOverdue && s !== "completed" && "text-red-600 font-medium")}>
                {new Date(t.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Badge variant={badge.variant} className={cn("capitalize font-normal text-xs", badge.className)}>
              {s === "todo" ? "To Do" : s === "in_progress" ? "In Progress" : s === "review" ? "Review" : s === "pending_approval" ? "Pending Approval" : "Completed"}
            </Badge>
            <span className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded-sm">
              {t.periodLabel}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  const Section = ({ title, tasks, icon: Icon, colorClass }: { title: string, tasks: WorkTask[], icon?: any, colorClass?: string }) => {
    if (tasks.length === 0) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          {Icon && <Icon className={cn("h-5 w-5", colorClass)} />}
          <h2 className="font-semibold text-lg">{title}</h2>
          <Badge variant="secondary" className="ml-2">{tasks.length}</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tasks.map(t => <TaskCard key={t.id} t={t} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 p-2 sm:p-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Work / Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage your team's accounting tasks and deadlines.</p>
        </div>
        <div className="flex items-center gap-2">
            {/* Place for global actions if needed */}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-card p-4 rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium mr-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          Filters:
        </div>
        <Select value={filterMine} onValueChange={setFilterMine}>
          <SelectTrigger className="w-[140px] h-9 bg-background">
            <SelectValue placeholder="All tasks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tasks</SelectItem>
            <SelectItem value="mine">Assigned to me</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterModule} onValueChange={(v) => setFilterModule(v as any)}>
          <SelectTrigger className="w-[140px] h-9 bg-background">
            <SelectValue placeholder="By module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            <SelectItem value="GL">GL</SelectItem>
            <SelectItem value="Payroll">Payroll</SelectItem>
            <SelectItem value="VAT">VAT</SelectItem>
            <SelectItem value="Assets">Assets</SelectItem>
            <SelectItem value="Sales">Sales</SelectItem>
            <SelectItem value="Purchases">Purchases</SelectItem>
            <SelectItem value="Banking">Banking</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
          <SelectTrigger className="w-[140px] h-9 bg-background">
            <SelectValue placeholder="By task type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="system">System</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="recurring">Recurring</SelectItem>
            <SelectItem value="transaction">Transaction</SelectItem>
            <SelectItem value="allocation">Allocation</SelectItem>
          </SelectContent>
        </Select>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="ml-auto"
          onClick={async () => {
            if (!companyId) {
              toast.error("Company ID not found");
              return;
            }
            const toInsert = sampleTasks.map(t => ({
              company_id: companyId,
              title: t.title,
              description: t.description,
              type: t.type,
              module: t.module,
              due_date: t.dueDate,
              status: t.status,
              period_label: t.periodLabel,
              financial_year_label: t.financialYearLabel,
              link: t.link,
              link_label: t.linkLabel
            }));
            const { error } = await supabase.from('tasks').insert(toInsert);
            if (error) {
              toast.error("Error seeding: " + error.message);
            } else {
              toast.success("Tasks seeded successfully! Reloading...");
              setTimeout(() => window.location.reload(), 1000);
            }
          }}
        >
          Reset/Seed Data
        </Button>
      </div>

      <div className="space-y-10">
        <Section title="Overdue" tasks={grouped.overdue} icon={AlertCircle} colorClass="text-red-500" />
        <Section title="Due Soon" tasks={grouped.dueSoon} icon={Clock} colorClass="text-amber-500" />
        <Section title="Upcoming" tasks={grouped.upcoming} icon={CalendarDays} colorClass="text-blue-500" />
        <Section title="Completed" tasks={grouped.completed} icon={CheckCircle2} colorClass="text-emerald-500" />
        
        {tasks.length === 0 && (
          <div className="text-center py-12 bg-muted/10 rounded-lg border border-dashed">
            <p className="text-muted-foreground">No tasks match your filters</p>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">{selected?.type === "system" ? "System Task" : selected?.type === "recurring" ? "Recurring" : selected?.type === "transaction" ? "Transaction" : selected?.type === "allocation" ? "Allocation" : "Assigned Task"}</Badge>
              <Badge variant="secondary">{selected?.module}</Badge>
            </div>
            <DialogTitle className="text-xl">{selected?.title}</DialogTitle>
            <DialogDescription className="text-base pt-2">
              {selected?.description || "No description provided."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Assigned To</Label>
                {isAccountant ? (
                  <Select 
                    value={selected?.assignedToUserId || "unassigned"} 
                    onValueChange={handleAssignChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {users.length > 0 ? (
                        users.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="loading" disabled>Loading users...</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-sm">
                    <User className="h-4 w-4" />
                    {selected?.assignedToName || "Unassigned"}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label className="text-muted-foreground">Due Date</Label>
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-sm">
                  <CalendarDays className="h-4 w-4" />
                  {selected ? new Date(selected.dueDate).toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' }) : "-"}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Status</Label>
                <Select
                  value={selected?.status || "todo"}
                  onValueChange={(v) => handleStatusChange(v as StatusType)}
                  disabled={selected ? (selected.assignedToUserId !== currentUserId && !isAccountant) : true}
                >
                  <SelectTrigger className={cn(
                    selected?.status === "completed" && "text-green-600 border-green-200 bg-green-50",
                    selected?.status === "in_progress" && "text-blue-600 border-blue-200 bg-blue-50",
                    selected?.status === "pending_approval" && "text-orange-600 border-orange-200 bg-orange-50"
                  )}>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review">Review Required</SelectItem>
                    <SelectItem value="pending_approval">Pending Approval</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Accounting Period</Label>
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md text-sm">
                  <Building2 className="h-4 w-4" />
                  {selected?.periodLabel} • {selected?.financialYearLabel}
                </div>
              </div>
            </div>
            
            {selected?.assignedToUserId !== currentUserId && !isAccountant && (
              <div className="rounded-md bg-yellow-50 p-3 text-xs text-yellow-800 border border-yellow-200">
                You can only view this task. Contact an administrator to update it.
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between gap-4 border-t pt-4">
            <div className="text-xs text-muted-foreground flex items-center">
              Task ID: {selected?.id}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
              {selected?.link && (
                <Button onClick={handleNavigate} className="gap-2">
                  {selected.linkLabel || "Go to linked record"} 
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
