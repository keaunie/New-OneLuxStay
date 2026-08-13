create extension if not exists pgcrypto;

create table if not exists public.apaleo_property_mappings (
  id uuid primary key default gen_random_uuid(),
  local_property_id text not null,
  apaleo_property_id text not null unique,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_property_id, apaleo_property_id)
);

create table if not exists public.apaleo_inventory_mappings (
  id uuid primary key default gen_random_uuid(),
  apaleo_property_id text not null references public.apaleo_property_mappings(apaleo_property_id) on delete cascade,
  mapping_type text not null check (mapping_type in ('unit_group', 'rate_plan', 'service')),
  local_id text not null,
  apaleo_id text not null,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mapping_type, local_id),
  unique (mapping_type, apaleo_id)
);

create table if not exists public.apaleo_booking_sessions (
  id uuid primary key default gen_random_uuid(),
  state text not null default 'OFFER_SELECTED' check (state in (
    'OFFER_SELECTED', 'REVALIDATING', 'PRICE_CHANGED', 'READY_FOR_PAYMENT',
    'PAYMENT_PROCESSING', 'PAYMENT_ACTION_REQUIRED', 'PAYMENT_DECLINED',
    'READY_TO_BOOK', 'BOOKING_IN_PROGRESS', 'CONFIRMED',
    'PAYMENT_AUTHORIZED_BOOKING_UNKNOWN', 'PAYMENT_AUTHORIZED_BOOKING_FAILED',
    'FAILED_RECOVERABLE', 'FAILED_FINAL', 'EXPIRED'
  )),
  local_property_id text not null,
  property_id text not null,
  arrival date not null,
  departure date not null,
  adults integer not null check (adults between 1 and 20),
  children_ages integer[] not null default '{}',
  unit_group_id text not null,
  rate_plan_id text not null,
  selected_services jsonb not null default '[]'::jsonb,
  quote jsonb not null,
  quoted_total_minor bigint not null check (quoted_total_minor >= 0),
  prepayment_minor bigint not null check (prepayment_minor >= 0),
  currency text not null check (char_length(currency) = 3),
  guarantee_type text not null,
  payment_provider text,
  payment_reference text unique,
  payment_metadata jsonb not null default '{}'::jsonb,
  payment_state text not null default 'NOT_REQUIRED',
  apaleo_booking_id text unique,
  apaleo_reservation_ids text[] not null default '{}',
  sanitized_apaleo_response jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (departure > arrival)
);

create index if not exists apaleo_booking_sessions_expires_idx on public.apaleo_booking_sessions (expires_at);
create index if not exists apaleo_booking_sessions_state_idx on public.apaleo_booking_sessions (state);

create table if not exists public.apaleo_webhook_events (
  event_id text primary key,
  topic text,
  event_type text,
  property_id text,
  subject_id text,
  occurred_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  processing_state text not null default 'RECEIVED',
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.apaleo_property_mappings enable row level security;
alter table public.apaleo_inventory_mappings enable row level security;
alter table public.apaleo_booking_sessions enable row level security;
alter table public.apaleo_webhook_events enable row level security;

comment on table public.apaleo_booking_sessions is
  'Server-only, expiring Apaleo IBE checkout state. Delete expired unconfirmed sessions according to the privacy retention policy.';

create or replace function public.claim_apaleo_booking_session(session_id uuid)
returns setof public.apaleo_booking_sessions language plpgsql security definer set search_path = public as $$
begin
  return query update public.apaleo_booking_sessions
    set state = 'BOOKING_IN_PROGRESS', updated_at = now()
    where id = session_id and state = 'READY_TO_BOOK' and expires_at > now()
    returning *;
end; $$;

revoke all on function public.claim_apaleo_booking_session(uuid) from public, anon, authenticated;
grant execute on function public.claim_apaleo_booking_session(uuid) to service_role;
