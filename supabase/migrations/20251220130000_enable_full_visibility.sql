-- 1. Open up visibility for PROFILES so the Creator can see everyone
-- Drop restrictive policies first to avoid conflicts (using IF EXISTS)
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can view profiles in their company" on public.profiles;
drop policy if exists "Enable read access for all users" on public.profiles;

-- Create a new permissive policy for viewing profiles
create policy "Allow authenticated users to view all profiles"
on public.profiles for select
to authenticated
using (true);

-- Allow the Creator (authenticated users) to UPDATE profiles (for Deactivate/Activate)
create policy "Allow authenticated users to update profiles"
on public.profiles for update
to authenticated
using (true)
with check (true);


-- 2. Open up visibility for USER_ROLES so the Creator can see roles
drop policy if exists "Users can view own roles" on public.user_roles;
drop policy if exists "Users can view roles in their company" on public.user_roles;

create policy "Allow authenticated users to view all user_roles"
on public.user_roles for select
to authenticated
using (true);

-- Allow the Creator to manage roles (Insert/Delete/Update)
create policy "Allow authenticated users to manage user_roles"
on public.user_roles for all
to authenticated
using (true)
with check (true);
