import { getStripeClient } from "./stripeCheckoutService.js";
import { getPublicWebsiteUrl } from "./http.js";
import { getBookingSession } from "./apaleoBookingService.js";
import { supabaseRestRequest } from "./supabaseClient.js";

// Stripe handles the "card on file" step for properties that are not set up in Adyen /
// Apaleo Pay (currently Dubai). The guest is sent to Stripe's hosted Checkout page in
// `setup` mode: the card is saved against a Stripe Customer and NOTHING is charged. Card
// details never touch our site or servers. Once Stripe confirms the card was saved, the
// normal api-booking-confirm flow creates the Apaleo reservation.

const clean = (value = "", max = 300) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Property ids (Apaleo property codes) that use Stripe instead of Adyen. Override with the
// STRIPE_BOOKING_PROPERTY_IDS env var (comma-separated); defaults to Dubai.
export const getStripeBookingPropertyIds = () =>
  new Set(
    String(process.env.STRIPE_BOOKING_PROPERTY_IDS || "DUBAI")
      .split(",")
      .map((value) => clean(value, 120).toUpperCase())
      .filter(Boolean),
  );

export const usesStripeForProperty = (propertyId) =>
  getStripeBookingPropertyIds().has(clean(propertyId, 120).toUpperCase());

// The guest returns to the site they started on. Only our own domains (and localhost for
// development) are accepted, so a crafted request can't turn Stripe's redirect into an
// open redirect to a third-party site.
export const resolveReturnOrigin = (candidate = "") => {
  const fallback = getPublicWebsiteUrl();
  try {
    const url = new URL(String(candidate || ""));
    const host = url.hostname.toLowerCase();
    const isOwnDomain = host === "oneluxstay.com" || host.endsWith(".oneluxstay.com");
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if ((isOwnDomain && url.protocol === "https:") || (isLocal && url.protocol === "http:")) {
      return url.origin;
    }
  } catch {
    // fall through to the public site
  }
  return fallback;
};

const splitName = (guest = {}) => {
  const first = clean(guest.firstName, 120);
  const last = clean(guest.lastName, 120);
  if (first || last) return { first, last };
  const parts = clean(guest.fullName, 240).split(" ").filter(Boolean);
  return { first: parts.shift() || "", last: parts.join(" ") };
};

// Pure check that a retrieved Stripe Checkout Session really is the saved-card step for
// this booking session. Kept free of I/O so it can be unit tested.
export const assertStripeSetupMatchesSession = ({ checkout, bookingSession }) => {
  const fail = (message, code) => Object.assign(new Error(message), { statusCode: 409, code });
  if (!checkout || !bookingSession) throw fail("Stripe session not found", "STRIPE_SESSION_NOT_FOUND");
  if (checkout.mode !== "setup") throw fail("Unexpected Stripe session type", "STRIPE_SESSION_INVALID");
  if (clean(checkout.metadata?.apaleoBookingSessionId, 120) !== clean(bookingSession.id, 120)) {
    throw fail("This Stripe session belongs to a different booking", "STRIPE_SESSION_MISMATCH");
  }
  const expected = clean(bookingSession.payment_metadata?.stripe?.checkoutSessionId, 200);
  if (!expected || expected !== clean(checkout.id, 200)) {
    throw fail("This Stripe session was not started for this booking", "STRIPE_SESSION_MISMATCH");
  }
  if (checkout.status !== "complete") throw fail("The card was not saved", "STRIPE_SETUP_INCOMPLETE");
  const setupIntent = checkout.setup_intent;
  if (!setupIntent || typeof setupIntent === "string" || setupIntent.status !== "succeeded") {
    throw fail("The card could not be verified", "STRIPE_SETUP_INCOMPLETE");
  }
  const paymentMethodId =
    typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id || "";
  if (!paymentMethodId) throw fail("No card was saved", "STRIPE_SETUP_INCOMPLETE");
  const customerId = typeof checkout.customer === "string" ? checkout.customer : checkout.customer?.id || "";
  return { customerId, setupIntentId: setupIntent.id, paymentMethodId };
};

