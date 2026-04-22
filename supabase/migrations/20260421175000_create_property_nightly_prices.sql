create table if not exists public.property_nightly_prices (
  property_id uuid not null references public.properties(id) on delete cascade,
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
  primary key (property_id, date)
);

create index if not exists property_nightly_prices_date_idx on public.property_nightly_prices (date);
create index if not exists property_nightly_prices_property_id_idx on public.property_nightly_prices (property_id);

