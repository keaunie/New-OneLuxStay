const call = async (path, options = {}) => {
  const response = await fetch(`/.netlify/functions/${path}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.message || `Booking request failed (${response.status})`), { status: response.status, payload });
  return payload;
};

const query = (values) => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : String(value)])).toString();
const post = (path, body) => call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const getApaleoBookingProperties = () => call("api-booking-properties");
export const searchApaleoOffers = (criteria) => call(`api-booking-offers?${query(criteria)}`);
export const getApaleoServiceOffers = (criteria) => call(`api-booking-service-offers?${query(criteria)}`);
export const createApaleoBookingSession = (input) => post("api-booking-sessions", input);
export const revalidateApaleoBookingSession = (bookingSessionId) => post("api-booking-session-revalidate", { bookingSessionId });
export const getApaleoPaymentMethods = (input) => post("api-booking-payment-methods", input);
export const submitApaleoPayment = (input) => post("api-booking-payments", input);
export const submitApaleoPaymentDetails = (input) => post("api-booking-payment-details", input);
export const confirmApaleoBooking = (input) => post("api-booking-confirm", input);
export const getApaleoBookingConfirmation = (bookingSessionId) => call(`api-booking-confirmation?${query({ bookingSessionId })}`);
