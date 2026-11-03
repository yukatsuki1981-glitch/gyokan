-- Stage 3 checks: per-event "自分だけ / 共有" and the edit history.
-- Run AFTER migration 20261018_event_visibility_and_history.sql.
--
-- Accounts are looked up by e-mail — nothing to replace by hand:
--   t1  yukatsuki1981+t1@gmail.com   (test, same household as t2)
--   t2  yukatsuki1981+t2@gmail.com   (test)
--   outsider  s22p5i@bma.biglobe.ne.jp  (a real account: only READ as, in
--             rolled-back blocks — nothing is ever written as or for it)
--
-- Run each block separately (select it, then Run). Blocks 1–5 create their
-- own test events as t1/t2 and end with ROLLBACK, so nothing is kept.
-- Every block returns rows of: check / expected / actual / ok.
-- All rows must show ok = true.

-- ═════════════════════════════════════════════════════════════════════════════
-- Block 0 — prerequisites (read-only)
-- ═════════════════════════════════════════════════════════════════════════════
with ids as (
  select
    (select id from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com') as t1,
    (select id from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com') as t2,
    (select id from auth.users where lower(email) = 's22p5i@bma.biglobe.ne.jp')   as outsider
), r(no, check_name, expected, actual) as (
  select 1, 'accounts found (t1, t2, outsider)', '3',
    ((select count(*) from ids where t1 is not null) + (select count(*) from ids where t2 is not null)
      + (select count(*) from ids where outsider is not null))::text
  union all select 2, 't1 and t2 share one household', 'true',
    ((select household_id from public.household_members, ids where user_id = ids.t1)
      = (select household_id from public.household_members, ids where user_id = ids.t2))::text
  union all select 3, 'outsider is NOT in that household', 'false',
    coalesce(((select household_id from public.household_members, ids where user_id = ids.t1)
      = (select household_id from public.household_members, ids where user_id = ids.outsider)), false)::text
  union all select 4, 'events.visibility column exists', '1',
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'events' and column_name = 'visibility')::text
  union all select 5, 'events with a visibility other than shared/only_me', '0',
    (select count(*) from public.events where visibility not in ('shared', 'only_me'))::text
  union all select 6, 'event_history table exists', 'true',
    (to_regclass('public.event_history') is not null)::text
  union all select 7, 'events_record_history trigger exists', '1',
    (select count(*) from pg_trigger where tgname = 'events_record_history' and not tgisinternal)::text
  union all select 8, 'events policies (select/insert/update/delete)', '4',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'events')::text
)
select no, check_name, expected, actual, expected = actual as ok from r order by no;
-- Also note (for information, not a check): how many existing events are
-- 'shared' — right after the migration this is every event.
select visibility, count(*) from public.events group by visibility;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 1 — who sees what
--   自分だけ is hidden from t2 / 共有 is visible to t2 / work events and tasks
--   are not shared / t2 can't edit or delete t1's 自分だけ event
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table stage3_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on stage3_result to authenticated;
select set_config('stage3.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('stage3.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true);

set local role authenticated;

-- As t1: one 共有, one 自分だけ, one work event, one task.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t1'), 'role', 'authenticated')::text, true);
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000101', current_setting('stage3.t1')::uuid, 'stage3 共有',    now(), 'private', 'shared'),
  ('00000000-0000-4000-8000-000000000102', current_setting('stage3.t1')::uuid, 'stage3 自分だけ', now(), 'private', 'only_me'),
  ('00000000-0000-4000-8000-000000000103', current_setting('stage3.t1')::uuid, 'stage3 仕事',    now(), 'work',    'shared');
insert into public.tasks (id, user_id, title, task_date) values
  ('00000000-0000-4000-8000-000000000104', current_setting('stage3.t1')::uuid, 'stage3 task', current_date);
insert into stage3_result
select 1, 't1 sees all 3 of its new events', '3',
  (select count(*) from public.events where id::text like '00000000-0000-4000-8000-00000000010%')::text;

-- As t2.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t2'), 'role', 'authenticated')::text, true);
insert into stage3_result
select 2, 't2 sees the 共有 event', '1',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000101')::text
union all select 3, 't2 does NOT see the 自分だけ event', '0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000102')::text
union all select 4, 't2 does NOT see the work event', '0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000103')::text
union all select 5, 't2 does NOT see the task', '0',
  (select count(*) from public.tasks where id = '00000000-0000-4000-8000-000000000104')::text;

