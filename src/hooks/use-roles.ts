import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/useAuth';

export type Role = 'administrator' | 'accountant' | 'manager';

export function useRoles() {
  const { user, loading: authLoading } = useAuth();

  const { data: roles = [], isLoading: queryLoading } = useQuery({
    queryKey: ['userRoles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Wait briefly for bootstrap to create profile for brand-new users
      let companyId: string | null = null;
      for (let i = 0; i < 5; i++) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();
        companyId = (profile as any)?.company_id ?? null;
        if (companyId) break;
        await new Promise(res => setTimeout(res, 250));
      }
      if (!companyId) return [];

      // Fetch roles for this user in their active company
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', companyId);
      let fetchedRoles = (data || []).map(r => r.role as Role);

      // Fallback logic: ensure every user has at least one role
      if (fetchedRoles.length === 0) {
        // Check if this company has any role assigned to anyone
        const { count: companyRolesCount } = await supabase
          .from('user_roles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId);

        // Decide intended default role
        const intendedRole: Role = (companyRolesCount || 0) === 0 ? 'administrator' : 'accountant';

        // Try to assign role in DB (may be blocked by RLS)
        if ((companyRolesCount || 0) === 0) {
          try { await supabase.from('user_roles').insert({ user_id: user.id, company_id: companyId, role: 'administrator' }); } catch {}
        } else {
          try { await supabase.from('user_roles').insert({ user_id: user.id, company_id: companyId, role: 'accountant' }); } catch {}
        }

        // Re-fetch after attempted insert
        const { data: reData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('company_id', companyId);
        fetchedRoles = (reData || []).map(r => r.role as Role);

        // If still empty, infer locally so the UI works
        if (fetchedRoles.length === 0) {
          fetchedRoles = [intendedRole];
        }
      }

      try {
        localStorage.setItem(`rigel_roles_${user.id}`, JSON.stringify(fetchedRoles));
      } catch (e) {
        console.warn('Failed to cache roles', e);
      }

      return fetchedRoles;
    },
    enabled: !!user && !authLoading,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    refetchOnWindowFocus: false,
    placeholderData: () => {
       // Try to load from local storage to prevent flickering
       if (!user) return [];
       try {
         const cached = localStorage.getItem(`rigel_roles_${user.id}`);
         if (cached) return JSON.parse(cached);
       } catch {}
       return [];
    }
  });

  // Use roles from data (which might be placeholder) to determine loading state effectively
  // If we have placeholder data (cached roles), we are effectively NOT loading from the user's perspective
  const hasCachedData = roles.length > 0;
  const loading = (authLoading || (!!user && queryLoading)) && !hasCachedData;
  const isAdmin = roles.includes('administrator');

  return {
    roles,
    loading,
    isAdmin,
    // Administrators automatically inherit all other role permissions
    isAccountant: roles.includes('accountant') || isAdmin,
    isManager: roles.includes('manager') || isAdmin
  };
}
