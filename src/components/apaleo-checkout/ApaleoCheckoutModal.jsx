import { useEffect, useRef, useState } from "react";
import Stepper, { Step } from "../Stepper";
import useApaleoBookingFlow, { BOOKING_PHASE } from "../../hooks/useApaleoBookingFlow";
import DateOfferSearch from "./DateOfferSearch";
import AdyenPaymentPanel from "./AdyenPaymentPanel";
import StripePaymentPanel from "./StripePaymentPanel";
import { COUNTRIES } from "../../utils/countries";
import { PAYMENTS_DISABLED, PAYMENTS_DISABLED_CONTACT } from "../../config/paymentsConfig";
import { CANCELLATION_SUMMARY } from "../BookingTrustNote";

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const CONSENT_TEXT =
  "I authorize OneLuxStay to process this reservation and I accept the rental terms and policies, including the cancellation policy.";

const emptyGuest = { firstName: "", lastName: "", email: "", phone: "", addressLine1: "", postalCode: "", city: "", countryCode: "" };

function ConfirmationPanel({ confirmation, listingTitle, onClose }) {
  if (confirmation?.manual) {
    return (
      <div className="apaleo-checkout-modal__confirmation">
        <h2>Request sent</h2>
        <p>
          {listingTitle ? `Your details for ${listingTitle} were sent to our reservations team.` : "Your details were sent to our reservations team."}{" "}
          We&rsquo;ll call or email you shortly to take payment and confirm your stay.
        </p>
        <p>
          Need us sooner? Call{" "}
          <a href={PAYMENTS_DISABLED_CONTACT.phoneHref}>{PAYMENTS_DISABLED_CONTACT.phone}</a> or email{" "}
          <a href={`mailto:${PAYMENTS_DISABLED_CONTACT.email}`}>{PAYMENTS_DISABLED_CONTACT.email}</a>.
        </p>
        {confirmation?.consentPdfUrl && (
          <p>
            <a href={confirmation.consentPdfUrl} target="_blank" rel="noreferrer">
              Download your signed consent record
            </a>
          </p>
        )}
        <button type="button" className="apaleo-checkout-modal__submit" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="apaleo-checkout-modal__confirmation">
      <h2>Booking confirmed</h2>
      <p>{listingTitle ? `Your stay at ${listingTitle} is confirmed.` : "Your stay is confirmed."}</p>
      {confirmation?.reservationIds?.length ? (
        <p>
          <strong>Reservation ID{confirmation.reservationIds.length > 1 ? "s" : ""}:</strong>{" "}
          {confirmation.reservationIds.join(", ")}
        </p>
      ) : null}
      {confirmation?.consentPdfUrl && (
        <p>
          <a href={confirmation.consentPdfUrl} target="_blank" rel="noreferrer">
            Download your consent record
          </a>
        </p>
      )}
      <button type="button" className="apaleo-checkout-modal__submit" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

// Guest-facing wizard for the Apaleo booking-session + Adyen payment flow: pick a stay,
// enter guest details and accept the terms, pay (or skip if pay-at-property), confirm.
// Kept to two steps on purpose: a separate address + drawn-signature step lost almost
// every guest before payment (1 of ~130 checkout sessions reached it, Aug–Oct 2026).
// Mirrors the existing Stepper-based checkoutGuestModal pattern used by the legacy
// Guesty/Stripe flow in each landing page, but talks to useApaleoBookingFlow instead.
export default function ApaleoCheckoutModal({
  open,
  onClose,
  localPropertyId = "",
  propertyId = "",
  unitGroupId = "",
  listingTitle = "",
  defaultAdults = 2,
  defaultArrival = "",
  defaultDeparture = "",
}) {
  const flow = useApaleoBookingFlow({ localPropertyId, propertyId, unitGroupId });
  const [currentStep, setCurrentStep] = useState(1);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [guest, setGuest] = useState(emptyGuest);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const sessionStartRef = useRef(false);

  useEffect(() => {
    if (!open) {
      flow.reset();
      setCurrentStep(1);
      setGuest(emptyGuest);
      setConsentAccepted(false);
      setConfirmError("");
      sessionStartRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Dates/guests were already chosen before "Reserve" was clicked, and DateOfferSearch
  // auto-selects the offer as soon as it's known — so the session starts the moment an
  // offer exists instead of waiting for the guest to click through a separate step.
  useEffect(() => {
    if (flow.selectedOffer && !flow.session && !sessionStartRef.current) {
      sessionStartRef.current = true;
      setSessionStarting(true);
      flow.startSession().catch(() => {
        // surfaced via flow.error
      }).finally(() => setSessionStarting(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.selectedOffer, flow.session]);

  const handleStepChange = async (step) => {
    setCurrentStep(step);
    if (PAYMENTS_DISABLED) return;
    if (step === 2 && flow.session?.payment_state !== "NOT_REQUIRED" && !flow.paymentMethodsConfig) {
      try {
        await flow.loadPaymentMethods({ countryCode: guest.countryCode, shopperLocale: navigator.language || "en-US" });
      } catch {
        // surfaced via flow.error
      }
    }
  };

  // Street address is no longer asked for; country stays because the payment
  // provider uses it to pick and verify payment methods.
  const isGuestValid =
    guest.firstName.trim() && guest.lastName.trim() && EMAIL_RE.test(guest.email) && guest.phone.trim() &&
    /^[A-Za-z]{2}$/.test(guest.countryCode.trim());

  // The ticked terms checkbox is the consent record; the guest's name stands in
  // as signer (the consent PDF handles a missing drawn signature).
  const buildConsentPayload = () => ({
    signerName: `${guest.firstName} ${guest.lastName}`.trim(),
    signatureDataUrl: "",
    consentText: CONSENT_TEXT,
    acceptedAt: new Date().toISOString(),
  });

  const handlePaymentAuthorized = async () => {
    setConfirmError("");
    try {
      await flow.confirmBooking({ guest, listingTitle, consent: buildConsentPayload() });
    } catch (err) {
      setConfirmError(err?.message || "Payment succeeded but we could not finish confirming — our team will follow up by email.");
    }
  };

  const handleNoPaymentConfirm = async () => {
    setConfirmError("");
    try {
      await flow.confirmBooking({ guest, listingTitle, consent: buildConsentPayload() });
    } catch (err) {
      setConfirmError(err?.message || "Unable to confirm the booking. Please try again.");
    }
  };

  // Kill-switch while the Apaleo/Adyen checkout is being finished: guest details and
  // consent are still collected as normal, but instead of an Adyen payment
  // this sends the signed request straight to the reservations team to finish by phone.
  const handleManualRequest = async () => {
    setConfirmError("");
    try {
      await flow.submitManualRequest({ guest, listingTitle, consent: buildConsentPayload() });
    } catch (err) {
      setConfirmError(err?.message || "Unable to send your request. Please try again or contact us directly.");
    }
  };

  if (!open) return null;

  if (flow.phase === BOOKING_PHASE.CONFIRMED) {
    return (
      <div className="apaleo-checkout-modal__overlay" role="dialog" aria-modal="true">
        <div className="apaleo-checkout-modal">
          <ConfirmationPanel confirmation={flow.confirmation} listingTitle={listingTitle} onClose={onClose} />
        </div>
      </div>
    );
  }

  // Dates/guests are already chosen before this modal opens, so there's nothing for the
  // guest to do until an offer exists and the rate is held — show that as a plain loading
  // panel rather than a numbered step the guest has to click "Next" through.
  if (!flow.session) {
    return (
      <div className="apaleo-checkout-modal__overlay" role="dialog" aria-modal="true">
        <div className="apaleo-checkout-modal">
          <button type="button" className="apaleo-checkout-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
          <h3 className="apaleo-checkout-modal__step-title">Choose your stay</h3>
          {sessionStarting && <p className="apaleo-checkout-modal__hint">Holding your rate…</p>}
          {flow.error && !sessionStarting && <p className="apaleo-checkout-modal__error">{flow.error.message}</p>}
          <DateOfferSearch
            flow={flow}
            defaultAdults={defaultAdults}
            defaultArrival={defaultArrival}
            defaultDeparture={defaultDeparture}
          />
        </div>
      </div>
    );
  }

  const nextDisabled = (currentStep === 1 && !(isGuestValid && consentAccepted)) || currentStep === 2;

  return (
    <div className="apaleo-checkout-modal__overlay" role="dialog" aria-modal="true">
      <div className="apaleo-checkout-modal">
        <button type="button" className="apaleo-checkout-modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <Stepper
          onStepChange={handleStepChange}
          nextButtonProps={{ disabled: nextDisabled }}
          nextButtonText={PAYMENTS_DISABLED ? "Continue" : "Continue to payment"}
          advanceOnFinalStep={false}
          onFinalStepCompleted={() => {}}
        >
          <Step>
            <h3 className="apaleo-checkout-modal__step-title">Your details</h3>
            {sessionStarting && <p className="apaleo-checkout-modal__hint">Holding your rate…</p>}
            {flow.error && <p className="apaleo-checkout-modal__error">{flow.error.message}</p>}
            <div className="apaleo-checkout-modal__field-grid">
              <label>
                <span>First name</span>
                <input value={guest.firstName} onChange={(e) => setGuest((g) => ({ ...g, firstName: e.target.value }))} required />
              </label>
              <label>
                <span>Last name</span>
                <input value={guest.lastName} onChange={(e) => setGuest((g) => ({ ...g, lastName: e.target.value }))} required />
              </label>
              <label>
                <span>Email</span>
                <input type="email" value={guest.email} onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))} required />
              </label>
              <label>
                <span>Phone</span>
                <input type="tel" value={guest.phone} onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value }))} required />
              </label>
              <label className="is-wide">
                <span>Country</span>
                <select
                  value={guest.countryCode}
                  onChange={(e) => setGuest((g) => ({ ...g, countryCode: e.target.value }))}
                  required
                >
                  <option value="" disabled>Select your country…</option>
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>{country.name}</option>
                  ))}
                </select>
                <small className="apaleo-checkout-modal__field-hint">
                  The country of your card — used to show the right payment options.
                </small>
              </label>
            </div>
            <p className="apaleo-checkout-modal__field-hint">
              <strong>Cancellation:</strong> {CANCELLATION_SUMMARY}
            </p>
            <label className="apaleo-checkout-modal__consent-checkbox">
              <input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} />
              <span>
                I accept the{" "}
                <a href="/terms" target="_blank" rel="noreferrer">rental terms and cancellation policy</a>.
              </span>
            </label>
          </Step>

          <Step>
            <h3 className="apaleo-checkout-modal__step-title">
              {PAYMENTS_DISABLED ? "Send your request" : "Payment"}
            </h3>
            {PAYMENTS_DISABLED ? (
              <div className="apaleo-checkout-modal__no-payment">
                <p>
                  Online payment is temporarily unavailable while we upgrade our booking system. Send us
                  your signed details below and our reservations team will call or email you at{" "}
                  {guest.phone || guest.email || "the contact info you provided"} to take payment and
                  confirm your stay.
                </p>
                <button type="button" className="apaleo-checkout-modal__submit" onClick={handleManualRequest} disabled={flow.phase === BOOKING_PHASE.CONFIRMING}>
                  {flow.phase === BOOKING_PHASE.CONFIRMING ? "Sending…" : "Send my request"}
                </button>
                <p className="apaleo-checkout-modal__field-hint">
                  Prefer to book by phone right now? Call{" "}
                  <a href={PAYMENTS_DISABLED_CONTACT.phoneHref}>{PAYMENTS_DISABLED_CONTACT.phone}</a> or
                  email <a href={`mailto:${PAYMENTS_DISABLED_CONTACT.email}`}>{PAYMENTS_DISABLED_CONTACT.email}</a>.
                </p>
              </div>
            ) : flow.session?.payment_state === "NOT_REQUIRED" ? (
              <div className="apaleo-checkout-modal__no-payment">
                <p>No payment is required now — you&rsquo;ll pay at the property.</p>
                <button type="button" className="apaleo-checkout-modal__submit" onClick={handleNoPaymentConfirm} disabled={flow.phase === BOOKING_PHASE.CONFIRMING}>
                  {flow.phase === BOOKING_PHASE.CONFIRMING ? "Confirming…" : "Confirm booking"}
                </button>
              </div>
            ) : (
              flow.paymentMethodsConfig?.provider === "stripe" ? (
                <StripePaymentPanel
                  flow={flow}
                  guest={guest}
                  listingTitle={listingTitle}
                  buildConsent={buildConsentPayload}
                  disabled={flow.phase === BOOKING_PHASE.CONFIRMING}
                />
              ) : flow.paymentMethodsConfig ? <AdyenPaymentPanel flow={flow} onAuthorized={handlePaymentAuthorized} onDeclined={() => {}} /> :
                <p className="apaleo-checkout-modal__hint">Loading secure payment methods…</p>
            )}
            {flow.error && <p className="apaleo-checkout-modal__error">{flow.error.message}</p>}
            {confirmError && <p className="apaleo-checkout-modal__error">{confirmError}</p>}
          </Step>
        </Stepper>
      </div>
    </div>
  );
}
