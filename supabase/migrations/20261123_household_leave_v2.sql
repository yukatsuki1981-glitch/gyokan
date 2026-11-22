-- 「共有をやめる」 v2 — replaces leave_household() from 20261123_household_leave.sql.
--
-- New behaviour when someone leaves their shared household:
--   * Their shared events (private mode, 共有) STAY with the household as they
--     are; only the creator is emptied (events.user_id = null). The others
--     lose nothing and keep seeing / editing / deleting them; the app shows
--     the creator as 「以前のメンバー」.
--   * The leaver gets a COPY of each of those events, as 自分だけ, in their new
--     one-person household. The copy has no history (a fresh event).
--   * Their 自分だけ events and task-mode events go with them, as before.
--   * The leaver can no longer see / edit / delete the originals, nor their
--     history: they are neither the creator nor a member any more.
--   * Their edits to others' events stay (history shows 「以前のメンバー」).
--
-- What else changes to make that safe:
--   * events.user_id may be null ("creator has left"). A check makes sure such
--     an event is always a shared private event, so it can never become
--     invisible to everyone.
--   * events_keep_creator: the app (roles authenticated / anon) still can never
--     change the creator. Only maintenance code can — the security definer
--     functions here (they run as their owner) and the SQL Editor. Nobody can
--     make a creator-less event 自分だけ / work (only the creator may, and
--     there is none).
--   * event_history.event_user_id may be null too (history of creator-less
--     events; without this, editing such an event would fail).
--   * events_record_history: deleting a creator-less event is recorded (it
--     used to skip a delete whenever the creator's account was missing).
--   * accept_household_invite: someone alone in a household who joins another
--     one takes the creator-less events of their old household along as THEIR
--     OWN events (their old household is removed, so the events would
--     otherwise belong to nobody). check_household_invite counts them in
--     「あなたの既存の予定(◯件)」.
--
-- RLS policies are NOT changed: they already give access only to the creator
-- (user_id = auth.uid(), never true for null) and to household members.
--
-- Run the whole file at once in the Supabase SQL Editor, AFTER
-- supabase/scripts/backup_before_household_leave_v2.sql. It is idempotent.

begin;

-- ─── Columns and checks ──────────────────────────────────────────────────────

alter table public.events alter column user_id drop not null;

alter table public.events drop constraint if exists events_no_creator_shared_check;
alter table public.events
  add constraint events_no_creator_shared_check
  check (user_id is not null or (scope = 'private' and visibility = 'shared'));

alter table public.event_history alter column event_user_id drop not null;

-- ─── events_keep_creator ─────────────────────────────────────────────────────
-- Same trigger, new rule for user_id: only maintenance code may change it.
-- current_user is 'authenticated' / 'anon' for everything the app does
-- (direct table access and SECURITY INVOKER functions); inside a SECURITY
-- DEFINER function it is the function's owner, and in the SQL Editor it is
-- postgres.
create or replace function public.events_keep_creator()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- Editing a family member's event must not make it "mine" (or nobody's).
    new.user_id := old.user_id;
  end if;
  -- Only the creator may change scope or visibility; a creator-less event has
  -- no creator, so nobody signed in can.
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

-- ─── events_record_history ───────────────────────────────────────────────────
-- Same as 20261018_event_visibility_and_history.sql, except the delete skip:
-- only when there IS a creator whose account no longer exists.
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
    -- (e.g. switched to 'only_me', or its creator left: see leave_household).
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
  -- auth.users), there is nobody left to show it to: don't record. A
  -- creator-less event (user_id null) still belongs to its household: record.
  if old.user_id is not null and not exists (select 1 from auth.users where id = old.user_id) then
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

-- ─── leave_household (v2) ────────────────────────────────────────────────────

