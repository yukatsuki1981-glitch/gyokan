-- Checks for 「参加する前の予定は、共有しない」 (migration 20261123_join_no_share.sql).
-- Run AFTER the migration.
--
-- Accounts:
--   t1, t2  yukatsuki1981+t1@ / +t2@gmail.com (test) — only READ, except in
--           block 3 where an invite to their (full) household is added and
--           rolled back again.
--   u3, u4  temporary accounts made INSIDE blocks 1–3
--           (gyokan-join-test-N@example.invalid); the ROLLBACK at the end of
--           each block removes them again. u3 joins, u4 invites.
-- No other account is used.
--
-- Run each block separately (select it, then Run). Each block shows one
-- result table: check / expected / actual / ok. All rows must show ok = true.
--   Block 0 and Block 4 only read.
--   Blocks 1–3 end with ROLLBACK: nothing they do is kept.
--
-- Test events (all rolled back): u3 — A 共有 / B 自分だけ / C task mode /
-- O creator-less (in u3's household); u4 — I1 共有 / I2 自分だけ / I3 task mode.

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
  union all select 2, 't1 and t2 share one household', 'true',
    ((select household_id from public.household_members, ids where user_id = ids.t1)
      = (select household_id from public.household_members, ids where user_id = ids.t2))::text
  union all select 3, 'accept_household_invite is the new version', 'true',
    (select pg_get_functiondef('public.accept_household_invite(text, boolean)'::regprocedure)
       like '%if not p_share_existing_events then%')::text
  union all select 4, 'the member limit is 2', '2', public.household_member_limit_for(null)::text
  union all select 5, 'no account already uses the temporary test e-mails', '0',
    (select count(*) from auth.users where email like 'gyokan-join-test-%@example.invalid')::text
  union all select 6, 'triggers on auth.users (must be 0 before blocks 1–3)', '0',
    (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal)::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 1 — u3 joins u4's household with false (= what the app sends)
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table js_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on js_result to authenticated;
select set_config('js.u3', '00000000-0000-4000-8000-000000000703', true),
       set_config('js.u4', '00000000-0000-4000-8000-000000000704', true);

-- Setup as the SQL Editor (this block only): accounts, their one-person
-- households, and their events.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-00000000070' || n)::uuid,
       'authenticated', 'authenticated', 'gyokan-join-test-' || n || '@example.invalid', now(), now()
  from generate_series(3, 4) as n;
select set_config('js.h3', public.ensure_household_for(current_setting('js.u3')::uuid)::text, true),
       set_config('js.h4', public.ensure_household_for(current_setting('js.u4')::uuid)::text, true);
insert into public.events (id, user_id, household_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000711', current_setting('js.u3')::uuid, current_setting('js.h3')::uuid, 'jns A u3 共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000712', current_setting('js.u3')::uuid, current_setting('js.h3')::uuid, 'jns B u3 自分だけ', now(), 'private', 'only_me'),
  ('00000000-0000-4000-8000-000000000713', current_setting('js.u3')::uuid, current_setting('js.h3')::uuid, 'jns C u3 仕事', now(), 'work', 'shared'),
  ('00000000-0000-4000-8000-000000000714', null,                           current_setting('js.h3')::uuid, 'jns O 作成者なし', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000721', current_setting('js.u4')::uuid, current_setting('js.h4')::uuid, 'jns I1 u4 共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000722', current_setting('js.u4')::uuid, current_setting('js.h4')::uuid, 'jns I2 u4 自分だけ', now(), 'private', 'only_me'),
  ('00000000-0000-4000-8000-000000000723', current_setting('js.u4')::uuid, current_setting('js.h4')::uuid, 'jns I3 u4 仕事', now(), 'work', 'shared');

create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

select pg_temp.act_as(current_setting('js.u4'));
select set_config('js.tok', public.create_household_invite(), true);

select pg_temp.act_as(current_setting('js.u3'));
insert into js_result
select 1, 'before: 既存の予定(件) = A, B, O (task mode C not counted)', '3',
  (select my_event_count from public.check_household_invite(current_setting('js.tok')))::text;
do $$ begin
  perform public.accept_household_invite(current_setting('js.tok'), false);
  insert into js_result values (2, 'u3 joins with false', 'joined', 'joined');
exception when others then
  insert into js_result values (2, 'u3 joins with false', 'joined', sqlerrm);
end $$;
insert into js_result
select 3, 'A (was 共有) / B (was 自分だけ) now', 'only_me / only_me',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000711') || ' / ' ||
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000712')
union all select 4, 'O (creator-less): now u3''s, 自分だけ', 'u3 / only_me',
  (select case when user_id = current_setting('js.u3')::uuid then 'u3' else coalesce(user_id::text, 'null') end
     || ' / ' || visibility from public.events where id = '00000000-0000-4000-8000-000000000714')
union all select 5, 'C (task mode) unchanged', 'work / shared',
  (select scope || ' / ' || visibility from public.events where id = '00000000-0000-4000-8000-000000000713')
union all select 6, 'u3 still sees its own A, B, C, O', '4',
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000712',
                                                   '00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000714'))::text
union all select 7, 'u3 sees u4''s I1 共有 / I2 自分だけ / I3 task mode', '1 / 0 / 0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000721')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000722')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000723')::text;

select pg_temp.act_as(current_setting('js.u4'));
insert into js_result
select 8, 'u4 (inviter) sees none of u3''s A, B, C, O', '0',
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000712',
                                                   '00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000714'))::text
union all select 9, 'u4: members now', '2', (select count(*) from public.household_members)::text;

