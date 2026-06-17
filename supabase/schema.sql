-- Gyokan Supabase schema
-- Run in Supabase SQL Editor (Dashboard → SQL → New query)

-- Extensions
create extension if not exists "pgcrypto";

-- ─── Projects ───────────────────────────────────────────────────────────────

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  accent_color text not null default '#3B82F6',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists projects_user_id_idx on public.projects (user_id);

-- ─── Tasks (calendar items) ─────────────────────────────────────────────────

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  case_id uuid references public.cases (id) on delete set null,
  title text not null default '',
  time_label text not null default '',
  task_date date not null,
  date_end date,
  done boolean not null default false,
  completed_at date,
  starred boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_user_date_idx on public.tasks (user_id, task_date);
create index if not exists tasks_case_id_idx on public.tasks (case_id);

-- ─── Cases (案件) ─────────────────────────────────────────────────────────────

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null default '',
  status text not null default '情報収集中',
  status_tone text not null default 'emerald'
    check (status_tone in ('blue', 'amber', 'emerald', 'violet')),
  deadline text not null default '',
  progress integer not null default 0,
  goal text not null default '',
  subtasks_done integer not null default 0,
  subtasks_total integer not null default 5,
  comments_count integer not null default 0,
  done boolean not null default false,
  created_at text not null,
  completed_at text,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists cases_user_id_idx on public.cases (user_id);
create index if not exists cases_project_id_idx on public.cases (project_id);

-- ─── Project memos ───────────────────────────────────────────────────────────

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
create index if not exists project_memos_project_id_idx on public.project_memos (project_id);

-- ─── Daily memos (sidebar bulletin board) ────────────────────────────────────

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

-- ─── Daily diaries ───────────────────────────────────────────────────────────

create table if not exists public.daily_diaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  diary_date date not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_diaries_user_id_idx on public.daily_diaries (user_id);
create index if not exists daily_diaries_user_date_idx on public.daily_diaries (user_id, diary_date);

-- ─── User preferences (calendar last view date, etc.) ────────────────────────

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_view_date date,
  updated_at timestamptz not null default now()
);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists cases_set_updated_at on public.cases;
create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

drop trigger if exists project_memos_set_updated_at on public.project_memos;
create trigger project_memos_set_updated_at
  before update on public.project_memos
  for each row execute function public.set_updated_at();

drop trigger if exists daily_memos_set_updated_at on public.daily_memos;
create trigger daily_memos_set_updated_at
  before update on public.daily_memos
  for each row execute function public.set_updated_at();

drop trigger if exists daily_diaries_set_updated_at on public.daily_diaries;
create trigger daily_diaries_set_updated_at
  before update on public.daily_diaries
  for each row execute function public.set_updated_at();

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.cases enable row level security;
alter table public.project_memos enable row level security;
alter table public.daily_memos enable row level security;
alter table public.daily_diaries enable row level security;
alter table public.user_preferences enable row level security;

-- projects
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- tasks
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks
  for delete using (auth.uid() = user_id);

-- cases
create policy "cases_select_own" on public.cases
  for select using (auth.uid() = user_id);
create policy "cases_insert_own" on public.cases
  for insert with check (auth.uid() = user_id);
create policy "cases_update_own" on public.cases
  for update using (auth.uid() = user_id);
create policy "cases_delete_own" on public.cases
  for delete using (auth.uid() = user_id);

-- project_memos
create policy "project_memos_select_own" on public.project_memos
  for select using (auth.uid() = user_id);
create policy "project_memos_insert_own" on public.project_memos
  for insert with check (auth.uid() = user_id);
create policy "project_memos_update_own" on public.project_memos
  for update using (auth.uid() = user_id);
create policy "project_memos_delete_own" on public.project_memos
  for delete using (auth.uid() = user_id);

-- daily_memos
create policy "daily_memos_select_own" on public.daily_memos
  for select using (auth.uid() = user_id);
create policy "daily_memos_insert_own" on public.daily_memos
  for insert with check (auth.uid() = user_id);
create policy "daily_memos_update_own" on public.daily_memos
  for update using (auth.uid() = user_id);
create policy "daily_memos_delete_own" on public.daily_memos
  for delete using (auth.uid() = user_id);

-- daily_diaries
create policy "daily_diaries_select_own" on public.daily_diaries
  for select using (auth.uid() = user_id);
create policy "daily_diaries_insert_own" on public.daily_diaries
  for insert with check (auth.uid() = user_id);
create policy "daily_diaries_update_own" on public.daily_diaries
  for update using (auth.uid() = user_id);
create policy "daily_diaries_delete_own" on public.daily_diaries
  for delete using (auth.uid() = user_id);

-- user_preferences
create policy "user_preferences_select_own" on public.user_preferences
  for select using (auth.uid() = user_id);
create policy "user_preferences_insert_own" on public.user_preferences
  for insert with check (auth.uid() = user_id);
create policy "user_preferences_update_own" on public.user_preferences
  for update using (auth.uid() = user_id);
create policy "user_preferences_delete_own" on public.user_preferences
  for delete using (auth.uid() = user_id);
