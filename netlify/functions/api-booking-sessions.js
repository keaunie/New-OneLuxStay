import { jsonResponse, readJsonBody } from "./_shared/http.js";
import { createBookingSession } from "./_shared/apaleoBookingService.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });
  try {
    const session = await createBookingSession(readJsonBody(event));
    return jsonResponse(201, { session });
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "BOOKING_SESSION_FAILED" });
  }
}
