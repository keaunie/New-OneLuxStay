import { useEffect, useMemo, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import "./App.css";
import CardSwap, { Card } from "./components/CardSwap";
import BounceCards from "./components/BounceCards";
import SiteFooter from "./components/SiteFooter";
import Silk from "./components/Silk";
import LoadingScreen from "./components/LoadingScreen";
import Stepper, { Step } from "./components/Stepper";
import getBedDetails, { splitBedDetailLine } from "./utils/bedDetails";

const rawApiBase = import.meta.env.VITE_API_BASE || "/.netlify/functions";
const apiBase = rawApiBase.replace(/\/index\/?$/, "");
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const LOGO_URL = "https://oneluxstay.netlify.app/image/ols-logo.png";
const CITY_LOADING_LOTTIE_SRC =
  "https://lottie.host/a5d4ff5c-b190-4293-8e82-9605dd09d4fb/W3GHTi7kL3.json";
const PROPERTY_ADDRESS = "Antwerp, Belgium";
const PROPERTY_COORDS = { lat: 51.2194, lng: 4.4025 };
const LANDMARKS = [
  "Grote Markt",
  "Cathedral of Our Lady",
  "MAS Museum",
  "Antwerp Central Station",
  "Meir",
  "Scheldt River"
];
const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='520' viewBox='0 0 800 520'><rect width='800' height='520' fill='%23efe7dc'/><text x='400' y='260' text-anchor='middle' dominant-baseline='middle' fill='%239c8368' font-family='Arial, sans-serif' font-size='24'>Image unavailable</text></svg>";
let mapsScriptPromise;

const handleImageError = (event) => {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied) return;
  img.dataset.fallbackApplied = "true";
  img.src = FALLBACK_IMAGE;
  if (!img.alt) img.alt = "Image unavailable";
};

const loadGoogleMaps = (apiKey) => {
  if (!apiKey) return Promise.reject(new Error("Missing Google Maps API key"));
  if (mapsScriptPromise) return mapsScriptPromise;
  mapsScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve(window.google.maps);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsScriptPromise;
};

