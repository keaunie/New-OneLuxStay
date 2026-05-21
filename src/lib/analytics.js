import ReactGA from "react-ga4";

const getTrimmedEnvValue = (value = "") => String(value || "").trim();

const GA_MEASUREMENT_ID = getTrimmedEnvValue(import.meta.env.VITE_GA_MEASUREMENT_ID);
const ENABLE_IN_DEV = getTrimmedEnvValue(import.meta.env.VITE_GA_ENABLE_IN_DEV).toLowerCase() === "true";
const IS_DEV = Boolean(import.meta.env.DEV);

let initialized = false;
let lastTrackedPath = "";

const canTrackAnalytics = () => {
  if (typeof window === "undefined") return false;
  if (!GA_MEASUREMENT_ID) return false;
  if (IS_DEV && !ENABLE_IN_DEV) return false;
  return true;
};

export const initAnalytics = () => {
  if (initialized) return false;
  if (!canTrackAnalytics()) return false;

  ReactGA.initialize(GA_MEASUREMENT_ID);
  initialized = true;
  return true;
};

const ensureInitialized = () => {
  if (initialized) return true;
  return initAnalytics();
};

export const trackPageView = (path = "") => {
  const normalizedPath = getTrimmedEnvValue(path);
  if (!normalizedPath) return false;
  if (!ensureInitialized()) return false;
  if (lastTrackedPath === normalizedPath) return false;

  ReactGA.send({
    hitType: "pageview",
    page: normalizedPath,
  });
  lastTrackedPath = normalizedPath;
  return true;
};

export const trackEvent = (category = "", action = "", label = "") => {
  if (!ensureInitialized()) return false;

  const normalizedAction = getTrimmedEnvValue(action) || "interaction";
  const payload = {};
  const normalizedCategory = getTrimmedEnvValue(category);
  const normalizedLabel = getTrimmedEnvValue(label);

  if (normalizedCategory) payload.event_category = normalizedCategory;
  if (normalizedLabel) payload.event_label = normalizedLabel;

  ReactGA.event(normalizedAction, payload);
  return true;
};

export const trackWhatsAppClick = (label = "") =>
  trackEvent("engagement", "whatsapp_click", label);

export const trackInquirySubmit = (label = "") =>
  trackEvent("lead", "inquiry_submit", label);

export const trackBookingStart = (label = "") =>
  trackEvent("booking", "booking_start", label);

export const trackListingView = (listingId = "") =>
  trackEvent("listing", "listing_view", getTrimmedEnvValue(listingId));

export const trackCityView = (cityName = "") =>
  trackEvent("city", "city_view", getTrimmedEnvValue(cityName));

// TODO: Add GTM support (dataLayer and container bootstrap) once GTM is adopted.
// TODO: Add conversion events for bookings, payment completion, and high-intent CTAs.
// TODO: Add booking funnel step events (search -> listing -> checkout -> confirmation).
// TODO: Add WhatsApp click events from chat widgets and footer contact links.

