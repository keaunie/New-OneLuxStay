import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { routePreloaders } from "./utils/routePreloaders";
import ChatConcierge from "./components/ChatConcierge";
import ScrollToTop from "./components/ScrollToTop";
import AnalyticsTracker from "./components/AnalyticsTracker";
import ProtectedSuperAdminRoute from "./components/ProtectedSuperAdminRoute";
import { trackGuestPageView } from "./utils/guestAnalytics";
import "./App.css";

const LoadingScreen = lazy(() => import("./components/LoadingScreen"));
const LandingPage = lazy(routePreloaders.landing);
const AntwerpLandingPage = lazy(routePreloaders.antwerp);
const LosAngelesLandingPage = lazy(routePreloaders.losAngeles);
const RedondoBeachPrimaryPage = lazy(routePreloaders.redondoBeach);
const RedondoBeachLegacyPage = lazy(routePreloaders.redondoBeachLegacy);
const DubaiLandingPage = lazy(routePreloaders.dubai);
const HollywoodLandingPage = lazy(() => import("./HollywoodLandingPage"));
const ListingPage = lazy(routePreloaders.listing);
const GlobalUnitsPage = lazy(routePreloaders.global);
const HealthcareProfessionalsPage = lazy(routePreloaders.healthcareProfessionals);
const PrivacyPolicy = lazy(routePreloaders.privacy);
const TermsConditions = lazy(routePreloaders.terms);
const CaliforniaPrivacyPolicy = lazy(routePreloaders.californiaPrivacy);
const AcknowledgementPage = lazy(routePreloaders.acknowledge);
const BookingConfirmationPage = lazy(routePreloaders.bookingConfirmation);
const CheckoutCancelledPage = lazy(routePreloaders.checkoutCancelled);
const RoadmapPrivatePage = lazy(routePreloaders.roadmapPrivate);
const AiAgentPage = lazy(routePreloaders.aiAgent);
const AdminsOlsPage = lazy(routePreloaders.adminsOls);
const AdminsOlsAuthPage = lazy(routePreloaders.adminsOlsAuth);
const AdminsOlsInviteAcceptPage = lazy(routePreloaders.adminsOlsInviteAccept);
const AdminsOlsAuditPage = lazy(routePreloaders.adminsOlsAudit);
const AdminsOlsGuestJourneysPage = lazy(routePreloaders.adminsOlsGuestJourneys);
const ExecutiveOlsPage = lazy(routePreloaders.executiveOls);
const CallsPage = lazy(routePreloaders.belgiumPhone);
const CityAttractionsPage = lazy(routePreloaders.cityAttractions);
const SettingConfigOlsPage = lazy(routePreloaders.settingConfigOls);
const ApaleoTestPage = lazy(routePreloaders.apaleoTest);
const AdminPresencePage = lazy(routePreloaders.adminPresence);
const AdminReservationsPage = lazy(routePreloaders.adminReservations);
const GuestReservationPage  = lazy(routePreloaders.guestReservation);
const BlogPage              = lazy(routePreloaders.blog);
const BlogArticlePage       = lazy(routePreloaders.blogArticle);
const AdminBlogPage         = lazy(routePreloaders.adminBlog);
const AdminPropertiesPage   = lazy(() => import("./pages/AdminPropertiesPage"));

const CITY_ROOT_PATHS = new Set([
  "/antwerp",
  "/antwerpen",
  "/los-angeles",
  "/losangeles",
  "/redondo",
  "/redondo-beach",
  "/redondo-beach-legacy",
  "/dubai",
]);

const isCityRootPath = (path = "") => CITY_ROOT_PATHS.has(path.toLowerCase());

