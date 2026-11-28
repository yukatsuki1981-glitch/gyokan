-- Backup before migration 20261129_account_deletion.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copies go to
-- the "backup" schema (created here too if missing), which the Supabase API
-- does not expose. Running it again does nothing new: the copies are only
-- made the first time.
--
-- The migration itself deletes no rows. It changes:
--   * households.created_by (nullable, on delete set null)
--   * events_record_history (no history row for system deletes)
--   * adds delete_my_account()
-- The copies are of the tables an account deletion touches, so that a wrong
-- deletion afterwards could still be looked into.

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.households_del_20261129        as table public.households;
create table if not exists backup.household_members_del_20261129 as table public.household_members;
create table if not exists backup.household_invites_del_20261129 as table public.household_invites;
create table if not exists backup.events_del_20261129            as table public.events;
create table if not exists backup.event_history_del_20261129     as table public.event_history;
create table if not exists backup.profiles_del_20261129          as table public.profiles;

create table if not exists backup.definitions_del_20261129 as
select 'function'::text                            as kind,
       p.proname::text                             as name,
       pg_get_function_identity_arguments(p.oid)   as arguments,
       pg_get_functiondef(p.oid)                   as definition,
       now()                                       as saved_at
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('events_record_history')
union all
select 'constraint', con.conname::text, 'public.households', pg_get_constraintdef(con.oid), now()
  from pg_constraint con
 where con.conrelid = 'public.households'::regclass
   and con.contype in ('f', 'n', 'c')
union all
select 'column', 'households.created_by', 'is_nullable',
       (select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'households' and column_name = 'created_by'),
       now();

-- Check (one table). Every row must show ok = true (when run right after the
-- copies were made).
select no, item, now, backup, now = backup as ok from (
  select 1 as no, 'households' as item,
         (select count(*) from public.households) as now,
         (select count(*) from backup.households_del_20261129) as backup
  union all select 2, 'household_members',
         (select count(*) from public.household_members),
         (select count(*) from backup.household_members_del_20261129)
  union all select 3, 'household_invites',
         (select count(*) from public.household_invites),
         (select count(*) from backup.household_invites_del_20261129)
  union all select 4, 'events',
         (select count(*) from public.events),
         (select count(*) from backup.events_del_20261129)
  union all select 5, 'event_history',
         (select count(*) from public.event_history),
         (select count(*) from backup.event_history_del_20261129)
  union all select 6, 'profiles',
         (select count(*) from public.profiles),
         (select count(*) from backup.profiles_del_20261129)
  union all select 7, 'saved function (expected 1)',
         1,
         (select count(*) from backup.definitions_del_20261129 where kind = 'function')
) as checks
order by no;
-- To look at the saved definitions:
--   select kind, name, arguments, definition from backup.definitions_del_20261129 order by kind, name;

-- Restore (only if something went wrong — not part of the normal steps):
--   * events_record_history: copy its saved "definition" into a new query
--     and Run it.
--   * delete_my_account: drop function if exists public.delete_my_account();
--   * households.created_by back to "not null, on delete cascade" (only
--     possible while no household has an empty created_by):
--       alter table public.households drop constraint if exists households_created_by_fkey;
--       alter table public.households add constraint households_created_by_fkey
--         foreign key (created_by) references auth.users (id) on delete cascade;
--       alter table public.households alter column created_by set not null;
--   * A deleted account can NOT be brought back from here (its auth.users
--     row and sign-in are gone); its rows can be looked up in the copies.
-- When everything is confirmed fine, the copies can be dropped:
--   drop table backup.households_del_20261129, backup.household_members_del_20261129,
--     backup.household_invites_del_20261129, backup.events_del_20261129,
--     backup.event_history_del_20261129, backup.profiles_del_20261129,
--     backup.definitions_del_20261129;
