import { jsonResponse, readJsonBody, getPublicWebsiteUrl } from "./_shared/http.js";
import { apaleoRequest } from "./_shared/apaleoService.js";
import { getBookingSession, minorToMajor, revalidateBookingSession } from "./_shared/apaleoBookingService.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";
import {
  buildConsentPdf,
  writeConsentProof,
  writeConsentPdf,
  sendReservationEmail,
  formatCurrencyValue,
  escapeHtml,
} from "./_shared/consentProofService.js";

const RESERVATIONS_COPY_EMAIL = "reservations@oneluxstay.com";

const clean = (value = "", max = 300) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const splitName = (value) => {
  const parts = clean(value, 180).split(" ").filter(Boolean);
  return { firstName: parts.shift() || "Guest", lastName: parts.join(" ") };
};
const nightCount = (arrival, departure) => Math.round((Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`)) / 86400000);

// Persists a consent record/PDF and emails the guest, mirroring what the legacy
// Guesty/Stripe flow does in check-units.js (handleFreeCheckout/handleCheckoutSuccess),
// via the shared consentProofService.js so both flows produce the same artifacts.
// Best-effort: never lets a consent/email failure fail an already-confirmed booking.
const recordConsentAndNotify = async ({ session, bookingId, reservationIds, guest, name, email, listingTitle, consent }) => {
  try {
    const consentSignerName = clean(consent?.signerName, 180) || `${name.firstName} ${name.lastName}`.trim();
    const consentSignatureDataUrl = typeof consent?.signatureDataUrl === "string" ? consent.signatureDataUrl : "";
    const consentAcceptedAt = consent?.acceptedAt || new Date().toISOString();
    const consentText = typeof consent?.consentText === "string" ? consent.consentText : "";
    const amount = minorToMajor(session.quoted_total_minor, session.currency);
    const currency = session.currency;

    await writeConsentProof(session.id, {
      confirmationId: session.id,
      reservationId: reservationIds[0] || bookingId,
      listingTitle, checkIn: session.arrival, checkOut: session.departure,
      guests: session.adults, amount, currency,
      guestName: `${name.firstName} ${name.lastName}`.trim(), guestEmail: email,
      consentText, consentAcceptedAt, consentSignerName, consentSignatureDataUrl,
    });

    const consentPdfBytes = await buildConsentPdf({
      confirmationId: session.id, reservationId: reservationIds[0] || bookingId,
      listingTitle, checkIn: session.arrival, checkOut: session.departure,
      guests: session.adults, amount, currency,
      guestName: `${name.firstName} ${name.lastName}`.trim(), guestEmail: email,
      consentText, consentAcceptedAt, consentSignerName, consentSignatureDataUrl,
    });
    const consentPdfToken = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`;
    const stored = await writeConsentPdf(consentPdfToken, consentPdfBytes, { sessionId: session.id, bookingId });
    const consentPdfUrl = stored
      ? `${getPublicWebsiteUrl()}/.netlify/functions/consent-proof?token=${encodeURIComponent(consentPdfToken)}`
      : "";

    const formattedAmount = formatCurrencyValue(amount, currency);
    const emailHtml = `
      <p>Hi ${escapeHtml(name.firstName || "Guest")},</p>
      <p>Your reservation is confirmed.</p>
      <p><strong>Confirmation ID:</strong> ${escapeHtml(session.id)}</p>
      ${reservationIds[0] ? `<p><strong>Reservation ID:</strong> ${escapeHtml(reservationIds[0])}</p>` : ""}
      <p><strong>Listing:</strong> ${escapeHtml(listingTitle || "OneLuxStay stay")}</p>
      <p><strong>Check-in:</strong> ${escapeHtml(session.arrival)}</p>
      <p><strong>Check-out:</strong> ${escapeHtml(session.departure)}</p>
      <p><strong>Guests:</strong> ${escapeHtml(String(Number(session.adults) || 1))}</p>
      <p><strong>Total charged:</strong> ${escapeHtml(formattedAmount)}</p>
      ${consentPdfUrl ? `<p><strong>Consent proof PDF:</strong> <a href="${consentPdfUrl}" target="_blank" rel="noreferrer">Download PDF</a></p>` : ""}
    `;
    const emailResult = await sendReservationEmail({
      to: [email, RESERVATIONS_COPY_EMAIL],
      subject: "Your OneLuxStay reservation is confirmed",
      html: emailHtml,
      ...(consentPdfUrl && stored
        ? { attachments: [{ filename: `consent-proof-${reservationIds[0] || session.id}.pdf`, content: Buffer.from(consentPdfBytes).toString("base64") }] }
        : {}),
    });

    return { consentPdfUrl, emailSent: !emailResult?.skipped };
  } catch (error) {
    console.error("[api-booking-confirm] consent/email follow-up failed", {
      bookingSessionId: session?.id, message: error?.message || String(error),
    });
    return { consentPdfUrl: "", emailSent: false };
  }
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });
  let session;
  try {
    const body = readJsonBody(event);
    session = await getBookingSession(body.bookingSessionId);
    if (session.state === "CONFIRMED") return jsonResponse(200, { bookingSessionId: session.id, apaleoBookingId: session.apaleo_booking_id, reservationIds: session.apaleo_reservation_ids });
    const checked = await revalidateBookingSession(session.id);
    if (checked.changed) return jsonResponse(409, { message: "The offer changed and requires guest approval", code: "PRICE_CHANGED", session: checked.session });
    session = checked.session;
    if (session.guarantee_type !== "PM6Hold" && session.payment_state !== "AUTHORIZED") return jsonResponse(409, { message: "Payment requirements have not been satisfied", code: "PAYMENT_REQUIRED" });
    const claimed = await supabaseRestRequest("rpc/claim_apaleo_booking_session", { method: "POST", body: { session_id: session.id } });
    session = Array.isArray(claimed) ? claimed[0] : null;
    if (!session) return jsonResponse(409, { message: "Booking is already being processed", code: "DUPLICATE_SUBMISSION" });

    const guest = body.guest || {};
    const name = splitName(guest.fullName || `${guest.firstName || ""} ${guest.lastName || ""}`);
    const email = clean(guest.email, 240).toLowerCase();
    if (!email || !email.includes("@")) return jsonResponse(400, { message: "A valid guest email is required" });
    const primaryGuest = { firstName: name.firstName, ...(name.lastName ? { lastName: name.lastName } : {}), email,
      ...(clean(guest.phone, 60) ? { phone: clean(guest.phone, 60) } : {}) };
    const countryCode = clean(guest.countryCode, 2).toUpperCase();
    const address = {
      addressLine1: clean(guest.addressLine1, 240), postalCode: clean(guest.postalCode, 40),
      city: clean(guest.city, 120), countryCode,
    };
    if (!address.addressLine1 || !address.postalCode || !address.city || !/^[A-Z]{2}$/.test(countryCode)) {
      return jsonResponse(400, { message: "A complete guest address and two-letter country code are required" });
    }
    const paymentMetadata = session.payment_metadata || {};
    const reservation = {
      arrival: session.arrival, departure: session.departure, adults: session.adults,
      ...(session.children_ages?.length ? { childrenAges: session.children_ages } : {}),
      channelCode: "Ibe", primaryGuest, guaranteeType: session.guarantee_type,
      timeSlices: Array.from({ length: nightCount(session.arrival, session.departure) }, () => ({ ratePlanId: session.rate_plan_id })),
      ...(session.selected_services?.length ? { services: session.selected_services.map((service) => ({ serviceId: service.serviceId })) } : {}),
      ...(session.guarantee_type === "Prepayment" ? {
        prePaymentAmount: { amount: minorToMajor(session.prepayment_minor, session.currency), currency: session.currency },
      } : {}),
    };
    const bookingRequest = {
      booker: { ...primaryGuest, address }, reservations: [reservation],
      ...(session.guarantee_type === "Prepayment" && session.payment_reference ? { transactionReference: session.payment_reference } : {}),
      ...(session.guarantee_type === "CreditCard" && paymentMetadata.payerReference && paymentMetadata.storedPaymentMethodId ? {
        paymentAccount: { payerReference: paymentMetadata.payerReference, storedPaymentMethodId: paymentMetadata.storedPaymentMethodId },
      } : {}),
    };
    const response = await apaleoRequest("/booking/v1/bookings", { method: "POST", body: bookingRequest, retries: 0, timeoutMs: 30000 });
    const bookingId = clean(response?.payload?.id, 120);
    const reservationIds = (response?.payload?.reservations || []).map((item) => clean(item?.id, 120)).filter(Boolean);
    await supabaseRestRequest(`apaleo_booking_sessions?id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", body: {
      state: "CONFIRMED", apaleo_booking_id: bookingId, apaleo_reservation_ids: reservationIds,
      sanitized_apaleo_response: { id: bookingId, reservations: reservationIds.map((id) => ({ id })) },
      confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, prefer: "return=minimal" });
    const { consentPdfUrl, emailSent } = await recordConsentAndNotify({
      session, bookingId, reservationIds, guest, name, email,
      listingTitle: clean(body.listingTitle, 240), consent: body.consent,
    });
    return jsonResponse(201, { bookingSessionId: session.id, apaleoBookingId: bookingId, reservationIds, consentPdfUrl, emailSent });
  } catch (error) {
    if (session?.id && session?.payment_state === "AUTHORIZED") {
      const ambiguous = /abort|timeout|fetch failed/i.test(String(error?.message || ""));
      await supabaseRestRequest(`apaleo_booking_sessions?id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", body: {
        state: ambiguous ? "PAYMENT_AUTHORIZED_BOOKING_UNKNOWN" : "PAYMENT_AUTHORIZED_BOOKING_FAILED", updated_at: new Date().toISOString(),
      }, prefer: "return=minimal" }).catch(() => {});
    }
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "BOOKING_CONFIRMATION_FAILED" });
  }
}