const formatCurrency = (value, currency = "USD") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    : "--";

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
  return "‚Äî";
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
  return type.includes("CHILD");
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
  listings.forEach((listing) => {
    const parentId = getParentListingId(listing);
    const listingId = getListingId(listing);
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

  const startDate = parseDateValue(value.checkIn);
  const endDate = parseDateValue(value.checkOut);

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
      const minNights = toNumber(
        dayPrices?.get(toISODate(nextStart))?.restrictions?.minNights ?? fallbackMinNights ?? null
      );
      const nights = diffNights(toISODate(nextStart), toISODate(nextEnd));
      const violatesMin =
        typeof minNights === "number" && minNights > 1 && nights > 0 && nights < minNights;
      if (!violatesMin) setOpenState(false);
    }
  };

  const selectedNights = diffNights(value.checkIn, value.checkOut);
  const selectedMinNights = useMemo(() => {
    if (!dayPrices || !startDate) return fallbackMinNights ?? null;
    const iso = toISODate(startDate);
    const info = dayPrices.get(iso);
    const minNights = toNumber(info?.restrictions?.minNights ?? fallbackMinNights ?? null);
    return typeof minNights === "number" && minNights > 1 ? minNights : null;
  }, [dayPrices, startDate, fallbackMinNights]);

  const primaryMonth = buildMonth(view);
  const secondaryMonth = buildMonth(new Date(view.getFullYear(), view.getMonth() + 1, 1));
  const monthLabel = `${new Date(primaryMonth.year, primaryMonth.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })} - ${new Date(secondaryMonth.year, secondaryMonth.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  })}`;

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
                  onChange({ checkIn: "", checkOut: "" });
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
                  onChange({ checkIn: "", checkOut: "" });
                  setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                }}
                className="la-date-nav-btn"
              >
                {">"}
              </button>
            </div>
          </div>
          {selectedMinNights &&
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
                      const showMinNights = typeof minNights === "number" && minNights > 1;
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
                            showMinNights
                              ? `${dayAria} Minimum stay ${minNights} nights.`
                              : dayAria
                          }
                          aria-hidden={day ? undefined : true}
                          onClick={() => handleDayClick(day)}
                          className={`listing-date-cell ${stateClass}${showMinNights ? " has-restriction" : ""}${isPast ? " is-past" : ""}`}
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
                              {showMinNights && (
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
  "antwerp",
  "antwerpen",
  "antwerp centrum",
  "antwerp center",
  "city centre",
  "city center",
  "diamond district",
  "fashion district",
  "antwerp central",
  "central station",
  "berchem",
  "zuid",
  "nieuw zuid",
];

const FEATURED_LISTING_IDS = {
  "Diamond District": "66e849a74149880013d1be34",
  "Antwerp Central": "6811675405d52b0010c3fae5",
  "Fashion District": "66e85443a8a40a00145bb9ce",
  "City Centre": "66e4864c4505490013bf16b5",
};
const EXCLUDED_CITIES = ["los angeles", "hollywood", "west hollywood", "redondo beach", "miami", "dubai"];

const sanitizeText = (value = "") => {
  if (typeof value !== "string") return "";
  return value
    .replace(/\uFFFD/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
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

const BOOKING_STORAGE_KEY = "antwerpBookingFilters";
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

const ADDRESS_OVERRIDES = {
  "antwerp-fashion": "Lange Leemstraat 103",
  "antwerp-city-centre": "Kribbestraat 6",
};

const formatAddress = (listing) => {
  const address = listing.address || {};
  const override = ADDRESS_OVERRIDES[getBuildingKey(listing)];
  const street = override || address.full;
  const parts = [street, address.city, address.country].filter(Boolean);
  if (parts.length) return sanitizeText(parts.join(", "));
  if (typeof listing.location === "string") return sanitizeText(listing.location);
  return "Antwerp";
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
  if (!url) return "";
  const cleanUrl = url.split("?")[0];
  const parts = cleanUrl.split("/");
  const filename = parts[parts.length - 1] || "";
  const base = filename.split(".")[0];
  return base || cleanUrl;
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
  collectImage(listing.picture);
  if (Array.isArray(listing.pictures)) {
    listing.pictures.forEach(collectImage);
  }
  const unique = Array.from(new Set(urls));
  if (!unique.length) {
    console.warn("[Gallery] No images found for listing.", {
      listingId: listing?.id || listing?._id || listing?.unitTypeId || null,
      title: listing?.title || "",
    });
    return [FALLBACK_IMAGE];
  }
  return unique;
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
  const key = getBuildingKey(listing);
  if (GOOGLE_REVIEW_LINKS[key]) return GOOGLE_REVIEW_LINKS[key];
  const title = sanitizeText(listing?.title || "OneLuxStay Antwerp");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;
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
    .replace(/\"/g, "&quot;")
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
  "antwerp-diamond": {
    title: "Diamond District",
    tagline: "Iconic trade streets and refined city energy.",
    copy:
      "Stay moments from the diamond quarter with easy access to Central Station and the city center.",
    landmarks: ["Diamond District", "Hoveniersstraat", "Pelikaanstraat", "Diamond Square"],
    transit: ["Antwerp Central Station", "Tram lines 2/6/9/11", "De Lijn buses"],
  },
  "antwerp-fashion": {
    title: "Fashion District",
    tagline: "Design boutiques, museums, and a creative pulse.",
    copy:
      "From Nationalestraat to Kammenstraat, the fashion district is Antwerp's style heart.",
    landmarks: ["MoMu Fashion Museum", "Nationalestraat", "Kammenstraat", "Meir"],
    transit: ["Tram lines 4/7/10", "De Lijn buses", "City bike stations"],
  },
  "antwerp-central": {
    title: "Antwerp Central",
    tagline: "Grand architecture and effortless connections.",
    copy:
      "A prime base next to Antwerp Central Station with fast links across the city and beyond.",
    landmarks: ["Antwerp Central Station", "Koningin Astridplein", "Zoo Antwerp"],
    transit: ["Antwerp Central Station", "Tram lines 2/6/9/11", "Regional rail"],
  },
  "antwerp-city-centre": {
    title: "City Centre",
    tagline: "Cathedrals, squares, and timeless streets.",
    copy:
      "Walk to Grote Markt, Cathedral of Our Lady, and riverside terraces from the heart of the city.",
    landmarks: ["Grote Markt", "Cathedral of Our Lady", "Groenplaats", "Steen Castle"],
    transit: ["Tram lines 4/7/10", "De Lijn buses", "City bike stations"],
  },
  "antwerp-near-central": {
    title: "Near Central Station",
    tagline: "Quiet streets with fast city access.",
    copy:
      "A calm base just outside the station with quick access to the center and local dining.",
    landmarks: ["Central Station", "Zurenborg", "Dageraadplaats"],
    transit: ["Tram lines 2/6/9/11", "De Lijn buses", "City bike stations"],
  },
  other: {
    title: "City Centre",
    tagline: "Cathedrals, squares, and timeless streets.",
    copy:
      "Walk to Grote Markt, Cathedral of Our Lady, and riverside terraces from the heart of the city.",
    landmarks: ["Grote Markt", "Cathedral of Our Lady", "Groenplaats", "Steen Castle"],
    transit: ["Tram lines 4/7/10", "De Lijn buses", "City bike stations"],
  },
};

const BUILDING_GROUPS = [
  {
    key: "antwerp-diamond",
    label: "Diamond District",
    match: /jacob\s+jordaensstraat\s*96|diamond district|diamond quarter|hoveniersstraat|pelikaanstraat/i,
  },
  {
    key: "antwerp-near-central",
    label: "Near Central Station",
    match:
      /lange\s+kievitstraat\s*4|kievitstraat|near central|close to station|station area|zurenborg|dageraadplaats/i,
  },
  {
    key: "antwerp-central",
    label: "Antwerp Central",
    match:
      /lange\s+leemstraat\s*5|antwerp central|antwerpen centraal|central station|centraal station|astridplein/i,
  },
  {
    key: "antwerp-fashion",
    label: "Fashion District",
    match:
      /lange\s+leemstraat\s*103|fashion district|\bmomu\b|\bmomo\b|nationalestraat|kammenstraat/i,
  },
  {
    key: "antwerp-city-centre",
    label: "City Centre",
    match: /kribbestraat\s*6|city centre|city center|centrum|centre|center|grotemarkt|cathedral|old town|steen/i,
  },
];

const STAR_TOTAL = 5;
const ANTWERP_REVIEWS = [
  {
    name: "J. V.",
    rating: 5,
    source: "Guest",
    quote: "Beautiful stay near the old town. Walkable, clean, and thoughtfully designed.",
  },
  {
    name: "L. S.",
    rating: 5,
    source: "Guest",
    quote: "Loved the Fashion District for museums and dining. The team was responsive and kind.",
  },
  {
    name: "P. D.",
    rating: 4,
    source: "Guest",
    quote: "Great base near Central Station with easy transit. Comfortable and quiet.",
  },
  {
    name: "A. M.",
    rating: 5,
    source: "Guest",
    quote: "Diamond District views were perfect. The space felt premium and calm.",
  },
];
const REVIEW_TICKER = ANTWERP_REVIEWS;
const SECTION_REVIEWS = {
  "antwerp-diamond": ANTWERP_REVIEWS,
  "antwerp-fashion": ANTWERP_REVIEWS,
  "antwerp-central": ANTWERP_REVIEWS,
  "antwerp-city-centre": ANTWERP_REVIEWS,
  "antwerp-near-central": ANTWERP_REVIEWS,
  other: ANTWERP_REVIEWS,
};
const GOOGLE_REVIEW_LINKS = {
  "antwerp-diamond": "",
  "antwerp-near-central": "",
  "antwerp-central": "",
  "antwerp-fashion": "",
  "antwerp-city-centre": "",
};
const HOLLYWOOD_FACILITIES = [
  "City-center locations",
  "High-speed Wi-Fi",
  "Family-friendly suites",
  "Non-smoking rooms",
  "On-site laundry",
  "Concierge",
  "Elevator access",
  "Coffee/tea station",
  "Workspace-ready layouts",
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

const isTargetCityListing = (listing) => {
  const cityText = [listing.city, listing.address?.city, listing.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (cityText) {
    if (EXCLUDED_CITIES.some((city) => cityText.includes(city))) return false;
    return KNOWN_CITIES.some((known) => cityText.includes(known));
  }
  const text = getListingText(listing);
  if (EXCLUDED_CITIES.some((city) => text.includes(city))) return false;
  return KNOWN_CITIES.some((known) => text.includes(known));
};

const getBuildingKey = (listing) => {
  const text = getListingText(listing);
  const addressText = [
    listing.address?.full,
    listing.location,
    listing.address?.city,
    listing.address?.country,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/kievitstraat/.test(addressText)) return "antwerp-near-central";
  if (/kribbestraat\s*6/.test(addressText)) return "antwerp-city-centre";
  if (/lange\s+leemstraat\s*103/.test(addressText)) return "antwerp-fashion";
  if (/lange\s+leemstraat\s*5/.test(addressText)) return "antwerp-central";
  if (/jacob\s+jordaensstraat\s*96/.test(addressText)) return "antwerp-diamond";

  for (const group of BUILDING_GROUPS) {
    if (group.match.test(text)) return group.key;
  }
  return "other";
};

const matchListingById = (listings, targetId) => {
  if (!targetId) return null;
  const target = String(targetId);
  return (
    listings.find((listing) => String(listing?.id || listing?._id || listing?.unitTypeId || "") === target) || null
  );
};

const getBuildingDisplayKey = (listing) => {
  const key = getBuildingKey(listing);
  if (key && key !== "other") return key;
  return getListingGroupKey(listing) || getListingId(listing) || "other";
};

const pickOnePerBuilding = (listings = []) => {
  const buckets = new Map();
  listings.forEach((listing) => {
    const key = getBuildingDisplayKey(listing);
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(listing);
  });
  return [...buckets.values()]
    .map((group) => {
      const parents = group.filter(isParentListing);
      const candidates = parents.length ? parents : group;
      return getLowestPriceListing(candidates) || candidates[0] || null;
    })
    .filter(Boolean);
};


const resolveGroupTitle = (listing) => {
  const key = getBuildingKey(listing);
  switch (key) {
    case "antwerp-diamond":
      return "One Lux Stay Diamond District";
    case "antwerp-fashion":
      return "One Lux Stay Fashion District";
    case "antwerp-central":
      return "One Lux Stay Antwerp Central";
    case "antwerp-city-centre":
      return "One Lux Stay City Centre";
    case "antwerp-near-central":
      return "One Lux Stay Near Central Station";
    default:
      return "One Lux Stay City Centre";
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
  "Diamond District": [
    {
      title: "Diamonds + Railway Cathedral",
      subtitle: "Start at Antwerp Central, then into the diamond streets.",
      copy:
        "Begin at Antwerp Central Station for its grand architecture, then walk Hoveniersstraat and nearby blocks in the Diamond District.",
      highlights: ["Antwerp Central Station", "Diamond District", "Hoveniersstraat"],
      image:
        "https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "DIVA + Old Town",
      subtitle: "Craft, guild houses, and cathedral light.",
      copy:
        "Visit the DIVA Museum, then head to Grote Markt and the Cathedral of Our Lady before a relaxed Old Town lunch.",
      highlights: ["DIVA Museum", "Grote Markt", "Cathedral of Our Lady"],
      image:
        "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Rubens + Meir",
      subtitle: "Art history and Antwerp's main shopping street.",
      copy:
        "Tour Rubenshuis, then stroll Meir for shopping and grand city facades.",
      highlights: ["Rubenshuis", "Meir Shopping Street", "City Hall"],
      image:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Evening Views",
      subtitle: "Rooftop panoramas and Belgian dinner.",
      copy:
        "Optional sunset at MAS rooftop, then finish with Belgian cuisine near Grote Markt or in Zuid.",
      highlights: ["MAS Museum rooftop", "Grote Markt", "Zuid dining"],
      image:
        "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=2000&q=80",
    },
  ],
  "Fashion District": [
    {
      title: "Grote Markt + Nationalestraat",
      subtitle: "Begin at the square, then follow Antwerp‚Äôs fashion artery.",
      copy:
        "Start at Grote Markt, then head down Nationalestraat toward MoMu and the Royal Academy for the city‚Äôs fashion pulse.",
      highlights: ["Grote Markt", "Nationalestraat", "MoMu"],
      image:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Boutiques + Vintage",
      subtitle: "Designer flagships, indie shops, and vintage finds.",
      copy:
        "Browse Dries Van Noten and neighboring boutiques, then hunt vintage along Nationalestraat and Kloosterstraat.",
      highlights: ["Dries Van Noten", "Vintage shops", "Kloosterstraat"],
      image:
        "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Hidden Alleys + Heritage",
      subtitle: "Quiet passages and UNESCO history.",
      copy:
        "Slip into Vlaeykensgang, then tour Plantin-Moretus Museum for Antwerp‚Äôs printing legacy.",
      highlights: ["Vlaeykensgang", "Plantin-Moretus Museum", "Historic alleys"],
      image:
        "https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Cathedral + Evening",
      subtitle: "Rubens masterpieces and a classic dinner.",
      copy:
        "Visit the Cathedral of Our Lady, then finish with local cuisine in the historic center.",
      highlights: ["Cathedral of Our Lady", "Belgian cuisine", "Historic center"],
      image:
        "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=2000&q=80",
    },
  ],
  "Antwerp Central": [
    {
      title: "Railway Cathedral Start",
      subtitle: "Antwerp Central and the city‚Äôs main boulevard.",
      copy:
        "Begin at Antwerp Central Station, then walk Meir toward the historic center.",
      highlights: ["Antwerp Central Station", "Meir Shopping Street", "City Hall"],
      image:
        "https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Grote Markt + Cathedral",
      subtitle: "Guild houses, Brabo Fountain, and Rubens.",
      copy:
        "Explore Grote Markt and the Cathedral of Our Lady before a coffee in the square.",
      highlights: ["Grote Markt", "Cathedral of Our Lady", "Brabo Fountain"],
      image:
        "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Rubens + Plantin-Moretus",
      subtitle: "Golden Age art and printing history.",
      copy:
        "Tour Rubenshuis and the Plantin-Moretus Museum for a deep dive into Antwerp‚Äôs heritage.",
      highlights: ["Rubenshuis", "Plantin-Moretus Museum", "Historic streets"],
      image:
        "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Riverfront + MAS",
      subtitle: "Het Steen and panoramic rooftop views.",
      copy:
        "Walk along the Scheldt, visit Het Steen, then head to MAS for rooftop views and an evening meal nearby.",
      highlights: ["Het Steen", "Scheldt River", "MAS rooftop"],
      image:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80",
    },
  ],
  "City Centre": [
    {
      title: "Central Station + Meir",
      subtitle: "Railway cathedral to the city‚Äôs main boulevard.",
      copy:
        "Begin at Antwerp Central Station, then walk Meir toward the historic center.",
      highlights: ["Antwerp Central Station", "Meir", "City Hall"],
      image:
        "https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Grote Markt + Cathedral",
      subtitle: "Historic square and Rubens masterpieces.",
      copy:
        "Admire the guild houses and City Hall, then visit the Cathedral of Our Lady.",
      highlights: ["Grote Markt", "Cathedral of Our Lady", "Rubens art"],
      image:
        "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Rubens + Plantin-Moretus",
      subtitle: "Art history and printing heritage.",
      copy:
        "Tour Rubenshuis and Plantin-Moretus Museum for Antwerp‚Äôs Golden Age story.",
      highlights: ["Rubenshuis", "Plantin-Moretus Museum", "Vlaeykensgang"],
      image:
        "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Diamond District + River",
      subtitle: "Jewelry streets and waterfront views.",
      copy:
        "Stroll through the Diamond District, then finish at Het Steen and MAS rooftop for sunset views.",
      highlights: ["Diamond District", "Het Steen", "MAS rooftop"],
      image:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80",
    },
  ],
  "Near Central Station": [
    {
      title: "Station District",
      subtitle: "Easy access and quiet streets.",
      copy:
        "A relaxed base just outside the station with quick city connections.",
      highlights: ["Central Station", "Zurenborg", "Local cafes"],
      image:
        "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=2000&q=80",
    },
  ],
};

const TOUR_CITIES = [
  "Diamond District",
  "Fashion District",
  "Antwerp Central",
  "City Centre",
];


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

export default function AntwerpLandingPage() {
  const { listingId: routeListingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isListingRoute = Boolean(routeListingId);
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
    const persisted = readPersistedBooking();
    const nextCheckIn = paramCheckIn || persisted?.checkIn || "";
    const nextCheckOut = paramCheckOut || persisted?.checkOut || "";
    const nextGuests = paramGuests || persisted?.guests || "2";
    if (nextCheckIn !== sectionCheckIn) setSectionCheckIn(nextCheckIn);
    if (nextCheckOut !== sectionCheckOut) setSectionCheckOut(nextCheckOut);
    if (nextGuests && nextGuests !== sectionGuests) setSectionGuests(nextGuests);
  }, [location.search]);

  useEffect(() => {
    writePersistedBooking({
      checkIn: sectionCheckIn || "",
      checkOut: sectionCheckOut || "",
      guests: sectionGuests || "2",
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
  const [tourCity, setTourCity] = useState(TOUR_CITIES[0]);
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
  const listingMapRef = useRef(null);
  const listingMapInstanceRef = useRef(null);
  const listingMapMarkerRef = useRef(null);
  const [listingMapTarget, setListingMapTarget] = useState(null);
  const [isSectionMapOpen, setIsSectionMapOpen] = useState(false);
  const [sectionMapTarget, setSectionMapTarget] = useState(null);
  const sectionMapRef = useRef(null);
  const sectionMapInstanceRef = useRef(null);
  const sectionMapMarkerRef = useRef(null);
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
      console.log("[Thumbs] no target for hover scroll");
      return;
    }
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const edge = rect.width * 0.35;
    if (x < edge) {
      console.log("[Thumbs] hover left edge");
      startAutoScroll(target, -1);
    } else if (x > rect.width - edge) {
      console.log("[Thumbs] hover right edge");
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
    const hasParams = params.get("checkIn") || params.get("checkOut") || params.get("guests");
    const persisted = readPersistedBooking();
    const hasPersisted = persisted?.checkIn || persisted?.checkOut || persisted?.guests;
    if (!hasParams && !hasPersisted) {
      setSectionCheckIn("");
      setSectionCheckOut("");
    }
    setCalendarMinNightsOverride(null);
  }, [activeListing, location.search]);

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
    const match = listings.find(
      (listing) =>
        String(listing.id || listing._id || listing.unitTypeId || "") === String(routeListingId)
    );
    if (!match) {
      setActiveListing(null);
      return;
    }
    const resolved =
      isChildListing(match) && getListingGroupKey(match)
        ? listings.find(
          (entry) =>
            !isChildListing(entry) && getListingGroupKey(entry) === getListingGroupKey(match)
        ) || match
        : match;
    setActiveListing(resolved);
    setActiveImageIndex(0);
  }, [routeListingId, listings]);

  useEffect(() => {
    if (!isListingRoute) return;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [isListingRoute, routeListingId]);

  useEffect(() => {
    if (!listings.length) return;
    const targetId = "66e1e3875a1f6300d736f28e";
    const match = listings.find((listing) => (listing.id || listing._id) === targetId);
    if (match) {
      console.log("[Antwerp debug] listing match", match);
    } else {
      console.log("[Antwerp debug] listing not found for id", targetId);
    }
  }, [listings]);

  useEffect(() => {
    if (!isMapEnabled) return;
    if (!mapsApiKey) {
      setMapError("Google Maps API key is missing.");
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
            setMapError("Unable to load Google Maps.");
          });
      },
      { threshold: 0.25 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [isMapEnabled, mapsApiKey]);

  const losAngelesListings = useMemo(() => {
    return listings.filter((listing) => {
      return isTargetCityListing(listing);
    });
  }, [listings, isMapEnabled, mapsApiKey]);

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
    const fallbackKey = "antwerp-city-centre";
    if (other.length && groups[fallbackKey]) {
      groups[fallbackKey].listings.push(...other);
      other.length = 0;
    }
    const ordered = BUILDING_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      listings: groups[group.key].listings,
    }));
    if (other.length) ordered.push({ key: "other", label: "City Centre", listings: other });
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
    const fallbackKey = "antwerp-city-centre";
    if (other.length && groups[fallbackKey]) {
      groups[fallbackKey].listings.push(...other);
      other.length = 0;
    }
    const ordered = BUILDING_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      listings: groups[group.key].listings,
    }));
    if (other.length) ordered.push({ key: "other", label: "City Centre", listings: other });
    return ordered.filter((group) => group.listings.length);
  }, [losAngelesParentListings]);

  const sectionsByKey = useMemo(() => {
    return groupedListingsAll.reduce((acc, group) => {
      acc[group.key] = group;
      return acc;
    }, {});
  }, [groupedListingsAll]);

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
        setPrices(buildCalendarPayload(map));
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
      const getManualTotal = (quoteData) => {
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
          const taxAmount = computeTaxes(discountedAccommodation, listing);
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
          const manualTotals = getManualTotal(quoteData);
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

  const fetchAvailabilityListings = async ({ listingIds, listingId } = {}) => {
    if (!sectionCheckIn || !sectionCheckOut) {
      setSectionAvailabilityError("Select check-in and check-out dates first.");
      return;
    }
    setSectionAvailabilityLoading(true);
    setSectionAvailabilityError("");
    try {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let calendarMultiLoaded = false;
      const listingPool = (() => {
        if (activeSection?.listings?.length) return activeSection.listings;
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
          const hasAvailableChild = group.children.some((child) => isListingAvailable(child));
          const displayListing = group.parent || null;
          const hasAvailableParent = displayListing ? isListingAvailable(displayListing) : false;
          const hasAvailable = hasAvailableChild || hasAvailableParent;
          parentAvailabilityMap[group.parentId] = hasAvailable;
          if (displayListing) {
            const displayId = getListingId(displayListing);
            if (displayId) parentAvailabilityMap[displayId] = hasAvailable;
            if (displayListing.unitTypeId) parentAvailabilityMap[displayListing.unitTypeId] = hasAvailable;
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

  const handleSectionCheckout = async ({ listingId, listingTitle, amount, currency, guest, breakdown }) => {
    if (!listingId) return;
    if (!sectionCheckIn || !sectionCheckOut) {
      setSectionAvailabilityError("Select check-in and check-out dates first.");
      return;
    }
    if (!amount || !Number.isFinite(amount)) {
      setSectionAvailabilityError("Pricing is unavailable. Please refresh availability.");
      return;
    }

    setSectionAvailabilityError("");
    setSectionReserveLoadingId(listingId);

    try {
      const res = await fetch(`${apiBase}/check-units/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          listingTitle,
          checkIn: sectionCheckIn,
          checkOut: sectionCheckOut,
          guests: Number(sectionGuests) || 1,
          amount,
          currency,
          breakdown,
          guest,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || "Checkout failed");
      }
      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err) {
      setSectionAvailabilityError(err.message || "Checkout failed");
    } finally {
      setSectionReserveLoadingId(null);
    }
  };

  const confirmGuestCheckout = () => {
    if (!checkoutGuest.firstName || !checkoutGuest.lastName || !checkoutGuest.email) {
      setCheckoutGuestError("Add guest name and email to continue.");
      return;
    }
    if (!pendingCheckout) {
      setIsCheckoutGuestOpen(false);
      return;
    }
    setCheckoutGuestError("");
    setIsCheckoutGuestOpen(false);
    const consentText =
      "By continuing to payment, you authorize OneLuxStay to charge the total amount shown for your reservation. A receipt will be emailed to you";
    const payload = {
      ...pendingCheckout,
      guest: checkoutGuest,
      consentText,
      consentAcceptedAt: new Date().toISOString(),
    };
    setCheckoutConsentAccepted(false);
    setCheckoutStep(1);
    setPendingCheckout(null);
    handleSectionCheckout(payload);
  };

  const isCheckoutGuestValid = Boolean(
    checkoutGuest.firstName.trim() && checkoutGuest.lastName.trim() && checkoutGuest.email.trim()
  );
  const canContinueToPayment = isCheckoutGuestValid && checkoutConsentAccepted;

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
  const heroUnits = useMemo(() => {
    const sourceListings = losAngelesParentListings.length
      ? losAngelesParentListings
      : losAngelesListings;
    const featuredIds = Object.values(FEATURED_LISTING_IDS).filter(Boolean);
    const featuredListings = featuredIds
      .map((id) => matchListingById(sourceListings, id))
      .filter(Boolean);
    if (featuredListings.length) {
      return featuredListings;
    }
    return pickOnePerBuilding(sourceListings);
  }, [losAngelesParentListings, losAngelesListings]);

  const bounceListings = useMemo(() => {
    const fallbackImages = heroImages;
    if (!heroUnits.length) {
      return heroImages.map((src, idx) => ({
        id: null,
        image: src,
        title: `Antwerp stay ${idx + 1}`,
        price: "",
      }));
    }
    return heroUnits.map((listing, index) => {
      const image =
        listing.picture?.regular ||
        listing.picture?.large ||
        listing.picture?.thumbnail ||
        listing.pictures?.[0]?.original ||
        listing.pictures?.[0]?.thumbnail ||
        fallbackImages[index] ||
        fallbackImages[0];
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
  }, [heroImages, heroUnits]);
  const heroCards = useMemo(() => {
    if (!bounceListings.length) return [];
    return bounceListings.map((listing, idx) => ({
      id: listing?.id ?? null,
      image: listing?.image || heroImages[idx % heroImages.length],
      title: listing?.title || `Antwerp stay ${idx + 1}`,
    }));
  }, [heroImages, bounceListings]);
  const inquiryTitle = inquiryListing?.title ? sanitizeText(inquiryListing.title) : "this unit";
  const inquiryDates =
    sectionCheckIn && sectionCheckOut ? `${sectionCheckIn} to ${sectionCheckOut}` : "";
  const buildListingPath = (listingId) => {
    if (!listingId) return "/antwerp";
    const params = new URLSearchParams();
    if (sectionCheckIn) params.set("checkIn", sectionCheckIn);
    if (sectionCheckOut) params.set("checkOut", sectionCheckOut);
    if (sectionGuests) params.set("guests", sectionGuests);
    const query = params.toString();
    return `/antwerp/listing/${encodeURIComponent(listingId)}${query ? `?${query}` : ""}`;
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

  const tourSlides = CITY_TOUR_SLIDES[tourCity] || CITY_TOUR_SLIDES[TOUR_CITIES[0]] || [];
  const tourCount = tourSlides.length;
  const activeTourSlide = tourSlides[tourIndex] || tourSlides[0] || {};

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
      setMapError("Google Maps API key is missing.");
      return;
    }
    loadGoogleMaps(mapsApiKey)
      .then((maps) => {
        const coords = getListingCoords(activeListing) || PROPERTY_COORDS;
        const map = new maps.Map(listingMapRef.current, {
          center: coords,
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
        listingMapMarkerRef.current = new maps.Marker({
          map,
          position: coords,
          title: activeListing.title || "OneLuxStay",
        });
      })
      .catch(() => {
        setMapError("Unable to load Google Maps.");
      });
  }, [isListingMapOpen, activeListing, mapsApiKey]);

  useEffect(() => {
    if (!isSectionMapOpen || !sectionMapRef.current || !sectionMapTarget) return;
    if (!mapsApiKey) {
      setMapError("Google Maps API key is missing.");
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
        setMapError("Unable to load Google Maps.");
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
      <section className="la-listing-hero">
        <div className="la-listing-hero__top">
          <button
            type="button"
            className="la-unit-modal__back"
            aria-label="Back to listings"
            onClick={() => {
              setActiveListing(null);
              setActiveImageIndex(0);
              if (isListingRoute) {
                navigate("/antwerp");
              }
            }}
          >
            <span aria-hidden="true">‚Äπ</span>
          </button>
        </div>
        <div className="la-listing-hero__intro">
          <div>
            <p className="la-listing-hero__kicker">Antwerp private stay</p>
            <h3>{sanitizeText(activeListing.title)}</h3>
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
            <img src={LOGO_URL} alt="OneLuxStay logo" loading="lazy" onError={handleImageError} />
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
        const mapUrl = coords
          ? `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=14&size=400x280&maptype=roadmap&markers=color:0x2f261e%7C${coords.lat},${coords.lng}&key=${mapsApiKey}`
          : "";
        const mapEmbedUrl = coords
          ? `https://www.google.com/maps?q=${encodeURIComponent(
            `${coords.lat},${coords.lng}`
          )}&z=15&output=embed`
          : addressQuery
            ? `https://www.google.com/maps?q=${encodeURIComponent(addressQuery)}&z=15&output=embed`
          : "";
        const amenityListRaw = Array.isArray(activeListing.amenities)
          ? activeListing.amenities
          : [];
        const amenityList = amenityListRaw
          .filter((item) => typeof item === "string")
          ;
        const aboutText = formatFullDescription(activeListing);
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
        const plan = quote?.plans?.[0] || quote?.plan || quote?.pricing || null;
        const breakdown = plan?.breakdown || quote?.breakdown || quote?.pricing?.breakdown || null;
        const priceCurrency = quote?.currency || activeListing.currency || "USD";
        const totalPrice =
          breakdown?.total ??
          breakdown?.subtotal ??
          plan?.total ??
          quote?.total ??
          null;
        return (
          <>
            <div className="la-unit&¢Jù®›⁄ºòZ|›(òå —µ*Ù„Q˘?}>ΩR∆À©Œë‰A_àâ}FB:¨ÿÛ}œµÒ1Ù(:—Úøº≤œ≥§ÍùfFÑåôtQFm;UÉÛ>≠(‰˚g)H~'
‰¨£˜‡2˛FNééåv*`¶Óòps{k9tÆî√9≈:°°kñ57Ô¥jí‘+‰·D˜⁄it2%˚⁄¬s(é`ó3Ÿ´Ï¥M◊›Cˇ…0¥ˇÀx †çõ$ √"]À©ˆ]jù@Ï©RÛ–∞F∫≈„’W€°åj8u ,’‘Sÿ≠¸FZîä õíh)oÚ j€=–"«zÄu=å∏l—FÉ“ßπ÷8‹€√v±<·è6Zn´ÿkˆÔ¿¢9oVØ#q^ùU‡F´%	âæ∂˙ÙäÒ≥´i|∏Ä.í8¯@ß607	8˝g©òôï€◊W:zcûÎì’….[Z>H:ƒ:gF±ºÈI∏{¿¥	÷≠Mb ∫¬$- ÜM·Dôw·Ê∑–bnÑÔ˘ÏÚàÜﬁ‰xîíŸ∏y1∆J(XNt"ëÅë£¨6:S'$&ó:´	w˜µÏ5´FFcYéä≈™vp≥∆<N1n"œD	g˛€¯Q¨u5©lAﬂdCıì˘‚˝ªƒP;È\ﬁf¥â>±	ﬁ‡πÑ∑»xAøL%r}¢˝!≈61}◊´`{Ìó´ÇµüçÃóP’|ÛÃ√kH≈˛ããÊº«
D¯r”Ï~’sNÕpç¢ıhÉÕéÏ»¬R;ëÿΩq∆≠n≠ÌjÔæÒ=‚3·)ä3Â`Õ√¡l‚éöÌ‡ÂıπÈ(ïM⁄"K*5q[X	ÉìäÉπãC∑NDS!D=†(EM±@U^"%g√ß)E"≠sTßS$OoCìW¡qUÂI¶;Q1thÖèπ—9ˇ`ﬂÙG∏H©/`Œ–IRÕ.–∞hå¿Õ
Ø´pCËX‚Qaìù…à[ú8çsá˘óó±¯ÒÏû‰Í¨ºP*#>_aˇGê`@iÄv4∏ëogaSGÈìwh3q™&˛◊ z¿ÅBå)}ˆ4&∫‘û˚DôWTÒ¯'–n‡eA]áŒ•hﬂs¬(éÚ$/⁄‚›NÕ¶¨÷Í˜|0°8∆ìîk{z[L⁄™›˛Õ¨ËapF!ñ«wë3g´R¯Ô`g@QÅÊT˘aDqò'Q–Ê·VDˆò5SΩÈèv 6¡∑Ü≤≠qÓ%f‹V…˜∑1∞•†‹√Àà∫2üØ@·ÅGëfCTà˘0°~∆îycKq∫%ùﬂN¡¶Ñ÷˜\2À≠∏ÏëkgyRÌsn(fÒT'˙”ËEpû!F≈óür /Ω·éF&ñ’v˝4∏"íœo°`«Cìãk;yö]wŒ3ß®–Û‡(BÚå-*Ì˝nf#T»¯∞°o«aìDiõw[0€¢⁄Œﬂ¶¿◊ÉÚ,2Î¨xÍ}fT%˙ﬂ¿GÄílhqC%ãﬁ:«ûìFióws2+Æ˙‰Y@’Å˛\T»˚±§Tÿ˙—‰EXú—JÂΩ_å¡+Ö˙FMîØy‚M|Æ	‰5[ºŸâ÷4˜∫1ûßD—õÁXP“‚ÌMlØi„uJ<øâÇ5Ω!é∆$ñ⁄vﬂ6√∑ä≤?ØÅ‚L©Iıµ=ºçà.3Á™P˛‡@ÅIµæMÑÆÂU\¸»	∞4£ª…ô∑T∞˚†¡UÑ¸P:„ùKLπ©îıx=èj"~ÕØ‚aLE©ú˜H1≥ß®—ÚÂ-\Ï»k≤y≠ÔybMqÆ$ÂŸ^‘∆˚ñvZ4ﬂπ¡îázmBmçn/f„UK˝ªò/P‡‡ABÖç-FÓïe] œ¢Ã3®®#"»œ∞°¢ƒœõ†X√”ãÍ8ímn;dõXX”“ÎÌxnem_o√cãH9≥ï™|ˇ0
†<√ãä8?ìÉj:úH+≤˚¨ÈUt¸8	ê6c∑I≥µ´º˘à1}¶‘'˙–‚ELù©Lı®?ÛÅ*¸	R4Ïπhósr).˜‰2[ÆÿÂ—\‰ [æŸÖ÷ıJ=æçÑ.ÂZ\ﬁ ≈øúÉK	π5ñøtÇ;ô#V»Ù∞:£üÀAπÑñuY<◊äÚ</ä‚=Oç¢,œÎ¢xŒ•hﬁr≈/ü„BIé∂%∂›∂Õ∑≠∞Ì°m«mìlkk{{]ZÃ›™Ãˇ´ ¯ `@Äf T¯a`GAëáfUgˇS Ëp ¿wÄ2¨Ëqp&!÷∆˜ñ3v™4ˇªòP‡a@EÅûDôgWQÁ!Pƒ‡ôBUè˛#»∞q†$¡€Ü⁄›vŒ6ß∂—∑Â∞]¢ÃÕ´¨¯ÎxfUaˇGê`@iÄv4∏ëogaSGÈìwh3q™&˛◊ z¿ÅBå)}ˆ4&∫‘û˚DôWTÒ¯'–n‡eA]áŒ•hﬂs¬(éÚ$/⁄‚›NÕ¶¨÷Í˜|0°8∆ìîk{z[L⁄™›˛Õ¨ËapF!ñ«wë3g´R¯Ô`g@QÅÊT˘aDqò'Q–Ê·VDˆò5SΩÈèv 6¡∑Ü≤≠qÓ%f‹V…˜∑1∞•†‹√Àà∫2üØ@·ÅGëfCTà˘0°~∆îycKq∫%ùﬂN¡¶Ñ÷˜\2À≠∏ÏëkgyRÌsn(fÒT'˙”ËEpû!F≈óür /Ω·éF&ñ’v˝4∏"íœo°`«Cìãk;yö]wŒ3ß®–Û‡(BÚå-*Ì˝nf#T»¯∞°o«aìDiõw[0€¢⁄Œﬂ¶¿◊ÉÚ,2Î¨xÍ}fT%˙ﬂ¿GÄílhqC%ãﬁ:«ûìFióws2+Æ˙‰Y@’Å˛\T»˚±§Tÿ˙—‰EXú—JÂΩ_å¡+Ö˙FMîØy‚M|Æ	‰5[ºŸâ÷4˜∫1ûßD—õÁXP“‚ÌMlØi„uJ<øâÇ5Ω!é∆$ñ⁄vﬂ6√∑ä≤?ØÅ‚L©Iıµ=ºçà.3Á™P˛‡@ÅIµæMÑÆÂU\¸»	∞4£ª…ô∑T∞˚†¡UÑ¸P:„ùKLπ©îıx=èj"~ÕØ‚aLE©ú˜H1≥ß®—ÚÂ-\Ï»k≤y≠ÔybMqÆ$ÂŸ^‘∆˚ñvZ4ﬂπ¡îázmBmçn/f„UK˝ªò/P‡‡ABÖç-FÓïe] œ¢Ã3®®#"»œ∞°¢ƒœõ†X√”ãÍ8ímn;dõXX”“ÎÌxnem_o√cãH9≥ï™|ˇ0
†<√ãä8?ìÉj:úH+≤˚¨ÈUt¸8	ê6c∑I≥µ´º˘à1}¶‘'˙–‚ELù©Lı®?ÛÅ*¸	R4Ïπhósr).˜‰2[ÆÿÂ—\‰ [æŸÖ÷ıJ=æçÑ.ÂZ\ﬁ ≈øúÉK	π5ñøtÇ;ô#V»Ù∞:£üÀAπÑñuY<◊äÚ</ä‚=Oç¢,œÎ¢xŒ•hﬁr≈/ü„BIé∂%∂›∂Õ∑≠∞Ì°m«mìlkk{{]ZÃ›™Ãˇ´ ¯ `@Äf T¯a`GAëáfUgˇS Ëp ¿wÄ2¨Ëqp&!÷∆˜ñ3v™4ˇªòP‡a@EÅûDôgWQÁ!Pƒ‡ôBUè˛#»∞q†$¡€Ü⁄›vŒ6ß∂—∑Â∞]¢ÃÕ´¨¯ÎxfUaˇGê`@iÄv4∏ëogaSGÈìwh3q™&˛◊ z¿ÅBå)}ˆ4&∫‘û˚DôWTÒ¯'–n‡eA]áŒ•hﬂs¬(éÚ$/⁄‚›NÕ¶¨÷Í˜|0°8∆ìîk{z[L⁄™›˛Õ¨ËapF!ñ«wë3g´R¯Ô`g@QÅÊT˘aDqò'Q–Ê·VDˆò5SΩÈèv 6¡∑Ü≤≠qÓ%f‹V…˜∑1∞•†‹√Àà∫2üØ@·ÅGëfCTà˘0°~∆îycKq∫%ùﬂN¡¶Ñ÷˜\2À≠∏ÏëkgyRÌsn(fÒT'˙”ËEpû!F≈óür /Ω·éF&ñ’v˝4∏"íœo°`«Cìãk;yö]wŒ3ß®–Û‡(BÚå-*Ì˝nf#T»¯∞°o«aìDiõw[0€¢⁄Œﬂ¶¿◊ÉÚ,2Î¨xÍ}fT%˙ﬂ¿GÄílhqC%ãﬁ:«ûìFióws2+Æ˙‰Y@’Å˛\T»˚±§Tÿ˙—‰EXú—JÂΩ_å¡+Ö˙FMîØy‚M|Æ	‰5[ºŸâ÷4˜∫1ûßD—õÁXP“‚ÌMlØi„uJ<øâÇ5Ω!é∆$ñ⁄vﬂ6√∑ä≤?ØÅ‚L©Iıµ=ºçà.3Á™P˛‡@ÅIµæMÑÆÂU\¸»	∞4£ª…ô∑T∞˚†¡UÑ¸P:„ùKLπ©îıx=èj"~ÕØ‚aLE©ú˜H1≥ß®—ÚÂ-\Ï»k≤y≠ÔybMqÆ$ÂŸ^‘∆˚ñvZ4ﬂπ¡îázmBmçn/f„UK˝ªò/P‡‡ABÖç-FÓïe] œ¢Ã3®®#"»œ∞°¢ƒœõ†X√”ãÍ8ímn;dõXX”“ÎÌxnem_o√cãH9≥ï™|ˇ0
†<√ãä8?ìÉj:úH+≤˚¨ÈUt¸8	ê6c∑I≥µ´º˘à1}¶‘'˙–‚ELù©Lı®?ÛÅ*¸	R4Ïπhósr).˜‰2[ÆÿÂ—\‰ [æŸÖ÷ıJ=æçÑ.ÂZ\ﬁ ≈øúÉK	π5ñøtÇ;ô#V»Ù∞:£üÀAπÑñuY<◊äÚ</ä‚=Oç¢,œÎ¢xŒ•hﬁr≈/ü„BIé∂%∂›∂Õ∑≠∞Ì°m«mìlkk{{]ZÃ›™Ãˇ´ ¯ `@Äf T¯a`GAëáfUgˇS Ëp ¿wÄ2¨Ëqp&!÷∆˜ñ3v™4ˇªòP‡a@EÅûDôgWQÁ!Pƒ‡ôBUè˛#»∞q†$¡€Ü⁄›vŒ6ß∂—∑Â∞]¢ÃÕ´¨¯ÎxfUaˇGê`@iÄv4∏ëogaSGÈìwh3q™&˛◊ z¿ÅBå)}ˆ4&∫‘û˚DôWTÒ¯'–n‡eA]áŒ•hﬂs¬(éÚ$/⁄‚›NÕ¶¨÷Í˜|0°8∆ìîk{z[L⁄™›˛Õ¨ËapF!ñ«wë3g´R¯Ô`g@QÅÊT˘aDqò'Q–Ê·VDˆò5SΩÈèv 6¡∑Ü≤≠qÓ%f‹V…˜∑1∞•†‹√Àà∫2üØ@·ÅGëfCTà˘0°~∆îycKq∫%ùﬂN¡¶Ñ÷˜\2À≠∏ÏëkgyRÌsn(fÒT'˙”ËEpû!F≈óüPø\ÿ¡˝2Tˇ∂ﬂôDÁ°’	®-ª¢O„m+º¬ïÚÜéL'îÂCOâﬂO2Z$≠ó÷2÷©¸3VÏ5T¥’‡Ï™»§≤ÂõfIV…çEûha2ù≥q¢&Ï≠f j
~y˛∞^¢¯˙(ÛUR_◊äÅp?`≤ÌëfevM4=ªƒ÷uÀ6πñÖvç6bæ§$Åÿ9ÂØN·ÿ? 24‰ Ñ5>¬o€F>–ø≥≠I€‘∂…!¶ªÇv†êÇ?EÅó)WÑÁ§'ÿ—µA¯Æ¶r¶’ˇ’vÀÚﬂ`bC⁄,õ¡O≈…ÌLFÄ„4çúy;a≠,+Ín€#‹`°0>âØ@‘G¯’î§ïe÷¬ì)Ò3µ—(i3Œ®zxåÑ≠¡>æSA˚7 sÄT)tãµä+P«ƒ¿˘óÃV!ë‡BâsÖgä9:ÃTÑ∫5óÆé¯p)6[∞‘©Âÿzm/“WÜ;8î‘c•\5åÜo5‡ÔnL%Ö÷
3kêoÕg°[Ÿ˜ìòQM•™Ôƒ⁄∞™ı”1¨Ω˜ñc"ª-~SL¿i‰‚‹Ÿ%BiQXkZˆY£-›πﬁU¬6xD$“≠¢¶L˜´'tm›o+N¡à¯vÜ9 ïH3∏^â:Œúê ò˙5^@“&Á»„)Ài>†›dÃö≈±(ü%}z ’é[¢Z^Zëë\8⁄±äøtÅ„ »∏˜ˆr»/–ÏÈK7ëg9©≠÷Á9l◊‰⁄ ˜IaπQx´Ü’[◊˙é-‹ÈÛuq_˘√ÀT¸ÉQ:Ë—¥Ö√´)À£^ÌIÍç!=ÁŸKû∏ü∂≈»ƒò”ÁΩ^1?°∏ƒ∏◊ƒ.π,kbi4tÓ:1-àhcy	(/´•x2ãq}ƒuY{	?Ω
˝o(ó«8RPUN£¥îÛ~⁄Dñ’fÕU-ém$‚˝b7b¥8>úìH ÍäÍl8Óé))Á4ê≈F¥ºœæ+Ï˜óÜ∑Ü»Ä?¡˚‡ûùÃﬁ<ARtlLŒ~bÚ1Pv#µ0>∏ëogaSGÈìwh3q™&˛◊ z¿ÅBå)}ˆ4&∫‘û˚DôWTÒ¯'–n‡eA]áŒ•hﬂs¬(éÚ$/⁄‚›NÕ¶¨÷Í˜|0°8∆ìîk{z[L⁄™›˛Õ¨ËapF!ñ«wë3g´R¯Ô`g@QÅÊT˘aDqò'Q–Ê·VDˆò5SΩÈèv 6¡∑Ü≤≠qÓ%f‹V…˜∑1∞•†‹√Àà∫2üØ@·ÅGëfCTà˘0°~∆îycKq∫%ùﬂN¡¶Ñ÷˜\2À≠∏ÏëkgyRÌsn(fÒT'˙”ËEpû!F≈óür /Ω·éF&ñ’v˝4∏"íœo°`«Cìãk;yö]wŒ3ß®–Û‡(BÚå-*Ì˝nf#T»¯∞°o«aìDiõw[0€¢⁄Œﬂ¶¿◊ÉÚ,2Î¨xÍ}fT%˙ﬂ¿GÄílhqC%ãﬁ:«ûìFióws2+Æ˙‰Y@’Å˛\T»˚±§Tÿ˙—‰EXú—JÂΩ_å¡+Ö˙FMîØy‚M|Æ	‰5[ºŸâ÷4˜∫1ûßD—õÁXP“‚ÌMlØi„uJ<øâÇ5Ω!é∆$ñ⁄vﬂ6√∑ä≤?ØÅ‚L©Iıµ=ºçà.3Á™P˛‡@ÅIµæMÑÆÂU\¸»	∞4£ª…ô∑T∞˚†¡UÑ¸P:„ùKLπ©îıx=èj"~ÕØ‚aLE©ú˜H1≥ß®—ÚÂ-\Ï»k≤y≠ÔybMqÆ$ÂŸ^‘∆˚ñvZ4ﬂπ¡îázmBmçn/f„UK˝ªò/P‡‡ABÖç-FÓïe] œ¢Ã3®®#"»œ∞°¢ƒœõ†X√”ãÍ8ímn;dõXX”“ÎÌxnem_o√cãH9≥ï™|ˇ0
†<√ãä8?ìÉj:úH+≤˚¨ÈUt¸8	ê6c∑I≥µ´º˘à1}¶‘'˙–‚ELù©Lı®?ÛÅ*¸	R4Ïπhósr).˜‰2[ÆÿÂ—\‰ [æŸÖ÷ıJ=æçÑ.ÂZ\ﬁ ≈øúÉK	π5ñøtÇ;ô#V»Ù∞:£üÀAπÑñuY<◊äÚ</ä‚=Oç¢,œÎ¢xŒ•hﬁr≈/ü„BIé∂%∂›∂Õ∑≠∞Ì°m«mìlkk{{]ZÃ›™Ãˇ´ ¯ `@Äf T¯a`GAëáfUgˇS Ëp ¿wÄ2¨Ëqp&!÷∆˜ñ3v™4ˇªòP‡a@EÅûDôgWQÁ!Pƒ‡ôBUè˛#»∞q†$¡€Ü⁄›vŒ6ß∂—∑Â∞]¢ÃÕ´¨¯ÎxfUaˇGê`@iÄv4∏ëogaSGÈìwh3q™&˛◊ z¿ÅBå)}ˆ4&∫‘û˚DôWTÒ¯'–n‡eA]áŒ•hﬂs¬(éÚ$/⁄‚›NÕ¶¨÷Í˜|0°8∆ìîk{z[L⁄™›˛Õ¨ËapF!ñ«wë3g´R¯Ô`g@QÅÊT˘aDqò'Q–Ê·VDˆò5SΩÈèv 6¡∑Ü≤≠qÓ%f‹V…˜∑1∞•†‹√Àà∫2üØ@·ÅGëfCTà˘0°~∆îycKq∫%ùﬂN¡¶Ñ÷˜\2À≠∏ÏëkgyRÌsn(fÒT'˙”ËEpû!F≈óür /Ω·éF&ñ’v˝4∏"íœo°`«Cìãk;yö]wŒ3ß®–Û‡(BÚå-*Ì˝nf#T»¯∞°o«aìDiõw[0€¢⁄Œﬂ¶¿◊ÉÚ,2Î¨xÍ}fT%˙ﬂ¿GÄílhqC%ãﬁ:«ûìFióws2+Æ˙‰Y@’Å˛\T»˚±§Tÿ˙—‰EXú—JÂΩ_å¡+Ö˙FMîØy‚M|Æ	‰5[ºŸâ÷4˜∫1ûßD—õÁXP“‚ÌMlØi„uJ<øâÇ5Ω!é∆$ñ⁄vﬂ6√∑ä≤?ØÅ‚L©Iıµ=ºçà.3Á™P˛‡@ÅIµæMÑÆÂU\¸»	∞4£ª…ô∑T∞˚†¡UÑ¸P:„ùKLπ©îıx=èj"~ÕØ‚aLE©ú˜H1≥ß®—ÚÂ-\Ï»k≤y≠ÔybMqÆ$ÂŸ^‘∆˚ñvZ4ﬂπ¡îázmBmçn/f„UK˝ªò/P‡‡ABÖç-FÓïe] œ¢Ã3®®#"»œ∞°¢ƒœõ†X√”ãÍ8ímn;dõXX”“ÎÌxnem_o√cãH9≥ï™|ˇ0
†<√ãä8?ìÉj:úH+≤˚¨ÈUt¸8	ê6c∑I≥µ´º˘à1}¶‘'˙–‚ELù©Lı®?ÛÅ*¸	R4Ïπhósr).˜‰2[ÆÿÂ—\‰ [æŸÖ÷ıJ=æçÑ.ÂZ\ﬁ ≈øúÉK	π5ñøtÇ;ô#V»Ù∞:£üÀAπÑñuY<◊äÚ</ä‚=Oç¢,œÎ¢xŒ•hﬁr≈/ü„BIé∂%∂›∂Õ∑≠∞Ì°m«mìlkk{{]ZÃ›™Ãˇ´ ¯ `@Äf T¯a`GAëáfUgˇS Ëp ¿wÄ2¨Ëqp&!÷∆˜ñ3v™4ˇªòP‡a@EÅûDôgWQÁ!Pƒ‡ôBUè˛#»∞q†$¡€Ü⁄›vŒ6ß∂—∑Â∞]¢ÃÕ´¨¯ÎxfUaˇGê`@iÄv4∏ëogaSGÈìwh3q™&˛◊ z¿ÅBå)}ˆ4&∫‘û˚DôWTÒ¯'–n‡eA]áŒ•hﬂs¬(éÚ$/⁄‚›NÕ¶¨÷Í˜|0°8∆ìîk{z[L⁄™›˛Õ¨ËapF!ñ«wë3g´R¯Ô`g@QÅÊT˘aDqò'Q–Ê·VDˆò5SΩÈèv 6¡∑Ü≤≠qÓ%f‹V…˜∑1∞•†‹√Àà∫2üØ@·ÅGëfCTà˘0°~∆îycKq∫%ùﬂN¡¶Ñ÷˜\2À≠∏ÏëkgyRÌsn(fÒT'˙”ËEpû!F≈óür /Ω·éF&ñ’v˝4∏"íœo°`«Cìãk;yö]wŒ3ß®–Û‡(BÚå-*Ì˝nf#T»¯∞°o«aìDiõw[0€¢⁄Œﬂ¶¿◊ÉÚ,2Î¨xÍ}fT%˙ﬂ¿GÄílhqC%ãﬁ:«ûìFióws2+Æ˙‰Y@’Å˛\T»˚±§Tÿ˙—‰EXú—JÂΩ_å¡+Ö˙FMîØy‚M|Æ	‰5[ºŸâ÷4˜∫1ûßD—õÁXP“‚ÌMlØi„uJ<øâÇ5Ω!é∆$ñ⁄vﬂ6√∑ä≤?ØÅ‚L©Iıµ=ºçà.3Á™P˛‡@ÅIµæMÑÆÂU\¸»	∞4£ª…ô∑T∞˚†¡UÑ¸P:„ùKLπ©îıx=èj"~ÕØ‚aLE©ú˜H1≥ß®—ÚÂ-\Ï»k≤y≠ÔybMqÆ$ÂŸ^‘∆˚ñvZ4ﬂπ¡îázmBmçn/f„UK˝ªò/P‡‡ABÖç-FÓïe] œ¢Ã3®®#"»œ∞°¢ƒœõ†X√”ãÍ8ímn;dõXX”“ÎÌxnem_o√cãH9≥ï™|ˇ0
†<√ãä8?ìÉj:úH+≤˚¨ÈUt¸8	ê6c∑I≥µ´º˘à1}¶‘'˙–‚ELù©Lı®?ÛÅ*¸	R4Ïπhósr).˜‰2[ÆÿÂ—\‰ [æŸÖ÷ıJ=æçÑ.ÂZ\ﬁ ≈øúÉK	π5ñøtÇ;ô#V»Ù∞:£üÀAπÑñuY<◊äÚ</ä‚=Oç¢,œÎ¢xŒ•hﬁr≈/ü„BIé∂%∂›∂Õ∑≠∞Ì°m«mìlkk{{]ZÃ›™Ãˇ´ ¯ `@Äf T¯a`GAëáfUgˇS Ëp ¿wÄ2¨Ëqp&!÷∆˜ñ3v™4ˇªòP‡a@EÅûDôgWQÁ!Pƒ‡ôBUè˛#»∞q†$¡€Ü⁄›vŒ6ß∂—∑Â∞]¢ÃÕ´¨¯ÎxfUaˇGê`@iÄv4∏ëogaSGÈìwh3q™&˛◊ z¿ÅBå)}ˆ4&∫‘û˚DôWTÒ¯'–n‡eA]áŒ•hﬂs¬(éÚ$/⁄‚›NÕ¶¨÷Í˜|0°8∆ìîk{z[L⁄™›˛Õ¨ËapF!ñ«wë3g´R¯Ô`g@QÅÊT˘aDqò'Q–Ê·VDˆò5SΩÈèv 6¡∑Ü≤≠qÓ%f‹V…˜∑1∞•†‹√Àà∫2üØ@·ÅGëfCTà˘0°~∆îycKq∫%ùﬂN¡¶Ñ÷˜\2À≠∏ÏëkgyRÌsn(fÒT'˙”ËEpû!F≈óüµ°û_’3Ø'√uÑÏevc≈öp>%Pª„@ﬁŸìÆ|ôäó=Õ‚äÇ∂£=Û7Ô¸S3⁄ŒôFvÀgõ—uû¯µyÎQ3ﬁª"‹≠y÷_ÕJ|ŸKÃºVQŸ÷‰,Î9ú¯ﬂák4U†!|!%˘£9‡µ5≥Ê|Ã»âØò¬_öDıø◊îÛÕN»«Z\ìÁÔ◊’
\hãúç0#~í2Ä{Œ‹ò&”
	%¬¬U&Ø!&J3∫uŸˆjåYõ2W„?NáôrÚ©“ô=Ê”o<ƒ’Ü6 Á,CAzÙ_ó’"3ÿ“RdÄ‡Ä∑µQú∞∑c4ZÓHV‘í8wÀ ë$Ër˚w≥ÂVŸÈnü¶®ÒÃ◊"*
gÒ«Eí5%÷ï	Gﬂ∂\?ÊÿCZ≤îWPAn¥€ô~Ï∂Õp©aÚeSYl<ïÀ¶M‡◊N˛Õ√∏
¬5_cü#Ú¿ª9JÁ∫l‘`G≈jô,)=		Ìt†Z›õÄúTºæeå]‚)5ìwycå±&üßü¢∏≤À>?ë¯4ÃÎƒõ!O√ç~“®uC@“‰E"=¢ÚBhài9˘Ê∫k!Ω°¢u∏‰¡-TòßE§h ãCqÆ3åãÚ%¿∞"Z…˘ÔîW<”≠˝∞F√àXP~]˚ãRãKè:Dû∫aíâ£äáîÏ≠\.j3Ï¡|%)}€&¯©Æ]CYJ˚~kwﬂ"¯Á∞EÎ)<0Röi¨Ó‹Q{*◊*jMr»≤3ò5ôëŒ-˙®Bé ;ï‡Ú}ú8_ˇÍu⁄◊}ê˜/bÈ«õM∏˘,`Zp"ë√fƒ„¸7öºvÒ¯yWÈßèøt{[Qá&ÖÄ^ïÆ∏r)UhÕÛ??·ï™]›Â8®ôOπ?9≤ûÑ.ÄÍ67vÆU™Œœé9yë◊eêÿ›åBAlåöÛJé;s=9MΩë»C[c3ÏÀ÷ñ/˜=0˜24AÈë°Ë:¯ptàRâ‘ßb¨÷&@4&mÒÆø≥ÁæÉ1—Ì4,Ñó»ÿ{€ûö®UJîrîöI∂§∏ﬂùZ“+K.∞˙B£ +M°T@ë´¥‡süâº™–yÑbÛaÄB”6¥uõÔóëál&±Y’`ÔÌC,ÔÈ&≤B'£ÄU™ˇ˘òOö•{x]€'“∞∞›cx†!¶ ‘7cÁaó ío≈Tt`ﬂ˘ˇkJ‡™?Éµ"Û=M∫√∞&î£ó™·∆iÊü‚Rﬂ“∂b_DÒ˝«P<»√´PÌÆ∑.¿N—â
mwËky‡‚ﬂê ó^∫ b˚@∞ë.$˚-Vx>Û7òÓØË∂≠8≠î˘Êv3<â¨2‘é‰ÈM#é™pdÑ@™£í«^ö`∞T®{%√‘ìÕ^ÖÊ«A "?É7nº“c—ñ≈öØŸ˚≥ƒ4Y˙0U£	i„Ò
1G≈6—§Ÿoß/ ﬁ'¯NÀá
’ˇË»w¶ÄïJO≈£æÖƒ.◊D«à%zGÛ≠jÀ[Ìh ˚Òz'∑9K“ ›¶◊ÑÕÉ≥‘XùÃÔo«¶
 ®m»	{!ı*˙ª-„áà˘KölU’' øN,{€i}ÀsMëGScÌsœH´òâˇöyîRË…-Ë(ëÁ'Y√ê<´a0Êt™ê¯œ¯¶X;ëïZ€ë$*ÀÌ\∫£≈ï<L∞¢AÉÎÓMÅ‹Òé˜PdºÄW.ã˜∏+FïíÒXw-	j6ÒzˆøπÿAjØ
¸ÂöMÄöïπ‹È‡Æäì13Jà"‡Œ3$L0◊–4=!>9+-∏Ïmª ΩZ@ºƒ]à3%É™@Cπ/1Ωm}#≈Ü¶nœSe`◊MP/¶ù#ﬁÇ€zÚıéTyê©a‚ƒÕ™Æg/^ã®Ú#ï∑}∂Íü«'Ì” ô∑?ˇ¸Àbs(Ke∑ﬁ´9æÍˆbªÏíØ‡Ú+÷“¬≈0ölòsS7ƒx°VÇùæ3ÈÉ"´/ó fÇÏŸœYùFÜÛ
)ÍP≥:ºµn`õÕÔtmH/ΩÄ´ˆ?–k÷¿≤ØŸe"gHCñmï0˙RÊuCujpwÔÁïã„53;Ûs€m^p§õ'ó>)Z…giA+Í‰ÿ2˚hÏwËwS·[‚ˆ{õä§4`h÷3˚‹‡MváoÒ=“±ï54 Mte ÉZ∞ˆ;N»˜”≈˘ê–Ÿ6Z}â∞Ÿ%X·Å≈|˙Üﬁz˚§æﬁNK_irigÓÚr“å¬…ß"Ãù¥ﬂ4é4êDq‡y“3âh3“.ï*Áy\'Ç¬>ÚAËs-Œ√‰î?>)Å
hÛˇõ#ÏÄo∏=HC„‚[ìLì…w	LâFÅ€œV`vôí»Üø¶uÓ•Ωè¬¶ÕW&∫öﬁwíF§√Ë¥§«∑î}ö¨Mdá@˝êΩ´˙ı„Ù…!y17√Ú∑ü€π⁄î√AË[ﬁ$∏zﬂFeàÍ•6%#√ΩéFØ)¬√‘√Ò0m é€à¯†¬«>¨:⁄õãs*fõ$åtﬂ>‚w/©Â˚†äı_WQˇ)ËŒDtÏ&O/ù&9VRã)…Ï˙O}V	¿v\≈¯`3>ÆÊ7æñnMsœÓlg´˚"~ƒ˘<p<Û@ïD»™j˝M&Ùπ°Q?£U∫æ…·Úó£ÇäºB¡ÂπË•+9RU` ÚÆ8µÇ´xÄ©[X‡ÆRydúIR≤ß1OhÏH˛9§éû∆ä'\;CI¯Ú¬≥◊ù!(h£ƒçU˝‚	ø;=|Ãå'PölNùØÃƒÒFçÅk(käŸoƒgnÿõCœß9,6O;¿Nx‰º@I^Üv≥≠âûŒ¢aÎ{Ò °x«çrÌñ¬;FF“¬óyøÈ ÌKÓ‡â€2PHX5∆z∆ŒB1}	m≤Y,Ì¬TRÌw/[û ÕvˆŒÛCa5uzaJ?,√-÷…ËúˆÂˆRH‘5ky∏Ω°‘=6	åZ_¢¢§’yôrôL˚œÈq,◊¶Öù	Ï˜D≤4`eıH¡«;v∞8ìt›œ√Œ%aÉ€:Y`˘êÑø˜£|#]2ÿ¿.Sßª¸¥üú—≠1S _ º*å≠∏WÜ9'¿Z4‹ânâ†èxÃ/≤qî∆M·gÁïÅœ*çUAªd‹gîˇ4¸#˝“˚)%ûJ[Ü±R√+T2°),&vä¬b/ «ÉK'G›∆¯…∆©QOã\¡¥´óå•Ö¢Ôƒ± ÷GëA‘ˇ¬¸,÷8¯ Èa≈%î`ötòÒZﬁÊTæJ2∂çn9ê°’≤â~ R!RêP=c0≥n·ﬁX	w«º#ﬁöÀ˛‚ﬂÏkó≠ÈÒ;ˇ;î•ÿ®ZÜz?ûñ°Œ›Áú˛TÁï
~Öµ9±é°µ{¬ íS›µéJ¥‰Œ3û ƒ=î„cn™º°⁄ è~∆‚ ∞⁄∆ÃÕŸ¸Do‹®¡◊!¯ı
~Ø‚πº|s≥ïÚCn#« [\≤™Né∞_4ß	ozÚΩLËRC¢ˇ”ÜxS	ªÓÒVßAªKtçNπCπ∂¥∫~B”T◊ñUo≈j©xliΩ®ß29H™Òí’»8ËtÙ…8l\Ãææ‡ﬁp5*è¸(d∫Çº i3Ã“∂nj–.O√„T=ãJ«é∂‹m*>YNúÑ€uCDx≠òÑ</˚∞á‘	$É,¶¡€ÌŸ>æ/ÒÄk*ÇQ´i‹3ÊŸ#∏ü¨,Ì”4`@iÏs+˜2ÇBû:w≠ê5ZË`Ô&Íá∂Î—pöE€\÷Os'¨Tn|‡éƒ°C√´¢}Hä4∫?›îIˇ2Ö)òr‘®~uÄ∏áó¸ˆå∞≠&jQ˚bú…Œ1! AGÄá§ó]ˆJ≤;*{Ãù-Ài=Ò¢µK:=€º]J£;M+¬}äºª¨¬o	Á≥’,zlõÌ‹ËM˜+¥<Üì≠ÌkÍˇ˙Üôë“‡h≈ıª€_ÀE<“£jO˚$ú]ŒJ#9M+‡«Öõ¸ﬁå@≠hë˜‚∂À1=#M∑)4r<´}†âD≤*ƒ{üÕ≈(êuÁª‘|Ãè,ßnU‚x»ï5˚:ù…—1a#¿L-îi˝Úä©∫r®÷wp∑†ãÕró‡|L¶€s’'›/√ÔÑonzktc7FºòÜ_Ã^•…“∫‡ëNk™tÛ4&µÿ±‹´≈˜ë?jé{øÇiÉ'rt‘_æEè€§^^@Cí°ÎC˛Ç†ãDæ∆ãøÁ÷õqﬂ†DGŒı#∏O&ÙSæoÊÉ”ån≠‡kƒ˝ã¡Ω
à∏∑6ı3π/fÂ”ÿoUÁ{‘ú~ÃÄ,ÖlôÌ–Ëeı€∏_FÛØÔgÊ◊“tiΩ
§∫_F€_ÔG‰ﬁÙCø¶íSÍn˘·ì√ÌÍ°˙Cõﬁ¶BQ
`π«„ÛŒØ"gI’0x$ó]ıJ∏;Û∆≠kÈ˝Úã®øw∂í1Ë#˜Nµ#8M+Ù~øÉéú°ÃA, nÖ„õŒ› HE77◊4u<πß·W¬u
∫∫ﬂ◊Dw¥œ?%ZïY¯RñiıM2‰óñ|{p{/Ïwg?^åÀ&∑Ÿø⁄è–/ÏÏgf_YÃ⁄¶—ŸÎ€w◊?¸ç!»Kº∑Ñæàw?>Ñ?ì“JÂYªÛ¨k≤(\ãmÕÄN‰~øπåGÅqOG™\î‘¢≠â@l{˛‘§ˆ~Fáq4é)ª´¬óÏÜïîÍ?œ@‚ñ–\:FÆWáVWæü'∞˘ÿF£Ñ.◊ºQá@ü…_©Y°~ÇËƒöˇÂ©›\Ê7ærVùTwêˇ å›Ñ°-Íπ•ÉbÏ,m¿!ÛvNƒl≈Ê«STU(†ÍTuL Q.?¯À£eZ¥èì[©~x∑Ω∏àÊnΩéR’©oÃﬂ)‡Iú¯—C≥íä4‚¯»aF›gßë÷gÏ”&º¯—Lr“èJ¶>”´iãÀÄ/Dﬁ°¯tª¢}Næ∑„ ìØº4z˜iaPƒÌ‰BıÔã$>∆üúπyfcVÈÛî£˛æâuòO4‡Xè/Õ7’Ï#'”Iët•7>ñ ÄFÂTD9EÚÅ:*Äı·%4¶ΩLN„0#ŸäıpZPØÔ™\&Ã∑äy<^ó<N“Tf˜=déèÕëƒ>ÃKê¶¸Ã5Œ–6ˆI^®⁄‹0∂·√;≠L∫¢©Iˆi◊
íÉ¡+Gœ±} ∫ß⁄l¬@?ªà¢cAUd…Aà‹,v ≠r8\††âÌs¿óº≤1±p›ﬂÓ+∫(÷
˝UΩ=‰b∂}pƒÖhz
-L´ø–ÉK?Õænﬁ¢˛”èGù¢±^Ãu’ˇ∂èá˘®’\@˙D0 a·|™ëj˝íu/goésù{Óº7å]
◊˙„ïçÂöÍ£.À\%<´ÎË∑3S˚ü†)ŸZ∫K)»N∂Â¥≤ññ”¸gõijº6—E9¢NNâ[ÖD;vÜ◊ê‚3{"π•œúª˛ÿ1øcRàJ>Ò¬'∞YÇ∏±;_)3œ–“ Æ^˜¢ ¿∆V0¸…è˛Ó∆O5º∏Ây£î7ÔﬁòSÖkÄ∂ﬁ∞\"éÄ'à…õ2bıa^'MÍ2t?6ò~Üß∞ñ„w/â)Â4≤µÁËJ®ŒƒÅı†p £èÚ`w˙q;˝ú‚«ı∞VTú(”811!°<éÕPœ≈OôF›ˆ§ÂÇ†óuÉóó∂÷È?x≤Ø¿HgòÇe+'v	‡¸rs#V∑ÌƒFÏ?kOì¯“G¢Êd¸]Cí≠…ÚÒ∏:zÀË(Ô~ Pr8%√n	Âà)ÒÀVå=c&˘BJ¯˝¡°géï¸|\
Äµ'h£ÿ.≠∫Ã6‰^≤,¬´ÿΩp‘‹"•◊∫`>$ç\¶E√` ¥Aºö0^ÛR≠*,¬	gÿ;i≈xˇTì¬ç°V+ç=ﬂˆ™>\M¨⁄≠@9¥1pÅÛ>c◊]°ù˝h3q¢øÈU≤èèË†Ò{ÿ‰ûö«Â9·Ê˜ü˘¯hTü±Dí¿ﬁ]Yiv'Æmz0p¶JoÁK”îy“∫ﬁZZá§£ˆE,qf†=ÉÊ¯óºÄR`ÖÉ6ÂBJ+»ÆÔ•ñ“ü[ûXK|Ãõo»óL*$–’ê6Ö8UZmäÈ=ﬁº∆/ãpﬂx≤Ñ rfﬂ.eÇb°gKGgöç⁄b˜∑Ú2øë´aqxùS|rÌz=:WP∑¥X”„ÌÜíIÒ≤Vltv¸ˇ‡Y´Kõ‹€∆ç9L	PE‘‚Ë◊q[€∂!Ñãi°
öM{Ü-SØ›º¥∑ŸËøjÙ¶ÅzÊA∂Å8A˛‡/€úâzJx¬P·ÆàIõ°*ã-ÛE≠$˘=u≤f∆sç√À‡G®Øïãò¡◊~ÖÇÑΩàÛÁK˜Dã)mD`é»uksCøÎƒ{JΩ™v“è5hv≠ãºªø:J´@Ì5Á‡:?Oq‰„EœûÙvÇ¨çâ#T¨„‰¿©&@>™Æ^ô£≠ÂûﬁÄZÕºz¬êØØ3B1Å˛_óÕÌßFΩ˙Œ‡.±¬È⁄·*óò@ô"oT„±¸•O? ÇD®5Ôwo¢}ÍpˇäF=”Ù1bX5‘ µ©≤{ˇ˜òhLé%ﬁòB∂Ôz∂oàDÄ`[ﬁ}ni<Îs1RÿÎËπ≠‘hÓíhüÈi®_‡0a…≈1AmtÉ`ÿó±˛Idü“%Ï£ßE+#Øi¸r¬ﬁx@u∑”î≤æo‡MÕ1O-·æ“ÜÀù}—-ØÛc˙u±¡uåTãGøƒ)m¥ Nj9ü4vÏ-AfÛíç\Æñ⁄f˛ë$%)
®1uRæ#ºµ>ﬁz<#w´Iæˇ¨I+$CŸò0»iêu:T8-^XDêΩ5√{ âØc¢aÀæËs4˜os–vX¶1§*ÂLi-∫8™Ô¨Œ*ÅDâ[\8çCæÙºR”¯ÀI{œ3. ˜Äã·ÏvgÖáÏnÌbX˜Sı>xî©öóú≥g!óÛÕi‹Ãzﬁi√¸ÔΩÆûÎÀ∂‚^≤å‘àÕ¨‡ìŸdÊIÛ˛Ω≤€B˚`ÏFr◊fÊu©-.≤›L&gïﬁ ûÿ3ÿ?U§#sÛvÁã-}ÍÃ∑#?wG∏CÃs¯88”¶=Ù∏¸OkçÿôÃ%Ÿ¨Ú9eûÊT	M8\vÖ.C?zÆò˙ CF«ïøÅ∞$5õ∆àIu_E2†tzﬂÕ¥ıI”Ij1⁄]üÄÈ-k´ôª$Ü°íì6µÎd#<},8SäÁ…oâL«s=≠g~Ê∆N^]‰/€¶z¡ªK_É‘@ó> ±Ÿn˜nÌ¨Ü°nzelºB£ø“˛º”dO@–jÂ¥”ë[i∂ıéü£˜ˆØ>•ß⁄E∫"# ¸±Êøç5≠?R\G˚…éGd⁄âú¯·˝$:†ªØÔX4!˝T|\Ù™Lgœà(∆»˝åtØw§ û∏‰≠/ÉWõéƒu¨öU¬z∆ﬁOâ/7≠¢Ü∫≈⁄WÕÒç’`„≤2∆ t›.o¨Â”3Fƒ9≈∂ö˜≤á¯›À;∫á„˙Î"¬e-<·]ÿ5€O∑ıUr_ô≠°?M€É+∑^¯L¥VûqÔπ”üªêÉ€=ﬁÖpÌöŒ™¬;∆CEª&ÿëàHk⁄åëÚz?Dº›{
% ∞*Ô∏ß›C—ARÎáU«s Ø[I∞`ÊMhäÆ*±Fñ˚&èBOëô&Gp’€‚˝Í∆ˇ˘Î†ƒEôo‚πß∏êÕì–¿gÕ–·oAé*LG‡í@9∫œINyx±€∂K¬iΩ*öwè[w–O÷N«æ•ì∂’á»îÙÈ≈`Pfº“»?∞qHöØÔ3CM}Á*ˆÆVC) ˇ?´˘&MÈm˚ß©¶œ¨‰:JÈj|™sß≈w~tÛãÕÈû∂ãóKäÒ6»;^ ÅËV"eO4ºﬁ6àêÂäxd˚1*\.˚ã¿‘˘Êhê¢xÄ¨XZÉπ∂gŸøöªÀıBlZœTÿ¢ÂM%¡c&à6ÍT.ì}qlîAŒßGHı√È“±äUwÖjÙjéÀ'Ûw#fªr‘±¶©i∏JP«&aÏÃ˘ª_ÍW∆©b„ü‚$TöMœá¢π¨=Ÿ7úRsÓ!íØ±ˆß˛:†´âSékÚ1®°—êxgB¸∂÷N/9wô/¸vVdﬂ0÷Fá∫SﬂP»©Øàv¥9πÃA√\•∞¸è∏Á8„	"¨v ˚àQY9›J?Ô©i#ﬂL”“î∆0¡ôv…G~]5¿ÿÂ8ú8 qã¸ô1±Ê´âÒÿÎÁY‰≤ì	pÓ[;Pü¯?Î⁄/s˛
ƒÙ˝Éñ‡‡‡c$2Ôó¨,"‘&"È7Å¿˝[œ]ÚSe0†9œú{ªÅÍ)4ÊfT¯›<eRÖÈ…!qqE©°<ˆÊ“⁄Gú¿ü¶≤˝¸9Tº˛@;7˜ T”bm@≈AÏó≠9òóåü’»\V∫•4¸8=bãî^Ê&
ñíîÜÑÉ!‘KÄ7<ìÍgÎ…˛»™VY{%´—ù7rgôî∞fAÙ;ıBŸb.qÂ¥ΩŒG∞“√J+)Ø⁄3˝‰(f°Ëùˇ°0œs…®\'¢ãT  wµ WYÃ\*ä$l 0R‘ò‰≥ÿJ(ójæ›ÅŒ=£ïux*]çÜa&Ä9A≈Ï–]¨€ó0Ö:{A≤Seêó§ñó∞≈;Å¯&p”?]™C£o]bè√ÿ.[¥íJZd*í<Xí¬L¬COnŒ‘ÛÏÑm6k~™.˚∞…Ú‚ãTˇÄI£s¬÷êR‡§œEï¡•p+°…^ûº0MK°w◊Äp´∂Ê.DúU˙G˜Ñ8Pâ›"Nº/[HnÄ‹Ås⁄tqì‚ò_&–<‘’5-0ùù««kêbì˝ﬂä¸…Ê∆jT∏«!hΩ:∏p+≤(≈ ﬁÖÚä°π¡‹p¶·û†ÿºûò÷x„fè˚w¥&ZËÚ,H∏„|«F•∏ÂEjÑ
Ë‰5Ãˆ†≤Ñç$÷Q-ˇ%3Ù¿bÍfÜ;À{)AsÑ∏HÃú(h1LÆö0ë	8„V=’ö€é›«¶ø! $¸°Ï˛1ˇ´ ¯Opî†!ªıwìUıé=HêdØ»@;π+˙â/`
ÑAA±EÀTïòI"ﬁF*Ø≤Õ˘úÁ,ì1,âÎ‰ôög∞“9ÿ^∂:C_HKIÂ+Ó≥ÌVh}ﬂü<«–∏q+_–À—nP3!µ=r>L*ÓXs¿ü*¡ö¶∏Âˆµ™érUª1±Ììb–H¯.!YË&˙¶sÃi'± µH/Õç1"}qDñ`«¯‘	Î˜ﬁ‘ê‘ŒKâ7Ñ}g4<∏J+“CÇ– oŸØ`3§}án˙‡∂§hJQºJ‹Õ«W·[(p¡+ÒeÀº7˚*∆Õ"◊ó–!dGt*Nº6<–ôπ'•A’@íûó⁄-Ftó¯Ä–4/„¬Âˆﬂl·—¥§)îoé∑ä6,(πÈ;Q»mÊ<Ã}m+w(®VñØΩJûEÕá›«⁄%ÓÂzØ≈¶É}1wCïª*VnQ◊º8b¨PﬂXˆL™à‚I–§∫áªßM#‚r¡î&»!´!ôÜ0GY5;∏rÖˇ∞ß≈M›Wõ–~…*¥  oïûÎ÷Q_3=âÇœ∏„Nç¶Ñìo^®õ÷çˇohÖ"I÷fáœÙ∏ÍìˇL-Â8tçï/æN~îı0Ô"å˜≤Øú#1ç˜â†%ä
m∆¬∏ú7+poH†oäg |Êeõï∑fà=Y:Ô#ê„ÌiFB‰ÂÄçÌå o∂àΩÕ EFàË"ÈñÇ¸î¬M¡A?ÉÄæ¶≠©PªxêN«Û≈4l∞»”6sôg÷y%ÿÆˆ…çc¿¥Øú|òÚJ1–Kë≠5√åKFãAﬂi `ézáÉ¯xùë¯m¡I¢
¶ù é„˛ÍR<ó*j2	ºº«æ◊	÷Å:®k
òî•Ç\?∞ôzrBcN.3⁄/œ-7∏Ü>~	?ØwMH“§ #`e‚∂ôâÏ€T_ø"qcî◊/ôÈC·∑a{Ø÷‘ábpùnŒb•|ÆsÇµ˝áO(4Ô8ÄÍ¨#XòÅjô√å˙ Å≠^∫lã`úWL B⁄ò˚¯ ⁄v4Ö?˛Õaé7a©L≠å™◊ZÑTU•”Ω4Ö·=Æ“H’3å&G£eÂŒ˝»˙˝¬º•Rˆà=’†Ω9ó#gΩy[MˇpLµE(Òï&É€ÉÃb•ØÖ"~B}—QΩø˝†ålŸÕ3Âj
æø©h∫¶Y£Dâ“…L!¶£‰g“ú!¡{6“ÒçE±6J≈dD:è9jxïŒ%YÜΩ^‹Aï›£Rµ:òÿBf;âÊÌ}˜wU[pf5ÖÏÓ¯[	«ãØjÂ∞L@™7ï≠∂z3÷W "Qp>Ñ¬í˘øöß
	ˇ™ÆÈ \ÂLm	`è™ä≥eÓÒÑ™ü;“~©≤RM3¥Á‡Œ<•w€é§;)”Z {z^Æº2fÙ8√†'gæl€gı¡Ó-1ﬂy6¶QÊº5fGaaGﬁW∆ÄËl“ªå É9üO2´2√¥ï1ì=»ã≥(”≠˝ÓÉX&›&Ë≥„¯êiZ»{(!Áy
cª“?@ OX£æ4Gˆ4®3 [(üÄ]Ñœ?÷ëÜˆY;yep—                   const fallback = listings.find((entry) => {
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
                      <span className="la-facilities-group__icon">‚úì</span>
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
            return <p>Loading house rules‚Ä¶</p>;
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
            {(() => {
              const coords = listingMapTarget?.coords || getListingCoords(activeListing);
              const address = listingMapTarget?.address || getListingAddressQuery(activeListing);
              const mapEmbedUrl = coords
                ? `https://www.google.com/maps?q=${encodeURIComponent(
                  `${coords.lat},${coords.lng}`
                )}&z=15&output=embed`
                : address
                  ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&z=15&output=embed`
                  : "";
              return mapEmbedUrl ? (
                <iframe
                  title="Interactive Google Map"
                  className="la-map-modal__canvas"
                  src={mapEmbedUrl}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              ) : (
                <div className="la-unit-modal__placeholder">Map loading</div>
              );
            })()}
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
              aria-label="Interactive Google Map"
            />
          </div>
        </div>,
        mapPortalTarget
      )
    : null;

  if (isListingRoute) {
    return (
      <div className="antwerp-page has-silk">
        <div className="antwerp-silk">
          <Silk speed={4.5} scale={1.1} color="#b5a291" noiseIntensity={1.2} rotation={0.15} />
        </div>
        {listingDetail ? (
          <div className="antwerp-modal__overlay is-page">{listingDetail}</div>
        ) : (
          <LoadingScreen active lottieSrc={CITY_LOADING_LOTTIE_SRC} />
        )}
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
      {/* <section className="la-bounce-section" aria-label="Antwerp highlights">
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
            <h2 className="la-bounce-section__title">Antwerp moments in motion</h2>
            <p className="la-bounce-section__lede">
              A quick visual pulse before you dive into neighborhoods, amenities, and live pricing.
            </p>
            <div className="la-bounce-section__actions">
              <a className="la-bounce-section__cta" href="#antwerp-units">
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
          <span className="antwerp-kicker">OneLuxStay / Antwerp, Belgium</span>
          <h1 className="antwerp-title">Antwerp collection</h1>
          <p className="antwerp-lede">
            A curated landing page built directly from live listing data. Every detail below mirrors what is available
            right now for Antwerp units.
          </p>
          <div className="antwerp-hero__actions">
            <a href="#la-city-tour" className="antwerp-cta">
              Browse tours
            </a>
            <a href="#antwerp-units" className="antwerp-ghost">
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
                    {review.name} ¬∑ {review.source}
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
                ‚Üê
              </button>
              <button
                type="button"
                className="la-review-ticker__btn"
                onClick={() => scrollReviewCarousel(1)}
                aria-label="Next review"
              >
                ‚Üí
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
        <div className="antwerp-hero__carousel" aria-label="Antwerp hero images">
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
                Antwerp imagery loading
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
        <section id="la-city-tour" className="la-city-tour" aria-label="Antwerp city tours">
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
                <h2>Antwerp city tours</h2>
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

        <section className="antwerp-section" id="antwerp-units">
          <div className="la-units-layout">
            <div className="la-units-main">
              <div className="antwerp-section__head">
                <div>
                  <p className="antwerp-kicker">Available now</p>
                  <h2>Antwerp buildings</h2>
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
                  No Antwerp listings are available in the current response.
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
                  pushStoryImage(listing.picture);
                  (listing.pictures || []).forEach(pushStoryImage);
                });
                storyImages.splice(1);
                const groupStats = getGroupStats(group.listings);
                const buildingPrice = buildingPrices[group.key];
                const latestPrice = buildingPrice
                  ? formatCurrency(buildingPrice.total, buildingPrice.currency)
                  : null;
                const sectionTitle = (() => {
                  switch (group.key) {
                    case "antwerp-diamond":
                      return "One Lux Stay Diamond District";
                    case "antwerp-fashion":
                      return "One Lux Stay Fashion District";
                    case "antwerp-central":
                      return "One Lux Stay Antwerp Central";
                    case "antwerp-city-centre":
                      return "One Lux Stay City Centre";
                    case "antwerp-near-central":
                      return "One Lux Stay Near Central Station";
                    case "other":
                      return "One Lux Stay City Centre";
                    default:
                      return "One Lux Stay City Centre";
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
                  See nearby landmarks and public transport around Antwerp neighborhoods.
                </p>
                {!isMapEnabled ? (
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
                    aria-label="Google map showing Antwerp with nearby landmarks and public transport"
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
                onClick={() => setActiveSectionKey(null)}
              >
                Back to destinations
              </button>
              <div>
                <p className="la-section-modal__tag">Available now</p>
                <h3>{(() => {
                  switch (activeSection.key) {
                    case "antwerp-diamond":
                      return "One Lux Stay Diamond District";
                    case "antwerp-fashion":
                      return "One Lux Stay Fashion District";
                    case "antwerp-central":
                      return "One Lux Stay Antwerp Central";
                    case "antwerp-city-centre":
                      return "One Lux Stay City Centre";
                    case "antwerp-near-central":
                      return "One Lux Stay Near Central Station";
                    case "other":
                      return "City Centre";
                    default:
                      return `One Lux Stay ${activeSection.label}`;
                  }
                })()}</h3>
                <p className="la-section-modal__subtitle">
                  {(() => {
                    const parentGroups = groupListingsByParent(activeSection.listings);
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
                .flatMap((listing) => [
                  getImageUrl(listing.picture),
                  ...(Array.isArray(listing.pictures)
                    ? listing.pictures.map((pic) => getImageUrl(pic))
                    : []),
                ])
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
              const mapUrl =
                coords && mapsApiKey
                  ? `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=13&size=520x320&maptype=roadmap&markers=color:0x1f1c19|${coords.lat},${coords.lng}&key=${mapsApiKey}`
                  : "";
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
                      <strong>OneLuxStay Antwerp</strong>
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
                        const reviewsLink = GOOGLE_REVIEW_LINKS[activeSection.key];
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
                      {coords ? (
                        <iframe
                          title="Building location map"
                          src={`https://www.google.com/maps?q=${encodeURIComponent(
                            `${coords.lat},${coords.lng}`
                          )}&z=14&output=embed`}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          allowFullScreen
                        />
                      ) : addressQuery ? (
                        <iframe
                          title="Building location map"
                          src={`https://www.google.com/maps?q=${encodeURIComponent(addressQuery)}&z=14&output=embed`}
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
                    <button type="button" className="la-unit-modal__booking-cta" onClick={fetchAvailabilityListings}>
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
                      const listingPath = listingPathId ? buildListingPath(listingPathId) : "/antwerp";
                      const image = getImageUrl(listing.picture) || getImageUrl(listing.pictures?.[0]);
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
                                <p className="la-booking-table__address">{formatAddress(listing)}</p>
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
                                  <span>We‚Äôll confirm rates & availability.</span>
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
                                    if (!checkoutGuest.firstName || !checkoutGuest.lastName || !checkoutGuest.email) {
                                      setPendingCheckout({
                                        listingId: checkoutListingId,
                                        listingTitle: listing.title,
                                        amount: typeof total === "number" ? total : null,
                                        currency: priceCurrency,
                                        breakdown: selectedPlan?.breakdown || null,
                                      });
                                      setCheckoutGuestError("");
                                      setIsCheckoutGuestOpen(true);
                                      return;
                                    }
                                    handleSectionCheckout({
                                      listingId: checkoutListingId,
                                      listingTitle: listing.title,
                                      amount: typeof total === "number" ? total : null,
                                      currency: priceCurrency,
                                      breakdown: selectedPlan?.breakdown || null,
                                      guest: checkoutGuest,
                                    });
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

      {isInquiryOpen && (
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
      )}

      {isCheckoutGuestOpen && (
        <div
          className="antwerp-modal__overlay"
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
                  src={LOGO_URL}
                  alt="OneLuxStay logo"
                  loading="lazy"
                  className="la-inquiry-modal__logo"
                  onError={handleImageError}
                />
                <div>
                  <p className="la-inquiry-modal__kicker">Guest details</p>
                  <h3>Tell us who‚Äôs booking</h3>
                  <p className="la-inquiry-modal__meta">We‚Äôll use this to create the reservation after payment.</p>
                </div>
              </div>
              <button
                type="button"
                className="la-inquiry-modal__close"
                onClick={() => setIsCheckoutGuestOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="la-inquiry-modal__body">
              <Stepper
                initialStep={1}
                onStepChange={(step) => setCheckoutStep(step)}
                onFinalStepCompleted={confirmGuestCheckout}
                disableStepIndicators
                nextButtonText="Next"
                finalButtonText="Continue to payment"
                nextButtonProps={{
                  disabled:
                    (checkoutStep === 1 && !isCheckoutGuestValid) ||
                    (checkoutStep === 2 && !checkoutConsentAccepted),
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
                    <label className="la-inquiry-modal__field">
                      <span>Phone (optional)</span>
                      <input
                        type="tel"
                        value={checkoutGuest.phone}
                        autoComplete="tel"
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
                    <label className="la-inquiry-modal__consent">
                      <input
                        type="checkbox"
                        checked={checkoutConsentAccepted}
                        onChange={(event) => setCheckoutConsentAccepted(event.target.checked)}
                      />
                      <span>
                        By continuing to payment, you authorize OneLuxStay to charge the total amount
                        shown for your reservation. A receipt will be emailed to you.
                      </span>
                    </label>
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
                      {checkoutGuest.phone && (
                        <div>
                          <strong>Phone</strong>
                          <span>{checkoutGuest.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Step>
              </Stepper>
            </div>
          </div>
        </div>
      )}

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
                    navigate("/antwerp");
                  }
                }}
              >
                Back to listings
              </button>
              <div className="la-unit-modal__contact" aria-label="Reservation contact">
                <p>For Reservation Contact</p>
                <strong>OneLuxStay Antwerp</strong>
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
                <h3>{sanitizeText(activeListing.title)}</h3>
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
              const mapUrl =
                coords && mapsApiKey
                  ? `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=14&size=480x280&maptype=roadmap&markers=color:0x1f1c19|${coords.lat},${coords.lng}&key=${mapsApiKey}`
                  : "";
              const mapEmbedUrl = coords
                ? `https://www.google.com/maps?q=${encodeURIComponent(
                  `${coords.lat},${coords.lng}`
                )}&z=15&output=embed`
                : addressQuery
                  ? `https://www.google.com/maps?q=${encodeURIComponent(addressQuery)}&z=15&output=embed`
                : "";
              const amenityListRaw = Array.isArray(activeListing.amenities)
                ? activeListing.amenities
                : [];
              const amenityList = [...new Set(amenityListRaw.filter((item) => typeof item === "string"))];
              const aboutText = formatFullDescription(activeListing);
              const isFeaturedUnit = getBuildingKey(activeListing) === BUILDING_GROUPS[0]?.key;
              const popularFacilities = isFeaturedUnit
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
              const plan = quote?.plans?.[0] || quote?.plan || quote?.pricing || null;
              const breakdown = plan?.breakdown || quote?.breakdown || quote?.pricing?.breakdown || null;
              const priceCurrency = quote?.currency || activeListing.currency || "USD";
              const totalPrice =
                breakdown?.total ??
                breakdown?.subtotal ??
                plan?.total ??
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
                                  if (!checkoutGuest.firstName || !checkoutGuest.lastName || !checkoutGuest.email) {
                                    setPendingCheckout({
                                      listingId,
                                      listingTitle: activeListing.title,
                                      amount: typeof totalPrice === "number" ? totalPrice : null,
                                      currency: priceCurrency,
                                      breakdown: breakdown || null,
                                    });
                                    setCheckoutGuestError("");
                                    setIsCheckoutGuestOpen(true);
                                    return;
                                  }
                                  handleSectionCheckout({
                                    listingId,
                                    listingTitle: activeListing.title,
                                    amount: typeof totalPrice === "number" ? totalPrice : null,
                                    currency: priceCurrency,
                                    breakdown: breakdown || null,
                                    guest: checkoutGuest,
                                  });
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
              <button type="button" onClick={fetchAvailabilityListings}>
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
                      ‚Üê
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
                      ‚Üí
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

