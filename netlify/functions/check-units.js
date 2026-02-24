import Stripe from "stripe";
const OPEN_API_HOST = "https://open-api.guesty.com";
const OPEN_API_V1 = "https://open-api.guesty.com/v1";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";
const CONSENT_STORE_NAME = "consent-proofs";

const jsonResponse = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const resolveFunctionPath = (event = {}) => {
  const explicitPath =
    (typeof event.path === "string" && event.path) ||
    (typeof event.rawPath === "string" && event.rawPath) ||
    "";
  let pathname = explicitPath;

  if (!pathname && typeof event.rawUrl === "string" && event.rawUrl) {
    try {
      pathname = new URL(event.rawUrl).pathname || "";
    } catch {
      pathname = event.rawUrl.split("?")[0];
    }
  }

  const clean = String(pathname || "").split("?")[0];
  const baseCandidates = [
    "/.netlify/functions/check-units",
    "/check-units",
  ];

  for (const base of baseCandidates) {
    if (clean === base) return "";
    if (clean.startsWith(`${base}/`)) {
      return clean.slice(base.length);
    }
  }

  return clean;
};

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

const toStripeAmount = (amount, currency) => {
  const normalized = (currency || "USD").toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) return Math.round(amount);
  return Math.round(amount * 100);
};

const getBaseUrl = (event) => {
  const originHeader = event.headers?.origin;
  if (originHeader) return originHeader;
  const referer = event.headers?.referer;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore
    }
  }
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host;
  if (host) return `${proto}://${host}`;
  return "https://oneluxstay.com";
};

let stripeClient;
const getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripeClient) {
    stripeClient = new Stripe(key, { apiVersion: "2023-10-16" });
  }
  return stripeClient;
};

const fetchWithTimeout = async (url, options = {}, timeout = 20000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

const getBlobStore = async (storeName = TOKEN_STORE_NAME) => {
  try {
    const { getStore } = await import("@netlify/blobs");
    const siteID = process.env.NETLIFY_SITE_ID;
    const apiToken = process.env.NETLIFY_API_TOKEN;
    return siteID && apiToken
      ? getStore(storeName, { siteID, token: apiToken })
      : getStore(storeName);
  } catch {
    return null;
  }
};

const writeConsentProof = async (sessionId, payload) => {
  if (!sessionId || !payload) return false;
  const store = await getBlobStore(CONSENT_STORE_NAME);
  if (!store) return false;
  await store.setJSON(sessionId, payload);
  return true;
};

const requestGuestyToken = async () => {
  const clientId = process.env.GUESTY_OPEN_API_CLIENT_ID;
  const clientSecret = process.env.GUESTY_OPEN_API_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing Guesty API credentials");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "open-api",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetchWithTimeout(`${OPEN_API_HOST}/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
};

const getGuestyToken = async () => {
  const now = Date.now();
  if (globalThis.GUESTY_TOKEN && globalThis.GUESTY_TOKEN_EXPIRES > now + 60_000) {
    return { token: globalThis.GUESTY_TOKEN, source: "memory" };
  }

  const store = await getBlobStore();
  if (store) {
    let cached = await store.get(TOKEN_KEY, { type: "json" });
    if (!cached) {
      const raw = await store.get(TOKEN_KEY, { type: "text" });
      cached = raw ? JSON.parse(raw) : null;
    }
    if (cached && cached.token && cached.expiresAt > now + 60_000) {
      globalThis.GUESTY_TOKEN = cached.token;
      globalThis.GUESTY_TOKEN_EXPIRES = cached.expiresAt;
      return { token: cached.token, source: "blob" };
    }
  }

  const data = await requestGuestyToken();
  const tokenData = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  if (store) {
    await store.setJSON(TOKEN_KEY, tokenData);
  }
  globalThis.GUESTY_TOKEN = tokenData.token;
  globalThis.GUESTY_TOKEN_EXPIRES = tokenData.expiresAt;
  return { token: tokenData.token, source: "fresh" };
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const toIsoDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const num = toNumber(value);
    if (num !== null) return num;
  }
  return null;
};

const enumerateDates = (start, end) => {
  const dates = [];
  const cursor = new Date(start);
  while (cursor < end) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const normalizeCalendarItems = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.listings)) return payload.listings;
  if (Array.isArray(payload?.calendars)) return payload.calendars;
  if (Array.isArray(payload)) return payload;
  if (payload?.calendars && typeof payload.calendars === "object") {
    return Object.values(payload.calendars);
  }
  if (payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return Object.values(payload.data);
  }
  return [];
};

