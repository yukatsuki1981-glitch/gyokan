-- Checks for invite expiry / revoking. Run AFTER migration 20261122_invite_expiry.sql.
--
-- Accounts are looked up by e-mail — nothing to replace by hand:
--   t1  yukatsuki1981+t1@gmail.com   (test)
--   t2  yukatsuki1981+t2@gmail.com   (test)
-- No other account is used.
--
-- Run each block separately (select it, then Run).
--   Block 0 only reads.
--   Block 1 changes things as t1/t2 and ends with ROLLBACK, so nothing is
--   kept — not the invites it creates, not the household changes it makes.
-- Every block returns rows of: check / expected / actual / ok.
-- All rows must show ok = true.

-- ═════════════════════════════════════════════════════════════════════════════
-- Block 0 — prerequisites (read-only)
-- ═════════════════════════════════════════════════════════════════════════════
with ids as (
  select
    (select id from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com') as t1,
    (select id from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com') as t2
), r(no, check_name, expected, actual) as (
  select 1, 'accounts found (t1, t2)', '2',
    ((select count(*) from ids where t1 is not null) + (select count(*) from ids where t2 is not null))::text
  union all select 2, 'household_invites has expires_at and revoked_at', '2',
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'household_invites'
        and column_name in ('expires_at', 'revoked_at'))::text
  union all select 3, 'expires_at is NOT NULL', 'NO',
    (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'household_invites' and column_name = 'expires_at')
  union all select 4, 'usable invites that expire more than 7 days from now', '0',
    (select count(*) from public.household_invites
      where accepted_at is null and revoked_at is null
        and expires_at > now() + interval '7 days 1 minute')::text
  union all select 5, 'functions exist (create/check/accept/list/revoke)', '5',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('create_household_invite', 'check_household_invite', 'accept_household_invite',
                          'list_household_invites', 'revoke_household_invite'))::text
  union all select 6, 'list_household_invites returns no token', 'false',
    (pg_get_function_result('public.list_household_invites()'::regprocedure) ilike '%token%')::text
  union all select 7, 'anon can call list / revoke', 'false / false',
    has_function_privilege('anon', 'public.list_household_invites()', 'execute')::text || ' / ' ||
    has_function_privilege('anon', 'public.revoke_household_invite(uuid)', 'execute')::text
  union all select 8, 'authenticated can call list / revoke', 'true / true',
    has_function_privilege('authenticated', 'public.list_household_invites()', 'execute')::text || ' / ' ||
    has_function_privilege('authenticated', 'public.revoke_household_invite(uuid)', 'execute')::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;
-- For information (not a check): invites by state right now.
select case
         when accepted_at is not null then 'used'
         when revoked_at is not null then 'revoked'
         when expires_at <= now() then 'expired'
         else 'active'
       end as status,
       count(*)
  from public.household_invites group by 1 order by 1;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 1 — expired / revoked / re-created / another household's invite
--   (t1 invites, t2 is the one opening the links)
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table ie_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on ie_result to authenticated;
select set_config('ie.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('ie.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true);

-- For this block only (rolled back at the end): t2 leaves every household,
-- so t1's household has room for an invite and t2 can open t1's links.
delete from public.household_members where user_id = current_setting('ie.t2')::uuid;

set local role authenticated;

-- ── t1 creates invite A; it is then made expired ────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ie.t1'), 'role', 'authenticated')::text, true);
select set_config('ie.tok_a', public.create_household_invite(), true);

reset role;  -- back to the SQL Editor's role to age invite A
update public.household_invites
   set expires_at = now() - interval '1 minute'
 where token_hash = encode(sha256(convert_to(current_setting('ie.tok_a'), 'UTF8')), 'hex');
set local role authenticated;

-- ── t2 opens invite A ───────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ie.t2'), 'role', 'authenticated')::text, true);
insert into ie_result
select 1, 'expired invite: check status', 'expired',
  (select status from public.check_household_invite(current_setting('ie.tok_a')));
do $$ begin
  perform public.accept_household_invite(current_setting('ie.tok_a'), true);
  insert into ie_result values (2, 'expired invite: accept is refused', 'invite_expired', 'no error (joined)');
exception when others then
  insert into ie_result values (2, 'expired invite: accept is refused', 'invite_expired', sqlerrm);
end $$;

-- ── t1 creates invite B, then re-creates (invite C) ─────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ie.t1'), 'role', 'authenticated')::text, true);
select set_config('ie.tok_b', public.create_household_invite(), true);
select set_config('ie.tok_c', public.create_household_invite(), true);
insert into ie_result
select 3, 't1 list: usable invites after re-creating', '1',
  (select count(*) from public.list_household_invites() where status = 'active')::text;
select set_config('ie.id_c', (select id::text from public.list_household_invites() where status = 'active'), true);

select set_config('request.jwt.claims', json_build_object('sub', current_setting('ie.t2'), 'role', 'authenticated')::text, true);
insert into ie_result
select 4, 'old invite B after re-creating: check status', 'invalid',
  (select status from public.check_household_invite(current_setting('ie.tok_b')))
union all select 5, 'new invite C: check status', 'ok',
  (select status from public.check_household_invite(current_setting('ie.tok_c')));
do $$ begin
  perform public.accept_household_invite(current_setting('ie.tok_b'), true);
  insert into ie_result values (6, 'old invite B: accept is refused', 'invalid_invite', 'no error (joined)');
exception when others then
  insert into ie_result values (6, 'old invite B: accept is refused', 'invalid_invite', sqlerrm);
end $$;

-- ── another household can't revoke (or see) t1's invite ────────────────────
-- t2 gets a one-person household of its own (rolled back at the end).
select public.ensure_my_household();
insert into ie_result
select 7, 't2 (other household) revokes t1''s invite C', 'false',
  public.revoke_household_invite(current_setting('ie.id_c')::uuid)::text
union all select 8, 't2 does not see t1''s invites in its list', '0',
  (select count(*) from public.list_household_invites() where id = current_setting('ie.id_c')::uuid)::text;
insert into ie_result
select 9, 'invite C is still usable for t2', 'ok',
  (select status from public.check_household_invite(current_setting('ie.tok_c')));

-- ── t1 revokes invite C ─────────────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ie.t1'), 'role', 'authenticated')::text, true);
insert into ie_result
select 10, 't1 revokes its invite C', 'true',
  public.revoke_household_invite(current_setting('ie.id_c')::uuid)::text;
insert into ie_result
select 11, 't1 revokes invite C again', 'false',
  public.revoke_household_invite(current_setting('ie.id_c')::uuid)::text;
insert into ie_result
select 12, 't1 list: statuses of A, B, C', 'expired,revoked,revoked',
  -- created_at = now(): only the invites made in this block (now() is the
  -- start time of this transaction), not any real ones.
  (select string_agg(status, ',' order by status) from public.list_household_invites()
    where created_at = now());

select set_config('request.jwt.claims', json_build_object('sub', current_setting('ie.t2'), 'role', 'authenticated')::text, true);
insert into ie_result
select 13, 'revoked invite C: check status', 'invalid',
  (select status from public.check_household_invite(current_setting('ie.tok_c')));
do $$ begin
  perform public.accept_household_invite(current_setting('ie.tok_c'), true);
  insert into ie_result values (14, 'revoked invite C: accept is refused', 'invalid_invite', 'no error (joined)');
exception when others then
  insert into ie_result values (14, 'revoked invite C: accept is refused', 'invalid_invite', sqlerrm);
end $$;

-- ── the normal case still works: new invite D, t2 joins ─────────────────────
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ie.t1'), 'role', 'authenticated')::text, true);
select set_config('ie.tok_d', public.create_household_invite(), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ie.t2'), 'role', 'authenticated')::text, true);
insert into ie_result
select 15, 'new invite D: check status', 'ok',
  (select status from public.check_household_invite(current_setting('ie.tok_d')));
do $$ begin
  perform public.accept_household_invite(current_setting('ie.tok_d'), true);
  insert into ie_result values (16, 'new invite D: t2 joins', 'joined', 'joined');
exception when others then
  insert into ie_result values (16, 'new invite D: t2 joins', 'joined', sqlerrm);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ie.t1'), 'role', 'authenticated')::text, true);
insert into ie_result
select 17, 't1 list: invite D is used', '1',
  (select count(*) from public.list_household_invites() where status = 'used' and created_at = now())::text
union all select 18, 'used invite D: check status', 'invalid',
  (select status from public.check_household_invite(current_setting('ie.tok_d')));

select no, check_name, expected, actual, expected = actual as ok from ie_result order by no;
rollback;
