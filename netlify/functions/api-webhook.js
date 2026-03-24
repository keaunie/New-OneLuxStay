import { jsonResponse, getHeaderValue } from "./_shared/http.js";
import { getStripeClient, parseWebhookSecrets } from "./_shared/stripeCheckoutService.js";
import { createBooking } from "./_shared/guestyService.js";
import { getBookingByCheckoutSessionId, upsertBooking } from "./_shared/supabaseService.js";

const PROCESSING_STALE_MS = 10 * 60 * 1000;

const buildGuest = (metadata = {}, customerDetails = {}) => ({
  firstName: metadata.guest_first_name || customerDetails.name?.split(/\s+/)[0] || "Guest",
  lastName:
    metadata.guest_last_name ||
    customerDetails.name?.split(/\s+/).slice(1).join(" ") ||
    "Guest",
  email: metadata.guest_email || customerDetails.email || "",
  phone: metadata.guest_phone || customerDetails.phone || "",
});

const buildBookingRecord = ({
  session,
  eventId,
  bookingStatus,
  guestyReservationId,
} = {}) => {
  const metadata = session?.metadata || {};
  const customerDetails = session?.customer_details || {};
  const guestName =
    [metadata.guest_first_name, metadata.guest_last_name].filter(Boolean).join(" ").trim() ||
    customerDetails.name ||
    "Guest";
  const paymentIntent =
    typeof session?.payment_intent === "string"
      ? session.payment_intent
      : session?.payment_intent?.id || null;

  return {
    property_id: String(metadata.property_id || session?.client_reference_id || ""),
    check_in: String(metadata.check_in || ""),
    check_out: String(metadata.check_out || ""),
    guest_name: guestName,
    guest_email: metadata.guest_email || customerDetails.email || "",
    total_amount: Number(metadata.grand_total || 0) || 0,
    currency: String(metadata.currency || session?.currency || "USD").toUpperCase(),
    stripe_checkout_session_id: String(session?.id || ""),
    stripe_payment_intent_id: paymentIntent,
    stripe_event_id: String(eventId || ""),
    guesty_reservation_id: guestyReservationId || null,
    booking_status: bookingStatus,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

const constructStripeEvent = (event) => {
  const stripe = getStripeClient();
  const signature = getHeaderValue(event, "stripe-signature");
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
  const secrets = parseWebhookSecrets();

  if (!signature || !secrets.length) {
    throw new Error("Missing Stripe webhook configuration");
  }

  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      // try next secret
    }
  }

  throw new Error("Invalid Stripe webhook signature");
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  let stripeEvent;
  try {
    stripeEvent = constructStripeEvent(event);
  } catch (error) {
    return jsonResponse(400, {
      message: "Webhook verification failed",
      error: error?.message || String(error),
    });
  }

  if (
    stripeEvent.type !== "checkout.session.completed" &&
    stripeEvent.type !== "checkout.session.async_payment_succeeded"
  ) {
    return jsonResponse(200, { received: true, ignored: true, type: stripeEvent.type });
  }

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(stripeEvent.data.object.id, {
    expand: ["payment_intent"],
  });

  if (String(session?.payment_status || "").toLowerCase() !== "paid") {
    return jsonResponse(200, {
      received: true,
      ignored: true,
      reason: "session_not_paid",
      session_id: session?.id || "",
    });
  }

  const existing = await getBookingByCheckoutSessionId(session.id);
  if (existing?.guesty_reservation_id) {
    return jsonResponse(200, {
      received: true,
      already_processed: true,
      session_id: session.id,
      guesty_reservation_id: existing.guesty_reservation_id,
    });
  }

  const updatedAt = Date.parse(existing?.updated_at || "");
  const isProcessingFresh =
    existing?.booking_status === "processing" &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt < PROCESSING_STALE_MS;

  if (isProcessingFresh) {
    return jsonResponse(200, {
      received: true,
      already_processing: true,
      session_id: session.id,
    });
  }

  const processingRecord = buildBookingRecord({
    session,
    eventId: stripeEvent.id,
    bookingStatus: "processing",
  });
  await upsertBooking(processingRecord);

  try {
    const metadata = session.metadata || {};
    const guest = buildGuest(metadata, session.customer_details || {});
    const booking = await createBooking({
      propertyId: metadata.property_id || session.client_reference_id,
      checkIn: metadata.check_in,
      checkOut: metadata.check_out,
      guest,
      price: {
        room_total: Number(metadata.room_total || 0) || 0,
        fees: Number(metadata.fees || 0) || 0,
        cleaning_fee: Number(metadata.cleaning_fee || 0) || 0,
        taxes: Number(metadata.taxes || 0) || 0,
        grand_total: Number(metadata.grand_total || 0) || 0,
        currency: metadata.currency || session.currency || "USD",
      },
    });

    const completedRecord = buildBookingRecord({
      session,
      eventId: stripeEvent.id,
      bookingStatus: "confirmed",
      guestyReservationId: booking?._id || booking?.id || null,
    });
    await upsertBooking(completedRecord);

    return jsonResponse(200, {
      received: true,
      booked: true,
      session_id: session.id,
      guesty_reservation_id: completedRecord.guesty_reservation_id,
    });
  } catch (error) {
    await upsertBooking({
      ...processingRecord,
      booking_status: "failed",
      updated_at: new Date().toISOString(),
    });
    return jsonResponse(500, {
      message: "Failed to create Guesty booking",
      error: error?.message || String(error),
      session_id: session.id,
    });
  }
}
