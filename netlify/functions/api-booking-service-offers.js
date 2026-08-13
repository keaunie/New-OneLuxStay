import { jsonResponse } from "./_shared/http.js";
import { getServiceOffers } from "./_shared/apaleoBookingService.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "GET") return jsonResponse(405, { message: "Method Not Allowed" });
  const query = event.queryStringParameters || {};
  try {
    const services = await getServiceOffers({ ratePlanId: query.ratePlanId, arrival: query.arrival,
      departure: query.departure, adults: query.adults,
      childrenAges: String(query.childrenAges || "").split(",").filter((value) => value !== "") });
    return jsonResponse(200, { provider: "apaleo", count: services.length, services });
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "APALEO_SERVICE_OFFERS_FAILED" });
  }
}
