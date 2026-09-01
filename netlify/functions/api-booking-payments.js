import { jsonResponse, readJsonBody, getBaseUrl } from "./_shared/http.js";
import { getBookingSession, revalidateBookingSession } from "./_shared/apaleoBookingService.js";
import { adyenRequest, getApaleoPayAdditionalData, assertAdyenEnabledForProperty } from "./_shared/adyenService.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });
  try {
    const body = readJsonBody(event);
    const checked = await revalidateBookingSession(body.bookingSessionId);
    if (checked.changed) return jsonResponse(409, { message: "The offer changed and requires guest approval", code: "PRICE_CHANGED", session: checked.session });
    const session = await getBookingSession(body.bookingSessionId);
    if (session.guarantee_type === "PM6Hold") return jsonResponse(409, { message: "This offer does not require payment", code: "PAYMENT_NOT_REQUIRED" });
    if (!["READY_FOR_PAYMENT", "PAYMENT_DECLINED", "PAYMENT_ACTION_REQUIRED"].includes(session.state)) {
      return jsonResponse(409, { message: "Booking session is not ready for payment", code: "INVALID_SESSION_STATE" });
    }
    assertAdyenEnabledForProperty(session.property_id);
    const value = session.guarantee_type === "CreditCard" ? 0 : Number(session.prepayment_minor);
    const additionalData = getApaleoPayAdditionalData({ propertyId: session.property_id, guaranteeType: session.guarantee_type });
    const result = await adyenRequest("/payments", {
      amount: { value, currency: session.currency }, paymentMethod: body.paymentMethod,
      reference: `apaleo-${session.id}`, returnUrl: `${getBaseUrl(event)}/booking-confirmation?bookingSessionId=${session.id}`,
      browserInfo: body.browserInfo, origin: body.origin,
      deliveryDate: `${session.arrival}T16:00:00.000Z`,
      shopperInteraction: "Ecommerce", recurringProcessingModel: "UnscheduledCardOnFile",
      shopperReference: session.id,
      storePaymentMethod: true,
      additionalData,
    }, { idempotencyKey: session.id });
    const authorized = result.resultCode === "Authorised";
    const actionRequired = Boolean(result.action);
    const state = authorized ? "READY_TO_BOOK" : actionRequired ? "PAYMENT_ACTION_REQUIRED" : "PAYMENT_DECLINED";
    await supabaseRestRequest(`apaleo_booking_sessions?id=eq.${encodeURIComponent(session.id)}`, {
      method: "PATCH", body: { state, payment_provider: "adyen", payment_state: authorized ? "AUTHORIZED" : actionRequired ? "ACTION_REQUIRED" : "DECLINED",
        payment_metadata: authorized ? {
          payerReference: String(result?.additionalData?.["recurring.shopperReference"] || ""),
          storedPaymentMethodId: String(result?.additionalData?.["recurring.recurringDetailReference"] || ""),
        } : {},
        ...(result.pspReference ? { payment_reference: result.pspReference } : {}), updated_at: new Date().toISOString() }, prefer: "return=minimal",
    });
    return jsonResponse(200, { resultCode: result.resultCode, action: result.action || null, bookingSessionId: session.id });
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "PAYMENT_FAILED" });
  }
}
