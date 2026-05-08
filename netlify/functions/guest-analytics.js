import dotenv from "dotenv";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";
import { buildAiCorsHeaders, verifyAiRequest } from "./_shared/aiProtection.js";

dotenv.config();

const DEFAULT_GUEST_CITY_CLICKS_TABLE = "guest_city_click_events";
const SUPPORTED_EVENT_TYPES = new Set(["city_click", "listing_click", "page_view", "search_submit"]);

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 1200) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeId = (value = "", maxLength = 120) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, maxLength);

const getHeaderValue = (event = {}, targetName = "") => {
  const target = String(targetName || "").toLowerCase();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  for (const [key, value] of Object.entries(event.multiValueHeaders || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
};

const getSourceOrigin = (event = {}) => {
  const origin = sanitizeString(getHeaderValue(event, "origin"), 240);
  if (origin) return origin;
  const referer = sanitizeString(getHeaderValue(event, "referer"), 900);
  if (!referer) return "";
  try {
    return sanitizeString(new URL(referer).origin, 240);
  } catch {
    return "";
  }
};

const getCorsHeaders = (event = {}) => buildAiCorsHeaders(event);

const jsonResponse = (statusCode, body, event, extraHeaders = {}) => ({
  statusCode,
  headers: {
    ...getCorsHeaders(event),
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const getTable = () =>
  sanitizeId(getEnv("SUPABASE_GUEST_CITY_CLICKS_TABLE") || DEFAULT_GUEST_CITY_CLICKS_TABLE, 120) ||
  DEFAULT_GUEST_CITY_CLICKS_TABLE;

const sanitizePageContext = (pageContext = {}) => ({
  pathname: sanitizeString(pageContext?.pathname, 240),
  pageType: sanitizeString(pageContext?.pageType, 80),
  city: sanitizeString(pageContext?.city, 120),
  listingId: sanitizeString(pageContext?.listingId, 120),
});

const normalizeEventType = (value = "") => {
  const normalized = sanitizeString(value, 80).toLowerCase();
  if (SUPPORTED_EVENT_TYPES.has(normalized)) return normalized;
  // Default to page_view if we have an action but no specific type, to avoid 400 errors.
  return "page_view";
};

const storeJourneyEvent = async ({ event, payload }) => {
  const eventType = normalizeEventType(payload?.eventType || (payload?.action === "track_city_click" ? "city_click" : "page_view"));
  
  const table = getTable();
  const pageContext = sanitizePageContext(payload?.pageContext);
  const city = sanitizeString(payload?.city || pageContext.city, 120);
  const listingId = sanitizeId(payload?.listingId || pageContext.listingId, 120);
  const listingTitle = sanitizeString(payload?.listingTitle, 220);

  await supabaseRestRequest(table, {
    method: "POST",
    body: [
      {
        session_id: sanitizeId(payload?.sessionId, 120) || null,
        event_type: eventType,
        city: city || null,
        listing_id: listingId || null,
        listing_title: listingTitle || null,
        destination_path: sanitizeString(payload?.destinationPath, 240) || null,
        source_section: sanitizeString(payload?.sourceSection, 120) || null,
        source_label: sanitizeString(payload?.sourceLabel, 160) || null,
        pathname: pageContext.pathname || null,
        page_type: pageContext.pageType || null,
        source_origin: getSourceOrigin(event) || null,
        user_agent: sanitizeString(getHeaderValue(event, "user-agent"), 320) || null,
        created_at: new Date().toISOString(),
      },
    ],
    prefer: "return=minimal",
    timeout: 12_000,
  });
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: getCorsHeaders(event), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, event);
  }

  const protection = verifyAiRequest(event, { endpoint: "guest_analytics" });
  if (!protection.ok) {
    return jsonResponse(
      protection.status || 403,
      { error: protection.error || "Request blocked" },
      event,
      protection.retryAfter ? { "Retry-After": String(protection.retryAfter) } : {},
    );
  }

  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, event);
  }

  let action = sanitizeString(payload?.action, 60).toLowerCase();
  if (!["track_city_click", "track_journey_event"].includes(action)) {
    // Default to track_journey_event to prevent 400 errors during dev/auth states
    action = "track_journey_event";
  }

  try {
    await storeJourneyEvent({ event, payload: { ...payload, action } });
    return jsonResponse(200, { ok: true }, event);
  } catch (error) {
    return jsonResponse(
      error?.statusCode || 500,
      { error: sanitizeString(error?.message || "Unable to store guest analytics", 300) },
      event,
    );
  }
}
