import { jsonResponse } from "./_shared/http.js";
import { getBookingSession } from "./_shared/apaleoBookingService.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "GET") return jsonResponse(405, { message: "Method Not Allowed" });
  try {
    const session = await getBookingSession(event.queryStringParameters?.bookingSessionId || event.queryStringParameters?.id);
    if (session.state !== "CONFIRMED") return jsonResponse(202, { bookingSessionId: session.id, state: session.state });
    return jsonResponse(200, { bookingSessionId: session.id, state: session.state, apaleoBookingId: session.apaleo_booking_id,
      reservationIds: session.apaleo_reservation_ids, propertyId: session.property_id, arrival: session.arrival,
      departure: session.departure, currency: session.currency, totalMinor: session.quoted_total_minor });
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "CONFIRMATION_LOOKUP_FAILED" });
  }
}
