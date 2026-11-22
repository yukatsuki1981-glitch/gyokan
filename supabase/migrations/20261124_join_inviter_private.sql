-- The inviter's existing events are not shared with the person who joins
-- either (the same rule as for the joiner, 20261123_join_no_share.sql).
--
-- accept_household_invite(p_token, p_share_existing_events) — same arguments.
-- New: when the household being joined has exactly ONE member before the join
-- (the inviter), then for that member, in the same single call as the join:
--   (a) every private-mode 共有 event becomes 自分だけ;
--   (b) every creator-less event of the household (left by a former member)
--       becomes theirs, as 自分だけ;
--   (c) task-mode events and events already 自分だけ are not touched.
--   This happens whatever p_share_existing_events is. The joiner's own events
--   are handled exactly as before.
--   With 2 or more members already there, nothing of the above happens: those
--   members already share with each other, and their events are not "before
--   joining" for them. (With the current limit of 2 this can't happen: a full
--   household can't be joined.)
-- The household row is locked before members are counted, so two people
-- joining at the same moment can't both see "one member".
--
-- These updates are a change made by the system, not an edit by anyone:
--   * events.updated_at keeps its old value;
--   * no new history row is written (it would otherwise name the JOINER as the
--     editor of the inviter's events). Earlier history rows still follow the
--     event (they become 自分だけ with it), as always.
-- For this, three triggers look at a transaction-local setting
-- 'gyokan.system_change' (is_system_change()) — honoured only inside
-- maintenance code, never for the app's roles authenticated / anon:
--   * events_keep_creator (replaced): lets the system change visibility of
--     events whose creator is not the signed-in user (the joiner)
--   * events_record_history (replaced): no new history row
--   * events_zz_keep_updated_at (new; runs after events_set_updated_at)
--
-- Run the whole file at once in the Supabase SQL Editor, AFTER
-- supabase/scripts/backup_before_join_inviter_private.sql. It is idempotent.

begin;

-- ─── "System change" setting ─────────────────────────────────────────────────

-- True inside a maintenance function that marked its changes as a system
-- change. Never true for the app's own roles.
create or replace function public.is_system_change()
returns boolean language sql stable as $$
  select current_user not in ('authenticated', 'anon')
     and coalesce(current_setting('gyokan.system_change', true), '') = 'on'
$$;

-- ─── Keep updated_at on system changes ───────────────────────────────────────
-- Fires after events_set_updated_at (BEFORE triggers run in name order).
create or replace function public.events_keep_updated_at_on_system_change()
returns trigger language plpgsql as $$
begin
  if public.is_system_change() then
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists events_zz_keep_updated_at on public.events;
create trigger events_zz_keep_updated_at
  before update on public.events
  for each row execute function public.events_keep_updated_at_on_system_change();

-- ─── events_keep_creator ─────────────────────────────────────────────────────
-- Same as 20261123_household_leave_v2.sql, plus: a system change may change
-- scope / visibility. (Joining runs as the JOINER, who is not the creator of
-- the inviter's events — without this, making them 自分だけ would silently be
-- undone.) Never relaxed for the app's roles: is_system_change() is false there.
create or replace function public.events_keep_creator()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    -- Editing a family member's event must not make it "mine" (or nobody's).
    new.user_id := old.user_id;
  end if;
  -- Only the creator may change scope or visibility; a creator-less event has
  -- no creator, so nobody signed in can.
  if auth.uid() is not null and auth.uid() is distinct from old.user_id
     and not public.is_system_change() then
    new.scope := old.scope;
    new.visibility := old.visibility;
  end if;
  return new;
end;
$$;

-- ─── events_record_history ───────────────────────────────────────────────────
-- Same as 20261123_household_leave_v2.sql, plus: a system change keeps the
-- earlier history rows in step but writes no new row.
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

    -- Not an edit by anyone (e.g. joining makes the inviter's events 自分だけ).
    if public.is_system_change() then
      return null;
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

-- ─── accept_household_invite ─────────────────────────────────────────────────
-- Same as 20261123_join_no_share.sql, plus the inviter part described above.
create or replace function public.accept_household_invite(p_token text, p_share_existing_events boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv public.household_invites;
  old_hid uuid;
  inviter uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_share_existing_events is null then
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

  -- Serialize joins to the same household so the member limit holds — and
  -- so the "only one member" check below can't be raced.
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

  -- ── The inviter's side ──
  -- Only when the household has exactly one member now: that member's events
  -- so far were nobody else's business, and stay that way. With 2 or more
  -- members (not possible with the current limit of 2) they already share
  -- with each other, so nothing is changed.
  if (select count(*) from public.household_members where household_id = inv.household_id) = 1 then
    select user_id into inviter from public.household_members where household_id = inv.household_id;

    perform set_config('gyokan.system_change', 'on', true);

    -- (b) creator-less events of the household: the inviter's, as 自分だけ.
    update public.events
       set user_id = inviter,
           visibility = 'only_me'
     where household_id = inv.household_id
       and user_id is null;

    -- (a) the inviter's private 共有 events: 自分だけ. (c) task-mode and
    -- already-自分だけ events are not matched.
    update public.events
       set visibility = 'only_me'
     where user_id = inviter
       and scope = 'private'
       and visibility = 'shared';

    -- History of the household's private 共有 events that were already
    -- deleted (no event row left for the trigger to follow): 自分だけ too —
    -- the inviter's (or, if creator-less, now the inviter's).
    update public.event_history
       set event_visibility = 'only_me',
           event_user_id = coalesce(event_user_id, inviter)
     where event_household_id = inv.household_id
       and event_scope = 'private'
       and event_visibility = 'shared';

    perform set_config('gyokan.system_change', 'off', true);
  end if;

  -- ── The joiner's side (unchanged) ──
  if old_hid is not null then
    -- I am the only one left in my old household (checked above): its
    -- creator-less events become mine, so they don't end up belonging to
    -- nobody when that household is removed below.
    update public.events
       set user_id = auth.uid()
     where household_id = old_hid
       and user_id is null;
    update public.event_history
       set event_user_id = auth.uid()
     where event_household_id = old_hid
       and event_user_id is null;
  end if;

  if not p_share_existing_events then
    -- Not sharing: all my private events (including the ones that just became
    -- mine) become 自分だけ before they move into the household below.
    update public.events
       set visibility = 'only_me'
     where user_id = auth.uid()
       and scope = 'private'
       and visibility = 'shared';
  end if;

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

-- is_system_change() runs inside events_zz_keep_updated_at, which fires with
-- the APP's role on every event edit: the app roles must be able to call it
-- (for them it always returns false). Without this grant every edit would fail.
revoke all on function public.is_system_change() from public;
grant execute on function public.is_system_change() to anon, authenticated;
revoke all on function public.events_keep_updated_at_on_system_change() from public, anon, authenticated;
revoke all on function public.events_record_history() from public, anon, authenticated;
revoke all on function public.accept_household_invite(text, boolean) from public, anon;
grant execute on function public.accept_household_invite(text, boolean) to authenticated;

commit;
