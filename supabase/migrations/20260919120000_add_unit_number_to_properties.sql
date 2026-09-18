-- Admin-editable unit/room number for a property (e.g. "2607"), distinct
-- from the OneLuxStay property_code and the Guesty listing ID. Seeded once
-- from the synced Guesty nickname so existing values aren't lost, then
-- editable independently from the Property Manager Overview tab going
-- forward (see netlify/functions/property-admin.js PROPERTY_FIELDS).
alter table public.properties
  add column if not exists unit_number text;

update public.properties
set unit_number = nullif(trim(guesty_raw ->> 'nickname'), '')
where unit_number is null;

comment on column public.properties.unit_number is
  'Admin-editable unit/room number for this property. Seeded once from the synced Guesty nickname; editable independently thereafter.';
