-- Checks for 「共有をやめる」 v2 (migration 20261123_household_leave_v2.sql).
-- Run AFTER the migration.
--
-- Accounts:
--   t1  yukatsuki1981+t1@gmail.com   (test; must share one household with t2)
--   t2  yukatsuki1981+t2@gmail.com   (test)
--   u3, u4  temporary accounts made INSIDE blocks 1 and 2
--           (gyokan-leave2-test-N@example.invalid); the ROLLBACK at the end
--           of the block removes them again.
-- No other account is used.
--
-- Run each block separately (select it, then Run). Each block shows one
-- result table: check / expected / actual / ok. All rows must show ok = true.
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
  union all select 3, 'events.user_id / event_history.event_user_id may be empty', 'YES / YES',
    (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'events' and column_name = 'user_id') || ' / ' ||
    (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'event_history' and column_name = 'event_user_id')
  union all select 4, 'check events_no_creator_shared_check exists', '1',
    (select count(*) from pg_constraint where conname = 'events_no_creator_shared_check')::text
  union all select 5, 'leave_household is v2 (makes copies)', 'true',
    (select pg_get_functiondef('public.leave_household()'::regprocedure) like '%''only_me''%')::text
  union all select 6, 'who can call leave_household (anon / authenticated)', 'false / true',
    has_function_privilege('anon', 'public.leave_household()', 'execute')::text || ' / ' ||
    has_function_privilege('authenticated', 'public.leave_household()', 'execute')::text
  union all select 7, 'the member limit is 2', '2', public.household_member_limit_for(null)::text
  union all select 8, 'no account already uses the temporary test e-mails', '0',
    (select count(*) from auth.users where email like 'gyokan-leave2-test-%@example.invalid')::text
  union all select 9, 'triggers on auth.users (must be 0 before blocks 1 and 2)', '0',
    (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal)::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 1 — a group of 3 (t1, t2, u3); u3 leaves
--   E1 t1 共有 / E2 t2 共有 / E3, E4 u3 共有 / E5 u3 自分だけ
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table lv_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on lv_result to authenticated;
select set_config('lv.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('lv.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true),
       set_config('lv.u3', '00000000-0000-4000-8000-000000000603', true);

-- This block only: a temporary account u3, and room for 3 people.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', current_setting('lv.u3')::uuid,
        'authenticated', 'authenticated', 'gyokan-leave2-test-3@example.invalid', now(), now());
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

select pg_temp.act_as(current_setting('lv.t1'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000611', current_setting('lv.t1')::uuid, 'lv2 E1 t1', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('lv.t2'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000612', current_setting('lv.t2')::uuid, 'lv2 E2 t2', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('lv.u3'));
insert into public.events (id, user_id, title, start_time, scope, visibility, memo, color) values
  ('00000000-0000-4000-8000-000000000613', current_setting('lv.u3')::uuid, 'lv2 E3 u3', now(), 'private', 'shared', 'memo3', '#ff0000'),
  ('00000000-0000-4000-8000-000000000614', current_setting('lv.u3')::uuid, 'lv2 E4 u3', now(), 'private', 'shared', '', null),
  ('00000000-0000-4000-8000-000000000615', current_setting('lv.u3')::uuid, 'lv2 E5 u3 only', now(), 'private', 'only_me', '', null);
-- u3 edits t1's E1. t1 edits u3's E3 and deletes u3's E4.
update public.events set title = 'lv2 E1 by u3' where id = '00000000-0000-4000-8000-000000000611';
select pg_temp.act_as(current_setting('lv.t1'));
update public.events set title = 'lv2 E3 by t1' where id = '00000000-0000-4000-8000-000000000613';
delete from public.events where id = '00000000-0000-4000-8000-000000000614';

-- ── u3 leaves ───────────────────────────────────────────────────────────────
select pg_temp.act_as(current_setting('lv.u3'));
do $$ begin
  perform public.leave_household();
  insert into lv_result values (1, 'u3 leaves', 'left', 'left');
exception when others then
  insert into lv_result values (1, 'u3 leaves', 'left', sqlerrm);
end $$;
insert into lv_result
select 2, 'u3: copy of E3 (自分だけ, same title/memo/color, new id)', '1',
  (select count(*) from public.events
    where user_id = current_setting('lv.u3')::uuid and title = 'lv2 E3 by t1' and visibility = 'only_me'
      and memo = 'memo3' and color = '#ff0000' and id <> '00000000-0000-4000-8000-000000000613')::text
union all select 3, 'u3: own 自分だけ E5 kept', '1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000615')::text
union all select 4, 'u3 sees: original E3 / E1, E2 of others', '0 / 0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000613')::text || ' / ' ||
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000612'))::text
union all select 5, 'u3 sees history: any test event (originals and copy)', '0',
  (select count(*) from public.event_history where event_title like 'lv2 %')::text;
