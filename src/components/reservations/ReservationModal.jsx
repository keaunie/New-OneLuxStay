import { useEffect, useState } from "react";
import ApaleoCheckoutModal from "../apaleo-checkout/ApaleoCheckoutModal.jsx";

// Renders the property preview + date/guest picker, then hands off to
// ApaleoCheckoutModal for the actual booking — the same booking-session +
// Adyen payment flow the city landing pages use. This used to POST straight
// to netlify/functions/apaleo-create-reservation.js, which created a
// "confirmed" Apaleo booking with no payment/guarantee step at all; that
// bypassed the payment gateway entirely and has been replaced.
export default function ReservationModal({ property, onClose }) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (!property) return null;

  const img = property.pictures?.[0]?.original || property.picture?.original || null;
  const city = property.address?.city || property.city || "";
  const amenities = Array.isArray(property.amenities) ? property.amenities.slice(0, 14) : [];
  const description = property.publicDescription?.summary || property.description || "";

  const apaleoPropertyId = property._apaleoPropertyId || property.propertyId || property.id || "";
  const apaleoUnitGroupId = property._apaleoUnitGroupId || "";

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="grp-modal-overlay" onClick={handleOverlayClick}>
      <div
        className="grp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={property.title || "Property details"}
      >
        {/* Header */}
        <div className="grp-modal-header">
          <h2 className="grp-modal-title">{property.title || "Property Details"}</h2>
          <button className="grp-modal-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className="grp-modal-body">
          {/* Left — property info */}
          <div className="grp-modal-left">
            {img ? (
              <img src={img} alt={property.title} className="grp-modal-img" />
            ) : (
              <div className="grp-modal-img-placeholder">🏠</div>
            )}

            {city && <p className="grp-modal-city">{city}</p>}
            <h3 className="grp-modal-prop-title">{property.title}</h3>

            <div className="grp-modal-prop-meta">
              {property.accommodates > 0 && (
                <span>👥 {property.accommodates} guests</span>
              )}
              {property.bedrooms > 0 && (
                <span>🛏 {property.bedrooms} bed{property.bedrooms !== 1 ? "s" : ""}</span>
              )}
              {property.bathrooms > 0 && (
                <span>🚿 {property.bathrooms} bath{property.bathrooms !== 1 ? "s" : ""}</span>
              )}
            </div>

            {description && (
              <p className="grp-modal-description">{description}</p>
            )}

            {amenities.length > 0 && (
              <>
                <p className="grp-modal-section-title" style={{ marginTop: 4 }}>Amenities</p>
                <div className="grp-modal-amenities">
                  {amenities.map((a, i) => (
                    <span key={i} className="grp-amenity-chip">{a}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Right — booking panel */}
          <div className="grp-modal-right">
            <div className="grp-right-section">
              <p className="grp-modal-section-title">Book this stay</p>
              <p className="grp-modal-description">
                Choose your dates, confirm availability, and pay securely — powered by Apaleo &amp; Adyen.
              </p>
              <button
                type="button"
                className="grp-submit-btn"
                onClick={() => setCheckoutOpen(true)}
                disabled={!apaleoPropertyId}
              >
                Reserve
              </button>
              {!apaleoPropertyId && (
                <p className="grp-form-error">This property is not available for online booking.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <ApaleoCheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        propertyId={apaleoPropertyId}
        unitGroupId={apaleoUnitGroupId}
        listingTitle={property.title || ""}
      />
    </div>
  );
}
