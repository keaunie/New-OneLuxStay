import dotenv from "dotenv";
import { guestyRequest } from "../netlify/functions/_shared/guestyService.js";
import { supabaseRestRequest } from "../netlify/functions/_shared/supabaseClient.js";

dotenv.config();

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (prefix) => args.find((value) => value.startsWith(`${prefix}=`))?.slice(prefix.length + 1) || null;

const APPLY = hasFlag("--apply");
const DRY_RUN = !APPLY;

const MAX_PROPERTIES = Math.max(1, Number(getArg("--max-properties") || 200) || 200);
const BATCH_SIZE = Math.max(50, Math.min(1000, Number(getArg("--batch") || 500) || 500));
const MIN_DELAY_MS = Math.max(0, Number(getArg("--delay-ms") || 250) || 250);
const LOOKAHEAD_DAYS = Math.max(1, Math.min(365, Number(getArg("--days") || 90) || 90));

const ONLY_PROPERTY_ID = String(getArg("--only-property-id") || "").trim();

// This script writes per-property nightly pricing used by Google VR/Hotels ARI.
// Don't couple it to SUPABASE_AVAILABILITY_TABLE (which may point to legacy tables like listing_nightly_prices).
const PRICES_TABLE =
  String(process.env.SUPABASE_PROPERTY_NIGHTLY_PRICES_TABLE || "property_nightly_prices").trim() ||
  "property_nightly_prices";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeString = (value) => String(value ?? "").trim();

const toIsoDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const addDaysIso = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.trunc(days)));
  return d.toISOString().slice(0, 10);
};

const firstNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const isDayAvailable = (day) => {
  if (!day) return false;
  if (typeof day.allotment === "number") return day.allotment > 0;
  if (typeof day.available === "boolean") return day.available;
  if (typeof day.isAvailable === "boolean") return day.isAvailable;
  if (typeof day.status === "string") return day.status === "available";
  return false;
};

const normalizeCalendarItems = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.listings)) return payload.listings;
  if (Array.isArray(payload?.calendars)) return payload.calendars;
  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload?.days)) {
    // Single listing response shape.
    return [{ listingId: payload?.listingId || payload?.id || payload?._id || null, days: payload.days, currency: payload?.currency }];
  }

  if (payload?.calendars && typeof payload.calendars === "object") return Object.values(payload.calendars);
  if (payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)) return Object.values(payload.data);

  return [];
};

const normalizeCalendarDay = (day, fallbackCurrency) => {
  const date =
    day?.date ||
    day?.dateLocalized ||
    day?.day ||
    (typeof day?.startDate === "string" ? day.startDate.split("T")[0] : null);
  if (!date) return null;

  const price = firstNumber(
    day?.price,
    day?.nightlyPrice,
    day?.nightlyRate,
    day?.basePrice,
    day?.basePricePerNight,
    day?.price?.amount,
    day?.price?.value,
    day?.money?.amount,
    day?.money?.money?.amount,
  );

  const currency =
    day?.currency ||
    day?.price?.currency ||
    day?.money?.currency ||
    day?.money?.money?.currency ||
    fallbackCurrency ||
    "USD";

  const minNights = firstNumber(
    day?.minNights,
    day?.minimumStay,
    day?.minStay,
    day?.minStayLength,
    day?.restrictions?.minNights,
    day?.restrictions?.minStay,
  );

  return {
    date: String(date),
    price,
    currency: String(currency || "USD"),
    minNights,
    status: day?.status,
    allotment: typeof day?.allotment === "number" ? day.allotment : null,
    isAvailable: isDayAvailable(day),
  };
};

const fetchCalendarForListing = async ({ guestyListingId, startDate, endDate }) => {
  const qs = new URLSearchParams({
    startDate,
    endDate,
    includeAllotment: "true",
  });
  return guestyRequest(`/availability-pricing/api/calendar/listings/${encodeURIComponent(guestyListingId)}?${qs.toString()}`);
};

const upsertNightlyPrices = async (rows) => {
  if (DRY_RUN) return;
  if (!rows.length) return;
  await supabaseRestRequest(PRICES_TABLE, {
    method: "POST",
    query: { on_conflict: "property_id,date" },
    body: rows,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
};

const ensureSchema = async () => {
  try {
    // Prefer `guesty_listing_id` (explicit mapping), but allow legacy `guesty_id`.
    await supabaseRestRequest("properties", { query: { select: "id,guesty_id,guesty_listing_id", limit: 1 } });
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("guesty_listing_id") && msg.includes("does not exist")) {
      // Column doesn't exist yet; this is OK as long as `guesty_id` exists.
      try {
        await supabaseRestRequest("properties", { query: { select: "id,guesty_id", limit: 1 } });
        console.log(
          "note: `properties.guesty_listing_id` column not found; falling back to `properties.guesty_id` for Guesty listing ids.",
        );
        console.log(
          "note: optional migration to add `guesty_listing_id`: supabase/migrations/20260423102000_add_properties_guesty_listing_id.sql",
        );
        console.log("");
        return;
      } catch {
        throw new Error(
          "Missing `properties.guesty_id` (or `properties.guesty_listing_id`). Ensure your `properties` table has a Guesty listing id column.",
        );
      }
    }
    throw error;
  }

  try {
    await supabaseRestRequest(PRICES_TABLE, { query: { select: "property_id,date", limit: 1 } });
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg.includes("Could not find the table") || msg.includes("schema cache")) {
      throw new Error(
        [
          `Missing ${PRICES_TABLE}.`,
          "Apply migration: supabase/migrations/20260421175000_create_property_nightly_prices.sql",
          "If you really want a different table, set SUPABASE_PROPERTY_NIGHTLY_PRICES_TABLE.",
        ].join(" "),
      );
    }
    throw error;
  }
};