select no, check_name, expected, actual, expected = actual as ok from js_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 2 — the same with true: unchanged behaviour (共有 stays 共有)
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table js_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on js_result to authenticated;
select set_config('js.u3', '00000000-0000-4000-8000-000000000703', true),
       set_config('js.u4', '00000000-0000-4000-8000-000000000704', true);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-00000000070' || n)::uuid,
       'authenticated', 'authenticated', 'gyokan-join-test-' || n || '@example.invalid', now(), now()
  from generate_series(3, 4) as n;
select set_config('js.h3', public.ensure_household_for(current_setting('js.u3')::uuid)::text, true),
       set_config('js.h4', public.ensure_household_for(current_setting('js.u4')::uuid)::text, true);
insert into public.events (id, user_id, household_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000711', current_setting('js.u3')::uuid, current_setting('js.h3')::uuid, 'jns A u3 共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000712', current_setting('js.u3')::uuid, current_setting('js.h3')::uuid, 'jns B u3 自分だけ', now(), 'private', 'only_me'),
  ('00000000-0000-4000-8000-000000000713', current_setting('js.u3')::uuid, current_setting('js.h3')::uuid, 'jns C u3 仕事', now(), 'work', 'shared'),
  ('00000000-0000-4000-8000-000000000714', null,                           current_setting('js.h3')::uuid, 'jns O 作成者なし', now(), 'private', 'shared');

create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

select pg_temp.act_as(current_setting('js.u4'));
select set_config('js.tok', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('js.u3'));
do $$ begin
  perform public.accept_household_invite(current_setting('js.tok'), true);
  insert into js_result values (1, 'u3 joins with true', 'joined', 'joined');
exception when others then
  insert into js_result values (1, 'u3 joins with true', 'joined', sqlerrm);
end $$;
insert into js_result
select 2, 'A / B / O after joining with true', 'shared / only_me / shared',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000711') || ' / ' ||
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000712') || ' / ' ||
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000714');
select pg_temp.act_as(current_setting('js.u4'));
insert into js_result
select 3, 'u4 sees A (共有) / B (自分だけ) / C (task mode) / O', '1 / 0 / 0 / 1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000711')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000712')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000713')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000714')::text;

select no, check_name, expected, actual, expected = actual as ok from js_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 3 — expired / revoked / full are still refused (with false), and a
--   refused join changes nothing
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table js_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on js_result to authenticated;
select set_config('js.u3', '00000000-0000-4000-8000-000000000703', true),
       set_config('js.u4', '00000000-0000-4000-8000-000000000704', true),
       set_config('js.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-00000000070' || n)::uuid,
       'authenticated', 'authenticated', 'gyokan-join-test-' || n || '@example.invalid', now(), now()
  from generate_series(3, 4) as n;
select set_config('js.h3', public.ensure_household_for(current_setting('js.u3')::uuid)::text, true);
insert into public.events (id, user_id, household_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000711', current_setting('js.u3')::uuid, current_setting('js.h3')::uuid, 'jns A u3 共有', now(), 'private', 'shared');
-- An invite to t1's household, which is full (t1 + t2). Made here directly
-- because create_household_invite refuses a full household.
insert into public.household_invites (household_id, token_hash, created_by)
values ((select household_id from public.household_members where user_id = current_setting('js.t1')::uuid),
        encode(sha256(convert_to('jns-full-token', 'UTF8')), 'hex'), current_setting('js.t1')::uuid);

create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
-- u3 tries to join with false; records the error as check n.
create function pg_temp.try_join(p_token text, n int, label text, expected text) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(current_setting('js.u3'));
  begin
    perform public.accept_household_invite(p_token, false);
    insert into js_result values (n, label, expected, 'joined');
  exception when others then
    insert into js_result values (n, label, expected, sqlerrm);
  end;
end;
$$;
set local role authenticated;

-- u4 makes invite E (then expired) and invite R (then revoked).
select pg_temp.act_as(current_setting('js.u4'));
select set_config('js.tok_e', public.create_household_invite(), true);
reset role;
update public.household_invites set expires_at = now() - interval '1 minute'
 where token_hash = encode(sha256(convert_to(current_setting('js.tok_e'), 'UTF8')), 'hex');
set local role authenticated;
select pg_temp.act_as(current_setting('js.u4'));
select set_config('js.tok_r', public.create_household_invite(), true);
select public.revoke_household_invite((select id from public.list_household_invites() where status = 'active'));

select pg_temp.try_join(current_setting('js.tok_e'), 1, 'expired invite', 'invite_expired');
select pg_temp.try_join(current_setting('js.tok_r'), 2, 'revoked invite', 'invalid_invite');
select pg_temp.try_join('jns-full-token', 3, 'invite to a full household (t1 + t2)', 'household_full');

select pg_temp.act_as(current_setting('js.u3'));
insert into js_result
select 4, 'after the refused joins: A still 共有, u3 still alone', 'shared / 1',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000711') || ' / ' ||
  (select count(*) from public.household_members)::text;

select no, check_name, expected, actual, expected = actual as ok from js_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 4 — after blocks 1–3: nothing was kept (read-only)
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
    (select count(*) from auth.users where email like 'gyokan-join-test-%@example.invalid')::text
  union all select 4, 'no test event / history left', '0 / 0',
    (select count(*) from public.events where title like 'jns %')::text || ' / ' ||
    (select count(*) from public.event_history where event_title like 'jns %')::text
  union all select 5, 'no test invite left', '0',
    (select count(*) from public.household_invites
      where token_hash = encode(sha256(convert_to('jns-full-token', 'UTF8')), 'hex'))::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;
