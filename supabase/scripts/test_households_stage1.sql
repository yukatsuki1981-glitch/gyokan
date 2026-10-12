-- Stage 1 checks for migration 20261013_households.sql.
-- Run each block separately in the Supabase SQL Editor, AFTER the migration.
-- Every block that acts as a user ends with ROLLBACK, so nothing is changed.
--
-- Replace YOUR_USER_ID below with your own id from block 0.

-- ── 0. Your user id ─────────────────────────────────────────────────────────
select id, email from auth.users order by created_at;

-- ── 1. Existing data is intact (run as the SQL Editor's admin role) ─────────
-- events: same count as the backup, and every event now has a household.
select
  (select count(*) from public.events)                          as events_now,
  (select count(*) from backup.events_20261013)                 as events_backup,
  (select count(*) from public.events where household_id is null) as events_without_household,  -- expect 0
  (select count(*) from public.tasks)                           as tasks_now,
  (select count(*) from backup.tasks_20261013)                  as tasks_backup;

-- Each user's events are still theirs (user_id unchanged): counts per user
-- must equal the backup's.
select b.user_id, b.n as before, coalesce(a.n, 0) as after
from (select user_id, count(*) n from backup.events_20261013 group by user_id) b
left join (select user_id, count(*) n from public.events group by user_id) a using (user_id);

-- Everyone has exactly one household of their own (households = users).
select
  (select count(*) from auth.users)               as users,
  (select count(*) from public.households)        as households,
  (select count(*) from public.household_members) as memberships;

-- ── 2. As YOU: you see exactly your own events and tasks, as before ─────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"YOUR_USER_ID","role":"authenticated"}', true);
select
  (select count(*) from public.events)                                      as events_visible,
  (select count(*) from public.events where user_id = 'YOUR_USER_ID')       as my_events,   -- must equal events_visible
  (select count(*) from public.tasks)                                       as tasks_visible,
  (select count(*) from public.household_members)                           as my_household_members; -- 1 for now
rollback;

-- ── 3. As someone in no household (a made-up id): sees nothing ─────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000dead","role":"authenticated"}', true);
select
  (select count(*) from public.events)            as events,            -- 0
  (select count(*) from public.tasks)             as tasks,             -- 0
  (select count(*) from public.households)        as households,        -- 0
  (select count(*) from public.household_members) as members,           -- 0
  (select count(*) from public.household_invites) as invites,           -- 0
  (select count(*) from public.profiles)          as profiles;          -- 0
select * from public.check_household_invite('not-a-real-token');        -- status = invalid
rollback;

-- ── 4. Signed out (anon): sees nothing, cannot create invites ──────────────
begin;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select count(*) as events_visible_to_anon from public.events;            -- 0
rollback;

begin;
set local role anon;
select public.create_household_invite();   -- expect: permission denied for function create_household_invite
rollback;

-- ── 5. As YOU: cannot write an event as someone else ────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"YOUR_USER_ID","role":"authenticated"}', true);
insert into public.events (user_id, title, start_time)
values ('00000000-0000-4000-8000-00000000dead', 'test', now());
-- expect: new row violates row-level security policy for table "events"
rollback;

-- ── 6. As YOU: an event saved without a household gets yours (old app) ─────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"YOUR_USER_ID","role":"authenticated"}', true);
insert into public.events (user_id, title, start_time)
values ('YOUR_USER_ID', 'stage1 test', now())
returning household_id, (select household_id from public.household_members where user_id = 'YOUR_USER_ID') as my_household;
-- expect: the two columns are the same id
rollback;

-- ── 7. Policies on other tables are untouched ──────────────────────────────
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
-- tasks / projects / cases / project_memos / daily_memos / daily_diaries /
-- user_preferences keep their *_own policies; only events has the new
-- events_*_household ones.
