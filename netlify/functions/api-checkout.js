import { getAvailabilityAndPricing } from "./_shared/guestyService.js";
import { jsonResponse, readJsonBody, getBaseUrl, sanitizeInternalPath, withBookingSearchParams } from "./_shared/http.js";
import { calculatePrice } from "./_shared/pricingService.js";
import { getStripeClient, toStripeAmount } from "./_shared/stripeCheckoutService.js";

const buildSuccessUrl = (baseUrl, summary = {}) => {
  const query = new URLSearchParams({
    mode: "paid",
    session_id: "{CHECKOUT_SESSION_ID}",
    email: String(summary.email || ""),
    listingTitle: String(summary.listingTitle || ""),
    checkIn: String(summary.checkIn || ""),
    checkOut: String(summary.checkOut || ""),
    guests: String(summary.guests || ""),
    amount: String(summary.amount ?? ""),
    currency: String(summary.currency || "USD"),
  });
  return `${baseUrl}/booking-confirmation?${query.toString()}`;
};

const isLocalDebugRequest = (event = {}) => {
  const headers = event.headers || {};
  const values = [
    headers.host,
    headers.Host,
    headers.origin,
    headers.Origin,
    headers.referer,
    headers.referrer,
    process.env.URL,
    process.env.DEPLOY_URL,
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  return (
    String(process.env.CONTEXT || "").toLowerCase() === "dev" ||
    String(process.env.NODE_ENV || "").toLowerCase() !== "production" ||
    values.some((value) => value.includes("localhost") || value.includes("127.0.0.1"))
  );
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  let body;
  try {
    body = readJsonBody(event);
  } catch {
    return jsonResponse(400, { message: "Invalid JSON body" });
  }

  const propertyId = String(body.property_id || body.propertyId || body.listingId || "").trim();
  const checkIn = String(body.check_in || body.checkIn || "").trim();
  const checkOut = String(body.check_out || body.checkOut || "").trim();
  const guests = Math.max(1, Number(body.guests || 1) || 1);
  const listingTitle = String(body.listing_title || body.listingTitle || "OneLuxStay stay").trim();
  const guest = body.guest || body.guest_info || {};
  const guestEmail = String(guest.email || body.guest_email || "").trim();

  if (!propertyId || !checkIn || !checkOut) {
    return jsonResponse(400, { message: "Missing property_id, check_in, or check_out" });
  }
  if (!guestEmail) {
    return jsonResponse(400, { message: "Guest email is required" });
  }

  let availability;
  try {
    availability = await getAvailabilityAndPricing({
      propertyId,
      checkIn,
      checkOut,
      guests,
    });
  } catch (error) {
    return jsonResponse(502, {
      message: "Unable to validate availability before checkout",
      error: error?.message || String(error),
    });
  }

  if (!availability.available) {
    return jsonResponse(409, {
      message: "Property is not available for the selected dates",
    });
  }

  const calculatedPrice = calculatePrice({
    nightlyRate: availability.nightlyRate,
    numberOfNights: availability.nights,
    cleaningFee: availability.cleaningFee,
    taxes: availability.taxes,
    currency: availability.currency,
  });

  const clientGrandTotal = Number(
    body?.calculated_price?.grand_total ??
      body?.calculatedPrice?.grand_total ??
      body?.price?.grand_total ??
      body?.price?.grandTotal,
  );
  if (Number.isFinite(clientGrandTotal) && Math.abs(clientGrandTotal - calculatedPrice.grand_total) >= 0.5) {
    return jsonResponse(409, {
      message: "Pricing changed. Refresh availability and try again.",
      calculated_price: calculatedPrice,
    });
  }

  const stripeAmount = toStripeAmount(calculatedPrice.grand_total, calculatedPrice.currency);
  if (!stripeAmount) {
    return jsonResponse(400, { message: "Invalid checkout amount" });
  }

  const debugMode = isLocalDebugRequest(event);
  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    const detail = error?.message || String(error);
    return jsonResponse(502, {
      message: debugMode ? `Unable to create Stripe checkout session: ${detail}` : "Unable to create Stripe checkout session",
      error: detail,
    });
  }

  const baseUrl = getBaseUrl(event);
  const returnTo = withBookingSearchParams(
    sanitizeInternalPath(body.cancelPath) || "/",
    { checkIn, checkOut, guests },
  );
  const cancelUrl = `${baseUrl}/checkout-cancelled?returnTo=${encodeURIComponent(returnTo)}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: guestEmail,
      client_reference_id: propertyId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: calculatedPrice.currency.toLowerCase(),
            unit_amount: stripeAmount,
            product_data: {
              name: listingTitle || "OneLuxStay booking",
              description: `${checkIn} to ${checkOut} • ${guests} guest${guests === 1 ? "" : "s"}`,
            },
          },
        },
      ],
      success_url: buildSuccessUrl(baseUrl, {
        email: guestEmail,
        listingTitle,
        checkIn,
        checkOut,
        guests,
        amount: calculatedPrice.grand_total,
        currency: calculatedPrice.currency,
      }),
      cancel_url: cancelUrl,
      metadata: {
        property_id: propertyId,
        listing_title: listingTitle,
        check_in: checkIn,
        check_out: checkOut,
        guests: String(guests),
        guest_first_name: String(guest.firstName || ""),
        guest_last_name: String(guest.lastName || ""),
        guest_email: guestEmail,
        guest_phone: String(guest.phone || ""),
        nightly_rate: String(calculatedPrice.nightly_rate),
        room_total: String(calculatedPrice.room_total),
        fees: String(calculatedPrice.fees),
        cleaning_fee: String(calculatedPrice.cleaning_fee),
        taxes: String(calculatedPrice.taxes),
        deposit_amount: String(calculatedPrice.deposit),
        grand_total: String(calculatedPrice.grand_total),
        currency: calculatedPrice.currency,
      },
    });

    return jsonResponse(200, {
      url: session.url,
      checkout_url: session.url,
      session_id: session.id,
      calculated_price: calculatedPrice,
    });
  } catch (error) {
    const detail = error?.message || String(error);
    console.error("Stripe checkout session creation failed", {
      propertyId,
      checkIn,
      checkOut,
      guests,
      currency: calculatedPrice.currency,
      amount: calculatedPrice.grand_total,
      error: detail,
    });
    return jsonResponse(502, {
      message: debugMode ? `Unable to create Stripe checkout session: ${detail}` : "Unable to create Stripe checkout session",
      error: detail,
    });
  }
}
