import { useCallback, useRef, useState } from "react";
import {
  searchApaleoOffers,
  getApaleoServiceOffers,
  createApaleoBookingSession,
  revalidateApaleoBookingSession,
  getApaleoPaymentMethods,
  submitApaleoPayment,
  submitApaleoPaymentDetails,
  confirmApaleoBooking,
  getApaleoBookingConfirmation,
} from "../services/apaleoBookingApi";

// Drives the Apaleo booking-session state machine documented in
// netlify/functions/_shared/apaleoBookingService.js and the manual test checklist in
// docs/apaleo-ibe-deployment.md, so the checkout UI (ApaleoCheckoutModal.jsx) stays
// presentation-only. One instance per "Reserve" attempt.

export const BOOKING_PHASE = {
  OFFERS: "offers",
  GUEST_DETAILS: "guest_details",
  PAYMENT: "payment",
  CONFIRMING: "confirming",
  CONFIRMED: "confirmed",
};

const asApiError = (error) => ({
  message: error?.message || "Something went wrong.",
  code: error?.payload?.code || "",
  status: error?.status || 0,
  session: error?.payload?.session || null,
});

export default function useApaleoBookingFlow({ localPropertyId = "", propertyId = "", unitGroupId = "" } = {}) {
  const [phase, setPhase] = useState(BOOKING_PHASE.OFFERS);
  const [stay, setStay] = useState(null);
  const [offers, setOffers] = useState([]);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [serviceOffers, setServiceOffers] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [session, setSession] = useState(null);
  const [paymentMethodsConfig, setPaymentMethodsConfig] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const submittingRef = useRef(false);

  const searchOffers = useCallback(async ({ arrival, departure, adults = 1, childrenAges = [] }) => {
    setLoading(true);
    setError(null);
    try {
      const nextStay = { arrival, departure, adults, childrenAges };
      const result = await searchApaleoOffers({ localPropertyId, propertyId, unitGroupId, ...nextStay });
      setStay(nextStay);
      setOffers(Array.isArray(result?.offers) ? result.offers : []);
      setSelectedOffer(null);
      return result?.offers || [];
    } catch (err) {
      const apiError = asApiError(err);
      setError(apiError);
      throw apiError;
    } finally {
      setLoading(false);
    }
  }, [localPropertyId, propertyId, unitGroupId]);

  const selectOffer = useCallback(async (offer) => {
    setSelectedOffer(offer);
    setSelectedServiceIds([]);
    setServiceOffers([]);
    if (!offer?.ratePlanId || !stay) return;
    try {
      const result = await getApaleoServiceOffers({ ratePlanId: offer.ratePlanId, ...stay });
      setServiceOffers(Array.isArray(result?.services) ? result.services : []);
    } catch {
      setServiceOffers([]);
    }
  }, [stay]);

  const toggleService = useCallback((serviceId) => {
    setSelectedServiceIds((current) =>
      current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId],
    );
  }, []);

  // Creates the server-side booking session. Payment methods are loaded later,
  // after the guest supplies a country, so regional methods are not hardcoded.
  const startSession = useCallback(async () => {
    if (!selectedOffer || !stay) throw asApiError(new Error("Select an offer first."));
    setLoading(true);
    setError(null);
    try {
      const created = await createApaleoBookingSession({
        localPropertyId, propertyId, unitGroupId, ...stay,
        ratePlanId: selectedOffer.ratePlanId,
        selectedServices: selectedServiceIds,
      });
      const newSession = created.session;
      setSession(newSession);
      setPhase(BOOKING_PHASE.GUEST_DETAILS);
      return newSession;
    } catch (err) {
      const apiError = asApiError(err);
      setError(apiError);
      throw apiError;
    } finally {
      setLoading(false);
    }
  }, [localPropertyId, propertyId, unitGroupId, selectedOffer, stay, selectedServiceIds]);

  const loadPaymentMethods = useCallback(async ({ countryCode = "BE", shopperLocale = "en-US" } = {}) => {
    if (!session?.id || session.payment_state === "NOT_REQUIRED") return null;
    setLoading(true);
    setError(null);
    try {
      const methods = await getApaleoPaymentMethods({ bookingSessionId: session.id, countryCode, shopperLocale });
      setPaymentMethodsConfig({ ...methods, countryCode });
      setPhase(BOOKING_PHASE.PAYMENT);
      return methods;
    } catch (err) {
      const apiError = asApiError(err);
      setError(apiError);
      throw apiError;
    } finally {
      setLoading(false);
    }
  }, [session]);

  // Re-checks price/availability before payment or confirm; surfaces PRICE_CHANGED /
  // OFFER_UNAVAILABLE so the caller can show the guest an updated price instead of
  // silently charging a stale amount.
  const revalidate = useCallback(async () => {
    if (!session?.id) return null;
    const result = await revalidateApaleoBookingSession(session.id);
    setSession(result.session);
    return result;
  }, [session]);

  const submitPayment = useCallback(async ({ paymentMethod, browserInfo, origin }) => {
    if (!session?.id) throw asApiError(new Error("No active booking session."));
    if (submittingRef.current) return null;
    submittingRef.current = true;
    setError(null);
    try {
      const result = await submitApaleoPayment({ bookingSessionId: session.id, paymentMethod, browserInfo, origin });
      return result;
    } catch (err) {
      const apiError = asApiError(err);
      if (apiError.session) setSession(apiError.session);
      setError(apiError);
      throw apiError;
    } finally {
      submittingRef.current = false;
    }
  }, [session]);

  const submitPaymentDetails = useCallback(async ({ details, paymentData }) => {
    if (!session?.id) throw asApiError(new Error("No active booking session."));
    setError(null);
    try {
      return await submitApaleoPaymentDetails({ bookingSessionId: session.id, details, paymentData });
    } catch (err) {
      const apiError = asApiError(err);
      setError(apiError);
      throw apiError;
    }
  }, [session]);

  const confirmBooking = useCallback(async ({ guest, listingTitle, consent }) => {
    if (!session?.id) throw asApiError(new Error("No active booking session."));
    setPhase(BOOKING_PHASE.CONFIRMING);
    setError(null);
    try {
      const result = await confirmApaleoBooking({ bookingSessionId: session.id, guest, listingTitle, consent });
      setConfirmation(result);
      setPhase(BOOKING_PHASE.CONFIRMED);
      return result;
    } catch (err) {
      const apiError = asApiError(err);
      if (apiError.session) setSession(apiError.session);
      setError(apiError);
      setPhase(BOOKING_PHASE.GUEST_DETAILS);
      throw apiError;
    }
  }, [session]);

  const pollConfirmation = useCallback(async (bookingSessionId, { timeoutMs = 20_000, intervalMs = 1500 } = {}) => {
    const id = bookingSessionId || session?.id;
    if (!id) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await getApaleoBookingConfirmation(id);
      if (result?.state === "CONFIRMED") return result;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return getApaleoBookingConfirmation(id);
  }, [session]);

  const reset = useCallback(() => {
    setPhase(BOOKING_PHASE.OFFERS);
    setStay(null);
    setOffers([]);
    setSelectedOffer(null);
    setServiceOffers([]);
    setSelectedServiceIds([]);
    setSession(null);
    setPaymentMethodsConfig(null);
    setConfirmation(null);
    setLoading(false);
    setError(null);
  }, []);

  return {
    phase, setPhase,
    stay, offers, selectedOffer, serviceOffers, selectedServiceIds,
    session, paymentMethodsConfig, confirmation, loading, error, setError,
    searchOffers, selectOffer, toggleService, startSession, loadPaymentMethods, revalidate,
    submitPayment, submitPaymentDetails, confirmBooking, pollConfirmation, reset,
  };
}
