create extension if not exists pgcrypto;

create table if not exists public.guest_city_click_events (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  city text not null,
  destination_path text,
  source_section text,
  source_label text,
  pathname text,
  page_type text,
  source_origin text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists guest_city_click_events_created_at_idx
  on public.guest_city_click_events (created_at desc);

create index if not exists guest_city_click_events_city_created_at_idx
  on public.guest_city_click_events (city, created_at desc);

create index if not exists guest_city_click_events_session_created_at_idx
  on public.guest_city_click_events (session_id, created_at desc);
