-- Account deletion: delete_my_account().
--
-- Deletes the signed-in person's account right away (no undo):
--   * My 共有 private events in a household I share with someone stay with
--     that household, creator emptied (shown as 「以前のメンバー」) — the same
--     as 「共有をやめる」 (leave_household v2), without the copy for me.
--   * Everything else of mine is deleted: 自分だけ and task-mode events, tasks,
--     cases, projects, memos, diaries, preferences, display name (profiles),
--     and the history of my events.
--   * In the history of the events that stay, "changed by" me becomes empty
--     (「以前のメンバー」), and my id is taken out of saved old values.
--   * My unused invite links are deleted.
--   * If I am the last member of my household, the household goes with
--     everything in it (creator-less events, their history, invites,
--     membership records).
--   * If others stay, the household stays; households.created_by may now be
--     empty and becomes empty when its creator is deleted (it used to delete
--     the WHOLE household by cascade).
--   * Finally the auth.users row itself is deleted, so the same e-mail address
--     can sign up again later.
-- No arguments: only the signed-in person (auth.uid()) can be deleted.
-- Not callable by anon.
--
-- Also: events_record_history writes no "delete" history row for a system
-- change (is_system_change(), 20261124_join_inviter_private.sql), so the
-- events deleted here leave no history behind. Otherwise unchanged.
--
-- Run the whole file at once in the Supabase SQL Editor, AFTER
-- supabase/scripts/backup_before_account_deletion.sql. It is idempotent.

begin;

-- ─── households.created_by: nullable, set null on delete ─────────────────────
-- Used only when a household is made (ensure_household_for) and by the
-- one-time backfill in 20261013_households.sql; no RLS policy, function or
-- app code reads it.
alter table public.households alter column created_by drop not null;

