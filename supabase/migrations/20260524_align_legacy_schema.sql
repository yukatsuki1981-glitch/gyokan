-- Align legacy Supabase tables with what the Gyokan app expects.
-- Safe to run multiple times.

-- ─── tasks ───────────────────────────────────────────────────────────────────

alter table public.tasks add column if not exists task_date date;
alter table public.tasks add column if not exists date_end date;
alter table public.tasks add column if not exists time_label text not null default '';
alter table public.tasks add column if not exists starred boolean not null default false;
alter table public.tasks add column if not exists sort_order integer not null default 0;
alter table public.tasks add column if not exists created_at timestamptz not null default now();
alter table public.tasks add column if not exists updated_at timestamptz not null default now();
alter table public.tasks add column if not exists case_id uuid references public.cases (id) on delete set null;

-- Copy legacy column values when present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'date'
  ) then
    execute $sql$
      update public.tasks
      set task_date = coalesce(task_date, nullif(date::text, '')::date)
      where task_date is null and date is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'time'
  ) then
    execute $sql$
      update public.tasks
      set time_label = coalesce(nullif(time_label, ''), time::text, '')
      where coalesce(time_label, '') = '' and time is not null
    $sql$;
  end if;
end $$;

create index if not exists tasks_case_id_idx on public.tasks (case_id);

-- ─── projects ────────────────────────────────────────────────────────────────

alter table public.projects add column if not exists accent_color text;
alter table public.projects add column if not exists sort_order integer not null default 0;
alter table public.projects add column if not exists created_at timestamptz not null default now();
alter table public.projects add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'color'
  ) then
    execute $sql$
      update public.projects
      set accent_color = coalesce(nullif(accent_color, ''), color, '#3B82F6')
      where accent_color is null or accent_color = ''
    $sql$;
  end if;
end $$;

update public.projects
set accent_color = '#3B82F6'
where accent_color is null or accent_color = '';

alter table public.projects alter column accent_color set default '#3B82F6';

-- ─── cases ───────────────────────────────────────────────────────────────────

alter table public.cases add column if not exists title text not null default '';
alter table public.cases add column if not exists status text not null default '情報収集中';
alter table public.cases add column if not exists status_tone text not null default 'emerald';
alter table public.cases add column if not exists subtasks_done integer not null default 0;
alter table public.cases add column if not exists subtasks_total integer not null default 5;
alter table public.cases add column if not exists comments_count integer not null default 0;
alter table public.cases add column if not exists done boolean not null default false;
alter table public.cases add column if not exists completed_at text;
alter table public.cases add column if not exists sort_order integer not null default 0;
alter table public.cases add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cases' and column_name = 'name'
  ) then
    execute $sql$
      update public.cases
      set title = coalesce(nullif(title, ''), name, '')
      where coalesce(title, '') = '' and coalesce(name, '') <> ''
    $sql$;
  end if;
end $$;

-- Refresh PostgREST schema cache (fixes "column does not exist" after ALTER)
notify pgrst, 'reload schema';
