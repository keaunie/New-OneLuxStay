import dotenv from "dotenv";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import { fetchWithTimeout, getBaseUrl } from "./_shared/http.js";
import { guestyRequest } from "./_shared/guestyService.js";
import { verifyAdminsOlsAccess } from "./_shared/adminsOlsAuth.js";

dotenv.config();

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_HISTORY_MESSAGES = 8;

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizeEmail = (value = "") => sanitizeString(value, 320).toLowerCase();

const parseAllowedExecutiveEmails = () =>
  new Set(
    String(process.env.EXECUTIVE_OLS_ALLOWED_EMAILS || "")
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
  ].join("\n");
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

const buildDeterministicFallbackAnswer = ({ query = "", snapshot = {}, assistantError = "" }) => {
  const normalizedQuery = sanitizeString(query, 400).toLowerCase();
  const stats = snapshot?.stats || {};
  const rangeLabel = sanitizeString(snapshot?.filters?.rangeLabel || "the selected range", 80);
  const revenue = formatCurrency(stats.projectedRevenue, stats.currency || "USD");
  const reservations = Number(stats.totalReservations || 0);
  const confirmed = Number(stats.confirmedReservations || 0);
  const checkIns = Number(stats.upcomingCheckIns || 0);
  const syncMessage = sanitizeString(snapshot?.syncStatus?.message || "", 240);
  const helperNote = assistantError
    ? ` The AI reply layer is currently unavailable: ${sanitizeString(assistantError, 220)}.`
    : "";

  if (/(wifi|wi-fi|password|internet)/i.test(normalizedQuery)) {
    return (
      "I do not see Wi-Fi or access-code details in the current executive snapshot. " +
      "This dashboard currently has reservation and listing summary data, not property guide instructions." +
      helperNote
    );
  }

  if (/(revenue|sales|income|earned)/i.test(normalizedQuery)) {
    return (
      `For ${rangeLabel}, projected revenue is ${revenue} across ${reservations} reservations.` +
      (syncMessage ? ` ${syncMessage}` : "") +
      helperNote
    );
  }

  if (/(booking|bookings|reservation|reservations)/i.test(normalizedQuery)) {
    return (
      `For ${rangeLabel}, there are ${reservations} reservations, ${confirmed} confirmed bookings, and ${checkIns} upcoming check-ins.` +
      (syncMessage ? ` ${syncMessage}` : "") +
      helperNote
    );
  }

  return (
    "I could not complete a full AI reply right now, but the current executive snapshot is still available in the panel." +
    (syncMessage ? ` ${syncMessage}` : "") +
    helperNote
  );
};

const createAssistantReply = async ({ query, messages, snapshot }) => {
  const apiKey = sanitizeString(process.env.OPENAI_API_KEY, 500);
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const model = sanitizeString(process.env.OPENAI_EXECUTIVE_OLS_MODEL || "gpt-5-mini", 120);
  const input = [
    "Executive question:",
    sanitizeString(query, 1200),
    "",
    "Recent chat:",
    formatHistory(messages) || "No prior messages.",
    "",
    "Guesty-backed snapshot:",
    buildSnapshotText(snapshot),
  ].join("\n");

  const instructions = `
You are the OneLuxStay Executive Assistant.

Rules:
- Answer using only the supplied Guesty-backed snapshot.
- Be concise, direct, and useful for leadership.
- If the data is missing or sync is unavailable, say that clearly.
- When useful, provide short recommendations or next steps.
- You may draft professional guest or internal messages when asked.
- Never invent figures, reservations, or property facts.
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
    let answer = "";
    let assistantError = "";

    try {
      answer = await createAssistantReply({
        query,
        messages,
        snapshot,
      });
    } catch (error) {
      assistantError = normalizeAssistantErrorMessage(error);
    }

    if (!answer) {
      answer = buildDeterministicFallbackAnswer({
        query,
        snapshot,
        assistantError,
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
