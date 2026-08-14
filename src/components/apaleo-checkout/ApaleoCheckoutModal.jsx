import { useEffect, useRef, useState } from "react";
import Stepper, { Step } from "../Stepper";
import useApaleoBookingFlow, { BOOKING_PHASE } from "../../hooks/useApaleoBookingFlow";
import DateOfferSearch from "./DateOfferSearch";
import AdyenPaymentPanel from "./AdyenPaymentPanel";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const emptyGuest = { firstName: "", lastName: "", email: "", phone: "", addressLine1: "", postalCode: "", city: "", countryCode: "" };

function ConfirmationPanel({ confirmation, listingTitle, onClose }) {
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
// enter guest details, accept consent, pay (or skip if pay-at-property), confirm.
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
}) {
  const flow = useApaleoBookingFlow({ localPropertyId, propertyId, unitGroupId });
  const [currentStep, setCurrentStep] = useState(1);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [guest, setGuest] = useState(emptyGuest);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentSignerName, setConsentSignerName] = useState("");
  const [consentSignatureDataUrl, setConsentSignatureDataUrl] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const canvasRef = useRef(null);
  const isSigningRef = useRef(false);

  useEffect(() => {
    if (!open) {
      flow.reset();
      setCurrentStep(1);
      setGuest(emptyGuest);
      setConsentAccepted(false);
      setConsentSignerName("");
      setConsentSignatureDataUrl("");
      setConfirmError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleStepChange = async (step) => {
    setCurrentStep(step);
    if (step === 2 && !flow.session && flow.selectedOffer) {
      setSessionStarting(true);
      try {
        await flow.startSession();
      } catch {
        // surfaced via flow.error
      } finally {
        setSessionStarting(false);
      }
    }
    if (step === 4 && flow.session?.payment_state !== "NOT_REQUIRED" && !flow.paymentMethodsConfig) {
      try {
        await flow.loadPaymentMethods({ countryCode: guest.countryCode, shopperLocale: navigator.language || "en-US" });
      } catch {
        // surfaced via flow.error
      }
    }
  };

  const canvasPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = event.touches?.[0] || event;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };
  const startSignatureDraw = (event) => {
    isSigningRef.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = canvasPoint(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const drawSignature = (event) => {
    if (!isSigningRef.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = canvasPoint(event);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#3f3326";
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  const endSignatureDraw = () => {
    if (!isSigningRef.current) return;
    isSigningRef.current = false;
    setConsentSignatureDataUrl(canvasRef.current.toDataURL("image/png"));
  };
  const clearSignature = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setConsentSignatureDataUrl("");
  };

  const isGuestValid =
    guest.firstName.trim() && guest.lastName.trim() && EMAIL_RE.test(guest.email) && guest.phone.trim() &&
    guest.addressLine1.trim() && guest.postalCode.trim() && guest.city.trim() && /^[A-Za-z]{2}$/.test(guest.countryCode.trim());
  const isConsentValid = consentAccepted && consentSignerName.trim() && Boolean(consentSignatureDataUrl);

  const buildConsentPayload = () => ({
    signerName: consentSignerName.trim(),
    signatureDataUrl: consentSignatureDataUrl,
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

  const nextDisabled =
    (currentStep === 1 && !flow.selectedOffer) ||
    (currentStep === 2 && (sessionStarting || !flow.session || !isGuestValid)) ||
    (currentStep === 3 && !isConsentValid) ||
    currentStep === 4;

  return (
    <div className="apaleo-checkout-modal__overlay" role="dialog" aria-modal="true">
      <div className="apaleo-checkout-modal">
        <button type="button" className="apaleo-checkout-modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <Stepper
          onStepChange={handleStepChange}
          nextButtonProps={{ disabled: nextDisabled }}
          advanceOnFinalStep={false}
          onFinalStepCompleted={() => {}}
        >
          <Step>
            <h3 className="apaleo-checkout-modal__step-title">Choose your stay</h3>
            <DateOfferSearch flow={flow} defaultAdults={defaultAdults} />
          </Step>

          <Step>
            <h3 className="apaleo-checkout-modal__step-title">Guest details</h3>
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
                <span>Street address</span>
                <input value={guest.addressLine1} onChange={(e) => setGuest((g) => ({ ...g, addressLine1: e.target.value }))} required />
              </label>
              <label>
                <span>City</span>
                <input value={guest.city} onChange={(e) => setGuest((g) => ({ ...g, city: e.target.value }))} required />
              </label>
              <label>
                <span>Postal code</span>
                <input value={guest.postalCode} onChange={(e) => setGuest((g) => ({ ...g, postalCode: e.target.value }))} required />
              </label>
              <label>
                <span>Country code</span>
                <input value={guest.countryCode} maxLength={2} placeholder="US" onChange={(e) => setGuest((g) => ({ ...g, countryCode: e.target.value.toUpperCase() }))} required />
              </label>
            </div>
          </Step>

          <Step>
            <h3 className="apaleo-checkout-modal__step-title">Consent &amp; signature</h3>
            <label className="apaleo-checkout-modal__field">
              <span>Full name (as signature)</span>
              <input value={consentSignerName} onChange={(e) => setConsentSignerName(e.target.value)} required />
            </label>
            <canvas
              ref={canvasRef}
              className="apaleo-checkout-modal__signature-pad"
              width={420}
              height={140}
              onMouseDown={startSignatureDraw}
              onMouseMove={drawSignature}
              onMouseUp={endSignatureDraw}
              onMouseLeave={endSignatureDraw}
              onTouchStart={startSignatureDraw}
              onTouchMove={drawSignature}
              onTouchEnd={endSignatureDraw}
            />
            <button type="button" className="apaleo-checkout-modal__link-button" onClick={clearSignature}>
              Clear signature
            </button>
            <label className="apaleo-checkout-modal__consent-checkbox">
              <input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} />
              <span>
                I authorize OneLuxStay to process this reservation and I accept the{" "}
                <a href="/terms" target="_blank" rel="noreferrer">rental terms and policies</a>.
              </span>
            </label>
          </Step>

          <Step>
            <h3 className="apaleo-checkout-modal__step-title">Payment</h3>
            {flow.session?.payment_state === "NOT_REQUIRED" ? (
              <div className="apaleo-checkout-modal__no-payment">
                <p>No payment is required now — you&rsquo;ll pay at the property.</p>
                <button type="button" className="apaleo-checkout-modal__submit" onClick={handleNoPaymentConfirm} disabled={flow.phase === BOOKING_PHASE.CONFIRMING}>
                  {flow.phase === BOOKING_PHASE.CONFIRMING ? "Confirming…" : "Confirm booking"}
                </button>
              </div>
            ) : (
              flow.paymentMethodsConfig ? <AdyenPaymentPanel flow={flow} onAuthorized={handlePaymentAuthorized} onDeclined={() => {}} /> :
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
