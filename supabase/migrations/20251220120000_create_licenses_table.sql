-- Create licenses table
create table if not exists public.licenses (
  id uuid default gen_random_uuid() primary key,
  license_key text not null unique,
  plan_type text not null,
  status text not null default 'UNUSED',
  expiry_date timestamp with time zone,
  assigned_user_id uuid references auth.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.licenses enable row level security;

-- Policies (Allow all authenticated users to manage licenses for now - typically restricted to admins)
create policy "Enable all access for authenticated users"
  on public.licenses for all
  using ( auth.role() = 'authenticated' )
  with check ( auth.role() = 'authenticated' );

-- Grant permissions
grant all on public.licenses to authenticated;
grant all on public.licenses to service_role;

-- Add columns to profiles if they don't exist (used in LicenseAdmin)
alter table public.profiles add column if not exists subscription_status text default 'ACTIVE';
alter table public.profiles add column if not exists plan text default 'Standard';
