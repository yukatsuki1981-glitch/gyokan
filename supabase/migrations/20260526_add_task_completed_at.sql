-- Record when a task was marked done (used for date-range tasks completed before deadline)
alter table public.tasks add column if not exists completed_at date;
