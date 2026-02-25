-- Fix missing columns in profiles table
-- Run this if you see errors about "subscription_status" or "plan"

alter table public.profiles 
add column if not exists subscription_status text default 'ACTIVE';

alter table public.profiles 
add column if not exists plan text default 'Standard';

-- Verify the columns exist by selecting from them (this line is just for verification, won't change data)
-- select subscription_status, plan from public.profiles limit 1;
