import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { Button } from "@/components/ui/button";
import { Plus, Building2, Mail, User as UserIcon, Shield, Search, UserPlus, Trash2, Edit, History, ScrollText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRoles } from "@/hooks/use-roles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  role?: string; // Role in the current company
}

interface Company {
  id: string;
  name: string;
}

// Mock Activity Data
const MOCK_ACTIVITIES = [
  { id: 1, action: "Login", description: "User logged into the system", date: "2024-03-20 09:30 AM" },
  { id: 2, action: "Invoice Created", description: "Created Invoice #INV-2024-001", date: "2024-03-19 02:15 PM" },
  { id: 3, action: "Profile Updated", description: "Updated contact information", date: "2024-03-18 11:45 AM" },
  { id: 4, action: "Report Generated", description: "Generated Monthly Sales Report", date: "2024-03-15 04:20 PM" },
  { id: 5, action: "Settings Changed", description: "Changed notification preferences", date: "2024-03-10 10:00 AM" },
];

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

export const UserList = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin, isAccountant } = useRoles();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  
  // Assign Company State
  const [adminCompanies, setAdminCompanies] = useState<Company[]>([]);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedRole, setSelectedRole] = useState("accountant");

  // Activity Log State
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  // Invite User State
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("accountant");
  const [inviteLoading, setInviteLoading] = useState(false);

  // Create User State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "accountant",
    modules: [] as string[],
  });

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (!user) return;

      // 1. Get current user's active company from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      if (!profile || !profile.company_id) {
        setUsers([]);
        setLoading(false);
        return;
      }

      setCurrentCompanyId(profile.company_id);

      // 2. Fetch all profiles that belong to this company
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", profile.company_id);

      if (profilesError) throw profilesError;

      // 3. Fetch roles for this company to map to users
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", profile.company_id);

      if (rolesError) throw rolesError;

      // 4. Merge data
      const mappedUsers = profiles?.map(p => ({
        ...p,
        role: userRoles?.find(r => r.user_id === p.id)?.role || 'viewer'
      })) || [];

      setUsers(mappedUsers);

      // 5. Fetch companies where current user is admin (for assignment dialog)
      const { data: myAdminRoles } = await supabase
        .from('user_roles')
        .select('company_id')
        .eq('user_id', user.id)
        .eq('role', 'administrator');

      if (myAdminRoles && myAdminRoles.length > 0) {
        const adminCompanyIds = myAdminRoles.map(r => r.company_id);
        const { data: companies } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', adminCompanyIds);
          
        setAdminCompanies(companies || []);
      }

    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast({
        title: "Error",
        description: "Failed to load users data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const openAssignDialog = (user: Profile) => {
    setSelectedUser(user);
    setSelectedCompanyId("");
    setSelectedRole("accountant");
    setIsAssignOpen(true);
  };

  const openActivityDialog = (user: Profile) => {
    setSelectedUser(user);
    setIsActivityOpen(true);
  };

  const handleAssignCompany = async () => {
    if (!selectedUser || !selectedCompanyId || !selectedRole) return;

    try {
      setAssignLoading(true);

      // Check if already assigned
      const { data: existing } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', selectedUser.id)
        .eq('company_id', selectedCompanyId)
        .single();

      if (existing) {
        toast({
          title: "Already Assigned",
          description: "This user is already assigned to this company.",
          variant: "destructive"
        });
        return;
      }

      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: selectedUser.id,
          company_id: selectedCompanyId,
          role: selectedRole
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Assigned ${selectedUser.first_name} to company successfully.`,
      });

      setIsAssignOpen(false);

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setAssignLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.firstName || !newUser.lastName) {
      toast({ title: "Missing fields", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    if (!currentCompanyId) return;

    try {
      setCreateLoading(true);

      // Create auth user
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

      // Wait for profile to be created by trigger (handle race condition)
      let profileExists = false;
      // Increase wait time to 10 seconds (20 checks * 500ms)
      for (let i = 0; i < 20; i++) {
        const { data: checkProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", authData.user.id)
          .single();
        
        if (checkProfile) {
          profileExists = true;
          break;
        }
        // Wait 500ms before next check
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!profileExists) {
        throw new Error("System timed out waiting for user profile creation. The user account was created, but the profile is missing. Please contact support.");
      }

      // Update profile with company
      // Reverted to update to avoid RLS violation on insert
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ 
          company_id: currentCompanyId,
          first_name: newUser.firstName,
          last_name: newUser.lastName,
          email: newUser.email
        })
        .eq("user_id", authData.user.id);

      if (profileError) throw profileError;

      // Assign role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: authData.user.id,
          company_id: currentCompanyId,
          role: newUser.role,
        });

      if (roleError) throw roleError;

      toast({ title: "Success", description: "User created successfully" });
      setIsCreateOpen(false);
      setNewUser({ email: "", password: "", firstName: "", lastName: "", role: "accountant", modules: [] });
      fetchData();

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail || !inviteRole || !currentCompanyId) return;

    try {
      setInviteLoading(true);

      const token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);

      const { error } = await supabase
        .from('invites')
        .insert({ 
          company_id: currentCompanyId, 
          email: inviteEmail, 
          role: inviteRole, 
          token, 
          expires_at: expires.toISOString() 
        });

      if (error) throw error;

      const link = `${window.location.origin}/signup?invite=${token}`;
      await navigator.clipboard.writeText(link).catch(() => {});

      toast({
        title: "Invite Created",
        description: "Invite link has been copied to your clipboard.",
      });

      setIsInviteOpen(false);
      setInviteEmail("");
      setInviteRole("accountant");
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setInviteLoading(false);
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

  const filteredUsers = users.filter(user => 
    (user.first_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (user.last_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (user.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">User Administration</h2>
          <p className="text-muted-foreground">
            Manage system users and their roles for the current company.
          </p>
        </div>
      </div>
      
      <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-md flex items-start gap-3">
        <div className="mt-0.5">
          <Shield className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">User Management Notice</h4>
          <p className="text-sm mt-1">
            To add or invite new users to the system, please navigate to <strong>Settings</strong> {'>'} <strong>Teams & Roles</strong>.
            This module is for managing existing user assignments and viewing activity logs.
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-md border w-full sm:w-[300px]">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input 
          type="text" 
          placeholder="Search users..." 
          className="flex-1 border-none outline-none text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="border rounded-md overflow-hidden shadow-sm bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#0070ad] text-white sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Joined Date</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    No users found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="group transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border">
                          <AvatarImage src={user.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {(user.first_name?.[0] || user.email?.[0] || 'U').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold text-foreground">
                            {user.first_name} {user.last_name}
                          </div>
                          <div className="text-xs text-muted-foreground hidden sm:block">
                            ID: {user.id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant="secondary" className="capitalize font-normal border-slate-200">
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          title="Assign to another company"
                          onClick={() => openAssignDialog(user)}
                        >
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          title="View Activity Log"
                          onClick={() => openActivityDialog(user)}
                        >
                          <History className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Edit className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Dialog */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
            <DialogDescription>
              Create an invite link for a new user to join the company.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input 
                placeholder="user@example.com" 
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrator">Administrator</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInviteUser} disabled={inviteLoading || !inviteEmail}>
              {inviteLoading ? "Creating Invite..." : "Create Invite Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new user account and assign them to the current company.
            </DialogDescription>
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

            <Button onClick={handleCreateUser} className="w-full bg-gradient-primary h-11 text-base shadow-lg" disabled={createLoading}>
              {createLoading ? "Creating..." : "Create User Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Company Dialog */}
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Company</DialogTitle>
            <DialogDescription>
              Assign <strong>{selectedUser?.first_name} {selectedUser?.last_name}</strong> to another company you manage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Company</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {adminCompanies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrator">Administrator</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignCompany} disabled={assignLoading || !selectedCompanyId}>
              {assignLoading ? "Assigning..." : "Assign Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Activity Dialog */}
      <Dialog open={isActivityOpen} onOpenChange={setIsActivityOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>User Activity Log</DialogTitle>
            <DialogDescription>
              Recent activity for <strong>{selectedUser?.first_name} {selectedUser?.last_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="border rounded-md mt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_ACTIVITIES.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell className="font-medium">{activity.action}</TableCell>
                    <TableCell>{activity.description}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">{activity.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsActivityOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
