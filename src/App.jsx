import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { routePreloaders } from "./utils/routePreloaders";
import ChatConcierge from "./components/ChatConcierge";
import { trackGuestPageView } from "./utils/guestAnalytics";
import "./App.css";

const LoadingScreen = lazy(() => import("./components/LoadingScreen"));
const LandingPage = lazy(routePreloaders.landing);
const AntwerpLandingPage = lazy(routePreloaders.antwerp);
const LosAngelesLandingPage = lazy(routePreloaders.losAngeles);
const RedondoBeachLandingPage = lazy(routePreloaders.redondoBeach);
const DubaiLandingPage = lazy(routePreloaders.dubai);
const MiamiBeachLandingPage = lazy(routePreloaders.miami);
const ListingPage = lazy(routePreloaders.listing);
const GlobalUnitsPage = lazy(routePreloaders.global);
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
const ExecutiveOlsAuthPage = lazy(routePreloaders.executiveOlsAuth);

const CITY_ROOT_PATHS = new Set([
  "/antwerp",
  "/antwerpen",
  "/los-angeles",
  "/losangeles",
  "/miami",
  "/miami-beach",
  "/redondo",
  "/redondo-beach",
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
  const isAiAgentConsoleEnabled =
    import.meta.env.DEV ||
    String(import.meta.env.VITE_ENABLE_AI_AGENT_CONSOLE || "").trim().toLowerCase() === "true";
  const hideChatConcierge =
    location.pathname.startsWith("/admins-ols") ||
    location.pathname.startsWith("/executive-ols") ||
    location.pathname.startsWith("/private/roadmap/");
  const renderLazyRoute = (Component) => (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );

  useEffect(() => {
    // If Supabase invite/recovery links land on the site root with tokens in the hash,
    // route them into the dedicated accept page so the UI can complete the flow.
    try {
      const hash = String(location.hash || "");
      const pathname = String(location.pathname || "");
      if (pathname === "/" && (hash.includes("access_token=") || hash.toLowerCase().includes("error="))) {
        navigate({ pathname: "/admins-ols/accept", hash }, { replace: true });
      }
    } catch {
      // ignore
    }

    const pathname = String(location.pathname || "").toLowerCase();
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
  }, [location.hash, location.pathname, location.search, navigate]);

  return (
    <>
      {shouldShowLoader && (
        <Suspense fallback={null}>
          <LoadingScreen active={!appLoaded} />
        </Suspense>
      )}
      <div className={`app-shell${appLoaded ? " is-ready" : ""}`}>
        <Routes>
          <Route path="/" element={<RootRoute />} />
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
          <Route path="/los-angeles" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/losangeles" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/los-angeles/:areaSlug/:bookingBundle" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/losangeles/:areaSlug/:bookingBundle" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/los-angeles/:areaSlug" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/losangeles/:areaSlug" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/los-angeles/listing/:listingId" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/losangeles/listing/:listingId" element={renderLazyRoute(LosAngelesLandingPage)} />
          <Route path="/miami-beach" element={renderLazyRoute(MiamiBeachLandingPage)} />
          <Route path="/miami" element={renderLazyRoute(MiamiBeachLandingPage)} />
          <Route path="/miami-beach/:areaSlug/:bookingBundle" element={renderLazyRoute(MiamiBeachLandingPage)} />
          <Route path="/miami/:areaSlug/:bookingBundle" element={renderLazyRoute(MiamiBeachLandingPage)} />
          <Route path="/miami-beach/:areaSlug" element={renderLazyRoute(MiamiBeachLandingPage)} />
          <Route path="/miami/:areaSlug" element={renderLazyRoute(MiamiBeachLandingPage)} />
          <Route path="/miami-beach/listing/:listingId" element={renderLazyRoute(MiamiBeachLandingPage)} />
          <Route path="/miami/listing/:listingId" element={renderLazyRoute(MiamiBeachLandingPage)} />
          <Route path="/redondo-beach" element={renderLazyRoute(RedondoBeachLandingPage)} />
          <Route path="/redondo" element={renderLazyRoute(RedondoBeachLandingPage)} />
          <Route path="/redondo-beach/:areaSlug/:bookingBundle" element={renderLazyRoute(RedondoBeachLandingPage)} />
          <Route path="/redondo/:areaSlug/:bookingBundle" element={renderLazyRoute(RedondoBeachLandingPage)} />
          <Route path="/redondo-beach/:areaSlug" element={renderLazyRoute(RedondoBeachLandingPage)} />
          <Route path="/redondo/:areaSlug" element={renderLazyRoute(RedondoBeachLandingPage)} />
          <Route path="/redondo-beach/listing/:listingId" element={renderLazyRoute(RedondoBeachLandingPage)} />
          <Route path="/redondo/listing/:listingId" element={renderLazyRoute(RedondoBeachLandingPage)} />
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
          <Route path="/privacy-policy" element={renderLazyRoute(PrivacyPolicy)} />
          <Route path="/privacy" element={renderLazyRoute(PrivacyPolicy)} />
          <Route path="/terms" element={renderLazyRoute(TermsConditions)} />
          <Route path="/california-privacy-policy" element={renderLazyRoute(CaliforniaPrivacyPolicy)} />
          <Route path="/california-privacy" element={renderLazyRoute(CaliforniaPrivacyPolicy)} />
          <Route path="/acknowledge" element={renderLazyRoute(AcknowledgementPage)} />
          <Route path="/booking-confirmation" element={renderLazyRoute(BookingConfirmationPage)} />
          <Route path="/admins-ols/login" element={renderLazyRoute(AdminsOlsAuthPage)} />
          <Route path="/admins-ols/accept" element={renderLazyRoute(AdminsOlsInviteAcceptPage)} />
          <Route path="/admins-ols" element={renderLazyRoute(AdminsOlsPage)} />
          <Route path="/admins-ols/audit" element={renderLazyRoute(AdminsOlsAuditPage)} />
          <Route path="/admins-ols/guest-journeys" element={renderLazyRoute(AdminsOlsGuestJourneysPage)} />
          <Route path="/executive-ols/login" element={renderLazyRoute(ExecutiveOlsAuthPage)} />
          <Route path="/executive-ols" element={renderLazyRoute(ExecutiveOlsPage)} />
          {isAiAgentConsoleEnabled && <Route path="/ai-agent" element={renderLazyRoute(AiAgentPage)} />}
          <Route path="/private/roadmap/:accessKey" element={renderLazyRoute(RoadmapPrivatePage)} />
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
