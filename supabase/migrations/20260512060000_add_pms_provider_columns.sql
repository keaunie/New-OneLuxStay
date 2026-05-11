alter table if exists public.listings
  add column if not exists provider text not null default 'guesty';

do $$
declare
  has_source boolean := false;
  has_metadata boolean := false;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'source'
  ) into has_source;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'metadata'
  ) into has_metadata;

  if has_source and has_metadata then
    execute $sql$
      update public.listings
      set provider = 'apaleo'
      where coalesce(lower(source), '') = 'apaleo'
         or coalesce(lower(metadata->>'provider'), '') = 'apaleo'
    $sql$;
  elsif has_source then
    execute $sql$
      update public.listings
      set provider = 'apaleo'
      where coalesce(lower(source), '') = 'apaleo'
    $sql$;
  elsif has_metadata then
    execute $sql$
      update public.listings
      set provider = 'apaleo'
      where coalesce(lower(metadata->>'provider'), '') = 'apaleo'
    $sql$;
  end if;
end $$;

alter table if exists public.bookings
  add column if not exists provider text not null default 'guesty';

alter table if exists public.bookings
  add column if not exists provider_reservation_id text;

alter table if exists public.bookings
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.bookings
set provider_reservation_id = guesty_reservation_id
where provider_reservation_id is null
  and guesty_reservation_id is not null;

create unique index if not exists bookings_provider_reservation_unique_idx
  on public.bookings (provider, provider_reservation_id)
  where provider_reservation_id is not null;

alter table if exists public.listing_nightly_prices
  add column if not exists provider text not null default 'guesty';

alter table if exists public.listing_nightly_prices
  add column if not exists provider_property_id text;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'property_nightly_prices'
  ) then
    execute 'alter table public.property_nightly_prices add column if not exists provider text not null default ''guesty''';
    execute 'alter table public.property_nightly_prices add column if not exists provider_property_id text';
  end if;
end $$;
