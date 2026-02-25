import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import SEO from "@/components/SEO";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const schema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirm: z.string()
}).refine((data) => data.password === data.confirm, {
  message: "Passwords do not match",
  path: ["confirm"]
});

type FormValues = z.infer<typeof schema>;

export default function ResetPassword() {
  const { toast } = useToast();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const [submitting, setSubmitting] = useState(false);
  const [params] = useSearchParams();
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  const onSubmit = async (values: FormValues) => {
    try {
      setSubmitting(true);
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      toast({ title: "Password updated", description: "You can now log in with your new password." });
      window.location.href = "/login";
    } catch (e: any) {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEO title="Reset Password | Rigel Business" description="Set a new Rigel Business password" canonical={window.location.href} />
      <main className="min-h-screen bg-gradient-to-br from-primary/5 via-accent/5 to-background flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1920&h=1080&fit=crop')] bg-cover bg-center opacity-5" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 backdrop-blur-3xl" />
        <article className="w-full max-w-md rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-elegant p-8 relative z-10">
          <header className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-primary mb-4 animate-glow">
              <span className="text-3xl font-bold text-primary-foreground">A</span>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">Rigel Business</h1>
            <p className="text-sm text-muted-foreground mt-2">Set your new password</p>
          </header>

          <Form {...form}>
            {error && (
              <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {errorDescription || "The reset link is invalid or has expired. Please request a new link."}
              </div>
            )}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" placeholder="Enter new password" {...field} />
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
                    <FormLabel>Confirm password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" placeholder="Re-enter new password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full bg-gradient-primary" disabled={submitting || !!error}>
                Reset password
              </Button>
            </form>
            {error && (
              <p className="mt-4 text-xs text-muted-foreground text-center">
                The link in your email cannot be used anymore.{" "}
                <Link to="/forgot-password" className="underline underline-offset-2 hover:text-primary">
                  Request a new reset link
                </Link>
                .
              </p>
            )}
          </Form>
        </article>
      </main>
    </>
  );
}
