import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { supabase } from "@/integrations/supabase/client";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Settings, CreditCard, LogOut, User, Building2, LifeBuoy, Keyboard, MessageSquarePlus, Sparkles, Palette, Moon, Sun, Laptop, Circle, Shield, Calendar, Key, CheckCircle2 } from "lucide-react";
import { RateUsDialog } from "@/components/Support/RateUsDialog";
import { LicenseDialog } from "@/components/License/LicenseDialog";
import { themes, applyTheme, ThemeKey } from "@/lib/theme-config";

export const UserMenu = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [openAccount, setOpenAccount] = useState(false);
  const [openLicense, setOpenLicense] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ name?: string; email?: string; plan?: string; status?: string; expiry?: string; license_key?: string; users_count?: number }>({});
  const { isAdmin, isAccountant, isManager } = useRoles();
  const [userStatus, setUserStatus] = useState<"online" | "away" | "dnd">(() => {
    if (typeof localStorage !== 'undefined') {
       return (localStorage.getItem('user_status') as any) || 'online';
    }
    return 'online';
  });
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>("original");

  useEffect(() => {
    localStorage.setItem('user_status', userStatus);
  }, [userStatus]);

  useEffect(() => {
    const saved = localStorage.getItem("app_theme") as ThemeKey | null;
    if (saved) setCurrentTheme(saved);
  }, []);

  const handleThemeChange = (key: ThemeKey) => {
    applyTheme(key);
    setCurrentTheme(key);
  };
  
  // Optimistic role display to prevent "User" flicker
  const [cachedRoles, setCachedRoles] = useState<string[]>([]);
  useEffect(() => {
    if (user?.id) {
        try {
            const cached = localStorage.getItem(`rigel_roles_${user.id}`);
            if (cached) setCachedRoles(JSON.parse(cached));
        } catch {}
    }
  }, [user?.id]);
  
  // Use cached roles if real roles are still loading or empty, otherwise use real roles
  const effectiveIsAdmin = isAdmin || cachedRoles.includes('administrator');
  const effectiveIsAccountant = isAccountant || cachedRoles.includes('accountant') || effectiveIsAdmin;
  const effectiveIsManager = isManager || cachedRoles.includes('manager') || effectiveIsAdmin;

  const [rateUsOpen, setRateUsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadCompanyInfo = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, first_name, last_name, email")
        .eq("user_id", user?.id)
        .single();
      if (profile) {
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", profile.company_id)
          .single();
        if (company) setCompanyName(company.name);
        const { count: usersCount } = await supabase
          .from("profiles")
          .select("id", { count: "exact" })
          .eq("company_id", profile.company_id)
          .limit(1);
        setAccountInfo({
          name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || user?.user_metadata?.name,
          email: profile.email || user?.email || "",
          users_count: (usersCount as number) || 1,
        });
      }
    } catch (error) { console.error("Error loading company:", error); }
  }, [user?.id]);
  useEffect(() => { loadCompanyInfo(); }, [loadCompanyInfo]);

  const initials = (accountInfo.name || "U").charAt(0).toUpperCase();

  const rateUsKey = "rigel_rate_us_v1_done";

  const handleLogoutClick = async () => {
    if (loggingOut) return;
    if (!user?.id) {
      logout();
      return;
    }

    try {
      const localDone = typeof localStorage !== "undefined" ? localStorage.getItem(rateUsKey) === "1" : false;
      if (localDone) {
        logout();
        return;
      }
    } catch {}

    setLoggingOut(true);

    try {
      const { data } = await (supabase as any)
        .from("app_rating_responses")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.user_id) {
        try {
          localStorage.setItem(rateUsKey, "1");
        } catch {}
        logout();
        return;
      }
    } catch {
      try {
        const localDone = typeof localStorage !== "undefined" ? localStorage.getItem(rateUsKey) === "1" : false;
        if (localDone) {
          logout();
          return;
        }
      } catch {}
    }

    setRateUsOpen(true);
    setLoggingOut(false);
  };

  const persistRateUsResponse = async (payload: { rating: number | null; comment: string | null }) => {
    if (!user?.id) return;
    try {
      await (supabase as any)
        .from("app_rating_responses")
        .upsert(
          {
            user_id: user.id,
            rating: payload.rating,
            comment: payload.comment,
          },
          { onConflict: "user_id" },
        );
    } catch {}
  };

  const finishLogout = async () => {
    try {
      localStorage.setItem(rateUsKey, "1");
    } catch {}
    logout();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 hover:bg-transparent focus-visible:ring-0">
          <Avatar className="h-9 w-9 border border-border shadow-sm ring-2 ring-transparent hover:ring-primary/20 transition-all">
            <AvatarImage src={user?.user_metadata?.avatar_url} alt={accountInfo.name} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background ${
            userStatus === 'online' ? 'bg-emerald-500' : userStatus === 'away' ? 'bg-amber-500' : 'bg-rose-500'
          }`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden border-border/40 shadow-xl animate-in slide-in-from-top-2 fade-in-20">
        
        {/* Profile Section with Gradient */}
        <div className="relative p-4 bg-gradient-to-br from-primary/10 via-primary/5 to-background border-b border-border/40">
           <div className="flex items-start gap-3">
             <Avatar className="h-12 w-12 border-2 border-background shadow-md">
               <AvatarImage src={user?.user_metadata?.avatar_url} alt={accountInfo.name} />
               <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                 {initials}
               </AvatarFallback>
             </Avatar>
             <div className="flex-1 min-w-0 space-y-1">
               <div className="flex items-center justify-between">
                 <p className="font-semibold text-sm truncate pr-2">
                   {accountInfo.name || "User"}
                 </p>
                 <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-background/50 backdrop-blur-sm border-primary/20 text-primary shadow-none">
                   Pro
                 </Badge>
               </div>
               <p className="text-xs text-muted-foreground truncate">{accountInfo.email}</p>
               <div className="flex flex-wrap gap-1.5 pt-1">
                  {effectiveIsAccountant && <Badge variant="secondary" className="text-[10px] px-1 h-4 rounded-sm font-normal">Accountant</Badge>}
                  {!effectiveIsAccountant && effectiveIsAdmin && <Badge variant="secondary" className="text-[10px] px-1 h-4 rounded-sm font-normal">Admin</Badge>}
                  {!effectiveIsAccountant && !effectiveIsAdmin && effectiveIsManager && <Badge variant="secondary" className="text-[10px] px-1 h-4 rounded-sm font-normal">Manager</Badge>}
               </div>
             </div>
           </div>
           
           {/* Quick Stats / Usage */}
           <div className="mt-4 grid grid-cols-2 gap-2">
             <div className="bg-background/60 backdrop-blur-sm rounded-md p-2 border border-border/50">
               <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">Role</div>
               <div className="text-xs font-semibold">{effectiveIsAdmin ? 'Administrator' : effectiveIsAccountant ? 'Accountant' : 'Manager'}</div>
             </div>
             <div className="bg-background/60 backdrop-blur-sm rounded-md p-2 border border-border/50">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-0.5">Plan Usage</div>
                <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-primary w-[75%] rounded-full" />
                </div>
             </div>
           </div>
        </div>

        <div className="p-1.5">
          
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Circle className={`mr-2 h-4 w-4 ${
                userStatus === 'online' ? 'text-emerald-500 fill-emerald-500' : 
                userStatus === 'away' ? 'text-amber-500 fill-amber-500' : 'text-rose-500 fill-rose-500'
              }`} />
              <span>Status</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={userStatus} onValueChange={(v) => setUserStatus(v as any)}>
                <DropdownMenuRadioItem value="online">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 mr-2" />
                  Online
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="away">
                  <span className="h-2 w-2 rounded-full bg-amber-500 mr-2" />
                  Away
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dnd">
                  <span className="h-2 w-2 rounded-full bg-rose-500 mr-2" />
                  Do Not Disturb
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 h-4 w-4" />
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48 max-h-[300px] overflow-y-auto">
              <DropdownMenuRadioGroup value={currentTheme} onValueChange={(v) => handleThemeChange(v as ThemeKey)}>
                {themes.map(t => (
                  <DropdownMenuRadioItem key={t.key} value={t.key}>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full border" style={{ background: `linear-gradient(135deg, ${t.colors[0]} 50%, ${t.colors[1]} 50%)` }} />
                      {t.name}
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => navigate('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenAccount(true)}>
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Account & Billing</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenLicense(true)}>
            <Shield className="mr-2 h-4 w-4" />
            <span>License</span>
          </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator className="my-0" />

        <div className="p-1.5">
           <DropdownMenuItem>
             <LifeBuoy className="mr-2 h-4 w-4" />
             <span>Help Center</span>
           </DropdownMenuItem>
           <DropdownMenuItem>
             <Keyboard className="mr-2 h-4 w-4" />
             <span>Shortcuts</span>
             <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
           </DropdownMenuItem>
           <DropdownMenuItem onClick={() => setRateUsOpen(true)}>
             <MessageSquarePlus className="mr-2 h-4 w-4" />
             <span>Feedback</span>
           </DropdownMenuItem>
        </div>

        <DropdownMenuSeparator className="my-0" />

        <div className="p-1.5">
          <DropdownMenuItem onClick={handleLogoutClick} className="text-destructive focus:text-destructive focus:bg-destructive/10">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
            <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>

      <RateUsDialog
        open={rateUsOpen}
        onOpenChange={(nextOpen) => {
          setRateUsOpen(nextOpen);
          if (!nextOpen) setLoggingOut(false);
        }}
        onSkip={async () => {
          await persistRateUsResponse({ rating: null, comment: null });
          await finishLogout();
        }}
        onSubmit={async ({ rating, comment }) => {
          await persistRateUsResponse({ rating, comment: comment || null });
          await finishLogout();
        }}
      />

      <LicenseDialog 
        open={openLicense} 
        onOpenChange={setOpenLicense} 
      />

      <Dialog open={openAccount} onOpenChange={setOpenAccount}>
        <DialogContent className="sm:max-w-md">
          <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
            <img src="/logo.png" alt="Rigel Business" className="max-w-[60%] grayscale" />
          </div>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Account Overview
            </DialogTitle>
          </DialogHeader>
          <div className="relative space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Name</div>
                <div className="text-sm font-medium">{accountInfo.name || user?.user_metadata?.name || user?.email}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Email</div>
                <div className="text-sm font-medium truncate" title={accountInfo.email || user?.email}>{accountInfo.email || user?.email}</div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Company</div>
                <div className="text-sm font-medium flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  {companyName || '—'}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Users</div>
                <div className="text-sm font-medium">{accountInfo.users_count || 1}</div>
              </div>
            </div>
            <Separator />
            <div className="bg-muted/30 p-3 rounded-lg border border-border/50 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Plan</span>
                <Badge variant="outline" className="bg-background">{accountInfo.plan || '—'}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <Badge variant={accountInfo.status === 'ACTIVE' ? 'default' : 'secondary'}>{accountInfo.status || 'OPEN'}</Badge>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-mono">{accountInfo.expiry || '—'}</span>
              </div>
            </div>
            <div className="text-xs text-center text-muted-foreground">
              License Key: <span className="font-mono select-all bg-muted px-1 py-0.5 rounded">{(accountInfo.license_key || '').slice(0,4)}-****-****-{(accountInfo.license_key || '').slice(-4)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
};
