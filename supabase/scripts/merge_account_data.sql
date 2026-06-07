-- Gyokan: 別アカウントのデータを現在のアカウントへ統合する
--
-- 使い方（Supabase Dashboard → SQL → New query）:
--   1. inspect_account_data.sql を先に実行し、件数・更新日時を確認
--   2. 下の source_user_id / target_user_id を書き換え
--   3. このスクリプトを実行
--
-- 典型例:
--   Google ログイン (直近データあり) → source
--   メールログイン (古いデータ)     → target
--
-- 注意:
--   - 同じ ID の行は target 側を優先（上書きしません）
--   - プロジェクト名が同じ場合は target のプロジェクト ID を再利用します
--   - 実行前にバックアップ推奨（Supabase の Point-in-time recovery 等）

begin;

do $$
declare
  source_user_id uuid := '00000000-0000-0000-0000-000000000001'; -- ← コピー元（データが多い方）
  target_user_id uuid := '00000000-0000-0000-0000-000000000002'; -- ← コピー先（今ログインしている方）
  rec record;
  new_project_id uuid;
  new_case_id uuid;
  mapped_project_id uuid;
  mapped_case_id uuid;
begin
  if source_user_id = target_user_id then
    raise exception 'source と target が同じです';
  end if;

  create temporary table tmp_project_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;

  create temporary table tmp_case_map (
    old_id uuid primary key,
    new_id uuid not null
  ) on commit drop;

  -- projects
  for rec in
    select *
    from public.projects
    where user_id = source_user_id
    order by sort_order, created_at
  loop
    select id
    into mapped_project_id
    from public.projects
    where user_id = target_user_id
      and name = rec.name
    limit 1;

    if mapped_project_id is null then
      new_project_id := gen_random_uuid();
      insert into public.projects (
        id, user_id, name, accent_color, sort_order, created_at, updated_at
      )
      values (
        new_project_id,
        target_user_id,
        rec.name,
        coalesce(rec.accent_color, '#3B82F6'),
        rec.sort_order,
        rec.created_at,
        rec.updated_at
      )
      on conflict do nothing;

      mapped_project_id := new_project_id;
    end if;

    insert into tmp_project_map (old_id, new_id)
    values (rec.id, mapped_project_id)
    on conflict (old_id) do nothing;
  end loop;

  -- cases
  for rec in
    select c.*
    from public.cases c
    where c.user_id = source_user_id
    order by c.sort_order, c.created_at
  loop
    select new_id
    into mapped_project_id
    from tmp_project_map
    where old_id = rec.project_id;

    if mapped_project_id is null then
      continue;
    end if;

    if exists (select 1 from public.cases where id = rec.id and user_id = target_user_id) then
      insert into tmp_case_map (old_id, new_id)
      values (rec.id, rec.id)
      on conflict (old_id) do nothing;
      continue;
    end if;

    new_case_id := gen_random_uuid();

    insert into public.cases (
      id,
      user_id,
      project_id,
      title,
      name,
      status,
      status_tone,
      deadline,
      progress,
      goal,
      subtasks_done,
      subtasks_total,
      comments_count,
      done,
      created_at,
      completed_at,
      sort_order,
      updated_at
    )
    values (
      new_case_id,
      target_user_id,
      mapped_project_id,
      coalesce(nullif(trim(rec.title), ''), nullif(trim(rec.name), ''), '（無題）'),
      coalesce(nullif(trim(rec.title), ''), nullif(trim(rec.name), ''), '（無題）'),
      rec.status,
      rec.status_tone,
      rec.deadline,
      rec.progress,
      rec.goal,
      rec.subtasks_done,
      rec.subtasks_total,
      rec.comments_count,
      rec.done,
      rec.created_at,
      rec.completed_at,
      rec.sort_order,
      rec.updated_at
    );

    insert into tmp_case_map (old_id, new_id)
    values (rec.id, new_case_id)
    on conflict (old_id) do nothing;
  end loop;

  -- tasks
  insert into public.tasks (
    id,
    user_id,
    project_id,
    case_id,
    title,
    time_label,
    task_date,
    date_end,
    done,
    starred,
    sort_order,
    created_at,
    updated_at
  )
  select
    t.id,
    target_user_id,
    pm.new_id,
    cm.new_id,
    t.title,
    coalesce(nullif(t.time_label, ''), ''),
    coalesce(t.task_date, nullif(t.date::text, '')::date, current_date),
    t.date_end,
    t.done,
    coalesce(t.starred, false),
    t.sort_order,
    t.created_at,
    t.updated_at
  from public.tasks t
  join tmp_project_map pm on pm.old_id = t.project_id
  left join tmp_case_map cm on cm.old_id = t.case_id
  where t.user_id = source_user_id
  on conflict (id) do nothing;

  -- project memos
  insert into public.project_memos (
    id,
    user_id,
    project_id,
    memo_date,
    body,
    created_at,
    updated_at
  )
  select
    m.id,
    target_user_id,
    pm.new_id,
    m.memo_date,
    m.body,
    m.created_at,
    m.updated_at
  from public.project_memos m
  join tmp_project_map pm on pm.old_id = m.project_id
  where m.user_id = source_user_id
  on conflict (id) do nothing;

  -- daily memos
  insert into public.daily_memos (
    id,
    user_id,
    memo_date,
    body,
    created_at,
    updated_at
  )
  select
    d.id,
    target_user_id,
    d.memo_date,
    d.body,
    d.created_at,
    d.updated_at
  from public.daily_memos d
  where d.user_id = source_user_id
  on conflict (id) do nothing;

  -- preferences
  insert into public.user_preferences (user_id, last_view_date, updated_at)
  select target_user_id, up.last_view_date, up.updated_at
  from public.user_preferences up
  where up.user_id = source_user_id
  on conflict (user_id) do update
  set
    last_view_date = excluded.last_view_date,
    updated_at = excluded.updated_at;

  raise notice 'merge complete: % -> %', source_user_id, target_user_id;
end $$;

commit;
