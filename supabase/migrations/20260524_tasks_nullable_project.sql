-- Allow tasks without a project (unassigned inbox tasks)
alter table public.tasks alter column project_id drop not null;

notify pgrst, 'reload schema';
