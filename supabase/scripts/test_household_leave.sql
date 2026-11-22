-- ⚠ OUTDATED: these checks are for leave_household v1. After running
--   20261123_household_leave_v2.sql, use test_household_leave_v2.sql instead
--   (several checks below would fail by design).
--
-- Checks for 「共有をやめる」 (migration 20261123_household_leave.sql).
-- Run AFTER the migration.
--
-- Accounts:
--   t1  yukatsuki1981+t1@gmail.com   (test; must share one household with t2)
--   t2  yukatsuki1981+t2@gmail.com   (test)
--   u3  a temporary account made INSIDE blocks 1 and 2
--       (gyokan-leave-test-3@example.invalid); the ROLLBACK at the end of
--       the block removes it again.
-- No other account is used.
--
-- Run each block separately (select it, then Run). Each block shows one
-- small result table: check / expected / actual / ok. All rows must show
-- ok = true.
--   Block 0 and Block 3 only read.
--   Blocks 1 and 2 end with ROLLBACK: nothing they do is kept.

-- ═════════════════════════════════════════════════════════════════════════════
-- Block 0 — prerequisites (read-only)
-- ═════════════════════════════════════════════════════════════════════════════
with ids as (
  select
    (select id from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com') as t1,
    (select id from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com') as t2
), hh as (
  select (select household_id from public.household_members, ids where user_id = ids.t1) as hid
), r(no, check_name, expected, actual) as (
  select 1, 'accounts found (t1, t2)', '2',
    ((select count(*) from ids where t1 is not null) + (select count(*) from ids where t2 is not null))::text
  union all select 2, 't1 and t2 share one household, with 2 members', 'true / 2',
    ((select household_id from public.household_members, ids where user_id = ids.t2) = (select hid from hh))::text
      || ' / ' || (select count(*) from public.household_members, hh where household_id = hh.hid)::text
  union all select 3, 'leave_household() exists', '1',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'leave_household')::text
  union all select 4, 'who can call it (anon / authenticated)', 'false / true',
    has_function_privilege('anon', 'public.leave_household()', 'execute')::text || ' / ' ||
    has_function_privilege('authenticated', 'public.leave_household()', 'execute')::text
  union all select 5, 'the member limit is 2', '2', public.household_member_limit_for(null)::text
  union all select 6, 'no account already uses the temporary test e-mail', '0',
    (select count(*) from auth.users where email like 'gyokan-leave-test-%@example.invalid')::text
  union all select 7, 'triggers on auth.users (must be 0 before blocks 1 and 2)', '0',
    (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal)::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 1 — a group of 3 (t1, t2, u3); u3 leaves
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table lv_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on lv_result to authenticated;
select set_config('lv.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('lv.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true),
       set_config('lv.u3', '00000000-0000-4000-8000-000000000503', true);

-- This block only: a temporary account u3, and room for 3 people.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', current_setting('lv.u3')::uuid,
        'authenticated', 'authenticated', 'gyokan-leave-test-3@example.invalid', now(), now());
create or replace function public.household_member_limit_for(p_household_id uuid)
returns integer language sql stable security definer set search_path = public as $$ select 6 $$;
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- u3 joins t1's household.
select pg_temp.act_as(current_setting('lv.t1'));
select set_config('lv.tok', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('lv.u3'));
select public.accept_household_invite(current_setting('lv.tok'), true);

-- Events: E1 (t1), E2 (t2), E3 and E4 (u3) — all 共有.
select pg_temp.act_as(current_setting('lv.t1'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000511', current_setting('lv.t1')::uuid, 'leave E1 t1', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('lv.t2'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000512', current_setting('lv.t2')::uuid, 'leave E2 t2', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('lv.u3'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000513', current_setting('lv.u3')::uuid, 'leave E3 u3', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000514', current_setting('lv.u3')::uuid, 'leave E4 u3', now(), 'private', 'shared');
-- u3 edits t1's E1. t1 edits u3's E3 and deletes u3's E4.
update public.events set title = 'leave E1 edited by u3' where id = '00000000-0000-4000-8000-000000000511';
select pg_temp.act_as(current_setting('lv.t1'));
update public.events set title = 'leave E3 edited by t1' where id = '00000000-0000-4000-8000-000000000513';
delete from public.events where id = '00000000-0000-4000-8000-000000000514';

-- u3 leaves.
select pg_temp.act_as(current_setting('lv.u3'));
do $$ begin
  perform public.leave_household();
  insert into lv_result values (1, 'u3 leaves', 'left', 'left');
exception when others then
  insert into lv_result values (1, 'u3 leaves', 'left', sqlerrm);
end $$;
insert into lv_result
select 2, 'u3: own E3 still there / others'' E1, E2 hidden', '1 / 0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000513')::text || ' / ' ||
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000512'))::text
union all select 3, 'u3: history of E3 (t1''s edit) and E4 (t1''s delete) went along', '1 / 1',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000513')::text || ' / ' ||
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000514')::text;
do $$ begin
  perform public.leave_household();
  insert into lv_result values (4, 'u3 (now alone) leaves again: refused', 'not_in_shared_household', 'no error');
exception when others then
  insert into lv_result values (4, 'u3 (now alone) leaves again: refused', 'not_in_shared_household', sqlerrm);
end $$;

-- t1 and t2 after u3 left.
select pg_temp.act_as(current_setting('lv.t1'));
insert into lv_result
select 5, 't1: members now (t1, t2)', '2', (select count(*) from public.household_members)::text
union all select 6, 't1: u3''s E3 hidden / own E1 + t2''s E2 visible', '0 / 2',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000513')::text || ' / ' ||
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000512'))::text
union all select 7, 't1: u3''s edit of E1 stays', 'leave E1 edited by u3',
  (select title from public.events where id = '00000000-0000-4000-8000-000000000511')
union all select 8, 't1: history of u3''s E3 / E4 is gone', '0 / 0',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000513')::text || ' / ' ||
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000514')::text
union all select 9, 't1: E1 history still names u3 (shown as 以前のメンバー)', '1',
  (select count(*) from public.event_history
    where event_id = '00000000-0000-4000-8000-000000000511' and changed_by = current_setting('lv.u3')::uuid)::text;

-- t1 adds an event, t2 edits t1's E1: both work as before.
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000515', current_setting('lv.t1')::uuid, 'leave E5 t1', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('lv.t2'));
with u as (update public.events set title = 'leave E1 edited by t2'
           where id = '00000000-0000-4000-8000-000000000511' returning 1)
insert into lv_result
select 10, 'after: t1 adds E5, t2 sees it / t2 edits E1', '1 / 1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000515')::text || ' / ' ||
  (select count(*) from u)::text;

select no, check_name, expected, actual, expected = actual as ok from lv_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 2 — a group of 2 (t1, t2; the real limit of 2): t2 leaves, t1's
--   group stays and can invite; t2 can join another group (u3's)
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table lv_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on lv_result to authenticated;
select set_config('lv.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('lv.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true),
       set_config('lv.u3', '00000000-0000-4000-8000-000000000503', true);
select set_config('lv.hid', (select household_id::text from public.household_members
                              where user_id = current_setting('lv.t1')::uuid), true);

-- This block only: a temporary account u3 (with its own group). The limit stays 2.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', current_setting('lv.u3')::uuid,
        'authenticated', 'authenticated', 'gyokan-leave-test-3@example.invalid', now(), now());
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

select pg_temp.act_as(current_setting('lv.t2'));
do $$ begin
  perform public.leave_household();
  insert into lv_result values (1, 't2 leaves', 'left', 'left');
exception when others then
  insert into lv_result values (1, 't2 leaves', 'left', sqlerrm);
end $$;

select pg_temp.act_as(current_setting('lv.t1'));
insert into lv_result
select 2, 't1: same group as before, now 1 member', 'true / 1',
  ((select household_id from public.household_members where user_id = current_setting('lv.t1')::uuid)
     = current_setting('lv.hid')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members)::text
union all select 3, 't1: no t2 event visible any more', '0',
  (select count(*) from public.events where user_id = current_setting('lv.t2')::uuid)::text;
do $$ begin
  perform public.create_household_invite();
  insert into lv_result values (4, 't1 (alone) can make an invite', 'created', 'created');
exception when others then
  insert into lv_result values (4, 't1 (alone) can make an invite', 'created', sqlerrm);
end $$;
do $$ begin
  perform public.leave_household();
  insert into lv_result values (5, 't1 (alone) leaves: refused', 'not_in_shared_household', 'no error');
exception when others then
  insert into lv_result values (5, 't1 (alone) leaves: refused', 'not_in_shared_household', sqlerrm);
end $$;

-- t2 joins another group: u3's.
select pg_temp.act_as(current_setting('lv.u3'));
select set_config('lv.tok', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('lv.t2'));
do $$ begin
  perform public.accept_household_invite(current_setting('lv.tok'), true);
  insert into lv_result values (6, 't2 joins u3''s group', 'joined', 'joined');
exception when others then
  insert into lv_result values (6, 't2 joins u3''s group', 'joined', sqlerrm);
end $$;
insert into lv_result
select 7, 't2: members of the new group', '2', (select count(*) from public.household_members)::text;

select no, check_name, expected, actual, expected = actual as ok from lv_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 3 — after blocks 1 and 2: nothing was kept (read-only)
-- ═════════════════════════════════════════════════════════════════════════════
with ids as (
  select
    (select id from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com') as t1,
    (select id from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com') as t2
), r(no, check_name, expected, actual) as (
  select 1, 'the member limit is still 2', '2', public.household_member_limit_for(null)::text
  union all select 2, 't1 and t2 still share one household', 'true',
    ((select household_id from public.household_members, ids where user_id = ids.t1)
      = (select household_id from public.household_members, ids where user_id = ids.t2))::text
  union all select 3, 'no temporary account left', '0',
    (select count(*) from auth.users where email like 'gyokan-leave-test-%@example.invalid')::text
  union all select 4, 'no test event left', '0',
    (select count(*) from public.events where id::text like '00000000-0000-4000-8000-0000000005%')::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;
