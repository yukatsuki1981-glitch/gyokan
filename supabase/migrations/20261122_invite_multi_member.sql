-- Groundwork for households of more than two people.
--
--   * household_member_limit_for(household id) — THE one place that decides
--     how many people a household may have. Today it returns 2 for every
--     household. To allow more (or, later, a different number for paid
--     plans), change only this function.
--   * household_member_limit() — kept for the app; now "the limit of MY
--     household" (via household_member_limit_for).
--   * create / check / accept invite — the member check calls
--     household_member_limit_for(that household).
--   * create_household_invite — re-creating revokes only MY earlier unused
--     invites (was: every unused invite of the household). Invites made by
--     other members stay usable.
--
-- list_household_invites / revoke_household_invite are not changed.
-- Nothing here touches events, households, household_members or profiles.
-- Every function is a single statement for the caller, so each call either
-- happens completely or not at all.
--
-- Run the whole file at once in the Supabase SQL Editor, AFTER
-- supabase/scripts/backup_before_invite_multi_member.sql. It is idempotent.

begin;

-- ─── The member limit (the only place with the number) ───────────────────────

create or replace function public.household_member_limit_for(p_household_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  -- Same for every household for now. Change the number here (only here).
  select 2
$$;

-- The caller's household limit (the household is not created here; a caller
-- without one gets the limit a new household would have).
create or replace function public.household_member_limit()
returns integer language sql stable security definer set search_path = public as $$
  select public.household_member_limit_for(
    (select m.household_id from public.household_members m where m.user_id = auth.uid())
  )
$$;

-- ─── Create ──────────────────────────────────────────────────────────────────

-- Creates a single-use invite (valid for 7 days) for the caller's household
-- and returns the token — the only time it is ever available in plain form.
-- The caller's own earlier invites that are still usable are revoked; invites
-- made by other members are left alone.
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
  -- Serialize with joins / other invite creation for the same household.
  perform 1 from public.households where id = hid for update;
  if (select count(*) from public.household_members where household_id = hid)
       >= public.household_member_limit_for(hid) then
    raise exception 'household_full';
  end if;

  update public.household_invites
     set revoked_at = now()
   where household_id = hid
     and created_by = auth.uid()
     and accepted_at is null
     and revoked_at is null
     and expires_at > now();

  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.household_invites (household_id, token_hash, created_by, expires_at)
  values (hid, encode(sha256(convert_to(token, 'UTF8')), 'hex'), auth.uid(), now() + interval '7 days');
  return token;
end;
$$;

-- ─── Check ───────────────────────────────────────────────────────────────────

-- Unchanged except for the limit: household_member_limit_for(the invite's household).
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
       where user_id = auth.uid() and scope = 'private');
  end if;
end;
$$;

-- ─── Accept ──────────────────────────────────────────────────────────────────

-- Unchanged except for the limit: household_member_limit_for(the invite's household).
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
-- household_member_limit_for is internal: the functions above (security
-- definer) call it; clients use household_member_limit().

revoke all on function public.household_member_limit_for(uuid) from public, anon, authenticated;
revoke all on function public.household_member_limit() from public, anon;
revoke all on function public.create_household_invite() from public, anon;
revoke all on function public.check_household_invite(text) from public, anon;
revoke all on function public.accept_household_invite(text, boolean) from public, anon;

grant execute on function public.household_member_limit() to authenticated;
grant execute on function public.create_household_invite() to authenticated;
grant execute on function public.check_household_invite(text) to authenticated;
grant execute on function public.accept_household_invite(text, boolean) to authenticated;

commit;
