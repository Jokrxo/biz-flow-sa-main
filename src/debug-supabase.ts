// Debug Supabase configuration
console.log('=== SUPABASE CONFIG DEBUG ===');
console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY:', import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Present' : 'Missing');
console.log('VITE_SUPABASE_PROJECT_ID:', import.meta.env.VITE_SUPABASE_PROJECT_ID);
console.log('All env vars:', import.meta.env);
console.log('hasSupabaseEnv will be:', !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY));