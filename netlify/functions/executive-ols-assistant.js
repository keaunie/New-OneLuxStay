import dotenv from "dotenv";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import { fetchWithTimeout, getBaseUrl } from "./_shared/http.js";
import { guestyRequest } from "./_shared/guestyService.js";
import { listApaleoReservationsWithDebug } from "./_shared/apaleoService.js";
import { verifyAdminsOlsAccess } from "./_shared/adminsOlsAuth.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";
import { propertyProfiles } from "../../src/data/propertyProfiles.js";

dotenv.config();

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_HISTORY_MESSAGES = 8;

// process.env doesn't reliably carry every Netlify-configured variable in
// this function's runtime; the rest of the codebase (chat.js, admins-ols.js,
// property-admin.js) reads through Netlify's own accessor as a fallback.
const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name) || "";

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizeEmail = (value = "") => sanitizeString(value, 320).toLowerCase();

const parseAllowedExecutiveEmails = () =>
  new Set(
    String(getEnv("EXECUTIVE_OLS_ALLOWED_EMAILS") || "")
      .split(",")
      .map((value) => normalizeEmail(value))
      .filter(Boolean),
  );

const enforceExecutiveAccess = (access = {}) => {
  const email = normalizeEmail(access?.user?.email);
  const allowedEmails = parseAllowedExecutiveEmails();
  if (!allowedEmails.size) return access;
  if (email && allowedEmails.has(email)) return access;

  const error = new Error("Executive access required.");
  error.statusCode = 403;
  throw error;
};

const getHeaders = (event = {}) => ({
  ...buildAiCorsHeaders(event),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

const jsonResponse = (statusCode, body, event) => ({
  statusCode,
  headers: getHeaders(event),
  body: JSON.stringify(body),
});

const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

const normalizeAssistantErrorMessage = (error) => {
  const raw = sanitizeString(error?.message || "Unknown assistant error.", 320);
  if (!raw) return "Unknown assistant error.";
  if (/incorrect api key provided/i.test(raw) || /invalid api key/i.test(raw)) {
    return "Invalid OPENAI_API_KEY in the server environment.";
  }
  if (/openai_api_key is missing/i.test(raw) || /api key is missing/i.test(raw)) {
    return "OPENAI_API_KEY is missing in the server environment.";
  }
  return raw.replace(/sk-[a-z0-9_-]+/gi, "[redacted-key]");
};

const firstNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const formatCurrency = (value, currency = "USD") => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `0 ${String(currency || "USD").toUpperCase()}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${String(currency || "USD").toUpperCase()}`;
  }
};

const sanitizeMessages = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => item && typeof item.content === "string")
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: sanitizeString(item.content, 1000),
        }))
        .filter((item) => item.content)
        .slice(-MAX_HISTORY_MESSAGES)
    : [];

const resolveTimeRange = (value = "") => {
  const normalized = sanitizeString(value, 40).toLowerCase();
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const start = new Date(now);
  const end = new Date(now);

  if (normalized === "today") {
    end.setDate(end.getDate() + 1);
    return { key: "today", label: "Today", start, end };
  }

  if (normalized === "this_month") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 1);
    return { key: "this_month", label: "This month", start, end };
  }

  if (normalized === "next_30_days") {
    end.setDate(end.getDate() + 30);
    return { key: "next_30_days", label: "Next 30 days", start, end };
  }

  const day = start.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + delta);
  end.setTime(start.getTime());
  end.setDate(end.getDate() + 7);
  return { key: "this_week", label: "This week", start, end };
};

const toIsoDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const buildFunctionBase = (event = {}) => `${getBaseUrl(event).replace(/\/+$/, "")}/.netlify/functions`;

const fetchListingsSnapshot = async (event) => {
  const response = await fetchWithTimeout(`${buildFunctionBase(event)}/listings?limit=80`, { method: "GET" }, 20_000);
  if (!response.ok) {
    throw new Error("Unable to load listing snapshot.");
  }

  const payload = parseJson(await response.text());
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results
    .map((item) => ({
      id: sanitizeString(item?._id || item?.id || item?.listingId, 120),
      title: sanitizeString(item?.title || item?.nickname, 220),
      city: sanitizeString(item?.city || item?.address?.city, 120),
      bedrooms: firstNumber(item?.bedrooms),
      accommodates: firstNumber(item?.accommodates),
      active: item?.active !== false,
    }))
    .filter((item) => item.id && item.title);
};

const encodeGuestyQuery = (query = {}) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === "") return;
    if (typeof value === "object") {
      params.set(key, JSON.stringify(value));
      return;
    }
    params.set(key, String(value));
  });
  return params.toString();
};

const getReservationTotal = (reservation = {}) =>
  firstNumber(
    reservation?.money?.totalPaid,
    reservation?.money?.totalPaid?.amount,
    reservation?.money?.total,
    reservation?.money?.total?.amount,
    reservation?.money?.hostPayout,
    reservation?.financials?.revenue,
    reservation?.totalPrice,
    reservation?.invoice?.total,
  ) || 0;

const getReservationCurrency = (reservation = {}) =>
  sanitizeString(
    reservation?.money?.currency ||
      reservation?.money?.totalPaid?.currency ||
      reservation?.money?.total?.currency ||
      reservation?.financials?.currency ||
      "USD",
    10,
  ).toUpperCase();

