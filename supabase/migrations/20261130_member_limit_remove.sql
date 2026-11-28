-- Member limit 4, and removing a member from my household.
--
-- 1. household_member_limit_for(household id) returns 4 (was 2). It is still
--    the only place with the number; same arguments and return type. The
--    checks that use it are unchanged (create / check / accept invite): they
--    count the MEMBERS of the household only — unused invites are not
--    counted, so more invites than free seats may exist; whoever joins first
--    gets in, and a join to a full household is refused ('household_full').
--    The app reads the number through household_member_limit().
--
-- 2. remove_household_member(p_user_id) — 「相手を外す」.
--    * The caller and the person removed are in the same household; nobody
--      can remove themselves (that is leave_household, 「共有をやめる」).
--    * Who may remove: the OWNER when there is one — households.created_by,
--      while that person is still a member of the household. When there is no
--      owner (created_by empty, or its person is no longer a member), every
--      member may, equally.
--    * The household row is locked first (as joining / leaving do), then
--      everything is checked again.
--    * What happens to the removed person is exactly what leave_household
--      (20261123_household_leave_v2.sql) does for someone who leaves — the
--      same steps, copied, with "me" replaced by the person removed:
--        - they get a one-person household of their own;
--        - their 共有 events stay with the household, creator emptied
--          (「以前のメンバー」); they get a 自分だけ copy of each;
--        - their 自分だけ and task-mode events go with them, with history;
--        - the history of their 共有 events that were already deleted stays
--          with the household;
--        - their unused invite links are revoked.
--      Like leave_household, this does NOT set 'gyokan.system_change': the
--      steps change only user_id / household_id, which are never recorded as
--      edits (event_history_ignored_columns), so no history row is written
--      either way — and this keeps the result identical to leave_household
--      (events.updated_at is set by events_set_updated_at in both).
--    * Returns the removed person's new household id (leave_household returns
--      the leaver's new one).
--    * Errors (same style as the other functions):
--        not_authenticated        — not signed in
--        not_in_shared_household  — the caller is in no household
--        cannot_remove_self       — p_user_id is the caller
--        not_a_member             — p_user_id is empty, or not in the
--                                   caller's household
--        not_owner                — there is an owner, and it is not the caller
--
-- 3. get_member_remove_info() — for the screen: can_remove (whether the caller
--    may remove members of their household now, by the rule above) and
--    owner_user_id (the current owner, empty when there is none). Someone in
--    no household (or not signed in) gets false / empty.
--
-- leave_household, delete_my_account, accept_household_invite,
-- check_household_invite, create_household_invite and revoke_household_invite
-- are NOT changed. No table or column is changed.
--
-- Run the whole file at once in the Supabase SQL Editor, AFTER
-- supabase/scripts/backup_before_member_remove.sql. It is idempotent.

begin;

-- ─── 1. The member limit (the only place with the number) ────────────────────

create or replace function public.household_member_limit_for(p_household_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  -- Same for every household for now. Change the number here (only here).
  select 4
$$;

-- ─── 2. remove_household_member ──────────────────────────────────────────────

create or replace function public.remove_household_member(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target uuid := p_user_id;
  old_hid uuid;
  owner_id uuid;
  new_hid uuid;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  select household_id into old_hid from public.household_members where user_id = me;
  if old_hid is null then
    raise exception 'not_in_shared_household';
  end if;

  -- Lock, then check again: memberships may have changed while we waited.
  perform 1 from public.households where id = old_hid for update;
  if not exists (select 1 from public.household_members where household_id = old_hid and user_id = me) then
    raise exception 'not_in_shared_household';
  end if;

  if target = me then
    raise exception 'cannot_remove_self';
  end if;
  if target is null
     or not exists (select 1 from public.household_members where household_id = old_hid and user_id = target) then
    raise exception 'not_a_member';
  end if;

  -- The owner: created_by, while that person is still a member (else none).
  select h.created_by into owner_id
    from public.households h
   where h.id = old_hid
     and h.created_by is not null
     and exists (select 1 from public.household_members m
                  where m.household_id = h.id and m.user_id = h.created_by);
  if owner_id is not null and owner_id <> me then
    raise exception 'not_owner';
  end if;

  -- ── From here: the same steps as leave_household (v2), for `target` ──

  delete from public.household_members where household_id = old_hid and user_id = target;

  update public.household_invites
     set revoked_at = now()
   where household_id = old_hid
     and created_by = target
     and accepted_at is null
     and revoked_at is null;

  new_hid := public.ensure_household_for(target);

  -- 1. A copy of each of their shared events, as 自分だけ, in their new
  --    household. New id, no history (inserts are not recorded).
  insert into public.events
    (id, user_id, household_id, title, start_time, end_time, memo, sort_order,
     scope, color, visibility, created_at, updated_at)
  select gen_random_uuid(), target, new_hid, e.title, e.start_time, e.end_time, e.memo, e.sort_order,
         e.scope, e.color, 'only_me', e.created_at, now()
    from public.events e
   where e.user_id = target
     and e.household_id = old_hid
     and e.scope = 'private'
     and e.visibility = 'shared';

  -- 2. The originals stay with the household, creator emptied. The history
  --    trigger empties event_user_id on their history rows too.
  update public.events
     set user_id = null
   where user_id = target
     and household_id = old_hid
     and scope = 'private'
     and visibility = 'shared';

  -- 3. Same for the history of their shared events that were already deleted.
  update public.event_history
     set event_user_id = null
   where event_user_id = target
     and event_household_id = old_hid
     and event_scope = 'private'
     and event_visibility = 'shared';

  -- 4. Everything else of theirs (自分だけ, task-mode events) goes with them,
  --    with its history.
  update public.events
     set household_id = new_hid
   where user_id = target
     and household_id is distinct from new_hid;

  update public.event_history
     set event_household_id = new_hid
   where event_user_id = target
     and event_household_id = old_hid;

  return new_hid;
end;
$$;

-- ─── 3. get_member_remove_info ───────────────────────────────────────────────

create or replace function public.get_member_remove_info()
returns table (can_remove boolean, owner_user_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  hid uuid;
  owner_id uuid;
begin
  if auth.uid() is not null then
    select household_id into hid from public.household_members where user_id = auth.uid();
  end if;
  if hid is null then
    return query select false, null::uuid;
    return;
  end if;
  -- The same owner rule as remove_household_member.
  select h.created_by into owner_id
    from public.households h
   where h.id = hid
     and h.created_by is not null
     and exists (select 1 from public.household_members m
                  where m.household_id = h.id and m.user_id = h.created_by);
  return query select (owner_id is null or owner_id = auth.uid()), owner_id;
end;
$$;

-- ─── Function permissions ────────────────────────────────────────────────────

-- household_member_limit_for is internal (called by the security definer
-- functions); clients use household_member_limit().
revoke all on function public.household_member_limit_for(uuid) from public, anon, authenticated;
revoke all on function public.remove_household_member(uuid) from public, anon;
revoke all on function public.get_member_remove_info() from public, anon;

grant execute on function public.remove_household_member(uuid) to authenticated;
grant execute on function public.get_member_remove_info() to authenticated;

commit;
