-- Create messages table for internal communication
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  sender_id uuid references auth.users(id) on delete cascade not null,
  receiver_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  read boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.messages enable row level security;

-- Policies
create policy "Users can view their own messages"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send messages"
  on public.messages for insert
  with check (auth.uid() = sender_id);

create policy "Users can update read status"
  on public.messages for update
  using (auth.uid() = receiver_id);

-- Realtime
alter publication supabase_realtime add table public.messages;
