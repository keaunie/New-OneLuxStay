import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./App.css";

const apiBase = import.meta.env.VITE_API_BASE || "/.netlify/functions/index";

const formatCurrency = (value, currency = "USD") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    : "--";

const KNOWN_CITIES = ["antwerp", "antwerpen"];

const normalizeCity = (listing) => {
  const titleLower = typeof listing.title === "string" ? listing.title.toLowerCase() : "";
  const city = listing.city || listing.address?.city || listing.location || "";
  if (city) return city;

  const tagCity =
    Array.isArray(listing.tags) &&
    listing.tags.find((t) => typeof t === "string" && KNOWN_CITIES.includes(t.toLowerCase()));
  if (tagCity) return tagCity;

  if (titleLower) {
    const match = KNOWN_CITIES.find((c) => titleLower.includes(c));
    if (match) return match;
  }

  return "";
};

const formatAddress = (listing) => {
  const address = listing.address || {};
  const parts = [address.full, address.city, address.country].filter(Boolean);
  if (parts.length) return parts.join(", ");
  if (typeof listing.location === "string") return listing.location;
  return "Antwerpen";
};

const formatDescription = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return value.summary || value.description || value.text || "";
  }
  return "";
};

const getImageUrl = (image) => {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.original || image.large || image.regular || image.thumbnail || "";
};

const getReviewLabel = (reviews) => {
  if (!reviews) return "No review data";
  if (Array.isArray(reviews)) return `${reviews.length} reviews`;
  if (typeof reviews === "object") {
    const count = reviews.count || reviews.total || reviews.numberOfReviews;
    const rating = reviews.rating || reviews.score || reviews.average;
    if (count && rating) return `${rating} / 5 (${count} reviews)`;
    if (count) return `${count} reviews`;
    if (rating) return `${rating} / 5 rating`;
  }
  return "Reviews available";
};

const rangeLabel = (values, suffix = "") => {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return "--";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return `${min}${suffix}`;
  return `${min}${suffix}–${max}${suffix}`;
};

const BUILDING_GROUPS = [
  { key: "antwerp-central", label: "Antwerp Central", match: /central/ },
  { key: "antwerp-centre", label: "Antwerp Centre", match: /centre/ },
  { key: "antwerp-diamond", label: "Antwerp Diamond District", match: /diamond/ },
  { key: "antwerp-fashion", label: "Antwerp Fashion District", match: /fashion/ },
];

