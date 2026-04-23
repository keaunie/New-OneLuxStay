import dotenv from "dotenv";
import { guestyRequest } from "../netlify/functions/_shared/guestyService.js";
import { supabaseRestRequest } from "../netlify/functions/_shared/supabaseClient.js";

dotenv.config();

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (prefix) => args.find((value) => value.startsWith(`${prefix}=`))?.slice(prefix.length + 1) || null;

const APPLY = hasFlag("--apply");
const DRY_RUN = !APPLY;

const MAX_PROPERTIES = Math.max(1, Number(getArg("--max-properties") || 5000) || 5000);
const GUESTY_PAGE_SIZE = Math.max(50, Math.min(200, Number(getArg("--guesty-page-size") || 200) || 200));
const MAX_GUESTY_PAGES = Math.max(1, Number(getArg("--max-guesty-pages") || 100) || 100);
const DISTANCE_METERS = Math.max(25, Number(getArg("--max-distance-m") || 250) || 250);
const MIN_DELAY_MS = Math.max(0, Number(getArg("--delay-ms") || 250) || 250);

const ONLY_UNMAPPED = !hasFlag("--include-mapped");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeString = (value) => String(value ?? "").trim();
const normalizeKey = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/[#.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toNumber = (value) => {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const readGuestyListingId = (listing) =>
  normalizeString(listing?._id || listing?.id || listing?.listingId);

const readGuestyLatLng = (listing) => {
  const lat = toNumber(listing?.address?.lat || listing?.address?.latitude || listing?.location?.lat);
  const lng = toNumber(listing?.address?.lng || listing?.address?.longitude || listing?.location?.lng);
  return { lat, lng };
};

const readGuestyAddressKey = (listing) => {
  const full = normalizeString(listing?.address?.full || listing?.address?.address || "");
  const city = normalizeString(listing?.address?.city || "");
  const country = normalizeString(listing?.address?.country || "");
  return normalizeKey([full, city, country].filter(Boolean).join(", "));
};

const fetchAllGuestyListings = async () => {
  const fields = [
    "_id",
    "title",
    "nickname",
    "address.full",
    "address.city",
    "address.country",
    "address.lat",
    "address.lng",
    "active",
    "listed",
    "pmsActive",
  ].join(" ");

  const all = [];
  for (let page = 0; page < MAX_GUESTY_PAGES; page += 1) {
    const skip = page * GUESTY_PAGE_SIZE;
    const params = new URLSearchParams({
      limit: String(GUESTY_PAGE_SIZE),
      skip: String(skip),
      fields,
      active: "true",
      listed: "true",
      pmsActive: "true",
    });
    const payload = await guestyRequest(`/listings?${params.toString()}`);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (!results.length) break;
    all.push(...results);
    if (results.length < GUESTY_PAGE_SIZE) break;
  }
  return all;
};

const fetchProperties = async () => {
  try {
    const rows = await supabaseRestRequest("properties", {
      query: {
        select: "id,name,address,city,country,latitude,longitude,guesty_listing_id",
        limit: Math.min(1000, MAX_PROPERTIES),
        offset: 0,
      },
    });
    return Array.isArray(rows) ? rows.slice(0, MAX_PROPERTIES) : [];
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("guesty_listing_id") && msg.includes("does not exist")) {
      console.error("Supabase is missing `properties.guesty_listing_id`.");
      console.error("Apply migration: `supabase/migrations/20260423102000_add_properties_guesty_listing_id.sql`.");
      process.exitCode = 2;
      return [];
    }
    throw error;
  }
};

const updatePropertyMapping = async (propertyId, guestyListingId) => {
  if (DRY_RUN) return;
  await supabaseRestRequest("properties", {
    method: "PATCH",
    query: { id: `eq.${propertyId}` },
    body: { guesty_listing_id: guestyListingId },
    prefer: "return=minimal",
  });
};

const buildPropertyAddressKey = (property) => {
  const address = normalizeString(property?.address);
  const city = normalizeString(property?.city);
  const country = normalizeString(property?.country);
  return normalizeKey([address, city, country].filter(Boolean).join(", "));
};

const main = async () => {
  console.log(`Mapping Guesty listings to Supabase properties (${DRY_RUN ? "dry-run" : "apply"}).`);
  console.log(
    `maxProperties=${MAX_PROPERTIES} guestyPageSize=${GUESTY_PAGE_SIZE} maxGuestyPages=${MAX_GUESTY_PAGES} maxDistanceM=${DISTANCE_METERS}`,
  );
  console.log("");

  const guestyListings = await fetchAllGuestyListings();
  const guestyByAddress = new Map();
  for (const listing of guestyListings) {
    const id = readGuestyListingId(listing);
    if (!id) continue;
    const key = readGuestyAddressKey(listing);
    if (!key) continue;
    if (!guestyByAddress.has(key)) guestyByAddress.set(key, []);
    guestyByAddress.get(key).push(listing);
  }

  const properties = await fetchProperties();
  if (!properties.length && process.exitCode === 2) {
    console.log("");
    console.log("Re-run after applying the migration:");
    console.log("- `npm run supabase:map:guesty-listings -- --apply`");
    process.exitCode = 2;
    return;
  }

  let mapped = 0;
  let alreadyMapped = 0;
  let ambiguous = 0;
  let unmatched = 0;

  for (const property of properties) {
    const propertyId = normalizeString(property?.id);
    const existing = normalizeString(property?.guesty_listing_id);

    if (!propertyId) continue;
    if (existing) {
      alreadyMapped += 1;
      if (ONLY_UNMAPPED) continue;
    }

    const pLat = toNumber(property?.latitude);
    const pLng = toNumber(property?.longitude);

    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    let secondBestDistance = Number.POSITIVE_INFINITY;

    if (pLat != null && pLng != null) {
      for (const listing of guestyListings) {
        const { lat, lng } = readGuestyLatLng(listing);
        if (lat == null || lng == null) continue;
        const d = haversineMeters(pLat, pLng, lat, lng);
        if (d < bestDistance) {
          secondBestDistance = bestDistance;
          bestDistance = d;
          best = listing;
        } else if (d < secondBestDistance) {
          secondBestDistance = d;
        }
      }
      if (best && bestDistance <= DISTANCE_METERS) {
        if (secondBestDistance - bestDistance < 5) {
          ambiguous += 1;
          continue;
        }
        const guestyId = readGuestyListingId(best);
        if (guestyId) {
          await updatePropertyMapping(propertyId, guestyId);
          mapped += 1;
          if (MIN_DELAY_MS) await sleep(MIN_DELAY_MS);
          continue;
        }
      }
    }

    const addressKey = buildPropertyAddressKey(property);
    const candidates = guestyByAddress.get(addressKey) || [];
    if (candidates.length === 1) {
      const guestyId = readGuestyListingId(candidates[0]);
      if (guestyId) {
        await updatePropertyMapping(propertyId, guestyId);
        mapped += 1;
        if (MIN_DELAY_MS) await sleep(MIN_DELAY_MS);
        continue;
      }
    }

    if (candidates.length > 1) ambiguous += 1;
    else unmatched += 1;
  }

  console.log("Done.");
  console.log(`properties_total: ${properties.length}`);
  console.log(`guesty_listings_total: ${guestyListings.length}`);
  console.log(`mapped_now: ${mapped}`);
  console.log(`already_mapped: ${alreadyMapped}`);
  console.log(`ambiguous: ${ambiguous}`);
  console.log(`unmatched: ${unmatched}`);
  console.log("");
  console.log("Next: run `npm run supabase:sync:property-nightly-prices -- --apply` to backfill pricing.");
};

try {
  await main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
