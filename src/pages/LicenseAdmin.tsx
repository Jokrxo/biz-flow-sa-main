import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Lock, Unlock, Users, Key, RefreshCw, Search, Trash2, Power, PowerOff, Copy, Mail, MessageCircle } from "lucide-react";
import { format } from "date-fns";

// --- Types ---
interface UserProfile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  company_id: string;
  subscription_status: string;
  plan: string;
  role?: string;
  created_at?: string;
}

interface License {
  id: string;
  license_key: string;
  plan_type: string;
  status: string;
  expiry_date: string | null;
  created_at: string;
  assigned_user_id?: string;
}

const MASTER_KEY_HASH = "RIGEL-MASTER-2024"; // Simple protection

export default function LicenseAdmin() {
  const [isLocked, setIsLocked] = useState(true);
  const [accessKey, setAccessKey] = useState("");
  const { toast } = useToast();

  // Check if already unlocked in session
  useEffect(() => {
    if (sessionStorage.getItem("admin_unlocked") === "true") {
      setIsLocked(false);
    }
  }, []);

  const handleUnlock = () => {
    if (accessKey === MASTER_KEY_HASH) {
      setIsLocked(false);
      sessionStorage.setItem("admin_unlocked", "true");
      toast({ title: "Access Granted", description: "Welcome back, Creator." });
    } else {
      toast({ title: "Access Denied", description: "Invalid Master Key.", variant: "destructive" });
    }
  };

  if (isLocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <Card className="w-full max-w-md bg-slate-900 border-slate-800 text-slate-100 shadow-2xl">
          <CardHeader className="text-center space-y-4 pb-2">
            <div className="mx-auto w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30">
              <Lock className="w-8 h-8 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold tracking-tight">Restricted Area</CardTitle>
              <CardDescription className="text-slate-400">Enter Master Key to access System Control</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter Master Key"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                className="bg-slate-950 border-slate-700 text-center text-lg tracking-widest"
              />
            </div>
            <Button 
              onClick={handleUnlock} 
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-6"
            >
              <Unlock className="w-4 h-4 mr-2" />
              Unlock Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <SuperAdminDashboard />
    </DashboardLayout>
  );
}