with u as (update public.events set title = 'changed by t2'
           where id in ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103') returning 1)
insert into stage3_result select 6, 't2 cannot edit the 自分だけ / work event (rows changed)', '0', (select count(*) from u)::text;
with d as (delete from public.events
           where id in ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103') returning 1)
insert into stage3_result select 7, 't2 cannot delete the 自分だけ / work event (rows deleted)', '0', (select count(*) from d)::text;

-- Back as t1: both are still there, unchanged.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t1'), 'role', 'authenticated')::text, true);
insert into stage3_result
select 8, 't1 still has the 自分だけ / work event, unchanged', '2',
  (select count(*) from public.events
    where id in ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000103')
      and title like 'stage3 %')::text;

select no, check_name, expected, actual, expected = actual as ok from stage3_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 2 — t2's edit is recorded; a reorder is not; the outsider sees nothing
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table stage3_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on stage3_result to authenticated;
select set_config('stage3.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('stage3.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true),
       set_config('stage3.outsider', (select id::text from auth.users where lower(email) = 's22p5i@bma.biglobe.ne.jp'), true);

set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t1'), 'role', 'authenticated')::text, true);
insert into public.events (id, user_id, title, start_time, scope, visibility, sort_order) values
  ('00000000-0000-4000-8000-000000000201', current_setting('stage3.t1')::uuid, 'stage3 元のタイトル', now(), 'private', 'shared', 5);

-- As t2: edit the title, then only reorder (both ways the app does it).
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t2'), 'role', 'authenticated')::text, true);
update public.events set title = 'stage3 t2が変更' where id = '00000000-0000-4000-8000-000000000201';
update public.events set sort_order = 9 where id = '00000000-0000-4000-8000-000000000201';
select public.set_event_sort_orders(array['00000000-0000-4000-8000-000000000201']::uuid[], array[3]);
-- t2 also tries to make it 自分だけ / work: only the creator may, so both stay.
update public.events set visibility = 'only_me', scope = 'work' where id = '00000000-0000-4000-8000-000000000201';

insert into stage3_result
select 1, 'history rows for the event (title edit only; reorders not recorded)', '1',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000201')::text
union all select 2, 'recorded editor is t2', 'true',
  (select bool_and(changed_by = current_setting('stage3.t2')::uuid) from public.event_history
    where event_id = '00000000-0000-4000-8000-000000000201')::text
union all select 3, 'recorded: action / fields / old title', 'update / {title} / stage3 元のタイトル',
  (select action || ' / ' || changed_fields::text || ' / ' || (old_values ->> 'title') from public.event_history
    where event_id = '00000000-0000-4000-8000-000000000201')
union all select 4, 'event now: title / sort_order / visibility / scope', 'stage3 t2が変更 / 3 / shared / private',
  (select title || ' / ' || sort_order || ' / ' || visibility || ' / ' || scope from public.events
    where id = '00000000-0000-4000-8000-000000000201')
union all select 5, 'creator is still t1', 'true',
  (select (user_id = current_setting('stage3.t1')::uuid) from public.events
    where id = '00000000-0000-4000-8000-000000000201')::text;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t1'), 'role', 'authenticated')::text, true);
insert into stage3_result
select 6, 't1 sees the history row', '1',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000201')::text;

-- The outsider (real account) — read only.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.outsider'), 'role', 'authenticated')::text, true);
insert into stage3_result
select 7, 'outsider sees no history of t1/t2', '0',
  (select count(*) from public.event_history
    where event_user_id in (current_setting('stage3.t1')::uuid, current_setting('stage3.t2')::uuid))::text
union all select 8, 'outsider sees none of t1/t2''s events', '0',
  (select count(*) from public.events
    where user_id in (current_setting('stage3.t1')::uuid, current_setting('stage3.t2')::uuid))::text;

-- Nobody can write history directly.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t2'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into public.event_history (event_id, event_title, event_user_id, event_scope, event_visibility, action)
    values (gen_random_uuid(), 'x', auth.uid(), 'private', 'shared', 'update');
    insert into stage3_result values (9, 'direct insert into event_history is refused', 'refused', 'ALLOWED');
  exception when insufficient_privilege then
    insert into stage3_result values (9, 'direct insert into event_history is refused', 'refused', 'refused');
  end;
end $$;

select no, check_name, expected, actual, expected = actual as ok from stage3_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 3 — the history of a 自分だけ event is visible to its creator only
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table stage3_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on stage3_result to authenticated;
select set_config('stage3.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('stage3.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true);

set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t1'), 'role', 'authenticated')::text, true);
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000301', current_setting('stage3.t1')::uuid, 'stage3 あとで自分だけ', now(), 'private', 'shared');

-- t2 edits it while it is shared …
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t2'), 'role', 'authenticated')::text, true);
update public.events set memo = 'stage3 t2のメモ' where id = '00000000-0000-4000-8000-000000000301';
insert into stage3_result
select 1, 'while shared: t2 sees its history', '1',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000301')::text;

-- … then t1 makes it 自分だけ.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t1'), 'role', 'authenticated')::text, true);
update public.events set visibility = 'only_me' where id = '00000000-0000-4000-8000-000000000301';
insert into stage3_result
select 2, 't1 sees both history rows (t2''s memo edit, own visibility change)', '2',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000301')::text;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t2'), 'role', 'authenticated')::text, true);
insert into stage3_result
select 3, 'now 自分だけ: t2 sees none of its history', '0',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000301')::text
union all select 4, 'now 自分だけ: t2 does not see the event', '0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000301')::text;

select no, check_name, expected, actual, expected = actual as ok from stage3_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 4 — deleting an event keeps its history (with a copy of the title)
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table stage3_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on stage3_result to authenticated;
select set_config('stage3.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true),
       set_config('stage3.t2', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t2@gmail.com'), true);

set local role authenticated;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t1'), 'role', 'authenticated')::text, true);
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000401', current_setting('stage3.t1')::uuid, 'stage3 消す予定', now(), 'private', 'shared');
update public.events set title = 'stage3 消す予定(変更)' where id = '00000000-0000-4000-8000-000000000401';

-- t2 deletes it.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t2'), 'role', 'authenticated')::text, true);
with d as (delete from public.events where id = '00000000-0000-4000-8000-000000000401' returning 1)
insert into stage3_result select 1, 't2 can delete t1''s shared event (rows deleted)', '1', (select count(*) from d)::text;

insert into stage3_result
select 2, 'history rows remain (edit + delete)', '2',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000401')::text
union all select 3, 'delete row: editor t2 / title copy', 'true / stage3 消す予定(変更)',
  (select (changed_by = current_setting('stage3.t2')::uuid)::text || ' / ' || event_title from public.event_history
    where event_id = '00000000-0000-4000-8000-000000000401' and action = 'delete');

select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t1'), 'role', 'authenticated')::text, true);
insert into stage3_result
select 4, 't1 also sees both history rows', '2',
  (select count(*) from public.event_history where event_id = '00000000-0000-4000-8000-000000000401')::text
union all select 5, 'the event itself is gone', '0',
  (select count(*) from public.events where id = '00000000-0000-4000-8000-000000000401')::text;

select no, check_name, expected, actual, expected = actual as ok from stage3_result order by no;
rollback;


-- ═════════════════════════════════════════════════════════════════════════════
-- Block 5 — the current app (main, which doesn't know "visibility") still works
--   It saves with an upsert of id/user_id/title/start_time/end_time/memo/
--   sort_order/scope/color (no visibility) and reads with user_id = me.
-- ═════════════════════════════════════════════════════════════════════════════
begin;
create temp table stage3_result (no int, check_name text, expected text, actual text) on commit drop;
grant all on stage3_result to authenticated;
select set_config('stage3.t1', (select id::text from auth.users where lower(email) = 'yukatsuki1981+t1@gmail.com'), true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stage3.t1'), 'role', 'authenticated')::text, true);

-- New event, saved the old way: gets 'shared'.
insert into public.events (id, user_id, title, start_time, end_time, memo, sort_order, scope, color)
values ('00000000-0000-4000-8000-000000000501', current_setting('stage3.t1')::uuid, 'stage3 旧アプリ', now(), null, '', 0, 'private', null)
on conflict (id) do update set user_id = excluded.user_id, title = excluded.title, start_time = excluded.start_time,
  end_time = excluded.end_time, memo = excluded.memo, sort_order = excluded.sort_order, scope = excluded.scope,
  color = excluded.color;

-- An event made 自分だけ in the new app, then edited in the old app: stays 自分だけ.
insert into public.events (id, user_id, title, start_time, scope, visibility) values
  ('00000000-0000-4000-8000-000000000502', current_setting('stage3.t1')::uuid, 'stage3 自分だけ', now(), 'private', 'only_me');
insert into public.events (id, user_id, title, start_time, end_time, memo, sort_order, scope, color)
values ('00000000-0000-4000-8000-000000000502', current_setting('stage3.t1')::uuid, 'stage3 自分だけ(旧アプリで変更)', now(), null, '', 1, 'private', null)
on conflict (id) do update set user_id = excluded.user_id, title = excluded.title, start_time = excluded.start_time,
  end_time = excluded.end_time, memo = excluded.memo, sort_order = excluded.sort_order, scope = excluded.scope,
  color = excluded.color;

insert into stage3_result
select 1, 'old-app insert gets visibility shared', 'shared',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000501')
union all select 2, 'old-app edit keeps 自分だけ', 'only_me',
  (select visibility from public.events where id = '00000000-0000-4000-8000-000000000502')
union all select 3, 'old-app read (user_id = me) returns both', '2',
  (select count(*) from public.events where user_id = current_setting('stage3.t1')::uuid
    and id in ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000502'))::text;

select no, check_name, expected, actual, expected = actual as ok from stage3_result order by no;
rollback;
