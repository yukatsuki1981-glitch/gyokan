-- Daily diary entries (separate from daily_memos)
-- Safe to run multiple times.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

drop trigger if exists daily_diaries_set_updated_at on public.daily_diaries;
create trigger daily_diaries_set_updated_at
  before update on public.daily_diaries
  for each row execute function public.set_updated_at();

alter table public.daily_diaries enable row level security;

drop policy if exists "daily_diaries_select_own" on public.daily_diaries;
drop policy if exists "daily_diaries_insert_own" on public.daily_diaries;
drop policy if exists "daily_diaries_update_own" on public.daily_diaries;
drop policy if exists "daily_diaries_delete_own" on public.daily_diaries;

create policy "daily_diaries_select_own" on public.daily_diaries
  for select using (auth.uid() = user_id);
create policy "daily_diaries_insert_own" on public.daily_diaries
  for insert with check (auth.uid() = user_id);
create policy "daily_diaries_update_own" on public.daily_diaries
  for update using (auth.uid() = user_id);
create policy "daily_diaries_delete_own" on public.daily_diaries
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';
