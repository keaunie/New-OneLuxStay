import { jsonResponse, readJsonBody } from "./_shared/http.js";
import { createStripeSetupCheckout } from "./_shared/stripeBookingService.js";

// POST { bookingSessionId, guest, listingTitle, consent, origin }
// Saves the guest's details and returns the Stripe-hosted "save your card" page URL.
export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });
  try {
    const body = readJsonBody(event);
    const result = await createStripeSetupCheckout({
      bookingSessionId: body.bookingSessionId,
      guest: body.guest || {},
      listingTitle: body.listingTitle,
      consent: body.consent || null,
      origin: body.origin,
    });
    return jsonResponse(200, result);
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "STRIPE_CHECKOUT_FAILED" });
  }
}
