import ReactGA from "react-ga4";
import {
  ANALYTICS_EVENTS,
  FUNNEL_STAGES,
} from "./analyticsEvents";

const GA_MEASUREMENT_ID = String(import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();
const ENABLE_IN_DEV = String(import.meta.env.VITE_GA_ENABLE_IN_DEV || "").trim().toLowerCase() === "true";
const DEBUG = String(import.meta.env.VITE_ANALYTICS_DEBUG || "").trim().toLowerCase() === "true";
const IS_DEV = Boolean(import.meta.env.DEV);

const SESSION_KEY = "ols_analytics_session_id";
const UTM_KEY = "ols_analytics_utm";
const EVENT_DEDUPE_TTL_MS = 1500;
const TRACKED_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];

let initialized = false;
let lastTrackedPage = "";
const eventDedupeCache = new Map();

const noop = () => false;

const normalize = (value = "", maxLength = 300) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const canUseDom = () => typeof window !== "undefined" && typeof document !== "undefined";

const readStorage = (key) => {
  if (!canUseDom()) return "";
  try {
    return window.localStorage?.getItem(key) || "";
  } catch {
    return "";
  }
};

const writeStorage = (key, value) => {
  if (!canUseDom()) return;
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // ignore
  }
};

const isTrackEnabled = () => {
  if (!canUseDom()) return false;
  if (!GA_MEASUREMENT_ID) return false;
  if (IS_DEV && !ENABLE_IN_DEV) return false;
  return true;
};

const debugLog = (...args) => {
  if (!DEBUG || !canUseDom()) return;
  // eslint-disable-next-line no-console
  console.info("[analytics]", ...args);
};

