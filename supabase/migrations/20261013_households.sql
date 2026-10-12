-- Households: share private-mode events (public.events) with family members.
--
-- Stage 1 of the sharing feature (DB only — the app is unchanged by this
-- step and keeps working as before):
--   * households / household_members / household_invites / profiles + RLS
--   * events.household_id, backfilled so every existing event belongs to
--     its creator's own one-person household
--   * events RLS: the old "own rows only" policies are replaced by
--     "rows of my household" (still including every row I created)
--
-- Nothing here touches tasks, projects, cases, memos, diaries or
-- user_preferences, or any of their policies.
--
-- Run the whole file at once in the Supabase SQL Editor. It is idempotent:
-- running it again does no harm.

begin;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default '家族',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
-- One household per user for now: "which calendar am I looking at" always
-- has exactly one answer.
create unique index if not exists household_members_one_per_user
  on public.household_members (user_id);

-- Single-use invite links. Only a SHA-256 hash of the token is stored; the
-- token itself is shown once, to the person creating the invite.
create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);

-- Display names. Visible only to the user and to members of the same household.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 20),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- on delete set null: removing a household never deletes events (they stay
-- visible to their creator through the user_id clause of the RLS below).
alter table public.events
  add column if not exists household_id uuid references public.households (id) on delete set null;
create index if not exists events_household_start_idx on public.events (household_id, start_time);

-- ─── Settings ────────────────────────────────────────────────────────────────

-- Maximum members per household. Change the number here to allow more.
create or replace function public.household_member_limit()
returns integer language sql immutable as $$ select 2 $$;

-- ─── Helper functions (security definer: they read membership without going
--     through RLS, which would otherwise recurse on household_members) ───────

create or replace function public.is_household_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create or replace function public.shares_household_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.household_members me
    join public.household_members them on them.household_id = me.household_id
    where me.user_id = auth.uid() and them.user_id = other
  );
$$;

-- Internal: the household of `uid`, creating a one-person household if there
-- is none. Not callable by clients (see the grants below).
create or replace function public.ensure_household_for(uid uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
begin
  select household_id into hid from public.household_members where user_id = uid;
  if hid is not null then
    return hid;
  end if;
  insert into public.households (created_by) values (uid) returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, uid, 'owner');
  return hid;
end;
$$;

-- The caller's household (created on first use, e.g. for new sign-ups).
create or replace function public.ensure_my_household()
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return public.ensure_household_for(auth.uid());
end;
$$;

-- ─── Invites ─────────────────────────────────────────────────────────────────

-- Creates a single-use invite for the caller's household and returns the
-- token (the only time it is ever available in plain form).
create or replace function public.create_household_invite()
returns text language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
  token text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  hid := public.ensure_household_for(auth.uid());
  if (select count(*) from public.household_members where household_id = hid)
       >= public.household_member_limit() then
    raise exception 'household_full';
  end if;
  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.household_invites (household_id, token_hash, created_by)
  values (hid, encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid());
  return token;
end;
$$;

-- What the invite page may know before joining — nothing about the household
-- itself (no names, no events): whether the link is usable, and how many of
-- the caller's own events would become shared.
create or replace function public.check_household_invite(p_token text)
returns table (status text, my_event_count integer)
language plpgsql stable security definer set search_path = public as $$
declare
  inv public.household_invites;
  my_hid uuid;
begin
  if auth.uid() is null then
    return query select 'not_authenticated'::text, 0;
    return;
  end if;
  select * into inv from public.household_invites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  select household_id into my_hid from public.household_members where user_id = auth.uid();
  if inv.id is null or inv.accepted_at is not null then
    return query select 'invalid'::text, 0;
  elsif my_hid = inv.household_id then
    return query select 'already_member'::text, 0;
  elsif (select count(*) from public.household_members where household_id = inv.household_id)
          >= public.household_member_limit() then
    return query select 'full'::text, 0;
  elsif my_hid is not null
        and (select count(*) from public.household_members where household_id = my_hid) > 1 then
    return query select 'in_other_shared_household'::text, 0;
  else
    return query select 'ok'::text,
      (select count(*)::integer from public.events
       where user_id = auth.uid() and scope = 'private');
  end if;
end;
$$;

-- Joins the household of the invite. The caller must confirm that their own
-- existing private events will be shared (p_share_existing_events = true);
-- without it nothing happens. Their events move to the new household, their
-- old one-person household is removed, and the invite is used up.
create or replace function public.accept_household_invite(p_token text, p_share_existing_events boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv public.household_invites;
  old_hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_share_existing_events is distinct from true then
    raise exception 'confirmation_required';
  end if;

  select * into inv from public.household_invites
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;
  if inv.id is null or inv.accepted_at is not null then
    raise exception 'invalid_invite';
  end if;

  -- Serialize joins to the same household so the member limit holds.
  perform 1 from public.households where id = inv.household_id for update;

  select household_id into old_hid from public.household_members where user_id = auth.uid();
  if old_hid = inv.household_id then
    raise exception 'already_member';
  end if;
  if (select count(*) from public.household_members where household_id = inv.household_id)
       >= public.household_member_limit() then
    raise exception 'household_full';
  end if;
  if old_hid is not null
     and (select count(*) from public.household_members where household_id = old_hid) > 1 then
    raise exception 'in_other_shared_household';
  end if;

  -- All of the caller's events move with them, so none is left behind in the
  -- household removed below. Their private events become shared (confirmed
  -- above); any non-private ones stay visible to the caller only — the
  -- events RLS shares scope = 'private' rows only.
  update public.events
     set household_id = inv.household_id
   where user_id = auth.uid();

  if old_hid is not null then
    delete from public.household_members where household_id = old_hid and user_id = auth.uid();
    delete from public.households h
     where h.id = old_hid
       and not exists (select 1 from public.household_members m where m.household_id = h.id);
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), 'member');

  update public.household_invites
     set accepted_by = auth.uid(), accepted_at = now()
   where id = inv.id;

  return inv.household_id;
