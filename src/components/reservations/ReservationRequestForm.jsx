import { useState } from "react";

const INITIAL_FORM = { name: "", email: "", phone: "", notes: "" };

const computeNights = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  const n = Math.round(
    (Date.parse(checkOut + "T00:00:00") - Date.parse(checkIn + "T00:00:00")) / 86_400_000,
  );
  return n > 0 ? n : 0;
};

export default function ReservationRequestForm({
  // Listing / property identifiers
  listingId,
  listingTitle,
  imageUrl,
  propertyId,
  propertyName,
  // Stay details
  city,
  checkIn,
  checkOut,
  guests,
}) {
  const [form,         setForm]         = useState(INITIAL_FORM);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState("");
  const [apaleoDetail, setApaleoDetail] = useState(null);  // raw Apaleo error for debugging
  const [success,      setSuccess]      = useState(null);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!form.email.trim()) {
      setError("Email address is required.");
      return;
    }
    if (!checkIn || !checkOut) {
      setError("Please select check-in and check-out dates before submitting.");
      return;
    }

    setError("");
    setApaleoDetail(null);
    setSubmitting(true);

    try {
      const res = await fetch("/.netlify/functions/apaleo-create-reservation", {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId:    listingId    || "",
          listingTitle: listingTitle || "",
          imageUrl:     imageUrl     || "",
          propertyId:   propertyId   || "",
          propertyName: propertyName || "",
          city:         city         || "",
          checkIn,
          checkOut,
          guests:     guests || 1,
          guestName:  form.name.trim(),
          guestEmail: form.email.trim(),
          guestPhone: form.phone.trim(),
          notes:      form.notes.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Capture the full Apaleo validation body so we can render it
        if (data?.apaleoError) setApaleoDetail(data.apaleoError);
        throw new Error(data?.message || data?.error || `Booking failed (${res.status}).`);
      }

      setSuccess(data);
      setForm(INITIAL_FORM);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    const ref = success.apaleoBookingId || success.apaleoReservationId || null;
    return (
      <div className="grp-form-success">
        <strong>Booking Confirmed!</strong>
        {ref && (
          <span style={{ display: "block", fontSize: 12, marginTop: 4, opacity: 0.75 }}>
            Reference: {ref}
          </span>
        )}
        Our team will follow up with your stay details shortly.
      </div>
    );
  }

  const nights = computeNights(checkIn, checkOut);

  return (
    <form className="grp-form" onSubmit={handleSubmit} noValidate>
      <div className="grp-form-group">
        <label className="grp-label">Full Name *</label>
        <input
          type="text"
          className="grp-input"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Jane Smith"
          required
          autoComplete="name"
        />
      </div>

      <div className="grp-form-group">
        <label className="grp-label">Email *</label>
        <input
          type="email"
          className="grp-input"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="jane@example.com"
          required
          autoComplete="email"
        />
      </div>

      <div className="grp-form-group">
        <label className="grp-label">Phone</label>
        <input
          type="tel"
          className="grp-input"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="+1 (555) 000-0000"
          autoComplete="tel"
        />
      </div>

      <div className="grp-form-group">
        <label className="grp-label">Special Requests</label>
        <textarea
          className="grp-textarea"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Any preferences or special requests…"
        />
      </div>

      {nights > 0 && (
        <p style={{ fontSize: 12, color: "#6b6560", margin: "0 0 4px" }}>
          {nights} night{nights !== 1 ? "s" : ""} · {guests || 1} guest{(guests || 1) !== 1 ? "s" : ""}
        </p>
      )}

      {error && (
        <div className="grp-form-error">
          <div>{error}</div>
          {apaleoDetail && (
            <pre style={{
              marginTop: 8,
              padding: "8px 10px",
              background: "rgba(0,0,0,0.06)",
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              overflowX: "auto",
              maxHeight: 200,
              overflowY: "auto",
            }}>
              {JSON.stringify(apaleoDetail, null, 2)}
            </pre>
          )}
        </div>
      )}

      <button type="submit" className="grp-submit-btn" disabled={submitting}>
        {submitting ? "Sending…" : "Request Reservation"}
      </button>
    </form>
  );
}
