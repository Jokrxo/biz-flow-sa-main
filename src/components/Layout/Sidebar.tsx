import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import { Calculator, ChevronDown, ChevronRight, Plus, Search, Bell, Settings, HelpCircle, Check, ChevronsUpDown, LayoutDashboard, Sun, Moon } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface SidebarProps {
  open: boolean;
}

import { navGroups } from "@/config/navigation";

export const Sidebar = ({ open }: SidebarProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { roles } = useRoles();
  const [userProfile, setUserProfile] = useState<{ name: string; role: string; company_name?: string; company_id?: string } | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<any[]>([]);
  const [sidebarTheme, setSidebarTheme] = useState<'dark' | 'light'>('dark');
  
  // Theme configuration helper
  const t = sidebarTheme === 'dark' ? {
    bg: "bg-[#1BA37B]",
    border: "border-[#1BA37B]",
    text: "text-white",
    logoContainer: "bg-white border-white/20",
    activeItem: "bg-white/20 text-white shadow-none",
    inactiveItem: "text-white/80 hover:bg-white/10 hover:text-white",
    footer: "bg-[#1BA37B]",
    footerBorder: "border-white/10",
    icon: "text-white/80 hover:text-white",
    userText: "text-white",
    userSubtext: "text-white/70",
    hoverUser: "hover:bg-white/10",
    dashboardIconActive: "text-white",
    dashboardIconInactive: "text-white/80",
    groupTitleBg: "bg-white/10 border border-white/10 text-white group-hover/label:text-white",
    groupIcon: "text-white/70 group-hover/label:text-white",
    tooltipBg: "bg-[#1BA37B] text-white border-white/20"
  } : {
    bg: "bg-[#f4f4f5]", // slate-100/zinc-100 equivalent
    border: "border-slate-300",
    text: "text-slate-700",
    logoContainer: "bg-white border-slate-300",
    activeItem: "bg-white text-slate-900 border-slate-300 shadow-sm",
    inactiveItem: "text-slate-600 hover:bg-slate-200 hover:text-slate-900",
    footer: "bg-[#f4f4f5]",
    footerBorder: "border-slate-300",
    icon: "text-slate-500 hover:text-slate-800",
    userText: "text-slate-900",
    userSubtext: "text-slate-500",
    hoverUser: "hover:bg-slate-200",
    dashboardIconActive: "text-[#2ca01c]",
    dashboardIconInactive: "text-slate-500",
    groupTitleBg: "bg-white border border-slate-300 text-slate-800 group-hover/label:text-slate-900 shadow-sm",
    groupIcon: "text-indigo-600 group-hover/label:text-indigo-700",
    tooltipBg: "bg-white text-slate-900 border-slate-300"
  };

  // Initialize all groups as collapsed by default as requested
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const initialState: Record<string, boolean> = {};
    navGroups.forEach(group => {
      initialState[group.title] = true; // Collapsed by default
    });
    return initialState;
  });

  const toggleGroup = (title: string) => {
    setCollapsedGroups(prev => {
      // If we are expanding this group (it's currently collapsed)
      if (prev[title]) {
        // Collapse ALL other groups first
        const newState: Record<string, boolean> = {};
        Object.keys(prev).forEach(key => {
          newState[key] = true; // Collapse everything
        });
        // Then expand ONLY the clicked group
        newState[title] = false;
        return newState;
      } else {
        // If we are collapsing this group (it's currently expanded)
        // Just collapse it, others remain collapsed
        return {
          ...prev,
          [title]: true
        };
      }
    });
  };

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
          // Priority: 1. Profile's company 2. First available company 3. Default "Rigel Business"
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
          // Fallback to email if no profile
          // Try to use first available company if possible
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
        // Fallback to email if error
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
    
    try {
        const { error } = await supabase
            .from("profiles")
            .update({ company_id: companyId })
            .eq("user_id", user.id);

        if (error) throw error;

        // Dispatch event to notify other components
        window.dispatchEvent(new Event('company-changed'));
        
        // Invalidate all queries to refresh data without reloading page
        await queryClient.invalidateQueries();
        
        toast.success("Switched company successfully");
        
    } catch (e) {
        console.error("Error switching company:", e);
        toast.error("Failed to switch company");
    }
  };

  return (
    <aside
      id="app-sidebar"
      className={cn(
        "fixed left-0 top-0 z-40 h-screen transition-[width] duration-300 ease-in-out will-change-[width] shadow-xl",
        t.bg, "border-r", t.border,
        open ? "w-64" : "w-16"
      )}
    >
      <div className={cn("flex h-full flex-col", t.text)}>
        {/* Logo Section */}
        <div className={cn("flex flex-col pt-4 pb-2 transition-all duration-300 ease-in-out", open ? "px-0 items-center" : "px-4 items-center")}>
          {open ? (
            <div className="flex flex-col items-center gap-2 animate-in fade-in zoom-in duration-300">
               <div className={cn("relative p-2.5 rounded-xl shadow-lg backdrop-blur-sm transition-colors group", t.logoContainer)}>
                   <img 
                       src="/logo.png" 
                       alt="Rigel" 
                       className="h-20 w-auto object-contain drop-shadow-md"
                   />
                   <Button
                      variant="ghost"
                      size="icon"
                      className={cn("absolute -right-3 -top-3 h-8 w-8 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity z-50", sidebarTheme === 'dark' ? "bg-white text-black hover:bg-gray-200" : "bg-gray-800 text-white hover:bg-gray-700")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSidebarTheme(prev => prev === 'dark' ? 'light' : 'dark');
                      }}
                      title={`Switch to ${sidebarTheme === 'dark' ? 'light' : 'dark'} mode`}
                   >
                      {sidebarTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                   </Button>
               </div>
            </div>
          ) : (
             <div className="flex flex-col items-center gap-2">
               <div className={cn("flex h-10 w-10 items-center justify-center shrink-0 rounded-lg p-1 border", t.logoContainer)}>
                  <img 
                      src="/logo.png" 
                      alt="Rigel" 
                      className="h-full w-full object-contain rounded-md"
                  />
               </div>
               <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8 rounded-full transition-colors", t.icon)}
                  onClick={() => setSidebarTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                  title={`Switch to ${sidebarTheme === 'dark' ? 'light' : 'dark'} mode`}
               >
                  {sidebarTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
               </Button>
             </div>
          )}
        </div>

        {/* Navigation */}
        <TooltipProvider>
          <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto custom-scrollbar mt-1">
            <Link to="/" className="block">
              {open ? (
                <div className="flex items-center justify-between px-3 py-1.5 mt-1 cursor-pointer group/label select-none">
                  <div className="flex items-center flex-1 mr-2">
                    <div className={cn("flex-1 rounded-md px-3 py-1.5 shadow-sm backdrop-blur-sm transition-all duration-300", t.groupTitleBg)}>
                      <h3 className="text-[11px] font-bold uppercase tracking-wider truncate">
                        Dashboard
                      </h3>
                    </div>
                  </div>
                  <div className="h-3 w-3" /> {/* Spacer to match chevron */}
                </div>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full gap-2 transition-all duration-200 relative font-normal border justify-center px-0 h-10 w-10 mx-auto rounded-lg mb-1",
                        sidebarTheme === 'dark' ? "border-white/10" : "border-slate-200",
                        location.pathname === "/"
                          ? cn(t.activeItem, "border-l-4 border-l-[#2ca01c] pl-[9px]")
                          : t.inactiveItem
                      )}
                    >
                      <LayoutDashboard
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                          location.pathname === "/" ? t.dashboardIconActive : t.dashboardIconInactive
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className={t.tooltipBg}>Dashboard</TooltipContent>
                </Tooltip>
              )}
            </Link>
            {navGroups.map((group) => {
              const isCollapsed = collapsedGroups[group.title];
              return (
                <div key={group.title} className="space-y-0.5">
                  {open && group.title !== "Overview" && (
                    <div 
                      className="flex items-center justify-between px-3 py-1.5 mt-1 cursor-pointer group/label select-none"
                      onClick={() => toggleGroup(group.title)}
                    >
                      <div className="flex items-center flex-1 mr-2">
                        <div className={cn("flex-1 rounded-md px-3 py-1.5 shadow-sm backdrop-blur-sm transition-all duration-300", t.groupTitleBg)}>
                          <h3 className="text-[11px] font-bold uppercase tracking-wider truncate">
                            {group.title}
                          </h3>
                        </div>
                      </div>
                      {isCollapsed ? (
                        <ChevronRight className={cn("h-3 w-3 transition-colors", t.icon)} />
                      ) : (
                        <ChevronDown className={cn("h-3 w-3 transition-colors", t.icon)} />
                      )}
                    </div>
                  )}
                  <div className={cn("space-y-0.5 transition-all duration-200", open && isCollapsed && "hidden", open && "px-3")}>
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.href;

                      const button = (
                        <Button
                            variant="ghost"
                            className={cn(
                              "w-full !justify-start gap-2 transition-all duration-200 h-9 relative font-normal rounded-md border",
                              sidebarTheme === 'dark' ? "border-white/10" : "border-slate-200",
                              !open && "justify-center px-0 h-10 w-10 mx-auto rounded-lg mb-1",
                              isActive
                                ? cn(t.activeItem, "border-l-4 border-l-[#2ca01c] pl-[9px]")
                                : cn(t.inactiveItem, "pl-3")
                            )}
                          >
                          <item.icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                              isActive ? t.dashboardIconActive : t.dashboardIconInactive
                            )}
                          />
                          {open && <span className="truncate text-[14px]">{item.label}</span>}
                        </Button>
                      );

                      return (
                        <Link key={item.href} to={item.href} className="block">
                          {open ? (
                            button
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>{button}</TooltipTrigger>
                              <TooltipContent side="right" className={t.tooltipBg}>{item.label}</TooltipContent>
                            </Tooltip>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </TooltipProvider>

        {/* Footer / User Settings */}
        <div className={cn("border-t p-1.5", t.footer, t.footerBorder)}>
           {open && (
             <div className="flex items-center justify-between px-2 py-1">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px]", t.userSubtext)}>Rigel Business © 2026</span>
                  <Dialog>
                    <DialogTrigger asChild>
                      <HelpCircle className={cn("h-3 w-3 cursor-pointer transition-colors", t.icon)} />
                    </DialogTrigger>
                    <DialogContent className="max-w-sm bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                      <DialogHeader>
                        <DialogTitle className="text-center">About Rigel Business</DialogTitle>
                      </DialogHeader>
                      <div className="flex flex-col items-center gap-4 py-4">
                        <div className="h-16 w-16 bg-slate-100 rounded-lg border flex items-center justify-center overflow-hidden shadow-sm">
                           <img src="/logo.png" alt="Rigel" className="h-full w-full object-cover" />
                        </div>
                        <div className="text-center space-y-1">
                          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Rigel Business</h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Next-generation financial management</p>
                          <div className="flex items-center justify-center gap-2 mt-3">
                             <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">v2025.12.04</span>
                          </div>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-4">
                            © {new Date().getFullYear()} Stella Lumen. All rights reserved.
                          </p>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setSidebarTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                    className={cn("h-5 w-5 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors", t.icon)}
                    title={sidebarTheme === 'dark' ? "Switch to Light Sidebar" : "Switch to Dark Sidebar"}
                  >
                    {sidebarTheme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  </button>
                  <Settings className={cn("h-3.5 w-3.5 cursor-pointer transition-colors", t.icon)} />
                </div>
             </div>
           )}
           <div className={cn("flex items-center gap-3 p-1.5 rounded-md cursor-pointer transition-colors", t.hoverUser, !open && "justify-center")}>
            <div className="h-7 w-7 rounded-full bg-[#107c10] flex items-center justify-center text-white font-bold text-[10px]">
              {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : "U"}
            </div>
            {open && (
              <div className="flex-1 min-w-0">
                <p className={cn("text-xs font-medium truncate", t.userText)}>
                  {userProfile?.name || "User"}
                </p>
                <p className={cn("text-[10px] capitalize", t.userSubtext)}>
                  {(roles[0] || userProfile?.role || "User").toString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
