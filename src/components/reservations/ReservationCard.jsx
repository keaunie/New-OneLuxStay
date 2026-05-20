const FALLBACK_IMG = "/images/property-fallback.jpg";

const fmt = (amount, currency = "EUR") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
};

export default function ReservationCard({ property, onSelect }) {
  const rawImg = property.pictures?.[0]?.original || property.picture?.original || null;
  const img = rawImg || FALLBACK_IMG;
  const nightly = property.prices?.nightly?.amount ?? null;
  const currency = property.prices?.currency || "EUR";
  const city = property.address?.city || property.city || "";
  const unitGroupName = property.unitGroupName || null;
  const accommodates = property.accommodates || 0;

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(property);
    }
  };

  return (
    <div
      className="grp-card"
      onClick={() => onSelect(property)}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      aria-label={`View ${property.title || "property"}`}
    >
      <div className="grp-card-img-wrap">
        <img
          src={img}
          alt={property.propertyTitle || property.title}
          className="grp-card-img"
          loading="lazy"
          onError={(e) => { e.currentTarget.src = FALLBACK_IMG; }}
        />
        {city && <span className="grp-card-city-badge">{city}</span>}
        <span className="grp-card-apaleo-badge">Powered by Apaleo</span>
      </div>

      <div className="grp-card-body">
        {property.propertyTitle && property.unitGroupName && (
          <span className="grp-card-property-label">{property.propertyTitle}</span>
        )}
        <h3 className="grp-card-title">
          {unitGroupName || property.title || "Luxury Property"}
        </h3>
        <div className="grp-card-meta">
          {accommodates > 0 && (
            <span>👥 {accommodates} guests</span>
          )}
          {property.bedrooms > 0 && (
            <span>🛏 {property.bedrooms} bed{property.bedrooms !== 1 ? "s" : ""}</span>
          )}
          {property.bathrooms > 0 && (
            <span>🚿 {property.bathrooms} bath{property.bathrooms !== 1 ? "s" : ""}</span>
          )}
        </div>
        <div className="grp-card-price-row">
          {nightly != null ? (
            <span className="grp-card-price">
              {fmt(nightly, currency)}
              <span className="grp-card-price-night">/night</span>
            </span>
          ) : (
            <span style={{ fontSize: 13, color: "#6b6560" }}>Price on request</span>
          )}
          <span className="grp-card-cta">View →</span>
        </div>
      </div>
    </div>
  );
}
