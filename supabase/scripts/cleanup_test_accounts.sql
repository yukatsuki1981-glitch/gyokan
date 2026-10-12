-- Clean up after testing the family-sharing invite flow with the two test
-- accounts below. Removes ONLY their data; every other account is untouched.
--
-- Run in the Supabase SQL Editor in three steps:
--   STEP 1  count what would be removed (read-only)
--   STEP 2  remove it (one transaction: all or nothing)
--   STEP 3  check that other accounts' totals did not change
-- Then delete the two users themselves in Authentication → Users.
--
-- Target accounts — the only place they are named:
--   yukatsuki1981+t1@gmail.com
--   yukatsuki1981+t2@gmail.com

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 1 — counts only (changes nothing)
-- ═════════════════════════════════════════════════════════════════════════════
with targets as (
  select id, email from auth.users
  where lower(email) in ('yukatsuki1981+t1@gmail.com', 'yukatsuki1981+t2@gmail.com')
),
touched_households as (
  select h.id from public.households h
  where h.created_by in (select id from targets)
     or exists (select 1 from public.household_members m
                where m.household_id = h.id and m.user_id in (select id from targets))
),
households_to_delete as (
  -- only households with no member outside the two test accounts
  select t.id from touched_households t
  where not exists (select 1 from public.household_members m
                    where m.household_id = t.id and m.user_id not in (select id from targets))
)
select 'target accounts found (must be 2)' as item, count(*) as rows from targets
union all select 'households to delete', count(*) from households_to_delete
union all select 'households KEPT (also have a non-test member, only the test account is removed from them)',
  count(*) from touched_households where id not in (select id from households_to_delete)
union all select 'household_members', count(*) from public.household_members where user_id in (select id from targets)
union all select 'household_invites', count(*) from public.household_invites
  where household_id in (select id from households_to_delete)
     or created_by in (select id from targets) or accepted_by in (select id from targets)
union all select 'profiles', count(*) from public.profiles where user_id in (select id from targets)
union all select 'events', count(*) from public.events where user_id in (select id from targets)
union all select 'tasks', count(*) from public.tasks where user_id in (select id from targets)
union all select 'cases', count(*) from public.cases where user_id in (select id from targets)
union all select 'project_memos', count(*) from public.project_memos where user_id in (select id from targets)
union all select 'projects', count(*) from public.projects where user_id in (select id from targets)
union all select 'daily_memos', count(*) from public.daily_memos where user_id in (select id from targets)
union all select 'daily_diaries', count(*) from public.daily_diaries where user_id in (select id from targets)
union all select 'user_preferences', count(*) from public.user_preferences where user_id in (select id from targets);

-- Other accounts' totals — note these numbers; STEP 3 must show the same.
with targets as (
  select id from auth.users
  where lower(email) in ('yukatsuki1981+t1@gmail.com', 'yukatsuki1981+t2@gmail.com')
)
select
  (select count(*) from public.events        where user_id not in (select id from targets)) as other_events,
  (select count(*) from public.tasks         where user_id not in (select id from targets)) as other_tasks,
  (select count(*) from public.projects      where user_id not in (select id from targets)) as other_projects,
  (select count(*) from public.cases         where user_id not in (select id from targets)) as other_cases,
  (select count(*) from public.profiles      where user_id not in (select id from targets)) as other_profiles,
  (select count(*) from public.household_members where user_id not in (select id from targets)) as other_memberships,
  (select count(*) from public.user_preferences where user_id not in (select id from targets)) as other_preferences;

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 2 — remove (run this whole block at once)
-- ═════════════════════════════════════════════════════════════════════════════
begin;

create temp table cleanup_targets on commit drop as
  select id from auth.users
  where lower(email) in ('yukatsuki1981+t1@gmail.com', 'yukatsuki1981+t2@gmail.com');

-- Stop (and change nothing) unless exactly the two test accounts were found.
do $$
begin
  if (select count(*) from cleanup_targets) <> 2 then
    raise exception 'expected 2 test accounts, found % — nothing was changed',
      (select count(*) from cleanup_targets);
  end if;
end $$;

-- Households only the test accounts are in (computed before any delete).
create temp table cleanup_households on commit drop as
  select h.id from public.households h
  where (h.created_by in (select id from cleanup_targets)
         or exists (select 1 from public.household_members m
                    where m.household_id = h.id and m.user_id in (select id from cleanup_targets)))
    and not exists (select 1 from public.household_members m
                    where m.household_id = h.id and m.user_id not in (select id from cleanup_targets));

-- A household a test account created but a real account is also in is kept:
-- hand it to that real member, so that deleting the test user later (which
-- cascades through households.created_by) can't remove it.
update public.households h
   set created_by = (select m.user_id from public.household_members m
                     where m.household_id = h.id and m.user_id not in (select id from cleanup_targets)
                     order by m.joined_at limit 1)
 where h.created_by in (select id from cleanup_targets)
   and h.id not in (select id from cleanup_households);

update public.household_members m
   set role = 'owner'
  from public.households h
 where h.id = m.household_id
   and m.user_id = h.created_by
   and m.role <> 'owner'
   and h.id in (select hm.household_id from public.household_members hm
                where hm.user_id in (select id from cleanup_targets));

-- Order: invites → events → memberships → households → profiles → personal data
-- (children before the rows they point at).
delete from public.household_invites
 where household_id in (select id from cleanup_households)
    or created_by in (select id from cleanup_targets)
    or accepted_by in (select id from cleanup_targets);

delete from public.events            where user_id in (select id from cleanup_targets);
delete from public.household_members where user_id in (select id from cleanup_targets);
delete from public.households        where id in (select id from cleanup_households);
delete from public.profiles          where user_id in (select id from cleanup_targets);

delete from public.tasks             where user_id in (select id from cleanup_targets);
delete from public.project_memos     where user_id in (select id from cleanup_targets);
delete from public.cases             where user_id in (select id from cleanup_targets);
delete from public.projects          where user_id in (select id from cleanup_targets);
delete from public.daily_memos       where user_id in (select id from cleanup_targets);
delete from public.daily_diaries     where user_id in (select id from cleanup_targets);
delete from public.user_preferences  where user_id in (select id from cleanup_targets);

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- STEP 3 — check: the test accounts have nothing left, others are unchanged
-- ═════════════════════════════════════════════════════════════════════════════
-- Re-run both queries of STEP 1:
--   * the first must show 0 everywhere except "target accounts found (2)"
--   * the second ("other accounts' totals") must show the same numbers as before
-- Every remaining household must still have at least one member:
select h.id, h.created_by,
       (select count(*) from public.household_members m where m.household_id = h.id) as members
from public.households h
where not exists (select 1 from public.household_members m where m.household_id = h.id);
-- expect: no rows
