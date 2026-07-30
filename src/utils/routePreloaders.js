const preloadLandingPage = () => import("../LandingPage");
const preloadAntwerpLandingPage = () => import("../AntwerpLandingPage");
const preloadLosAngelesLandingPage = () => import("../LosAngelesLandingPage");
const preloadHollywoodLandingPage = () => import("../HollywoodLandingPage");
const preloadRedondoBeachPrimaryPage = () => import("../RedondoBeachPrimaryPage");
const preloadRedondoBeachLegacyProtectedPage = () => import("../RedondoBeachLegacyProtectedPage");
const preloadDubaiLandingPage = () => import("../DubaiLandingPage");
const preloadListingPage = () => import("../ListingPage");
const preloadGlobalUnitsPage = () => import("../GlobalUnitsPage");
const preloadHealthcareProfessionalsPage = () => import("../professional_careers");
const preloadPrivacyPolicy = () => import("../PrivacyPolicy");
const preloadTermsConditions = () => import("../TermsConditions");
const preloadCaliforniaPrivacyPolicy = () => import("../CaliforniaPrivacyPolicy");
const preloadAcknowledgementPage = () => import("../AcknowledgementPage");
const preloadBookingConfirmationPage = () => import("../BookingConfirmationPage");
const preloadCheckoutCancelledPage = () => import("../CheckoutCancelledPage");
const preloadThankYouPage = () => import("../ThankYouPage");
const preloadRoadmapPrivatePage = () => import("../RoadmapPrivatePage");
const preloadAiAgentPage = () => import("../AiAgentPage");
const preloadAdminsOlsPage = () => import("../AdminsOlsPage");
const preloadAdminsOlsAuthPage = () => import("../AdminsOlsAuthPage");
const preloadAdminsOlsInviteAcceptPage = () => import("../AdminsOlsInviteAcceptPage");
const preloadAdminsOlsAuditPage = () => import("../AdminsOlsAuditPage");
const preloadAdminsOlsGuestJourneysPage = () => import("../AdminsOlsGuestJourneysPage");
const preloadExecutiveOlsPage = () => import("../executiveOls/ExecutiveOlsPage");
const preloadBelgiumPhonePage = () => import("../executiveOls/CallsPage");
const preloadCityAttractionsPage = () => import("../CityAttractionsPage");
const preloadSettingConfigOlsPage = () => import("../SettingConfigOlsPage");
const preloadApaleoTestPage = () => import("../pages/ApaleoTestPage");
const preloadAdminPresencePage = () => import("../AdminPresencePage");
const preloadAdminReservationsPage = () => import("../pages/AdminReservationsPage");
const preloadGuestReservationPage  = () => import("../pages/GuestReservationPage");
const preloadBlogPage = () => import("../pages/BlogPage");
const preloadBlogArticlePage = () => import("../pages/BlogArticlePage");
const preloadAdminBlogPage = () => import("../pages/AdminBlogPage");
const preloadExecutiveOlsAuthPage = preloadAdminsOlsAuthPage;

