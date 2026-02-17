import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./App.css";
import apiBase from "./utils/apiBase";

const defaultConsentText =
  "By continuing, you authorize OneLuxStay to charge the total amount shown for your reservation. A receipt will be emailed to you.";

const useQuery = () => {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

const AcknowledgementPage = () => {
  const query = useQuery();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const consentText = query.get("consent") || defaultConsentText;
  const listingId = query.get("listingId") || "";
  const reservationId = query.get("reservationId") || "";
  const checkIn = query.get("checkIn") || "";
  const checkOut = query.get("checkOut") || "";
  const amount = query.get("amount") || "";
  const city = query.get("city") || "";

  const today = formatDate(new Date());

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!accepted) {
      setError("Please confirm the authorization before continuing.");
      return;
    }
    if (!fullName.trim() || !email.trim()) {
      setError("Please provide your name and email address.");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch(`${apiBase}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          acceptedAt: new Date().toISOString(),
          consentText,
          listingId,
          reservationId,
          checkIn,
          checkOut,
          amount,
          city,
          userAgent: navigator.userAgent,
          page: window.location.href,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.message || "Unable to save acknowledgement.");
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err.message || "Unable to save acknowledgement.");
    }
  };

  return (
    <div className="ack-page">
      <div className="ack-card">
        <header className="ack-card__header">
          <p className="ack-card__kicker">OneLuxStay</p>
          <h1>Authorization Acknowledgement</h1>
          <p className="ack-card__sub">
            Please confirm the authorization below. A receipt will be emailed to you.
          </p>
        </header>

        <form className="ack-form" onSubmit={handleSubmit}>
          <label className="ack-field">
            <span>Full name</span>
            <input
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your full name"
              required
            />
          </label>

          <label className="ack-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              required
            />
          </label>

          <label className="ack-field">
            <span>Date</span>
            <input type="text" value={today} readOnly />
          </label>

          <label className="ack-consent">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>{consentText}</span>
          </label>

          {(listingId || reservationId || checkIn || checkOut || amount || city) && (
            <div className="ack-details">
              <p>Reservation details</p>
              <ul>
                {reservationId && <li>Reservation ID: {reservationId}</li>}
                {listingId && <li>Listing ID: {listingId}</li>}
                {city && <li>City: {city}</li>}
                {checkIn && <li>Check-in: {checkIn}</li>}
                {checkOut && <li>Check-out: {checkOut}</li>}
                {amount && <li>Total: {amount}</li>}
              </ul>
            </div>
          )}

          {error && <p className="ack-error">{error}</p>}

          <button type="submit" disabled={status === "submitting" || !accepted}>
            {status === "submitting" ? "Submitting..." : "Acknowledge & Continue"}
          </button>
        </form>

        {status === "success" && (
          <div className="ack-success">
            <p>Thank you. Your authorization has been recorded.</p>
            <p>A receipt has been sent to your email address.</p>
            <Link to="/">Return to OneLuxStay</Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcknowledgementPage;
