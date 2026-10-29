import "./BookingTrustNote.css";

// Shown under the price breakdown in every city booking panel so guests see the
// cancellation terms and why to book direct before they open the checkout — the
// policy was previously only reachable through a link inside the checkout's
// signature step. Keep the wording in sync with src/TermsConditions.jsx.
export const CANCELLATION_SUMMARY =
  "Free cancellation for 1 hour after booking. After that: 50% charged if you cancel 31+ days before arrival, 75% at 15–30 days, 100% within 14 days.";

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
