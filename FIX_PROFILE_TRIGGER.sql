-- FIX: Missing Profile Trigger
-- Run this in your Supabase SQL Editor to fix the "Profile Missing" error.

-- 1. Create the function to handle new user creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, email, first_name, last_name)
  values (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'first_name', 
    new.raw_user_meta_data->>'last_name'
  );
  return new;
end;
$$ language plpgsql security definer;

-- 2. Create the trigger (if it doesn't exist)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. (Optional) Fix RLS to allow admins to insert profiles if needed
-- This is a backup in case the trigger fails and we want to allow manual insert
-- However, the trigger above is the preferred solution.
