const ListingLoadingScreen = ({ active, cityLabel = "Los Angeles" }) => (
  <div className={`listing-loading-overlay${active ? " is-active" : " is-hidden"}`}>
    <div className="listing-loading-card">
      <span className="listing-loading-kicker">OneLuxStay / {cityLabel}</span>
      <div className="listing-loading-title listing-loading-shimmer" />
      <div className="listing-loading-subtitle listing-loading-shimmer" />
      <div className="listing-loading-grid">
        <div className="listing-loading-main listing-loading-shimmer" />
        <div className="listing-loading-stack">
          <div className="listing-loading-chip listing-loading-shimmer" />
          <div className="listing-loading-chip listing-loading-shimmer" />
          <div className="listing-loading-chip listing-loading-shimmer" />
          <div className="listing-loading-chip listing-loading-shimmer" />
        </div>
      </div>
      <div className="listing-loading-progress">
        <span />
      </div>
      <p className="listing-loading-text">Preparing your suite details...</p>
    </div>
  </div>
);

export default ListingLoadingScreen;
