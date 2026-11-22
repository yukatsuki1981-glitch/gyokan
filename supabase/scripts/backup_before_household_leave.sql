-- Backup before migration 20261123_household_leave.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copies go to
-- the "backup" schema (created here too if missing), which the Supabase API
-- does not expose, so they can't be read through the app's API keys. Running
-- it again does nothing new: the copies are only made the first time.
--
--   1. household_members, households, events, event_history (the rows)
--   2. the current definitions of the related functions and triggers

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.household_members_leave_20261123 as table public.household_members;
create table if not exists backup.households_leave_20261123        as table public.households;
create table if not exists backup.events_leave_20261123            as table public.events;
create table if not exists backup.event_history_leave_20261123     as table public.event_history;

create table if not exists backup.definitions_leave_20261123 as
select 'function'::text                            as kind,
       p.proname::text                             as name,
       pg_get_function_identity_arguments(p.oid)   as arguments,
       pg_get_functiondef(p.oid)                   as definition,
       now()                                       as saved_at
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('ensure_household_for', 'accept_household_invite', 'create_household_invite',
                     'household_member_limit_for', 'events_keep_creator', 'events_record_history',
                     'events_fill_household', 'is_household_member', 'leave_household')
union all
select 'trigger', t.tgname::text, c.relname::text, pg_get_triggerdef(t.oid), now()
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'events' and not t.tgisinternal;

-- Check (one table; the SQL Editor shows only the last result). Every row
-- must show ok = true (when run right after the copies were made):
--   rows 1–4: number of rows now = number of rows in the copy
--   row 5:    8 functions saved (leave_household doesn't exist yet)
--   row 6:    every trigger on events saved
select no, item, now, backup, now = backup as ok from (
  select 1 as no, 'household_members' as item,
         (select count(*) from public.household_members)                as now,
         (select count(*) from backup.household_members_leave_20261123) as backup
  union all select 2, 'households',
         (select count(*) from public.households),
         (select count(*) from backup.households_leave_20261123)
  union all select 3, 'events',
         (select count(*) from public.events),
         (select count(*) from backup.events_leave_20261123)
  union all select 4, 'event_history',
         (select count(*) from public.event_history),
         (select count(*) from backup.event_history_leave_20261123)
  union all select 5, 'saved functions (expected 8)',
         8,
         (select count(*) from backup.definitions_leave_20261123 where kind = 'function')
  union all select 6, 'saved triggers on events',
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'events' and not t.tgisinternal),
         (select count(*) from backup.definitions_leave_20261123 where kind = 'trigger')
) as checks
order by no;
-- To look at the saved definitions themselves:
--   select kind, name, arguments, definition from backup.definitions_leave_20261123 order by kind, name;

-- Restore (only if something went wrong — not part of the normal steps):
--   * The migration only ADDS leave_household(); it changes no other function,
--     trigger, table or policy. To take it away again:
--       drop function if exists public.leave_household();
--   * If someone left by mistake: compare their rows with the copies, e.g.
--       select * from backup.household_members_leave_20261123 where user_id = '<id>';
--       select id, household_id from backup.events_leave_20261123 where user_id = '<id>';
--     (Rejoining with a new invite is the normal way back.)
-- When everything is confirmed fine, the copies can be dropped:
--   drop table backup.household_members_leave_20261123;
--   drop table backup.households_leave_20261123;
--   drop table backup.events_leave_20261123;
--   drop table backup.event_history_leave_20261123;
--   drop table backup.definitions_leave_20261123;