const sanitizeReservation = (reservation = {}, listingsById = new Map()) => {
  const propertyId = sanitizeString(
    reservation?.listing?._id || reservation?.listingId || reservation?.listing?._id || "",
    120,
  );
  const propertyFallback = listingsById.get(propertyId);

  return {
    id: sanitizeString(reservation?._id || reservation?.id, 120),
    confirmationCode: sanitizeString(reservation?.confirmationCode || reservation?.number, 120),
    status: sanitizeString(reservation?.status, 80),
    guestName: sanitizeString(
      reservation?.guest?.fullName ||
        `${sanitizeString(reservation?.guest?.firstName, 120)} ${sanitizeString(reservation?.guest?.lastName, 120)}` ||
        reservation?.guest?.email,
      220,
    ),
    propertyId,
    propertyName: sanitizeString(reservation?.listing?.title || propertyFallback?.title, 220),
    checkIn: sanitizeString(reservation?.checkInDateLocalized || reservation?.checkIn, 40),
    checkOut: sanitizeString(reservation?.checkOutDateLocalized || reservation?.checkOut, 40),
    total: getReservationTotal(reservation),
    currency: getReservationCurrency(reservation),
  };
};

// LA Plaza is the one property that intentionally stays on Guesty; every
// other live property has migrated to Apaleo. Both PMS's reservations are
// fetched and merged so the snapshot covers the whole portfolio instead of
// just whichever system happens to match.
const fetchGuestyReservationsSnapshot = async ({ range, propertyId, listingsById }) => {
  const filters = [
    {
      operator: "$gte",
      field: "checkInDateLocalized",
      value: toIsoDate(range.start),
    },
    {
      operator: "$lt",
      field: "checkInDateLocalized",
      value: toIsoDate(range.end),
    },
  ];

  if (propertyId) {
    filters.push({
      operator: "$eq",
      field: "listingId",
      value: propertyId,
    });
  }

  const qs = encodeGuestyQuery({
    query: {
      filters,
      sort: "-checkInDateLocalized",
      skip: 0,
      limit: 40,
    },
  });

  const payload = await guestyRequest(`/reservations?${qs}`);
  const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.data) ? payload.data : [];
  return results.map((item) => sanitizeReservation(item, listingsById));
};

const getApaleoReservationTotal = (raw = {}) =>
  firstNumber(
    raw?.totalGrossAmount?.amount,
    raw?.financeInformation?.totalGrossAmount?.amount,
    raw?.balance?.grossAmount,
  ) || 0;

const getApaleoReservationCurrency = (raw = {}) =>
  sanitizeString(
    raw?.totalGrossAmount?.currency || raw?.financeInformation?.totalGrossAmount?.currency || "EUR",
    10,
  ).toUpperCase();

const sanitizeApaleoReservation = (reservation = {}, listingsById = new Map()) => {
  const propertyFallback = listingsById.get(reservation.propertyId);
  return {
    id: sanitizeString(reservation.id, 120),
    confirmationCode: sanitizeString(reservation.confirmationNumber || reservation.id, 120),
    status: sanitizeString(reservation.status, 80),
    guestName: sanitizeString(reservation.guestName, 220),
    propertyId: sanitizeString(reservation.propertyId, 120),
    propertyName: sanitizeString(reservation.unitGroupName || propertyFallback?.title, 220),
    checkIn: sanitizeString(reservation.checkIn, 40),
    checkOut: sanitizeString(reservation.checkOut, 40),
    total: getApaleoReservationTotal(reservation.raw),
    currency: getApaleoReservationCurrency(reservation.raw),
    provider: "apaleo",
  };
};

const fetchApaleoReservationsSnapshot = async ({ range, propertyId, listingsById }) => {
  const upstreamQuery = {
    from: `${toIsoDate(range.start)}T00:00:00Z`,
    to: `${toIsoDate(range.end)}T00:00:00Z`,
    dateFilter: "Arrival",
    pageSize: 40,
    ...(propertyId ? { propertyIds: [propertyId] } : {}),
  };

  const { results } = await listApaleoReservationsWithDebug({ query: upstreamQuery });
  return results.map((item) => sanitizeApaleoReservation(item, listingsById));
};

// Fetches both PMS's in parallel and keeps whichever side succeeds — one
// provider being down (or a property simply not existing on that provider)
// shouldn't blank out the other provider's real data.
const fetchReservationsSnapshot = async ({ range, propertyId, listingsById }) => {
  const [guestyOutcome, apaleoOutcome] = await Promise.allSettled([
    fetchGuestyReservationsSnapshot({ range, propertyId, listingsById }),
    fetchApaleoReservationsSnapshot({ range, propertyId, listingsById }),
  ]);

  const reservations = [];
  const issues = [];

  if (guestyOutcome.status === "fulfilled") {
    reservations.push(...guestyOutcome.value);
  } else {
    issues.push(`Guesty: ${sanitizeString(guestyOutcome.reason?.message || "unavailable", 160)}`);
  }

  if (apaleoOutcome.status === "fulfilled") {
    reservations.push(...apaleoOutcome.value);
  } else {
    issues.push(`Apaleo: ${sanitizeString(apaleoOutcome.reason?.message || "unavailable", 160)}`);
  }

  reservations.sort((a, b) => String(b.checkIn || "").localeCompare(String(a.checkIn || "")));

  return { reservations, issues };
};

