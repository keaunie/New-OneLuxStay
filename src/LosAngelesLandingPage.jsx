import { useEffect, useMemo, useRef, useState, useId, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import "./App.css";
import reviewsHwh from "./data/reviews-hwh.json";
import reviewsHollywood from "./data/reviews-hollywood.json";
import reviewsDodger from "./data/reviews-dodger.json";
import CardSwap, { Card } from "./components/CardSwap";
import BounceCards from "./components/BounceCards";
import SiteFooter from "./components/SiteFooter";
import Silk from "./components/Silk";
import ListingLoadingScreen from "./components/ListingLoadingScreen";
import Stepper, { Step } from "./components/Stepper";
import getBedDetails, { splitBedDetailLine } from "./utils/bedDetails";
import apiBase from "./utils/apiBase";
import { filterLowQualityImages, getImageKeyFromUrl } from "./utils/imageQuality";
import { buildEmbedMapUrl, buildStaticMapUrl, loadLeafletMaps } from "./utils/leafletMapsAdapter";
const mapsApiKey = "leaflet";
const LOGO_URL = "https://oneluxstay.netlify.app/image/ols-logo.png";
const PROPERTY_ADDRESS = "Westlake, Los Angeles, CA";
const PROPERTY_COORDS = { lat: 34.0575, lng: -118.2776 };
const LANDMARKS = [
  "Hollywood Sign",
  "Griffith Observatory",
  "Rodeo Drive",
  "Santa Monica Pier",
  "The Grove",
  "LAX"
];
const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='520' viewBox='0 0 800 520'><rect width='800' height='520' fill='%23efe7dc'/><text x='400' y='260' text-anchor='middle' dominant-baseline='middle' fill='%239c8368' font-family='Arial, sans-serif' font-size='24'>Image unavailable</text></svg>";

const handleImageError = (event) => {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = "true";
  img.src = FALLBACK_IMAGE;
  if (!img.alt) img.alt = "Image unavailable";
};

const loadGoogleMaps = loadLeafletMaps;

const formatCurrency = (value, currency = "USD") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    : "--";

const CHECKOUT_DEFAULT_CURRENCY = "USD";
const resolveCheckoutCurrency = (currency) => {
  const normalized = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  return normalized || CHECKOUT_DEFAULT_CURRENCY;
};

const roundCurrency = (value) =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const getTaxRateForListing = (listing = {}) => {
  const locationText = [
    listing?.address?.city,
    listing?.city,
    listing?.location,
    listing?.address?.full,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const state = (listing?.address?.state || listing?.address?.stateCode || "").toLowerCase();

  if (locationText.includes("dubai")) return 0;
  if (locationText.includes("antwerp")) return 0.06;
  if (locationText.includes("miami")) return 0.145;
  if (locationText.includes("redondo")) return 0.145;
  if (locationText.includes("los angeles")) return 0.145;
  if (state === "ca" || state.includes("california")) return 0.145;
  return 0;
};

const computeTaxes = (amount, listing) => {
  if (!Number.isFinite(amount)) return 0;
  const rate = getTaxRateForListing(listing);
  return roundCurrency(amount * rate);
};

const BedIcon = () => (
  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
    <path d="M3 10.5c0-1.7 1.3-3 3-3h12c1.7 0 3 1.3 3 3V20h-2v-3H5v3H3v-9.5zm2 4.5h14v-4.5c0-.6-.4-1-1-1H6c-.6 0-1 .4-1 1V15zm2-8h2v2H7V7zm8 0h2v2h-2V7z" />
  </svg>
);

const diffNights = (start, end) => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const ms = endDate - startDate;
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

const formatDateLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateValue = (value) => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const toISODate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const toNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatRuleValue = (value) => {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (typeof value === "number") return `${value}`;
  if (typeof value === "string" && value.trim()) return value;
  return "\u2014";
};

const formatQuietHours = (quietHours) => {
  if (!quietHours || quietHours.set === false) return "Not set";
  const start = quietHours.start || "--:--";
  const end = quietHours.end || "--:--";
  return `${start} - ${end}`;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const num = toNumber(value);
    if (num !== null) return num;
  }
  return null;
};

const buildCalendarMonth = (baseDate) => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(startOffset).fill(null);
  for (let i = 1; i <= daysInMonth; i += 1) {
    cells.push(new Date(year, month, i));
  }
  return { year, month, cells };
};

const formatCalendarPrice = (value, currency) => {
  if (typeof value !== "number") return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${Math.round(value)}`;
  }
};

const extractMinNightsFromDays = (days = []) => {
  if (!Array.isArray(days) || !days.length) return null;
  const values = days
    .map((day) => {
      if (!day) return null;
      if (typeof day?.restrictions?.minNights === "number") return day.restrictions.minNights;
      return firstNumber(
        day?.minNights,
        day?.minimumStay,
        day?.minStay,
        day?.minStayLength
      );
    })
    .filter((value) => typeof value === "number" && value > 1);
  return values.length ? Math.max(...values) : null;
};

const enumerateDateRange = (start, end) => {
  if (!start || !end) return [];
  const cursor = new Date(start);
  const out = [];
  while (cursor < end) {
    out.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

const getCalendarEntryId = (entry) =>
  entry?.listingId || entry?.id || entry?._id || null;

const getCalendarDayKey = (day) =>
  day?.date ||
  day?.dateLocalized ||
  day?.day ||
  (typeof day?.startDate === "string" ? day.startDate.split("T")[0] : null);

const isCalendarDayAvailable = (day) => {
  if (!day) return false;
  if (typeof day.allotment === "number") return day.allotment > 0;
  if (typeof day.available === "boolean") return day.available;
  if (typeof day.isAvailable === "boolean") return day.isAvailable;
  if (typeof day.status === "string") return day.status === "available";
  return false;
};

const normalizeCalendarDayForUi = (day, fallbackCurrency) => {
  const date = getCalendarDayKey(day);
  if (!date) return null;
  const price = firstNumber(
    day?.price,
    day?.nightlyPrice,
    day?.nightlyRate,
    day?.basePrice,
    day?.basePricePerNight,
    day?.price?.amount,
    day?.price?.value,
    day?.money?.amount,
    day?.money?.money?.amount
  );
  const currency =
    day?.currency ||
    day?.price?.currency ||
    day?.money?.currency ||
    day?.money?.money?.currency ||
    fallbackCurrency ||
    "USD";
  const minNights = firstNumber(
    day?.minNights,
    day?.minimumStay,
    day?.minStay,
    day?.minStayLength,
    day?.restrictions?.minNights,
    day?.restrictions?.minStay
  );
  const maxNights = firstNumber(
    day?.maxNights,
    day?.maximumStay,
    day?.maxStay,
    day?.maxStayLength,
    day?.restrictions?.maxNights,
    day?.restrictions?.maxStay
  );
  return {
    date,
    price,
    currency,
    restrictions: {
      minNights,
      maxNights,
      closedToArrival: Boolean(day?.closedToArrival ?? day?.cta ?? day?.restrictions?.cta),
      closedToDeparture: Boolean(day?.closedToDeparture ?? day?.ctd ?? day?.restrictions?.ctd),
    },
  };
};

const getListingId = (listing) => listing?.id || listing?._id || null;

const isChildListing = (listing) => {
  if (!listing) return false;
  const type = typeof listing.type === "string" ? listing.type.toUpperCase() : "";
  if (type.includes("CHILD")) return true;
  const listingId = getListingId(listing);
  const unitTypeId = listing?.unitTypeId;
  return Boolean(unitTypeId && listingId && String(unitTypeId) !== String(listingId));
};

const getPrimaryListingId = (listings = []) => {
  const parent = listings.find((listing) => !isChildListing(listing));
  if (parent) return parent.unitTypeId || parent.id || parent._id;
  return listings
    .map((listing) => listing.unitTypeId || listing.id || listing._id)
    .find(Boolean);
};

const getListingGroupKey = (listing) => {
  if (!listing) return null;
  const titleRaw = typeof listing.title === "string" ? listing.title.trim().toLowerCase() : "";
  const normalizeTitleKey = (value) => {
    if (!value) return "";
    return value
      .replace(/(,?\s*(apt|apartment|unit|suite|ste|#|floor|rm|room)\s*[-\w]+)/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  };
  const title = normalizeTitleKey(titleRaw);
  const city =
    typeof listing.address?.city === "string"
      ? listing.address.city.trim().toLowerCase()
      : "";
  const propertyType =
    typeof listing.propertyType === "string" ? listing.propertyType.trim().toLowerCase() : "";
  if (title) {
    return [title, city, propertyType].filter(Boolean).join("|") || null;
  }
  const address =
    typeof listing.address?.full === "string"
      ? listing.address.full.trim().toLowerCase()
      : typeof listing.location === "string"
        ? listing.location.trim().toLowerCase()
        : "";
  return [address, city, propertyType].filter(Boolean).join("|") || null;
};

const getParentListingId = (listing) =>
  listing?.unitTypeId || getListingGroupKey(listing) || getListingId(listing);

const isParentListing = (listing) => {
  const id = getListingId(listing);
  if (listing?.unitTypeId) return listing.unitTypeId === id;
  return !isChildListing(listing);
};

const groupListingsByParent = (listings = []) => {
  const groups = {};
  const toKey = (value) => (value ? String(value) : null);
  const childParentIds = new Set(
    listings
      .filter((listing) => isChildListing(listing))
      .map((listing) => toKey(listing?.unitTypeId))
      .filter(Boolean)
  );
  listings.forEach((listing) => {
    const listingId = getListingId(listing);
    const listingIds = [listing?.id, listing?._id].map(toKey).filter(Boolean);
    const matchedParentId = listingIds.find((id) => childParentIds.has(id));
    const parentId = toKey(listing?.unitTypeId)
      || matchedParentId
      || toKey(getParentListingId(listing));
    if (!parentId || !listingId) return;
    if (!groups[parentId]) {
      groups[parentId] = { parentId, parent: null, children: [] };
    }
    if (isParentListing(listing)) {
      groups[parentId].parent = listing;
    } else {
      groups[parentId].children.push(listing);
    }
  });
  return groups;
};

const getCalendarListingId = (listing, listings = []) => {
  if (!listing) return null;
  if (isChildListing(listing)) return getListingId(listing);
  const groupKey = getListingGroupKey(listing);
  if (!groupKey) return getListingId(listing);
  const child = listings.find(
    (entry) => isChildListing(entry) && getListingGroupKey(entry) === groupKey
  );
  return getListingId(child || listing);
};

const getLowestPriceListing = (listings = []) => {
  let best = null;
  let bestPrice = null;
  listings.forEach((listing) => {
    const price = typeof listing?.basePrice === "number" ? listing.basePrice : null;
    if (price === null) return;
    if (bestPrice === null || price < bestPrice) {
      bestPrice = price;
      best = listing;
    }
  });
  return best;
};

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const hasMonthData = (daysMap = {}, targetDate) => {
  const prefix = monthKey(targetDate);
  return Object.values(daysMap).some((day) => day?.date?.startsWith(prefix));
};

const addMonths = (date, count) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + count);
  return next;
};

const buildCalendarPayload = (daysMap = {}) => {
  const days = Object.values(daysMap).sort((a, b) => a.date.localeCompare(b.date));
  return { months: 24, days };
};

const formatDisplayDate = (value) => {
  const date = parseDateValue(value);
  if (!date) return "Add date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const getListingMinNights = (listing) => {
  const minNights = firstNumber(
    listing?.terms?.minNights,
    listing?.terms?.minimumStay,
    listing?.terms?.minStay,
    listing?.terms?.minStayLength,
    listing?.minNights,
    listing?.minimumStay,
    listing?.minStay,
    listing?.prices?.minNights,
    listing?.prices?.minimumStay,
    listing?.prices?.minStay,
    listing?.calendarRules?.minNights
  );
  return typeof minNights === "number" && minNights > 1 ? minNights : null;
};

const getListingMinNightsWithParent = (listing, listings = []) => {
  if (!listing) return null;
  const direct = getListingMinNights(listing);
  if (direct) return direct;
  const groupKey = getListingGroupKey(listing);
  if (!groupKey) return null;
  const parent = listings.find(
    (entry) => !isChildListing(entry) && getListingGroupKey(entry) === groupKey
  );
  return parent ? getListingMinNights(parent) : null;
};

const normalizeListingPricing = (listing = {}) => {
  const normalized = { ...listing };
  if (typeof normalized.basePrice !== "number") {
    const basePrice = firstNumber(
      listing?.basePrice,
      listing?.prices?.basePrice,
      listing?.prices?.basePricePerNight,
      listing?.prices?.nightly,
      listing?.prices?.basePrice?.amount,
      listing?.prices?.nightly?.amount
    );
    if (basePrice !== null) normalized.basePrice = basePrice;
  }
  if (!normalized.currency) {
    normalized.currency =
      listing?.currency ||
      listing?.prices?.currency ||
      listing?.prices?.basePrice?.currency ||
      listing?.prices?.nightly?.currency ||
      "USD";
  }
  return normalized;
};

const DateRangePicker = ({
  value,
  onChange,
  dayPrices,
  onMonthChange,
  onOpenChange,
  isLoading = false,
  fallbackPrice,
  fallbackCurrency,
  fallbackMinNights,
  showMinNights = true,
}) => {
  const [open, setOpen] = useState(false);
  const setOpenState = (nextOpen) => {
    setOpen(nextOpen);
    if (onOpenChange) onOpenChange(nextOpen);
  };
  const checkInLabelId = useId();
  const checkOutLabelId = useId();
  const dialogId = useId();
  const dialogHelpId = useId();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [view, setView] = useState(() => parseDateValue(value.checkIn) || today);
  const containerRef = useRef(null);
  const onMonthChangeRef = useRef(onMonthChange);

  const startDate = useMemo(() => parseDateValue(value.checkIn), [value.checkIn]);
  const endDate = useMemo(() => parseDateValue(value.checkOut), [value.checkOut]);

  useEffect(() => {
    onMonthChangeRef.current = onMonthChange;
  }, [onMonthChange]);

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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const base = startDate || today;
    setView((prev) => {
      const sameMonth = prev.getFullYear() === base.getFullYear() && prev.getMonth() === base.getMonth();
      return sameMonth ? prev : base;
    });
  }, [open, startDate, today]);

  const viewMonthKey = useMemo(
    () => `${view.getFullYear()}-${String(view.getMonth()).padStart(2, "0")}`,
    [view]
  );

  useEffect(() => {
    if (!open || !onMonthChangeRef.current) return;
    const monthStart = new Date(view.getFullYear(), view.getMonth(), 1);
    onMonthChangeRef.current(monthStart);
  }, [open, viewMonthKey, view]);

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
      if (!showMinNights) {
        setOpenState(false);
      } else {
        const minNights = toNumber(
          dayPrices?.get(toISODate(nextStart))?.restrictions?.minNights ?? fallbackMinNights ?? null
        );
        const nights = diffNights(toISODate(nextStart), toISODate(nextEnd));
        const violatesMin =
          typeof minNights === "number" && minNights > 1 && nights > 0 && nights < minNights;
        if (!violatesMin) setOpenState(false);
      }
    }
  };

  const selectedNights = diffNights(value.checkIn, value.checkOut);
  const selectedMinNights = useMemo(() => {
    if (!showMinNights) return null;
    if (!dayPrices || !startDate) return fallbackMinNights ?? null;
    const iso = toISODate(startDate);
    const info = dayPrices.get(iso);
    const minNights = toNumber(info?.restrictions?.minNights ?? fallbackMinNights ?? null);
    return typeof minNights === "number" && minNights > 1 ? minNights : null;
  }, [dayPrices, startDate, fallbackMinNights, showMinNights]);

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
    <div className="la-date-picker" ref={containerRef}>
      <div className="la-date-grid">
        <div className="la-date-field">
          <label id={checkInLabelId} className="la-date-label">Check-in</label>
          <button
            type="button"
            onClick={() => setOpenState(true)}
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
          <label id={checkOutLabelId} className="la-date-label">Check-out</label>
          <button
            type="button"
            onClick={() => setOpenState(true)}
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
          aria-describedby={dialogHelpId}
          className={`listing-date-dropdown${dayPrices ? " has-prices" : ""}${isLoading ? " is-loading" : ""}`}
        >
          <p id={dialogHelpId} className="sr-only">
            Select a check-in date and a check-out date. Use the previous and next buttons to change months.
          </p>
          <div className="la-date-header">
            <div className="la-date-title">{monthLabel}</div>
            <div className="la-date-nav">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => {
                  setView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                }}
                className="la-date-nav-btn"
              >
                {"<"}
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => {
                  setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                }}
                className="la-date-nav-btn"
              >
                {">"}
              </button>
            </div>
          </div>
          {showMinNights &&
            selectedMinNights &&
            selectedNights > 0 &&
            selectedNights < selectedMinNights && (
              <div className="la-date-alert" role="alert">
                There is a Minimum of {selectedMinNights} nights restriction, please adjust your dates
              </div>
            )}
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
                      const isPast = Boolean(day && day < today);
                      const selected = (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
                      const between = inRange(day) && !selected;
                      const isoDate = day ? toISODate(day) : "";
                      const priceInfo = dayPrices && day ? dayPrices.get(isoDate) : null;
                      const priceLabel = !isPast
                        ? priceInfo
                          ? formatCalendarPrice(priceInfo.price, priceInfo.currency)
                          : typeof fallbackPrice === "number"
                            ? formatCalendarPrice(fallbackPrice, fallbackCurrency)
                            : ""
                        : "";
                      const isFallbackPrice = !priceInfo && typeof fallbackPrice === "number";
                      const minNights = toNumber(
                        priceInfo?.restrictions?.minNights ?? fallbackMinNights ?? null
                      );
                      const showMinNightsCell =
                        showMinNights && typeof minNights === "number" && minNights > 1;
                      const dayLabel = day
                        ? day.toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                        : "";
                      const dayAria = priceLabel ? `${dayLabel}. ${priceLabel} per night.` : dayLabel;
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
                          aria-label={
                            showMinNightsCell
                              ? `${dayAria} Minimum stay ${minNights} nights.`
                              : dayAria
                          }
                          aria-hidden={day ? undefined : true}
                          onClick={() => handleDayClick(day)}
                          className={`listing-date-cell ${stateClass}${showMinNightsCell ? " has-restriction" : ""}${isPast ? " is-past" : ""}`}
                        >
                          {day ? (
                            <>
                              <span className="listing-date-cell__day">{day.getDate()}</span>
                              {priceLabel && (
                                <span
                                  className={`listing-date-cell__price${isFallbackPrice ? " is-fallback" : ""}`}
                                >
                                  {priceLabel}
                                </span>
                              )}
                              {showMinNightsCell && (
                                <span className="listing-date-cell__restriction">
                                  Min {minNights}
                                </span>
                              )}
                            </>
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
const getQuotePricing = (quoteData, listing, nights) => {
  if (!quoteData || !listing) return null;
  const normalizeRatePlan = (plan = {}) => {
    const labelSource = plan?.name || plan?.title || plan?.description || "";
    const isNonRefundable =
      plan?.cancellationPolicy?.isNonRefundable ??
      plan?.nonRefundable ??
      (/non[- ]?refundable/i.test(labelSource) ? true : false);
    const label = labelSource || (isNonRefundable ? "Non-refundable rate" : "Standard rate");
    return { label, isNonRefundable: Boolean(isNonRefundable) };
  };

  const plansRaw = Array.isArray(quoteData?.rates?.ratePlans)
    ? quoteData.rates.ratePlans
    : [];

  const buildPlanPricing = (plan, idx) => {
    const ratePlanMeta = plan?.ratePlan || {};
    const { label, isNonRefundable } = normalizeRatePlan(ratePlanMeta);
    const planId = ratePlanMeta?._id || plan?._id || `plan-${idx}`;
    const quoteMoney =
      plan?.money?.money ||
      plan?.money ||
      quoteData?.money?.money ||
      quoteData?.money ||
      null;
    const quoteDays = plan?.days || [];
    const quoteCurrency =
      quoteMoney?.currency || quoteDays[0]?.currency || listing.currency || "USD";
    const quotedNights = Array.isArray(quoteDays) && quoteDays.length > 0 ? quoteDays.length : nights;
    const manualDaySum = Array.isArray(quoteDays)
      ? quoteDays.reduce(
        (sum, d) => sum + (typeof d?.manualPrice === "number" ? d.manualPrice : 0),
        0
      )
      : null;
    const hasManualSum =
      Array.isArray(quoteDays) && quoteDays.some((d) => typeof d?.manualPrice === "number");
    const daySum = Array.isArray(quoteDays)
      ? quoteDays.reduce((sum, d) => {
        const price = d?.manualPrice ?? d?.price ?? d?.basePrice;
        return sum + (typeof price === "number" ? price : 0);
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
    const quoteNightly =
      (quoteTotal && quotedNights ? quoteTotal / quotedNights : undefined) ??
      (typeof daySum === "number" && quotedNights ? daySum / quotedNights : undefined) ??
      (quoteDays[0]?.manualPrice ?? quoteDays[0]?.price ?? quoteDays[0]?.basePrice);

    const breakdown = (() => {
      const items = quoteMoney?.invoiceItems;
      if (!Array.isArray(items)) return null;
      const acc = { accommodation: 0, cleaning: 0, taxes: 0, fees: 0 };
      items.forEach((item) => {
        const amt = typeof item?.amount === "number" ? item.amount : null;
        if (amt === null) return;
        const t = (item?.normalType || item?.type || "").toUpperCase();
        if (t === "AF" || t === "ACCOMMODATION_FARE") acc.accommodation += amt;
        else if (t === "CF" || t === "CLEANING_FEE") acc.cleaning += amt;
        else if (t === "OCT" || t === "TAX" || t === "OCCUPANCY_TAX") acc.taxes += amt;
        else acc.fees += amt;
      });
      return acc;
    })();

    const accommodationFromQuote =
      quoteMoney?.fareAccommodation ??
      null;
    const cleaningFromQuote =
      quoteMoney?.fareCleaning ??
      null;

    const accommodationBase =
      breakdown?.accommodation ??
      accommodationFromQuote ??
      (typeof daySum === "number" ? daySum : undefined) ??
      (Number.isFinite(quoteNightly) && quotedNights ? quoteNightly * quotedNights : undefined);
    const discountRate = isNonRefundable ? 0.15 : 0.1;
    const discountAmount =
      typeof accommodationBase === "number"
        ? accommodationBase * discountRate
        : 0;
    const accommodation =
      typeof accommodationBase === "number"
        ? accommodationBase - discountAmount
        : accommodationBase;
    const cleaning =
      cleaningFromQuote ??
      breakdown?.cleaning ??
      (typeof listing.cleaningFee === "number" ? listing.cleaningFee : 0);
    const taxes =
      computeTaxes(accommodation, listing);
    const fees = breakdown?.fees ?? 0;
    const subtotal =
      (typeof accommodation === "number" ? accommodation : 0) +
      (typeof cleaning === "number" ? cleaning : 0) +
      (typeof taxes === "number" ? taxes : 0) +
      (typeof fees === "number" ? fees : 0);
    const total = typeof subtotal === "number" ? subtotal : null;

    if (!Number.isFinite(quoteNightly)) return null;
    return {
      id: planId,
      label,
      isNonRefundable,
      nightly: quoteNightly,
      currency: quoteCurrency,
      nights: quotedNights || nights || 0,
      breakdown: {
        accommodation,
        discountAmount,
        discountRate,
        cleaning,
        taxes,
        fees,
        subtotal,
        total,
      },
      total,
    };
  };

  const plans = plansRaw
    .map(buildPlanPricing)
    .filter(Boolean)
    .filter((plan) => /standard|non[- ]?refundable/i.test(plan.label));
  if (!plans.length) return null;
  const standardPlan =
    plans.find((plan) => /standard/i.test(plan.label)) ||
    plans.find((plan) => !plan.isNonRefundable) ||
    null;
  return {
    plans,
    defaultPlanId: (standardPlan || plans[0]).id,
  };
};

const KNOWN_CITIES = [
  "los angeles",
  "la",
  "los-angeles",
  "hollywood",
  "west hollywood",
  "downtown",
  "dtla",
  "chinatown",
  "la plaza",
  "broadway",
  "union station",
  "hwh",
];
const EXCLUDED_CITIES = ["redondo beach", "miami", "dubai", "antwerp", "antwerpen"];
const CHECKOUT_PROMO_CODES = {
  WELCOME5: { rate: 0.05, label: "Welcome offer" },
  LUXE10: { rate: 0.1, label: "Member offer" },
  STAY10: { rate: 0.1, label: "Extended stay offer" },
};

const sanitizeText = (value = "") => {
  if (typeof value !== "string") return "";
  return value
    .replace(/\uFFFD/g, "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();
};

const buildWhatsAppLink = (title, checkIn, checkOut) => {
  const unitName = title ? sanitizeText(title) : "a OneLuxStay stay";
  const checkInDate = parseDateValue(checkIn);
  const checkOutDate = parseDateValue(checkOut);
  const dateLine =
    checkInDate && checkOutDate
      ? ` for ${formatDisplayDate(checkIn)} to ${formatDisplayDate(checkOut)}`
      : "";
  const message = `Hi! I'm interested in ${unitName}${dateLine}. Could you share availability and pricing?`;
  return `https://wa.me/12138663589?text=${encodeURIComponent(message)}`;
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
const normalizeRouteDate = (value) => (parseDateValue(value) ? value : "");
const normalizeRouteGuests = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
};
const normalizeSlugValue = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
const resolveSectionKeyFromSlug = (slug) => {
  const normalized = normalizeSlugValue(slug);
  if (!normalized) return null;
  const aliases = {
    hwh: "la-hwh",
    westhollywood: "la-hwh",
    weho: "la-hwh",
    downtown: "la-downtown",
    downtownla: "la-downtown",
    dtla: "la-downtown",
    hollywood: "la-hollywood",
    neardodger: "other",
    dodger: "other",
    dodgerstadium: "other",
  };
  if (aliases[normalized]) return aliases[normalized];
  const fromGroup = BUILDING_GROUPS.find(
    (group) =>
      normalizeSlugValue(group.key) === normalized || normalizeSlugValue(group.label) === normalized
  );
  return fromGroup?.key || null;
};
const parseRouteBookingBundle = (value = "") => {
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

const normalizeCountry = (listing) => {
  const country = listing?.country || listing?.address?.country || "";
  return typeof country === "string" ? country.trim() : "";
};

const formatListingLocationLabel = (listing, fallbackCity = "OneLuxStay") => {
  if (!listing) return fallbackCity;
  const city = sanitizeText(normalizeCity(listing) || "");
  const country = sanitizeText(normalizeCountry(listing) || "");
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return fallbackCity;
};

const formatAddress = (listing) => {
  const address = listing.address || {};
  const full = typeof address.full === "string" ? address.full.trim() : "";
  if (full) return sanitizeText(full);
  const parts = [address.city, address.country].filter(Boolean);
  if (parts.length) return sanitizeText(parts.join(", "));
  if (typeof listing.location === "string") return sanitizeText(listing.location);
  return "Los Angeles";
};

const getListingAddressQuery = (listing) => {
  const formatted = formatAddress(listing);
  return formatted ? formatted.trim() : "";
};

const AMENITY_GROUPS = [
  { key: "kitchen", label: "Kitchen", match: /(kitchen|oven|stove|microwave|dishwasher|fridge|refrigerator|freezer|toaster|coffee|kettle|cookware|dishes|silverware|dining)/i },
  { key: "bathroom", label: "Bathroom", match: /(bathroom|shower|bathtub|toilet|towels|shampoo|conditioner|soap|hot water|hair dryer)/i },
  { key: "bedroom", label: "Bedroom", match: /(bed|bedroom|linens|closet|wardrobe|hanger)/i },
  { key: "living", label: "Living area", match: /(living|sofa|workspace|laptop|desk)/i },
  { key: "laundry", label: "Laundry", match: /(washer|dryer|laundry)/i },
  { key: "outdoor", label: "Outdoor", match: /(pool|patio|balcony|bbq|grill|outdoor|garden|terrace)/i },
  { key: "parking", label: "Parking", match: /(parking|garage)/i },
  { key: "internet", label: "Internet", match: /(wifi|wireless|internet)/i },
  { key: "media", label: "Media & tech", match: /(tv|streaming|netflix)/i },
  { key: "safety", label: "Safety", match: /(smoke|carbon monoxide|fire extinguisher|first aid)/i },
  { key: "pets", label: "Pets", match: /(pets? allowed|pet friendly)/i },
];

const groupAmenities = (items) => {
  const clean = items.filter((item) => typeof item === "string" && item.trim());
  const groups = new Map(AMENITY_GROUPS.map((group) => [group.key, { ...group, items: [] }]));
  const misc = { key: "misc", label: "More amenities", items: [] };
  clean.forEach((amenity) => {
    const match = AMENITY_GROUPS.find((group) => group.match.test(amenity));
    if (match) {
      groups.get(match.key).items.push(amenity);
    } else {
      misc.items.push(amenity);
    }
  });
  const result = Array.from(groups.values()).filter((group) => group.items.length);
  if (misc.items.length) result.push(misc);
  return result;
};

const formatDescription = (value) => {
  if (!value) return "";
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "object") {
    return sanitizeText(value.summary || value.description || value.text || "");
  }
  return "";
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
      ""
    );
  }
  return "";
};

const getImageUrl = (image) => {
  if (!image) return FALLBACK_IMAGE;
  const direct = extractImageUrl(image);
  if (direct) return direct;
  const variants = [
    image.original,
    image.large,
    image.regular,
    image.thumbnail,
    image.medium,
    image.preview,
  ];
  for (const variant of variants) {
    const url = extractImageUrl(variant);
    if (url) return url;
  }
  return FALLBACK_IMAGE;
};

const getImageKey = (value) => {
  const url = extractImageUrl(value);
  return getImageKeyFromUrl(url);
};

