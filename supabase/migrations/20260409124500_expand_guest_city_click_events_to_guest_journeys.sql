alter table if exists public.guest_city_click_events
  add column if not exists event_type text not null default 'city_click',
  add column if not exists listing_id text,
  add column if not exists listing_title text;

create index if not exists guest_city_click_events_event_type_created_at_idx
  on public.guest_city_click_events (event_type, created_at desc);

create index if not exists guest_city_click_events_page_type_created_at_idx
  on public.guest_city_click_events (page_type, created_at desc);

create index if not exists guest_city_click_events_listing_id_created_at_idx
  on public.guest_city_click_events (listing_id, created_at desc);
