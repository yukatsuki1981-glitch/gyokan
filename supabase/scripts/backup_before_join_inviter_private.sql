-- Backup before migration 20261124_join_inviter_private.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copies go to
-- the "backup" schema (created here too if missing), which the Supabase API
-- does not expose. Running it again does nothing new: the copies are only
-- made the first time.
--
--   1. events and event_history (joining will change visibility of rows)
--   2. the current definitions of the functions the migration replaces, and
--      of the triggers on events (the migration adds one)

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.events_inviter_20261124        as table public.events;
create table if not exists backup.event_history_inviter_20261124 as table public.event_history;

create table if not exists backup.definitions_inviter_20261124 as
select 'function'::text                            as kind,
       p.proname::text                             as name,
       pg_get_function_identity_arguments(p.oid)   as arguments,
       pg_get_functiondef(p.oid)                   as definition,
       now()                                       as saved_at
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('accept_household_invite', 'events_keep_creator', 'events_record_history')
union all
select 'trigger', t.tgname::text, c.relname::text, pg_get_triggerdef(t.oid), now()
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'events' and not t.tgisinternal;

-- Check (one table). Every row must show ok = true (when run right after the
-- copies were made).
select no, item, now, backup, now = backup as ok from (
  select 1 as no, 'events' as item,
         (select count(*) from public.events)                          as now,
         (select count(*) from backup.events_inviter_20261124)         as backup
  union all select 2, 'event_history',
         (select count(*) from public.event_history),
         (select count(*) from backup.event_history_inviter_20261124)
  union all select 3, 'saved functions (expected 3)',
         3,
         (select count(*) from backup.definitions_inviter_20261124 where kind = 'function')
  union all select 4, 'saved triggers on events',
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'events' and not t.tgisinternal),
         (select count(*) from backup.definitions_inviter_20261124 where kind = 'trigger')
) as checks
order by no;
-- To look at the saved definitions:
--   select kind, name, definition from backup.definitions_inviter_20261124 order by kind, name;

-- Restore (only if something went wrong — not part of the normal steps):
--   * Functions: copy the "definition" of each saved function into a new
--     query and Run it; that puts the previous version back.
--   * The new trigger and functions:
--       drop trigger if exists events_zz_keep_updated_at on public.events;
--       drop function if exists public.events_keep_updated_at_on_system_change();
--     (is_system_change() is used by the restored functions? No — the saved
--     versions don't use it; it can then be dropped too:
--       drop function if exists public.is_system_change();)
--   * Rows: the migration changes no rows by itself; joins afterwards change
--     visibility. Compare with the copy, e.g.
--       select e.id, b.visibility as before, e.visibility as now
--         from public.events e join backup.events_inviter_20261124 b on b.id = e.id
--        where e.visibility is distinct from b.visibility;
-- When everything is confirmed fine, the copies can be dropped:
--   drop table backup.events_inviter_20261124;
--   drop table backup.event_history_inviter_20261124;
--   drop table backup.definitions_inviter_20261124;
