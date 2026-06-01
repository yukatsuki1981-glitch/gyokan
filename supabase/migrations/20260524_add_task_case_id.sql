-- Link tasks to cases (案件)
alter table public.tasks
  add column if not exists case_id uuid references public.cases (id) on delete set null;

create index if not exists tasks_case_id_idx on public.tasks (case_id);
