-- Daily bulletin-board memos (sidebar)
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

drop trigger if exists daily_memos_set_updated_at on public.daily_memos;
create trigger daily_memos_set_updated_at
  before update on public.daily_memos
  for each row execute function public.set_updated_at();

alter table public.daily_memos enable row level security;

create policy "daily_memos_select_own" on public.daily_memos
  for select using (auth.uid() = user_id);
create policy "daily_memos_insert_own" on public.daily_memos
  for insert with check (auth.uid() = user_id);
create policy "daily_memos_update_own" on public.daily_memos
  for update using (auth.uid() = user_id);
create policy "daily_memos_delete_own" on public.daily_memos
  for delete using (auth.uid() = user_id);
