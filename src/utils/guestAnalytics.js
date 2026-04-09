import apiBase from "./apiBase";

const SESSION_KEY = "ols-guest-analytics-session";
const PAGE_VIEW_DEDUPE_KEY = "ols-guest-analytics-pageview";
const PAGE_VIEW_DEDUPE_WINDOW_MS = 2500;

const sanitizeString = (value = "", maxLength = 300) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const canUseStorage = () =>
  typeof window !== "undefined" && (Boolean(window.localStorage) || Boolean(window.sessionStorage));

const readStorageValue = (key) => {
  if (!canUseStorage()) return "";

  try {
    const localValue = window.localStorage?.getItem(key);
    if (localValue) return localValue;
  } catch {
    // ignore localStorage read failures
  }

  try {
    return window.sessionStorage?.getItem(key) || "";
  } catch {
    return "";
  }
};

const writeStorageValue = (key, value) => {
  if (!canUseStorage()) return;

  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // ignore localStorage write failures
  }

  try {
    window.sessionStorage?.setItem(key, value);
  } catch {
    // ignore sessionStorage write failures
  }
};

const getGuestAnalyticsSessionId = () => {
  const existing = sanitizeString(readStorageValue(SESSION_KEY), 120);
  if (existing) return existing;

  const generated = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  writeStorageValue(SESSION_KEY, generated);
  return generated;
};

const CITY_LABELS = {
  antwerp: "Antwerp",
  antwerpen: "Antwerp",
  "los-angeles": "Los Angeles",
  losangeles: "Los Angeles",
  miami: "Miami",
  "miami-beach": "Miami",
  redondo: "Redondo Beach",
  "redondo-beach": "Redondo Beach",
  dubai: "Dubai",
};

const normalizePageTypeFromPath = (pathname = "") => {
  const normalized = sanitizeString(pathname, 240).toLowerCase() || "/";
  if (normalized === "/") return "home";
  if (
    normalized === "/global" ||
    normalized === "/global-units" ||
    normalized === "/one-lux-stay-global"
  ) {
    return "global";
  }
  if (normalized.includes("/listing/")) return "listing";
  if (normalized.startsWith("/admins-ols")) return "admin";
  if (normalized.startsWith("/private/")) return "private";
  if (
    normalized === "/privacy" ||
    normalized === "/privacy-policy" ||
    normalized === "/terms" ||
    normalized === "/california-privacy" ||
    normalized === "/california-privacy-policy"
  ) {
    return "policy";
  }
  return "city";
};

const inferCityFromPath = (pathname = "") => {
  const normalized = sanitizeString(pathname, 240).toLowerCase() || "/";
  const segments = normalized.split("/").filter(Boolean);
  const citySlug = segments[0] || "";
  return CITY_LABELS[citySlug] || "";
};

const inferListingIdFromLocation = (pathname = "", search = "") => {
  const normalizedPath = sanitizeString(pathname, 240);
  const listingMatch = normalizedPath.match(/\/listing\/([^/?#]+)/i);
  if (listingMatch?.[1]) {
    try {
      return sanitizeString(decodeURIComponent(listingMatch[1]), 120);
    } catch {
      return sanitizeString(listingMatch[1], 120);
    }
  }

  if (typeof URLSearchParams !== "undefined") {
    try {
      const params = new URLSearchParams(search || "");
      return sanitizeString(params.get("listingId"), 120);
    } catch {
      return "";
    }
  }

  return "";
};

const getPageContext = () => {
  if (typeof window === "undefined") {
    return {
      pathname: "/",
      pageType: "unknown",
      city: "",
      listingId: "",
    };
  }

  const pathname = sanitizeString(window.location.pathname, 240) || "/";
  const search = sanitizeString(window.location.search, 240);
  const pageType = normalizePageTypeFromPath(pathname);
  const city = inferCityFromPath(pathname);
  const listingId = inferListingIdFromLocation(pathname, search);

  return {
    pathname,
    pageType,
    city,
    listingId,
  };
};

const postGuestAnalytics = async (input = {}) => {
  const payload = {
    action: "track_journey_event",
    sessionId: getGuestAnalyticsSessionId(),
    ...input,
    pageContext: {
      ...getPageContext(),
      ...(input?.pageContext || {}),
    },
  };

  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const queued = navigator.sendBeacon(`${apiBase}/guest-analytics`, blob);
      if (queued) return;
    }

    await fetch(`${apiBase}/guest-analytics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      keepalive: true,
    });
  } catch {
    // Analytics should never block navigation.
  }
};

export const trackGuestJourneyEvent = async ({
  eventType = "",
  city = "",
  listingId = "",
  listingTitle = "",
  destinationPath = "",
  sourceSection = "",
  sourceLabel = "",
  pageContext = {},
} = {}) => {
  const normalizedEventType = sanitizeString(eventType, 80).toLowerCase();
  if (!normalizedEventType) return;

  await postGuestAnalytics({
    eventType: normalizedEventType,
    city: sanitizeString(city || pageContext?.city, 120),
    listingId: sanitizeString(listingId || pageContext?.listingId, 120),
    listingTitle: sanitizeString(listingTitle, 220),
    destinationPath: sanitizeString(destinationPath, 240),
    sourceSection: sanitizeString(sourceSection, 120),
    sourceLabel: sanitizeString(sourceLabel, 160),
    pageContext,
  });
};

export const trackGuestCityClick = async ({
  city = "",
  destinationPath = "",
  sourceSection = "",
  sourceLabel = "",
} = {}) => {
  const normalizedCity = sanitizeString(city, 120);
  if (!normalizedCity) return;

  await trackGuestJourneyEvent({
    eventType: "city_click",
    city: normalizedCity,
    destinationPath,
    sourceSection,
    sourceLabel,
  });
};

export const trackGuestListingClick = async ({
  city = "",
  listingId = "",
  listingTitle = "",
  destinationPath = "",
  sourceSection = "",
  sourceLabel = "",
} = {}) => {
  const normalizedListingId = sanitizeString(listingId, 120);
  if (!normalizedListingId) return;

  await trackGuestJourneyEvent({
    eventType: "listing_click",
    city,
    listingId: normalizedListingId,
    listingTitle,
    destinationPath,
    sourceSection,
    sourceLabel,
  });
};

export const trackGuestPageView = async () => {
  if (typeof window === "undefined") return;

  const pathname = sanitizeString(window.location.pathname, 240) || "/";
  const search = sanitizeString(window.location.search, 240);
  const fullPath = `${pathname}${search}`;
  const dedupeValue = `${fullPath}::${Math.floor(Date.now() / PAGE_VIEW_DEDUPE_WINDOW_MS)}`;
  const previous = readStorageValue(PAGE_VIEW_DEDUPE_KEY);
  if (previous === dedupeValue) return;
  writeStorageValue(PAGE_VIEW_DEDUPE_KEY, dedupeValue);

  const pageContext = getPageContext();
  await trackGuestJourneyEvent({
    eventType: "page_view",
    city: pageContext.city,
    listingId: pageContext.listingId,
    destinationPath: fullPath,
    sourceSection: "route_change",
    sourceLabel: "page_view",
    pageContext,
  });
};