const isDayAvailable = (day) => {
  if (!day) return false;
  if (typeof day.allotment === "number") return day.allotment > 0;
  if (typeof day.available === "boolean") return day.available;
  if (typeof day.isAvailable === "boolean") return day.isAvailable;
  if (typeof day.status === "string") return day.status === "available";
  return false;
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
    day?.money?.money?.amount
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
    day?.restrictions?.minStay
  );

  const maxNights = firstNumber(
    day?.maxNights,
    day?.maximumStay,
    day?.maxStay,
    day?.maxStayLength,
    day?.restrictions?.maxNights,
    day?.restrictions?.maxStay
  );

  return {
    date,
    price,
    currency,
    restrictions: {
      minNights,
      maxNights,
      closedToArrival: Boolean(day?.closedToArrival ?? day?.cta ?? day?.restrictions?.cta),
      closedToDeparture: Boolean(day?.closedToDeparture ?? day?.ctd ?? day?.restrictions?.ctd),
    },
    status: day?.status,
    allotment: typeof day?.allotment === "number" ? day.allotment : null,
  };
};

const handleAvailabilityBulk = async (event, token, tokenSource) => {
  const { ids = "", startDate = "", endDate = "" } = event.queryStringParameters || {};
  if (!ids || !startDate || !endDate) {
    return jsonResponse(400, { message: "Missing ids, startDate, or endDate" });
  }

  const qs = new URLSearchParams({
    listingIds: ids,
    startDate,
    endDate,
    includeAllotment: "true",
  });

  const res = await fetchWithTimeout(
    `${OPEN_API_V1}/availability-pricing/api/calendar/listings?${qs.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (res.status === 429) {
    return jsonResponse(200, {
      results: [],
      errors: [{ message: "Rate limited by Guesty" }],
      rateLimited: true,
      tokenSource,
    });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Availability bulk failed", error: await res.text() });
  }

  const payload = await res.json();
  const calendars = normalizeCalendarItems(payload);
  const dateList = enumerateDates(new Date(startDate), new Date(endDate));

  const results = calendars.map((entry) => {
    const listingId = entry?.listingId || entry?.id || entry?._id;
    const days = entry?.days || entry?.calendar || entry?.data || entry?.availability || [];
    const dayMap = new Map(
      Array.isArray(days)
        ? days.map((day) => [day?.date || day?.dateLocalized || day?.day, day])
        : []
    );
    const available = dateList.every((date) => isDayAvailable(dayMap.get(date)));
    return { id: listingId, available };
  });

  return jsonResponse(200, { results, tokenSource });
};

const handleAvailabilityQuery = async (event, token, tokenSource) => {
  const { ids = "", checkIn = "", checkOut = "", minOccupancy = "1" } =
    event.queryStringParameters || {};
  if (!ids || !checkIn || !checkOut) {
    return jsonResponse(400, { message: "Missing ids, checkIn, or checkOut" });
  }

  const available = {
    checkIn,
    checkOut,
    minOccupancy: Number(minOccupancy) || 1,
  };

  const qs = new URLSearchParams({
    ids,
    available: JSON.stringify(available),
  });

  const res = await fetchWithTimeout(`${OPEN_API_V1}/listings?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (res.status === 429) {
    return jsonResponse(200, {
      results: [],
      errors: [{ message: "Rate limited by Guesty" }],
      rateLimited: true,
      tokenSource,
    });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Availability query failed", error: await res.text() });
  }

  const payload = await res.json();
  const results = Array.isArray(payload?.results)
    ? payload.results.map((item) => ({
        id: item?._id || item?.id,
        available: true,
      }))
    : [];

  return jsonResponse(200, { results, tokenSource });
};

const handleCalendarMulti = async (event, token, tokenSource) => {
  const {
    listingIds = "",
    startDate = "",
    endDate = "",
    includeAllotment = "false",
    ignoreInactiveChildAllotment = "false",
    ignoreUnlistedChildAllotment = "false",
  } = event.queryStringParameters || {};

  if (!listingIds || !startDate || !endDate) {
    return jsonResponse(400, { message: "Missing listingIds, startDate, or endDate" });
  }

  const qs = new URLSearchParams({
    listingIds,
    startDate,
    endDate,
    includeAllotment,
    ignoreInactiveChildAllotment,
    ignoreUnlistedChildAllotment,
  });

  const res = await fetchWithTimeout(
    `${OPEN_API_V1}/availability-pricing/api/calendar/listings?${qs.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (res.status === 429) {
    return jsonResponse(200, {
      results: [],
      errors: [{ message: "Rate limited by Guesty" }],
      rateLimited: true,
      tokenSource,
    });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Calendar multi failed", error: await res.text() });
  }

  const payload = await res.json();
  const calendars = normalizeCalendarItems(payload);
  const normalizedCalendars = {};
  const normalizedList =
    calendars.length
      ? calendars
      : payload?.listingId && Array.isArray(payload?.days)
        ? [payload]
        : [];

  normalizedList.forEach((entry) => {
    const listingId = entry?.listingId || entry?.id || entry?._id;
    if (!listingId) return;
    const daysRaw = entry?.days || entry?.calendar || entry?.data || entry?.availability || [];
    const currency = entry?.currency;
    const days = Array.isArray(daysRaw)
      ? daysRaw.map((day) => normalizeCalendarDay(day, currency)).filter(Boolean)
      : [];
    normalizedCalendars[listingId] = days;
  });

  return jsonResponse(200, { ...payload, normalizedCalendars, tokenSource });
};

const handleCalendarPrices = async (event, token, tokenSource, listingId) => {
  const { startDate, endDate, months = "1" } = event.queryStringParameters || {};
  if (!listingId || !startDate) {
    return jsonResponse(400, { message: "Missing listingId or startDate" });
  }

  const start = new Date(startDate);
  const end =
    endDate ||
    toIsoDate(addMonths(start, Number.parseInt(months, 10) || 1));

  const qs = new URLSearchParams({
    startDate: toIsoDate(start),
    endDate: endDate || end,
    includeAllotment: "true",
  });

  const res = await fetchWithTimeout(
    `${OPEN_API_V1}/availability-pricing/api/calendar/listings/${listingId}?${qs.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  if (res.status === 429) {
    return jsonResponse(200, {
      listingId,
      startDate: toIsoDate(start),
      months: Number(months) || 1,
      days: [],
      errors: [{ message: "Rate limited by Guesty" }],
      rateLimited: true,
      tokenSource,
    });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Calendar pricing failed", error: await res.text() });
  }

  const payload = await res.json();
  const daysRaw =
    payload?.days ||
    payload?.calendar ||
    payload?.data?.days ||
    payload?.data?.calendar ||
    payload?.data?.results ||
    payload?.data ||
    payload?.results ||
    [];
  const currency = payload?.currency || payload?.data?.currency;
  const days = Array.isArray(daysRaw)
    ? daysRaw.map((day) => normalizeCalendarDay(day, currency)).filter(Boolean)
    : [];

  return jsonResponse(200, {
    listingId,
    startDate: toIsoDate(start),
    months: Number(months) || 1,
    days,
    errors: [],
    rateLimited: false,
    tokenSource,
  });
};

const handleQuotesBulk = async (event, token, tokenSource) => {
  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { message: "Invalid JSON payload" });
  }
  const { requests = [] } = body || {};
  if (!Array.isArray(requests) || !requests.length) {
    return jsonResponse(400, { message: "Missing quote requests" });
  }

  const quotes = requests
    .map((req) => {
      const listingId = req?.listingId;
      if (!listingId || !req?.checkInDateLocalized || !req?.checkOutDateLocalized) return null;
      const guests = Number(req?.guestsCount) || 1;
      return {
        checkInDateLocalized: req.checkInDateLocalized,
        checkOutDateLocalized: req.checkOutDateLocalized,
        unitTypeId: listingId,
        guestsCount: guests,
        numberOfGuests: { numberOfAdults: guests },
        source: "website",
        applyPromotions: true,
        count: 1,
      };
    })
    .filter(Boolean);

  if (!quotes.length) {
    return jsonResponse(400, { message: "No valid quote requests" });
  }

  const res = await fetchWithTimeout(
    `${OPEN_API_V1}/quotes/multiple?mergeAccommodationFarePriceComponents=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ quotes }),
    }
  );

  if (res.status === 429) {
    return jsonResponse(200, { results: {}, errors: [{ message: "Rate limited by Guesty" }], rateLimited: true });
  }

  if (!res.ok) {
    return jsonResponse(502, { message: "Quote bulk failed", error: await res.text() });
  }

  const payload = await res.json();
  const resultsArray = Array.isArray(payload?.results) ? payload.results : [];
  const results = resultsArray.reduce((acc, item) => {
    const key = item?.unitTypeId || item?.listingId || item?._id;
    if (key) acc[key] = item;
    return acc;
  }, {});

  return jsonResponse(200, { results, errors: payload?.errors || [], tokenSource });
};

const handleCheckout = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const {
    listingId,
    listingTitle,
    checkIn,
    checkOut,
    guests,
    amount,
    currency,
    breakdown,
    guest,
    consentText,
    consentAcceptedAt,
    consentSignerName,
    consentSignatureDataUrl,
  } = body || {};

  if (!listingId || !checkIn || !checkOut || !amount) {
    return jsonResponse(400, { message: "Missing listingId, dates, or amount" });
  }

  const breakdownTotal = breakdown && typeof breakdown === "object"
    ? Number(breakdown.total ?? breakdown.subtotal)
    : NaN;
  const numericAmount = Number.isFinite(breakdownTotal) ? breakdownTotal : Number(amount);
  const unitAmount = toStripeAmount(numericAmount, currency);
  if (!unitAmount || unitAmount <= 0) {
    return jsonResponse(400, { message: "Invalid amount" });
  }

  const stripe = getStripeClient();
  const baseUrl = getBaseUrl(event);
  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim();

  const breakdownFields =
    breakdown && typeof breakdown === "object"
      ? {
          bd_accommodation: breakdown.accommodation,
          bd_cleaning: breakdown.cleaning,
          bd_taxes: breakdown.taxes,
          bd_fees: breakdown.fees,
          bd_discount: breakdown.discountAmount,
          bd_discount_rate: breakdown.discountRate,
          bd_total: breakdown.total ?? breakdown.subtotal,
        }
      : null;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: guest?.email,
    client_reference_id: listingId ? String(listingId) : undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (currency || "USD").toLowerCase(),
          unit_amount: unitAmount,
          product_data: {
            name: listingTitle || "OneLuxStay reservation",
            description: `Check-in ${checkIn} - Check-out ${checkOut} - Guests ${guests || 1}`,
          },
        },
      },
    ],
    success_url: `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?checkout=cancelled`,
    metadata: {
      listingId: String(listingId),
      checkIn,
      checkOut,
      guests: String(guests || 1),
      amount: String(numericAmount),
      currency: (currency || "USD").toLowerCase(),
      ...(consentText ? { consent_text: String(consentText) } : {}),
      ...(consentAcceptedAt ? { consent_at: String(consentAcceptedAt) } : {}),
      ...(consentSignerName ? { consent_signer_name: String(consentSignerName).slice(0, 200) } : {}),
      ...(consentSignatureDataUrl ? { consent_signature: "true" } : {}),
      ...(breakdownFields
        ? Object.fromEntries(
            Object.entries(breakdownFields)
              .filter(([, value]) => Number.isFinite(Number(value)))
              .map(([key, value]) => [key, String(value)]),
          )
        : {}),
      guestName,
      guestFirstName: guest?.firstName || "",
      guestLastName: guest?.lastName || "",
      guestEmail: guest?.email || "",
      guestPhone: guest?.phone || "",
    },
  });

  await writeConsentProof(session.id, {
    createdAt: new Date().toISOString(),
    sessionId: session.id,
    listingId: String(listingId),
    listingTitle: listingTitle || "",
    checkIn,
    checkOut,
    guests: Number(guests) || 1,
    amount: numericAmount,
    currency: (currency || "USD").toUpperCase(),
    consentText: consentText || "",
    consentAcceptedAt: consentAcceptedAt || "",
    consentSignerName: consentSignerName || "",
    consentSignatureDataUrl: consentSignatureDataUrl || "",
    guestName,
    guestEmail: guest?.email || "",
    guestPhone: guest?.phone || "",
  });

  return jsonResponse(200, { url: session.url, id: session.id });
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  const path = resolveFunctionPath(event);

  try {
    if (path === "/checkout" && event.httpMethod === "POST") {
      try {
        return await handleCheckout(event);
      } catch (err) {
        return jsonResponse(500, { message: "Checkout failed", error: err.message });
      }
    }

    let tokenPayload;
    try {
      tokenPayload = await getGuestyToken();
    } catch (err) {
      return jsonResponse(500, {
        message: "Unable to authenticate with Guesty",
        error: err?.message || String(err),
      });
    }

    const { token, source } = tokenPayload;

    if (path === "/listings/availability-bulk" && event.httpMethod === "GET") {
      return handleAvailabilityBulk(event, token, source);
    }

    if (path === "/listings/availability-query" && event.httpMethod === "GET") {
      return handleAvailabilityQuery(event, token, source);
    }

    if (path.startsWith("/listings/") && path.endsWith("/calendar-prices") && event.httpMethod === "GET") {
      const listingId = path.split("/")[2];
      return handleCalendarPrices(event, token, source, listingId);
    }

    if (path === "/listings/calendar-multi" && event.httpMethod === "GET") {
      return handleCalendarMulti(event, token, source);
    }

    if (path === "/reservations/quotes-bulk" && event.httpMethod === "POST") {
      return handleQuotesBulk(event, token, source);
    }

    return jsonResponse(404, { message: "Not Found", path });
  } catch (err) {
    return jsonResponse(500, {
      message: "check-units handler failed",
      path,
      error: err?.message || String(err),
    });
  }
}
