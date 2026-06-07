-- メールアカウントにデータが入っているか確認（Run で実行）

select
  '9586c341-91b8-451f-8c3c-c6af7e121c6c'::uuid as email_user_id,
  (select count(*) from public.projects where user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c') as projects,
  (select count(*) from public.tasks where user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c') as tasks,
  (select count(*) from public.cases where user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c') as cases;