const buildSnapshot = async ({ event, rangeKey = "this_week", propertyId = "" }) => {
  const range = resolveTimeRange(rangeKey);
  const listings = await fetchListingsSnapshot(event);
  const listingsById = new Map(listings.map((item) => [item.id, item]));
  const filteredListings = propertyId ? listings.filter((item) => item.id === propertyId) : listings;

  let reservations = [];
  let syncStatus = { ok: true, message: "Live Apaleo + Guesty data is available." };

  try {
    const snapshot = await fetchReservationsSnapshot({ range, propertyId, listingsById });
    reservations = snapshot.reservations;
    if (snapshot.issues.length) {
      syncStatus = {
        ok: reservations.length > 0,
        message: `Partial reservation data — ${snapshot.issues.join("; ")}`,
      };
    }
  } catch (error) {
    syncStatus = {
      ok: false,
      message: sanitizeString(error?.message || "Reservation data is currently unavailable.", 240),
    };
  }

  const currency = reservations[0]?.currency || "USD";
  const projectedRevenue = reservations.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const confirmedReservations = reservations.filter((item) =>
    /confirmed|reserved|booked/i.test(String(item.status || "")),
  ).length;
  const upcomingCheckIns = reservations.filter((item) => item.checkIn).length;
  const propertyOptions = listings
    .map((item) => ({
      value: item.id,
      label: item.title,
    }))
    .slice(0, 100);

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      range: range.key,
      rangeLabel: range.label,
      propertyId: sanitizeString(propertyId, 120),
    },
    syncStatus,
    stats: {
      totalReservations: reservations.length,
      confirmedReservations,
      upcomingCheckIns,
      projectedRevenue,
      currency,
      listingCount: filteredListings.length,
      cityCount: new Set(filteredListings.map((item) => item.city).filter(Boolean)).size,
    },
    reservations: reservations.slice(0, 10),
    listings: filteredListings.slice(0, 10),
    propertyOptions,
  };
};

// Building-level facts (address, floor plans, amenities) compiled from the
// live listings table — see src/data/propertyProfiles.js. Distinct from the
// Apaleo/Guesty reservations snapshot above: that's booking activity,
// this is static inventory facts, so admins can ask "does the Fashion
// District have parking" without it being mistaken for a booking question.
const buildPropertyDirectoryText = () =>
  propertyProfiles
    .map((property) => {
      const floorPlanLines = (property.floorPlans || [])
        .map((plan) => {
          const specs = [
            Number.isFinite(plan.bedrooms) && `${plan.bedrooms}bd`,
            Number.isFinite(plan.bathrooms) && `${plan.bathrooms}ba`,
            Number.isFinite(plan.accommodates) && `sleeps ${plan.accommodates}`,
          ]
            .filter(Boolean)
            .join("/");
          return `${plan.title} (${specs}${Number.isFinite(plan.units) ? `, ${plan.units} units` : ""})`;
        })
        .join("; ");
      return [
        `${property.areaLabel}, ${property.city} — ${property.address}`,
        `  Units: ${property.totalUnits} across ${(property.floorPlans || []).length} floor plans`,
        `  Floor plans: ${floorPlanLines || "none listed"}`,
        `  Amenities: ${(property.amenities || []).join(", ") || "none listed"}`,
      ].join("\n");
    })
    .join("\n\n");

const buildSnapshotText = (snapshot = {}) => {
  const stats = snapshot?.stats || {};
  const reservations = Array.isArray(snapshot?.reservations) ? snapshot.reservations : [];
  const listings = Array.isArray(snapshot?.listings) ? snapshot.listings : [];

  return [
    `Snapshot generated: ${sanitizeString(snapshot?.generatedAt, 80)}`,
    `Time range: ${sanitizeString(snapshot?.filters?.rangeLabel, 80)}`,
    `Sync status: ${sanitizeString(snapshot?.syncStatus?.message, 240)}`,
    `Reservations in range: ${Number(stats.totalReservations || 0)}`,
    `Confirmed reservations: ${Number(stats.confirmedReservations || 0)}`,
    `Upcoming check-ins: ${Number(stats.upcomingCheckIns || 0)}`,
    `Projected revenue: ${formatCurrency(stats.projectedRevenue, stats.currency || "USD")}`,
    `Listings in scope: ${Number(stats.listingCount || 0)}`,
    "",
    "Recent reservations:",
    reservations.length
      ? reservations
          .map(
            (item) =>
              `- ${item.propertyName || "Property"} | ${item.guestName || item.confirmationCode || item.id} | ${item.status || "Unknown"} | ${item.checkIn || "Unknown"} to ${item.checkOut || "Unknown"} | ${formatCurrency(item.total, item.currency || stats.currency || "USD")}`,
          )
          .join("\n")
      : "- No reservation rows available.",
    "",
    "Listings in scope:",
    listings.length
      ? listings
          .map(
            (item) =>
              `- ${item.title} (${item.city || "Unknown city"})${item.bedrooms ? ` | ${item.bedrooms} bd` : ""}${item.accommodates ? ` | ${item.accommodates} guests` : ""}`,
          )
          .join("\n")
      : "- No listings available.",
    "",
    "Property directory — address, floor plans, and amenities for every building (not booking data):",
    buildPropertyDirectoryText(),
  ].join("\n");
};

// "parking" is deliberately not in this list — PARKING_QUESTION_PATTERN below
// answers it from the authoritative per-unit has_parking/parking_instructions
// data instead of this building-level static directory.
const AMENITY_KEYWORDS = [
  { label: "a pool", pattern: /\bpool\b/i, valuePattern: /\bpool\b/ },
  { label: "a gym", pattern: /\b(gym|fitness)\b/i, valuePattern: /\b(gym|fitness)\b/ },
  { label: "a washer", pattern: /\bwasher\b/i, valuePattern: /\bwasher\b/ },
  { label: "a dryer", pattern: /\bdryer\b/i, valuePattern: /\bdryer\b/ },
  { label: "pets allowed", pattern: /\bpets?\b/i, valuePattern: /\bpets? allowed\b/ },
  { label: "air conditioning", pattern: /\b(air conditioning|a\/c|ac)\b/i, valuePattern: /\bair conditioning\b/ },
];

