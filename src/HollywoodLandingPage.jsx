import { useState, useEffect, useMemo, useRef, useId } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import CitySearchLoadingOverlay from "./components/CitySearchLoadingOverlay";
import SiteFooter from "./components/SiteFooter";
import apiBase from "./utils/apiBase";
import { filterLowQualityImages } from "./utils/imageQuality";
import { buildStaticMapUrl, buildEmbedMapUrl } from "./utils/leafletMapsAdapter";
import { getAverageNightlyFromTotal } from "./utils/pricingDisplay";

// ─── Constants ──────────────────────────────────────────────────────────────────

const LOGO_URL = "https://admin.oneluxstay.com/oneluxstay-logo.webp";

const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='520' viewBox='0 0 800 520'><rect width='800' height='520' fill='%23efe7dc'/><text x='400' y='260' text-anchor='middle' dominant-baseline='middle' fill='%239c8368' font-family='Arial, sans-serif' font-size='24'>Image unavailable</text></svg>";

const HOLLYWOOD_COORDS = { lat: 34.0967, lng: -118.3119 }; // 5620 De Longpre Ave
const BUILDING_KEY = "la-hollywood";
const GROUP_TITLE = "One Lux Stay Hollywood View LA Suites";
const BOOKING_STORAGE_KEY = "hollywoodBookingFilters";

const HOLLYWOOD_LANDMARKS = [
  "Hollywood Sign",
  "Walk of Fame",
  "Griffith Observatory",
  "Hollywood Bowl",
  "Sunset Strip",
];

const HOLLYWOOD_TRANSIT = [
  "Metro B Line (Red)",
  "Hollywood/Highland",
  "Hollywood/Vine",
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const firstNumber = (...values) => {
  for (const v of values) {
    const n = toNumber(v);
    if (n !== null) return n;
  }
  return null;
};

const isChildListing = (listing) => {
  if (!listing) return false;
  const type = typeof listing.type === "string" ? listing.type.toUpperCase() : "";
  if (type.includes("CHILD")) return true;
  if (listing?.parentId || listing?.parentListingId) return true;
  const id = listing?.id || listing?._id || null;
  if (listing?.unitTypeId && id && String(listing.unitTypeId) !== String(id)) return true;
  return false;
};

const getBuildingKey = (listing) => {
  const text = [
    listing?.title,
    listing?.nickname,
    listing?.address?.full,
    listing?.location,
    ...(Array.isArray(listing?.tags) ? listing.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\bhwh\b|west hollywood|weho/.test(text)) return "la-hwh";
  if (/hollywood/.test(text)) return "la-hollywood";
  return "other";
};

const isHollywoodListing = (listing) => getBuildingKey(listing) === BUILDING_KEY;

const getListingId = (listing) =>
  listing?.id || listing?._id || listing?.unitTypeId || "";

const getImageUrl = (image) => {
  if (!image) return "";
  if (typeof image === "string") return image.trim();
  return (
    image.url ||
    image.src ||
    image.regular ||
    image.large ||
    image.original ||
    image.thumbnail ||
    ""
  );
};

const getListingImages = (listing) => {
  if (!listing) return [];
  const out = [];
  const seen = new Set();
  const add = (url) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  };
  if (Array.isArray(listing.pictures) && listing.pictures.length) {
    listing.pictures.forEach((pic) =>
      typeof pic === "string" ? add(pic) : add(getImageUrl(pic)),
    );
  } else {
    typeof listing.picture === "string"
      ? add(listing.picture)
      : add(getImageUrl(listing.picture));
  }
  return filterLowQualityImages(out).filter(Boolean);
};

const formatCurrency = (value, currency = "USD") => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  try {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });
  } catch {
    return `$${Math.round(value)}`;
  }
};

const sanitizeText = (value = "") =>
  String(value || "")
    .replace(/[<>]/g, "")
    .trim();