end;
$$;

-- ─── events: household on insert, creator never changes ─────────────────────

create or replace function public.events_fill_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Rows saved without a household (the app before the sharing update, or any
  -- client that leaves it out) go to the creator's household.
  if new.household_id is null then
    new.household_id := public.ensure_household_for(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists events_fill_household on public.events;
create trigger events_fill_household
  before insert on public.events
  for each row execute function public.events_fill_household();

create or replace function public.events_keep_creator()
returns trigger language plpgsql as $$
begin
  -- Editing a family member's event must not make it "mine".
  new.user_id := old.user_id;
  return new;
end;
$$;

drop trigger if exists events_keep_creator on public.events;
create trigger events_keep_creator
  before update on public.events
  for each row execute function public.events_keep_creator();

-- ─── Backfill: everyone gets a one-person household; every event joins its
--     creator's household ───────────────────────────────────────────────────

insert into public.households (created_by)
select u.id from auth.users u
where not exists (select 1 from public.household_members m where m.user_id = u.id)
  and not exists (select 1 from public.households h where h.created_by = u.id);

insert into public.household_members (household_id, user_id, role)
select h.id, h.created_by, 'owner' from public.households h
where not exists (select 1 from public.household_members m where m.user_id = h.created_by)
on conflict do nothing;

update public.events e
   set household_id = m.household_id
  from public.household_members m
 where m.user_id = e.user_id and e.household_id is null;

-- ─── Row Level Security ──────────────────────────────────────────────────────

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.profiles enable row level security;

-- households / household_members: members can see their own household and
-- its members. No insert/update/delete policies: changes go through the
-- functions above only.
drop policy if exists "households_select_member" on public.households;
create policy "households_select_member" on public.households
  for select using (public.is_household_member(id));

drop policy if exists "household_members_select_member" on public.household_members;
create policy "household_members_select_member" on public.household_members
  for select using (public.is_household_member(household_id));

-- household_invites: no policies at all — nobody reads or writes it directly;
-- create_household_invite / check_household_invite / accept_household_invite
-- are the only way in.

-- profiles: my own row, plus the rows of people in my household.
drop policy if exists "profiles_select_self_or_household" on public.profiles;
create policy "profiles_select_self_or_household" on public.profiles
  for select using (user_id = auth.uid() or public.shares_household_with(user_id));

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (user_id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- events: replace the four "own rows" policies. Private events are shared
-- within the household; anything I created stays visible to me as before.
drop policy if exists "users can select own events" on public.events;
drop policy if exists "events_select_household" on public.events;
create policy "events_select_household" on public.events for select using (
  (scope = 'private' and household_id is not null and public.is_household_member(household_id))
  or user_id = auth.uid()
);

drop policy if exists "users can insert own events" on public.events;
drop policy if exists "events_insert_household" on public.events;
create policy "events_insert_household" on public.events for insert with check (
  user_id = auth.uid() and household_id is not null and public.is_household_member(household_id)
);

drop policy if exists "users can update own events" on public.events;
drop policy if exists "events_update_household" on public.events;
create policy "events_update_household" on public.events for update
  using ((scope = 'private' and public.is_household_member(household_id)) or user_id = auth.uid())
  with check (household_id is not null and public.is_household_member(household_id));

drop policy if exists "users can delete own events" on public.events;
drop policy if exists "events_delete_household" on public.events;
create policy "events_delete_household" on public.events for delete using (
  (scope = 'private' and public.is_household_member(household_id)) or user_id = auth.uid()
);

-- ─── Function permissions ────────────────────────────────────────────────────
-- Supabase grants new functions to anon and authenticated by default, so
-- revoking from "public" alone is not enough: anon is revoked explicitly.

revoke all on function public.household_member_limit() from public, anon;
revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.shares_household_with(uuid) from public, anon;
revoke all on function public.ensure_household_for(uuid) from public, anon, authenticated;
revoke all on function public.ensure_my_household() from public, anon;
revoke all on function public.create_household_invite() from public, anon;
revoke all on function public.check_household_invite(text) from public, anon;
revoke all on function public.accept_household_invite(text, boolean) from public, anon;
revoke all on function public.events_fill_household() from public, anon, authenticated;

grant execute on function public.household_member_limit() to authenticated;
-- The two RLS helpers are also granted to anon: they are evaluated inside the
-- events/profiles policies, and for a signed-out caller (auth.uid() is null)
-- they simply return false, so those queries come back empty as before
-- instead of failing.
grant execute on function public.is_household_member(uuid) to anon, authenticated;
grant execute on function public.shares_household_with(uuid) to anon, authenticated;
grant execute on function public.ensure_my_household() to authenticated;
grant execute on function public.create_household_invite() to authenticated;
grant execute on function public.check_household_invite(text) to authenticated;
grant execute on function public.accept_household_invite(text, boolean) to authenticated;

commit;
