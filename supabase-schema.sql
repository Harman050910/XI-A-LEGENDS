-- ============================================================
-- GNMPS Class XI-A Homework & Doubt Platform - Database Schema
-- ============================================================
-- HOW TO RUN:
--   1. Open your Supabase Dashboard
--   2. Go to SQL Editor (left sidebar)
--   3. Paste this whole file into the editor
--   4. Click RUN
--
-- NOTE: The app's server uses the service_role key, which bypasses
-- Row Level Security, so RLS policies are not required here.
-- ============================================================

-- Students (one row per registered student)
create table if not exists public.profiles (
  id bigint generated always as identity primary key,
  student_id text unique not null,
  password text not null,
  name text not null,
  pfp text,
  created_at timestamptz default now()
);

-- Homework (shared or asked) - auto-deleted after 3 days
create table if not exists public.homework (
  id bigint generated always as identity primary key,
  title text not null,
  description text default '',
  subject text default 'General',
  type text not null check (type in ('share', 'ask')),
  file_path text,
  original_name text,
  author_id bigint references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

-- Doubts (live forever)
create table if not exists public.doubts (
  id bigint generated always as identity primary key,
  title text not null,
  content text not null,
  author_id bigint references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

-- Discussion replies under a doubt
create table if not exists public.discussions (
  id bigint generated always as identity primary key,
  doubt_id bigint references public.doubts(id) on delete cascade not null,
  author_id bigint references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- Upvote / downvote on a doubt
create table if not exists public.votes (
  doubt_id bigint references public.doubts(id) on delete cascade not null,
  user_id bigint references public.profiles(id) on delete cascade not null,
  value integer not null,
  created_at timestamptz default now(),
  primary key (doubt_id, user_id)
);

-- Saved discussions (per student)
create table if not exists public.saved_discussions (
  doubt_id bigint references public.doubts(id) on delete cascade not null,
  user_id bigint references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (doubt_id, user_id)
);

-- Indexes for fast lookups
create index if not exists idx_homework_created on public.homework(created_at);
create index if not exists idx_doubts_created on public.doubts(created_at);
create index if not exists idx_discussions_doubt on public.discussions(doubt_id);
create index if not exists idx_votes_doubt on public.votes(doubt_id);
create index if not exists idx_saved_user on public.saved_discussions(user_id);

-- Storage buckets are created automatically by the server on startup.
