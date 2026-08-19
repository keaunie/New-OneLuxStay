-- Maps the 11 remaining Apaleo properties (everything besides HWH, which was already done in
-- 20260815090000_reconcile_hwh_inventory.sql) to their website listings, the same way HWH is
-- mapped. Only listings whose website nickname exactly (or near-exactly, ignoring stray notes
-- like "(redondo)") matches a real Apaleo unit-group name are included -- every property here is
-- a partial rollout: most have more physical listings than configured Apaleo unit groups, and the
-- unmatched ones are intentionally left unmapped (they stay on the legacy Guesty flow) until
-- their own Apaleo unit group is set up.
--
-- apaleo_property_mappings.local_property_id is not read by any query path (resolveBookingTarget
-- looks up apaleo_inventory_mappings by local_id, and apaleo_property_id is independently unique)
-- so it's set to the same value as apaleo_property_id here rather than an arbitrary listing id.

insert into public.apaleo_property_mappings (local_property_id, apaleo_property_id, enabled)
values
  ('ARDENCE', 'ARDENCE', true),
  ('LLEW', 'LLEW', true),
  ('REDONDO1', 'REDONDO1', true),
  ('REDONDO3', 'REDONDO3', true),
  ('TORRANCE', 'TORRANCE', true),
  ('DUBAI', 'DUBAI', true),
  ('LANGEKIEV', 'LANGEKIEV', true),
  ('LANGE5', 'LANGE5', true),
  ('LANGE103', 'LANGE103', true),
  ('JACOB', 'JACOB', true),
  ('KRIBB', 'KRIBB', true)
on conflict (apaleo_property_id) do update
set local_property_id = excluded.local_property_id,
    enabled = excluded.enabled,
    updated_at = now();

