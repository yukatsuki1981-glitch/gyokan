-- Stage 2 checks (after account B has joined account A's household through an
-- invite link). No new migration is needed for stage 2.
-- Replace A_USER_ID / B_USER_ID with the two ids from block 0, and
-- OTHER_USER_ID with a third account's id (or any made-up uuid).
-- Blocks that act as a user end with ROLLBACK, so nothing is changed.

-- ── 0. Ids ──────────────────────────────────────────────────────────────────
select id, email from auth.users order by created_at;

-- ── 1. A and B are in the same household; B's old one-person household is gone
select m.household_id, m.user_id, m.role, p.display_name
from public.household_members m
left join public.profiles p on p.user_id = m.user_id
where m.user_id in ('A_USER_ID', 'B_USER_ID');
-- expect: two rows with the same household_id (A = owner, B = member)

select count(*) as members_in_a_household
from public.household_members
where household_id = (select household_id from public.household_members where user_id = 'A_USER_ID');
-- expect: 2

-- ── 2. B's existing events moved into the shared household (none deleted) ──
select
  (select count(*) from backup.events_20261013 where user_id = 'B_USER_ID') as b_events_in_backup,
  (select count(*) from public.events where user_id = 'B_USER_ID') as b_events_now,
  (select count(*) from public.events
    where user_id = 'B_USER_ID'
      and household_id = (select household_id from public.household_members where user_id = 'A_USER_ID')) as b_events_in_shared_household;
-- expect: b_events_now >= b_events_in_backup (plus any added since), and all of
-- B's private events in the shared household

-- ── 3. The invite is used up ────────────────────────────────────────────────
select created_by, accepted_by, accepted_at is not null as used
from public.household_invites order by created_at desc limit 5;

-- ── 4. As A: sees B's events and B's name; B sees A's ───────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"A_USER_ID","role":"authenticated"}', true);
select
  (select count(*) from public.events where user_id = 'B_USER_ID' and scope = 'private') as b_private_events_visible_to_a,
  (select display_name from public.profiles where user_id = 'B_USER_ID')                as b_name_visible_to_a,
  (select count(*) from public.tasks where user_id = 'B_USER_ID')                       as b_tasks_visible_to_a; -- 0
rollback;

-- ── 5. As an outsider: sees nothing of A or B ───────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"OTHER_USER_ID","role":"authenticated"}', true);
select
  (select count(*) from public.events where user_id in ('A_USER_ID', 'B_USER_ID'))   as events,    -- 0
  (select count(*) from public.profiles where user_id in ('A_USER_ID', 'B_USER_ID')) as profiles,  -- 0
  (select count(*) from public.household_members where user_id in ('A_USER_ID', 'B_USER_ID')) as members; -- 0
rollback;
