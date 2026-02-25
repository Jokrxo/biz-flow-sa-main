// Test script to check environment variables
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? 'Present' : 'Missing');
console.log('VITE_SUPABASE_PROJECT_ID:', process.env.VITE_SUPABASE_PROJECT_ID);