export const routePreloaders = {
  landing: preloadLandingPage,
  antwerp: preloadAntwerpLandingPage,
  hollywood: preloadHollywoodLandingPage,
  losAngeles: preloadLosAngelesLandingPage,
  redondoBeach: preloadRedondoBeachPrimaryPage,
  redondoBeachLegacy: preloadRedondoBeachLegacyProtectedPage,
  dubai: preloadDubaiLandingPage,
  listing: preloadListingPage,
  global: preloadGlobalUnitsPage,
  healthcareProfessionals: preloadHealthcareProfessionalsPage,
  privacy: preloadPrivacyPolicy,
  terms: preloadTermsConditions,
  californiaPrivacy: preloadCaliforniaPrivacyPolicy,
  acknowledge: preloadAcknowledgementPage,
  bookingConfirmation: preloadBookingConfirmationPage,
  checkoutCancelled: preloadCheckoutCancelledPage,
  thankYou: preloadThankYouPage,
  roadmapPrivate: preloadRoadmapPrivatePage,
  aiAgent: preloadAiAgentPage,
  adminsOls: preloadAdminsOlsPage,
  adminsOlsAuth: preloadAdminsOlsAuthPage,
  adminsOlsInviteAccept: preloadAdminsOlsInviteAcceptPage,
  adminsOlsAudit: preloadAdminsOlsAuditPage,
  adminsOlsGuestJourneys: preloadAdminsOlsGuestJourneysPage,
  executiveOls: preloadExecutiveOlsPage,
  belgiumPhone: preloadBelgiumPhonePage,
  cityAttractions: preloadCityAttractionsPage,
  settingConfigOls: preloadSettingConfigOlsPage,
  apaleoTest: preloadApaleoTestPage,
  adminPresence: preloadAdminPresencePage,
  adminReservations: preloadAdminReservationsPage,
  guestReservation:  preloadGuestReservationPage,
  blog: preloadBlogPage,
  blogArticle: preloadBlogArticlePage,
  adminBlog: preloadAdminBlogPage,
  executiveOlsAuth: preloadExecutiveOlsAuthPage,
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
  if (normalized === "/hollywood" || normalized.startsWith("/hollywood/")) {
    return Promise.all([routePreloaders.hollywood(), routePreloaders.listing()]).then(() => undefined);
  }
  if (normalized === "/los-angeles" || normalized === "/losangeles" || normalized.startsWith("/los-angeles/") || normalized.startsWith("/losangeles/")) {
    return Promise.all([routePreloaders.losAngeles(), routePreloaders.listing()]).then(() => undefined);
  }
  if (normalized === "/redondo-beach") {
    return Promise.all([routePreloaders.redondoBeach(), routePreloaders.listing()]).then(() => undefined);
  }
  if (
    normalized.startsWith("/redondo-beach-legacy/") ||
    normalized === "/redondo-beach-legacy" ||
    normalized === "/redondo" ||
    normalized.startsWith("/redondo/")
  ) {
    return Promise.all([routePreloaders.redondoBeachLegacy(), routePreloaders.listing()]).then(() => undefined);
  }
  if (normalized.startsWith("/redondo-beach/")) {
    return Promise.all([routePreloaders.redondoBeachLegacy(), routePreloaders.listing()]).then(() => undefined);
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
  if (normalized === "/miami" || normalized === "/miami-beach" || normalized.startsWith("/miami/") || normalized.startsWith("/miami-beach/")) {
    return routePreloaders.global().then(() => undefined);
  }
  if (normalized === "/listings" || normalized.includes("/listing/")) {
    return routePreloaders.listing().then(() => undefined);
  }
  if (normalized === "/global" || normalized === "/global-units" || normalized === "/one-lux-stay-global") {
    return routePreloaders.global().then(() => undefined);
  }
  if (
    normalized === "/healthcare-professionals" ||
    normalized === "/business/healthcare-professionals" ||
    normalized === "/business/construction-accommodations" ||
    normalized === "/business/corporate-relocation" ||
    normalized === "/business/entertainment-industry" ||
    normalized === "/business/government"
  ) {
    return routePreloaders.healthcareProfessionals().then(() => undefined);
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
  if (normalized === "/thank-you") {
    return routePreloaders.thankYou().then(() => undefined);
  }
  if (normalized === "/ai-agent") {
    return routePreloaders.aiAgent().then(() => undefined);
  }
  if (normalized === "/admins-ols" || normalized === "/executive-ols") {
    return routePreloaders.adminsOls().then(() => undefined);
  }
  if (normalized === "/admins-ols/login" || normalized === "/executive-ols/login") {
    return routePreloaders.adminsOlsAuth().then(() => undefined);
  }
  if (normalized === "/admins-ols/accept" || normalized === "/executive-ols/accept") {
    return routePreloaders.adminsOlsInviteAccept().then(() => undefined);
  }
  if (normalized === "/admins-ols/audit" || normalized === "/executive-ols/audit") {
    return routePreloaders.adminsOlsAudit().then(() => undefined);
  }
  if (normalized === "/admins-ols/guest-journeys" || normalized === "/executive-ols/guest-journeys") {
    return routePreloaders.adminsOlsGuestJourneys().then(() => undefined);
  }
  if (normalized === "/admin-presence" || normalized === "/executive-ols/admin-presence") {
    return routePreloaders.adminPresence().then(() => undefined);
  }
  if (normalized === "/admins-ols/whatsapp" || normalized === "/executive-ols/whatsapp") {
    return routePreloaders.executiveOls().then(() => undefined);
  }
  if (normalized === "/dev-ols/config") {
    return routePreloaders.settingConfigOls().then(() => undefined);
  }
  if (normalized === "/apaleo-test") {
    return routePreloaders.apaleoTest().then(() => undefined);
  }
  return prefetchCityRoute(normalized);
};
