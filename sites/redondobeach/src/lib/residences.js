import { BUILDINGS, SITE } from "../data/content.js";

const clean = (value = "") => String(value ?? "").replace(/\s+/g, " ").trim();

// Guesty's photo CDN resizes on the fly: a 335 KB original becomes ~40 KB at card size.
export const resizePhoto = (url, width = 900) => {
  const value = clean(url);
  if (!value.includes("/image/upload/")) return value;
  return value.replace("/image/upload/", `/image/upload/c_limit,w_${width},q_auto,f_auto/`);
};

const photoUrls = (listing) =>
  (Array.isArray(listing?.pictures) ? listing.pictures : [])
    .map((picture) => clean(picture?.original || picture?.thumbnail || picture))
    .filter(Boolean);

const buildingFor = (listing) => {
  const address = clean(listing?.address?.full || listing?.address?.street || "");
  return BUILDINGS.find((building) => building.match.test(address)) || null;
};

const AMENITY_PRIORITY = [
  "Air conditioning",
  "Wireless Internet",
  "Washer",
  "Dryer",
  "Dishwasher",
  "Kitchen",
  "Free parking on premises",
  "Near Ocean",
  "Beach",
  "TV",
  "Cable TV",
  "Coffee maker",
  "Towels provided",
  "Bed linens",
  "Iron",
  "Hair dryer",
];

const bedroomLabel = (bedrooms) => (bedrooms === 1 ? "1-Bedroom" : `${bedrooms}-Bedroom`);

// Groups the individual units into the floor plans a guest actually chooses between:
// same building + same bedroom/bath count.
export const groupResidences = (listings = []) => {
  const groups = new Map();
  listings.forEach((listing) => {
    const building = buildingFor(listing);
    if (!building) return;
    const bedrooms = Number(listing.bedrooms) || 1;
    const bathrooms = Number(listing.bathrooms) || 1;
    const key = `${building.key}-${bedrooms}br`;
    const photos = photoUrls(listing);
    const existing = groups.get(key) || {
      slug: key,
      building,
      bedrooms,
      bathrooms,
      sleeps: 0,
      units: 0,
      photos: [],
      amenities: new Set(),
      listingIds: [],
    };
    existing.units += 1;
    existing.sleeps = Math.max(existing.sleeps, Number(listing.accommodates) || 0);
    existing.bathrooms = Math.max(existing.bathrooms, bathrooms);
    existing.listingIds.push(listing.id);
    (listing.amenities || []).forEach((amenity) => existing.amenities.add(clean(amenity)));
    if (photos.length > existing.photos.length) existing.photos = photos;
    groups.set(key, existing);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      name: `${bedroomLabel(group.bedrooms)} Residence`,
      title: `${bedroomLabel(group.bedrooms)} Residence · ${group.building.name}`,
      amenities: AMENITY_PRIORITY.filter((item) => group.amenities.has(item)),
      // "Downtown" is a location tag in the listing data, not a feature of the home.
      allAmenities: [...group.amenities].filter((item) => item && !/^downtown$/i.test(item)).sort(),
    }))
    .sort((a, b) => a.bedrooms - b.bedrooms || a.building.name.localeCompare(b.building.name));
};

// Shown if the listings service can't be reached, so the site never looks empty. Photos are
// omitted; cards fall back to a branded placeholder.
export const FALLBACK_RESIDENCES = [
  { bedrooms: 1, bathrooms: 1, sleeps: 4, units: 8, building: "north-broadway" },
  { bedrooms: 2, bathrooms: 2, sleeps: 6, units: 3, building: "barbara-street" },
  { bedrooms: 3, bathrooms: 2, sleeps: 7, units: 6, building: "barbara-street" },
].map((plan) => {
  const building = BUILDINGS.find((b) => b.key === plan.building);
  return {
    slug: `${building.key}-${plan.bedrooms}br`,
    building,
    bedrooms: plan.bedrooms,
    bathrooms: plan.bathrooms,
    sleeps: plan.sleeps,
    units: plan.units,
    photos: [],
    name: `${bedroomLabel(plan.bedrooms)} Residence`,
    title: `${bedroomLabel(plan.bedrooms)} Residence · ${building.name}`,
    amenities: ["Wireless Internet", "Washer", "Dryer", "Dishwasher", "Kitchen", "TV", "Towels provided", "Bed linens"],
    allAmenities: [],
    listingIds: [],
  };
});

export const fetchResidences = async (signal) => {
  const response = await fetch(`${SITE.apiBase}/listings`, { signal });
  if (!response.ok) throw new Error(`Listings request failed (${response.status})`);
  const payload = await response.json();
  const redondo = (payload?.results || []).filter(
    (listing) => /redondo beach/i.test(clean(listing?.city)) && listing?.active !== false && listing?.listed !== false,
  );
  const groups = groupResidences(redondo);
  if (!groups.length) throw new Error("No Redondo Beach residences returned");
  return groups;
};
