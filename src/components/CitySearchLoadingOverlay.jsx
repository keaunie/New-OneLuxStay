import { createPortal } from "react-dom";

const CitySearchLoadingOverlay = ({ active }) => {
  if (!active || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="city-search-loading-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Searching available stays"
    >
      <div className="city-search-loading-card">
        <span className="city-search-loading-spinner" aria-hidden="true" />
        <strong>Finding your perfect stay</strong>
        <span>Updating available homes for your filters...</span>
      </div>
    </div>,
    document.body
  );
};

export default CitySearchLoadingOverlay;
