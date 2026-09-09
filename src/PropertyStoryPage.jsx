import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "./App.css";
import "./PropertyStoryPage.css";
import SiteFooter from "./components/SiteFooter";
import MasonryGalleryModal from "./components/MasonryGalleryModal";
import SimilarUnitsSection from "./components/listing/SimilarUnitsSection";
import ApaleoCheckoutModal from "./components/apaleo-checkout/ApaleoCheckoutModal";
import useDocumentMeta from "./hooks/useDocumentMeta";
import apiBase from "./utils/apiBase";
import { buildWhatsAppHref, buildWhatsAppLabel, resolveListingContactProfile } from "./utils/contactConfig";
import { filterVisibleUnits, isListingActiveForShowcase } from "./config/hiddenUnits";

/* ─────────────────────────── Antwerp property data ───────────────────────────
   Curated per-address content. Kept local to this page (rather than shared with
   AntwerpLandingPage's now-unreachable modal copy of the same idea) since only
   this page renders it going forward. */

const PROPERTY_STORIES = {
  "antwerp-diamond": {
    label: "Diamond District",
    tagline: "Iconic trade streets and relaxed city energy.",
    copy:
      "Stay moments from the diamond quarter with easy access to Central Station and the city center. By day, wander streets lined with jewelers and traders; by night, retreat to a quiet, modern base just minutes from it all.",
    landmarks: ["Diamond District", "Hoveniersstraat", "Pelikaanstraat", "Diamond Square"],
    transit: ["Antwerp Central Station", "Tram lines 2 / 6 / 9 / 11", "De Lijn buses"],
    addressOverride: "Jacob Jordaensstraat 96",
  },
  "antwerp-fashion": {
    label: "Fashion District",
    tagline: "Design boutiques, museums, and a creative pulse.",
    copy:
      "From Nationalestraat to Kammenstraat, the fashion district is Antwerp's style heart. Expect concept stores, the MoMu fashion museum, and a steady stream of good coffee within a short walk of the front door.",
    landmarks: ["MoMu Fashion Museum", "Nationalestraat", "Kammenstraat", "Meir"],
    transit: ["Tram lines 4 / 7 / 10", "De Lijn buses", "City bike stations"],
    addressOverride: "Lange Leemstraat 103",
  },
  "antwerp-central": {
    label: "Antwerp Central",
    tagline: "Grand architecture and effortless connections.",
    copy:
      "A prime base next to Antwerp Central Station — widely regarded as one of the world's most beautiful railway stations — with fast links across the city and beyond, plus the zoo and Astridplein on your doorstep.",
    landmarks: ["Antwerp Central Station", "Koningin Astridplein", "Zoo Antwerp"],
    transit: ["Antwerp Central Station", "Tram lines 2 / 6 / 9 / 11", "Regional rail"],
    addressOverride: "Lange Leemstraat 5",
  },
  "antwerp-city-centre": {
    label: "City Centre",
    tagline: "Cathedrals, squares, and timeless streets.",
    copy:
      "Walk to Grote Markt, the Cathedral of Our Lady, and riverside terraces from the heart of the city. This is old Antwerp at its most postcard-perfect, with cobbled lanes and a river breeze close by.",
    landmarks: ["Grote Markt", "Cathedral of Our Lady", "Groenplaats", "Steen Castle"],
    transit: ["Tram lines 4 / 7 / 10", "De Lijn buses", "City bike stations"],
    addressOverride: "Kribbestraat 6",
  },
  "antwerp-near-central": {
    label: "Near Central Station",
    tagline: "Quiet streets with fast city access.",
    copy:
      "A calm base just outside the station with quick access to the center and local dining. Zurenborg's Belle Epoque streets and Dageraadplaats' cafes are an easy stroll away.",
    landmarks: ["Central Station", "Zurenborg", "Dageraadplaats"],
    transit: ["Tram lines 2 / 6 / 9 / 11", "De Lijn buses", "City bike stations"],
    addressOverride: "",
  },
};