insert into public.apaleo_inventory_mappings (
  apaleo_property_id,
  mapping_type,
  local_id,
  apaleo_id,
  enabled,
  metadata
)
values
  -- ARDENCE (Hollywood) -- 5 of 5 listings mapped, complete rollout
  ('ARDENCE', 'unit_group', '68238ce5bf3cce0021033c30', 'AB1BR', true,
    '{"apaleoUnitGroupName":"I. 1 OLS ARDENCE 1BR","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('ARDENCE', 'unit_group', '67c87c999136c80011b09c77', 'ABCITY', true,
    '{"apaleoUnitGroupName":"I. 2.1 OLS ARDENCE CITY","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('ARDENCE', 'unit_group', '66e85a13902eec0011ec7c81', 'ABHSIGN', true,
    '{"apaleoUnitGroupName":"I. 2.2 OLS ARDENCE HSIGN","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('ARDENCE', 'unit_group', '66e85deca8a40a00145be974', 'ABPOOL', true,
    '{"apaleoUnitGroupName":"I. 2.3 OLS ARDENCE POOL","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('ARDENCE', 'unit_group', '66e8609683fcfd0013a6cd03', 'AB3BR2BA', true,
    '{"apaleoUnitGroupName":"I. 3 OLS ARDENCE 3BR 2BA","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),

  -- LLEW (Dodger Stadium) -- 1 of 6 listings mapped
  ('LLEW', 'unit_group', '66e40927a0e79b00110e1661', 'LLEW2BR2BA', true,
    '{"apaleoUnitGroupName":"C. OLS LLEWELYN 2/2","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),

  -- REDONDO1 (1BR near the beach) -- 2 of 5 listings mapped
  ('REDONDO1', 'unit_group', '696a34b2e629d00015871427', 'RED1BR407', true,
    '{"apaleoUnitGroupName":"K2. OLS Redondo 1BR","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('REDONDO1', 'unit_group', '6948d9855a49ec0013d81ab5', 'RED1BR419', true,
    '{"apaleoUnitGroupName":"K1. OLS Redondo 1BR","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),

  -- REDONDO3 (3BR near the beach) -- 2 of 4 listings mapped
  ('REDONDO3', 'unit_group', '68c6f3c58247f20013bae867', 'RED3BR', true,
    '{"apaleoUnitGroupName":"K4. OLS Redondo U1","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('REDONDO3', 'unit_group', '68e6d143a5e35f00237b6930', 'REDO3BR', true,
    '{"apaleoUnitGroupName":"K5. OLS Redondo U5","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),

  -- TORRANCE -- 3 of 6 listings mapped
  ('TORRANCE', 'unit_group', '6a0c4013229d2a001316a820', 'TOR2BRAPTD', true,
    '{"apaleoUnitGroupName":"K6. OLS Torrance 2BR","mappingMethod":"matched from Apaleo unit-group roster (local nickname had a stray \"(redondo)\" suffix)"}'::jsonb),
  ('TORRANCE', 'unit_group', '6a4401c8cacc910013144a4e', 'TOR2BR15BA', true,
    '{"apaleoUnitGroupName":"K8. OLS Torrance 2BR 1.5B","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('TORRANCE', 'unit_group', '6a440232c7d9c40010c00392', 'TOR2BR2BA', true,
    '{"apaleoUnitGroupName":"K9. OLS Torrance 2BR 2BA","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),

  -- DUBAI (Apaleo property display name "GSR Dubai") -- 2 of 6 listings mapped
  ('DUBAI', 'unit_group', '67460cc0416b6d0013781721', 'DUB2BR2BA', true,
    '{"apaleoUnitGroupName":"Z3. OLS GSR 2BR","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('DUBAI', 'unit_group', '67250a7e6cafcb0013e9cb18', 'DUBAI4BR', true,
    '{"apaleoUnitGroupName":"Z2. OLS GSR 3BR","mappingMethod":"matched from Apaleo unit-group roster (unit group code says 4BR, display name says 3BR; code used as authoritative)"}'::jsonb),

  -- LANGEKIEV (Apaleo property display name "One Lux Stay Near Central Station") -- 3 of 8 mapped
  ('LANGEKIEV', 'unit_group', '697cee2199ea4600142b3154', 'KIEV3B_25B', true,
    '{"apaleoUnitGroupName":"Z9. OEU LK4 3B 2.5B","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('LANGEKIEV', 'unit_group', '6984abcb9857f60014ae0e84', 'KIEV3_25WT', true,
    '{"apaleoUnitGroupName":"Z9A. OEU LK4 3B 2.5B","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('LANGEKIEV', 'unit_group', '69de74c692a9c30013581249', 'KIEV3B_25K', true,
    '{"apaleoUnitGroupName":"Z9B OEU LK4 3+1B2.5B","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),

  -- LANGE5 (Apaleo property display name "One Lux Stay Near Antwerp Central") -- 4 of 11 mapped
  ('LANGE5', 'unit_group', '67a37cffc99f430029d80908', 'LANGE5JR1B', true,
    '{"apaleoUnitGroupName":"Z5. OEU L5 JR 1BR","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('LANGE5', 'unit_group', '67a37db6314411002c6c4e10', 'LANGE53_15', true,
    '{"apaleoUnitGroupName":"Z6. OEU L5 3B 1.5B","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('LANGE5', 'unit_group', '6811502ba32aee000eebcef5', 'LANGE5_32', true,
    '{"apaleoUnitGroupName":"Z7. OEU L5 3B2B","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('LANGE5', 'unit_group', '6811675405d52b0010c3fae5', 'LANGE53_35', true,
    '{"apaleoUnitGroupName":"Z8. OEU L5 3/3.5GRD","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),

  -- LANGE103 (Apaleo property display name "One Lux Stay near Fashion District") -- 5 of 6 mapped
  ('LANGE103', 'unit_group', '66e84dae4994a7009cbbdd70', 'LANGE103ST', true,
    '{"apaleoUnitGroupName":"W. OEU FASHION STDIO","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('LANGE103', 'unit_group', '66e84ff286eee700136a4a54', 'LANGE1031S', true,
    '{"apaleoUnitGroupName":"X. OEU FASH 1/1 S","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('LANGE103', 'unit_group', '66e851144e166e00139af852', 'LANGE1031L', true,
    '{"apaleoUnitGroupName":"Y. OEU FASHION 1/1 L","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('LANGE103', 'unit_group', '66e85329cabeeb001331087a', 'LANGE10321', true,
    '{"apaleoUnitGroupName":"Z. OEU FASH 2/1","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('LANGE103', 'unit_group', '66e85443a8a40a00145bb9ce', 'LANGE10322', true,
    '{"apaleoUnitGroupName":"Z1. OEU FASH 2/2","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),

  -- JACOB (Apaleo property display name "One Lux Stay near Diamond District") -- 4 of 13 mapped
  ('JACOB', 'unit_group', '66e833c67fa4dc0099fbb0aa', 'JACOB1_1', true,
    '{"apaleoUnitGroupName":"S. OEU DIAMOND 1/1","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('JACOB', 'unit_group', '66e84713e4904400128c4a90', 'JACOB2_15', true,
    '{"apaleoUnitGroupName":"T. OEU DIAMOND 2/1.5","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('JACOB', 'unit_group', '66e848a86c89730012f1e5fb', 'JACOBPH2B', true,
    '{"apaleoUnitGroupName":"U. OEU DIAMOND PH2B","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),
  ('JACOB', 'unit_group', '66e849a74149880013d1be34', 'JACOB3_25', true,
    '{"apaleoUnitGroupName":"V. OEU DIAMOND 3/2.5","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb),

  -- KRIBB (Apaleo property display name "One Lux Stay Antwerp City Centre") -- 1 of 10 mapped
  ('KRIBB', 'unit_group', '66e4864c4505490013bf16b5', 'KRIBB1BR', true,
    '{"apaleoUnitGroupName":"Q. OEU KRIBB C","mappingMethod":"matched from Apaleo unit-group roster"}'::jsonb)
on conflict (mapping_type, local_id) do update
set apaleo_property_id = excluded.apaleo_property_id,
    apaleo_id = excluded.apaleo_id,
    enabled = excluded.enabled,
    metadata = excluded.metadata,
    updated_at = now();
