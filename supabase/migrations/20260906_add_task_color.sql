-- Highlight color on the task bar, used to pin priority tasks to the top
alter table public.tasks add column if not exists color text;