create or replace function public.leave_household()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  old_hid uuid;
  new_hid uuid;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  select household_id into old_hid from public.household_members where user_id = me;
  if old_hid is null then
    raise exception 'not_in_shared_household';
  end if;

  -- Lock, then check again: the membership or the head count may have
  -- changed while we waited for the lock.
  perform 1 from public.households where id = old_hid for update;
  if not exists (select 1 from public.household_members where household_id = old_hid and user_id = me)
     or (select count(*) from public.household_members where household_id = old_hid) < 2 then
    raise exception 'not_in_shared_household';
  end if;

  delete from public.household_members where household_id = old_hid and user_id = me;

  update public.household_invites
     set revoked_at = now()
   where household_id = old_hid
     and created_by = me
     and accepted_at is null
     and revoked_at is null;

  new_hid := public.ensure_household_for(me);

  -- 1. A copy of each of my shared events, as 自分だけ, in my new household.
  --    New id, no history (inserts are not recorded).
  insert into public.events
    (id, user_id, household_id, title, start_time, end_time, memo, sort_order,
     scope, color, visibility, created_at, updated_at)
  select gen_random_uuid(), me, new_hid, e.title, e.start_time, e.end_time, e.memo, e.sort_order,
         e.scope, e.color, 'only_me', e.created_at, now()
    from public.events e
   where e.user_id = me
     and e.household_id = old_hid
     and e.scope = 'private'
     and e.visibility = 'shared';

  -- 2. The originals stay with the household, creator emptied. The history
  --    trigger empties event_user_id on their history rows too, so only the
  --    household can read it. (user_id is not recorded as an edit.)
  update public.events
     set user_id = null
   where user_id = me
     and household_id = old_hid
     and scope = 'private'
     and visibility = 'shared';

  -- 3. Same for the history of my shared events that were already deleted
  --    (no event row left for the trigger to follow).
  update public.event_history
     set event_user_id = null
   where event_user_id = me
     and event_household_id = old_hid
     and event_scope = 'private'
     and event_visibility = 'shared';

  -- 4. Everything else of mine (自分だけ, task-mode events) comes with me,
  --    with its history.
  update public.events
     set household_id = new_hid
   where user_id = me
     and household_id is distinct from new_hid;

  update public.event_history
     set event_household_id = new_hid
   where event_user_id = me
     and event_household_id = old_hid;

  return new_hid;
end;
$$;

-- ─── check_household_invite ──────────────────────────────────────────────────
-- Same as 20261122_invite_multi_member.sql, except my_event_count: it also
-- counts the creator-less events of my household (they become mine on joining).
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
  if inv.id is null or inv.accepted_at is not null or inv.revoked_at is not null then
    return query select 'invalid'::text, 0;
  elsif inv.expires_at <= now() then
    return query select 'expired'::text, 0;
  elsif my_hid = inv.household_id then
    return query select 'already_member'::text, 0;
  elsif (select count(*) from public.household_members where household_id = inv.household_id)
          >= public.household_member_limit_for(inv.household_id) then
    return query select 'full'::text, 0;
  elsif my_hid is not null
        and (select count(*) from public.household_members where household_id = my_hid) > 1 then
    -- "> 1": I already share with someone else (not a limit check).
    return query select 'in_other_shared_household'::text, 0;
  else
    return query select 'ok'::text,
      (select count(*)::integer from public.events
       where (user_id = auth.uid() and scope = 'private')
          or (user_id is null and my_hid is not null and household_id = my_hid));
  end if;
end;
$$;

-- ─── accept_household_invite ─────────────────────────────────────────────────
-- Same as 20261122_invite_multi_member.sql, plus: the creator-less events of
-- my old household become mine before they move with me.
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
  if inv.id is null or inv.accepted_at is not null or inv.revoked_at is not null then
    raise exception 'invalid_invite';
  end if;
  if inv.expires_at <= now() then
    raise exception 'invite_expired';
  end if;

  -- Serialize joins to the same household so the member limit holds.
  perform 1 from public.households where id = inv.household_id for update;

  select household_id into old_hid from public.household_members where user_id = auth.uid();
  if old_hid = inv.household_id then
    raise exception 'already_member';
  end if;
  if (select count(*) from public.household_members where household_id = inv.household_id)
       >= public.household_member_limit_for(inv.household_id) then
    raise exception 'household_full';
  end if;
  if old_hid is not null
     and (select count(*) from public.household_members where household_id = old_hid) > 1 then
    raise exception 'in_other_shared_household';
  end if;

  if old_hid is not null then
    -- I am the only one left in my old household (checked just above): its
    -- creator-less events — left behind by someone who stopped sharing —
    -- become mine, so they don't end up belonging to nobody when that
    -- household is removed below. (The history trigger follows.)
    update public.events
       set user_id = auth.uid()
     where household_id = old_hid
       and user_id is null;
    -- History of such events that were already deleted: mine too.
    update public.event_history
       set event_user_id = auth.uid()
     where event_household_id = old_hid
       and event_user_id is null;
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

-- ─── Function permissions ────────────────────────────────────────────────────

revoke all on function public.leave_household() from public, anon;
revoke all on function public.check_household_invite(text) from public, anon;
revoke all on function public.accept_household_invite(text, boolean) from public, anon;
revoke all on function public.events_record_history() from public, anon, authenticated;

grant execute on function public.leave_household() to authenticated;
grant execute on function public.check_household_invite(text) to authenticated;
grant execute on function public.accept_household_invite(text, boolean) to authenticated;

commit;
