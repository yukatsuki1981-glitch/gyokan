-- Add columns expected by the app but missing from the initial schema

-- tasks
alter table public.tasks add column if not exists time_label text not null default '';
alter table public.tasks add column if not exists starred boolean not null default false;
alter table public.tasks add column if not exists sort_order integer not null default 0;
alter table public.tasks add column if not exists created_at timestamptz not null default now();
alter table public.tasks add column if not exists updated_at timestamptz not null default now();

-- cases
alter table public.cases add column if not exists sort_order integer not null default 0;
alter table public.cases add column if not exists updated_at timestamptz not null default now();

-- projects
alter table public.projects add column if not exists sort_order integer not null default 0;
alter table public.projects add column if not exists created_at timestamptz not null default now();
alter table public.projects add column if not exists updated_at timestamptz not null default now();
