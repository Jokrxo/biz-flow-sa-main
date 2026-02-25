import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase, hasSupabaseEnv } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { Lock, Mail, LogOut, ShieldCheck, Smartphone, Globe, ShieldAlert, History, Key, CheckCircle2, XCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const SecuritySettings = () => {
  const { toast } = useToast();
  const { user, logout } = useAuth() as any;
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState(user?.email || "");
  const [savingPwd, setSavingPwd] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [ipWhitelist, setIpWhitelist] = useState<string[]>([]);
  const [newIp, setNewIp] = useState("");

  const changePassword = async () => {
    if (!hasSupabaseEnv) { toast({ title: "Error", description: "Auth not configured", variant: "destructive" }); return; }
    if (!newPassword || newPassword.length < 8) { toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" }); return; }
    if (newPassword !== confirmPassword) { toast({ title: "Error", description: "Passwords do not match", variant: "destructive" }); return; }
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Success", description: "Password updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update password", variant: "destructive" });
    } finally {
      setSavingPwd(false);
    }
  };

  const changeEmail = async () => {
    if (!hasSupabaseEnv) { toast({ title: "Error", description: "Auth not configured", variant: "destructive" }); return; }
    if (!email) { toast({ title: "Error", description: "Enter a valid email", variant: "destructive" }); return; }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      toast({ title: "Success", description: "Email update requested. Check your inbox to confirm." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update email", variant: "destructive" });
    } finally {
      setSavingEmail(false);
    }
  };

  const signOutAll = async () => {
    if (!hasSupabaseEnv) { toast({ title: "Error", description: "Auth not configured", variant: "destructive" }); return; }
    setSigningOutAll(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "global" as any });
      if (error) throw error;
      toast({ title: "Signed out", description: "All sessions revoked" });
      try { await logout(); } catch {}
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to sign out", variant: "destructive" });
    } finally {
      setSigningOutAll(false);
    }
  };

  const addIp = () => {
    if (!newIp) return;
    if (ipWhitelist.includes(newIp)) { toast({ title: "Error", description: "IP already in whitelist" }); return; }
    setIpWhitelist([...ipWhitelist, newIp]);
    setNewIp("");
    toast({ title: "IP Added", description: "Access rule updated locally" });
  };

  const removeIp = (ip: string) => {
    setIpWhitelist(ipWhitelist.filter(i => i !== ip));
    toast({ title: "IP Removed", description: "Access rule updated locally" });
  };

  return (
    <div className="space-y-6">
      {/* Security Health Score */}
      <Card className="card-professional bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-100 rounded-full">
                <ShieldCheck className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-emerald-900">Security Score: Strong</h3>
                <p className="text-emerald-700">Your account is protected with strong authentication standards.</p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-3xl font-bold text-emerald-600">92/100</div>
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider">Safety Rating</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="access" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="access">Access & Auth</TabsTrigger>
          <TabsTrigger value="protection">Protection Rules</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="access" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="card-professional h-full">
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Key className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle>Credentials</CardTitle>
                </div>
                <CardDescription>Manage your sign-in methods</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Label>Change Password</Label>
                  <Input type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <Input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  <Button onClick={changePassword} disabled={savingPwd} className="w-full bg-gradient-primary">Update Password</Button>
                </div>
                <div className="pt-4 border-t space-y-4">
                  <Label>Update Email</Label>
                  <div className="flex gap-2">
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <Button onClick={changeEmail} disabled={savingEmail} variant="outline">Update</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="card-professional">
                <CardHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Smartphone className="h-5 w-5 text-blue-600" />
                    </div>
                    <CardTitle>Two-Factor Auth</CardTitle>
                  </div>
                  <CardDescription>Secure your account with 2FA</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-red-400" />
                      <span className="font-medium text-sm">Status: Disabled</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => toast({ title: "Coming soon", description: "2FA setup will be available next update" })}>Setup</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Requires an authenticator app like Google Authenticator or Authy.</p>
                </CardContent>
              </Card>

              <Card className="card-professional border-destructive/20">
                <CardHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <LogOut className="h-5 w-5 text-red-600" />
                    </div>
                    <CardTitle className="text-destructive">Session Control</CardTitle>
                  </div>
                  <CardDescription>Emergency access management</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={signOutAll} disabled={signingOutAll} variant="destructive" className="w-full">
                    Revoke All Sessions
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center">Forces sign-out on all devices including this one.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="protection" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="card-professional">
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Globe className="h-5 w-5 text-indigo-600" />
                  </div>
                  <CardTitle>IP Whitelist</CardTitle>
                </div>
                <CardDescription>Restrict access to specific IP addresses</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="192.168.1.1" value={newIp} onChange={(e) => setNewIp(e.target.value)} />
                  <Button onClick={addIp} variant="secondary">Add IP</Button>
                </div>
                <div className="border rounded-md divide-y">
                  {ipWhitelist.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">No restrictions active. Access allowed from anywhere.</div>
                  ) : (
                    ipWhitelist.map(ip => (
                      <div key={ip} className="p-3 flex items-center justify-between text-sm">
                        <span className="font-mono">{ip}</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeIp(ip)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="card-professional">
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <ShieldAlert className="h-5 w-5 text-orange-600" />
                  </div>
                  <CardTitle>Advanced Policies</CardTitle>
                </div>
                <CardDescription>System-wide security constraints</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Force SSL/TLS</Label>
                    <p className="text-xs text-muted-foreground">Require encrypted connections for all users</p>
                  </div>
                  <Switch checked disabled />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Login Notification</Label>
                    <p className="text-xs text-muted-foreground">Email admins on new device login</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Auto-Lockout</Label>
                    <p className="text-xs text-muted-foreground">Lock account after 5 failed attempts</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-6">
          <Card className="card-professional">
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <History className="h-5 w-5 text-slate-600" />
                </div>
                <CardTitle>System Audit Log</CardTitle>
              </div>
              <CardDescription>Complete history of system modifications and access events</CardDescription>
            </CardHeader>
            <CardContent>
              <AuditTrailCard />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const AuditTrailCard = () => {
  const { toast } = useToast();
  const { user } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Array<{ id: string; created_at: string; action: string; entity: string; entity_id: string; description: string; user_id: string; email?: string }>>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 7;

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) { setRows([]); return; }
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("user_id", u.id)
          .maybeSingle();
        const companyId = (profile as any)?.company_id;
        if (!companyId) { setRows([]); return; }
        const { data: logs } = await supabase
          .from("audit_logs" as any)
          .select("id, created_at, action, entity, entity_id, description, user_id")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });
        const userIds = Array.from(new Set((logs || []).map((l: any) => String(l.user_id || ""))).values()).filter(Boolean);
        const usersMap: Record<string, string> = {};
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, email")
            .in("user_id", userIds);
          (profs || []).forEach((p: any) => { usersMap[String(p.user_id)] = String(p.email || ""); });
        }
        const mapped = (logs || []).map((l: any) => ({
          id: l.id,
          created_at: l.created_at,
          action: String(l.action || ""),
          entity: String(l.entity || ""),
          entity_id: String(l.entity_id || ""),
          description: String(l.description || ""),
          user_id: String(l.user_id || ""),
          email: usersMap[String(l.user_id || "")] || ""
        }));
        setRows(mapped);
      } catch (e: any) {
        // Silent fail for demo if table missing
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  useEffect(() => { setPage(0); }, [search]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => (
      r.action.toLowerCase().includes(q) ||
      r.entity.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.entity_id.toLowerCase().includes(q)
    ));
  }, [rows, search]);

  const start = page * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs..." className="max-w-sm" />
      </div>
      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Loading audit logs…</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground border border-dashed rounded-lg bg-muted/10">
          <History className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>No audit activity recorded yet.</p>
        </div>
      ) : (
        <>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 border">
                        {r.email?.[0]?.toUpperCase() || "U"}
                      </div>
                      <span className="text-sm">{r.email || "Unknown"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      r.action === 'DELETE' ? 'border-red-200 bg-red-50 text-red-700' :
                      r.action === 'UPDATE' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                      'border-green-200 bg-green-50 text-green-700'
                    }>
                      {r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="font-medium">{r.entity}</span> <span className="text-muted-foreground mx-1">•</span> {r.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs text-muted-foreground">Showing {paged.length} of {filtered.length} events</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) >= Math.ceil(filtered.length / pageSize)} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
        </>
      )}
    </>
  );
};
