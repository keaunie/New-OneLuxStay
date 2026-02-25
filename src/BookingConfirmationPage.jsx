import { Link, useLocation } from "react-router-dom";
import { useMemo } from "react";
import "./App.css";

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

const BookingConfirmationPage = () => {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const confirmationId = params.get("confirmationId") || "";
  const email = params.get("email") || "";
  const emailSent = params.get("emailSent") === "1";
  const listingTitle = params.get("listingTitle") || "";
  const checkIn = params.get("checkIn") || "";
  const checkOut = params.get("checkOut") || "";
  const guests = params.get("guests") || "";
  const amount = params.get("amount") || "0";
  const currency = params.get("currency") || "USD";
  const totalLabel = formatCurrency(amount, currency);

  return (
    <div className="ack-page">
      <div className="ack-card">
        <header className="ack-card__header">
          <p className="ack-card__kicker">OneLuxStay</p>
          <h1>Thank You</h1>
          <p className="ack-card__sub">
            Your booking has been confirmed and no payment was required for this reservation.
          </p>
        </header>

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
            {confirmationId && <li>Confirmation ID: {confirmationId}</li>}
            {listingTitle && <li>Listing: {listingTitle}</li>}
            {checkIn && <li>Check-in: {checkIn}</li>}
            {checkOut && <li>Check-out: {checkOut}</li>}
            {guests && <li>Guests: {guests}</li>}
            <li>Total charged: {totalLabel}</li>
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
