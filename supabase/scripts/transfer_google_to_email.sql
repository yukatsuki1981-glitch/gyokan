-- Google アカウントのデータをメールアカウントへ「移す」（コピーではなく所有権変更）
-- 前回の merge が失敗した場合にこちらを使う（より確実）
--
-- 対象:
--   Google  : ea3f4c85-45fd-4b36-8d75-d678e47906bc (yukatsuki1981@gmail.com)
--   メール  : 9586c341-91b8-451f-8c3c-c6af7e121c6c (s22p5i@bms.biglobe.ne.jp)
--
-- 注意: メール側の既存データ（cases 11件など）は削除されます

begin;

delete from public.tasks
where user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c';

delete from public.project_memos
where user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c';

delete from public.cases
where user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c';

delete from public.daily_memos
where user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c';

delete from public.projects
where user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c';

delete from public.user_preferences
where user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c';

update public.projects
set user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c'
where user_id = 'ea3f4c85-45fd-4b36-8d75-d678e47906bc';

update public.cases
set user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c'
where user_id = 'ea3f4c85-45fd-4b36-8d75-d678e47906bc';

update public.tasks
set user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c'
where user_id = 'ea3f4c85-45fd-4b36-8d75-d678e47906bc';

update public.project_memos
set user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c'
where user_id = 'ea3f4c85-45fd-4b36-8d75-d678e47906bc';

update public.daily_memos
set user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c'
where user_id = 'ea3f4c85-45fd-4b36-8d75-d678e47906bc';

update public.user_preferences
set user_id = '9586c341-91b8-451f-8c3c-c6af7e121c6c'
where user_id = 'ea3f4c85-45fd-4b36-8d75-d678e47906bc';

commit;
