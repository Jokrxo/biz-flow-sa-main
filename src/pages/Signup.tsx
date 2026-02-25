import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useAuth } from "@/context/useAuth";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import SEO from "@/components/SEO";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Check, X } from "lucide-react";
import { AuthFooter } from "@/components/AuthFooter";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)");

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your name"),
    email: z.string().trim().email("Enter a valid email"),
    password: passwordSchema,
    confirm: z.string(),
    companyName: z.string().trim().min(2, "Enter company name"),
    companyAddress: z.string().trim().min(5, "Enter company address"),
    companyPhone: z.string().trim().min(10, "Phone number must be 10 digits").max(20, "Phone number too long").refine((v) => v.replace(/\D/g, '').length === 10, "Phone number must be 10 digits"),
    fiscalStartMonth: z.string().regex(/^([1-9]|1[0-2])$/, "Select a month"),
    fiscalDefaultYear: z.string().regex(/^\d{4}$/, "Select a year"),
    termsAccepted: z.boolean().refine((v) => v === true, "You must accept the Terms & Conditions"),
  })
  .refine((data) => data.password === data.confirm, { message: "Passwords do not match", path: ["confirm"] });

type FormValues = z.infer<typeof schema>;

export default function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", password: "", confirm: "", companyName: "", companyAddress: "", companyPhone: "", fiscalStartMonth: String(new Date().getMonth() + 1), fiscalDefaultYear: String(new Date().getFullYear()), termsAccepted: false } });

  const formatErrorMessage = (error: any): string => {
    const message = error?.message || String(error);
    if (message.toLowerCase().includes("password") && message.toLowerCase().includes("contain")) {
      return "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character";
    }
    if (message.toLowerCase().includes("password") && message.toLowerCase().includes("length")) {
      return "Password must be at least 8 characters long";
    }
    if (message.toLowerCase().includes("send") && message.toLowerCase().includes("confirmation")) {
      return "Unable to send confirmation email. Your SMTP settings might be incorrect, or the default provider limit (3/hour) is exceeded.";
    }
    return message;
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const invite = params.get('invite');
      if (invite) {
        try { localStorage.setItem('pendingInvite', invite); } catch {}
      }
      await signup(values.name, values.email, values.password);
      try { localStorage.setItem('just_signed_up', 'true'); } catch {}
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('company_id')
            .eq('user_id', user.id)
            .maybeSingle();
          const companyId = profile?.company_id || null;
          if (companyId) {
            await supabase.from('companies').update({ name: values.companyName, address: values.companyAddress, phone: values.companyPhone } as any).eq('id', companyId);
            try { await supabase.from('profiles').update({ terms_accepted_at: new Date().toISOString() } as any).eq('user_id', user.id); } catch {}
            try {
              const payload = {
                company_id: companyId,
                fiscal_year_start: parseInt(values.fiscalStartMonth),
                fiscal_default_year: parseInt(values.fiscalDefaultYear),
                fiscal_lock_year: true,
                updated_at: new Date().toISOString(),
              } as any;
              const { data: existing } = await supabase
                .from('app_settings')
                .select('id')
                .eq('company_id', companyId)
                .maybeSingle();
              if (existing?.id) {
                await supabase.from('app_settings').update(payload).eq('id', existing.id);
              } else {
                await supabase.from('app_settings').insert(payload);
              }
            } catch {}
          } else {
            const { data: createdCompany } = await supabase
              .from('companies')
              .insert({ name: values.companyName, address: values.companyAddress, phone: values.companyPhone, default_currency: 'ZAR', code: `CMP-${Date.now()}` } as any)
              .select('id')
              .single();
            if (createdCompany?.id) {
              await supabase.from('profiles').update({ company_id: createdCompany.id, terms_accepted_at: new Date().toISOString() } as any).eq('user_id', user.id);
              await supabase.from('user_roles').upsert({ user_id: user.id, company_id: createdCompany.id, role: 'administrator' });
              try {
                const payload = {
                  company_id: createdCompany.id,
                  fiscal_year_start: parseInt(values.fiscalStartMonth),
                  fiscal_default_year: parseInt(values.fiscalDefaultYear),
                  fiscal_lock_year: true,
                  updated_at: new Date().toISOString(),
                } as any;
                await supabase.from('app_settings').insert(payload);
              } catch {}
            }
          }
        }
      } catch {}
      if (invite) {
        try {
          // Attempt to accept invite via secure RPC first
          const { error: rpcError } = await supabase.rpc('accept_invite', { invite_token: invite });
          
          if (rpcError) {
            console.warn("RPC accept_invite failed, falling back to manual assignment:", rpcError);
            // Fallback for legacy support or if RPC is missing
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: inv } = await supabase
                .from('invites' as any)
                .select('company_id, role, token')
                .eq('token', invite)
                .maybeSingle();
              if ((inv as any)?.company_id) {
                await supabase.from('profiles').upsert({ user_id: user.id, company_id: (inv as any).company_id }).throwOnError();
                await supabase.from('user_roles').upsert({ user_id: user.id, company_id: (inv as any).company_id, role: (inv as any).role }).throwOnError();
                await supabase.from('invites' as any).delete().eq('token', invite);
              }
            }
          }
        } catch (e) {
          console.error("Error processing invite:", e);
        }
        try { localStorage.removeItem('pendingInvite'); } catch {}
      }
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          await supabase.auth.signOut({ scope: 'local' as any });
        }
      } catch {}
      toast({ title: "Account created", description: "Please sign in to your new account", });
      navigate("/login?signup=success", { replace: true });
    } catch (e: any) {
      console.error("Signup error details:", e);
      const errorMessage = formatErrorMessage(e);
      toast({ title: "Signup failed", description: errorMessage, variant: "destructive" });
    }
  };

  const passwordChecks = {
    minLength: password.length >= 8,
    hasLowercase: /[a-z]/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  return (
    <>
      <SEO title="Sign Up | Rigel Business" description="Create your Rigel Business enterprise account" canonical={window.location.href} />
      <div className="container relative min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
        
        {/* Form */}
        <div className="w-full">
           <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[600px] border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-8 shadow-xl rounded-2xl">
             <div className="flex flex-col space-y-2 text-center">
               <div className="flex justify-center mb-6">
                  <img src="/logo.png" alt="Rigel" className="h-32 w-auto rounded-lg shadow-md" />
               </div>
               <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
               <p className="text-sm text-muted-foreground">
                 Enter your details below to create your account
               </p>
             </div>

             <Form {...form}>
               <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                   <FormField
                     control={form.control}
                     name="name"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Full Name</FormLabel>
                         <FormControl>
                           <Input placeholder="John Doe" {...field} />
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
                           <Input placeholder="john@example.com" {...field} />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                 </div>

                 <FormField
                   control={form.control}
                   name="companyName"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>Company Name</FormLabel>
                       <FormControl>
                         <Input placeholder="Acme Corp (Pty) Ltd" {...field} />
                       </FormControl>
                       <FormMessage />
                     </FormItem>
                   )}
                 />

                 <FormField
                   control={form.control}
                   name="companyAddress"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>Address</FormLabel>
                       <FormControl>
                         <Input placeholder="123 Business Rd, Sandton" {...field} />
                       </FormControl>
                       <FormMessage />
                     </FormItem>
                   )}
                 />

                 <FormField
                   control={form.control}
                   name="companyPhone"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>Phone</FormLabel>
                       <FormControl>
                         <Input placeholder="0821234567" {...field} />
                       </FormControl>
                       <FormMessage />
                     </FormItem>
                   )}
                 />

                 <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="fiscalStartMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>FY Start Month</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => (
                                <SelectItem key={i + 1} value={String(i + 1)}>
                                  {new Date(2000, i, 1).toLocaleString('default', { month: 'short' })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="fiscalDefaultYear"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>FY Start Year</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                                <SelectItem key={y} value={String(y)}>
                                  {y}
                                </SelectItem>
                              ))}
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
                     name="password"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Password</FormLabel>
                         <FormControl>
                           <Input 
                             type="password" 
                             {...field}
                             onChange={(e) => {
                               field.onChange(e);
                               setPassword(e.target.value);
                             }}
                           />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />

                   <FormField
                     control={form.control}
                     name="confirm"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Confirm Password</FormLabel>
                         <FormControl>
                           <Input type="password" {...field} />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                 </div>

                 {/* Password strength indicators */}
                 <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                       {passwordChecks.minLength ? <Check className="h-3 w-3 text-green-500" /> : <div className="h-3 w-3 rounded-full border border-current" />}
                       <span>Min 8 characters</span>
                    </div>
                    <div className="flex items-center gap-2">
                       {passwordChecks.hasLowercase && passwordChecks.hasUppercase ? <Check className="h-3 w-3 text-green-500" /> : <div className="h-3 w-3 rounded-full border border-current" />}
                       <span>Mix of uppercase & lowercase</span>
                    </div>
                    <div className="flex items-center gap-2">
                       {passwordChecks.hasNumber && passwordChecks.hasSpecial ? <Check className="h-3 w-3 text-green-500" /> : <div className="h-3 w-3 rounded-full border border-current" />}
                       <span>Numbers & special characters</span>
                    </div>
                 </div>

                 <FormField
                   control={form.control}
                   name="termsAccepted"
                   render={({ field }) => (
                     <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                       <FormControl>
                         <Checkbox
                           checked={field.value}
                           onCheckedChange={field.onChange}
                         />
                       </FormControl>
                       <div className="space-y-1 leading-none">
                         <FormLabel>
                           I accept the <button type="button" onClick={() => setTermsOpen(true)} className="text-primary hover:underline">Terms & Conditions</button>
                         </FormLabel>
                       </div>
                     </FormItem>
                   )}
                 />

                 <Button type="submit" className="w-full bg-gradient-primary">
                   Create Account
                   <ArrowRight className="ml-2 h-4 w-4" />
                 </Button>
               </form>
             </Form>

             <p className="px-8 text-center text-sm text-muted-foreground">
               Already have an account?{" "}
               <Link 
                 to="/login" 
                 className="underline underline-offset-4 hover:text-primary"
               >
                 Sign in
               </Link>
             </p>
           </div>
        </div>
        
        <AuthFooter />
      </div>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Terms & Conditions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm max-h-[50vh] overflow-y-auto">
            <p>By creating an account, you agree to the Rigel Business Terms & Conditions, including acceptable use, data handling, and payment terms for paid plans.</p>
            <p>Key points:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the service responsibly and lawfully.</li>
              <li>Protect your credentials; you are responsible for all activity under your account.</li>
              <li>We process and store your data in accordance with our Privacy Policy.</li>
              <li>Paid features require a valid license; fees are non-refundable unless required by law.</li>
            </ul>
            <p>For full terms, contact support or view the legal documentation provided with your plan.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}