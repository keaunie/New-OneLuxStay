import { getStore } from "@netlify/blobs";
import { ensureLocalEnv } from "./loadEnv.js";
import { fetchWithTimeout } from "./http.js";

ensureLocalEnv();

const APALEO_IDENTITY_URL = String(process.env.APALEO_IDENTITY_URL || "https://identity.apaleo.com").replace(/\/+$/, "");
const APALEO_API_BASE = String(process.env.APALEO_API_BASE || "https://api.apaleo.com").replace(/\/+$/, "");
const TOKEN_STORE_NAME = process.env.APALEO_TOKEN_BLOB_STORE || "apaleo-oauth";
const TOKEN_KEY = process.env.APALEO_TOKEN_BLOB_KEY || "access-token";
const TOKEN_REFRESH_BUFFER_MS = Number(process.env.APALEO_TOKEN_REFRESH_BUFFER_MS || 90_000);
const DEFAULT_TIMEOUT_MS = Number(process.env.APALEO_TIMEOUT_MS || 20_000);
const DEFAULT_RETRY_COUNT = Math.max(0, Number(process.env.APALEO_RETRY_COUNT || 2));
const DEFAULT_RETRY_DELAY_MS = Math.max(100, Number(process.env.APALEO_RETRY_DELAY_MS || 400));

let tokenStorePromise;
let tokenRefreshPromise = null;

const sanitizeString = (value = "", maxLength = 600) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizePhoneNumber = (value = "") => {
  const raw = sanitizeString(value, 120);
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `${hasPlus ? "+" : ""}${digits}`;
};

const toArray = (value) => (Array.isArray(value) ? value : []);

const getBlobStore = async () => {
  if (!tokenStorePromise) {
    tokenStorePromise = (async () => {
      try {
        const siteID = process.env.NETLIFY_SITE_ID;
        const apiToken = process.env.NETLIFY_API_TOKEN;
        return siteID && apiToken
          ? getStore(TOKEN_STORE_NAME, { siteID, token: apiToken })
          : getStore(TOKEN_STORE_NAME);
      } catch {
        return null;
      }
    })();
  }
  return tokenStorePromise;
};

const getApaleoCredentials = () => {
  const clientId = sanitizeString(process.env.APALEO_CLIENT_ID, 240);
  const clientSecret = sanitizeString(process.env.APALEO_CLIENT_SECRET, 240);
  const accountId = sanitizeString(process.env.APALEO_ACCOUNT_ID, 240);
  const scope = sanitizeString(
    process.env.APALEO_SCOPE ||
      process.env.APALEO_CLIENT_SCOPE ||
      "reservations.read availability.read properties.read units.read",
    500,
  );

  if (!clientId || !clientSecret) {
    throw new Error("Missing Apaleo credentials (APALEO_CLIENT_ID / APALEO_CLIENT_SECRET)");
  }

  return { clientId, clientSecret, accountId, scope };
};

