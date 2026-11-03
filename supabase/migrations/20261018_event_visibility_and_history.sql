-- Households stage 3: per-event "自分だけ / 共有" and an edit history for events.
--
--   * events.visibility ('shared' | 'only_me', default 'shared'). Every existing
--     row becomes 'shared' — matching the join consent "既存の予定が共有されます".
--     The app before this update never sends the column, so its inserts get
--     'shared' and its updates leave the value as it is.
--   * events RLS: family members see / edit / delete only private events that
--     are 'shared'. The creator always keeps full access to their own rows.
--     Work events (scope = 'work') stay visible to their creator only.
--   * Only the creator can change an event's scope or visibility; a family
--     member's edit keeps them (as user_id already is, since stage 1).
--   * public.event_history: one row per edit or delete, written by a trigger
--     (so an app bug can't skip it). Changes to sort_order alone (drag to
--     reorder) and the bookkeeping columns are not recorded. Rows have no
--     foreign key to events, so they outlive a deleted event, and carry a
--     copy of the title. Who may read them follows the event's visibility.
--   * public.set_event_sort_orders(): saves a reorder without upserting, so a
--     family member's event that was deleted meanwhile is not re-created.
--   * Fix for stage 1: accounts without a household could not save events
--     (see is_household_member_now below).
--
-- Nothing here touches tasks or any other table's policies.
--
-- Run the whole file at once in the Supabase SQL Editor. It is idempotent:
-- running it again does no harm.

begin;

-- ─── events.visibility ───────────────────────────────────────────────────────

alter table public.events
  add column if not exists visibility text not null default 'shared';

alter table public.events drop constraint if exists events_visibility_check;
alter table public.events
  add constraint events_visibility_check check (visibility in ('shared', 'only_me'));

-- ─── Creator-only fields ─────────────────────────────────────────────────────
-- Replaces the stage 1 function (same trigger): the creator never changes,
-- and only the creator may change scope or visibility. A family member
-- turning someone else's event into 'only_me' or 'work' would hide it from
-- themselves and silently make it the creator's private row, so those two
-- columns keep their old values when anyone else saves the row. Without a
-- signed-in user (SQL Editor, maintenance) nothing is restricted.
create or replace function public.events_keep_creator()
returns trigger language plpgsql as $$
begin
  -- Editing a family member's event must not make it "mine".
  new.user_id := old.user_id;
  if auth.uid() is not null and auth.uid() is distinct from old.user_id then
    new.scope := old.scope;
    new.visibility := old.visibility;
  end if;
  return new;
end;
$$;

drop trigger if exists events_keep_creator on public.events;
create trigger events_keep_creator
  before update on public.events
  for each row execute function public.events_keep_creator();

-- ─── event_history ───────────────────────────────────────────────────────────

create table if not exists public.event_history (
  id bigint generated always as identity primary key,
  -- No foreign keys: the history stays when the event is deleted.
  event_id uuid not null,
  -- A copy of the event's title before the change (the only way to tell which
  -- event a row was about once the event is gone).
  event_title text not null,
  -- Who may read this row — copied from the event, and kept in step with it
  -- by the trigger below (see "Visibility of history").
  event_user_id uuid not null,
  event_household_id uuid,
  event_scope text not null,
  event_visibility text not null,
  action text not null check (action in ('update', 'delete')),
  -- Who made the change: auth.uid(), or null for SQL Editor / maintenance.
  changed_by uuid,
  changed_at timestamptz not null default now(),
  -- Columns whose value changed (empty for a delete).
  changed_fields text[] not null default '{}',
  -- Values before the change: the changed columns for an update, the whole
  -- row for a delete.
  old_values jsonb not null default '{}'
);

create index if not exists event_history_event_idx
  on public.event_history (event_id, changed_at desc);
create index if not exists event_history_household_idx
  on public.event_history (event_household_id, changed_at desc);

-- Columns that are not "what the event says": not recorded as edits.
--   sort_order  — drag to reorder (would flood the history)
--   updated_at  — set by events_set_updated_at on every update
--   household_id — moved by accept_household_invite, not by an edit
--   user_id     — never changes (events_keep_creator)
create or replace function public.event_history_ignored_columns()
returns text[] language sql immutable as $$
  select array['sort_order', 'updated_at', 'household_id', 'user_id', 'id', 'created_at']
$$;

create or replace function public.events_record_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb;
  new_j jsonb;
  fields text[];
  olds jsonb;
