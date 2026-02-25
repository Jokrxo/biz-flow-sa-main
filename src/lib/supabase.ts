import { supabase as integratedClient } from '@/integrations/supabase/client'

// Export a non-generic client to avoid TS issues when local types don't include certain tables
export const supabase = integratedClient as any
export type { Database } from '@/integrations/supabase/types'
