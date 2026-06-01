-- Run in Supabase SQL Editor if tables are missing
-- Safe to run multiple times (IF NOT EXISTS)

create extension if not exists "pgcrypto";

-- project_memos
create table if not exists public.project_memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  memo_date text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_memos_user_id_idx on public.project_memos (user_id);
alter table public.project_memos enable row level security;
drop policy if exists "project_memos_select_own" on public.project_memos;
create policy "project_memos_select_own" on public.project_memos for select using (auth.uid() = user_id);
drop policy if exists "project_memos_insert_own" on public.project_memos;
create policy "project_memos_insert_own" on public.project_memos for insert with check (auth.uid() = user_id);
drop policy if exists "project_memos_update_own" on public.project_memos;
create policy "project_memos_update_own" on public.project_memos for update using (auth.uid() = user_id);
drop policy if exists "project_memos_delete_own" on public.project_memos;
create policy "project_memos_delete_own" on public.project_memos for delete using (auth.uid() = user_id);

-- user_preferences
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_view_date date,
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists "user_preferences_select_own" on public.user_preferences;
create policy "user_preferences_select_own" on public.user_preferences for select using (auth.uid() = user_id);
drop policy if exists "user_preferences_insert_own" on public.user_preferences;
create policy "user_preferences_insert_own" on public.user_preferences for insert with check (auth.uid() = user_id);
drop policy if exists "user_preferences_update_own" on public.user_preferences;
create policy "user_preferences_update_own" on public.user_preferences for update using (auth.uid() = user_id);
drop policy if exists "user_preferences_delete_own" on public.user_preferences;
create policy "user_preferences_delete_own" on public.user_preferences for delete using (auth.uid() = user_id);

-- daily_memos
create table if not exists public.daily_memos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  memo_date date not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists daily_memos_user_id_idx on public.daily_memos (user_id);
create index if not exists daily_memos_user_date_idx on public.daily_memos (user_id, memo_date);
alter table public.daily_memos enable row level security;
drop policy if exists "daily_memos_select_own" on public.daily_memos;
create policy "daily_memos_select_own" on public.daily_memos for select using (auth.uid() = user_id);
drop policy if exists "daily_memos_insert_own" on public.daily_memos;
create policy "daily_memos_insert_own" on public.daily_memos for insert with check (auth.uid() = user_id);
drop policy if exists "daily_memos_update_own" on public.daily_memos;
create policy "daily_memos_update_own" on public.daily_memos for update using (auth.uid() = user_id);
drop policy if exists "daily_memos_delete_own" on public.daily_memos;
create policy "daily_memos_delete_own" on public.daily_memos for delete using (auth.uid() = user_id);

-- tasks.case_id (optional link to cases)
alter table public.tasks
  add column if not exists case_id uuid references public.cases (id) on delete set null;
create index if not exists tasks_case_id_idx on public.tasks (case_id);
