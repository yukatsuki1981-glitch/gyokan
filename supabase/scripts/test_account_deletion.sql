-- Checks for delete_my_account() (migration 20261129_account_deletion.sql).
-- Run AFTER the migration.
--
-- Accounts:
--   t1, t2  yukatsuki1981+t1@ / +t2@gmail.com (test) — only READ (Block 0 and 6).
--   A, B, … temporary accounts made INSIDE blocks 1–5
--           (gyokan-del-test-…@example.invalid); the ROLLBACK at the end of
--           each block removes them again — including their "deletion".
-- No real account is deleted. No other account is used.
--
-- Run each block separately (select it, then Run). Each block shows one
-- result table. All rows must show ok = true.
--   Block S, Block 0 and Block 6 only read.
--   Blocks 1–5 end with ROLLBACK: nothing they do is kept.

-- ═════════════════════════════════════════════════════════════════════════════
-- Block S — survey (read-only): every foreign key to auth.users or to
--   households, with what happens on delete; and every uuid column in public.
--   ok is always true here: this block is for reading, not for checking.
-- ═════════════════════════════════════════════════════════════════════════════
select row_number() over (order by kind, tbl, col) as no, kind, tbl, col, refers_to, on_delete, true as ok
from (
  select 'foreign key' as kind,
         con.conrelid::regclass::text as tbl,
         (select string_agg(att.attname, ', ') from pg_attribute att
           where att.attrelid = con.conrelid and att.attnum = any (con.conkey)) as col,
         con.confrelid::regclass::text as refers_to,
         case con.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'r' then 'restrict'
              when 'a' then 'no action' when 'd' then 'set default' end as on_delete
    from pg_constraint con
   where con.contype = 'f'
     and con.confrelid in ('auth.users'::regclass, 'public.households'::regclass, 'public.profiles'::regclass)
     and con.connamespace in ('public'::regnamespace, 'storage'::regnamespace)
  union all
  select 'uuid column (no foreign key)', c.table_schema || '.' || c.table_name, c.column_name, '', ''
    from information_schema.columns c
   where c.table_schema = 'public' and c.data_type = 'uuid'
     and c.column_name not in ('id')
     and not exists (
       select 1 from pg_constraint con
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
       where con.contype = 'f'
         and con.conrelid = (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass
         and att.attname = c.column_name)
  union all
  select 'storage files (all users)', 'storage.objects', '',
         (select count(*)::text from storage.objects), ''
) as s
order by no;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 0 — prerequisites (read-only)
-- ═════════════════════════════════════════════════════════════════════════════
with r(no, check_name, expected, actual) as (
  select 1, 'delete_my_account() exists, with no arguments', '0',
    (select string_agg(pronargs::text, ',') from pg_proc
      where proname = 'delete_my_account' and pronamespace = 'public'::regnamespace)
  union all select 2, 'households.created_by can be empty', 'YES',
    (select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'households' and column_name = 'created_by')
  union all select 3, 'households.created_by: on delete set null', 'set null',
    (select case confdeltype when 'n' then 'set null' when 'c' then 'cascade' else confdeltype::text end
       from pg_constraint where conname = 'households_created_by_fkey')
  union all select 4, 'events_record_history is the new version', 'true',
    (select pg_get_functiondef('public.events_record_history()'::regprocedure) like '%DELETE by the system%')::text
  union all select 5, 'anon can not call delete_my_account / authenticated can', 'false / true',
    has_function_privilege('anon', 'public.delete_my_account()', 'execute')::text || ' / ' ||
    has_function_privilege('authenticated', 'public.delete_my_account()', 'execute')::text
  union all select 6, 'the member limit is 2', '2', public.household_member_limit_for(null)::text
  union all select 7, 'no account already uses the temporary test e-mails', '0',
    (select count(*) from auth.users where email like 'gyokan-del-test-%@example.invalid')::text
  union all select 8, 'triggers on auth.users (must be 0 before blocks 1–5)', '0',
    (select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal)::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 1 — (a)(e)(f)(g)(j): A and B share; B (who joined later) deletes
--   the account
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table del_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on del_result to authenticated, anon;
select set_config('td.a', '00000000-0000-4000-8000-000000000901', true),
       set_config('td.b', '00000000-0000-4000-8000-000000000902', true),
       set_config('td.f', '00000000-0000-4000-8000-000000000909', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', current_setting('td.a')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-a@example.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('td.b')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-b@example.invalid', now(), now());
select set_config('td.h', public.ensure_household_for(current_setting('td.a')::uuid)::text, true);
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
-- Where does this id still appear? 'none', or table.column=count, …
create function pg_temp.leftovers(uid uuid) returns text language plpgsql as $$
declare c record; n bigint; found text[] := '{}';
begin
  for c in select table_name, column_name from information_schema.columns
            where table_schema = 'public' and data_type = 'uuid' loop
    execute format('select count(*) from public.%I where %I = $1', c.table_name, c.column_name) into n using uid;
    if n > 0 then found := found || (c.table_name || '.' || c.column_name || '=' || n); end if;
  end loop;
  select count(*) into n from public.event_history where old_values::text like '%' || uid::text || '%';
  if n > 0 then found := found || ('event_history.old_values=' || n); end if;
  select count(*) into n from auth.users where id = uid;
  if n > 0 then found := found || ('auth.users=' || n); end if;
  return coalesce(nullif(array_to_string(found, ', '), ''), 'none');
end;
$$;
set local role authenticated;

-- B joins A.
select pg_temp.act_as(current_setting('td.a'));
select set_config('td.tok', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('td.b'));
select public.accept_household_invite(current_setting('td.tok'), false);
-- B's events after joining.
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000a02', current_setting('td.b')::uuid, 'tdel SB B共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000a03', current_setting('td.b')::uuid, 'tdel SB2 B共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000a04', current_setting('td.b')::uuid, 'tdel OB B自分だけ', now(), 'private', 'only_me'),
  ('00000000-0000-4000-8000-000000000a05', current_setting('td.b')::uuid, 'tdel WB B仕事', now(), 'work', 'shared'),
  ('00000000-0000-4000-8000-000000000a06', current_setting('td.b')::uuid, 'tdel DB B共有 削除する', now(), 'private', 'shared');
-- A's event, which B edits (history: changed by B).
select pg_temp.act_as(current_setting('td.a'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000a01', current_setting('td.a')::uuid, 'tdel SA A共有', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('td.b'));
update public.events set title = 'tdel SA edited by B' where id = '00000000-0000-4000-8000-000000000a01';
-- B deletes a shared event of its own (history: a delete row with B's id inside).
delete from public.events where id = '00000000-0000-4000-8000-000000000a06';
-- B's other data.
reset role;
insert into public.projects (id, user_id, name) values
  ('00000000-0000-4000-8000-000000000b01', current_setting('td.b')::uuid, 'tdel P');
insert into public.cases (id, user_id, project_id, title, name, created_at) values
  ('00000000-0000-4000-8000-000000000b02', current_setting('td.b')::uuid, '00000000-0000-4000-8000-000000000b01', 'tdel C', 'tdel C', '2026/11/29');
insert into public.tasks (id, user_id, project_id, title, task_date) values
  ('00000000-0000-4000-8000-000000000b03', current_setting('td.b')::uuid, '00000000-0000-4000-8000-000000000b01', 'tdel T', current_date);
insert into public.project_memos (user_id, project_id, memo_date, body) values
  (current_setting('td.b')::uuid, '00000000-0000-4000-8000-000000000b01', '2026-11-29', 'tdel');
insert into public.daily_memos (user_id, memo_date, body) values (current_setting('td.b')::uuid, current_date, 'tdel');
insert into public.daily_diaries (user_id, diary_date, body) values (current_setting('td.b')::uuid, current_date, 'tdel');
insert into public.user_preferences (user_id, last_view_date) values (current_setting('td.b')::uuid, current_date)
  on conflict (user_id) do nothing;
insert into public.profiles (user_id, display_name) values (current_setting('td.b')::uuid, 'tdel B')
  on conflict (user_id) do update set display_name = excluded.display_name;
set local role authenticated;

-- ── B deletes the account ──
select pg_temp.act_as(current_setting('td.b'));
do $$ begin
  perform public.delete_my_account();
  insert into del_result values (1, 'B deletes the account', 'deleted', 'deleted');
exception when others then
  insert into del_result values (1, 'B deletes the account', 'deleted', sqlerrm);
end $$;

-- ── seen by A ──
select pg_temp.act_as(current_setting('td.a'));
insert into del_result
select 2, 'A sees B''s shared SB: count / creator / sharing', '1 / null / shared',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000a02')::text || ' / ' ||
  coalesce((select coalesce(user_id::text, 'null') || ' / ' || visibility from public.events
             where id = '00000000-0000-4000-8000-000000000a02'), '-')
union all select 3, 'A''s own SA: still A''s, 共有 (B''s edit kept)', '1 / A / shared',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000a01')::text || ' / ' ||
  coalesce((select case when user_id = current_setting('td.a')::uuid then 'A' else coalesce(user_id::text, 'null') end
              || ' / ' || visibility from public.events where id = '00000000-0000-4000-8000-000000000a01'), '-')
union all select 4, '(e) history of SA: B''s edit is there, "changed by" empty', '1 / null',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000a01')::text || ' / ' ||
  coalesce((select string_agg(coalesce(changed_by::text, 'null'), ',') from public.event_history
             where event_id = '00000000-0000-4000-8000-000000000a01'), '-')
union all select 5, '(e) history of B''s deleted DB: A sees it / creator / B''s id in old values', '1 / null / false',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000a06')::text || ' / ' ||
  coalesce((select string_agg(coalesce(event_user_id::text, 'null') || ' / ' || (old_values ? 'user_id')::text, ',')
              from public.event_history where event_id = '00000000-0000-4000-8000-000000000a06'), '-');
with u as (update public.events set title = 'tdel SB edited by A' where id = '00000000-0000-4000-8000-000000000a02' returning 1),
     d as (delete from public.events where id = '00000000-0000-4000-8000-000000000a03' returning 1)
insert into del_result
select 6, '(a) A edits SB / deletes SB2 (B''s, now 以前のメンバー)', '1 / 1',
  (select count(*) from u)::text || ' / ' || (select count(*) from d)::text;

-- ── checked as the SQL Editor ──
reset role;
insert into del_result
select 7, 'B''s 自分だけ OB / task-mode WB are gone', '0 / 0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000a04')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000a05')::text
union all select 8, 'B''s projects, cases, tasks, memos, diaries, preferences, name', '0',
  ((select count(*) from public.projects where id = '00000000-0000-4000-8000-000000000b01')
   + (select count(*) from public.cases where id = '00000000-0000-4000-8000-000000000b02')
   + (select count(*) from public.tasks where id = '00000000-0000-4000-8000-000000000b03')
   + (select count(*) from public.project_memos where body = 'tdel')
   + (select count(*) from public.daily_memos where body = 'tdel')
   + (select count(*) from public.daily_diaries where body = 'tdel')
   + (select count(*) from public.user_preferences where user_id = current_setting('td.b')::uuid)
   + (select count(*) from public.profiles where display_name = 'tdel B'))::text
union all select 9, 'A unchanged: household there, A in it, 1 member', '1 / 1 / 1',
  (select count(*) from public.households where id = current_setting('td.h')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members where household_id = current_setting('td.h')::uuid
     and user_id = current_setting('td.a')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members where household_id = current_setting('td.h')::uuid)::text
union all select 10, '(g) B is gone from auth.users', '0',
  (select count(*) from auth.users where id = current_setting('td.b')::uuid)::text
union all select 11, '(f) where B''s id still appears (every uuid column in public, history, auth.users)', 'none',
  pg_temp.leftovers(current_setting('td.b')::uuid);

-- (g) The same e-mail address can be used for a new account.
do $$ begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
    ('00000000-0000-0000-0000-000000000000', current_setting('td.f')::uuid, 'authenticated', 'authenticated',
     'gyokan-del-test-b@example.invalid', now(), now());
  insert into del_result values (12, '(g) a new account with B''s e-mail address', 'created', 'created');
exception when others then
  insert into del_result values (12, '(g) a new account with B''s e-mail address', 'created', sqlerrm);
end $$;

-- ── (j) A goes on as usual ──
set local role authenticated;
select pg_temp.act_as(current_setting('td.a'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000a08', current_setting('td.a')::uuid, 'tdel NA A新規', now(), 'private', 'shared');
with u as (update public.events set title = 'tdel NA edited' where id = '00000000-0000-4000-8000-000000000a08' returning 1)
insert into del_result
select 13, '(j) A adds / edits an event', '1 / 1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000a08')::text || ' / ' ||
  (select count(*) from u)::text;
with d as (delete from public.events where id = '00000000-0000-4000-8000-000000000a08' returning 1)
insert into del_result select 14, '(j) A deletes an event', '1', (select count(*) from d)::text;
-- A invites the new account (B's address), which joins; then A leaves (共有をやめる).
do $$ begin
  perform pg_temp.act_as(current_setting('td.a'));
  perform set_config('td.tok2', public.create_household_invite(), true);
  perform pg_temp.act_as(current_setting('td.f'));
  perform public.accept_household_invite(current_setting('td.tok2'), false);
  perform pg_temp.act_as(current_setting('td.a'));
  perform public.leave_household();
  insert into del_result values (15, '(j) A invites, the new account joins, A 共有をやめる', 'ok', 'ok');
exception when others then
  insert into del_result values (15, '(j) A invites, the new account joins, A 共有をやめる', 'ok', sqlerrm);
end $$;

reset role;
select no, check_name, expected, actual, expected = actual as ok from del_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 2 — (b): the creator of the household (A) deletes the account while
--   B stays
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table del_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on del_result to authenticated, anon;
select set_config('td.a', '00000000-0000-4000-8000-000000000901', true),
       set_config('td.b', '00000000-0000-4000-8000-000000000902', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', current_setting('td.a')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-a@example.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('td.b')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-b@example.invalid', now(), now());
select set_config('td.h', public.ensure_household_for(current_setting('td.a')::uuid)::text, true);
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.leftovers(uid uuid) returns text language plpgsql as $$
declare c record; n bigint; found text[] := '{}';
begin
  for c in select table_name, column_name from information_schema.columns
            where table_schema = 'public' and data_type = 'uuid' loop
    execute format('select count(*) from public.%I where %I = $1', c.table_name, c.column_name) into n using uid;
    if n > 0 then found := found || (c.table_name || '.' || c.column_name || '=' || n); end if;
  end loop;
  select count(*) into n from public.event_history where old_values::text like '%' || uid::text || '%';
  if n > 0 then found := found || ('event_history.old_values=' || n); end if;
  select count(*) into n from auth.users where id = uid;
  if n > 0 then found := found || ('auth.users=' || n); end if;
  return coalesce(nullif(array_to_string(found, ', '), ''), 'none');
end;
$$;
set local role authenticated;

select pg_temp.act_as(current_setting('td.a'));
select set_config('td.tok', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('td.b'));
select public.accept_household_invite(current_setting('td.tok'), false);
select pg_temp.act_as(current_setting('td.a'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000a01', current_setting('td.a')::uuid, 'tdel SA A共有', now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000a07', current_setting('td.a')::uuid, 'tdel OA A自分だけ', now(), 'private', 'only_me');

do $$ begin
  perform public.delete_my_account();
  insert into del_result values (1, 'A (the creator) deletes the account', 'deleted', 'deleted');
exception when others then
  insert into del_result values (1, 'A (the creator) deletes the account', 'deleted', sqlerrm);
end $$;

reset role;
insert into del_result
select 2, 'the household stays / created_by is empty', '1 / null',
  (select count(*) from public.households where id = current_setting('td.h')::uuid)::text || ' / ' ||
  coalesce((select coalesce(created_by::text, 'null') from public.households where id = current_setting('td.h')::uuid), '-')
union all select 3, 'members: B only', '1 / 1',
  (select count(*) from public.household_members where household_id = current_setting('td.h')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members where household_id = current_setting('td.h')::uuid
     and user_id = current_setting('td.b')::uuid)::text
union all select 4, 'A''s 自分だけ OA is gone', '0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000a07')::text
union all select 5, '(f) where A''s id still appears', 'none', pg_temp.leftovers(current_setting('td.a')::uuid);

set local role authenticated;
select pg_temp.act_as(current_setting('td.b'));
insert into del_result
select 6, 'B sees A''s shared SA as 以前のメンバー', '1 / null',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000a01')::text || ' / ' ||
  coalesce((select coalesce(user_id::text, 'null') from public.events where id = '00000000-0000-4000-8000-000000000a01'), '-');
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000a09', current_setting('td.b')::uuid, 'tdel NB B新規', now(), 'private', 'shared');
with u as (update public.events set title = 'tdel SA edited by B' where id = '00000000-0000-4000-8000-000000000a01' returning 1),
     d as (delete from public.events where id = '00000000-0000-4000-8000-000000000a09' returning 1)
insert into del_result
select 7, 'B adds (in the household) / edits SA / deletes', '1 / 1 / 1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000a09'
     and household_id = current_setting('td.h')::uuid)::text || ' / ' ||
  (select count(*) from u)::text || ' / ' || (select count(*) from d)::text;
do $$ begin
  if public.create_household_invite() is null then raise exception 'no token'; end if;
  insert into del_result values (8, 'B can make an invite link', 'ok', 'ok');
exception when others then
  insert into del_result values (8, 'B can make an invite link', 'ok', sqlerrm);
end $$;

reset role;
select no, check_name, expected, actual, expected = actual as ok from del_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 3 — (c): B deletes, then A (now the last one) deletes: the household
--   goes with everything in it
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table del_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on del_result to authenticated, anon;
select set_config('td.a', '00000000-0000-4000-8000-000000000901', true),
       set_config('td.b', '00000000-0000-4000-8000-000000000902', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', current_setting('td.a')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-a@example.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('td.b')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-b@example.invalid', now(), now());
select set_config('td.h', public.ensure_household_for(current_setting('td.a')::uuid)::text, true);
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.leftovers(uid uuid) returns text language plpgsql as $$
declare c record; n bigint; found text[] := '{}';
begin
  for c in select table_name, column_name from information_schema.columns
            where table_schema = 'public' and data_type = 'uuid' loop
    execute format('select count(*) from public.%I where %I = $1', c.table_name, c.column_name) into n using uid;
    if n > 0 then found := found || (c.table_name || '.' || c.column_name || '=' || n); end if;
  end loop;
  select count(*) into n from public.event_history where old_values::text like '%' || uid::text || '%';
  if n > 0 then found := found || ('event_history.old_values=' || n); end if;
  select count(*) into n from auth.users where id = uid;
  if n > 0 then found := found || ('auth.users=' || n); end if;
  return coalesce(nullif(array_to_string(found, ', '), ''), 'none');
end;
$$;
set local role authenticated;

select pg_temp.act_as(current_setting('td.a'));
select set_config('td.tok', public.create_household_invite(), true);
select pg_temp.act_as(current_setting('td.b'));
select public.accept_household_invite(current_setting('td.tok'), false);
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000a02', current_setting('td.b')::uuid, 'tdel SB B共有', now(), 'private', 'shared');
select pg_temp.act_as(current_setting('td.a'));
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000a01', current_setting('td.a')::uuid, 'tdel SA A共有', now(), 'private', 'shared');

select pg_temp.act_as(current_setting('td.b'));
do $$ begin
  perform public.delete_my_account();
  insert into del_result values (1, 'B deletes the account', 'deleted', 'deleted');
exception when others then
  insert into del_result values (1, 'B deletes the account', 'deleted', sqlerrm);
end $$;
-- A edits B's event that stayed (history in the household), and makes an
-- invite link that is never used.
select pg_temp.act_as(current_setting('td.a'));
update public.events set title = 'tdel SB edited by A' where id = '00000000-0000-4000-8000-000000000a02';
select set_config('td.tok2', public.create_household_invite(), true);
do $$ begin
  perform public.delete_my_account();
  insert into del_result values (2, 'A (the last one) deletes the account', 'deleted', 'deleted');
exception when others then
  insert into del_result values (2, 'A (the last one) deletes the account', 'deleted', sqlerrm);
end $$;

reset role;
insert into del_result
select 3, 'household / members / invites left', '0 / 0 / 0',
  (select count(*) from public.households where id = current_setting('td.h')::uuid)::text || ' / ' ||
  (select count(*) from public.household_members where household_id = current_setting('td.h')::uuid)::text || ' / ' ||
  (select count(*) from public.household_invites where household_id = current_setting('td.h')::uuid)::text
union all select 4, 'events of the household (incl. B''s creator-less SB) left', '0 / 0',
  (select count(*) from public.events where household_id = current_setting('td.h')::uuid)::text || ' / ' ||
  (select count(*) from public.events where id in ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000a02'))::text
union all select 5, 'history of the household left', '0 / 0',
  (select count(*) from public.event_history where event_household_id = current_setting('td.h')::uuid)::text || ' / ' ||
  (select count(*) from public.event_history where event_id in ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000a02'))::text
union all select 6, '(f) where A''s / B''s id still appears', 'none / none',
  pg_temp.leftovers(current_setting('td.a')::uuid) || ' / ' || pg_temp.leftovers(current_setting('td.b')::uuid);

select no, check_name, expected, actual, expected = actual as ok from del_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 4 — (d)(i): D, with no household at all, deletes the account; E,
--   alone with an unused invite link, deletes the account and the link
--   stops working
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table del_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on del_result to authenticated, anon;
select set_config('td.d', '00000000-0000-4000-8000-000000000904', true),
       set_config('td.e', '00000000-0000-4000-8000-000000000905', true),
       set_config('td.g', '00000000-0000-4000-8000-000000000907', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', current_setting('td.d')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-d@example.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('td.e')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-e@example.invalid', now(), now()),
  ('00000000-0000-0000-0000-000000000000', current_setting('td.g')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-g@example.invalid', now(), now());
select set_config('td.he', public.ensure_household_for(current_setting('td.e')::uuid)::text, true);
-- D's data, with no household (made here directly). No event for D: saving
-- an event always gives its creator a household (events_fill_household), so
-- a person with events always has one — that case is E.
insert into public.projects (id, user_id, name) values
  ('00000000-0000-4000-8000-000000000b11', current_setting('td.d')::uuid, 'tdel PD');
insert into public.tasks (user_id, project_id, title, task_date) values
  (current_setting('td.d')::uuid, '00000000-0000-4000-8000-000000000b11', 'tdel TD', current_date);
insert into public.daily_diaries (user_id, diary_date, body) values (current_setting('td.d')::uuid, current_date, 'tdel D');
-- E's event, in E's one-person household.
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000a12', current_setting('td.e')::uuid, 'tdel EE', now(), 'private', 'shared');
create function pg_temp.act_as(p_user text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.leftovers(uid uuid) returns text language plpgsql as $$
declare c record; n bigint; found text[] := '{}';
begin
  for c in select table_name, column_name from information_schema.columns
            where table_schema = 'public' and data_type = 'uuid' loop
    execute format('select count(*) from public.%I where %I = $1', c.table_name, c.column_name) into n using uid;
    if n > 0 then found := found || (c.table_name || '.' || c.column_name || '=' || n); end if;
  end loop;
  select count(*) into n from public.event_history where old_values::text like '%' || uid::text || '%';
  if n > 0 then found := found || ('event_history.old_values=' || n); end if;
  select count(*) into n from auth.users where id = uid;
  if n > 0 then found := found || ('auth.users=' || n); end if;
  return coalesce(nullif(array_to_string(found, ', '), ''), 'none');
end;
$$;
insert into del_result
select 1, 'D has no household before', '0',
  (select count(*) from public.household_members where user_id = current_setting('td.d')::uuid)::text;
set local role authenticated;

select pg_temp.act_as(current_setting('td.e'));
select set_config('td.tok', public.create_household_invite(), true);
do $$ begin
  perform public.delete_my_account();
  insert into del_result values (2, 'E (alone, with an unused invite) deletes the account', 'deleted', 'deleted');
exception when others then
  insert into del_result values (2, 'E (alone, with an unused invite) deletes the account', 'deleted', sqlerrm);
end $$;
-- (i) G tries E's link.
select pg_temp.act_as(current_setting('td.g'));
do $$ begin
  perform public.accept_household_invite(current_setting('td.tok'), false);
  insert into del_result values (3, '(i) G tries E''s unused link', 'invalid_invite', 'joined');
exception when others then
  insert into del_result values (3, '(i) G tries E''s unused link', 'invalid_invite', sqlerrm);
end $$;

select pg_temp.act_as(current_setting('td.d'));
do $$ begin
  perform public.delete_my_account();
  insert into del_result values (4, '(d) D (no household) deletes the account', 'deleted', 'deleted');
exception when others then
  insert into del_result values (4, '(d) D (no household) deletes the account', 'deleted', sqlerrm);
end $$;

reset role;
insert into del_result
select 5, '(i) invites made by E / E''s household left', '0 / 0',
  (select count(*) from public.household_invites
    where token_hash = encode(sha256(convert_to(current_setting('td.tok'), 'UTF8')), 'hex'))::text || ' / ' ||
  (select count(*) from public.households where id = current_setting('td.he')::uuid)::text
union all select 6, 'G unchanged (no household joined)', '0',
  (select count(*) from public.household_members where user_id = current_setting('td.g')::uuid)::text
union all select 7, '(d) D''s project / task / diary left; E''s event left', '0 / 0 / 0 / 0',
  (select count(*) from public.projects where id = '00000000-0000-4000-8000-000000000b11')::text || ' / ' ||
  (select count(*) from public.tasks where title = 'tdel TD')::text || ' / ' ||
  (select count(*) from public.daily_diaries where body = 'tdel D')::text || ' / ' ||
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000a12')::text
union all select 8, '(f)(g) where D''s / E''s id still appears (incl. auth.users)', 'none / none',
  pg_temp.leftovers(current_setting('td.d')::uuid) || ' / ' || pg_temp.leftovers(current_setting('td.e')::uuid);

select no, check_name, expected, actual, expected = actual as ok from del_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 5 — (h): only the signed-in person; never anon; no way to name
--   another user
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table del_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on del_result to authenticated, anon;
select set_config('td.a', '00000000-0000-4000-8000-000000000901', true);
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', current_setting('td.a')::uuid, 'authenticated', 'authenticated', 'gyokan-del-test-a@example.invalid', now(), now());

-- anon (signed out)
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform public.delete_my_account();
  insert into del_result values (1, 'anon calls it', 'permission denied', 'deleted');
exception when others then
  insert into del_result values (1, 'anon calls it', 'permission denied',
    case when sqlerrm like 'permission denied%' then 'permission denied' else sqlerrm end);
end $$;
reset role;

set local role authenticated;
-- signed in, but no user in the token
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$ begin
  perform public.delete_my_account();
  insert into del_result values (2, 'no user in the token', 'not_authenticated', 'deleted');
exception when others then
  insert into del_result values (2, 'no user in the token', 'not_authenticated', sqlerrm);
end $$;
-- a user that does not exist
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000999', 'role', 'authenticated')::text, true);
do $$ begin
  perform public.delete_my_account();
  insert into del_result values (3, 'a user id that does not exist', 'not_authenticated', 'deleted');
exception when others then
  insert into del_result values (3, 'a user id that does not exist', 'not_authenticated', sqlerrm);
end $$;
-- naming another user: there is no such function
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000999', 'role', 'authenticated')::text, true);
do $$ begin
  execute 'select public.delete_my_account($1)' using current_setting('td.a')::uuid;
  insert into del_result values (4, 'delete_my_account(<A''s id>)', 'no such function', 'deleted');
exception when others then
  insert into del_result values (4, 'delete_my_account(<A''s id>)', 'no such function',
    case when sqlerrm like '%does not exist%' then 'no such function' else sqlerrm end);
end $$;
reset role;
insert into del_result
select 5, 'A is still there after all of the above', '1',
  (select count(*) from auth.users where id = current_setting('td.a')::uuid)::text
union all select 6, 'only one delete_my_account, with no arguments', '1 / 0',
  (select count(*) from pg_proc where proname = 'delete_my_account')::text || ' / ' ||
  (select string_agg(pronargs::text, ',') from pg_proc where proname = 'delete_my_account');

select no, check_name, expected, actual, expected = actual as ok from del_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 6 — after blocks 1–5: nothing was kept (read-only)
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
    (select count(*) from auth.users where email like 'gyokan-del-test-%@example.invalid')::text
  union all select 4, 'no test event / history left', '0 / 0',
    (select count(*) from public.events where title like 'tdel %')::text || ' / ' ||
    (select count(*) from public.event_history where event_title like 'tdel %')::text
  union all select 5, 'no test project / task / diary left', '0 / 0 / 0',
    (select count(*) from public.projects where name like 'tdel %')::text || ' / ' ||
    (select count(*) from public.tasks where title like 'tdel %')::text || ' / ' ||
    (select count(*) from public.daily_diaries where body like 'tdel%')::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;
