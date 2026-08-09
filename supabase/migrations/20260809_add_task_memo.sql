-- Free-text notes field on the task detail page
alter table public.tasks add column if not exists memo text not null default '';
