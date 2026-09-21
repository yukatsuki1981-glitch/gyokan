-- Distinguish work vs. private items so タスク管理 and プライベート modes
-- can each show only what belongs to them.

alter table public.tasks
  add column if not exists scope text not null default 'work';

alter table public.tasks
  drop constraint if exists tasks_scope_check;
alter table public.tasks
  add constraint tasks_scope_check check (scope in ('work', 'private'));

alter table public.events
  add column if not exists scope text not null default 'private';

alter table public.events
  drop constraint if exists events_scope_check;
alter table public.events
  add constraint events_scope_check check (scope in ('work', 'private'));

-- Backfill: tasks already living in the existing "プライベート" project are
-- conceptually private — carry that over to the new column.
update public.tasks t
set scope = 'private'
from public.projects p
where t.project_id = p.id
  and p.name = 'プライベート'
  and t.scope <> 'private';
