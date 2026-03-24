create extension if not exists pgcrypto;

create table if not exists public.listings (
  id text primary key,
  source text not null default 'manual',
  title text not null,
  city text,
  city_slug text,
  area_slug text,
  property_type text,
  room_type text,
  accommodates integer,
  bedrooms integer,
  bathrooms numeric(6, 2),
  beds integer,
  currency text not null default 'USD',
  base_price numeric(12, 2),
  active boolean not null default true,
  listed boolean not null default true,
  pms_active boolean not null default true,
  min_nights integer,
  address jsonb not null default '{}'::jsonb,
  location jsonb not null default '{}'::jsonb,
  amenities jsonb not null default '[]'::jsonb,
  pictures jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listing_nightly_prices (
  listing_id text not null references public.listings(id) on delete cascade,
  date date not null,
  is_available boolean not null default true,
  nightly_rate numeric(12, 2) not null default 0,
  cleaning_fee numeric(12, 2) not null default 0,
  taxes numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  min_guests integer,
  max_guests integer,
  min_nights integer,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (listing_id, date)
);

create table if not exists public.site_content (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_city_slug_idx on public.listings (city_slug);
create index if not exists listings_area_slug_idx on public.listings (area_slug);
create index if not exists listings_flags_idx on public.listings (active, listed, pms_active);
create index if not exists listing_nightly_prices_date_idx on public.listing_nightly_prices (date);
create index if not exists listing_nightly_prices_listing_id_idx on public.listing_nightly_prices (listing_id);

create or replace view public.listings_public as
select *
from public.listings
where active = true
  and listed = true
  and pms_active = true;
