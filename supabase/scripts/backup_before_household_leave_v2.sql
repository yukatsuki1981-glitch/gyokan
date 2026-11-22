-- Backup before migration 20261123_household_leave_v2.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copies go to
-- the "backup" schema (created here too if missing), which the Supabase API
-- does not expose, so they can't be read through the app's API keys. Running
-- it again does nothing new: the copies are only made the first time.
-- (A fresh copy: the data has changed since backup_before_household_leave.sql.)
--
--   1. events, event_history, household_members, households (the rows)
--   2. the current definitions of the related functions and triggers, and of
--      the two columns this migration makes nullable

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.events_leave2_20261123            as table public.events;
create table if not exists backup.event_history_leave2_20261123     as table public.event_history;
create table if not exists backup.household_members_leave2_20261123 as table public.household_members;
create table if not exists backup.households_leave2_20261123        as table public.households;

create table if not exists backup.definitions_leave2_20261123 as
select 'function'::text                            as kind,
       p.proname::text                             as name,
       pg_get_function_identity_arguments(p.oid)   as arguments,
       pg_get_functiondef(p.oid)                   as definition,
       now()                                       as saved_at
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('leave_household', 'accept_household_invite', 'check_household_invite',
                     'events_keep_creator', 'events_record_history', 'ensure_household_for',
                     'events_fill_household', 'household_member_limit_for')
union all
select 'trigger', t.tgname::text, c.relname::text, pg_get_triggerdef(t.oid), now()
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'events' and not t.tgisinternal
union all
select 'column', table_name || '.' || column_name, 'is_nullable = ' || is_nullable,
       'alter table public.' || table_name || ' alter column ' || column_name ||
         case when is_nullable = 'NO' then ' set not null;' else ' drop not null;' end,
       now()
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'events' and column_name = 'user_id')
     or (table_name = 'event_history' and column_name = 'event_user_id'));

-- Check (one table; the SQL Editor shows only the last result). Every row
-- must show ok = true (when run right after the copies were made):
--   rows 1–4: number of rows now = number of rows in the copy
--   row 5:    8 functions saved
--   row 6:    every trigger on events saved
--   row 7:    2 column settings saved
select no, item, now, backup, now = backup as ok from (
  select 1 as no, 'events' as item,
         (select count(*) from public.events)                          as now,
         (select count(*) from backup.events_leave2_20261123)          as backup
  union all select 2, 'event_history',
         (select count(*) from public.event_history),
         (select count(*) from backup.event_history_leave2_20261123)
  union all select 3, 'household_members',
         (select count(*) from public.household_members),
         (select count(*) from backup.household_members_leave2_20261123)
  union all select 4, 'households',
         (select count(*) from public.households),
         (select count(*) from backup.households_leave2_20261123)
  union all select 5, 'saved functions (expected 8)',
         8,
         (select count(*) from backup.definitions_leave2_20261123 where kind = 'function')
  union all select 6, 'saved triggers on events',
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'events' and not t.tgisinternal),
         (select count(*) from backup.definitions_leave2_20261123 where kind = 'trigger')
  union all select 7, 'saved column settings (expected 2)',
         2,
         (select count(*) from backup.definitions_leave2_20261123 where kind = 'column')
) as checks
order by no;
-- To look at the saved definitions themselves:
--   select kind, name, arguments, definition from backup.definitions_leave2_20261123 order by kind, name;

-- Restore (only if something went wrong — not part of the normal steps):
--   * Functions / triggers: copy the "definition" text of a row into a new
--     query and Run it; that puts the old version back.
--   * Columns: the "definition" of the two 'column' rows is the statement that
--     puts the old setting back ("set not null" only works while no row has
--     an empty value — after someone left with v2, those rows must be dealt
--     with first).
--   * The check added by the migration: alter table public.events drop constraint events_no_creator_shared_check;
--   * Rows: compare with the copies, e.g.
--       select * from backup.events_leave2_20261123 b
--       where not exists (select 1 from public.events e where e.id = b.id);
-- When everything is confirmed fine, the copies can be dropped:
--   drop table backup.events_leave2_20261123;
--   drop table backup.event_history_leave2_20261123;
--   drop table backup.household_members_leave2_20261123;
--   drop table backup.households_leave2_20261123;
--   drop table backup.definitions_leave2_20261123;