function SuperAdminDashboard() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // --- License Generation State ---
  const [newPlan, setNewPlan] = useState("Pro");
  const [newExpiry, setNewExpiry] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");

  // --- User Specific License State ---
  const [userLicenseKey, setUserLicenseKey] = useState("");
  const [userLicensePlan, setUserLicensePlan] = useState("Pro");
  const [selectedUserForLicense, setSelectedUserForLicense] = useState<UserProfile | null>(null);
  const [isLicenseDialogOpen, setIsLicenseDialogOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Profiles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (profileError) throw profileError;
      
      // Fetch Roles to merge (since roles are in user_roles)
      // Note: fetching all user_roles might be heavy, but for a "creator" dashboard it's acceptable for now.
      const { data: roles } = await supabase.from('user_roles').select('*');

      const mergedUsers = (profiles || []).map(p => {
        const userRole = roles?.find(r => r.user_id === p.user_id && r.company_id === p.company_id)?.role;
        return { ...p, role: userRole || '—' };
      });

      setUsers(mergedUsers);

      // Fetch Licenses
      const { data: lics, error: licError } = await supabase
        .from('licenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (licError) throw licError;
      setLicenses(lics || []);

    } catch (error: any) {
      toast({ title: "Error loading data", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const generateLicense = async () => {
    try {
      const key = `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      
      const { error } = await supabase.from('licenses').insert({
        license_key: key,
        plan_type: newPlan,
        status: 'UNUSED',
        expiry_date: newExpiry || null
      });

      if (error) throw error;

      setGeneratedKey(key);
      toast({ title: "Success", description: "License key generated" });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const generateLicenseForUser = (user: UserProfile) => {
    setSelectedUserForLicense(user);
    setUserLicenseKey(""); // Reset key
    setUserLicensePlan(user.plan && user.plan !== 'Standard' ? user.plan : 'Pro'); // Default to their plan or Pro
    setIsLicenseDialogOpen(true);
  };

  const confirmGenerateLicenseForUser = async () => {
    if (!selectedUserForLicense) return;

    try {
      const key = `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      
      // Assign to user immediately
      const { error } = await supabase.from('licenses').insert({
        license_key: key,
        plan_type: userLicensePlan,
        status: 'UNUSED',
        assigned_user_id: selectedUserForLicense.user_id
      });

      if (error) throw error;

      setUserLicenseKey(key);
      toast({ title: "License Generated", description: `Key created for ${selectedUserForLicense.first_name}` });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const sendViaEmail = () => {
    if (!selectedUserForLicense || !userLicenseKey) return;
    const subject = encodeURIComponent("Your Rigel Business License Key");
    const body = encodeURIComponent(`Hello ${selectedUserForLicense.first_name},\n\nHere is your new ${userLicensePlan} license key for Rigel Business:\n\n${userLicenseKey}\n\nThank you!`);
    window.open(`mailto:${selectedUserForLicense.email}?subject=${subject}&body=${body}`);
  };

  const sendViaWhatsApp = () => {
    if (!selectedUserForLicense || !userLicenseKey) return;
    const text = encodeURIComponent(`Hello ${selectedUserForLicense.first_name}, here is your new ${userLicensePlan} license key for Rigel Business:\n\n${userLicenseKey}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const toggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ subscription_status: newStatus })
        .eq('user_id', userId);

      if (error) throw error;

      toast({ 
        title: "Status Updated", 
        description: `User has been ${newStatus.toLowerCase()}.`,
        variant: newStatus === 'ACTIVE' ? "default" : "destructive"
      });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const updateUserRole = async (userId: string, companyId: string, newRole: string) => {
    try {
      // Delete existing role for this company
      await supabase.from('user_roles').delete().eq('user_id', userId).eq('company_id', companyId);
      
      // Insert new role
      const { error } = await supabase.from('user_roles').insert({
        user_id: userId,
        company_id: companyId,
        role: newRole as "administrator" | "accountant" | "manager"
      });

      if (error) throw error;
      
      toast({ title: "Role Updated", description: `User role changed to ${newRole}` });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;
    
    try {
      // Delete from user_roles first (foreign key constraint might exist, but usually cascading or independent)
      await supabase.from('user_roles').delete().eq('user_id', userId);
      
      // Delete from profiles
      const { error } = await supabase.from('profiles').delete().eq('user_id', userId);

      if (error) throw error;

      toast({ title: "User Deleted", description: "User profile has been removed." });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const deleteLicense = async (id: string) => {
    if (!confirm("Delete this license?")) return;
    try {
      await supabase.from('licenses').delete().eq('id', id);
      toast({ title: "Deleted", description: "License removed." });
      loadData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.last_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Creator Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400">System-wide control center</p>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="outline" onClick={loadData} disabled={loading}>
             <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
             Refresh Data
           </Button>
           <Button variant="destructive" onClick={() => {
             sessionStorage.removeItem("admin_unlocked");
             window.location.reload();
           }}>
             <Lock className="w-4 h-4 mr-2" />
             Lock
           </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {users.filter(u => u.subscription_status === 'ACTIVE').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Licenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{licenses.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unused Licenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {licenses.filter(l => l.status === 'UNUSED').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="licenses" className="flex items-center gap-2">
            <Key className="w-4 h-4" /> Licenses
          </TabsTrigger>
        </TabsList>

        {/* --- USERS TAB --- */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>User Management</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search users..." 
                    className="pl-8" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Company ID</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No users found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{user.first_name} {user.last_name}</span>
                              <span className="text-xs text-muted-foreground">{user.email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select 
                              defaultValue={user.role || 'accountant'} 
                              onValueChange={(val) => updateUserRole(user.user_id, user.company_id, val as any)}
                            >
                              <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="administrator">Administrator</SelectItem>
                                <SelectItem value="accountant">Accountant</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {user.company_id?.slice(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{user.plan || 'Standard'}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.subscription_status === 'ACTIVE' ? 'default' : 'destructive'}>
                              {user.subscription_status || 'INACTIVE'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => generateLicenseForUser(user)}
                                title="Generate License for User"
                              >
                                <Key className="w-3 h-3" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant={user.subscription_status === 'ACTIVE' ? "destructive" : "default"}
                                onClick={() => toggleUserStatus(user.user_id, user.subscription_status || 'INACTIVE')}
                                className="h-9"
                              >
                                {user.subscription_status === 'ACTIVE' ? (
                                  <><PowerOff className="w-3 h-3 mr-1" /> Deactivate</>
                                ) : (
                                  <><Power className="w-3 h-3 mr-1" /> Activate</>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteUser(user.user_id)}
                                className="h-9 w-9 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                title="Delete User"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- LICENSES TAB --- */}
        <TabsContent value="licenses" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 h-fit">
              <CardHeader>
                <CardTitle>Generate License</CardTitle>
                <CardDescription>Create new keys for users</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Plan Type</Label>
                  <Select value={newPlan} onValueChange={setNewPlan}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Basic">Basic (R250/m)</SelectItem>
                      <SelectItem value="Pro">Pro (R300/m)</SelectItem>
                      <SelectItem value="Enterprise">Enterprise (R350/m)</SelectItem>
                      <SelectItem value="Lifetime">Lifetime (Custom)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Expiry Date (Optional)</Label>
                  <Input 
                    type="date" 
                    value={newExpiry} 
                    onChange={(e) => setNewExpiry(e.target.value)} 
                  />
                </div>
                <Button onClick={generateLicense} className="w-full">
                  Generate Key
                </Button>
                {generatedKey && (
                  <div className="mt-4 p-4 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-muted-foreground mb-1">New License Key:</p>
                    <p className="text-lg font-mono font-bold tracking-wider break-all">{generatedKey}</p>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="mt-2 w-full h-6 text-xs"
                      onClick={() => navigator.clipboard.writeText(generatedKey)}
                    >
                      Copy to Clipboard
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Active Licenses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {licenses.length === 0 ? (
                         <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No licenses found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        licenses.map((lic) => (
                          <TableRow key={lic.id}>
                            <TableCell className="font-mono text-xs">{lic.license_key}</TableCell>
                            <TableCell>{lic.plan_type}</TableCell>
                            <TableCell>
                              <Badge variant={lic.status === 'UNUSED' ? 'secondary' : 'default'}>
                                {lic.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {lic.expiry_date ? format(new Date(lic.expiry_date), 'PP') : 'Never'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => deleteLicense(lic.id)}
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* --- User License Dialog --- */}
      <Dialog open={isLicenseDialogOpen} onOpenChange={setIsLicenseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{userLicenseKey ? "License Generated" : "Generate User License"}</DialogTitle>
            <DialogDescription>
              {userLicenseKey 
                ? `License key created successfully for ${selectedUserForLicense?.first_name}.`
                : `Create a new license key for ${selectedUserForLicense?.first_name}.`
              }
            </DialogDescription>
          </DialogHeader>

          {!userLicenseKey ? (
            <div className="space-y-4 py-4">
               <div className="space-y-2">
                  <Label>Select Plan</Label>
                  <Select value={userLicensePlan} onValueChange={setUserLicensePlan}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Basic">Basic (R250/m)</SelectItem>
                      <SelectItem value="Pro">Pro (R300/m)</SelectItem>
                      <SelectItem value="Enterprise">Enterprise (R350/m)</SelectItem>
                      <SelectItem value="Lifetime">Lifetime (Custom)</SelectItem>
                    </SelectContent>
                  </Select>
               </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 my-2 text-center">
                 <p className="text-xs text-muted-foreground mb-1">New License Key:</p>
                 <p className="text-xl font-mono font-bold tracking-wider break-all text-blue-600 dark:text-blue-400">{userLicenseKey}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={sendViaEmail} className="w-full">
                  <Mail className="w-4 h-4 mr-2" /> Email
                </Button>
                <Button variant="outline" onClick={sendViaWhatsApp} className="w-full">
                  <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between gap-2">
            {!userLicenseKey ? (
              <>
                <Button variant="ghost" onClick={() => setIsLicenseDialogOpen(false)}>Cancel</Button>
                <Button onClick={confirmGenerateLicenseForUser}>Generate Key</Button>
              </>
            ) : (
              <>
                 <Button 
                    variant="secondary" 
                    onClick={() => {
                      navigator.clipboard.writeText(userLicenseKey);
                      toast({ title: "Copied", description: "Key copied to clipboard" });
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  <Button onClick={() => setIsLicenseDialogOpen(false)}>Done</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
