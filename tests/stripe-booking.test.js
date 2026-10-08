import test from "node:test";
import assert from "node:assert/strict";
import {
  assertStripeSetupMatchesSession,
  resolveReturnOrigin,
  usesStripeForProperty,
} from "../netlify/functions/_shared/stripeBookingService.js";

const booking = { id: "sess-1", payment_metadata: { stripe: { checkoutSessionId: "cs_1" } } };
const goodCheckout = () => ({
  id: "cs_1", mode: "setup", status: "complete", customer: "cus_1",
  metadata: { apaleoBookingSessionId: "sess-1" },
  setup_intent: { id: "seti_1", status: "succeeded", payment_method: "pm_1" },
});

test("accepts a completed saved-card session that belongs to the booking", () => {
  assert.deepEqual(assertStripeSetupMatchesSession({ checkout: goodCheckout(), bookingSession: booking }),
    { customerId: "cus_1", setupIntentId: "seti_1", paymentMethodId: "pm_1" });
});

test("rejects a Stripe session that belongs to another booking", () => {
  const checkout = { ...goodCheckout(), metadata: { apaleoBookingSessionId: "sess-2" } };
  assert.throws(() => assertStripeSetupMatchesSession({ checkout, bookingSession: booking }), /different booking/);
});

test("rejects a genuine Stripe session that was not started for this booking", () => {
  const other = { id: "sess-1", payment_metadata: { stripe: { checkoutSessionId: "cs_other" } } };
  assert.throws(() => assertStripeSetupMatchesSession({ checkout: goodCheckout(), bookingSession: other }), /not started for this booking/);
});

test("rejects unfinished or failed card saves and wrong session types", () => {
  assert.throws(() => assertStripeSetupMatchesSession({ checkout: { ...goodCheckout(), status: "open" }, bookingSession: booking }), /not saved/);
  assert.throws(() => assertStripeSetupMatchesSession({
    checkout: { ...goodCheckout(), setup_intent: { id: "seti_1", status: "requires_action" } }, bookingSession: booking }), /could not be verified/);
  assert.throws(() => assertStripeSetupMatchesSession({ checkout: { ...goodCheckout(), mode: "payment" }, bookingSession: booking }), /Unexpected/);
  assert.throws(() => assertStripeSetupMatchesSession({ checkout: null, bookingSession: booking }), /not found/);
});

test("only our own domains can be used as the return address", () => {
  assert.equal(resolveReturnOrigin("https://oneluxstay.com"), "https://oneluxstay.com");
  assert.equal(resolveReturnOrigin("https://www.oneluxstay.com/dubai"), "https://www.oneluxstay.com");
  assert.equal(resolveReturnOrigin("http://localhost:5174"), "http://localhost:5174");
  for (const bad of ["https://evil.com", "https://oneluxstay.com.evil.com", "http://oneluxstay.com", "javascript:alert(1)", "", "not a url"]) {
    assert.match(resolveReturnOrigin(bad), /^https:\/\/(www\.)?oneluxstay\.com$/, bad);
  }
});

test("Dubai uses Stripe by default and other properties keep Adyen", () => {
  delete process.env.STRIPE_BOOKING_PROPERTY_IDS;
  assert.equal(usesStripeForProperty("DUBAI"), true);
  assert.equal(usesStripeForProperty("dubai"), true);
  assert.equal(usesStripeForProperty("LLEW"), false);
  assert.equal(usesStripeForProperty(""), false);
});
