import ReservationCard from "./ReservationCard.jsx";

const SkeletonCard = () => (
  <div className="grp-skeleton-card">
    <div className="grp-skeleton grp-skeleton-img" />
    <div className="grp-skeleton-body">
      <div className="grp-skeleton" style={{ height: 16, width: "70%" }} />
      <div className="grp-skeleton" style={{ height: 12, width: "52%" }} />
      <div className="grp-skeleton" style={{ height: 14, width: "38%", marginTop: 6 }} />
    </div>
  </div>
);

export default function ReservationGrid({
  properties,
  loading,
  error,
  onSelect,
  onRetry,
  loadingLabel = "Loading properties…",
  emptyLabel   = "No properties available.",
}) {
  if (loading) {
    return (
      <>
        <p className="grp-loading-label">{loadingLabel}</p>
        <div className="grp-grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="grp-error-banner">
        <div className="grp-error-banner-icon">⚠️</div>
        <p className="grp-error-banner-title">Could not load properties</p>
        <p className="grp-error-banner-sub">{error}</p>
        {onRetry && (
          <button className="grp-retry-btn" onClick={onRetry}>Try again</button>
        )}
      </div>
    );
  }

  if (!properties.length) {
    return (
      <div className="grp-grid">
        <div className="grp-empty">
          <div className="grp-empty-icon">🏠</div>
          <p className="grp-empty-title">{emptyLabel}</p>
          <p className="grp-empty-sub">Try adjusting your filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grp-grid">
      {properties.map((p) => (
        <ReservationCard
          key={p.id}
          property={p}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
