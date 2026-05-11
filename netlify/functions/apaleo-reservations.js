import { jsonResponse } from "./_shared/http.js";
import { getNormalizedReservations, syncApaleoReservations } from "./_shared/pmsProvider.js";

const isTruthy = (value = "") => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

const parseBody = (event) => {
  try {
    return event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : {};
  } catch {
    return null;
  }
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const query = event.queryStringParameters || {};
  const body = parseBody(event);
  if (body == null) {
    return jsonResponse(400, { message: "Invalid JSON body" });
  }

  const reservationCode = String(
    body.reservationCode || body.reservationId || query.reservationCode || query.reservationId || "",
  ).trim();
  const city = String(body.city || query.city || "Antwerp").trim();
  const sync = isTruthy(body.sync || query.sync);
  const checkIn = String(body.checkIn || query.checkIn || "").trim();
  const checkOut = String(body.checkOut || query.checkOut || "").trim();
  const limit = Number(body.limit || query.limit || 0) || undefined;

  try {
    let syncResult = null;
    if (sync) {
      syncResult = await syncApaleoReservations({
        query: {
          ...(checkIn ? { arrival: checkIn } : {}),
          ...(checkOut ? { departure: checkOut } : {}),
          ...(limit ? { limit } : {}),
        },
      });
    }

    const normalized = await getNormalizedReservations({
      provider: "apaleo",
      city,
      reservationCode,
      query: {
        ...(checkIn ? { arrival: checkIn } : {}),
        ...(checkOut ? { departure: checkOut } : {}),
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
    console.error("[apaleo-reservations] failed", {
      message: error?.message || String(error),
      reservationCode,
      city,
    });
    return jsonResponse(502, {
      ok: false,
      provider: "apaleo",
      message: "Unable to fetch Apaleo reservations",
      error: error?.message || String(error),
    });
  }
}
