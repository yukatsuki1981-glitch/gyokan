-- Checks for 「招待した側の参加前の予定も、共有しない」
-- (migration 20261124_join_inviter_private.sql). Run AFTER the migration.
--
-- Accounts:
--   t1, t2  yukatsuki1981+t1@ / +t2@gmail.com (test) — only READ, except in
--           block 3 where an invite to their (full) household is added and
--           rolled back again.
--   u3, u4  temporary accounts made INSIDE blocks 1–3
--           (gyokan-inviter-test-N@example.invalid); the ROLLBACK at the end
--           of each block removes them again. u4 invites (alone in its
--           household), u3 joins.
-- No other account is used.
--
-- Run each block separately (select it, then Run). Each block shows one
-- result table: check / expected / actual / ok. All rows must show ok = true.
--   Block 0 and Block 4 only read.
--   Blocks 1–3 end with ROLLBACK: nothing they do is kept.
--
-- Test events (all rolled back):
--   u4 (inviter): I1 共有 (updated_at 2026-01-01) / I2 自分だけ / I3 task mode /
--                 IO creator-less 共有 / ID 共有, deleted (only its history is left)
--   u3 (joiner):  A 共有 / B 自分だけ / C task mode

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
       like '%gyokan.system_change%')::text
  union all select 4, 'trigger events_zz_keep_updated_at exists', '1',
    (select count(*) from pg_trigger where tgname = 'events_zz_keep_updated_at' and not tgisinternal)::text
  union all select 5, 'is_system_change() is false here (no flag set)', 'false',
    public.is_system_change()::text
  union all select 6, 'the member limit is 2', '2', public.household_member_limit_for(null)::text
  union all select 7, 'no account already uses the temporary test e-mails', '0',
    (select count(*) from auth.users where email like 'gyokan-inviter-test-%@example.invalid')::text
  union all select 8, 'triggers on auth.users (must be 0 before blocks 1–3)', '0',
    (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal)::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 1 — u3 joins u4 (alone) with false (= what the app sends)
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table ip_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on ip_result to authenticated;
select set_config('ip.u3', '00000000-0000-4000-8000-000000000803', true),
       set_config('ip.u4', '00000000-0000-4000-8000-000000000804', true);

-- Setup as the SQL Editor (this block only).
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-00000000080' || n)::uuid,
       'authenticated', 'authenticated', 'gyokan-inviter-test-' || n || '@example.invalid', now(), now()
  from generate_series(3, 4) as n;
select set_config('ip.h3', public.ensure_household_for(current_setting('ip.u3')::uuid)::text, true),
       set_config('ip.h4', public.ensure_household_for(current_setting('ip.u4')::uuid)::text, true);
insert into public.events (id, user_id, household_id, title, start_time, scope, visibility, updated_at) values
  ('00000000-0000-4000-8000-000000000811', current_setting('ip.u4')::uuid, current_setting('ip.h4')::uuid, 'jip I1 u4 共有', now(), 'private', 'shared', '2026-01-01 00:00+00'),
  ('00000000-0000-4000-8000-000000000812', current_setting('ip.u4')::uuid, current_setting('ip.h4')::uuid, 'jip I2 u4 自分だけ', now(), 'private', 'only_me', now()),
  ('00000000-0000-4000-8000-000000000813', current_setting('ip.u4')::uuid, current_setting('ip.h4')::uuid, 'jip I3 u4 仕事', now(), 'work', 'shared', now()),
  ('00000000-0000-4000-8000-000000000814', null,                           current_setting('ip.h4')::uuid, 'jip IO 作成者なし', now(), 'private', 'shared', now()),
  ('00000000-0000-4000-8000-000000000815', current_setting('ip.u4')::uuid, current_setting('ip.h4')::uuid, 'jip ID u4 削除済み', now(), 'private', 'shared', now()),
  ('00000000-0000-4000-8000-000000000821', current_setting('ip.u3')::uuid, current_setting('ip.h3')::uuid, 'jip A u3 共有', now(), 'private', 'shared', now()),
  ('00000000-0000-4000-8000-000000000822', current_setting('ip.u3')::uuid, current_setting('ip.h3')::uuid, 'jip B u3 自分だけ', now(), 'private', 'only_me', now()),
  ('00000000-0000-4000-8000-000000000823', current_setting('ip.u3')::uuid, current_setting('ip.h3')::uuid, 'jip C u3 仕事', now(), 'work', 'shared', now());
delete from public.events where id = '00000000-0000-4000-8000-000000000815';  -- leaves a 共有 delete-history row

create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

select pg_temp.act_as(current_setting('ip.u4'));
select set_config('ip.tok', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('ip.u3'));
do $$ begin
  perform public.accept_household_invite(current_setting('ip.tok'), false);
  insert into ip_result values (1, 'u3 joins u4 with false', 'joined', 'joined');
