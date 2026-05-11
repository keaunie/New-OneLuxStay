import { jsonResponse } from "./_shared/http.js";
import { getNormalizedAvailability, syncApaleoAvailability } from "./_shared/pmsProvider.js";

const isTruthy = (value = "") => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const query = event.queryStringParameters || {};
  const propertyId = String(query.property_id || query.propertyId || "").trim();
  const checkIn = String(query.check_in || query.checkIn || "").trim();
  const checkOut = String(query.check_out || query.checkOut || "").trim();
  const guests = Math.max(1, Number(query.guests || 1) || 1);
  const city = String(query.city || "Antwerp").trim();
  const sync = isTruthy(query.sync);

  if (!propertyId || !checkIn || !checkOut) {
    return jsonResponse(400, {
      ok: false,
      message: "Missing property_id/propertyId, check_in/checkIn, or check_out/checkOut",
    });
  }

  try {
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
      ...(syncResult ? { sync: syncResult } : {}),
    });
  } catch (error) {
    console.error("[apaleo-availability] failed", {
      message: error?.message || String(error),
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
    });
  }
}
