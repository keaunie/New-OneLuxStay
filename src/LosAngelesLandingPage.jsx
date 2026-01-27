import { useEffect, useMemo, useRef, useState, useId } from "react";
import { Link } from "react-router-dom";
import "./App.css";
import reviewsHwh from "./data/reviews-hwh.json";
import reviewsHollywood from "./data/reviews-hollywood.json";
import reviewsDodger from "./data/reviews-dodger.json";
import CardSwap, { Card } from "./components/CardSwap";

const rawApiBase = import.meta.env.VITE_API_BASE || "/.netlify/functions";
const apiBase = rawApiBase.replace(/\/index\/?$/, "");
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
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
let mapsScriptPromise;

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
  const minNights =
    listing?.terms?.minNights ??
    listing?.terms?.minimumStay ??
    listing?.terms?.minStay ??
    listing?.terms?.minStayLength ??
    null;
  return typeof minNights === "number" && minNights > 1 ? minNights : null;
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
    if (nextStart && nextEnd) setOpenState(false);
  };

  const selectedNights = diffNights(value.checkIn, value.checkOut);
  const selectedMinNights = useMemo(() => {
    if (!dayPrices || !startDate) return fallbackMinNights ?? null;
    const iso = toISODate(startDate);
    const info = dayPrices.get(iso);
    const minNights = info?.restrictions?.minNights ?? fallbackMinNights ?? null;
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
                      const minNights =
                        priceInfo?.restrictions?.minNights ?? fallbackMinNights ?? null;
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
            {selectedMinNights &&
              selectedNights > 0 &&
              selectedNights < selectedMinNights && (
                <div className="la-date-alert" role="alert">
                  A {selectedMinNights}-night minimum stay applies to this rate. Please adjust your booking to continue.
                </div>
              )}
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
    const taxesFromQuote =
      quoteMoney?.totalTaxes ??
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
      taxesFromQuote ??
      breakdown?.taxes ??
      0;
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
];
const EXCLUDED_CITIES = ["redondo beach", "miami", "dubai", "antwerp", "antwerpen"];

const sanitizeText = (value = "") => {
  if (typeof value !== "string") return "";
  return value
    .replace(/\uFFFD/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
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

const formatAddress = (listing) => {
  const address = listing.address || {};
  const parts = [address.full, address.city, address.country].filter(Boolean);
  if (parts.length) return sanitizeText(parts.join(", "));
  if (typeof listing.location === "string") return sanitizeText(listing.location);
  return "Los Angeles";
};

const formatDescription = (value) => {
  if (!value) return "";
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "object") {
    return sanitizeText(value.summary || value.description || value.text || "");
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

const getReviewStats = (reviews) => {
  if (!reviews) return { rating: null, count: null };
  if (Array.isArray(reviews)) return { rating: null, count: reviews.length };
  if (typeof reviews === "object") {
    const count = reviews.count || reviews.total || reviews.numberOfReviews || null;
    const rating = reviews.rating || reviews.score || reviews.average || null;
    return { rating, count };
  }
  return { rating: null, count: null };
};

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(num) ? num : null;
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
    title: "Chinatown",
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

const STAR_TOTAL = 5;
const REVIEW_TICKER = [...reviewsHwh, ...reviewsHollywood, ...reviewsDodger];
const SECTION_REVIEWS = {
  "la-hwh": reviewsHwh,
  "la-hollywood": reviewsHollywood,
  "la-downtown": [],
  other: reviewsDodger,
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

const isLosAngelesListing = (listing) => {
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
        "https://images.unsplash.com/photo-1576260243040-0231b2cd4c1f?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      title: "Icons After Dark",
      subtitle: "Marquee lights and the legendary walk.",
      copy:
        "Move from neon marquees to velvet lounges with a curated night plan. Classic Hollywood icons glow brighter when you arrive with a reserved table.",
      highlights: ["Walk of Fame", "The Annex", "Roosevelt Hotel"],
      image:
        "https://images.unsplash.com/photo-1517983079452-bbaa6a081a6b?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      title: "Finale in Lights",
      subtitle: "Private screenings and the city at your pace.",
      copy:
        "Close the tour with a private screening, late-night city views, and the assurance that your next stay is already curated.",
      highlights: ["Private screening", "Skyline lounge", "Concierge on call"],
      image:
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80",
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
        "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Night Market Stroll",
      subtitle: "Street food and neon rhythm.",
      copy:
        "Move from open-air stalls to tucked-away speakeasies. The city hums while lanterns guide the night.",
      highlights: ["Night market", "Street dining", "Lantern walk"],
      image:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Heritage + Art",
      subtitle: "Temple calm and gallery light.",
      copy:
        "Spend the afternoon between heritage landmarks and contemporary galleries, then end with rooftop views back toward DTLA.",
      highlights: ["Heritage temples", "Gallery row", "Rooftop views"],
      image:
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=2000&q=80",
    },
  ],
  "Downtown Los Angeles": [
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
      title: "Market District",
      subtitle: "Historic stalls and late-night bites.",
      copy:
        "Taste your way through Grand Central Market before an easy stroll through the historic core.",
      highlights: ["Grand Central Market", "Bradbury Building", "Spring Street"],
      image:
        "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Arts + Views",
      subtitle: "Museums, gardens, and quiet overlooks.",
      copy:
        "Reset with a museum afternoon and golden hour above the city.",
      highlights: ["MOCA", "Grand Park", "Vista points"],
      image:
        "https://images.unsplash.com/photo-1526481280695-3c687fd643ed?auto=format&fit=crop&w=2000&q=80",
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
    listing.nickname,
    listing.timezone,
  ].filter(Boolean);
  return fallback.length ? `Details: ${fallback.join(" | ")}` : "No description available.";
};

export default function LosAngelesLandingPage() {
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
  const [checkoutGuest, setCheckoutGuest] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [checkoutGuestError, setCheckoutGuestError] = useState("");
  const [isCheckoutGuestOpen, setIsCheckoutGuestOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(null);
  const [sectionHeroIndex, setSectionHeroIndex] = useState(0);
  const heroCarouselRef = useRef(null);
  const reviewCarouselRef = useRef(null);
  const [sectionQuotes, setSectionQuotes] = useState({});
  const [selectedRatePlans, setSelectedRatePlans] = useState({});
  const [expandedQuoteRows, setExpandedQuoteRows] = useState({});
  const [buildingPrices, setBuildingPrices] = useState({});
  const [calendarPrices, setCalendarPrices] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
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
  const [isListingCalendarOpen, setIsListingCalendarOpen] = useState(false);
  const calendarInflightRef = useRef({});
  const [sectionCalendarPrices, setSectionCalendarPrices] = useState(null);
  const [sectionCalendarLoading, setSectionCalendarLoading] = useState(false);
  const [sectionCalendarError, setSectionCalendarError] = useState("");
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
  const autoScrollRef = useRef(null);
  const thumbsRef = useRef(null);
  const sectionThumbsRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapsApiRef = useRef(null);
  const listingMarkersRef = useRef([]);
  const listingInfoRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const losAngelesListingsRef = useRef([]);
  const [isMapEnabled, setIsMapEnabled] = useState(false);

  const activeAmenityList = useMemo(() => {
    if (!activeListing) return [];
    const amenityListRaw = Array.isArray(activeListing.amenities)
      ? activeListing.amenities
      : Array.isArray(activeListing.tags)
        ? activeListing.tags
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
    const listingId = activeListing.unitTypeId || activeListing.id || activeListing._id;
    if (!listingId) return;
    const monthBase = new Date(calendarStartDate);
    monthBase.setMonth(monthBase.getMonth() + calendarMonthIndex);
    const monthStart = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1);
    fetchCalendarMonth(
      listingId,
      monthStart,
      calendarCacheRef,
      calendarDaysRef,
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

  const handleSectionThumbsMove = (event) => {
    if (!sectionThumbsRef.current) return;
    const rect = sectionThumbsRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const edge = rect.width * 0.2;
    if (x > rect.width - edge) {
      startAutoScroll(1);
    } else if (x < edge) {
      startAutoScroll(-1);
    } else {
      stopAutoScroll();
    }
  };

  useEffect(() => stopAutoScroll, []);

  useEffect(() => {
    if (!activeListing) {
      stopAutoScroll();
      setActiveImageIndex(0);
      return;
    }
    setSectionCheckIn("");
    setSectionCheckOut("");
  }, [activeListing]);

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
      setSectionCheckIn("");
      setSectionCheckOut("");
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
    }
  }, [activeSectionKey]);


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

  useEffect(() => {
    if (!listings.length) return;
    const targetId = "66e1e3875a1f6300d736f28e";
    const match = listings.find((listing) => (listing.id || listing._id) === targetId);
    if (match) {
      console.log("[LA debug] listing match", match);
    } else {
      console.log("[LA debug] listing not found for id", targetId);
    }
  }, [listings]);

  useEffect(() => {
    if (!isMapEnabled) return;
    if (!mapRef.current || mapLoadedRef.current || !mapsApiKey) return;
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
              zoom: 15,
              gestureHandling: "greedy",
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
          })
          .catch((err) => {
            console.error(err);
          });
      },
      { threshold: 0.25 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const losAngelesListings = useMemo(() => {
    return listings.filter((listing) => {
      return isLosAngelesListing(listing);
    });
  }, [listings, isMapEnabled, mapsApiKey]);

  const syncListingMarkers = (listingsToUse = losAngelesListingsRef.current) => {
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
    listingsToUse.forEach((listing) => {
      const coords = getListingCoords(listing);
      if (!coords) return;
      const title = listing.title || listing.nickname || "OneLuxStay";
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
      marker.addListener("click", () => {
        const content = `
          <div>
            <strong>${escapeHtml(title)}</strong><br />
            ${escapeHtml(formatAddress(listing))}
          </div>`;
        infoWindow.setContent(content);
        infoWindow.open(map, marker);
      });
      listingMarkersRef.current.push(backgroundMarker, marker);
      bounds.extend(coords);
      hasBounds = true;
    });

    if (hasBounds) {
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

  const groupedListings = useMemo(() => {
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
      ordered.push({ key: "other", label: "Chinatown", listings: other });
    }
    return ordered.filter((group) => group.listings.length);
  }, [losAngelesListings]);

  const sectionsByKey = useMemo(() => {
    return groupedListings.reduce((acc, group) => {
      acc[group.key] = group;
      return acc;
    }, {});
  }, [groupedListings]);

  const activeSection = activeSectionKey ? sectionsByKey[activeSectionKey] : null;
  const listingMinNightsFallback = useMemo(() => getListingMinNights(activeListing), [activeListing]);
  const sectionMinNightsFallback = useMemo(() => {
    if (!activeSection?.listings?.length) return null;
    const values = activeSection.listings
      .map((listing) => getListingMinNights(listing))
      .filter((value) => typeof value === "number");
    return values.length ? Math.max(...values) : null;
  }, [activeSection]);

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
    const key = `${listingId}-${monthKey(targetDate)}`;
    if (cacheRef.current[key]) return;
    if (calendarGlobalCacheRef.current[key]) {
      cacheRef.current[key] = true;
      const sharedDays = calendarGlobalDaysRef.current[listingId];
      if (sharedDays) {
        daysRef.current[listingId] = { ...(daysRef.current[listingId] || {}), ...sharedDays };
        setPrices(buildCalendarPayload(daysRef.current[listingId]));
      }
      return;
    }
    if (inflightRef.current[key]) return;
    if (calendarGlobalInflightRef.current[key]) return;
    inflightRef.current[key] = true;
    calendarGlobalInflightRef.current[key] = true;
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
      const res = await fetch(`${apiBase}/api/listings/${listingId}/calendar-prices?${qs}`);
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
    } catch (err) {
      setError(err?.message || "Calendar pricing is unavailable.");
    } finally {
      setLoading(false);
      inflightRef.current[key] = false;
      calendarGlobalInflightRef.current[key] = false;
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
    if (!isSectionCalendarOpen) return;
  }, [activeSection, isSectionCalendarOpen]);

  useEffect(() => {
    if (!groupedListings.length || !sectionCheckIn || !sectionCheckOut) {
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
          const taxAmount =
            typeof money?.totalTaxes === "number" ? money.totalTaxes : 0;
          const discountedAccommodation =
            accommodationAmount > 0 ? accommodationAmount * (1 - discountRate) : accommodationAmount;
          const total = discountedAccommodation + cleaningAmount + taxAmount;
          if (minTotal === null || total < minTotal) {
            minTotal = total;
          }
        });
        return { total: minTotal };
      };

      const requests = groupedListings
        .slice(0, 3)
        .map((group) => {
          const listing = group.listings[0];
          const listingId = listing?.unitTypeId || listing?.id || listing?._id;
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
        const res = await fetch(`${apiBase}/api/reservations/quotes-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });
        if (!res.ok) return;
        const quoteJson = await res.json();
        const resultMap = quoteJson?.results || {};
        groupedListings.slice(0, 3).forEach((group) => {
          const listing = group.listings[0];
          const listingId = listing?.unitTypeId || listing?.id || listing?._id;
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
  }, [groupedListings, sectionCheckIn, sectionCheckOut]);
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

  const fetchAvailabilityListings = async () => {
    if (!activeSection) return;
    if (!sectionCheckIn || !sectionCheckOut) {
      setSectionAvailabilityError("Select check-in and check-out dates first.");
      return;
    }
    setSectionAvailabilityLoading(true);
    setSectionAvailabilityError("");
    try {
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const items = activeSection.listings
        .map((listing) => listing.id || listing._id)
        .filter(Boolean);
      const nights = diffNights(sectionCheckIn, sectionCheckOut);
      const qs = new URLSearchParams({
        ids: items.join(","),
        startDate: sectionCheckIn,
        endDate: sectionCheckOut,
        minOccupancy: sectionGuests || "1",
      }).toString();
      const bulkRes = await fetch(`${apiBase}/api/listings/availability-bulk?${qs}`, {
        cache: "no-store",
      });
      if (!bulkRes.ok) {
        const errText = await bulkRes.text().catch(() => "");
        throw new Error(errText || "Availability failed");
      }
      const bulkJson = await bulkRes.json();
      const checks = Array.isArray(bulkJson?.results) ? bulkJson.results : [];
      const availableIds = new Set(checks.filter((item) => item.available).map((item) => item.id));
      const availabilityMap = checks.reduce((acc, item) => {
        acc[item.id] = item.available;
        return acc;
      }, {});
      const availableListings = activeSection.listings.filter((listing) =>
        availableIds.has(listing.id || listing._id)
      );
      setSectionAvailability(availableListings);
      setSectionAvailabilityMap(availabilityMap);
      setSectionAvailabilityActive(true);

      const quoteRequests = availableListings
        .map((listing) => {
          const quoteListingId = listing.unitTypeId || listing.id || listing._id;
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
        const res = await fetch(`${apiBase}/api/reservations/quotes-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: quoteRequests }),
        });
        if (res.ok) {
          const data = await res.json();
          const quotes = {};
          availableListings.forEach((listing) => {
            const listingKey = listing.id || listing._id;
            const quoteListingId = listing.unitTypeId || listing.id || listing._id;
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
    } catch (err) {
      setSectionAvailabilityError(err.message || "Unable to load availability.");
    } finally {
      setSectionAvailabilityLoading(false);
    }
  };

  const handleSectionCheckout = async ({ listingId, listingTitle, amount, currency, guest }) => {
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
      const res = await fetch(`${apiBase}/api/checkout`, {
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
    const payload = { ...pendingCheckout, guest: checkoutGuest };
    setPendingCheckout(null);
    handleSectionCheckout(payload);
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
  const inquiryTitle = inquiryListing?.title ? sanitizeText(inquiryListing.title) : "this unit";
  const inquiryDates =
    sectionCheckIn && sectionCheckOut ? `${sectionCheckIn} to ${sectionCheckOut}` : "";
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
    const basePrices = losAngelesListings.map((l) => l.basePrice);
    const cleaningFees = losAngelesListings.map((l) => l.cleaningFee);
    const bedrooms = losAngelesListings.map((l) => l.bedrooms);
    const bathrooms = losAngelesListings.map((l) => l.bathrooms);
    const sleeps = losAngelesListings.map((l) => l.accommodates);
    const currencies = new Set(losAngelesListings.map((l) => l.currency).filter(Boolean));
    const propertyTypes = new Set(losAngelesListings.map((l) => l.propertyType).filter(Boolean));

    return {
      units: losAngelesListings.length,
      nightly: rangeLabel(basePrices),
      cleaning: rangeLabel(cleaningFees),
      bedrooms: rangeLabel(bedrooms),
      bathrooms: rangeLabel(bathrooms),
      sleeps: rangeLabel(sleeps),
      currency: currencies.size === 1 ? [...currencies][0] : "Multiple",
      propertyCount: propertyTypes.size || 0,
    };
  }, [losAngelesListings]);

  const tourSlides = CITY_TOUR_SLIDES[tourCity] || [];
  const tourCount = tourSlides.length;
  const activeTourSlide = tourSlides[tourIndex] || tourSlides[0];

  const goToTour = (index) => {
    if (!tourCount) return;
    const next = (index + tourCount) % tourCount;
    setTourIndex(next);
  };

  useEffect(() => {
    if (!showCityTour || tourPaused || tourCount < 2) return;
    const id = setInterval(() => {
      setTourIndex((prev) => (prev + 1) % tourCount);
    }, 7000);
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

  return (
    <div className="antwerp-page">
      <header className="antwerp-hero">
        <div className="antwerp-hero__content">
          <span className="antwerp-kicker">OneLuxStay / Los Angeles, California</span>
          <h1 className="antwerp-title">Los Angeles collection</h1>
          <p className="antwerp-lede">
            A curated landing page built directly from live listing data. Every detail below mirrors what is available
            right now for Los Angeles units.
          </p>
          <div className="antwerp-hero__actions">
            <Link to="/stay" className="antwerp-cta">
              Browse all available units
            </Link>
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
                    {review.name} · {review.source}
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
                ←
              </button>
              <button
                type="button"
                className="la-review-ticker__btn"
                onClick={() => scrollReviewCarousel(1)}
                aria-label="Next review"
              >
                →
              </button>
            </div>
          </div>
        </div>
        <div className="antwerp-hero__media">
          <div className="la-hero-card-swap" aria-hidden="true">
            <CardSwap
              width="100%"
              height="100%"
              cardDistance={64}
              verticalDistance={70}
              delay={2000}
              skewAmount={5}
              pauseOnHover
            >
              {heroImages.length ? (
                heroImages.map((src, idx) => (
                  <Card key={`${src}-${idx}`} customClass="la-hero-swap-card" aria-hidden="true">
                    <img
                      src={src}
                      alt=""
                      className="la-hero-swap-img"
                      loading={idx === 0 ? "eager" : "lazy"}
                      aria-hidden="true"
                    />
                  </Card>
                ))
              ) : (
                <Card className="la-hero-swap-card la-hero-swap-card--empty" aria-hidden="true" />
              )}
            </CardSwap>
          </div>
        </div>
        <div className="antwerp-hero__carousel" aria-label="Los Angeles hero images">
          <div className="antwerp-hero__carousel-track" ref={heroCarouselRef}>
            {heroImages.length ? (
              heroImages.map((src, idx) => (
                <div
                  key={`${src}-mobile-${idx}`}
                  className="antwerp-hero__carousel-card"
                  style={{ backgroundImage: `url(${src})` }}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`Slide ${idx + 1} of ${heroImages.length}`}
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
        <section className="la-city-tour" aria-label="USA city tours">
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

              {!loading && !error && losAngelesListings.length === 0 && (
                <div className="antwerp-empty">
                  No Los Angeles listings are available in the current response.
                </div>
              )}

              {groupedListings.map((group) => {
                const story = SECTION_STORIES[group.key] || SECTION_STORIES.other;
                const storyImages = group.listings
                  .map((listing) => getImageUrl(listing.picture) || getImageUrl(listing.pictures?.[0]))
                  .filter(Boolean)
                  .slice(0, 2);
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
                    <div className="la-story">
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
                          onClick={() => {
                            setActiveSectionKey(group.key);
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
                        setIsMapEnabled(true);
                      }}
                    >
                      Enable map
                    </button>
                  </div>
                ) : (
                  <div
                    ref={mapRef}
                    aria-label="Google map showing Hollywood Blvd with nearby landmarks and public transport"
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
                <h3>{activeSection.label}</h3>
                <p className="la-section-modal__subtitle">
                  {activeSection.listings.length} units ready for your dates.
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
                  const { rating, count } = getReviewStats(listing.reviews);
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
              const coords =
                activeSection.listings.map(getListingCoords).find(Boolean) || PROPERTY_COORDS;
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
                          <img src={mainImage} alt={`${activeSection.label} featured`} loading="lazy" />
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
                            <img src={src} alt="" loading="lazy" />
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
                        onMouseMove={handleSectionThumbsMove}
                        onMouseLeave={stopAutoScroll}
                      >
                        {images.map((src, idx) => (
                          <button
                            key={`${src}-${idx}`}
                            type="button"
                            className={idx === safeIndex ? "is-active" : ""}
                            onClick={() => setSectionHeroIndex(idx)}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <img src={src} alt="" loading="lazy" />
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
                    </div>
                    <div className="la-section-hero__review">
                      <div>
                        <strong>Guest pulse</strong>
                        <span>{reviewCount ? `${reviewCount} reviews` : "No review data"}</span>
                      </div>
                      <div className="la-section-hero__score">
                        {averageRating ? `${averageRating} / 5` : "--"}
                      </div>
                      <p>{reviewQuote}</p>
                    </div>
                    <div className="la-section-hero__map">
                      {mapUrl ? (
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
              const amenityPool = activeSection.listings.flatMap((listing) => {
                if (Array.isArray(listing.amenities)) return listing.amenities;
                if (Array.isArray(listing.tags)) return listing.tags;
                return [];
              });
              const amenityList = [...new Set(amenityPool.filter((item) => typeof item === "string"))].slice(0, 12);
              return (
                <>
                  <div className="la-unit-modal__booking" aria-label="Availability check">
                    <DateRangePicker
                      value={{ checkIn: sectionCheckIn, checkOut: sectionCheckOut }}
                      dayPrices={sectionCalendarDayMap}
                      isLoading={sectionCalendarLoading}
                      fallbackPrice={activeSection?.listings?.[0]?.basePrice}
                      fallbackCurrency={activeSection?.listings?.[0]?.currency || "USD"}
                      fallbackMinNights={sectionMinNightsFallback}
                      onMonthChange={(month) => {
                        if (!activeSection) return;
                        const listingId =
                          activeSection.listings[0]?.unitTypeId ||
                          activeSection.listings[0]?.id ||
                          activeSection.listings[0]?._id;
                        if (!listingId) return;
                        const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
                        fetchCalendarMonth(
                          listingId,
                          monthStart,
                          sectionCalendarCacheRef,
                          sectionCalendarDaysRef,
                          sectionCalendarInflightRef,
                          setSectionCalendarLoading,
                          setSectionCalendarError,
                          setSectionCalendarPrices
                        );
                      }}
                      onOpenChange={setIsSectionCalendarOpen}
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
                  {activeSection.listings.map((listing) => {
                    const listingId = listing.id || listing._id;
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
                    return (
                      <article key={listingId} className="la-booking-table__row" role="row">
                        <div className="la-booking-table__cell" role="cell">
                          <div className="la-booking-table__title">
                            {image ? (
                              <img src={image} alt="" loading="lazy" />
                            ) : (
                              <div className="la-booking-table__placeholder" aria-hidden="true" />
                            )}
                            <div>
                              <p className="la-booking-table__eyebrow">
                                {listing.propertyType || listing.roomType || "Residence"}
                              </p>
                              <h4>{sanitizeText(listing.title)}</h4>
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
                              <p className="la-booking-table__summary">
                                {shortDescription || "Signature OneLuxStay residence in Los Angeles."}
                              </p>
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
                                <span>We’ll confirm rates & availability.</span>
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
                        </div>
                        <div className="la-booking-table__cell" role="cell">
                          <div className="la-booking-table__cta-group">
                            {isUnavailable ? (
                              <button
                                type="button"
                                className="la-booking-table__reserve la-booking-table__inquire"
                                onClick={() => {
                                  setInquiryListing(listing);
                                  setIsInquiryOpen(true);
                                }}
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
                  })}
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
              <div>
                <p className="la-inquiry-modal__kicker">Contact OneLuxStay</p>
                <h3>Inquire about {inquiryTitle}</h3>
                {inquiryDates && <p className="la-inquiry-modal__meta">Dates: {inquiryDates}</p>}
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
              <p className="la-inquiry-modal__note">We usually respond within 24 hours.</p>
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
              <div>
                <p className="la-inquiry-modal__kicker">Guest details</p>
                <h3>Tell us who’s booking</h3>
                <p className="la-inquiry-modal__meta">We’ll use this to create the reservation after payment.</p>
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
              <label className="la-inquiry-modal__field">
                <span>First name</span>
                <input
                  type="text"
                  value={checkoutGuest.firstName}
                  onChange={(event) =>
                    setCheckoutGuest((prev) => ({ ...prev, firstName: event.target.value }))
                  }
                />
              </label>
              <label className="la-inquiry-modal__field">
                <span>Last name</span>
                <input
                  type="text"
                  value={checkoutGuest.lastName}
                  onChange={(event) =>
                    setCheckoutGuest((prev) => ({ ...prev, lastName: event.target.value }))
                  }
                />
              </label>
              <label className="la-inquiry-modal__field">
                <span>Email</span>
                <input
                  type="email"
                  value={checkoutGuest.email}
                  onChange={(event) =>
                    setCheckoutGuest((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </label>
              <label className="la-inquiry-modal__field">
                <span>Phone (optional)</span>
                <input
                  type="tel"
                  value={checkoutGuest.phone}
                  onChange={(event) =>
                    setCheckoutGuest((prev) => ({ ...prev, phone: event.target.value }))
                  }
                />
              </label>
              {checkoutGuestError && <p className="la-inquiry-modal__note">{checkoutGuestError}</p>}
              <button
                type="button"
                className="la-inquiry-modal__action"
                onClick={confirmGuestCheckout}
              >
                Continue to payment
              </button>
            </div>
          </div>
        </div>
      )}

      {activeListing && (
        <div className="antwerp-modal__overlay" role="dialog" aria-modal="true">
          <div className="la-unit-modal">
            <div className="la-unit-modal__header">
              <button
                type="button"
                className="la-unit-modal__back"
                onClick={() => {
                  setActiveListing(null);
                  setActiveImageIndex(0);
                }}
              >
                Back to listings
              </button>
              <div className="la-unit-modal__contact" aria-label="Reservation contact">
                <p>For Reservation Contact</p>
                <strong>OneLuxStay Los Angeles</strong>
                <a href="tel:+13105550101">+1 (310) 555-0101</a>
                <a href="mailto:stay@oneluxstay.com">stay@oneluxstay.com</a>
                <a href="mailto:stay@oneluxstay.com" className="la-unit-modal__contact-cta">
                  Message concierge
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
                  const { rating, count } = getReviewStats(activeListing.reviews);
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
              <button type="button" className="is-active">Overview</button>
              <button type="button">Facilities</button>
              <button type="button">Rooms</button>
              <button type="button">Guest reviews</button>
              <button type="button">House rules</button>
            </div>
            {(() => {
              const images = [
                getImageUrl(activeListing.picture),
                ...(Array.isArray(activeListing.pictures)
                  ? activeListing.pictures.map((pic) => getImageUrl(pic))
                  : []),
              ].filter(Boolean);
              const hasImages = images.length > 0;
              const safeIndex = hasImages
                ? Math.min(activeImageIndex, images.length - 1)
                : 0;
              const current = hasImages ? images[safeIndex] : "";
              const sideOne =
                images.length > 1 ? images[(safeIndex + 1) % images.length] : "";
              const sideTwo =
                images.length > 2 ? images[(safeIndex + 2) % images.length] : "";
              const coords = getListingCoords(activeListing);
              const mapUrl =
                coords && mapsApiKey
                  ? `https://maps.googleapis.com/maps/api/staticmap?center=${coords.lat},${coords.lng}&zoom=14&size=480x280&maptype=roadmap&markers=color:0x1f1c19|${coords.lat},${coords.lng}&key=${mapsApiKey}`
                  : "";
              const amenityListRaw = Array.isArray(activeListing.amenities)
                ? activeListing.amenities
                : Array.isArray(activeListing.tags)
                  ? activeListing.tags
                  : [];
              const amenityList = [...new Set(amenityListRaw.filter((item) => typeof item === "string"))].slice(0, 10);
              const aboutText = formatFullDescription(activeListing);
              const isHollywoodUnit = getBuildingKey(activeListing) === "la-hollywood";
              const popularFacilities = isHollywoodUnit
                ? HOLLYWOOD_FACILITIES
                : (activeAmenityList.slice(0, 6).length
                  ? activeAmenityList.slice(0, 6)
                  : ["Wi-Fi", "Kitchen", "Washer"]);
              return (
                <div className="la-unit-modal__grid">
                  <div className="la-unit-modal__gallery">
                    <div className="la-unit-modal__main">
                      {current ? (
                        <img src={current} alt={sanitizeText(activeListing.title)} loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                    </div>
                    <div className="la-unit-modal__side">
                      {sideOne ? (
                        <img src={sideOne} alt="" loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                      {sideTwo ? (
                        <img src={sideTwo} alt="" loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Image loading</div>
                      )}
                    </div>
                    {images.length > 1 && (
                      <div
                        className="la-unit-modal__thumbs"
                        role="list"
                        ref={thumbsRef}
                        onMouseMove={handleThumbsMove}
                        onMouseLeave={stopAutoScroll}
                      >
                        {images.map((src, idx) => (
                          <button
                            key={`${src}-${idx}`}
                            type="button"
                            className={idx === safeIndex ? "is-active" : ""}
                            onClick={() => setActiveImageIndex(idx)}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <img src={src} alt="" loading="lazy" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="la-unit-modal__sidebar">
                    <div className="la-unit-modal__card">
                      <div className="la-unit-modal__card-head">
                        <strong>{getReviewLabel(activeListing.reviews)}</strong>
                      </div>
                      <p>
                        Guests talk about the view, the stillness between city moments, and how easy it is to settle in.
                      </p>
                    </div>
                    <div className="la-unit-modal__card la-unit-modal__map">
                      {mapUrl ? (
                        <img src={mapUrl} alt="Map showing the unit location" loading="lazy" />
                      ) : (
                        <div className="la-unit-modal__placeholder">Map loading</div>
                      )}
                    </div>
                    <div className="la-unit-modal__card la-unit-modal__meta">
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
                    </div>
                    <div className="la-unit-modal__actions">

                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="la-unit-modal__booking" aria-label="Availability check">
              <DateRangePicker
                value={{ checkIn: sectionCheckIn, checkOut: sectionCheckOut }}
                dayPrices={calendarDayMap}
                isLoading={calendarLoading}
                fallbackPrice={activeListing?.basePrice}
                fallbackCurrency={activeListing?.currency || "USD"}
                fallbackMinNights={listingMinNightsFallback}
                onMonthChange={(month) => {
                  if (!activeListing) return;
                  const listingId = activeListing.unitTypeId || activeListing.id || activeListing._id;
                  if (!listingId) return;
                  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
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
                onOpenChange={setIsListingCalendarOpen}
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
                      ←
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
                      →
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
                </div>
                <div className="la-unit-modal__room-actions">
                  <button type="button">Virtual tour</button>
                  <Link to="/stay" className="antwerp-card__link">
                    Book now
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCityTour && tourCount > 0 && (
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
          <div
            className="la-tour-modal"
            onMouseEnter={() => setTourPaused(true)}
            onMouseLeave={() => setTourPaused(false)}
          >
            <div className="la-tour-intro" aria-hidden="true">
              <span>One Lux Stay</span>
            </div>
            <div className="la-tour-header">
              <div className="la-tour-brand">OneLuxStay</div>
              <div className="la-tour-controls">
                <button
                  type="button"
                  className="la-tour-btn"
                  onClick={() => setTourPaused((prev) => !prev)}
                  aria-pressed={tourPaused}
                >
                  {tourPaused ? "Play" : "Pause"}
                </button>
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
              <div
                key={tourIndex}
                className="la-tour-slide"
                style={{ backgroundImage: `url(${activeTourSlide.image})` }}
              >
                <div className="la-tour-gradient" aria-hidden="true" />
                <div className="la-tour-content" aria-live="polite">
                  <p className="la-tour-kicker">{tourCity}</p>
                  <h2 className="la-tour-title" id="la-tour-title">
                    {activeTourSlide.title}
                  </h2>
                  <p className="la-tour-subtitle">{activeTourSlide.subtitle}</p>
                  <p className="la-tour-copy">{activeTourSlide.copy}</p>
                  <div className="la-tour-highlights">
                    {activeTourSlide.highlights.map((item) => (
                      <span key={item} className="la-tour-chip">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="la-tour-progress" aria-hidden="true">
                <span style={{ width: `${((tourIndex + 1) / tourCount) * 100}%` }} />
              </div>
              <div className="la-tour-nav">
                <button
                  type="button"
                  className="la-tour-nav-btn"
                  aria-label="Previous scene"
                  onClick={() => goToTour(tourIndex - 1)}
                >
                  Prev
                </button>
                <div className="la-tour-dots" role="tablist" aria-label="Hollywood tour scenes">
                  {tourSlides.map((slide, index) => (
                    <button
                      key={slide.title}
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
                <button
                  type="button"
                  className="la-tour-nav-btn"
                  aria-label="Next scene"
                  onClick={() => goToTour(tourIndex + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



