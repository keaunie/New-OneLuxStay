alter table if exists public.properties
  add column if not exists accommodates integer;

-- Optional: keep values sane while allowing NULL for unknown capacity.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'properties_accommodates_min_one'
  ) then
    -- no-op
  else
    alter table public.properties
      add constraint properties_accommodates_min_one
      check (accommodates is null or accommodates >= 1);
  end if;
end $$;

create index if not exists properties_accommodates_idx
  on public.properties (accommodates);