// Wi-Fi/door-lock credentials live in property_access_secrets, keyed off
// properties.id — never bulk-loaded into the prompt like the public property
// directory above. Fetched on demand, scoped to the one Guesty listing the
// admin has selected in the property filter, only when the question asks
// for them.
const ACCESS_QUESTION_PATTERN = /\b(wi-?fi|wireless network|network password|door\s*code|door\s*lock|lock\s*code|lock\s*box|keypad|access code|gate code|entry code|pass\s*code|pin\s*code)\b/i;
const ACCESS_SECRETS_SELECT = "room_label,wifi_network,wifi_password,door_lock_type,door_code,notes";

const resolvePropertyRowId = async (guestyListingId) => {
  const id = sanitizeString(guestyListingId, 120);
  if (!id) return "";
  const listingRows = await supabaseRestRequest("listings", {
    query: { select: "property_id", id: `eq.${id}`, limit: 1 },
  });
  return listingRows?.[0]?.property_id || "";
};

// A listing can map to several physical rooms pooled under one Guesty
// record (see property-admin.js) — room_label "" is the single-room case,
// anything else names one of several rooms sharing this listing.
const fetchAccessSecretsForListing = async (guestyListingId) => {
  const propertyRowId = await resolvePropertyRowId(guestyListingId);
  if (!propertyRowId) return [];

  const secretRows = await supabaseRestRequest("property_access_secrets", {
    query: { select: ACCESS_SECRETS_SELECT, property_id: `eq.${propertyRowId}`, order: "room_label.asc", limit: 50 },
  });
  return Array.isArray(secretRows) ? secretRows : [];
};

const ADDRESS_QUESTION_PATTERN = /\b(address|located|location|where is|directions?)\b/i;

const fetchPropertyAddressForListing = async (guestyListingId) => {
  const propertyRowId = await resolvePropertyRowId(guestyListingId);
  if (!propertyRowId) return null;

  const rows = await supabaseRestRequest("properties", {
    query: { select: "name,address,city,country", id: `eq.${propertyRowId}`, limit: 1 },
  });
  return rows?.[0] || null;
};

const CAPACITY_QUESTION_PATTERN =
  /\b(accommodate|accommodates|capacity|how many (guests?|people|persons?)|sleeps?|bedrooms?|bathrooms?|baths?|beds?|max guests?|guest count)\b/i;

const fetchListingSpecsForListing = async (guestyListingId) => {
  const id = sanitizeString(guestyListingId, 120);
  if (!id) return null;

  const rows = await supabaseRestRequest("listings", {
    query: { select: "title,accommodates,bedrooms,bathrooms,beds", id: `eq.${id}`, limit: 1 },
  });
  return rows?.[0] || null;
};

const buildSpecsText = (listing, listingTitle = "") => {
  const label = listingTitle || "the selected property";
  if (!listing) return `No unit specs are on file for ${label}.`;

  // PostgREST returns Postgres numeric columns (bathrooms) as strings to
  // avoid float precision loss — coerce everything before comparing.
  const accommodates = Number(listing.accommodates);
  const bedrooms = Number(listing.bedrooms);
  const bathrooms = Number(listing.bathrooms);
  const beds = Number(listing.beds);

  const parts = [
    `Unit: ${listing.title || label}`,
    Number.isFinite(accommodates) && accommodates > 0 && `Guest capacity: ${accommodates}`,
    Number.isFinite(bedrooms) && bedrooms > 0 && `Bedrooms: ${bedrooms}`,
    Number.isFinite(bathrooms) && bathrooms > 0 && `Bathrooms: ${bathrooms}`,
    Number.isFinite(beds) && beds > 0 && `Beds: ${beds}`,
  ].filter(Boolean);
  return parts.join(" | ");
};

const buildAddressText = (property, listingTitle = "") => {
  const label = listingTitle || "the selected property";
  if (!property?.address) return `No address is on file for ${label}.`;
  // Guesty-sourced addresses already read as complete ("123 Main St, 90013
  // Los Angeles, United States"), so don't re-append city/country on top.
  return `Address for ${property.name || label}: ${property.address}.`;
};

// Security deposit — a policy fact like address/specs, not an access secret,
// so it's freely revealed rather than gated behind "only if explicitly
// asked" the way door codes/Wi-Fi are. Lives in property_access_secrets
// alongside those fields (same per-property row), not the separate
// security_deposits table that netlify/functions/_shared/securityDepositService.js
// uses for the live guest checkout — that one prices by country + bedroom
// count and is unrelated to this per-building admin lookup.
const DEPOSIT_QUESTION_PATTERN = /\b(deposit|security deposit|damage deposit|refundable deposit)\b/i;

