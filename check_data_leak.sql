-- Check company data and RLS policies
-- This will help identify any data leak issues

-- First, let's see what companies exist and their details
SELECT 'COMPANIES:' as check_type, id, name, created_at 
FROM public.companies 
ORDER BY created_at DESC;

-- Check user profiles and their company assignments
SELECT 'USER PROFILES:' as check_type, id, user_id, company_id, full_name 
FROM public.profiles 
ORDER BY created_at DESC 
LIMIT 10;

-- Check if RLS is enabled on key tables
SELECT 'RLS STATUS:' as check_type, 
  schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('companies', 'profiles', 'fixed_assets', 'chart_of_accounts')
ORDER BY tablename;

-- Check RLS policies for companies table
SELECT 'COMPANY POLICIES:' as check_type, 
  policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'companies' 
ORDER BY policyname;