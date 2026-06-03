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

-- Backfill empty titles from name (and vice versa)
update public.cases
set title = coalesce(nullif(trim(title), ''), nullif(trim(name), ''), title)
where coalesce(trim(title), '') = '' and coalesce(trim(name), '') <> '';

update public.cases
set name = coalesce(nullif(trim(name), ''), nullif(trim(title), ''), name)
where coalesce(trim(name), '') = '' and coalesce(trim(title), '') <> '';

notify pgrst, 'reload schema';
