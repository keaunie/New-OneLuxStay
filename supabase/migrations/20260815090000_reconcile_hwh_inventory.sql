-- One Apaleo unit group can represent multiple website listings. Remove the
-- former one-to-one constraint if the foundation migration was already run.
alter table public.apaleo_inventory_mappings
  drop constraint if exists apaleo_inventory_mappings_mapping_type_apaleo_id_key;

create index if not exists apaleo_inventory_mappings_apaleo_id_idx
  on public.apaleo_inventory_mappings (mapping_type, apaleo_id);

insert into public.apaleo_inventory_mappings (
  apaleo_property_id,
  mapping_type,
  local_id,
  apaleo_id,
  enabled,
  metadata
)
values
  ('HWH', 'unit_group', '6a3ac91fbd835d001bf21075', 'HWH-HWH1BRDLXL', true,
    '{"apaleoUnitId":"HWH-SJP","apaleoUnitName":"HWH 106","apaleoUnitGroupName":"E1. OLS HWH 1 BR DELUXE LARGE","mappingMethod":"manually confirmed from HWH unit roster"}'::jsonb),
  ('HWH', 'unit_group', '66e1e3875a1f6300d736f397', 'HWH-HWHJR1BR', true,
    '{"apaleoUnitId":"HWH-UPD","apaleoUnitName":"HWH 505","apaleoUnitGroupName":"D. OLS HWH JR 1 BR","mappingMethod":"manually confirmed from HWH unit roster"}'::jsonb),
  ('HWH', 'unit_group', '66e1e3875a1f6300d736f39f', 'HWH-HWHJR1BR', true,
    '{"apaleoUnitId":"HWH-TOP","apaleoUnitName":"HWH 506","apaleoUnitGroupName":"D. OLS HWH JR 1 BR","mappingMethod":"manually confirmed from HWH unit roster"}'::jsonb),
  ('HWH', 'unit_group', '66e32ea43751f2001243a847', 'HWH-HWH2BR1BA', true,
    '{"apaleoUnitGroupName":"F. OLS HWH 2/1","mappingMethod":"website category"}'::jsonb),
  ('HWH', 'unit_group', '66e32ea43751f2001243a952', 'HWH-HWH2BR1BA', true,
    '{"apaleoUnitId":"HWH-ZKO","apaleoUnitName":"HWH 409","apaleoUnitGroupName":"F. OLS HWH 2/1","mappingMethod":"manually confirmed from HWH unit roster"}'::jsonb),
  ('HWH', 'unit_group', '66e32ea43751f2001243a95a', 'HWH-HWH2BR1BA', true,
    '{"apaleoUnitId":"HWH-DMD","apaleoUnitName":"HWH 509","apaleoUnitGroupName":"F. OLS HWH 2/1","mappingMethod":"manually confirmed from HWH unit roster"}'::jsonb),
  ('HWH', 'unit_group', '66e32ea43751f2001243a96a', 'HWH-HWH2BR1BA', true,
    '{"apaleoUnitId":"HWH-JUE","apaleoUnitName":"HWH 713","apaleoUnitGroupName":"F. OLS HWH 2/1","mappingMethod":"manually confirmed from HWH unit roster"}'::jsonb),
  ('HWH', 'unit_group', '677dbf2bcb54b50010e72cfb', 'HWH-HWH2BR1BA', true,
    '{"apaleoUnitGroupName":"F. OLS HWH 2/1","mappingMethod":"dummy/category listing; no physical unit"}'::jsonb),
  ('HWH', 'unit_group', '67bf7bdd8cc23e003072b8fc', 'HWH-HWH2BR1BA', true,
    '{"apaleoUnitGroupName":"F. OLS HWH 2/1","mappingMethod":"dummy/category listing; no physical unit"}'::jsonb),
  ('HWH', 'unit_group', '699e43d4c21def001498937e', 'HWH-HWH2BR1BA', true,
    '{"apaleoUnitGroupName":"F. OLS HWH 2/1","mappingMethod":"dummy/category listing; no physical unit"}'::jsonb),
  ('HWH', 'unit_group', '6a1a5389f80d8600143a2e2a', 'HWH-HWH2BR1BA', true,
    '{"apaleoUnitGroupName":"F. OLS HWH 2/1","mappingMethod":"dummy/category listing; no physical unit"}'::jsonb),
  ('HWH', 'unit_group', '66e3bd82536929001303452f', 'HWH-HWH2BR2BA', true,
    '{"apaleoUnitGroupName":"G. OLS HWH 2/2","mappingMethod":"website category"}'::jsonb),
  ('HWH', 'unit_group', '66e3bd83536929001303463a', 'HWH-HWH2BR2BA', true,
    '{"apaleoUnitId":"HWH-ODT","apaleoUnitName":"HWH 419","apaleoUnitGroupName":"G. OLS HWH 2/2","mappingMethod":"manually confirmed from HWH unit roster"}'::jsonb),
  ('HWH', 'unit_group', '66e3bd835369290013034642', 'HWH-HWH2BR2BA', true,
    '{"apaleoUnitId":"HWH-MKI","apaleoUnitName":"HWH 519","apaleoUnitGroupName":"G. OLS HWH 2/2","mappingMethod":"manually confirmed from HWH unit roster"}'::jsonb),
  ('HWH', 'unit_group', '677d5497e77f37001236aa18', 'HWH-HWH2BR2BA', true,
    '{"apaleoUnitGroupName":"G. OLS HWH 2/2","mappingMethod":"dummy/category listing; no physical unit"}'::jsonb)
on conflict (mapping_type, local_id) do update
set apaleo_property_id = excluded.apaleo_property_id,
    apaleo_id = excluded.apaleo_id,
    enabled = excluded.enabled,
    metadata = excluded.metadata,
    updated_at = now();
