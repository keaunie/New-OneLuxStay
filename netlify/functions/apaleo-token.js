import { jsonResponse } from "./_shared/http.js";
import { getApaleoToken } from "./_shared/apaleoService.js";

const isTruthy = (value = "") => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  try {
    const query = event.queryStringParameters || {};
    const payload = event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : {};
    const forceRefresh = isTruthy(query.forceRefresh || payload.forceRefresh);

    const tokenInfo = await getApaleoToken({ forceRefresh });

    return jsonResponse(200, {
      ok: true,
      provider: "apaleo",
      tokenSource: tokenInfo.source || "unknown",
      hasToken: Boolean(tokenInfo.token),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[apaleo-token] token retrieval failed", {
      message: error?.message || String(error),
    });
    return jsonResponse(502, {
      ok: false,
      provider: "apaleo",
      message: "Unable to fetch Apaleo token",
      error: error?.message || String(error),
    });
  }
}