exception when others then
  insert into ip_result values (1, 'u3 joins u4 with false', 'joined', sqlerrm);
end $$;

-- ── seen by u4 (inviter) ──
select pg_temp.act_as(current_setting('ip.u4'));
insert into ip_result
select 2, 'I1 (was 共有): 自分だけ, updated_at unchanged', 'only_me / 2026-01-01',
  (select visibility || ' / ' || to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD')
     from public.events where id = '00000000-0000-4000-8000-000000000811')
union all select 3, 'IO (creator-less): now u4''s, 自分だけ', 'u4 / only_me',
  (select case when user_id = current_setting('ip.u4')::uuid then 'u4' else coalesce(user_id::text, 'null') end
     || ' / ' || visibility from public.events where id = '00000000-0000-4000-8000-000000000814')
union all select 4, 'I2 自分だけ / I3 task mode: unchanged', 'only_me / work shared',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000812') || ' / ' ||
  (select scope || ' ' || visibility from public.events where id = '00000000-0000-4000-8000-000000000813')
union all select 5, 'no new history row for I1 / IO (a system change)', '0 / 0',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000811')::text || ' / ' ||
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000814')::text
union all select 6, 'history of the deleted ID: still u4''s, now 自分だけ', '1 / only_me',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000815')::text || ' / ' ||
  (select string_agg(event_visibility, ',') from public.event_history where event_id = '00000000-0000-4000-8000-000000000815')
union all select 7, 'u4 sees u3''s pre-join A / B / C', '0 / 0 / 0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000821')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000822')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000823')::text;

-- ── seen by u3 (joiner) ──
select pg_temp.act_as(current_setting('ip.u3'));
insert into ip_result
select 8, 'u3 sees u4''s pre-join I1 / I2 / I3 / IO', '0 / 0 / 0 / 0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000811')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000812')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000813')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000814')::text
union all select 9, 'u3 sees history of u4''s pre-join events (incl. deleted ID)', '0',
  (select count(*) from public.event_history where event_title like 'jip I%')::text
union all select 10, 'u3''s own A / B now (joiner side as before)', 'only_me / only_me',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000821') || ' / ' ||
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000822');

-- ── after joining: new 共有 events are seen by the other ──
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000831', current_setting('ip.u3')::uuid, 'jip N1 u3 共有', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('ip.u4'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000832', current_setting('ip.u4')::uuid, 'jip N2 u4 共有', now(), 'private', 'shared');
insert into ip_result
select 11, 'u4 sees u3''s new N1', '1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000831')::text;
-- An ordinary edit by the app still works as before (updated_at moves, history written).
with u as (update public.events set title = 'jip I1 edited' where id = '00000000-0000-4000-8000-000000000811' returning updated_at)
insert into ip_result
select 12, 'u4 edits I1: saved / updated_at moved', '1 / true',
  (select count(*) from u)::text || ' / ' ||
  ((select max(updated_at) from u) > '2026-01-02 00:00+00')::text;
insert into ip_result
select 13, 'u4''s edit of I1 is in the history', '1',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000811')::text;
select pg_temp.act_as(current_setting('ip.u3'));
insert into ip_result
select 14, 'u3 sees u4''s new N2', '1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000832')::text;

select no, check_name, expected, actual, expected = actual as ok from ip_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 2 — the same with true: the inviter's events still become 自分だけ;
--   the joiner's 共有 events stay 共有 (as before)
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table ip_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on ip_result to authenticated;
select set_config('ip.u3', '00000000-0000-4000-8000-000000000803', true),
       set_config('ip.u4', '00000000-0000-4000-8000-000000000804', true);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-00000000080' || n)::uuid,
       'authenticated', 'authenticated', 'gyokan-inviter-test-' || n || '@example.invalid', now(), now()
  from generate_series(3, 4) as n;
select set_config('ip.h3', public.ensure_household_for(current_setting('ip.u3')::uuid)::text, true),
       set_config('ip.h4', public.ensure_household_for(current_setting('ip.u4')::uuid)::text, true);
insert into public.events (id, user_id, household_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000811', current_setting('ip.u4')::uuid, current_setting('ip.h4')::uuid, 'jip I1 u4 共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000814', null,                           current_setting('ip.h4')::uuid, 'jip IO 作成者なし', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000821', current_setting('ip.u3')::uuid, current_setting('ip.h3')::uuid, 'jip A u3 共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000822', current_setting('ip.u3')::uuid, current_setting('ip.h3')::uuid, 'jip B u3 自分だけ', now(), 'private', 'only_me');

create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

select pg_temp.act_as(current_setting('ip.u4'));
select set_config('ip.tok', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('ip.u3'));
do $$ begin
  perform public.accept_household_invite(current_setting('ip.tok'), true);
  insert into ip_result values (1, 'u3 joins u4 with true', 'joined', 'joined');
exception when others then
  insert into ip_result values (1, 'u3 joins u4 with true', 'joined', sqlerrm);
