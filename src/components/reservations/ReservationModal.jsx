import { useEffect, useState } from "react";
import ReservationCalendar from "./ReservationCalendar.jsx";
import ReservationPricing from "./ReservationPricing.jsx";
import ReservationRequestForm from "./ReservationRequestForm.jsx";

export default function ReservationModal({ property, onClose }) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);

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
  const nightly = property.prices?.nightly?.amount ?? null;
  const currency = property.prices?.currency || "USD";
  const cleaningFee = property.prices?.cleaningFee ?? 0;
  const city = property.address?.city || property.city || "";
  const maxGuests = property.accommodates || 10;
  const amenities = Array.isArray(property.amenities) ? property.amenities.slice(0, 14) : [];
  const description = property.publicDescription?.summary || property.description || "";

  const nights =
    checkIn && checkOut && checkOut > checkIn
      ? Math.round(
          (Date.parse(checkOut + "T00:00:00") - Date.parse(checkIn + "T00:00:00")) / 86_400_000,
        )
      : 0;

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
              <p className="grp-modal-section-title">Select Dates</p>
              <ReservationCalendar
                checkIn={checkIn}
                checkOut={checkOut}
                onCheckInChange={setCheckIn}
                onCheckOutChange={setCheckOut}
              />
            </div>

            <div className="grp-right-section">
              <p className="grp-modal-section-title">Guests</p>
              <div className="grp-guests-ctrl">
                <button
                  type="button"
                  className="grp-guests-btn"
                  onClick={() => setGuests((g) => Math.max(1, g - 1))}
                  disabled={guests <= 1}
                  aria-label="Decrease guests"
                >
                  −
                </button>
                <span className="grp-guests-count">{guests}</span>
                <button
                  type="button"
                  className="grp-guests-btn"
                  onClick={() => setGuests((g) => Math.min(maxGuests, g + 1))}
                  disabled={guests >= maxGuests}
                  aria-label="Increase guests"
                >
                  +
                </button>
                <span className="grp-guests-max">of {maxGuests} max</span>
              </div>
            </div>

            {nightly != null && nights > 0 && (
              <div className="grp-right-section">
                <p className="grp-modal-section-title">Price Estimate</p>
                <ReservationPricing
                  nightly={nightly}
                  nights={nights}
                  cleaningFee={cleaningFee}
                  currency={currency}
                />
              </div>
            )}

            <div className="grp-divider" />

            <div className="grp-right-section">
              <p className="grp-modal-section-title">Your Information</p>
              <ReservationRequestForm
                listingId={property._apaleoUnitGroupId || property._id || property.id || ""}
                listingTitle={property.title || ""}
                imageUrl={img || ""}
                propertyId={property._apaleoPropertyId || property.propertyId || property.id || ""}
                propertyName={property.propertyTitle || property.title || ""}
                city={city}
                checkIn={checkIn}
                checkOut={checkOut}
                guests={guests}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
