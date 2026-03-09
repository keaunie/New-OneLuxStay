const OPEN_API_HOST = process.env.GUESTY_OPEN_API_HOST || "https://open-api.guesty.com";
const OPEN_API_V1 = process.env.GUESTY_BASE_URL || `${OPEN_API_HOST}/v1`;
const TOKEN_STORE_NAME = process.env.GUESTY_TOKEN_BLOB_STORE || "guesty-oauth";
const TOKEN_KEY = process.env.GUESTY_TOKEN_BLOB_KEY || "access-token";
const TOKEN_REFRESH_BUFFER_MS = Number(process.env.GUESTY_TOKEN_REFRESH_BUFFER_MS || 60_000);

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

let blobStorePromise;

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers,
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

const guestyRequest = async (path, options = {}) => {
  const { token } = await getGuestyToken();
  const method = options.method || "GET";
  const url = new URL(path, OPEN_API_V1);

  if (options.query && typeof options.query === "object") {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value == null || value === "") return;
      if (typeof value === "object") url.searchParams.set(key, JSON.stringify(value));
      else url.searchParams.set(key, String(value));
    });
  }

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
    const error = new Error(`Guesty request failed (${response.status}): ${text}`);
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

const normalizeResults = (data) => {
  if (!data) return [];
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data)) return data;
  if (data.reservation) return [data.reservation];
  return [];
};

const buildIdVariants = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return [];
  const withoutResPrefix = trimmed.replace(/^res[.\-:\s]*/i, "").trim();
  const withoutAnyPrefix = trimmed.replace(/^reservation[.\-:\s]*/i, "").trim();
  const values = [
    trimmed,
    trimmed.toUpperCase(),
    withoutResPrefix,
    withoutResPrefix.toUpperCase(),
    withoutAnyPrefix,
    withoutAnyPrefix.toUpperCase(),
  ];
  return [...new Set(values.filter(Boolean))];
};

const RESERVATION_FIELDS = [
  "_id",
  "confirmationCode",
  "status",
  "listingId",
  "listing._id",
  "listing.title",
  "guest._id",
  "guest.fullName",
  "checkIn",
  "checkOut",
  "checkInDateLocalized",
  "checkOutDateLocalized",
].join(" ");

const readPayload = (event = {}) => {
  if (event.httpMethod === "GET") {
    return {
      reservationId:
        event.queryStringParameters?.reservationId ||
        event.queryStringParameters?.code ||
        "",
    };
  }
  return JSON.parse(event.body || "{}");
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let payload;
  try {
    payload = readPayload(event);
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const reservationId = String(payload?.reservationId ?? payload?.code ?? "").trim();
  if (!reservationId) {
    return jsonResponse(400, { error: "Reservation ID is required" });
  }

  try {
    const ids = buildIdVariants(reservationId);

    const queryStrategies =
      payload?.query && typeof payload.query === "object"
        ? [{ name: "custom", query: payload.query }]
        : [
            {
              name: "confirmationCode",
              query: {
                fields: RESERVATION_FIELDS,
                filters: [
                  {
                    operator: "$in",
                    field: "confirmationCode",
                    value: ids,
                  },
                ],
                sort: "_id",
                skip: 0,
                limit: 100,
              },
            },
            {
              name: "integration.airbnb2.id",
              query: {
                fields: RESERVATION_FIELDS,
                filters: [
                  {
                    operator: "$in",
                    field: "integration.airbnb2.id",
                    value: ids,
                  },
                ],
                sort: "_id",
                skip: 0,
                limit: 100,
              },
            },
            {
              name: "number",
              query: {
                fields: RESERVATION_FIELDS,
                filters: [
                  {
                    operator: "$in",
                    field: "number",
                    value: ids,
                  },
                ],
                sort: "_id",
                skip: 0,
                limit: 100,
              },
            },
            {
              name: "_id",
              query: {
                fields: RESERVATION_FIELDS,
                filters: [
                  {
                    operator: "$in",
                    field: "_id",
                    value: ids,
                  },
                ],
                sort: "_id",
                skip: 0,
                limit: 100,
              },
            },
          ];

    let raw = null;
    let results = [];
    const errors = [];

    for (const strategy of queryStrategies) {
      try {
        const response = await guestyRequest("/reservations", { query: strategy.query });
        const normalized = normalizeResults(response);
        raw = response;
        results = normalized;
        if (normalized.length > 0) break;
      } catch (error) {
        errors.push({
          strategy: strategy.name,
          statusCode: error?.statusCode || null,
          message: error?.message || "Unknown error",
        });
        if (error?.statusCode === 401 || error?.statusCode === 403) {
          throw error;
        }
      }
    }

    if (!raw && !results.length && errors.length) {
      return jsonResponse(502, {
        error: "Guesty reservation lookup failed",
        details: errors,
      });
    }

    return jsonResponse(200, { results, raw, attempted: queryStrategies.map((item) => item.name) });
  } catch (error) {
    return jsonResponse(error?.statusCode || 500, {
      error: error?.message || "Guesty request failed",
      details: error?.data || null,
    });
  }
}
