const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

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
      const statusCode = response.status === 429 ? 429 : 502;
      const retryAfter = response.headers.get("retry-after");
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
