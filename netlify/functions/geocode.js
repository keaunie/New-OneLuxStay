const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const DEGRADE_CACHE_MAX_AGE_SECONDS = 60;
const GEOCODER_BLOCK_FALLBACK_MS = 5 * 60 * 1000;
let providerBlockedUntil = 0;

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

const clampLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, 5);
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const q = String(event.queryStringParameters?.q || "").trim();
  if (!q) {
    return jsonResponse(400, { message: "Missing q parameter" });
  }

  const params = new URLSearchParams({
    format: "jsonv2",
    q,
    limit: String(clampLimit(event.queryStringParameters?.limit)),
  });

  const viewbox = String(event.queryStringParameters?.viewbox || "").trim();
  if (viewbox) params.set("viewbox", viewbox);
  const bounded = String(event.queryStringParameters?.bounded || "").trim();
  if (bounded) params.set("bounded", bounded);

  if (Date.now() < providerBlockedUntil) {
    return jsonResponse(200, [], {
      "Cache-Control": `public, max-age=${DEGRADE_CACHE_MAX_AGE_SECONDS}`,
      "X-Geocode-Degraded": "1",
    });
  }

  try {
    const userAgent =
      process.env.NOMINATIM_USER_AGENT ||
      "OneLuxStay-Geocoder/1.0 (operations@oneluxstay.com)";
    const response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const retryAfter = response.headers.get("retry-after");
      if (response.status === 429 || response.status === 502) {
        const retryAfterSeconds = Number.parseInt(retryAfter || "", 10);
        const blockMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : GEOCODER_BLOCK_FALLBACK_MS;
        providerBlockedUntil = Math.max(providerBlockedUntil, Date.now() + blockMs);
        return jsonResponse(200, [], {
          "Cache-Control": `public, max-age=${DEGRADE_CACHE_MAX_AGE_SECONDS}`,
          "X-Geocode-Degraded": "1",
          ...(retryAfter ? { "Retry-After": retryAfter } : {}),
        });
      }
      const statusCode = 502;
      return jsonResponse(statusCode, {
        message: "Geocoding provider error",
        status: response.status,
        error: errorText || null,
      }, retryAfter ? { "Retry-After": retryAfter } : {});
    }
    const payload = await response.json();
    return jsonResponse(200, payload, {
      "Cache-Control": "public, max-age=300",
    });
  } catch (error) {
    return jsonResponse(500, {
      message: "Geocoding request failed",
      error: error?.message || "Unknown error",
    });
  }
}
