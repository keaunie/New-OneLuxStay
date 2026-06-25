alter table if exists public.admin_presence enable row level security;

drop policy if exists "admin_presence_select_own_rows" on public.admin_presence;
create policy "admin_presence_select_own_rows"
  on public.admin_presence
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = admin_id);
