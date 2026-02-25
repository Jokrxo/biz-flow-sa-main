-- Create community tables and open RLS for public read/insert
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- Posts
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  author_name text null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.community_posts enable row level security;
drop policy if exists "public read posts" on public.community_posts;
drop policy if exists "public insert posts" on public.community_posts;
create policy "public read posts" on public.community_posts for select using (true);
create policy "public insert posts" on public.community_posts for insert with check (true);

-- Comments
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid null,
  author_name text null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.community_comments enable row level security;
drop policy if exists "public read comments" on public.community_comments;
drop policy if exists "public insert comments" on public.community_comments;
create policy "public read comments" on public.community_comments for select using (true);
create policy "public insert comments" on public.community_comments for insert with check (true);

-- Reactions
create table if not exists public.community_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid null,
  type text not null check (lower(type) in ('like','love')),
  created_at timestamptz not null default now()
);

alter table public.community_reactions enable row level security;
drop policy if exists "public read reactions" on public.community_reactions;
drop policy if exists "public insert reactions" on public.community_reactions;
create policy "public read reactions" on public.community_reactions for select using (true);
create policy "public insert reactions" on public.community_reactions for insert with check (true);

-- Helpful indexes
create index if not exists idx_community_posts_created_at on public.community_posts(created_at desc);
create index if not exists idx_community_comments_post on public.community_comments(post_id);
create index if not exists idx_community_reactions_post on public.community_reactions(post_id);

