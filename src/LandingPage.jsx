import { Link, useLocation, useNavigate } from "react-router-dom";
import { Suspense, lazy, useCallback, useEffect, useRef, useState, useMemo, useId } from "react";
import "./App.css";
import SiteFooter from "./components/SiteFooter";
import apiBase from "./utils/apiBase";
import { filterLowQualityImages } from "./utils/imageQuality";
import { prefetchCityRoute, prefetchRouteByPath } from "./utils/routePreloaders";
import { trackGuestCityClick, trackGuestListingClick, trackGuestJourneyEvent } from "./utils/guestAnalytics";
import { isHiddenUnit } from "./config/hiddenUnits";
import {
  trackAvailabilityOpened,
  trackAvailabilitySearch,
  trackBookingStart,
  trackCalendarAbandoned,
  trackCityView,
  trackCtaClick,
  trackGuestCountChanged,
} from "./lib/analytics";

const Silk = lazy(() => import("./components/Silk"));
const CircularGallery = lazy(() => import("./components/CircularGallery"));

// Temporarily keep the experimental hero property carousel out of production.
// Property availability is now surfaced on each property's booking calendar.
const HOMEPAGE_HERO_GALLERY_ENABLED = false;
const ChromaGrid = lazy(() => import("./components/ChromaGrid"));

const KNOWN_CITIES = [
  "hollywood",
  "los angeles",
  "antwerp",
  "antwerpen",
  "dubai",
  "redondo beach",
];

const CITY_DISPLAY_LABELS = {
  Antwerp: "Antwerp, Belgium",
  Dubai: "Dubai, UAE",
  Hollywood: "Hollywood, CA",
  "Los Angeles": "Los Angeles, CA",
  "Redondo Beach": "Redondo Beach, CA",
};

const HERO_CITY_SHORTCUTS = ["Antwerp", "Dubai", "Los Angeles", "Hollywood", "Redondo Beach"];

const PROPERTY_FALLBACK_IMAGES = {
  Antwerp: "https://assets.guesty.com/image/upload/v1747520363/production/666b3af27fc6d5653142b0af/ihcbdtwkdiaq9xyezgrs.jpg",
  Dubai: "https://assets.guesty.com/image/upload/v1732915502/production/666b3af27fc6d5653142b0af/r4h0yzxzbjsirfh77ygb.jpg",
  Hollywood: "https://assets.guesty.com/image/upload/v1729697715/production/666b3af27fc6d5653142b0af/t9xacjoibl7vpywhi6jf.jpg",
  "Los Angeles": "https://assets.guesty.com/image/upload/v1730119087/production/666b3af27fc6d5653142b0af/npeczkhmy9wff4lzuyvr.jpg",
  "Redondo Beach": "https://assets.guesty.com/image/upload/v1760726898/production/666b3af27fc6d5653142b0af/anjv8iafdjmf6knycd8n.jpg",
};

const normalizeApaleoCity = (property = {}) => {
  const city = String(property?.city || property?.location?.city || "").trim();
  const description = `${property?.title || ""} ${property?.description || ""}`.toLowerCase();
  if (/antwerp|antwerpen/.test(city.toLowerCase()) || /antwerp/.test(description)) return "Antwerp";
  if (/redondo/.test(city.toLowerCase()) || /redondo/.test(description)) return "Redondo Beach";
  if (/hollywood/.test(city.toLowerCase()) || /hollywood/.test(description)) return "Hollywood";
  if (/dubai/.test(city.toLowerCase()) || /dubai/.test(description)) return "Dubai";
  if (/los angeles|torrance/.test(city.toLowerCase()) || /los angeles|hwh|la plaza/.test(description)) return "Los Angeles";
  return city;
};

const cleanApaleoPropertyName = (value = "") =>
  String(value || "").replace(/^[A-Z]\d?\.\s*/i, "").trim() || "One Lux Stay";

const BUSINESS_ACCOMMODATION_DEALS = [
  {
    label: "Construction Accommodations",
    to: "/business/construction-accommodations",
    blurb: "Crew-ready homes near the job site",
    image: "https://assets.guesty.com/image/upload/v1729880354/production/666b3af27fc6d5653142b0af/yc51idfkqenc81wnse8n.jpg",
  },
  {
    label: "Corporate Assignment & Relocation",
    to: "/business/corporate-relocation",
    blurb: "Settled from day one, anywhere",
    image: "https://assets.guesty.com/image/upload/v1733508976/production/666b3af27fc6d5653142b0af/uw8axioi311sthwkvv3u.jpg",
  },
  {
    label: "Entertainment Industry",
    to: "/business/entertainment-industry",
    blurb: "Private stays for cast and crew",
    image: "https://assets.guesty.com/image/upload/v1729698598/production/666b3af27fc6d5653142b0af/at1j16rqji4epdet5xna.jpg",
  },
  {
    label: "Government",
    to: "/business/government",
    blurb: "Dependable housing for official travel",
    image: "https://assets.guesty.com/image/upload/v1730118454/production/666b3af27fc6d5653142b0af/hhak8hklrbv2ewtdwuoy.jpg",
  },
  {
    label: "Healthcare Professionals",
    to: "/healthcare-professionals",
    blurb: "Real rest between demanding shifts",
    image: "https://assets.guesty.com/image/upload/v1729698123/production/666b3af27fc6d5653142b0af/gbfnbuvqtbreaw3100fk.jpg",
  },
];

const citySlugFromName = (value) => {
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower.includes("los angeles")) return "los-angeles";
  if (lower.includes("hollywood")) return "hollywood";
  if (lower.includes("antwerp") || lower.includes("antwerpen")) return "antwerp";
  if (lower.includes("redondo beach")) return "redondo-beach";
  if (lower.includes("dubai")) return "dubai";
  return lower.replace(/,/g, "").trim().replace(/\s+/g, "-");
};

const normalizeListingCity = (listing) => {
  const titleLower = typeof listing?.title === "string" ? listing.title.toLowerCase() : "";
  if (titleLower.includes("hollywood")) return "Hollywood";

  const primary = listing?.city || listing?.address?.city;
  if (primary) {
    const trimmed = primary.trim();
    return trimmed;
  }

  const tagCity =
    Array.isArray(listing?.tags) &&
    listing.tags.find((t) => typeof t === "string" && KNOWN_CITIES.includes(t.toLowerCase()));
  if (tagCity) {
    const trimmed = tagCity.trim();
    return trimmed;
  }

  if (titleLower) {
    const match = KNOWN_CITIES.find((c) => titleLower.includes(c));
    if (match) {
      return match
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  return "";
};

const getListingId = (listing) => listing?.id || listing?._id || listing?.unitTypeId || "";

const isChildListing = (listing) => {
  if (!listing) return false;
  const type = typeof listing.type === "string" ? listing.type.toUpperCase() : "";
  if (type.includes("CHILD")) return true;
  if (listing?.parentId || listing?.parentListingId) return true;
  const listingId = listing?.id || listing?._id || null;
  if (listing?.unitTypeId && listingId && String(listing.unitTypeId) !== String(listingId)) return true;
  return false;
};

const parseBooleanFlag = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["true", "1", "yes", "active", "enabled"].includes(normalized)) return true;
    if (["false", "0", "no", "inactive", "disabled", "archived"].includes(normalized)) return false;
  }
  return null;
};

const isListingActiveForShowcase = (listing) => {
  if (!listing) return false;
  const activeFlag = parseBooleanFlag(listing?.active ?? listing?.isActive);
  const pmsActiveFlag = parseBooleanFlag(listing?.pmsActive ?? listing?.isPmsActive);
  const statusFlag = parseBooleanFlag(listing?.status);
  if (activeFlag === false || pmsActiveFlag === false || statusFlag === false) return false;
  return true;
};

const extractImageUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return (
      value.url ||
      value.src ||
      value.href ||
      value.secure_url ||
      value.secureUrl ||
      value.original ||
      value.large ||
      value.regular ||
      value.thumbnail ||
      ""
    );
  }
  return "";
};

const getListingImages = (listing) => {
  if (!listing) return [];
  const out = [];
  const seen = new Set();
  const add = (value) => {
    const url = extractImageUrl(value);
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  const addFromObject = (imageObj) => {
    if (!imageObj || typeof imageObj !== "object") return;
    // Prefer lighter variants first to keep the WebGL gallery stable with many units.
    add(imageObj.thumbnail);
    add(imageObj.regular);
    add(imageObj.large);
    add(imageObj.original);
    add(imageObj.url);
    add(imageObj.src);
    add(imageObj.href);
  };

  if (Array.isArray(listing.pictures) && listing.pictures.length) {
    listing.pictures.forEach((image) => {
      if (typeof image === "string") {
        add(image);
      } else {
        addFromObject(image);
      }
    });
  } else {
    if (typeof listing.picture === "string") add(listing.picture);
    addFromObject(listing.picture);
  }

  return filterLowQualityImages(out);
};

const getListingImage = (listing) => {
  const images = getListingImages(listing);
  return images[0] || "";
};

const truncateLabel = (value, max = 36) => {
  if (typeof value !== "string") return "";
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
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

const getQuoteNightly = (quoteData, listing, nights) => {
  if (!quoteData || !listing) return null;
  const plansRaw = Array.isArray(quoteData?.rates?.ratePlans)
    ? quoteData.rates.ratePlans
    : quoteData?.rates?.ratePlans
      ? [quoteData.rates.ratePlans]
      : [];
  const plan = plansRaw[0] || {};
  const quoteMoney =
    plan?.money?.money ||
    plan?.money ||
    quoteData?.money?.money ||
    quoteData?.money ||
    {};
  const quoteDays = plan?.days || [];
  const quoteCurrency =
    quoteMoney?.currency || quoteDays[0]?.currency || listing.currency || "USD";
  const quotedNights = Array.isArray(quoteDays) && quoteDays.length > 0 ? quoteDays.length : nights;
  const daySum = Array.isArray(quoteDays)
    ? quoteDays.reduce((sum, day) => {
      const dayPrice =
        (typeof day?.manualPrice === "number" ? day.manualPrice : null) ??
        (typeof day?.price === "number" ? day.price : null) ??
        (typeof day?.basePrice === "number" ? day.basePrice : null);
      return typeof dayPrice === "number" ? sum + dayPrice : sum;
    }, 0)
    : null;
  const quoteTotalRaw =
    quoteMoney?.subTotalPrice ??
    quoteMoney?.totalPrice ??
    quoteMoney?.total ??
    quoteData?.total ??
    quoteData?.price?.total ??
    quoteData?.price?.totalAmount ??
    quoteData?.price?.totalPrice ??
    (typeof quoteData?.price?.total === "object" ? quoteData.price.total.amount : null) ??
    (typeof quoteData?.amount === "number" ? quoteData.amount : null) ??
    (typeof daySum === "number" && quotedNights ? daySum + (listing.cleaningFee || 0) : null);
  const quoteTotal = typeof quoteTotalRaw === "number" ? quoteTotalRaw : null;
  const nightly =
    (quoteTotal && quotedNights ? quoteTotal / quotedNights : undefined) ??
    (typeof daySum === "number" && quotedNights ? daySum / quotedNights : undefined) ??
    (quoteDays[0]?.manualPrice ?? quoteDays[0]?.price ?? quoteDays[0]?.basePrice);
  if (!Number.isFinite(nightly)) return null;
  return { nightly, currency: quoteCurrency };
};

const getListingCurrency = (listing) =>
  listing?.currency ||
  listing?.prices?.currency ||
  listing?.prices?.basePrice?.currency ||
  listing?.prices?.nightly?.currency ||
  "USD";

const normalizeListingCountry = (listing) => {
  const raw = listing?.address?.country || listing?.country || "";
  if (typeof raw !== "string") return "";
  return raw.trim();
};

const formatGalleryLabel = (listing, quotePricing, isLoading) => {
  const isMobileViewport = typeof window !== "undefined" && window.innerWidth <= 640;
  const city = normalizeListingCity(listing);
  const country = normalizeListingCountry(listing);
  const locationRaw = city && country ? `${city}, ${country}` : city || country || "OneLuxStay";
  const locationLabel = truncateLabel(locationRaw, isMobileViewport ? 28 : 34);
  const nightly = quotePricing?.nightly ?? null;
  const currency = quotePricing?.currency || getListingCurrency(listing);
  const priceLabel = nightly
    ? isMobileViewport
      ? `${formatCurrency(nightly, currency)}/night`
      : `${formatCurrency(nightly, currency)} / night`
    : isLoading
      ? "Loading..."
      : "Price on request";
  return [locationLabel, priceLabel].filter(Boolean).join("\n");
};

const BOOKING_STORAGE_KEY = "laBookingFilters";
const readPersistedBooking = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BOOKING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writePersistedBooking = (payload) => {
  if (typeof window === "undefined") return;
  try {
    if (!payload) {
      window.sessionStorage.removeItem(BOOKING_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
};

const parseDate = (value) => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const diffNights = (start, end) => {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return 0;
  const ms = endDate - startDate;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const resolveQuoteRange = (checkIn, checkOut) => {
  const parsedIn = parseDate(checkIn);
  const parsedOut = parseDate(checkOut);
  if (parsedIn && parsedOut) {
    if (parsedOut <= parsedIn) {
      return { checkIn: toISODate(parsedIn), checkOut: toISODate(addDays(parsedIn, 1)) };
    }
    return { checkIn: toISODate(parsedIn), checkOut: toISODate(parsedOut) };
  }
  if (parsedIn) {
    return { checkIn: toISODate(parsedIn), checkOut: toISODate(addDays(parsedIn, 1)) };
  }
  if (parsedOut) {
    return { checkIn: toISODate(addDays(parsedOut, -1)), checkOut: toISODate(parsedOut) };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  return { checkIn: toISODate(today), checkOut: toISODate(tomorrow) };
};

const optimizeLandingImage = (url, width = 1600) => {
  if (!url) return "";
  const value = String(url);
  if (value.includes("images.unsplash.com")) {
    return `${value}&w=${width}&q=72`;
  }
  const marker = "/image/upload/";
  if (value.includes("assets.guesty.com") && value.includes(marker) && !/\/image\/upload\/(?:[^/]*,)?(?:f_|q_|w_)/.test(value)) {
    return value.replace(marker, `${marker}f_auto,q_auto:good,w_${width}/`);
  }
  return value;
};

const heroSlides = [
  optimizeLandingImage(
    "https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1800&auto=format&fit=crop&ixlib=rb-4.1.0",
    1800
  ),
  optimizeLandingImage(
    "https://assets.guesty.com/image/upload/v1729880354/production/666b3af27fc6d5653142b0af/yc51idfkqenc81wnse8n.jpg",
    1400
  ),
  optimizeLandingImage(
    "https://assets.guesty.com/image/upload/v1760535614/production/666b3af27fc6d5653142b0af/t7p3cc6hqez89wsmj1gt.jpg",
    1400
  ),
];
const mobileHeroSlide = optimizeLandingImage(
  "https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1800&auto=format&fit=crop&ixlib=rb-4.1.0",
  960
);

const offers = [
  {
    kicker: "Last-minute",
    headline: "Save 10% on last-minute stays",
    body: "For flexible trips booked close to arrival.",
    cta: "View last-minute stays",
    tone: "sand",
  },
  {
    kicker: "Weekly",
    headline: "Save 10% on weekly stays",
    body: "Available on stays of 7 nights or more.",
    cta: "View weekly stays",
    tone: "sand",
  },
  {
    kicker: "Monthly",
    headline: "Save 20% on monthly stays",
    body: "Available on stays of 30 nights or more.",
    cta: "View monthly stays",
    tone: "clay",
  },
];

const DateRangePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const hasOpenedRef = useRef(false);
  const setOpenState = (nextOpen) => {
    setOpen(nextOpen);
  };
  const checkInLabelId = useId();
  const checkOutLabelId = useId();
  const dialogId = useId();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [view, setView] = useState(() => parseDate(value.checkIn) || today);
  const containerRef = useRef(null);

  const startDate = useMemo(() => parseDate(value.checkIn), [value.checkIn]);
  const endDate = useMemo(() => parseDate(value.checkOut), [value.checkOut]);

  useEffect(() => {
    const handleClick = (e) => {
      if (!open) return;
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      setOpenState(false);
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setOpenState(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, containerRef]);

  useEffect(() => {
    const page = containerRef.current?.closest(".landing-page");
    if (!page) return;
    if (open) {
      page.classList.add("has-date-dropdown");
    } else {
      page.classList.remove("has-date-dropdown");
    }
    return () => {
      page.classList.remove("has-date-dropdown");
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true;
      return;
    }
    if (!hasOpenedRef.current) return;
    if (startDate && !endDate) {
      trackCalendarAbandoned({
        source_page: window.location.pathname + window.location.search,
        source_location: "landing_date_picker",
      });
    }
  }, [open, startDate, endDate]);

  const buildMonth = (baseDate) => {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array(startOffset).fill(null);
    for (let i = 1; i <= daysInMonth; i += 1) cells.push(new Date(year, month, i));
    return { year, month, cells };
  };

  const isSameDay = (a, b) =>
    a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const inRange = (day) => {
    if (!day || !startDate) return false;
    if (startDate && endDate) return day >= startDate && day <= endDate;
    return isSameDay(day, startDate);
  };
  const syncViewToBaseMonth = () => {
    const base = startDate || today;
    setView((prev) => {
      const sameMonth = prev.getFullYear() === base.getFullYear() && prev.getMonth() === base.getMonth();
      return sameMonth ? prev : base;
    });
  };
  const openPicker = () => {
    syncViewToBaseMonth();
    trackAvailabilityOpened({
      source_page: window.location.pathname + window.location.search,
      source_location: "landing_date_picker",
    });
    setOpenState(true);
  };

  const handleDayClick = (day) => {
    if (!day || day < today) return;
    let nextStart = startDate;
    let nextEnd = endDate;
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
    if (nextStart && nextEnd) {
      trackAvailabilitySearch({
        check_in: toISODate(nextStart),
        check_out: toISODate(nextEnd),
        source_page: window.location.pathname + window.location.search,
        source_location: "landing_date_picker",
      });
    }
    if (nextStart && nextEnd) setOpenState(false);
  };

  const primaryMonth = buildMonth(view);
  const secondaryMonth = buildMonth(new Date(view.getFullYear(), view.getMonth() + 1, 1));
  const isMobileMonthHeader = typeof window !== "undefined" && window.innerWidth <= 640;
  const primaryMonthLabel = new Date(primaryMonth.year, primaryMonth.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const secondaryMonthLabel = new Date(secondaryMonth.year, secondaryMonth.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const monthLabel = isMobileMonthHeader
    ? primaryMonthLabel
    : `${primaryMonthLabel} - ${secondaryMonthLabel}`;

  return (
    <div className={`landing-date-picker la-date-picker${open ? " is-open" : ""}`} ref={containerRef}>
      <div className="la-date-grid">
        <div className="la-date-field">
          <label id={checkInLabelId} className="la-date-label">Check-in</label>
          <button
            type="button"
            onClick={openPicker}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkInLabelId}
            aria-label={`Check-in date, ${startDate
              ? startDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : "no date selected"
              }`}
            className="la-date-input"
          >
            {startDate ? startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Add date"}
          </button>
        </div>
        <div className="la-date-field">
          <label id={checkOutLabelId} className="la-date-label">Check-out</label>
          <button
            type="button"
            onClick={openPicker}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkOutLabelId}
            aria-label={`Check-out date, ${endDate
              ? endDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : "no date selected"
              }`}
            className="la-date-input"
          >
            {endDate ? endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Add date"}
          </button>
        </div>
      </div>

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-label="Choose dates"
          className="listing-date-dropdown landing-date-dropdown"
        >
          <div className="la-date-header">
            <div className="la-date-title">{monthLabel}</div>
            <div className="la-date-nav">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="la-date-nav-btn"
              >
                {"<"}
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="la-date-nav-btn"
              >
                {">"}
              </button>
            </div>
          </div>
          <div className="la-date-body">
            <div className="la-date-months">
              {[primaryMonth, secondaryMonth].map((monthObj) => (
                <div key={`${monthObj.year}-${monthObj.month}`} className="la-date-month">
                  <div className="la-date-month-title">
                    {new Date(monthObj.year, monthObj.month, 1).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                  <div className="la-date-week" role="row">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} role="columnheader">{d}</div>
                    ))}
                  </div>
                  <div className="la-date-days" role="grid">
                    {monthObj.cells.map((day, idx) => {
                      const disabled = !day || day < today;
                      const selected = (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
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
                          key={`${monthObj.year}-${monthObj.month}-${idx}`}
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
                            <span className="listing-date-cell__day">{day.getDate()}</span>
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
                onClick={() => setOpenState(false)}
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

const BusinessAccommodationsDeal = ({ onExplore }) => {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof window === "undefined") return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    if (window.matchMedia("(max-width: 640px)").matches) return undefined;
    const cards = Array.from(list.querySelectorAll(".landing-business-card"));
    if (!cards.length) return undefined;

    let rafId = 0;
    const update = () => {
      rafId = 0;
      const viewportHeight = window.innerHeight;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        if (rect.bottom < -120 || rect.top > viewportHeight + 120) return;
        const progress = (rect.top + rect.height / 2 - viewportHeight / 2) / viewportHeight;
        const depth = index % 2 === 0 ? 30 : 46;
        card.style.setProperty("--card-parallax", `${(-progress * depth).toFixed(1)}px`);
      });
    };
    const requestUpdate = () => {
      if (!rafId) rafId = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  return (
    <section
      id="business-accommodations"
      className="landing-business-section landing-animate"
      aria-labelledby="landing-business-deal-title"
    >
      <div className="landing-business-section__inner landing-business-deal__copy px-6 md:px-10">
        <p className="landing-business-deal__eyebrow">Business accommodations</p>
        <h2 id="landing-business-deal-title">
          Stays built for teams, assignments, and essential work.
        </h2>
        <p className="landing-business-deal__body">
          Extended-stay comfort, direct booking support, and serviced residences for the people keeping projects,
          relocations, productions, and critical work moving.
        </p>
      </div>
      <ul className="landing-business-deal__list" aria-label="Business stay categories" ref={listRef}>
        {BUSINESS_ACCOMMODATION_DEALS.map((deal) => (
          <li key={deal.label}>
            <Link
              className="landing-business-card"
              to={deal.to}
              onMouseEnter={() => prefetchRouteByPath(deal.to)}
              onFocus={() => prefetchRouteByPath(deal.to)}
              onClick={() =>
                trackCtaClick({
                  ctaText: deal.label,
                  location: "landing_business_accommodations",
                  sourcePage: window.location.pathname + window.location.search,
                })
              }
            >
              <img
                src={optimizeLandingImage(deal.image, 960)}
                srcSet={`${optimizeLandingImage(deal.image, 480)} 480w, ${optimizeLandingImage(deal.image, 960)} 960w`}
                sizes="(max-width: 640px) 68vw, 20vw"
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span className="landing-business-card__shade" aria-hidden="true" />
              <span className="landing-business-card__text">
                <strong>{deal.label}</strong>
                <em>{deal.blurb}</em>
                <span className="landing-business-card__go" aria-hidden="true">Explore &rarr;</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="landing-business-deal__actions">
        <button type="button" className="landing-business-deal__cta" onClick={onExplore}>
          Explore business-ready stays
        </button>
      </div>
    </section>
  );
};

function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  );
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 640px)").matches : false
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
  );
  const [enableHeroEnhancements, setEnableHeroEnhancements] = useState(false);
  const [destination, setDestination] = useState("All");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [rooms, setRooms] = useState(1);
  const [galleryListings, setGalleryListings] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [quotePricing, setQuotePricing] = useState({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [apaleoProperties, setApaleoProperties] = useState([]);
  const [apaleoPropertiesLoading, setApaleoPropertiesLoading] = useState(true);
  const [apaleoPropertiesError, setApaleoPropertiesError] = useState("");
  const [showGalleryHint, setShowGalleryHint] = useState(true);
  const hasDismissedGalleryHintRef = useRef(false);
  const offersSwipeRef = useRef(null);
  const offersRef = useRef(null);
  const offersTrackRef = useRef(null);
  const collectionRef = useRef(null);
  const [isHeroPaused, setIsHeroPaused] = useState(false);
  const [shouldRenderCollectionGrid, setShouldRenderCollectionGrid] = useState(() =>
    typeof window !== "undefined" ? !window.matchMedia("(max-width: 640px)").matches : true
  );
  const isOffersDraggingRef = useRef(false);
  const offersDragStartXRef = useRef(0);
  const offersDragStartTranslateRef = useRef(0);
  const offersDragMovedRef = useRef(false);
  const offersLastXRef = useRef(0);
  const offersLastTimeRef = useRef(0);
  const offersVelocityRef = useRef(0);
  const offersTrackXRef = useRef(0);
  const offersBaseWidthRef = useRef(0);
  const offersTargetXRef = useRef(null);
  const offersRafRef = useRef(null);
  const patienceQuotes = [
    "We are working on this. ?Greatest things come to those who wait.?",
    "We are working on this. ?Patience is not the ability to wait, but the ability to keep a good attitude while waiting.?",
    "We are working on this. ?All things are difficult before they are easy.?",
    "We are working on this. ?The two most powerful warriors are patience and time.?",
    "We are working on this. ?Slow and steady wins the race.?",
  ];
  const [cityNoticeIndex, setCityNoticeIndex] = useState(0);
  const [cityNotice, setCityNotice] = useState("");
  const loopedOffers = useMemo(() => [...offers, ...offers, ...offers], []);
  const shouldUseHeroEnhancements = enableHeroEnhancements && !prefersReducedMotion;
  const shouldLoadHeroGallery =
    HOMEPAGE_HERO_GALLERY_ENABLED && shouldUseHeroEnhancements && isDesktopViewport;
  const displayedHeroSlides = shouldUseHeroEnhancements
    ? heroSlides
    : [isMobileViewport ? mobileHeroSlide : heroSlides[0]];
  const shouldUseInteractiveOffers = !isMobileViewport;
  const offersToRender = shouldUseInteractiveOffers ? loopedOffers : offers;

  const apaleoCityOptions = useMemo(() => {
    const cities = [...new Set(apaleoProperties.map(normalizeApaleoCity).filter(Boolean))];
    return ["All", ...cities.sort((a, b) => a.localeCompare(b))];
  }, [apaleoProperties]);

  const apaleoPropertyItems = useMemo(() => apaleoProperties
    .filter((property) => property?.isArchived !== true && property?.status !== "Test")
    .map((property) => {
      const city = normalizeApaleoCity(property);
      const citySlug = citySlugFromName(city);
      const listingId = property?.localListingId || "";
      const href = listingId && citySlug
        ? `/${citySlug}/listing/${encodeURIComponent(listingId)}`
        : citySlug ? `/${citySlug}` : "/global";
      const location = [property?.location?.city || property?.city, property?.location?.countryCode || property?.country]
        .filter(Boolean)
        .join(", ");
      return {
        title: cleanApaleoPropertyName(property?.title || property?.description),
        subtitle: property?.description || location || "Live Apaleo property",
        href,
        image: property?.coverImage || property?.images?.[0] || PROPERTY_FALLBACK_IMAGES[city] || heroSlides[0],
        propertyId: property?.id,
        propertyCode: property?.code,
        kicker: `${property?.code || property?.id} · Apaleo live`,
        city,
      };
    }), [apaleoProperties]);

  const homepageDestinations = useMemo(() =>
    apaleoCityOptions.filter((city) => city !== "All"), [apaleoCityOptions]);
  const visibleHomepageDestinations = homepageDestinations.length
    ? homepageDestinations
    : HERO_CITY_SHORTCUTS;

  useEffect(() => {
    let active = true;
    const loadApaleoProperties = async () => {
      setApaleoPropertiesLoading(true);
      setApaleoPropertiesError("");
      try {
        const response = await fetch(`${apiBase}/api-booking-properties`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.message || "Unable to load Apaleo properties.");
        if (active) setApaleoProperties(Array.isArray(payload?.properties) ? payload.properties : []);
      } catch (error) {
        if (active) {
          setApaleoProperties([]);
          setApaleoPropertiesError(error?.message || "Unable to load Apaleo properties.");
        }
      } finally {
        if (active) setApaleoPropertiesLoading(false);
      }
    };
    loadApaleoProperties();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const mobileQuery = window.matchMedia("(max-width: 640px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setIsDesktopViewport(desktopQuery.matches);
      setIsMobileViewport(mobileQuery.matches);
      setPrefersReducedMotion(motionQuery.matches);
    };
    sync();
    desktopQuery.addEventListener?.("change", sync);
    mobileQuery.addEventListener?.("change", sync);
    motionQuery.addEventListener?.("change", sync);
    return () => {
      desktopQuery.removeEventListener?.("change", sync);
      mobileQuery.removeEventListener?.("change", sync);
      motionQuery.removeEventListener?.("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopViewport || prefersReducedMotion) {
      setEnableHeroEnhancements(false);
      return undefined;
    }
    let cancelled = false;
    const activate = () => {
      if (!cancelled) setEnableHeroEnhancements(true);
    };
    let idleId = null;
    let timerId = null;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(activate, { timeout: 1800 });
    } else {
      timerId = window.setTimeout(activate, 1000);
    }
    return () => {
      cancelled = true;
      if (idleId !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
    };
  }, [isDesktopViewport, prefersReducedMotion]);

  const galleryItems = useMemo(() => {
    if (!galleryListings.length) return [];

    return galleryListings
      .map((listing) => {
        const listingId = getListingId(listing);
        if (!listingId) return null;
        const city = normalizeListingCity(listing);
        const cityParam = city ? city.split(",")[0].trim() : "";
        const params = new URLSearchParams();
        params.set("listingId", listingId);
        if (cityParam) params.set("city", cityParam);
        if (checkIn) params.set("checkIn", checkIn);
        if (checkOut) params.set("checkOut", checkOut);
        if (guests) {
          params.set("guests", String(guests));
          params.set("adults", String(guests));
        }
        if (rooms) params.set("rooms", String(rooms));
        const query = params.toString();
        const citySlug = citySlugFromName(cityParam || city);
        const basePath = citySlug ? `/${citySlug}/listing/${encodeURIComponent(listingId)}` : "/listings";
        const hash = citySlug ? "" : "#listings";
        const href = `${basePath}${query ? `?${query}` : ""}${hash}`;

        return {
          image: getListingImage(listing),
          text: formatGalleryLabel(listing, quotePricing[listingId], quoteLoading),
          city: cityParam || city || "",
          listingId,
          title: listing?.title || listing?.nickname || "One Lux Stay unit",
          href,
        };
      })
      .filter((item) => item?.image && item?.href);
  }, [galleryListings, checkIn, checkOut, guests, rooms, quotePricing, quoteLoading]);
  const hasDesktopGallery = galleryItems.length > 0;

  const cityRoutes = {
    Antwerp: "/antwerp",
    Hollywood: "/hollywood",
    "Los Angeles": "/losangeles",
    "Redondo Beach": "/redondo-beach",
    Dubai: "/dubai",
  };
  const formatCityLabel = (city) => CITY_DISPLAY_LABELS[city] || city;
  const prefetchCityByName = (city) => {
    const route = cityRoutes[city];
    if (!route) return;
    prefetchCityRoute(route);
  };

  const handleCityClick = (city) => {
    const route = cityRoutes[city];
    if (route) {
      setCityNotice("");
      prefetchCityRoute(route);
      trackCityView({
        cityName: city,
        sourcePage: window.location.pathname + window.location.search,
        destinationCity: city,
      });
      trackGuestCityClick({
        city,
        destinationPath: route,
        sourceSection: "hero_shortcuts",
        sourceLabel: "landing_chip",
      });
      navigate(route);
      return;
    }
    const next = (cityNoticeIndex + 1) % patienceQuotes.length;
    setCityNoticeIndex(next);
    setCityNotice(patienceQuotes[next]);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const checkoutState = params.get("checkout") || "";
    const sessionId = params.get("session_id") || params.get("sessionId") || "";
    if (checkoutState !== "success" || !sessionId) return;
    const redirectParams = new URLSearchParams();
    redirectParams.set("checkout", "success");
    redirectParams.set("session_id", sessionId);
    navigate(`/booking-confirmation?${redirectParams.toString()}`, { replace: true });
  }, [location.search, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const destinationParam = params.get("city") || params.get("destination") || "";
    const checkInParam = params.get("checkIn") || "";
    const checkOutParam = params.get("checkOut") || "";
    const guestsParam = params.get("guests") || params.get("adults") || "";
    const roomsParam = params.get("rooms") || "";
    const persisted = readPersistedBooking();
    const nextDestination = destinationParam || persisted?.destination || "All";
    setDestination(/miami/i.test(nextDestination) ? "All" : nextDestination);
    setCheckIn(checkInParam || persisted?.checkIn || "");
    setCheckOut(checkOutParam || persisted?.checkOut || "");
    setGuests(guestsParam ? Number(guestsParam) || 1 : persisted?.guests || 1);
    setRooms(roomsParam ? Number(roomsParam) || 1 : persisted?.rooms || 1);
  }, [location.search]);

  useEffect(() => {
    writePersistedBooking({
      destination,
      checkIn,
      checkOut,
      guests,
      rooms,
    });
  }, [destination, checkIn, checkOut, guests, rooms]);

  useEffect(() => {
    if (!shouldLoadHeroGallery) {
      setGalleryListings([]);
      setGalleryLoading(false);
      return undefined;
    }
    let active = true;
    const loadGalleryListings = async () => {
      setGalleryLoading(true);
      try {
        const res = await fetch(`${apiBase}/listings`);
        if (!res.ok) throw new Error("Unable to load listings.");
        const json = await res.json();
        const results = Array.isArray(json?.results) ? json.results : [];
        const parentResults = results
          .filter((listing) => isListingActiveForShowcase(listing))
          .filter((listing) => !isHiddenUnit(listing))
          .filter((listing) => !isChildListing(listing));
        const seen = new Set();
        const allUnits = [];
        parentResults.forEach((listing) => {
          const id = getListingId(listing);
          const image = getListingImage(listing);
          if (!id || !image) return;
          if (seen.has(id)) return;
          seen.add(id);
          allUnits.push(listing);
        });
        allUnits.sort((a, b) => {
          const cityA = normalizeListingCity(a) || "Unknown";
          const cityB = normalizeListingCity(b) || "Unknown";
          if (cityA !== cityB) return cityA.localeCompare(cityB);
          return (a?.title || "").localeCompare(b?.title || "");
        });
        if (active) {
          setGalleryListings(allUnits);
        }
      } catch {
        if (active) setGalleryListings([]);
      } finally {
        if (active) setGalleryLoading(false);
      }
    };

    loadGalleryListings();
    return () => {
      active = false;
    };
  }, [shouldLoadHeroGallery]);

  const normalizeOffersX = useCallback((value) => {
    const base = offersBaseWidthRef.current;
    if (!base) return value;
    let next = value;
    while (next <= -2 * base) next += base;
    while (next >= 0) next -= base;
    return next;
  }, []);

  const applyOffersTranslate = useCallback((value) => {
    const next = normalizeOffersX(value);
    offersTrackXRef.current = next;
    if (offersTrackRef.current) {
      offersTrackRef.current.style.transform = `translate3d(${next}px, 0, 0)`;
    }
  }, [normalizeOffersX]);

  const getOffersStep = useCallback(() => {
    const track = offersTrackRef.current;
    if (!track) return null;
    const card = track.querySelector(".landing-offer-card");
    if (!card) return null;
    const styles = window.getComputedStyle(track);
    const gapValue = styles.columnGap || styles.gap || "0";
    const gap = Number.parseFloat(gapValue) || 0;
    const width = card.getBoundingClientRect().width;
    if (!Number.isFinite(width) || width <= 0) return null;
    return width + gap;
  }, []);

  useEffect(() => {
    if (!shouldUseInteractiveOffers) return undefined;
    const track = offersTrackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const total = track.scrollWidth;
      if (!Number.isFinite(total) || total <= 0) return;
      const base = total / 3;
      offersBaseWidthRef.current = base;
      if (!offersTrackXRef.current) {
        offersTrackXRef.current = -base;
      }
      applyOffersTranslate(offersTrackXRef.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [applyOffersTranslate, shouldUseInteractiveOffers]);

  const startOffersRaf = () => {
    if (!shouldUseInteractiveOffers) return;
    if (offersRafRef.current) return;
    offersLastTimeRef.current = performance.now();
    const tick = (now) => {
      const dt = now - offersLastTimeRef.current || 16;
      offersLastTimeRef.current = now;
      const friction = Math.pow(0.92, dt / 16);

      if (!isOffersDraggingRef.current) {
        if (offersTargetXRef.current !== null) {
          const diff = offersTargetXRef.current - offersTrackXRef.current;
          const step = diff * 0.12;
          applyOffersTranslate(offersTrackXRef.current + step);
          if (Math.abs(diff) < 0.5) {
            offersTargetXRef.current = null;
          }
        } else {
          offersVelocityRef.current *= friction;
          if (Math.abs(offersVelocityRef.current) < 0.0005) offersVelocityRef.current = 0;
          if (offersVelocityRef.current) {
            applyOffersTranslate(offersTrackXRef.current + offersVelocityRef.current * dt);
          }
        }
      }

      if (isOffersDraggingRef.current || offersVelocityRef.current || offersTargetXRef.current !== null) {
        offersRafRef.current = requestAnimationFrame(tick);
      } else {
        offersRafRef.current = null;
      }
    };
    offersRafRef.current = requestAnimationFrame(tick);
  };

  const getOffersSnapTarget = useCallback(
    (directionBias = 0) => {
      const base = offersBaseWidthRef.current;
      const step = getOffersStep();
      if (!base || !step) return null;
      const current = normalizeOffersX(offersTrackXRef.current);
      const relative = current + base;
      let index = Math.round(-relative / step);
      if (directionBias) index += directionBias;
      return -base - index * step;
    },
    [getOffersStep, normalizeOffersX],
  );

  useEffect(() => {
    if (!shouldLoadHeroGallery) {
      setQuotePricing({});
      setQuoteLoading(false);
      return undefined;
    }
    if (!galleryListings.length) {
      setQuotePricing({});
      setQuoteLoading(false);
      return undefined;
    }
    const { checkIn: quoteCheckIn, checkOut: quoteCheckOut } = resolveQuoteRange(checkIn, checkOut);
    const nights = diffNights(quoteCheckIn, quoteCheckOut);
    if (!nights) {
      setQuotePricing({});
      setQuoteLoading(false);
      return;
    }
    let active = true;
    const requestController = new AbortController();
    setQuoteLoading(true);
    const loadQuotes = async () => {
      try {
        const requests = galleryListings
          .map((listing) => {
            const listingId = getListingId(listing);
            if (!listingId) return null;
            return {
              listingId,
              checkInDateLocalized: quoteCheckIn,
              checkOutDateLocalized: quoteCheckOut,
              guestsCount: Number(guests) || 1,
            };
          })
          .filter(Boolean);
        if (!requests.length) {
          if (active) {
            setQuotePricing({});
            setQuoteLoading(false);
          }
          return;
        }
        const BATCH_SIZE = 35;
        const results = {};
        for (let index = 0; index < requests.length; index += BATCH_SIZE) {
          const batch = requests.slice(index, index + BATCH_SIZE);
          const res = await fetch(`${apiBase}/check-units/reservations/quotes-bulk`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requests: batch }),
            signal: requestController.signal,
          });
          if (!res.ok) continue;
          const data = await res.json();
          const batchResults = data?.results || {};
          Object.assign(results, batchResults);
        }
        const listingMap = new Map(
          galleryListings.map((listing) => [getListingId(listing), listing]),
        );
        const pricingMap = {};
        requests.forEach((req) => {
          const listing = listingMap.get(req.listingId);
          const quoteData = results?.[req.listingId];
          const pricing = listing ? getQuoteNightly(quoteData, listing, nights) : null;
          if (pricing) pricingMap[req.listingId] = pricing;
        });
        if (active) setQuotePricing(pricingMap);
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (active) setQuotePricing({});
      } finally {
        if (active) setQuoteLoading(false);
      }
    };
    loadQuotes();
    return () => {
      active = false;
      requestController.abort();
      setQuoteLoading(false);
    };
  }, [galleryListings, checkIn, checkOut, guests, shouldLoadHeroGallery]);

  useEffect(() => {
    if (isMobileViewport || prefersReducedMotion) return undefined;
    const swipeContainer = offersSwipeRef.current;
    const offersContainer = offersRef.current;
    if (!swipeContainer || !offersContainer) return undefined;
    let animation = null;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        import("lottie-web")
          .then((module) => {
            if (cancelled || !offersSwipeRef.current) return;
            const lottieLib = module?.default || module;
            animation = lottieLib.loadAnimation({
              container: offersSwipeRef.current,
              renderer: "svg",
              loop: true,
              autoplay: true,
              path: "/Swipe.json",
            });
          })
          .catch(() => {});
      },
      { threshold: 0.2 }
    );
    observer.observe(offersContainer);
    return () => {
      cancelled = true;
      observer.disconnect();
      if (animation?.destroy) animation.destroy();
    };
  }, [isMobileViewport, prefersReducedMotion]);

  useEffect(() => {
    if (!isMobileViewport) {
      setShouldRenderCollectionGrid(true);
      return undefined;
    }
    setShouldRenderCollectionGrid(false);
    const target = collectionRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setShouldRenderCollectionGrid(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShouldRenderCollectionGrid(true);
          observer.disconnect();
        }
      },
      { rootMargin: "260px 0px", threshold: 0.01 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isMobileViewport]);

  const dismissGalleryHint = useCallback(() => {
    if (hasDismissedGalleryHintRef.current) return;
    hasDismissedGalleryHintRef.current = true;
    setShowGalleryHint(false);
  }, []);

  const handleGallerySelect = useCallback((index) => {
    const selected = galleryItems[index];
    if (!selected?.href) return;
    trackGuestListingClick({
      city: selected.city || "",
      listingId: selected.listingId || "",
      listingTitle: selected.title || "",
      destinationPath: selected.href,
      sourceSection: "hero_featured_units",
      sourceLabel: "circular_gallery",
    });
    prefetchRouteByPath(selected.href);
    navigate(selected.href);
  }, [galleryItems, navigate]);

  const handleOffersPointerDown = (event) => {
    if (!shouldUseInteractiveOffers) return;
    const container = offersRef.current;
    if (!container) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.pointerType === "mouse") event.preventDefault();
    if (offersRafRef.current) {
      cancelAnimationFrame(offersRafRef.current);
      offersRafRef.current = null;
    }
    offersTargetXRef.current = null;
    isOffersDraggingRef.current = true;
    offersDragMovedRef.current = false;
    offersDragStartXRef.current = event.clientX;
    offersDragStartTranslateRef.current = offersTrackXRef.current;
    offersLastXRef.current = event.clientX;
    offersLastTimeRef.current = performance.now();
    offersVelocityRef.current = 0;
    container.classList.add("is-dragging");
    container.setPointerCapture?.(event.pointerId);
  };

  const handleOffersPointerMove = (event) => {
    if (!shouldUseInteractiveOffers) return;
    if (!isOffersDraggingRef.current) return;
    const delta = event.clientX - offersDragStartXRef.current;
    if (Math.abs(delta) > 6) offersDragMovedRef.current = true;
    applyOffersTranslate(offersDragStartTranslateRef.current + delta);
    const now = performance.now();
    const dt = now - offersLastTimeRef.current || 1;
    const dx = event.clientX - offersLastXRef.current;
    offersVelocityRef.current = dx / dt;
    offersLastXRef.current = event.clientX;
    offersLastTimeRef.current = now;
  };

  const handleOffersPointerUp = (event) => {
    if (!shouldUseInteractiveOffers) return;
    const container = offersRef.current;
    if (container) {
      container.classList.remove("is-dragging");
      container.releasePointerCapture?.(event.pointerId);
    }
    isOffersDraggingRef.current = false;
    const velocity = offersVelocityRef.current;
    const bias = Math.abs(velocity) > 0.35 ? (velocity < 0 ? 1 : -1) : 0;
    const target = getOffersSnapTarget(bias);
    if (target !== null) {
      offersTargetXRef.current = target;
      offersVelocityRef.current = 0;
    }
    startOffersRaf();
  };

  const handleOffersClickCapture = (event) => {
    if (!shouldUseInteractiveOffers) return;
    if (offersDragMovedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      offersDragMovedRef.current = false;
    }
  };

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll(".landing-animate"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { threshold: 0.18 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToCollection = useCallback(() => {
    const target = document.getElementById("collection");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleBusinessDealExplore = useCallback(() => {
    trackCtaClick({
      ctaText: "explore business-ready stays",
      location: "landing_business_accommodations",
      sourcePage: window.location.pathname + window.location.search,
    });
    trackGuestJourneyEvent({
      eventType: "cta_click",
      destinationPath: "#collection",
      sourceSection: "hero_business_accommodations",
      sourceLabel: "explore_business_ready_stays",
    });
    scrollToCollection();
  }, [scrollToCollection]);

  const handleHeroSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    const cityParam = destination && destination !== "All" ? destination : "";
    if (cityParam) params.set("city", cityParam);
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    if (guests) {
      params.set("guests", String(guests));
      params.set("adults", String(guests));
    }
    if (rooms) params.set("rooms", String(rooms));
    const query = params.toString();
    const targetRoute = (() => {
      if (cityParam === "Hollywood") return "/hollywood";
      if (cityParam === "Los Angeles") return "/losangeles";
      if (cityParam === "Antwerp") return "/antwerp";
      if (cityParam === "Redondo Beach") return "/redondo-beach";
      if (cityParam === "Dubai") return "/dubai";
      return "/global";
    })();
    const hash = targetRoute === "/listings" ? "#listings" : "";
    trackAvailabilitySearch({
      city: cityParam,
      check_in: checkIn,
      check_out: checkOut,
      guests: Number(guests) || 1,
      rooms: Number(rooms) || 1,
      source_page: window.location.pathname + window.location.search,
      destination_path: `${targetRoute}${query ? `?${query}` : ""}${hash}`,
      source_location: "landing_booking_form",
    });
    trackBookingStart({
      city: cityParam,
      check_in: checkIn,
      check_out: checkOut,
      guests: Number(guests) || 1,
      rooms: Number(rooms) || 1,
      source_page: window.location.pathname + window.location.search,
      destination_path: `${targetRoute}${query ? `?${query}` : ""}${hash}`,
    });
    trackCtaClick({
      ctaText: "book",
      location: "landing_booking_form",
      sourcePage: window.location.pathname + window.location.search,
      city: cityParam,
    });
    trackGuestJourneyEvent({
      eventType: "search_submit",
      city: cityParam,
      destinationPath: `${targetRoute}${query ? `?${query}` : ""}${hash}`,
      sourceSection: "hero_booking_form",
      sourceLabel: "book_button",
    });
    prefetchRouteByPath(targetRoute);
    navigate(`${targetRoute}${query ? `?${query}` : ""}${hash}`);
  };

  const mobileDestinationLabel = "Destination...";

  return (
    <div className="landing-page text-white has-silk">
      <div className="landing-silk" aria-hidden="true">
        {shouldUseHeroEnhancements ? (
          <Suspense fallback={<div className="silk-background silk-background--fallback" />}>
            <Silk speed={4.5} scale={1.1} color="#b5a291" noiseIntensity={1.2} rotation={0.15} />
          </Suspense>
        ) : (
          <div className="silk-background silk-background--fallback" />
        )}
      </div>
      <div className="landing-silk-overlay" aria-hidden="true" />
      <header id="hero" className="landing-hero relative landing-animate">
        {isMobileViewport ? (
          <div aria-hidden="true" className="hero-media hero-media__static">
            <img
              src={mobileHeroSlide}
              alt=""
              width="1440"
              height="960"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="hero-media__static-image"
            />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="hero-media hero-media__slideshow"
            style={{ "--slide-count": displayedHeroSlides.length, "--slide-duration": "6s" }}
          >
            {displayedHeroSlides.map((src, idx) => (
              <div
                key={src}
                className={`hero-slide${isHeroPaused ? " is-paused" : ""}`}
                style={{ backgroundImage: `url(${src})`, "--slide-delay": `${idx * 6}s` }}
              />
            ))}
          </div>
        )}
        <div className="hero-media__overlay" aria-hidden="true" />
        {!isMobileViewport && (
          <div className="landing-hero-inner landing-hero-desktop">
          <div className="landing-logo-mark">OneLuxStay</div>
          <p className="landing-kicker landing-hero-kicker">The art of comfortable stays</p>
          <h1 className="landing-display landing-hero-title">
            Experience Timeless Elevated Living
          </h1>
          <p className="landing-hero-lead">
            Live availability across {visibleHomepageDestinations.map(formatCityLabel).join(", ")}, powered by Apaleo.
          </p>

          <div className="landing-chip-row" data-tour-target="destination-shortcuts">
            {visibleHomepageDestinations.map((city) => (
              <button
                key={city}
                type="button"
                className={`landing-chip${cityRoutes[city] ? "" : " landing-chip--disabled"}`}
                onClick={() => handleCityClick(city)}
                onMouseEnter={() => prefetchCityByName(city)}
                onFocus={() => prefetchCityByName(city)}
              >
                {formatCityLabel(city)}
              </button>
            ))}
          </div>
          {cityNotice && (
            <div className="landing-chip-notice" role="status" aria-live="polite">
              {cityNotice}
            </div>
          )}

          <form className="landing-hero-form glass" data-tour-target="booking-island" onSubmit={handleHeroSubmit}>
            <div className="landing-form-field">
              <label htmlFor="landing-destination-desktop">Destination</label>
              <select
                id="landing-destination-desktop"
                value={destination}
                onChange={(e) => {
                  const next = e.target.value;
                  setDestination(next);
                  prefetchCityByName(next);
                }}
              >
                {(apaleoCityOptions.length > 1 ? apaleoCityOptions : ["All", ...HERO_CITY_SHORTCUTS]).map((c) => (
                  <option key={c} value={c}>
                    {c === "All" ? "All destinations" : formatCityLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="landing-form-field">
              <DateRangePicker
                value={{ checkIn, checkOut }}
                onChange={(next) => {
                  setCheckIn(next.checkIn);
                  setCheckOut(next.checkOut);
                }}
              />
            </div>
            <div className="landing-form-field">
              <label htmlFor="landing-guests-desktop">Guests</label>
              <select
                id="landing-guests-desktop"
                value={guests}
                onChange={(e) => {
                  const next = Number(e.target.value) || 1;
                  setGuests(next);
                  trackGuestCountChanged({
                    field: "guests",
                    value: String(next),
                    source_page: window.location.pathname + window.location.search,
                    source_location: "landing_desktop_form",
                  });
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="landing-cta-primary w-full md:w-auto">Book</button>
          </form>

          {shouldLoadHeroGallery && (
            <>
              <div
                className={`landing-circular-gallery__hint-row${showGalleryHint ? "" : " is-hidden"}`}
                aria-hidden="true"
              >
              </div>
              <section
                className="landing-circular-gallery landing-circular-gallery--hero"
                data-tour-target="featured-units"
                aria-label="Featured city stays"
                onPointerDown={dismissGalleryHint}
                onTouchStart={dismissGalleryHint}
              >
              <Suspense
                fallback={
                  <div className="landing-circular-gallery__loading" role="status" aria-live="polite">
                    <span>Loading curated stays...</span>
                  </div>
                }
              >
                <CircularGallery
                  items={galleryItems}
                  bend={0}
                  borderRadius={0.08}
                  textColor="#46372e"
                  font="700 20px 'Work Sans', sans-serif"
                  onSelect={handleGallerySelect}
                  useFallback={!hasDesktopGallery}
                  wave={0}
                  tiltStrength={0.14}
                  cardWidth={230}
                  cardHeight={300}
                  enableWheelInteraction
                  autoScrollSpeed={0.03}
                />
              </Suspense>
              
            </section>
            </>
          )}
        </div>
        )}

        {isMobileViewport && (
          <div className="landing-hero-inner ols-booking-shell landing-hero-mobile">
          <div className="ols-booking-topbar">
            <div className="landing-logo-mark">ONELUXSTAY</div>
          </div>

          <div className="ols-booking-headline">
            <h1 className="landing-display landing-hero-title">Find your next stay</h1>
            <p className="landing-hero-lead">
              Search curated penthouses, skyline suites, and modern serviced homes across OneLuxStay cities.
            </p>
          </div>

          <form className="ols-booking-card" data-tour-target="booking-island" onSubmit={handleHeroSubmit}>
            <div className="ols-booking-field ols-booking-field--destination" data-tour-target="destination-shortcuts">
              <label className="ols-booking-label" htmlFor="landing-destination-mobile">Destination</label>
              <div className="ols-booking-input-wrap">
                <span className="ols-booking-search-icon" aria-hidden="true">⌕</span>
                <select
                  id="landing-destination-mobile"
                  className="ols-booking-destination-select"
                  value={destination}
                  aria-label="Destination"
                  onChange={(e) => {
                    const next = e.target.value;
                    setDestination(next);
                    prefetchCityByName(next);
                  }}
                >
                  {(apaleoCityOptions.length > 1 ? apaleoCityOptions : ["All", ...HERO_CITY_SHORTCUTS]).map((city) => (
                    <option key={city} value={city}>
                      {city === "All" ? mobileDestinationLabel : formatCityLabel(city)}
                    </option>
                  ))}
                </select>
                {destination !== "All" && (
                  <button
                    type="button"
                    className="ols-booking-clear-btn"
                    aria-label="Clear destination"
                    onClick={() => setDestination("All")}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <DateRangePicker
              value={{ checkIn, checkOut }}
              onChange={(next) => {
                setCheckIn(next.checkIn);
                setCheckOut(next.checkOut);
              }}
            />

            <div className="ols-booking-occupancy" role="group" aria-label="Guests and rooms">
              <div className="ols-booking-guest-field">
                <label id="landing-guests-mobile">Guest/s</label>
                <div className="ols-booking-stepper" role="group" aria-labelledby="landing-guests-mobile">
                  <button
                    type="button"
                    className="ols-booking-stepper-btn"
                    aria-label="Decrease guests"
                    onClick={() =>
                      setGuests((prev) => {
                        const next = Math.max(1, prev - 1);
                        trackGuestCountChanged({
                          field: "guests",
                          value: String(next),
                          source_page: window.location.pathname + window.location.search,
                          source_location: "landing_mobile_stepper",
                        });
                        return next;
                      })
                    }
                  >
                    -
                  </button>
                  <output className="ols-booking-stepper-value" aria-live="polite">{guests}</output>
                  <button
                    type="button"
                    className="ols-booking-stepper-btn"
                    aria-label="Increase guests"
                    onClick={() =>
                      setGuests((prev) => {
                        const next = Math.min(8, prev + 1);
                        trackGuestCountChanged({
                          field: "guests",
                          value: String(next),
                          source_page: window.location.pathname + window.location.search,
                          source_location: "landing_mobile_stepper",
                        });
                        return next;
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="ols-booking-guest-field">
                <label id="landing-rooms-mobile">Rooms</label>
                <div className="ols-booking-stepper" role="group" aria-labelledby="landing-rooms-mobile">
                  <button
                    type="button"
                    className="ols-booking-stepper-btn"
                    aria-label="Decrease rooms"
                    onClick={() =>
                      setRooms((prev) => {
                        const next = Math.max(1, prev - 1);
                        trackGuestCountChanged({
                          field: "rooms",
                          value: String(next),
                          source_page: window.location.pathname + window.location.search,
                          source_location: "landing_mobile_stepper",
                        });
                        return next;
                      })
                    }
                  >
                    -
                  </button>
                  <output className="ols-booking-stepper-value" aria-live="polite">{rooms}</output>
                  <button
                    type="button"
                    className="ols-booking-stepper-btn"
                    aria-label="Increase rooms"
                    onClick={() =>
                      setRooms((prev) => {
                        const next = Math.min(5, prev + 1);
                        trackGuestCountChanged({
                          field: "rooms",
                          value: String(next),
                          source_page: window.location.pathname + window.location.search,
                          source_location: "landing_mobile_stepper",
                        });
                        return next;
                      })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" className="ols-booking-search-btn">Search</button>
          </form>

          <div className="ols-booking-fillers" aria-label="Booking highlights">
            <article className="ols-booking-promo" aria-label="Long stay savings">
              <div>
                <h2>Unlock savings on long stays</h2>
                <p>Book for more than 7 days, direct-booking rates, and concierge support in every destination.</p>
              </div>
              <button type="button" className="ols-booking-promo__cta" onClick={scrollToCollection}>
                Explore signature stays
              </button>
            </article>
          </div>
          </div>
        )}
      </header>

      <BusinessAccommodationsDeal onExplore={handleBusinessDealExplore} />

      <section
        id="offers"
        className="landing-offers-section landing-animate"
        aria-labelledby="landing-offers-title"
      >
        <div className="landing-offers-inner px-6 md:px-10">
          <div className="landing-offers-head">
            <div className="landing-offers-copy">
              <p className="landing-kicker">Direct booking offers</p>
              <h2 id="landing-offers-title" className="landing-display landing-collection-title">
                furnished stay offers
              </h2>
              <p className="landing-collection-copy">
                Save on last-minute, weekly, and monthly stays when you book direct with One Lux Stay.
              </p>
            </div>
          </div>
        </div>

        <div className="landing-offers-controls landing-offers-controls--center" aria-hidden="true">
          <div className="landing-offers-swipe">
            <span className="landing-offers-swipe__label">{shouldUseInteractiveOffers ? "Browse offers" : "Swipe offers"}</span>
            {shouldUseInteractiveOffers && !prefersReducedMotion && (
              <span className="landing-offers-swipe__lottie" ref={offersSwipeRef} />
            )}
          </div>
        </div>

        <div
          className={`landing-offers-row ${shouldUseInteractiveOffers ? "landing-offers-row--draggable" : "landing-offers-row--native"}`}
          data-tour-target="offers"
          ref={shouldUseInteractiveOffers ? offersRef : null}
          onPointerDown={shouldUseInteractiveOffers ? handleOffersPointerDown : undefined}
          onPointerMove={shouldUseInteractiveOffers ? handleOffersPointerMove : undefined}
          onPointerUp={shouldUseInteractiveOffers ? handleOffersPointerUp : undefined}
          onPointerCancel={shouldUseInteractiveOffers ? handleOffersPointerUp : undefined}
          onClickCapture={shouldUseInteractiveOffers ? handleOffersClickCapture : undefined}
        >
          <div className="landing-offers-track" ref={shouldUseInteractiveOffers ? offersTrackRef : null}>
            {offersToRender.map((offer, idx) => (
              <article key={`${offer.kicker}-${idx}`} className={`landing-offer-card offer-${offer.tone}`}>
                <p className="landing-offer-kicker">{offer.kicker}</p>
                <h3 className="landing-offer-title">{offer.headline}</h3>
                <p className="landing-offer-body">{offer.body}</p>
                <button type="button" className="landing-offer-cta" onClick={scrollToCollection}>
                  {offer.cta}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="collection" className="landing-collection-section landing-animate" ref={collectionRef}>
        <div className="landing-showcase-inner px-6 md:px-10">
          <div className="landing-section-head landing-collection-intro">
            <p className="landing-kicker landing-collection-kicker">Live Apaleo portfolio</p>
            <h2 className="landing-display landing-collection-title">
              Live properties, <span className="landing-title-italic">ready to book</span>
            </h2>
            <p className="landing-collection-copy">
              Properties are loaded directly from Apaleo and enriched with One Lux Stay photography and content.
            </p>
          </div>
        </div>

        <div className="landing-destination-panel px-6 md:px-10" data-tour-target="collection">
          {shouldRenderCollectionGrid && !apaleoPropertiesLoading && apaleoPropertyItems.length ? (
            <Suspense
              fallback={
                <div className="landing-circular-gallery__loading" role="status" aria-live="polite">
                  <span>Loading destinations...</span>
                </div>
              }
            >
              <ChromaGrid items={apaleoPropertyItems} />
            </Suspense>
          ) : (
            <div className="landing-circular-gallery__loading" role="status" aria-live="polite">
              <span>{apaleoPropertiesError || "Loading live Apaleo properties..."}</span>
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

export default LandingPage;
