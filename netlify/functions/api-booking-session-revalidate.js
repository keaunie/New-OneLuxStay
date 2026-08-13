import { jsonResponse, readJsonBody } from "./_shared/http.js";
import { revalidateBookingSession } from "./_shared/apaleoBookingService.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });
  try {
    const body = readJsonBody(event);
    const result = await revalidateBookingSession(body.bookingSessionId || body.id);
    return jsonResponse(result.changed ? 409 : 200, result);
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "REVALIDATION_FAILED" });
  }
}
