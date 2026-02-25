import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import SEO from "@/components/SEO";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { AuthFooter } from "@/components/AuthFooter";

const schema = z.object({ email: z.string().trim().email("Enter a valid email") });

type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const { toast } = useToast();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = async (values: FormValues) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: "Email sent", description: "Check your inbox for password reset instructions." });
    } catch (e: any) {
      toast({ title: "Request failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      <SEO title="Forgot Password | Rigel Business" description="Reset your Rigel Business password" canonical={window.location.href} />
      <div className="container relative min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
        
        {/* Form */}
        <div className="w-full">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[450px] border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-8 shadow-xl rounded-2xl">
            <div className="flex flex-col space-y-2 text-center">
              <div className="flex justify-center mb-6">
                 <img src="/logo.png" alt="Rigel" className="h-32 w-auto rounded-lg shadow-md" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Forgot password?</h1>
              <p className="text-sm text-muted-foreground">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="name@example.com" 
                          type="email" 
                          autoCapitalize="none" 
                          autoComplete="email" 
                          autoCorrect="off" 
                          className="bg-background"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button type="submit" className="w-full bg-gradient-primary hover:opacity-90 transition-opacity">
                  Send reset link
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </Form>

            <div className="text-center text-sm">
              <Link 
                to="/login" 
                className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to login
              </Link>
            </div>
          </div>
        </div>
        
        <AuthFooter />
      </div>
    </>
  );
}
