import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./LandingPage";
import AntwerpLandingPage from "./AntwerpLandingPage";
import LosAngelesLandingPage from "./LosAngelesLandingPage";
import ListingPage from "./ListingPage";
import PrivacyPolicy from "./PrivacyPolicy";
import TermsConditions from "./TermsConditions";
import CaliforniaPrivacyPolicy from "./CaliforniaPrivacyPolicy";
import LoadingScreen from "./components/LoadingScreen";
import "./App.css";

function App() {
  const [appLoaded, setAppLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const startedAt = Date.now();
    const minDurationMs = 4000;
    const finish = () => {
      if (!active) return;
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(minDurationMs - elapsed, 0);
      setTimeout(() => {
        if (active) setAppLoaded(true);
      }, wait);
    };

    if (document.readyState === "complete") {
      requestAnimationFrame(() => setTimeout(finish, 160));
      return () => {
        active = false;
      };
    }

    const handleLoad = () => setTimeout(finish, 160);
    window.addEventListener("load", handleLoad);
    return () => {
      active = false;
      window.removeEventListener("load", handleLoad);
    };
  }, []);

  return (
    <>
      <LoadingScreen active={!appLoaded} />
      <div className={`app-shell${appLoaded ? " is-ready" : ""}`}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/antwerpen" element={<AntwerpLandingPage />} />
            <Route path="/antwerp" element={<AntwerpLandingPage />} />
            <Route path="/los-angeles" element={<LosAngelesLandingPage />} />
            <Route path="/losangeles" element={<LosAngelesLandingPage />} />
            <Route path="/los-angeles/listing/:listingId" element={<LosAngelesLandingPage />} />
            <Route path="/losangeles/listing/:listingId" element={<LosAngelesLandingPage />} />
            <Route path="/stay" element={<ListingPage />} />
            <Route path="/listings" element={<ListingPage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsConditions />} />
            <Route path="/california-privacy-policy" element={<CaliforniaPrivacyPolicy />} />
            <Route path="/california-privacy" element={<CaliforniaPrivacyPolicy />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </div>
    </>
  );
}

export default App;