const getSessionId = () => {
  const existing = normalize(readStorage(SESSION_KEY), 120);
  if (existing) return existing;
  const generated = `ols-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  writeStorage(SESSION_KEY, generated);
  return generated;
};

const getDeviceType = () => {
  if (!canUseDom()) return "unknown";
  const width = window.innerWidth || 0;
  if (width > 0 && width < 768) return "mobile";
  if (width >= 768 && width < 1024) return "tablet";
  return "desktop";
};

export const getPageContext = (pathOverride = "") => {
  if (!canUseDom()) {
    return {
      pathname: "/",
      search: "",
      fullPath: "/",
      city: "",
      listingId: "",
      pageType: "unknown",
    };
  }

  const pathname = normalize(pathOverride || window.location.pathname, 240) || "/";
  const search = normalize(window.location.search, 300);
  const fullPath = `${pathname}${search}`;
  const segments = pathname.split("/").filter(Boolean);
  const citySlug = String(segments[0] || "").toLowerCase();
  const cityMap = {
    antwerp: "Antwerp",
    antwerpen: "Antwerp",
    dubai: "Dubai",
    miami: "Miami",
    "miami-beach": "Miami",
    redondo: "Redondo Beach",
    "redondo-beach": "Redondo Beach",
    "los-angeles": "Los Angeles",
    losangeles: "Los Angeles",
  };
  const listingMatch = pathname.match(/\/listing\/([^/?#]+)/i);
  const listingId = listingMatch?.[1] ? normalize(decodeURIComponent(listingMatch[1]), 120) : "";
  const city = cityMap[citySlug] || "";
  const pageType = (() => {
    if (pathname === "/") return "home";
    if (pathname.includes("/listing/")) return "listing";
    if (city) return "city";
    if (pathname.includes("global")) return "global";
    return "page";
  })();

  return { pathname, search, fullPath, city, listingId, pageType };
};

export const captureUtmAttribution = (searchValue = "") => {
  if (!canUseDom()) return {};
  const params = new URLSearchParams(String(searchValue || window.location.search || ""));
  let hasAny = false;
  const next = {};

  TRACKED_UTM_KEYS.forEach((key) => {
    const value = normalize(params.get(key), 160);
    if (value) {
      next[key] = value;
      hasAny = true;
    }
  });

  const existing = (() => {
    try {
      return JSON.parse(readStorage(UTM_KEY) || "{}") || {};
    } catch {
      return {};
    }
  })();

  const merged = { ...existing, ...next };
  if (hasAny) {
    writeStorage(UTM_KEY, JSON.stringify(merged));
    debugLog("UTM persisted", merged);
  }

  return merged;
};

const getUtmAttribution = () => {
  if (!canUseDom()) return {};
  try {
    return JSON.parse(readStorage(UTM_KEY) || "{}") || {};
  } catch {
    return {};
  }
};

const baseMetadata = (extra = {}) => {
  const page = getPageContext();
  return {
    session_id: getSessionId(),
    device_type: getDeviceType(),
    source_page: page.fullPath,
    page_type: page.pageType,
    city: page.city || "",
    listing_id: page.listingId || "",
    ...getUtmAttribution(),
    ...extra,
  };
};

const cleanupDedupeCache = () => {
  const now = Date.now();
  for (const [key, timestamp] of eventDedupeCache.entries()) {
    if (now - timestamp > EVENT_DEDUPE_TTL_MS) eventDedupeCache.delete(key);
  }
};

const shouldSkipDuplicate = (key = "", ttlMs = EVENT_DEDUPE_TTL_MS) => {
  if (!key) return false;
  cleanupDedupeCache();
  const now = Date.now();
  const seenAt = eventDedupeCache.get(key);
  if (seenAt && now - seenAt < ttlMs) return true;
  eventDedupeCache.set(key, now);
  return false;
};

export const initAnalytics = () => {
  if (initialized) return false;
  if (!isTrackEnabled()) return false;
  ReactGA.initialize(GA_MEASUREMENT_ID);
  initialized = true;
  captureUtmAttribution();
  debugLog("initialized", { measurementId: GA_MEASUREMENT_ID });
  return true;
};

const ensureInit = () => initialized || initAnalytics();

export const trackEventSafe = ({
  eventName = "",
  params = {},
  dedupeKey = "",
  dedupeMs = EVENT_DEDUPE_TTL_MS,
} = {}) => {
  const normalizedEvent = normalize(eventName, 80);
  if (!normalizedEvent) return false;
  if (!ensureInit()) return false;
  if (shouldSkipDuplicate(`${normalizedEvent}:${dedupeKey}`, dedupeMs)) return false;

  try {
    const payload = baseMetadata(params);
    ReactGA.event(normalizedEvent, payload);
    debugLog("event", normalizedEvent, payload);
    return true;
  } catch {
    return false;
  }
};

export const trackPageView = (path = "") => {
  const normalizedPath = normalize(path || getPageContext().fullPath, 320);
  if (!normalizedPath) return false;
  if (!ensureInit()) return false;
  if (lastTrackedPage === normalizedPath) return false;

  ReactGA.send({
    hitType: "pageview",
    page: normalizedPath,
  });
  lastTrackedPage = normalizedPath;
  debugLog("pageview", normalizedPath);
  return trackEventSafe({
    eventName: ANALYTICS_EVENTS.PAGE_VIEW,
    params: { page_path: normalizedPath },
    dedupeKey: normalizedPath,
    dedupeMs: 1000,
  });
};

export const trackFunnelStage = (stage = "", extra = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.FUNNEL_STAGE,
    params: { funnel_stage: normalize(stage, 80), ...extra },
    dedupeKey: `${stage}:${extra.source_page || getPageContext().fullPath}`,
    dedupeMs: 1200,
  });

export const trackEvent = (category = "", action = "", label = "") =>
  trackEventSafe({
    eventName: normalize(action, 80) || "interaction",
    params: {
      event_category: normalize(category, 120),
      event_label: normalize(label, 200),
    },
    dedupeKey: `${category}:${action}:${label}`,
  });

export const trackListingView = ({ listingId = "", listingName = "", city = "", pageUrl = "" } = {}) => {
  const page = getPageContext();
  const sourcePage = normalize(pageUrl || page.fullPath, 320);
  const payload = {
    listing_id: normalize(listingId || page.listingId, 120),
    listing_name: normalize(listingName, 220),
    city: normalize(city || page.city, 120),
    page_url: sourcePage,
  };
  if (!payload.listing_id && !payload.listing_name) return false;
  const ok = trackEventSafe({
    eventName: ANALYTICS_EVENTS.LISTING_VIEW,
    params: payload,
    dedupeKey: `${payload.listing_id}:${sourcePage}`,
    dedupeMs: 2000,
  });
  if (ok) {
    if (payload.listing_id) {
      trackFunnelStage(FUNNEL_STAGES.LISTING_VIEWED, {
        listing_id: payload.listing_id,
        city: payload.city,
      });
    }
  }
  return ok;
};

export const trackCityView = ({ cityName = "", sourcePage = "", destinationCity = "" } = {}) => {
  const page = getPageContext();
  const city = normalize(cityName || destinationCity || page.city, 120);
  if (!city) return false;
  const source = normalize(sourcePage || page.fullPath, 320);
  const ok = trackEventSafe({
    eventName: ANALYTICS_EVENTS.CITY_VIEW,
    params: {
      city,
      destination_city: city,
      source_page: source,
    },
    dedupeKey: `${city}:${source}`,
    dedupeMs: 2000,
  });
  if (ok) trackFunnelStage(FUNNEL_STAGES.CITY_VIEWED, { city });
  return ok;
};

export const trackWhatsAppClick = ({
  listing = "",
  city = "",
  sourcePage = "",
  buttonType = "",
  location = "",
} = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.WHATSAPP_CLICK,
    params: {
      listing: normalize(listing, 120),
      city: normalize(city, 120),
      source_page: normalize(sourcePage || getPageContext().fullPath, 320),
      button_type: normalize(buttonType, 120),
      button_location: normalize(location, 120),
    },
    dedupeKey: `${listing}:${city}:${buttonType}:${location}:${sourcePage}`,
  });

export const trackPhoneCallClick = ({ phone = "", sourcePage = "", city = "", location = "" } = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.PHONE_CALL_CLICK,
    params: {
      phone: normalize(phone, 60),
      city: normalize(city, 120),
      source_page: normalize(sourcePage || getPageContext().fullPath, 320),
      button_location: normalize(location, 120),
    },
    dedupeKey: `${phone}:${sourcePage}:${location}`,
  });

export const trackInquiryStart = (payload = {}) => {
  trackFunnelStage(FUNNEL_STAGES.INQUIRY_STARTED, payload);
  return trackEventSafe({
    eventName: ANALYTICS_EVENTS.INQUIRY_START,
    params: payload,
    dedupeKey: JSON.stringify(payload),
  });
};

export const trackInquirySubmit = (payload = {}) => {
  trackFunnelStage(FUNNEL_STAGES.INQUIRY_SUBMITTED, payload);
  return trackEventSafe({
    eventName: ANALYTICS_EVENTS.INQUIRY_SUBMIT,
    params: payload,
    dedupeKey: JSON.stringify(payload),
  });
};

export const trackBookingStart = (payload = {}) => {
  trackFunnelStage(FUNNEL_STAGES.BOOKING_CLICKED, payload);
  return trackEventSafe({
    eventName: ANALYTICS_EVENTS.BOOKING_START,
    params: payload,
    dedupeKey: JSON.stringify(payload),
  });
};

export const trackBookingRedirect = (payload = {}) => {
  trackFunnelStage(FUNNEL_STAGES.BOOKING_REDIRECTED, payload);
  return trackEventSafe({
    eventName: ANALYTICS_EVENTS.BOOKING_REDIRECT,
    params: payload,
    dedupeKey: JSON.stringify(payload),
  });
};

export const trackAvailabilityOpened = (payload = {}) => {
  trackFunnelStage(FUNNEL_STAGES.AVAILABILITY_INTERACTION, payload);
  return trackEventSafe({
    eventName: ANALYTICS_EVENTS.AVAILABILITY_OPENED,
    params: payload,
    dedupeKey: JSON.stringify(payload),
  });
};

export const trackAvailabilitySearch = (payload = {}) => {
  trackFunnelStage(FUNNEL_STAGES.AVAILABILITY_INTERACTION, payload);
  return trackEventSafe({
    eventName: ANALYTICS_EVENTS.AVAILABILITY_SEARCH,
    params: payload,
    dedupeKey: JSON.stringify(payload),
    dedupeMs: 900,
  });
};

export const trackGuestCountChanged = (payload = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.GUEST_COUNT_CHANGED,
    params: payload,
    dedupeKey: JSON.stringify(payload),
    dedupeMs: 800,
  });

export const trackCalendarAbandoned = (payload = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.CALENDAR_ABANDONED,
    params: payload,
    dedupeKey: JSON.stringify(payload),
    dedupeMs: 1200,
  });

export const trackGalleryOpened = (payload = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.GALLERY_OPENED,
    params: payload,
    dedupeKey: JSON.stringify(payload),
  });

export const trackGalleryImageViewed = (payload = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.GALLERY_IMAGE_VIEWED,
    params: payload,
    dedupeKey: JSON.stringify(payload),
    dedupeMs: 700,
  });

export const trackReviewsViewed = (payload = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.REVIEWS_VIEWED,
    params: payload,
    dedupeKey: JSON.stringify(payload),
  });

export const trackReviewExpanded = (payload = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.REVIEW_EXPANDED,
    params: payload,
    dedupeKey: JSON.stringify(payload),
  });

export const trackReviewScrollEngaged = (payload = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.REVIEW_SCROLL_ENGAGED,
    params: payload,
    dedupeKey: JSON.stringify(payload),
    dedupeMs: 1000,
  });

export const trackCtaClick = ({
  ctaText = "",
  location = "",
  sourcePage = "",
  city = "",
  listing = "",
} = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.CTA_CLICK,
    params: {
      cta_text: normalize(ctaText, 120),
      cta_location: normalize(location, 120),
      source_page: normalize(sourcePage || getPageContext().fullPath, 320),
      city: normalize(city, 120),
      listing: normalize(listing, 120),
    },
    dedupeKey: `${ctaText}:${location}:${sourcePage}:${city}:${listing}`,
  });

export const trackScrollDepth = (depthPercent = 0, payload = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.SCROLL_DEPTH,
    params: {
      depth_percent: Math.max(0, Math.min(100, Number(depthPercent) || 0)),
      ...payload,
    },
    dedupeKey: `${payload.source_page || getPageContext().fullPath}:${depthPercent}`,
    dedupeMs: 1000,
  });

export const trackNavigationClick = ({ navItem = "", destination = "", location = "" } = {}) =>
  trackEventSafe({
    eventName: ANALYTICS_EVENTS.NAVIGATION_CLICK,
    params: {
      nav_item: normalize(navItem, 140),
      destination: normalize(destination, 240),
      nav_location: normalize(location, 100),
    },
    dedupeKey: `${navItem}:${destination}:${location}`,
  });

// TODO: GTM bridge: forward all events to dataLayer when GTM is introduced.
// TODO: Meta Pixel bridge: map high-intent events (Lead, Contact, InitiateCheckout).
// TODO: Hotjar hooks: attach session correlation id for replay segmentation.
// TODO: Microsoft Clarity hooks: attach custom tags for funnel stage and city.

export { FUNNEL_STAGES, ANALYTICS_EVENTS };
export const getAnalyticsSessionId = () => getSessionId();
export const isAnalyticsEnabled = () => isTrackEnabled();
export const resetAnalyticsPageDedupe = () => {
  lastTrackedPage = "";
};
export const clearAnalyticsDedupeCache = () => {
  eventDedupeCache.clear();
};
export const disabledAnalytics = noop;
