import { jsonResponse, readJsonBody } from "./_shared/http.js";
import { getBookingSession } from "./_shared/apaleoBookingService.js";
import { adyenRequest, getAdyenPublicConfig, assertAdyenEnabledForProperty } from "./_shared/adyenService.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });
  try {
    const body = readJsonBody(event);
    const session = await getBookingSession(body.bookingSessionId);
    if (session.guarantee_type === "PM6Hold") return jsonResponse(200, { paymentMethods: [], paymentRequired: false });
    assertAdyenEnabledForProperty(session.property_id);
    const value = session.guarantee_type === "CreditCard" ? 0 : Number(session.prepayment_minor);
    const countryCode = String(body.countryCode || "BE").toUpperCase().slice(0, 2);
    const shopperLocale = String(body.shopperLocale || "en-US").slice(0, 10);
    const paymentMethods = await adyenRequest("/paymentMethods", {
      amount: { value, currency: session.currency },
      countryCode,
      shopperLocale,
      channel: "Web",
    });
    return jsonResponse(200, { ...paymentMethods, configuration: getAdyenPublicConfig(), shopperLocale, paymentRequired: true });
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "PAYMENT_METHODS_FAILED" });
  }
}
