-- Backup of events before migration 20261018_event_visibility_and_history.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copy goes to
-- the "backup" schema (created by backup_before_households.sql; created here
-- too if missing), which the Supabase API does not expose, so it can't be
-- read through the app's API keys. Running it again does nothing new: the
-- copy is only made the first time.

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.events_20261018 as table public.events;

-- Check: the two numbers must match (when run right after the copy was made).
select
  (select count(*) from public.events)          as events_now,
  (select count(*) from backup.events_20261018) as events_backup;

-- Restore (only if something went wrong — not part of the normal steps):
--   the migration only adds a column and a table, so the original values of
--   every event are in backup.events_20261018; compare with e.g.
--   select * from backup.events_20261018 b
--   where not exists (select 1 from public.events e where e.id = b.id);
-- When everything is confirmed fine, the copy can be dropped:
--   drop table backup.events_20261018;
