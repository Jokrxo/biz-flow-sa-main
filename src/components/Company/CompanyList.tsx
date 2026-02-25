import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/useAuth";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Building2, Globe, Phone, Mail, FileText, Check, Eye, Users, UserPlus, Lock, AlertTriangle, Activity, History as HistoryIcon, LogIn, Settings, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useQueryClient } from "@tanstack/react-query";

interface Company {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_number: string | null;
  vat_number: string | null;
  business_type: string | null;
  default_currency: string | null;
  logo_url: string | null;
  created_at: string;
  creator_name?: string;
}

interface TeamMember {
  user_id: string;
  role: Role;
  profile?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
}

type Role = 'administrator' | 'accountant' | 'manager';

  const formSchema = z.object({
  name: z.string().min(2, "Company name must be at least 2 characters"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  tax_number: z.string().optional(),
  vat_number: z.string().optional(),
  is_vat_registered: z.string().optional(),
  business_type: z.string().optional(),
  default_currency: z.string().optional(),
  fiscal_year_start: z.string().optional(),
  fiscal_year: z.string().optional(),
});

import { FinancialHealthInsight } from "@/components/Dashboard/FinancialHealthInsight";

export const CompanyList = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  
  // Details Modal State
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  // Assign Accountant/User State
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [assignRole, setAssignRole] = useState<Role>("accountant");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Deactivate State
  // const [deactivateOpen, setDeactivateOpen] = useState(false);
  // const [companyToDeactivate, setCompanyToDeactivate] = useState<Company | null>(null);
  // const [deactivateReason, setDeactivateReason] = useState("");
  // const [isDeactivating, setIsDeactivating] = useState(false);
  // const [attachedFile, setAttachedFile] = useState<File | null>(null);

  // Success/Error Message State
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Delete State (Legacy/Admin only)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
      tax_number: "",
      vat_number: "",
      is_vat_registered: "no",
      business_type: "pty_ltd",
      default_currency: "ZAR",
      fiscal_year_start: "3", // Default to March (standard SA tax year start)
      fiscal_year: new Date().getFullYear().toString(),
    },
  });

  const isVatRegistered = form.watch("is_vat_registered");

  useEffect(() => {
    if (user) {
      fetchCompanies();
      checkCurrentCompany();
    }
  }, [user]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Companies first
      const { data: companiesData, error: companiesError } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });

      if (companiesError) throw companiesError;
      
      if (!companiesData || companiesData.length === 0) {
        setCompanies([]);
        setLoading(false);
        return;
      }

      const companyIds = companiesData.map((c: any) => c.id);

      // 2. Fetch Administrator Roles for these companies manually to avoid join errors
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("company_id, user_id, role")
        .in("company_id", companyIds)
        .eq("role", "administrator");

      if (rolesError) {
        console.warn("Error fetching roles:", rolesError);
        // Continue without creator names if roles fail
      }

      // 3. Fetch Profiles for the found admins
      const userIds = [...new Set((rolesData || []).map((r: any) => r.user_id))];
      let profilesMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", userIds);
          
        if (profilesError) {
           console.warn("Error fetching profiles:", profilesError);
        } else {
           profilesData?.forEach((p: any) => {
             profilesMap[p.user_id] = p;
           });
        }
      }

      // 4. Merge data
      const enhancedCompanies = companiesData.map((company: any) => {
         // Find an admin for this company
         const adminRole = rolesData?.find((r: any) => r.company_id === company.id);
         const profile = adminRole ? profilesMap[adminRole.user_id] : null;
         
         const creatorName = profile 
           ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email 
           : "Unknown";
         
         return { ...company, creator_name: creatorName };
      });

      setCompanies(enhancedCompanies);
    } catch (error: any) {
      console.error("Error fetching companies:", error);
      toast({
        title: "Error",
        description: "Failed to load companies. " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkCurrentCompany = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    
    if (data) {
      setCurrentCompanyId(data.company_id);
    }
  };

  const fetchTeamMembers = async (companyId: string) => {
    try {
      setTeamLoading(true);
      
      // 1. Fetch Roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", companyId);

      if (rolesError) throw rolesError;
      
      if (!rolesData || rolesData.length === 0) {
        setTeamMembers([]);
        return;
      }

      // 2. Fetch Profiles
      const userIds = rolesData.map((r: any) => r.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;
      
      const profilesMap = (profilesData || []).reduce((acc: any, p: any) => {
        acc[p.user_id] = p;
        return acc;
      }, {});

      // 3. Merge
      const members = rolesData.map((item: any) => ({
        user_id: item.user_id,
        role: item.role,
        profile: profilesMap[item.user_id]
      }));

      setTeamMembers(members);
    } catch (error) {
      console.error("Error fetching team:", error);
    } finally {
      setTeamLoading(false);
    }
  };

  const handleViewDetails = (company: Company) => {
    setSelectedCompany(company);
    fetchTeamMembers(company.id);
    setDetailsOpen(true);
  };

  const generateUuid = () => {
    try { return crypto.randomUUID(); } catch { /* fallback */ }
    const tpl = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return tpl.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      if (!user) return;

      const newCompanyId = generateUuid();
      const cleanName = values.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 3);
      const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
      const autoCode = `COMP-${cleanName}${randomSuffix}`;

      // 1. Insert Company
      const { error: companyError } = await supabase.from("companies").insert({
        id: newCompanyId,
        name: values.name,
        code: autoCode,
        address: values.address || null,
        phone: values.phone || null,
        email: values.email || null,
        tax_number: values.tax_number || null,
        vat_number: (values.is_vat_registered === 'yes' && values.vat_number) ? values.vat_number : null,
        business_type: values.business_type || 'pty_ltd',
        default_currency: values.default_currency || 'ZAR',
      });

      if (companyError) throw companyError;

      // 1.5 Insert App Settings (Fiscal Year)
      await supabase.from("app_settings").insert({
        company_id: newCompanyId,
        fiscal_year_start: parseInt(values.fiscal_year_start || '3'),
        fiscal_default_year: parseInt(values.fiscal_year || new Date().getFullYear().toString()),
        tax_period_frequency: 'monthly' // Default
      });

      // 2. Link User to Company
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: user.id,
        company_id: newCompanyId,
        role: 'administrator'
      });

      if (roleError) {
        throw new Error("Failed to assign permissions: " + roleError.message);
      }

      setSuccessMessage(`Company "${values.name}" created with code ${autoCode}`);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setIsDialogOpen(false);
      }, 2000);
      
      form.reset();
      
      setTimeout(() => {
        fetchCompanies();
      }, 500);
      
    } catch (error: any) {
      console.error("Error creating company:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSwitchCompany = async (companyId: string) => {
    try {
      if (!user) return;
      
      const targetCompany = companies.find(c => c.id === companyId);
      if (!targetCompany) return;

      const { error } = await supabase
        .from("profiles")
        .update({ company_id: companyId })
        .eq("user_id", user.id);

      if (error) throw error;

      setCurrentCompanyId(companyId);
      
      // Dispatch event to update Sidebar and other listeners
      window.dispatchEvent(new Event('company-changed'));
      
      // Clear roles cache and invalidate query to ensure permissions update
      try {
        localStorage.removeItem(`rigel_roles_${user.id}`);
        queryClient.invalidateQueries({ queryKey: ['userRoles'] });
      } catch (e) {
        console.error("Error clearing role cache", e);
      }

      // Force refresh of financial reports cache if it exists for the new company
      // This ensures we don't show stale data if they switch back and forth quickly
      try {
        // Optional: clear old cache or just let it reload naturally
        localStorage.removeItem(`rigel_fin_report_${companyId}_${new Date().getFullYear()}-01-01_${new Date().toISOString().split('T')[0]}`);
      } catch {}

      toast({
        title: "Welcome to " + targetCompany.name,
        description: (
          <div className="flex flex-col gap-1">
            <span>Successfully switched workspace.</span>
            <span className="text-xs text-muted-foreground">All modules are now synced to this company.</span>
          </div>
        ),
        duration: 4000,
        className: "bg-gradient-to-r from-emerald-50 to-white border-emerald-100",
      });

      // Show the center success box
      setSuccessMessage(`Welcome to ${targetCompany.name}`);
      setIsSuccess(true);
      
      // Auto close after 1.5 seconds
      setTimeout(() => {
        setIsSuccess(false);
      }, 1500);
      
      // No reload - UI stays active
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to switch company: " + error.message,
        variant: "destructive",
      });
    }
  };

  const handleAssignUser = async () => {
    if (!assignEmail || !selectedCompany) return;
    setAssignError(null);
    
    try {
      setAssignLoading(true);
      
      // 1. Validate: Find user by email (Strict check against profiles)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .eq('email', assignEmail)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        setAssignError("User not found in the system. Please ensure the email is correct and the user has registered.");
        return;
      }

      // 2. Check if already assigned
      const { data: existingRole, error: roleError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', profileData.user_id)
        .eq('company_id', selectedCompany.id)
        .maybeSingle();

      if (roleError) throw roleError;

      if (existingRole) {
        setAssignError(`User is already a member of this company.`);
        return;
      }

      // 3. Assign Role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({
          user_id: profileData.user_id,
          company_id: selectedCompany.id,
          role: assignRole
        });

      if (insertError) throw insertError;

      toast({
        title: "Success",
        description: `Assigned ${assignRole} role to ${profileData.first_name || assignEmail}`,
      });

      setIsAssignDialogOpen(false);
      setAssignEmail("");
      // Refresh team list
      fetchTeamMembers(selectedCompany.id);

    } catch (error: any) {
      console.error("Error assigning user:", error);
      setAssignError(error.message);
    } finally {
      setAssignLoading(false);
    }
  };

  const handleDeactivateClick = (company: Company) => {
    handleDeleteClick(company);
  };

  const handleDeleteClick = (company: Company) => {
    setCompanyToDelete(company);
    setDeletePassword("");
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteCompany = async () => {
    if (!companyToDelete || !deletePassword) return;
    if (!user || !user.email) return;

    try {
      setDeleteLoading(true);

      // Verify password by attempting to sign in (re-auth)
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: deletePassword,
      });

      if (authError) {
        throw new Error("Incorrect password. Access denied.");
      }

      // Proceed with delete
      const { error: deleteError } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyToDelete.id);

      if (deleteError) throw deleteError;

      toast({
        title: "Company Deleted",
        description: `${companyToDelete.name} has been successfully removed.`,
      });

      setIsDeleteDialogOpen(false);
      fetchCompanies();

      // If active company was deleted, reload to force state update
      if (currentCompanyId === companyToDelete.id) {
        window.location.reload();
      }

    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedCompanies = companies.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(companies.length / itemsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Companies</h2>
          <p className="text-muted-foreground">
            Manage your organizations.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary">
              <Plus className="mr-2 h-4 w-4" /> Add Company
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader className="flex flex-col items-center justify-center pb-2 border-b">
              <div className="h-16 w-16 bg-white rounded-lg p-1 shadow-sm border mb-3 flex items-center justify-center">
                 <img src="/logo.png" alt="Rigel" className="h-full w-full object-contain" />
              </div>
              <DialogTitle className="text-xl">Add New Company</DialogTitle>
              <DialogDescription className="text-center">
                Create a new company entity. Code will be auto-generated.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Company Name <span className="text-destructive">*</span></FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="contact@acme.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 234 567 890" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Business St, City" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="tax_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Number</FormLabel>
                        <FormControl>
                          <Input placeholder="TAX-123456" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="is_vat_registered"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VAT Registered?</FormLabel>
                        <Select 
                          onValueChange={(val) => {
                            field.onChange(val);
                            if (val === "no") {
                              form.setValue("vat_number", "");
                            }
                          }} 
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="vat_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VAT Number</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              placeholder={isVatRegistered === "yes" ? "VAT-987654" : "Not Registered"} 
                              {...field} 
                              disabled={isVatRegistered !== "yes"} 
                              className={isVatRegistered !== "yes" ? "bg-muted text-muted-foreground" : ""}
                            />
                            {isVatRegistered !== "yes" && (
                              <Lock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="business_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pty_ltd">Pty (Ltd)</SelectItem>
                            <SelectItem value="sole_proprietor">Sole Proprietor</SelectItem>
                            <SelectItem value="partnership">Partnership</SelectItem>
                            <SelectItem value="close_corporation">Close Corporation (CC)</SelectItem>
                            <SelectItem value="trust">Trust</SelectItem>
                            <SelectItem value="ngo">NGO / Non-Profit</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="default_currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ZAR">ZAR (R)</SelectItem>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                            <SelectItem value="GBP">GBP (£)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fiscal_year_start"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fiscal Year Start Month</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select start month" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => (
                                <SelectItem key={i + 1} value={String(i + 1)}>
                                  {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fiscal_year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fiscal Year</FormLabel>
                        <FormControl>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select year" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 10 }, (_, i) => {
                                const year = new Date().getFullYear() - 5 + i;
                                return (
                                  <SelectItem key={year} value={String(year)}>
                                    {year}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="submit" className="w-full bg-gradient-primary">Create Company</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Company Table */}
      <div className="border rounded-md overflow-hidden shadow-sm bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
             <thead className="bg-[#0070ad] text-white sticky top-0 z-10">
               <tr>
                <th className="px-4 py-3 font-semibold w-[250px]">Company Name</th>
                <th className="px-4 py-3 font-semibold">Business Details</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold w-[120px]">Date Added</th>
                <th className="px-4 py-3 font-semibold w-[100px] text-center">Status</th>
                <th className="px-4 py-3 font-semibold w-[140px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
               {loading ? (
                 <tr>
                   <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                     Loading companies...
                   </td>
                 </tr>
               ) : companies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Building2 className="h-12 w-12 mb-4 opacity-20" />
                      <p className="text-lg font-medium">No companies found</p>
                      <p className="text-sm">Create your first company to get started.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCompanies.map((company) => (
                  <tr 
                    key={company.id} 
                    className={`group transition-colors hover:bg-muted/30 ${
                      currentCompanyId === company.id ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start gap-3">
                        <div className="h-9 w-9 rounded bg-muted flex items-center justify-center flex-shrink-0 border mt-0.5">
                          {company.logo_url ? (
                            <img src={company.logo_url} alt="Logo" className="h-full w-full object-contain p-0.5" />
                          ) : (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground flex items-center gap-2">
                            {company.name}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            {company.code}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-1">
                        <div className="text-xs font-medium capitalize">
                          {company.business_type?.replace('_', ' ') || 'Company'}
                        </div>
                        {(company.tax_number || company.vat_number) && (
                          <div className="text-[11px] text-muted-foreground flex flex-col gap-0.5">
                            {company.tax_number && <span>Tax: {company.tax_number}</span>}
                            {company.vat_number && <span>VAT: {company.vat_number}</span>}
                          </div>
                        )}
                        <div className="text-[11px] text-muted-foreground">
                          Curr: {company.default_currency || 'ZAR'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-1">
                        {company.email && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-[180px]" title={company.email}>{company.email}</span>
                          </div>
                        )}
                        {company.phone && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span>{company.phone}</span>
                          </div>
                        )}
                        {company.address && (
                          <div className="text-[10px] text-muted-foreground truncate max-w-[180px] mt-1" title={company.address}>
                            {company.address}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs">
                      <div className="flex items-center gap-1.5">
                        <Activity className="h-3 w-3 text-muted-foreground" />
                        <span>{new Date(company.created_at).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      {currentCompanyId === company.id ? (
                        <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-[10px] px-2 h-5">
                          Current
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px] px-2 h-5 font-normal">
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="flex items-center justify-end gap-1">
                        {currentCompanyId !== company.id && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-primary hover:text-primary hover:bg-blue-50"
                            onClick={() => handleSwitchCompany(company.id)}
                            title="Switch to this company"
                          >
                            <LogIn className="h-4 w-4" />
                          </Button>
                        )}
                        
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleViewDetails(company)}
                          title="Manage Team & Details"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>

                        <FinancialHealthInsight 
                          companyId={company.id}
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title="View Ratios Report">
                              <Activity className="h-4 w-4" />
                            </Button>
                          }
                        />

                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); handleDeactivateClick(company); }}
                          title="Delete Company"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Pagination Controls */}
      {companies.length > itemsPerPage && (
        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, companies.length)} of {companies.length} companies
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <div className="text-sm font-medium">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden">
          <div className="bg-muted p-6 border-b">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground">{selectedCompany?.name}</h2>
                <p className="text-muted-foreground font-mono text-sm mt-1">{selectedCompany?.code}</p>
              </div>
              <div className="h-16 w-16 rounded-lg bg-white p-2 flex items-center justify-center border shadow-sm">
                {selectedCompany?.logo_url ? (
                  <img src={selectedCompany.logo_url} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
                <div className="font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {selectedCompany?.email || "N/A"}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Phone</Label>
                <div className="font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {selectedCompany?.phone || "N/A"}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tax ID</Label>
                <div className="font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {selectedCompany?.tax_number || "N/A"}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Address</Label>
                <div className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {selectedCompany?.address || "N/A"}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">VAT Number</Label>
                <div className="font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {selectedCompany?.vat_number || "N/A"}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Business Type</Label>
                <div className="font-medium flex items-center gap-2 capitalize">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {selectedCompany?.business_type?.replace('_', ' ') || "N/A"}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Currency</Label>
                <div className="font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {selectedCompany?.default_currency || "N/A"}
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-lg">Team Members</h3>
                </div>
                <Button size="sm" onClick={() => setIsAssignDialogOpen(true)} className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Assign Accountant
                </Button>
              </div>
              
              {teamLoading ? (
                <div className="text-center py-4 text-muted-foreground">Loading team...</div>
              ) : (
                <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                  {teamMembers.length > 0 ? (
                    teamMembers.map((member) => (
                      <div key={member.user_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border-2 border-white shadow-sm">
                            <AvatarFallback className="bg-primary/10 text-primary font-bold">
                              {member.profile?.first_name?.[0] || member.profile?.email?.[0] || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">
                              {[member.profile?.first_name, member.profile?.last_name].filter(Boolean).join(" ") || "Unknown User"}
                            </p>
                            <p className="text-xs text-muted-foreground">{member.profile?.email}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="capitalize bg-white">
                          {member.role}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No members found assigned to this company.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter className="bg-muted/20 p-4 border-t">
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Accountant Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Assign Accountant</DialogTitle>
            <DialogDescription>
              Add an existing user to <strong>{selectedCompany?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {assignError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Validation Error</AlertTitle>
                <AlertDescription>{assignError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                placeholder="accountant@example.com"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={assignRole} onValueChange={(val) => setAssignRole(val as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="administrator">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignUser} disabled={assignLoading}>
              {assignLoading ? "Assigning..." : "Assign User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Company
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{companyToDelete?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="bg-destructive/10 p-3 rounded-md border border-destructive/20 text-sm text-destructive flex items-start gap-2">
              <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Security Check: Please enter your administrator password to confirm deletion.</span>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteCompany} 
              disabled={!deletePassword || deleteLoading}
            >
              {deleteLoading ? "Deleting..." : "Delete Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSuccess} onOpenChange={setIsSuccess}>
        <DialogContent className="sm:max-w-[425px] flex flex-col items-center justify-center min-h-[300px]">
          <div className="h-24 w-24 rounded-full bg-green-100 flex items-center justify-center mb-6 animate-in zoom-in-50 duration-300">
            <Check className="h-12 w-12 text-green-600" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl text-green-700">Success!</DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-2">
            <p className="text-xl font-semibold text-gray-900">{successMessage}</p>
            <p className="text-muted-foreground">The operation has been completed successfully.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
