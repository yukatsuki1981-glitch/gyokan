-- Private mode: personal calendar events, separate from tasks.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  memo text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_user_id_idx on public.events (user_id);
create index if not exists events_user_start_idx on public.events (user_id, start_time);

alter table public.events enable row level security;

drop policy if exists "users can select own events" on public.events;
create policy "users can select own events" on public.events for select using (auth.uid() = user_id);

drop policy if exists "users can insert own events" on public.events;
create policy "users can insert own events" on public.events for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own events" on public.events;
create policy "users can update own events" on public.events for update using (auth.uid() = user_id);

drop policy if exists "users can delete own events" on public.events;
create policy "users can delete own events" on public.events for delete using (auth.uid() = user_id);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();
