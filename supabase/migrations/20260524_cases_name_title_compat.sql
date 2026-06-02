-- Keep cases.name and cases.title in sync for legacy + modern clients.

alter table public.cases add column if not exists title text not null default '';
alter table public.cases add column if not exists name text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cases' and column_name = 'name'
  ) then
    execute $sql$
      update public.cases
      set title = coalesce(nullif(title, ''), name, '')
      where coalesce(title, '') = '' and coalesce(name, '') <> ''
    $sql$;

    execute $sql$
      update public.cases
      set name = coalesce(nullif(name, ''), title, '')
      where coalesce(name, '') = '' and coalesce(title, '') <> ''
    $sql$;
  end if;
end $$;

notify pgrst, 'reload schema';
