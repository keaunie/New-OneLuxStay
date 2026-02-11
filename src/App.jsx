import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import LandingPage from "./LandingPage";
import AntwerpLandingPage from "./AntwerpLandingPage";
import LosAngelesLandingPage from "./LosAngelesLandingPage";
import RedondoBeachLandingPage from "./RedondoBeachLandingPage";
import DubaiLandingPage from "./DubaiLandingPage";
import MiamiBeachLandingPage from "./MiamiBeachLandingPage";
import ListingPage from "./ListingPage";
import PrivacyPolicy from "./PrivacyPolicy";
import TermsConditions from "./TermsConditions";
import CaliforniaPrivacyPolicy from "./CaliforniaPrivacyPolicy";
import AcknowledgementPage from "./AcknowledgementPage";
import LoadingScreen from "./components/LoadingScreen";
import "./App.css";

const CITY_ROUTE_PREFIXES = new Set([
  "/antwerp",
  "/antwerpen",
  "/los-angeles",
  "/losangeles",
  "/miami",
  "/miami-beach",
  "/redondo-beach",
  "/dubai",
]);

const isCityPath = (path = "") => {
  const normalized = path.toLowerCase();
  for (const prefix of CITY_ROUTE_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) return true;
  }
  return false;
};

const useCityRouteLoading = () => {
  const location = useLocation();
  const shouldShowLoader = useMemo(
    () => isCityPath(location.pathname),
    [location.pathname],
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

  return appLoaded;
};

function AppRoutes() {
  const appLoaded = useCityRouteLoading();
  return (
    <>
      <LoadingScreen active={!appLoaded} />
      <div className={`app-shell${appLoaded ? " is-ready" : ""}`}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/antwerpen" element={<AntwerpLandingPage />} />
          <Route path="/antwerp" element={<AntwerpLandingPage />} />
          <Route path="/antwerpen/listing/:listingId" element={<AntwerpLandingPage />} />
          <Route path="/antwerp/listing/:listingId" element={<AntwerpLandingPage />} />
          <Route path="/los-angeles" element={<LosAngelesLandingPage />} />
          <Route path="/losangeles" element={<LosAngelesLandingPage />} />
          <Route path="/los-angeles/listing/:listingId" element={<LosAngelesLandingPage />} />
          <Route path="/losangeles/listing/:listingId" element={<LosAngelesLandingPage />} />
          <Route path="/miami-beach" element={<MiamiBeachLandingPage />} />
          <Route path="/miami" element={<MiamiBeachLandingPage />} />
          <Route path="/miami-beach/listing/:listingId" element={<MiamiBeachLandingPage />} />
          <Route path="/miami/listing/:listingId" element={<MiamiBeachLandingPage />} />
          <Route path="/redondo-beach" element={<RedondoBeachLandingPage />} />
          <Route path="/redondo-beach/listing/:listingId" element={<RedondoBeachLandingPage />} />
          <Route path="/dubai" element={<DubaiLandingPage />} />
          <Route path="/dubai/listing/:listingId" element={<DubaiLandingPage />} />
          <Route path="/:citySlug/listing/:listingId" element={<ListingPage />} />
          <Route path="/listings" element={<ListingPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsConditions />} />
          <Route path="/california-privacy-policy" element={<CaliforniaPrivacyPolicy />} />
          <Route path="/california-privacy" element={<CaliforniaPrivacyPolicy />} />
          <Route path="/acknowledge" element={<AcknowledgementPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
