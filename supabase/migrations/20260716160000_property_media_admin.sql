-- Editable property content and metadata for images stored in Cloudflare R2.
-- Guesty remains the primary image source; these URLs are public fallbacks.
create extension if not exists pgcrypto;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  guesty_id text,
  guesty_listing_id text,
  name text not null default '',
  property_code text,
  address text,
  city text,
  country text,
  latitude double precision,
  longitude double precision,
  room_type text,
  bedrooms numeric(8, 2),
  bathrooms numeric(8, 2),
  accommodates integer,
  size_sqm numeric(10, 2),
  has_balcony boolean not null default false,
  has_parking boolean not null default false,
  has_wifi boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists properties_guesty_id_uidx
  on public.properties (guesty_id)
  where guesty_id is not null;

create unique index if not exists properties_guesty_listing_id_uidx
  on public.properties (guesty_listing_id)
  where guesty_listing_id is not null;

create index if not exists properties_city_status_idx
  on public.properties (city, status);

create table if not exists public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  url text not null,
  object_key text,
  alt_text text,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table if exists public.property_images
  add column if not exists object_key text,
  add column if not exists alt_text text;

create table if not exists public.property_descriptions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  language text not null default 'en',
  title text,
  description text,
  created_at timestamptz not null default now(),
  unique (property_id, language)
);

create table if not exists public.property_amenities (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  amenity text not null,
  unique (property_id, amenity)
);

create table if not exists public.property_tags (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tag text not null,
  unique (property_id, tag)
);

create table if not exists public.property_features (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  key text not null,
  value text,
  unique (property_id, key)
);

create table if not exists public.property_pricing (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  base_price numeric(12, 2),
  currency text not null default 'USD',
  cleaning_fee numeric(12, 2),
  security_deposit numeric(12, 2),
  extra_guest_fee numeric(12, 2),
  created_at timestamptz not null default now()
);

create unique index if not exists property_images_object_key_uidx
  on public.property_images (object_key)
  where object_key is not null;

create index if not exists property_images_property_sort_idx
  on public.property_images (property_id, sort_order);
