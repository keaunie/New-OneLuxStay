// Canonical LA building groupings — shared between LosAngelesLandingPage.jsx
// (which groups listing cards into building sections) and the guest chatbot
// (netlify/functions/chat.js, which uses this to recognize a guest naming a
// specific building by its marketing name even though several LA listings
// share generic/inconsistent Guesty titles across the same physical
// building — e.g. every DTLA/La Plaza Village unit is titled "Stylish ...
// Apartment by DTLA", never "La Plaza").
//
// `match` is tested against a lowercased blob of listing text (title,
// nickname, address, etc.) to classify a listing, AND against a guest's raw
// message to detect when they've named one of these buildings. Precedence
// matters: HWH is checked first, then downtown/La Plaza (excluding anything
// that already matched HWH — "west hollywood"/"weho" would otherwise also
// look like a "downtown" mention), then whatever's left. See
// resolveLaBuildingGroupKey.
export const LA_BUILDING_GROUPS = [
  {
    key: "la-hwh",
    label: "Downtown Los Angeles",
    guestLabel: "One Lux Stay HWH Downtown Los Angeles",
    match: /\bhwh\b|west hollywood|weho/,
  },
  {
    key: "la-downtown",
    label: "Downtown Los Angeles",
    guestLabel: "One Lux Stay LA Plaza Village",
    match: /downtown|dtla|la plaza|broadway|chinatown|union station/,
  },
  {
    key: "la-hollywood",
    label: "Hollywood",
    guestLabel: "One Lux Stay Hollywood View LA Suites",
    match: /hollywood/,
  },
];

export const OTHER_LA_BUILDING_GUEST_LABEL = "One Lux Stay Near Dodger Stadium Downtown LA";

// Mirrors the precedence rules above. Pass any lowercased-or-not text blob —
// a listing's combined fields, or a guest's raw message.
export const resolveLaBuildingGroupKey = (text = "") => {
  const source = String(text || "").toLowerCase();
  const hwh = LA_BUILDING_GROUPS.find((group) => group.key === "la-hwh");
  if (hwh && hwh.match.test(source)) return hwh.key;
  const downtown = LA_BUILDING_GROUPS.find((group) => group.key === "la-downtown");
  if (downtown && downtown.match.test(source) && !/\bhwh\b|west hollywood|weho/.test(source)) {
    return downtown.key;
  }
  for (const group of LA_BUILDING_GROUPS) {
    if (group.key === "la-hwh" || group.key === "la-downtown") continue;
    if (group.match.test(source)) return group.key;
  }
  return "other";
};

export const getLaBuildingGuestLabel = (key) =>
  LA_BUILDING_GROUPS.find((group) => group.key === key)?.guestLabel || OTHER_LA_BUILDING_GUEST_LABEL;
