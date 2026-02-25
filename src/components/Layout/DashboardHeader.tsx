import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Bell, Menu, Search, LogOut, Building2, Settings, User, CreditCard, PanelLeft, CheckCheck, Trash2, Info, CheckCircle2, AlertCircle, X, Calendar, ChevronsUpDown, Check, Loader2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

import { MessageBox } from "./MessageBox";
import { useRoles } from "@/hooks/use-roles";
import { UserMenu } from "./UserMenu";

interface DashboardHeaderProps {
  onMenuClick: () => void;
}

export const DashboardHeader = ({ onMenuClick }: DashboardHeaderProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; description: string; created_at: string; read: boolean; type?: 'info' | 'success' | 'warning' | 'error' }>>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const unreadCount = notifications.filter(n => !n.read).length;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ type: string; label: string; sublabel?: string; navigateTo: string }>>([]);
  const [demoCompanyName, setDemoCompanyName] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState<boolean>(false);

  const [notificationOpen, setNotificationOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  // Company Switcher State
  const [userProfile, setUserProfile] = useState<{ name: string; role: string; company_name?: string; company_id?: string } | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<any[]>([]);
  
  // Switching State
  const [isSwitching, setIsSwitching] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [targetCompanyName, setTargetCompanyName] = useState("");

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Load User Profile and Companies
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user?.id) return;

      try {
        // Fetch available companies first
        const { data: userRoles } = await supabase
            .from("user_roles")
            .select("company_id")
            .eq("user_id", user.id);

        let fetchedCompanies: any[] = [];
        if (userRoles && userRoles.length > 0) {
            const companyIds = userRoles.map(ur => ur.company_id);
            const { data: companies } = await supabase
                .from("companies")
                .select("id, name, logo_url")
                .in("id", companyIds);
            
            if (companies) {
                fetchedCompanies = companies;
                setAvailableCompanies(companies);
            }
        }

        // Get user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, company_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profile) {
          // Get user role
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("company_id", profile.company_id)
            .maybeSingle();

          // Get company details
          const { data: company } = await supabase
            .from("companies")
            .select("logo_url, name")
            .eq("id", profile.company_id)
            .maybeSingle();

          const fullName = [profile.first_name, profile.last_name]
            .filter(Boolean)
            .join(" ") || user.email?.split("@")[0] || "User";
          
          const role = roles?.role || "User";

          // Determine company name and logo
          let displayCompanyName = "Rigel Business";
          let displayCompanyId = profile.company_id;
          let displayLogo = null;

          if (company) {
              displayCompanyName = company.name;
              displayLogo = company.logo_url;
          } else if (fetchedCompanies.length > 0) {
              displayCompanyName = fetchedCompanies[0].name;
              displayCompanyId = fetchedCompanies[0].id;
              displayLogo = fetchedCompanies[0].logo_url;
          }

          setUserProfile({ name: fullName, role, company_name: displayCompanyName, company_id: displayCompanyId });
          setCompanyLogoUrl(displayLogo);

        } else {
          // Fallback
          let displayCompanyName = "Rigel Business";
          let displayCompanyId = undefined;
          
          if (fetchedCompanies.length > 0) {
              displayCompanyName = fetchedCompanies[0].name;
              displayCompanyId = fetchedCompanies[0].id;
              setCompanyLogoUrl(fetchedCompanies[0].logo_url);
          }

          setUserProfile({ 
            name: user.email?.split("@")[0] || "User", 
            role: "User",
            company_name: displayCompanyName,
            company_id: displayCompanyId
          });
        }
      } catch (error) {
        // Fallback
        setUserProfile({ 
          name: user.email?.split("@")[0] || "User", 
          role: "User",
          company_name: "Rigel Business"
        });
      }
    };

    loadUserProfile();

    const handleCompanyChange = () => {
      loadUserProfile();
    };

    window.addEventListener('company-changed', handleCompanyChange);

    return () => {
      window.removeEventListener('company-changed', handleCompanyChange);
    };
  }, [user]);

  const handleSwitchCompany = async (companyId: string) => {
    if (!user?.id) return;
    
    const targetCompany = availableCompanies.find(c => c.id === companyId);
    if (targetCompany) {
      setTargetCompanyName(targetCompany.name);
    }
    
    setIsSwitching(true);
    
    try {
        // Artificial delay for "Human Design" feel
        await new Promise(resolve => setTimeout(resolve, 1500));

        const { error } = await supabase
            .from("profiles")
            .update({ company_id: companyId })
            .eq("user_id", user.id);

        if (error) throw error;

        // Dispatch event
        window.dispatchEvent(new Event('company-changed'));
        
        // Invalidate queries
        await queryClient.invalidateQueries();
        
        setIsSwitching(false);
        setShowSuccessDialog(true);
        
    } catch (e) {
        console.error("Error switching company:", e);
        setIsSwitching(false);
        toast({
            title: "Error",
            description: "Failed to switch company",
            variant: "destructive",
        });
    }
  };


  useEffect(() => {
    const init = async () => {
      try {
        try {
          const dm = localStorage.getItem('rigel_demo_mode') === 'true';
          setDemoMode(dm);
          if (dm) {
            const comp = localStorage.getItem('rigel_demo_company');
            if (comp) setDemoCompanyName(JSON.parse(comp)?.name || 'Stella Lumen Pty Ltd');
          }
        } catch {}
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user?.id)
          .maybeSingle();
        if (!profile?.company_id) return;
        setCompanyId(profile.company_id);

        const channel = (supabase as any)
          .channel('notifications')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload: any) => {
            const row: any = payload?.new || payload?.old || {};
            if (row.company_id && row.company_id !== profile.company_id) return;
            const status = String(row.status || '').toLowerCase();
            const title = status === 'approved' || status === 'posted' ? 'Transaction Posted' : 'Transaction Updated';
            const desc = `${row.description || 'Transaction'} • ${row.transaction_date || ''}`;
            const type = status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'info';
            pushNotification(title, desc, type);
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, (payload: any) => {
            const row: any = payload?.new || payload?.old || {};
            if (row.company_id && row.company_id !== profile.company_id) return;
            const status = String(row.status || '').toLowerCase();
            if (status === 'sent') {
              pushNotification('Invoice Sent', `Invoice ${row.invoice_number || row.id}`, 'success');
            } else if (status === 'paid') {
              pushNotification('Invoice Paid', `Invoice ${row.invoice_number || row.id}`, 'success');
            } else {
              pushNotification('Invoice Updated', `Invoice ${row.invoice_number || row.id}`, 'info');
            }
          })
          .on('postgres_changes', { event: 'insert', schema: 'public', table: 'bank_accounts' }, (payload: any) => {
            const row: any = payload?.new || {};
            if (row.company_id && row.company_id !== profile.company_id) return;
            pushNotification('Bank Account Added', `${row.bank_name || ''} • ${row.account_name || ''}`, 'info');
          })
          .on('postgres_changes', { event: 'insert', schema: 'public', table: 'chart_of_accounts' }, (payload: any) => {
            const row: any = payload?.new || {};
            if (row.company_id && row.company_id !== profile.company_id) return;
            pushNotification('Account Created', `${row.account_code || ''} • ${row.account_name || ''}`, 'success');
          })
          .subscribe();

        return () => {
          (supabase as any).removeChannel(channel);
        };
      } catch (e) {
        // non-blocking
      }
    };
    init();

    // Reminder Check
    const checkReminders = async () => {
      // Check last reminder time to prevent spamming on every page load
      const lastReminderTime = localStorage.getItem('rigel_last_reminder_check');
      const now = Date.now();
      const FOUR_HOURS = 4 * 60 * 60 * 1000;

      if (lastReminderTime && (now - parseInt(lastReminderTime) < FOUR_HOURS)) {
        return; // Skip if checked recently
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        // Get company_id efficiently
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();
          
        if (!profile?.company_id) return;
        const cid = profile.company_id;

        let hasNotification = false;

        // 1. Check for Unallocated Transactions (pending/unposted)
        const { count: unallocatedCount, error: txError } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', cid)
          .in('status', ['pending', 'unposted']);

        if (!txError && unallocatedCount && unallocatedCount > 0) {
          const msg = `You have ${unallocatedCount} unallocated transactions requiring attention.`;
          pushNotification('Action Required', msg, 'warning');
          toast({
            title: "Unallocated Transactions",
            description: msg,
            action: <Button variant="outline" size="sm" onClick={() => navigate('/transactions')}>View</Button>,
          });
          hasNotification = true;
        }

        // 2. Check for Unpaid/Overdue Invoices
        const today = new Date().toISOString().split('T')[0];
        const { count: overdueCount, error: invError } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', cid)
          .neq('status', 'paid')
          .lt('due_date', today);

        if (!invError && overdueCount && overdueCount > 0) {
          const msg = `You have ${overdueCount} overdue invoices. Please follow up.`;
          pushNotification('Overdue Invoices', msg, 'error');
          toast({
            title: "Overdue Invoices",
            description: msg,
            variant: "destructive",
            action: <Button variant="outline" size="sm" className="bg-white text-black hover:bg-gray-100 border-none" onClick={() => navigate('/sales?tab=invoices')}>View</Button>,
          });
          hasNotification = true;
        }

        // Update timestamp only if we actually ran the checks
        localStorage.setItem('rigel_last_reminder_check', now.toString());

      } catch (e) {
        console.error("Reminder check failed", e);
      }
    };

    // Run check after a short delay to ensure auth is ready
    const timeout = setTimeout(checkReminders, 2000);
    return () => clearTimeout(timeout);

  }, [user?.id, toast, navigate]);

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      // Bell sound: sine wave with smooth decay
      osc.frequency.setValueAtTime(880, t); // A5
      osc.type = 'sine';
      
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.00001, t + 1);
      
      osc.start(t);
      osc.stop(t + 1);
    } catch (e) {
      console.error("Failed to play notification sound", e);
    }
  };

  const pushNotification = (title: string, description: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    playNotificationSound();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNotifications(prev => [{ id, title, description, created_at: new Date().toISOString(), read: false, type }, ...prev].slice(0, 50));
  };

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const clearAll = () => setNotifications([]);

  useEffect(() => {
    const handler = setTimeout(async () => {
      const q = (searchQuery || "").trim();
      if (!q) { setSearchResults([]); return; }
      try {
        const results: Array<{ type: string; label: string; sublabel?: string; navigateTo: string }> = [];
        const tx = await supabase
          .from('transactions')
          .select('id, description, transaction_date')
          .ilike('description', `%${q}%`)
          .limit(5);
        (tx.data || []).forEach((row: any) => {
          results.push({ type: 'Transaction', label: row.description || 'Transaction', sublabel: row.transaction_date || '', navigateTo: '/transactions' });
        });
        const inv = await supabase
          .from('invoices')
          .select('id, invoice_number, customer_name')
          .or(`invoice_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
          .limit(5);
        (inv.data || []).forEach((row: any) => {
          results.push({ type: 'Invoice', label: row.invoice_number || String(row.id), sublabel: row.customer_name || '', navigateTo: '/sales?tab=invoices' });
        });
        const cust = await supabase
          .from('customers')
          .select('id, name, email')
          .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(5);
        (cust.data || []).forEach((row: any) => {
          results.push({ type: 'Customer', label: row.name || 'Customer', sublabel: row.email || '', navigateTo: '/customers' });
        });
        const items = await supabase
          .from('items')
          .select('id, name, description')
          .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
          .limit(5);
        (items.data || []).forEach((row: any) => {
          results.push({ type: 'Product', label: row.name || 'Item', sublabel: row.description || '', navigateTo: '/sales?tab=products' });
        });
        setSearchResults(results.slice(0, 10));
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const executeSearch = () => {
    setSearchOpen(true);
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 px-4 sm:px-6 shadow-sm">
      
      {/* Switching Company Dialog */}
      <Dialog open={isSwitching} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[400px] border-none shadow-lg [&>button]:hidden pointer-events-none">
          <div className="flex flex-col items-center justify-center py-8 gap-4">
             <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                <Loader2 className="h-12 w-12 text-primary animate-spin relative z-10" />
             </div>
             <div className="text-center space-y-2">
               <h3 className="text-lg font-semibold tracking-tight">Switching Company</h3>
               <p className="text-sm text-muted-foreground">
                 Please wait while we switch to <span className="font-medium text-foreground">{targetCompanyName}</span>...
               </p>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-[400px] border-none shadow-lg">
          <div className="flex flex-col items-center justify-center py-6 gap-4">
             <div className="h-16 w-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
             </div>
             <div className="text-center space-y-2">
               <h3 className="text-xl font-bold tracking-tight text-green-700 dark:text-green-400">Success!</h3>
               <p className="text-muted-foreground">
                 You have successfully switched to <span className="font-medium text-foreground">{targetCompanyName}</span>.
               </p>
             </div>
             <Button 
                className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                   setShowSuccessDialog(false);
                   window.location.href = "/";
                }}
             >
                Continue to Dashboard
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-4 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Menu className="h-5 w-5" />
        </Button>
        
        <div className="flex justify-start">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <div className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-1.5 rounded-lg transition-colors border border-transparent hover:border-border/50 group">
                        <div className="h-8 w-8 items-center justify-center shrink-0 bg-white rounded-md p-0.5 border shadow-sm overflow-hidden">
                            {companyLogoUrl && !logoError ? (
                                <img 
                                    src={companyLogoUrl} 
                                    alt="Company Logo" 
                                    className="h-full w-full object-contain"
                                    onError={() => setLogoError(true)}
                                />
                            ) : (
                                <img 
                                    src="/logo.png" 
                                    alt="Rigel" 
                                    className="h-full w-full object-contain"
                                />
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground truncate max-w-[150px] md:max-w-[200px]">
                                {userProfile?.company_name || "Rigel Business"}
                            </span>
                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors opacity-50" />
                        </div>
                    </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="start">
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Switch Company
                    </div>
                    {availableCompanies.map((company) => (
                        <DropdownMenuItem 
                            key={company.id}
                            onClick={() => handleSwitchCompany(company.id)}
                            className="cursor-pointer gap-2"
                        >
                            <div className="h-6 w-6 rounded border bg-white flex items-center justify-center p-0.5 overflow-hidden">
                                {company.logo_url ? (
                                    <img src={company.logo_url} alt={company.name} className="h-full w-full object-contain" />
                                ) : (
                                    <Building2 className="h-3 w-3 text-muted-foreground" />
                                )}
                            </div>
                            <span className="flex-1 truncate">{company.name}</span>
                            {userProfile?.company_id === company.id && (
                                <Check className="h-4 w-4 text-primary ml-auto" />
                            )}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search transactions, invoices, customers..." />
        <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Recent">
                <CommandItem onSelect={() => { navigate('/transactions'); setSearchOpen(false); }}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    <span>Recent Transactions</span>
                </CommandItem>
                <CommandItem onSelect={() => { navigate('/sales/invoices'); setSearchOpen(false); }}>
                    <CheckCheck className="mr-2 h-4 w-4" />
                    <span>Unpaid Invoices</span>
                </CommandItem>
            </CommandGroup>
            {searchResults.length > 0 && (
                 <CommandGroup heading="Results">
                    {searchResults.map((r, idx) => (
                        <CommandItem key={idx} onSelect={() => { navigate(r.navigateTo); setSearchOpen(false); }}>
                            <span>{r.label}</span>
                            {r.sublabel && <span className="ml-2 text-muted-foreground text-xs">{r.sublabel}</span>}
                        </CommandItem>
                    ))}
                </CommandGroup>
            )}
        </CommandList>
      </CommandDialog>

      <div id="app-header-tools" className="flex items-center gap-3 sm:gap-4">
        <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-full hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => setSearchOpen(true)}>
            <Search className="h-5 w-5" />
        </Button>
        {demoMode && (
          <div className="hidden md:flex items-center gap-2 bg-amber-50 text-amber-700 p-1.5 rounded-md border border-amber-200 shadow-sm">
            <div className="text-xs font-medium">Demo: {demoCompanyName || 'Stella Lumen Pty Ltd'}</div>
          </div>
        )}
        <MessageBox />
        <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-full hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => setNotificationOpen(true)}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background animate-pulse" />
          )}
        </Button>

        <Dialog open={notificationOpen} onOpenChange={setNotificationOpen}>
          <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden rounded-2xl border shadow-2xl">
            <DialogHeader className="p-4 border-b bg-muted/10 flex flex-row items-center justify-between space-y-0">
               <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg font-semibold">Notifications</DialogTitle>
                  {unreadCount > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">{unreadCount} new</Badge>}
               </div>
               {unreadCount > 0 && (
                 <Button variant="ghost" size="sm" onClick={markAllRead} className="h-8 text-xs gap-1.5 text-primary hover:text-primary/80 hover:bg-primary/5">
                   <CheckCheck className="h-3.5 w-3.5" />
                   Mark all as read
                 </Button>
               )}
            </DialogHeader>
            
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
               <div className="px-4 pt-2 border-b bg-muted/5">
                 <TabsList className="w-full justify-start h-9 bg-transparent p-0 gap-4">
                    <TabsTrigger value="all" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs">All Notifications</TabsTrigger>
                    <TabsTrigger value="unread" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-2 text-xs">Unread</TabsTrigger>
                 </TabsList>
               </div>
               
               <TabsContent value="all" className="m-0">
                  <ScrollArea className="h-[400px]">
                     {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center px-4 space-y-3">
                          <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center">
                            <Bell className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                          <div className="space-y-1">
                             <p className="text-sm font-medium text-foreground">No notifications</p>
                             <p className="text-xs text-muted-foreground">You're all caught up! Check back later.</p>
                          </div>
                        </div>
                     ) : (
                        <div className="flex flex-col">
                           {notifications.map(n => (
                              <div key={n.id} className={cn("flex gap-4 p-4 border-b last:border-0 hover:bg-muted/30 transition-colors relative group", !n.read && "bg-primary/5 hover:bg-primary/10")}>
                                 <div className={cn("mt-1 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border", 
                                    n.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                                    n.type === 'error' ? "bg-rose-50 border-rose-100 text-rose-600" : 
                                    n.type === 'warning' ? "bg-amber-50 border-amber-100 text-amber-600" : 
                                    "bg-blue-50 border-blue-100 text-blue-600"
                                 )}>
                                    {n.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : 
                                     n.type === 'error' ? <AlertCircle className="h-4 w-4" /> : 
                                     n.type === 'warning' ? <AlertCircle className="h-4 w-4" /> : 
                                     <Info className="h-4 w-4" />}
                                 </div>
                                 <div className="flex-1 space-y-1">
                                    <div className="flex items-start justify-between gap-2">
                                       <p className={cn("text-sm font-medium leading-none", !n.read && "text-primary")}>{n.title}</p>
                                       <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">{n.description}</p>
                                 </div>
                                 {!n.read && <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-primary" />}
                              </div>
                           ))}
                        </div>
                     )}
                  </ScrollArea>
               </TabsContent>
               
               <TabsContent value="unread" className="m-0">
                  <ScrollArea className="h-[400px]">
                     {notifications.filter(n => !n.read).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center px-4 space-y-3">
                          <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center">
                            <CheckCheck className="h-8 w-8 text-muted-foreground/30" />
                          </div>
                          <div className="space-y-1">
                             <p className="text-sm font-medium text-foreground">No unread notifications</p>
                             <p className="text-xs text-muted-foreground">You've read everything important.</p>
                          </div>
                        </div>
                     ) : (
                        <div className="flex flex-col">
                           {notifications.filter(n => !n.read).map(n => (
                              <div key={n.id} className="flex gap-4 p-4 border-b last:border-0 bg-primary/5 hover:bg-primary/10 transition-colors relative">
                                 <div className={cn("mt-1 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border", 
                                    n.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-600" : 
                                    n.type === 'error' ? "bg-rose-50 border-rose-100 text-rose-600" : 
                                    n.type === 'warning' ? "bg-amber-50 border-amber-100 text-amber-600" : 
                                    "bg-blue-50 border-blue-100 text-blue-600"
                                 )}>
                                    {n.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : 
                                     n.type === 'error' ? <AlertCircle className="h-4 w-4" /> : 
                                     n.type === 'warning' ? <AlertCircle className="h-4 w-4" /> : 
                                     <Info className="h-4 w-4" />}
                                 </div>
                                 <div className="flex-1 space-y-1">
                                    <div className="flex items-start justify-between gap-2">
                                       <p className="text-sm font-medium leading-none text-primary">{n.title}</p>
                                       <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">{n.description}</p>
                                 </div>
                              </div>
                           ))}
                        </div>
                     )}
                  </ScrollArea>
               </TabsContent>
            </Tabs>
            
            {notifications.length > 0 && (
              <div className="p-3 border-t bg-muted/10 flex justify-between items-center">
                <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8">
                   <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                   Clear all
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setNotificationOpen(false)} className="h-8 text-xs">
                   Close
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div className="h-8 w-px bg-border/50 mx-1 hidden sm:block" />

        <UserMenu />
      </div>
    </header>
  );
};