end $$;
insert into ip_result
select 2, 'u3 sees u4''s I1 / IO', '0 / 0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000811')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000814')::text;
select pg_temp.act_as(current_setting('ip.u4'));
insert into ip_result
select 3, 'u4''s I1 / IO now', 'only_me / u4 only_me',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000811') || ' / ' ||
  (select case when user_id = current_setting('ip.u4')::uuid then 'u4' else coalesce(user_id::text, 'null') end
     || ' ' || visibility from public.events where id = '00000000-0000-4000-8000-000000000814')
union all select 4, 'u4 sees u3''s A (共有, kept with true) / B (自分だけ)', '1 / 0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000821')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000822')::text;

select no, check_name, expected, actual, expected = actual as ok from ip_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 3 — expired / revoked / full are still refused, and a refused join
--   changes nothing (neither the inviter's nor the joiner's events)
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table ip_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on ip_result to authenticated;
select set_config('ip.u3', '00000000-0000-4000-8000-000000000803', true),
       set_config('ip.u4', '00000000-0000-4000-8000-000000000804', true),
       set_config('ip.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', ('00000000-0000-4000-8000-00000000080' || n)::uuid,
       'authenticated', 'authenticated', 'gyokan-inviter-test-' || n || '@example.invalid', now(), now()
  from generate_series(3, 4) as n;
select set_config('ip.h3', public.ensure_household_for(current_setting('ip.u3')::uuid)::text, true),
       set_config('ip.h4', public.ensure_household_for(current_setting('ip.u4')::uuid)::text, true);
insert into public.events (id, user_id, household_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000811', current_setting('ip.u4')::uuid, current_setting('ip.h4')::uuid, 'jip I1 u4 共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000814', null,                           current_setting('ip.h4')::uuid, 'jip IO 作成者なし', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000821', current_setting('ip.u3')::uuid, current_setting('ip.h3')::uuid, 'jip A u3 共有', now(), 'private', 'shared');
-- An invite to t1's household, which is full (t1 + t2). Made here directly
-- because create_household_invite refuses a full household.
insert into public.household_invites (household_id, token_hash, created_by)
values ((select household_id from public.household_members where user_id = current_setting('ip.t1')::uuid),
        encode(sha256(convert_to('jip-full-token', 'UTF8')), 'hex'), current_setting('ip.t1')::uuid);

create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.try_join(p_token text, n int, label text, expected text) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(current_setting('ip.u3'));
  begin
    perform public.accept_household_invite(p_token, false);
    insert into ip_result values (n, label, expected, 'joined');
  exception when others then
    insert into ip_result values (n, label, expected, sqlerrm);
  end;
end;
$$;
set local role authenticated;

-- u4 makes invite E (then expired) and invite R (then revoked).
select pg_temp.act_as(current_setting('ip.u4'));
select set_config('ip.tok_e', public.create_household_invite(), true);
reset role;
update public.household_invites set expires_at = now() - interval '1 minute'
 where token_hash = encode(sha256(convert_to(current_setting('ip.tok_e'), 'UTF8')), 'hex');
set local role authenticated;
select pg_temp.act_as(current_setting('ip.u4'));
select set_config('ip.tok_r', public.create_household_invite(), true);
select public.revoke_household_invite((select id from public.list_household_invites() where status = 'active'));

select pg_temp.try_join(current_setting('ip.tok_e'), 1, 'expired invite', 'invite_expired');
select pg_temp.try_join(current_setting('ip.tok_r'), 2, 'revoked invite', 'invalid_invite');
select pg_temp.try_join('jip-full-token', 3, 'invite to a full household (t1 + t2)', 'household_full');

select pg_temp.act_as(current_setting('ip.u4'));
insert into ip_result
select 4, 'after the refused joins: u4''s I1 / IO unchanged', 'shared / null shared',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000811') || ' / ' ||
  (select coalesce(user_id::text, 'null') || ' ' || visibility from public.events where id = '00000000-0000-4000-8000-000000000814')
union all select 5, 'u4 still alone', '1', (select count(*) from public.household_members)::text;
select pg_temp.act_as(current_setting('ip.u3'));
insert into ip_result
select 6, 'u3''s A unchanged / u3 still alone', 'shared / 1',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000821') || ' / ' ||
  (select count(*) from public.household_members)::text;

select no, check_name, expected, actual, expected = actual as ok from ip_result order by no;
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
    (select count(*) from auth.users where email like 'gyokan-inviter-test-%@example.invalid')::text
  union all select 4, 'no test event / history left', '0 / 0',
    (select count(*) from public.events where title like 'jip %')::text || ' / ' ||
    (select count(*) from public.event_history where event_title like 'jip %')::text
  union all select 5, 'no test invite left', '0',
    (select count(*) from public.household_invites
      where token_hash = encode(sha256(convert_to('jip-full-token', 'UTF8')), 'hex'))::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;
