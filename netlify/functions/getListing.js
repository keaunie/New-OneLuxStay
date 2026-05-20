import { getGuestyOpenApiCredentials } from "./_shared/guestyEnv.js";
import { isHiddenUnit } from "../../src/config/hiddenUnits.js";

const OPEN_API_HOST = process.env.GUESTY_OPEN_API_HOST || "https://open-api.guesty.com";
const OPEN_API_V1_RAW = process.env.GUESTY_BASE_URL || `${OPEN_API_HOST}/v1`;
const OPEN_API_V1 = OPEN_API_V1_RAW.replace(/\/+$/, "");
const TOKEN_STORE_NAME = process.env.GUESTY_TOKEN_BLOB_STORE || "guesty-oauth";
const TOKEN_KEY = process.env.GUESTY_TOKEN_BLOB_KEY || "access-token";
const TOKEN_REFRESH_BUFFER_MS = Number(process.env.GUESTY_TOKEN_REFRESH_BUFFER_MS || 60_000);

const baseHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const DEFAULT_LISTING_FIELDS = [
  "_id",
  "title",
  "nickname",
  "picture.thumbnail",
  "address.full",
  "address.city",
  "address.state",
  "address.country",
  "defaultCheckInTime",
  "defaultCheckOutTime",
].join(" ");

let blobStorePromise;

const getCorsHeaders = (event = {}) => ({
  ...baseHeaders,
  "Access-Control-Allow-Headers":
    event?.headers?.["access-control-request-headers"] ||
    event?.headers?.["Access-Control-Request-Headers"] ||
    "Content-Type, Authorization, Accept, Origin, X-Requested-With",
});

const jsonResponse = (statusCode, body, event) => ({
  statusCode,
  headers: getCorsHeaders(event),
  body: JSON.stringify(body),
});

const fetchWithTimeout = async (url, options = {}, timeout = 20_000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

const getBlobStore = async () => {
  if (!blobStorePromise) {
    blobStorePromise = (async () => {
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
    })();
  }
  return blobStorePromise;
};

const requestGuestyToken = async () => {
  const { clientId, clientSecret } = getGuestyOpenApiCredentials();

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

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${text}`);
  }

  return payload;
};

const getGuestyToken = async () => {
  const now = Date.now();

  if (
    globalThis.GUESTY_TOKEN &&
    Number(globalThis.GUESTY_TOKEN_EXPIRES || 0) > now + TOKEN_REFRESH_BUFFER_MS
  ) {
    return { token: globalThis.GUESTY_TOKEN, source: "memory" };
  }

  const store = await getBlobStore();
  if (store) {
    let cached = await store.get(TOKEN_KEY, { type: "json" });
    if (!cached) {
      const raw = await store.get(TOKEN_KEY, { type: "text" });
      cached = raw ? JSON.parse(raw) : null;
    }

    const cachedToken = cached?.token || cached?.access_token || cached?.accessToken;
    const cachedExpiry = Number(cached?.expiresAt ?? cached?.expires_at ?? 0);
    if (cachedToken && cachedExpiry > now + TOKEN_REFRESH_BUFFER_MS) {
      globalThis.GUESTY_TOKEN = cachedToken;
      globalThis.GUESTY_TOKEN_EXPIRES = cachedExpiry;
      return { token: cachedToken, source: "blob" };
    }
  }

  const tokenPayload = await requestGuestyToken();
  const tokenData = {
    token: tokenPayload.access_token,
    expiresAt: now + Number(tokenPayload.expires_in || 0) * 1000,
  };

  if (!tokenData.token) {
    throw new Error("Token response missing access_token");
  }

  if (store) {
    await store.setJSON(TOKEN_KEY, tokenData);
  }

  globalThis.GUESTY_TOKEN = tokenData.token;
  globalThis.GUESTY_TOKEN_EXPIRES = tokenData.expiresAt;
  return { token: tokenData.token, source: "fresh" };
};

const buildGuestyUrl = (path, query) => {
  const cleanedPath = String(path || "").replace(/^\/+/, "");
  const url = new URL(`${OPEN_API_V1}/${cleanedPath}`);

  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value == null || value === "") return;
      if (typeof value === "object") url.searchParams.set(key, JSON.stringify(value));
      else url.searchParams.set(key, String(value));
    });
  }

  return url;
};

const guestyRequest = async (path, options = {}) => {
  const { token } = await getGuestyToken();
  const method = options.method || "GET";
  const url = buildGuestyUrl(path, options.query);

  const requestHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  let body;
  if (options.body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetchWithTimeout(url.toString(), { method, headers: requestHeaders, body });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error(
      `Guesty request failed (${response.status}) for ${method} ${url.toString()}: ${text}`,
    );
    error.statusCode = response.status;
    error.data = data;
    error.requestUrl = url.toString();
    throw error;
  }

  return data;
};

const normalizeListing = (data) => {
  if (!data) return null;
  if (data.listing && typeof data.listing === "object") return data.listing;
  if (data.data && !Array.isArray(data.data) && typeof data.data === "object") return data.data;
  if (Array.isArray(data.results) && data.results.length > 0) return data.results[0];
  if (typeof data === "object") return data;
  return null;
};

const readPayload = (event = {}) => {
  if (event.httpMethod === "GET") {
    return {
      listingId:
        event.queryStringParameters?.listingId ||
        event.queryStringParameters?.id ||
        "",
      fields: event.queryStringParameters?.fields || "",
    };
  }

  return JSON.parse(event.body || "{}");
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: getCorsHeaders(event), body: "" };
  }

  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" }, event);
  }

  let payload;
  try {
    payload = readPayload(event);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, event);
  }

  const listingId = String(payload?.listingId ?? payload?.id ?? "").trim();
  if (!listingId) {
    return jsonResponse(400, { error: "Listing ID is required" }, event);
  }

  if (isHiddenUnit(listingId)) {
    return jsonResponse(404, { error: "Listing not found" }, event);
  }

  try {
    const query =
      payload?.query && typeof payload.query === "object"
        ? payload.query
        : { fields: String(payload?.fields || DEFAULT_LISTING_FIELDS) };

    const raw = await guestyRequest(`/listings/${encodeURIComponent(listingId)}`, { query });
    const listing = normalizeListing(raw);

    if (!listing) {
      return jsonResponse(404, { error: "Listing not found", raw }, event);
    }

    return jsonResponse(200, { listing, raw }, event);
  } catch (error) {
    return jsonResponse(
      error?.statusCode || 500,
      {
        error: error?.message || "Guesty request failed",
        details: error?.data || null,
        requestUrl: error?.requestUrl || null,
      },
      event,
    );
  }
}
