-- ============================================================
-- GNMPS Class XI-A Homework & Doubt Platform - Database Schema
-- ============================================================
-- HOW TO RUN:
--   1. Open your Supabase Dashboard
--   2. Go to SQL Editor (left sidebar) -> New query
--   3. Paste this whole file and click RUN
--
-- This schema is for the CLIENT-SIDE app (browser talks to
-- Supabase directly). Row Level Security is ENABLED so students
-- can only change their own content.
-- ============================================================

-- 1) RESET (the app connects directly now - tables are rebuilt clean)
drop table if exists votes cascade;
drop table if exists saved_discussions cascade;
drop table if exists discussions cascade;
drop table if exists homework cascade;
drop table if exists doubts cascade;
drop table if exists profiles cascade;

-- 2) Students (linked to the Supabase Auth account)
create table public.profiles (
  id bigint generated always as identity primary key,
  auth_id uuid unique references auth.users(id) on delete cascade,
  student_id text unique not null,
  name text not null,
  pfp text,
  created_at timestamptz default now()
);

-- 3) Homework (shared or asked) - shown for 3 days only
create table public.homework (
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

-- 4) Doubts (live forever)
create table public.doubts (
  id bigint generated always as identity primary key,
  title text not null,
  content text not null,
  author_id bigint references public.profiles(id) on delete cascade,
  created_at timestamptz default now()
);

-- 5) Discussion replies
create table public.discussions (
  id bigint generated always as identity primary key,
  doubt_id bigint references public.doubts(id) on delete cascade not null,
  author_id bigint references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- 6) Upvote / downvote
create table public.votes (
  doubt_id bigint references public.doubts(id) on delete cascade not null,
  user_id bigint references public.profiles(id) on delete cascade not null,
  value integer not null,
  created_at timestamptz default now(),
  primary key (doubt_id, user_id)
);

-- 7) Saved discussions
create table public.saved_discussions (
  doubt_id bigint references public.doubts(id) on delete cascade not null,
  user_id bigint references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (doubt_id, user_id)
);

create index if not exists idx_homework_created on public.homework(created_at);
create index if not exists idx_doubts_created on public.doubts(created_at);
create index if not exists idx_discussions_doubt on public.discussions(doubt_id);
create index if not exists idx_votes_doubt on public.votes(doubt_id);
create index if not exists idx_saved_user on public.saved_discussions(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.homework enable row level security;
alter table public.doubts enable row level security;
alter table public.discussions enable row level security;
alter table public.votes enable row level security;
alter table public.saved_discussions enable row level security;

-- profiles -----------------------------------------------------
create policy "profiles visible to all students"
  on public.profiles for select to authenticated using (true);

create policy "students create their own profile"
  on public.profiles for insert to authenticated
  with check (auth_id::text = auth.uid()::text);

create policy "students update their own profile"
  on public.profiles for update to authenticated
  using (auth_id::text = auth.uid()::text);

-- homework -----------------------------------------------------
create policy "homework visible to all students"
  on public.homework for select to authenticated using (true);

create policy "students add homework"
  on public.homework for insert to authenticated
  with check (author_id in (select id from public.profiles where auth_id = auth.uid()));

create policy "authors delete their homework"
  on public.homework for delete to authenticated
  using (author_id in (select id from public.profiles where auth_id = auth.uid()));

create policy "authors update their homework"
  on public.homework for update to authenticated
  using (author_id in (select id from public.profiles where auth_id = auth.uid()))
  with check (author_id in (select id from public.profiles where auth_id = auth.uid()));

-- doubts -------------------------------------------------------
create policy "doubts visible to all students"
  on public.doubts for select to authenticated using (true);

create policy "students post doubts"
  on public.doubts for insert to authenticated
  with check (author_id in (select id from public.profiles where auth_id = auth.uid()));

create policy "authors update their doubts"
  on public.doubts for update to authenticated
  using (author_id in (select id from public.profiles where auth_id = auth.uid()))
  with check (author_id in (select id from public.profiles where auth_id = auth.uid()));

create policy "authors delete their doubts"
  on public.doubts for delete to authenticated
  using (author_id in (select id from public.profiles where auth_id = auth.uid()));

-- discussions --------------------------------------------------
create policy "discussions visible to all students"
  on public.discussions for select to authenticated using (true);

create policy "students reply"
  on public.discussions for insert to authenticated
  with check (author_id in (select id from public.profiles where auth_id = auth.uid()));

-- votes --------------------------------------------------------
create policy "votes visible to all students"
  on public.votes for select to authenticated using (true);

create policy "students vote"
  on public.votes for insert to authenticated
  with check (user_id in (select id from public.profiles where auth_id = auth.uid()));

create policy "students change their vote"
  on public.votes for update to authenticated
  using (user_id in (select id from public.profiles where auth_id = auth.uid()));

create policy "students remove their vote"
  on public.votes for delete to authenticated
  using (user_id in (select id from public.profiles where auth_id = auth.uid()));

-- saved_discussions ---------------------------------------------
create policy "saved visible to all students"
  on public.saved_discussions for select to authenticated using (true);

create policy "students save"
  on public.saved_discussions for insert to authenticated
  with check (user_id in (select id from public.profiles where auth_id = auth.uid()));

create policy "students remove their save"
  on public.saved_discussions for delete to authenticated
  using (user_id in (select id from public.profiles where auth_id = auth.uid()));

-- ============================================================
-- STORAGE (files: profile pictures + homework attachments)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('pfp', 'pfp', true), ('hw', 'hw', true)
on conflict (id) do update set public = true;

drop policy if exists "gnmps pfp read" on storage.objects;
create policy "gnmps pfp read"
  on storage.objects for select using (bucket_id = 'pfp');

drop policy if exists "gnmps hw read" on storage.objects;
create policy "gnmps hw read"
  on storage.objects for select using (bucket_id = 'hw');

drop policy if exists "gnmps pfp upload" on storage.objects;
create policy "gnmps pfp upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pfp');

drop policy if exists "gnmps hw upload" on storage.objects;
create policy "gnmps hw upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'hw');

drop policy if exists "gnmps pfp delete own" on storage.objects;
create policy "gnmps pfp delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pfp' and owner_id::text = auth.uid()::text);

drop policy if exists "gnmps hw delete own" on storage.objects;
create policy "gnmps hw delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'hw' and owner_id::text = auth.uid()::text);

-- ============================================================
-- OPTIONAL: actually delete old homework from the database daily.
-- Homework is already hidden after 3 days by the app. To really
-- remove old rows too, enable pg_cron (Supabase -> Database ->
-- Extensions -> enable pg_cron), then uncomment:
-- ============================================================
-- select cron.schedule(
--   'clean-old-homework',
--   '0 3 * * *',
--   $$ delete from public.homework where created_at < now() - interval '3 days' $$
-- );
