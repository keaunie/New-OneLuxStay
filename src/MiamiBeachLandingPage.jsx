import { useEffect, useMemo, useRef, useState, useId, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import "./App.css";
import reviewsMiami from "./data/reviews-miami.json";
import CardSwap, { Card } from "./components/CardSwap";
import BounceCards from "./components/BounceCards";
import SiteFooter from "./components/SiteFooter";
import Silk from "./components/Silk";
import ListingLoadingScreen from "./components/ListingLoadingScreen";
import Stepper, { Step } from "./components/Stepper";
import LottieInlineHint from "./components/LottieInlineHint";
import getBedDetails, { splitBedDetailLine } from "./utils/bedDetails";
import apiBase from "./utils/apiBase";
import { buildCheckoutVerificationPayload } from "./utils/checkoutVerificationPayload";
import { filterLowQualityImages, getImageKeyFromUrl } from "./utils/imageQuality";
import { buildEmbedMapUrl, buildStaticMapUrl, loadLeafletMaps } from "./utils/leafletMapsAdapter";
const mapsApiKey = "leaflet";
const LOGO_URL = "https://oneluxstay.netlify.app/image/ols-logo.png";
const PROPERTY_ADDRESS = "Brickell, Miami, FL";
const PROPERTY_COORDS = { lat: 25.7617, lng: -80.1918 };
const LANDMARKS = [
  "Brickell City Centre",
  "Bayfront Park",
  "Bayside Marketplace",
  "Wynwood Walls",
  "Design District",
  "Kaseya Center",
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

const GLOBAL_MIN_NIGHTS = 1;
const normalizeMinNights = (value) => {
  const num = toNumber(value);
  if (!Number.isFinite(num)) return GLOBAL_MIN_NIGHTS;
  return Math.max(1, num);
};

const getListingNightlyPrice = (listing) =>
  firstNumber(
    listing?.prices?.nightly?.amount,
    listing?.prices?.nightly,
    listing?.prices?.basePricePerNight,
    listing?.prices?.basePrice?.amount,
    listing?.basePricePerNight
  );

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
  if (!Array.isArray(days) || !days.length) return GLOBAL_MIN_NIGHTS;
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
    .map((value) => {
      const num = toNumber(value);
      if (!Number.isFinite(num)) return null;
      return Math.max(1, num);
    })
    .filter((value) => typeof value === "number");
  return values.length ? Math.max(...values) : GLOBAL_MIN_NIGHTS;
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

const toLookupKey = (value) => (value === null || value === undefined ? "" : String(value));

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

const hasCalendarDayAvailabilitySignal = (day) =>
  Boolean(
    typeof day?.allotment === "number" ||
    typeof day?.available === "boolean" ||
    typeof day?.isAvailable === "boolean" ||
    typeof day?.status === "string"
  );

const normalizeCalendarDayForUi = (day, fallbackCurrency) => {
  const date = getCalendarDayKey(day);
  if (!date) return null;
  const closedToArrivalValue =
    day?.closedToArrival ?? day?.cta ?? day?.restrictions?.cta;
  const closedToDepartureValue =
    day?.closedToDeparture ?? day?.ctd ?? day?.restrictions?.ctd;
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
  const minNights = normalizeMinNights(
    firstNumber(
      day?.minNights,
      day?.minimumStay,
      day?.minStay,
      day?.minStayLength,
      day?.restrictions?.minNights,
      day?.restrictions?.minStay
    )
  );
  const maxNights = firstNumber(
    day?.maxNights,
    day?.maximumStay,
    day?.maxStay,
    day?.maxStayLength,
    day?.restrictions?.maxNights,
    day?.restrictions?.maxStay
  );
  const hasAvailabilitySignal = hasCalendarDayAvailabilitySignal(day);
  return {
    date,
    price,
    currency,
    available: hasAvailabilitySignal ? isCalendarDayAvailable(day) : null,
    restrictions: {
      minNights,
      maxNights,
      closedToArrival:
        typeof closedToArrivalValue === "boolean" ? closedToArrivalValue : null,
      closedToDeparture:
        typeof closedToDepartureValue === "boolean" ? closedToDepartureValue : null,
    },
  };
};

const mergeCalendarDay = (existingDay = {}, incomingDay = {}) => {
  const existingRestrictions = existingDay?.restrictions || {};
  const incomingRestrictions = incomingDay?.restrictions || {};
  return {
    ...existingDay,
    ...incomingDay,
    date: incomingDay?.date || existingDay?.date || null,
    price:
      typeof incomingDay?.price === "number"
        ? incomingDay.price
        : existingDay?.price ?? null,
    currency: incomingDay?.currency || existingDay?.currency || null,
    available:
      typeof incomingDay?.available === "boolean"
        ? incomingDay.available
        : typeof existingDay?.available === "boolean"
          ? existingDay.available
          : null,
    restrictions: {
      ...existingRestrictions,
      ...incomingRestrictions,
      minNights: incomingRestrictions?.minNights ?? existingRestrictions?.minNights ?? null,
      maxNights: incomingRestrictions?.maxNights ?? existingRestrictions?.maxNights ?? null,
      closedToArrival:
        typeof incomingRestrictions?.closedToArrival === "boolean"
          ? incomingRestrictions.closedToArrival
          : typeof existingRestrictions?.closedToArrival === "boolean"
            ? existingRestrictions.closedToArrival
            : null,
      closedToDeparture:
        typeof incomingRestrictions?.closedToDeparture === "boolean"
          ? incomingRestrictions.closedToDeparture
          : typeof existingRestrictions?.closedToDeparture === "boolean"
            ? existingRestrictions.closedToDeparture
            : null,
    },
  };
};

const getCalendarEntries = (payload) =>
  Array.isArray(payload?.calendars)
    ? payload.calendars
    : Array.isArray(payload?.listings)
      ? payload.listings
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.results) && payload.results.some((item) => item?.days || item?.calendar)
          ? payload.results
          : [];

const getCalendarEntryDays = (entry) => {
  if (!entry) return [];
  if (Array.isArray(entry?.days)) return entry.days;
  if (Array.isArray(entry?.calendar)) return entry.calendar;
  if (Array.isArray(entry?.data)) return entry.data;
  return [];
};

const getCalendarLookupIdsForListings = (listings = []) => {
  const childIds = listings
    .filter((listing) => isChildListing(listing))
    .map((listing) => listing?.id || listing?._id || listing?.unitTypeId)
    .map(toLookupKey)
    .filter(Boolean);
  if (childIds.length) return [...new Set(childIds)];
  return [
    ...new Set(
      listings
        .map((listing) => listing?.id || listing?._id || listing?.unitTypeId)
        .map(toLookupKey)
        .filter(Boolean)
    ),
  ];
};

const getListingCurrencyLookup = (listings = []) => {
  const lookup = {};
  listings.forEach((listing) => {
    const currency = listing?.currency || listing?.prices?.currency || null;
    if (!currency) return;
    [listing?.id, listing?._id, listing?.unitTypeId].forEach((idValue) => {
      const key = toLookupKey(idValue);
      if (key && !lookup[key]) lookup[key] = currency;
    });
  });
  return lookup;
};

const buildNormalizedCalendarDaysByListing = (
  payload,
  listingIds = [],
  fallbackCurrencyByListingId = {}
) => {
  if (!payload || !Array.isArray(listingIds) || !listingIds.length) return {};
  const normalizedCalendars =
    payload?.normalizedCalendars && typeof payload.normalizedCalendars === "object"
      ? payload.normalizedCalendars
      : {};
  const rawPayloadDays = Array.isArray(payload?.data?.days) ? payload.data.days : [];
  const payloadDaysByListingId = {};
  rawPayloadDays.forEach((day) => {
    const dayListingId = toLookupKey(
      day?.listingId || day?.listing?._id || day?.listing?.id || day?.id || day?._id
    );
    if (!dayListingId) return;
    if (!payloadDaysByListingId[dayListingId]) payloadDaysByListingId[dayListingId] = [];
    payloadDaysByListingId[dayListingId].push(day);
  });
  const entries = getCalendarEntries(payload);
  const entryMap = new Map();
  entries.forEach((entry) => {
    const entryId = toLookupKey(getCalendarEntryId(entry));
    if (entryId) entryMap.set(entryId, entry);
  });
  const normalizedIds = [...new Set(listingIds.map(toLookupKey).filter(Boolean))];
  const daysByListing = {};
  normalizedIds.forEach((listingId, index) => {
    let rawDays = [];
    if (Array.isArray(normalizedCalendars?.[listingId])) {
      rawDays = normalizedCalendars[listingId];
    } else {
      const entry = entryMap.get(listingId);
      if (entry) {
        rawDays = getCalendarEntryDays(entry);
      } else if (Array.isArray(payloadDaysByListingId[listingId])) {
        rawDays = payloadDaysByListingId[listingId];
      } else if (normalizedIds.length === 1 && Array.isArray(payload?.data?.days)) {
        rawDays = payload.data.days;
      }
    }
    const fallbackCurrency =
      fallbackCurrencyByListingId[listingId] ||
      fallbackCurrencyByListingId[toLookupKey(listingIds[index])] ||
      null;
    daysByListing[listingId] = rawDays
      .map((day) => normalizeCalendarDayForUi(day, fallbackCurrency))
      .filter(Boolean);
  });
  return daysByListing;
};

const buildDateAvailabilityMapFromCalendars = (daysByListing = {}) => {
  const aggregate = {};
  Object.values(daysByListing).forEach((days) => {
    if (!Array.isArray(days)) return;
    days.forEach((day) => {
      if (!day?.date) return;
      if (!aggregate[day.date]) {
        aggregate[day.date] = { hasSignal: false, anyAvailable: false };
      }
      if (typeof day.available === "boolean") {
        aggregate[day.date].hasSignal = true;
        if (day.available) aggregate[day.date].anyAvailable = true;
      }
    });
  });
  const availabilityByDate = {};
  Object.entries(aggregate).forEach(([date, info]) => {
    if (info.hasSignal) availabilityByDate[date] = info.anyAvailable;
  });
  return availabilityByDate;
};

const selectPreferredCalendarDay = (currentDay = null, candidateDay = null) => {
  if (!candidateDay?.date) return currentDay;
  if (!currentDay?.date) return candidateDay;
  const currentPrice = toNumber(currentDay?.price);
  const candidatePrice = toNumber(candidateDay?.price);
  if (Number.isFinite(candidatePrice) && Number.isFinite(currentPrice)) {
    return candidatePrice < currentPrice ? candidateDay : currentDay;
  }
  if (Number.isFinite(candidatePrice) && !Number.isFinite(currentPrice)) return candidateDay;
  if (!Number.isFinite(candidatePrice) && Number.isFinite(currentPrice)) return currentDay;
  return currentDay;
};

const buildLowestPriceCalendarByDate = (daysByListing = {}) => {
  const dayMap = {};
  Object.values(daysByListing).forEach((days) => {
    if (!Array.isArray(days)) return;
    days.forEach((day) => {
      if (!day?.date) return;
      if (day?.available === false) return;
      const existing = dayMap[day.date] || null;
      dayMap[day.date] = selectPreferredCalendarDay(existing, day);
    });
  });
  return dayMap;
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

const getSectionCalendarKey = (section, listings = []) => {
  const sectionKey = section?.key ? String(section.key) : "";
  if (sectionKey) return `section:${sectionKey}`;
  const primaryId = toLookupKey(getPrimaryListingId(listings));
  return primaryId || "";
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

const countMonthCalendarDays = (daysMap = {}, targetDate) => {
  const prefix = monthKey(targetDate);
  return Object.values(daysMap).filter((day) => day?.date?.startsWith(prefix)).length;
};

const addMonths = (date, count) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + count);
  return next;
};

const isDesktopCalendarViewport = () =>
  typeof window !== "undefined" && window.innerWidth > 640;

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
  return normalizeMinNights(minNights);
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
  dayAvailability,
  onMonthChange,
  onOpenChange,
  onValidationChange,
  isLoading = false,
  fallbackPrice,
  fallbackCurrency,
  fallbackMinNights,
  showMinNights = true,
  dropdownClassName = "",
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

  const getDayAvailability = (isoDate, priceInfo = null) => {
    if (!isoDate) return null;
    if (dayAvailability instanceof Map && dayAvailability.has(isoDate)) {
      const value = dayAvailability.get(isoDate);
      if (typeof value === "boolean") return value;
    }
    if (priceInfo && typeof priceInfo.available === "boolean") {
      return priceInfo.available;
    }
    return null;
  };

  const handleDayClick = (day) => {
    if (!day || day < today) return;
    const iso = toISODate(day);
    const priceInfo = dayPrices?.get(iso) || null;
    const dayAvailable = getDayAvailability(iso, priceInfo);
    if (dayAvailable === false) return;
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
      const nights = diffNights(toISODate(nextStart), toISODate(nextEnd));
      if (nights === 0) return;
      if (!showMinNights) {
        setOpenState(false);
      } else {
        const minNights = normalizeMinNights(
          dayPrices?.get(toISODate(nextStart))?.restrictions?.minNights ?? fallbackMinNights ?? null
        );
        const violatesMin = nights > 0 && nights < minNights;
        if (!violatesMin) setOpenState(false);
      }
    }
  };

  const selectedNights = diffNights(value.checkIn, value.checkOut);
  const hasSameDayStay = Boolean(value.checkIn && value.checkOut && selectedNights === 0);
  const selectedMinNights = useMemo(() => {
    if (!showMinNights) return null;
    if (!dayPrices || !startDate) return normalizeMinNights(fallbackMinNights ?? null);
    const iso = toISODate(startDate);
    const info = dayPrices.get(iso);
    const minNights = normalizeMinNights(info?.restrictions?.minNights ?? fallbackMinNights ?? null);
    return minNights;
  }, [dayPrices, startDate, fallbackMinNights, showMinNights]);
  const violatesMinNights =
    !hasSameDayStay &&
    showMinNights &&
    Boolean(selectedMinNights) &&
    selectedNights > 0 &&
    selectedNights < selectedMinNights;

  useEffect(() => {
    if (!onValidationChange) return;
    onValidationChange({
      hasSameDayStay,
      selectedNights,
      minNights: selectedMinNights,
      violatesMinNights,
    });
  }, [
    onValidationChange,
    hasSameDayStay,
    selectedNights,
    selectedMinNights,
    violatesMinNights,
  ]);

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
          className={`listing-date-dropdown${dayPrices ? " has-prices" : ""}${isLoading ? " is-loading" : ""}${
            dropdownClassName ? ` ${dropdownClassName}` : ""
          }`}
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
          {hasSameDayStay && (
            <div className="la-date-alert" role="alert">
              Please change the check-out date.
            </div>
          )}
          {!hasSameDayStay &&
            showMinNights &&
            violatesMinNights && (
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
                      const isoDate = day ? toISODate(day) : "";
                      const priceInfo = dayPrices && day ? dayPrices.get(isoDate) : null;
                      const hasCalendarPricing =
                        dayPrices instanceof Map && dayPrices.size > 0;
                      const hasAvailabilityMap =
                        dayAvailability instanceof Map && dayAvailability.size > 0;
                      const dayAvailable = day ? getDayAvailability(isoDate, priceInfo) : null;
                      const isUnavailable = Boolean(
                        day &&
                        (
                          dayAvailable === false ||
                          ((hasAvailabilityMap || hasCalendarPricing) && !priceInfo && dayAvailable !== true)
                        )
                      );
                      const disabled = !day || day < today || isUnavailable;
                      const isPast = Boolean(day && day < today);
                      const selected = (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
                      const between = inRange(day) && !selected;
                      const priceLabel = !isPast && !isUnavailable
                        ? priceInfo
                          ? formatCalendarPrice(priceInfo.price, priceInfo.currency)
                          : !hasCalendarPricing && typeof fallbackPrice === "number"
                            ? formatCalendarPrice(fallbackPrice, fallbackCurrency)
                            : ""
                        : "";
                      const isFallbackPrice =
                        !priceInfo &&
                        !hasCalendarPricing &&
                        typeof fallbackPrice === "number";
                      const minNights = normalizeMinNights(
                        priceInfo?.restrictions?.minNights ??
                          (!hasCalendarPricing ? fallbackMinNights : null)
                      );
                      const showMinNightsCell =
                        showMinNights &&
                        !isUnavailable &&
                        minNights > 1;
                      const dayLabel = day
                        ? day.toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                        : "";
                      const dayAria = isUnavailable
                        ? `${dayLabel}. Unavailable.`
                        : priceLabel
                          ? `${dayLabel}. ${priceLabel} per night.`
                          : dayLabel;
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
    : quoteData?.rates?.ratePlans
      ? [quoteData.rates.ratePlans]
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
        const second = (item?.secondIdentifier || item?.secondType || "").toUpperCase();
        const label = `${item?.title || item?.name || item?.description || ""}`.toUpperCase();
        const isCleaningLine =
          t === "CF" ||
          t === "CLEANING_FEE" ||
          t === "CFE" ||
          /\bCLEAN(ING)?\b/.test(t) ||
          /\bCLEAN(ING)?\b/.test(second) ||
          /\bCLEAN(ING)?\b/.test(label);
        const isTaxLine =
          t === "OCT" ||
          t === "TAX" ||
          t === "OCCUPANCY_TAX" ||
          t === "VAT" ||
          t === "CITY_TAX" ||
          t === "TOURISM_TAX" ||
          t === "SALES_TAX" ||
          /\b(TAX|VAT)\b/.test(t) ||
          /\b(TAX|VAT)\b/.test(second) ||
          /\b(TAX|VAT)\b/.test(label);
        if (t === "AF" || t === "ACCOMMODATION_FARE") acc.accommodation += amt;
        else if (isCleaningLine) acc.cleaning += amt;
        else if (isTaxLine) acc.taxes += amt;
        else acc.fees += amt;
      });
      return acc;
    })();

    const accommodationFromQuote =
      quoteMoney?.fareAccommodation ??
      null;
    const cleaningFromQuote = firstNumber(
      quoteMoney?.fareCleaning,
      quoteMoney?.cleaning,
      quoteMoney?.cleaningFee,
      quoteData?.price?.cleaning,
      quoteData?.price?.cleaningFee,
      breakdown?.cleaning
    );

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
      typeof cleaningFromQuote === "number"
        ? cleaningFromQuote
        : (typeof listing.cleaningFee === "number" ? listing.cleaningFee : 0);
    const taxesFromQuote = firstNumber(
      quoteMoney?.fareTaxes,
      quoteMoney?.fareTax,
      quoteMoney?.taxes,
      quoteMoney?.taxAmount,
      quoteMoney?.totalTaxes,
      quoteMoney?.tax?.amount,
      quoteMoney?.vat,
      quoteMoney?.vatAmount,
      quoteMoney?.fareVat,
      quoteData?.price?.taxes,
      quoteData?.price?.tax,
      quoteData?.price?.taxAmount,
      quoteData?.price?.tax?.amount,
      quoteData?.price?.taxes?.amount,
      quoteData?.price?.vatAmount,
      quoteData?.taxes,
      quoteData?.taxes?.amount,
      breakdown?.taxes
    );
    const taxes =
      typeof taxesFromQuote === "number"
        ? taxesFromQuote
        : computeTaxes(accommodation, listing);
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
  "miami",
  "downtown",
  "brickell",
  "wynwood",
  "design district",
  "edgewater",
  "midtown",
  "coconut grove",
  "little havana",
  "bayside",
  "miami beach",
];
const EXCLUDED_CITIES = ["los angeles", "redondo beach", "dubai", "antwerp", "antwerpen"];
const CHECKOUT_PROMO_CODES = {
  WELCOME5: { rate: 0.05, label: "Welcome offer" },
  LUXE10: { rate: 0.1, label: "Member offer" },
  STAY15: { rate: 0.15, label: "Extended stay offer" },
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

const BOOKING_STORAGE_KEY = "miamiBookingFilters";
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
    brickell: "miami-south-beach",
    southbeach: "miami-south-beach",
    miamisouthbeach: "miami-south-beach",
    downtown: "miami-south-beach",
    wynwood: "miami-mid-beach",
    midtown: "miami-mid-beach",
    artsdistrict: "miami-mid-beach",
    designdistrict: "miami-north-beach",
    northbeach: "miami-north-beach",
    edgewater: "miami-north-beach",
  };
  if (aliases[normalized]) return aliases[normalized];
  const fromGroup = BUILDING_GROUPS.find(
    (group) =>
      normalizeSlugValue(group.key) === normalized || normalizeSlugValue(group.label) === normalized
  );
  return fromGroup?.key || null;
};
const SECTION_SLUG_BY_KEY = {
  "miami-south-beach": "brickell",
  "miami-mid-beach": "wynwood",
  "miami-north-beach": "designdistrict",
  other: "miami",
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
  return "Miami";
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
  const key = getBuildingKey(listing);
  if (GOOGLE_REVIEW_LINKS[key]) return GOOGLE_REVIEW_LINKS[key];
  const title = sanitizeText(listing?.title || "OneLuxStay Miami");
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
  "miami-south-beach": {
    title: "Brickell",
    tagline: "Skyline living, bayfront walks, and a downtown pulse.",
    copy:
      "Wake to glass towers and a city energy that stays refined. Brickell blends waterfront views with rooftop dining and walkable business hubs.",
    landmarks: ["Brickell City Centre", "Mary Brickell Village", "Bayfront Park", "Biscayne Bay"],
    transit: ["Metromover", "Metrorail", "Brickell Ave routes"],
  },
  "miami-mid-beach": {
    title: "Wynwood",
    tagline: "Art walls, late coffee, and a creative city core.",
    copy:
      "Wynwood is alive with galleries, boutique cafes, and design-forward streets. It is a neighborhood that feels bold, colorful, and curated.",
    landmarks: ["Wynwood Walls", "NW 2nd Ave", "The Shops at Midtown", "Design District"],
    transit: ["Metrobus", "Ride shares", "Biking routes"],
  },
  "miami-north-beach": {
    title: "Design District",
    tagline: "Boutiques, modern galleries, and curated streets.",
    copy:
      "Spend the day between iconic brands, gallery stops, and a polished, walkable city scene just north of downtown.",
    landmarks: ["Design District", "Institute of Contemporary Art", "Biscayne Blvd", "Edgewater"],
    transit: ["Metrobus", "Biscayne Blvd routes", "Ride shares"],
  },
  other: {
    title: "Miami",
    tagline: "City energy with a relaxed waterfront rhythm.",
    copy:
      "From downtown views to design districts, Miami keeps everything within reach. It is a stay built for pace, polish, and easy access.",
    landmarks: ["Bayfront Park", "Bayside Marketplace", "Kaseya Center"],
    transit: ["Metromover", "Metrobus", "Ride shares"],
  },
};