const getListingImageUrls = (listing) => {
  if (!listing) return [];
  const urls = [];
  const seen = new Set();
  const seenCaption = new Set();
  const normalizeCaption = (value) =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim().toLowerCase() : "";
  const addUrl = (value, caption) => {
    const url = extractImageUrl(value);
    if (!url) return;
    const captionValue =
      normalizeCaption(caption) ||
      normalizeCaption(typeof value === "object" && value ? value.caption : "");
    if (captionValue && seenCaption.has(captionValue)) return;
    const key = getImageKey(url);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    if (captionValue) seenCaption.add(captionValue);
    urls.push(url);
  };
  const collectImage = (image) => {
    if (!image) return;
    addUrl(image, image.caption);
    const variants = [
      image.original,
      image.large,
      image.regular,
      image.thumbnail,
      image.medium,
      image.preview,
    ];
    variants.forEach((variant) => addUrl(variant, image.caption));
  };
  const hasPictures = Array.isArray(listing.pictures) && listing.pictures.length > 0;
  if (!hasPictures) collectImage(listing.picture);
  if (hasPictures) {
    listing.pictures.forEach(collectImage);
  }
  const unique = Array.from(new Set(urls));
  const filtered = filterLowQualityImages(unique);
  if (!filtered.length) {
    console.warn("[Gallery] No images found for listing.", {
      listingId: listing?.id || listing?._id || listing?.unitTypeId || null,
      title: listing?.title || "",
    });
    return [FALLBACK_IMAGE];
  }
  return filtered;
};

const galleryLogCache = new Set();

const getGalleryListing = (listing, allListings = []) => {
  if (!listing) return listing;
  const listingId = listing.unitTypeId || listing.id || listing._id;
  const fromApi =
    listingId && Array.isArray(allListings)
      ? allListings.find(
        (entry) => String(entry.id || entry._id || entry.unitTypeId || "") === String(listingId)
      )
      : null;
  const baseListing = fromApi || listing;
  const baseImages = getListingImageUrls(baseListing).filter((src) => src !== FALLBACK_IMAGE);
  const baseId = baseListing?.id || baseListing?._id || baseListing?.unitTypeId || null;
  if (baseId && !galleryLogCache.has(baseId)) {
    galleryLogCache.add(baseId);
    console.info("[Gallery] Base listing images", {
      listingId: baseId,
      title: baseListing?.title || "",
      count: baseImages.length,
    });
  }
  if (baseImages.length > 1) return baseListing;
  const groupKey = getListingGroupKey(baseListing);
  if (!groupKey || !Array.isArray(allListings) || !allListings.length) return baseListing;
  let bestListing = baseListing;
  let bestCount = baseImages.length;
  allListings.forEach((candidate) => {
    if (getListingGroupKey(candidate) !== groupKey) return;
    const count = getListingImageUrls(candidate).filter((src) => src !== FALLBACK_IMAGE).length;
    if (count > bestCount) {
      bestListing = candidate;
      bestCount = count;
    }
  });
  return bestListing;
};

const getReviewLabel = (reviews) => {
  if (!reviews) return "No review data";
  if (Array.isArray(reviews)) {
    const { rating, count } = getReviewStats(reviews);
    if (rating && count) return `${rating} / 5 (${count} reviews)`;
    if (count) return `${count} reviews`;
    return "No review data";
  }
  if (typeof reviews === "object") {
    const count = reviews.count || reviews.total || reviews.numberOfReviews;
    const rating = reviews.rating || reviews.score || reviews.average;
    if (count && rating) return `${rating} / 5 (${count} reviews)`;
    if (count) return `${count} reviews`;
    if (rating) return `${rating} / 5 rating`;
  }
  return "Reviews available";
};

const getReviewStats = (reviews) => {
  if (!reviews) return { rating: null, count: null };
  if (Array.isArray(reviews)) {
    const ratings = reviews
      .map((review) => Number(review?.rating))
      .filter((value) => Number.isFinite(value));
    const count = reviews.length || null;
    const rating = ratings.length
      ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
      : null;
    return { rating, count };
  }
  if (typeof reviews === "object") {
    const count = reviews.count || reviews.total || reviews.numberOfReviews || null;
    const rating = reviews.rating || reviews.score || reviews.average || null;
    return { rating, count };
  }
  return { rating: null, count: null };
};

const getReviewsForSectionKey = (key) => SECTION_REVIEWS[key] || SECTION_REVIEWS.other || [];

const getListingReviews = (listing) => {
  if (!listing) return [];
  const key = getBuildingKey(listing);
  return getReviewsForSectionKey(key || "other");
};

