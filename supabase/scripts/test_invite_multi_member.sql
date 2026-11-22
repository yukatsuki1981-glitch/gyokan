-- Checks for migration 20261122_invite_multi_member.sql (groundwork for more
-- than two people per household). Run AFTER the migration.
--
-- Accounts:
--   t1  yukatsuki1981+t1@gmail.com   (test; must share one household with t2)
--   t2  yukatsuki1981+t2@gmail.com   (test)
--   u3 … u7  temporary accounts made INSIDE blocks 1 and 2
--            (gyokan-multi-test-N@example.invalid). The ROLLBACK at the end
--            of each block removes them again — they never exist outside it.
-- No other account is used.
--
-- Run each block separately (select it, then Run).
--   Block 0 and Block 3 only read.
--   Blocks 1 and 2 end with ROLLBACK, so nothing is kept: not the temporary
--   accounts, not the invites, not the joins, and not the temporary limit of
--   6 they set (the real limit stays 2).
-- Every block returns rows of: check / expected / actual / ok.
-- All rows must show ok = true.

-- ═════════════════════════════════════════════════════════════════════════════
-- Block 0 — prerequisites (read-only)
-- ═════════════════════════════════════════════════════════════════════════════
with ids as (
  select
    (select id from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com') as t1,
    (select id from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com') as t2
), hh as (
  select (select household_id from public.household_members, ids where user_id = ids.t1) as hid
), defs as (
  select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_household_invite', 'check_household_invite', 'accept_household_invite')
), r(no, check_name, expected, actual) as (
  select 1, 'accounts found (t1, t2)', '2',
    ((select count(*) from ids where t1 is not null) + (select count(*) from ids where t2 is not null))::text
  union all select 2, 't1 and t2 share one household, with 2 members', 'true / 2',
    ((select household_id from public.household_members, ids where user_id = ids.t2) = (select hid from hh))::text
      || ' / ' || (select count(*) from public.household_members, hh where household_id = hh.hid)::text
  union all select 3, 'the real limit is 2 (for t1''s household / for no household)', '2 / 2',
    public.household_member_limit_for((select hid from hh))::text || ' / ' || public.household_member_limit_for(null)::text
  union all select 4, 'create / check / accept all use household_member_limit_for', '3',
    (select count(*) from defs where def like '%household_member_limit_for(%')::text
  union all select 5, '... and none of them still calls the old household_member_limit()', '0',
    (select count(*) from defs where def like '%household_member_limit()%')::text
  union all select 6, 'create revokes only the caller''s own invites', '1',
    (select count(*) from defs where proname = 'create_household_invite' and def like '%created_by = auth.uid()%')::text
  union all select 7, 'clients can''t call household_member_limit_for (anon / authenticated)', 'false / false',
    has_function_privilege('anon', 'public.household_member_limit_for(uuid)', 'execute')::text || ' / ' ||
    has_function_privilege('authenticated', 'public.household_member_limit_for(uuid)', 'execute')::text
  union all select 8, 'clients can call household_member_limit() (authenticated)', 'true',
    has_function_privilege('authenticated', 'public.household_member_limit()', 'execute')::text
  union all select 9, 'no account already uses the temporary test e-mails', '0',
    (select count(*) from auth.users where email like 'gyokan-multi-test-%@example.invalid')::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;
-- For information (not a check): triggers on auth.users. Blocks 1 and 2 add
-- temporary accounts there; if anything is listed, tell Claude before running them.
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 1 — re-creating an invite revokes only MY earlier unused invite
--   (t1 and t2 both invite; u3 opens the links)
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table mm_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on mm_result to authenticated;
select set_config('mm.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('mm.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true),
       set_config('mm.u3', '00000000-0000-4000-8000-000000000303', true);

-- This block only: a temporary account u3, and room for more than 2 people.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', current_setting('mm.u3')::uuid,
        'authenticated', 'authenticated', 'gyokan-multi-test-3@example.invalid', now(), now());
create or replace function public.household_member_limit_for(p_household_id uuid)
returns integer language sql stable security definer set search_path = public as $$ select 6 $$;

create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- t1 invites (X1), t2 invites (Y1), then t1 re-creates (X2).
select pg_temp.act_as(current_setting('mm.t1'));
select set_config('mm.x1', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('mm.t2'));
select set_config('mm.y1', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('mm.t1'));
select set_config('mm.x2', public.create_household_invite(), true);

select pg_temp.act_as(current_setting('mm.u3'));
insert into mm_result
select 1, 't1''s old invite X1 after t1 re-created: check status', 'invalid',
  (select status from public.check_household_invite(current_setting('mm.x1')))
union all select 2, 't2''s invite Y1 is still usable', 'ok',
  (select status from public.check_household_invite(current_setting('mm.y1')))
union all select 3, 't1''s new invite X2 is usable', 'ok',
  (select status from public.check_household_invite(current_setting('mm.x2')));

select pg_temp.act_as(current_setting('mm.t1'));
insert into mm_result
-- created_at = now(): only the invites made in this block.
select 4, 't1 list: statuses of X1, Y1, X2', 'active,active,revoked',
  (select string_agg(status, ',' order by status) from public.list_household_invites() where created_at = now());

-- u3 joins with t2's invite.
select pg_temp.act_as(current_setting('mm.u3'));
do $$ begin
  perform public.accept_household_invite(current_setting('mm.y1'), true);
  insert into mm_result values (5, 'u3 joins with t2''s invite Y1', 'joined', 'joined');
exception when others then
  insert into mm_result values (5, 'u3 joins with t2''s invite Y1', 'joined', sqlerrm);
end $$;

select no, check_name, expected, actual, expected = actual as ok from mm_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 2 — with the limit set to 6 (this block only): the 3rd to 6th person
--   can join, the 7th is refused
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table mm_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on mm_result to authenticated;
select set_config('mm.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('mm.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true);

-- This block only: temporary accounts u3 … u7, and a limit of 6.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid,
       'authenticated', 'authenticated', 'gyokan-multi-test-' || n || '@example.invalid', now(), now()
  from generate_series(3, 7) as n;
create or replace function public.household_member_limit_for(p_household_id uuid)
returns integer language sql stable security definer set search_path = public as $$ select 6 $$;

create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
-- t1 makes an invite and user N joins with it; records the result as check N.
create function pg_temp.invite_and_join(p_inviter text, n int) returns void language plpgsql as $$
declare
  joiner text := '00000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0');
  tok text;
  result text;
begin
  perform pg_temp.act_as(p_inviter);
  tok := public.create_household_invite();
  perform pg_temp.act_as(joiner);
  begin
    perform public.accept_household_invite(tok, true);
    result := 'joined';
  exception when others then
    result := sqlerrm;
  end;
  insert into mm_result values (n, 'person ' || n || ' joins', 'joined', result);
end;
$$;

set local role authenticated;

select pg_temp.act_as(current_setting('mm.t1'));
insert into mm_result
select 1, 't1: household_member_limit() (temporarily 6 in this block)', '6', public.household_member_limit()::text
union all select 2, 't1: members before', '2', (select count(*) from public.household_members)::text;

select pg_temp.invite_and_join(current_setting('mm.t1'), 3);
select pg_temp.invite_and_join(current_setting('mm.t1'), 4);
select pg_temp.invite_and_join(current_setting('mm.t2'), 5);

-- 5 people now. Two invites are out (t1's A and t2's B), but only 1 seat.
select pg_temp.act_as(current_setting('mm.t1'));
select set_config('mm.a', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('mm.t2'));
select set_config('mm.b', public.create_household_invite(), true);

-- Person 6 uses A: joins (6 people = the limit).
select pg_temp.act_as('00000000-0000-4000-8000-000000000306');
do $$ begin
  perform public.accept_household_invite(current_setting('mm.a'), true);
  insert into mm_result values (6, 'person 6 joins', 'joined', 'joined');
exception when others then
  insert into mm_result values (6, 'person 6 joins', 'joined', sqlerrm);
end $$;

-- Person 7 uses B: refused.
select pg_temp.act_as('00000000-0000-4000-8000-000000000307');
insert into mm_result
select 7, 'person 7: check status of B', 'full',
  (select status from public.check_household_invite(current_setting('mm.b')));
do $$ begin
  perform public.accept_household_invite(current_setting('mm.b'), true);
  insert into mm_result values (8, 'person 7: join is refused', 'household_full', 'no error (joined)');
exception when others then
  insert into mm_result values (8, 'person 7: join is refused', 'household_full', sqlerrm);
end $$;

-- t1 can't make a new invite while the household is full.
select pg_temp.act_as(current_setting('mm.t1'));
do $$ begin
  perform public.create_household_invite();
  insert into mm_result values (9, 't1 makes an invite while full', 'household_full', 'no error (created)');
exception when others then
  insert into mm_result values (9, 't1 makes an invite while full', 'household_full', sqlerrm);
end $$;
insert into mm_result
select 10, 't1: members after', '6', (select count(*) from public.household_members)::text;

select no, check_name, expected, actual, expected = actual as ok from mm_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 3 — the real unused invite made on 11月16日 is still usable
--   (read-only: nothing is updated or deleted). Run it last.
-- ═════════════════════════════════════════════════════════════════════════════
with inv as (
  select i.*,
         case
           when i.accepted_at is not null then 'used'
           when i.revoked_at is not null then 'revoked'
           when i.expires_at <= now() then 'expired'
           else 'active'
         end as status
    from public.household_invites i
   where (i.created_at at time zone 'Asia/Tokyo')::date = date '2026-11-16'
), r(no, check_name, expected, actual) as (
  select 1, 'invites made on 2026-11-16 (JST) that are still usable', 'at least 1',
    case when (select count(*) from inv where status = 'active') >= 1 then 'at least 1'
         else (select count(*) from inv where status = 'active')::text end
  union all select 2, '... and none of them was revoked', '0',
    (select count(*) from inv where status = 'revoked')::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;
-- For information: those invites (no token is shown — only the hash exists).
select id,
       created_at at time zone 'Asia/Tokyo' as created_jst,
       expires_at at time zone 'Asia/Tokyo' as expires_jst,
       case
         when accepted_at is not null then 'used'
         when revoked_at is not null then 'revoked'
         when expires_at <= now() then 'expired'
         else 'active'
       end as status
  from public.household_invites
 where (created_at at time zone 'Asia/Tokyo')::date = date '2026-11-16';
