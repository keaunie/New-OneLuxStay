import { getGuestyOpenApiCredentials } from "./_shared/guestyEnv.js";

const OPEN_API_HOST = process.env.GUESTY_OPEN_API_HOST || "https://open-api.guesty.com";
const TOKEN_STORE_NAME = process.env.GUESTY_TOKEN_BLOB_STORE || "guesty-oauth";
const TOKEN_KEY = process.env.GUESTY_TOKEN_BLOB_KEY || "access-token";
const TOKEN_REFRESH_BUFFER_MS = Number(process.env.GUESTY_TOKEN_REFRESH_BUFFER_MS || 60_000);

const jsonResponse = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

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

const fetchWithTimeout = async (url, options = {}, timeout = 20_000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
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
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : {};
};

let tokenRefreshPromise = null;

const getGuestyToken = async () => {
  const now = Date.now();
  if (globalThis.GUESTY_TOKEN && globalThis.GUESTY_TOKEN_EXPIRES > now + TOKEN_REFRESH_BUFFER_MS) {
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

  if (!tokenRefreshPromise) {
    tokenRefreshPromise = (async () => {
      const tokenPayload = await requestGuestyToken();
      const refreshedAt = Date.now();
      const tokenData = {
        token: tokenPayload.access_token,
        expiresAt: refreshedAt + Number(tokenPayload.expires_in || 0) * 1000,
      };

      if (!tokenData.token) {
        throw new Error("Token response missing access_token");
      }

      if (store) {
        await store.setJSON(TOKEN_KEY, tokenData);
      }

      globalThis.GUESTY_TOKEN = tokenData.token;
      globalThis.GUESTY_TOKEN_EXPIRES = tokenData.expiresAt;
      return tokenData;
    })().finally(() => {
      tokenRefreshPromise = null;
    });
  }

  const tokenData = await tokenRefreshPromise;
  return { token: tokenData.token, source: "fresh" };
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  const unitTypeId = event.queryStringParameters?.unitTypeId;
  if (!unitTypeId) {
    return jsonResponse(400, { message: "Missing unitTypeId" });
  }

  try {
    const { token, source: tokenSource } = await getGuestyToken();
    const url = `${OPEN_API_HOST}/v1/properties/house-rules/unit-type/${encodeURIComponent(
      unitTypeId
    )}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    return jsonResponse(
      200,
      { ...data, tokenSource: tokenSource || "unknown" },
      { "X-Guesty-Token-Cache": tokenSource || "unknown" }
    );
  } catch (err) {
    return jsonResponse(500, {
      message: "Failed to fetch Guesty house rules",
      error: err.message,
      tokenSource: null,
    });
  }
}
