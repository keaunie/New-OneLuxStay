alter table if exists public.properties
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Optional: lightweight sanity constraints. (Kept permissive by allowing NULL.)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'properties_latitude_range'
  ) then
    -- no-op
  else
    alter table public.properties
      add constraint properties_latitude_range
      check (latitude is null or (latitude >= -90 and latitude <= 90));
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'properties_longitude_range'
  ) then
    -- no-op
  else
    alter table public.properties
      add constraint properties_longitude_range
      check (longitude is null or (longitude >= -180 and longitude <= 180));
  end if;
end $$;

create index if not exists properties_lat_lng_idx
  on public.properties (latitude, longitude);

