alter table if exists public.properties
  add column if not exists guesty_listing_id text;

create index if not exists properties_guesty_listing_id_idx
  on public.properties (guesty_listing_id);