const fetchDepositForListing = async (guestyListingId) => {
  const propertyRowId = await resolvePropertyRowId(guestyListingId);
  if (!propertyRowId) return null;

  const rows = await supabaseRestRequest("property_access_secrets", {
    query: { select: "deposit_amount,deposit_currency", property_id: `eq.${propertyRowId}`, limit: 1 },
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.deposit_amount != null ? row : null;
};

const buildDepositText = (depositRow, listingTitle = "") => {
  const label = listingTitle || "the selected property";
  if (!depositRow) return `No security deposit amount is on file for ${label}.`;
  const amount = Number(depositRow.deposit_amount);
  const currency = sanitizeString(depositRow.deposit_currency, 10) || "";
  if (!Number.isFinite(amount)) return `No security deposit amount is on file for ${label}.`;
  return `Security deposit for ${label}: ${currency} ${amount}.`;
};

// hasParking (properties.has_parking) is the same guest-facing yes/no flag
// the public chatbot reads — never sensitive. The exact space/level lives in
// parking_instructions on property_access_secrets, admin-only, same as
// Wi-Fi/door codes/deposit above — the guest chatbot has no code path to it.
const PARKING_QUESTION_PATTERN = /\b(parking|park my car|parking space|parking spot|parking instructions|garage)\b/i;

const fetchParkingForListing = async (guestyListingId) => {
  const propertyRowId = await resolvePropertyRowId(guestyListingId);
  if (!propertyRowId) return null;

  const [propertyRows, secretRows] = await Promise.all([
    supabaseRestRequest("properties", {
      query: { select: "has_parking", id: `eq.${propertyRowId}`, limit: 1 },
    }),
    supabaseRestRequest("property_access_secrets", {
      query: { select: "parking_instructions", property_id: `eq.${propertyRowId}`, limit: 1 },
    }),
  ]);

  return {
    hasParking: Boolean(propertyRows?.[0]?.has_parking),
    instructions: sanitizeString(secretRows?.[0]?.parking_instructions, 2000),
  };
};

const buildParkingText = (parking, listingTitle = "") => {
  const label = listingTitle || "the selected property";
  if (!parking) return `No parking information is on file for ${label}.`;
  if (!parking.hasParking) return `${label} is not marked as having parking.`;
  return parking.instructions
    ? `${label} has parking. Instructions: ${parking.instructions}`
    : `${label} has parking, but no specific space/level instructions are on file.`;
};

const normalizeForMatch = (value = "") => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// Generic connector/domain words that must never count as a property-identifying
// token, even when one happens to appear literally inside a nickname (e.g.
// "KRIBB UNIT 402 SEPT" contains the word "unit", which would otherwise let it
// steal a point from every other Kribb nickname on any question phrased "...
// unit 502" — see matchPropertyInText). Kept in sync with the domain words
// ACCESS_QUESTION_PATTERN/ADDRESS_QUESTION_PATTERN/CAPACITY_QUESTION_PATTERN
// look for, plus common English filler.
const MATCH_STOPWORDS = new Set([
  "the", "is", "are", "for", "of", "to", "at", "in", "on", "and", "or", "what", "whats",
  "tell", "me", "please", "can", "you", "give", "get", "unit", "units", "room", "rooms",
  "code", "codes", "door", "doors", "lock", "locks", "box", "boxes", "passcode", "password",
  "wifi", "wireless", "network", "pin", "access", "gate", "entry", "keypad",
]);

// Fully splits into atomic alnum runs — both on non-alnum separators and on
// letter/digit boundaries ("KIEV4" -> "kiev", "4"; "LANGE103" -> "lange",
// "103") — so a nickname's own internal identity (building prefix, unit
// number) is available as separate tokens regardless of how it's punctuated
// or concatenated. Alpha runs under 2 chars are noise ("a"/"b" from "A & B")
// and dropped; digit runs are kept even at 1 char since a lone digit can be a
// real building suffix ("LANGE5" -> "5").
const tokensForMatch = (value = "") => {
  const words = String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const tokens = new Set();
  words.forEach((word) => {
    word.split(/(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/).forEach((part) => {
      if (MATCH_STOPWORDS.has(part)) return;
      if (/^[0-9]+$/.test(part) || part.length >= 2) tokens.add(part);
    });
  });
  return [...tokens];
};

// A nickname token counts as satisfied by the question either verbatim, or
// via a prefix relationship (3+ chars) in either direction — this is what
// lets an internal abbreviation like "kiev" (from nickname "KIEV4") match a
// question that spells the street out in full ("Kievitstraat"), without
// letting short/noisy prefixes ("an" vs "antwerpen") count.
const isTokenSatisfied = (token, queryTokenList) =>
  queryTokenList.some((queryToken) => queryToken === token
    || (token.length >= 3 && queryToken.startsWith(token))
    || (queryToken.length >= 3 && token.startsWith(queryToken)));

// Admins naturally type the internal nickname ("A & B 311") rather than pick
// from the property filter first, and follow-up questions ("what's the
// wifi for that unit") naturally omit the name entirely once it's already
// been established earlier in the conversation. fetchListingNicknames +
// matchPropertyInText separate the one Supabase fetch from the matching so
// resolvePropertyFromConversation can check the current question AND recent
// chat history without re-querying per message.
const fetchListingNicknames = async () => {
  try {
    const rows = await supabaseRestRequest("listings", {
      query: { select: "id,nickname:metadata->>nickname", limit: 500 },
    });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

// Several buildings share a "Lange..." prefix (LANGE, LANGE5, LANGE KIEV4),
// so a naive "some/enough nickname tokens appear somewhere in the query"
// check is unsafe here: it would let a short, generic nickname like
// "LANGE 101" win against a question that actually named a different, more
// specific building ("Lange Kievitstraat 4 unit 101") just because "lange"
// and "101" both happen to appear in both. Since this feeds door/lock codes,
// a wrong silent match is worse than no match — so a candidate only counts
// as matched once EVERY one of its own tokens is accounted for in the
// question (an exact/contiguous match always outranks that), and among
// candidates that fully match, the one with the most tokens (most specific)
// wins; a tie is treated as ambiguous (no match) rather than guessed.
const CONTIGUOUS_MATCH_SCORE_BONUS = 1000;

// Marketing/colloquial building names admins may use instead of the internal
// nickname prefix — e.g. Lange Leemstraat 5's listings are internally
// "LANGE5 ...", but staff know the building as "Near Antwerp Central". Maps
// a phrase to the extra token(s) it should contribute to the query's token
// list, so it can help satisfy a LANGE5-prefixed nickname's own coverage
// requirement without letting it match anything else (each candidate still
// needs its own specific unit-number token to actually be present).
const BUILDING_NAME_ALIASES = [
  { pattern: /near\s+antwerp\s+central/i, tokens: ["lange", "5"] },
];

const matchPropertyInText = (text, nicknameRows) => {
  const normalizedQuery = normalizeForMatch(text);
  if (!normalizedQuery) return null;
  const queryTokenList = tokensForMatch(text);
  BUILDING_NAME_ALIASES.forEach(({ pattern, tokens }) => {
    if (pattern.test(text)) queryTokenList.push(...tokens);
  });

  let best = null;
  let bestScore = 0;
  let bestScoreIsTied = false;
  nicknameRows.forEach((row) => {
    const normalizedNickname = normalizeForMatch(row?.nickname);
    if (normalizedNickname.length < 3) return;

    let score;
    if (normalizedQuery.includes(normalizedNickname)) {
      // Fast path: nickname appears verbatim ("A&B 311", "KRIBB502") — always
      // wins over a fuzzy token match; longer/more specific nickname wins ties.
      score = CONTIGUOUS_MATCH_SCORE_BONUS + normalizedNickname.length;
    } else {
      // Fallback: every one of the nickname's own tokens must be satisfied
      // somewhere in the question (exact or prefix), even with other words in
      // between — e.g. nickname "KRIBB 502" against "passcode for Kribb unit
      // 502", where "unit" breaks the contiguous match above.
      const nicknameTokens = tokensForMatch(row?.nickname);
      const fullyCovered = nicknameTokens.length >= 2
        && nicknameTokens.every((token) => isTokenSatisfied(token, queryTokenList));
      if (!fullyCovered) return;
      score = nicknameTokens.length;
    }

    if (score > bestScore) {
      best = { id: sanitizeString(row.id, 120), label: sanitizeString(row.nickname, 220) };
      bestScore = score;
      bestScoreIsTied = false;
    } else if (score === bestScore) {
      bestScoreIsTied = true;
    }
  });
  return bestScoreIsTied ? null : best;
};

// Checks the current question first, then walks recent chat history
// (newest first, either role) so a follow-up like "what's the wifi for
// that unit" resolves to whichever property was named earlier in the
// same conversation.
const resolvePropertyFromConversation = async (query, messages = []) => {
  const nicknameRows = await fetchListingNicknames();
  if (!nicknameRows.length) return null;

  const direct = matchPropertyInText(query, nicknameRows);
  if (direct) return direct;

  const priorTexts = [...messages].reverse().map((message) => message?.content);
  for (const text of priorTexts) {
    const match = matchPropertyInText(text, nicknameRows);
    if (match) return match;
  }
  return null;
};

const buildAccessSecretsText = (secretsRows, listingTitle = "") => {
  const label = listingTitle || "the selected property";
  const rows = Array.isArray(secretsRows) ? secretsRows : [];
  if (!rows.length) return `No Wi-Fi/door-lock access details are on file for ${label}.`;

  const formatRoom = (secrets) => {
    const lines = [];
    if (secrets.wifi_network || secrets.wifi_password) {
      lines.push(`  Wi-Fi: ${secrets.wifi_network || "(network name not set)"} / ${secrets.wifi_password || "(password not set)"}`);
    }
    if (secrets.door_lock_type || secrets.door_code) {
      lines.push(`  Door lock: ${secrets.door_lock_type || "(lock type not set)"} — code ${secrets.door_code || "(not set)"}`);
    }
    if (secrets.notes) lines.push(`  Notes: ${sanitizeString(secrets.notes, 600)}`);
    if (!lines.length) lines.push("  No Wi-Fi or door-lock fields have been filled in yet.");
    return lines.join("\n");
  };

  if (rows.length === 1 && !rows[0].room_label) {
    return [`Access details for ${label} (admin-only — never share with guests over unverified channels):`, formatRoom(rows[0])].join("\n");
  }

  return [
    `Access details for ${label} — this listing covers ${rows.length} rooms (admin-only — never share with guests over unverified channels):`,
    ...rows.map((secrets) => [`Room ${secrets.room_label || "(unlabeled)"}:`, formatRoom(secrets)].join("\n")),
  ].join("\n\n");
};

const formatHistory = (messages = []) =>
  messages.map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.content}`).join("\n");

const extractOutputText = (payload) => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) return "";
  const parts = [];

  payload.output.forEach((item) => {
    if (!Array.isArray(item?.content)) return;
    item.content.forEach((contentPart) => {
      if (contentPart?.type === "output_text" && typeof contentPart.text === "string") {
        parts.push(contentPart.text);
        return;
      }

      if (contentPart?.type === "text") {
        if (typeof contentPart.text === "string") parts.push(contentPart.text);
        else if (typeof contentPart.text?.value === "string") parts.push(contentPart.text.value);
      }
    });
  });

  return parts.join("\n").trim();
};

// Mirrors the guest chatbot's fallback behavior: if the AI layer is down,
// answer from data silently rather than surfacing a technical error to
// whoever's reading the chat.
const buildDeterministicFallbackAnswer = ({
  query = "",
  snapshot = {},
  accessSecretsText = "",
  addressText = "",
  specsText = "",
  depositText = "",
  parkingText = "",
}) => {
  const normalizedQuery = sanitizeString(query, 400).toLowerCase();
  const stats = snapshot?.stats || {};
  const rangeLabel = sanitizeString(snapshot?.filters?.rangeLabel || "the selected range", 80);
  const revenue = formatCurrency(stats.projectedRevenue, stats.currency || "USD");
  const reservations = Number(stats.totalReservations || 0);
  const confirmed = Number(stats.confirmedReservations || 0);
  const checkIns = Number(stats.upcomingCheckIns || 0);
  const syncMessage = sanitizeString(snapshot?.syncStatus?.message || "", 240);

  const amenityMatch = AMENITY_KEYWORDS.find((entry) => entry.pattern.test(normalizedQuery));
  if (amenityMatch) {
    const withIt = propertyProfiles.filter((property) =>
      (property.amenities || []).some((amenity) => amenityMatch.valuePattern.test(amenity.toLowerCase())),
    );
    if (!withIt.length) {
      return `None of the buildings in the property directory list "${amenityMatch.label}" as an amenity.`;
    }
    return (
      `Buildings with ${amenityMatch.label}: ` +
      withIt.map((property) => `${property.areaLabel} (${property.city})`).join(", ") +
      "."
    );
  }

  if (ACCESS_QUESTION_PATTERN.test(normalizedQuery)) {
    return accessSecretsText || "No Wi-Fi/door-lock details are available for this request — select a specific property first.";
  }

  if (ADDRESS_QUESTION_PATTERN.test(normalizedQuery)) {
    return addressText || "No address is available for this request — select a specific property first.";
  }

  if (CAPACITY_QUESTION_PATTERN.test(normalizedQuery)) {
    return specsText || "No unit specs are available for this request — select a specific property first.";
  }

  if (DEPOSIT_QUESTION_PATTERN.test(normalizedQuery)) {
    return depositText || "No deposit amount is available for this request — select a specific property first.";
  }

  if (PARKING_QUESTION_PATTERN.test(normalizedQuery)) {
    return parkingText || "No parking information is available for this request — select a specific property first.";
  }

  if (/(revenue|sales|income|earned)/i.test(normalizedQuery)) {
    return (
      `For ${rangeLabel}, projected revenue is ${revenue} across ${reservations} reservations.` +
      (syncMessage ? ` ${syncMessage}` : "")
    );
  }

  if (/(booking|bookings|reservation|reservations)/i.test(normalizedQuery)) {
    return (
      `For ${rangeLabel}, there are ${reservations} reservations, ${confirmed} confirmed bookings, and ${checkIns} upcoming check-ins.` +
      (syncMessage ? ` ${syncMessage}` : "")
    );
  }

  return (
    "I could not complete a full AI reply right now, but the current executive snapshot is still available in the panel." +
    (syncMessage ? ` ${syncMessage}` : "")
  );
};

const createAssistantReply = async ({ query, messages, snapshot, accessSecretsText = "", depositText = "", parkingText = "" }) => {
  const apiKey = sanitizeString(getEnv("OPENAI_API_KEY"), 500);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const model = sanitizeString(getEnv("OPENAI_EXECUTIVE_OLS_MODEL") || "gpt-5-mini", 120);
  const input = [
    "Executive question:",
    sanitizeString(query, 1200),
    "",
    "Recent chat:",
    formatHistory(messages) || "No prior messages.",
    "",
    "Apaleo/Guesty-backed snapshot:",
    buildSnapshotText(snapshot),
    ...(accessSecretsText ? ["", "Access details (Wi-Fi/door-lock — only reveal if explicitly asked):", accessSecretsText] : []),
    ...(depositText ? ["", "Security deposit:", depositText] : []),
    ...(parkingText ? ["", "Parking (admin-only — do not reveal the specific space/level to guests if drafting guest-facing text):", parkingText] : []),
  ].join("\n");

  const instructions = `
You are the OneLuxStay Executive Assistant.

Rules:
- Answer using only the supplied Apaleo/Guesty-backed snapshot and the property directory below it.
- The snapshot covers booking activity (reservations, revenue, check-ins) for the selected time range, pulled live from Apaleo (most properties) and Guesty (LA Plaza).
- The property directory covers static building facts (address, floor plans, amenities) across all cities — use it for questions like "what amenities does the Fashion District have" or "how many units do we have in Los Angeles," regardless of the selected time range or property filter.
- Be concise, direct, and useful for leadership.
- If the data is missing or sync is unavailable, say that clearly.
- When useful, provide short recommendations or next steps.
- You may draft professional guest or internal messages when asked.
- Never invent figures, reservations, or property facts.
- Only reveal Wi-Fi passwords or door codes when an "Access details" section is supplied above and the question asks for them. Never guess or fabricate a password or code. If the admin asks for access details but no "Access details" section is supplied, tell them to select a specific property in the property filter first.
- If an "Access details" section includes a "Notes" line for the property, always state it in the same reply as the lock/door code, every time — it is operational usage guidance (e.g. what to do if the code is mistyped), not optional context. Never give a door/lock code without also giving its notes when notes are present.
- If a "Security deposit" section is supplied above and the question asks about a deposit, state that exact amount and currency. Never guess or convert currency yourself. This is a separate, per-property figure from any general deposit policy you might otherwise assume — always prefer the supplied figure over general knowledge. If the admin asks about a deposit but no "Security deposit" section is supplied, tell them to select a specific property in the property filter first.
- If a "Parking" section is supplied above and the question asks about parking, state whether the property has parking and, if it does, the exact space/level instructions supplied. Never guess or fabricate a space number. If you draft any message intended for a guest, only say parking is/isn't available — never include the specific space or level, that detail is admin-only.
`.trim();

  const response = await fetchWithTimeout(
    OPENAI_RESPONSES_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        max_output_tokens: 900,
      }),
    },
    30_000,
  );

  const payload = parseJson(await response.text());
  if (!response.ok) {
    // Masked prefix only (never the full key) so the real cause is visible
    // in Netlify function logs without exposing the secret.
    console.error("[executive-ols-assistant] OpenAI request failed", {
      status: response.status,
      model,
      apiKeyPrefix: apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)} (len ${apiKey.length})` : "MISSING",
      error: payload?.error,
    });
    throw new Error(payload?.error?.message || `OpenAI request failed (${response.status})`);
  }

  return sanitizeString(extractOutputText(payload), 6000);
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: getHeaders(event),
      body: "",
    };
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, event);
  }

  try {
    const access = enforceExecutiveAccess(await verifyAdminsOlsAccess(event));
    const payload =
      event.httpMethod === "POST"
        ? parseJson(event.body || "{}")
        : event.queryStringParameters || {};

    const range = sanitizeString(payload?.range, 40) || "this_week";
    const propertyId = sanitizeString(payload?.propertyId, 120);
    const snapshot = await buildSnapshot({
      event,
      rangeKey: range,
      propertyId,
    });

    if (event.httpMethod === "GET") {
      return jsonResponse(200, { ok: true, snapshot }, event);
    }

    const query = sanitizeString(payload?.query, 1200);
    if (!query) {
      return jsonResponse(400, { error: "Query is required." }, event);
    }

    const messages = sanitizeMessages(payload?.messages);

    const needsAccessDetails = ACCESS_QUESTION_PATTERN.test(query);
    const needsAddress = ADDRESS_QUESTION_PATTERN.test(query);
    const needsSpecs = CAPACITY_QUESTION_PATTERN.test(query);
    const needsDeposit = DEPOSIT_QUESTION_PATTERN.test(query);
    const needsParking = PARKING_QUESTION_PATTERN.test(query);

    let accessSecretsText = "";
    let addressText = "";
    let specsText = "";
    let depositText = "";
    let parkingText = "";
    if (needsAccessDetails || needsAddress || needsSpecs || needsDeposit || needsParking) {
      let resolvedPropertyId = propertyId;
      let resolvedLabel = snapshot?.listings?.find((item) => item.id === propertyId)?.title || "";

      if (!resolvedPropertyId) {
        const match = await resolvePropertyFromConversation(query, messages);
        if (match) {
          resolvedPropertyId = match.id;
          resolvedLabel = match.label;
        }
      }

      if (resolvedPropertyId) {
        if (needsAccessDetails) {
          try {
            const secrets = await fetchAccessSecretsForListing(resolvedPropertyId);
            accessSecretsText = buildAccessSecretsText(secrets, resolvedLabel);
          } catch {
            accessSecretsText = "Access details lookup failed for the selected property.";
          }
        }
        if (needsAddress) {
          try {
            const property = await fetchPropertyAddressForListing(resolvedPropertyId);
            addressText = buildAddressText(property, resolvedLabel);
          } catch {
            addressText = "Address lookup failed for the selected property.";
          }
        }
        if (needsSpecs) {
          try {
            const listing = await fetchListingSpecsForListing(resolvedPropertyId);
            specsText = buildSpecsText(listing, resolvedLabel);
          } catch {
            specsText = "Unit specs lookup failed for the selected property.";
          }
        }
        if (needsDeposit) {
          try {
            const deposit = await fetchDepositForListing(resolvedPropertyId);
            depositText = buildDepositText(deposit, resolvedLabel);
          } catch {
            depositText = "Deposit lookup failed for the selected property.";
          }
        }
        if (needsParking) {
          try {
            const parking = await fetchParkingForListing(resolvedPropertyId);
            parkingText = buildParkingText(parking, resolvedLabel);
          } catch {
            parkingText = "Parking lookup failed for the selected property.";
          }
        }
      } else {
        const notFoundNotice =
          'No property is selected or recognized in the question. Ask the admin to pick a specific property from the property filter, or name the property/unit clearly (e.g. "A & B 311").';
        if (needsAccessDetails) accessSecretsText = notFoundNotice;
        if (needsAddress) addressText = notFoundNotice;
        if (needsSpecs) specsText = notFoundNotice;
        if (needsDeposit) depositText = notFoundNotice;
        if (needsParking) parkingText = notFoundNotice;
      }
    }

    let answer = "";

    try {
      answer = await createAssistantReply({
        query,
        messages,
        snapshot,
        accessSecretsText,
        depositText,
        parkingText,
      });
    } catch (error) {
      // Logged server-side only (see createAssistantReply) — never shown to
      // whoever's reading the chat, matching the guest chatbot's behavior.
      console.warn("[executive-ols-assistant] Falling back to deterministic answer", {
        reason: normalizeAssistantErrorMessage(error),
      });
    }

    if (!answer) {
      answer = buildDeterministicFallbackAnswer({
        query,
        snapshot,
        accessSecretsText,
        addressText,
        specsText,
        depositText,
        parkingText,
      });
    }

    return jsonResponse(
      200,
      {
        ok: true,
        answer,
        snapshot,
        actor: access?.user || null,
      },
      event,
    );
  } catch (error) {
    return jsonResponse(
      Number(error?.statusCode) || 500,
      { error: sanitizeString(error?.message || "Executive assistant request failed.", 500) },
      event,
    );
  }
}
