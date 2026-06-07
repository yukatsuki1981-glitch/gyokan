-- Google のデータをメールアカウントへ移す（UUID を手入力しない版）
-- Supabase SQL Editor で 1 回だけ実行

begin;

do $$
declare
  google_id uuid;
  email_id uuid;
begin
  select id into google_id
  from auth.users
  where email = 'yukatsuki1981@gmail.com';

  select id into email_id
  from auth.users
  where email = 's22p5i@bma.biglobe.ne.jp';

  if google_id is null then
    raise exception 'Google ユーザーが見つかりません';
  end if;

  if email_id is null then
    raise exception 'メールユーザーが見つかりません';
  end if;

  raise notice 'Google id: %, Email id: %', google_id, email_id;

  -- 古い DB では public.users を参照している場合がある
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'users'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'users' and column_name = 'email'
    ) then
      insert into public.users (id, email)
      select au.id, au.email
      from auth.users au
      where au.id = email_id
      on conflict (id) do nothing;
    else
      insert into public.users (id)
      select au.id
      from auth.users au
      where au.id = email_id
      on conflict (id) do nothing;
    end if;
  end if;

  delete from public.tasks where user_id = email_id;
  delete from public.project_memos where user_id = email_id;
  delete from public.cases where user_id = email_id;
  delete from public.daily_memos where user_id = email_id;
  delete from public.projects where user_id = email_id;
  delete from public.user_preferences where user_id = email_id;

  update public.projects set user_id = email_id where user_id = google_id;
  update public.cases set user_id = email_id where user_id = google_id;
  update public.tasks set user_id = email_id where user_id = google_id;
  update public.project_memos set user_id = email_id where user_id = google_id;
  update public.daily_memos set user_id = email_id where user_id = google_id;
  update public.user_preferences set user_id = email_id where user_id = google_id;

  raise notice 'transfer complete';
end $$;

commit;
