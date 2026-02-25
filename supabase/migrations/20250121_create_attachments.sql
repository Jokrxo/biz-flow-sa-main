
create table if not exists transaction_attachments (
  id uuid default gen_random_uuid() primary key,
  transaction_id uuid references transactions(id) on delete cascade not null,
  file_name text not null,
  file_path text not null,
  file_size integer,
  content_type text,
  created_at timestamp with time zone default now(),
  user_id uuid references auth.users(id)
);

-- Enable RLS
alter table transaction_attachments enable row level security;

-- Policies
create policy "Users can view attachments for their company"
  on transaction_attachments for select
  using (
    exists (
      select 1 from transactions t
      join profiles p on p.company_id = t.company_id
      where t.id = transaction_attachments.transaction_id
      and p.user_id = auth.uid()
    )
  );

create policy "Users can insert attachments for their company"
  on transaction_attachments for insert
  with check (
    exists (
      select 1 from transactions t
      join profiles p on p.company_id = t.company_id
      where t.id = transaction_attachments.transaction_id
      and p.user_id = auth.uid()
    )
  );

create policy "Users can delete attachments for their company"
  on transaction_attachments for delete
  using (
    exists (
      select 1 from transactions t
      join profiles p on p.company_id = t.company_id
      where t.id = transaction_attachments.transaction_id
      and p.user_id = auth.uid()
    )
  );