const useCityRouteLoading = () => {
  const location = useLocation();
  const shouldShowLoader = useMemo(
    () =>
      isCityRootPath(location.pathname) &&
      !location.state?.skipCityLoader,
    [location.pathname, location.state],
  );
  const [appLoaded, setAppLoaded] = useState(() => !shouldShowLoader);

  useLayoutEffect(() => {
    let active = true;
    if (!shouldShowLoader) {
      setAppLoaded(true);
      return () => {
        active = false;
      };
    }

    setAppLoaded(false);
    const timer = setTimeout(() => {
      if (active) setAppLoaded(true);
    }, 4000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [shouldShowLoader, location.pathname]);

  return { appLoaded, shouldShowLoader };
};

function RootRoute() {
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const checkoutState = (params.get("checkout") || "").toLowerCase();
  const RootPage = checkoutState === "cancelled" ? CheckoutCancelledPage : LandingPage;

  return (
    <Suspense fallback={null}>
      <RootPage />
    </Suspense>
  );
}

function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { appLoaded, shouldShowLoader } = useCityRouteLoading();
  const pathname = String(location.pathname || "").toLowerCase();
  const isAiAgentConsoleEnabled =
    import.meta.env.DEV ||
    String(import.meta.env.VITE_ENABLE_AI_AGENT_CONSOLE || "").trim().toLowerCase() === "true";
  const hideChatConcierge =
    pathname.startsWith("/admins-ols") ||
    pathname.startsWith("/admin/properties") ||
    pathname.startsWith("/executive-ols") ||
    pathname.startsWith("/admin-reservations") ||
    pathname.startsWith("/private/") ||
    pathname.startsWith("/blog");
  const renderLazyRoute = (Component, props = {}) => (
    <Suspense fallback={null}>
      <Component {...props} />
    </Suspense>
  );

  useEffect(() => {
    // If Supabase invite/recovery links land on the site root with tokens in the hash,
    // route them into the dedicated accept page so the UI can complete the flow.
    try {
      const hash = String(location.hash || "");
      const pathname = String(location.pathname || "");
      if (pathname === "/" && (hash.includes("access_token=") || hash.toLowerCase().includes("error="))) {
        navigate({ pathname: "/executive-ols/accept", hash }, { replace: true });
      }
    } catch {
      // ignore
    }

    if (
      !pathname ||
      pathname.startsWith("/admins-ols") ||
      pathname.startsWith("/executive-ols") ||
      pathname.startsWith("/private/")
    ) {
      return;
    }
    if (pathname === "/ai-agent") return;
    trackGuestPageView().catch(() => null);
  }, [location.hash, location.pathname, location.search, navigate, pathname]);

  return (
    <>
      {shouldShowLoader && (
        <Suspense fallback={null}>
          <LoadingScreen active={!appLoaded} />
        </Suspense>
      )}
      <AnalyticsTracker />
      <ScrollToTop />
      <div className={`app-shell${appLoaded ? " is-ready" : ""}`}>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/miami" element={<Navigate to="/global" replace />} />
          <Route path="/miami-beach" element={<Navigate to="/global" replace />} />
          <Route path="/miami/attractions" element={<Navigate to="/global" replace />} />
          <Route path="/miami-beach/attractions" element={<Navigate to="/global" replace />} />
          <Route path="/:citySlug/attractions" element={renderLazyRoute(CityAttractionsPage)} />
          <Route path="/antwerpen" element={renderLazyRoute(AntwerpLandingPage)} />
          <Route path="/antwerp" element={renderLazyRoute(AntwerpLandingPage)} />
          <Route path="/antwerpen/:areaSlug/:bookingBundle" element={renderLazyRoute(AntwerpLandingPage)} />
          <Route path="/antwerp/:areaSlug/:bookingBundle" element={renderLazyRoute(AntwerpLandingPage)} />
          <Route path="/antwerpen/:areaSlug" element={renderLazyRoute(AntwerpLandingPage)} />
          <Route path="/antwerp/:areaSlug" element={renderLazyRoute(AntwerpLandingPage)} />
          <Route
            path="/antwerpen/listing/:listingId/:checkIn/:checkOut/:guests"
            element={renderLazyRoute(AntwerpLandingPage)}
          />
          <Route
            path="/antwerp/listing/:listingId/:checkIn/:checkOut/:guests"
            element={renderLazyRoute(AntwerpLandingPage)}
          />
          <Route path="/antwerpen/listing/:listingId" element={renderLazyRoute(AntwerpLandingPage)} />
          <Route path="/antwerp/listing/:listingId" element={renderLazyRoute(AntwerpLandingPage)} />
          <Route path="/hollywood" element={renderLazyRoute(HollywoodLandingPage)} />
          <Route path="/hollywood/listing/:listingId" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/los-angeles" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/losangeles" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/los-angeles/:areaSlug/:bookingBundle" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/losangeles/:areaSlug/:bookingBundle" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/los-angeles/:areaSlug" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/losangeles/:areaSlug" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/los-angeles/listing/:listingId" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/losangeles/listing/:listingId" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/miami-beach/:areaSlug/:bookingBundle" element={<Navigate to="/global" replace />} />
          <Route path="/miami/:areaSlug/:bookingBundle" element={<Navigate to="/global" replace />} />
          <Route path="/miami-beach/:areaSlug" element={<Navigate to="/global" replace />} />
          <Route path="/miami/:areaSlug" element={<Navigate to="/global" replace />} />
          <Route path="/miami-beach/listing/:listingId/:checkIn/:checkOut/:guests" element={<Navigate to="/global" replace />} />
          <Route path="/miami/listing/:listingId/:checkIn/:checkOut/:guests" element={<Navigate to="/global" replace />} />
          <Route path="/miami-beach/listing/:listingId" element={<Navigate to="/global" replace />} />
          <Route path="/miami/listing/:listingId" element={<Navigate to="/global" replace />} />
          <Route path="/miami-beach/*" element={<Navigate to="/global" replace />} />
          <Route path="/miami/*" element={<Navigate to="/global" replace />} />
          <Route path="/redondo-beach" element={renderLazyRoute(RedondoBeachPrimaryPage)} />
          <Route path="/redondo-beach-legacy" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo-beach-legacy/:areaSlug/:bookingBundle" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo/:areaSlug/:bookingBundle" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo-beach/:areaSlug/:bookingBundle" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo-beach-legacy/:areaSlug" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo/:areaSlug" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo-beach/:areaSlug" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo-beach-legacy/listing/:listingId" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo/listing/:listingId" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/redondo-beach/listing/:listingId" element={renderLazyRoute(RedondoBeachLegacyPage)} />
          <Route path="/dubai" element={renderLazyRoute(DubaiLandingPage)} />
          <Route path="/dubai/:areaSlug/:bookingBundle" element={renderLazyRoute(DubaiLandingPage)} />
          <Route path="/dubai/:areaSlug" element={renderLazyRoute(DubaiLandingPage)} />
          <Route path="/dubai/listing/:listingId" element={renderLazyRoute(DubaiLandingPage)} />
          <Route
            path="/:citySlug/listing/:listingId/:checkIn/:checkOut/:guests"
            element={renderLazyRoute(ListingPage)}
          />
          <Route path="/:citySlug/listing/:listingId" element={renderLazyRoute(ListingPage)} />
          <Route path="/listings" element={renderLazyRoute(ListingPage)} />
          <Route path="/global" element={renderLazyRoute(GlobalUnitsPage)} />
          <Route path="/global-units" element={renderLazyRoute(GlobalUnitsPage)} />
          <Route path="/one-lux-stay-global" element={renderLazyRoute(GlobalUnitsPage)} />
          <Route path="/healthcare-professionals" element={renderLazyRoute(HealthcareProfessionalsPage)} />
          <Route path="/business/healthcare-professionals" element={renderLazyRoute(HealthcareProfessionalsPage)} />
          <Route path="/business/construction-accommodations" element={renderLazyRoute(HealthcareProfessionalsPage, { industry: "construction" })} />
          <Route path="/business/corporate-relocation" element={renderLazyRoute(HealthcareProfessionalsPage, { industry: "corporate" })} />
          <Route path="/business/entertainment-industry" element={renderLazyRoute(HealthcareProfessionalsPage, { industry: "entertainment" })} />
          <Route path="/business/government" element={renderLazyRoute(HealthcareProfessionalsPage, { industry: "government" })} />
          <Route path="/privacy-policy" element={renderLazyRoute(PrivacyPolicy)} />
          <Route path="/privacy" element={renderLazyRoute(PrivacyPolicy)} />
          <Route path="/terms" element={renderLazyRoute(TermsConditions)} />
          <Route path="/california-privacy-policy" element={renderLazyRoute(CaliforniaPrivacyPolicy)} />
          <Route path="/california-privacy" element={renderLazyRoute(CaliforniaPrivacyPolicy)} />
          <Route path="/acknowledge" element={renderLazyRoute(AcknowledgementPage)} />
          <Route path="/booking-confirmation" element={renderLazyRoute(BookingConfirmationPage)} />
          <Route path="/admins-ols/login" element={<Navigate to="/executive-ols/login" replace />} />
          <Route path="/admins-ols/accept" element={<Navigate to="/executive-ols/accept" replace />} />
          <Route path="/admins-ols/audit" element={<Navigate to="/executive-ols/audit" replace />} />
          <Route path="/admins-ols/guest-journeys" element={<Navigate to="/executive-ols/guest-journeys" replace />} />
          <Route path="/admins-ols/whatsapp" element={<Navigate to="/executive-ols/whatsapp" replace />} />
          <Route path="/admins-ols/conversations" element={<Navigate to="/executive-ols/conversations" replace />} />
          <Route path="/admins-ols/chat/:conversationId" element={<Navigate to="/executive-ols/chat/:conversationId" replace />} />
          <Route path="/admins-ols" element={<Navigate to="/executive-ols" replace />} />
          <Route path="/admins-ols/*" element={<Navigate to="/executive-ols" replace />} />
          <Route path="/executive-ols/login" element={renderLazyRoute(AdminsOlsAuthPage)} />
          <Route path="/executive-ols/accept" element={renderLazyRoute(AdminsOlsInviteAcceptPage)} />
          <Route path="/executive-ols" element={renderLazyRoute(AdminsOlsPage)} />
          <Route path="/executive-ols/conversations" element={renderLazyRoute(AdminsOlsPage)} />
          <Route path="/executive-ols/chat/:conversationId" element={renderLazyRoute(AdminsOlsPage)} />
          <Route path="/executive-ols/audit" element={renderLazyRoute(AdminsOlsAuditPage)} />
          <Route path="/executive-ols/guest-journeys" element={renderLazyRoute(AdminsOlsGuestJourneysPage)} />
          <Route path="/admin-presence" element={<Navigate to="/executive-ols/admin-presence" replace />} />
          <Route
            path="/executive-ols/admin-presence"
            element={<ProtectedSuperAdminRoute>{renderLazyRoute(AdminPresencePage)}</ProtectedSuperAdminRoute>}
          />
          <Route path="/executive-ols/whatsapp" element={renderLazyRoute(ExecutiveOlsPage)} />
          <Route path="/executive-ols/calls" element={renderLazyRoute(CallsPage)} />
          {isAiAgentConsoleEnabled && <Route path="/ai-agent" element={renderLazyRoute(AiAgentPage)} />}
          <Route path="/private/roadmap/:accessKey" element={renderLazyRoute(RoadmapPrivatePage)} />
          <Route path="/dev-ols/config" element={renderLazyRoute(SettingConfigOlsPage)} />
          <Route path="/apaleo-test" element={renderLazyRoute(ApaleoTestPage)} />
          <Route path="/admin-reservations" element={renderLazyRoute(AdminReservationsPage)} />
          <Route path="/reserve" element={renderLazyRoute(GuestReservationPage)} />
          <Route path="/blog" element={renderLazyRoute(BlogPage)} />
          <Route path="/blog/:slug" element={renderLazyRoute(BlogArticlePage)} />
          <Route path="/executive-ols/blog" element={renderLazyRoute(AdminBlogPage)} />
          <Route path="/admin/properties" element={renderLazyRoute(AdminPropertiesPage)} />
          <Route path="/admin/properties/:propertyId" element={renderLazyRoute(AdminPropertiesPage)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {!hideChatConcierge && <ChatConcierge />}
      </div>
    </>
  ); 
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
