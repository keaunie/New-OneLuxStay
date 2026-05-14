alter table if exists public.admin_presence enable row level security;

drop policy if exists "admin_presence_select_authenticated" on public.admin_presence;
drop policy if exists "admin_presence_select_superadmins" on public.admin_presence;
create policy "admin_presence_select_superadmins"
  on public.admin_presence
  for select
  to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'admins_ols_superadmin')::boolean, false)
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admins_ols_superadmin', 'superadmin')
  );

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

