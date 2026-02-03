const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

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

  throw new Error("Guesty token missing or expired. Refresh token first.");
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
    const url = `https://open-api.guesty.com/v1/properties/house-rules/unit-type/${encodeURIComponent(
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
