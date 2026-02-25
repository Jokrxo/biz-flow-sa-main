import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase, hasSupabaseEnv } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import AuthContext, { AuthContextValue } from "./AuthContextBase";
import { enableDemoMode, disableDemoMode } from "@/lib/demo-data";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  const generateUuid = useCallback(() => {
    try { return crypto.randomUUID(); } catch { /* fallback */ }
    const tpl = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return tpl.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }, []);

  const bootstrapProfileIfNeeded = useCallback(async (userId: string) => {
    try {
      // If an invite is being processed, skip bootstrap
      try { if (localStorage.getItem('pendingInvite')) return; } catch {}
      
      // Check if profile exists
      const { data: existing, error: profErr } = await supabase
        .from('profiles')
        .select('company_id, subscription_status')
        .eq('user_id', userId)
        .maybeSingle();
      
      // Update subscription status in state
      if (existing) {
        setSubscriptionStatus(existing.subscription_status);
      }
      
      if (profErr) return;
      
      // If profile exists, check if it's using the DEFAULT company (shared company - privacy issue)
      if (existing?.company_id) {
        const { data: company } = await supabase
          .from('companies')
          .select('code')
          .eq('id', existing.company_id)
          .maybeSingle();
        
        // If user is assigned to DEFAULT company, create a new unique company for them
        if (company?.code === 'DEFAULT') {
          const newCompanyId = generateUuid();
          const uniqueCode = `COMP-${newCompanyId.substring(0, 8).toUpperCase()}`;
          
          // Create new unique company
          await supabase
            .from('companies')
            .insert({ 
              id: newCompanyId, 
              name: 'My Company', 
              code: uniqueCode 
            })
            .throwOnError();
          
          // Update profile to use new company
          await supabase
            .from('profiles')
            .update({ company_id: newCompanyId })
            .eq('user_id', userId)
            .throwOnError();
          
          // Update user_roles to use new company
          await supabase
            .from('user_roles')
            .update({ company_id: newCompanyId })
            .eq('user_id', userId)
            .throwOnError();
          
          // Delete old role for DEFAULT company
          await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', userId)
            .eq('company_id', existing.company_id);
        } else {
          // Check if user has any role in their current company
          const { count } = await supabase
            .from('user_roles')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('company_id', existing.company_id);
          
          if (count === 0) {
             // Fallback: Assign administrator role if missing
             await supabase.from('user_roles').insert({ user_id: userId, company_id: existing.company_id, role: 'administrator' });
          }
        }
        return;
      }

      // Profile doesn't exist - create new unique company and profile
      const newCompanyId = generateUuid();
      const uniqueCode = `COMP-${newCompanyId.substring(0, 8).toUpperCase()}`;
      
      // Get user metadata for name
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const userName = authUser?.user_metadata?.name || '';
      const nameParts = userName.split(' ').filter(Boolean);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Create unique company record
      await supabase
        .from('companies')
        .insert({ 
          id: newCompanyId, 
          name: 'My Company', 
          code: uniqueCode 
        })
        .throwOnError();
      
      // Create profile with unique company and user name
      await supabase
        .from('profiles')
        .insert({ 
          user_id: userId, 
          company_id: newCompanyId,
          first_name: firstName || null,
          last_name: lastName || null,
          email: authUser?.email || null
        })
        .throwOnError();
      
      // Ensure admin role in user_roles
      await supabase
        .from('user_roles')
        .insert({ user_id: userId, company_id: newCompanyId, role: 'administrator' })
        .throwOnError();
    } catch {
      // non-fatal
    }
  }, [generateUuid]);

  useEffect(() => {
    let mounted = true;

    // Timeout safety to ensure we never get stuck in loading state
    const loadingTimeout = setTimeout(() => {
      if (mounted) {
        console.warn("Auth loading timed out - forcing completion");
        setLoading(false);
      }
    }, 3000); // Reduced to 3 seconds

    // Get initial session with error handling
    const initializeAuth = async () => {
      if (!hasSupabaseEnv) {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }
      try {
        // Race condition for getSession as well
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<{ data: { session: null }, error: any }>(resolve => 
          setTimeout(() => resolve({ data: { session: null }, error: "Session fetch timeout" }), 2000)
        );

        const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
        
        if (error && error !== "Session fetch timeout") {
          console.warn('Auth session error:', error);
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('supabase-auth-token');
            localStorage.removeItem('sb-mzrdksmimgzkvbojjytc-auth-token');
          }
        }
        
        if (session?.user) {
          if (mounted) setUser(session.user);
          bootstrapProfileIfNeeded(session.user.id).catch(console.error);
          try { await supabase.rpc('ensure_user_company_and_role'); } catch {}
        } else {
          if (mounted) setUser(null);
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes with error handling
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (mounted) {
        // If we are just refreshing the token, do not set loading to true
        if (event === 'TOKEN_REFRESHED') {
           setUser(session?.user ?? null);
           setLoading(false);
           return;
        }

        setUser(session?.user ?? null);
        
        // Only set loading false if we have a definitive result
        // Use a small buffer to prevent flicker
        if (session?.user) {
            setLoading(false);
        } else if (event === 'SIGNED_OUT') {
            setLoading(false);
        }
        
        if (session?.user) {
          // Fetch additional data in background
          supabase.from('profiles')
            .select('subscription_status')
            .eq('user_id', session.user.id)
            .maybeSingle()
            .then(({ data }) => {
              if (mounted) setSubscriptionStatus(data?.subscription_status || null);
            });
        } else {
          setSubscriptionStatus(null);
        }
      }
    });

    return () => {
      mounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, [bootstrapProfileIfNeeded]);

  const login = useCallback(async (email: string, password: string) => {
    if (!hasSupabaseEnv) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      bootstrapProfileIfNeeded(data.user.id);
      try { await supabase.rpc('ensure_user_company_and_role'); } catch {}
    }
  }, [bootstrapProfileIfNeeded]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    if (!hasSupabaseEnv) throw new Error('Supabase is not configured');
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          name: name
        },
        emailRedirectTo: window.location.origin + '/login'
      }
    });
    if (error) throw error;
    
    if (data?.user?.id) {
      setTimeout(() => {
        bootstrapProfileIfNeeded(data.user.id);
      }, 500);
      try { await supabase.rpc('ensure_user_company_and_role'); } catch {}
    }
  }, [bootstrapProfileIfNeeded]);

  const forgotPassword = useCallback(async (email: string) => {
    if (!hasSupabaseEnv) throw new Error('Supabase is not configured');
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (hasSupabaseEnv) {
        try { await supabase.auth.signOut(); } catch {}
      }
    } finally {
      try { disableDemoMode(); } catch {}
      setUser(null);
      setSubscriptionStatus(null);
    }
  }, []);

  const startDemo = useCallback(async () => {
    try { enableDemoMode(); setUser(null); } catch {}
  }, []);
  const endDemo = useCallback(async () => {
    try { disableDemoMode(); } catch {}
  }, []);

  const value = useMemo(() => ({ user, loading, subscriptionStatus, login, signup, forgotPassword, logout, startDemo, endDemo }), [user, loading, subscriptionStatus, login, signup, forgotPassword, logout, startDemo, endDemo]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
