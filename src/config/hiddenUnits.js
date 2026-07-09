// Temporarily hidden public units and destinations.
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

export const HIDDEN_CITY_TERMS = ["miami", "miami beach", "south beach", "brickell", "wynwood"];

const normalizeHiddenText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const includesHiddenCity = (value) => {
  const normalized = normalizeHiddenText(value);
  if (!normalized) return false;
  return HIDDEN_CITY_TERMS.some((city) => normalized.includes(city));
};

const readTagText = (tag) => {
  if (typeof tag === "string") return tag;
  if (!tag || typeof tag !== "object") return "";
  return tag.name || tag.label || tag.value || tag.slug || "";
};

export const isHiddenCityUnit = (unit) => {
  if (!unit || typeof unit !== "object") return false;

  const address = unit.address && typeof unit.address === "object" ? unit.address : {};
  const location = unit.location && typeof unit.location === "object" ? unit.location : {};
  const tags = Array.isArray(unit.tags) ? unit.tags.map(readTagText) : [];
  const textValues = [
    unit.city,
    unit.cityName,
    unit.citySlug,
    unit.city_slug,
    unit.destination,
    typeof unit.location === "string" ? unit.location : "",
    typeof unit.address === "string" ? unit.address : "",
    address.city,
    address.full,
    address.formatted,
    address.address1,
    address.state,
    location.city,
    location.name,
    location.label,
    unit.title,
    unit.nickname,
    unit.name,
    ...tags,
  ];

  return textValues.some(includesHiddenCity);
};

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

  return HIDDEN_UNIT_IDS.includes(normalizedId) || isHiddenCityUnit(unit);
};

export const filterVisibleUnits = (units = []) =>
  (Array.isArray(units) ? units : []).filter((unit) => {
    return !isHiddenUnit(unit);
  });