with u as (update public.events set title = 'lv2 by u3 after leaving'
           where id = '00000000-0000-4000-8000-000000000613' returning 1),
     d as (delete from public.events where id = '00000000-0000-4000-8000-000000000613' returning 1)
insert into lv_result
select 6, 'u3 edits / deletes original E3 (rows changed)', '0 / 0',
  (select count(*) from u)::text || ' / ' || (select count(*) from d)::text;
do $$ begin
  perform public.leave_household();
  insert into lv_result values (7, 'u3 (now alone) leaves again: refused', 'not_in_shared_household', 'no error');
exception when others then
  insert into lv_result values (7, 'u3 (now alone) leaves again: refused', 'not_in_shared_household', sqlerrm);
end $$;

-- ── t1 and t2 after u3 left ─────────────────────────────────────────────────
select pg_temp.act_as(current_setting('lv.t1'));
insert into lv_result
select 8, 't1: members now / original E3 visible, creator empty', '2 / 1 / null',
  (select count(*) from public.household_members)::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000613')::text || ' / ' ||
  coalesce((select user_id::text from public.events where id = '00000000-0000-4000-8000-000000000613'), 'null')
union all select 9, 't1: history of E3 (edit) / E4 (delete) still visible', '1 / 1',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000613')::text || ' / ' ||
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000614')::text
union all select 10, 't1 sees: u3''s 自分だけ E5 / u3''s copy', '0 / 0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000615')::text || ' / ' ||
  (select count(*) from public.events where user_id = current_setting('lv.u3')::uuid)::text
union all select 11, 't1: u3''s edit of E1 stays, history names u3', 'lv2 E1 by u3 / 1',
  (select title from public.events where id = '00000000-0000-4000-8000-000000000611') || ' / ' ||
  (select count(*) from public.event_history
    where event_id = '00000000-0000-4000-8000-000000000611' and changed_by = current_setting('lv.u3')::uuid)::text;

-- t1 tries to make the creator-less E3 自分だけ / work, and to empty E1's creator,
-- and to add an event without a creator: none of it happens.
update public.events set visibility = 'only_me', scope = 'work' where id = '00000000-0000-4000-8000-000000000613';
update public.events set user_id = null where id = '00000000-0000-4000-8000-000000000611';
do $$ begin
  insert into public.events (id, user_id, title, start_time, scope, visibility) values
    ('00000000-0000-4000-8000-000000000616', null, 'lv2 no creator', now(), 'private', 'shared');
  insert into lv_result values (14, 't1 adds an event without a creator: refused', 'refused', 'added');
exception when others then
  insert into lv_result values (14, 't1 adds an event without a creator: refused', 'refused', 'refused');
end $$;
insert into lv_result
select 12, 'creator-less E3 stays 共有 / private', 'shared / private',
  (select visibility || ' / ' || scope from public.events where id = '00000000-0000-4000-8000-000000000613')
union all select 13, 'E1''s creator can''t be emptied by t1', 't1',
  (select case when user_id = current_setting('lv.t1')::uuid then 't1' else coalesce(user_id::text, 'null') end
     from public.events where id = '00000000-0000-4000-8000-000000000611');

-- t1 edits the original E3, t2 deletes it; u3's copy doesn't change.
with u as (update public.events set title = 'lv2 E3 by t1 again'
           where id = '00000000-0000-4000-8000-000000000613' returning 1)
insert into lv_result select 15, 't1 edits / t2 deletes the original E3 (rows)', '1 / 1',
  (select count(*) from u)::text;
select pg_temp.act_as(current_setting('lv.t2'));
with d as (delete from public.events where id = '00000000-0000-4000-8000-000000000613' returning 1)
update lv_result set actual = actual || ' / ' || (select count(*) from d)::text where no = 15;
insert into lv_result
select 16, 't2: history of E3 incl. the delete (edits 2 + delete 1)', '3',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000613')::text;
select pg_temp.act_as(current_setting('lv.u3'));
insert into lv_result
select 17, 'u3: copy unchanged (title, still there)', '1',
  (select count(*) from public.events where user_id = current_setting('lv.u3')::uuid and title = 'lv2 E3 by t1')::text;

