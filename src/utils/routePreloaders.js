const preloadLandingPage = () => import("../LandingPage");
const preloadAntwerpLandingPage = () => import("../AntwerpLandingPage");
const preloadLosAngelesLandingPage = () => import("../LosAngelesLandingPage");
const preloadRedondoBeachLandingPage = () => import("../RedondoBeachLandingPage");
const preloadDubaiLandingPage = () => import("../DubaiLandingPage");
const preloadMiamiBeachLandingPage = () => import("../MiamiBeachLandingPage");
const preloadListingPage = () => import("../ListingPage");
const preloadGlobalUnitsPage = () => import("../GlobalUnitsPage");
const preloadPrivacyPolicy = () => import("../PrivacyPolicy");
const preloadTermsConditions = () => import("../TermsConditions");
const preloadCaliforniaPrivacyPolicy = () => import("../CaliforniaPrivacyPolicy");
const preloadAcknowledgementPage = () => import("../AcknowledgementPage");
const preloadBookingConfirmationPage = () => import("../BookingConfirmationPage");
const preloadCheckoutCancelledPage = () => import("../CheckoutCancelledPage");
const preloadRoadmapPrivatePage = () => import("../RoadmapPrivatePage");
const preloadAiAgentPage = () => import("../AiAgentPage");

export const routePreloaders = {
  landing: preloadLandingPage,
  antwerp: preloadAntwerpLandingPage,
  losAngeles: preloadLosAngelesLandingPage,
  redondoBeach: preloadRedondoBeachLandingPage,
  dubai: preloadDubaiLandingPage,
  miami: preloadMiamiBeachLandingPage,
  listing: preloadListingPage,
  global: preloadGlobalUnitsPage,
  privacy: preloadPrivacyPolicy,
  terms: preloadTermsConditions,
  californiaPrivacy: preloadCaliforniaPrivacyPolicy,
  acknowledge: preloadAcknowledgementPage,
  bookingConfirmation: preloadBookingConfirmationPage,
  checkoutCancelled: preloadCheckoutCancelledPage,
  roadmapPrivate: preloadRoadmapPrivatePage,
  aiAgent: preloadAiAgentPage,
};

const normalizePathname = (value = "") => {
  const cleaned = String(value).trim();
  if (!cleaned) return "";
  try {
    const url = new URL(cleaned, "http://local.prefetch");
    return url.pathname.toLowerCase();
  } catch {
    const raw = cleaned.split("?")[0].split("#")[0];
    return raw.toLowerCase();
  }
};

export const prefetchCityRoute = (value = "") => {
  const normalized = normalizePathname(value);
  if (!normalized) return Promise.resolve();
  if (normalized === "/antwerp" || normalized === "/antwerpen" || normalized.startsWith("/antwerp/") || normalized.startsWith("/antwerpen/")) {
    return Promise.all([routePreloaders.antwerp(), routePreloaders.listing()]).then(() => undefined);
  }
  if (normalized === "/los-angeles" || normalized === "/losangeles" || normalized.startsWith("/los-angeles/") || normalized.startsWith("/losangeles/")) {
    return Promise.all([routePreloaders.losAngeles(), routePreloaders.listing()]).then(() => undefined);
  }
  if (normalized === "/miami" || normalized === "/miami-beach" || normalized.startsWith("/miami/") || normalized.startsWith("/miami-beach/")) {
    return Promise.all([routePreloaders.miami(), routePreloaders.listing()]).then(() => undefined);
  }
  if (normalized === "/redondo-beach" || normalized.startsWith("/redondo-beach/")) {
    return Promise.all([routePreloaders.redondoBeach(), routePreloaders.listing()]).then(() => undefined);
  }
  if (normalized === "/dubai" || normalized.startsWith("/dubai/")) {
    return Promise.all([routePreloaders.dubai(), routePreloaders.listing()]).then(() => undefined);
  }
  return Promise.resolve();
};

export const prefetchRouteByPath = (value = "") => {
  const normalized = normalizePathname(value);
  if (!normalized) return Promise.resolve();
  if (normalized === "/" || normalized === "") return routePreloaders.landing().then(() => undefined);
  if (normalized === "/listings" || normalized.includes("/listing/")) {
    return routePreloaders.listing().then(() => undefined);
  }
  if (normalized === "/global" || normalized === "/global-units" || normalized === "/one-lux-stay-global") {
    return routePreloaders.global().then(() => undefined);
  }
  if (normalized === "/privacy" || normalized === "/privacy-policy") {
    return routePreloaders.privacy().then(() => undefined);
  }
  if (normalized === "/terms") {
    return routePreloaders.terms().then(() => undefined);
  }
  if (normalized === "/california-privacy" || normalized === "/california-privacy-policy") {
    return routePreloaders.californiaPrivacy().then(() => undefined);
  }
  if (normalized === "/acknowledge") {
    return routePreloaders.acknowledge().then(() => undefined);
  }
  if (normalized === "/booking-confirmation") {
    return routePreloaders.bookingConfirmation().then(() => undefined);
  }
  if (normalized === "/checkout-cancelled") {
    return routePreloaders.checkoutCancelled().then(() => undefined);
  }
  if (normalized === "/ai-agent") {
    return routePreloaders.aiAgent().then(() => undefined);
  }
  return prefetchCityRoute(normalized);
};
