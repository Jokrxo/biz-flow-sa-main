create table if not exists public.app_rating_responses (
  user_id uuid primary key,
  rating int null check (rating >= 1 and rating <= 5),
  comment text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_rating_responses enable row level security;

drop policy if exists "Users can read own app rating response" on public.app_rating_responses;
create policy "Users can read own app rating response"
on public.app_rating_responses
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own app rating response" on public.app_rating_responses;
create policy "Users can insert own app rating response"
on public.app_rating_responses
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own app rating response" on public.app_rating_responses;
create policy "Users can update own app rating response"
on public.app_rating_responses
for update
using (auth.uid() = user_id);

drop trigger if exists set_app_rating_responses_updated_at on public.app_rating_responses;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_app_rating_responses_updated_at
before update on public.app_rating_responses
for each row
execute function public.set_updated_at();

