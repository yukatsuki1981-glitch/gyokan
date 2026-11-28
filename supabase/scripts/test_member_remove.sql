-- Checks for migration 20261130_member_limit_remove.sql: the member limit 4,
-- remove_household_member(uuid) and get_member_remove_info().
-- Run AFTER the migration.
--
-- Accounts: temporary accounts only (gyokan-rm-test-…@example.invalid), made
-- INSIDE each block; the ROLLBACK at the end of the block removes them again,
-- with everything they did. No real account is used or changed.
--
-- Run each block separately (select it, then Run). Each block shows one
-- result table. All rows must show ok = true.
--   Block S and Block 0 only read.
--   Blocks 1–6 end with ROLLBACK: nothing they do is kept.


-- ═════════════════════════════════════════════════════════════════════════════
-- Block S — structure (read-only)
-- ═════════════════════════════════════════════════════════════════════════════
with f(name, oid) as (
  select 'remove', 'public.remove_household_member(uuid)'::regprocedure::oid
  union all select 'info', 'public.get_member_remove_info()'::regprocedure::oid
  union all select 'limit', 'public.household_member_limit_for(uuid)'::regprocedure::oid
),
r(no, check_name, expected, actual) as (
  select 1, 'the member limit is 4 (no household / any household)', '4 / 4',
    public.household_member_limit_for(null)::text || ' / ' ||
    public.household_member_limit_for(gen_random_uuid())::text
  union all select 2, 'household_member_limit_for: same arguments and result as before',
    'p_household_id uuid -> integer',
    (select pg_get_function_identity_arguments(oid) || ' -> ' || pg_get_function_result(oid) from f where name = 'limit')
  union all select 3, 'remove_household_member: arguments -> result', 'p_user_id uuid -> uuid',
    (select pg_get_function_identity_arguments(oid) || ' -> ' || pg_get_function_result(oid) from f where name = 'remove')
  union all select 4, 'get_member_remove_info: arguments -> result',
    ' -> TABLE(can_remove boolean, owner_user_id uuid)',
    (select pg_get_function_identity_arguments(oid) || ' -> ' || pg_get_function_result(oid) from f where name = 'info')
  union all select 5, 'remove / info: security definer, search_path = public',
    'true search_path=public / true search_path=public',
    (select string_agg(p.prosecdef::text || ' ' || array_to_string(p.proconfig, ','), ' / ' order by f.name desc)
       from f join pg_proc p on p.oid = f.oid where f.name in ('remove', 'info'))
  union all select 6, 'remove: execute by anon / authenticated / everyone (public)', 'false / true / false',
    (select has_function_privilege('anon', oid, 'execute')::text || ' / ' ||
            has_function_privilege('authenticated', oid, 'execute')::text || ' / ' ||
            exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where p.oid = f.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE')::text
       from f where name = 'remove')
  union all select 7, 'info: execute by anon / authenticated / everyone (public)', 'false / true / false',
    (select has_function_privilege('anon', oid, 'execute')::text || ' / ' ||
            has_function_privilege('authenticated', oid, 'execute')::text || ' / ' ||
            exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where p.oid = f.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE')::text
       from f where name = 'info')
  union all select 8, 'household_member_limit_for: execute by anon / authenticated (internal)', 'false / false',
    (select has_function_privilege('anon', oid, 'execute')::text || ' / ' ||
            has_function_privilege('authenticated', oid, 'execute')::text
       from f where name = 'limit')
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 0 — prerequisites (read-only)
-- ═════════════════════════════════════════════════════════════════════════════
with r(no, check_name, expected, actual) as (
  select 1, 'leave_household is v2 (20261123_household_leave_v2.sql)', 'true',
    (select pg_get_functiondef('public.leave_household()'::regprocedure) like '%A copy of each of my shared events%')::text
  union all select 2, 'accept_household_invite is the 20261124 version', 'true',
    (select pg_get_functiondef('public.accept_household_invite(text, boolean)'::regprocedure) like '%The inviter''s side%')::text
  union all select 3, 'events_record_history is the 20261129 version', 'true',
    (select pg_get_functiondef('public.events_record_history()'::regprocedure) like '%DELETE by the system%')::text
  union all select 4, 'is_system_change() exists', '1',
    (select count(*) from pg_proc where proname = 'is_system_change' and pronamespace = 'public'::regnamespace)::text
  union all select 5, 'households.created_by can be empty', 'YES',
    (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'households' and column_name = 'created_by')
  union all select 6, 'no account already uses the temporary test e-mails', '0',
    (select count(*) from auth.users where email like 'gyokan-rm-test-%@example.invalid')::text
  union all select 7, 'triggers on auth.users (must be 0 before blocks 1–6)', '0',
    (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal)::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 1 — the limit 4: four can be in, the fifth is refused; how members
--   and unused invites are counted; the third person joining
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table rm_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on rm_result to authenticated, anon;
select set_config('tr.a', '00000000-0000-4000-8000-000000000d01', true),
       set_config('tr.b', '00000000-0000-4000-8000-000000000d02', true),
       set_config('tr.c', '00000000-0000-4000-8000-000000000d03', true),
       set_config('tr.d', '00000000-0000-4000-8000-000000000d04', true),
       set_config('tr.e', '00000000-0000-4000-8000-000000000d05', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', current_setting('tr.' || k)::uuid, 'authenticated', 'authenticated',
       'gyokan-rm-test-' || k || '@example.invalid', now(), now()
  from unnest(array['a', 'b', 'c', 'd', 'e']) as k;
select set_config('tr.h', public.ensure_household_for(current_setting('tr.a')::uuid)::text, true);
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
create function pg_temp.vis(p_id uuid) returns text language sql as $$
  select coalesce((select visibility from public.events where id = p_id), '-');
$$;
set local role authenticated;

-- A's events before anyone joins.
select pg_temp.act_as(current_setting('tr.a'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-00000000e101', current_setting('tr.a')::uuid, 'trm A前 共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-00000000e102', current_setting('tr.a')::uuid, 'trm A前 自分だけ', now(), 'private', 'only_me');
-- B joins (A is alone: A's 共有 events become 自分だけ — 20261124).
select set_config('tr.tok1', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('tr.b'));
select public.accept_household_invite(current_setting('tr.tok1'), false);
-- Shared events made after B joined.
select pg_temp.act_as(current_setting('tr.a'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-00000000e103', current_setting('tr.a')::uuid, 'trm A後 共有', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('tr.b'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-00000000e104', current_setting('tr.b')::uuid, 'trm B 共有', now(), 'private', 'shared');
-- C's events before joining.
select pg_temp.act_as(current_setting('tr.c'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-00000000e105', current_setting('tr.c')::uuid, 'trm C前 共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-00000000e106', current_setting('tr.c')::uuid, 'trm C前 自分だけ', now(), 'private', 'only_me'),
  ('00000000-0000-4000-8000-00000000e107', current_setting('tr.c')::uuid, 'trm C前 仕事', now(), 'work', 'shared');

-- ── C joins as the third ──
select pg_temp.act_as(current_setting('tr.a'));
select set_config('tr.tok2', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('tr.c'));
insert into rm_result
select 1, 'C joins as the third', 'ok',
  pg_temp.try(format('select public.accept_household_invite(%L, false)', current_setting('tr.tok2')));
insert into rm_result
select 2, 'members in the household', '3',
  (select count(*) from public.household_members where household_id = current_setting('tr.h')::uuid)::text
union all select 3, 'C sees the shared events of A and B (made after B joined)', '2',
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-00000000e103',
                                                    '00000000-0000-4000-8000-00000000e104'))::text
union all select 4, 'C''s events before joining: 共有→自分だけ / 自分だけ / task mode untouched',
  'only_me / only_me / shared',
  pg_temp.vis('00000000-0000-4000-8000-00000000e105') || ' / ' ||
  pg_temp.vis('00000000-0000-4000-8000-00000000e106') || ' / ' ||
  pg_temp.vis('00000000-0000-4000-8000-00000000e107')
union all select 5, 'C can not see A''s events from before B joined (自分だけ)', '0',
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-00000000e101',
                                                    '00000000-0000-4000-8000-00000000e102'))::text;
reset role;
insert into rm_result
select 6, 'the 3rd joining changes nothing of A and B (A後 / B 共有 / A前 共有 / A前 自分だけ)',
  'shared / shared / only_me / only_me',
  pg_temp.vis('00000000-0000-4000-8000-00000000e103') || ' / ' ||
  pg_temp.vis('00000000-0000-4000-8000-00000000e104') || ' / ' ||
  pg_temp.vis('00000000-0000-4000-8000-00000000e101') || ' / ' ||
  pg_temp.vis('00000000-0000-4000-8000-00000000e102');
set local role authenticated;

-- ── 3 members: unused invites are not counted ──
select pg_temp.act_as(current_setting('tr.a'));
do $$ begin
  perform set_config('tr.tokA', public.create_household_invite(), true);
  insert into rm_result values (7, '3 members: A makes an invite', 'ok', 'ok');
exception when others then
  insert into rm_result values (7, '3 members: A makes an invite', 'ok', sqlerrm);
end $$;
select pg_temp.act_as(current_setting('tr.b'));
do $$ begin
  perform set_config('tr.tokB', public.create_household_invite(), true);
  insert into rm_result values (8, '3 members + A''s unused invite: B can still make one (invites are not counted)', 'ok', 'ok');
exception when others then
  insert into rm_result values (8, '3 members + A''s unused invite: B can still make one (invites are not counted)', 'ok', sqlerrm);
end $$;
reset role;
insert into rm_result
select 9, 'unused invites in the household (one free seat)', '2',
  (select count(*) from public.household_invites where household_id = current_setting('tr.h')::uuid
     and accepted_at is null and revoked_at is null and expires_at > now())::text;
set local role authenticated;

-- ── D joins as the fourth; E (fifth) is refused ──
select pg_temp.act_as(current_setting('tr.d'));
insert into rm_result
select 10, 'D checks A''s invite', 'ok',
  (select status from public.check_household_invite(current_setting('tr.tokA', true)));
insert into rm_result
select 11, 'D joins as the fourth', 'ok',
  pg_temp.try(format('select public.accept_household_invite(%L, false)', current_setting('tr.tokA', true)));
select pg_temp.act_as(current_setting('tr.e'));
insert into rm_result
select 12, 'E checks B''s invite (still unused, but the household is full)', 'full',
  (select status from public.check_household_invite(current_setting('tr.tokB', true)));
insert into rm_result
select 13, 'E (the fifth) tries to join', 'household_full',
  pg_temp.try(format('select public.accept_household_invite(%L, false)', current_setting('tr.tokB', true)));
select pg_temp.act_as(current_setting('tr.a'));
insert into rm_result
select 14, '4 members: A tries to make an invite', 'household_full',
  pg_temp.try('select public.create_household_invite()');
insert into rm_result
select 15, 'household_member_limit() (what the app reads)', '4', public.household_member_limit()::text;
reset role;
insert into rm_result
select 16, 'members 4 / E is not one of them / B''s invite is still unused', '4 / 0 / 1',
  (select count(*) from public.household_members where household_id = current_setting('tr.h')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members where household_id = current_setting('tr.h')::uuid
     and user_id = current_setting('tr.e')::uuid)::text || ' / ' ||
  (select count(*) from public.household_invites
    where token_hash = encode(sha256(convert_to(current_setting('tr.tokB', true), 'UTF8')), 'hex')
      and accepted_at is null and revoked_at is null)::text;

select no, check_name, expected, actual, expected = actual as ok from rm_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 2 — the owner (A) removes B; C stays
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table rm_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on rm_result to authenticated, anon;
select set_config('tr.a', '00000000-0000-4000-8000-000000000d01', true),
       set_config('tr.b', '00000000-0000-4000-8000-000000000d02', true),
       set_config('tr.c', '00000000-0000-4000-8000-000000000d03', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', current_setting('tr.' || k)::uuid, 'authenticated', 'authenticated',
       'gyokan-rm-test-' || k || '@example.invalid', now(), now()
  from unnest(array['a', 'b', 'c']) as k;
select set_config('tr.h', public.ensure_household_for(current_setting('tr.a')::uuid)::text, true);
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
-- "A", "B", "C", "null" or the id.
create function pg_temp.who(u uuid) returns text language sql as $$
  select case when u is null then 'null'
              else coalesce((select upper(k) from unnest(array['a', 'b', 'c']) k
                              where current_setting('tr.' || k, true) = u::text), u::text) end;
$$;
-- "h" (the household), "new" (B's new household), "null" or the id.
create function pg_temp.hh(p uuid) returns text language sql as $$
  select case when p is null then 'null'
              when p::text = current_setting('tr.h') then 'h'
              when p::text = current_setting('tr.newh', true) then 'new'
              else p::text end;
$$;
-- A's and C's events and their history, as one text (to compare before / after).
create function pg_temp.others_state() returns text language sql as $$
  select md5(coalesce((select string_agg(concat_ws('|', id, user_id, household_id, title, scope, visibility, updated_at), ';' order by id)
                         from public.events
                        where user_id in (current_setting('tr.a')::uuid, current_setting('tr.c')::uuid)), '') || '#' ||
             coalesce((select string_agg(concat_ws('|', id, event_id, event_user_id, event_household_id,
                                                   event_visibility, action, changed_by), ';' order by id)
                         from public.event_history
                        where event_user_id in (current_setting('tr.a')::uuid, current_setting('tr.c')::uuid)), ''));
$$;
set local role authenticated;

select pg_temp.act_as(current_setting('tr.a'));
select set_config('tr.tok1', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('tr.b'));
select public.accept_household_invite(current_setting('tr.tok1'), false);
select pg_temp.act_as(current_setting('tr.a'));
select set_config('tr.tok2', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('tr.c'));
select public.accept_household_invite(current_setting('tr.tok2'), false);

select pg_temp.act_as(current_setting('tr.a'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-00000000e201', current_setting('tr.a')::uuid, 'trm SA A共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-00000000e202', current_setting('tr.a')::uuid, 'trm OA A自分だけ', now(), 'private', 'only_me');
select pg_temp.act_as(current_setting('tr.b'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-00000000e203', current_setting('tr.b')::uuid, 'trm SB B共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-00000000e204', current_setting('tr.b')::uuid, 'trm OB B自分だけ', now(), 'private', 'only_me'),
  ('00000000-0000-4000-8000-00000000e205', current_setting('tr.b')::uuid, 'trm WB B仕事', now(), 'work', 'shared'),
  ('00000000-0000-4000-8000-00000000e206', current_setting('tr.b')::uuid, 'trm DB B共有 削除する', now(), 'private', 'shared');
update public.events set title = 'trm SA edited by B' where id = '00000000-0000-4000-8000-00000000e201';
delete from public.events where id = '00000000-0000-4000-8000-00000000e206';
select set_config('tr.tokB', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('tr.c'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-00000000e207', current_setting('tr.c')::uuid, 'trm SC C共有', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('tr.a'));
select set_config('tr.tokA', public.create_household_invite(), true);

reset role;
select set_config('tr.before', pg_temp.others_state(), true),
       set_config('tr.hist_n', (select count(*) from public.event_history)::text, true);
set local role authenticated;

-- ── A removes B ──
select pg_temp.act_as(current_setting('tr.a'));
do $$ begin
  perform set_config('tr.newh', public.remove_household_member(current_setting('tr.b')::uuid)::text, true);
  insert into rm_result values (1, 'A (the owner) removes B', 'ok', 'ok');
exception when others then
  insert into rm_result values (1, 'A (the owner) removes B', 'ok', sqlerrm);
end $$;

reset role;
insert into rm_result
select 2, 'B is not in the household any more / members left', '0 / 2',
  (select count(*) from public.household_members where household_id = current_setting('tr.h')::uuid
     and user_id = current_setting('tr.b')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members where household_id = current_setting('tr.h')::uuid)::text
union all select 3, 'B is alone in a new household (the id returned) / B is its creator', 'new / 1 / B',
  pg_temp.hh((select household_id from public.household_members where user_id = current_setting('tr.b')::uuid)) || ' / ' ||
  (select count(*) from public.household_members where household_id::text = current_setting('tr.newh', true))::text || ' / ' ||
  coalesce((select pg_temp.who(created_by) from public.households where id::text = current_setting('tr.newh', true)), '-')
union all select 4, 'B''s 自分だけ OB / task-mode WB: B''s, in the new household',
  'B new only_me / B new shared',
  coalesce((select pg_temp.who(user_id) || ' ' || pg_temp.hh(household_id) || ' ' || visibility
              from public.events where id = '00000000-0000-4000-8000-00000000e204'), '-') || ' / ' ||
  coalesce((select pg_temp.who(user_id) || ' ' || pg_temp.hh(household_id) || ' ' || visibility
              from public.events where id = '00000000-0000-4000-8000-00000000e205'), '-')
union all select 5, 'B''s 共有 SB: stays in the household, creator empty, 共有', 'null h shared',
  coalesce((select pg_temp.who(user_id) || ' ' || pg_temp.hh(household_id) || ' ' || visibility
              from public.events where id = '00000000-0000-4000-8000-00000000e203'), '-')
union all select 6, 'B got a 自分だけ copy of SB in the new household', '1 / B new only_me',
  (select count(*) from public.events where title = 'trm SB B共有'
     and id <> '00000000-0000-4000-8000-00000000e203')::text || ' / ' ||
  coalesce((select string_agg(pg_temp.who(user_id) || ' ' || pg_temp.hh(household_id) || ' ' || visibility, ',')
              from public.events where title = 'trm SB B共有'
               and id <> '00000000-0000-4000-8000-00000000e203'), '-')
union all select 7, 'history of B''s deleted DB: stays in the household, creator empty', 'null h shared',
  coalesce((select string_agg(pg_temp.who(event_user_id) || ' ' || pg_temp.hh(event_household_id) || ' ' || event_visibility, ',')
              from public.event_history where event_id = '00000000-0000-4000-8000-00000000e206'), '-')
union all select 8, 'history of SA: B''s edit is kept (changed by B)', '1 / B',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-00000000e201')::text || ' / ' ||
  coalesce((select string_agg(pg_temp.who(changed_by), ',') from public.event_history
             where event_id = '00000000-0000-4000-8000-00000000e201'), '-')
union all select 9, 'B''s unused invite is revoked / A''s unused invite is still usable', 'revoked / usable',
  (select case when revoked_at is not null then 'revoked' else 'usable' end from public.household_invites
    where token_hash = encode(sha256(convert_to(current_setting('tr.tokB'), 'UTF8')), 'hex')) || ' / ' ||
  (select case when revoked_at is not null then 'revoked' else 'usable' end from public.household_invites
    where token_hash = encode(sha256(convert_to(current_setting('tr.tokA'), 'UTF8')), 'hex'))
union all select 10, 'A''s and C''s events and their history: unchanged', 'true',
  (pg_temp.others_state() = current_setting('tr.before'))::text
union all select 11, 'no new history row was written by the removal', 'true',
  ((select count(*) from public.event_history)::text = current_setting('tr.hist_n'))::text;

set local role authenticated;
select pg_temp.act_as(current_setting('tr.b'));
insert into rm_result
select 12, 'B can not see the household''s events any more (SA, SB original, SC)', '0',
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-00000000e201',
     '00000000-0000-4000-8000-00000000e203', '00000000-0000-4000-8000-00000000e207'))::text
union all select 13, 'B sees own OB, WB and the copy of SB', '3',
  (select count(*) from public.events where user_id = current_setting('tr.b')::uuid)::text;
select pg_temp.act_as(current_setting('tr.a'));
with u as (update public.events set title = 'trm SB edited by A' where id = '00000000-0000-4000-8000-00000000e203' returning 1)
insert into rm_result
select 14, 'A sees SB (以前のメンバー) and can edit it', '1 / 1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-00000000e203')::text || ' / ' ||
  (select count(*) from u)::text;
select pg_temp.act_as(current_setting('tr.c'));
insert into rm_result
select 15, 'C still sees SA, SB and SC', '3',
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-00000000e201',
     '00000000-0000-4000-8000-00000000e203', '00000000-0000-4000-8000-00000000e207'))::text;

reset role;
select no, check_name, expected, actual, expected = actual as ok from rm_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 3 — who may remove whom; wrong input; not signed in
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table rm_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on rm_result to authenticated, anon;
select set_config('tr.a', '00000000-0000-4000-8000-000000000d01', true),
       set_config('tr.b', '00000000-0000-4000-8000-000000000d02', true),
       set_config('tr.c', '00000000-0000-4000-8000-000000000d03', true),
       set_config('tr.d', '00000000-0000-4000-8000-000000000d04', true),
       set_config('tr.e', '00000000-0000-4000-8000-000000000d05', true),
       set_config('tr.f', '00000000-0000-4000-8000-000000000d06', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', current_setting('tr.' || k)::uuid, 'authenticated', 'authenticated',
       'gyokan-rm-test-' || k || '@example.invalid', now(), now()
  from unnest(array['a', 'b', 'c', 'd', 'e', 'f']) as k;
-- A (owner) + B + C; D (owner) + E; F is in no household.
select set_config('tr.h', public.ensure_household_for(current_setting('tr.a')::uuid)::text, true),
       set_config('tr.h2', public.ensure_household_for(current_setting('tr.d')::uuid)::text, true);
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
create function pg_temp.remove_sql(p_user text) returns text language sql as $$
  select format('select public.remove_household_member(%L::uuid)', p_user);
$$;
set local role authenticated;

select pg_temp.act_as(current_setting('tr.a'));
select set_config('tr.tok1', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('tr.b'));
select public.accept_household_invite(current_setting('tr.tok1'), false);
select pg_temp.act_as(current_setting('tr.a'));
select set_config('tr.tok2', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('tr.c'));
select public.accept_household_invite(current_setting('tr.tok2'), false);
select pg_temp.act_as(current_setting('tr.d'));
select set_config('tr.tok3', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('tr.e'));
select public.accept_household_invite(current_setting('tr.tok3'), false);

select pg_temp.act_as(current_setting('tr.b'));
insert into rm_result select 1, 'B (not the owner) removes C', 'not_owner',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.c')));
select pg_temp.act_as(current_setting('tr.c'));
insert into rm_result select 2, 'C (not the owner) removes A (the owner)', 'not_owner',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.a')));
select pg_temp.act_as(current_setting('tr.a'));
insert into rm_result select 3, 'A (the owner) removes A', 'cannot_remove_self',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.a')));
select pg_temp.act_as(current_setting('tr.b'));
insert into rm_result select 4, 'B removes B', 'cannot_remove_self',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.b')));
select pg_temp.act_as(current_setting('tr.a'));
insert into rm_result select 5, 'A removes D (another household)', 'not_a_member',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.d')));
insert into rm_result select 6, 'A removes F (in no household)', 'not_a_member',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.f')));
insert into rm_result select 7, 'A removes an id that is nobody', 'not_a_member',
  pg_temp.try(pg_temp.remove_sql(gen_random_uuid()::text));
insert into rm_result select 8, 'A removes null', 'not_a_member',
  pg_temp.try('select public.remove_household_member(null)');
select pg_temp.act_as(current_setting('tr.d'));
insert into rm_result select 9, 'D (owner of another household) removes B', 'not_a_member',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.b')));
select pg_temp.act_as(current_setting('tr.f'));
insert into rm_result select 10, 'F (in no household) removes A', 'not_in_shared_household',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.a')));
-- Signed in as nobody (a request without a user).
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
insert into rm_result select 11, 'not signed in: remove B', 'not_authenticated',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.b')));
-- The anon role (the app before signing in).
set local role anon;
insert into rm_result select 12, 'anon: remove B', 'permission denied for function remove_household_member',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.b')));
insert into rm_result select 13, 'anon: get_member_remove_info', 'permission denied for function get_member_remove_info',
  pg_temp.try('select * from public.get_member_remove_info()');

reset role;
insert into rm_result
select 14, 'nothing changed: members of A''s / D''s household / F''s households', '3 / 2 / 0',
  (select count(*) from public.household_members where household_id = current_setting('tr.h')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members where household_id = current_setting('tr.h2')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members where user_id = current_setting('tr.f')::uuid)::text;

select no, check_name, expected, actual, expected = actual as ok from rm_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 4 — no owner: every member may remove; get_member_remove_info
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table rm_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on rm_result to authenticated, anon;
-- Household 1: A, B, C — created_by emptied (as after its creator's account
--   was deleted, 20261129).
-- Household 2: P (creator), Q, R — P stops sharing (leave_household).
-- Household 3: X (owner), Y.
-- Z: in no household.
select set_config('tr.a', '00000000-0000-4000-8000-000000000d01', true),
       set_config('tr.b', '00000000-0000-4000-8000-000000000d02', true),
       set_config('tr.c', '00000000-0000-4000-8000-000000000d03', true),
       set_config('tr.p', '00000000-0000-4000-8000-000000000d07', true),
       set_config('tr.q', '00000000-0000-4000-8000-000000000d08', true),
       set_config('tr.r', '00000000-0000-4000-8000-000000000d09', true),
       set_config('tr.x', '00000000-0000-4000-8000-000000000d0a', true),
       set_config('tr.y', '00000000-0000-4000-8000-000000000d0b', true),
       set_config('tr.z', '00000000-0000-4000-8000-000000000d0c', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', current_setting('tr.' || k)::uuid, 'authenticated', 'authenticated',
       'gyokan-rm-test-' || k || '@example.invalid', now(), now()
  from unnest(array['a', 'b', 'c', 'p', 'q', 'r', 'x', 'y', 'z']) as k;
select set_config('tr.h1', public.ensure_household_for(current_setting('tr.a')::uuid)::text, true),
       set_config('tr.h2', public.ensure_household_for(current_setting('tr.p')::uuid)::text, true),
       set_config('tr.h3', public.ensure_household_for(current_setting('tr.x')::uuid)::text, true);
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
create function pg_temp.remove_sql(p_user text) returns text language sql as $$
  select format('select public.remove_household_member(%L::uuid)', p_user);
$$;
create function pg_temp.who(u uuid) returns text language sql as $$
  select case when u is null then 'null'
              else coalesce((select upper(k) from unnest(array['a', 'b', 'c', 'p', 'q', 'r', 'x', 'y', 'z']) k
                              where current_setting('tr.' || k, true) = u::text), u::text) end;
$$;
-- get_member_remove_info() of the current caller, as "true / X".
create function pg_temp.info() returns text language sql as $$
  select coalesce((select can_remove::text || ' / ' || pg_temp.who(owner_user_id)
                     from public.get_member_remove_info()), '-');
$$;
create function pg_temp.join_by(p_inviter text, p_joiner text) returns void language plpgsql as $$
declare tok text;
begin
  perform pg_temp.act_as(p_inviter);
  tok := public.create_household_invite();
  perform pg_temp.act_as(p_joiner);
  perform public.accept_household_invite(tok, false);
end;
$$;
set local role authenticated;
select pg_temp.join_by(current_setting('tr.a'), current_setting('tr.b'));
select pg_temp.join_by(current_setting('tr.a'), current_setting('tr.c'));
select pg_temp.join_by(current_setting('tr.p'), current_setting('tr.q'));
select pg_temp.join_by(current_setting('tr.p'), current_setting('tr.r'));
select pg_temp.join_by(current_setting('tr.x'), current_setting('tr.y'));

-- ── Household 3: there is an owner ──
select pg_temp.act_as(current_setting('tr.x'));
insert into rm_result select 1, 'owner there — info for X (the owner)', 'true / X', pg_temp.info();
select pg_temp.act_as(current_setting('tr.y'));
insert into rm_result select 2, 'owner there — info for Y', 'false / X', pg_temp.info();
insert into rm_result select 3, 'owner there — Y removes X', 'not_owner',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.x')));

-- ── Household 1: created_by empty ──
reset role;
update public.households set created_by = null where id = current_setting('tr.h1')::uuid;
set local role authenticated;
select pg_temp.act_as(current_setting('tr.b'));
insert into rm_result select 4, 'created_by empty — info for B', 'true / null', pg_temp.info();
insert into rm_result select 5, 'created_by empty — B removes C', 'ok',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.c')));
select pg_temp.act_as(current_setting('tr.a'));
insert into rm_result select 6, 'created_by empty — info for A (who made it)', 'true / null', pg_temp.info();
reset role;
insert into rm_result select 7, 'created_by empty — members left (A, B)', '2',
  (select count(*) from public.household_members where household_id = current_setting('tr.h1')::uuid)::text;
set local role authenticated;

-- ── Household 2: its creator P stops sharing ──
select pg_temp.act_as(current_setting('tr.p'));
insert into rm_result select 8, 'P (the creator) stops sharing', 'ok', pg_temp.try('select public.leave_household()');
reset role;
insert into rm_result select 9, 'household 2: created_by is still P / P is not a member', 'P / 0',
  (select pg_temp.who(created_by) from public.households where id = current_setting('tr.h2')::uuid) || ' / ' ||
  (select count(*) from public.household_members where household_id = current_setting('tr.h2')::uuid
     and user_id = current_setting('tr.p')::uuid)::text;
set local role authenticated;
select pg_temp.act_as(current_setting('tr.q'));
insert into rm_result select 10, 'creator left — info for Q', 'true / null', pg_temp.info();
select pg_temp.act_as(current_setting('tr.r'));
insert into rm_result select 11, 'creator left — info for R', 'true / null', pg_temp.info();
insert into rm_result select 12, 'creator left — R removes Q', 'ok',
  pg_temp.try(pg_temp.remove_sql(current_setting('tr.q')));
select pg_temp.act_as(current_setting('tr.p'));
insert into rm_result select 13, 'P, alone in a new household of their own — info for P', 'true / P', pg_temp.info();

-- ── In no household / not signed in ──
select pg_temp.act_as(current_setting('tr.z'));
insert into rm_result select 14, 'Z (in no household) — info', 'false / null', pg_temp.info();
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
insert into rm_result select 15, 'not signed in — info', 'false / null', pg_temp.info();

reset role;
select no, check_name, expected, actual, expected = actual as ok from rm_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 5 — after removing: one member left; the removed person joins again
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table rm_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on rm_result to authenticated, anon;
select set_config('tr.a', '00000000-0000-4000-8000-000000000d01', true),
       set_config('tr.b', '00000000-0000-4000-8000-000000000d02', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', current_setting('tr.' || k)::uuid, 'authenticated', 'authenticated',
       'gyokan-rm-test-' || k || '@example.invalid', now(), now()
  from unnest(array['a', 'b']) as k;
select set_config('tr.h', public.ensure_household_for(current_setting('tr.a')::uuid)::text, true);
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;
create function pg_temp.who(u uuid) returns text language sql as $$
  select case when u is null then 'null'
              else coalesce((select upper(k) from unnest(array['a', 'b']) k
                              where current_setting('tr.' || k, true) = u::text), u::text) end;
$$;
create function pg_temp.hh(p uuid) returns text language sql as $$
  select case when p is null then 'null'
              when p::text = current_setting('tr.h') then 'h'
              when p::text = current_setting('tr.newh', true) then 'new'
              else p::text end;
$$;
create function pg_temp.ev(p_id uuid) returns text language sql as $$
  select coalesce((select pg_temp.who(user_id) || ' ' || pg_temp.hh(household_id) || ' ' || visibility
                     from public.events where id = p_id), '-');
$$;
set local role authenticated;

select pg_temp.act_as(current_setting('tr.a'));
select set_config('tr.tok1', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('tr.b'));
select public.accept_household_invite(current_setting('tr.tok1'), false);
select pg_temp.act_as(current_setting('tr.a'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-00000000e501', current_setting('tr.a')::uuid, 'trm SA A共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-00000000e502', current_setting('tr.a')::uuid, 'trm OA A自分だけ', now(), 'private', 'only_me');
select pg_temp.act_as(current_setting('tr.b'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-00000000e503', current_setting('tr.b')::uuid, 'trm SB B共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-00000000e504', current_setting('tr.b')::uuid, 'trm OB B自分だけ', now(), 'private', 'only_me');

-- ── A removes B: A is left alone ──
select pg_temp.act_as(current_setting('tr.a'));
do $$ begin
  perform set_config('tr.newh', public.remove_household_member(current_setting('tr.b')::uuid)::text, true);
  insert into rm_result values (1, 'A removes B', 'ok', 'ok');
exception when others then
  insert into rm_result values (1, 'A removes B', 'ok', sqlerrm);
end $$;
reset role;
insert into rm_result
select 2, 'the household stays, with A alone', '1 / 1 / A',
  (select count(*) from public.households where id = current_setting('tr.h')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members where household_id = current_setting('tr.h')::uuid)::text || ' / ' ||
  coalesce((select string_agg(pg_temp.who(user_id), ',') from public.household_members
             where household_id = current_setting('tr.h')::uuid), '-')
union all select 3, 'right after: A''s SA still 共有 / SB stays, creator empty', 'A h shared / null h shared',
  pg_temp.ev('00000000-0000-4000-8000-00000000e501') || ' / ' || pg_temp.ev('00000000-0000-4000-8000-00000000e503');
set local role authenticated;

-- ── B joins again with a new invite ──
select pg_temp.act_as(current_setting('tr.a'));
do $$ begin
  perform set_config('tr.tok2', public.create_household_invite(), true);
  insert into rm_result values (4, 'A makes a new invite', 'ok', 'ok');
exception when others then
  insert into rm_result values (4, 'A makes a new invite', 'ok', sqlerrm);
end $$;
select pg_temp.act_as(current_setting('tr.b'));
insert into rm_result select 5, 'B checks it', 'ok',
  (select status from public.check_household_invite(current_setting('tr.tok2', true)));
insert into rm_result select 6, 'B joins again', 'ok',
  pg_temp.try(format('select public.accept_household_invite(%L, false)', current_setting('tr.tok2', true)));
reset role;
insert into rm_result
select 7, 'members: A and B', '2',
  (select count(*) from public.household_members where household_id = current_setting('tr.h')::uuid)::text
union all select 8, 'A was alone: A''s SA became 自分だけ / OA unchanged', 'A h only_me / A h only_me',
  pg_temp.ev('00000000-0000-4000-8000-00000000e501') || ' / ' || pg_temp.ev('00000000-0000-4000-8000-00000000e502')
union all select 9, 'the creator-less SB original became A''s, 自分だけ', 'A h only_me',
  pg_temp.ev('00000000-0000-4000-8000-00000000e503')
union all select 10, 'B''s events (OB, the copy of SB) came along, 自分だけ', 'B h only_me,B h only_me',
  coalesce((select string_agg(pg_temp.who(user_id) || ' ' || pg_temp.hh(household_id) || ' ' || visibility, ',' order by title)
              from public.events where user_id = current_setting('tr.b')::uuid), '-')
union all select 11, 'B''s one-person household from the removal is gone', '0',
  (select count(*) from public.households where id::text = current_setting('tr.newh', true))::text;
set local role authenticated;
select pg_temp.act_as(current_setting('tr.b'));
insert into rm_result select 12, 'B can not see any of A''s events (all 自分だけ)', '0',
  (select count(*) from public.events where user_id = current_setting('tr.a')::uuid)::text;

reset role;
select no, check_name, expected, actual, expected = actual as ok from rm_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 6 — the same result as leave_household
--   Two households set up the same way: (A1, B1) and (A2, B2).
--   B1 stops sharing (leave_household); A2 removes B2 (remove_household_member).
--   Then each household is written out with names in place of ids
--   (A, B, h = the household, newB = B's new household) and compared.
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table rm_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on rm_result to authenticated, anon;
select set_config('tr.a1', '00000000-0000-4000-8000-000000000d01', true),
       set_config('tr.b1', '00000000-0000-4000-8000-000000000d02', true),
       set_config('tr.a2', '00000000-0000-4000-8000-000000000d03', true),
       set_config('tr.b2', '00000000-0000-4000-8000-000000000d04', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', current_setting('tr.' || k)::uuid, 'authenticated', 'authenticated',
       'gyokan-rm-test-' || k || '@example.invalid', now(), now()
  from unnest(array['a1', 'b1', 'a2', 'b2']) as k;
select set_config('tr.h1', public.ensure_household_for(current_setting('tr.a1')::uuid)::text, true),
       set_config('tr.h2', public.ensure_household_for(current_setting('tr.a2')::uuid)::text, true);
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
-- The same story for household n (1 or 2).
create function pg_temp.setup(n text) returns void language plpgsql as $$
declare
  a uuid := current_setting('tr.a' || n)::uuid;
  b uuid := current_setting('tr.b' || n)::uuid;
  tok text;
  sa uuid := gen_random_uuid();
  sb uuid := gen_random_uuid();
  db uuid := gen_random_uuid();
begin
  perform pg_temp.act_as(a::text);
  tok := public.create_household_invite();
  perform pg_temp.act_as(b::text);
  perform public.accept_household_invite(tok, false);
  perform pg_temp.act_as(a::text);
  insert into public.events (id, user_id, title, start_time, scope, visibility) values
    (sa, a, 'trm SA A共有', now(), 'private', 'shared'),
    (gen_random_uuid(), a, 'trm OA A自分だけ', now(), 'private', 'only_me');
  perform pg_temp.act_as(b::text);
  insert into public.events (id, user_id, title, start_time, scope, visibility) values
    (sb, b, 'trm SB B共有', now(), 'private', 'shared'),
    (gen_random_uuid(), b, 'trm SB2 B共有', now(), 'private', 'shared'),
    (gen_random_uuid(), b, 'trm OB B自分だけ', now(), 'private', 'only_me'),
    (gen_random_uuid(), b, 'trm WB B仕事', now(), 'work', 'shared'),
    (db, b, 'trm DB B共有 削除する', now(), 'private', 'shared');
  update public.events set title = 'trm SA edited by B' where id = sa;   -- history: B edits A's
  delete from public.events where id = db;                              -- history: B deletes own 共有
  perform public.create_household_invite();                             -- B's unused invite
  perform pg_temp.act_as(a::text);
  update public.events set memo = 'trm memo by A' where id = sb;        -- history: A edits B's
  perform public.create_household_invite();                             -- A's unused invite
end;
$$;
-- Household n written out, with names in place of ids.
create function pg_temp.world(n text, part text) returns text language plpgsql as $$
declare
  a uuid := current_setting('tr.a' || n)::uuid;
  b uuid := current_setting('tr.b' || n)::uuid;
  h uuid := current_setting('tr.h' || n)::uuid;
  nb uuid := (select household_id from public.household_members where user_id = b);
  out text;
begin
  create temp table if not exists rm_names (id uuid, name text) on commit drop;
  delete from rm_names;
  insert into rm_names values (a, 'A'), (b, 'B'), (h, 'h'), (nb, 'newB');
  if part = 'events' then
    select string_agg(x, ' ; ' order by x) into out from (
      select concat_ws('|', e.title, coalesce(u.name, 'null'), coalesce(hn.name, '?'), e.scope, e.visibility,
                       coalesce(e.memo, '')) as x
        from public.events e
        left join rm_names u on u.id = e.user_id
        left join rm_names hn on hn.id = e.household_id
       where e.user_id in (a, b) or e.household_id in (h, nb)) s;
  elsif part = 'history' then
    select string_agg(x, ' ; ' order by x) into out from (
      select concat_ws('|', eh.event_title, coalesce(u.name, 'null'), coalesce(hn.name, '?'), eh.event_scope,
                       eh.event_visibility, eh.action, coalesce(c.name, 'null'), eh.changed_fields::text) as x
        from public.event_history eh
        left join rm_names u on u.id = eh.event_user_id
        left join rm_names hn on hn.id = eh.event_household_id
        left join rm_names c on c.id = eh.changed_by
       where eh.event_household_id in (h, nb) or eh.event_user_id in (a, b) or eh.changed_by in (a, b)) s;
  elsif part = 'invites' then
    select string_agg(x, ' ; ' order by x) into out from (
      select concat_ws('|', coalesce(c.name, 'null'), coalesce(hn.name, '?'),
                       case when i.accepted_at is not null then 'accepted'
                            when i.revoked_at is not null then 'revoked' else 'usable' end,
                       coalesce(ab.name, 'null')) as x
        from public.household_invites i
        left join rm_names c on c.id = i.created_by
        left join rm_names hn on hn.id = i.household_id
        left join rm_names ab on ab.id = i.accepted_by
       where i.household_id in (h, nb)) s;
  elsif part = 'members' then
    select string_agg(x, ' ; ' order by x) into out from (
      select concat_ws('|', coalesce(hn.name, '?'), coalesce(u.name, '?'), m.role) as x
        from public.household_members m
        left join rm_names u on u.id = m.user_id
        left join rm_names hn on hn.id = m.household_id
       where m.household_id in (h, nb)
      union all
      select concat_ws('|', 'household', coalesce(hn.name, '?'), 'created_by=' || coalesce(c.name, 'null'))
        from public.households hh
        left join rm_names hn on hn.id = hh.id
        left join rm_names c on c.id = hh.created_by
       where hh.id in (h, nb)) s;
  end if;
  return coalesce(out, '(none)');
end;
$$;
set local role authenticated;
select pg_temp.setup('1');
select pg_temp.setup('2');

-- ── B1 leaves; A2 removes B2 ──
select pg_temp.act_as(current_setting('tr.b1'));
do $$ begin
  perform public.leave_household();
  insert into rm_result values (1, 'B1 stops sharing (leave_household) / A2 removes B2', 'ok / ok', 'ok');
exception when others then
  insert into rm_result values (1, 'B1 stops sharing (leave_household) / A2 removes B2', 'ok / ok', sqlerrm);
end $$;
select pg_temp.act_as(current_setting('tr.a2'));
do $$ begin
  perform public.remove_household_member(current_setting('tr.b2')::uuid);
  update rm_result set actual = actual || ' / ok' where no = 1;
exception when others then
  update rm_result set actual = actual || ' / ' || sqlerrm where no = 1;
end $$;

reset role;
insert into rm_result
select 2, 'counts after leave (events / history / invites / members)', 'leave', 'leave'
union all select 3, 'events: leave_household (expected) = remove_household_member (actual)',
  pg_temp.world('1', 'events'), pg_temp.world('2', 'events')
union all select 4, 'history: leave_household (expected) = remove_household_member (actual)',
  pg_temp.world('1', 'history'), pg_temp.world('2', 'history')
union all select 5, 'invites: leave_household (expected) = remove_household_member (actual)',
  pg_temp.world('1', 'invites'), pg_temp.world('2', 'invites')
union all select 6, 'members and households: leave_household (expected) = remove_household_member (actual)',
  pg_temp.world('1', 'members'), pg_temp.world('2', 'members');
-- Row 2: the number of items in each part, for both (the long texts above are
-- easier to compare with these).
update rm_result set
  expected = (select string_agg(cardinality(string_to_array(pg_temp.world('1', p), ' ; '))::text, ' / ' order by o)
                from unnest(array['events', 'history', 'invites', 'members']) with ordinality as t(p, o)),
  actual   = (select string_agg(cardinality(string_to_array(pg_temp.world('2', p), ' ; '))::text, ' / ' order by o)
                from unnest(array['events', 'history', 'invites', 'members']) with ordinality as t(p, o)),
  check_name = 'number of events / history rows / invites / member+household rows (leave = remove)'
 where no = 2;
-- Row 7: the story really had something in it (not "(none) = (none)").
insert into rm_result
select 7, 'the leave side has events / history / invites / members', 'true',
  (pg_temp.world('1', 'events') <> '(none)' and pg_temp.world('1', 'history') <> '(none)'
   and pg_temp.world('1', 'invites') <> '(none)' and pg_temp.world('1', 'members') <> '(none)')::text;

select no, check_name, expected, actual, expected = actual as ok from rm_result order by no;
rollback;
