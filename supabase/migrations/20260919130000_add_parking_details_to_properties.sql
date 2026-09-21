-- Guest-facing parking description (cost, type, distance from the unit —
-- e.g. "Paid garage on-site, $25/night, 1-minute walk"), distinct from
-- property_access_secrets.parking_instructions which holds the exact
-- space/level and stays admin-only. has_parking remains the plain yes/no
-- flag; this is the prose the guest chatbot can relay when asked for
-- specifics instead of just "Yes".
alter table public.properties
  add column if not exists parking_details text;

comment on column public.properties.parking_details is
  'Guest-facing parking description (cost, type, distance) the chatbot may quote verbatim. Never put an exact space/level number here — that stays in property_access_secrets.parking_instructions (admin-only).';
