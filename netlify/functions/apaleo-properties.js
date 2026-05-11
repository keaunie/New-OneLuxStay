import { jsonResponse } from "./_shared/http.js";
import { getNormalizedProperties, syncApaleoProperties } from "./_shared/pmsProvider.js";

const isTruthy = (value = "") => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const query = event.queryStringParameters || {};
  const city = String(query.city || "Antwerp").trim();
  const sync = isTruthy(query.sync);
  const limit = Number(query.limit || 0) || undefined;

  try {
    let syncResult = null;
    if (sync) {
      syncResult = await syncApaleoProperties({ city, query: limit ? { limit } : {} });
    }

    const normalized = await getNormalizedProperties({
      provider: "apaleo",
      city,
      query: {
        ...(limit ? { limit } : {}),
      },
    });

    return jsonResponse(200, {
      ok: true,
      provider: normalized.provider,
      count: normalized.results.length,
      results: normalized.results,
      ...(syncResult ? { sync: syncResult } : {}),
    });
  } catch (error) {
    console.error("[apaleo-properties] failed", {
      message: error?.message || String(error),
      city,
    });
    return jsonResponse(502, {
      ok: false,
      provider: "apaleo",
      message: "Unable to fetch Apaleo properties",
      error: error?.message || String(error),
    });
  }
}
