create extension if not exists pgcrypto;

create table if not exists public.admins_ols_activity_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id text,
  actor_email text,
  actor_name text,
  auth_mode text,
  message text,
  details jsonb,
  source_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admins_ols_activity_log_created_at_idx
  on public.admins_ols_activity_log (created_at desc);

create index if not exists admins_ols_activity_log_actor_email_created_at_idx
  on public.admins_ols_activity_log (actor_email, created_at desc);

create index if not exists admins_ols_activity_log_event_type_created_at_idx
  on public.admins_ols_activity_log (event_type, created_at desc);
