import { jsonResponse } from "./_shared/http.js";
import { getApaleoAccessToken, getApaleoAccount } from "./_shared/apaleoService.js";

const isTruthy = (value = "") => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const query = event.queryStringParameters || {};
  const forceRefresh = isTruthy(query.forceRefresh);
  const startedAt = Date.now();

  try {
    const token = await getApaleoAccessToken({ forceRefresh });
    const account = await getApaleoAccount({
      accessToken: token?.token || "",
      forceRefresh,
    });

    return jsonResponse(200, {
      ok: true,
      provider: "apaleo",
      tokenSource: token?.source || "unknown",
      account: account || null,
      durationMs: Date.now() - startedAt,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[apaleo-account] failed", {
      message: error?.message || String(error),
    });
    return jsonResponse(502, {
      ok: false,
      provider: "apaleo",
      message: "Unable to fetch Apaleo account",
      error: error?.message || String(error),
      durationMs: Date.now() - startedAt,
    });
  }
}