-- t1 adds E6, t2 edits and deletes it: normal as before.
select pg_temp.act_as(current_setting('lv.t1'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000617', current_setting('lv.t1')::uuid, 'lv2 E6 t1', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('lv.t2'));
with u as (update public.events set title = 'lv2 E6 by t2' where id = '00000000-0000-4000-8000-000000000617' returning 1)
insert into lv_result select 18, 'after: t2 edits / deletes t1''s new E6 (rows)', '1 / 1', (select count(*) from u)::text;
with d as (delete from public.events where id = '00000000-0000-4000-8000-000000000617' returning 1)
update lv_result set actual = actual || ' / ' || (select count(*) from d)::text where no = 18;

select no, check_name, expected, actual, expected = actual as ok from lv_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 2 — a group of 2 (t1, t2; the real limit of 2): t2 leaves.
--   t1 stays alone with t2's original E7 (creator empty), can invite, then
--   joins u4's group: E7 becomes t1's. t2 joins u3's group.
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table lv_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on lv_result to authenticated;
select set_config('lv.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('lv.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true),
       set_config('lv.u3', '00000000-0000-4000-8000-000000000603', true),
       set_config('lv.u4', '00000000-0000-4000-8000-000000000604', true);
select set_config('lv.hid', (select household_id::text from public.household_members
                              where user_id = current_setting('lv.t1')::uuid), true);

-- This block only: temporary accounts u3, u4. The limit stays 2.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-00000000060' || n)::uuid,
       'authenticated', 'authenticated', 'gyokan-leave2-test-' || n || '@example.invalid', now(), now()
  from generate_series(3, 4) as n;
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

select pg_temp.act_as(current_setting('lv.t2'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000621', current_setting('lv.t2')::uuid, 'lv2 E7 t2', now(), 'private', 'shared');
do $$ begin
  perform public.leave_household();
  insert into lv_result values (1, 't2 leaves', 'left', 'left');
exception when others then
  insert into lv_result values (1, 't2 leaves', 'left', sqlerrm);
end $$;

select pg_temp.act_as(current_setting('lv.t1'));
insert into lv_result
select 2, 't1: same group as before / members', 'true / 1',
  ((select household_id from public.household_members where user_id = current_setting('lv.t1')::uuid)
     = current_setting('lv.hid')::uuid)::text || ' / ' || (select count(*) from public.household_members)::text
union all select 3, 't1: t2''s original E7 visible, creator empty', '1 / null',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000621')::text || ' / ' ||
  coalesce((select user_id::text from public.events where id = '00000000-0000-4000-8000-000000000621'), 'null');
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

-- t2 (who left) joins u3's group.
select pg_temp.act_as(current_setting('lv.u3'));
select set_config('lv.tok3', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('lv.t2'));
do $$ begin
  perform public.accept_household_invite(current_setting('lv.tok3'), true);
  insert into lv_result values (6, 't2 joins u3''s group', 'joined', 'joined');
exception when others then
  insert into lv_result values (6, 't2 joins u3''s group', 'joined', sqlerrm);
end $$;

-- t1 (alone, with creator-less events) joins u4's group.
select pg_temp.act_as(current_setting('lv.u4'));
select set_config('lv.tok4', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('lv.t1'));
insert into lv_result
select 7, 't1: 既存の予定(件) counts own private + creator-less', 'true',
  ((select my_event_count from public.check_household_invite(current_setting('lv.tok4')))
     = (select count(*) from public.events
         where (user_id = current_setting('lv.t1')::uuid and scope = 'private') or user_id is null))::text;
do $$ begin
  perform public.accept_household_invite(current_setting('lv.tok4'), true);
  insert into lv_result values (8, 't1 joins u4''s group', 'joined', 'joined');
exception when others then
  insert into lv_result values (8, 't1 joins u4''s group', 'joined', sqlerrm);
end $$;
insert into lv_result
select 9, 't1: E7 is now t1''s / creator-less events left', 't1 / 0',
  (select case when user_id = current_setting('lv.t1')::uuid then 't1' else coalesce(user_id::text, 'null') end
     from public.events where id = '00000000-0000-4000-8000-000000000621') || ' / ' ||
  (select count(*) from public.events where user_id is null)::text;
select pg_temp.act_as(current_setting('lv.u4'));
insert into lv_result
select 10, 'u4 (t1''s new group) sees E7', '1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000621')::text;

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
    (select count(*) from auth.users where email like 'gyokan-leave2-test-%@example.invalid')::text
  union all select 4, 'no test event left (incl. copies)', '0',
    (select count(*) from public.events where title like 'lv2 %')::text
  union all select 5, 'no test history left', '0',
    (select count(*) from public.event_history where event_title like 'lv2 %')::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;
