import { Suspense, lazy, useLayoutEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { routePreloaders } from "./utils/routePreloaders";
import SiteWalkthrough from "./components/SiteWalkthrough";
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
  const { appLoaded, shouldShowLoader } = useCityRouteLoading();
  const renderLazyRoute = (Component) => (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );

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
          <Route path="/private/roadmap/:accessKey" element={renderLazyRoute(RoadmapPrivatePage)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <SiteWalkthrough />
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
