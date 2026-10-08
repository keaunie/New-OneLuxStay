import { jsonResponse, readJsonBody } from "./_shared/http.js";
import { completeStripeSetupBooking } from "./_shared/stripeBookingService.js";

// POST { bookingSessionId, checkoutSessionId }
// Called when the guest returns from Stripe. Verifies the saved card with Stripe itself
// (never trusting the browser) and then creates the Apaleo reservation. Safe to call twice.
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });
  try {
    const body = readJsonBody(event);
    const result = await completeStripeSetupBooking({
      bookingSessionId: body.bookingSessionId,
      checkoutSessionId: body.checkoutSessionId,
    });
    return jsonResponse(result.status, result.body);
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "STRIPE_COMPLETE_FAILED" });
  }
}
