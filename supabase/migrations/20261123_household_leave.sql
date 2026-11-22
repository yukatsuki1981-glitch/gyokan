-- 「共有をやめる」: leave_household() — the caller leaves their shared household.
--
-- What happens (all in one call; a failure anywhere rolls everything back):
--   1. The household row is locked (same as accept_household_invite), so two
--      people leaving / joining at the same moment can't get in each other's way.
--   2. Refused (nothing changes) unless the caller shares the household with
--      at least one other person: error 'not_in_shared_household'.
--   3. The caller's membership is removed. Nobody takes over anything: there
--      is no admin; the household simply continues with the others — even
--      with only one person left (who can invite again).
--   4. The caller's unused invites to that household are revoked (they would
--      bring people into a household the caller is no longer in).
--   5. The caller gets a new one-person household.
--   6. Every event the caller CREATED moves with them to the new household:
--      the others can't see it any more. Events created by others stay.
--      Edits the caller made to others' events stay as they are.
--   7. History goes with the events: the history of the caller's events
--      (including events that were already deleted) now belongs to the new
--      household. History rows of others' events that name the caller as
--      editor stay with those events (the app shows 「以前のメンバー」).
--
-- Nothing here changes the member limit, tables, triggers or policies.
--
-- Run the whole file at once in the Supabase SQL Editor, AFTER
-- supabase/scripts/backup_before_household_leave.sql. It is idempotent.

begin;

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

  -- My events go with me. household_id is not recorded as an edit, and the
  -- history trigger moves each event's existing history rows along with it.
  update public.events
     set household_id = new_hid
   where user_id = me
     and household_id is distinct from new_hid;

  -- History of my events that no longer exist (deleted earlier) — the trigger
  -- above can't reach those.
  update public.event_history
     set event_household_id = new_hid
   where event_user_id = me
     and event_household_id = old_hid;

  return new_hid;
end;
$$;

revoke all on function public.leave_household() from public, anon;
grant execute on function public.leave_household() to authenticated;

commit;
