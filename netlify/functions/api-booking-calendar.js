import { jsonResponse } from "./_shared/http.js";
import { getUnitGroupCalendarAvailability } from "./_shared/apaleoBookingService.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "GET") return jsonResponse(405, { message: "Method Not Allowed" });

  const query = event.queryStringParameters || {};
  try {
    const result = await getUnitGroupCalendarAvailability({
      localPropertyId: query.localPropertyId || query.listingId,
      propertyId: query.propertyId,
      unitGroupId: query.unitGroupId,
      from: query.from || query.startDate,
      to: query.to || query.endDate,
      adults: query.adults,
      childrenAges: String(query.childrenAges || "").split(",").filter(Boolean),
    });
    return jsonResponse(200, {
      ok: true,
      provider: "apaleo",
      propertyId: result.propertyId,
      unitGroupId: result.unitGroupId,
      from: result.from,
      to: result.to,
      availability: result.availability,
      days: result.days,
      ...(result.pricingWarning ? { warning: result.pricingWarning } : {}),
    }, {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    });
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, {
      ok: false,
      message: error.message,
      code: error.code || "APALEO_CALENDAR_FAILED",
      requestPath: error.requestPath || null,
    });
  }
}
