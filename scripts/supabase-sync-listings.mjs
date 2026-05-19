import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "",
).trim();
const listingsTable = String(process.env.SUPABASE_LISTINGS_TABLE || "listings").trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sourceOrigin = String(
  process.env.SUPABASE_LISTINGS_SOURCE_ORIGIN ||
    process.env.INTERNAL_API_ORIGIN ||
    process.env.SITEMAP_FUNCTIONS_ORIGIN ||
    process.env.VITE_INTERNAL_API_BASE ||
    process.env.VITE_NETLIFY_SITE_URL ||
    process.env.VITE_NETLIFY_FUNCTIONS_ORIGIN ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.URL ||
    "http://localhost:8888",
)
  .trim()
  .replace(/\/+$/, "");
const sourcePath = String(process.env.SUPABASE_LISTINGS_SOURCE_PATH || "/.netlify/functions/listings").trim();
const sourceUrl = `${sourceOrigin}${sourcePath.startsWith("/") ? sourcePath : `/${sourcePath}`}`;

const parseNumber = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
};

const normalizeString = (value) => String(value || "").trim();

const slugify = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const listingId = (listing) =>
  normalizeString(listing?.id || listing?._id || listing?.unitTypeId || listing?.listing_id || "");

const toRow = (listing) => {
  const id = listingId(listing);
  if (!id) return null;

  const city =
    normalizeString(listing?.city) ||
    normalizeString(listing?.address?.city) ||
    normalizeString(listing?.location?.city) ||
    null;

  return {
    id,
    source: "guesty_sync",
    title: normalizeString(listing?.title || listing?.name || `Listing ${id}`),
    city,
    city_slug: normalizeString(listing?.city_slug || listing?.citySlug) || (city ? slugify(city) : null),
    area_slug: normalizeString(listing?.area_slug || listing?.areaSlug) || null,
    property_type: normalizeString(listing?.propertyType || listing?.property_type) || null,
    room_type: normalizeString(listing?.roomType || listing?.room_type) || null,
    accommodates: parseNumber(listing?.accommodates, listing?.capacity),
    bedrooms: parseNumber(listing?.bedrooms),
    bathrooms: parseNumber(listing?.bathrooms),
    beds: parseNumber(listing?.beds),
    currency: normalizeString(listing?.currency || listing?.prices?.currency || "USD") || "USD",
    base_price: parseNumber(listing?.basePrice, listing?.prices?.basePrice, listing?.price),
    active:
      typeof listing?.active === "boolean"
        ? listing.active
        : typeof listing?.is_active === "boolean"
          ? listing.is_active
          : true,
    listed:
      typeof listing?.listed === "boolean"
        ? listing.listed
        : typeof listing?.is_listed === "boolean"
          ? listing.is_listed
          : true,
    pms_active:
      typeof listing?.pmsActive === "boolean"
        ? listing.pmsActive
        : typeof listing?.pms_active === "boolean"
          ? listing.pms_active
          : true,
    min_nights: parseNumber(listing?.minNights, listing?.minimumNights),
    address: listing?.address && typeof listing.address === "object" ? listing.address : {},
    location:
      listing?.coordinates && typeof listing.coordinates === "object"
        ? listing.coordinates
        : listing?.location && typeof listing.location === "object"
          ? listing.location
          : {},
    amenities: Array.isArray(listing?.amenities) ? listing.amenities : [],
    pictures: Array.isArray(listing?.pictures) ? listing.pictures : [],
    tags: Array.isArray(listing?.tags) ? listing.tags : [],
    metadata: listing,
    updated_at: new Date().toISOString(),
  };
};

const fetchListingsPage = async (skip, limit = 200) => {
  const qs = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });
  const endpoint = `${sourceUrl}?${qs.toString()}`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Listing source failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const payload = text ? JSON.parse(text) : {};
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return { results, count: Number(payload?.count || 0) || null };
};

const upsertBatch = async (rows) => {
  const endpoint = `${supabaseUrl}/rest/v1/${listingsTable}?on_conflict=id`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
      Accept: "application/json",
    },
    body: JSON.stringify(rows),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase listings upsert failed (${response.status}): ${text}`);
  }
};

const allListings = [];
let skip = 0;
const pageLimit = Math.max(1, Number(process.env.SUPABASE_LISTINGS_SYNC_MAX_PAGES || 40) || 40);
const pageSize = Math.max(1, Number(process.env.SUPABASE_LISTINGS_SYNC_PAGE_SIZE || 200) || 200);

for (let page = 0; page < pageLimit; page += 1) {
  const { results } = await fetchListingsPage(skip, pageSize);
  if (!results.length) break;
  allListings.push(...results);
  skip += results.length;
}

const dedup = new Map();
for (const listing of allListings) {
  const row = toRow(listing);
  if (!row) continue;
  dedup.set(row.id, row);
}

const rows = [...dedup.values()];
const batchSize = Math.max(1, Number(process.env.SUPABASE_LISTINGS_SYNC_BATCH || 100) || 100);
for (let i = 0; i < rows.length; i += batchSize) {
  const batch = rows.slice(i, i + batchSize);
  await upsertBatch(batch);
}

console.log(`Synced ${rows.length} listings into ${listingsTable} from ${sourceUrl}.`);
