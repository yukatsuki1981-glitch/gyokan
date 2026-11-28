-- Backup before migration 20261130_member_limit_remove.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copies go to
-- the "backup" schema (created here too if missing), which the Supabase API
-- does not expose. Running it again does nothing new: the copies are only
-- made the first time.
--
-- The migration itself changes no rows. It changes:
--   * household_member_limit_for (the member limit: 2 → 4)
--   * adds remove_household_member(uuid) and get_member_remove_info()
-- The copies are of the tables that removing a member touches (households,
-- household_members, household_invites, events, event_history) and profiles,
-- so that a wrong removal afterwards could still be looked into.

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.households_remove_20261128        as table public.households;
create table if not exists backup.household_members_remove_20261128 as table public.household_members;
create table if not exists backup.household_invites_remove_20261128 as table public.household_invites;
create table if not exists backup.events_remove_20261128            as table public.events;
create table if not exists backup.event_history_remove_20261128     as table public.event_history;
create table if not exists backup.profiles_remove_20261128          as table public.profiles;

-- Definitions of the functions the migration replaces or that removing a
-- member works with (the new ones do not exist yet, so they are not here).
create table if not exists backup.definitions_remove_20261128 as
select 'function'::text                            as kind,
       p.proname::text                             as name,
       pg_get_function_identity_arguments(p.oid)   as arguments,
       pg_get_functiondef(p.oid)                   as definition,
       now()                                       as saved_at
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('household_member_limit_for', 'household_member_limit', 'leave_household',
                     'ensure_household_for', 'create_household_invite', 'check_household_invite',
                     'accept_household_invite', 'revoke_household_invite', 'events_record_history',
                     'events_keep_creator');

-- Check (one table). Every row must show ok = true (when run right after the
-- copies were made).
select no, item, now, backup, now = backup as ok from (
  select 1 as no, 'households' as item,
         (select count(*) from public.households) as now,
         (select count(*) from backup.households_remove_20261128) as backup
  union all select 2, 'household_members',
         (select count(*) from public.household_members),
         (select count(*) from backup.household_members_remove_20261128)
  union all select 3, 'household_invites',
         (select count(*) from public.household_invites),
         (select count(*) from backup.household_invites_remove_20261128)
  union all select 4, 'events',
         (select count(*) from public.events),
         (select count(*) from backup.events_remove_20261128)
  union all select 5, 'event_history',
         (select count(*) from public.event_history),
         (select count(*) from backup.event_history_remove_20261128)
  union all select 6, 'profiles',
         (select count(*) from public.profiles),
         (select count(*) from backup.profiles_remove_20261128)
  union all select 7, 'saved functions (expected 10)',
         10,
         (select count(*) from backup.definitions_remove_20261128 where kind = 'function')
  union all select 8, 'the member limit now (expected 2, before the migration)',
         2,
         public.household_member_limit_for(null)
) as checks
order by no;
-- To look at the saved definitions:
--   select kind, name, arguments, definition from backup.definitions_remove_20261128 order by kind, name;

-- Restore (only if something went wrong — not part of the normal steps):
--   * The limit back to 2: copy the saved "definition" of
--     household_member_limit_for into a new query and Run it.
--     (Households that already have 3 or 4 members keep them; only new joins
--     are refused.)
--   * The new functions:
--       drop function if exists public.remove_household_member(uuid);
--       drop function if exists public.get_member_remove_info();
--   * A removal can NOT be undone from here automatically; the rows of the
--     time before can be looked up in the copies.
-- When everything is confirmed fine, the copies can be dropped:
--   drop table backup.households_remove_20261128, backup.household_members_remove_20261128,
--     backup.household_invites_remove_20261128, backup.events_remove_20261128,
--     backup.event_history_remove_20261128, backup.profiles_remove_20261128,
--     backup.definitions_remove_20261128;
