import "./BookingTrustNote.css";

// Shown under the price breakdown in every city booking panel so guests see the
// cancellation terms and why to book direct before they open the checkout — the
// policy was previously only reachable through a link inside the checkout's
// signature step. Mirrors the Apaleo "Flexible" cancellation policy that is
// actually applied to bookings; keep in sync with src/TermsConditions.jsx.
export const CANCELLATION_SUMMARY =
  "Free cancellation until 14 days before check-in. Cancelling within 14 days of check-in, or not showing up, is charged the full accommodation cost.";

export default function BookingTrustNote() {
  return (
    <div className="booking-trust-note">
      <p className="booking-trust-note__cancel">
        <strong>Cancellation:</strong> {CANCELLATION_SUMMARY}{" "}
        <a href="/terms" target="_blank" rel="noreferrer">Full terms</a>
      </p>
      <ul className="booking-trust-note__perks">
        <li>Book direct with OneLuxStay</li>
        <li>Secure payment</li>
        <li>Instant confirmation</li>
      </ul>
    </div>
  );
}

// Rate plans come from Apaleo with internal suffixes such as
// "Standard Rate (Jacob 1BR)"; guests only need the plan name.
export const formatRatePlanLabel = (label = "") =>
  String(label || "").replace(/\s*\([^)]*\)\s*$/, "").trim() || String(label || "");
