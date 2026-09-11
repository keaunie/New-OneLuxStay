import dotenv from "dotenv";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import { fetchWithTimeout, getBaseUrl } from "./_shared/http.js";
import { guestyRequest } from "./_shared/guestyService.js";
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

const fetchReservationsSnapshot = async ({ range, propertyId, listingsById }) => {
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

const buildSnapshot = async ({ event, rangeKey = "this_week", propertyId = "" }) => {
  const range = resolveTimeRange(rangeKey);
  const listings = await fetchListingsSnapshot(event);
  const listingsById = new Map(listings.map((item) => [item.id, item]));
  const filteredListings = propertyId ? listings.filter((item) => item.id === propertyId) : listings;

  let reservations = [];
  let syncStatus = { ok: true, message: "Live Guesty data is available." };

  try {
    reservations = await fetchReservationsSnapshot({
      range,
      propertyId,
      listingsById,
    });
  } catch (error) {
    syncStatus = {
      ok: false,
      message: sanitizeString(error?.message || "Guesty reservation data is currently unavailable.", 240),
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
// Guesty reservations/listings snapshot above: that's booking activity,
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

const AMENITY_KEYWORDS = [
  { label: "parking", pattern: /\bparking\b/i, valuePattern: /\bparking\b/ },
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
const ACCESS_QUESTION_PATTERN = /\b(wi-?fi|wireless network|network password|door\s*code|door\s*lock|lock\s*code|keypad|access code|gate code|entry code)\b/i;
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

const normalizeForMatch = (value = "") => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

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

const matchPropertyInText = (text, nicknameRows) => {
  const normalizedQuery = normalizeForMatch(text);
  if (!normalizedQuery) return null;

  let best = null;
  let bestLength = 0;
  nicknameRows.forEach((row) => {
    const normalizedNickname = normalizeForMatch(row?.nickname);
    if (normalizedNickname.length < 3) return;
    if (normalizedQuery.includes(normalizedNickname) && normalizedNickname.length > bestLength) {
      best = { id: sanitizeString(row.id, 120), label: sanitizeString(row.nickname, 220) };
      bestLength = normalizedNickname.length;
    }
  });
  return best;
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

const createAssistantReply = async ({ query, messages, snapshot, accessSecretsText = "" }) => {
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
    "Guesty-backed snapshot:",
    buildSnapshotText(snapshot),
    ...(accessSecretsText ? ["", "Access details (Wi-Fi/door-lock — only reveal if explicitly asked):", accessSecretsText] : []),
  ].join("\n");

  const instructions = `
You are the OneLuxStay Executive Assistant.

Rules:
- Answer using only the supplied Guesty-backed snapshot and the property directory below it.
- The Guesty snapshot covers booking activity (reservations, revenue, check-ins) for the selected time range.
- The property directory covers static building facts (address, floor plans, amenities) across all cities — use it for questions like "what amenities does the Fashion District have" or "how many units do we have in Los Angeles," regardless of the selected time range or property filter.
- Be concise, direct, and useful for leadership.
- If the data is missing or sync is unavailable, say that clearly.
- When useful, provide short recommendations or next steps.
- You may draft professional guest or internal messages when asked.
- Never invent figures, reservations, or property facts.
- Only reveal Wi-Fi passwords or door codes when an "Access details" section is supplied above and the question asks for them. Never guess or fabricate a password or code. If the admin asks for access details but no "Access details" section is supplied, tell them to select a specific property in the property filter first.
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

    let accessSecretsText = "";
    let addressText = "";
    let specsText = "";
    if (needsAccessDetails || needsAddress || needsSpecs) {
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
      } else {
        const notFoundNotice =
          'No property is selected or recognized in the question. Ask the admin to pick a specific property from the property filter, or name the property/unit clearly (e.g. "A & B 311").';
        if (needsAccessDetails) accessSecretsText = notFoundNotice;
        if (needsAddress) addressText = notFoundNotice;
        if (needsSpecs) specsText = notFoundNotice;
      }
    }

    let answer = "";

    try {
      answer = await createAssistantReply({
        query,
        messages,
        snapshot,
        accessSecretsText,
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
