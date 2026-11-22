-- Invite links: 7-day expiry, a list for the settings screen, and revoking.
--
--   * household_invites.expires_at  — an invite can be used until this time
--                                     (7 days after it was created)
--   * household_invites.revoked_at  — set when the invite was revoked
--   * create_household_invite       — sets the expiry, and revokes the
--                                     household's earlier unused invites
--                                     (one usable link at a time)
--   * check_household_invite        — new status 'expired'; a revoked invite
--                                     is 'invalid' (same as a used one)
--   * accept_household_invite       — refuses expired / revoked invites
--   * list_household_invites()      — my household's invites, WITHOUT the
--                                     link (only date, expiry and status)
--   * revoke_household_invite(id)   — revokes an unused invite of my household
--
-- Existing unused invites get an expiry 7 days from when this file is run,
-- so no link that is out there now stops working suddenly.
--
-- Nothing here touches events, households, household_members or profiles.
-- Every function is a single statement for the caller, so each call either
-- happens completely or not at all (a failure rolls the whole call back).
--
-- Run the whole file at once in the Supabase SQL Editor (after
-- supabase/scripts/backup_before_invite_expiry.sql). It is idempotent:
-- running it again does no harm (the expiry backfill only fills empty values).

begin;

-- ─── Columns ─────────────────────────────────────────────────────────────────

alter table public.household_invites add column if not exists expires_at timestamptz;
alter table public.household_invites add column if not exists revoked_at timestamptz;

-- Backfill: still-usable invites get 7 days from now; used or revoked ones
-- get "created + 7 days" (only for completeness — they can't be used anyway).
update public.household_invites
   set expires_at = case
         when accepted_at is null and revoked_at is null then now() + interval '7 days'
         else created_at + interval '7 days'
       end
 where expires_at is null;

alter table public.household_invites alter column expires_at set default now() + interval '7 days';
alter table public.household_invites alter column expires_at set not null;

create index if not exists household_invites_household_created_idx
  on public.household_invites (household_id, created_at desc);

-- ─── Create ──────────────────────────────────────────────────────────────────

-- Creates a single-use invite (valid for 7 days) for the caller's household
-- and returns the token — the only time it is ever available in plain form.
-- Earlier invites of the household that are still usable are revoked, so
-- there is only ever one usable link.
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
       >= public.household_member_limit() then
    raise exception 'household_full';
  end if;

  update public.household_invites
     set revoked_at = now()
   where household_id = hid
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

-- What the invite page may know before joining — nothing about the household
-- itself (no names, no events): whether the link is usable, and how many of
-- the caller's own events would become shared.
-- Statuses: ok / invalid (unknown, used or revoked) / expired / already_member
-- / full / in_other_shared_household / not_authenticated.
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

-- ─── Accept ──────────────────────────────────────────────────────────────────

-- Joins the household of the invite. Same as before, plus: an expired invite
-- raises invite_expired, a revoked one invalid_invite.
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

-- ─── List ────────────────────────────────────────────────────────────────────

-- The invites of my household, newest first (at most 10). Never returns the
-- token or its hash. Status: active (still usable) / used / revoked / expired.
create or replace function public.list_household_invites()
returns table (id uuid, created_at timestamptz, expires_at timestamptz, status text, created_by_me boolean)
language sql stable security definer set search_path = public as $$
  select i.id, i.created_at, i.expires_at,
         case
           when i.accepted_at is not null then 'used'
           when i.revoked_at is not null then 'revoked'
           when i.expires_at <= now() then 'expired'
           else 'active'
         end,
         i.created_by = auth.uid()
    from public.household_invites i
   where i.household_id = (select m.household_id from public.household_members m where m.user_id = auth.uid())
   order by i.created_at desc
   limit 10;
$$;

-- ─── Revoke ──────────────────────────────────────────────────────────────────

-- Revokes an unused, not yet revoked invite of MY household. Returns true when
-- it was revoked, false otherwise (unknown id, another household's invite,
-- already used or already revoked) — without saying which, so it reveals
-- nothing about other households.
create or replace function public.revoke_household_invite(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  my_hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select household_id into my_hid from public.household_members where user_id = auth.uid();
  if my_hid is null then
    return false;
  end if;
  update public.household_invites
     set revoked_at = now()
   where id = p_invite_id
     and household_id = my_hid
     and accepted_at is null
     and revoked_at is null;
  return found;
end;
$$;

-- ─── Function permissions (same pattern as 20261013_households.sql) ──────────

revoke all on function public.create_household_invite() from public, anon;
revoke all on function public.check_household_invite(text) from public, anon;
revoke all on function public.accept_household_invite(text, boolean) from public, anon;
revoke all on function public.list_household_invites() from public, anon;
revoke all on function public.revoke_household_invite(uuid) from public, anon;

grant execute on function public.create_household_invite() to authenticated;
grant execute on function public.check_household_invite(text) to authenticated;
grant execute on function public.accept_household_invite(text, boolean) to authenticated;
grant execute on function public.list_household_invites() to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;

commit;
