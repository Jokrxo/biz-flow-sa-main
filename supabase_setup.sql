-- Create the transaction_attachments table
create table if not exists public.transaction_attachments (
  id uuid default gen_random_uuid() primary key,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size numeric,
  content_type text,
  created_at timestamptz default now(),
  user_id uuid default auth.uid()
);

-- Enable RLS
alter table public.transaction_attachments enable row level security;

-- Create policies
create policy "Users can view attachments"
  on public.transaction_attachments for select
  using (true); -- Or restrict to company/user if needed

create policy "Users can upload attachments"
  on public.transaction_attachments for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their attachments"
  on public.transaction_attachments for delete
  using (auth.uid() = user_id);

-- Create the storage bucket 'transactions'
insert into storage.buckets (id, name, public)
values ('transactions', 'transactions', true)
on conflict (id) do nothing;

-- Storage policies
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'transactions' );

create policy "Authenticated users can upload"
  on storage.objects for insert
  with check ( bucket_id = 'transactions' and auth.role() = 'authenticated' );

create policy "Authenticated users can delete"
  on storage.objects for delete
  using ( bucket_id = 'transactions' and auth.role() = 'authenticated' );