// Order also drives display order for the "other Antwerp addresses" cross-links.
const BUILDING_MATCHERS = [
  { key: "antwerp-diamond", match: /jacob\s+jordaensstraat\s*96|diamond district|diamond quarter|hoveniersstraat|pelikaanstraat/i },
  { key: "antwerp-near-central", match: /lange\s+kievitstraat\s*4|kievitstraat|near central|close to station|station area|zurenborg|dageraadplaats/i },
  { key: "antwerp-central", match: /lange\s+leemstraat\s*5|antwerp central|antwerpen centraal|central station|centraal station|astridplein/i },
  { key: "antwerp-fashion", match: /lange\s+leemstraat\s*103|fashion district|\bmomu\b|nationalestraat|kammenstraat/i },
  { key: "antwerp-city-centre", match: /kribbestraat\s*6|city centre|city center|centrum|grotemarkt|cathedral|old town|steen/i },
];

// Preferred hyphenated slugs for canonical URLs, e.g. oneluxstay.com/antwerp/fashion-district.
const CANONICAL_SLUG_BY_KEY = {
  "antwerp-fashion": "fashion-district",
  "antwerp-diamond": "diamond-district",
  "antwerp-central": "antwerp-central",
  "antwerp-city-centre": "city-centre",
  "antwerp-near-central": "near-central-station",
};

const normalizeSlugValue = (value = "") => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");

const SLUG_ALIASES = {
  fashiondistrict: "antwerp-fashion",
  fashion: "antwerp-fashion",
  diamonddistrict: "antwerp-diamond",
  diamondquarter: "antwerp-diamond",
  diamond: "antwerp-diamond",
  antwerpcentral: "antwerp-central",
  centralstation: "antwerp-central",
  central: "antwerp-central",
  citycentre: "antwerp-city-centre",
  citycenter: "antwerp-city-centre",
  citycentrum: "antwerp-city-centre",
  nearcentralstation: "antwerp-near-central",
  nearcentral: "antwerp-near-central",
};

const resolveSectionKeyFromSlug = (slug) => {
  const normalized = normalizeSlugValue(slug);
  if (!normalized) return null;
  if (SLUG_ALIASES[normalized]) return SLUG_ALIASES[normalized];
  const direct = Object.keys(PROPERTY_STORIES).find((key) => normalizeSlugValue(key) === normalized);
  return direct || null;
};

const REVIEWS = [
  { name: "J. V.", rating: 5, quote: "Beautiful stay near the old town. Walkable, clean, and thoughtfully designed." },
  { name: "L. S.", rating: 5, quote: "Loved the Fashion District for museums and dining. The team was responsive and kind." },
  { name: "P. D.", rating: 4, quote: "Great base near Central Station with easy transit. Comfortable and quiet." },
  { name: "A. M.", rating: 5, quote: "Diamond District views were perfect. The space felt modern and calm." },
];

const AMENITY_GROUPS = [
  { key: "kitchen", label: "Kitchen", match: /(kitchen|oven|stove|microwave|dishwasher|fridge|refrigerator|freezer|toaster|coffee|kettle|cookware|dishes|silverware|dining)/i },
  { key: "bathroom", label: "Bathroom", match: /(bathroom|shower|bathtub|toilet|towels|shampoo|conditioner|soap|hot water|hair dryer)/i },
  { key: "bedroom", label: "Bedroom", match: /(bed|bedroom|linens|closet|wardrobe|hanger)/i },
  { key: "living", label: "Living area", match: /(living|sofa|workspace|laptop|desk)/i },
  { key: "laundry", label: "Laundry", match: /(washer|dryer|laundry)/i },
  { key: "outdoor", label: "Outdoor", match: /(pool|patio|balcony|bbq|grill|outdoor|garden|terrace)/i },
  { key: "internet", label: "Internet", match: /(wifi|wireless|internet)/i },
  { key: "media", label: "Media & tech", match: /(tv|streaming|netflix)/i },
  { key: "safety", label: "Safety", match: /(smoke|carbon monoxide|fire extinguisher|first aid)/i },
];

