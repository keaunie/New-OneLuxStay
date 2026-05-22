// Temporarily hidden public units (Redondo Beach)
export const HIDDEN_UNIT_IDS = [
  // "6948d9855a49ec0013d81ab5",
  // "6948d9865a49ec0013d8200d",
  // "695420a06aa393001cbecefb",
  // "696a34b2e629d00015871427",
  // "696a34b2e629d00015871726",
  // "69e125f82a2e7400157046ae",
  // "696a35884770cc0013af50d4",
  // "68c6f3c58247f20013bae867",
  // "68e663f5961b570012530251",
  // "68c6f3c58247f20013bae91e",
  // "68e6d143a5e35f00237b6930",
  // "68e6d144a5e35f00237b6b9a",
  // "68e6d144a5e35f00237b6bc3"
];

export const isHiddenUnit = (unit) => {
  const id =
    unit?.id ||
    unit?._id ||
    unit?.propertyId ||
    unit?.unitId ||
    unit?.listingId ||
    unit?.unitGroupId ||
    unit;
  const normalizedId = String(id || "").trim();

  return HIDDEN_UNIT_IDS.includes(normalizedId);
};

export const filterVisibleUnits = (units = []) =>
  (Array.isArray(units) ? units : []).filter((unit) => {
    return !isHiddenUnit(unit);
  });