const parseRetryAfterMs = (headerValue = "") => {
  const normalized = sanitizeString(headerValue, 120);
  if (!normalized) return null;
  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const when = Date.parse(normalized);
  if (!Number.isFinite(when)) return null;
  return Math.max(0, when - Date.now());
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseResponsePayload = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const requestApaleoToken = async () => {
  const { clientId, clientSecret, scope } = getApaleoCredentials();

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    ...(scope ? { scope } : {}),
  });

  const response = await fetchWithTimeout(
    `${APALEO_IDENTITY_URL}/connect/token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
    DEFAULT_TIMEOUT_MS,
  );

  const payload = await parseResponsePayload(response);
  if (!response.ok) {
    throw new Error(
      sanitizeString(
        payload?.error_description || payload?.error || payload?.message || `Apaleo token request failed (${response.status})`,
        500,
      ),
    );
  }

  const token = sanitizeString(payload?.access_token, 4000);
  if (!token) throw new Error("Apaleo token response missing access_token");

  return {
    token,
    expiresAt: Date.now() + Number(payload?.expires_in || 0) * 1000,
  };
};

export const getApaleoToken = async ({ forceRefresh = false } = {}) => {
  const now = Date.now();
  if (
    !forceRefresh &&
    globalThis.APALEO_TOKEN &&
    Number(globalThis.APALEO_TOKEN_EXPIRES || 0) > now + TOKEN_REFRESH_BUFFER_MS
  ) {
    return { token: globalThis.APALEO_TOKEN, source: "memory" };
  }

  const store = await getBlobStore();
  if (!forceRefresh && store) {
    const cached = await store.get(TOKEN_KEY, { type: "json" });
    const cachedToken = sanitizeString(cached?.token || cached?.access_token || cached?.accessToken, 4000);
    const cachedExpiry = Number(cached?.expiresAt ?? cached?.expires_at ?? 0);
    if (cachedToken && cachedExpiry > now + TOKEN_REFRESH_BUFFER_MS) {
      globalThis.APALEO_TOKEN = cachedToken;
      globalThis.APALEO_TOKEN_EXPIRES = cachedExpiry;
      return { token: cachedToken, source: "blob" };
    }
  }

  if (!tokenRefreshPromise || forceRefresh) {
    tokenRefreshPromise = (async () => {
      const tokenData = await requestApaleoToken();
      globalThis.APALEO_TOKEN = tokenData.token;
      globalThis.APALEO_TOKEN_EXPIRES = tokenData.expiresAt;

      if (store) {
        await store.setJSON(TOKEN_KEY, tokenData);
      }

      return tokenData;
    })().finally(() => {
      tokenRefreshPromise = null;
    });
  }

  const tokenData = await tokenRefreshPromise;
  return { token: tokenData.token, source: "fresh" };
};

const buildApaleoUrl = (path = "", query = {}) => {
  const safePath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
  const url = new URL(`${APALEO_API_BASE}${safePath}`);

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry == null || entry === "") return;
        url.searchParams.append(key, String(entry));
      });
      return;
    }
    if (typeof value === "object") {
      url.searchParams.set(key, JSON.stringify(value));
      return;
    }
    url.searchParams.set(key, String(value));
  });

  return url;
};

export const apaleoRequest = async (
  path,
  {
    method = "GET",
    query,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRY_COUNT,
    headers = {},
  } = {},
) => {
  let shouldRefreshToken = false;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { token } = await getApaleoToken({ forceRefresh: shouldRefreshToken });
    const url = buildApaleoUrl(path, query);

    const response = await fetchWithTimeout(
      url.toString(),
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
      timeoutMs,
    );

    const payload = await parseResponsePayload(response);
    const isAuthError = response.status === 401;
    const isRateLimited = response.status === 429;
    const isRetriableServerError = response.status >= 500 && response.status <= 599;

    if (response.ok) {
      return {
        ok: true,
        statusCode: response.status,
        payload,
        headers: response.headers,
        url: url.toString(),
      };
    }

    if (isAuthError && attempt < retries) {
      shouldRefreshToken = true;
      continue;
    }

    if ((isRateLimited || isRetriableServerError) && attempt < retries) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const backoff = retryAfterMs ?? DEFAULT_RETRY_DELAY_MS * (2 ** attempt);
      await sleep(backoff);
      shouldRefreshToken = false;
      continue;
    }

    const error = new Error(
      sanitizeString(
        payload?.message || payload?.error_description || payload?.error || `Apaleo request failed (${response.status})`,
        700,
      ),
    );
    error.statusCode = response.status;
    error.payload = payload;
    error.requestPath = String(path || "");
    error.requestMethod = method;
    error.requestQuery = query || null;
    throw error;
  }

  throw new Error("Apaleo request retry cycle ended unexpectedly");
};

const readNested = (value, fallback = "") => sanitizeString(value, 280) || fallback;

const mapPropertyImageUrls = (property = {}) => {
  const directImages = toArray(property?.images);
  const candidateArrays = [
    ...directImages,
    ...toArray(property?.imageUrls),
    ...toArray(property?.photos),
  ];

  return candidateArrays
    .map((entry) => {
      if (typeof entry === "string") return sanitizeString(entry, 800);
      return sanitizeString(
        entry?.url || entry?.href || entry?.source || entry?.imageUrl || entry?.thumbnailUrl,
        800,
      );
    })
    .filter(Boolean);
};

const mapAmenities = (property = {}) => {
  const arrays = [
    ...toArray(property?.amenities),
    ...toArray(property?.features),
    ...toArray(property?.attributes),
  ];

  return [...new Set(arrays
    .map((entry) => {
      if (typeof entry === "string") return sanitizeString(entry, 120);
      return sanitizeString(entry?.name || entry?.code || entry?.value || entry?.id, 120);
    })
    .filter(Boolean))];
};

export const normalizeApaleoProperty = (property = {}) => {
  const propertyId = sanitizeString(
    property?.id || property?.propertyId || property?.code || property?.externalId,
    120,
  );
  const city = sanitizeString(property?.city || property?.address?.city, 120);
  const country = sanitizeString(property?.countryCode || property?.country || property?.address?.countryCode, 120);

  return {
    id: propertyId,
    title: readNested(property?.name || property?.title || property?.description || `Property ${propertyId}`),
    city,
    country,
    address: readNested(property?.address?.addressLine1 || property?.address?.line1 || property?.address || ""),
    provider: "apaleo",
    images: mapPropertyImageUrls(property),
    amenities: mapAmenities(property),
    raw: property,
  };
};

const readGuestName = (reservation = {}) => {
  const direct = sanitizeString(reservation?.guestName || reservation?.name, 220);
  if (direct) return direct;
  const firstName = sanitizeString(reservation?.guest?.firstName, 120);
  const lastName = sanitizeString(reservation?.guest?.lastName, 120);
  const fullName = `${firstName} ${lastName}`.trim();
  if (fullName) return fullName;
  return sanitizeString(reservation?.booker?.name || reservation?.company?.name, 220);
};

const normalizeDate = (value = "") => {
  const source = sanitizeString(value, 80);
  if (!source) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(source)) return source.slice(0, 10);
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return source;
  return parsed.toISOString().slice(0, 10);
};

export const normalizeApaleoReservation = (reservation = {}) => {
  const listingId = sanitizeString(
    reservation?.propertyId || reservation?.unitGroupId || reservation?.listingId || reservation?.unitId,
    120,
  );

  return {
    id: sanitizeString(
      reservation?.id || reservation?.reservationId || reservation?.confirmationNumber || reservation?.confirmationCode,
      120,
    ),
    guestName: readGuestName(reservation),
    checkIn: normalizeDate(reservation?.arrival || reservation?.checkIn || reservation?.checkInDate),
    checkOut: normalizeDate(reservation?.departure || reservation?.checkOut || reservation?.checkOutDate),
    propertyId: listingId,
    status: sanitizeString(reservation?.status || reservation?.bookingStatus || "unknown", 80).toLowerCase() || "unknown",
    provider: "apaleo",
    raw: reservation,
  };
};

const getAvailabilityPrice = (entry = {}) => {
  const candidates = [
    entry?.price,
    entry?.totalPrice,
    entry?.nightlyRate,
    entry?.amount,
    entry?.grossAmount,
    entry?.netAmount,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
};

export const normalizeApaleoAvailability = (entry = {}, fallback = {}) => ({
  propertyId: sanitizeString(entry?.propertyId || entry?.unitGroupId || fallback?.propertyId, 120),
  available: Boolean(entry?.available ?? entry?.isAvailable ?? entry?.bookable ?? false),
  price: getAvailabilityPrice(entry),
  currency: sanitizeString(entry?.currency || fallback?.currency || "EUR", 12).toUpperCase() || "EUR",
  provider: "apaleo",
  raw: entry,
});

export const listApaleoProperties = async ({ query = {} } = {}) => {
  const { accountId } = getApaleoCredentials();
  const endpoint = sanitizeString(process.env.APALEO_PROPERTIES_ENDPOINT || "/inventory/v1/properties", 240);
  const response = await apaleoRequest(endpoint, {
    query: {
      ...(accountId ? { accountId } : {}),
      ...query,
    },
  });

  const list = toArray(response?.payload?.properties || response?.payload?.items || response?.payload?.data || response?.payload);
  return list.map((item) => normalizeApaleoProperty(item)).filter((item) => item.id);
};

export const listApaleoReservations = async ({ query = {} } = {}) => {
  const endpoint = sanitizeString(process.env.APALEO_RESERVATIONS_ENDPOINT || "/booking/v1/reservations", 240);
  const response = await apaleoRequest(endpoint, { query });
  const list = toArray(response?.payload?.reservations || response?.payload?.items || response?.payload?.data || response?.payload);
  return list.map((item) => normalizeApaleoReservation(item)).filter((item) => item.id);
};

export const findApaleoReservationByCode = async ({ reservationCode = "" } = {}) => {
  const safeCode = sanitizeString(reservationCode, 120);
  if (!safeCode) return null;
  const endpoint = sanitizeString(process.env.APALEO_RESERVATIONS_ENDPOINT || "/booking/v1/reservations", 240);

  const attempts = [
    { path: `${endpoint}/${encodeURIComponent(safeCode)}` },
    { path: endpoint, query: { id: safeCode } },
    { path: endpoint, query: { reservationId: safeCode } },
    { path: endpoint, query: { confirmationNumber: safeCode } },
    { path: endpoint, query: { code: safeCode } },
  ];

  for (const attempt of attempts) {
    try {
      const response = await apaleoRequest(attempt.path, { query: attempt.query || {} });
      const payload = response?.payload || {};
      const list = toArray(payload?.reservations || payload?.items || payload?.data || payload);

      const candidate = Array.isArray(list) && list.length ? list[0] : payload;
      const normalized = normalizeApaleoReservation(candidate || {});
      if (normalized.id) return normalized;
    } catch (error) {
      if (Number(error?.statusCode) === 404) continue;
      if (Number(error?.statusCode) === 400) continue;
    }
  }

  return null;
};

export const getApaleoAvailability = async ({ propertyId, checkIn, checkOut, guests = 1, query = {} } = {}) => {
  const safePropertyId = sanitizeString(propertyId, 120);
  const safeCheckIn = normalizeDate(checkIn);
  const safeCheckOut = normalizeDate(checkOut);
  const endpoint = sanitizeString(process.env.APALEO_AVAILABILITY_ENDPOINT || "/booking/v1/availability", 240);

  const response = await apaleoRequest(endpoint, {
    query: {
      ...(safePropertyId ? { propertyId: safePropertyId } : {}),
      ...(safeCheckIn ? { arrival: safeCheckIn } : {}),
      ...(safeCheckOut ? { departure: safeCheckOut } : {}),
      ...(Number.isFinite(Number(guests)) ? { adults: Math.max(1, Number(guests) || 1) } : {}),
      ...query,
    },
  });

  const list = toArray(response?.payload?.availability || response?.payload?.items || response?.payload?.data || response?.payload);
  const normalized = list.map((entry) => normalizeApaleoAvailability(entry, {
    propertyId: safePropertyId,
  }));

  if (!normalized.length && safePropertyId) {
    return [
      {
        propertyId: safePropertyId,
        available: false,
        price: 0,
        currency: "EUR",
        provider: "apaleo",
        raw: response?.payload || {},
      },
    ];
  }

  return normalized;
};

export const buildApaleoSyncMetadata = ({ source = "apaleo_api", extra = {} } = {}) => ({
  source,
  fetchedAt: new Date().toISOString(),
  ...extra,
});

export const normalizeApaleoGuestPhone = (reservation = {}) =>
  normalizePhoneNumber(
    reservation?.guest?.phone || reservation?.guestPhone || reservation?.phone || reservation?.booker?.phone,
  );
