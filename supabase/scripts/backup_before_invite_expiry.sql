-- Backup of household_invites before migration 20261122_invite_expiry.sql.
--
-- Run this in the Supabase SQL Editor BEFORE the migration. The copy goes to
-- the "backup" schema (created here too if missing), which the Supabase API
-- does not expose, so it can't be read through the app's API keys. Running it
-- again does nothing new: the copy is only made the first time.

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

create table if not exists backup.household_invites_20261122 as table public.household_invites;

-- Check: the two numbers must match (when run right after the copy was made).
select
  (select count(*) from public.household_invites)             as invites_now,
  (select count(*) from backup.household_invites_20261122)    as invites_backup;

-- Restore (only if something went wrong — not part of the normal steps):
--   the migration only adds two columns (expires_at, revoked_at) and changes
--   functions; no invite row is deleted. The original rows are in
--   backup.household_invites_20261122; compare with e.g.
--   select * from backup.household_invites_20261122 b
--   where not exists (select 1 from public.household_invites i where i.id = b.id);
-- When everything is confirmed fine, the copy can be dropped:
--   drop table backup.household_invites_20261122;