/* ─────────────────────────── generic listing helpers ─────────────────────────── */

const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='520' viewBox='0 0 800 520'><rect width='800' height='520' fill='%23efe7dc'/><text x='400' y='260' text-anchor='middle' dominant-baseline='middle' fill='%239c8368' font-family='Arial, sans-serif' font-size='24'>Image unavailable</text></svg>";

const handleImageError = (event) => {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = "true";
  img.src = FALLBACK_IMAGE;
  if (!img.alt) img.alt = "Image unavailable";
};

const extractImageUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return value.url || value.src || value.href || value.secure_url || value.secureUrl || "";
  }
  return "";
};

const getImageUrl = (image) => {
  const direct = extractImageUrl(image);
  return direct || FALLBACK_IMAGE;
};

const getListingImageUrls = (listing) => {
  if (!listing) return [];
  const urls = [];
  const seen = new Set();
  const addUrl = (value) => {
    const url = extractImageUrl(value);
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };
  if (Array.isArray(listing.pictures) && listing.pictures.length) {
    listing.pictures.forEach(addUrl);
  } else {
    addUrl(listing.picture);
  }
  return urls;
};

const toNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const num = toNumber(value);
    if (num !== null) return num;
  }
  return null;
};

const getListingId = (listing) => listing?.id || listing?._id || null;
const isChildListing = (listing) => {
  const type = typeof listing?.type === "string" ? listing.type.toUpperCase() : "";
  return type.includes("CHILD");
};

