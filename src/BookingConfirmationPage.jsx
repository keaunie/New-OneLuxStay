import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import apiBase from "./utils/apiBase";
import { submitApaleoPaymentDetails, getApaleoBookingConfirmation } from "./services/apaleoBookingApi";

const formatCurrency = (value, currency = "USD") => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "--";
  const normalized = String(currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalized,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${normalized} ${numeric.toFixed(2)}`;
  }
};

const buildCheckoutFinalizeUrls = (sessionId) => {
  const encodedSessionId = encodeURIComponent(String(sessionId || ""));
  const path = `/check-units/checkout-success?session_id=${encodedSessionId}`;
  const configured = apiBase ? `${apiBase}${path}` : "";

  // Prefer the configured internal functions base (Netlify site domain).
  return Array.from(new Set([configured].filter(Boolean)));
};

const formatFinalizeErrorMessage = (message, sessionId) => {
  const raw = String(message || "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "failed to fetch" || normalized === "fetch failed") {
    return `Unable to reach booking finalization service right now. Please refresh once. Session ID: ${sessionId}`;
  }
  return raw || "Unable to finalize paid checkout.";
};

const BookingConfirmationPage = () => {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [isFinalizingPaidCheckout, setIsFinalizingPaidCheckout] = useState(false);
  const [finalizeError, setFinalizeError] = useState("");

  const mode = params.get("mode") || "";
  const checkoutState = params.get("checkout") || "";
  const sessionId = params.get("session_id") || params.get("sessionId") || "";
  const confirmationId = params.get("confirmationId") || "";
  const reservationId = params.get("reservationId") || "";
  const email = params.get("email") || "";
  const emailSent = params.get("emailSent") === "1";
  const listingTitle = params.get("listingTitle") || "";
  const checkIn = params.get("checkIn") || "";
  const checkOut = params.get("checkOut") || "";
  const guests = params.get("guests") || "";
  const amount = params.get("amount") || "0";
  const currency = params.get("currency") || "USD";
  const consentProofUrl = params.get("consentProofUrl") || "";
  const totalLabel = formatCurrency(amount, currency);
  const isPaidBooking = mode === "paid" || Number(amount) > 0 || checkoutState === "success";

  // Apaleo/Adyen engine: set when api-booking-payments.js's `returnUrl` sends the guest
  // back here for a redirect-based payment method (e.g. iDEAL), rather than completing
  // inside the AdyenPaymentPanel overlay in ApaleoCheckoutModal.jsx. `redirectResult` is
  // Adyen's standard param for resuming a redirect payment.
  const bookingSessionId = params.get("bookingSessionId") || "";
  const redirectResult = params.get("redirectResult") || "";
  const [apaleoStatus, setApaleoStatus] = useState(bookingSessionId ? "finalizing" : "");
  const [apaleoConfirmation, setApaleoConfirmation] = useState(null);
  const [apaleoError, setApaleoError] = useState("");

  useEffect(() => {
    if (!bookingSessionId) return;
    let cancelled = false;

    const finalizeApaleoBooking = async () => {
      try {
        if (redirectResult) {
          await submitApaleoPaymentDetails({ bookingSessionId, details: { redirectResult } });
        }
        const deadline = Date.now() + 20_000;
        let result = null;
        while (Date.now() < deadline) {
          if (cancelled) return;
          result = await getApaleoBookingConfirmation(bookingSessionId);
          if (result?.state === "CONFIRMED") break;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        if (cancelled) return;
        if (result?.state === "CONFIRMED") {
          setApaleoConfirmation(result);
          setApaleoStatus("confirmed");
        } else {
          // Payment may have gone through, but guest details/consent captured in the
          // checkout modal don't survive a full-page redirect, so the server can't
          // auto-confirm on the guest's behalf. Known limitation — see
          // docs/apaleo-rollout-other-cities.md.
          setApaleoStatus("pending");
        }
      } catch (err) {
        if (!cancelled) {
          setApaleoError(err?.message || "Unable to finalize your booking.");
          setApaleoStatus("error");
        }
      }
    };

    finalizeApaleoBooking();
    return () => {
      cancelled = true;
    };
  }, [bookingSessionId, redirectResult]);

  useEffect(() => {
    if (checkoutState !== "success" || !sessionId) return;
    let cancelled = false;
    const finalize = async () => {
      setIsFinalizingPaidCheckout(true);
      setFinalizeError("");
      let lastError = "";
      try {
        const candidates = buildCheckoutFinalizeUrls(sessionId);
        for (const url of candidates) {
          let response;
          let payload = {};
          try {
            response = await fetch(url, {
              method: "GET",
              headers: { Accept: "application/json" },
            });
            payload = await response.json().catch(() => ({}));
          } catch (err) {
            lastError = err?.message || "fetch failed";
            continue;
          }

          if (!response.ok) {
            lastError =
              payload?.message ||
              payload?.error ||
              `Unable to finalize paid checkout (${response.status}).`;
            continue;
          }

          if (cancelled) return;
          if (typeof payload?.redirectUrl === "string" && payload.redirectUrl) {
            window.location.replace(payload.redirectUrl);
            return;
          }
          if (payload?.ok) {
            setIsFinalizingPaidCheckout(false);
            return;
          }

          lastError = "Unexpected checkout finalization response.";
        }

        throw new Error(lastError || "Unable to finalize paid checkout.");
      } catch (err) {
        if (!cancelled) {
          setFinalizeError(
            formatFinalizeErrorMessage(err?.message || "Unable to finalize paid checkout.", sessionId)
          );
          setIsFinalizingPaidCheckout(false);
        }
      }
    };
    finalize();
    return () => {
      cancelled = true;
    };
  }, [checkoutState, sessionId]);

  if (bookingSessionId) {
    return (
      <div className="ack-page">
        <div className="ack-card">
          <header className="ack-card__header">
            <p className="ack-card__kicker">OneLuxStay</p>
            <h1>{apaleoStatus === "confirmed" ? "Thank You" : "Almost there"}</h1>
          </header>
          {apaleoStatus === "finalizing" && (
            <div className="ack-success"><p>Finalizing your payment and booking. Please wait…</p></div>
          )}
          {apaleoStatus === "confirmed" && (
            <div className="ack-details">
              <p>Reservation details</p>
              <ul>
                <li>Booking session: {bookingSessionId}</li>
                {apaleoConfirmation?.apaleoBookingId && <li>Booking ID: {apaleoConfirmation.apaleoBookingId}</li>}
                {(apaleoConfirmation?.reservationIds || []).map((id) => <li key={id}>Reservation ID: {id}</li>)}
              </ul>
            </div>
          )}
          {apaleoStatus === "pending" && (
            <div className="ack-success">
              <p>Your payment is being processed. We&rsquo;ll email your confirmation shortly — please contact us if you don&rsquo;t hear back within a few minutes.</p>
            </div>
          )}
          {apaleoStatus === "error" && (
            <div className="ack-success"><p>{apaleoError}</p></div>
          )}
          <div className="ack-success">
            <Link to="/">Return to OneLuxStay</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ack-page">
      <div className="ack-card">
        <header className="ack-card__header">
          <p className="ack-card__kicker">OneLuxStay</p>
          <h1>Thank You</h1>
          <p className="ack-card__sub">
            {isPaidBooking
              ? "Your booking is being finalized after successful payment."
              : "Your booking has been confirmed and no payment was required for this reservation."}
          </p>
        </header>
        {isFinalizingPaidCheckout && (
          <div className="ack-success">
            <p>Finalizing your paid booking. Please wait...</p>
          </div>
        )}
        {finalizeError && (
          <div className="ack-success">
            <p>{finalizeError}</p>
          </div>
        )}

        <div className="ack-success">
          {emailSent ? (
            <p>
              A confirmation email has been sent to <strong>{email || "your email"}</strong>.
            </p>
          ) : (
            <p>
              Your booking is confirmed. We will send a confirmation email to{" "}
              <strong>{email || "your email"}</strong> shortly.
            </p>
          )}
        </div>

        <div className="ack-details">
          <p>Reservation details</p>
          <ul>
            {sessionId && <li>Stripe Session: {sessionId}</li>}
            {confirmationId && <li>Confirmation ID: {confirmationId}</li>}
            {reservationId && <li>Reservation ID: {reservationId}</li>}
            {listingTitle && <li>Listing: {listingTitle}</li>}
            {checkIn && <li>Check-in: {checkIn}</li>}
            {checkOut && <li>Check-out: {checkOut}</li>}
            {guests && <li>Guests: {guests}</li>}
            <li>Total charged: {totalLabel}</li>
            {consentProofUrl && (
              <li>
                Consent proof PDF:{" "}
                <a href={consentProofUrl} target="_blank" rel="noreferrer">
                  Download PDF
                </a>
              </li>
            )}
          </ul>
        </div>

        <div className="ack-success">
          <Link to="/">Return to OneLuxStay</Link>
        </div>
      </div>
    </div>
  );
};

export default BookingConfirmationPage;