const BUILDING_GROUPS = [
  { key: "miami-south-beach", label: "Brickell", match: /brickell|downtown|bayfront|biscayne/ },
  { key: "miami-mid-beach", label: "Wynwood", match: /wynwood|midtown|arts district|design district/ },
  { key: "miami-north-beach", label: "Design District", match: /design district|edgewater|biscayne blvd|ica/ },
];

const STAR_TOTAL = 5;
const REVIEW_TICKER = [...reviewsMiami];
const SECTION_REVIEWS = {
  "miami-south-beach": reviewsMiami,
  "miami-mid-beach": reviewsMiami,
  "miami-north-beach": reviewsMiami,
  other: reviewsMiami,
};
const GOOGLE_REVIEW_LINKS = {
  "miami-south-beach": "",
  "miami-mid-beach": "",
  "miami-north-beach": "",
};
const MIAMI_FACILITIES = [
  "Rooftop lounge",
  "Outdoor pool",
  "Fitness studio",
  "Free Wi-Fi",
  "Air conditioning",
  "Workspace",
  "Non-smoking rooms",
  "Elevator access",
  "Washer / dryer",
  "Coffee maker",
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

const isMiamiListing = (listing) => {
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
  for (const group of BUILDING_GROUPS) {
    if (group.match.test(text)) return group.key;
  }
  return "other";
};

const resolveGroupTitle = (listing) => {
  const key = getBuildingKey(listing);
  switch (key) {
    case "miami-south-beach":
      return "One Lux Stay Brickell Collection";
    case "miami-mid-beach":
      return "One Lux Stay Wynwood Collection";
    case "miami-north-beach":
      return "One Lux Stay Design District Collection";
    default:
      return "One Lux Stay Miami";
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
  Brickell: [
    {
      title: "Brickell Arrival",
      subtitle: "Skyline lines and bayfront light.",
      copy:
        "Start with a concierge-ready arrival and a skyline view. Brickell sets the tone with modern towers, waterfront walks, and a refined pace.",
      highlights: ["Brickell City Centre", "Bayfront Park", "Rooftop tables"],
      image:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Midday Reset",
      subtitle: "Cafes, galleries, and a calm city flow.",
      copy:
        "Pause for an easy lunch, a short gallery stop, and a quiet return to the bay.",
      highlights: ["Mary Brickell Village", "Metromover", "Biscayne Bay"],
      image:
        "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "After Dark",
      subtitle: "Rooftop glow and late reservations.",
      copy:
        "Let the concierge set the night with a reserved table and an easy ride back.",
      highlights: ["Rooftop lounges", "Private transfers", "Downtown skyline"],
      image:
        "https://images.unsplash.com/photo-1482192596544-9eb780fc7f66?auto=format&fit=crop&w=2000&q=80",
    },
  ],
  Wynwood: [
    {
      title: "Wynwood Morning",
      subtitle: "Art walls and neighborhood energy.",
      copy:
        "Start with a curated stroll through galleries and murals before a slow cafe stop.",
      highlights: ["Wynwood Walls", "NW 2nd Ave", "Local cafes"],
      image:
        "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Design Run",
      subtitle: "Boutiques, studios, and curated stops.",
      copy:
        "Spend the afternoon between design shops and a relaxed lunch in the arts district.",
      highlights: ["Design District", "Midtown", "Gallery visits"],
      image:
        "https://images.unsplash.com/photo-1526481280695-3c687fd643ed?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Evening Flow",
      subtitle: "Dinner and a soft city glow.",
      copy:
        "Close the day with a quiet dinner and a smooth return to your stay.",
      highlights: ["Local dining", "Concierge on call", "Ride share"],
      image:
        "https://images.unsplash.com/photo-1611860565869-7e40176e3052?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  ],
  "Design District": [
    {
      title: "Design District Arrival",
      subtitle: "Curated streets and modern galleries.",
      copy:
        "Begin with iconic boutiques and a gallery walk before a relaxed lunch.",
      highlights: ["Design District", "ICA Miami", "Biscayne Blvd"],
      image:
        "https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Edgewater Views",
      subtitle: "Bayfront calm and open light.",
      copy:
        "Reset with a waterfront walk and a quiet afternoon back at your residence.",
      highlights: ["Edgewater", "Bayfront Park", "Waterfront views"],
      image:
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=80",
    },
    {
      title: "Nightfall",
      subtitle: "A polished finish to the day.",
      copy:
        "Close with a reservation set by the concierge and an easy ride home.",
      highlights: ["Fine dining", "Concierge service", "City glow"],
      image:
        "https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  ],
};

const TOUR_CITIES = ["Brickell", "Wynwood", "Design District"];


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

export default function MiamiBeachLandingPage() {
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
  const [isMobileMapOpen, setIsMobileMapOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [cardImageIndexes, setCardImageIndexes] = useState({});
  const [minBedrooms, setMinBedrooms] = useState(1);
  const [showMonthlyTotal, setShowMonthlyTotal] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const viewportShellRef = useRef(null);
  const stickySearchShellRef = useRef(null);
  const [activeListing, setActiveListing] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeSectionKey, setActiveSectionKey] = useState(null);
  const [sectionCheckIn, setSectionCheckIn] = useState("");
  const [sectionCheckOut, setSectionCheckOut] = useState("");
  const [sectionGuests, setSectionGuests] = useState("2");
  const [sectionAvailability, setSectionAvailability] = useState([]);
  const [sectionAvailabilityLoading, setSectionAvailabilityLoading] = useState(false);
  const [sectionAvailabilityError, setSectionAvailabilityError] = useState("");
  const [sectionDateValidationError, setSectionDateValidationError] = useState("");
  const [sectionObservedMinNightsByDate, setSectionObservedMinNightsByDate] = useState({});
  const [sectionAvailabilityActive, setSectionAvailabilityActive] = useState(false);
  const [sectionAvailabilityMap, setSectionAvailabilityMap] = useState({});
  const [sectionReserveLoadingId, setSectionReserveLoadingId] = useState(null);
  const [isInquiryOpen, setIsInquiryOpen] = useState(false);
  const [inquiryListing, setInquiryListing] = useState(null);
  const [houseRulesByUnit, setHouseRulesByUnit] = useState({});

  useEffect(() => {
    if (isListingRoute) return undefined;
    const viewportNode = viewportShellRef.current;
    const stickyNode = stickySearchShellRef.current;
    if (!viewportNode || !stickyNode) return undefined;

    let rafId = null;
    const applyStickyOffset = () => {
      const nextHeight = Math.ceil(stickyNode.getBoundingClientRect().height || 0);
      if (!Number.isFinite(nextHeight) || nextHeight <= 0) return;
      viewportNode.style.setProperty("--dubai-sticky-nav-height", `${nextHeight}px`);
    };
    const scheduleApplyStickyOffset = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        applyStickyOffset();
      });
    };

    applyStickyOffset();
    window.addEventListener("resize", scheduleApplyStickyOffset);

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleApplyStickyOffset);
      resizeObserver.observe(stickyNode);
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleApplyStickyOffset);
      resizeObserver?.disconnect();
      viewportNode.style.removeProperty("--dubai-sticky-nav-height");
    };
  }, [isListingRoute]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paramCheckIn = params.get("checkIn") || "";
    const paramCheckOut = params.get("checkOut") || "";
    const paramGuests = params.get("guests") || "";
    const paramQuery = params.get("q") || "";
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
    if (paramQuery && paramQuery !== searchQuery) {
      setSearchQuery(paramQuery);
      setAppliedSearch(paramQuery);
    }
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

  const hasStayDates = diffNights(sectionCheckIn, sectionCheckOut) > 0;

  useEffect(() => {
    if (hasStayDates) {
      setShowMonthlyTotal(true);
    } else {
      setShowMonthlyTotal(false);
    }
  }, [hasStayDates]);

  const applySearchQuery = (value, { scrollToListings = true } = {}) => {
    const trimmed = value.trim();
    setSearchQuery(trimmed);
    setAppliedSearch(trimmed);
    setIsSearchFocused(false);
    const params = new URLSearchParams(location.search);
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }
    if (sectionCheckIn) params.set("checkIn", sectionCheckIn);
    else params.delete("checkIn");
    if (sectionCheckOut) params.set("checkOut", sectionCheckOut);
    else params.delete("checkOut");
    if (sectionGuests) params.set("guests", sectionGuests);
    else params.delete("guests");
    const search = params.toString();
    navigate(`${location.pathname}${search ? `?${search}` : ""}`, {
      replace: true,
      state: { skipCityLoader: true },
    });
    if (scrollToListings) {
      const target = document.getElementById("miami-beach-units");
      if (target) target.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleSearchSubmit = () => {
    applySearchQuery(searchQuery);
  };

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
  const [checkoutIdentityDocs, setCheckoutIdentityDocs] = useState({
    idFront: null,
    idBack: null,
    idSelfie: null,
  });
  const [checkoutIdentityError, setCheckoutIdentityError] = useState("");
  const [checkoutCardPhoto, setCheckoutCardPhoto] = useState(null);
  const [checkoutCardHolderSelfie, setCheckoutCardHolderSelfie] = useState(null);
  const [checkoutCardPhotoError, setCheckoutCardPhotoError] = useState("");
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
  const [cardQuoteRates, setCardQuoteRates] = useState({});
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
  const sectionCalendarAvailabilityRef = useRef({});
  const [sectionCalendarAvailability, setSectionCalendarAvailability] = useState({});
  const [isSectionCalendarOpen, setIsSectionCalendarOpen] = useState(false);
  const sectionCalendarInflightRef = useRef({});
  const [tourCity, setTourCity] = useState("Brickell");
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
  const mapPopupClustersRef = useRef(new Map());
  const geocoderRef = useRef(null);
  const geocodeCacheRef = useRef(new Map());
  const geocodeInFlightRef = useRef(new Set());
  const mapLoadedRef = useRef(false);
  const miamiBeachListingsRef = useRef([]);
  const [isMapEnabled, setIsMapEnabled] = useState(true);
  const [mapError, setMapError] = useState("");
  const teardownMainMap = () => {
    listingMarkersRef.current.forEach((marker) => marker?.setMap?.(null));
    listingMarkersRef.current = [];
    listingInfoRef.current = null;
    mapPopupClustersRef.current.clear();
    geocoderRef.current = null;
    const currentMap = mapInstanceRef.current;
    if (currentMap?.__leafletMap?.remove) {
      currentMap.__leafletMap.remove();
    } else if (typeof currentMap?.destroy === "function") {
      currentMap.destroy();
    }
    mapInstanceRef.current = null;
    mapLoadedRef.current = false;
  };

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
    const listingId = getCalendarListingId(activeListing, miamiBeachListings);
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

  const sectionCalendarAvailabilityMap = useMemo(
    () => new Map(Object.entries(sectionCalendarAvailability || {})),
    [sectionCalendarAvailability]
  );

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
      setSectionDateValidationError("");
      setSectionObservedMinNightsByDate({});
      setSectionAvailabilityActive(false);
      setSectionAvailabilityMap({});
      setIsInquiryOpen(false);
      setInquiryListing(null);
      setIsCheckoutGuestOpen(false);
      setPendingCheckout(null);
      setCheckoutIdentityDocs({
        idFront: null,
        idBack: null,
        idSelfie: null,
      });
      setCheckoutIdentityError("");
      setCheckoutCardPhoto(null);
      setCheckoutCardHolderSelfie(null);
      setCheckoutCardPhotoError("");
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
    if (!isListingRoute) return;
    teardownMainMap();
  }, [isListingRoute]);

  useEffect(() => {
    return () => {
      teardownMainMap();
    };
  }, []);

  useEffect(() => {
    if (!listings.length) return;
    const targetId = "66e1e3875a1f6300d736f28e";
    const match = listings.find((listing) => (listing.id || listing._id) === targetId);
    if (match) {
      console.log("[Miami debug] listing match", match);
    } else {
      console.log("[Miami debug] listing not found for id", targetId);
    }
  }, [listings]);

  useEffect(() => {
    if (isListingRoute) return;
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

            if (miamiBeachListingsRef.current.length) {
              syncListingMarkers(miamiBeachListingsRef.current);
            }

            maps.event.addListener(map, "zoom_changed", () => {
              syncListingMarkers(miamiBeachListingsRef.current, { fitBounds: false });
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
  }, [isMapEnabled, mapsApiKey, isListingRoute]);

  const miamiBeachListings = useMemo(() => {
    return listings.filter((listing) => {
      return isMiamiListing(listing);
    });
  }, [listings, isMapEnabled, mapsApiKey]);

  const miamiBeachParentListings = useMemo(() => {
    if (!miamiBeachListings.length) return [];
    const parentGroups = groupListingsByParent(miamiBeachListings);
    return Object.values(parentGroups)
      .map((group) => group.parent || group.children?.[0])
      .filter(Boolean);
  }, [miamiBeachListings]);

  useEffect(() => {
    let active = true;
    const loadCardQuoteRates = async () => {
      const parentListings = Array.isArray(miamiBeachParentListings) ? miamiBeachParentListings : [];
      if (!parentListings.length) {
        if (active) setCardQuoteRates({});
        return;
      }

      const parsedCheckIn = parseDateValue(sectionCheckIn);
      const parsedCheckOut = parseDateValue(sectionCheckOut);
      let quoteCheckIn = "";
      let quoteCheckOut = "";
      if (parsedCheckIn && parsedCheckOut && parsedCheckOut > parsedCheckIn) {
        quoteCheckIn = toISODate(parsedCheckIn);
        quoteCheckOut = toISODate(parsedCheckOut);
      } else if (parsedCheckIn) {
        const nextOut = new Date(parsedCheckIn);
        nextOut.setDate(nextOut.getDate() + 1);
        quoteCheckIn = toISODate(parsedCheckIn);
        quoteCheckOut = toISODate(nextOut);
      } else if (parsedCheckOut) {
        const prevIn = new Date(parsedCheckOut);
        prevIn.setDate(prevIn.getDate() - 1);
        quoteCheckIn = toISODate(prevIn);
        quoteCheckOut = toISODate(parsedCheckOut);
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        quoteCheckIn = toISODate(today);
        quoteCheckOut = toISODate(tomorrow);
      }

      const nights = diffNights(quoteCheckIn, quoteCheckOut);
      if (!nights) {
        if (active) setCardQuoteRates({});
        return;
      }

      const requests = parentListings
        .map((listing) => {
          const displayListingId = getListingId(listing);
          if (!displayListingId) return null;
          const quoteListingId = toLookupKey(
            isChildListing(listing) ? listing?.unitTypeId : displayListingId
          );
          if (!quoteListingId) return null;
          return {
            listing,
            displayListingId: toLookupKey(displayListingId),
            quoteListingId,
            request: {
              listingId: quoteListingId,
              checkInDateLocalized: quoteCheckIn,
              checkOutDateLocalized: quoteCheckOut,
              guestsCount: Number(sectionGuests) || 1,
            },
          };
        })
        .filter(Boolean);

      if (!requests.length) {
        if (active) setCardQuoteRates({});
        return;
      }

      try {
        const dedupedRequests = [];
        const seenRequestIds = new Set();
        requests.forEach((entry) => {
          const key = entry?.quoteListingId;
          if (!key || seenRequestIds.has(key)) return;
          seenRequestIds.add(key);
          dedupedRequests.push(entry.request);
        });
        if (!dedupedRequests.length) {
          if (active) setCardQuoteRates({});
          return;
        }

        const BATCH_SIZE = 35;
        const results = {};
        for (let index = 0; index < dedupedRequests.length; index += BATCH_SIZE) {
          const batch = dedupedRequests.slice(index, index + BATCH_SIZE);
          const res = await fetch(`${apiBase}/check-units/reservations/quotes-bulk`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requests: batch }),
          });
          if (!res.ok) continue;
          const data = await res.json();
          Object.assign(results, data?.results || {});
        }

        if (!active) return;
        const nextRates = {};
        requests.forEach((entry) => {
          const { listing, displayListingId, quoteListingId } = entry;
          if (!displayListingId) return;
          const quoteData = results?.[quoteListingId] || results?.[displayListingId];
          const pricing = getQuotePricing(quoteData, listing, nights);
          const selectedPlan =
            pricing?.plans?.find((plan) => plan.id === pricing?.defaultPlanId) ||
            pricing?.plans?.[0] ||
            null;
          const quotePlansRaw = Array.isArray(quoteData?.rates?.ratePlans)
            ? quoteData.rates.ratePlans
            : quoteData?.rates?.ratePlans
              ? [quoteData.rates.ratePlans]
              : [];
          const selectedQuotePlan =
            quotePlansRaw.find((plan, idx) => {
              const ratePlanMeta = plan?.ratePlan || {};
              const planId = ratePlanMeta?._id || plan?._id || `plan-${idx}`;
              return String(planId) === String(selectedPlan?.id || "");
            }) || quotePlansRaw[0] || null;
          const dayPrices = Array.isArray(selectedQuotePlan?.days) ? selectedQuotePlan.days : [];
          const dayDailyRate = toNumber(
            dayPrices[0]?.manualPrice ?? dayPrices[0]?.price ?? dayPrices[0]?.basePrice
          );
          const cleaningFee = firstNumber(
            selectedPlan?.breakdown?.cleaning,
            listing?.cleaningFee,
            listing?.prices?.cleaning,
            listing?.prices?.cleaningFee
          );
          const dayPlusCleaning =
            Number.isFinite(dayDailyRate) && Number.isFinite(toNumber(cleaningFee))
              ? dayDailyRate + toNumber(cleaningFee)
              : null;
          const nightly = firstNumber(dayPlusCleaning, selectedPlan?.nightly);
          if (Number.isFinite(toNumber(nightly))) {
            nextRates[displayListingId] = {
              nightly,
              currency:
                dayPrices[0]?.currency ||
                selectedPlan?.currency ||
                listing?.currency ||
                listing?.prices?.nightly?.currency ||
                listing?.prices?.basePrice?.currency ||
                "USD",
            };
          }
        });
        setCardQuoteRates(nextRates);
      } catch {
        if (active) setCardQuoteRates({});
      }
    };

    loadCardQuoteRates().catch(() => {
      if (active) setCardQuoteRates({});
    });
    return () => {
      active = false;
    };
  }, [miamiBeachParentListings, sectionCheckIn, sectionCheckOut, sectionGuests]);

  const filteredListings = useMemo(() => {
    const query = sanitizeText(appliedSearch).toLowerCase();
    const minBeds = Number(minBedrooms) || 1;
    const guestCount = Number.parseInt(sectionGuests, 10);
    const hasGuestFilter = Number.isFinite(guestCount) && guestCount > 0;
    if (!query && minBeds <= 1 && !hasGuestFilter) return miamiBeachListings;
    const tokens = query
      .split(/[,\n]/)
      .flatMap((part) => part.split(/\s+/))
      .map((part) => part.trim())
      .filter((part) => part.length >= 2);
    return miamiBeachListings.filter((listing) => {
      const bedrooms = Number(listing?.bedrooms ?? listing?.beds);
      if (minBeds > 1 && Number.isFinite(bedrooms) && bedrooms < minBeds) return false;
      const accommodates = Number(listing?.accommodates);
      if (hasGuestFilter && Number.isFinite(accommodates) && accommodates < guestCount) return false;
      if (!query) return true;
      const haystack = [
        listing?.title,
        listing?.nickname,
        resolveGroupTitle(listing),
        formatAddress(listing),
        listing?.propertyType,
        listing?.roomType,
        listing?.address?.city,
        listing?.address?.full,
        listing?.location,
        getListingText(listing),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (haystack.includes(query)) return true;
      if (!tokens.length) return true;
      return tokens.some((token) => haystack.includes(token));
    });
  }, [miamiBeachListings, minBedrooms, appliedSearch, sectionGuests]);

  const filteredParentListings = useMemo(() => {
    if (!filteredListings.length) return [];
    const parentGroups = groupListingsByParent(filteredListings);
    return Object.values(parentGroups)
      .map((group) => group.parent || group.children?.[0])
      .filter(Boolean);
  }, [filteredListings]);

  const citySuggestions = useMemo(() => {
    const items = [];
    const seen = new Set();
    miamiBeachParentListings.forEach((listing) => {
      const label = formatListingLocationLabel(listing, "Miami");
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ label, key });
    });
    return items;
  }, [miamiBeachParentListings]);

  const filteredCitySuggestions = useMemo(() => {
    const query = sanitizeText(searchQuery).toLowerCase();
    if (!query) return citySuggestions.slice(0, 6);
    return citySuggestions.filter((item) => item.key.includes(query)).slice(0, 6);
  }, [citySuggestions, searchQuery]);

  const buildMapPopupContent = useCallback((popupListings = [], activeIndex = 0, popupKey = "") => {
    const listings = (Array.isArray(popupListings) ? popupListings : [popupListings]).filter(Boolean);
    if (!listings.length) return "";

    const safeIndex =
      ((Number(activeIndex) || 0) % listings.length + listings.length) % listings.length;
    const listing = listings[safeIndex];
    const totalUnits = listings.length;
    const title = escapeHtml(resolveGroupTitle(listing) || listing?.title || "One Lux Stay");
    const images = getListingImageUrls(listing);
    const imageKey = String(getListingId(listing) || listing?.unitTypeId || listing?.title || "");
    let imageIndex = 0;
    if (images.length > 1 && imageKey) {
      let hash = 0;
      for (let i = 0; i < imageKey.length; i += 1) {
        hash = (hash * 31 + imageKey.charCodeAt(i)) | 0;
      }
      imageIndex = Math.abs(hash) % images.length;
    }
    const image = escapeHtml(images[imageIndex] || FALLBACK_IMAGE);
    const basePrice = firstNumber(
      listing?.basePrice,
      listing?.prices?.basePrice,
      listing?.prices?.basePricePerNight,
      listing?.prices?.nightly,
      listing?.prices?.nightly?.amount,
      listing?.prices?.basePrice?.amount
    );
    const nightlyPrice = getListingNightlyPrice(listing);
    const currency =
      listing?.currency ||
      listing?.prices?.currency ||
      listing?.prices?.nightly?.currency ||
      listing?.prices?.basePrice?.currency ||
      "USD";
    const stayNights = diffNights(sectionCheckIn, sectionCheckOut);
    const nightlyForTotal = typeof nightlyPrice === "number" ? nightlyPrice : basePrice;
    const canShowStayTotal = showMonthlyTotal && stayNights > 0 && typeof nightlyForTotal === "number";
    const priceValue = canShowStayTotal
      ? nightlyForTotal * stayNights
      : typeof nightlyPrice === "number"
        ? nightlyPrice
        : basePrice;
    const priceLabel =
      typeof priceValue === "number"
        ? `${formatCurrency(priceValue, currency)}${canShowStayTotal ? " total" : " / night"}`
        : "Check price";
    const bedrooms = firstNumber(
      listing?.bedrooms,
      listing?.beds,
      listing?.bedroomCount,
      listing?.roomCount,
      listing?.rooms
    );
    const bathrooms = firstNumber(listing?.bathrooms);
    const areaSqft = firstNumber(listing?.squareFeet, listing?.area, listing?.size?.value);
    const meta = [
      bedrooms ? `${bedrooms} ${bedrooms === 1 ? "bedroom" : "bedrooms"}` : null,
      bathrooms ? `${bathrooms} ${bathrooms === 1 ? "bathroom" : "bathrooms"}` : null,
      areaSqft ? `${areaSqft} sq ft` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const address = escapeHtml(formatAddress(listing));
    const listingId = getListingId(listing);
    const idLine = listingId ? `#${escapeHtml(listingId)}` : "";
    const listingPath = listingId
      ? `/miami/listing/${encodeURIComponent(listingId)}`
      : "/miami";
    const safePopupKey = escapeHtml(String(popupKey || ""));
    const unitNav =
      totalUnits > 1
        ? `
          <div class="ols-map-popup__unit-nav-wrap">
            <button
              type="button"
              class="ols-map-popup__unit-nav"
              data-popup-key="${safePopupKey}"
              data-popup-direction="prev"
              aria-label="Previous unit"
            >
              &#8249;
            </button>
            <span class="ols-map-popup__unit-count">${safeIndex + 1} / ${totalUnits}</span>
            <button
              type="button"
              class="ols-map-popup__unit-nav"
              data-popup-key="${safePopupKey}"
              data-popup-direction="next"
              aria-label="Next unit"
            >
              &#8250;
            </button>
          </div>
        `
        : "";
    const mediaNav =
      totalUnits > 1
        ? `
          <button
            type="button"
            class="ols-map-popup__media-nav ols-map-popup__media-nav--prev"
            data-popup-key="${safePopupKey}"
            data-popup-direction="prev"
            aria-label="Previous listing"
          >
            &#8249;
          </button>
          <button
            type="button"
            class="ols-map-popup__media-nav ols-map-popup__media-nav--next"
            data-popup-key="${safePopupKey}"
            data-popup-direction="next"
            aria-label="Next listing"
          >
            &#8250;
          </button>
        `
        : "";

    return `
      <div class="ols-map-popup" data-popup-key="${safePopupKey}">
        <div class="ols-map-popup__header">
          <span class="ols-map-popup__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 4 3 11h2v8h5v-5h4v5h5v-8h2z" fill="currentColor" />
            </svg>
          </span>
          <div class="ols-map-popup__title-block">
            <div class="ols-map-popup__title">${title}</div>
            ${totalUnits > 1 ? `<div class="ols-map-popup__title-sub">${totalUnits} units here</div>` : ""}
          </div>
          ${unitNav}
        </div>
        <a class="ols-map-popup__card" href="${listingPath}">
          <div class="ols-map-popup__media" data-popup-key="${safePopupKey}">
            <img src="${image}" alt="${title}" loading="lazy" width="420" height="280" />
            <span class="ols-map-popup__badge">Popular home</span>
            <span class="ols-map-popup__fav" aria-hidden="true">&#9825;</span>
            ${mediaNav}
          </div>
          <div class="ols-map-popup__body">
            <div class="ols-map-popup__price">${escapeHtml(priceLabel)}</div>
            ${meta ? `<div class="ols-map-popup__meta">${escapeHtml(meta)}</div>` : ""}
            <div class="ols-map-popup__address">
              ${idLine ? `${idLine} &#183; ` : ""}${address}
            </div>
          </div>
        </a>
      </div>
    `;
  }, []);

  const navigatePopupUnit = useCallback(
    (popupKey = "", direction = "next") => {
      const popupState = mapPopupClustersRef.current.get(popupKey);
      if (!popupState?.listings?.length || !popupState.marker) return;

      const total = popupState.listings.length;
      const delta = direction === "prev" ? -1 : 1;
      const nextIndex = ((popupState.activeIndex + delta) % total + total) % total;
      popupState.activeIndex = nextIndex;

      const infoWindow = listingInfoRef.current;
      const map = mapInstanceRef.current;
      if (!infoWindow || !map) return;
      infoWindow.setContent(buildMapPopupContent(popupState.listings, nextIndex, popupKey));
      infoWindow.open(map, popupState.marker);
    },
    [buildMapPopupContent]
  );

  useEffect(() => {
    const handlePopupUnitNavigation = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest(".ols-map-popup__unit-nav, .ols-map-popup__media-nav");
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();

      const popupKey = trigger.getAttribute("data-popup-key") || "";
      const direction = trigger.getAttribute("data-popup-direction") || "next";
      navigatePopupUnit(popupKey, direction);
    };

    const touchSession = {
      popupKey: "",
      startX: 0,
      startY: 0,
      active: false,
    };

    const handlePopupTouchStart = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const media = target.closest(".ols-map-popup__media[data-popup-key]");
      if (!media) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      touchSession.popupKey = media.getAttribute("data-popup-key") || "";
      touchSession.startX = touch.clientX;
      touchSession.startY = touch.clientY;
      touchSession.active = Boolean(touchSession.popupKey);
    };

    const handlePopupTouchEnd = (event) => {
      if (!touchSession.active || !touchSession.popupKey) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      const deltaX = touch.clientX - touchSession.startX;
      const deltaY = touch.clientY - touchSession.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const minSwipePx = 38;
      if (absX >= minSwipePx && absX > absY) {
        event.preventDefault();
        event.stopPropagation();
        navigatePopupUnit(touchSession.popupKey, deltaX < 0 ? "next" : "prev");
      }
      touchSession.active = false;
      touchSession.popupKey = "";
    };

    document.addEventListener("click", handlePopupUnitNavigation, true);
    document.addEventListener("touchstart", handlePopupTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchend", handlePopupTouchEnd, {
      capture: true,
      passive: false,
    });
    return () => {
      document.removeEventListener("click", handlePopupUnitNavigation, true);
      document.removeEventListener("touchstart", handlePopupTouchStart, true);
      document.removeEventListener("touchend", handlePopupTouchEnd, true);
    };
  }, [navigatePopupUnit]);

  const syncListingMarkers = (
    listingsToUse = miamiBeachListingsRef.current,
    { fitBounds = true } = {}
  ) => {
    const maps = mapsApiRef.current;
    const map = mapInstanceRef.current;
    if (!maps || !map) return;

    listingMarkersRef.current.forEach((marker) => marker.setMap(null));
    listingMarkersRef.current = [];
    mapPopupClustersRef.current.clear();

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
    const getTitleClusterKey = (listing) => {
      const normalizedTitle = sanitizeText(listing?.title || "")
        .toLowerCase()
        .replace(/\b\d+\s*br\b/g, "")
        .replace(/\bstudio\b/g, "")
        .replace(/\s*-\s*.*/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return normalizedTitle ? `title:${normalizedTitle}` : "";
    };
    const getAddressClusterKey = (listing) => {
      const normalizedAddress = formatAddress(listing)
        .toLowerCase()
        .replace(/,?\s*(apt|apartment|unit|suite|ste|#)\s*[^,]*/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return normalizedAddress ? `addr:${normalizedAddress}` : "";
    };
    const getPopupClusterKey = (listing, coords) => {
      const titleKey = getTitleClusterKey(listing);
      if (titleKey) return titleKey;
      const addressKey = getAddressClusterKey(listing);
      if (addressKey) return addressKey;

      const step = getClusterStep();
      const latBucket = Math.round(coords.lat / step);
      const lngBucket = Math.round(coords.lng / step);
      return `coord:${latBucket}:${lngBucket}`;
    };
    const addToCluster = (coords, listing) => {
      const adjusted = { lat: coords.lat, lng: coords.lng };
      const key = getPopupClusterKey(listing, adjusted);
      if (!clusters.has(key)) {
        clusters.set(key, { coords: adjusted, listings: [] });
      }
      clusters.get(key).listings.push(listing);
    };
    const getPopupMatchKeys = (listing) => {
      const keys = [];
      const titleKey = getTitleClusterKey(listing);
      if (titleKey) keys.push(titleKey);
      const addressKey = getAddressClusterKey(listing);
      if (addressKey) keys.push(addressKey);
      return keys;
    };
    const getGroupListingsForParent = (parentListing) => {
      if (!parentListing) return [];
      const parentId = getParentListingId(parentListing);
      const group = parentId ? parentGroups[parentId] : null;
      if (!group) return [parentListing];
      return [group.parent, ...(group.children || [])].filter(Boolean);
    };
    const dedupePopupListings = (items) => {
      const seen = new Set();
      const out = [];
      items.forEach((item) => {
        if (!item) return;
        const key =
          getListingId(item) ||
          item?.unitTypeId ||
          formatAddress(item) ||
          item?.title ||
          `${item?.address?.full || ""}-${item?.title || ""}`;
        const id = key ? String(key) : null;
        if (id && seen.has(id)) return;
        if (id) seen.add(id);
        out.push(item);
      });
      return out;
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

    const toParentListing = (listing) => {
      const groupKey = getListingGroupKey(listing);
      if (!groupKey) return listing;
      const parent = listingsToUse.find(
        (entry) => !isChildListing(entry) && getListingGroupKey(entry) === groupKey
      );
      return parent || listing;
    };

    let popupKeyIndex = 0;
    clusters.forEach(({ coords, listings: clusterListings }, clusterKey) => {
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
      const popupKey = `cluster-${popupKeyIndex++}`;
      const popupAnchor = marker || backgroundMarker;
      const groupedListings = (uniqueParents.length ? uniqueParents : [primary]).flatMap(
        getGroupListingsForParent
      );
      const matchedListings = listingsToUse.filter((listing) =>
        getPopupMatchKeys(listing).includes(clusterKey)
      );
      const popupListings = dedupePopupListings([...matchedListings, ...groupedListings]);
      const openPopup = () => {
        mapPopupClustersRef.current.set(popupKey, {
          marker: popupAnchor,
          listings: popupListings,
          activeIndex: 0,
        });
        infoWindow.setContent(buildMapPopupContent(popupListings, 0, popupKey));
        infoWindow.open(map, popupAnchor);
      };
      marker.addListener("click", openPopup);
      backgroundMarker.addListener("click", openPopup);
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
    miamiBeachListingsRef.current = miamiBeachListings;
    syncListingMarkers(miamiBeachListings);
  }, [miamiBeachListings]);

  const groupedListingsAll = useMemo(() => {
    const groups = BUILDING_GROUPS.reduce((acc, group) => {
      acc[group.key] = { label: group.label, listings: [] };
      return acc;
    }, {});
    const other = [];
    miamiBeachListings.forEach((listing) => {
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
      ordered.push({ key: "other", label: "Miami", listings: other });
    }
    return ordered.filter((group) => group.listings.length);
  }, [miamiBeachListings]);

  const groupedListingsDisplay = useMemo(() => {
    const groups = BUILDING_GROUPS.reduce((acc, group) => {
      acc[group.key] = { label: group.label, listings: [] };
      return acc;
    }, {});
    const other = [];
    miamiBeachParentListings.forEach((listing) => {
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
      ordered.push({ key: "other", label: "Miami", listings: other });
    }
    return ordered.filter((group) => group.listings.length);
  }, [miamiBeachParentListings]);

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
    return getListingMinNightsWithParent(activeListing, miamiBeachListings);
  }, [calendarMinNightsOverride, activeListing, miamiBeachListings]);
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
  const sectionStayNights = diffNights(sectionCheckIn, sectionCheckOut);
  const selectedCheckInMinNights = useMemo(() => {
    if (!sectionCheckIn) return null;
    const dayInfo =
      sectionCalendarDayMap.get(sectionCheckIn) || calendarDayMap.get(sectionCheckIn);
    const rawMinNights = toNumber(dayInfo?.restrictions?.minNights);
    if (Number.isFinite(rawMinNights)) return normalizeMinNights(rawMinNights);
    const cachedSelectedMinNights = toNumber(sectionObservedMinNightsByDate[sectionCheckIn]);
    if (Number.isFinite(cachedSelectedMinNights)) {
      return normalizeMinNights(cachedSelectedMinNights);
    }
    return null;
  }, [sectionCheckIn, sectionCalendarDayMap, calendarDayMap, sectionObservedMinNightsByDate]);
  const effectiveMinNights = normalizeMinNights(
    activeSection?.listings?.length ? sectionMinNightsFallback : listingMinNightsFallback
  );
  const requiredMinNightsForSelection = selectedCheckInMinNights || effectiveMinNights;
  const computedStayRestrictionMessage =
    sectionCheckIn && sectionCheckOut && sectionStayNights === 0
      ? "Please change the check-out date."
      : sectionStayNights > 0 && sectionStayNights < requiredMinNightsForSelection
        ? `Minimum stay is ${requiredMinNightsForSelection} nights.`
        : "";
  const stayTooShortMessage = sectionDateValidationError || computedStayRestrictionMessage;
  const isStayTooShort = Boolean(stayTooShortMessage);

  const handleSectionDateValidation = useCallback((state) => {
    if (!state) {
      setSectionDateValidationError("");
      return;
    }
    const reportedMinNights = Number.isFinite(state.minNights)
      ? normalizeMinNights(state.minNights)
      : null;
    if (sectionCheckIn && Number.isFinite(reportedMinNights)) {
      setSectionObservedMinNightsByDate((prev) => {
        const existing = toNumber(prev[sectionCheckIn]);
        const nextMinNights = Number.isFinite(existing)
          ? Math.max(existing, reportedMinNights)
          : reportedMinNights;
        if (Number.isFinite(existing) && existing === nextMinNights) return prev;
        return {
          ...prev,
          [sectionCheckIn]: nextMinNights,
        };
      });
    }
    if (state.hasSameDayStay) {
      setSectionDateValidationError("Please change the check-out date.");
      return;
    }
    if (state.violatesMinNights && Number.isFinite(reportedMinNights)) {
      setSectionDateValidationError(`Minimum stay is ${reportedMinNights} nights.`);
      return;
    }
    setSectionDateValidationError("");
  }, [sectionCheckIn]);

  useEffect(() => {
    if (!isStayTooShort || !sectionCheckIn || !sectionCheckOut) return;
    setSectionAvailability([]);
    setSectionAvailabilityMap({});
    setSectionAvailabilityActive(false);
    setSectionQuotes({});
    setSectionAvailabilityError(stayTooShortMessage);
  }, [isStayTooShort, sectionCheckIn, sectionCheckOut, stayTooShortMessage]);

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
    if (cacheRef.current[key]) {
      const cachedDays = daysRef.current[listingId] || {};
      if (countMonthCalendarDays(cachedDays, targetDate) < 20) {
        fetchCalendarMinNightsFromMulti(listingId, targetDate);
      }
      return;
    }
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
      if (countMonthCalendarDays(existingDays, targetDate) < 20) {
        fetchCalendarMinNightsFromMulti(listingId, targetDate);
      }
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
    const existingMap = calendarDaysRef.current[listingId] || {};
    const existingMonthDays = countMonthCalendarDays(existingMap, targetDate);
    if (calendarMinNightsCacheRef.current[key] && existingMonthDays >= 20) return;
    calendarMinNightsCacheRef.current[key] = true;
    try {
      const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 12, 1);
      const listingKey = toLookupKey(listingId);
      const activeListingCalendarId = toLookupKey(
        getCalendarListingId(activeListing, miamiBeachListings)
      );
      const baseListing =
        activeListing && activeListingCalendarId === listingKey
          ? activeListing
          : miamiBeachListings.find((listing) => {
            const ids = [listing?.id, listing?._id, listing?.unitTypeId]
              .map(toLookupKey)
              .filter(Boolean);
            return ids.includes(listingKey);
          }) || null;
      const listingGroupKey = getListingGroupKey(baseListing);
      const listingPool =
        listingGroupKey
          ? miamiBeachListings.filter(
            (listing) => getListingGroupKey(listing) === listingGroupKey
          )
          : baseListing
            ? [baseListing]
            : [];
      const groupedListingIds = getCalendarLookupIdsForListings(listingPool);
      const calendarListingIds = groupedListingIds.length
        ? groupedListingIds
        : [listingKey].filter(Boolean);
      if (!calendarListingIds.length) return;
      const qs = new URLSearchParams({
        listingIds: calendarListingIds.join(","),
        startDate: toISODate(monthStart),
        endDate: toISODate(monthEnd),
        includeAllotment: "true",
      }).toString();
      const res = await fetch(`${apiBase}/check-units/listings/calendar-multi?${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const currencyByListingId = getListingCurrencyLookup(listingPool);
      const daysByListing = buildNormalizedCalendarDaysByListing(
        data,
        calendarListingIds,
        currencyByListingId
      );
      let normalizedDays = Object.values(buildLowestPriceCalendarByDate(daysByListing));
      if (!normalizedDays.length && Array.isArray(daysByListing[listingKey])) {
        normalizedDays = daysByListing[listingKey];
      }
      if (!normalizedDays.length) {
        const fallbackListingId = calendarListingIds.find(
          (id) => Array.isArray(daysByListing[id]) && daysByListing[id].length
        );
        normalizedDays = fallbackListingId ? daysByListing[fallbackListingId] : [];
      }
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
          map[day.date] = mergeCalendarDay(map[day.date], day);
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

  const fetchSectionCalendarMultiMonth = async (listingIds, targetDate, { force = false } = {}) => {
    const normalizedListingIds = [...new Set((listingIds || []).map(toLookupKey).filter(Boolean))];
    if (!normalizedListingIds.length) return;
    const primaryId =
      toLookupKey(getPrimaryListingId(activeSection?.listings || [])) || normalizedListingIds[0];
    const sectionCalendarKey = getSectionCalendarKey(activeSection, activeSection?.listings || []);
    const cacheKeyBase = sectionCalendarKey || primaryId;
    if (!cacheKeyBase) return;
    const key = `${cacheKeyBase}-${monthKey(targetDate)}`;
    if (!force && sectionCalendarCacheRef.current[key]) {
      const cachedDays = sectionCalendarDaysRef.current[cacheKeyBase];
      if (cachedDays && Object.keys(cachedDays).length) {
        setSectionCalendarPrices(buildCalendarPayload(cachedDays));
        setSectionCalendarAvailability(sectionCalendarAvailabilityRef.current[cacheKeyBase] || {});
        return;
      }
      delete sectionCalendarCacheRef.current[key];
      setSectionCalendarAvailability(sectionCalendarAvailabilityRef.current[cacheKeyBase] || {});
    }

    setSectionCalendarLoading(true);
    setSectionCalendarError("");

    try {
      const monthStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      const monthEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 12, 1);
      const calendarListingIds = normalizedListingIds;
      if (!calendarListingIds.length) {
        setSectionCalendarAvailability({});
        return;
      }
      const currencyByListingId = getListingCurrencyLookup(activeSection?.listings || []);
      const pricingListing = getLowestPriceListing(activeSection?.listings || []);
      const pricingListingIdCandidates = [
        toLookupKey(getListingId(pricingListing)),
        toLookupKey(pricingListing?.unitTypeId),
        calendarListingIds[0],
      ].filter(Boolean);
      const qs = new URLSearchParams({
        listingIds: calendarListingIds.join(","),
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

      const daysByListing = buildNormalizedCalendarDaysByListing(
        data,
        calendarListingIds,
        currencyByListingId
      );
      const availabilityByDate = buildDateAvailabilityMapFromCalendars(daysByListing);
      let pricingDays = Object.values(buildLowestPriceCalendarByDate(daysByListing));
      if (!pricingDays.length) {
        pricingListingIdCandidates.some((candidateId) => {
          const days = daysByListing[candidateId];
          if (Array.isArray(days) && days.length) {
            pricingDays = days;
            return true;
          }
          return false;
        });
      }
      if (!pricingDays.length) {
        const fallbackPricingId = calendarListingIds.find(
          (id) => Array.isArray(daysByListing[id]) && daysByListing[id].length
        );
        pricingDays = fallbackPricingId ? daysByListing[fallbackPricingId] : [];
      }

      const existingDayMap = sectionCalendarDaysRef.current[cacheKeyBase] || {};
      const dayMap = {};
      pricingDays.forEach((day) => {
        if (!day?.date) return;
        dayMap[day.date] = mergeCalendarDay(existingDayMap[day.date], day);
      });

      if (Object.keys(dayMap).length) {
        const mergedDays = {
          ...existingDayMap,
          ...dayMap,
        };
        sectionCalendarDaysRef.current[cacheKeyBase] = mergedDays;
        if (primaryId && primaryId !== cacheKeyBase) {
          sectionCalendarDaysRef.current[primaryId] = mergedDays;
        }
        setSectionCalendarPrices(buildCalendarPayload(mergedDays));
        const minNightsOverride = extractMinNightsFromDays(Object.values(mergedDays));
        if (typeof minNightsOverride === "number") {
          setSectionCalendarMinNightsOverride(minNightsOverride);
        }
      }
      const mergedAvailability = {
        ...(sectionCalendarAvailabilityRef.current[cacheKeyBase] || {}),
        ...availabilityByDate,
      };
      sectionCalendarAvailabilityRef.current[cacheKeyBase] = mergedAvailability;
      if (primaryId && primaryId !== cacheKeyBase) {
        sectionCalendarAvailabilityRef.current[primaryId] = mergedAvailability;
      }
      setSectionCalendarAvailability(mergedAvailability);
      if (Object.keys(dayMap).length || Object.keys(availabilityByDate).length) {
        sectionCalendarCacheRef.current[key] = true;
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
    const listingIds = getCalendarLookupIdsForListings(activeSection.listings || []);
    if (!listingIds.length) return;
    fetchSectionCalendarMultiMonth(listingIds, baseDate, { force: true });
  };

  const handleListingCalendarOpen = (open) => {
    setIsListingCalendarOpen(open);
    if (!open || !activeListing) return;
    const baseDate = parseDateValue(sectionCheckIn) || new Date();
    baseDate.setDate(1);
    baseDate.setHours(0, 0, 0, 0);
    setCalendarStartDate(baseDate);
    setCalendarMonthIndex(0);
    const listingId = getCalendarListingId(activeListing, miamiBeachListings);
    if (!listingId) return;
    const loadMonth = (targetMonth) => {
      fetchCalendarMonth(
        listingId,
        targetMonth,
        calendarCacheRef,
        calendarDaysRef,
        calendarInflightRef,
        setCalendarLoading,
        setCalendarError,
        setCalendarPrices
      );
    };
    loadMonth(baseDate);
    if (isDesktopCalendarViewport()) {
      const nextVisibleMonth = addMonths(baseDate, 1);
      nextVisibleMonth.setDate(1);
      nextVisibleMonth.setHours(0, 0, 0, 0);
      loadMonth(nextVisibleMonth);
    }
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
    setSectionCalendarAvailability(sectionCalendarAvailabilityRef.current[listingId] || {});
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
    const stayNights = diffNights(sectionCheckIn, sectionCheckOut);
    if (stayNights === 0) {
      setSectionAvailabilityError("Please change the check-out date.");
      return;
    }
    if (stayNights > 0 && stayNights < requiredMinNightsForSelection) {
      setSectionAvailabilityError(`Minimum stay is ${requiredMinNightsForSelection} nights.`);
      return;
    }
    if (sectionDateValidationError) {
      setSectionAvailabilityError(sectionDateValidationError);
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
        if (activeSection?.listings?.length) return activeSection.listings;
        if (!activeListing) return [];
        const groupKey = getListingGroupKey(activeListing);
        if (!groupKey) return [activeListing];
        return miamiBeachListings.filter((listing) => getListingGroupKey(listing) === groupKey);
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
      const nights = stayNights;
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
      const lookupIds = [...new Set(items.map(toLookupKey).filter(Boolean))];
      const currencyByListingId = getListingCurrencyLookup(listingPool);
      const daysByListing = buildNormalizedCalendarDaysByListing(
        bulkJson,
        lookupIds,
        currencyByListingId
      );
      const aggregatedCalendarAvailability = buildDateAvailabilityMapFromCalendars(daysByListing);

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

      const calendarListingId = toLookupKey(listingId || getPrimaryListingId(listingPool));
      const sectionCalendarId = toLookupKey(getPrimaryListingId(listingPool) || calendarListingId);
      const sectionCalendarKey = getSectionCalendarKey(activeSection, listingPool) || sectionCalendarId;
      if (sectionCalendarKey) {
        const mergedAvailability = {
          ...(sectionCalendarAvailabilityRef.current[sectionCalendarKey] || {}),
          ...aggregatedCalendarAvailability,
        };
        sectionCalendarAvailabilityRef.current[sectionCalendarKey] = mergedAvailability;
        if (sectionCalendarId && sectionCalendarId !== sectionCalendarKey) {
          sectionCalendarAvailabilityRef.current[sectionCalendarId] = mergedAvailability;
        }
        setSectionCalendarAvailability(mergedAvailability);
      }
      const pricingCandidates = [calendarListingId, sectionCalendarId, ...lookupIds].filter(Boolean);
      let days = Object.values(buildLowestPriceCalendarByDate(daysByListing));
      let pricingCalendarId = null;
      if (!days.length) {
        pricingCalendarId =
          pricingCandidates.find((id) => Array.isArray(daysByListing[id]) && daysByListing[id].length) ||
          null;
        days = pricingCalendarId ? (daysByListing[pricingCalendarId] || []) : [];
      }
      if (days.length) {
        const sectionDayKey = sectionCalendarKey || sectionCalendarId || pricingCalendarId || calendarListingId;
        const existingSectionDays = sectionCalendarDaysRef.current[sectionDayKey] || {};
        const dayMap = {};
        days.forEach((day) => {
          if (!day?.date) return;
          dayMap[day.date] = mergeCalendarDay(existingSectionDays[day.date], day);
        });
        const mergedDays = {
          ...existingSectionDays,
          ...dayMap,
        };
        sectionCalendarDaysRef.current[sectionDayKey] = mergedDays;
        if (sectionCalendarId && sectionCalendarId !== sectionDayKey) {
          sectionCalendarDaysRef.current[sectionCalendarId] = mergedDays;
        }
        setSectionCalendarPrices(buildCalendarPayload(mergedDays));
        calendarMultiLoaded = true;
        const minNightsOverride = extractMinNightsFromDays(Object.values(mergedDays));
        if (typeof minNightsOverride === "number") {
          setSectionCalendarMinNightsOverride(minNightsOverride);
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
    const resolveRequiredMinNights = () => {
      const listing = listings.find(
        (entry) =>
          String(getListingId(entry) || entry?.unitTypeId || "") === String(listingId)
      );
      if (listing) {
        return normalizeMinNights(getListingMinNightsWithParent(listing, listings));
      }
      return GLOBAL_MIN_NIGHTS;
    };
    if (!sectionCheckIn || !sectionCheckOut) {
      setSectionAvailabilityError("Select check-in and check-out dates first.");
      return;
    }
    const stayNights = diffNights(sectionCheckIn, sectionCheckOut);
    if (stayNights === 0) {
      setSectionAvailabilityError("Please change the check-out date.");
      return;
    }
    const requiredMinNights = Math.max(
      resolveRequiredMinNights(),
      requiredMinNightsForSelection
    );
    if (stayNights < requiredMinNights) {
      const message = `Minimum stay is ${requiredMinNights} nights.`;
      setSectionAvailabilityError(message);
      setCheckoutGuestError(message);
      return;
    }
    if (sectionDateValidationError) {
      setSectionAvailabilityError(sectionDateValidationError);
      setCheckoutGuestError(sectionDateValidationError);
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      const message = "Pricing is unavailable. Please refresh availability.";
      setSectionAvailabilityError(message);
      setCheckoutGuestError(message);
      return;
    }

    const verification = await buildCheckoutVerificationPayload({
      identityDocs: checkoutIdentityDocs,
      cardPhoto: checkoutCardPhoto,
      cardHolderSelfie: checkoutCardHolderSelfie,
    });

    setCheckoutGuestError("");
    setSectionAvailabilityError("");
    setSectionReserveLoadingId(listingId);

    try {
      const checkoutEndpoint =
        numericAmount <= 0
          ? `${apiBase}/check-units/checkout-free`
          : `${apiBase}/api-checkout`;
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
          verification,
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
    if (!checkoutIdentityDocs.idFront || !checkoutIdentityDocs.idBack || !checkoutIdentityDocs.idSelfie) {
      setCheckoutIdentityError("Please upload ID front, ID back, and a selfie holding your ID.");
      return;
    }
    setCheckoutIdentityError("");
    if (!checkoutCardPhoto ||
                                      !checkoutCardHolderSelfie) {
      setCheckoutCardPhotoError("Please upload the credit card photo and a selfie while holding the card.");
      return;
    }
    setCheckoutCardPhotoError("");
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
  const isCheckoutIdentityValid = Boolean(
    checkoutIdentityDocs.idFront && checkoutIdentityDocs.idBack && checkoutIdentityDocs.idSelfie
  );
  const checkoutIdentityUploadedCount = [
    checkoutIdentityDocs.idFront,
    checkoutIdentityDocs.idBack,
    checkoutIdentityDocs.idSelfie,
  ].filter(Boolean).length;
  const checkoutCardUploadedCount = [checkoutCardPhoto, checkoutCardHolderSelfie].filter(Boolean).length;
  const isCheckoutCardPhotoValid = Boolean(checkoutCardPhoto && checkoutCardHolderSelfie);
  const canContinueToPayment =
    isCheckoutGuestValid &&
    isCheckoutIdentityValid &&
    isCheckoutCardPhotoValid &&
    checkoutConsentAccepted;

const applyCheckoutPromoCode = () => {
    const normalizedCode = checkoutPromoCode.trim().toUpperCase();
    if (!normalizedCode) {
      setCheckoutPromoError("Enter a discount code.");
      return;
    }
    const promo = CHECKOUT_PROMO_CODES[normalizedCode];
    if (!promo) {
      setCheckoutAppliedPromo(null);
      setCheckoutPromoError("Invalid code.");
      return;
    }
    setPendingCheckout((prev) => {
      if (!prev) return prev;
      const baseBreakdown = prev?.baseBreakdown && typeof prev.baseBreakdown === "object"
        ? prev.baseBreakdown
        : null;
      const baseAmountValue = Number.isFinite(Number(prev.baseAmount))
        ? Number(prev.baseAmount)
        : Number(prev?.baseBreakdown?.total ?? prev?.baseBreakdown?.subtotal ?? prev.amount);
      if (!Number.isFinite(baseAmountValue) || baseAmountValue <= 0) return prev;
      const accommodationBaseValue = Number(baseBreakdown?.accommodation);
      const promoBaseValue =
        Number.isFinite(accommodationBaseValue) && accommodationBaseValue > 0
          ? accommodationBaseValue
          : baseAmountValue;
      const promoDiscountAmount = Number((promoBaseValue * promo.rate).toFixed(2));
      const discountedTotal = Number(Math.max(baseAmountValue - promoDiscountAmount, 0).toFixed(2));
      const nextBreakdown = baseBreakdown
        ? {
            ...baseBreakdown,
            ...(Number.isFinite(accommodationBaseValue)
              ? {
                  accommodation: Number(
                    Math.max(accommodationBaseValue - promoDiscountAmount, 0).toFixed(2)
                  ),
                }
              : {}),
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

  const handleCheckoutIdentityChange = (field) => (event) => {
    const file = event.target.files?.[0] || null;
    setCheckoutIdentityDocs((prev) => ({ ...prev, [field]: file }));
    if (checkoutIdentityError) setCheckoutIdentityError("");
  };

  const handleCheckoutCardPhotoChange = (event) => {
    const file = event.target.files?.[0] || null;
    setCheckoutCardPhoto(file);
    if (checkoutCardPhotoError) setCheckoutCardPhotoError("");
  };

  const handleCheckoutCardHolderSelfieChange = (event) => {
    const file = event.target.files?.[0] || null;
    setCheckoutCardHolderSelfie(file);
    if (checkoutCardPhotoError) setCheckoutCardPhotoError("");
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
    const sourceListings = miamiBeachParentListings.length
      ? miamiBeachParentListings
      : miamiBeachListings;
    if (!sourceListings.length) return [];
    const fallbackImages = heroImages.length ? heroImages : [];
    return sourceListings.slice(0, 6).map((listing, index) => {
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
        title: sanitizeText(listing.title || "One Lux Stay Miami Beach"),
        price: priceValue ? `From ${formatCurrency(priceValue, listing.currency)}` : "",
      };
    });
  }, [heroImages, miamiBeachListings, miamiBeachParentListings]);
  const heroCards = useMemo(() => {
    if (!heroImages.length) return [];
    if (!bounceListings.length) {
      return heroImages.map((src, idx) => ({
        id: null,
        image: src,
        title: `Miami stay ${idx + 1}`,
      }));
    }
    return heroImages.map((src, idx) => {
      const listing = bounceListings[idx % bounceListings.length];
      return {
        id: listing?.id ?? null,
        image: listing?.image || src,
        title: listing?.title || `Miami stay ${idx + 1}`,
      };
    });
  }, [heroImages, bounceListings]);
  const inquiryTitle = inquiryListing?.title ? sanitizeText(inquiryListing.title) : "this unit";
  const inquiryDates =
    sectionCheckIn && sectionCheckOut ? `${sectionCheckIn} to ${sectionCheckOut}` : "";
  const cityDateRangeLabel =
    sectionCheckIn && sectionCheckOut
      ? `${formatDisplayDate(sectionCheckIn)} - ${formatDisplayDate(sectionCheckOut)}`
      : sectionCheckIn
        ? `Check-in ${formatDisplayDate(sectionCheckIn)}`
        : sectionCheckOut
          ? `Check-out ${formatDisplayDate(sectionCheckOut)}`
          : "No dates selected yet";
  const cityDateNightCount =
    sectionCheckIn && sectionCheckOut ? diffNights(sectionCheckIn, sectionCheckOut) : 0;
  const cityDateParams = new URLSearchParams();
  if (sectionCheckIn) cityDateParams.set("checkIn", sectionCheckIn);
  if (sectionCheckOut) cityDateParams.set("checkOut", sectionCheckOut);
  if (sectionGuests) cityDateParams.set("guests", sectionGuests);
  const editDatesHref = `/${cityDateParams.toString() ? `?${cityDateParams.toString()}` : ""}`;
  const buildSectionRoute = (sectionKey) => {
    const lowerPath = location.pathname.toLowerCase();
    const basePath = lowerPath.startsWith("/miami-beach") ? "/miami-beach" : "/miami";
    const areaSlug = SECTION_SLUG_BY_KEY[sectionKey] || "brickell";
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
    const lowerPath = location.pathname.toLowerCase();
    const basePath = lowerPath.startsWith("/miami-beach") ? "/miami-beach" : "/miami";
    navigate(basePath, {
      replace: true,
      state: { skipCityLoader: true },
    });
  };
  const buildListingPath = (listingId) => {
    const lowerPath = location.pathname.toLowerCase();
    const cityPath = lowerPath.startsWith("/miami-beach") ? "/miami-beach" : "/miami";
    if (!listingId) return cityPath;
    const params = new URLSearchParams();
    if (sectionCheckIn) params.set("checkIn", sectionCheckIn);
    if (sectionCheckOut) params.set("checkOut", sectionCheckOut);
    if (sectionGuests) params.set("guests", sectionGuests);
    const query = params.toString();
    return `${cityPath}/listing/${encodeURIComponent(listingId)}${query ? `?${query}` : ""}`;
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
    const basePrices = miamiBeachParentListings.map((l) => l.basePrice);
    const cleaningFees = miamiBeachParentListings.map((l) => l.cleaningFee);
    const bedrooms = miamiBeachParentListings.map((l) => l.bedrooms);
    const bathrooms = miamiBeachParentListings.map((l) => l.bathrooms);
    const sleeps = miamiBeachParentListings.map((l) => l.accommodates);
    const currencies = new Set(miamiBeachParentListings.map((l) => l.currency).filter(Boolean));
    const propertyTypes = new Set(
      miamiBeachParentListings
        .map((l) => l.propertyType)
        .filter((value) => typeof value === "string" && value.trim())
    );
    const propertyTypeLabel =
      propertyTypes.size === 1 ? [...propertyTypes][0] : propertyTypes.size ? "Multiple" : "--";

    return {
      units: miamiBeachParentListings.length,
      nightly: rangeLabel(basePrices),
      cleaning: rangeLabel(cleaningFees),
      bedrooms: rangeLabel(bedrooms),
      bathrooms: rangeLabel(bathrooms),
      sleeps: rangeLabel(sleeps),
      currency: currencies.size === 1 ? [...currencies][0] : "Multiple",
      propertyTypeLabel,
    };
  }, [miamiBeachParentListings]);

  const tourSlides = CITY_TOUR_SLIDES[tourCity] || CITY_TOUR_SLIDES.Brickell || [];
  const tourCount = tourSlides.length;
  const activeTourSlide = tourSlides[tourIndex] || tourSlides[0] || {};
  const mapPlaceholderImage = tourSlides[0]?.image || CITY_TOUR_SLIDES.Brickell?.[0]?.image || "";

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
            <p className="la-listing-hero__kicker">Miami private stay</p>
            <h3>{formatListingLocationLabel(activeListing, "Miami")}</h3>
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
        const isBrickellUnit = getBuildingKey(activeListing) === "miami-south-beach";
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
        const targetDailyRateDate = sectionCheckIn || toISODate(new Date());
        const dailyRateDay =
          calendarDayMap.get(targetDailyRateDate) ||
          sectionCalendarDayMap.get(targetDailyRateDate) ||
          null;
        const dailyRate = firstNumber(
          dailyRateDay?.price,
          plan?.nightly,
          plan?.pricing?.nightly,
          plan?.basePricePerNight,
          quote?.pricing?.nightly,
          quote?.nightly,
          activeListing?.prices?.basePricePerNight,
          activeListing?.prices?.nightly,
          activeListing?.prices?.basePrice?.amount,
          activeListing?.prices?.nightly?.amount,
          activeListing?.basePrice
        );
        const dailyRateCurrency =
          dailyRateDay?.currency ||
          plan?.currency ||
          quote?.currency ||
          activeListing?.prices?.nightly?.currency ||
          activeListing?.prices?.basePrice?.currency ||
          activeListing?.currency ||
          priceCurrency;
        const totalPrice =
          breakdown?.total ??
          breakdown?.subtotal ??
          plan?.total ??
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
                    onValidationChange={handleSectionDateValidation}
                    onChange={({ checkIn, checkOut }) => {
                      setSectionCheckIn(checkIn);
                      setSectionCheckOut(checkOut);
                    }}
                    onMonthChange={(nextMonth) => {
                      const listingId = getCalendarListingId(activeListing, miamiBeachListings);
                      if (!listingId) return;
                      const monthStart = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
                      setCalendarStartDate(monthStart);
                      setCalendarMonthIndex(0);
                      const loadMonth = (targetMonth) => {
                        fetchCalendarMonth(
                          listingId,
                          targetMonth,
                          calendarCacheRef,
                          calendarDaysRef,
                          calendarInflightRef,
                          setCalendarLoading,
                          setCalendarError,
                          setCalendarPrices
                        );
                      };
                      loadMonth(monthStart);
                      if (isDesktopCalendarViewport()) {
                        const nextVisibleMonth = addMonths(monthStart, 1);
                        nextVisibleMonth.setDate(1);
                        nextVisibleMonth.setHours(0, 0, 0, 0);
                        loadMonth(nextVisibleMonth);
                      }
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
                    disabled={sectionAvailabilityLoading || isStayTooShort}
                    onClick={() => {
                      if (isStayTooShort) {
                        setSectionAvailabilityError(stayTooShortMessage);
                        return;
                      }
                      fetchAvailabilityListings({ shouldScroll: true });
                    }}
                  >
                    {sectionAvailabilityLoading ? "Checking..." : "Check availability"}
                  </button>
                </div>
              </div>
            <div className="la-unit-modal__sidebar">
              <div className="la-unit-modal__contact" aria-label="Reservation contact">
                <p>For Reservation Contact</p>
                <strong>OneLuxStay Miami</strong>
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
                <strong>{formatCurrency(dailyRate, dailyRateCurrency)}</strong>
                <small>per night {"\u00b7"} taxes calculated at checkout</small>
                {isListingAvailable ? (
                  <button
                    type="button"
                    className="la-listing-hero__reserve"
                    disabled={sectionAvailabilityLoading || isStayTooShort}
                    onClick={() => {
                      if (isStayTooShort) {
                        setSectionAvailabilityError(stayTooShortMessage);
                        return;
                      }
                      fetchAvailabilityListings({ shouldScroll: true });
                    }}
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
                  <div className="la-unit-modal__actions">
                    {(() => {
                      const availability = listingId ? sectionAvailabilityMap[listingId] : null;
                      if (availability === true) {
                        const isReserving = sectionReserveLoadingId === listingId;
                        return (
                          <button
                            type="button"
                            className="la-unit-modal__action-primary"
                            disabled={sectionAvailabilityLoading || isReserving || isStayTooShort}
                            onClick={() => {
                              if (isStayTooShort) {
                                setSectionAvailabilityError(stayTooShortMessage);
                                return;
                              }
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
                              setCheckoutIdentityDocs({
                                idFront: null,
                                idBack: null,
                                idSelfie: null,
                              });
                              setCheckoutIdentityError("");
                              setCheckoutCardPhoto(null);
                              setCheckoutCardHolderSelfie(null);
                              setCheckoutCardPhotoError("");
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
                (checkoutStep === 2 && !isCheckoutIdentityValid) ||
                (checkoutStep === 3 && !isCheckoutCardPhotoValid) ||
                (checkoutStep === 4 &&
                  (!checkoutConsentAccepted ||
                    !checkoutConsentSignerName.trim() ||
                    !checkoutConsentSignatureDataUrl)) ||
                (checkoutStep === 6 &&
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
                <div className="la-inquiry-modal__upload-head">
                  <p className="la-inquiry-modal__upload-title">Identity verification</p>
                  <p className="la-inquiry-modal__upload-progress" aria-live="polite">
                    {checkoutIdentityUploadedCount} of 3 uploaded
                  </p>
                </div>
                <p className="la-inquiry-modal__fineprint la-inquiry-modal__fineprint--left">
                  Upload your ID front, ID back, and a selfie holding your ID to continue.
                </p>
                <div className="la-inquiry-modal__upload-grid">
                  <label
                    className={
                      "la-inquiry-modal__upload" +
                      (checkoutIdentityDocs.idFront ? " is-complete" : "")
                    }
                  >
                    <span>ID front</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      aria-label="Upload front side of ID"
                      onChange={handleCheckoutIdentityChange("idFront")}
                    />
                    <small>{checkoutIdentityDocs.idFront?.name || "Front side of government ID"}</small>
                  </label>
                  <label
                    className={
                      "la-inquiry-modal__upload" +
                      (checkoutIdentityDocs.idBack ? " is-complete" : "")
                    }
                  >
                    <span>ID back</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      aria-label="Upload back side of ID"
                      onChange={handleCheckoutIdentityChange("idBack")}
                    />
                    <small>{checkoutIdentityDocs.idBack?.name || "Back side of government ID"}</small>
                  </label>
                  <label
                    className={
                      "la-inquiry-modal__upload" +
                      (checkoutIdentityDocs.idSelfie ? " is-complete" : "")
                    }
                  >
                    <span>Selfie with ID</span>
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Upload selfie while holding ID"
                      onChange={handleCheckoutIdentityChange("idSelfie")}
                    />
                    <small>
                      {checkoutIdentityDocs.idSelfie?.name || "Clear selfie while holding your ID"}
                    </small>
                  </label>
                </div>
                {checkoutIdentityError && (
                  <p className="la-inquiry-modal__note is-error" role="status" aria-live="polite">
                    {checkoutIdentityError}
                  </p>
                )}
              </div>
            </Step>
            <Step>
              <div className="la-inquiry-modal__step">
                <div className="la-inquiry-modal__upload-head">
                  <p className="la-inquiry-modal__upload-title">Payment verification</p>
                  <p className="la-inquiry-modal__upload-progress" aria-live="polite">
                    {checkoutCardUploadedCount} of 2 uploaded
                  </p>
                </div>
                <p className="la-inquiry-modal__fineprint la-inquiry-modal__fineprint--left">
                  Upload the credit card photo and a selfie while holding the card.
                </p>
                <div className="la-inquiry-modal__payment-hint">
                  <LottieInlineHint
                    src="/oneluxstay-secure-payment-hint.json"
                    className="la-inquiry-modal__payment-lottie"
                    ariaLabel="Secure payment hint"
                  />
                  <p className="la-inquiry-modal__payment-note">
                    Security tip: cover the middle card digits and CVV before uploading.
                  </p>
                </div>
                <div className="la-inquiry-modal__upload-grid">
                  <label
                    className={
                      "la-inquiry-modal__upload" + (checkoutCardPhoto ? " is-complete" : "")
                    }
                  >
                    <span>Credit card photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Upload credit card photo"
                      onChange={handleCheckoutCardPhotoChange}
                    />
                    <small>{checkoutCardPhoto?.name || "Front of card, with middle digits covered"}</small>
                  </label>
                  <label
                    className={
                      "la-inquiry-modal__upload" + (checkoutCardHolderSelfie ? " is-complete" : "")
                    }
                  >
                    <span>Selfie with card</span>
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Upload selfie while holding card"
                      onChange={handleCheckoutCardHolderSelfieChange}
                    />
                    <small>{checkoutCardHolderSelfie?.name || "Clear selfie while holding the same card"}</small>
                  </label>
                </div>
                {checkoutCardPhotoError && (
                  <p className="la-inquiry-modal__note is-error" role="status" aria-live="polite">
                    {checkoutCardPhotoError}
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
                    <strong>ID verification</strong>
                    <span>Front: {checkoutIdentityDocs.idFront?.name || "--"}</span>
                    <span>Back: {checkoutIdentityDocs.idBack?.name || "--"}</span>
                    <span>Selfie with ID: {checkoutIdentityDocs.idSelfie?.name || "--"}</span>
                  </div>
                  <div>
                    <strong>Card verification</strong>
                    <span>Card photo: {checkoutCardPhoto?.name || "--"}</span>
                    <span>Selfie with card: {checkoutCardHolderSelfie?.name || "--"}</span>
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
          <ListingLoadingScreen active cityLabel="Miami Beach" />
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
      <div className="city-viewport-shell city-viewport-shell--dubai" ref={viewportShellRef}>
      {/* <section className="la-bounce-section" aria-label="Miami highlights">
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
            <h2 className="la-bounce-section__title">Miami moments in motion</h2>
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
      <section
        className="city-search-shell city-search-shell--dubai"
        aria-label="Search Miami stays"
        ref={stickySearchShellRef}
      >
        <div className="city-search-topline city-search-topline--breadcrumbs" aria-label="Location breadcrumb">
          <Link to="/" className="city-search-brand" aria-label="OneLuxStay home">
            <img src={LOGO_URL} alt="OneLuxStay logo" loading="lazy" onError={handleImageError} />
            <span className="city-search-brand__name">OneLuxStay</span>
          </Link>
          <nav className="city-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/" className="city-breadcrumbs__link">
              Home
            </Link>
            <span className="city-breadcrumbs__sep" aria-hidden="true">&gt;</span>
            <span className="city-breadcrumbs__current" aria-current="page">
              Miami
            </span>
          </nav>
        </div>
        <div className="city-search-bar">
          <label className="city-search-field city-search-field--location">
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
              onChange={(event) => setSearchQuery(event.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 120)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearchSubmit();
                }
              }}
              placeholder="Search by address or place"
              aria-label="Search by address or place"
            />
            {searchQuery ? (
              <button
                type="button"
                className="city-search-clear-btn"
                aria-label="Clear search"
                onClick={() => {
                  applySearchQuery("", { scrollToListings: false });
                }}
              >
                &times;
              </button>
            ) : null}
            <div
              className={`city-search-dropdown${
                isSearchFocused && filteredCitySuggestions.length ? " is-open" : ""
              }`}
              role="listbox"
              aria-label="Available cities"
            >
              {filteredCitySuggestions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="option"
                  className="city-search-dropdown__item"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    applySearchQuery(item.label, { scrollToListings: false });
                  }}
                >
                  <span className="city-search-dropdown__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path
                        d="M12 3a6.5 6.5 0 0 0-6.5 6.5c0 4.47 5.85 10.73 6.1 11a1 1 0 0 0 1.4 0c.25-.27 6.1-6.53 6.1-11A6.5 6.5 0 0 0 12 3zm0 9.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </label>
          <span className="city-search-divider" aria-hidden="true" />
          <div className="city-search-field city-search-field--dates">
            <DateRangePicker
              value={{ checkIn: sectionCheckIn, checkOut: sectionCheckOut }}
              onValidationChange={handleSectionDateValidation}
              onChange={({ checkIn, checkOut }) => {
                setSectionCheckIn(checkIn);
                setSectionCheckOut(checkOut);
              }}
            />
          </div>
          <span className="city-search-divider" aria-hidden="true" />
          <label className="city-search-field city-search-field--guests-inline">
            <span className="city-search-guests-label">Guests</span>
            <select
              className="city-search-guests-select"
              value={sectionGuests}
              onChange={(event) => setSectionGuests(event.target.value)}
              aria-label="Guests"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((guestCount) => (
                <option key={guestCount} value={String(guestCount)}>
                  {guestCount}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="city-search-clear city-search-clear--inline"
            onClick={() => {
              setSearchQuery("");
              setAppliedSearch("");
              setSectionCheckIn("");
              setSectionCheckOut("");
              setSectionGuests("2");
              setMinBedrooms(1);
              setShowMonthlyTotal(false);
            }}
          >
            Clear filters
          </button>
        </div>
        <p className="city-search-summary" aria-live="polite">
          Showing {filteredParentListings.length} of {miamiBeachParentListings.length} units.
        </p>
      </section>

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

        <section className="antwerp-section antwerp-section--split dubai-units-section" id="miami-beach-units">
          <div className="la-units-layout la-units-layout--split">
            <div className="la-units-main la-units-main--cards" aria-label="Available Miami units">
              {loading && (
                <div className="antwerp-loading">
                  <div className="antwerp-skeleton" />
                  <div className="antwerp-skeleton" />
                </div>
              )}

              {error && (
                <div role="alert" className="antwerp-error">
                  <span>{error}</span>
                </div>
              )}

              {!loading && !error && miamiBeachParentListings.length === 0 && (
                <div className="antwerp-empty">
                  No Miami listings are available in the current response.
                </div>
              )}

              {!loading && !error && miamiBeachParentListings.length > 0 && filteredParentListings.length === 0 && (
                <div className="antwerp-empty">
                  No units match your filters.
                </div>
              )}

              {!loading &&
                !error && filteredParentListings.length > 0 && (
                  <div className="la-unit-listing-grid">
                    {filteredParentListings.map((listing) => {
                    const listingId = getListingId(listing);
                    const listingPath = listingId ? buildListingPath(listingId) : "/miami";
                    const listingKey = listingId || listingPath;
                    const listingImages = getListingImageUrls(listing);
                    const cardImageSources = listingImages.length
                      ? listingImages
                      : [getImageUrl(listing?.picture) || FALLBACK_IMAGE];
                    const rawCardImageIndex = cardImageIndexes[listingKey] || 0;
                    const safeCardImageIndex =
                      ((rawCardImageIndex % cardImageSources.length) + cardImageSources.length) %
                      cardImageSources.length;
                    const dotWindowSize = 3;
                    const carouselDotIndexes =
                      cardImageSources.length <= dotWindowSize
                        ? cardImageSources.map((_, idx) => idx)
                        : (() => {
                            const maxStart = cardImageSources.length - dotWindowSize;
                            const start = Math.min(
                              Math.max(safeCardImageIndex - 1, 0),
                              maxStart
                            );
                            return Array.from(
                              { length: dotWindowSize },
                              (_, offset) => start + offset
                            );
                          })();
                    const imageUrl = cardImageSources[safeCardImageIndex] || FALLBACK_IMAGE;
                    const basePrice = firstNumber(
                      listing?.basePrice,
                      listing?.prices?.basePrice,
                      listing?.prices?.basePricePerNight,
                      listing?.prices?.nightly,
                      listing?.prices?.nightly?.amount,
                      listing?.prices?.basePrice?.amount
                    );
                    const originalPrice = firstNumber(
                      listing?.prices?.originalBasePrice,
                      listing?.prices?.monthly?.original,
                      listing?.pricing?.originalPrice,
                      listing?.originalPrice
                    );
                    const currency =
                      listing?.currency ||
                      listing?.prices?.currency ||
                      listing?.prices?.nightly?.currency ||
                      listing?.prices?.basePrice?.currency ||
                      "USD";
                    const bedrooms = firstNumber(listing?.bedrooms, listing?.beds);
                    const bathrooms = firstNumber(listing?.bathrooms);
                    const accommodates = firstNumber(listing?.accommodates);
                    const areaSqft = firstNumber(listing?.squareFeet, listing?.area, listing?.size?.value);
                    const nightlyPrice = getListingNightlyPrice(listing);
                    const quoteRateEntry = listingId ? cardQuoteRates[toLookupKey(listingId)] : null;
                    const displayCurrency = quoteRateEntry?.currency || currency;
                    const dailyRate = firstNumber(quoteRateEntry?.nightly, nightlyPrice, basePrice);
                    const stayNights = diffNights(sectionCheckIn, sectionCheckOut);
                    const canShowStayTotal =
                      showMonthlyTotal && stayNights > 0 && typeof dailyRate === "number";
                    const stayTotal = canShowStayTotal ? dailyRate * stayNights : null;
                    const priceMain = canShowStayTotal
                      ? `${formatCurrency(stayTotal, displayCurrency)} total`
                      : typeof dailyRate === "number"
                        ? `${formatCurrency(dailyRate, displayCurrency)} / night`
                        : "Check price";
                    const priceSub = canShowStayTotal
                      ? `${formatCurrency(dailyRate, displayCurrency)} / night | ${stayNights} ${stayNights === 1 ? "night" : "nights"}`
                      : "";
                    const hasStrikePrice =
                      typeof originalPrice === "number" &&
                      typeof dailyRate === "number" &&
                      originalPrice > dailyRate;

                    return (
                      <Link key={listingId || listingPath} to={listingPath} className="la-unit-listing-card">
                        <div className="la-unit-listing-card__media">
                          <img
                            key={`${listingKey}-image-${safeCardImageIndex}`}
                            className="la-unit-listing-card__media-image"
                            src={imageUrl || FALLBACK_IMAGE}
                            alt={sanitizeText(listing?.title || "One Lux Stay Miami")}
                            loading="lazy"
                            onError={handleImageError}
                          />
                          {cardImageSources.length > 1 ? (
                            <div
                              className="la-unit-listing-card__carousel"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              <button
                                type="button"
                                className="la-unit-listing-card__carousel-btn"
                                aria-label="Previous image"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setCardImageIndexes((prev) => ({
                                    ...prev,
                                    [listingKey]:
                                      (safeCardImageIndex - 1 + cardImageSources.length) %
                                      cardImageSources.length,
                                  }));
                                }}
                              >
                                &#8249;
                              </button>
                              <div className="la-unit-listing-card__carousel-dots" aria-hidden="true">
                                {carouselDotIndexes.map((idx) => (
                                  <span
                                    key={`${listingKey}-dot-${idx}`}
                                    className={`la-unit-listing-card__carousel-dot${
                                      idx === safeCardImageIndex ? " is-active" : ""
                                    }`}
                                  />
                                ))}
                              </div>
                              <button
                                type="button"
                                className="la-unit-listing-card__carousel-btn"
                                aria-label="Next image"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setCardImageIndexes((prev) => ({
                                    ...prev,
                                    [listingKey]: (safeCardImageIndex + 1) % cardImageSources.length,
                                  }));
                                }}
                              >
                                &#8250;
                              </button>
                            </div>
                          ) : null}
                          <span className="la-unit-listing-card__badge">Available now</span>
                          <span className="la-unit-listing-card__fav" aria-hidden="true">
                            &#9825;
                          </span>
                        </div>
                        <div className="la-unit-listing-card__body">
                          <p className="la-unit-listing-card__area">{resolveGroupTitle(listing)}</p>
                          <h3 className="la-unit-listing-card__title">
                            {sanitizeText(listing?.title || "One Lux Stay Miami")}
                          </h3>
                          <p className="la-unit-listing-card__price">
                            {hasStrikePrice ? (
                              <span className="la-unit-listing-card__price-strike">
                                {formatCurrency(originalPrice, currency)}
                              </span>
                            ) : null}
                            <span className="la-unit-listing-card__price-main">
                              {priceMain}
                            </span>
                            {priceSub ? (
                              <span className="la-unit-listing-card__price-sub">
                                {priceSub}
                              </span>
                            ) : null}
                          </p>
                          <p className="la-unit-listing-card__meta">
                            {[
                              bedrooms ? `${bedrooms} bd` : null,
                              bathrooms ? `${bathrooms} ba` : null,
                              accommodates ? `${accommodates} guests` : null,
                              areaSqft ? `${areaSqft} ft2` : null,
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
            <aside
              className={`la-units-aside la-units-aside--map${isMobileMapOpen ? " is-mobile-open" : ""}`}
              aria-label="Map with Miami unit locations"
            >
              <div className="la-mobile-map-header">
                <strong>Miami map</strong>
                <button type="button" onClick={() => setIsMobileMapOpen(false)} aria-label="Close map">
                  &times;
                </button>
              </div>
              {!isMapEnabled ? (
                <div
                  className="la-units-map la-units-map--panel la-units-map--placeholder"
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
                <div className="la-units-map la-units-map--panel is-error">
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
                  aria-label="Map showing Miami unit locations"
                  className="la-units-map la-units-map--panel"
                />
              )}
            </aside>
          </div>
        </section>
      </main>
      <div
        className={`la-mobile-map-actions${isMobileMapOpen ? " is-hidden" : ""}`}
        aria-label="Mobile map controls"
      >
        <button type="button" className="la-mobile-map-btn" onClick={() => setIsMobileMapOpen(true)}>
          View map
        </button>
      </div>
      </div>

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
                    case "miami-south-beach":
                      return "One Lux Stay Brickell Collection";
                    case "miami-mid-beach":
                      return "One Lux Stay Wynwood Collection";
                    case "miami-north-beach":
                      return "One Lux Stay Design District Collection";
                    case "other":
                      return "One Lux Stay Miami";
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
                activeSection.key === "miami-south-beach"
                  ? MIAMI_FACILITIES
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
                      <strong>OneLuxStay Miami</strong>
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
                  ? miamiBeachListings.filter(
                    (listing) => getListingGroupKey(listing) === getListingGroupKey(activeListing)
                  ).length
                    ? miamiBeachListings.filter(
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
                      dayAvailability={sectionCalendarAvailabilityMap}
                      onValidationChange={handleSectionDateValidation}
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
                      disabled={sectionAvailabilityLoading || isStayTooShort}
                      onClick={() => {
                        if (isStayTooShort) {
                          setSectionAvailabilityError(stayTooShortMessage);
                          return;
                        }
                        fetchAvailabilityListings({ shouldScroll: true });
                      }}
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
                <div role="columnheader">Action</div>
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
                      const rowMinNights = normalizeMinNights(
                        getListingMinNightsWithParent(listing, listings)
                      );
                      const rowTooShort =
                        sectionStayNights > 0 && sectionStayNights < rowMinNights;
                      const rowTooShortMessage = `Minimum stay is ${rowMinNights} nights.`;
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
                                  disabled={isLoadingRates || isReserving || rowTooShort}
                                  onClick={() => {
                                    if (rowTooShort) {
                                      setSectionAvailabilityError(rowTooShortMessage);
                                      return;
                                    }
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
                                    setCheckoutIdentityDocs({
                                      idFront: null,
                                      idBack: null,
                                      idSelfie: null,
                                    });
                                    setCheckoutIdentityError("");
                                    setCheckoutCardPhoto(null);
                                    setCheckoutCardHolderSelfie(null);
                                    setCheckoutCardPhotoError("");
                                    setCheckoutGuestError("");
                                    setIsCheckoutGuestOpen(true);
                                  }}
                                >
                                  {isReserving ? "Redirecting..." : "Reserve"}
                                </button>
                              )}
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
                <strong>OneLuxStay Miami</strong>
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
                <h3>{formatListingLocationLabel(activeListing, "Miami")}</h3>
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
              const isBrickellUnit = getBuildingKey(activeListing) === "miami-south-beach";
              const popularFacilities = isBrickellUnit
                ? MIAMI_FACILITIES
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
                                disabled={sectionAvailabilityLoading || isReserving || isStayTooShort}
                                onClick={() => {
                                  if (isStayTooShort) {
                                    setSectionAvailabilityError(stayTooShortMessage);
                                    return;
                                  }
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
                                  setCheckoutIdentityDocs({
                                    idFront: null,
                                    idBack: null,
                                    idSelfie: null,
                                  });
                                  setCheckoutIdentityError("");
                                  setCheckoutCardPhoto(null);
                                  setCheckoutCardHolderSelfie(null);
                                  setCheckoutCardPhotoError("");
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
                      dayAvailability={sectionCalendarAvailabilityMap}
                onValidationChange={handleSectionDateValidation}
                isLoading={sectionCalendarLoading}
                fallbackPrice={activeSection?.listings?.[0]?.basePrice}
                fallbackCurrency={activeSection?.listings?.[0]?.currency || "USD"}
                fallbackMinNights={sectionMinNightsFallback}
                onMonthChange={(month) => {
                  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
                  if (!activeSection) return;
                  const listingIds = getCalendarLookupIdsForListings(activeSection.listings || []);
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
              <button
                type="button"
                disabled={sectionAvailabilityLoading || isStayTooShort}
                onClick={() => {
                  if (isStayTooShort) {
                    setSectionAvailabilityError(stayTooShortMessage);
                    return;
                  }
                  fetchAvailabilityListings({ shouldScroll: true });
                }}
              >
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
                        const minNights = normalizeMinNights(
                          price?.restrictions?.minNights ?? listingMinNightsFallback ?? null
                        );
                        const showMinNights = minNights > 1;
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
