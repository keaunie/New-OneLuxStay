const OPEN_API_HOST = "https://open-api.guesty.com";
const OPEN_API_V1 = "https://open-api.guesty.com/v1";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

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

const fetchWithTimeout = async (url, options = {}, timeout = 20000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

const getBlobStore = async () => {
  try {
    const { getStore } = await import("@netlify/blobs");
    const siteID = process.env.NETLIFY_SITE_ID;
    const apiToken = process.env.NETLIFY_API_TOKEN;
    return siteID && apiToken
      ? getStore(TOKEN_STORE_NAME, { siteID, token: apiToken })
      : getStore(TOKEN_STORE_NAME);
  } catch {
    return null;
  }
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

  const price =
    day?.price ??
    day?.nightlyPrice ??
    day?.nightlyRate ??
    day?.basePrice ??
    day?.basePricePerNight ??
    day?.price?.amount ??
    day?.price?.value ??
    day?.money?.amount ??
    day?.money?.money?.amount ??
    null;

  const currency =
    day?.currency ||
    day?.price?.currency ||
    day?.money?.currency ||
    day?.money?.money?.currency ||
    fallbackCurrency ||
    "USD";

  const minNights =
    day?.minNights ??
    day?.minimumStay ??
    day?.minStay ??
    day?.minStayLength ??
    day?.restrictions?.minNights ??
    day?.restrictions?.minStay ??
    null;

  const maxNights =
    day?.maxNights ??
    day?.maximumStay ??
    day?.maxStay ??
    day?.maxStayLength ??
    day?.restrictions?.maxNights ??
    day?.restrictions?.maxStay ??
    null;

  return {
    date,
    price: typeof price === "number" ? price : null,
    currency,
    restrictions: {
      minNights: typeof minNights === "number" ? minNights : null,
      maxNights: typeof maxNights === "number" ? maxNights : null,
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
  const daysRaw = payload?.days || payload?.calendar || payload?.data || payload?.results || [];
  const currency = payload?.currency;
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
  const body = JSON.parse(event.body || "{}");
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

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  const path = event.path.replace("/.netlify/functions/check-units", "");
  const { token, source } = await getGuestyToken();

  if (path === "/listings/availability-bulk" && event.httpMethod === "GET") {
    return handleAvailabilityBulk(event, token, source);
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

  return jsonResponse(404, { message: "Not Found" });
}
