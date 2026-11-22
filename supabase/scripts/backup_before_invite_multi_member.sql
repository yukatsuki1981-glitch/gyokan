-- Backup before migration 20261122_invite_multi_member.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copies go to
-- the "backup" schema (created here too if missing), which the Supabase API
-- does not expose, so they can't be read through the app's API keys. Running
-- it again does nothing new: the copies are only made the first time.
--
--   1. household_invites (the rows)
--   2. the current definitions of the invite functions and the member limit
--      (so the old versions can be put back if something goes wrong)

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.household_invites_multi_20261122 as table public.household_invites;

create table if not exists backup.function_defs_multi_20261122 as
select p.proname                                  as function_name,
       pg_get_function_identity_arguments(p.oid)  as arguments,
       pg_get_functiondef(p.oid)                  as definition,
       now()                                      as saved_at
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('create_household_invite', 'check_household_invite', 'accept_household_invite',
                     'list_household_invites', 'revoke_household_invite', 'household_member_limit');

-- Check 1: the two numbers must match (when run right after the copy was made).
select
  (select count(*) from public.household_invites)                  as invites_now,
  (select count(*) from backup.household_invites_multi_20261122)   as invites_backup;

-- Check 2: six functions were saved, each with its definition.
select function_name, arguments, length(definition) as definition_length, saved_at
  from backup.function_defs_multi_20261122
 order by function_name;

-- Restore (only if something went wrong — not part of the normal steps):
--   * Functions: for each row below, copy the text of "definition", paste it
--     into a new query and Run it. That puts the old version back.
--       select function_name, definition from backup.function_defs_multi_20261122;
--     The new function household_member_limit_for can stay (nothing old uses it).
--   * Rows: the migration changes no invite rows; the only change afterwards
--     is which invites get revoked when one is re-created. To compare:
--       select b.id, b.revoked_at as before, i.revoked_at as now
--         from backup.household_invites_multi_20261122 b
--         join public.household_invites i on i.id = b.id
--        where b.revoked_at is distinct from i.revoked_at;
-- When everything is confirmed fine, the copies can be dropped:
--   drop table backup.household_invites_multi_20261122;
--   drop table backup.function_defs_multi_20261122;
