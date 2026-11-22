-- Joining a household no longer shares the joiner's existing events.
--
-- accept_household_invite(p_token, p_share_existing_events) — same arguments:
--   * false (what the app sends from now on): in the same single call as the
--     join, every private-mode event of the joiner becomes 自分だけ
--     (visibility = 'only_me') before it moves to the household. That
--     includes the creator-less events that become the joiner's own on joining
--     (someone left alone in a household who joins another one — see
--     20261123_household_leave_v2.sql). Task-mode events (scope = 'work') are
--     not touched: they were never shared anyway.
--   * true: unchanged — the private events are shared as they are (kept for a
--     possible choice on the join screen later).
--   Before this migration, false was refused with 'confirmation_required'.
--
-- Everything else is the same as in 20261123_household_leave_v2.sql.
-- check_household_invite is not changed. The member limit is not changed.
-- A failure anywhere rolls the whole call back.
--
-- Run the whole file at once in the Supabase SQL Editor, AFTER
-- supabase/scripts/backup_before_join_no_share.sql. It is idempotent.

begin;

create or replace function public.accept_household_invite(p_token text, p_share_existing_events boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv public.household_invites;
  old_hid uuid;
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

  if not p_share_existing_events then
    -- Not sharing: all my private events (including the ones that just became
    -- mine) become 自分だけ before they move into the household below.
    update public.events
       set visibility = 'only_me'
     where user_id = auth.uid()
       and scope = 'private'
       and visibility = 'shared';
  end if;

  -- All of the caller's events move with them, so none is left behind in the
  -- household removed below. Only private 共有 events are visible to the
  -- household (events RLS); 自分だけ and task-mode events stay the caller's.
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

revoke all on function public.accept_household_invite(text, boolean) from public, anon;
grant execute on function public.accept_household_invite(text, boolean) to authenticated;

commit;