const getListingText = (listing) => {
  const tagText = Array.isArray(listing.tags) ? listing.tags.join(" ") : "";
  const desc = formatDescription(listing.publicDescription);
  return [
    listing.title,
    listing.nickname,
    listing.propertyType,
    listing.roomType,
    listing.address?.full,
    listing.address?.city,
    listing.location,
    tagText,
    desc,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const getBuildingKey = (listing) => {
  const text = getListingText(listing);
  const diamond = BUILDING_GROUPS[2];
  const fashion = BUILDING_GROUPS[3];
  const centre = BUILDING_GROUPS[1];
  const central = BUILDING_GROUPS[0];

  if (diamond.match.test(text)) return diamond.key;
  if (fashion.match.test(text)) return fashion.key;
  if (centre.match.test(text)) return centre.key;
  if (central.match.test(text)) return central.key;
  return "other";
};

const getGroupStats = (listings) => {
  const basePrices = listings.map((l) => l.basePrice);
  const sleeps = listings.map((l) => l.accommodates);
  const bedrooms = listings.map((l) => l.bedrooms);
  const currencies = new Set(listings.map((l) => l.currency).filter(Boolean));
  return {
    baseRange: rangeLabel(basePrices),
    sleepsRange: rangeLabel(sleeps),
    bedroomRange: rangeLabel(bedrooms),
    currency: currencies.size === 1 ? [...currencies][0] : "EUR",
  };
};

const getGroupAddress = (listings) => {
  const counts = new Map();
  listings.forEach((listing) => {
    const address = listing.address?.full || listing.address?.city || listing.location;
    if (!address) return;
    counts.set(address, (counts.get(address) || 0) + 1);
  });
  let best = "";
  let bestCount = 0;
  counts.forEach((count, addr) => {
    if (count > bestCount) {
      best = addr;
      bestCount = count;
    }
  });
  return best || "Antwerp, Belgium";
};

const getFirstSentence = (text) => {
  if (!text) return "";
  const match = text.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : text.split("\n")[0].trim();
};

const formatFullDescription = (listing) => {
  const text = formatDescription(listing.publicDescription);
  if (text) return text;
  const fallback = [
    listing.propertyType,
    listing.roomType,
    listing.nickname,
    listing.timezone,
  ].filter(Boolean);
  return fallback.length ? `Details: ${fallback.join(" · ")}` : "No description available.";
};

function AntwerpLandingPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeListing, setActiveListing] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const autoScrollRef = useRef(null);
  const thumbsRef = useRef(null);
  const [buildingPOI, setBuildingPOI] = useState({});

  const stopAutoScroll = () => {
    if (autoScrollRef.current) {
      clearInterval(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  };

  const startAutoScroll = (direction) => {
    if (!thumbsRef.current) return;
    if (autoScrollRef.current) return;
    autoScrollRef.current = setInterval(() => {
      thumbsRef.current.scrollBy({ left: direction * 6, behavior: "auto" });
    }, 16);
  };

  const handleThumbsMove = (event) => {
    if (!thumbsRef.current) return;
    const rect = thumbsRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const edge = rect.width * 0.2;
    if (x < edge) {
      startAutoScroll(-1);
    } else if (x > rect.width - edge) {
      startAutoScroll(1);
    } else {
      stopAutoScroll();
    }
  };

  useEffect(() => stopAutoScroll, []);

  useEffect(() => {
    if (!activeListing) {
      stopAutoScroll();
      setActiveImageIndex(0);
    }
  }, [activeListing]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/api/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Listings failed: ${res.status}`);
        const json = await res.json();
        if (!active) return;
        setListings(json.results || []);
      } catch (err) {
        if (!active) return;
        setError(err.message || "Unable to load listings.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const antwerpListings = useMemo(
    () =>
      listings.filter((listing) => {
        const city = normalizeCity(listing).toLowerCase();
        return city.includes("antwerp") || city.includes("antwerpen");
      }),
    [listings]
  );

  const groupedListings = useMemo(() => {
    const groups = BUILDING_GROUPS.reduce((acc, group) => {
      acc[group.key] = { label: group.label, listings: [] };
      return acc;
    }, {});
    const other = [];
    antwerpListings.forEach((listing) => {
      const key = getBuildingKey(listing);
      if (groups[key]) groups[key].listings.push(listing);
      else other.push(listing);
    });
    const ordered = BUILDING_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      listings: groups[group.key].listings,
    }));
    if (other.length) {
      ordered.push({ key: "other", label: "Other Antwerpen", listings: other });
    }
    return ordered.filter((group) => group.listings.length);
  }, [antwerpListings]);

  useEffect(() => {
    if (!groupedListings.length) return;
    let active = true;
    const load = async () => {
      const next = {};
      await Promise.all(
        groupedListings.map(async (group) => {
          const address = getGroupAddress(group.listings);
          try {
            const res = await fetch(
              `${apiBase}/api/landmarks?address=${encodeURIComponent(address)}`,
              { cache: "no-store" }
            );
            if (!res.ok) throw new Error(`Landmarks failed: ${res.status}`);
            const json = await res.json();
            next[group.key] = json;
          } catch {
            next[group.key] = { address, landmarks: [], transport: [] };
          }
        })
      );
      if (active) setBuildingPOI(next);
    };
    load();
    return () => {
      active = false;
    };
  }, [groupedListings]);

  const heroImages = useMemo(() => {
    const picks = [];
    antwerpListings.forEach((listing) => {
      const hero = getImageUrl(listing.picture);
      if (hero) picks.push(hero);
      if (Array.isArray(listing.pictures)) {
        listing.pictures.slice(0, 2).forEach((pic) => {
          const url = getImageUrl(pic);
          if (url) picks.push(url);
        });
      }
    });
    return [...new Set(picks)].slice(0, 4);
  }, [antwerpListings]);

  const stats = useMemo(() => {
    const basePrices = antwerpListings.map((l) => l.basePrice);
    const cleaningFees = antwerpListings.map((l) => l.cleaningFee);
    const bedrooms = antwerpListings.map((l) => l.bedrooms);
    const bathrooms = antwerpListings.map((l) => l.bathrooms);
    const sleeps = antwerpListings.map((l) => l.accommodates);
    const currencies = new Set(antwerpListings.map((l) => l.currency).filter(Boolean));
    const propertyTypes = new Set(antwerpListings.map((l) => l.propertyType).filter(Boolean));

    return {
      units: antwerpListings.length,
      nightly: rangeLabel(basePrices),
      cleaning: rangeLabel(cleaningFees),
      bedrooms: rangeLabel(bedrooms),
      bathrooms: rangeLabel(bathrooms),
      sleeps: rangeLabel(sleeps),
      currency: currencies.size === 1 ? [...currencies][0] : "Multiple",
      propertyCount: propertyTypes.size || 0,
    };
  }, [antwerpListings]);

  return (
    <div className="antwerp-page">
      <header className="antwerp-hero">
        <div className="antwerp-hero__content">
          <span className="antwerp-kicker">OneLuxStay / Antwerpen, Belgium</span>
          <h1 className="antwerp-title">Antwerpen collection</h1>
          <p className="antwerp-lede">
            A curated landing page built directly from live listing data. Every detail below mirrors what is available
            right now for Antwerpen units.
          </p>
          <div className="antwerp-hero__actions">
            <Link to="/stay?city=Antwerp#listings" className="antwerp-cta">
              Browse live availability
            </Link>
            <a href="#antwerp-units" className="antwerp-ghost">
              Explore units
            </a>
          </div>
          <div className="antwerp-stats">
            <div className="antwerp-stat">
              <span>Units</span>
              <strong>{stats.units || "--"}</strong>
            </div>
            <div className="antwerp-stat">
              <span>Nightly range</span>
              <strong>
                {stats.nightly !== "--" ? `${stats.nightly} ${stats.currency}` : "--"}
              </strong>
            </div>
            <div className="antwerp-stat">
              <span>Cleaning</span>
              <strong>
                {stats.cleaning !== "--" ? `${stats.cleaning} ${stats.currency}` : "--"}
              </strong>
            </div>
            <div className="antwerp-stat">
              <span>Bedrooms</span>
              <strong>{stats.bedrooms}</strong>
            </div>
            <div className="antwerp-stat">
              <span>Bathrooms</span>
              <strong>{stats.bathrooms}</strong>
            </div>
            <div className="antwerp-stat">
              <span>Sleeps</span>
              <strong>{stats.sleeps}</strong>
            </div>
          </div>
        </div>
        <div className="antwerp-hero__media">
          {heroImages.length ? (
            heroImages.map((src, idx) => (
              <div
                key={`${src}-${idx}`}
                className={`antwerp-hero__image antwerp-hero__image--${idx + 1}`}
                style={{ backgroundImage: `url(${src})` }}
                aria-hidden="true"
              />
            ))
          ) : (
            <div className="antwerp-hero__image antwerp-hero__image--empty" aria-hidden="true">
              Antwerpen imagery loading
            </div>
          )}
        </div>
      </header>

      <main className="antwerp-main">
        <section className="antwerp-section" id="antwerp-units">
          <div className="antwerp-section__head">
            <div>
              <p className="antwerp-kicker">Available now</p>
              <h2>Antwerpen buildings</h2>
              <p className="antwerp-muted">
                Every card below is derived from the live Guesty listing response, including pricing, capacity, and
                amenities metadata.
              </p>
            </div>
            <div className="antwerp-chip-row">
              <span>{stats.propertyCount} property types</span>
              <span>{stats.units || "--"} listings</span>
              <span>Currency: {stats.currency}</span>
            </div>
          </div>

          {loading && (
            <div className="antwerp-loading">
              <div className="antwerp-skeleton" />
              <div className="antwerp-skeleton" />
            </div>
          )}

          {error && (
            <div role="alert" className="antwerp-error">
              {error}
            </div>
          )}

          {!loading && !error && antwerpListings.length === 0 && (
            <div className="antwerp-empty">
              No Antwerpen listings are available in the current response.
            </div>
          )}

          {groupedListings.map((group) => {
            const groupStats = getGroupStats(group.listings);
            const poi = buildingPOI[group.key] || {};
            const landmarks = Array.isArray(poi.landmarks) ? poi.landmarks : [];
            const transport = Array.isArray(poi.transport) ? poi.transport : [];
            return (
              <section key={group.key} className="antwerp-building">
                <div className="antwerp-building__head">
                  <div>
                    <p className="antwerp-kicker">{group.label}</p>
                    <h3>{group.label}</h3>
                  </div>
                  <div className="antwerp-building__stats">
                    <span>{group.listings.length} units</span>
                    <span>
                      Sleeps {groupStats.sleepsRange}
                    </span>
                    <span>
                      From {groupStats.baseRange} {groupStats.currency}
                    </span>
                    <span>
                      Bedrooms {groupStats.bedroomRange}
                    </span>
                  </div>
                </div>
                <div className="antwerp-poi">
                  <div>
                    <h4>Nearby landmarks</h4>
                    {landmarks.length ? (
                      <ul>
                        {landmarks.map((item) => (
                          <li key={`${item.name}-${item.vicinity || ""}`}>
                            <strong>{item.name}</strong>
                            {item.vicinity ? ` · ${item.vicinity}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No nearby landmark data yet.</p>
                    )}
                  </div>
                  <div>
                    <h4>Transport</h4>
                    {transport.length ? (
                      <ul>
                        {transport.map((item) => (
                          <li key={`${item.name}-${item.vicinity || ""}`}>
                            <strong>{item.name}</strong>
                            {item.vicinity ? ` · ${item.vicinity}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No nearby transport data yet.</p>
                    )}
                  </div>
                </div>
                <div className="antwerp-grid">
                  {group.listings.map((listing) => {
                    const listingId = listing.id || listing._id;
                    const image = getImageUrl(listing.picture) || getImageUrl(listing.pictures?.[0]);
                    const listingCurrency = listing.currency || "USD";
                    const tagList = Array.isArray(listing.tags) ? listing.tags.slice(0, 6) : [];
                    const fullDescription = formatFullDescription(listing);
                    const shortDescription = getFirstSentence(fullDescription);
                    return (
                      <article key={listingId} className="antwerp-card">
                        <div className="antwerp-card__media">
                          {image ? (
                            <img src={image} alt={listing.title} loading="lazy" />
                          ) : (
                            <div className="antwerp-card__placeholder">No image</div>
                          )}
                          <div className="antwerp-card__badge">
                            Sleeps {listing.accommodates || "--"} · {listing.bedrooms || "--"} BR ·{" "}
                            {listing.bathrooms || "--"} BA
                          </div>
                        </div>
                        <div className="antwerp-card__body">
                          <div className="antwerp-card__header">
                            <p>{listing.propertyType || listing.roomType || "Residence"}</p>
                            <h3>{listing.title}</h3>
                            <span className="antwerp-card__address">{formatAddress(listing)}</span>
                          </div>
                          <p className="antwerp-card__description">
                            {shortDescription || "Signature OneLuxStay residence in Antwerpen."}
                          </p>
                          <div className="antwerp-card__meta">
                            <span>Base: {formatCurrency(listing.basePrice, listingCurrency)}</span>
                            <span>Cleaning: {formatCurrency(listing.cleaningFee, listingCurrency)}</span>
                            <span>Timezone: {listing.timezone || "Local time"}</span>
                            <span>{getReviewLabel(listing.reviews)}</span>
                          </div>
                          <div className="antwerp-card__details">
                            <span>Nickname: {listing.nickname || "—"}</span>
                            <span>Beds: {listing.beds || "--"}</span>
                            <span>Tags: {tagList.length ? tagList.join(", ") : "—"}</span>
                          </div>
                          <div className="antwerp-card__actions">
                            <button
                              type="button"
                              className="antwerp-card__ghost"
                              onClick={() => setActiveListing(listing)}
                            >
                              View full details
                            </button>
                            <Link to={`/stay?city=Antwerp#listings`} className="antwerp-card__link">
                              Check live availability
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </section>
      </main>

      {activeListing && (
        <div className="antwerp-modal__overlay" role="dialog" aria-modal="true">
          <div className="antwerp-modal">
            <button
              type="button"
              className="antwerp-modal__close"
              aria-label="Close details"
              onClick={() => {
                setActiveListing(null);
                setActiveImageIndex(0);
              }}
            >
              Close
            </button>
            <div className="antwerp-modal__body">
              <h3>{activeListing.title}</h3>
              <p className="antwerp-modal__address">{formatAddress(activeListing)}</p>
              {(() => {
                const images = [
                  getImageUrl(activeListing.picture),
                  ...(Array.isArray(activeListing.pictures)
                    ? activeListing.pictures.map((pic) => getImageUrl(pic))
                    : []),
                ].filter(Boolean);
                if (!images.length) return null;
                const safeIndex = Math.min(activeImageIndex, images.length - 1);
                const current = images[safeIndex];
                return (
                  <div className="antwerp-carousel">
                    <div className="antwerp-carousel__frame">
                      <img src={current} alt={activeListing.title} loading="lazy" />
                    </div>
                    <div
                      className="antwerp-carousel__thumbs"
                      role="list"
                      ref={thumbsRef}
                      onMouseMove={handleThumbsMove}
                      onMouseLeave={stopAutoScroll}
                    >
                      {images.map((src, idx) => (
                        <button
                          key={`${src}-${idx}`}
                          type="button"
                          className={`antwerp-carousel__thumb${idx === safeIndex ? " is-active" : ""}`}
                          onClick={() => setActiveImageIndex(idx)}
                          aria-label={`View image ${idx + 1}`}
                        >
                          <img src={src} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <p className="antwerp-modal__description">{formatFullDescription(activeListing)}</p>
              <div className="antwerp-modal__grid">
                <div>
                  <span>Base price</span>
                  <strong>{formatCurrency(activeListing.basePrice, activeListing.currency || "USD")}</strong>
                </div>
                <div>
                  <span>Cleaning fee</span>
                  <strong>{formatCurrency(activeListing.cleaningFee, activeListing.currency || "USD")}</strong>
                </div>
                <div>
                  <span>Sleeps</span>
                  <strong>{activeListing.accommodates || "--"}</strong>
                </div>
                <div>
                  <span>Bedrooms</span>
                  <strong>{activeListing.bedrooms || "--"}</strong>
                </div>
                <div>
                  <span>Bathrooms</span>
                  <strong>{activeListing.bathrooms || "--"}</strong>
                </div>
                <div>
                  <span>Tags</span>
                  <strong>
                    {Array.isArray(activeListing.tags) && activeListing.tags.length
                      ? activeListing.tags.join(", ")
                      : "—"}
                  </strong>
                </div>
              </div>
              <div className="antwerp-modal__actions">
                <Link to={`/stay?city=Antwerp#listings`} className="antwerp-card__link">
                  Check live availability
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AntwerpLandingPage;
