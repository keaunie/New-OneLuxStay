import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./LandingPage";
import AntwerpLandingPage from "./AntwerpLandingPage";
import LosAngelesLandingPage from "./LosAngelesLandingPage";
import ListingPage from "./ListingPage";
import PrivacyPolicy from "./PrivacyPolicy";
import TermsConditions from "./TermsConditions";
import CaliforniaPrivacyPolicy from "./CaliforniaPrivacyPolicy";
import "./App.css";

function App() {
  return (
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
  );
}

export default App;
