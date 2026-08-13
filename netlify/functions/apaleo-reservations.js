import { jsonResponse } from "./_shared/http.js";
import { listApaleoReservationsWithDebug, findApaleoReservationByCode } from "./_shared/apaleoService.js";
import { syncApaleoReservations } from "./_shared/pmsProvider.js";

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
  const city = String(body.city || query.city || "").trim();
  const sync = isTruthy(body.sync || query.sync);
  const checkIn = String(body.checkIn || query.checkIn || "").trim();
  const checkOut = String(body.checkOut || query.checkOut || "").trim();
  const limit = Number(body.limit || query.limit || 0) || undefined;
  const propertyId = String(body.propertyId || query.propertyId || query.property_id || "").trim();
  const status = String(body.status || query.status || "").trim();
  const startedAt = Date.now();

  try {
    const upstreamQuery = {
      ...(checkIn ? { arrival: checkIn } : {}),
      ...(checkOut ? { departure: checkOut } : {}),
      ...(limit ? { limit } : {}),
      ...(propertyId ? { propertyId } : {}),
      ...(status ? { status } : {}),
    };

    let syncResult = null;
    if (sync) {
      syncResult = await syncApaleoReservations({
        query: upstreamQuery,
      });
    }

    if (reservationCode) {
      const match = await findApaleoReservationByCode({ reservationCode });
      return jsonResponse(200, {
        ok: true,
        provider: "apaleo",
        count: match ? 1 : 0,
        results: match ? [match] : [],
        requested: {
          city,
          reservationCode,
          checkIn: checkIn || null,
          checkOut: checkOut || null,
          limit: limit || null,
          propertyId: propertyId || null,
          status: status || null,
        },
        debug: {
          upstream: {
            endpoint: process.env.APALEO_RESERVATIONS_ENDPOINT || "/booking/v1/reservations",
          },
        },
        ...(syncResult ? { sync: syncResult } : {}),
        fetchedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      });
    }

    const normalized = await listApaleoReservationsWithDebug({
      query: upstreamQuery,
    });

    return jsonResponse(200, {
      ok: true,
      provider: "apaleo",
      count: normalized.results.length,
      results: normalized.results,
      requested: {
        city,
        reservationCode: reservationCode || null,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        limit: limit || null,
        propertyId: propertyId || null,
        status: status || null,
      },
      debug: {
        upstream: normalized.debug,
      },
      ...(syncResult ? { sync: syncResult } : {}),
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
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
      requested: {
        city,
        reservationCode: reservationCode || null,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        limit: limit || null,
        propertyId: propertyId || null,
        status: status || null,
      },
      debug: {
        statusCode: Number(error?.statusCode || 0) || null,
        requestPath: error?.requestPath || null,
        requestQuery: error?.requestQuery || null,
        responseBody: error?.payload || null,
      },
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    });
  }
}
