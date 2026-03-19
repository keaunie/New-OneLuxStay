create extension if not exists pgcrypto;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  property_id text not null,
  check_in date not null,
  check_out date not null,
  guest_name text not null,
  guest_email text,
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  deposit_status text not null default 'pending' check (deposit_status in ('pending', 'refunded', 'kept')),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_event_id text,
  guesty_reservation_id text,
  booking_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_property_id_idx on public.bookings (property_id);
create index if not exists bookings_check_in_idx on public.bookings (check_in);
create index if not exists bookings_checkout_session_idx on public.bookings (stripe_checkout_session_id);

