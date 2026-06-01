-- Remove duplicate projects (same user_id + name), keeping the oldest row.
-- Safe to run multiple times.

delete from public.projects
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id, name
        order by created_at asc nulls last, id asc
      ) as rn
    from public.projects
  ) ranked
  where rn > 1
);

-- Prevent duplicate project names per user going forward
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_user_id_name_key'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_user_id_name_key unique (user_id, name);
  end if;
end $$;

notify pgrst, 'reload schema';