console.log(`Syncing Guesty nightly prices into Supabase (${DRY_RUN ? "dry-run" : "apply"}).`);
if (process.env.SUPABASE_AVAILABILITY_TABLE && !process.env.SUPABASE_PROPERTY_NIGHTLY_PRICES_TABLE) {
  console.log(
    `note: ignoring SUPABASE_AVAILABILITY_TABLE=${String(process.env.SUPABASE_AVAILABILITY_TABLE).trim()} for this script (set SUPABASE_PROPERTY_NIGHTLY_PRICES_TABLE to override).`,
  );
}
console.log(`table=${PRICES_TABLE} maxProperties=${MAX_PROPERTIES} days=${LOOKAHEAD_DAYS} batch=${BATCH_SIZE}`);
console.log("");

await ensureSchema();

const startDate = toIsoDate(getArg("--start") || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
const endDate = addDaysIso(startDate, LOOKAHEAD_DAYS);

const properties = await supabaseRestRequest("properties", {
  query: {
    select: "id,guesty_id,guesty_listing_id,name",
    ...(ONLY_PROPERTY_ID ? { id: `eq.${ONLY_PROPERTY_ID}` } : {}),
    limit: Math.min(1000, MAX_PROPERTIES),
    offset: 0,
  },
});

const list = Array.isArray(properties) ? properties.slice(0, MAX_PROPERTIES) : [];
const eligible = list.filter((p) => normalizeString(p?.guesty_listing_id || p?.guesty_id));

console.log(`properties_loaded: ${list.length}`);
console.log(`properties_with_guesty_listing_id_or_guesty_id: ${eligible.length}`);
if (!eligible.length) {
  console.log("");
  console.log("No properties have a Guesty listing id yet (`guesty_listing_id` or `guesty_id`).");
  console.log("If you already store Guesty ids in `guesty_id`, confirm it’s populated in Supabase.");
  console.log("Otherwise run: `npm run supabase:map:guesty-listings -- --apply`");
  process.exitCode = 0;
}
console.log("");

let processedProperties = 0;
let insertedRows = 0;
let failedProperties = 0;

for (const property of eligible) {
  if (processedProperties >= MAX_PROPERTIES) break;

  const propertyId = normalizeString(property?.id);
  const guestyListingId = normalizeString(property?.guesty_listing_id || property?.guesty_id);
  const name = normalizeString(property?.name) || "";

  if (!propertyId || !guestyListingId) continue;

  processedProperties += 1;
  try {
    const payload = await fetchCalendarForListing({ guestyListingId, startDate, endDate });
    const calendars = normalizeCalendarItems(payload);
    const primary = calendars[0] || {};
    const days = primary?.days || primary?.calendar || primary?.data || primary?.availability || payload?.days || [];
    const fallbackCurrency = primary?.currency || payload?.currency || "USD";
    const normalizedDays = Array.isArray(days)
      ? days.map((day) => normalizeCalendarDay(day, fallbackCurrency)).filter(Boolean)
      : [];

    const rows = normalizedDays
      .filter((day) => day.date >= startDate && day.date <= endDate)
      .map((day) => ({
        property_id: propertyId,
        date: day.date,
        is_available: Boolean(day.isAvailable),
        nightly_rate: Number.isFinite(Number(day.price)) ? Math.round(Number(day.price) * 100) / 100 : 0,
        cleaning_fee: 0,
        taxes: 0,
        currency: normalizeString(day.currency).toUpperCase() || "USD",
        min_nights: Number.isFinite(Number(day.minNights)) ? Math.max(1, Math.trunc(Number(day.minNights))) : null,
        source: "guesty_calendar",
        metadata: {
          guesty_listing_id: guestyListingId,
          status: normalizeString(day.status) || null,
        },
        updated_at: new Date().toISOString(),
      }));

    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await upsertNightlyPrices(batch);
      upserted += batch.length;
    }

    insertedRows += upserted;
    console.log(`[${DRY_RUN ? "dry" : "ok "}] ${propertyId}${name ? ` (${name})` : ""}: days=${rows.length}`);
  } catch (error) {
    failedProperties += 1;
    console.log(`[fail] ${propertyId}${name ? ` (${name})` : ""}: ${error?.message || error}`);
  }

  if (MIN_DELAY_MS) await sleep(MIN_DELAY_MS);
}

console.log("");
console.log(`properties_processed: ${processedProperties}`);
console.log(`rows_upserted: ${insertedRows}${DRY_RUN ? " (dry-run)" : ""}`);
console.log(`properties_failed: ${failedProperties}`);
console.log("");
console.log("Next: re-run ARI endpoints to see pricing/availability emit.");
