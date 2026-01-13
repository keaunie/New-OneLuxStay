import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./LandingPage";
import AntwerpLandingPage from "./AntwerpLandingPage";
import LosAngelesLandingPage from "./LosAngelesLandingPage";
import ListingPage from "./ListingPage";
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
        <Route path="/stay" element={<ListingPage />} />
        <Route path="/listings" element={<ListingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
