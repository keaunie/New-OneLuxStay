import { jsonResponse } from "./_shared/http.js";
import {
  getNormalizedAvailability,
  getNormalizedProperties,
  syncApaleoAvailability,
} from "./_shared/pmsProvider.js";

const isTruthy = (value = "") => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
const addUtcDays = (date, days) => {
  const out = new Date(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
};
const toIsoDate = (date) => new Date(date).toISOString().slice(0, 10);

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const query = event.queryStringParameters || {};
  let propertyId = String(query.property_id || query.propertyId || "").trim();
  const checkInRaw = String(query.check_in || query.checkIn || "").trim();
  const checkOutRaw = String(query.check_out || query.checkOut || "").trim();
  const nowUtc = new Date();
  const checkIn = checkInRaw || toIsoDate(addUtcDays(nowUtc, 7));
  const checkOut = checkOutRaw || toIsoDate(addUtcDays(nowUtc, 9));
  const guests = Math.max(1, Number(query.guests || 1) || 1);
  const city = String(query.city || "").trim();
  const sync = isTruthy(query.sync);
  const startedAt = Date.now();

  if (!propertyId) {
    try {
      const properties = await getNormalizedProperties({
        provider: "apaleo",
        city,
        query: { limit: 1 },
      });
      propertyId = String(properties?.results?.[0]?.id || "").trim();
    } catch {
      // fallback handled below
    }
  }

  if (!propertyId) {
    return jsonResponse(200, {
      ok: true,
      provider: "apaleo",
      city,
      count: 0,
      results: [],
      noDataMessage: "No availability data returned from sandbox.",
      reason: "missing_property_id",
      requested: { propertyId: null, checkIn, checkOut, guests },
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    });
  }

  try {
    console.info("[apaleo-availability] request", {
      city,
      propertyId,
      checkIn,
      checkOut,
      guests,
      sync,
    });

    let syncResult = null;
    if (sync) {
      syncResult = await syncApaleoAvailability({
        propertyId,
        checkIn,
        checkOut,
        guests,
      });
    }

    const normalized = await getNormalizedAvailability({
      provider: "apaleo",
      city,
      propertyId,
      checkIn,
      checkOut,
      guests,
    });

    return jsonResponse(200, {
      ok: true,
      provider: normalized.provider,
      count: normalized.results.length,
      results: normalized.results,
      ...(normalized.results.length === 0
        ? { noDataMessage: "No availability data returned from sandbox." }
        : {}),
      requested: { propertyId, checkIn, checkOut, guests },
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      ...(syncResult ? { sync: syncResult } : {}),
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 0) || 0;
    if (new Set([403, 404, 422]).has(statusCode)) {
      console.warn("[apaleo-availability] sandbox returned no sellable availability", {
        message: error?.message || String(error),
        statusCode,
        requestPath: error?.requestPath || null,
        requestQuery: error?.requestQuery || null,
        responseBody: error?.payload || null,
        propertyId,
        checkIn,
        checkOut,
        guests,
      });

      return jsonResponse(200, {
        ok: true,
        provider: "apaleo",
        city,
        count: 0,
        results: [],
        noDataMessage: "No availability data returned from sandbox.",
        reason: "sandbox_inventory_or_scope_limit",
        requested: { propertyId, checkIn, checkOut, guests },
        debug: {
          statusCode,
          requestPath: error?.requestPath || null,
          requestQuery: error?.requestQuery || null,
          responseBody: error?.payload || null,
        },
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      });
    }

    console.error("[apaleo-availability] failed", {
      message: error?.message || String(error),
      statusCode: statusCode || null,
      requestPath: error?.requestPath || null,
      requestQuery: error?.requestQuery || null,
      responseBody: error?.payload || null,
      propertyId,
      checkIn,
      checkOut,
      guests,
    });
    return jsonResponse(502, {
      ok: false,
      provider: "apaleo",
      message: "Unable to fetch Apaleo availability",
      error: error?.message || String(error),
      requested: { propertyId, checkIn, checkOut, guests },
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    });
  }
}
