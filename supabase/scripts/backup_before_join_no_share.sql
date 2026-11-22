-- Backup before migration 20261123_join_no_share.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copies go to
-- the "backup" schema (created here too if missing), which the Supabase API
-- does not expose. Running it again does nothing new: the copies are only
-- made the first time.
--
--   1. events (the migration changes how joining sets their visibility)
--   2. the current definition of accept_household_invite (the only function
--      the migration replaces)

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.events_join_20261123 as table public.events;

create table if not exists backup.definitions_join_20261123 as
select 'function'::text                            as kind,
       p.proname::text                             as name,
       pg_get_function_identity_arguments(p.oid)   as arguments,
       pg_get_functiondef(p.oid)                   as definition,
       now()                                       as saved_at
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('accept_household_invite', 'check_household_invite');

-- Check (one table). Every row must show ok = true (when run right after the
-- copies were made).
select no, item, now, backup, now = backup as ok from (
  select 1 as no, 'events' as item,
         (select count(*) from public.events)                 as now,
         (select count(*) from backup.events_join_20261123)   as backup
  union all select 2, 'saved functions (expected 2: accept, check)',
         2,
         (select count(*) from backup.definitions_join_20261123)
) as checks
order by no;
-- To look at the saved definitions:
--   select name, definition from backup.definitions_join_20261123;

-- Restore (only if something went wrong — not part of the normal steps):
--   * Function: copy the "definition" of accept_household_invite into a new
--     query and Run it; that puts the previous version back.
--   * Rows: the migration changes no rows by itself. Events of people who
--     joined afterwards were made 自分だけ; compare with the copy, e.g.
--       select e.id, b.visibility as before, e.visibility as now
--         from public.events e join backup.events_join_20261123 b on b.id = e.id
--        where e.visibility is distinct from b.visibility;
-- When everything is confirmed fine, the copies can be dropped:
--   drop table backup.events_join_20261123;
--   drop table backup.definitions_join_20261123;
