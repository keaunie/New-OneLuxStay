import { Link } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { filterVisibleUnits } from "../../config/hiddenUnits";

export default function SimilarUnitsSection({
  listings,
  buildListingPath,
  onListingClick,
  getListingId,
  getListingImageUrls,
  fallbackImage,
  getImageUrl,
  sanitizeText,
  resolveGroupTitle,
  formatAddress,
  firstNumber,
  formatCurrency,
  handleImageError,
  defaultTitle = "OneLuxStay",
  defaultCurrency = "USD",
}) {
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const syncBtns = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 8);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    syncBtns();
    el.addEventListener("scroll", syncBtns, { passive: true });
    const ro = new ResizeObserver(syncBtns);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncBtns);
      ro.disconnect();
    };
  }, [syncBtns, listings]);

  const nudge = (dir) => {
    trackRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  const items = filterVisibleUnits(listings);
  if (!items.length) return null;

  return (
    <section className="ols-similar" aria-label="Similar units">
      <div className="ols-similar__head">
        <div className="ols-similar__head-text">
          <span className="ols-similar__eyebrow">Keep exploring</span>
          <h2 className="ols-similar__title">Similar units</h2>
        </div>
        {items.length > 3 && (
          <div className="ols-similar__nav" aria-hidden="true">
            <button type="button" className="ols-similar__nav-btn" onClick={() => nudge(-1)} disabled={atStart} aria-label="Scroll left">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button type="button" className="ols-similar__nav-btn" onClick={() => nudge(1)} disabled={atEnd} aria-label="Scroll right">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="ols-similar__track" ref={trackRef} role="list">
        {items.map((listing) => {
          const id = getListingId(listing);
          const path = id ? buildListingPath(id) : "/";
          const images = getListingImageUrls(listing);
          const imgSrc =
            (images[0] && images[0] !== fallbackImage ? images[0] : null) ||
            getImageUrl(listing?.picture) ||
            fallbackImage;
          const title = sanitizeText(listing?.title || defaultTitle);
          const area = resolveGroupTitle(listing);
          const addr = formatAddress(listing);
          const bedrooms = firstNumber(listing?.bedrooms, listing?.beds);
          const bathrooms = firstNumber(listing?.bathrooms);
          const sqft = firstNumber(listing?.squareFeet, listing?.area, listing?.size?.value);
          const basePrice = firstNumber(
            listing?.basePrice,
            listing?.prices?.basePrice,
            listing?.prices?.basePricePerNight,
            listing?.prices?.nightly?.amount,
            listing?.prices?.nightly
          );
          const currency = listing?.currency || listing?.prices?.currency || defaultCurrency;
          const priceStr = typeof basePrice === "number" ? `${formatCurrency(basePrice, currency)} / night` : null;
          const meta = [
            bedrooms != null ? `${bedrooms} bd` : null,
            bathrooms != null ? `${bathrooms} ba` : null,
            sqft != null ? `${sqft} ft²` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null;

          return (
            <div key={id || path} className="ols-similar__item" role="listitem">
              <Link to={path} className="ols-similar__card" onClick={onListingClick}>
                <div className="ols-similar__media">
                  <img src={imgSrc} alt={title} className="ols-similar__img" loading="lazy" onError={handleImageError} draggable={false} />
                  <span className="ols-similar__badge">Available now</span>
                  <button
                    type="button"
                    className="ols-similar__fav"
                    aria-label="Save to wishlist"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                </div>
                <div className="ols-similar__body">
                  {area ? <p className="ols-similar__area">{area}</p> : null}
                  <h3 className="ols-similar__name">{title}</h3>
                  {meta ? <p className="ols-similar__meta">{meta}</p> : null}
                  {addr ? <p className="ols-similar__addr">{addr}</p> : null}
                  {priceStr ? <p className="ols-similar__price">{priceStr}</p> : null}
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
