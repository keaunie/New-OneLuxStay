import { jsonResponse, readJsonBody, getPublicWebsiteUrl } from "./_shared/http.js";
import { getBookingSession, minorToMajor } from "./_shared/apaleoBookingService.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";
import {
  buildConsentPdf,
  writeConsentProof,
  writeConsentPdf,
  sendReservationEmail,
  formatCurrencyValue,
  escapeHtml,
} from "./_shared/consentProofService.js";

// While the Adyen payment gateway is paused (see src/config/paymentsConfig.js),
// guests still complete guest details + signed consent in ApaleoCheckoutModal, but
// this endpoint replaces api-booking-confirm.js: it never calls Apaleo's live
// /booking/v1/bookings (that requires an AUTHORIZED payment or a PM6Hold guarantee),
// it just records the signed consent and emails the reservations team so an admin
// can call the guest and finish the booking manually.
const RESERVATIONS_COPY_EMAIL = "reservations@oneluxstay.com";

const clean = (value = "", max = 300) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const splitName = (value) => {
  const parts = clean(value, 180).split(" ").filter(Boolean);
  return { firstName: parts.shift() || "Guest", lastName: parts.join(" ") };
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });

  try {
    const body = readJsonBody(event);
    const session = await getBookingSession(body.bookingSessionId);

    const guest = body.guest || {};
    const name = splitName(guest.fullName || `${guest.firstName || ""} ${guest.lastName || ""}`);
    const email = clean(guest.email, 240).toLowerCase();
    if (!email || !email.includes("@")) return jsonResponse(400, { message: "A valid guest email is required" });
    const phone = clean(guest.phone, 60);
    const guestName = `${name.firstName} ${name.lastName}`.trim();

    const listingTitle = clean(body.listingTitle, 240);
    const amount = minorToMajor(session.quoted_total_minor, session.currency);
    const currency = session.currency;
    const formattedAmount = formatCurrencyValue(amount, currency);

    const consent = body.consent || {};
    const consentSignerName = clean(consent.signerName, 180) || guestName;
    const consentSignatureDataUrl = typeof consent.signatureDataUrl === "string" ? consent.signatureDataUrl : "";
    const consentAcceptedAt = consent.acceptedAt || new Date().toISOString();
    const consentText = typeof consent.consentText === "string" ? consent.consentText : "";

    const consentFields = {
      confirmationId: session.id, reservationId: session.id, listingTitle,
      checkIn: session.arrival, checkOut: session.departure, guests: session.adults,
      amount, currency, guestName, guestEmail: email,
      consentText, consentAcceptedAt, consentSignerName, consentSignatureDataUrl,
    };

    let consentPdfUrl = "";
    let consentPdfBytes = null;
    try {
      await writeConsentProof(session.id, consentFields);
      consentPdfBytes = await buildConsentPdf(consentFields);
      const consentPdfToken = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 16)}`;
      const stored = await writeConsentPdf(consentPdfToken, consentPdfBytes, { sessionId: session.id });
      if (stored) {
        consentPdfUrl = `${getPublicWebsiteUrl()}/.netlify/functions/consent-proof?token=${encodeURIComponent(consentPdfToken)}`;
      } else {
        consentPdfBytes = null;
      }
    } catch (error) {
      console.error("[api-booking-manual-request] consent proof failed", { sessionId: session.id, message: error?.message || String(error) });
      consentPdfBytes = null;
    }

    await supabaseRestRequest(`apaleo_booking_sessions?id=eq.${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      body: { state: "MANUAL_REQUEST_PENDING", updated_at: new Date().toISOString() },
      prefer: "return=minimal",
    }).catch((error) => {
      console.error("[api-booking-manual-request] session patch failed", { sessionId: session.id, message: error?.message || String(error) });
    });

    const emailHtml = `
      <p><strong>New reservation request — online payment is paused, please finalize manually.</strong></p>
      <p><strong>Guest:</strong> ${escapeHtml(guestName || "Guest")}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
      <p><strong>Listing:</strong> ${escapeHtml(listingTitle || "OneLuxStay stay")}</p>
      <p><strong>Check-in:</strong> ${escapeHtml(session.arrival)}</p>
      <p><strong>Check-out:</strong> ${escapeHtml(session.departure)}</p>
      <p><strong>Guests:</strong> ${escapeHtml(String(Number(session.adults) || 1))}</p>
      <p><strong>Quoted total:</strong> ${escapeHtml(formattedAmount)}</p>
      ${consentPdfUrl ? `<p><strong>Signed consent:</strong> <a href="${consentPdfUrl}" target="_blank" rel="noreferrer">Download PDF</a></p>` : ""}
      <p>Call or email the guest to collect payment and confirm this reservation in Apaleo directly.</p>
    `;
    const emailResult = await sendReservationEmail({
      to: [RESERVATIONS_COPY_EMAIL],
      subject: `Reservation request — ${listingTitle || "OneLuxStay"} (${session.arrival} to ${session.departure})`,
      html: emailHtml,
      ...(consentPdfUrl && consentPdfBytes
        ? { attachments: [{ filename: `consent-${session.id}.pdf`, content: Buffer.from(consentPdfBytes).toString("base64") }] }
        : {}),
    });

    return jsonResponse(201, { bookingSessionId: session.id, consentPdfUrl, emailSent: !emailResult?.skipped });
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "MANUAL_REQUEST_FAILED" });
  }
}
