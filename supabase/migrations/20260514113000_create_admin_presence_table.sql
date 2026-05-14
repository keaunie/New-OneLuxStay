create extension if not exists pgcrypto;

create table if not exists public.admin_presence (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  full_name text,
  email text not null,
  role text,
  status text not null default 'online' check (status in ('online', 'away', 'offline')),
  current_path text,
  device_type text not null default 'desktop' check (device_type in ('desktop', 'tablet', 'mobile')),
  last_active_at timestamptz not null default now(),
  logged_in_at timestamptz not null default now(),
  session_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_presence_last_active_idx
  on public.admin_presence (last_active_at desc);

create index if not exists admin_presence_status_idx
  on public.admin_presence (status, last_active_at desc);

create index if not exists admin_presence_admin_id_idx
  on public.admin_presence (admin_id, last_active_at desc);

alter table public.admin_presence enable row level security;

drop policy if exists "admin_presence_select_authenticated" on public.admin_presence;
create policy "admin_presence_select_authenticated"
  on public.admin_presence
  for select
  to authenticated
  using (true);

drop policy if exists "admin_presence_insert_own_rows" on public.admin_presence;
create policy "admin_presence_insert_own_rows"
  on public.admin_presence
  for insert
  to authenticated
  with check (auth.uid() = admin_id);

drop policy if exists "admin_presence_update_own_rows" on public.admin_presence;
create policy "admin_presence_update_own_rows"
  on public.admin_presence
  for update
  to authenticated
  using (auth.uid() = admin_id)
  with check (auth.uid() = admin_id);

drop policy if exists "admin_presence_delete_own_rows" on public.admin_presence;
create policy "admin_presence_delete_own_rows"
  on public.admin_presence
  for delete
  to authenticated
  using (auth.uid() = admin_id);

alter table public.admin_presence replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_presence'
  ) then
    execute 'alter publication supabase_realtime add table public.admin_presence';
  end if;
end $$;

