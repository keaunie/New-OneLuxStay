import { useState } from "react";
import { createApaleoStripeCheckout } from "../../services/apaleoBookingApi";

// Payment step for properties that save the guest's card through Stripe instead of Adyen
// (currently Dubai). Nothing is charged here: the guest's details and signed consent are
// saved on the server, then the guest is sent to Stripe's own secure page to save a card.
// Stripe sends them back to /booking-confirmation, where the booking is finished.
export default function StripePaymentPanel({ flow, guest, listingTitle, buildConsent, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const handleSaveCard = async () => {
    if (busy || !flow.session?.id) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await createApaleoStripeCheckout({
        bookingSessionId: flow.session.id,
        guest,
        listingTitle,
        consent: buildConsent(),
        origin: window.location.origin,
      });
      if (!result?.url) throw new Error("Could not open the secure card page.");
      window.location.assign(result.url);
    } catch (err) {
      setMessage(err?.message || "Could not open the secure card page. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="apaleo-checkout-modal__no-payment">
      <p>
        <strong>You won&rsquo;t be charged now.</strong> To secure your stay, we&rsquo;ll ask you to save a card on
        Stripe&rsquo;s secure page. Your card details go straight to Stripe and are never stored on our website.
      </p>
      <button
        type="button"
        className="apaleo-checkout-modal__submit"
        onClick={handleSaveCard}
        disabled={busy || disabled}
      >
        {busy ? "Opening secure page…" : "Save card securely with Stripe"}
      </button>
      {message && <p className="apaleo-checkout-modal__error">{message}</p>}
      <p className="apaleo-checkout-modal__field-hint">
        You&rsquo;ll return here automatically and your booking will be confirmed.
      </p>
    </div>
  );
}