const formatAddress = (listing) => {
  const full = listing?.address?.full;
  if (full && typeof full === "string") return sanitizeText(full);
  const parts = [
    listing?.address?.street,
    listing?.address?.city,
    listing?.address?.state,
  ].filter(Boolean);
  return parts.length ? sanitizeText(parts.join(", ")) : "Hollywood, CA";
};

const diffNights = (start, end) => {
  if (!start || !end) return 0;
  const s = new Date(start),
    e = new Date(end);
  const ms = e - s;
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 86400000) : 0;
};

const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseDateValue = (value) => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const formatDisplayDate = (value) => {
  const date = parseDateValue(value);
  if (!date) return "Add date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const handleImageError = (e) => {
  const img = e.currentTarget;
  if (img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = "true";
  img.src = FALLBACK_IMAGE;
  if (!img.alt) img.alt = "Image unavailable";
};

const readPersistedBooking = () => {
  try {
    const raw = window.sessionStorage.getItem(BOOKING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writePersistedBooking = (payload) => {
  try {
    if (!payload) {
      window.sessionStorage.removeItem(BOOKING_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
};

// ─── Inline DateRangePicker ──────────────────────────────────────────────────────

const DateRangePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const checkInLabelId = useId();
  const checkOutLabelId = useId();
  const dialogId = useId();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [view, setView] = useState(() => parseDateValue(value.checkIn) || today);
  const containerRef = useRef(null);

  const startDate = useMemo(() => parseDateValue(value.checkIn), [value.checkIn]);
  const endDate = useMemo(() => parseDateValue(value.checkOut), [value.checkOut]);

  useEffect(() => {
    const handleClick = (e) => {
      if (!open) return;
      if (containerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const buildMonth = (baseDate) => {
    const year = baseDate.getFullYear(),
      month = baseDate.getMonth();
    const startOffset = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array(startOffset).fill(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(new Date(year, month, i));
    return { year, month, cells };
  };

  const isSameDay = (a, b) =>
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const inRange = (day) => {
    if (!day || !startDate) return false;
    if (startDate && endDate) return day >= startDate && day <= endDate;
    return isSameDay(day, startDate);
  };

  const handleDayClick = (day) => {
    if (!day || day < today) return;
    let nextStart = startDate,
      nextEnd = endDate;
    if (!startDate || (startDate && endDate)) {
      nextStart = day;
      nextEnd = null;
    } else if (day < startDate) {
      nextStart = day;
      nextEnd = null;
    } else {
      nextEnd = day;
    }
    onChange({
      checkIn: nextStart ? toISODate(nextStart) : "",
      checkOut: nextEnd ? toISODate(nextEnd) : "",
    });
    if (nextStart && nextEnd) setOpen(false);
  };

  const primaryMonth = buildMonth(view);
  const secondaryMonth = buildMonth(
    new Date(view.getFullYear(), view.getMonth() + 1, 1),
  );
  const primaryLabel = new Date(
    primaryMonth.year,
    primaryMonth.month,
    1,
  ).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const secondaryLabel = new Date(
    secondaryMonth.year,
    secondaryMonth.month,
    1,
  ).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const isMobile =
    typeof window !== "undefined" && window.innerWidth <= 640;
  const monthLabel = isMobile
    ? primaryLabel
    : `${primaryLabel} - ${secondaryLabel}`;

  return (
    <div
      className={`la-date-picker${open ? " is-open" : ""}`}
      ref={containerRef}
    >
      <div className="la-date-grid">
        <div className="la-date-field">
          <label id={checkInLabelId} className="la-date-label">
            Check-in
          </label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkInLabelId}
            className="la-date-input"
          >
            {formatDisplayDate(value.checkIn)}
          </button>
        </div>
        <div className="la-date-field">
          <label id={checkOutLabelId} className="la-date-label">
            Check-out
          </label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkOutLabelId}
            className="la-date-input"
          >
            {formatDisplayDate(value.checkOut)}
          </button>
        </div>
      </div>

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-label="Choose dates"
          className="listing-date-dropdown"
        >
          <div className="la-date-header">
            <div className="la-date-title">{monthLabel}</div>
            <div className="la-date-nav">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() =>
                  setView(
                    (p) => new Date(p.getFullYear(), p.getMonth() - 1, 1),
                  )
                }
                className="la-date-nav-btn"
              >
                {"<"}
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setView(
                    (p) => new Date(p.getFullYear(), p.getMonth() + 1, 1),
                  )
                }
                className="la-date-nav-btn"
              >
                {">"}
              </button>
            </div>
          </div>
          <div className="la-date-body">
            <div className="la-date-months">
              {[primaryMonth, secondaryMonth].map((mo) => (
                <div
                  key={`${mo.year}-${mo.month}`}
                  className="la-date-month"
                >
                  <div className="la-date-month-title">
                    {new Date(mo.year, mo.month, 1).toLocaleDateString(
                      undefined,
                      { month: "long", year: "numeric" },
                    )}
                  </div>
                  <div className="la-date-week" role="row">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (d) => (
                        <div key={d} role="columnheader">
                          {d}
                        </div>
                      ),
                    )}
                  </div>
                  <div className="la-date-days" role="grid">
                    {mo.cells.map((day, idx) => {
                      const disabled = !day || day < today;
                      const selected =
                        (startDate && isSameDay(day, startDate)) ||
                        (endDate && isSameDay(day, endDate));
                      const between = inRange(day) && !selected;
                      const dayLabel = day
                        ? day.toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "";
                      const stateClass = disabled
                        ? "is-disabled"
                        : selected
                          ? "is-selected"
                          : between
                            ? "is-between"
                            : "is-default";
                      return (
                        <button
                          key={`${mo.year}-${mo.month}-${idx}`}
                          type="button"
                          disabled={disabled}
                          aria-selected={selected}
                          aria-disabled={disabled}
                          aria-label={dayLabel}
                          aria-hidden={day ? undefined : true}
                          onClick={() => handleDayClick(day)}
                          className={`listing-date-cell ${stateClass}`}
                        >
                          {day ? (
                            <span className="listing-date-cell__day">
                              {day.getDate()}
                            </span>
                          ) : (
                            ""
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="la-date-footer">
              <button
                type="button"
                onClick={() => onChange({ checkIn: "", checkOut: "" })}
                className="la-date-clear"
              >
                Clear dates
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="la-date-done"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Hollywood group header (inside scrollable column) ───────────────────────────

const HollywoodGroupHeader = () => (
  <div className="la-hollywood-group-header" aria-label="Hollywood, CA — One Lux Stay">
    <div
      className="la-hollywood-group-header__bg"
      style={{
        backgroundImage:
          "url(https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1800&auto=format&fit=crop)",
      }}
      aria-hidden="true"
    />
    <div className="la-hollywood-group-header__inner">
      <p className="antwerp-kicker">Hollywood, CA</p>
      <h2 className="la-hollywood-group-header__title">{GROUP_TITLE}</h2>
      <p className="la-hollywood-group-header__tagline">
        Neon nights, canyon mornings, and a view that never gets old.
      </p>
      <p className="la-hollywood-group-header__copy">
        From the hills to the boulevard, Hollywood keeps the story rolling.
        Catch the sign at sunrise, sip on Sunset, and glide to Griffith in
        minutes — a destination that feels cinematic the moment you arrive.
      </p>
      <div className="la-hollywood-group-header__pills">
        {HOLLYWOOD_LANDMARKS.map((lm) => (
          <span key={lm} className="la-section-modal__landmark-pill">
            {lm}
          </span>
        ))}
        {HOLLYWOOD_TRANSIT.map((t) => (
          <span
            key={t}
            className="la-section-modal__landmark-pill la-section-modal__landmark-pill--transit"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  </div>
);

// ─── Main component ──────────────────────────────────────────────────────────────

export default function HollywoodLandingPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("2");
  const [minBedrooms, setMinBedrooms] = useState(1);
  const [draftCheckIn, setDraftCheckIn] = useState("");
  const [draftCheckOut, setDraftCheckOut] = useState("");
  const [draftGuests, setDraftGuests] = useState("2");
  const [draftMinBedrooms, setDraftMinBedrooms] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isFilterApplying, setIsFilterApplying] = useState(false);

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cardImageIndexes, setCardImageIndexes] = useState({});
  const [showNightlyTotal, setShowNightlyTotal] = useState(false);

  const [isMapEnabled, setIsMapEnabled] = useState(false);
  const filterApplyingTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (filterApplyingTimerRef.current) {
        window.clearTimeout(filterApplyingTimerRef.current);
      }
    };
  }, []);

  // Read URL params + persisted booking on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const persisted = readPersistedBooking();
    const nextCheckIn = params.get("checkIn") || persisted?.checkIn || "";
    const nextCheckOut = params.get("checkOut") || persisted?.checkOut || "";
    const nextGuests = params.get("guests") || persisted?.guests || "2";
    const nextBedrooms = Number(params.get("bedrooms") || "") || 1;
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
    setGuests(nextGuests);
    setMinBedrooms(nextBedrooms);
    setDraftCheckIn(nextCheckIn);
    setDraftCheckOut(nextCheckOut);
    setDraftGuests(nextGuests);
    setDraftMinBedrooms(nextBedrooms);
    const q = params.get("q") || "";
    setSearchQuery(q);
    setAppliedSearch(q);
  }, [location.search]);

  // Persist booking
  useEffect(() => {
    if (checkIn || checkOut || guests !== "2") {
      writePersistedBooking({ checkIn, checkOut, guests });
    } else {
      writePersistedBooking(null);
    }
  }, [checkIn, checkOut, guests]);

  useEffect(() => {
    setShowNightlyTotal(diffNights(checkIn, checkOut) > 0);
  }, [checkIn, checkOut]);

  // Fetch Hollywood listings
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch(`${apiBase}/listings`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (!active) return;
        const all = Array.isArray(json?.results) ? json.results : [];
        const hollywoodUnits = all
          .filter((l) => !isChildListing(l))
          .filter(isHollywoodListing)
          .map((l) => ({
            ...l,
            basePrice: firstNumber(
              l?.basePrice,
              l?.prices?.basePrice,
              l?.prices?.basePricePerNight,
              l?.prices?.nightly,
              l?.prices?.basePrice?.amount,
              l?.prices?.nightly?.amount,
            ),
            currency: l?.currency || l?.prices?.currency || "USD",
          }));

        setListings(hollywoodUnits);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error("[HollywoodLandingPage] fetch error:", err);
        setError("Unable to load Hollywood units. Please refresh.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredListings = useMemo(() => {
    let result = listings;
    if (appliedSearch) {
      const q = appliedSearch.toLowerCase();
      result = result.filter((l) =>
        [
          l?.title,
          l?.nickname,
          l?.address?.full,
          l?.address?.city,
          l?.propertyType,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    if (minBedrooms > 1) {
      result = result.filter((l) => {
        const beds = firstNumber(l?.bedrooms, l?.beds) ?? 0;
        return beds >= minBedrooms;
      });
    }
    return result;
  }, [listings, appliedSearch, minBedrooms]);

  const buildListingPath = (listingId) => {
    if (!listingId) return "/hollywood";
    const params = new URLSearchParams();
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    if (guests && guests !== "2") params.set("guests", guests);
    const query = params.toString();
    return `/hollywood/listing/${encodeURIComponent(listingId)}${query ? `?${query}` : ""}`;
  };

  const handleSearchSubmit = () => {
    const trimmed = searchQuery.trim();
    const nextCheckIn = draftCheckIn || "";
    const nextCheckOut = draftCheckOut || "";
    const nextGuests = draftGuests || "2";
    const nextBedrooms = Number(draftMinBedrooms) || 1;
    setSearchQuery(trimmed);
    setAppliedSearch(trimmed);
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
    setGuests(nextGuests);
    setMinBedrooms(nextBedrooms);
    setIsSearchFocused(false);

    const params = new URLSearchParams(location.search);
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    if (nextCheckIn) params.set("checkIn", nextCheckIn);
    else params.delete("checkIn");
    if (nextCheckOut) params.set("checkOut", nextCheckOut);
    else params.delete("checkOut");
    if (nextGuests && nextGuests !== "2") params.set("guests", nextGuests);
    else params.delete("guests");
    if (nextBedrooms > 1) params.set("bedrooms", String(nextBedrooms));
    else params.delete("bedrooms");

    if (filterApplyingTimerRef.current) {
      window.clearTimeout(filterApplyingTimerRef.current);
    }
    setIsFilterApplying(true);
    filterApplyingTimerRef.current = window.setTimeout(() => {
      setIsFilterApplying(false);
      filterApplyingTimerRef.current = null;
    }, 750);

    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
      },
      { replace: true }
    );
  };

  const clearFilters = () => {
    if (filterApplyingTimerRef.current) {
      window.clearTimeout(filterApplyingTimerRef.current);
      filterApplyingTimerRef.current = null;
    }
    setIsFilterApplying(false);
    setSearchQuery("");
    setAppliedSearch("");
    setMinBedrooms(1);
    setDraftMinBedrooms(1);
    setCheckIn("");
    setCheckOut("");
    setDraftCheckIn("");
    setDraftCheckOut("");
    setGuests("2");
    setDraftGuests("2");
    setShowNightlyTotal(false);
    writePersistedBooking(null);
    const params = new URLSearchParams(location.search);
    params.delete("q");
    params.delete("checkIn");
    params.delete("checkOut");
    params.delete("guests");
    params.delete("bedrooms");
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
      },
      { replace: true }
    );
  };

  const nights = diffNights(checkIn, checkOut);
  const hasActiveFilters =
    Boolean(appliedSearch) ||
    minBedrooms > 1 ||
    guests !== "2" ||
    Boolean(checkIn) ||
    Boolean(checkOut);

  const mapStaticUrl = buildStaticMapUrl(HOLLYWOOD_COORDS, "480x360", 13);
  const mapEmbedUrl = buildEmbedMapUrl(HOLLYWOOD_COORDS, 14);

  // ── JSX ──────────────────────────────────────────────────────────────────────
  // ARCHITECTURE: matches LosAngelesLandingPage / DubaiLandingPage app-shell pattern.
  // - .city-viewport-shell at ≥901px: height:100vh; overflow:hidden
  // - .antwerp-main: flex column, overflow:hidden
  // - ONE .antwerp-section--split fills remaining height
  // - .la-units-main--cards is the ONLY scroll container (overflow-y:auto)
  // → Listing content stays inside the left column; footer renders after the split layout.

  return (
    <>
      <CitySearchLoadingOverlay active={isFilterApplying} />
      <div className="city-viewport-shell city-viewport-shell--dubai">

      {/* ── Sticky header ── */}
      <section
        className="city-search-shell city-search-shell--dubai"
        aria-label="Search Hollywood stays"
      >
        <div
          className="city-search-topline city-search-topline--breadcrumbs"
          aria-label="Breadcrumb"
        >
          <Link
            to="/"
            className="city-search-brand"
            aria-label="OneLuxStay home"
          >
            <img
              src={LOGO_URL}
              alt="OneLuxStay logo"
              loading="lazy"
              onError={handleImageError}
            />
            <span className="city-search-brand__name">OneLuxStay</span>
          </Link>
          <nav className="city-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/" className="city-breadcrumbs__link">
              Home
            </Link>
            <span className="city-breadcrumbs__sep" aria-hidden="true">
              &gt;
            </span>
            <span className="city-breadcrumbs__current" aria-current="page">
              Hollywood
            </span>
          </nav>
        </div>

        <div className="city-search-bar">
          <label
            className={`city-search-field city-search-field--location${isSearchFocused ? " is-focused" : ""}`}
          >
            <span className="city-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path
                  d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm0-2a8.5 8.5 0 1 0 5.34 15.09l4.53 4.53a1 1 0 1 0 1.42-1.42l-4.53-4.53A8.5 8.5 0 0 0 10.5 2z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() =>
                setTimeout(() => setIsSearchFocused(false), 120)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearchSubmit();
                }
              }}
              placeholder="Search Hollywood units"
              aria-label="Search Hollywood units"
            />
          </label>

          <div className="city-search-field city-search-field--dates">
            <DateRangePicker
              value={{ checkIn: draftCheckIn, checkOut: draftCheckOut }}
              onChange={(next) => {
                setDraftCheckIn(next.checkIn);
                setDraftCheckOut(next.checkOut);
              }}
            />
          </div>

          <label className="city-search-field city-search-field--guests">
            <span className="city-search-label">Guests</span>
            <select
              value={draftGuests}
              onChange={(e) => setDraftGuests(e.target.value)}
              aria-label="Number of guests"
            >
              {["1", "2", "3", "4", "5", "6", "7", "8"].map((g) => (
                <option key={g} value={g}>
                  {g} {g === "1" ? "guest" : "guests"}
                </option>
              ))}
            </select>
          </label>

          <label className="city-search-field city-search-field--bedrooms">
            <span className="city-search-label">Bedrooms</span>
            <select
              value={draftMinBedrooms}
              onChange={(e) => setDraftMinBedrooms(Number(e.target.value))}
              aria-label="Minimum bedrooms"
            >
              {[1, 2, 3, 4].map((b) => (
                <option key={b} value={b}>
                  {b === 1 ? "Any" : `${b}+`}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={`city-search-submit${isFilterApplying ? " is-loading" : ""}`}
            onClick={handleSearchSubmit}
            disabled={isFilterApplying}
            aria-busy={isFilterApplying ? "true" : "false"}
            aria-label="Search"
          >
            {isFilterApplying ? (
              <span className="city-search-submit__spinner" aria-hidden="true" />
            ) : null}
            <span>{isFilterApplying ? "Searching" : "Search"}</span>
          </button>
        </div>
      </section>

      {/* ── App-shell main ──────────────────────────────────────────────────────
          ONE antwerp-section fills the remaining height.
          la-units-main--cards is the sole scroll container.
      ── */}
      <main className="antwerp-main">
        <section
          className="antwerp-section antwerp-section--split dubai-units-section hollywood-units-section"
          id="hollywood-units"
          aria-label="Hollywood units"
        >
          <div className="la-units-layout la-units-layout--split">

            {/* ── LEFT: scrollable column — ALL page content lives here ── */}
            <div
              className="la-units-main la-units-main--cards"
              aria-label="Available Hollywood units"
            >
              {/* Hero / group header */}
              <HollywoodGroupHeader />

              {/* Filter summary bar */}
              <div className="la-units-filter-bar" aria-label="Hollywood filter summary">
                <p className="la-units-filter-bar__summary" aria-live="polite">
                  {loading
                    ? "Loading Hollywood units…"
                    : `${filteredListings.length} ${filteredListings.length === 1 ? "unit" : "units"} available`}
                </p>
                {checkIn && checkOut && (
                  <span className="la-shell-chip">
                    {formatDisplayDate(checkIn)} –{" "}
                    {formatDisplayDate(checkOut)}
                    {nights > 0 &&
                      ` · ${nights} ${nights === 1 ? "night" : "nights"}`}
                  </span>
                )}
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="la-shell-chip is-action"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Loading skeletons */}
              {loading && (
                <div className="antwerp-loading">
                  <div className="antwerp-skeleton" />
                  <div className="antwerp-skeleton" />
                  <div className="antwerp-skeleton" />
                </div>
              )}

              {/* Error */}
              {error && (
                <div role="alert" className="antwerp-error">
                  <span>{error}</span>
                  <button
                    type="button"
                    className="antwerp-ghost"
                    onClick={() => {
                      setError("");
                      setLoading(true);
                      fetch(`${apiBase}/listings`)
                        .then((r) => r.json())
                        .then((json) => {
                          const all = Array.isArray(json?.results)
                            ? json.results
                            : [];
                          setListings(
                            all
                              .filter((l) => !isChildListing(l))
                              .filter(isHollywoodListing),
                          );
                          setLoading(false);
                          setError("");
                        })
                        .catch(() => {
                          setError(
                            "Unable to load Hollywood units. Please refresh.",
                          );
                          setLoading(false);
                        });
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!loading && !error && filteredListings.length === 0 && (
                <div className="antwerp-empty">
                  <p>
                    {listings.length === 0
                      ? "No Hollywood units are available right now."
                      : "No units match your filters."}
                  </p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      className="antwerp-ghost"
                      onClick={clearFilters}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {/* Listing cards */}
              {!loading && !error && filteredListings.length > 0 && (
                <div className="la-unit-listing-grid">
                  {filteredListings.map((listing) => {
                    const listingId = getListingId(listing);
                    if (!listingId) return null;
                    const images = getListingImages(listing);
                    const safeIdx =
                      images.length > 0
                        ? (cardImageIndexes[listingId] ?? 0) % images.length
                        : 0;
                    const currentImage = images[safeIdx] || FALLBACK_IMAGE;
                    const listingPath = buildListingPath(listingId);

                    const nightlyPrice = firstNumber(
                      listing?.prices?.nightly?.amount,
                      listing?.prices?.nightly,
                      listing?.prices?.basePricePerNight,
                      listing?.prices?.basePrice?.amount,
                      listing?.basePricePerNight,
                      listing?.basePrice,
                    );
                    const originalPrice = firstNumber(
                      listing?.prices?.basePrice,
                      listing?.originalPrice,
                    );
                    const currency =
                      listing?.currency ||
                      listing?.prices?.currency ||
                      "USD";
                    const stayTotal =
                      showNightlyTotal &&
                      nights > 0 &&
                      typeof nightlyPrice === "number"
                        ? nightlyPrice * nights
                        : null;
                    const averageNightly = getAverageNightlyFromTotal(stayTotal, nights);
                    const priceMain = stayTotal
                      ? `${formatCurrency(stayTotal, currency)} total`
                      : typeof nightlyPrice === "number"
                        ? `${formatCurrency(nightlyPrice, currency)} / night`
                        : "Price on request";
                    const priceSub = stayTotal
                      ? `${formatCurrency(averageNightly ?? nightlyPrice, currency)} avg/night · ${nights} ${nights === 1 ? "night" : "nights"}`
                      : "";
                    const hasStrikePrice =
                      typeof originalPrice === "number" &&
                      typeof nightlyPrice === "number" &&
                      originalPrice > nightlyPrice;
                    const bedrooms = firstNumber(
                      listing?.bedrooms,
                      listing?.beds,
                    );
                    const bathrooms = firstNumber(listing?.bathrooms);
                    const accommodates = firstNumber(
                      listing?.accommodates,
                      listing?.maxGuests,
                    );
                    const areaSqft = firstNumber(
                      listing?.squareFeet,
                      listing?.area,
                    );

                    return (
                      <Link
                        key={listingId}
                        to={listingPath}
                        className="la-unit-listing-card"
                      >
                        <div className="la-unit-listing-card__media">
                          <img
                            className="la-unit-listing-card__media-image"
                            src={currentImage}
                            alt={sanitizeText(
                              listing?.title || "One Lux Stay Hollywood",
                            )}
                            loading="lazy"
                            onError={handleImageError}
                          />
                          {images.length > 1 && (
                            <div
                              className="la-unit-listing-card__carousel"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <button
                                type="button"
                                className="la-unit-listing-card__carousel-btn"
                                aria-label="Previous image"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setCardImageIndexes((p) => ({
                                    ...p,
                                    [listingId]:
                                      (safeIdx - 1 + images.length) %
                                      images.length,
                                  }));
                                }}
                              >
                                &#8249;
                              </button>
                              <div
                                className="la-unit-listing-card__carousel-dots"
                                aria-hidden="true"
                              >
                                {images.slice(0, 5).map((_, i) => (
                                  <span
                                    key={i}
                                    className={`la-unit-listing-card__carousel-dot${i === safeIdx ? " is-active" : ""}`}
                                  />
                                ))}
                              </div>
                              <button
                                type="button"
                                className="la-unit-listing-card__carousel-btn"
                                aria-label="Next image"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setCardImageIndexes((p) => ({
                                    ...p,
                                    [listingId]:
                                      (safeIdx + 1) % images.length,
                                  }));
                                }}
                              >
                                &#8250;
                              </button>
                            </div>
                          )}
                          <span className="la-unit-listing-card__badge">
                            Available now
                          </span>
                          <span
                            className="la-unit-listing-card__fav"
                            aria-hidden="true"
                          >
                            &#9825;
                          </span>
                        </div>
                        <div className="la-unit-listing-card__body">
                          <p className="la-unit-listing-card__area">
                            {GROUP_TITLE}
                          </p>
                          <h3 className="la-unit-listing-card__title">
                            {sanitizeText(
                              listing?.title ||
                                "One Lux Stay Hollywood",
                            )}
                          </h3>
                          <p className="la-unit-listing-card__price">
                            {hasStrikePrice && (
                              <span className="la-unit-listing-card__price-strike">
                                {formatCurrency(originalPrice, currency)}
                              </span>
                            )}
                            <span className="la-unit-listing-card__price-main">
                              {priceMain}
                            </span>
                            {priceSub && (
                              <span className="la-unit-listing-card__price-sub">
                                {priceSub}
                              </span>
                            )}
                          </p>
                          <p className="la-unit-listing-card__meta">
                            {[
                              bedrooms ? `${bedrooms} bd` : null,
                              bathrooms ? `${bathrooms} ba` : null,
                              accommodates
                                ? `${accommodates} guests`
                                : null,
                              areaSqft ? `${areaSqft} ft²` : null,
                            ]
                              .filter(Boolean)
                              .join(" | ") || "Details available"}
                          </p>
                          <p className="la-unit-listing-card__address">
                            {formatAddress(listing)}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

            </div>
            {/* end la-units-main--cards */}

            {/* ── RIGHT: map aside ── */}
            <aside
              className="la-units-aside la-units-aside--map"
              aria-label="Map of Hollywood units"
            >

              {isMapEnabled ? (
                <iframe
                  className="la-units-map la-units-map--panel"
                  src={mapEmbedUrl}
                  title="Hollywood area map"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ border: 0 }}
                />
              ) : (
                <div
                  className="la-units-map la-units-map--panel la-units-map--placeholder"
                  style={{
                    "--map-placeholder-image": mapStaticUrl ? `url(${mapStaticUrl})` : "none",
                    cursor: "pointer",
                  }}
                  onClick={() => setIsMapEnabled(true)}
                  role="button"
                  tabIndex={0}
                  aria-label="Load interactive Hollywood map"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      setIsMapEnabled(true);
                  }}
                >
                  <div className="la-units-map__placeholder-content">
                    <p className="antwerp-muted" style={{ margin: 0 }}>
                      Map loads on demand to keep the page fast.
                    </p>
                    <button
                      type="button"
                      className="antwerp-card__ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMapEnabled(true);
                      }}
                    >
                      Load map
                    </button>
                  </div>
                </div>
              )}
            </aside>

          </div>
          {/* end la-units-layout */}
        </section>
        {/* end antwerp-section */}
      </main>

      </div>
      <SiteFooter />
    </>
  );
}