const sanitizeText = (value = "") => {
  if (typeof value !== "string") return "";
  return value
    .replace(/�/g, "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
};

const isAntwerpListing = (listing) => {
  const text = [listing?.city, listing?.address?.city, listing?.address?.full, listing?.location, listing?.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /antwerp/.test(text);
};

const getBuildingKey = (listing) => {
  const addressText = [listing?.address?.full, listing?.location, listing?.address?.city, listing?.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const group of BUILDING_MATCHERS) {
    if (group.match.test(addressText)) return group.key;
  }
  return "antwerp-city-centre";
};

const formatAddress = (listing, sectionKey) => {
  const address = listing?.address || {};
  const override = PROPERTY_STORIES[sectionKey]?.addressOverride;
  if (override) {
    return sanitizeText([override, address.city || "Antwerp", address.country || "Belgium"].filter(Boolean).join(", "));
  }
  const full = typeof address.full === "string" ? address.full.trim() : "";
  if (full) return sanitizeText(full);
  return "Antwerp, Belgium";
};

const formatCurrency = (value, currency = "EUR") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : "--";

const groupAmenities = (items = []) => {
  const seen = new Set();
  const clean = items.filter((item) => {
    if (typeof item !== "string" || !item.trim()) return false;
    const key = item.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const groups = new Map(AMENITY_GROUPS.map((group) => [group.key, { ...group, items: [] }]));
  clean.forEach((amenity) => {
    const match = AMENITY_GROUPS.find((group) => group.match.test(amenity));
    if (match) groups.get(match.key).items.push(amenity);
  });
  return Array.from(groups.values()).filter((group) => group.items.length);
};

const normalizeRouteDate = (value) => {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
};
const normalizeRouteGuests = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
};
const parseBookingBundle = (value = "") => {
  if (!value) return { checkIn: "", checkOut: "", guests: "" };
  const safeDecode = (part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  };
  const [rawCheckIn = "", rawCheckOut = "", rawGuests = ""] = String(value).split("&");
  return {
    checkIn: normalizeRouteDate(safeDecode(rawCheckIn)),
    checkOut: normalizeRouteDate(safeDecode(rawCheckOut)),
    guests: normalizeRouteGuests(safeDecode(rawGuests)),
  };
};

const toISODate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const defaultDates = () => {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 7);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 2);
  return { checkIn: toISODate(checkIn), checkOut: toISODate(checkOut) };
};

const LISTINGS_CACHE_KEY = "antwerpListingsCache";
const readCachedListings = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LISTINGS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const StarRow = ({ rating = 5 }) => (
  <span className="pstory-stars" aria-label={`${rating} out of 5 stars`}>
    {Array.from({ length: 5 }).map((_, idx) => (
      <svg key={idx} viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" className={idx < rating ? "is-filled" : ""}>
        <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L10 15l-5.2 2.7 1-5.9L1.5 7.7l5.9-.8z" />
      </svg>
    ))}
  </span>
);

export default function PropertyStoryPage() {
  const { areaSlug, bookingBundle } = useParams();

  const sectionKey = useMemo(() => resolveSectionKeyFromSlug(areaSlug), [areaSlug]);
  const story = sectionKey ? PROPERTY_STORIES[sectionKey] : null;

  const [listings, setListings] = useState(() => readCachedListings() || []);
  const [loadStatus, setLoadStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Listings failed: ${res.status}`);
        const json = await res.json();
        const results = Array.isArray(json?.results) ? json.results : [];
        if (!active) return;
        setListings(results);
        setLoadStatus("ready");
        try {
          window.sessionStorage.setItem(LISTINGS_CACHE_KEY, JSON.stringify(results));
        } catch {
          // ignore storage failures
        }
      } catch {
        if (!active) return;
        setLoadStatus(readCachedListings()?.length ? "ready" : "error");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const antwerpListings = useMemo(
    () => filterVisibleUnits(listings.filter(isAntwerpListing).filter(isListingActiveForShowcase)),
    [listings]
  );

  const sectionListings = useMemo(
    () => antwerpListings.filter((listing) => getBuildingKey(listing) === sectionKey),
    [antwerpListings, sectionKey]
  );

  const roomListings = useMemo(
    () => sectionListings.filter((listing) => !isChildListing(listing)),
    [sectionListings]
  );

  const galleryImages = useMemo(() => {
    const urls = [];
    const seen = new Set();
    sectionListings.forEach((listing) => {
      getListingImageUrls(listing).forEach((url) => {
        if (seen.has(url)) return;
        seen.add(url);
        urls.push(url);
      });
    });
    return urls.slice(0, 16);
  }, [sectionListings]);

  const amenityGroups = useMemo(() => {
    const all = roomListings.flatMap((listing) => (Array.isArray(listing.amenities) ? listing.amenities : []));
    return groupAmenities(all);
  }, [roomListings]);

  const priceFrom = useMemo(() => {
    const prices = roomListings.map((l) => firstNumber(l?.basePrice, l?.prices?.basePrice)).filter((p) => p !== null);
    return prices.length ? Math.min(...prices) : null;
  }, [roomListings]);

  const priceCurrency = roomListings[0]?.currency || "EUR";

  const guestRange = useMemo(() => {
    const values = roomListings.map((l) => firstNumber(l?.maxGuests, l?.accommodates)).filter((v) => v !== null);
    if (!values.length) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? `${min} guests` : `${min}–${max} guests`;
  }, [roomListings]);

  const otherAddresses = useMemo(
    () =>
      BUILDING_MATCHERS.map((group) => group.key)
        .filter((key) => key !== sectionKey)
        .map((key) => {
          const groupListings = antwerpListings.filter((listing) => getBuildingKey(listing) === key && !isChildListing(listing));
          if (!groupListings.length) return null;
          const cheapest = groupListings.reduce((best, listing) => {
            const price = firstNumber(listing?.basePrice, listing?.prices?.basePrice);
            const bestPrice = best ? firstNumber(best?.basePrice, best?.prices?.basePrice) : null;
            if (price === null) return best;
            if (bestPrice === null || price < bestPrice) return listing;
            return best;
          }, null);
          return { key, story: PROPERTY_STORIES[key], listing: cheapest || groupListings[0] };
        })
        .filter(Boolean),
    [antwerpListings, sectionKey]
  );

  const bundle = useMemo(() => parseBookingBundle(bookingBundle), [bookingBundle]);
  const [checkIn, setCheckIn] = useState(() => bundle.checkIn || defaultDates().checkIn);
  const [checkOut, setCheckOut] = useState(() => bundle.checkOut || defaultDates().checkOut);
  const [guests, setGuests] = useState(() => bundle.guests || "2");

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutListing, setCheckoutListing] = useState(null);

  const bookingSectionRef = useRef(null);
  const scrollToBooking = () => bookingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const contactProfile = resolveListingContactProfile("antwerp");
  const whatsappHref = buildWhatsAppHref(
    contactProfile.whatsapp.digits,
    `Hi! I'm interested in ${story?.label || "an Antwerp property"} by OneLuxStay. Could you share availability and pricing?`
  );

  const seoTitle = story ? `${story.label} Furnished Suites in Antwerp | One Lux Stay` : "";
  const seoDescription = story ? `${story.tagline} ${story.copy}`.trim() : "";
  const canonicalSlug = sectionKey ? CANONICAL_SLUG_BY_KEY[sectionKey] : "";
  useDocumentMeta({
    title: seoTitle,
    description: seoDescription,
    canonicalUrl: canonicalSlug ? `https://oneluxstay.com/antwerp/${canonicalSlug}` : "",
    active: Boolean(story),
  });

  if (!story) {
    return (
      <div className="pstory-notfound">
        <h1>We couldn&rsquo;t find that Antwerp address</h1>
        <p>It may have moved, or the link is out of date.</p>
        <Link to="/antwerp" className="pstory-btn pstory-btn--primary">
          Browse all Antwerp stays
        </Link>
      </div>
    );
  }

  const heroImage = galleryImages[0] || FALLBACK_IMAGE;
  const sideImages = galleryImages.slice(1, 5);

  return (
    <div className="pstory-page">
      <header className="pstory-topbar">
        <Link to="/" className="pstory-topbar__brand">
          One Lux Stay
        </Link>
        <nav className="pstory-topbar__crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">›</span>
          <Link to="/antwerp">Antwerp</Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{story.label}</span>
        </nav>
        <button type="button" className="pstory-btn pstory-btn--primary pstory-topbar__cta" onClick={scrollToBooking}>
          Check availability
        </button>
      </header>

      <section className="pstory-hero">
        <div className="pstory-hero__media">
          <img src={heroImage} alt={`${story.label} by One Lux Stay`} onError={handleImageError} draggable={false} />
          <div className="pstory-hero__side">
            {sideImages.map((src, idx) => (
              <img key={src + idx} src={src} alt="" onError={handleImageError} draggable={false} />
            ))}
          </div>
          {galleryImages.length > 1 && (
            <button
              type="button"
              className="pstory-hero__gallery-btn"
              onClick={() => {
                setGalleryIndex(0);
                setGalleryOpen(true);
              }}
            >
              Show all {galleryImages.length} photos
            </button>
          )}
          <div className="pstory-hero__scrim" />
        </div>
        <div className="pstory-hero__copy">
          <p className="pstory-hero__eyebrow">One Lux Stay · Antwerp</p>
          <h1>{story.label}</h1>
          <p className="pstory-hero__tagline">{story.tagline}</p>
          <div className="pstory-hero__chips">
            {priceFrom !== null && (
              <span className="pstory-chip pstory-chip--price">From {formatCurrency(priceFrom, priceCurrency)}/night</span>
            )}
            {guestRange && <span className="pstory-chip">{guestRange}</span>}
            <span className="pstory-chip">{roomListings.length || "—"} residence{roomListings.length === 1 ? "" : "s"}</span>
          </div>
          <div className="pstory-hero__actions">
            <button type="button" className="pstory-btn pstory-btn--primary" onClick={scrollToBooking}>
              Check availability
            </button>
            <a className="pstory-btn pstory-btn--ghost" href="#pstory-story">
              Read the story
            </a>
          </div>
        </div>
      </section>

      <main className="pstory-main">
        <section className="pstory-story" id="pstory-story">
          <div className="pstory-story__text">
            <span className="pstory-eyebrow">The neighborhood</span>
            <h2>Life around {story.label}</h2>
            <p>{story.copy}</p>
            <div className="pstory-taglist">
              {story.landmarks.map((item) => (
                <span key={item} className="pstory-tag">
                  {item}
                </span>
              ))}
            </div>
            <h3 className="pstory-substack">Getting around</h3>
            <div className="pstory-taglist">
              {story.transit.map((item) => (
                <span key={item} className="pstory-tag pstory-tag--muted">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <aside className="pstory-story__card">
            <h3>Say hello</h3>
            <p>Questions about {story.label}? Our Antwerp team replies fast.</p>
            <a className="pstory-btn pstory-btn--primary pstory-story__whatsapp" href={whatsappHref} target="_blank" rel="noreferrer">
              {buildWhatsAppLabel(contactProfile.whatsapp)}
            </a>
            <a className="pstory-btn pstory-btn--ghost" href={contactProfile.phone.telHref}>
              Call {contactProfile.phone.display}
            </a>
          </aside>
        </section>

        {amenityGroups.length > 0 && (
          <section className="pstory-amenities">
            <span className="pstory-eyebrow">What&rsquo;s included</span>
            <h2>Amenities across {story.label}</h2>
            <div className="pstory-amenities__grid">
              {amenityGroups.map((group) => (
                <div key={group.key} className="pstory-amenities__group">
                  <h4>{group.label}</h4>
                  <ul>
                    {group.items.slice(0, 6).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="pstory-reviews">
          <span className="pstory-eyebrow">Guest stories</span>
          <h2>What guests say</h2>
          <div className="pstory-reviews__grid">
            {REVIEWS.map((review) => (
              <figure key={review.name} className="pstory-reviews__card">
                <StarRow rating={review.rating} />
                <blockquote>&ldquo;{review.quote}&rdquo;</blockquote>
                <figcaption>{review.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="pstory-booking" id="pstory-booking" ref={bookingSectionRef}>
          <span className="pstory-eyebrow">Book direct</span>
          <h2>Choose your residence</h2>

          <div className="pstory-booking__dates">
            <label>
              Check-in
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </label>
            <label>
              Check-out
              <input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} />
            </label>
            <label>
              Guests
              <select value={guests} onChange={(e) => setGuests(e.target.value)}>
                {Array.from({ length: 8 }).map((_, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {idx + 1} guest{idx === 0 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loadStatus === "loading" && !roomListings.length && (
            <p className="pstory-status">Loading available residences…</p>
          )}
          {loadStatus === "error" && (
            <p className="pstory-status pstory-status--error">
              We couldn&rsquo;t load live availability right now. Please refresh, or{" "}
              <a href={whatsappHref} target="_blank" rel="noreferrer">
                message us on WhatsApp
              </a>
              .
            </p>
          )}
          {loadStatus === "ready" && !roomListings.length && (
            <p className="pstory-status">No residences are published at this address right now.</p>
          )}

          <div className="pstory-rooms">
            {roomListings.map((listing) => {
              const id = getListingId(listing);
              const images = getListingImageUrls(listing);
              const img = getImageUrl(images[0]);
              const title = sanitizeText(listing?.title || story.label);
              const bedrooms = firstNumber(listing?.bedrooms, listing?.beds);
              const bathrooms = firstNumber(listing?.bathrooms);
              const maxGuests = firstNumber(listing?.maxGuests, listing?.accommodates);
              const price = firstNumber(listing?.basePrice, listing?.prices?.basePrice);
              const currency = listing?.currency || "EUR";
              const specs = [
                bedrooms != null ? `${bedrooms} bd` : null,
                bathrooms != null ? `${bathrooms} ba` : null,
                maxGuests != null ? `${maxGuests} guests` : null,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <article key={id} className="pstory-room">
                  <div className="pstory-room__media">
                    <img src={img} alt={title} loading="lazy" onError={handleImageError} draggable={false} />
                  </div>
                  <div className="pstory-room__body">
                    <p className="pstory-room__addr">{formatAddress(listing, sectionKey)}</p>
                    <h3>{title}</h3>
                    {specs && <p className="pstory-room__specs">{specs}</p>}
                  </div>
                  <div className="pstory-room__price">
                    {price !== null ? (
                      <>
                        <strong>{formatCurrency(price, currency)}</strong>
                        <span>/ night</span>
                      </>
                    ) : (
                      <span>Price on request</span>
                    )}
                  </div>
                  <div className="pstory-room__actions">
                    <Link to={`/antwerp/listing/${encodeURIComponent(id)}`} className="pstory-btn pstory-btn--ghost">
                      View details
                    </Link>
                    <button
                      type="button"
                      className="pstory-btn pstory-btn--primary"
                      onClick={() => {
                        setCheckoutListing({ localPropertyId: id, listingTitle: title });
                        setCheckoutOpen(true);
                      }}
                    >
                      Reserve
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {otherAddresses.length > 0 && (
          <section className="pstory-other">
            <span className="pstory-eyebrow">Elsewhere in Antwerp</span>
            <h2>More One Lux Stay addresses</h2>
            <div className="pstory-other__grid">
              {otherAddresses.map(({ key, story: otherStory, listing }) => {
                const img = getImageUrl(getListingImageUrls(listing)[0]);
                const price = firstNumber(listing?.basePrice, listing?.prices?.basePrice);
                return (
                  <Link key={key} to={`/antwerp/${CANONICAL_SLUG_BY_KEY[key]}`} className="pstory-other__card">
                    <img src={img} alt={otherStory.label} onError={handleImageError} draggable={false} />
                    <div>
                      <h3>{otherStory.label}</h3>
                      <p>{otherStory.tagline}</p>
                      {price !== null && (
                        <span className="pstory-chip pstory-chip--price">From {formatCurrency(price, listing?.currency || "EUR")}/night</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <SimilarUnitsSection
          listings={antwerpListings.filter((l) => getBuildingKey(l) !== sectionKey && !isChildListing(l))}
          buildListingPath={(id) => `/antwerp/listing/${encodeURIComponent(id)}`}
          getListingId={getListingId}
          getListingImageUrls={getListingImageUrls}
          fallbackImage={FALLBACK_IMAGE}
          getImageUrl={getImageUrl}
          sanitizeText={sanitizeText}
          resolveGroupTitle={(l) => PROPERTY_STORIES[getBuildingKey(l)]?.label || "One Lux Stay Antwerp"}
          formatAddress={(l) => formatAddress(l, getBuildingKey(l))}
          firstNumber={firstNumber}
          formatCurrency={formatCurrency}
          handleImageError={handleImageError}
          defaultTitle="One Lux Stay Antwerp"
          defaultCurrency="EUR"
        />
      </main>

      <SiteFooter />

      <MasonryGalleryModal
        open={galleryOpen}
        images={galleryImages}
        initialIndex={galleryIndex}
        title={`${story.label} photos`}
        onClose={() => setGalleryOpen(false)}
      />

      <ApaleoCheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        localPropertyId={checkoutListing?.localPropertyId || ""}
        listingTitle={checkoutListing?.listingTitle || ""}
        defaultAdults={Number(guests) || 2}
        defaultArrival={checkIn}
        defaultDeparture={checkOut}
      />
    </div>
  );
}
