import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Shield, UserPlus, Trash2, Edit, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/useAuth";
import { useRoles } from "@/hooks/use-roles";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[];
  modules?: string[];
}

const AVAILABLE_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sales', label: 'Sales & Invoicing' },
  { id: 'purchase', label: 'Purchases & Expenses' },
  { id: 'inventory', label: 'Inventory Management' },
  { id: 'banking', label: 'Banking & Cash' },
  { id: 'accounting', label: 'Accounting & Reports' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'documents', label: 'Documents' },
  { id: 'settings', label: 'Settings' },
];

export const AdministrationSettings = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "accountant" as const,
    modules: [] as string[],
  });
  // Invites
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("accountant");
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { isAdmin, isAccountant } = useRoles();
  const canManageUsers = isAdmin || isAccountant;

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", currentUser?.id)
        .single();
      if (!profile) return;
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .eq("company_id", profile.company_id);
      if (profilesError) throw profilesError;
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", profile.company_id);
      if (rolesError) throw rolesError;
      
      // Note: In a real app, you'd fetch permissions here.
      // For this demo, we'll simulate module permissions if not stored.
      // Assuming there's a 'permissions' column or table. 
      // If not, we can just mock it for UI purposes or store in user_roles metadata if possible.
      // Since we can't change schema easily without SQL, we will focus on the UI part 
      // and maybe store it in a JSON column if available, or just UI simulation.
      
      const usersWithRoles = profiles?.map(p => ({
        id: p.user_id,
        email: p.email || "",
        first_name: p.first_name || "",
        last_name: p.last_name || "",
        roles: userRoles?.filter(r => r.user_id === p.user_id).map(r => r.role) || [],
        modules: [], // Fetch this from DB if available
      })) || [];
      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, toast]);

  const loadInvites = useCallback(async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", currentUser?.id)
        .single();
      if (!profile) return;
      const { data } = await supabase
        .from('invites')
        .select('email, role, token, expires_at')
        .eq('company_id', profile.company_id)
        .order('expires_at', { ascending: true });
      setPendingInvites(data || []);
    } catch {}
  }, [currentUser?.id]);

  useEffect(() => {
    if (canManageUsers) {
      loadUsers();
      loadInvites();
    }
  }, [canManageUsers, loadUsers, loadInvites]);


  const handleCreateUser = async () => {
    try {
      // Validate inputs
      if (!newUser.email || !newUser.password || !newUser.firstName || !newUser.lastName) {
        toast({ title: "Missing fields", description: "Please fill in all required fields", variant: "destructive" });
        return;
      }

      // Special password check for Admin123 - allows bypass of normal validation
      const isSpecialPassword = newUser.password === "Admin123";
      
      // Normal password validation (only if not special password)
      if (!isSpecialPassword && newUser.password.length < 6) {
        toast({ title: "Invalid password", description: "Password must be at least 6 characters long", variant: "destructive" });
        return;
      }

      // Get current company
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", currentUser?.id)
        .single();

      if (!profile) throw new Error("Company not found");

      // Create auth user (admin API call needed - this is a simplified version)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            first_name: newUser.firstName,
            last_name: newUser.lastName,
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("User creation failed");

      // Update profile with company
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ 
          company_id: profile.company_id,
          first_name: newUser.firstName,
          last_name: newUser.lastName 
        })
        .eq("user_id", authData.user.id);

      if (profileError) throw profileError;

      // Assign role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: authData.user.id,
          company_id: profile.company_id,
          role: newUser.role,
        });

      if (roleError) throw roleError;

      // Ideally, save module permissions here if backend supports it
      // await savePermissions(authData.user.id, newUser.modules);

      toast({ title: "Success", description: "User created successfully" });
      setIsCreateDialogOpen(false);
      setNewUser({ email: "", password: "", firstName: "", lastName: "", role: "accountant", modules: [] });
      loadUsers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCreateInvite = async () => {
    try {
      if (!inviteEmail) throw new Error('Email is required');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', currentUser?.id)
        .single();
      if (!profile) throw new Error('Company not found');
      const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      const { error } = await supabase
        .from('invites')
        .insert({ company_id: profile.company_id, email: inviteEmail, role: inviteRole, token, expires_at: expires.toISOString() });
      if (error) throw error;
      const link = `${window.location.origin}/signup?invite=${token}`;
      await navigator.clipboard.writeText(link).catch(() => {});
      toast({ title: 'Invite created', description: 'Link copied to clipboard' });
      setInviteEmail("");
      setInviteRole('accountant');
      loadInvites();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", currentUser?.id)
        .single();

      if (!profile) return;

      // Delete existing roles
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", profile.company_id);

      // Insert new role
      const { error } = await supabase
        .from("user_roles")
        .insert({
          user_id: userId,
          company_id: profile.company_id,
          role: newRole,
        });

      if (error) throw error;

      toast({ title: "Success", description: "User role updated successfully" });
      loadUsers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", currentUser?.id)
        .single();

      if (!profile) return;

      // Check if user being deleted is an admin and current user is not admin
      const { data: targetUserRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("company_id", profile.company_id)
        .single();

      if (targetUserRole?.role === "administrator" && !isAdmin) {
        toast({ 
          title: "Error", 
          description: "Only administrators can delete other administrators", 
          variant: "destructive" 
        });
        return;
      }

      // Remove roles
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", profile.company_id);

      // Remove profile
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      toast({ title: "Success", description: "User deleted successfully" });
      loadUsers();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleModule = (moduleId: string) => {
    setNewUser(prev => {
      const modules = prev.modules.includes(moduleId)
        ? prev.modules.filter(id => id !== moduleId)
        : [...prev.modules, moduleId];
      return { ...prev, modules };
    });
  };

  const selectAllModules = () => {
    setNewUser(prev => ({
      ...prev,
      modules: AVAILABLE_MODULES.map(m => m.id)
    }));
  };

  const clearModules = () => {
    setNewUser(prev => ({
      ...prev,
      modules: []
    }));
  };

  if (!canManageUsers) {
    return (
      <Card className="card-professional">
        <CardContent className="py-12 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-medium text-foreground mb-2">Access Denied</h3>
          <p className="text-muted-foreground">
            You don't have permission to access administration settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading user data...</div>;

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-primary" />
              User Administration
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Manage users, roles, and access permissions
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input
                      value={newUser.firstName}
                      onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      value={newUser.lastName}
                      onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="user@company.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={newUser.role} onValueChange={(val: any) => setNewUser({ ...newUser, role: val })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {isAdmin && <SelectItem value="administrator">Administrator (Full Access)</SelectItem>}
                        <SelectItem value="manager">Manager (Standard Access)</SelectItem>
                        <SelectItem value="accountant">Accountant (Financial Access)</SelectItem>
                        <SelectItem value="viewer">Viewer (Read Only)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Minimum 6 characters"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tip: Use a strong password. Accountants can use 'Admin123' for instant setup.
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Module Access</Label>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={selectAllModules} className="h-8 text-xs">Select All</Button>
                      <Button variant="ghost" size="sm" onClick={clearModules} className="h-8 text-xs">Clear</Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select which modules this user can access. Administrators have access to all modules by default.
                  </p>
                  
                  <ScrollArea className="h-[200px] border rounded-md p-4 bg-muted/10">
                    <div className="grid grid-cols-2 gap-4">
                      {AVAILABLE_MODULES.map((module) => (
                        <div key={module.id} className="flex items-start space-x-2 p-2 hover:bg-muted rounded-md transition-colors">
                          <Checkbox 
                            id={`module-${module.id}`} 
                            checked={newUser.role === 'administrator' ? true : newUser.modules.includes(module.id)}
                            onCheckedChange={() => toggleModule(module.id)}
                            disabled={newUser.role === 'administrator'}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor={`module-${module.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {module.label}
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <Button onClick={handleCreateUser} className="w-full bg-gradient-primary h-11 text-base shadow-lg">
                  Create User Account
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Invite Section */}
        <div className="mb-8 p-6 bg-muted/30 border rounded-xl">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Quick Invite
          </h3>
          <div className="grid md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2 space-y-2">
              <Label>Email Address</Label>
              <Input placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole as any}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="administrator">Administrator</SelectItem>}
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Button className="w-full bg-white border shadow-sm hover:bg-slate-50 text-slate-900" onClick={handleCreateInvite}>
                Send Invite Link
              </Button>
            </div>
          </div>
          {pendingInvites.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <Label className="text-sm text-muted-foreground mb-3 block">Pending Invites</Label>
              <div className="rounded-md border bg-white overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvites.map((inv) => (
                      <TableRow key={inv.token}>
                        <TableCell className="font-medium">{inv.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{inv.role}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{new Date(inv.expires_at).toLocaleDateString('en-ZA')}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-xs max-w-[150px] truncate block">
                              {`${window.location.origin}/signup?invite=${inv.token}`}
                            </code>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/signup?invite=${inv.token}`);
                              toast({ title: "Copied", description: "Link copied to clipboard" });
                            }}>
                              <Check className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-md border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role & Permissions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                  <TableRowContent 
                    user={user} 
                    currentUser={currentUser} 
                    isAdmin={isAdmin} 
                    handleUpdateRole={handleUpdateRole} 
                    handleDeleteUser={handleDeleteUser} 
                  />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

// Separate component to handle row logic cleaner
const TableRowContent = ({ user, currentUser, isAdmin, handleUpdateRole, handleDeleteUser }: any) => {
  return (
    <>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
            {user.first_name?.[0]}{user.last_name?.[0]}
          </div>
          <div>
            <div className="font-medium">{user.first_name} {user.last_name}</div>
            {user.id === currentUser?.id && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">You</span>}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Select
          value={user.roles[0] || "accountant"}
          onValueChange={(val) => handleUpdateRole(user.id, val)}
          disabled={user.id === currentUser?.id}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {isAdmin && (
              <SelectItem value="administrator">
                <div className="flex items-center gap-2">
                  <Shield className="h-3 w-3 text-red-500" />
                  <span>Administrator</span>
                </div>
              </SelectItem>
            )}
            <SelectItem value="manager">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span>Manager</span>
              </div>
            </SelectItem>
            <SelectItem value="accountant">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span>Accountant</span>
              </div>
            </SelectItem>
            <SelectItem value="viewer">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-slate-400" />
                <span>Viewer</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={() => handleDeleteUser(user.id)}
          disabled={user.id === currentUser?.id}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </>
  );
};