const getReviewLink = (listing) => {
  if (!listing) return "";
  const title = sanitizeText(listing?.title || "");
  const listingText = getListingText(listing) || title.toLowerCase();
  if (/(?:l\.?\s*a\.?\s*)?plaza\s+village|\bla\s*plaza\b/i.test(listingText)) {
    return LA_PLAZA_REVIEW_LINK;
  }
  if (/dodger|stadium/i.test(listingText)) {
    return NEAR_DODGER_REVIEW_LINK;
  }
  const key = getBuildingKey(listing);
  if (GOOGLE_REVIEW_LINKS[key]) return GOOGLE_REVIEW_LINKS[key];
  const fallbackTitle = title || "OneLuxStay Los Angeles";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackTitle)}`;
};

const parseCoords = (latValue, lngValue) => {
  const lat = toNumber(latValue);
  const lng = toNumber(lngValue);
  if (lat === null || lng === null) return null;
  return { lat, lng };
};

const parseCoordsArray = (coords) => {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const first = toNumber(coords[0]);
  const second = toNumber(coords[1]);
  if (first === null || second === null) return null;
  const firstAbs = Math.abs(first);
  const secondAbs = Math.abs(second);
  if (firstAbs <= 90 && secondAbs <= 180) return { lat: first, lng: second };
  if (secondAbs <= 90 && firstAbs <= 180) return { lat: second, lng: first };
  return null;
};

const getListingCoords = (listing) => {
  const directCoords = parseCoords(
    listing.latitude ?? listing.lat ?? listing.address?.latitude ?? listing.address?.lat,
    listing.longitude ?? listing.lng ?? listing.address?.longitude ?? listing.address?.lng
  );
  if (directCoords) return directCoords;

  const candidates = [
    listing.address?.location,
    listing.address?.coordinates,
    listing.location,
    listing.geoLocation,
    listing.coordinates,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      const coords = parseCoordsArray(candidate);
      if (coords) return coords;
    } else if (typeof candidate === "object") {
      const coords = parseCoords(
        candidate.lat ?? candidate.latitude,
        candidate.lng ?? candidate.longitude
      );
      if (coords) return coords;
      if (Array.isArray(candidate.coordinates)) {
        const arrayCoords = parseCoordsArray(candidate.coordinates);
        if (arrayCoords) return arrayCoords;
      }
    }
  }
  return null;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const rangeLabel = (values, suffix = "") => {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return "--";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return `${min}${suffix}`;
  return `${min}${suffix} - ${max}${suffix}`;
};

const SECTION_STORIES = {
  "la-downtown": {
    title: "Downtown Los Angeles",
    tagline: "Skyline energy, rooftop heat, and a city pulse that keeps moving.",
    copy:
      "Wake to glassy towers, drift through art-lined streets, then land at Union Station just as the lights flicker on. Everything feels close, fast, and possible - perfect for guests who want the city within arm's reach.",
    landmarks: ["Grand Central Market", "The Broad", "Walt Disney Concert Hall", "Union Station", "Little Tokyo"],
    transit: ["Metro A & E Lines", "Union Station", "Bus corridors on Broadway"],
  },
  "la-hollywood": {
    title: "Hollywood",
    tagline: "Neon nights, canyon mornings, and a view that never gets old.",
    copy:
      "From the hills to the boulevard, Hollywood keeps the story rolling. Catch the sign at sunrise, sip on Sunset, and glide to Griffith in minutes. It's a destination that feels cinematic the moment you arrive.",
    landmarks: ["Hollywood Sign", "Walk of Fame", "Griffith Observatory", "Hollywood Bowl", "Sunset Strip"],
    transit: ["Metro B Line (Red)", "Hollywood/Highland", "Hollywood/Vine"],
  },
  "la-hwh": {
    title: "Downtown Los Angeles",
    tagline: "Bold rooftops, late-night glow, and a rhythm that draws you in.",
    copy:
      "HWH brings the energy without the rush - pool decks at dusk, design-forward streets, and a quick hop to the Strip. It's hypnotic, magnetic, and made for guests who want the best of both sides.",
    landmarks: ["West Hollywood Park", "Sunset Strip", "Melrose Ave", "Roxy Theatre"],
    transit: ["Rapid 2", "WeHo CityLine", "Sunset Blvd routes"],
  },
  other: {
    title: "Dodger Stadium",
    tagline: "Golden light, stadium nights, and a steady city hum.",
    copy:
      "Settle into the calm just outside the core, then ride the wave into game nights and skyline views. It's a sweet spot with breathing room - close enough to feel the buzz, far enough to recharge.",
    landmarks: ["Dodger Stadium", "Elysian Park", "Echo Park Lake"],
    transit: ["Dodger Stadium Express", "Metro A Line", "Stadium Way routes"],
  },
};

const BUILDING_GROUPS = [
  { key: "la-hwh", label: "Downtown Los Angeles", match: /\bhwh\b|west hollywood|weho/ },
  {
    key: "la-downtown",
    label: "Downtown Los Angeles",
    match: /downtown|dtla|la plaza|broadway|chinatown|union station/,
  },
  { key: "la-hollywood", label: "Hollywood", match: /hollywood/ },
];
const SECTION_SLUG_BY_KEY = {
  "la-hwh": "hwh",
  "la-downtown": "downtownla",
  "la-hollywood": "hollywood",
  other: "neardodger",
};

const STAR_TOTAL = 5;
const REVIEW_TICKER = [...reviewsHwh, ...reviewsHollywood, ...reviewsDodger];
const SECTION_REVIEWS = {
  "la-hwh": reviewsHwh,
  "la-hollywood": reviewsHollywood,
  "la-downtown": reviewsDodger,
  other: reviewsDodger,
};
const LA_PLAZA_REVIEW_LINK =
  "https://www.google.com/travel/search?q=one%20lux%20stay%20la%20plaza%20village&qs=CAAgACgAMihDaG9Jc3FHeTlkZkkwN3JxQVJvTkwyY3ZNVEZ6TjNKbVgyWXdOeEFCOA1IAA&ts=CAEaPgoeEhwKDS9nLzExczdyZl9mMDc6C0xvcyBBbmdlbGVzEhwSFAoHCOoPEAIYFhIHCOoPEAIYFxgBMgQIABAAKgcKBToDUEhQ&ap=KigKEgkAH9u3HgdBQBG_B5T5ho9dwBISCeugdTubB0FAEb8HFE9Ij13AMAC6AQdyZXZpZXdz";
const NEAR_DODGER_REVIEW_LINK =
  "https://www.google.com/travel/search?q=one%20lux%20stay%20la%20plaza%20village&qs=CAAgASgAMidDaGtJd09EVDlkV0wwNnc3R2cwdlp5OHhNWFJtYUhRek9HeHdFQUU4DUgA&ts=CAEaPgoeEhwKDS9nLzExczdyZl9mMDc6C0xvcyBBbmdlbGVzEhwSFAoHCOoPEAIYFhIHCOoPEAIYFxgBMgQIABAAKgcKBToDUEhQ&ap=KigKEgl3OX2DmANBQBEtJ_wB7pFdwBISCUhUSrdgC0FAES0n_FkDjl3AMAC6AQdyZXZpZXdz&ved=0CAAQ5JsGahcKEwjAqND8gNCSAxUAAAAAHQAAAAAQBA";
const GOOGLE_REVIEW_LINKS = {
  "la-hollywood":
    "https://www.google.com/maps/place/One+Lux+Stay+Hollywood+View+LA+Suites/@34.096727,-118.3144848,908m/data=!3m1!1e3!4m11!3m10!1s0x80c2bf1c3a41cc15:0xbc828ded239ae8a3!5m2!4m1!1i2!8m2!3d34.0967226!4d-118.3119099!9m1!1b1!16s%2Fg%2F11l6btbhs4?entry=ttu&g_ep=EgoyMDI2MDEyNi4wIKXMDSoASAFQAw%3D%3D",
  "la-hwh":
    "https://www.google.com/maps/place/One+Lux+Stay+HWH+Downtown+Los+Angeles/@34.0489709,-118.250392,908m/data=!3m2!1e3!5s0x80c2c64a33a4e947:0x3882004a8f34fba8!4m11!3m10!1s0x80c2c7d2fa15aab3:0x71a2178b49e7af8a!5m2!4m1!1i2!8m2!3d34.0489665!4d-118.2478171!9m1!1b1!16s%2Fg%2F11rsrqx5ls?entry=ttu&g_ep=EgoyMDI2MDEyNi4wIKXMDSoASAFQAw%3D%3D",
  "la-downtown": "",
};
const HOLLYWOOD_FACILITIES = [
  "Outdoor swimming pool",
  "Free parking",
  "Free Wi-Fi",
  "Family rooms",
  "Non-smoking rooms",
  "Fitness center",
  "Terrace",
  "Laundry",
  "BBQ facilities",
  "Tea/Coffee maker in all rooms",
];

const FACILITY_ICON_MAP = {
  "outdoor swimming pool": (
    <>
      <circle cx="7.5" cy="7" r="2" />
      <path d="M3 17c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2" />
      <path d="M5 12l4-2 4 2 3-1" />
    </>
  ),
  "free parking": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8h3.2a2.6 2.6 0 0 1 0 5.2H10V8zm0 0v8" />
    </>
  ),
  "free wi-fi": (
    <path d="M4 9a12 12 0 0 1 16 0m-12 4a6 6 0 0 1 8 0m-4 4h.01" />
  ),
  "family rooms": (
    <>
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="7" r="2" />
      <circle cx="12" cy="9.5" r="1.5" />
      <path d="M3.5 19c0-2.1 1.9-3.8 4.2-3.8S12 16.9 12 19" />
      <path d="M12 19c0-2.1 1.9-3.8 4.2-3.8S20.5 16.9 20.5 19" />
    </>
  ),
  "non-smoking rooms": (
    <>
      <path d="M4 14h10m2 0h4m-16 3h16" />
      <path d="M6 10c0-1.2 1-2 2.4-2h3.1" />
      <path d="M4 4l16 16" />
    </>
  ),
  "fitness center": (
    <path d="M3 11h3v2H3zm15 0h3v2h-3zM7 9h2v6H7zm8 0h2v6h-2zM9 11h6v2H9z" />
  ),
  terrace: (
    <>
      <path d="M4 18h16" />
      <path d="M12 4v9m-5 0h10" />
      <path d="M6 18l2-6m10 6-2-6" />
    </>
  ),
  laundry: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h4m4 0h.01" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  "bbq facilities": (
    <>
      <path d="M6 11h12" />
      <path d="M8 11v3a4 4 0 0 0 8 0v-3" />
      <path d="M7 18l-2 3m14-3 2 3" />
      <path d="M10 3h4m-3 0v3m2-3v3" />
    </>
  ),
  "tea/coffee maker in all rooms": (
    <>
      <path d="M5 8h9v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8z" />
      <path d="M14 9h3a2 2 0 0 1 0 4h-3" />
      <path d="M8 4v2m4-2v2" />
    </>
  ),
};

const renderFacilityIcon = (label) => {
  const key = String(label || "").toLowerCase();
  const iconPath = FACILITY_ICON_MAP[key];
  if (!iconPath) return null;
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
      {iconPath}
    </svg>
  );
};

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

const hasCityToken = (text, token) => {
  const source = String(text || "");
  const term = String(token || "").trim().toLowerCase();
  if (!source || !term) return false;
  if (term.length <= 2) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(source);
  }
  return source.includes(term);
};

const isLosAngelesListing = (listing) => {
  const cityText = [listing.city, listing.address?.city, listing.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (cityText) {
    if (EXCLUDED_CITIES.some((city) => cityText.includes(city))) return false;
    return KNOWN_CITIES.some((known) => hasCityToken(cityText, known));
  }
  const text = getListingText(listing);
  if (EXCLUDED_CITIES.some((city) => text.includes(city))) return false;
  return KNOWN_CITIES.some((known) => hasCityToken(text, known));
};

const getListingCityRoute = (listing) => {
  const text = [
    listing?.city,
    listing?.address?.city,
    listing?.address?.country,
    listing?.location,
    listing?.title,
    Array.isArray(listing?.tags) ? listing.tags.join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/redondo\s+beach/.test(text)) return "/redondo-beach";
  if (/miami/.test(text)) return "/miami";
  if (/antwerp|antwerpen|belgium/.test(text)) return "/antwerp";
  if (/dubai|united arab emirates|\buae\b/.test(text)) return "/dubai";
  return "/los-angeles";
};

const getBuildingKey = (listing) => {
  const text = getListingText(listing);
  const hwh = BUILDING_GROUPS.find((group) => group.key === "la-hwh");
  if (hwh && hwh.match.test(text)) return hwh.key;
  const downtown = BUILDING_GROUPS.find((group) => group.key === "la-downtown");
  if (downtown && downtown.match.test(text) && !/\bhwh\b|west hollywood|weho/.test(text)) {
    return downtown.key;
  }
  for (const group of BUILDING_GROUPS) {
    if (group.key === "la-hwh" || group.key === "la-downtown") continue;
    if (group.match.test(text)) return group.key;
  }
  return "other";
};

const resolveGroupTitle = (listing) => {
  const key = getBuildingKey(listing);
  switch (key) {
    case "la-hwh":
      return "One Lux Stay HWH Downtown Los Angeles";
    case "la-downtown":
      return "One Lux Stay LA Plaza Village";
    case "la-hollywood":
      return "One Lux Stay Hollywood View LA Suites";
    default:
      return "One Lux Stay Near Dodger Stadium Downtown LA";
  }
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
    currency: currencies.size === 1 ? [...currencies][0] : "USD",
  };
};

const CITY_TOUR_SLIDES = {
  Hollywood: [
    {
      title: "Hollywood Arrival",
      subtitle: "A cinematic welcome to the city of light.",
      copy:
        "Step into a private arrival framed by palm silhouettes and glassy skyline reflections. Your concierge lines up the first night with rooftop views and a late supper on Sunset.",
      highlights: ["Sunset Boulevard", "Private transfers", "Skyline check-in"],
      image:
        "https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      title: "Golden Hour in the Hills",
      subtitle: "Runyon trails, Mulholland turns, and the glow of dusk.",
      copy:
        "Climb above the city for warm light, quiet air, and panoramic views. End the afternoon with a private terrace pour and the skyline turning gold.",
      highlights: ["Runyon Canyon", "Mulholland Drive", "Hilltop terraces"],
      image:
        "https://images.unsplash.com/photo-1711039842546-4b78a455efc7?q=80&w=1074&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      title: "Icons After Dark",
      subtitle: "Marquee lights and the legendary walk.",
      copy:
        "Move from neon marquees to velvet lounges with a curated night plan. Classic Hollywood icons glow brighter when you arrive with a reserved table.",
      highlights: ["Walk of Fame", "Cinema", "Movie Theaters"],
      image:
        "https://images.unsplash.com/photo-1579800663822-714e267da4fc?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      title: "Finale in Lights",
      subtitle: "Private screenings and the city at your pace.",
      copy:
        "Close the tour with a private screening, late-night city views, and the assurance that your next stay is already curated.",
      highlights: ["Private screening", "Skyline lounge", "Concierge on call"],
      image:
        "https://images.unsplash.com/photo-1520516288949-bbd7f94a6ab0?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  ],
  Chinatown: [
    {
      title: "Chinatown Gateway",
      subtitle: "Lantern light, hidden courtyards, and late tea.",
      copy:
        "Arrive under glow-lit streets and a calm courtyard welcome. Begin with a curated tasting and a walk through heritage storefronts.",
      highlights: ["Central Plaza", "Hidden courtyards", "Tea lounge"],
      image:
        "https://images.unsplash.com/photo-1607988138707-241030633096?q=80&w=1074&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      title: "Night Market Stroll",
      subtitle: "Street food and neon rhythm.",
      copy:
        "Move from open-air stalls to tucked-away speakeasies. The city hums while lanterns guide the night.",
      highlights: ["Night market", "Street dining", "Lantern walk"],
      image:
        "https://images.unsplash.com/photo-1667088392300-b0b8f01e5dbd?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      title: "Heritage + Art",
      subtitle: "Temple calm and gallery light.",
      copy:
        "Spend the afternoon between heritage landmarks and contemporary galleries, then end with rooftop views back toward DTLA.",
      highlights: ["Heritage temples", "Gallery row", "Rooftop views"],
      image:
        "https://images.unsplash.com/photo-1599090724178-0ca4509e1f5c?q=80&w=1164&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  ],
  "Downtown Los Angeles": [
    {
      title: "LAX Arrival",
      subtitle: "Modern art, skyline lines, and a downtown pulse.",
      copy:
        "Begin with architectural icons and a rooftop welcome. Your concierge curates a gallery walk and a reservation with a view.",
      highlights: ["Walt Disney Concert Hall", "The Broad", "Rooftop tables"],
      image:
        "https://images.unsplash.com/photo-1611860565869-7e40176e3052?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      title: "Market District",
      subtitle: "Historic stalls and late-night bites.",
      copy:
        "Taste your way through Grand Central Market before an easy stroll through the historic core.",
      highlights: ["Grand Central Market", "Bradbury Building", "Spring Street"],
      image:
        "https://images.unsplash.com/photo-1514829887622-b6da559f5568?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      title: "Arts + Views",
      subtitle: "Museums, gardens, and quiet overlooks.",
      copy:
        "Reset with a museum afternoon and golden hour above the city.",
      highlights: ["MOCA", "Grand Park", "Walt Disney Concert Hall"],
      image:
        "https://images.unsplash.com/photo-1663310344482-f7f17ab524a9?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  ],
  "Los Angeles": [
    {
      title: "DTLA Arrival",
      subtitle: "Modern art, skyline lines, and a downtown pulse.",
      copy:
        "Begin with architectural icons and a rooftop welcome. Your concierge curates a gallery walk and a reservation with a view.",
      highlights: ["Walt Disney Concert Hall", "The Broad", "Rooftop tables"],
      image:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "City and Coast",
      subtitle: "From gallery halls to Pacific light.",
      copy:
        "Shift from LA's creative core to the edge of the ocean. Sunset arrives over Santa Monica with the beach in easy reach.",
      highlights: ["Santa Monica Pier", "Venice Boardwalk", "Abbot Kinney"],
      image:
        "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Westside Luxe",
      subtitle: "Elevated retail and design districts.",
      copy:
        "A day of curated shopping, design stops, and a slow lunch on the Westside before evening lights on Sunset.",
      highlights: ["Rodeo Drive", "The Grove", "Sunset Strip"],
      image:
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Arts + Views",
      subtitle: "Museums, gardens, and quiet overlooks.",
      copy:
        "Spend the afternoon at Getty and LACMA, then reset with a Griffith Park golden hour.",
      highlights: ["Getty Center", "LACMA", "Griffith Park"],
      image:
        "https://images.unsplash.com/photo-1526481280695-3c687fd643ed?auto=format&fit=crop&w=2000&q=80",
    },
  ],
  "Redondo Beach": [
    {
      title: "Pier Welcome",
      subtitle: "Salt air and harbor calm.",
      copy:
        "Arrive to pier views and marina strolls. Sunset lands softly across the Pacific.",
      highlights: ["Redondo Beach Pier", "King Harbor", "Seaside Lagoon"],
      image:
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Riviera Village",
      subtitle: "Boutiques, cafes, and beach lanes.",
      copy:
        "Spend the afternoon in Riviera Village with coastal cafes and a slow walk along the Esplanade.",
      highlights: ["Riviera Village", "El Retiro Park", "Esplanade"],
      image:
        "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "South Bay Day",
      subtitle: "Hermosa and Palos Verdes escapes.",
      copy:
        "Ride the Strand, then pivot to cliffside views and an early dinner in Palos Verdes.",
      highlights: ["Hermosa Pier", "The Strand", "Palos Verdes"],
      image:
        "https://images.unsplash.com/photo-1482192596544-9eb780fc7f66?auto=format&fit=crop&w=2000&q=80",
    },
  ],
  "Miami Beach": [
    {
      title: "Ocean Drive Arrival",
      subtitle: "Art Deco lines and Atlantic light.",
      copy:
        "Start in South Beach with Art Deco landmarks, then settle into a sunset cocktail on Ocean Drive.",
      highlights: ["Ocean Drive", "Art Deco District", "Lummus Park"],
      image:
        "https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Design + Bayside",
      subtitle: "Boutiques and waterfront strolls.",
      copy:
        "Spend the day between Lincoln Road, Design District galleries, and a bayside dinner.",
      highlights: ["Lincoln Road", "Design District", "Biscayne Bay"],
      image:
        "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Beach Day",
      subtitle: "Soft sand, bright water, unhurried pace.",
      copy:
        "A slow day on Bal Harbour and Surfside with a golden hour walk along North Beach.",
      highlights: ["Bal Harbour", "Surfside", "North Beach"],
      image:
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80",
    },
  ],
};

const TOUR_CITIES = ["Hollywood", "Chinatown", "Downtown Los Angeles"];


const getFirstSentence = (text) => {
  if (!text) return "";
  const clean = sanitizeText(text);
  const match = clean.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : clean.split("\n")[0].trim();
};

const formatFullDescription = (listing) => {
  const text = formatDescription(listing.publicDescription);
  if (text) return text;
  const fallback = [
    listing.propertyType,
    listing.roomType,
    listing.timezone,
  ].filter(Boolean);
  return fallback.length ? `Details: ${fallback.join(" | ")}` : "No description available.";
};

export default function LosAngelesLandingPage() {
  const {
    listingId: routeListingId,
    checkIn: routeCheckInParam,
    checkOut: routeCheckOutParam,
    guests: routeGuestsParam,
    areaSlug: routeAreaSlug,
    bookingBundle: routeBookingBundle,
  } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isListingRoute = Boolean(routeListingId);  // listing-route-scroll-lock
  useEffect(() => {
    if (!isListingRoute) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isListingRoute]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeListing, setActiveListing] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeSectionKey, setActiveSectionKey] = useState(null);
  const [sectionCheckIn, setSectionCheckIn] = useState("");
  const [sectionCheckOut, setSectionCheckOut] = useState("");
  const [sectionGuests, setSectionGuests] = useState("2");
  const [sectionAvailability, setSectionAvailability] = useState([]);
  const [sectionAvailabilityLoading, setSectionAvailabilityLoading] = useState(false);
  const [sectionAvailabilityError, setSectionAvailabilityError] = useState("");
  const [sectionAvailabilityActive, setSectionAvailabilityActive] = useState(false);
  const [sectionAvailabilityMap, setSectionAvailabilityMap] = useState({});
  const [sectionReserveLoadingId, setSectionReserveLoadingId] = useState(null);
  const [isInquiryOpen, setIsInquiryOpen] = useState(false);
  const [inquiryListing, setInquiryListing] = useState(null);
  const [houseRulesByUnit, setHouseRulesByUnit] = useState({});

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paramCheckIn = params.get("checkIn") || "";
    const paramCheckOut = params.get("checkOut") || "";
    const paramGuests = params.get("guests") || "";
    const bundle = parseRouteBookingBundle(routeBookingBundle);
    const routeCheckIn = normalizeRouteDate(routeCheckInParam) || bundle.checkIn;
    const routeCheckOut = normalizeRouteDate(routeCheckOutParam) || bundle.checkOut;
    const routeGuests = normalizeRouteGuests(routeGuestsParam) || bundle.guests;
    const persisted = readPersistedBooking();
    const nextCheckIn = paramCheckIn || routeCheckIn || persisted?.checkIn || "";
    const nextCheckOut = paramCheckOut || routeCheckOut || persisted?.checkOut || "";
    const nextGuests = paramGuests || routeGuests || persisted?.guests || "2";
    if (nextCheckIn !== sectionCheckIn) setSectionCheckIn(nextCheckIn);
    if (nextCheckOut !== sectionCheckOut) setSectionCheckOut(nextCheckOut);
    if (nextGuests && nextGuests !== sectionGuests) setSectionGuests(nextGuests);
  }, [location.search, routeCheckInParam, routeCheckOutParam, routeGuestsParam, routeBookingBundle]);

  useEffect(() => {
    const normalizedGuests = sectionGuests || "2";
    const hasDateFilters = Boolean(sectionCheckIn || sectionCheckOut);
    const hasNonDefaultGuests = normalizedGuests !== "2";
    if (!hasDateFilters && !hasNonDefaultGuests) {
      writePersistedBooking(null);
      return;
    }
    writePersistedBooking({
      checkIn: sectionCheckIn || "",
      checkOut: sectionCheckOut || "",
      guests: normalizedGuests,
    });
  }, [sectionCheckIn, sectionCheckOut, sectionGuests]);
  const [houseRulesLoading, setHouseRulesLoading] = useState(false);
  const [houseRulesError, setHouseRulesError] = useState("");
  const [isReviewExpanded, setIsReviewExpanded] = useState(false);
  const [checkoutGuest, setCheckoutGuest] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [checkoutGuestError, setCheckoutGuestError] = useState("");
  const [checkoutConsentAccepted, setCheckoutConsentAccepted] = useState(false);
  const [checkoutConsentSignerName, setCheckoutConsentSignerName] = useState("");
  const [checkoutConsentSignatureDataUrl, setCheckoutConsentSignatureDataUrl] = useState("");
  const [checkoutPromoCode, setCheckoutPromoCode] = useState("");
  const [checkoutPromoError, setCheckoutPromoError] = useState("");
  const [checkoutAppliedPromo, setCheckoutAppliedPromo] = useState(null);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [isCheckoutGuestOpen, setIsCheckoutGuestOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(null);
  const [sectionHeroIndex, setSectionHeroIndex] = useState(0);
  const heroCarouselRef = useRef(null);
  const cardSwapRef = useRef(null);
  const reviewCarouselRef = useRef(null);
  const [sectionQuotes, setSectionQuotes] = useState({});
  const [selectedRatePlans, setSelectedRatePlans] = useState({});
  const [listingTab, setListingTab] = useState("overview");
  const [expandedQuoteRows, setExpandedQuoteRows] = useState({});
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [buildingPrices, setBuildingPrices] = useState({});
  const [calendarPrices, setCalendarPrices] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [calendarMinNightsOverride, setCalendarMinNightsOverride] = useState(null);
  const [calendarMonthIndex, setCalendarMonthIndex] = useState(0);
  const [calendarStartDate, setCalendarStartDate] = useState(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  });
  const calendarCacheRef = useRef({});
  const calendarDaysRef = useRef({});
  const calendarGlobalCacheRef = useRef({});
  const calendarGlobalDaysRef = useRef({});
  const calendarGlobalInflightRef = useRef({});
  const calendarMinNightsCacheRef = useRef({});
  const [isListingCalendarOpen, setIsListingCalendarOpen] = useState(false);
  const calendarInflightRef = useRef({});
  const [sectionCalendarPrices, setSectionCalendarPrices] = useState(null);
  const [sectionCalendarLoading, setSectionCalendarLoading] = useState(false);
  const [sectionCalendarError, setSectionCalendarError] = useState("");
  const [sectionCalendarMinNightsOverride, setSectionCalendarMinNightsOverride] = useState(null);
  const [sectionCalendarMonthIndex, setSectionCalendarMonthIndex] = useState(0);
  const [sectionCalendarStartDate, setSectionCalendarStartDate] = useState(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return start;
  });
  const sectionCalendarCacheRef = useRef({});
  const sectionCalendarDaysRef = useRef({});
  const [isSectionCalendarOpen, setIsSectionCalendarOpen] = useState(false);
  const sectionCalendarInflightRef = useRef({});
  const [tourCity, setTourCity] = useState("Hollywood");
  const [showCityTour, setShowCityTour] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourPaused, setTourPaused] = useState(false);
  const autoScrollRef = useRef({ id: null, element: null, direction: 0 });
  const hoveredThumbsRef = useRef(null);
  const thumbsRef = useRef(null);
  const sectionThumbsRef = useRef(null);
  const [isListingMapOpen, setIsListingMapOpen] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState("");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const checkoutSignatureCanvasRef = useRef(null);
  const isSigningRef = useRef(false);
  const listingMapRef = useRef(null);
  const listingMapInstanceRef = useRef(null);
  const listingMapMarkerRef = useRef(null);
  const [listingMapTarget, setListingMapTarget] = useState(null);
  const [isSectionMapOpen, setIsSectionMapOpen] = useState(false);
  const [sectionMapTarget, setSectionMapTarget] = useState(null);
  const sectionMapRef = useRef(null);
  const sectionMapInstanceRef = useRef(null);
  const sectionMapMarkerRef = useRef(null);
  const autoRouteAvailabilityKeyRef = useRef("");
  const availabilityTableRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapsApiRef = useRef(null);
  const listingMarkersRef = useRef([]);
  const listingInfoRef = useRef(null);
  const geocoderRef = useRef(null);
  const geocodeCacheRef = useRef(new Map());
  const geocodeInFlightRef = useRef(new Set());
  const mapLoadedRef = useRef(false);
  const losAngelesListingsRef = useRef([]);
  const [isMapEnabled, setIsMapEnabled] = useState(false);
  const [mapError, setMapError] = useState("");

  const activeAmenityList = useMemo(() => {
    if (!activeListing) return [];
    const amenityListRaw = Array.isArray(activeListing.amenities)
      ? activeListing.amenities
      : [];
    return [...new Set(amenityListRaw.filter((item) => typeof item === "string"))];
  }, [activeListing]);

  const activeAboutText = useMemo(() => {
    if (!activeListing) return "";
    return formatFullDescription(activeListing);
  }, [activeListing]);

  const calendarDayMap = useMemo(() => {
    if (!Array.isArray(calendarPrices?.days)) return new Map();
    return new Map(calendarPrices.days.map((day) => [day.date, day]));
  }, [calendarPrices]);


  const calendarCurrentMonth = useMemo(() => {
    const base = new Date(calendarStartDate);
    base.setMonth(base.getMonth() + calendarMonthIndex);
    base.setDate(1);
    return base;
  }, [calendarStartDate, calendarMonthIndex]);

  const calendarMonth = useMemo(
    () => buildCalendarMonth(calendarCurrentMonth),
    [calendarCurrentMonth]
  );

  useEffect(() => {
    if (!activeListing || !isListingCalendarOpen) return;
    const listingId = getCalendarListingId(activeListing, losAngelesListings);
    if (!listingId) return;
    const monthBase = new Date(calendarStartDate);
    monthBase.setMonth(monthBase.getMonth() + calendarMonthIndex);
    const monthStart = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1);
    fetchCalendarMonth(
      listingId,
      monthStart,
      calendarCacheRef,
      calendarDaysRef,
      calendarInflightRef,
      setCalendarLoading,
      setCalendarError,
      setCalendarPrices
    );
  }, [activeListing, isListingCalendarOpen, calendarMonthIndex, calendarStartDate]);

  const sectionCalendarDayMap = useMemo(() => {
    if (!Array.isArray(sectionCalendarPrices?.days)) return new Map();
    return new Map(sectionCalendarPrices.days.map((day) => [day.date, day]));
  }, [sectionCalendarPrices]);

  const sectionCalendarCurrentMonth = useMemo(() => {
    const base = new Date(sectionCalendarStartDate);
    base.setMonth(base.getMonth() + sectionCalendarMonthIndex);
    base.setDate(1);
    return base;
  }, [sectionCalendarStartDate, sectionCalendarMonthIndex]);

  const sectionCalendarMonth = useMemo(
    () => buildCalendarMonth(sectionCalendarCurrentMonth),
    [sectionCalendarCurrentMonth]
  );

  const stopAutoScroll = () => {
    if (autoScrollRef.current.id) {
      cancelAnimationFrame(autoScrollRef.current.id);
      autoScrollRef.current.id = null;
      autoScrollRef.current.element = null;
      autoScrollRef.current.direction = 0;
    }
  };

  const startAutoScroll = (element, direction) => {
    if (!element) return;
    const current = autoScrollRef.current;
    if (current.element === element && current.direction === direction && current.id) return;
    stopAutoScroll();
    autoScrollRef.current.element = element;
    autoScrollRef.current.direction = direction;
    const step = () => {
      if (!autoScrollRef.current.element) return;
      autoScrollRef.current.element.scrollBy({ left: direction * 6, behavior: "auto" });
      autoScrollRef.current.id = requestAnimationFrame(step);
    };
    autoScrollRef.current.id = requestAnimationFrame(step);
  };

  const handleThumbsMove = (event, targetRef) => {
    const target = targetRef?.current || event.currentTarget;
    if (!target) {
      return;
    }
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const edge = rect.width * 0.35;
    if (x < edge) {
      startAutoScroll(target, -1);
    } else if (x > rect.width - edge) {
      startAutoScroll(target, 1);
    } else {
      stopAutoScroll();
    }
  };

  useEffect(() => {
    const handleMove = (event) => {
      if (!hoveredThumbsRef.current) return;
      handleThumbsMove(event, { current: hoveredThumbsRef.current });
    };
    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      stopAutoScroll();
    };
  }, []);

  useEffect(() => {
    if (!activeListing) {
      stopAutoScroll();
      setActiveImageIndex(0);
      return;
    }
    const params = new URLSearchParams(location.search);
    const bundle = parseRouteBookingBundle(routeBookingBundle);
    const routeCheckIn = normalizeRouteDate(routeCheckInParam) || bundle.checkIn;
    const routeCheckOut = normalizeRouteDate(routeCheckOutParam) || bundle.checkOut;
    const routeGuests = normalizeRouteGuests(routeGuestsParam) || bundle.guests;
    const hasParams =
      params.get("checkIn") ||
      params.get("checkOut") ||
      params.get("guests") ||
      routeCheckIn ||
      routeCheckOut ||
      routeGuests;
    const persisted = readPersistedBooking();
    const hasPersisted = persisted?.checkIn || persisted?.checkOut || persisted?.guests;
    if (!hasParams && !hasPersisted) {
      setSectionCheckIn("");
      setSectionCheckOut("");
    }
    setCalendarMinNightsOverride(null);
  }, [activeListing, location.search, routeCheckInParam, routeCheckOutParam, routeGuestsParam, routeBookingBundle]);

  useEffect(() => {
    if (!activeListing) return;
    const listingId = activeListing.unitTypeId || activeListing.id || activeListing._id;
    if (!listingId) return;
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    setCalendarStartDate(start);
    setCalendarMonthIndex(0);
    const cachedDays = calendarDaysRef.current[listingId];
    if (cachedDays) {
      setCalendarPrices(buildCalendarPayload(cachedDays));
      setCalendarError("");
    } else {
      setCalendarPrices(null);
    }
    if (!isListingCalendarOpen) return;
  }, [activeListing, isListingCalendarOpen]);

  useEffect(() => {
    if (activeSectionKey) {
      setActiveListing(null);
      setSectionAvailabilityError("");
      setSectionAvailabilityActive(false);
      setSectionAvailabilityMap({});
      setIsInquiryOpen(false);
      setInquiryListing(null);
      setIsCheckoutGuestOpen(false);
      setPendingCheckout(null);
      setCheckoutGuestError("");
      setCheckoutPromoCode("");
      setCheckoutPromoError("");
      setCheckoutAppliedPromo(null);
      setSectionHeroIndex(0);
      setSectionQuotes({});
      setExpandedQuoteRows({});
      setSectionCalendarError("");
      setSectionCalendarMonthIndex(0);
      setSectionCalendarMinNightsOverride(null);
      setIsReviewExpanded(false);
      setShowAllAmenities(false);
    }
  }, [activeSectionKey]);

  const openZoomImage = (src) => {
    if (!src) return;
    setZoomImageUrl(src);
    setZoomLevel(1);
    setZoomPan({ x: 0, y: 0 });
  };

  const handleImagePreview = (event, src, nextIndex) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (typeof nextIndex === "number") {
      setActiveImageIndex(nextIndex);
    }
    openZoomImage(src);
  };

  const zoomCanvasRef = useRef(null);
  const zoomImageRef = useRef(null);

  const getCoverZoom = () => {
    const container = zoomCanvasRef.current;
    const img = zoomImageRef.current;
    if (!container || !img) return 1;
    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height || !imgRect.width || !imgRect.height) return 1;
    const baseWidth = imgRect.width / zoomLevel;
    const baseHeight = imgRect.height / zoomLevel;
    if (!baseWidth || !baseHeight) return 1;
    const scaleX = containerRect.width / baseWidth;
    const scaleY = containerRect.height / baseHeight;
    return Math.max(scaleX, scaleY, 1);
  };

  const clampZoom = (value) => {
    const minZoom = getCoverZoom();
    return Math.min(5, Math.max(minZoom, value));
  };

  const clampZoomPan = (pan) => {
    const container = zoomCanvasRef.current;
    const img = zoomImageRef.current;
    if (!container || !img) return pan;
    const containerRect = container.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height || !imgRect.width || !imgRect.height) return pan;
    const baseWidth = imgRect.width / zoomLevel;
    const baseHeight = imgRect.height / zoomLevel;
    const scaledWidth = baseWidth * zoomLevel;
    const scaledHeight = baseHeight * zoomLevel;
    const maxX = Math.max(0, (scaledWidth - containerRect.width) / 2);
    const maxY = Math.max(0, (scaledHeight - containerRect.height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, pan.x)),
      y: Math.min(maxY, Math.max(-maxY, pan.y)),
    };
  };

  useEffect(() => {
    if (!zoomImageUrl) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [zoomImageUrl]);

  useEffect(() => {
    if (!zoomImageUrl) return;
    const target = zoomCanvasRef.current;
    if (!target) return;
    const handleWheel = (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      setZoomLevel((value) => clampZoom(value + delta));
    };
    target.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      target.removeEventListener("wheel", handleWheel);
    };
  }, [zoomImageUrl, clampZoom]);

  useEffect(() => {
    if (!zoomImageUrl) return;
    setZoomPan((prev) => {
      const next = clampZoomPan(prev);
      return next.x === prev.x && next.y === prev.y ? prev : next;
    });
  }, [zoomImageUrl, zoomLevel]);

  useEffect(() => {
    if (!isPanningRef.current) return;
    const handleMove = (event) => {
      const nextX = panOriginRef.current.x + (event.clientX - panStartRef.current.x);
      const nextY = panOriginRef.current.y + (event.clientY - panStartRef.current.y);
      setZoomPan({ x: nextX, y: nextY });
    };
    const handleUp = () => {
      isPanningRef.current = false;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [zoomPan]);


  useEffect(() => {
    if (!isInquiryOpen) return;
    const handleEsc = (event) => {
      if (event.key === "Escape") setIsInquiryOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isInquiryOpen]);

  useEffect(() => {
    if (!isCheckoutGuestOpen) return;
    const handleEsc = (event) => {
      if (event.key === "Escape") setIsCheckoutGuestOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isCheckoutGuestOpen]);

  useEffect(() => {
    if (!isCheckoutGuestOpen) return;
    requestAnimationFrame(() => {
      const canvas = checkoutSignatureCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setCheckoutConsentSignatureDataUrl("");
    });
  }, [isCheckoutGuestOpen]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Listings failed: ${res.status}`);
        const json = await res.json();
        if (!active) return;
        const results = Array.isArray(json.results)
          ? json.results.map((listing) => normalizeListingPricing(listing))
          : [];
        setListings(results);
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

  useEffect(() => {
    if (!routeListingId) {
      setActiveListing(null);
      setActiveImageIndex(0);
      return;
    }
    if (!listings.length) {
      setActiveListing(null);
      return;
    }
    const hasRouteListingId = (listing) =>
      String(listing.id || listing._id || listing.unitTypeId || "") === String(routeListingId);
    const cityListings = listings.filter((listing) => isLosAngelesListing(listing));
    const match = cityListings.find(hasRouteListingId);
    const crossCityMatch = listings.find(hasRouteListingId);
    if (!match && crossCityMatch) {
      const targetRoute = getListingCityRoute(crossCityMatch);
      if (targetRoute !== "/los-angeles") {
        navigate(`${targetRoute}/listing/${encodeURIComponent(routeListingId)}${location.search || ""}`, { replace: true });
        return;
      }
    }
    if (!match) {
      navigate("/los-angeles", { replace: true });
      return;
    }
    const resolved =
      isChildListing(match) && getListingGroupKey(match)
        ? cityListings.find(
          (entry) =>
            !isChildListing(entry) && getListingGroupKey(entry) === getListingGroupKey(match)
        ) || match
        : match;
    setActiveListing(resolved);
    setActiveImageIndex(0);
  }, [routeListingId, listings, navigate, location.search]);

  useEffect(() => {
    if (!isListingRoute) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [isListingRoute, routeListingId]);

  useEffect(() => {
    if (!isMapEnabled) return;
    if (!mapsApiKey) {
      setMapError("Map service is unavailable.");
      return;
    }
    if (!mapRef.current || mapLoadedRef.current) return;
    setMapError("");
    const target = mapRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || mapLoadedRef.current) return;
        mapLoadedRef.current = true;
        loadGoogleMaps(mapsApiKey)
          .then((maps) => {
            const map = new maps.Map(target, {
              center: PROPERTY_COORDS,
              zoom: 14,
              minZoom: 3,
              maxZoom: 21,
              gestureHandling: "greedy",
              scrollwheel: true,
              draggable: true,
              keyboardShortcuts: true,
              zoomControl: true,
              fullscreenControl: false,
              mapTypeControl: false,
              streetViewControl: false,
              styles: [
                { featureType: "poi", stylers: [{ visibility: "off" }] },
                { featureType: "poi.business", stylers: [{ visibility: "off" }] },
                { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
              ],
            });
            mapsApiRef.current = maps;
            mapInstanceRef.current = map;

            const infoWindow = new maps.InfoWindow();

            const geocoder = new maps.Geocoder();
            geocoderRef.current = geocoder;
            geocoder.geocode({ address: PROPERTY_ADDRESS }, (results, status) => {
              if (status === "OK" && results?.[0]?.geometry?.location) {
                map.setCenter(results[0].geometry.location);
              }
            });

            const transitLayer = new maps.TransitLayer();
            transitLayer.setMap(map);

            const placesService = new maps.places.PlacesService(map);
            LANDMARKS.forEach((name) => {
              placesService.textSearch(
                {
                  query: name,
                  location: map.getCenter(),
                  radius: 2500,
                },
                (results, status) => {
                  if (status !== maps.places.PlacesServiceStatus.OK || !results?.length) return;
                  const place = results[0];
                  const marker = new maps.Marker({
                    map,
                    position: place.geometry?.location,
                    title: place.name,
                  });
                  marker.addListener("click", () => {
                    infoWindow.setContent(`<strong>${place.name}</strong>`);
                    infoWindow.open(map, marker);
                  });
                }
              );
            });

            if (losAngelesListingsRef.current.length) {
              syncListingMarkers(losAngelesListingsRef.current);
            }

            maps.event.addListener(map, "zoom_changed", () => {
              syncListingMarkers(losAngelesListingsRef.current, { fitBounds: false });
            });
          })
          .catch((err) => {
            console.error(err);
            mapLoadedRef.current = false;
            setMapError("Unable to load map.");
          });
      },
      { threshold: 0.25 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isMapEnabled, mapsApiKey]);

  const losAngelesListings = useMemo(() => {
    return listings.filter((listing) => {
      return isLosAngelesListing(listing);
    });
  }, [listings, isMapEnabled, mapsApiKey]);

  const getSectionListings = useCallback(
    (sectionKey, fallback = []) => {
      if (!sectionKey) return fallback || [];
      if (!losAngelesListings.length) return fallback || [];
      const filtered = losAngelesListings.filter(
        (listing) => getBuildingKey(listing) === sectionKey
      );
      return filtered.length ? filtered : fallback || [];
    },
    [losAngelesListings]
  );

  const losAngelesParentListings = useMemo(() => {
    if (!losAngelesListings.length) return [];
    const parentGroups = groupListingsByParent(losAngelesListings);
    return Object.values(parentGroups)
      .map((group) => group.parent || group.children?.[0])
      .filter(Boolean);
  }, [losAngelesListings]);

  const syncListingMarkers = (
    listingsToUse = losAngelesListingsRef.current,
    { fitBounds = true } = {}
  ) => {
    const maps = mapsApiRef.current;
    const map = mapInstanceRef.current;
    if (!maps || !map) return;

    listingMarkersRef.current.forEach((marker) => marker.setMap(null));
    listingMarkersRef.current = [];

    let infoWindow = listingInfoRef.current;
    if (!infoWindow) {
      infoWindow = new maps.InfoWindow();
      listingInfoRef.current = infoWindow;
    }

    const listingMarkerIcon = {
      path: maps.SymbolPath.CIRCLE,
      scale: 26,
      fillColor: "#1f1c19",
      fillOpacity: 1,
      strokeColor: "#c9b59c",
      strokeWeight: 2,
    };
    const listingLogoIcon = {
      url: LOGO_URL,
      scaledSize: new maps.Size(26, 26),
      anchor: new maps.Point(13, 13),
    };

    const bounds = new maps.LatLngBounds();
    let hasBounds = false;
    const geocoder = geocoderRef.current;
    const parentGroups = groupListingsByParent(listingsToUse);
    const parentListings = Object.values(parentGroups)
      .map((group) => group.parent || group.children?.[0])
      .filter(Boolean);
    const clusters = new Map();
    const getClusterStep = () => {
      const zoom = typeof map.getZoom === "function" ? map.getZoom() : 13;
      if (zoom <= 10) return 0.25;
      if (zoom <= 12) return 0.12;
      if (zoom <= 14) return 0.06;
      if (zoom <= 16) return 0.03;
      if (zoom <= 18) return 0.015;
      return 0.008;
    };
    const addToCluster = (coords, listing) => {
      const groupKey = getBuildingKey(listing);
      const groupOffsets = {
        "la-downtown": { lat: 0.0012, lng: 0.0 },
        "la-hwh": { lat: -0.0012, lng: 0.0 },
        "la-hollywood": { lat: 0.0, lng: 0.0012 },
        other: { lat: 0.0, lng: -0.0012 },
      };
      const offset = groupOffsets[groupKey] || groupOffsets.other;
      const adjusted = {
        lat: coords.lat + offset.lat,
        lng: coords.lng + offset.lng,
      };
      const listingKey = getListingId(listing) || formatAddress(listing) || `${adjusted.lat},${adjusted.lng}`;
      const key = `${listingKey}`;
      if (!clusters.has(key)) {
        clusters.set(key, { coords: adjusted, listings: [] });
      }
      clusters.get(key).listings.push(listing);
    };

    parentListings.forEach((listing) => {
      let coords = getListingCoords(listing);
      if (!coords) {
        const address = formatAddress(listing);
        const cacheKey = getListingId(listing) || address;
        if (cacheKey && geocodeCacheRef.current.has(cacheKey)) {
          coords = geocodeCacheRef.current.get(cacheKey);
        } else if (geocoder && address && cacheKey && !geocodeInFlightRef.current.has(cacheKey)) {
          geocodeInFlightRef.current.add(cacheKey);
          geocoder.geocode({ address }, (results, status) => {
            geocodeInFlightRef.current.delete(cacheKey);
            if (status === "OK" && results?.[0]?.geometry?.location) {
              const location = results[0].geometry.location;
              geocodeCacheRef.current.set(cacheKey, {
                lat: location.lat(),
                lng: location.lng(),
              });
              syncListingMarkers(listingsToUse);
            }
          });
        }
      }
      if (!coords) return;
      addToCluster(coords, listing);
    });

    const resolveListingTitle = (listing) =>
      listing?.title || "OneLuxStay";

    const toParentListing = (listing) => {
      const groupKey = getListingGroupKey(listing);
      if (!groupKey) return listing;
      const parent = listingsToUse.find(
        (entry) => !isChildListing(entry) && getListingGroupKey(entry) === groupKey
      );
      return parent || listing;
    };

    clusters.forEach(({ coords, listings: clusterListings }) => {
      const parents = clusterListings.map(toParentListing);
      const uniqueParents = [];
      const seen = new Set();
      parents.forEach((entry) => {
        const id = getListingId(entry);
        if (id && seen.has(id)) return;
        if (id) seen.add(id);
        uniqueParents.push(entry);
      });
      const primary = uniqueParents[0] || clusterListings[0];
      const title = resolveGroupTitle(primary);
      const isCluster = clusterListings.length > 1;
      const backgroundMarker = new maps.Marker({
        map,
        position: coords,
        icon: listingMarkerIcon,
        zIndex: 10,
      });
      const marker = new maps.Marker({
        map,
        position: coords,
        title,
        icon: listingLogoIcon,
        zIndex: 11,
      });
      const clickTarget = marker || backgroundMarker;
      clickTarget.addListener("click", () => {
        const items = uniqueParents
          .map((entry) => {
            const entryTitle = resolveListingTitle(entry);
            const entryAddress = formatAddress(entry);
            return `<li><strong>${escapeHtml(entryTitle)}</strong><br />${escapeHtml(entryAddress)}</li>`;
          })
          .join("");
        const content = `
          <div>
            <strong>${escapeHtml(title)}</strong>
            <ul style="margin:8px 0 0 16px;padding:0;">${items}</ul>
          </div>`;
        infoWindow.setContent(content);
        infoWindow.open(map, clickTarget);
      });
      listingMarkersRef.current.push(backgroundMarker);
      if (marker) listingMarkersRef.current.push(marker);
      bounds.extend(coords);
      hasBounds = true;
    });

    if (hasBounds && fitBounds) {
      map.fitBounds(bounds, { top: 80, right: 80, bottom: 80, left: 80 });
      const westlake = new maps.LatLng(PROPERTY_COORDS.lat, PROPERTY_COORDS.lng);
      if (bounds.contains(westlake)) {
        map.panTo(westlake);
      }
    }
  };

  useEffect(() => {
    losAngelesListingsRef.current = losAngelesListings;
    syncListingMarkers(losAngelesListings);
  }, [losAngelesListings]);

  const groupedListingsAll = useMemo(() => {
    const groups = BUILDING_GROUPS.reduce((acc, group) => {
      acc[group.key] = { label: group.label, listings: [] };
      return acc;
    }, {});
    const other = [];
    losAngelesListings.forEach((listing) => {
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
      ordered.push({ key: "other", label: "Dodger Stadium", listings: other });
    }
    return ordered.filter((group) => group.listings.length);
  }, [losAngelesListings]);

  const groupedListingsDisplay = useMemo(() => {
    const groups = BUILDING_GROUPS.reduce((acc, group) => {
      acc[group.key] = { label: group.label, listings: [] };
      return acc;
    }, {});
    const other = [];
    losAngelesParentListings.forEach((listing) => {
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
      ordered.push({ key: "other", label: "Dodger Stadium", listings: other });
    }
    return ordered.filter((group) => group.listings.length);
  }, [losAngelesParentListings]);

  const sectionsByKey = useMemo(() => {
    return groupedListingsAll.reduce((acc, group) => {
      acc[group.key] = group;
      return acc;
    }, {});
  }, [groupedListingsAll]);

  useEffect(() => {
    if (!routeAreaSlug) return;
    const sectionKey = resolveSectionKeyFromSlug(routeAreaSlug);
    if (!sectionKey || !sectionsByKey[sectionKey]) return;
    setActiveSectionKey((current) => (current === sectionKey ? current : sectionKey));
  }, [routeAreaSlug, sectionsByKey]);

  const activeSection = activeSectionKey ? sectionsByKey[activeSectionKey] : null;
  const handleListingTabClick = (next) => {
    setListingTab(next);
    const el = document.getElementById(`la-${next}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const listingMinNightsFallback = useMemo(() => {
    if (typeof calendarMinNightsOverride === "number") return calendarMinNightsOverride;
    return getListingMinNightsWithParent(activeListing, losAngelesListings);
  }, [calendarMinNightsOverride, activeListing, losAngelesListings]);
  const sectionMinNightsFallback = useMemo(() => {
    if (!activeSection?.listings?.length) return null;
    const values = activeSection.listings
      .map((listing) => getListingMinNightsWithParent(listing, activeSection.listings))
      .filter((value) => typeof value === "number");
    const listingFallback = values.length ? Math.max(...values) : null;
    if (typeof sectionCalendarMinNightsOverride === "number") {
      return Math.max(sectionCalendarMinNightsOverride, listingFallback || 0) || sectionCalendarMinNightsOverride;
    }
    return listingFallback;
  }, [activeSection, sectionCalendarMinNightsOverride]);

  const fetchCalendarMonth = async (
    listingId,
    targetDate,
    cacheRef,
    daysRef,
    inflightRef,
    setLoading,
    setError,
    setPrices,
    hasRetried = false
  ) => {
    if (!cacheRef || !daysRef || !inflightRef) return;
    if (!cacheRef.current) cacheRef.current = {};
    if (!daysRef.current) daysRef.current = {};
    if (!inflightRef.current) inflightRef.current = {};
    const key = `${listingId}-${monthKey(targetDate)}`;
    if (cacheRef.current[key]) return;
    if (calendarGlobalCacheRef.current[key]) {
      cacheRef.current[key] = true;
      const sharedDays = calendarGlobalDaysRef.current[listingId];
      if (sharedDays) {
        daysRef.current[listingId] = { ...(daysRef.current[listingId] || {}), ...sharedDays };
        setPrices(buildCalendarPayload(daysRef.current[listingId]));
      }
      fetchCalendarMinNightsFromMulti(listingId, targetDate);
      return;
    }
    if (inflightRef.current[key]) return;
    if (calendarGlobalInflightRef.current[key]) return;
    inflightRef.current[key] = true;
    calendarGlobalInflightRef.current[key] = true;
    if (!daysRef.current[listingId]) {
      daysRef.current[listingId] = {};
    }
    const existingDays = daysRef.current[listingId];
    if (existingDays && hasMonthData(existingDays, targetDate)) {
      cacheRef.current[key] = true;
      calendarGlobalCacheRef.current[key] = true;
      calendarGlobalDaysRef.current[listingId] = {
        ...(calendarGlobalDaysRef.current[listingId] || {}),
        ...existingDays,
      };
      setPrices(buildCalendarPayload(existingDays));
      inflightRef.current[key] = false;
      calendarGlobalInflightRef.current[key] = false;
      return;
    }
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        startDate: toISODate(targetDate),
        months: "1",
        guests: "2",
      });
      const res = await fetch(`${apiBase}/check-units/listings/${listingId}/calendar-prices?${qs}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Calendar pricing failed");
      }
      const rateLimited =
        data?.rateLimited ||
        (Array.isArray(data?.errors) &&
          data.errors.some((err) => String(err?.message || "").includes("Rate limited")));
      if (rateLimited && !hasRetried) {
        setError("Rates are busy. Retrying...");
        setLoading(false);
        inflightRef.current[key] = false;
        calendarGlobalInflightRef.current[key] = false;
        setTimeout(() => {
          fetchCalendarMonth(
            listingId,
            targetDate,
            cacheRef,
            daysRef,
            inflightRef,
            setLoading,
            setError,
            setPrices,
            true
          );
        }, 1200);
        return;
      }
      if (!rateLimited || (data?.days && data.days.length)) {
        cacheRef.current[key] = true;
        calendarGlobalCacheRef.current[key] = true;
      }
      if (!daysRef.current[listingId]) {
        daysRef.current[listingId] = {};
      }
      const map = daysRef.current[listingId];
      (data.days || []).forEach((day) => {
        if (day?.date) map[day.date] = day;
      });
      calendarGlobalDaysRef.current[listingId] = {
        ...(calendarGlobalDaysRef.current[listingId] || {}),
        ...map,
      };
      setPrices(buildCalendarPayload(map));
      fetchCalendarMinNightsFromMulti(listingId, targetDate);
    } catch (err) {
      setError(err?.message || "Calendar pricing is unavailable.");
    } finally {
      setLoading(false);
      inflightRef.current[key] = false;
      calendarGlobalInflightRef.current[key] = false;
    }
  };

  const fetchCalendarMinNightsFromMulti = async (listingId, targetDate) => {
    const key = `${listingId}-${monthKey(targetDate)}`;
    if (calendarMinNightsCacheRef.current[key]) return;
    calendarMinNightsCacheRef.current[key] = true;
    try {
      const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 12, 1);
      const qs = new URLSearchParams({
        listingIds: listingId,
        startDate: toISODate(monthStart),
        endDate: toISODate(monthEnd),
        includeAllotment: "true",
      }).toString();
      const res = await fetch(`${apiBase}/check-units/listings/calendar-multi?${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      let days = null;
      if (data?.normalizedCalendars?.[listingId]) {
        days = data.normalizedCalendars[listingId];
      } else {
        const calendarEntries = Array.isArray(data?.calendars)
          ? data.calendars
          : Array.isArray(data?.listings)
            ? data.listings
            : Array.isArray(data?.data)
              ? data.data
              : [];
        const entry = calendarEntries.find((item) => getCalendarEntryId(item) === listingId);
        if (entry) {
          const rawDays = entry?.days || entry?.calendar || entry?.data || [];
          days = rawDays
            .map((day) => normalizeCalendarDayForUi(day, entry?.currency))
            .filter(Boolean);
        }
      }
      const normalizedDays = Array.isArray(days)
        ? days.map((day) => normalizeCalendarDayForUi(day, null)).filter(Boolean)
        : [];
      const minNights = extractMinNightsFromDays(normalizedDays);
      if (typeof minNights === "number") {
        setCalendarMinNightsOverride(minNights);
      }
      if (normalizedDays.length) {
        if (!calendarDaysRef.current[listingId]) {
          calendarDaysRef.current[listingId] = {};
        }
        const map = calendarDaysRef.current[listingId];
        normalizedDays.forEach((day) => {
          if (!day?.date) return;
          const existing = map[day.date] || {};
          map[day.date] = {
            ...existing,
            date: day.date,
            price: typeof day.price === "number" ? day.price : existing.price ?? null,
            currency: day.currency || existing.currency || null,
            restrictions: {
              ...existing.restrictions,
              minNights: day?.restrictions?.minNights ?? existing?.restrictions?.minNights ?? null,
              maxNights: day?.restrictions?.maxNights ?? existing?.restrictions?.maxNights ?? null,
              closedToArrival: day?.restrictions?.closedToArrival ?? existing?.restrictions?.closedToArrival ?? false,
              closedToDeparture: day?.restrictions?.closedToDeparture ?? existing?.restrictions?.closedToDeparture ?? false,
            },
          };
        });
        calendarGlobalDaysRef.current[listingId] = {
          ...(calendarGlobalDaysRef.current[listingId] || {}),
          ...map,
        };
        setCalendarPrices(buildCalendarPayload(map));
      }
    } catch {
      // ignore multi calendar failures for min nights
    }
  };

  const fetchSectionCalendarMultiMonth = async (listingIds, targetDate) => {
    if (!listingIds.length) return;
    const primaryId = getPrimaryListingId(activeSection?.listings || []);
    if (!primaryId) return;
    const key = `${primaryId}-${monthKey(targetDate)}`;
    if (sectionCalendarCacheRef.current[key]) return;

    setSectionCalendarLoading(true);
    setSectionCalendarError("");

    try {
      const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 12, 1);
      const pricingListing = getLowestPriceListing(activeSection?.listings || []);
      const pricingListingId = getListingId(pricingListing) || listingIds[0];
      const qs = new URLSearchParams({
        listingIds: pricingListingId,
        startDate: toISODate(monthStart),
        endDate: toISODate(monthEnd),
        includeAllotment: "true",
      }).toString();

      const res = await fetch(`${apiBase}/check-units/listings/calendar-multi?${qs}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Calendar pricing failed");
      }

      const calendarEntries = Array.isArray(data?.calendars)
        ? data.calendars
        : Array.isArray(data?.listings)
          ? data.listings
          : Array.isArray(data?.data)
            ? data.data
            : [];
      const currencyFallback =
        pricingListing?.currency || activeSection?.listings?.[0]?.currency || "USD";
      let days = [];

      if (data?.normalizedCalendars?.[pricingListingId]) {
        days = data.normalizedCalendars[pricingListingId];
      } else if (Array.isArray(data?.data?.days)) {
        days = data.data.days;
      } else {
        const entry = calendarEntries.find(
          (item) => getCalendarEntryId(item) === pricingListingId
        );
        if (entry) {
          days = entry?.days || entry?.calendar || entry?.data || [];
        }
      }

      const dayMap = {};
      days
        .map((day) => normalizeCalendarDayForUi(day, currencyFallback))
        .filter(Boolean)
        .forEach((day) => {
          dayMap[day.date] = day;
        });

      sectionCalendarDaysRef.current[primaryId] = dayMap;
      sectionCalendarCacheRef.current[key] = true;
      setSectionCalendarPrices(buildCalendarPayload(dayMap));
      const minNightsOverride = extractMinNightsFromDays(Object.values(dayMap));
      if (typeof minNightsOverride === "number") {
        setSectionCalendarMinNightsOverride(minNightsOverride);
      }
    } catch (err) {
      setSectionCalendarError(err?.message || "Calendar pricing is unavailable.");
    } finally {
      setSectionCalendarLoading(false);
    }
  };

  const handleSectionCalendarOpen = (open) => {
    setIsSectionCalendarOpen(open);
    if (!open || !activeSection) return;
    const baseDate = parseDateValue(sectionCheckIn) || new Date();
    baseDate.setDate(1);
    baseDate.setHours(0, 0, 0, 0);
    setSectionCalendarStartDate(baseDate);
    const listingIds = activeSection.listings
      .map((listing) => listing.id || listing._id)
      .filter(Boolean);
    if (!listingIds.length) return;
    fetchSectionCalendarMultiMonth(listingIds, baseDate);
  };

  const handleListingCalendarOpen = (open) => {
    setIsListingCalendarOpen(open);
    if (!open || !activeListing) return;
    const baseDate = parseDateValue(sectionCheckIn) || new Date();
    baseDate.setDate(1);
    baseDate.setHours(0, 0, 0, 0);
    setCalendarStartDate(baseDate);
    setCalendarMonthIndex(0);
    const listingId = getCalendarListingId(activeListing, losAngelesListings);
    if (!listingId) return;
    fetchCalendarMonth(
      listingId,
      baseDate,
      calendarCacheRef,
      calendarDaysRef,
      calendarInflightRef,
      setCalendarLoading,
      setCalendarError,
      setCalendarPrices
    );
  };

  const openInquiry = (listing) => {
    if (!listing) return;
    setInquiryListing(listing);
    setIsInquiryOpen(true);
  };

  const fetchHouseRules = async (unitTypeId) => {
    if (!unitTypeId) return;
    if (houseRulesByUnit[unitTypeId]) return;
    try {
      setHouseRulesLoading(true);
      setHouseRulesError("");
      const res = await fetch(
        `${apiBase}/house-rules?unitTypeId=${encodeURIComponent(unitTypeId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "House rules request failed.");
      }
      setHouseRulesByUnit((prev) => ({ ...prev, [unitTypeId]: data }));
    } catch (err) {
      setHouseRulesError(err?.message || "House rules are unavailable.");
    } finally {
      setHouseRulesLoading(false);
    }
  };

  useEffect(() => {
    if (!activeSection) return;
    const listingId =
      activeSection.listings[0]?.unitTypeId ||
      activeSection.listings[0]?.id ||
      activeSection.listings[0]?._id;
    if (!listingId) return;
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    setSectionCalendarStartDate(start);
    setSectionCalendarMonthIndex(0);
    const cachedDays = sectionCalendarDaysRef.current[listingId];
    if (cachedDays) {
      setSectionCalendarPrices(buildCalendarPayload(cachedDays));
      setSectionCalendarError("");
    } else {
      setSectionCalendarPrices(null);
    }
  }, [activeSection]);

  useEffect(() => {
    if (!groupedListingsAll.length || !sectionCheckIn || !sectionCheckOut) {
      setBuildingPrices({});
      return;
    }
    let active = true;
    const load = async () => {
      const nights = diffNights(sectionCheckIn, sectionCheckOut);
      const results = {};
      const getManualTotal = (quoteData, listingContext) => {
        const plans = Array.isArray(quoteData?.rates?.ratePlans)
          ? quoteData.rates.ratePlans
          : [];
        const filteredPlans = plans.filter((plan) => {
          const label = plan?.ratePlan?.name || plan?.ratePlan?.title || plan?.ratePlan?.description || "";
          return /standard|non[- ]?refundable/i.test(label);
        });
        let minTotal = null;
        (filteredPlans.length ? filteredPlans : plans).forEach((plan) => {
          const money = plan?.money?.money || plan?.money || quoteData?.money?.money || quoteData?.money || {};
          const invoiceItems = Array.isArray(money?.invoiceItems) ? money.invoiceItems : [];
          const invoiceTotal = invoiceItems.reduce(
            (acc, item) => acc + (typeof item?.amount === "number" ? item.amount : 0),
            0
          );
          const label = plan?.ratePlan?.name || plan?.ratePlan?.title || plan?.ratePlan?.description || "";
          const isNonRefundable =
            /non[- ]?refundable/i.test(label) ||
            Boolean(plan?.ratePlan?.cancellationPolicy?.isNonRefundable);
          const discountRate = isNonRefundable ? 0.15 : 0.1;
          const accommodationItem = invoiceItems.find((item) => {
            const type = (item?.normalType || item?.type || "").toUpperCase();
            return type === "AF" || type === "ACCOMMODATION_FARE";
          });
          const accommodationAmount =
            typeof accommodationItem?.amount === "number"
              ? accommodationItem.amount
              : typeof money?.fareAccommodation === "number"
                ? money.fareAccommodation
                : 0;
          const cleaningAmount =
            typeof money?.fareCleaning === "number" ? money.fareCleaning : 0;
          const discountedAccommodation =
            accommodationAmount > 0 ? accommodationAmount * (1 - discountRate) : accommodationAmount;
          const taxAmount = computeTaxes(discountedAccommodation, listingContext);
          const total = discountedAccommodation + cleaningAmount + taxAmount;
          if (minTotal === null || total < minTotal) {
            minTotal = total;
          }
        });
        return { total: minTotal };
      };

      const requests = groupedListingsAll
        .map((group) => {
          const listing =
            group.listings.find((entry) => !isChildListing(entry)) || group.listings[0];
          const listingId = listing?.id || listing?._id;
          if (!listingId) return null;
          return {
            listingId,
            checkInDateLocalized: sectionCheckIn,
            checkOutDateLocalized: sectionCheckOut,
            guestsCount: "1",
          };
        })
        .filter(Boolean);

      if (!requests.length) {
        if (active) setBuildingPrices({});
        return;
      }

      try {
        const res = await fetch(`${apiBase}/check-units/reservations/quotes-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });
        if (!res.ok) return;
        const quoteJson = await res.json();
        const resultMap = quoteJson?.results || {};
        groupedListingsAll.forEach((group) => {
          const listing =
            group.listings.find((entry) => !isChildListing(entry)) || group.listings[0];
          const listingId = listing?.id || listing?._id;
          if (!listingId) return;
          const quoteData = resultMap[listingId];
          if (!quoteData) return;
          const pricing = getQuotePricing(quoteData, listing, nights);
          const manualTotals = getManualTotal(quoteData, listing);
          const total =
            (typeof manualTotals?.total === "number" && manualTotals.total > 0
              ? manualTotals.total
              : pricing?.breakdown?.total ?? pricing?.breakdown?.subtotal) ?? null;
          if (typeof total === "number") {
            results[group.key] = { total, currency: pricing?.currency || listing.currency || "USD" };
          }
        });
      } catch {
        // ignore quote failures
      }

      if (active) setBuildingPrices(results);
    };
    load();
    return () => {
      active = false;
    };
  }, [groupedListingsAll, sectionCheckIn, sectionCheckOut]);

  useEffect(() => {
    if (!activeListing) return;
    const unitTypeId = activeListing.unitTypeId || activeListing.id || activeListing._id;
    if (!unitTypeId) return;
    fetchHouseRules(unitTypeId);
  }, [activeListing]);
  useEffect(() => {
    if (!sectionQuotes) return;
    setSelectedRatePlans((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(sectionQuotes).forEach(([listingId, quote]) => {
        const plans = quote?.plans || [];
        if (!plans.length) return;
        const defaultId = quote.defaultPlanId || plans[0].id;
        if (!next[listingId]) {
          next[listingId] = defaultId;
          changed = true;
          return;
        }
        if (!plans.some((plan) => plan.id === next[listingId])) {
          next[listingId] = defaultId;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sectionQuotes]);

  const findScrollableAncestor = (node) => {
    let current = node?.parentElement || null;
    while (current && current !== document.body) {
      const overflowY = window.getComputedStyle(current).overflowY;
      const canScroll =
        (overflowY === "auto" || overflowY === "scroll") &&
        current.scrollHeight > current.clientHeight;
      if (canScroll) return current;
      current = current.parentElement;
    }
    return null;
  };

  const scrollToAvailabilityTable = () => {
    const tableNode = availabilityTableRef.current;
    if (!tableNode || typeof window === "undefined") return;

    const explicitContainer =
      tableNode.closest(".la-section-modal") || tableNode.closest(".la-unit-modal");
    const scrollContainer = explicitContainer || findScrollableAncestor(tableNode);

    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const tableRect = tableNode.getBoundingClientRect();
      const targetTop = scrollContainer.scrollTop + (tableRect.top - containerRect.top) - 20;
      scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      return;
    }

    tableNode.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const fetchAvailabilityListings = async ({ listingIds, listingId, shouldScroll = false } = {}) => {
    if (!sectionCheckIn || !sectionCheckOut) {
      setSectionAvailabilityError("Select check-in and check-out dates first.");
      return;
    }
    if (shouldScroll) {
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(scrollToAvailabilityTable);
      } else {
        scrollToAvailabilityTable();
      }
    }
    setSectionAvailabilityLoading(true);
    setSectionAvailabilityError("");
    try {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let calendarMultiLoaded = false;
      const listingPool = (() => {
        if (activeSection?.listings?.length) {
          const sectionListings = getSectionListings(activeSection.key, activeSection.listings);
          return sectionListings.length ? sectionListings : activeSection.listings;
        }
        if (!activeListing) return [];
        const groupKey = getListingGroupKey(activeListing);
        if (!groupKey) return [activeListing];
        return losAngelesListings.filter((listing) => getListingGroupKey(listing) === groupKey);
      })();
      const childIds = listingPool
        .filter((listing) => isChildListing(listing))
        .map((listing) => listing.id || listing._id || listing.unitTypeId)
        .filter(Boolean);
      if (!childIds.length && activeListing) {
        const fallbackId = activeListing.unitTypeId || activeListing.id || activeListing._id;
        if (fallbackId) childIds.push(fallbackId);
      }
      const itemsFromArg = Array.isArray(listingIds)
        ? listingIds.filter((id) => childIds.includes(id))
        : [];
      const items = (itemsFromArg.length ? itemsFromArg : childIds).filter(Boolean);
      if (!items.length) {
        setSectionAvailabilityError("No units found for availability.");
        setSectionAvailabilityLoading(false);
        return;
      }
      const nights = diffNights(sectionCheckIn, sectionCheckOut);
      const qs = new URLSearchParams({
        listingIds: items.join(","),
        startDate: sectionCheckIn,
        endDate: sectionCheckOut,
        minOccupancy: sectionGuests || "1",
      }).toString();
      const availabilityQs = new URLSearchParams({
        ids: items.join(","),
        checkIn: sectionCheckIn,
        checkOut: sectionCheckOut,
        minOccupancy: sectionGuests || "1",
      }).toString();
      const availabilityRes = await fetch(
        `${apiBase}/check-units/listings/availability-query?${availabilityQs}`,
        { cache: "no-store" }
      );
      if (!availabilityRes.ok) {
        const errText = await availabilityRes.text().catch(() => "");
        throw new Error(errText || "Availability failed");
      }
      const availabilityJson = await availabilityRes.json();
      const availabilityResults = Array.isArray(availabilityJson?.results)
        ? availabilityJson.results
        : [];
      const toKey = (value) => (value ? String(value) : null);
      const availableIds = new Set(
        availabilityResults.map((item) => toKey(item.id)).filter(Boolean)
      );
      const availabilityMap = {};
      const getListingIds = (listing) =>
        [listing?._id, listing?.id, listing?.unitTypeId]
          .map(toKey)
          .filter(Boolean);
      const isListingAvailable = (listing) =>
        getListingIds(listing).some((id) => availableIds.has(id));
      listingPool.forEach((listing) => {
        const ids = getListingIds(listing);
        const available = isListingAvailable(listing);
        ids.forEach((id) => {
          availabilityMap[id] = available;
        });
      });

      const childrenByParentId = new Map();
      listingPool.forEach((listing) => {
        if (!isChildListing(listing)) return;
        const parentId = toKey(listing?.unitTypeId);
        if (!parentId) return;
        if (!childrenByParentId.has(parentId)) {
          childrenByParentId.set(parentId, []);
        }
        childrenByParentId.get(parentId).push(listing);
      });

      const bulkRes = await fetch(`${apiBase}/check-units/listings/calendar-multi?${qs}`, {
        cache: "no-store",
      });
      if (!bulkRes.ok) {
        const errText = await bulkRes.text().catch(() => "");
        throw new Error(errText || "Availability failed");
      }
      const bulkJson = await bulkRes.json();
      const normalizedCalendars = bulkJson?.normalizedCalendars || null;
      const calendarEntries = Array.isArray(bulkJson?.calendars)
        ? bulkJson.calendars
        : Array.isArray(bulkJson?.listings)
          ? bulkJson.listings
          : Array.isArray(bulkJson?.data)
            ? bulkJson.data
            : Array.isArray(bulkJson?.results) && bulkJson.results.some((item) => item?.days || item?.calendar)
              ? bulkJson.results
              : [];

      // availability is driven by availability-query results (child-only)

      const parentGroups = groupListingsByParent(listingPool);
      const parentAvailabilityMap = {};
      const availableParents = Object.values(parentGroups)
        .map((group) => {
          const displayListing = group.parent || null;
          const displayIds = displayListing ? getListingIds(displayListing) : [];
          const parentIdKeys = new Set(
            [toKey(group.parentId), ...displayIds].map(toKey).filter(Boolean)
          );
          const relatedChildren = [...group.children];
          parentIdKeys.forEach((parentId) => {
            const extraChildren = childrenByParentId.get(parentId);
            if (extraChildren?.length) relatedChildren.push(...extraChildren);
          });
          const hasAvailableChild = relatedChildren.some((child) => isListingAvailable(child));
          const hasAvailableParent = displayListing ? isListingAvailable(displayListing) : false;
          const hasAvailable = hasAvailableChild || hasAvailableParent;
          parentAvailabilityMap[group.parentId] = hasAvailable;
          if (displayListing) {
            displayIds.forEach((displayId) => {
              if (displayId) parentAvailabilityMap[displayId] = hasAvailable;
            });
            if (displayListing.unitTypeId) {
              parentAvailabilityMap[toKey(displayListing.unitTypeId)] = hasAvailable;
            }
          }
          return displayListing;
        })
        .filter(Boolean);

      setSectionAvailability(availableParents);
      setSectionAvailabilityMap(parentAvailabilityMap);
      setSectionAvailabilityActive(true);

      const calendarListingId = listingId || getPrimaryListingId(listingPool);
      if (calendarListingId) {
        if (normalizedCalendars?.[calendarListingId]) {
          const dayMap = {};
          normalizedCalendars[calendarListingId]
            .map((day) => normalizeCalendarDayForUi(day, listingPool?.[0]?.currency))
            .filter(Boolean)
            .forEach((day) => {
              dayMap[day.date] = day;
            });
          sectionCalendarDaysRef.current[calendarListingId] = dayMap;
          setSectionCalendarPrices(buildCalendarPayload(dayMap));
          calendarMultiLoaded = true;
          const minNightsOverride = extractMinNightsFromDays(Object.values(dayMap));
          if (typeof minNightsOverride === "number") {
            setSectionCalendarMinNightsOverride(minNightsOverride);
          }
        } else if (calendarEntries.length) {
          const calendarEntry = calendarEntries.find(
            (entry) => getCalendarEntryId(entry) === calendarListingId
          );
          if (calendarEntry) {
            const days = calendarEntry?.days || calendarEntry?.calendar || calendarEntry?.data || [];
            const dayMap = {};
            days
              .map((day) => normalizeCalendarDayForUi(day, activeSection?.listings?.[0]?.currency))
              .filter(Boolean)
              .forEach((day) => {
                dayMap[day.date] = day;
              });
            sectionCalendarDaysRef.current[calendarListingId] = dayMap;
            setSectionCalendarPrices(buildCalendarPayload(dayMap));
            calendarMultiLoaded = true;
            const minNightsOverride = extractMinNightsFromDays(Object.values(dayMap));
            if (typeof minNightsOverride === "number") {
              setSectionCalendarMinNightsOverride(minNightsOverride);
            }
          }
        }
      }

      const quoteRequests = availableParents
        .map((listing) => {
          const quoteListingId = listing.id || listing._id;
          if (!quoteListingId) return null;
          return {
            listingId: quoteListingId,
            checkInDateLocalized: sectionCheckIn,
            checkOutDateLocalized: sectionCheckOut,
            guestsCount: sectionGuests || "1",
          };
        })
        .filter(Boolean);
      if (quoteRequests.length) {
        const res = await fetch(`${apiBase}/check-units/reservations/quotes-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: quoteRequests }),
        });
        if (res.ok) {
          const data = await res.json();
          const quotes = {};
          availableParents.forEach((listing) => {
            const listingKey = listing.id || listing._id;
            const quoteListingId = listing.id || listing._id;
            if (!listingKey || !quoteListingId) return;
            const quoteData = data?.results?.[quoteListingId];
            if (!quoteData) return;
            const pricing = getQuotePricing(quoteData, listing, nights);
            if (pricing) quotes[listingKey] = pricing;
          });
          setSectionQuotes(quotes);
        } else {
          setSectionQuotes({});
        }
      } else {
        setSectionQuotes({});
      }

      if (listingId && !calendarMultiLoaded) {
        const calendarKey = listingId;
        const monthStart = new Date(sectionCalendarStartDate);
        monthStart.setDate(1);
        fetchCalendarMonth(
          calendarKey,
          monthStart,
          sectionCalendarCacheRef,
          sectionCalendarDaysRef,
          sectionCalendarInflightRef,
          setSectionCalendarLoading,
          setSectionCalendarError,
          setSectionCalendarPrices
        );
      }
    } catch (err) {
      setSectionAvailabilityError(err.message || "Unable to load availability.");
    } finally {
      setSectionAvailabilityLoading(false);
    }
  };

  useEffect(() => {
    if (!routeAreaSlug || !activeSection?.listings?.length) return;
    if (sectionAvailabilityLoading) return;

    const params = new URLSearchParams(location.search);
    const bundle = parseRouteBookingBundle(routeBookingBundle);
    const routeCheckIn =
      normalizeRouteDate(routeCheckInParam) ||
      bundle.checkIn ||
      normalizeRouteDate(params.get("checkIn") || "");
    const routeCheckOut =
      normalizeRouteDate(routeCheckOutParam) ||
      bundle.checkOut ||
      normalizeRouteDate(params.get("checkOut") || "");
    const routeGuests =
      normalizeRouteGuests(routeGuestsParam) ||
      bundle.guests ||
      normalizeRouteGuests(params.get("guests") || "");

    if (!routeCheckIn || !routeCheckOut || !routeGuests) return;
    if (sectionCheckIn !== routeCheckIn || sectionCheckOut !== routeCheckOut) return;
    if ((sectionGuests || "2") !== routeGuests) return;

    const listingIds = activeSection.listings.map((listing) => getListingId(listing)).filter(Boolean);
    const listingId = getPrimaryListingId(activeSection.listings);
    if (!listingIds.length) return;

    const key = [
      routeAreaSlug,
      routeCheckIn,
      routeCheckOut,
      routeGuests,
      activeSection.key,
      listingIds.join(","),
    ].join("|");
    if (autoRouteAvailabilityKeyRef.current === key) return;
    autoRouteAvailabilityKeyRef.current = key;

    fetchAvailabilityListings({ listingIds, listingId });
  }, [
    routeAreaSlug,
    routeBookingBundle,
    routeCheckInParam,
    routeCheckOutParam,
    routeGuestsParam,
    location.search,
    activeSection,
    sectionCheckIn,
    sectionCheckOut,
    sectionGuests,
    sectionAvailabilityLoading,
  ]);

  useEffect(() => {
    if (routeAreaSlug) return;
    autoRouteAvailabilityKeyRef.current = "";
  }, [routeAreaSlug]);

  const handleSectionCheckout = async ({
    listingId,
    listingTitle,
    amount,
    currency,
    guest,
    breakdown,
    consentSignerName,
    consentSignatureDataUrl,
  }) => {
    if (!listingId) return;
    if (!sectionCheckIn || !sectionCheckOut) {
      setSectionAvailabilityError("Select check-in and check-out dates first.");
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      const message = "Pricing is unavailable. Please refresh availability.";
      setSectionAvailabilityError(message);
      setCheckoutGuestError(message);
      return;
    }

    setCheckoutGuestError("");
    setSectionAvailabilityError("");
    setSectionReserveLoadingId(listingId);

    try {
      const checkoutEndpoint =
        numericAmount <= 0
          ? `${apiBase}/check-units/checkout-free`
          : `${apiBase}/check-units/checkout`;
      const res = await fetch(checkoutEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          listingTitle,
          checkIn: sectionCheckIn,
          checkOut: sectionCheckOut,
          guests: Number(sectionGuests) || 1,
          amount: numericAmount,
          currency,
          breakdown,
          guest,
          consentSignerName,
          consentSignatureDataUrl,
          cancelPath: `${window.location.pathname}${window.location.search}`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || "Checkout failed");
      }
      if (json.url) {
        window.location.href = json.url;
        return;
      }
      if (json.redirectUrl) {
        window.location.href = json.redirectUrl;
        return;
      }
      throw new Error("Checkout failed");
    } catch (err) {
      const message = err.message || "Checkout failed";
      setSectionAvailabilityError(message);
      setCheckoutGuestError(message);
    } finally {
      setSectionReserveLoadingId(null);
    }
  };

  const confirmGuestCheckout = () => {
    if (!checkoutGuest.firstName || !checkoutGuest.lastName || !checkoutGuest.email || !checkoutGuest.phone) {
      setCheckoutGuestError("Add guest name, email, and phone to continue.");
      return;
    }
    if (!checkoutConsentSignerName.trim()) {
      setCheckoutGuestError("Please add the signer full name.");
      return;
    }
    if (!checkoutConsentSignatureDataUrl) {
      setCheckoutGuestError("Please provide a signature.");
      return;
    }
    if (!pendingCheckout) {
      setIsCheckoutGuestOpen(false);
      return;
    }
    const numericAmount = Number(pendingCheckout.amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setCheckoutGuestError("Pricing is unavailable. Please refresh availability.");
      return;
    }
    setCheckoutGuestError("");
    const consentText =
      "By signing and continuing to payment, you authorize OneLuxStay to charge the total amount shown for your reservation. A receipt and consent proof PDF will be emailed to you";
    const payload = {
      ...pendingCheckout,
      amount: numericAmount,
      guest: checkoutGuest,
      consentText,
      consentAcceptedAt: new Date().toISOString(),
      consentSignerName: checkoutConsentSignerName.trim(),
      consentSignatureDataUrl: checkoutConsentSignatureDataUrl,
    };
    handleSectionCheckout(payload);
  };

  const isCheckoutGuestValid = Boolean(
    checkoutGuest.firstName.trim() && checkoutGuest.lastName.trim() && checkoutGuest.email.trim() && checkoutGuest.phone.trim()
  );
  const canContinueToPayment = isCheckoutGuestValid && checkoutConsentAccepted;

  const applyCheckoutPromoCode = () => {
    const normalizedCode = checkoutPromoCode.trim().toUpperCase();
    if (!normalizedCode) {
      setCheckoutPromoError("Enter a discount code.");
      return;
    }
    const promo = CHECKOUT_PROMO_CODES[normalizedCode];
    if (!promo) {
      setCheckoutAppliedPromo(null);
      setCheckoutPromoError("Invalid code. Try WELCOME5, LUXE10, or STAY15.");
      return;
    }
    setPendingCheckout((prev) => {
      if (!prev) return prev;
      const baseAmountValue = Number.isFinite(Number(prev.baseAmount))
        ? Number(prev.baseAmount)
        : Number(prev?.baseBreakdown?.total ?? prev?.baseBreakdown?.subtotal ?? prev.amount);
      if (!Number.isFinite(baseAmountValue) || baseAmountValue <= 0) return prev;
      const promoDiscountAmount = Number((baseAmountValue * promo.rate).toFixed(2));
      const discountedTotal = Number(Math.max(baseAmountValue - promoDiscountAmount, 0).toFixed(2));
      const baseBreakdown = prev?.baseBreakdown && typeof prev.baseBreakdown === "object"
        ? prev.baseBreakdown
        : null;
      const nextBreakdown = baseBreakdown
        ? {
            ...baseBreakdown,
            promoCode: normalizedCode,
            promoDiscountRate: promo.rate,
            promoDiscountAmount,
            total: discountedTotal,
            subtotal: discountedTotal,
          }
        : {
            promoCode: normalizedCode,
            promoDiscountRate: promo.rate,
            promoDiscountAmount,
            total: discountedTotal,
            subtotal: discountedTotal,
          };
      return {
        ...prev,
        amount: discountedTotal,
        breakdown: nextBreakdown,
        promoCode: normalizedCode,
        promoDiscountRate: promo.rate,
        promoDiscountAmount,
      };
    });
    setCheckoutPromoCode(normalizedCode);
    setCheckoutAppliedPromo({ code: normalizedCode, ...promo });
    setCheckoutPromoError("");
  };

  const clearCheckoutPromoCode = () => {
    setCheckoutPromoCode("");
    setCheckoutPromoError("");
    setCheckoutAppliedPromo(null);
    setPendingCheckout((prev) => {
      if (!prev) return prev;
      const baseAmountValue = Number.isFinite(Number(prev.baseAmount))
        ? Number(prev.baseAmount)
        : Number(prev?.baseBreakdown?.total ?? prev?.baseBreakdown?.subtotal ?? prev.amount);
      return {
        ...prev,
        amount: Number.isFinite(baseAmountValue) ? baseAmountValue : prev.amount,
        breakdown:
          prev?.baseBreakdown && typeof prev.baseBreakdown === "object"
            ? { ...prev.baseBreakdown }
            : prev.breakdown,
        promoCode: "",
        promoDiscountRate: 0,
        promoDiscountAmount: 0,
      };
    });
  };

  const getSignaturePoint = (event) => {
    const canvas = checkoutSignatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    if (!source) return null;
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return {
      x: (source.clientX - rect.left) * scaleX,
      y: (source.clientY - rect.top) * scaleY,
    };
  };

  const startSignatureDraw = (event) => {
    const canvas = checkoutSignatureCanvasRef.current;
    if (!canvas) return;
    const point = getSignaturePoint(event);
    if (!point) return;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#3f3326";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    isSigningRef.current = true;
    event.preventDefault();
  };

  const drawSignature = (event) => {
    if (!isSigningRef.current) return;
    const canvas = checkoutSignatureCanvasRef.current;
    if (!canvas) return;
    const point = getSignaturePoint(event);
    if (!point) return;
    const ctx = canvas.getContext("2d");
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setCheckoutConsentSignatureDataUrl(canvas.toDataURL("image/png"));
    event.preventDefault();
  };

  const endSignatureDraw = () => {
    if (!isSigningRef.current) return;
    isSigningRef.current = false;
    const canvas = checkoutSignatureCanvasRef.current;
    if (!canvas) return;
    setCheckoutConsentSignatureDataUrl(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = checkoutSignatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCheckoutConsentSignatureDataUrl("");
  };

  const handleGuestInputChange = (field) => (event) => {
    const { value } = event.target;
    setCheckoutGuest((prev) => ({ ...prev, [field]: value }));
    if (checkoutGuestError) setCheckoutGuestError("");
  };

  const handleGuestKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmGuestCheckout();
    }
  };

  const heroImages = useMemo(
    () => [
      "https://assets.guesty.com/image/upload/v1729698598/production/666b3af27fc6d5653142b0af/k9tkytawqqfeteq1y8rn.jpg",
      "https://assets.guesty.com/image/upload/v1729698123/production/666b3af27fc6d5653142b0af/gbfnbuvqtbreaw3100fk.jpg",
      "https://assets.guesty.com/image/upload/v1730118469/production/666b3af27fc6d5653142b0af/g0sswyq5a1macbegsp2p.jpg",
      "https://assets.guesty.com/image/upload/v1730118454/production/666b3af27fc6d5653142b0af/hhak8hklrbv2ewtdwuoy.jpg",
      "https://assets.guesty.com/image/upload/v1729698598/production/666b3af27fc6d5653142b0af/at1j16rqji4epdet5xna.jpg",
      "https://assets.guesty.com/image/upload/v1733508976/production/666b3af27fc6d5653142b0af/uw8axioi311sthwkvv3u.jpg",
    ],
    []
  );
  const bounceListings = useMemo(() => {
    const featuredIds = [
      "66e85deca8a40a00145be974",
      "691b844f8b32740013bc7c2c",
      "66e3bd82536929001303452f",
    ];
    const fallbackImages = heroImages.slice(0, 3);
    const featuredListings = featuredIds
      .map((id) =>
        losAngelesListings.find(
          (listing) => String(listing.id || listing._id || listing.unitTypeId || "") === id
        )
      )
      .filter(Boolean);
    return featuredListings.map((listing, index) => {
      const images = getListingImageUrls(listing);
      const image = images[0] || fallbackImages[index] || fallbackImages[0];
      const priceValue =
        typeof listing.basePrice === "number"
          ? listing.basePrice
          : typeof listing.prices?.basePrice === "number"
            ? listing.prices.basePrice
            : null;
      const listingId = listing.id || listing._id || listing.unitTypeId;
      return {
        id: listingId,
        image,
        title: sanitizeText(listing.title || "One Lux Stay"),
        price: priceValue ? `From ${formatCurrency(priceValue, listing.currency)}` : "",
      };
    });
  }, [heroImages, losAngelesListings]);
  const heroCards = useMemo(() => {
    if (!heroImages.length) return [];
    if (!bounceListings.length) {
      return heroImages.map((src, idx) => ({
        id: null,
        image: src,
        title: `Los Angeles stay ${idx + 1}`,
      }));
    }
    return heroImages.map((src, idx) => {
      const listing = bounceListings[idx % bounceListings.length];
      return {
        id: listing?.id ?? null,
        image: listing?.image || src,
        title: listing?.title || `Los Angeles stay ${idx + 1}`,
      };
    });
  }, [heroImages, bounceListings]);
  const inquiryTitle = inquiryListing?.title ? sanitizeText(inquiryListing.title) : "this unit";
  const inquiryDates =
    sectionCheckIn && sectionCheckOut ? `${sectionCheckIn} to ${sectionCheckOut}` : "";
  const buildSectionRoute = (sectionKey) => {
    const basePath = location.pathname.toLowerCase().startsWith("/losangeles")
      ? "/losangeles"
      : "/los-angeles";
    const areaSlug = SECTION_SLUG_BY_KEY[sectionKey] || "downtownla";
    const params = new URLSearchParams(location.search);
    const checkIn = sectionCheckIn || params.get("checkIn") || "";
    const checkOut = sectionCheckOut || params.get("checkOut") || "";
    const guests = sectionGuests || params.get("guests") || "";
    if (checkIn && checkOut && guests) {
      return `${basePath}/${areaSlug}/${encodeURIComponent(checkIn)}&${encodeURIComponent(
        checkOut
      )}&${encodeURIComponent(guests)}`;
    }
    return `${basePath}/${areaSlug}`;
  };
  const closeActiveSection = () => {
    setActiveSectionKey(null);
    setSectionCheckIn("");
    setSectionCheckOut("");
    setSectionGuests("2");
    writePersistedBooking(null);
    const basePath = location.pathname.toLowerCase().startsWith("/losangeles")
      ? "/losangeles"
      : "/los-angeles";
    navigate(basePath, {
      replace: true,
      state: { skipCityLoader: true },
    });
  };
  const buildListingPath = (listingId) => {
    if (!listingId) return "/los-angeles";
    const params = new URLSearchParams();
    if (sectionCheckIn) params.set("checkIn", sectionCheckIn);
    if (sectionCheckOut) params.set("checkOut", sectionCheckOut);
    if (sectionGuests) params.set("guests", sectionGuests);
    const query = params.toString();
    return `/los-angeles/listing/${encodeURIComponent(listingId)}${query ? `?${query}` : ""}`;
  };
  const inquirySubject = `Inquiry: ${inquiryTitle}`;
  const inquiryBody =
    `Hi OneLuxStay,\n\nI'd like to inquire about ${inquiryTitle}.` +
    (inquiryDates ? `\nDates: ${inquiryDates}.` : "") +
    "\nPlease let me know about availability and options.\n\nThank you!";
  const inquiryEmailHref = `mailto:reservations@oneluxstay.com?subject=${encodeURIComponent(
    inquirySubject
  )}&body=${encodeURIComponent(inquiryBody)}`;
  const inquiryWhatsAppHref = `https://wa.me/971588858935?text=${encodeURIComponent(
    inquiryBody
  )}`;
  const logoHomeProps = {
    role: "button",
    tabIndex: 0,
    onClick: () => navigate("/"),
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigate("/");
      }
    },
    style: { cursor: "pointer" },
  };

  const scrollHeroCarousel = (direction) => {
    if (!heroCarouselRef.current) return;
    const container = heroCarouselRef.current;
    const card = container.querySelector(".antwerp-hero__carousel-card");
    const offset = card ? card.offsetWidth + 16 : container.clientWidth;
    container.scrollBy({ left: direction * offset, behavior: "smooth" });
  };

  const scrollReviewCarousel = (direction) => {
    if (!reviewCarouselRef.current) return;
    const container = reviewCarouselRef.current;
    const card = container.querySelector(".la-review-ticker__item");
    const offset = card ? card.offsetWidth + 16 : container.clientWidth;
    container.scrollBy({ left: direction * offset, behavior: "smooth" });
  };

  const stats = useMemo(() => {
    const basePrices = losAngelesParentListings.map((l) => l.basePrice);
    const cleaningFees = losAngelesParentListings.map((l) => l.cleaningFee);
    const bedrooms = losAngelesParentListings.map((l) => l.bedrooms);
    const bathrooms = losAngelesParentListings.map((l) => l.bathrooms);
    const sleeps = losAngelesParentListings.map((l) => l.accommodates);
    const currencies = new Set(losAngelesParentListings.map((l) => l.currency).filter(Boolean));
    const propertyTypes = new Set(
      losAngelesParentListings
        .map((l) => l.propertyType)
        .filter((value) => typeof value === "string" && value.trim())
    );
    const propertyTypeLabel =
      propertyTypes.size === 1 ? [...propertyTypes][0] : propertyTypes.size ? "Multiple" : "--";

    return {
      units: losAngelesParentListings.length,
      nightly: rangeLabel(basePrices),
      cleaning: rangeLabel(cleaningFees),
      bedrooms: rangeLabel(bedrooms),
      bathrooms: rangeLabel(bathrooms),
      sleeps: rangeLabel(sleeps),
      currency: currencies.size === 1 ? [...currencies][0] : "Multiple",
      propertyTypeLabel,
    };
  }, [losAngelesParentListings]);

  const tourSlides = CITY_TOUR_SLIDES[tourCity] || CITY_TOUR_SLIDES.Hollywood || [];
  const tourCount = tourSlides.length;
  const activeTourSlide = tourSlides[tourIndex] || tourSlides[0] || {};
  const mapPlaceholderImage = tourSlides[0]?.image || CITY_TOUR_SLIDES.Hollywood?.[0]?.image || "";

  const goToTour = (index) => {
    if (!tourCount) return;
    const next = (index + tourCount) % tourCount;
    setTourIndex(next);
  };

  useEffect(() => {
    if (!showCityTour || tourPaused || tourCount < 2) return;
    const id = setInterval(() => {
      setTourIndex((prev) => (prev + 1) % tourCount);
    }, 5000);
    return () => clearInterval(id);
  }, [showCityTour, tourPaused, tourCount]);

  useEffect(() => {
    setTourIndex(0);
  }, [tourCity]);

  useEffect(() => {
    if (!showCityTour) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event) => {
      if (event.key === "Escape") {
        setShowCityTour(false);
      }
      if (event.key === "ArrowRight") {
        goToTour(tourIndex + 1);
      }
      if (event.key === "ArrowLeft") {
        goToTour(tourIndex - 1);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [showCityTour, tourIndex, tourCount]);

  useEffect(() => {
    if (!isListingMapOpen || !listingMapRef.current || !activeListing) return;
    if (!mapsApiKey) {
      setMapError("Map service is unavailable.");
      return;
    }
    loadGoogleMaps(mapsApiKey)
      .then((maps) => {
        const initialCenter =
          listingMapTarget?.coords || getListingCoords(activeListing) || PROPERTY_COORDS;
        const map = new maps.Map(listingMapRef.current, {
          center: initialCenter,
          zoom: 15,
          minZoom: 3,
          maxZoom: 21,
          gestureHandling: "greedy",
          scrollwheel: true,
          draggable: true,
          keyboardShortcuts: true,
          zoomControl: true,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
        listingMapInstanceRef.current = map;
        if (listingMapMarkerRef.current) {
          listingMapMarkerRef.current.setMap(null);
        }
        const placeMarker = (position) => {
          listingMapMarkerRef.current = new maps.Marker({
            map,
            position,
            title: activeListing.title || "OneLuxStay",
          });
        };
        if (listingMapTarget?.coords) {
          placeMarker(listingMapTarget.coords);
        } else if (listingMapTarget?.address) {
          const geocoder = new maps.Geocoder();
          geocoder.geocode({ address: listingMapTarget.address }, (results, status) => {
            if (status === "OK" && results?.[0]?.geometry?.location) {
              const location = results[0].geometry.location;
              map.setCenter(location);
              placeMarker(location);
            } else {
              placeMarker(initialCenter);
            }
          });
        } else {
          placeMarker(initialCenter);
        }
      })
      .catch(() => {
        setMapError("Unable to load map.");
      });
  }, [isListingMapOpen, activeListing, listingMapTarget, mapsApiKey]);

  useEffect(() => {
    if (!isSectionMapOpen || !sectionMapRef.current || !sectionMapTarget) return;
    if (!mapsApiKey) {
      setMapError("Map service is unavailable.");
      return;
    }
    loadGoogleMaps(mapsApiKey)
      .then((maps) => {
        const initialCenter = sectionMapTarget.coords || PROPERTY_COORDS;
        const map = new maps.Map(sectionMapRef.current, {
          center: initialCenter,
          zoom: 15,
          minZoom: 3,
          maxZoom: 21,
          gestureHandling: "greedy",
          scrollwheel: true,
          draggable: true,
          keyboardShortcuts: true,
          zoomControl: true,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
        sectionMapInstanceRef.current = map;
        if (sectionMapMarkerRef.current) {
          sectionMapMarkerRef.current.setMap(null);
        }
        const placeMarker = (position) => {
          sectionMapMarkerRef.current = new maps.Marker({
            map,
            position,
            title: sectionMapTarget.label || "OneLuxStay",
          });
        };
        if (sectionMapTarget.coords) {
          placeMarker(sectionMapTarget.coords);
        } else if (sectionMapTarget.address) {
          const geocoder = new maps.Geocoder();
          geocoder.geocode({ address: sectionMapTarget.address }, (results, status) => {
            if (status === "OK" && results?.[0]?.geometry?.location) {
              const location = results[0].geometry.location;
              map.setCenter(location);
              placeMarker(location);
            }
          });
        } else {
          placeMarker(initialCenter);
        }
      })
      .catch(() => {
        setMapError("Unable to load map.");
      });
  }, [isSectionMapOpen, sectionMapTarget, mapsApiKey]);

  const activeListingId = activeListing?.unitTypeId || activeListing?.id || activeListing?._id;
  const isListingAvailable = activeListingId
    ? sectionAvailabilityMap[activeListingId] === true
    : false;

  const listingDetail = activeListing ? (
    <div className="la-listing-shell">
      <div className="la-listing-shell__content">
        <div className="la-unit-modal la-listing-page">
      <section className="la-listing-hero la-listing-hero--mobile-top-logo">
        <div className="la-listing-hero__top">
          <button
            type="button"
            className="la-unit-modal__back"
            aria-label="Back to listings"
            onClick={() => {
              setActiveListing(null);
              setActiveImageIndex(0);
              if (isListingRoute) {
                navigate("/los-angeles");
              }
            }}
          >
            <span aria-hidden="true">{"\u2039"}</span>
          </button>
          <div className="la-listing-hero__logo-mobile">
            <img {...logoHomeProps} src={LOGO_URL} alt="OneLuxStay logo" loading="lazy" onError={handleImageError} />
          </div>
        </div>
        <div className="la-listing-hero__intro">
          <div>
            <p className="la-listing-hero__kicker">Los Angeles private stay</p>
            <h3>{formatListingLocationLabel(activeListing, "Los Angeles")}</h3>
            <div className="la-unit-modal__chips">
              <span>Exceptional location</span>
              <span>Fast arrival</span>
              <span>Design-forward suites</span>
            </div>
            <p className="la-unit-modal__address">{formatAddress(activeListing)}</p>
            {(() => {
              const { rating, count } = getReviewStats(getListingReviews(activeListing));
              if (!rating && !count) return null;
              return (
                <p className="la-unit-modal__rating">
                  Rating: {rating ? `${rating} / 5` : "--"}{count ? ` (${count} reviews)` : ""}
                </p>
              );
            })()}
          </div>
          <div className="la-listing-hero__logo">
            <img {...logoHomeProps} src={LOGO_URL} alt="OneLuxStay logo" loading="lazy" onError={handleImageError} />
          </div>
        </div>
      </section>
      <div className="la-unit-modal__tabs" role="tablist" aria-label="Listing sections">
        <button
          type="button"
          className={listingTab === "overview" ? "is-active" : ""}
          onClick={() => handleListingTabClick("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={listingTab === "facilities" ? "is-active" : ""}
          onClick={() => handleListingTabClick("facilities")}
        >
          Facilities
        </button>
        <button
          type="button"
          className={listingTab === "guest-reviews" ? "is-active" : ""}
          onClick={() => handleListingTabClick("guest-reviews")}
        >
          Guest reviews
        </button>
        <button
          type="button"
          className={listingTab === "house-rules" ? "is-active" : ""}
          onClick={() => handleListingTabClick("house-rules")}
        >
          House rules
        </button>
      </div>
      {(() => {
        const galleryListing = getGalleryListing(activeListing, listings);
        const images = getListingImageUrls(galleryListing);
        const safeIndex = Math.min(activeImageIndex, Math.max(images.length - 1, 0));
        const imageEntries = images
          .map((src, idx) => ({ src, idx }))
          .filter((entry) => entry.src);
        const mainEntry = imageEntries.find((entry) => entry.idx === safeIndex) || imageEntries[0];
        const mainImage = mainEntry?.src || images[0];
        const mainKey = getImageKey(mainImage);
        const uniqueEntries = imageEntries
          .filter((entry) => entry.src && getImageKey(entry.src) !== mainKey)
          .filter((entry, idx, arr) => (
            arr.findIndex((item) => getImageKey(item.src) === getImageKey(entry.src)) === idx
          ));
        const sideImages = uniqueEntries.slice(0, 2);
        const thumbImages = uniqueEntries.slice(0, 24);
        const coords = getListingCoords(activeListing);
        const addressQuery = getListingAddressQuery(activeListing);
        const mapCoords = coords || PROPERTY_COORDS;
        const mapUrl = buildStaticMapUrl(mapCoords, "400x280", 14);
        const mapEmbedUrl = buildEmbedMapUrl(mapCoords, 15);
        const amenityListRaw = Array.isArray(activeListing.amenities)
          ? activeListing.amenities
          : [];
        const amenityList = amenityListRaw
          .filter((item) => typeof item === "string")
          ;
        const aboutText = formatFullDescription(activeListing);
        const isHollywoodUnit = getBuildingKey(activeListing) === "la-hollywood";
        const listingId = activeListing.unitTypeId || activeListing.id || activeListing._id;
        const availability = listingId ? sectionAvailabilityMap[listingId] : null;
        const availabilityStatus = sectionAvailabilityActive
          ? availability === false
            ? "Unavailable"
            : availability === true
              ? "Available"
              : "Checking..."
          : "Select dates";
        const quote = listingId ? sectionQuotes[listingId] : null;
        const planOptions = quote?.plans || [];
        const selectedPlanId =
          (listingId ? selectedRatePlans[listingId] : "") ||
          quote?.defaultPlanId ||
          planOptions[0]?.id ||
          "";
        const selectedPlan =
          planOptions.find((ratePlan) => ratePlan.id === selectedPlanId) ||
          planOptions[0] ||
          quote?.plan ||
          quote?.pricing ||
          null;
        const breakdown = selectedPlan?.breakdown || quote?.breakdown || quote?.pricing?.breakdown || null;
        const priceCurrency = selectedPlan?.currency || quote?.currency || activeListing.currency || "USD";
        const totalPrice =
          breakdown?.total ??
          breakdown?.subtotal ??
          selectedPlan?.total ??
          quote?.total ??
          null;
        return (
          <>
            <div className="la-unit-modal__grid" id="la-overview">
              <div className="la-unit-modal__gallery">
                <div className="la-unit-modal__main">
                  {mainImage ? (
                    <button
                      type="button"
                      className="la-unit-modal__image-button"
                      onClick={(event) => handleImagePreview(event, mainImage)}
                      aria-label="Open image preview"
                    >
                      <img
                        src={mainImage}
                        alt={sanitizeText(activeListing.title)}
                        loading="eager"
                        onError={handleImageError}
                      />
                    </button>
                  ) : (
                    <div className="la-unit-modal__placeholder">Image loading</div>
                  )}
                </div>
                <div className="la-unit-modal__side">
                  {sideImages.length ? (
                    sideImages.map((entry) => (
                      <button
                        key={`side-${entry.idx}`}
                        type="button"
                        className="la-unit-modal__image-button"
                        onClick={() => setActiveImageIndex(entry.idx)}
                        aria-label="Select image"
                      >
                        <img
                          src={entry.src}
                          alt=""
                          loading="lazy"
                          onError={handleImageError}
                        />
                      </button>
                    ))
                  ) : (
                    [0, 1].map((idx) => (
                      <div key={`side-${idx}`} className="la-unit-modal__placeholder">
                        Image loading
                      </div>
                    ))
                  )}
                </div>
                {thumbImages.length > 1 && (
                  <div
                    className="la-unit-modal__thumbs"
                    role="list"
                    ref={thumbsRef}
                    onMouseEnter={(event) => {
                      hoveredThumbsRef.current = thumbsRef.current;
                      handleThumbsMove(event, thumbsRef);
                    }}
                    onMouseMove={handleThumbsMove}
                    onMouseLeave={() => {
                      hoveredThumbsRef.current = null;
                      stopAutoScroll();
                    }}
                  >
                    <div
                      className="la-thumb-scroll-zone la-thumb-scroll-zone--left"
                      onMouseEnter={() => {
                        console.log("[Thumbs] hover left zone");
                        startAutoScroll(thumbsRef.current, -1);
                      }}
                      onMouseLeave={stopAutoScroll}
                    />
                    <div
                      className="la-thumb-scroll-zone la-thumb-scroll-zone--right"
                      onMouseEnter={() => {
                        console.log("[Thumbs] hover right zone");
                        startAutoScroll(thumbsRef.current, 1);
                      }}
                      onMouseLeave={stopAutoScroll}
                    />
                    {thumbImages.map((entry, idx) => (
                      <button
                        key={`${entry.src}-${entry.idx}`}
                        type="button"
                        className={entry.idx === safeIndex ? "is-active" : ""}
                        onClick={() => setActiveImageIndex(entry.idx)}
                      >
                        <img
                          src={entry.src}
                          alt=""
                          loading={idx === 0 ? "eager" : "lazy"}
                          onError={handleImageError}
                        />
                      </button>
                    ))}
                  </div>
                )}
                <div className="la-unit-modal__booking" id="la-rooms" aria-label="Availability check">
                  <DateRangePicker
                    value={{ checkIn: sectionCheckIn, checkOut: sectionCheckOut }}
                    dayPrices={calendarDayMap}
                    onChange={({ checkIn, checkOut }) => {
                      setSectionCheckIn(checkIn);
                      setSectionCheckOut(checkOut);
                    }}
                    onMonthChange={(nextMonth) => {
                      const listingId = getCalendarListingId(activeListing, losAngelesListings);
                      if (!listingId) return;
                      const monthStart = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
                      setCalendarStartDate(monthStart);
                      setCalendarMonthIndex(0);
                      fetchCalendarMonth(
                        listingId,
                        monthStart,
                        calendarCacheRef,
                        calendarDaysRef,
                        calendarInflightRef,
                        setCalendarLoading,
                        setCalendarError,
                        setCalendarPrices
                      );
                    }}
                    onOpenChange={handleListingCalendarOpen}
                    isLoading={calendarLoading}
                    fallbackPrice={activeListing.basePrice}
                    fallbackCurrency={activeListing.currency}
                    fallbackMinNights={listingMinNightsFallback}
                  />
                  <div>
                    <label htmlFor="la-section-guests">Guests</label>
                    <select
                      id="la-section-guests"
                      value={sectionGuests}
                      onChange={(event) => setSectionGuests(event.target.value)}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="la-unit-modal__booking-cta"
                    onClick={() => fetchAvailabilityListings({ shouldScroll: true })}
                  >
                    {sectionAvailabilityLoading ? "Checking..." : "Check availability"}
                  </button>
                </div>
              </div>
            <div className="la-unit-modal__sidebar">
              <div className="la-unit-modal__contact" aria-label="Reservation contact">
                <p>For Reservation Contact</p>
                <strong>OneLuxStay Los Angeles</strong>
                <a href="tel:+12138663589">+1 213 866 3589</a>
                <a href="mailto:reservations@oneluxstay.com">reservations@oneluxstay.com</a>
                <a href="mailto:reservations@oneluxstay.com" className="la-unit-modal__contact-cta">
                  Message concierge
                </a>
                <a
                  href={buildWhatsAppLink(activeListing?.title, sectionCheckIn, sectionCheckOut)}
                  className="la-unit-modal__contact-cta"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp us
                </a>
              </div>
              <div className="la-unit-modal__card la-unit-modal__price">
                <span>From</span>
                <strong>{formatCurrency(activeListing.basePrice, activeListing.currency || "USD")}</strong>
                <small>per night {"\u00b7"} taxes calculated at checkout</small>
                {isListingAvailable ? (
                  <button
                    type="button"
                    className="la-listing-hero__reserve"
                    onClick={() => fetchAvailabilityListings({ shouldScroll: true })}
                  >
                    Reserve your dates
                  </button>
                ) : null}
              </div>
              <div className="la-unit-modal__card" id="la-guest-reviews">
                {(() => {
                  const listingReviews = getListingReviews(activeListing);
                  const quote =
                    listingReviews.find((review) => review?.quote && review.quote.trim())?.quote ||
                    "No review details yet.";
                  const shouldTruncate = quote.length > 160;
                  const displayQuote = shouldTruncate && !isReviewExpanded
                    ? `${quote.slice(0, 160).trim()}...`
                    : quote;
                  const reviewLink = getReviewLink(activeListing);
                  return (
                    <>
                <div className="la-unit-modal__card-head">
                  <strong>{getReviewLabel(getListingReviews(activeListing))}</strong>
                  {(() => {
                    const { count } = getReviewStats(getListingReviews(activeListing));
                    const label = count ? `${count} reviews` : "No reviews";
                    return reviewLink ? (
                      <a
                        href={reviewLink}
                        className="la-unit-modal__review-link"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {label}
                      </a>
                    ) : (
                      <span>{label}</span>
                    );
                  })()}
                  </div>
                <div className="la-unit-modal__review">
                  <p>{displayQuote}</p>
                  {shouldTruncate && (
                    <button type="button" onClick={() => setIsReviewExpanded((prev) => !prev)}>
                      {isReviewExpanded ? "See less" : "See more"}
                    </button>
                  )}
                </div>
                    </>
                  );
                })()}
                </div>
                <div className="la-unit-modal__card la-unit-modal__map la-unit-modal__map-button">
                  {mapEmbedUrl ? (
                    <iframe
                      title="Unit location map"
                      src={mapEmbedUrl}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  ) : mapUrl ? (
                    <img src={mapUrl} alt="Map showing the unit location" loading="lazy" />
                  ) : (
                    <div className="la-unit-modal__placeholder">Map loading</div>
                  )}
                  <button
                    type="button"
                    className="la-unit-modal__map-overlay"
                    aria-label="View larger map"
                    onClick={() => {
                      setListingMapTarget({
                        coords: getListingCoords(activeListing),
                        address: getListingAddressQuery(activeListing),
                        label: activeListing.title || "OneLuxStay",
                      });
                      setIsListingMapOpen(true);
                    }}
                  >
                    <span className="la-unit-modal__map-cta">View larger map</span>
                  </button>
                </div>
                <div className="la-unit-modal__card la-unit-modal__availability">
                  <div className="la-unit-modal__card-head">
                    <strong>Availability</strong>
                    <span className={`la-unit-modal__status is-${availabilityStatus.toLowerCase().replace(/\s+/g, "-")}`}>
                      {availabilityStatus}
                    </span>
                  </div>
                  <div className="la-unit-modal__availability-details">
                    {availability === false ? (
                      <p>Unavailable for the selected dates.</p>
                    ) : breakdown ? (
                      <>
                        <div>
                          <span>Accommodation</span>
                          <strong>{formatCurrency(breakdown.accommodation, priceCurrency)}</strong>
                        </div>
                        {breakdown.discountAmount > 0 && (
                          <div>
                            <span>
                              Direct booking discount ({Math.round(breakdown.discountRate * 100)}%)
                            </span>
                            <strong>-{formatCurrency(breakdown.discountAmount, priceCurrency)}</strong>
                          </div>
                        )}
                        <div>
                          <span>Cleaning</span>
                          <strong>{formatCurrency(breakdown.cleaning, priceCurrency)}</strong>
                        </div>
                        <div>
                          <span>Taxes</span>
                          <strong>{formatCurrency(breakdown.taxes, priceCurrency)}</strong>
                        </div>
                        <div>
                          <span>Fees</span>
                          <strong>{formatCurrency(breakdown.fees, priceCurrency)}</strong>
                        </div>
                        <div className="la-unit-modal__total">
                          <span>Total</span>
                          <strong>{formatCurrency(breakdown.total, priceCurrency)}</strong>
                        </div>
                      </>
                    ) : totalPrice ? (
                      <div className="la-unit-modal__total">
                        <span>Total {quote?.nights ? `for ${quote.nights} nights` : ""}</span>
                        <strong>{formatCurrency(totalPrice, priceCurrency)}</strong>
                      </div>
                    ) : (
                      <p>Check availability to view pricing breakdown.</p>
                    )}
                  </div>
                  {availability !== false && planOptions.length > 0 && (
                    <div className="la-unit-modal__rate-plan">
                      <label htmlFor={`la-listing-rate-plan-${listingId || "active"}`}>Rate plan</label>
                      <select
                        id={`la-listing-rate-plan-${listingId || "active"}`}
                        value={selectedPlanId}
                        disabled={sectionAvailabilityLoading}
                        onChange={(event) =>
                          setSelectedRatePlans((prev) => ({
                            ...prev,
                            [listingId]: event.target.value,
                          }))
                        }
                        className="la-booking-table__rate-select"
                      >
                        {planOptions.map((planOption) => (
                          <option key={planOption.id} value={planOption.id}>
                            {planOption.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="la-unit-modal__actions">
                    {(() => {
                      const availability = listingId ? sectionAvailabilityMap[listingId] : null;
                      if (availability === true) {
                        const isReserving = sectionReserveLoadingId === listingId;
                        return (
                          <button
                            type="button"
                            className="la-unit-modal__action-primary"
                            disabled={sectionAvailabilityLoading || isReserving}
                            onClick={() => {
                              setPendingCheckout({
                                listingId,
                                listingTitle: activeListing.title,
                                amount: typeof totalPrice === "number" ? totalPrice : null,
                                currency: resolveCheckoutCurrency(priceCurrency),
                                breakdown: breakdown || null,
                                baseAmount: typeof totalPrice === "number" ? totalPrice : null,
                                baseBreakdown: breakdown || null,
                                promoCode: "",
                                promoDiscountRate: 0,
                                promoDiscountAmount: 0,
                              });
                              setCheckoutStep(1);
                              setCheckoutConsentAccepted(false);
                              setCheckoutConsentSignerName("");
                              setCheckoutConsentSignatureDataUrl("");
                              setCheckoutPromoCode("");
                              setCheckoutPromoError("");
                              setCheckoutAppliedPromo(null);
                              setCheckoutGuestError("");
                              setIsCheckoutGuestOpen(true);
                            }}
                          >
                            {isReserving ? "Redirecting..." : "Reserve"}
                          </button>
                        );
                      }
                      if (availability === false) {
                        return (
                          <button
                            type="button"
                            className="la-unit-modal__action-primary"
                            onClick={() => openInquiry(activeListing)}
                          >
                            Inquire
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              </div>
            </div>
            {sectionAvailabilityError && (
              <div role="alert" className="la-section-hero__notice">
                {sectionAvailabilityError}
              </div>
            )}
            <div className="la-unit-modal__section">
              <div className="la-unit-modal__rooms">
                <div>
                  <p>
                    Bedrooms: {activeListing.bedrooms || "--"} | Bathrooms: {activeListing.bathrooms || "--"} | Sleeps{" "}
                    {activeListing.accommodates || "--"}
                  </p>
                  {(() => {
                    const direct = getBedDetails(activeListing);
                    const bedDetails = (() => {
                      if (direct.length) return direct;
                      if (activeListing.bedDetails && activeListing.bedDetails.length) {
                        return activeListing.bedDetails;
                      }
                      const groupKey = getListingGroupKey(activeListing);
                      if (!groupKey || !Array.isArray(listings)) return [];
                      const fallback = listings.find((entry) => {
                        if (getListingGroupKey(entry) !== groupKey) return false;
                        if (entry.bedDetails && entry.bedDetails.length) return true;
                        return getBedDetails(entry).length > 0;
                      });
                      if (!fallback) return [];
                      const fallbackDirect = getBedDetails(fallback);
                      return fallbackDirect.length ? fallbackDirect : (fallback.bedDetails || []);
                    })();
                    const bedLines = bedDetails
                      .map(splitBedDetailLine)
                      .filter((line) => line.detail);
                    if (!bedLines.length) return null;
                    return (
                      <div className="la-booking-table__bed-details">
                        {bedLines.map((line, idx) => (
                          <div
                            key={`listing-bed-${idx}`}
                            className={`la-booking-table__bed-row${line.label ? "" : " is-single"}`}
                          >
                            {line.label ? (
                              <span className="la-booking-table__bed-room">{line.label}</span>
                            ) : null}
                            <span className="la-booking-table__bed-desc">
                              {line.detail}
                              <span className="la-booking-table__bed-icon">
                                <BedIcon />
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="la-unit-modal__section">
              <h4>About this property</h4>
              <p>
                A calm base with quick access to the neighborhood's best corners. Expect bright spaces, effortless
                arrivals, and a stay that keeps everything close - landmarks, transit, and the city's rhythm.
              </p>
            </div>
          </>
        );
      })()}
      <div className="la-unit-modal__section" id="la-facilities">
        <div className="la-facilities-head">
          <div>
            <h4>Facilities of {sanitizeText(activeListing?.title || "OneLuxStay")}</h4>
            <p>Great facilities. Review score, 9.6</p>
          </div>
        </div>
        <div className="la-unit-modal__facilities">
          {activeListing?.amenities?.length ? (
            <div className="la-facilities-layout">
              <div className="la-facilities-grid">
                {groupAmenities(activeListing.amenities).map((group) => (
                  <div key={group.key} className="la-facilities-group">
                    <div className="la-facilities-group__head">
                      <span className="la-facilities-group__icon">{"\u2713"}</span>
                      <h5>{group.label}</h5>
                    </div>
                    <ul>
                      {(showAllAmenities ? group.items : group.items.slice(0, 6)).map((item, idx) => (
                        <li key={`${group.key}-${idx}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="la-facilities-more">
                <a className="la-facilities-cta" href="#la-rooms">
                  See availability
                </a>
                <button
                  type="button"
                  className="la-unit-modal__amenities-toggle"
                  onClick={() => setShowAllAmenities((prev) => !prev)}
                >
                  {showAllAmenities ? "See less" : "See more"}
                </button>
              </div>
            </div>
          ) : (
            <p>Contact us for full amenities list.</p>
          )}
        </div>
      </div>
      <div className="la-unit-modal__section" id="la-house-rules">
        <h4>House rules</h4>
        {(() => {
          const unitTypeId = activeListing?.unitTypeId || activeListing?.id || activeListing?._id;
          const rules = unitTypeId ? houseRulesByUnit[unitTypeId] : null;
          if (houseRulesLoading && !rules) {
            return <p>Loading house rules{"\u2026"}</p>;
          }
          if (houseRulesError && !rules) {
            return <p>{houseRulesError}</p>;
          }
          if (!rules) {
            return (
              <p>
                House rules are shared at booking and upon request. Contact the concierge for specific policies.
              </p>
            );
          }
          const houseRules = rules.houseRules || rules;
          const childrenRules = houseRules.childrenRules || {};
          const petsAllowed = houseRules.petsAllowed;
          const smokingAllowed = houseRules.smokingAllowed;
          const quietBetween = houseRules.quietBetween;
          const eventsAllowed = houseRules.suitableForEvents;
          const ruleItems = [
            {
              label: "Suitable for children",
              value: formatRuleValue(childrenRules.suitableForChildren ?? houseRules.suitableForChildren),
            },
            {
              label: "Suitable for infants",
              value: formatRuleValue(childrenRules.suitableForInfants ?? houseRules.suitableForInfants),
            },
            {
              label: "Pets allowed",
              value: formatRuleValue(
                typeof petsAllowed === "object" ? petsAllowed.enabled : petsAllowed
              ),
            },
            {
              label: "Pets charged",
              value: formatRuleValue(
                typeof petsAllowed === "object" ? petsAllowed.charged : houseRules.petsCharged
              ),
            },
            {
              label: "Smoking allowed",
              value: formatRuleValue(
                typeof smokingAllowed === "object" ? smokingAllowed.enabled : smokingAllowed
              ),
            },
            {
              label: "Parties allowed",
              value: formatRuleValue(
                typeof eventsAllowed === "object" ? eventsAllowed.enabled : eventsAllowed ?? houseRules.partiesAllowed
              ),
            },
            {
              label: "Quiet hours",
              value: quietBetween?.enabled
                ? formatQuietHours({ set: true, start: quietBetween.hours?.start, end: quietBetween.hours?.end })
                : formatQuietHours(houseRules.quietHours),
            },
            { label: "Minimum age", value: formatRuleValue(houseRules.minimumAge) },
          ];
          return (
            <div className="la-house-rules">
              <ul>
                {ruleItems.map((item) => (
                  <li key={item.label}>
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}
      </div>
        </div>
      </div>
    </div>
  ) : null;

  const zoomPortalTarget = typeof document !== "undefined" ? document.body : null;
  const mapPortalTarget = typeof document !== "undefined" ? document.body : null;
  const zoomModal = zoomImageUrl && zoomPortalTarget
    ? createPortal(
        <div
          className="la-zoom-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={(event) => {
            if (event.target === event.currentTarget) setZoomImageUrl("");
          }}
        >
          <div className="la-zoom-modal__inner">
            <button
              type="button"
              className="la-zoom-modal__close"
              onClick={() => setZoomImageUrl("")}
              aria-label="Close image preview"
            >
              Close
            </button>
            <div className="la-zoom-modal__controls" aria-label="Zoom controls">
              <button type="button" onClick={() => setZoomLevel((value) => clampZoom(value - 0.2))}>
                -
              </button>
              <span>{Math.round(zoomLevel * 100)}%</span>
              <button type="button" onClick={() => setZoomLevel((value) => clampZoom(value + 0.2))}>
                +
              </button>
              <button type="button" onClick={() => setZoomLevel(1)}>
                Reset
              </button>
            </div>
            <div
              ref={zoomCanvasRef}
              className={`la-zoom-modal__canvas${zoomLevel > 1 ? " is-zoomed" : ""}`}
              onPointerDown={(event) => {
                if (zoomLevel <= 1 || event.button !== 0) return;
                isPanningRef.current = true;
                panStartRef.current = { x: event.clientX, y: event.clientY };
                panOriginRef.current = { x: zoomPan.x, y: zoomPan.y };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!isPanningRef.current) return;
                const nextX = panOriginRef.current.x + (event.clientX - panStartRef.current.x);
                const nextY = panOriginRef.current.y + (event.clientY - panStartRef.current.y);
                setZoomPan(clampZoomPan({ x: nextX, y: nextY }));
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                isPanningRef.current = false;
              }}
              onPointerLeave={() => {
                isPanningRef.current = false;
              }}
            >
              <img
                ref={zoomImageRef}
                src={zoomImageUrl}
                alt="Listing preview"
                onLoad={() => {
                  setZoomLevel((value) => clampZoom(value));
                  setZoomPan((prev) => clampZoomPan(prev));
                }}
                style={{
                  transform: `translate(${zoomPan.x}px, ${zoomPan.y}px) scale(${zoomLevel})`,
                }}
              />
            </div>
          </div>
        </div>,
        zoomPortalTarget
      )
    : null;

  const tourPortalTarget = typeof document !== "undefined" ? document.body : null;
  const tourHighlights = Array.isArray(activeTourSlide.highlights) ? activeTourSlide.highlights : [];
  const tourModal =
    showCityTour && tourCount > 0 && tourPortalTarget
      ? createPortal(
          <div
            className="la-tour-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="la-tour-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setShowCityTour(false);
              }
            }}
          >
            <div className="la-tour-modal">
              <div className="la-tour-intro" aria-hidden="true">
                <span>One Lux Stay</span>
              </div>
              <div className="la-tour-header">
                <div className="la-tour-brand">OneLuxStay</div>
                <div className="la-tour-controls">
                  <button
                    type="button"
                    className="la-tour-btn"
                    onClick={() => setShowCityTour(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="la-tour-stage">
                <button
                  type="button"
                  className="la-tour-chevron la-tour-chevron--prev"
                  aria-label="Previous scene"
                  onClick={() => goToTour(tourIndex - 1)}
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  className="la-tour-chevron la-tour-chevron--next"
                  aria-label="Next scene"
                  onClick={() => goToTour(tourIndex + 1)}
                >
                  {">"}
                </button>
                <div
                  key={tourIndex}
                  className="la-tour-slide"
                  style={{ backgroundImage: `url(${activeTourSlide.image || ""})` }}
                >
                  <div className="la-tour-gradient" aria-hidden="true" />
                  <div className="la-tour-content" aria-live="polite">
                    <p className="la-tour-kicker">{tourCity}</p>
                    <h2 className="la-tour-title" id="la-tour-title">
                      {activeTourSlide.title || "City tour"}
                    </h2>
                    <p className="la-tour-subtitle">
                      {activeTourSlide.subtitle || "Enter a cinematic sequence curated for your stay."}
                    </p>
                    {activeTourSlide.copy ? (
                      <p className="la-tour-copy">{activeTourSlide.copy}</p>
                    ) : null}
                    {tourHighlights.length ? (
                      <div className="la-tour-highlights">
                        {tourHighlights.map((item) => (
                          <span key={item} className="la-tour-chip">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="la-tour-progress" aria-hidden="true">
                  <span style={{ width: `${((tourIndex + 1) / tourCount) * 100}%` }} />
                </div>
                <div className="la-tour-nav">
                  <div className="la-tour-dots" role="tablist" aria-label={`${tourCity} tour scenes`}>
                    {tourSlides.map((slide, index) => (
                      <button
                        key={slide.title || `${tourCity}-scene-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={index === tourIndex}
                        className={index === tourIndex ? "la-tour-dot is-active" : "la-tour-dot"}
                        onClick={() => goToTour(index)}
                      >
                        <span className="sr-only">Scene {index + 1}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          tourPortalTarget
        )
      : null;

  const listingMapModal = isListingMapOpen && mapPortalTarget
    ? createPortal(
        <div
          className="la-map-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Interactive map"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsListingMapOpen(false);
          }}
        >
          <div className="la-map-modal__inner">
            <button
              type="button"
              className="la-map-modal__close"
              onClick={() => setIsListingMapOpen(false)}
              aria-label="Close map"
            >
              Close
            </button>
                        <div
              ref={listingMapRef}
              className="la-map-modal__canvas"
              aria-label="Interactive map"
            />
          </div>
        </div>,
        mapPortalTarget
      )
    : null;

  const sectionMapModal = isSectionMapOpen && mapPortalTarget
    ? createPortal(
        <div
          className="la-map-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Interactive map"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsSectionMapOpen(false);
          }}
        >
          <div className="la-map-modal__inner">
            <button
              type="button"
              className="la-map-modal__close"
              onClick={() => setIsSectionMapOpen(false)}
              aria-label="Close map"
            >
              Close
            </button>
            <div
              ref={sectionMapRef}
              className="la-map-modal__canvas"
              aria-label="Interactive map"
            />
          </div>
        </div>,
        mapPortalTarget
      )
    : null;

  const checkoutGuestModal = isCheckoutGuestOpen ? (
    <div
      className="antwerp-modal__overlay la-checkout-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Guest details for checkout"
      onClick={(event) => {
        if (event.target === event.currentTarget) setIsCheckoutGuestOpen(false);
      }}
    >
      <div className="la-inquiry-modal" role="document">
        <div className="la-inquiry-modal__header">
          <div className="la-inquiry-modal__brand">
            <img
              {...logoHomeProps}
              src={LOGO_URL}
              alt="OneLuxStay logo"
              loading="lazy"
              className="la-inquiry-modal__logo"
              onError={handleImageError}
            />
            <div>
              <p className="la-inquiry-modal__kicker">Guest details</p>
              <h3>Tell us who's booking</h3>
              <p className="la-inquiry-modal__meta">We'll use this to create the reservation after payment.</p>
            </div>
          </div>
          {checkoutStep === 1 && (
            <button
              type="button"
              className="la-inquiry-modal__close"
              onClick={() => setIsCheckoutGuestOpen(false)}
            >
              Close
            </button>
          )}
        </div>
        <div className="la-inquiry-modal__body">
          <Stepper
            initialStep={1}
            onStepChange={(step) => setCheckoutStep(step)}
            onFinalStepCompleted={confirmGuestCheckout}
            disableStepIndicators
            nextButtonText="Next"
            finalButtonText={sectionReserveLoadingId ? "Redirecting..." : "Continue to payment"}
            advanceOnFinalStep={false}
            backButtonProps={{ disabled: Boolean(sectionReserveLoadingId) }}
            nextButtonProps={{
              disabled:
                (checkoutStep === 1 && !isCheckoutGuestValid) ||
                (checkoutStep === 2 &&
                  (!checkoutConsentAccepted ||
                    !checkoutConsentSignerName.trim() ||
                    !checkoutConsentSignatureDataUrl)) ||
                (checkoutStep === 4 &&
                  (!Number.isFinite(Number(pendingCheckout?.amount)) ||
                    Number(pendingCheckout?.amount) < 0 ||
                    Boolean(sectionReserveLoadingId))),
            }}
          >
            <Step>
              <div className="la-inquiry-modal__step">
                <label
                  className={
                    "la-inquiry-modal__field" +
                    (checkoutGuestError && !checkoutGuest.firstName.trim() ? " is-invalid" : "")
                  }
                >
                  <span>First name</span>
                  <input
                    type="text"
                    value={checkoutGuest.firstName}
                    autoComplete="given-name"
                    required
                    autoFocus
                    aria-invalid={Boolean(checkoutGuestError && !checkoutGuest.firstName.trim())}
                    onKeyDown={handleGuestKeyDown}
                    onChange={handleGuestInputChange("firstName")}
                  />
                </label>
                <label
                  className={
                    "la-inquiry-modal__field" +
                    (checkoutGuestError && !checkoutGuest.lastName.trim() ? " is-invalid" : "")
                  }
                >
                  <span>Last name</span>
                  <input
                    type="text"
                    value={checkoutGuest.lastName}
                    autoComplete="family-name"
                    required
                    aria-invalid={Boolean(checkoutGuestError && !checkoutGuest.lastName.trim())}
                    onKeyDown={handleGuestKeyDown}
                    onChange={handleGuestInputChange("lastName")}
                  />
                </label>
                <label
                  className={
                    "la-inquiry-modal__field" +
                    (checkoutGuestError && !checkoutGuest.email.trim() ? " is-invalid" : "")
                  }
                >
                  <span>Email</span>
                  <input
                    type="email"
                    value={checkoutGuest.email}
                    autoComplete="email"
                    required
                    aria-invalid={Boolean(checkoutGuestError && !checkoutGuest.email.trim())}
                    onKeyDown={handleGuestKeyDown}
                    onChange={handleGuestInputChange("email")}
                  />
                </label>
                <label
                  className={
                    "la-inquiry-modal__field" +
                    (checkoutGuestError && !checkoutGuest.phone.trim() ? " is-invalid" : "")
                  }
                >
                  <span>Phone</span>
                  <input
                    type="tel"
                    value={checkoutGuest.phone}
                    autoComplete="tel"
                    required
                    aria-invalid={Boolean(checkoutGuestError && !checkoutGuest.phone.trim())}
                    onKeyDown={handleGuestKeyDown}
                    onChange={handleGuestInputChange("phone")}
                  />
                </label>
                {checkoutGuestError && (
                  <p className="la-inquiry-modal__note is-error" role="status" aria-live="polite">
                    {checkoutGuestError}
                  </p>
                )}
              </div>
            </Step>
            <Step>
              <div className="la-inquiry-modal__step">
                <label className="la-inquiry-modal__field">
                  <span>Signer full name</span>
                  <input
                    type="text"
                    value={checkoutConsentSignerName}
                    autoComplete="name"
                    placeholder="Type full name"
                    onChange={(event) => setCheckoutConsentSignerName(event.target.value)}
                  />
                </label>
                <div className="la-inquiry-modal__signature">
                  <span>Signature</span>
                  <canvas
                    ref={checkoutSignatureCanvasRef}
                    width={560}
                    height={150}
                    className="la-inquiry-modal__signature-pad"
                    onMouseDown={startSignatureDraw}
                    onMouseMove={drawSignature}
                    onMouseUp={endSignatureDraw}
                    onMouseLeave={endSignatureDraw}
                    onTouchStart={startSignatureDraw}
                    onTouchMove={drawSignature}
                    onTouchEnd={endSignatureDraw}
                  />
                  <button
                    type="button"
                    className="la-inquiry-modal__signature-clear"
                    onClick={clearSignature}
                  >
                    Clear signature
                  </button>
                </div>

                <label className="la-inquiry-modal__consent">
                  <input
                    type="checkbox"
                    checked={checkoutConsentAccepted}
                    onChange={(event) => setCheckoutConsentAccepted(event.target.checked)}
                  />
                  <span>
                    By signing and continuing to payment, you authorize OneLuxStay to charge the
                    total amount shown for your reservation. A receipt and consent proof PDF will
                    be emailed to you.
                  </span>
                </label>
                
              </div>
            </Step>

            <Step>
              <div className="la-inquiry-modal__step">
                <p className="la-inquiry-modal__fineprint">
                  Add a discount code before continuing to payment.
                </p>
                <label className="la-inquiry-modal__field">
                  <span>Discount code</span>
                  <div className="la-inquiry-modal__promo-row">
                    <input
                      type="text"
                      value={checkoutPromoCode}
                      placeholder="Enter code"
                      autoComplete="off"
                      onChange={(event) => {
                        setCheckoutPromoCode(event.target.value.toUpperCase());
                        if (checkoutPromoError) setCheckoutPromoError("");
                      }}
                    />
                    <button
                      type="button"
                      className="la-inquiry-modal__promo-btn"
                      onClick={applyCheckoutPromoCode}
                    >
                      Apply
                    </button>
                    {checkoutAppliedPromo && (
                      <button
                        type="button"
                        className="la-inquiry-modal__promo-btn is-secondary"
                        onClick={clearCheckoutPromoCode}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </label>
                {checkoutAppliedPromo && Number.isFinite(Number(pendingCheckout?.promoDiscountAmount)) && (
                  <p className="la-inquiry-modal__note is-success" role="status" aria-live="polite">
                    Code {checkoutAppliedPromo.code} applied: -
                    {formatCurrency(
                      Number(pendingCheckout?.promoDiscountAmount || 0),
                      resolveCheckoutCurrency(pendingCheckout?.currency),
                    )}
                  </p>
                )}
                {checkoutPromoError && (
                  <p className="la-inquiry-modal__note is-error" role="status" aria-live="polite">
                    {checkoutPromoError}
                  </p>
                )}
              </div>
            </Step>
            
            <Step>
              <div className="la-inquiry-modal__step">
                <p className="la-inquiry-modal__fineprint">
                  Review your details and continue to payment.
                </p>
                <div className="la-inquiry-modal__summary">
                  <div>
                    <strong>Name</strong>
                    <span>
                      {checkoutGuest.firstName} {checkoutGuest.lastName}
                    </span>
                  </div>
                  <div>
                    <strong>Email</strong>
                    <span>{checkoutGuest.email}</span>
                  </div>
                  <div>
                    <strong>Signed by</strong>
                    <span>{checkoutConsentSignerName || "--"}</span>
                  </div>
                  {checkoutAppliedPromo && (
                    <div>
                      <strong>Discount code</strong>
                      <span>
                        {checkoutAppliedPromo.code} ({Math.round(checkoutAppliedPromo.rate * 100)}% off)
                      </span>
                    </div>
                  )}
                  {pendingCheckout && Number.isFinite(Number(pendingCheckout.amount)) && (
                    <div>
                      <strong>Total to charge</strong>
                      <span>
                        {formatCurrency(
                          Number(pendingCheckout.amount),
                          resolveCheckoutCurrency(pendingCheckout?.currency),
                        )}
                      </span>
                    </div>
                  )}
                  {pendingCheckout && Number(pendingCheckout.amount) <= 0 && (
                    <p className="la-inquiry-modal__note is-success" role="status" aria-live="polite">
                      No payment is required for this booking. Continue to confirm and we will email your
                      confirmation.
                    </p>
                  )}
                  {checkoutGuestError && (
                    <p className="la-inquiry-modal__note is-error" role="status" aria-live="polite">
                      {checkoutGuestError}
                    </p>
                  )}
                  {checkoutGuest.phone && (
                    <div>
                      <strong>Phone</strong>
                      <span>{checkoutGuest.phone}</span>
                    </div>
                  )}
                  {sectionReserveLoadingId && (
                    <div className="la-checkout-loading" role="status" aria-live="polite">
                      <span className="la-checkout-loading__spinner" aria-hidden="true" />
                      <span>Redirecting to secure payment...</span>
                    </div>
                  )}
                </div>
              </div>
            </Step>
          </Stepper>
        </div>
      </div>
    </div>
  ) : null;

  const inquiryModal = isInquiryOpen ? (
        <div
          className="antwerp-modal__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Inquire about a listing"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsInquiryOpen(false);
          }}
        >
          <div className="la-inquiry-modal" role="document">
            <div className="la-inquiry-modal__header">
              <div className="la-inquiry-modal__brand">
                <img
                  {...logoHomeProps}
                  src={LOGO_URL}
                  alt="OneLuxStay logo"
                  loading="lazy"
                  className="la-inquiry-modal__logo"
                  onError={handleImageError}
                />
                <div>
                  <p className="la-inquiry-modal__kicker">Contact OneLuxStay</p>
                  <h3>Inquire about {inquiryTitle}</h3>
                  {inquiryDates && <p className="la-inquiry-modal__meta">Dates: {inquiryDates}</p>}
                </div>
              </div>
              <button
                type="button"
                className="la-inquiry-modal__close"
                onClick={() => setIsInquiryOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="la-inquiry-modal__body">
              <a className="la-inquiry-modal__action" href={inquiryEmailHref}>
                Email reservations@oneluxstay.com
              </a>
              <a
                className="la-inquiry-modal__action is-whatsapp"
                href={inquiryWhatsAppHref}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp +971 58 885 8935
              </a>
              <p className="la-inquiry-modal__note">We usually respond within an hour</p>
            </div>
          </div>
        </div>
  ) : null;

  if (isListingRoute) {
    return (
      <div className="antwerp-page has-silk">
        <div className="antwerp-silk">
          <Silk speed={4.5} scale={1.1} color="#b5a291" noiseIntensity={1.2} rotation={0.15} />
        </div>
        {listingDetail ? (
          <div className="antwerp-modal__overlay is-page">{listingDetail}</div>
        ) : (
          <ListingLoadingScreen active cityLabel="Los Angeles" />
        )}
        {checkoutGuestModal}
        {inquiryModal}
        {listingMapModal}
        {zoomModal}
        {tourModal}
      </div>
    );
  }

  return (
    <div className="antwerp-page has-silk">
      {listingMapModal}
      {zoomModal}
      {tourModal}
      {/* <section className="la-bounce-section" aria-label="Los Angeles highlights">
        <div className="la-bounce-section__inner is-stacked">
          <BounceCards
            items={bounceListings}
            containerWidth="min(760px, 96vw)"
            containerHeight="min(520px, 72vw)"
            imageSize="min(340px, 60vw)"
            enableHover
            className="la-bounce-section__cards"
            onCardClick={(item) => {
              if (!item?.id) return;
              navigate(buildListingPath(item.id));
            }}
          />
          <div className="la-bounce-section__content">
            <span className="la-bounce-section__kicker">Featured stays</span>
            <h2 className="la-bounce-section__title">Los Angeles moments in motion</h2>
            <p className="la-bounce-section__lede">
              A quick visual pulse before you dive into neighborhoods, amenities, and live pricing.
            </p>
            <div className="la-bounce-section__actions">
              <a className="la-bounce-section__cta" href="#los-angeles-units">
                Explore units
              </a>
              <a className="la-bounce-section__ghost" href="#la-city-tour">
                Browse tours
              </a>
            </div>
          </div>
        </div>
      </section> */}
      <header className="antwerp-hero">
        <div className="antwerp-hero__content">
          <nav className="city-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/" className="city-breadcrumbs__link">
              Home
            </Link>
            <span className="city-breadcrumbs__sep" aria-hidden="true">
              ›
            </span>
            <span className="city-breadcrumbs__current" aria-current="page">
              Los Angeles
            </span>
          </nav>
          <span className="antwerp-kicker">OneLuxStay / Los Angeles, California</span>
          <h1 className="antwerp-title">Los Angeles collection</h1>
          <p className="antwerp-lede">
            A curated landing page built directly from live listing data. Every detail below mirrors what is available
            right now for Los Angeles units.
          </p>
          <div className="antwerp-hero__actions">
            <a href="#la-city-tour" className="antwerp-cta">
              Browse tours
            </a>
            <a href="#los-angeles-units" className="antwerp-ghost">
              Explore units
            </a>
          </div>
          <div className="la-review-ticker" aria-label="Guest review highlights">
            <div className="la-review-ticker__track" ref={reviewCarouselRef}>
              {[...REVIEW_TICKER, ...REVIEW_TICKER].map((review, index) => (
                <article className="la-review-ticker__item" key={`${review.name}-${index}`}>
                  <div className="la-review-ticker__stars" aria-label={`${review.rating} out of 5 stars`}>
                    {Array.from({ length: STAR_TOTAL }).map((_, starIndex) => (
                      <span
                        key={`${review.name}-${index}-star-${starIndex}`}
                        className={
                          starIndex < review.rating
                            ? "la-review-ticker__star is-on"
                            : "la-review-ticker__star"
                        }
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                          <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.6z" />
                        </svg>
                      </span>
                    ))}
                  </div>
                  <p>"{review.quote}"</p>
                  <span className="la-review-ticker__meta">
                    {review.name} {"\u00b7"} {review.source}
                  </span>
                </article>
              ))}
            </div>
            <div className="la-review-ticker__controls" aria-hidden="false">
              <button
                type="button"
                className="la-review-ticker__btn"
                onClick={() => scrollReviewCarousel(-1)}
                aria-label="Previous review"
              >
                {"<"}
              </button>
              <button
                type="button"
                className="la-review-ticker__btn"
                onClick={() => scrollReviewCarousel(1)}
                aria-label="Next review"
              >
                {">"}
              </button>
            </div>
          </div>
        </div>
        <div className="antwerp-hero__media">
          <div className="la-hero-card-swap">
            <div className="la-hero-card-swap__frame">
              <CardSwap
                ref={cardSwapRef}
                width="100%"
                height="100%"
                cardDistance={64}
                verticalDistance={70}
                delay={2000}
                skewAmount={5}
                pauseOnHover
              >
                {heroCards.length ? (
                  heroCards.map((card, idx) => (
                    <Card key={`${card.image}-${idx}`} customClass="la-hero-swap-card">
                      {card.id ? (
                        <button
                          type="button"
                          className="la-hero-swap-link"
                          onClick={() =>
                            navigate(buildListingPath(card.id))
                          }
                          aria-label={`View ${card.title}`}
                        >
                          <img
                            src={card.image}
                            alt={card.title}
                            className="la-hero-swap-img"
                            loading={idx === 0 ? "eager" : "lazy"}
                            onError={handleImageError}
                          />
                          <span className="la-hero-swap-caption">{card.title}</span>
                        </button>
                      ) : (
                        <>
                          <img
                            src={card.image}
                            alt={card.title}
                            className="la-hero-swap-img"
                            loading={idx === 0 ? "eager" : "lazy"}
                            onError={handleImageError}
                          />
                          <span className="la-hero-swap-caption">{card.title}</span>
                        </>
                      )}
                    </Card>
                  ))
                ) : (
                  <Card className="la-hero-swap-card la-hero-swap-card--empty" />
                )}
              </CardSwap>
            </div>
            <div className="la-hero-swap-controls">
              <button
                type="button"
                className="la-hero-swap-btn"
                onClick={() => cardSwapRef.current?.next?.()}
                aria-label="Show next featured stay"
              >
                Next stay
              </button>
            </div>
          </div>
        </div>
        <div className="antwerp-hero__carousel" aria-label="Los Angeles hero images">
          <div className="antwerp-hero__carousel-track" ref={heroCarouselRef}>
            {heroCards.length ? (
              heroCards.map((card, idx) => (
                <button
                  key={`${card.image}-mobile-${idx}`}
                  type="button"
                  className="antwerp-hero__carousel-card"
                  style={{ backgroundImage: `url(${card.image})` }}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`View ${card.title}`}
                  onClick={() => {
                    if (!card.id) return;
                    navigate(buildListingPath(card.id));
                  }}
                />
              ))
            ) : (
              <div className="antwerp-hero__carousel-card antwerp-hero__image--empty">
                Los Angeles imagery loading
              </div>
            )}
          </div>
          <div className="antwerp-hero__carousel-controls">
            <button
              type="button"
              className="antwerp-hero__carousel-btn"
              onClick={() => scrollHeroCarousel(-1)}
              aria-label="Previous hero image"
            >
              Prev
            </button>
            <button
              type="button"
              className="antwerp-hero__carousel-btn"
              onClick={() => scrollHeroCarousel(1)}
              aria-label="Next hero image"
            >
              Next
            </button>
          </div>
        </div>
      </header>

      <main className="antwerp-main">
        <section id="la-city-tour" className="la-city-tour" aria-label="USA city tours">
          <div
            key={tourCity}
            className="la-city-tour__bg"
            style={{
              backgroundImage: `url(${(CITY_TOUR_SLIDES[tourCity] || [])[0]?.image || ""})`,
            }}
            aria-hidden="true"
          />
          <div className="la-city-tour__inner">
            <div className="la-city-tour__head">
              <div>
                <p className="antwerp-kicker">Tours</p>
                <h2>USA city tours</h2>
                <p className="antwerp-muted">
                  Choose a city and enter a cinematic tour crafted for each destination.
                </p>
                <div className="la-city-tour__cities" role="tablist" aria-label="Choose tour city">
                  {TOUR_CITIES.map((city) => (
                    <button
                      key={city}
                      type="button"
                      role="tab"
                      aria-selected={tourCity === city}
                      className={
                        tourCity === city ? "la-city-tour__city-btn is-active" : "la-city-tour__city-btn"
                      }
                      onClick={() => setTourCity(city)}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
              <div className="la-city-tour__control">
                <button
                  type="button"
                  className="antwerp-ghost la-tour-trigger"
                  onClick={() => {
                    setTourIndex(0);
                    setTourPaused(false);
                    setShowCityTour(true);
                  }}
                >
                  View {tourCity} tour
                </button>
              </div>
            </div>
            <div key={tourCity} className="la-city-tour__preview">
              <div className="la-city-tour__card">
                <p className="la-city-tour__kicker">{tourCity}</p>
                <h3>{(CITY_TOUR_SLIDES[tourCity] || [])[0]?.title || "City tour"}</h3>
                <p className="la-city-tour__copy">
                  {(CITY_TOUR_SLIDES[tourCity] || [])[0]?.subtitle ||
                    "Enter a cinematic sequence curated for your stay."}
                </p>
                <div className="la-city-tour__chips">
                  {(CITY_TOUR_SLIDES[tourCity] || [])[0]?.highlights?.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              <div
                className="la-city-tour__image"
                style={{
                  backgroundImage: `url(${(CITY_TOUR_SLIDES[tourCity] || [])[0]?.image || ""})`,
                }}
                aria-hidden="true"
              />
            </div>
            <div className="la-city-tour__control la-city-tour__control--mobile">
              <button
                type="button"
                className="antwerp-ghost la-tour-trigger"
                onClick={() => {
                  setTourIndex(0);
                  setTourPaused(false);
                  setShowCityTour(true);
                }}
              >
                View {tourCity} tour
              </button>
            </div>
          </div>
        </section>

        <section className="antwerp-section" id="los-angeles-units">
          <div className="la-units-layout">
            <div className="la-units-main">
              <div className="antwerp-section__head">
                <div>
                  <p className="antwerp-kicker">Available now</p>
                  <h2>Los Angeles buildings</h2>
                  <p className="antwerp-muted">
                    Every card below is derived from the live Guesty listing response, including pricing, capacity, and
                    amenities metadata.
                  </p>
                </div>
                <div className="la-stats-row">
                  <div className="la-stat-card">
                    <span className="la-stat-label">Property types</span>
                    <strong className="la-stat-value">{stats.propertyTypeLabel}</strong>
                  </div>
                  <div className="la-stat-card">
                    <span className="la-stat-label">Listings</span>
                    <strong className="la-stat-value">{stats.units || "--"}</strong>
                  </div>
                  <div className="la-stat-card">
                    <span className="la-stat-label">Currency</span>
                    <strong className="la-stat-value">{stats.currency}</strong>
                  </div>
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

              {!loading && !error && losAngelesParentListings.length === 0 && (
                <div className="antwerp-empty">
                  No Los Angeles listings are available in the current response.
                </div>
              )}

              {groupedListingsDisplay.map((group) => {
                const story = SECTION_STORIES[group.key] || SECTION_STORIES.other;
                const storyImages = [];
                const seenStoryImages = new Set();
                const pushStoryImage = (value) => {
                  const url = extractImageUrl(value) || getImageUrl(value);
                  if (!url || url === FALLBACK_IMAGE) return;
                  const key = getImageKey(url) || url;
                  if (seenStoryImages.has(key)) return;
                  seenStoryImages.add(key);
                  storyImages.push(url);
                };
                group.listings.forEach((listing) => {
                  const hasPictures = Array.isArray(listing.pictures) && listing.pictures.length > 0;
                  if (!hasPictures) pushStoryImage(listing.picture);
                  if (hasPictures) listing.pictures.forEach(pushStoryImage);
                });
                storyImages.splice(1);
                const groupStats = getGroupStats(group.listings);
                const buildingPrice = buildingPrices[group.key];
                const latestPrice = buildingPrice
                  ? formatCurrency(buildingPrice.total, buildingPrice.currency)
                  : null;
                const sectionTitle = (() => {
                  switch (group.key) {
                    case "la-hwh":
                      return "One Lux Stay HWH Downtown Los Angeles";
                    case "la-downtown":
                      return "One Lux Stay LA Plaza Village";
                    case "la-hollywood":
                      return "One Lux Stay Hollywood View LA Suites";
                    default:
                      return "One Lux Stay Near Dodger Stadium Downtown LA";
                  }
                })();
                return (
                  <section key={group.key} className="antwerp-building">
                    <div className="antwerp-building__head">
                      <div>
                        <p className="antwerp-kicker">{group.label}</p>
                        <h3>{sectionTitle}</h3>
                      </div>
                    </div>
                    {(() => {
                      const openSection = () => {
                        const groupListingIds = group.listings
                          .map((listing) => getListingId(listing))
                          .filter(Boolean);
                        const matchedGroup = groupedListingsAll.find((candidate) =>
                          candidate.listings.some((listing) => groupListingIds.includes(getListingId(listing)))
                        );
                        const sectionKey = matchedGroup?.key || group.key;
                        const sectionListings = matchedGroup?.listings?.length
                          ? matchedGroup.listings
                          : group.listings;
                        setActiveSectionKey(sectionKey);
                        navigate(buildSectionRoute(sectionKey));
                        const listingIds = sectionListings
                          .map((listing) => getListingId(listing))
                          .filter(Boolean);
                        const listingId = getPrimaryListingId(sectionListings);
                        if (listingIds.length) {
                          fetchAvailabilityListings({ listingIds, listingId });
                        }
                      };
                      return (
                        <div
                          className="la-story"
                          role="button"
                          tabIndex={0}
                          aria-label={`View units in ${group.label}`}
                          onClick={openSection}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openSection();
                            }
                          }}
                        >
                          <div className="la-story__media" aria-hidden="true">
                            {storyImages.length ? (
                              storyImages.map((src, idx) => (
                                <div
                                  key={`${group.key}-story-${idx}`}
                                  className="la-story__image"
                                  style={{ backgroundImage: `url(${src})` }}
                                />
                              ))
                            ) : (
                              <div className="la-story__image la-story__image--empty">Image loading</div>
                            )}
                          </div>
                          <div className="la-story__content">
                            <p className="la-story__tag">{story.title}</p>
                            <h4>{story.tagline}</h4>
                            <p className="la-story__copy">{story.copy}</p>
                            <div className="la-story__row" aria-label="Landmarks and transit near this area">
                              <div className="la-story__track">
                                {[...story.landmarks, ...story.transit].map((item, idx) => (
                                  <span key={`${group.key}-story-${idx}`} className="la-story__pill">
                                    {item}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="antwerp-card__ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                openSection();
                              }}
                            >
                              View units in {group.label}
                            </button>
                            <p className="la-story__price" aria-live="polite">
                              {latestPrice ? (
                                <>
                                  <span className="la-story__price-amount">From {latestPrice}</span>
                                  <span className="la-story__price-note">
                                    total (accommodation + cleaning + tax)
                                  </span>
                                </>
                              ) : (
                                "Pricing updates when quotes load."
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </section>
                );
              })}
            </div>
            <aside className="la-units-aside">
              <div className="la-units-map-card">
                <p className="antwerp-kicker">Neighborhood map</p>
                <h3>Walkable highlights</h3>
                <p className="antwerp-muted">
                  See nearby landmarks and public transport around Hollywood Blvd.
                </p>
                {!isMapEnabled ? (
                  <div
                    className="la-units-map la-units-map--placeholder"
                    style={{
                      "--map-placeholder-image": mapPlaceholderImage ? `url(${mapPlaceholderImage})` : "none",
                    }}
                  >
                    <div className="la-units-map__placeholder-content">
                      <p className="antwerp-muted" style={{ margin: 0 }}>
                        Map loads on demand to keep the page fast.
                      </p>
                      <button
                        type="button"
                        className="antwerp-card__ghost"
                        onClick={() => {
                          mapLoadedRef.current = false;
                          setMapError("");
                          setIsMapEnabled(true);
                        }}
                      >
                        Enable map
                      </button>
                    </div>
                  </div>
                ) : mapError ? (
                  <div
                    className="la-units-map"
                    style={{
                      width: "100%",
                      borderRadius: "20px",
                      border: "1px solid rgba(201, 181, 156, 0.6)",
                      overflow: "hidden",
                      background: "rgba(249, 248, 246, 0.8)",
                      minHeight: "260px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      textAlign: "center",
                      padding: "24px",
                    }}
                  >
                    <p className="antwerp-muted" style={{ margin: 0 }}>
                      {mapError}
                    </p>
                    <button
                      type="button"
                      className="antwerp-card__ghost"
                      onClick={() => {
                        setMapError("");
                        mapLoadedRef.current = false;
                        setIsMapEnabled(false);
                        setTimeout(() => setIsMapEnabled(true), 0);
                      }}
                    >
                      Retry map
                    </button>
                  </div>
                ) : (
                  <div
                    ref={mapRef}
                    aria-label="Map showing Hollywood Blvd with nearby landmarks and public transport"
                    className="la-units-map"
                    style={{
                      width: "100%",
                      borderRadius: "20px",
                      border: "1px solid rgba(201, 181, 156, 0.6)",
                      overflow: "hidden",
                      background: "rgba(249, 248, 246, 0.8)",
                    }}
                  />
                )}
              </div>
            </aside>
          </div>
        </section>
      </main>

      {activeSection && (
        <div className="antwerp-modal__overlay" role="dialog" aria-modal="true" aria-label="Listings modal">
          <div className="la-section-modal">
            <div className="la-section-modal__header">
              <button
                type="button"
                className="la-section-modal__back"
                aria-label="Close listings"
                onClick={closeActiveSection}
              >
                Back to destinations
              </button>
              <div>
                <p className="la-section-modal__tag">Available now</p>
                <h3>{(() => {
                  switch (activeSection.key) {
                    case "la-hwh":
                      return "One Lux Stay HWH Downtown Los Angeles";
                    case "la-downtown":
                      return "One Lux Stay LA Plaza Village";
                    case "la-hollywood":
                      return "One Lux Stay Hollywood View LA Suites";
                    case "other":
                      return "Near Dodger Stadium";
                    default:
                      return `One Lux Stay ${activeSection.label}`;
                  }
                })()}</h3>
                <p className="la-section-modal__subtitle">
                  {(() => {
                    const sourceList = sectionAvailabilityActive
                      ? sectionAvailability
                      : activeSection.listings;
                    const parentGroups = groupListingsByParent(sourceList);
                    const parentCount = Object.values(parentGroups).filter(
                      (group) => group.parent || group.children?.length
                    ).length;
                    return `${parentCount} units ready for your dates.`;
                  })()}
                </p>
              </div>
            </div>
            {(() => {
              const images = activeSection.listings
                .flatMap((listing) => {
                  const hasPictures = Array.isArray(listing.pictures) && listing.pictures.length > 0;
                  if (hasPictures) return listing.pictures.map((pic) => getImageUrl(pic));
                  return [getImageUrl(listing.picture)];
                })
                .filter(Boolean)
                .slice(0, 8);
              const safeIndex = Math.min(sectionHeroIndex, Math.max(images.length - 1, 0));
              const mainImage = images[safeIndex];
              const sideImages = [images[(safeIndex + 1) % images.length], images[(safeIndex + 2) % images.length]];
              const stats = activeSection.listings.reduce(
                (acc, listing) => {
                  const { rating, count } = getReviewStats(getListingReviews(listing));
                  if (rating) {
                    acc.ratingSum += Number(rating);
                    acc.ratingCount += 1;
                  }
                  if (count) acc.reviewCount += Number(count);
                  return acc;
                },
                { ratingSum: 0, ratingCount: 0, reviewCount: 0 }
              );
              const sectionReviews = SECTION_REVIEWS[activeSection.key] || [];
              const reviewRatings = sectionReviews
                .map((review) => (Number.isFinite(Number(review.rating)) ? Number(review.rating) : null))
                .filter((rating) => rating !== null);
              const reviewCount = sectionReviews.length || stats.reviewCount;
              const averageRating = reviewRatings.length
                ? (reviewRatings.reduce((sum, rating) => sum + rating, 0) / reviewRatings.length).toFixed(1)
                : stats.ratingCount
                  ? (stats.ratingSum / stats.ratingCount).toFixed(1)
                  : null;
              const reviewQuote =
                sectionReviews.find((review) => review.quote && review.quote.trim())?.quote ||
                "Guests love the easy flow between stays, skyline views, and quick access to local landmarks.";
              const amenityPool = activeSection.listings.flatMap((listing) => {
                if (Array.isArray(listing.amenities)) return listing.amenities;
                if (Array.isArray(listing.tags)) return listing.tags;
                return [];
              });
              const facilityList = [...new Set(amenityPool.filter((item) => typeof item === "string"))].slice(0, 8);
              const facilities =
                activeSection.key === "la-hollywood"
                  ? HOLLYWOOD_FACILITIES
                  : facilityList.length
                    ? facilityList
                    : ["Wi-Fi", "Kitchen", "Washer"];
              const sectionParentGroups = groupListingsByParent(activeSection.listings);
              const sectionParent =
                Object.values(sectionParentGroups).map((group) => group.parent || group.children?.[0]).find(Boolean) ||
                activeSection.listings[0];
              const coords = sectionParent ? getListingCoords(sectionParent) : null;
              const addressQuery = sectionParent ? formatAddress(sectionParent) : "";
              const sectionLabel = sectionParent ? resolveGroupTitle(sectionParent) : "OneLuxStay";
              const mapCoords = coords || PROPERTY_COORDS;
              const mapUrl = buildStaticMapUrl(mapCoords, "520x320", 13);
              const mapEmbedUrl = buildEmbedMapUrl(mapCoords, 14);
              return (
                <div className="la-section-hero">
                  <div className="la-section-hero__media">
                    <div className="la-section-hero__main">
                      {mainImage ? (
                        <button
                          type="button"
                          className="la-section-hero__button"
                          onClick={() => setSectionHeroIndex(safeIndex)}
                        >
                          <img src={mainImage} alt={`${activeSection.label} featured`} loading="eager" />
                        </button>
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                    </div>
                    <div className="la-section-hero__side">
                      {sideImages.map((src, idx) =>
                        src ? (
                          <button
                            key={`side-${idx}`}
                            type="button"
                            className="la-section-hero__button"
                            onClick={() => setSectionHeroIndex((safeIndex + idx + 1) % images.length)}
                          >
                            <img src={src} alt="" loading={idx === 0 ? "eager" : "lazy"} />
                          </button>
                        ) : (
                          <div key={`side-${idx}`} className="la-unit-modal__placeholder">
                            Image loading
                          </div>
                        )
                      )}
                    </div>
                    {images.length > 3 && (
                      <div
                        className="la-section-hero__thumbs"
                        role="list"
                        ref={sectionThumbsRef}
                        onMouseEnter={(event) => {
                          hoveredThumbsRef.current = sectionThumbsRef.current;
                          handleThumbsMove(event, sectionThumbsRef);
                        }}
                        onMouseMove={handleThumbsMove}
                        onMouseLeave={() => {
                          hoveredThumbsRef.current = null;
                          stopAutoScroll();
                        }}
                      >
                        <div
                          className="la-thumb-scroll-zone la-thumb-scroll-zone--left"
                          onMouseEnter={() => {
                            console.log("[Thumbs] hover left zone");
                            startAutoScroll(sectionThumbsRef.current, -1);
                          }}
                          onMouseLeave={stopAutoScroll}
                        />
                        <div
                          className="la-thumb-scroll-zone la-thumb-scroll-zone--right"
                          onMouseEnter={() => {
                            console.log("[Thumbs] hover right zone");
                            startAutoScroll(sectionThumbsRef.current, 1);
                          }}
                          onMouseLeave={stopAutoScroll}
                        />
                        {images.map((src, idx) => (
                          <button
                            key={`${src}-${idx}`}
                            type="button"
                            className={idx === safeIndex ? "is-active" : ""}
                            onClick={() => setSectionHeroIndex(idx)}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <img src={src} alt="" loading={idx === 0 ? "eager" : "lazy"} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <aside className="la-section-hero__aside">
                    <div className="la-section-hero__contact" aria-label="Reservation contact">
                      <p>For Reservation Contact</p>
                      <strong>OneLuxStay Los Angeles</strong>
                      <a href="tel:+12138663589">+1 213 866 3589</a>
                      <a href="mailto:reservations@oneluxstay.com">reservations@oneluxstay.com</a>
                      <a href="mailto:reservations@oneluxstay.com" className="la-unit-modal__contact-cta">
                        Message concierge
                      </a>
                      <a
                        href={buildWhatsAppLink(sectionParent?.title || sectionLabel, sectionCheckIn, sectionCheckOut)}
                        className="la-unit-modal__contact-cta"
                        target="_blank"
                        rel="noreferrer"
                      >
                        WhatsApp us
                      </a>
                    </div>
                    <div className="la-section-hero__review">
                      {(() => {
                        const reviewText = reviewQuote || "";
                        const limit = 80;
                        const shouldTruncate = reviewText.length > limit;
                        const displayText = shouldTruncate && !isReviewExpanded
                          ? `${reviewText.slice(0, limit).trim()}...`
                          : reviewText;
                        const listingsForReview = activeSection.listings || [];
                        const hasPlazaListing = listingsForReview.some((listing) =>
                          /(?:l\.?\s*a\.?\s*)?plaza\s+village|\bla\s*plaza\b/i.test(
                            getListingText(listing)
                          )
                        );
                        const hasDodgerListing = listingsForReview.some((listing) =>
                          /dodger|stadium/i.test(getListingText(listing))
                        );
                        const reviewsLink = hasPlazaListing
                          ? LA_PLAZA_REVIEW_LINK
                          : hasDodgerListing
                            ? NEAR_DODGER_REVIEW_LINK
                            : sectionParent
                              ? getReviewLink(sectionParent)
                              : GOOGLE_REVIEW_LINKS[activeSection.key];
                        return (
                          <>
                            <div>
                              <strong>Guest pulse</strong>
                              {reviewCount ? (
                                reviewsLink ? (
                                  <a
                                    className="la-section-hero__review-link"
                                    href={reviewsLink}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {reviewCount} reviews
                                  </a>
                                ) : (
                                  <span>{reviewCount} reviews</span>
                                )
                              ) : (
                                <span>No review data</span>
                              )}
                            </div>
                            <div className="la-section-hero__score">
                              {averageRating ? `${averageRating} / 5` : "--"}
                            </div>
                            <p>{displayText}</p>
                            {shouldTruncate && (
                              <button
                                type="button"
                                className="la-section-hero__review-toggle"
                                onClick={() => setIsReviewExpanded((prev) => !prev)}
                              >
                                {isReviewExpanded ? "See less" : "See more"}
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div className="la-section-hero__map">
                      <button
                        type="button"
                        className="la-section-hero__map-expand"
                        onClick={() => {
                          setSectionMapTarget({
                            coords,
                            address: addressQuery,
                            label: sectionLabel,
                          });
                          setIsSectionMapOpen(true);
                        }}
                      >
                        View larger map
                      </button>
                      {mapEmbedUrl ? (
                        <iframe
                          title="Building location map"
                          src={mapEmbedUrl}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          allowFullScreen
                        />
                      ) : mapUrl ? (
                        <img src={mapUrl} alt="Map showing the building location" loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Map loading</div>
                      )}
                    </div>
                  </aside>
                </div>
              );
            })()}
            {(() => {
              const listingPool = activeSection?.listings?.length
                ? activeSection.listings
                : activeListing
                  ? losAngelesListings.filter(
                    (listing) => getListingGroupKey(listing) === getListingGroupKey(activeListing)
                  ).length
                    ? losAngelesListings.filter(
                      (listing) => getListingGroupKey(listing) === getListingGroupKey(activeListing)
                    )
                    : [activeListing]
                  : [];
              const amenityPool = listingPool.flatMap((listing) => {
                if (Array.isArray(listing.amenities)) return listing.amenities;
                return [];
              });
              const amenityList = [...new Set(amenityPool.filter((item) => typeof item === "string"))];
              const fallbackListing = listingPool[0] || activeListing;
              const minNightsFallback = activeSection?.listings?.length
                ? sectionMinNightsFallback
                : listingMinNightsFallback;
              return (
                <>
                  <div className="la-unit-modal__booking" aria-label="Availability check">
                    <DateRangePicker
                      value={{ checkIn: sectionCheckIn, checkOut: sectionCheckOut }}
                      dayPrices={sectionCalendarDayMap}
                      isLoading={sectionCalendarLoading}
                      fallbackPrice={fallbackListing?.basePrice}
                      fallbackCurrency={fallbackListing?.currency || "USD"}
                      fallbackMinNights={minNightsFallback}
                      showMinNights={false}
                      onMonthChange={(month) => {
                        setSectionCalendarStartDate(new Date(month.getFullYear(), month.getMonth(), 1));
                      }}
                      onOpenChange={handleSectionCalendarOpen}
                      onChange={({ checkIn, checkOut }) => {
                        setSectionCheckIn(checkIn);
                        setSectionCheckOut(checkOut);
                      }}
                    />
                    <div>
                      <label htmlFor="la-section-guests">Guests</label>
                      <select
                        id="la-section-guests"
                        value={sectionGuests}
                        onChange={(event) => setSectionGuests(event.target.value)}
                      >
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className="la-unit-modal__booking-cta"
                      onClick={() => fetchAvailabilityListings({ shouldScroll: true })}
                    >
                      {sectionAvailabilityLoading ? "Checking..." : "Check availability"}
                    </button>
                  </div>
                  {sectionAvailabilityError && (
                    <div role="alert" className="la-section-hero__notice">
                      {sectionAvailabilityError}
                    </div>
                  )}
                  <div className="la-unit-modal__section">
                    <h4>About this property</h4>
                    <p>
                      A calm base with quick access to the neighborhood's best corners. Expect bright spaces, effortless
                      arrivals, and a stay that keeps everything close - landmarks, transit, and the city's rhythm.
                    </p>
                  </div>
                </>
              );
            })()}
            <div
              ref={availabilityTableRef}
              className={`la-booking-table${sectionAvailabilityLoading ? " is-loading" : ""}`}
              role="table"
              aria-label="Available units"
              aria-busy={sectionAvailabilityLoading ? "true" : "false"}
            >
              {sectionAvailabilityLoading && (
                <div className="la-booking-table__progress" role="status" aria-live="polite">
                  <div className="la-booking-table__progress-bar" />
                </div>
              )}
              <div className="la-booking-table__head" role="row">
                <div role="columnheader">Room type</div>
                <div role="columnheader">Guests</div>
                <div role="columnheader">Today&apos;s price</div>
                <div role="columnheader">Your choices</div>
                <div role="columnheader">Virtual tour</div>
              </div>
              {sectionAvailabilityLoading ? (
                <>
                  {[0, 1, 2].map((idx) => (
                    <div key={`la-skeleton-${idx}`} className="la-booking-table__row la-booking-table__row--skeleton">
                      <div className="la-booking-table__cell">
                        <div className="la-booking-table__title">
                          <div className="la-skeleton-block la-skeleton-image" />
                          <div className="la-skeleton-stack">
                            <div className="la-skeleton-block la-skeleton-line sm" />
                            <div className="la-skeleton-block la-skeleton-line lg" />
                            <div className="la-skeleton-block la-skeleton-line md" />
                            <div className="la-skeleton-block la-skeleton-line md" />
                          </div>
                        </div>
                      </div>
                      <div className="la-booking-table__cell">
                        <div className="la-skeleton-stack">
                          <div className="la-skeleton-block la-skeleton-line sm" />
                          <div className="la-skeleton-block la-skeleton-line sm" />
                          <div className="la-skeleton-block la-skeleton-line sm" />
                        </div>
                      </div>
                      <div className="la-booking-table__cell">
                        <div className="la-skeleton-stack">
                          <div className="la-skeleton-block la-skeleton-line lg" />
                          <div className="la-skeleton-block la-skeleton-line md" />
                          <div className="la-skeleton-block la-skeleton-line sm" />
                        </div>
                      </div>
                      <div className="la-booking-table__cell">
                        <div className="la-skeleton-stack">
                          <div className="la-skeleton-block la-skeleton-select" />
                          <div className="la-skeleton-block la-skeleton-line sm" />
                        </div>
                      </div>
                      <div className="la-booking-table__cell">
                        <div className="la-skeleton-block la-skeleton-button" />
                      </div>
                    </div>
                  ))}
                </>
              ) : !sectionAvailabilityActive ? (
                <div className="la-section-hero__notice">
                  Choose check-in and check-out date, then click Check availability.
                </div>
              ) : (
                <>
                  {(() => {
                    const sourceList = sectionAvailabilityActive
                      ? sectionAvailability
                      : activeSection.listings;
                    const bedLookupList = activeSection?.listings?.length
                      ? activeSection.listings
                      : sourceList;
                    const listingsToRender = (() => {
                      if (!activeSection?.listings?.length) return [];
                      const parentGroups = groupListingsByParent(sourceList);
                      return Object.values(parentGroups)
                        .map((group) => group.parent || group.children?.[0])
                        .filter(Boolean);
                    })();
                    if (sectionAvailabilityActive && !listingsToRender.length) {
                      return (
                        <div className="la-section-hero__notice" role="status">
                          No available units for these dates.
                        </div>
                      );
                    }
                    return listingsToRender.map((listing, index) => {
                      const listingId = listing.id || listing._id;
                      const listingPathId = listing.id || listing._id || listing.unitTypeId || listingId;
                      const listingPath = listingPathId ? buildListingPath(listingPathId) : "/los-angeles";
                      const image = getListingImageUrls(listing)[0] || FALLBACK_IMAGE;
                      const listingCurrency = listing.currency || "USD";
                      const fullDescription = formatFullDescription(listing);
                      const shortDescription = getFirstSentence(fullDescription);
                      const quote = listingId ? sectionQuotes[listingId] : null;
                      const planOptions = quote?.plans || [];
                      const selectedPlanId =
                        selectedRatePlans[listingId] ||
                        quote?.defaultPlanId ||
                        planOptions[0]?.id ||
                        "";
                      const selectedPlan =
                        planOptions.find((plan) => plan.id === selectedPlanId) || planOptions[0];
                      const baseNightly = selectedPlan?.nightly ?? listing.basePrice;
                      const priceCurrency = selectedPlan?.currency ?? listingCurrency;
                      const breakdown = selectedPlan?.breakdown;
                      const isLoadingRates = sectionAvailabilityLoading;
                      const fallbackTotal =
                        typeof baseNightly === "number" && quote?.nights
                          ? baseNightly * quote.nights +
                          (typeof listing.cleaningFee === "number" ? listing.cleaningFee : 0)
                          : null;
                      const total =
                        breakdown?.total ??
                        breakdown?.subtotal ??
                        selectedPlan?.total ??
                        fallbackTotal ??
                        null;
                      const originalTotal =
                        breakdown && typeof breakdown.discountAmount === "number"
                          ? breakdown.total + breakdown.discountAmount
                          : null;
                      const checkoutListingId =
                        listing.unitTypeId || listing.id || listing._id || listingId;
                      const isUnavailable =
                        sectionAvailabilityActive && sectionAvailabilityMap[listingId] === false;
                      const isReserving = sectionReserveLoadingId === checkoutListingId;
                      const priceValue =
                        typeof total === "number"
                          ? total
                          : typeof baseNightly === "number"
                            ? baseNightly
                            : baseNightly;
                      const breakdownId = `la-quote-${listingId}`;
                      const isExpanded = Boolean(expandedQuoteRows[listingId]);
                      const bedDetails = (() => {
                        const direct = getBedDetails(listing);
                        const resolvedDirect = direct.length ? direct : (listing.bedDetails || []);
                        if (resolvedDirect.length) return resolvedDirect;
                        const groupKey = getListingGroupKey(listing);
                        if (!groupKey || !Array.isArray(bedLookupList)) return [];
                        const fallback = bedLookupList.find((entry) => {
                          if (getListingGroupKey(entry) !== groupKey) return false;
                          if (entry.bedDetails && entry.bedDetails.length) return true;
                          return getBedDetails(entry).length > 0;
                        });
                        if (!fallback) return [];
                        const fallbackDirect = getBedDetails(fallback);
                        return fallbackDirect.length ? fallbackDirect : (fallback.bedDetails || []);
                      })();
                      const bedLines = bedDetails
                        .map(splitBedDetailLine)
                        .filter((line) => line.detail);
                      return (
                        <article key={listingId} className="la-booking-table__row" role="row">
                          <div className="la-booking-table__cell" role="cell">
                            <div className="la-booking-table__title">
                              {image ? (
                                <img src={image} alt="" loading={index === 0 ? "eager" : "lazy"} />
                              ) : (
                                <div className="la-booking-table__placeholder" aria-hidden="true" />
                              )}
                              <div>
                                <p className="la-booking-table__eyebrow">
                                  {listing.propertyType || listing.roomType || "Residence"}
                                </p>
                                <Link className="la-booking-table__title-link" to={listingPath}>
                                  {sanitizeText(listing.title)}
                                </Link>
                                <p className="la-booking-table__room-meta">
                                  <span className="la-booking-table__meta-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                      <path d="M3 10.5c0-1.7 1.3-3 3-3h12c1.7 0 3 1.3 3 3V20h-2v-3H5v3H3v-9.5zm2 4.5h14v-4.5c0-.6-.4-1-1-1H6c-.6 0-1 .4-1 1V15zm2-8h2v2H7V7zm8 0h2v2h-2V7z" />
                                    </svg>
                                  </span>
                                  <span>
                                    {typeof listing.beds === "number" || typeof listing.bedrooms === "number"
                                      ? `Beds ${listing.beds ?? listing.bedrooms}`
                                      : "Beds --"}
                                  </span>
                                </p>
                                {bedLines.length > 0 && (
                                  <div className="la-booking-table__bed-details">
                                    {bedLines.map((line, idx) => (
                                      <div
                                        key={`${listingId}-bed-${idx}`}
                                        className={`la-booking-table__bed-row${line.label ? "" : " is-single"}`}
                                      >
                                        {line.label ? (
                                          <span className="la-booking-table__bed-room">{line.label}</span>
                                        ) : null}
                                        <span className="la-booking-table__bed-desc">
                                          {line.detail}
                                          <span className="la-booking-table__bed-icon">
                                            <BedIcon />
                                          </span>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="la-booking-table__cell" role="cell">
                            <div className="la-booking-table__guests" aria-label={`Sleeps ${listing.accommodates || "--"}`}>
                              <div className="la-booking-table__guest-icons" aria-hidden="true">
                                {Array.from({ length: Math.min(Number(listing.accommodates) || 1, 5) }).map((_, idx) => (
                                  <svg key={`${listingId}-guest-${idx}`} viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                                    <path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z" />
                                  </svg>
                                ))}
                              </div>
                              <span className="sr-only">Sleeps {listing.accommodates || "--"}</span>
                            </div>
                          </div>
                          <div className="la-booking-table__cell" role="cell">
                            <div className="la-booking-table__price">
                              {isLoadingRates ? (
                                <>
                                  <strong>Checking rates...</strong>
                                  <span>Updating totals</span>
                                </>
                              ) : isUnavailable ? (
                                <>
                                  <strong>Inquire for exact pricing</strong>
                                  <span>We'll confirm rates & availability.</span>
                                </>
                              ) : (
                                <>
                                  {originalTotal && originalTotal > priceValue && (
                                    <span className="la-booking-table__price-original">
                                      {formatCurrency(originalTotal, priceCurrency)}
                                    </span>
                                  )}
                                  <strong>{formatCurrency(priceValue, priceCurrency)}</strong>
                                  <span>
                                    Total (cleaning + tax included)
                                  </span>
                                </>
                              )}
                              {!isUnavailable && (
                                <>
                                  <button
                                    type="button"
                                    className="la-booking-table__breakdown-toggle"
                                    aria-expanded={isExpanded}
                                    aria-controls={breakdownId}
                                    disabled={isLoadingRates}
                                    onClick={() =>
                                      setExpandedQuoteRows((prev) => ({
                                        ...prev,
                                        [listingId]: !prev[listingId],
                                      }))
                                    }
                                  >
                                    {isLoadingRates
                                      ? "Price breakdown loading..."
                                      : isExpanded
                                        ? "Hide price breakdown"
                                        : "View price breakdown"}
                                  </button>
                                  {isExpanded && (
                                    <div className="la-booking-table__breakdown" role="region" id={breakdownId}>
                                      {breakdown ? (
                                        <>
                                          <div>
                                            <span>Accommodation</span>
                                            <strong>{formatCurrency(breakdown.accommodation, priceCurrency)}</strong>
                                          </div>
                                          {breakdown.discountAmount > 0 && (
                                            <div>
                                              <span>
                                                Direct booking discount ({Math.round(breakdown.discountRate * 100)}%)
                                              </span>
                                              <strong>
                                                -{formatCurrency(breakdown.discountAmount, priceCurrency)}
                                              </strong>
                                            </div>
                                          )}
                                          <div>
                                            <span>Cleaning</span>
                                            <strong>{formatCurrency(breakdown.cleaning, priceCurrency)}</strong>
                                          </div>
                                          <div>
                                            <span>Taxes</span>
                                            <strong>{formatCurrency(breakdown.taxes, priceCurrency)}</strong>
                                          </div>
                                          <div>
                                            <span>Fees</span>
                                            <strong>{formatCurrency(breakdown.fees, priceCurrency)}</strong>
                                          </div>
                                          <div className="la-booking-table__total">
                                            <span>Total</span>
                                            <strong>{formatCurrency(breakdown.total, priceCurrency)}</strong>
                                          </div>
                                        </>
                                      ) : null}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="la-booking-table__cell" role="cell">
                            {!isUnavailable && (
                              <ul className="la-booking-table__choices">
                                {planOptions.length > 0 ? (
                                  <li>
                                    <label htmlFor={`rate-plan-${listingId}`} className="sr-only">
                                      Select rate plan
                                    </label>
                                    <select
                                      id={`rate-plan-${listingId}`}
                                      value={selectedPlanId}
                                      disabled={isLoadingRates}
                                      onChange={(e) =>
                                        setSelectedRatePlans((prev) => ({
                                          ...prev,
                                          [listingId]: e.target.value,
                                        }))
                                      }
                                      className="la-booking-table__rate-select"
                                    >
                                      {planOptions.map((plan) => (
                                        <option key={plan.id} value={plan.id}>
                                          {plan.label}
                                        </option>
                                      ))}
                                    </select>
                                  </li>
                                ) : null}
                                <li>Policies shown at checkout</li>
                              </ul>
                            )}
                          </div>
                          <div className="la-booking-table__cell" role="cell">
                            <div className="la-booking-table__cta-group">
                              {isUnavailable ? (
                                <button
                                  type="button"
                                  className="la-booking-table__reserve la-booking-table__inquire"
                                  onClick={() => openInquiry(listing)}
                                >
                                  Inquire
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="la-booking-table__reserve"
                                  disabled={isLoadingRates || isReserving}
                                  onClick={() => {
                                    setPendingCheckout({
                                      listingId: checkoutListingId,
                                      listingTitle: listing.title,
                                      amount: typeof total === "number" ? total : null,
                                      currency: resolveCheckoutCurrency(priceCurrency),
                                      breakdown: selectedPlan?.breakdown || null,
                                      baseAmount: typeof total === "number" ? total : null,
                                      baseBreakdown: selectedPlan?.breakdown || null,
                                      promoCode: "",
                                      promoDiscountRate: 0,
                                      promoDiscountAmount: 0,
                                    });
                                    setCheckoutStep(1);
                                    setCheckoutConsentAccepted(false);
                                    setCheckoutConsentSignerName("");
                                    setCheckoutConsentSignatureDataUrl("");
                                    setCheckoutPromoCode("");
                                    setCheckoutPromoError("");
                                    setCheckoutAppliedPromo(null);
                                    setCheckoutGuestError("");
                                    setIsCheckoutGuestOpen(true);
                                  }}
                                >
                                  {isReserving ? "Redirecting..." : "Reserve"}
                                </button>
                              )}
                              <button
                                type="button"
                                className="la-booking-table__cta"
                                disabled={isLoadingRates}
                              >
                                Virtual tour
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    });
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {inquiryModal}

      {checkoutGuestModal}

      {activeListing && !isListingRoute && (
        <div
          className={`antwerp-modal__overlay${isListingRoute ? " is-page" : ""}`}
          role={isListingRoute ? undefined : "dialog"}
          aria-modal={isListingRoute ? undefined : "true"}
        >
          <div className="la-unit-modal">
            <div className="la-unit-modal__header">
              <button
                type="button"
                className="la-unit-modal__back"
                onClick={() => {
                  setActiveListing(null);
                  setActiveImageIndex(0);
                  if (isListingRoute) {
                    navigate("/los-angeles");
                  }
                }}
              >
                Back to listings
              </button>
              <div className="la-unit-modal__contact" aria-label="Reservation contact">
                <p>For Reservation Contact</p>
                <strong>OneLuxStay Los Angeles</strong>
                <a href="tel:+12138663589">+1 213 866 3589</a>
                <a href="mailto:reservations@oneluxstay.com">reservations@oneluxstay.com</a>
                <a href="mailto:reservations@oneluxstay.com" className="la-unit-modal__contact-cta">
                  Message concierge
                </a>
                <a
                  href={buildWhatsAppLink(activeListing?.title, sectionCheckIn, sectionCheckOut)}
                  className="la-unit-modal__contact-cta"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp us
                </a>
              </div>
            </div>
            <div className="la-unit-modal__intro">
              <div>
                <h3>{formatListingLocationLabel(activeListing, "Los Angeles")}</h3>
                <div className="la-unit-modal__chips">
                  <span>Exceptional location</span>
                  <span>Fast arrival</span>
                </div>
                <p className="la-unit-modal__address">{formatAddress(activeListing)}</p>
                {(() => {
                  const { rating, count } = getReviewStats(getListingReviews(activeListing));
                  if (!rating && !count) return null;
                  return (
                    <p className="la-unit-modal__rating">
                      Rating: {rating ? `${rating} / 5` : "--"}{count ? ` (${count} reviews)` : ""}
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="la-unit-modal__tabs" role="tablist" aria-label="Listing sections">
              <button
                type="button"
                className={listingTab === "overview" ? "is-active" : ""}
                onClick={() => handleListingTabClick("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                className={listingTab === "facilities" ? "is-active" : ""}
                onClick={() => handleListingTabClick("facilities")}
              >
                Facilities
              </button>
              <button
                type="button"
                className={listingTab === "guest-reviews" ? "is-active" : ""}
                onClick={() => handleListingTabClick("guest-reviews")}
              >
                Guest reviews
              </button>
              <button
                type="button"
                className={listingTab === "house-rules" ? "is-active" : ""}
                onClick={() => handleListingTabClick("house-rules")}
              >
                House rules
              </button>
            </div>
            {(() => {
              const galleryListing = getGalleryListing(activeListing, listings);
              const images = getListingImageUrls(galleryListing);
              const hasImages = images.length > 0;
              const safeIndex = hasImages
                ? Math.min(activeImageIndex, images.length - 1)
                : 0;
              const imageEntries = images
                .map((src, idx) => ({ src, idx }))
                .filter((entry) => entry.src);
              const currentEntry = imageEntries.find((entry) => entry.idx === safeIndex) || imageEntries[0];
              const current = currentEntry?.src || "";
              const currentKey = getImageKey(current);
              const uniqueEntries = imageEntries
                .filter((entry) => entry.src && getImageKey(entry.src) !== currentKey)
                .filter((entry, idx, arr) => (
                  arr.findIndex((item) => getImageKey(item.src) === getImageKey(entry.src)) === idx
                ));
              const sideEntries = uniqueEntries.slice(0, 2);
              const thumbImages = uniqueEntries.slice(0, 24);
              const coords = getListingCoords(activeListing);
              const addressQuery = getListingAddressQuery(activeListing);
              const mapCoords = coords || PROPERTY_COORDS;
              const mapUrl = buildStaticMapUrl(mapCoords, "480x280", 14);
              const mapEmbedUrl = buildEmbedMapUrl(mapCoords, 15);
              const amenityListRaw = Array.isArray(activeListing.amenities)
                ? activeListing.amenities
                : [];
              const amenityList = [...new Set(amenityListRaw.filter((item) => typeof item === "string"))];
              const aboutText = formatFullDescription(activeListing);
              const isHollywoodUnit = getBuildingKey(activeListing) === "la-hollywood";
              const popularFacilities = isHollywoodUnit
                ? HOLLYWOOD_FACILITIES
                : (activeAmenityList.slice(0, 6).length
                  ? activeAmenityList.slice(0, 6)
                  : ["Wi-Fi", "Kitchen", "Washer"]);
              const listingId = activeListing.unitTypeId || activeListing.id || activeListing._id;
              const availability = listingId ? sectionAvailabilityMap[listingId] : null;
              const availabilityStatus = sectionAvailabilityActive
                ? availability === false
                  ? "Unavailable"
                  : availability === true
                    ? "Available"
                    : "Checking..."
                : "Select dates";
              const quote = listingId ? sectionQuotes[listingId] : null;
              const planOptions = quote?.plans || [];
              const selectedPlanId =
                (listingId ? selectedRatePlans[listingId] : "") ||
                quote?.defaultPlanId ||
                planOptions[0]?.id ||
                "";
              const selectedPlan =
                planOptions.find((ratePlan) => ratePlan.id === selectedPlanId) ||
                planOptions[0] ||
                quote?.plan ||
                quote?.pricing ||
                null;
              const breakdown = selectedPlan?.breakdown || quote?.breakdown || quote?.pricing?.breakdown || null;
              const priceCurrency = selectedPlan?.currency || quote?.currency || activeListing.currency || "USD";
              const totalPrice =
                breakdown?.total ??
                breakdown?.subtotal ??
                selectedPlan?.total ??
                quote?.total ??
                null;
              return (
                <div className="la-unit-modal__grid">
                  <div className="la-unit-modal__gallery">
                    <div className="la-unit-modal__main">
                      {current ? (
                        <button
                          type="button"
                          className="la-unit-modal__image-button"
                          onClick={(event) => handleImagePreview(event, current)}
                          aria-label="Open image preview"
                        >
                          <img
                            src={current}
                            alt={sanitizeText(activeListing.title)}
                            loading="eager"
                            onError={handleImageError}
                          />
                        </button>
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                    </div>
                    <div className="la-unit-modal__side">
                      {sideEntries.map((entry) => (
                        <button
                          key={`side-${entry.idx}`}
                          type="button"
                          className="la-unit-modal__image-button"
                          onClick={() => setActiveImageIndex(entry.idx)}
                          aria-label="Select image"
                        >
                          <img src={entry.src} alt="" loading="lazy" onError={handleImageError} />
                        </button>
                      ))}
                      {sideEntries.length < 2 &&
                        Array.from({ length: 2 - sideEntries.length }).map((_, idx) => (
                          <div key={`side-placeholder-${idx}`} className="la-unit-modal__placeholder">
                            Image loading
                          </div>
                        ))}
                    </div>
                    {thumbImages.length > 1 && (
                      <div
                        className="la-unit-modal__thumbs"
                        role="list"
                        ref={thumbsRef}
                        onMouseEnter={(event) => {
                          hoveredThumbsRef.current = thumbsRef.current;
                          handleThumbsMove(event, thumbsRef);
                        }}
                        onMouseMove={handleThumbsMove}
                        onMouseLeave={() => {
                          hoveredThumbsRef.current = null;
                          stopAutoScroll();
                        }}
                      >
                        <div
                          className="la-thumb-scroll-zone la-thumb-scroll-zone--left"
                          onMouseEnter={() => {
                            console.log("[Thumbs] hover left zone");
                            startAutoScroll(thumbsRef.current, -1);
                          }}
                          onMouseLeave={stopAutoScroll}
                        />
                        <div
                          className="la-thumb-scroll-zone la-thumb-scroll-zone--right"
                          onMouseEnter={() => {
                            console.log("[Thumbs] hover right zone");
                            startAutoScroll(thumbsRef.current, 1);
                          }}
                          onMouseLeave={stopAutoScroll}
                        />
                        {thumbImages.map((entry, idx) => (
                          <button
                            key={`${entry.src}-${entry.idx}`}
                            type="button"
                            className={entry.idx === safeIndex ? "is-active" : ""}
                            onClick={() => setActiveImageIndex(entry.idx)}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <img
                              src={entry.src}
                              alt=""
                              loading={idx === 0 ? "eager" : "lazy"}
                              onError={handleImageError}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="la-unit-modal__sidebar">
                    <div className="la-unit-modal__card">
                      <div className="la-unit-modal__card-head">
                        <strong>{getReviewLabel(getListingReviews(activeListing))}</strong>
                      </div>
                      <p>
                        Guests talk about the view, the stillness between city moments, and how easy it is to settle in.
                      </p>
                    </div>
                    <div className="la-unit-modal__card la-unit-modal__map la-unit-modal__map-button">
                      {mapEmbedUrl ? (
                        <iframe
                          title="Unit location map"
                          src={mapEmbedUrl}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          allowFullScreen
                        />
                      ) : mapUrl ? (
                        <img
                          src={mapUrl}
                          alt="Map showing the unit location"
                          loading="lazy"
                          onError={handleImageError}
                        />
                      ) : (
                        <div className="la-unit-modal__placeholder">Map loading</div>
                      )}
                      <button
                        type="button"
                        className="la-unit-modal__map-overlay"
                        aria-label="View larger map"
                        onClick={() => {
                          setListingMapTarget({
                            coords: getListingCoords(activeListing),
                            address: getListingAddressQuery(activeListing),
                            label: activeListing.title || "OneLuxStay",
                          });
                          setIsListingMapOpen(true);
                        }}
                      >
                        <span className="la-unit-modal__map-cta">View larger map</span>
                      </button>
                    </div>
                    <div className="la-unit-modal__card la-unit-modal__availability">
                      <div className="la-unit-modal__card-head">
                        <strong>Availability</strong>
                        <span className={`la-unit-modal__status is-${availabilityStatus.toLowerCase().replace(/\s+/g, "-")}`}>
                          {availabilityStatus}
                        </span>
                      </div>
                      <div className="la-unit-modal__availability-details">
                        {availability === false ? (
                          <p>Unavailable for the selected dates.</p>
                        ) : breakdown ? (
                          <>
                            <div>
                              <span>Accommodation</span>
                              <strong>{formatCurrency(breakdown.accommodation, priceCurrency)}</strong>
                            </div>
                            {breakdown.discountAmount > 0 && (
                              <div>
                                <span>
                                  Direct booking discount ({Math.round(breakdown.discountRate * 100)}%)
                                </span>
                                <strong>-{formatCurrency(breakdown.discountAmount, priceCurrency)}</strong>
                              </div>
                            )}
                            <div>
                              <span>Cleaning</span>
                              <strong>{formatCurrency(breakdown.cleaning, priceCurrency)}</strong>
                            </div>
                            <div>
                              <span>Taxes</span>
                              <strong>{formatCurrency(breakdown.taxes, priceCurrency)}</strong>
                            </div>
                            <div>
                              <span>Fees</span>
                              <strong>{formatCurrency(breakdown.fees, priceCurrency)}</strong>
                            </div>
                            <div className="la-unit-modal__total">
                              <span>Total</span>
                              <strong>{formatCurrency(breakdown.total, priceCurrency)}</strong>
                            </div>
                          </>
                        ) : totalPrice ? (
                          <div className="la-unit-modal__total">
                            <span>Total {quote?.nights ? `for ${quote.nights} nights` : ""}</span>
                            <strong>{formatCurrency(totalPrice, priceCurrency)}</strong>
                          </div>
                        ) : (
                          <p>Check availability to view pricing breakdown.</p>
                        )}
                      </div>
                      {availability !== false && planOptions.length > 0 && (
                        <div className="la-unit-modal__rate-plan">
                          <label htmlFor={`la-listing-rate-plan-${listingId || "active"}`}>Rate plan</label>
                          <select
                            id={`la-listing-rate-plan-${listingId || "active"}`}
                            value={selectedPlanId}
                            disabled={sectionAvailabilityLoading}
                            onChange={(event) =>
                              setSelectedRatePlans((prev) => ({
                                ...prev,
                                [listingId]: event.target.value,
                              }))
                            }
                            className="la-booking-table__rate-select"
                          >
                            {planOptions.map((planOption) => (
                              <option key={planOption.id} value={planOption.id}>
                                {planOption.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="la-unit-modal__actions">
                        {(() => {
                          const availability = listingId ? sectionAvailabilityMap[listingId] : null;
                          if (availability === true) {
                            const isReserving = sectionReserveLoadingId === listingId;
                            return (
                              <button
                                type="button"
                                className="la-unit-modal__action-primary"
                                disabled={sectionAvailabilityLoading || isReserving}
                                onClick={() => {
                                  setPendingCheckout({
                                    listingId,
                                    listingTitle: activeListing.title,
                                    amount: typeof totalPrice === "number" ? totalPrice : null,
                                    currency: resolveCheckoutCurrency(priceCurrency),
                                    breakdown: breakdown || null,
                                    baseAmount: typeof totalPrice === "number" ? totalPrice : null,
                                    baseBreakdown: breakdown || null,
                                    promoCode: "",
                                    promoDiscountRate: 0,
                                    promoDiscountAmount: 0,
                                  });
                                  setCheckoutStep(1);
                                  setCheckoutConsentAccepted(false);
                                  setCheckoutConsentSignerName("");
                                  setCheckoutConsentSignatureDataUrl("");
                                  setCheckoutPromoCode("");
                                  setCheckoutPromoError("");
                                  setCheckoutAppliedPromo(null);
                                  setCheckoutGuestError("");
                                  setIsCheckoutGuestOpen(true);
                                }}
                              >
                                {isReserving ? "Redirecting..." : "Reserve"}
                              </button>
                            );
                          }
                          if (availability === false) {
                            return (
                              <button
                                type="button"
                                className="la-unit-modal__action-primary"
                                onClick={() => openInquiry(activeListing)}
                              >
                                Inquire
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="la-unit-modal__booking" aria-label="Availability check">
              <DateRangePicker
                value={{ checkIn: sectionCheckIn, checkOut: sectionCheckOut }}
                dayPrices={sectionCalendarDayMap}
                isLoading={sectionCalendarLoading}
                fallbackPrice={activeSection?.listings?.[0]?.basePrice}
                fallbackCurrency={activeSection?.listings?.[0]?.currency || "USD"}
                fallbackMinNights={sectionMinNightsFallback}
                onMonthChange={(month) => {
                  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
                  if (!activeSection) return;
                  const listingIds = activeSection.listings
                    .map((listing) => listing.id || listing._id)
                    .filter(Boolean);
                  if (!listingIds.length) return;
                  fetchSectionCalendarMultiMonth(listingIds, monthStart);
                }}
                onOpenChange={handleSectionCalendarOpen}
                onChange={({ checkIn, checkOut }) => {
                  setSectionCheckIn(checkIn);
                  setSectionCheckOut(checkOut);
                }}
              />
              <div>
                <label htmlFor="la-section-guests">Guests</label>
                <select
                  id="la-section-guests"
                  value={sectionGuests}
                  onChange={(event) => setSectionGuests(event.target.value)}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
              <button type="button" onClick={() => fetchAvailabilityListings({ shouldScroll: true })}>
                {sectionAvailabilityLoading ? "Checking..." : "Check availability"}
              </button>
            </div>
            <div className="la-unit-modal__section">
              <div className="la-price-calendar">
                <div className="la-price-calendar__head">
                  <h4>Price calendar</h4>
                  <div className="la-price-calendar__nav">
                    <button
                      type="button"
                      className="la-price-calendar__btn"
                      onClick={() => setCalendarMonthIndex((idx) => Math.max(0, idx - 1))}
                      disabled={calendarMonthIndex <= 0}
                      aria-label="Previous month"
                    >
                      {"<"}
                    </button>
                    <span className="la-price-calendar__label">
                      {calendarCurrentMonth.toLocaleDateString(undefined, {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    <button
                      type="button"
                      className="la-price-calendar__btn"
                      onClick={() =>
                        setCalendarMonthIndex((idx) =>
                          Math.min((calendarPrices?.months || 24) - 1, idx + 1)
                        )
                      }
                      disabled={calendarMonthIndex >= (calendarPrices?.months || 24) - 1}
                      aria-label="Next month"
                    >
                      {">"}
                    </button>
                  </div>
                </div>
                {calendarLoading && (
                  <div className="la-price-calendar__status" role="status" aria-live="polite">
                    Loading nightly prices...
                  </div>
                )}
                {calendarError && (
                  <div className="la-price-calendar__status" role="alert">
                    {calendarError}
                  </div>
                )}
                {!calendarLoading && !calendarError && (
                  <div className="la-price-calendar__grid" role="grid">
                    <div className="la-price-calendar__week" role="row">
                      {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                        <span key={day} className="la-price-calendar__weekday" role="columnheader">
                          {day}
                        </span>
                      ))}
                    </div>
                    <div className="la-price-calendar__days" role="rowgroup">
                      {calendarMonth.cells.map((day, idx) => {
                        if (!day) {
                          return <span key={`empty-${idx}`} className="la-price-calendar__cell is-empty" />;
                        }
                        const iso = toISODate(day);
                        const price = calendarDayMap.get(iso);
                        const minNights =
                          price?.restrictions?.minNights ?? listingMinNightsFallback ?? null;
                        const showMinNights = typeof minNights === "number" && minNights > 1;
                        return (
                          <span
                            key={iso}
                            className={`la-price-calendar__cell${showMinNights ? " has-restriction" : ""}`}
                            role="gridcell"
                          >
                            <span className="la-price-calendar__day">{day.getDate()}</span>
                            <span className="la-price-calendar__price">
                              {price ? formatCalendarPrice(price.price, price.currency) : ""}
                            </span>
                            {showMinNights && (
                              <span className="la-price-calendar__restriction">Min {minNights}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="la-price-calendar__legend" aria-hidden="true">
                  <span className="la-price-calendar__legend-item">
                    <span className="legend-swatch is-selected" />
                    Date selected
                  </span>
                  <span className="la-price-calendar__legend-item">
                    <span className="legend-swatch is-unavailable" />
                    Date unavailable
                  </span>
                  <span className="la-price-calendar__legend-item">
                    <span className="legend-swatch is-restricted" />
                    Stay restrictions may apply
                  </span>
                </div>
              </div>
            </div>
            <div className="la-unit-modal__section">
              <h4>About this property</h4>
              <p>{activeAboutText || "Comfortable, calm, and ready the moment you arrive."}</p>
            </div>
            <div className="la-unit-modal__section">
              <h4>Room options</h4>
              <div className="la-unit-modal__rooms">
                <div>
                  <strong>{sanitizeText(activeListing.title)}</strong>
                  <p>
                    Bedrooms: {activeListing.bedrooms || "--"} | Bathrooms: {activeListing.bathrooms || "--"} | Sleeps{" "}
                    {activeListing.accommodates || "--"}
                  </p>
                  {(() => {
                    const direct =
                      (activeListing.bedDetails && activeListing.bedDetails.length)
                        ? activeListing.bedDetails
                        : getBedDetails(activeListing);
                    const bedDetails = (() => {
                      if (direct.length) return direct;
                      const groupKey = getListingGroupKey(activeListing);
                      if (!groupKey || !Array.isArray(listings)) return [];
                      const fallback = listings.find((entry) => {
                        if (getListingGroupKey(entry) !== groupKey) return false;
                        if (entry.bedDetails && entry.bedDetails.length) return true;
                        return getBedDetails(entry).length > 0;
                      });
                      if (!fallback) return [];
                      return (fallback.bedDetails && fallback.bedDetails.length)
                        ? fallback.bedDetails
                        : getBedDetails(fallback);
                    })();
                    const bedLines = bedDetails
                      .map(splitBedDetailLine)
                      .filter((line) => line.detail);
                    if (!bedLines.length) return null;
                    return (
                      <div className="la-booking-table__bed-details">
                        {bedLines.map((line, idx) => (
                          <div
                            key={`room-bed-${idx}`}
                            className={`la-booking-table__bed-row${line.label ? "" : " is-single"}`}
                          >
                            {line.label ? (
                              <span className="la-booking-table__bed-room">{line.label}</span>
                            ) : null}
                            <span className="la-booking-table__bed-desc">
                              {line.detail}
                              <span className="la-booking-table__bed-icon">
                                <BedIcon />
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="la-unit-modal__room-actions">
                  <button type="button">Virtual tour</button>
                  <Link to="/listings" className="antwerp-card__link">
                    Book now
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {sectionMapModal}
      <SiteFooter />
    </div>
  );
}