do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
     where con.conrelid = 'public.households'::regclass
       and con.contype = 'f'
       and att.attname = 'created_by'
  loop
    execute format('alter table public.households drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.households
  add constraint households_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- ─── events_record_history ───────────────────────────────────────────────────
-- Same as 20261124_join_inviter_private.sql, plus: a system change writes no
-- "delete" row either.
create or replace function public.events_record_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb;
  new_j jsonb;
  fields text[];
  olds jsonb;
begin
  if tg_op = 'UPDATE' then
    -- Keep the read permission of earlier history rows in step with the event
    -- (e.g. switched to 'only_me', or its creator left: see leave_household).
    if new.household_id is distinct from old.household_id
       or new.scope is distinct from old.scope
       or new.visibility is distinct from old.visibility
       or new.user_id is distinct from old.user_id then
      update public.event_history
         set event_user_id = new.user_id,
             event_household_id = new.household_id,
             event_scope = new.scope,
             event_visibility = new.visibility
       where event_id = new.id;
    end if;

    -- Not an edit by anyone (e.g. joining makes the inviter's events 自分だけ).
    if public.is_system_change() then
      return null;
    end if;

    old_j := to_jsonb(old) - public.event_history_ignored_columns();
    new_j := to_jsonb(new) - public.event_history_ignored_columns();
    select coalesce(array_agg(k order by k), '{}'), coalesce(jsonb_object_agg(k, old_j -> k), '{}')
      into fields, olds
      from jsonb_object_keys(old_j) as k
     where (old_j -> k) is distinct from (new_j -> k);

    if cardinality(fields) = 0 then
      return null; -- nothing but ignored columns changed (e.g. a reorder)
    end if;

    insert into public.event_history
      (event_id, event_title, event_user_id, event_household_id, event_scope, event_visibility,
       action, changed_by, changed_fields, old_values)
    values
      (new.id, old.title, new.user_id, new.household_id, new.scope, new.visibility,
       'update', auth.uid(), fields, olds);
    return null;
  end if;

  -- DELETE by the system (e.g. deleting an account): not recorded.
  if public.is_system_change() then
    return null;
  end if;
  -- When the creator's account itself is being deleted (cascade from
  -- auth.users), there is nobody left to show it to: don't record. A
  -- creator-less event (user_id null) still belongs to its household: record.
  if old.user_id is not null and not exists (select 1 from auth.users where id = old.user_id) then
    return null;
  end if;
  insert into public.event_history
    (event_id, event_title, event_user_id, event_household_id, event_scope, event_visibility,
     action, changed_by, changed_fields, old_values)
  values
    (old.id, old.title, old.user_id, old.household_id, old.scope, old.visibility,
     'delete', auth.uid(), '{}', to_jsonb(old));
  return null;
end;
$$;

-- ─── delete_my_account ───────────────────────────────────────────────────────
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  hid uuid;
  others integer := 0;
begin
  if me is null or not exists (select 1 from auth.users where id = me) then
    raise exception 'not_authenticated';
  end if;

  -- Lock my household (as joining / leaving do), then read it again: it may
  -- have changed while we waited.
  select household_id into hid from public.household_members where user_id = me;
  if hid is not null then
    perform 1 from public.households where id = hid for update;
    select household_id into hid from public.household_members where user_id = me;
  end if;
  if hid is not null then
    select count(*) into others
      from public.household_members
     where household_id = hid and user_id <> me;
  end if;

  -- Changes below are the system's, not edits by anyone: no new history rows,
  -- updated_at kept, and the creator rules of events_keep_creator relaxed.
  perform set_config('gyokan.system_change', 'on', true);

  if others > 0 then
    -- 1. My shared events stay with the family, creator emptied. The history
    --    trigger empties event_user_id on their history rows too.
    update public.events
       set user_id = null
     where user_id = me
       and household_id = hid
       and scope = 'private'
       and visibility = 'shared';
    --    History of my shared events that were already deleted (no event row
    --    left for the trigger to follow): the household's, like the others.
    update public.event_history
       set event_user_id = null
     where event_user_id = me
       and event_household_id = hid
       and event_scope = 'private'
       and event_visibility = 'shared';
  elsif hid is not null then
    -- 2. I am the last one: everything of the household goes.
    delete from public.event_history where event_household_id = hid;
    delete from public.events where household_id = hid and user_id is null;
  end if;

  -- 3. The history of my own events (they are deleted below).
  delete from public.event_history where event_user_id = me;

  -- 4. In the history that stays: my name as the editor, and my id inside the
  --    saved old values (a delete row keeps the whole event, user_id too).
  update public.event_history set changed_by = null where changed_by = me;
  update public.event_history
     set old_values = old_values - 'user_id'
   where old_values ->> 'user_id' = me::text;

  -- 5. My remaining events.
  delete from public.events where user_id = me;

  -- 6. Invites: my unused links can't be used any more; my name goes from
  --    the ones I accepted.
  delete from public.household_invites where created_by = me and accepted_at is null;
  update public.household_invites set accepted_by = null where accepted_by = me;

  -- 7. The household.
  if others > 0 then
    delete from public.household_members where household_id = hid and user_id = me;
  elsif hid is not null then
    delete from public.households where id = hid; -- members and invites go with it
  end if;
  update public.households set created_by = null where created_by = me;

  -- 8. My own data. (The auth.users cascade below would delete these too;
  --    done here so nothing depends on it.)
  delete from public.tasks where user_id = me;
  delete from public.project_memos where user_id = me;
  delete from public.cases where user_id = me;
  delete from public.projects where user_id = me;
  delete from public.daily_memos where user_id = me;
  delete from public.daily_diaries where user_id = me;
  delete from public.user_preferences where user_id = me;
  delete from public.profiles where user_id = me;
  delete from public.household_members where user_id = me;

  -- 9. The account itself (its sign-in identities and sessions go with it).
  delete from auth.users where id = me;

  perform set_config('gyokan.system_change', 'off', true);
end;
$$;

-- ─── Function permissions ────────────────────────────────────────────────────

revoke all on function public.events_record_history() from public, anon, authenticated;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