begin
  if tg_op = 'UPDATE' then
    -- Keep the read permission of earlier history rows in step with the event
    -- (e.g. switched to 'only_me': its history becomes the creator's only).
    if new.household_id is distinct from old.household_id
       or new.scope is distinct from old.scope
       or new.visibility is distinct from old.visibility
       or new.user_id is distinct from old.user_id then
      update public.event_history
         set event_user_id = new.user_id,
             event_household_id = new.household_id,
             event_scope = new.scope,
             event_visibility = new.visibility
       where event_id = new.id;
    end if;

    old_j := to_jsonb(old) - public.event_history_ignored_columns();
    new_j := to_jsonb(new) - public.event_history_ignored_columns();
    select coalesce(array_agg(k order by k), '{}'), coalesce(jsonb_object_agg(k, old_j -> k), '{}')
      into fields, olds
      from jsonb_object_keys(old_j) as k
     where (old_j -> k) is distinct from (new_j -> k);

    if cardinality(fields) = 0 then
      return null; -- nothing but ignored columns changed (e.g. a reorder)
    end if;

    insert into public.event_history
      (event_id, event_title, event_user_id, event_household_id, event_scope, event_visibility,
       action, changed_by, changed_fields, old_values)
    values
      (new.id, old.title, new.user_id, new.household_id, new.scope, new.visibility,
       'update', auth.uid(), fields, olds);
    return null;
  end if;

  -- DELETE. When the creator's account itself is being deleted (cascade from
  -- auth.users), there is nobody left to show it to: don't record.
  if not exists (select 1 from auth.users where id = old.user_id) then
    return null;
  end if;
  insert into public.event_history
    (event_id, event_title, event_user_id, event_household_id, event_scope, event_visibility,
     action, changed_by, changed_fields, old_values)
  values
    (old.id, old.title, old.user_id, old.household_id, old.scope, old.visibility,
     'delete', auth.uid(), '{}', to_jsonb(old));
  return null;
end;
$$;

drop trigger if exists events_record_history on public.events;
create trigger events_record_history
  after update or delete on public.events
  for each row execute function public.events_record_history();

-- ─── Reorder without upsert ──────────────────────────────────────────────────
-- Runs as the caller (RLS applies): only rows the caller may update change,
-- and a row that no longer exists is simply skipped — never re-created.
-- Returns the number of rows changed.
create or replace function public.set_event_sort_orders(p_ids uuid[], p_orders integer[])
returns integer language sql security invoker set search_path = public as $$
  with input as (
    select * from unnest(p_ids, p_orders) as t(id, sort_order)
  ), changed as (
    update public.events e
       set sort_order = input.sort_order
      from input
     where e.id = input.id
       and e.sort_order is distinct from input.sort_order
    returning 1
  )
  select count(*)::integer from changed
$$;

-- ─── Row Level Security ──────────────────────────────────────────────────────

-- Fix for stage 1: an account without a household (anyone who signed up after
-- 20261013_households.sql and never opened the family-sharing settings) could
-- not save any event. events_fill_household creates the household during the
-- insert, but is_household_member() is STABLE, so it reads the statement's
-- starting snapshot and doesn't see that new membership — the insert check
-- failed and the household was rolled back with it, every time. This VOLATILE
-- twin sees rows written earlier in the same statement; it is used only in
-- the insert check below.
create or replace function public.is_household_member_now(hid uuid)
returns boolean language sql volatile security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

-- events: as stage 1, plus "family members only for visibility = 'shared'".
drop policy if exists "events_insert_household" on public.events;
create policy "events_insert_household" on public.events for insert with check (
  user_id = auth.uid() and household_id is not null and public.is_household_member_now(household_id)
);

drop policy if exists "events_select_household" on public.events;
create policy "events_select_household" on public.events for select using (
  user_id = auth.uid()
  or (scope = 'private' and visibility = 'shared'
      and household_id is not null and public.is_household_member(household_id))
);

drop policy if exists "events_update_household" on public.events;
create policy "events_update_household" on public.events for update
  using (
    user_id = auth.uid()
    or (scope = 'private' and visibility = 'shared'
        and household_id is not null and public.is_household_member(household_id))
  )
  with check (household_id is not null and public.is_household_member(household_id));

drop policy if exists "events_delete_household" on public.events;
create policy "events_delete_household" on public.events for delete using (
  user_id = auth.uid()
  or (scope = 'private' and visibility = 'shared'
      and household_id is not null and public.is_household_member(household_id))
);

-- event_history: read-only for clients (no insert/update/delete policies; the
-- trigger above writes as the table owner). Readable by whoever may read the
-- event: its creator, and — for a shared private event — its household.
alter table public.event_history enable row level security;

drop policy if exists "event_history_select_visible" on public.event_history;
create policy "event_history_select_visible" on public.event_history for select using (
  event_user_id = auth.uid()
  or (event_scope = 'private' and event_visibility = 'shared'
      and event_household_id is not null and public.is_household_member(event_household_id))
);

revoke insert, update, delete, truncate on public.event_history from anon, authenticated;
grant select on public.event_history to authenticated;

-- ─── Function permissions ────────────────────────────────────────────────────

revoke all on function public.events_record_history() from public, anon, authenticated;
revoke all on function public.event_history_ignored_columns() from public, anon, authenticated;
revoke all on function public.set_event_sort_orders(uuid[], integer[]) from public, anon;
-- Granted to anon like is_household_member: evaluated inside the events
-- insert policy, and returns false when signed out.
revoke all on function public.is_household_member_now(uuid) from public;
grant execute on function public.is_household_member_now(uuid) to anon, authenticated;
grant execute on function public.set_event_sort_orders(uuid[], integer[]) to authenticated;

commit;
