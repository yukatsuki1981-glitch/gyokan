-- Backup of events and tasks before migration 20261013_households.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copies go to
-- a separate "backup" schema, which the Supabase API does not expose (only
-- "public" is), so they can't be read through the app's API keys.
-- Running it again later just adds another dated copy.

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table backup.events_20261013 as table public.events;
create table backup.tasks_20261013  as table public.tasks;

-- Check: each pair of numbers must match.
select
  (select count(*) from public.events)          as events_now,
  (select count(*) from backup.events_20261013) as events_backup,
  (select count(*) from public.tasks)           as tasks_now,
  (select count(*) from backup.tasks_20261013)  as tasks_backup;

-- Restore (only if something went wrong — not part of the normal steps):
--   events: delete from public.events where id not in (select id from backup.events_20261013);
--           update / re-insert from backup.events_20261013 as needed.
-- When everything is confirmed fine, the copies can be dropped:
--   drop table backup.events_20261013; drop table backup.tasks_20261013;