const patchSession = (id, body) =>
  supabaseRestRequest(`apaleo_booking_sessions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { ...body, updated_at: new Date().toISOString() },
    prefer: "return=minimal",
  });

// Step 1: save the guest's details server-side (they leave the site for Stripe's page and
// the modal state is lost), create a Stripe Customer + hosted "save card" Checkout Session,
// and return its URL.
export const createStripeSetupCheckout = async ({ bookingSessionId, guest = {}, listingTitle = "", consent = null, origin = "" }) => {
  const session = await getBookingSession(bookingSessionId);
  if (!usesStripeForProperty(session.property_id)) {
    throw Object.assign(new Error("Stripe is not used for this property"), { statusCode: 409, code: "STRIPE_NOT_ENABLED" });
  }
  if (session.state === "CONFIRMED") {
    throw Object.assign(new Error("This booking is already confirmed"), { statusCode: 409, code: "ALREADY_CONFIRMED" });
  }
  const email = clean(guest.email, 240).toLowerCase();
  if (!email || !email.includes("@")) {
    throw Object.assign(new Error("A valid guest email is required"), { statusCode: 400, code: "GUEST_EMAIL_REQUIRED" });
  }
  const { first, last } = splitName(guest);
  const stripe = getStripeClient();
  const returnOrigin = resolveReturnOrigin(origin);
  const returnBase = `${returnOrigin}/booking-confirmation?bookingSessionId=${encodeURIComponent(session.id)}&provider=stripe`;
  const metadata = { apaleoBookingSessionId: session.id, propertyId: clean(session.property_id, 120) };

  const customer = await stripe.customers.create({
    email,
    name: [first, last].filter(Boolean).join(" ") || undefined,
    phone: clean(guest.phone, 60) || undefined,
    metadata,
  }, { idempotencyKey: `apaleo-customer-${session.id}` });

  const checkout = await stripe.checkout.sessions.create({
    mode: "setup",
    customer: customer.id,
    currency: clean(session.currency, 3).toLowerCase() || undefined,
    payment_method_types: ["card"],
    metadata,
    setup_intent_data: { metadata },
    success_url: `${returnBase}&stripe_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnBase}&cancelled=1`,
  });

  await patchSession(session.id, {
    payment_provider: "stripe",
    payment_state: "ACTION_REQUIRED",
    state: "PAYMENT_ACTION_REQUIRED",
    payment_metadata: {
      stripe: { customerId: customer.id, checkoutSessionId: checkout.id },
      // Needed to finish the booking after the redirect; removed once the booking is confirmed.
      pending: { guest, listingTitle: clean(listingTitle, 240), consent },
    },
  });

  return { url: checkout.url, checkoutSessionId: checkout.id };
};

// Step 2: after Stripe confirms the card was saved (guest returned, or webhook), verify it
// directly with Stripe, mark the session payment as satisfied and create the Apaleo
// reservation through the same api-booking-confirm path the Adyen flow uses.
export const completeStripeSetupBooking = async ({ bookingSessionId, checkoutSessionId }) => {
  let session = await getBookingSession(bookingSessionId);
  if (session.state === "CONFIRMED") return { status: 200, body: { bookingSessionId: session.id, state: "CONFIRMED",
    apaleoBookingId: session.apaleo_booking_id, reservationIds: session.apaleo_reservation_ids } };

  const stripe = getStripeClient();
  const checkout = await stripe.checkout.sessions.retrieve(clean(checkoutSessionId, 200), { expand: ["setup_intent"] });
  const verified = assertStripeSetupMatchesSession({ checkout, bookingSession: session });

  const existing = session.payment_metadata || {};
  await patchSession(session.id, {
    payment_provider: "stripe",
    payment_state: "AUTHORIZED",
    state: "READY_TO_BOOK",
    payment_reference: verified.setupIntentId,
    payment_metadata: { ...existing, stripe: { ...(existing.stripe || {}), ...verified } },
  });

  const pending = existing.pending || {};
  if (!pending.guest) {
    throw Object.assign(new Error("Guest details for this booking were not found"), { statusCode: 409, code: "GUEST_DETAILS_MISSING" });
  }
  const { handler: confirmHandler } = await import("../api-booking-confirm.js");
  const confirmed = await confirmHandler({
    httpMethod: "POST",
    body: JSON.stringify({ bookingSessionId: session.id, guest: pending.guest, listingTitle: pending.listingTitle, consent: pending.consent }),
  });
  const body = JSON.parse(confirmed.body || "{}");
  if (confirmed.statusCode < 300) {
    session = await getBookingSession(session.id);
    // The guest's personal details and signature are no longer needed here.
    await patchSession(session.id, {
      payment_metadata: { ...(session.payment_metadata || {}), pending: undefined },
    }).catch(() => {});
  }
  return { status: confirmed.statusCode, body };
};
