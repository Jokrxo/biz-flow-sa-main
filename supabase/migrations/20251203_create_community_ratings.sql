-- Create app ratings table and open RLS for public read/insert
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create table if not exists public.community_app_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  rating int not null check (rating >= 1 and rating <= 5),
  comment text null,
  created_at timestamptz not null default now()
);

alter table public.community_app_ratings enable row level security;
drop policy if exists "public read ratings" on public.community_app_ratings;
drop policy if exists "public insert ratings" on public.community_app_ratings;
create policy "public read ratings" on public.community_app_ratings for select using (true);
create policy "public insert ratings" on public.community_app_ratings for insert with check (true);

create index if not exists idx_community_app_ratings_created_at on public.community_app_ratings(created_at desc);
