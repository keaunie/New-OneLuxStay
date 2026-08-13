import { jsonResponse, readJsonBody } from "./_shared/http.js";
import { getBookingSession } from "./_shared/apaleoBookingService.js";
import { adyenRequest } from "./_shared/adyenService.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });
  try {
    const body = readJsonBody(event);
    const session = await getBookingSession(body.bookingSessionId);
    if (session.state !== "PAYMENT_ACTION_REQUIRED") return jsonResponse(409, { message: "No payment action is pending" });
    const result = await adyenRequest("/payments/details", { details: body.details, paymentData: body.paymentData });
    const authorized = result.resultCode === "Authorised";
    await supabaseRestRequest(`apaleo_booking_sessions?id=eq.${encodeURIComponent(session.id)}`, {
      method: "PATCH", body: { state: authorized ? "READY_TO_BOOK" : "PAYMENT_DECLINED",
        payment_state: authorized ? "AUTHORIZED" : "DECLINED", ...(result.pspReference ? { payment_reference: result.pspReference } : {}), updated_at: new Date().toISOString() }, prefer: "return=minimal",
    });
    return jsonResponse(200, { resultCode: result.resultCode, bookingSessionId: session.id });
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "PAYMENT_DETAILS_FAILED" });
  }
}
