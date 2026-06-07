-- Gyokan: アカウントごとのデータ量を確認する（Supabase SQL Editor で実行）
-- どのアカウントに「直近のデータ」があるかを見分けるために使います。

select
  u.id as user_id,
  u.email,
  u.created_at::date as account_created,
  u.last_sign_in_at::date as last_sign_in,
  coalesce(p.cnt, 0) as projects,
  coalesce(t.cnt, 0) as tasks,
  coalesce(c.cnt, 0) as cases,
  coalesce(pm.cnt, 0) as project_memos,
  coalesce(dm.cnt, 0) as daily_memos,
  t.latest_task_update,
  c.latest_case_update
from auth.users u
left join lateral (
  select count(*)::int as cnt from public.projects where user_id = u.id
) p on true
left join lateral (
  select
    count(*)::int as cnt,
    max(updated_at) as latest_task_update
  from public.tasks
  where user_id = u.id
) t on true
left join lateral (
  select
    count(*)::int as cnt,
    max(updated_at) as latest_case_update
  from public.cases
  where user_id = u.id
) c on true
left join lateral (
  select count(*)::int as cnt from public.project_memos where user_id = u.id
) pm on true
left join lateral (
  select count(*)::int as cnt from public.daily_memos where user_id = u.id
) dm on true
order by u.last_sign_in_at desc nulls last;
