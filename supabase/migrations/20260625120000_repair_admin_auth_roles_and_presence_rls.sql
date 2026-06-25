-- Repair admin application roles that were accidentally stored as Supabase/PostgREST
-- database roles. Application roles must live in app metadata or app tables; JWT
-- database role claims must remain Supabase/Postgres roles such as "authenticated".

update auth.users
set
  role = 'authenticated',
  updated_at = now()
where role in ('admin', 'admins_ols', 'admins_ols_superadmin', 'superadmin')
   or role is null
   or btrim(role) = '';

with normalized_admin_roles as (
  select
    id,
    case
      when coalesce(raw_app_meta_data->>'admins_ols_superadmin', 'false') = 'true'
        or coalesce(raw_app_meta_data->>'superadmin', 'false') = 'true'
        or coalesce(raw_user_meta_data->>'admins_ols_superadmin', 'false') = 'true'
        or coalesce(raw_user_meta_data->>'superadmin', 'false') = 'true'
        or coalesce(
          raw_app_meta_data->>'admin_role',
          raw_app_meta_data->>'role',
          raw_user_meta_data->>'admin_role',
          raw_user_meta_data->>'role'
        ) in ('admins_ols_superadmin', 'superadmin')
        then 'admins_ols_superadmin'
      when coalesce(raw_app_meta_data->>'admins_ols', 'false') = 'true'
        or coalesce(raw_user_meta_data->>'admins_ols', 'false') = 'true'
        or coalesce(
          raw_app_meta_data->>'admin_role',
          raw_app_meta_data->>'role',
          raw_user_meta_data->>'admin_role',
          raw_user_meta_data->>'role'
        ) in ('admin', 'admins_ols')
        then 'admins_ols'
      else null
    end as admin_role
  from auth.users
)
update auth.users as users
set
  raw_app_meta_data =
    (coalesce(users.raw_app_meta_data, '{}'::jsonb) - 'role') ||
    jsonb_build_object(
      'admin_role', roles.admin_role,
      'admins_ols', true,
      'admins_ols_superadmin', roles.admin_role = 'admins_ols_superadmin',
      'superadmin', roles.admin_role = 'admins_ols_superadmin'
    ),
  updated_at = now()
from normalized_admin_roles as roles
where users.id = roles.id
  and roles.admin_role is not null;

grant select, insert, update, delete on table public.admin_presence to authenticated;
grant select, insert, update, delete on table public.admin_presence to service_role;

alter table if exists public.admin_presence enable row level security;

drop policy if exists "admin_presence_select_authenticated" on public.admin_presence;
drop policy if exists "admin_presence_select_superadmins" on public.admin_presence;
create policy "admin_presence_select_superadmins"
  on public.admin_presence
  for select
  to authenticated
  using (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'admins_ols_superadmin')::boolean, false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'superadmin')::boolean, false)
    or (auth.jwt() -> 'app_metadata' ->> 'admin_role') in ('admins_ols_superadmin', 'superadmin')
    -- Legacy compatibility only. New code writes admin_role instead of app_metadata.role.
    or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admins_ols_superadmin', 'superadmin')
  );

drop policy if exists "admin_presence_insert_own_rows" on public.admin_presence;
create policy "admin_presence_insert_own_rows"
  on public.admin_presence
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = admin_id);

drop policy if exists "admin_presence_update_own_rows" on public.admin_presence;
create policy "admin_presence_update_own_rows"
  on public.admin_presence
  for update
  to authenticated
  using (auth.uid() is not null and auth.uid() = admin_id)
  with check (auth.uid() is not null and auth.uid() = admin_id);

drop policy if exists "admin_presence_delete_own_rows" on public.admin_presence;
create policy "admin_presence_delete_own_rows"
  on public.admin_presence
  for delete
  to authenticated
  using (auth.uid() is not null and auth.uid() = admin_id);
