import { useEffect, useMemo, useRef, useState, useId } from "react";
import { useParams } from "react-router-dom";
import getBedDetails, { splitBedDetailLine } from "./utils/bedDetails";
import { filterLowQualityImages, getImageKeyFromUrl } from "./utils/imageQuality";
import apiBase from "./utils/apiBase";
import { buildWhatsAppHref, buildWhatsAppLabel, resolveListingContactProfile } from "./utils/contactConfig";
import { HIDDEN_UNIT_IDS } from "./config/hiddenUnits";
import {
  trackAvailabilityOpened,
  trackAvailabilitySearch,
  trackBookingRedirect,
  trackBookingStart,
  trackCalendarAbandoned,
  trackCtaClick,
  trackCityView,
  trackGalleryOpened,
  trackGalleryImageViewed,
  trackGuestCountChanged,
  trackInquiryStart,
  trackInquirySubmit,
  trackListingView,
  trackWhatsAppClick,
} from "./lib/analytics";
import "./App.css";
const checkoutBase = apiBase;

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

const getImageKey = (value) => {
  const url = extractImageUrl(value);
  return getImageKeyFromUrl(url);
};

const getListingImageUrls = (listing) => {
  if (!listing) return [];
  const urls = [];
  const seen = new Set();
  const addUrl = (value) => {
    const url = extractImageUrl(value);
    if (!url) return;
    const key = getImageKey(url);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    urls.push(url);
  };
  const collectImage = (image) => {
    if (!image) return;
    addUrl(image);
    const variants = [
      image.original,
      image.large,
      image.regular,
      image.thumbnail,
      image.medium,
      image.preview,
    ];
    variants.forEach(addUrl);
  };
  const hasPictures = Array.isArray(listing.pictures) && listing.pictures.length > 0;
  if (!hasPictures) collectImage(listing.picture);
  if (hasPictures) {
    listing.pictures.forEach(collectImage);
  }
  const unique = Array.from(new Set(urls));
  return filterLowQualityImages(unique);
};

const getPrimaryListingImage = (listing) => getListingImageUrls(listing)[0] || "";


const formatCurrency = (value, currency = "USD") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    : "--";

const BedIcon = () => (
  <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
    <path d="M3 10.5c0-1.7 1.3-3 3-3h12c1.7 0 3 1.3 3 3V20h-2v-3H5v3H3v-9.5zm2 4.5h14v-4.5c0-.6-.4-1-1-1H6c-.6 0-1 .4-1 1V15zm2-8h2v2H7V7zm8 0h2v2h-2V7z" />
  </svg>
);

const KNOWN_CITIES = [
  "hollywood",
  "los angeles",
  "antwerp",
  "antwerpen",
  "dubai",
  "redondo beach",
  "miami",
  "miami beach",
];
const REDONDO_MONTHLY_RANGE_LABEL = "$4,500 – $6,500 / month";
const REDONDO_MONTHLY_RANGE_NOTE = "Seasonal Monthly Pricing";

const cityFromSlug = (slug) => {
  if (!slug) return "";
  const lower = slug.toLowerCase();
  if (lower === "los-angeles" || lower === "losangeles") return "Los Angeles";
  if (lower === "hollywood") return "Hollywood";
  if (lower === "antwerp" || lower === "antwerpen") return "Antwerp";
  if (lower === "miami" || lower === "miami-beach") return "Miami";
  if (lower === "redondo-beach") return "Redondo Beach";
  if (lower === "dubai") return "Dubai";
  return lower
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const normalizeCity = (listing) => {
  const titleLower = typeof listing.title === "string" ? listing.title.toLowerCase() : "";
  if (titleLower.includes("hollywood")) return "Hollywood";

  const primary = listing.city || listing.address?.city;
  if (primary) {
    const trimmed = primary.trim();
    if (trimmed.toLowerCase() === "miami beach") return "Miami";
    return trimmed;
  }

  const tagCity =
    Array.isArray(listing.tags) &&
    listing.tags.find((t) => typeof t === "string" && KNOWN_CITIES.includes(t.toLowerCase()));
  if (tagCity) {
    const trimmed = tagCity.trim();
    if (trimmed.toLowerCase() === "miami beach") return "Miami";
    return trimmed;
  }

  if (titleLower) {
    const match = KNOWN_CITIES.find((c) => titleLower.includes(c));
    if (match) {
      if (match === "miami beach") return "Miami";
      return match
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  return (listing.address?.full || "").trim();
};

const initialSearch = {
  checkIn: "",
  checkOut: "",
  adults: 1,
  children: 0,
};

const parseDate = (value) => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const parseHiddenList = (value = "") =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const getListingId = (listing) => listing?.id || listing?._id || listing?.unitTypeId || "";

const isChildListing = (listing) => {
  const type = typeof listing?.type === "string" ? listing.type.toUpperCase() : "";
  if (type.includes("CHILD")) return true;
  if (listing?.parentId || listing?.parentListingId) return true;
  return false;
};

const getListingGroupKey = (listing) =>
  listing?.unitTypeId ||
  listing?.parentId ||
  listing?.parentListingId ||
  getListingId(listing);

const groupListingsByParent = (listings = []) => {
  const groups = new Map();
  listings.forEach((listing) => {
    const key = getListingGroupKey(listing);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { parent: null, children: [] });
    if (isChildListing(listing)) groups.get(key).children.push(listing);
    else groups.get(key).parent = listing;
  });
  return groups;
};

const HIDDEN_LISTING_IDS = [
  ...new Set([...parseHiddenList(import.meta.env.VITE_HIDDEN_LISTING_IDS), ...HIDDEN_UNIT_IDS]),
];
const REDONDO_ONLY_VISIBLE_UNIT_IDS = new Set([
  "6948d9855a49ec0013d81ab5",
]);
const isAllowedRedondoListing = (listing) =>
  [
    listing?.id,
    listing?._id,
    listing?.unitTypeId,
    listing?.parentId,
    listing?.parentListingId,
    listing?.listingId,
    listing?.unitId,
    listing?.propertyId,
  ]
    .map((value) => String(value || "").trim())
    .some((value) => value && REDONDO_ONLY_VISIBLE_UNIT_IDS.has(value));
const HIDDEN_LISTING_TITLES = parseHiddenList(import.meta.env.VITE_HIDDEN_LISTING_TITLES).map((t) =>
  t.toLowerCase(),
);

const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatDisplayDate = (value) => {
  const d = parseDate(value);
  if (!d) return "Add date";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const DateRangePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const hasOpenedRef = useRef(false);
  const checkInLabelId = useId();
  const checkOutLabelId = useId();
  const dialogId = useId();
  const dialogHelpId = useId();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [view, setView] = useState(() => parseDate(value.checkIn) || today);
  const containerRef = useRef(null);

  const startDate = parseDate(value.checkIn);
  const endDate = parseDate(value.checkOut);

  useEffect(() => {
    const handleClick = (e) => {
      if (!open) return;
      if (containerRef.current && containerRef.current.contains(e.target)) return;
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

  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true;
      return;
    }
    if (!hasOpenedRef.current) return;
    if (startDate && !endDate) {
      trackCalendarAbandoned({
        source_page: window.location.pathname + window.location.search,
        source_location: "listing_date_picker",
      });
    }
  }, [open, startDate, endDate]);

  useEffect(() => {
    if (!open) return;
    const base = startDate || today;
    setView((prev) => {
      const sameMonth = prev.getFullYear() === base.getFullYear() && prev.getMonth() === base.getMonth();
      return sameMonth ? prev : base;
    });
  }, [open, startDate, today]);

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
    if (nextStart && nextEnd) setOpen(false);
  };

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
    <div className="relative" ref={containerRef}>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label id={checkInLabelId} className="text-xs text-slate-300">Check-in</label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkInLabelId}
            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {formatDisplayDate(value.checkIn)}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label id={checkOutLabelId} className="text-xs text-slate-300">Check-out</label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkOutLabelId}
            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
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
          className="absolute left-0 z-50 mt-3 w-[660px] max-w-[92vw] rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl listing-date-dropdown"
        >
          <p id={dialogHelpId} className="sr-only">
            Select a check-in date and a check-out date. Use the previous and next buttons to change months.
          </p>
          <div className="flex items-center justify-between px-4 py-3 text-white border-b border-white/5">
            <div className="font-semibold text-lg">{monthLabel}</div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="h-9 w-9 rounded-md bg-amber-400 text-slate-900 font-bold"
              >
                {"<"}
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="h-9 w-9 rounded-md bg-amber-400 text-slate-900 font-bold"
              >
                {">"}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[primaryMonth, secondaryMonth].map((monthObj) => (
                <div key={`${monthObj.year}-${monthObj.month}`} className="space-y-2">
                  <div className="flex items-center justify-between text-white font-semibold">
                    <span>
                      {new Date(monthObj.year, monthObj.month, 1).toLocaleDateString(undefined, {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-300" role="row">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} role="columnheader">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2" role="grid">
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
                          className={`listing-date-cell h-10 rounded-lg border text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${stateClass} ${disabled
                            ? "border-transparent text-slate-600"
                            : selected
                              ? "border-amber-300 bg-amber-400 text-slate-900 font-semibold"
                              : between
                                ? "border-amber-400/50 bg-amber-400/10 text-white"
                                : "border-slate-700 bg-slate-800 text-white hover:border-amber-300"
                            }`}
                        >
                          {day ? day.getDate() : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
              <button
                type="button"
                onClick={() => onChange({ checkIn: "", checkOut: "" })}
                className="rounded-md border border-white/10 bg-slate-800 px-3 py-2 hover:border-amber-300"
              >
                Clear dates
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-amber-400 px-3 py-2 font-semibold text-slate-900 hover:bg-amber-300"
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

function ListingPage() {
  const {
    listingId: routeListingId,
    citySlug,
    checkIn: routeCheckInParam,
    checkOut: routeCheckOutParam,
    guests: routeGuestsParam,
  } = useParams();
  const [listings, setListings] = useState([]);
  const [quote, setQuotes] = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [listingsError, setListingsError] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [availability, setAvailability] = useState({});
  const [activeListingId, setActiveListingId] = useState("");
  const [bookingInfo, setBookingInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [bookingState, setBookingState] = useState({ status: "idle", message: "" });
  const [cityFilter, setCityFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalListing, setModalListing] = useState(null);
  const [modalHero, setModalHero] = useState(null);
  const [paramsHydrated, setParamsHydrated] = useState(false);
  const [availabilityNotice, setAvailabilityNotice] = useState("");
  const [listingParamId, setListingParamId] = useState("");
  const modalTitleId = useId();
  const modalDescId = useId();
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastFocusRef = useRef(null);
  const listingParamHandledRef = useRef(false);
  const [isInquiryOpen, setIsInquiryOpen] = useState(false);
  const [inquiryListing, setInquiryListing] = useState(null);
  useEffect(() => {
    if (paramsHydrated) return;
    const qs = new URLSearchParams(window.location.search);
    const cityParam = qs.get("city") || qs.get("destination") || "";
    const routeCheckIn = parseDate(routeCheckInParam) ? routeCheckInParam : "";
    const routeCheckOut = parseDate(routeCheckOutParam) ? routeCheckOutParam : "";
    const routeGuests =
      Number.isFinite(Number(routeGuestsParam)) && Number(routeGuestsParam) > 0
        ? routeGuestsParam
        : "";
    const checkInParam = qs.get("checkIn") || routeCheckIn || "";
    const checkOutParam = qs.get("checkOut") || routeCheckOut || "";
    const guestsParam = qs.get("guests") || qs.get("adults") || routeGuests || "";
    const listingParam = qs.get("listingId") || qs.get("listing") || routeListingId || "";
    const routeCity = cityFromSlug(citySlug);

    if (cityParam || routeCity) setCityFilter(cityParam || routeCity);
    setSearch((prev) => ({
      ...prev,
      checkIn: checkInParam || prev.checkIn,
      checkOut: checkOutParam || prev.checkOut,
      adults: guestsParam ? Number(guestsParam) || prev.adults : prev.adults,
    }));
    if (listingParam) setListingParamId(listingParam);
    setParamsHydrated(true);
    if (window.location.hash === "#listings") {
      const anchor = document.querySelector("#listings");
      if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [paramsHydrated]);
  useEffect(() => {
    if (search.checkIn && search.checkOut) {
      setAvailabilityNotice("");
    }
  }, [search.checkIn, search.checkOut]);

  useEffect(() => {
    if (!isModalOpen) return;
    lastFocusRef.current = document.activeElement;
    const focusTarget = closeButtonRef.current || modalRef.current;
    if (focusTarget) focusTarget.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = modalRef.current
        ? Array.from(
          modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        )
        : [];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (lastFocusRef.current && lastFocusRef.current.focus) {
        lastFocusRef.current.focus();
      }
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!isInquiryOpen) return;
    const handleEsc = (event) => {
      if (event.key === "Escape") setIsInquiryOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isInquiryOpen]);

  useEffect(() => {
    if (!isModalOpen || !modalListing) return;
    trackGalleryOpened({
      listing_id: String(getListingId(modalListing)),
      listing_name: modalListing?.title || "",
      city: normalizeCity(modalListing),
      image_count: getListingImageUrls(modalListing).length,
      source_page: window.location.pathname + window.location.search,
    });
  }, [isModalOpen, modalListing]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Listings failed: ${res.status}`);
        const json = await res.json();
        const sanitizedListings = (json.results || []).filter((listing) => {
          const id = listing.id || listing._id;
          const normalizedId = String(id || "");
          const title = typeof listing.title === "string" ? listing.title.toLowerCase() : "";
          const isRedondoListing = normalizeCity(listing).toLowerCase() === "redondo beach";
          if (isRedondoListing) return isAllowedRedondoListing(listing) || REDONDO_ONLY_VISIBLE_UNIT_IDS.has(normalizedId);
          if (id && HIDDEN_LISTING_IDS.includes(id)) return false;
          if (!isRedondoListing && title && HIDDEN_LISTING_TITLES.some((hidden) => title.includes(hidden))) return false;
          return true;
        });

        setListings(sanitizedListings);
        setActiveListingId(sanitizedListings[0]?.id || "");
      } catch {
        setListingsError("Unable to load units from Guesty.");
      } finally {
        setLoadingListings(false);
      }
    };
    load();
  }, []);

  const nights = useMemo(() => {
    if (!search.checkIn || !search.checkOut) return 0;
    const start = parseDate(search.checkIn);
    const end = parseDate(search.checkOut);
    if (!start || !end) return 0;
    return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  }, [search.checkIn, search.checkOut]);

  const inquiryTitle = inquiryListing?.title ? inquiryListing.title : "this unit";
  const inquiryDates =
    search.checkIn && search.checkOut ? `${search.checkIn} to ${search.checkOut}` : "";
  const inquirySubject = `Inquiry: ${inquiryTitle}`;
  const inquiryBody =
    `Hi OneLuxStay,\n\nI'd like to inquire about ${inquiryTitle}.` +
    (inquiryDates ? `\nDates: ${inquiryDates}.` : "") +
    "\nPlease let me know about availability and options.\n\nThank you!";
  const inquiryEmailHref = `mailto:reservations@oneluxstay.com?subject=${encodeURIComponent(
    inquirySubject
  )}&body=${encodeURIComponent(inquiryBody)}`;
  const inquiryContactProfile = resolveListingContactProfile(inquiryListing);
  const inquiryWhatsAppNumber = inquiryContactProfile.whatsapp.digits;
  const inquiryWhatsAppHref = buildWhatsAppHref(inquiryWhatsAppNumber, inquiryBody);
  const inquiryWhatsAppLabel = buildWhatsAppLabel(inquiryContactProfile.whatsapp);

  const parentListings = useMemo(() => {
    const groups = groupListingsByParent(listings);
    return Array.from(groups.values())
      .map((group) => {
        const parent = group.parent || group.children[0];
        if (!parent) return null;
        const fallbackChild =
          group.children.find((child) => Array.isArray(child?.bedDetails) && child.bedDetails.length) ||
          group.children.find((child) => child?.bedType || child?.publicDescription) ||
          null;
        if (!fallbackChild) return parent;
        return {
          ...parent,
          bedDetails: parent.bedDetails || fallbackChild.bedDetails,
          bedType: parent.bedType || fallbackChild.bedType,
          publicDescription: parent.publicDescription || fallbackChild.publicDescription,
        };
      })
      .filter(Boolean);
  }, [listings]);

  const selectedListing = useMemo(
    () => parentListings.find((l) => l.id === activeListingId || l._id === activeListingId),
    [activeListingId, parentListings],
  );

  const cityOptions = useMemo(() => {
    const map = new Map();
    const forced = ["Hollywood", "Redondo Beach"];
    parentListings.forEach((l) => {
      const city = normalizeCity(l);
      if (!city) return;
      if (!map.has(city)) {
        const img = getPrimaryListingImage(l);
        map.set(city, { city, image: img });
      }
    });
    forced.forEach((city) => {
      if (!map.has(city)) map.set(city, { city, image: "" });
    });
    return [{ city: "All", image: "" }, ...Array.from(map.values())];
  }, [parentListings]);

  const filteredListings = useMemo(() => {
    if (cityFilter === "All") return parentListings;
    const match = cityFilter.toLowerCase();
    return parentListings.filter((l) => normalizeCity(l).toLowerCase() === match);
  }, [cityFilter, parentListings]);
  const availableCount = filteredListings.length;

  const modalAvailability = useMemo(() => {
    if (!modalListing) return null;
    return availability[modalListing.id] || null;
  }, [modalListing, availability]);
  const modalImages = useMemo(
    () => (modalListing ? getListingImageUrls(modalListing) : []),
    [modalListing],
  );

  useEffect(() => {
    if (!activeListingId && filteredListings[0]) {
      setActiveListingId(getListingId(filteredListings[0]));
      return;
    }
    const exists = filteredListings.some((l) => getListingId(l) === activeListingId);
    if (!exists && filteredListings[0]) {
      setActiveListingId(getListingId(filteredListings[0]));
    }
  }, [filteredListings, activeListingId]);

  const handleSearchChange = (key, value) => {
    setSearch((prev) => ({ ...prev, [key]: value }));
    if (key === "adults" || key === "children") {
      trackGuestCountChanged({
        field: key,
        value: String(value),
        source_page: window.location.pathname + window.location.search,
      });
    }
  };

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache: "no-store", ...options, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  };

  const checkAvailability = async (listing) => {
    if (!search.checkIn || !search.checkOut) {
      setAvailabilityNotice("Select check-in and check-out dates first.");
      return;
    }
    trackAvailabilitySearch({
      listing_id: String(getListingId(listing)),
      listing_name: listing?.title || "",
      city: normalizeCity(listing),
      check_in: search.checkIn,
      check_out: search.checkOut,
      adults: Number(search.adults) || 1,
      children: Number(search.children) || 0,
      source_page: window.location.pathname + window.location.search,
    });
    setAvailabilityNotice("");
    const requestKey = `${listing.id}:${search.checkIn}:${search.checkOut}:${search.adults}:${search.children}`;
    const existing = availability[listing.id];
    const isSameQuery =
      existing &&
      existing.lastQuery &&
      existing.lastQuery === requestKey;
    const isFresh =
      isSameQuery && existing.timestamp && Date.now() - existing.timestamp < 2 * 60 * 1000;
    if (isFresh || (existing && existing.status === "loading" && isSameQuery)) {
      return;
    }
    const adultsNum = Number.parseInt(search.adults, 10);
    const childrenNum = Number.parseInt(search.children, 10);
    const adults = Number.isFinite(adultsNum) ? Math.max(1, adultsNum) : 1;
    const children = Number.isFinite(childrenNum) ? Math.max(0, childrenNum) : 0;
    const guests = adults + children;

    setAvailability((prev) => ({
      ...prev,
      [listing.id]: { status: "loading", lastQuery: requestKey, timestamp: Date.now() },
    }));

    try {
      let availJson = null;
      try {
        const availabilityQs = new URLSearchParams({
          ids: String(listing.id),
          checkIn: search.checkIn,
          checkOut: search.checkOut,
          minOccupancy: String(guests),
        }).toString();
        const availRes = await fetchWithTimeout(
          `${apiBase}/check-units/listings/availability-query?${availabilityQs}`,
        );
        if (availRes.ok) {
          availJson = await availRes.json();
        }
      } catch {
        // ignore availability failure; fall back to quote result
      }

      const quoteRes = await fetchWithTimeout(`${apiBase}/check-units/reservations/quotes-bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              listingId: listing.id,
              checkInDateLocalized: search.checkIn,
              checkOutDateLocalized: search.checkOut,
              guestsCount: guests,
            },
          ],
        }),
      });

      if (!quoteRes.ok) {
        const errText = await quoteRes.text();
        throw new Error(errText || `Quote failed with ${quoteRes.status}`);
      }

      const quoteJson = await quoteRes.json();
      const quoteData = quoteJson?.results?.[String(listing.id)] || null;

      const isAvailable =
        (Array.isArray(availJson?.results)
          ? availJson.results.find(
            (entry) => String(entry?.id || "") === String(listing.id),
          )?.available
          : undefined) ??
        availJson?.isAvailable ??
        availJson?.available ??
        (typeof availJson?.status === "string" ? availJson.status === "AVAILABLE" : undefined);

      const ratePlan = quoteData?.rates?.ratePlans?.[0];
      const rpMoney =
        ratePlan?.money?.money ||
        ratePlan?.money ||
        quoteData?.money?.money ||
        quoteData?.money ||
        null;
      const quoteMoney = rpMoney || null;

      const quoteDays = ratePlan?.days || [];
      const quoteCurrency = quoteMoney?.currency || quoteDays[0]?.currency || listing.currency || "USD";

      const quotedNights = Array.isArray(quoteDays) && quoteDays.length > 0 ? quoteDays.length : nights;
      const daySum = Array.isArray(quoteDays)
        ? quoteDays.reduce((sum, d) => {
          const price = d?.price ?? d?.manualPrice ?? d?.basePrice;
          return sum + (typeof price === "number" ? price : 0);
        }, 0)
        : null;

      const invoiceItems = Array.isArray(quoteMoney?.invoiceItems) ? quoteMoney.invoiceItems : [];
      const invoiceItemsTotal = invoiceItems.length
        ? invoiceItems.reduce((sum, item) => {
          const amount = Number(item?.amount);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0)
        : null;

      const quoteTotalRaw =
        quoteMoney?.total ??
        quoteMoney?.totalPrice ??
        quoteData?.total ??
        quoteData?.price?.total ??
        quoteData?.price?.totalAmount ??
        quoteData?.price?.totalPrice ??
        (typeof quoteData?.price?.total === "object" ? quoteData.price.total.amount : null) ??
        invoiceItemsTotal ??
        quoteMoney?.subTotalPrice ??
        (typeof quoteData?.amount === "number" ? quoteData.amount : null) ??
        (typeof daySum === "number" && quotedNights ? daySum + (listing.cleaningFee || 0) : null);

      const quoteTotal = typeof quoteTotalRaw === "number" ? quoteTotalRaw : null;

      const quoteNightly =
        (quoteTotal && quotedNights ? quoteTotal / quotedNights : undefined) ??
        (typeof daySum === "number" && quotedNights ? daySum / quotedNights : undefined) ??
        (quoteDays[0]?.price ?? quoteDays[0]?.manualPrice ?? quoteDays[0]?.basePrice);

      const nightly = quoteNightly ?? listing.basePrice;
      const total = quoteTotal ?? (nightly && nights ? nightly * nights + (listing.cleaningFee || 0) : null);

      const breakdown = (() => {
        if (!invoiceItems.length) return null;
        const acc = { accommodation: 0, cleaning: 0, taxes: 0, fees: 0 };
        invoiceItems.forEach((item) => {
          const amt = typeof item?.amount === "number" ? item.amount : null;
          if (amt === null) return;
          const t = (item?.normalType || item?.type || "").toUpperCase();
          if (t === "AF" || t === "ACCOMMODATION_FARE") acc.accommodation += amt;
          else if (t === "CF" || t === "CLEANING_FEE") acc.cleaning += amt;
          else if (t === "OCT" || t === "TAX" || t === "OCCUPANCY_TAX") acc.taxes += amt;
          else acc.fees += amt;
        });
        return {
          ...acc,
          total:
            typeof quoteTotal === "number"
              ? quoteTotal
              : acc.accommodation + acc.cleaning + acc.taxes + acc.fees,
        };
      })();

      setAvailability((prev) => ({
        ...prev,
        [listing.id]: {
          status: "ready",
          available: isAvailable,
          nightly,
          total,
          breakdown,
          currency: quoteCurrency,
          lastQuery: requestKey,
          timestamp: Date.now(),
          raw: { availability: availJson, quote: quoteData },
        },
      }));
    } catch (err) {
      setAvailability((prev) => ({
        ...prev,
        [listing.id]: {
          status: "error",
          lastQuery: requestKey,
          timestamp: Date.now(),
          message:
            err?.name === "AbortError"
              ? "Guesty timed out. Please retry."
              : "Could not reach Guesty right now. Please retry.",
        },
      }));
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalListing(null);
    setModalHero(null);
  };

  const handleOpenModal = (listing) => {
    setBookingState({ status: "idle", message: "" });
    setAvailabilityNotice("");
    setModalListing(listing);
    setModalHero(getPrimaryListingImage(listing));
    setIsModalOpen(true);
    setActiveListingId(listing.id);
    trackListingView({
      listingId: String(getListingId(listing)),
      listingName: listing?.title || "",
      city: normalizeCity(listing),
      pageUrl: window.location.pathname + window.location.search,
    });
    trackAvailabilityOpened({
      listing_id: String(getListingId(listing)),
      listing_name: listing?.title || "",
      city: normalizeCity(listing),
      source_page: window.location.pathname + window.location.search,
      source_location: "listing_card",
    });
    trackCtaClick({
      ctaText: "check price & availability",
      location: "listing_card",
      sourcePage: window.location.pathname + window.location.search,
      city: normalizeCity(listing),
      listing: String(getListingId(listing)),
    });
    checkAvailability(listing);
  };

  useEffect(() => {
    if (!listingParamId || !listings.length || listingParamHandledRef.current) return;
    const match = listings.find((listing) => {
      const ids = [listing.id, listing._id, listing.unitTypeId].filter(Boolean).map(String);
      return ids.includes(String(listingParamId));
    });
    if (match) {
      listingParamHandledRef.current = true;
      handleOpenModal(match);
    }
  }, [listingParamId, listings, handleOpenModal]);

  const handleBook = async () => {
    if (!activeListingId) {
      setBookingState({ status: "error", message: "Select a unit first." });
      return;
    }
    if (!search.checkIn || !search.checkOut) {
      setBookingState({ status: "error", message: "Pick dates before booking." });
      return;
    }
    if (!bookingInfo.firstName || !bookingInfo.lastName || !bookingInfo.email) {
      setBookingState({ status: "error", message: "Fill in guest name and email." });
      return;
    }

    const avail = availability[activeListingId];
    if (!avail || avail.status !== "ready" || avail.available === false) {
      setBookingState({ status: "error", message: "This unit is not available for the selected dates yet." });
      return;
    }

    const amount = avail.total;
    const currency = avail.currency || selectedListing?.currency || "USD";
    if (!amount || amount <= 0) {
      setBookingState({ status: "error", message: "Pricing is missing. Please refresh availability." });
      return;
    }

    const guestsTotal =
      (Number.isFinite(Number(search.adults)) ? Number(search.adults) : 1) +
      (Number.isFinite(Number(search.children)) ? Number(search.children) : 0);
    trackBookingStart({
      listing_id: String(activeListingId),
      listing_name: selectedListing?.title || "",
      city: normalizeCity(selectedListing || {}),
      check_in: search.checkIn,
      check_out: search.checkOut,
      guests: guestsTotal,
      amount,
      currency,
      source_page: window.location.pathname + window.location.search,
    });

    setBookingState({ status: "loading", message: "" });

    try {
      const res = await fetch(`${checkoutBase}/check-units/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: activeListingId,
          listingTitle: selectedListing?.title,
          checkIn: search.checkIn,
          checkOut: search.checkOut,
          guests: guestsTotal,
          amount,
          currency,
          breakdown: avail.breakdown || null,
          guest: bookingInfo,
          cancelPath: `${window.location.pathname}${window.location.search}`,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || "Booking failed");
      }

      if (json.url) {
        trackBookingRedirect({
          listing_id: String(activeListingId),
          listing_name: selectedListing?.title || "",
          city: normalizeCity(selectedListing || {}),
          check_in: search.checkIn,
          check_out: search.checkOut,
          guests: guestsTotal,
          amount,
          currency,
          source_page: window.location.pathname + window.location.search,
        });
        window.location.href = json.url;
        return;
      }

      setBookingState({ status: "success", message: "Redirecting to payment..." });
    } catch (err) {
      setBookingState({ status: "error", message: err.message });
    }
  };

  return (
    <div className="listing-page min-h-screen">
      <div className="listing-backdrop" aria-hidden="true" />
      <div aria-hidden={isModalOpen ? "true" : undefined}>
        <header className="listing-hero relative z-20 max-w-6xl mx-auto px-6 pt-10 pb-8">
          <div className="flex flex-col gap-4 md:gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-amber-300">OneLuxStay</p>
              <h1 className="text-3xl md:text-4xl font-semibold text-white leading-tight">
                Direct booking portal connected to Guesty
              </h1>
              <p className="text-slate-300 mt-2 max-w-2xl">
                Live inventory, real-time price checks, and fast booking even on slow connections.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <div className="listing-panel listing-search-panel rounded-2xl p-4 shadow-lg backdrop-blur relative">
              <p className="text-sm font-semibold text-white mb-3">Search dates</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="lg:col-span-2">
                  <DateRangePicker
                    value={search}
                    onChange={(val) =>
                      setSearch((prev) => ({
                        ...prev,
                        checkIn: val.checkIn,
                        checkOut: val.checkOut,
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="listing-adults" className="text-xs text-slate-300">Adults</label>
                  <input
                    id="listing-adults"
                    type="number"
                    min="1"
                    value={search.adults}
                    onChange={(e) => handleSearchChange("adults", Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="listing-children" className="text-xs text-slate-300">Children</label>
                  <input
                    id="listing-children"
                    type="number"
                    min="0"
                    value={search.children}
                    onChange={(e) => handleSearchChange("children", Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                <p>
                  {nights > 0 ? `${nights} night stay selected` : "Select dates to check availability & rates"}
                </p>
              </div>
              {availabilityNotice && (
                <p role="status" aria-live="polite" className="mt-2 text-xs text-amber-200">
                  {availabilityNotice}
                </p>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 pb-14">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              Available units {availableCount > 0 ? `(${availableCount})` : ""}
            </h2>
          </div>

          {cityOptions.length > 1 && (
            <div className="mb-5 flex flex-wrap gap-3">
              {cityOptions.map(({ city, image }) => {
                const active = cityFilter === city;
                return (
                  <button
                    key={city}
                    onClick={() => {
                      setCityFilter(city);
                      if (city !== "All") {
                        trackCityView({
                          cityName: city,
                          sourcePage: window.location.pathname + window.location.search,
                          destinationCity: city,
                        });
                      }
                    }}
                    className={`listing-filter-btn group inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold tracking-wide transition ${active
                      ? "border-amber-400 bg-amber-500/15 text-amber-100 shadow-lg shadow-amber-500/20"
                      : "border-white/10 bg-white/5 text-slate-200 hover:border-amber-300/50 hover:text-white"
                      }`}
                  >
                    {image && (
                      <span className="h-8 w-8 overflow-hidden rounded-full border border-white/15 bg-slate-800">
                        <img src={image} alt={city} className="h-full w-full object-cover" loading="lazy" />
                      </span>
                    )}
                    <span>{city.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>
          )}

          {loadingListings && (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse">
                  <div className="h-40 rounded-xl bg-white/10" />
                  <div className="mt-3 h-4 w-2/3 bg-white/10 rounded" />
                  <div className="mt-2 h-3 w-1/2 bg-white/5 rounded" />
                </div>
              ))}
            </div>
          )}

          {listingsError && (
            <div role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
              {listingsError}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            {filteredListings.map((listing, index) => {
              const status = availability[listing.id] || {};
              const displayTotal = status.total;
              const displayNightly = status.nightly ?? listing.basePrice;
              const isRedondoListing = normalizeCity(listing).toLowerCase() === "redondo beach";
              const canBook = status.status === "ready" && status.available !== false;
              const showInquiry = status.status === "ready" && status.available === false;
              const cardImage = getPrimaryListingImage(listing);
              const derivedBedDetails = getBedDetails(listing);
              const bedDetails = derivedBedDetails.length
                ? derivedBedDetails
                : (listing.bedDetails || []);
              const bedItems = bedDetails.slice(0, 4);
              const bedExtra = bedDetails.length - bedItems.length;
              const bedLines = bedItems
                .map(splitBedDetailLine)
                .filter((line) => line.detail);

              return (
                <article
                  key={listing.id}
                  className="listing-card group rounded-2xl border p-4 shadow-lg transition"
                >
                  <div className="relative overflow-hidden rounded-xl bg-slate-900">
                    {cardImage ? (
                      <img
                        src={cardImage}
                        alt={listing.title}
                        loading={index < 2 ? "eager" : "lazy"}
                        className="h-48 w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="h-48 w-full bg-slate-800" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
                    <div className="listing-card__badge absolute bottom-3 left-3 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 backdrop-blur">
                      Sleeps {listing.accommodates} {listing.bedrooms} BR  -  {listing.bathrooms} BA
                    </div>

                  </div>
                  <div className="mt-3">
                    <div>
                      <p className="listing-card__kicker text-xs uppercase tracking-wide text-amber-200">
                        {listing.location || listing.timezone || "OneLuxStay"}
                      </p>
                      <h3 className="listing-card__title text-lg font-semibold text-white leading-tight">{listing.title}</h3>
                      <p className="listing-card__meta text-sm text-slate-300">
                        {isRedondoListing
                          ? REDONDO_MONTHLY_RANGE_LABEL
                          : `From ${formatCurrency(listing.basePrice, listing.currency)} / night  -  Cleaning: ${formatCurrency(listing.cleaningFee, listing.currency)}`}
                      </p>
                      {isRedondoListing ? (
                        <p className="listing-card__meta text-xs uppercase tracking-wide text-slate-400">
                          {REDONDO_MONTHLY_RANGE_NOTE}
                        </p>
                      ) : null}
                      {bedLines.length > 0 && (
                        <div className="listing-card__bed-details">
                          {bedLines.map((line, idx) => (
                            <div
                              key={`${listing.id}-bed-${idx}`}
                              className={`listing-card__bed-row${line.label ? "" : " is-single"}`}
                            >
                              {line.label ? (
                                <span className="listing-card__bed-room">{line.label}</span>
                              ) : null}
                              <span className="listing-card__bed-desc">
                                {line.detail}
                                <span className="listing-card__bed-icon">
                                  <BedIcon />
                                </span>
                              </span>
                            </div>
                          ))}
                          {bedExtra > 0 && (
                            <div className="listing-card__bed-more">+{bedExtra} more</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div role="status" aria-live="polite" className="listing-card__status mt-3 flex items-center gap-2 text-sm text-slate-200">
                    <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
                    {status.status === "ready" && status.available !== false && (
                      <span>
                        Available  -  {formatCurrency(displayNightly, status.currency)} avg/night{" "}
                        {displayTotal ? ` -  ${formatCurrency(displayTotal, status.currency)} total` : ""}
                      </span>
                    )}
                    {status.status === "ready" && status.available === false && <span>Not available for your dates</span>}
                    {status.status === "loading" && <span>Checking Guesty - </span>}
                    {status.status === "error" && <span className="text-rose-200">{status.message}</span>}
                    {status.status === undefined && <span>Click "Check price" to fetch live availability.</span>}
                  </div>

                  {status.status === "ready" && status.available !== false && status.breakdown && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
                      {status.breakdown.accommodation > 0 && (
                        <span>Stay: {formatCurrency(status.breakdown.accommodation, status.currency)}</span>
                      )}
                      {status.breakdown.cleaning > 0 && (
                        <span>Cleaning: {formatCurrency(status.breakdown.cleaning, status.currency)}</span>
                      )}
                      {status.breakdown.taxes > 0 && (
                        <span>Taxes: {formatCurrency(status.breakdown.taxes, status.currency)}</span>
                      )}
                      {status.breakdown.fees > 0 && (
                        <span>Fees: {formatCurrency(status.breakdown.fees, status.currency)}</span>
                      )}
                    </div>
                  )}


                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-analytics-explicit="true"
                      onClick={() => handleOpenModal(listing)}
                      aria-label={`Check price and availability for ${listing.title}`}
                      className="listing-btn rounded-lg px-3 py-2 text-sm font-semibold border transition"
                    >
                      Check price & availability
                    </button>
                    {canBook && (
                      <button
                        type="button"
                        data-analytics-explicit="true"
                        onClick={() => {
                          setActiveListingId(listing.id);
                          trackCtaClick({
                            ctaText: "book this stay",
                            location: "listing_card",
                            sourcePage: window.location.pathname + window.location.search,
                            city: normalizeCity(listing),
                            listing: String(getListingId(listing)),
                          });
                          handleBook();
                        }}
                        aria-label={`Book ${listing.title}`}
                        className="listing-btn-primary rounded-lg px-3 py-2 text-sm font-semibold shadow-lg transition"
                      >
                        Book this stay
                      </button>
                    )}
                    {showInquiry && (
                      <button
                        type="button"
                        onClick={() => {
                          setInquiryListing(listing);
                          setIsInquiryOpen(true);
                          trackInquiryStart({
                            listing_id: String(getListingId(listing)),
                            listing_name: listing?.title || "",
                            city: normalizeCity(listing),
                            source_page: window.location.pathname + window.location.search,
                            source_location: "listing_card",
                          });
                        }}
                        aria-label={`Inquire about ${listing.title}`}
                        className="listing-btn-primary rounded-lg px-3 py-2 text-sm font-semibold shadow-lg transition"
                      >
                        Inquire
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      </div>

      {isModalOpen && modalListing && (
        <div className="listing-modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overflow-x-hidden px-3 py-6 sm:px-4 sm:py-10 backdrop-blur">
          <div ref={modalRef} tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby={modalTitleId} aria-describedby={modalDescId} className="listing-modal relative w-full max-w-full sm:max-w-5xl rounded-2xl border shadow-[0_20px_80px_rgba(0,0,0,0.2)] overflow-hidden">
            <button
              ref={closeButtonRef}
              onClick={closeModal}
              aria-label="Close dialog"
              className="absolute right-3 top-3 rounded-full border border-amber-300/50 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:border-amber-400 hover:bg-amber-400/10"
            >
              Close
            </button>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Listing details</p>
                <h3 id={modalTitleId} className="text-2xl font-semibold text-white">{modalListing.title}</h3>
                <p id={modalDescId} className="text-sm text-amber-100/80">
                  {normalizeCity(modalListing) || modalListing.location || modalListing.propertyType || "OneLuxStay"}
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[3fr,2fr]">
                <div className="space-y-4 min-w-0">
                  <div className="listing-modal-media overflow-hidden rounded-xl border">
                    <img
                      src={modalHero || modalImages[0] || modalListing.picture}
                      alt={modalListing.title}
                      className="h-56 w-full min-w-0 object-cover sm:h-80"
                      loading="eager"
                    />
                  </div>
                  {modalImages.length > 0 && (
                    <div className="listing-modal-thumbs rounded-xl border p-3 overflow-hidden">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        {modalImages.map((src, index) => (
                          <button
                            key={`${src}-${index}`}
                            onClick={() => {
                              setModalHero(src);
                              trackGalleryImageViewed({
                                listing_id: String(getListingId(modalListing)),
                                listing_name: modalListing?.title || "",
                                city: normalizeCity(modalListing),
                                image_index: index + 1,
                                source_page: window.location.pathname + window.location.search,
                              });
                            }}
                            className="listing-thumb-btn h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg border focus:outline-none focus:ring-2 focus:ring-amber-400"
                          >
                            <img
                              src={src}
                              alt={modalListing.title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="listing-modal-panel space-y-4 rounded-xl border p-4 text-sm">
                  <div>
                    <p className="font-semibold text-amber-200">Description</p>
                    <p className="mt-1 whitespace-pre-line text-amber-100/80">
                      {modalListing.publicDescription?.summary || "No description provided."}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-amber-100/80">
                    <span>Bedrooms: {modalListing.bedrooms ?? "--"}</span>
                    <span>Bathrooms: {modalListing.bathrooms ?? "--"}</span>
                    <span>Accommodates: {modalListing.accommodates ?? "--"}</span>
                    <span>Property type: {modalListing.propertyType || "--"}</span>
                  </div>
                  {(() => {
                    const bedDetails = getBedDetails(modalListing);
                    const bedLines = bedDetails
                      .map(splitBedDetailLine)
                      .filter((line) => line.detail);
                    if (!bedLines.length) return null;
                    return (
                      <div className="listing-modal__bed-details">
                        {bedLines.map((line, idx) => (
                          <div
                            key={`modal-bed-${idx}`}
                            className={`listing-card__bed-row${line.label ? "" : " is-single"}`}
                          >
                            {line.label ? (
                              <span className="listing-card__bed-room">{line.label}</span>
                            ) : null}
                            <span className="listing-card__bed-desc">
                              {line.detail}
                              <span className="listing-card__bed-icon">
                                <BedIcon />
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="text-sm text-amber-100/90">
                    <p className="font-semibold text-amber-200">Dates</p>
                    <p className="mt-1">
                      {search.checkIn && search.checkOut
                        ? `${formatDisplayDate(search.checkIn)} ? ${formatDisplayDate(search.checkOut)}${nights
                          ? ` (${nights} night${nights === 1 ? "" : "s"})`
                          : ""
                        }`
                        : "No dates selected"}
                    </p>
                  </div>
                  {modalAvailability?.status === "ready" && modalAvailability?.available !== false && (
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="text-amber-300">
                        Available  -  {formatCurrency(modalAvailability.nightly, modalAvailability.currency)} avg/night{" "}
                        {modalAvailability.total
                          ? ` -  ${formatCurrency(modalAvailability.total, modalAvailability.currency)} total`
                          : ""}
                      </p>
                      {modalAvailability.breakdown && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-100/80">
                          {modalAvailability.breakdown.accommodation > 0 && (
                            <span>Stay: {formatCurrency(modalAvailability.breakdown.accommodation, modalAvailability.currency)}</span>
                          )}
                          {modalAvailability.breakdown.cleaning > 0 && (
                            <span>Cleaning: {formatCurrency(modalAvailability.breakdown.cleaning, modalAvailability.currency)}</span>
                          )}
                          {modalAvailability.breakdown.taxes > 0 && (
                            <span>Taxes: {formatCurrency(modalAvailability.breakdown.taxes, modalAvailability.currency)}</span>
                          )}
                          {modalAvailability.breakdown.fees > 0 && (
                            <span>Fees: {formatCurrency(modalAvailability.breakdown.fees, modalAvailability.currency)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {modalAvailability?.status === "ready" && modalAvailability?.available === false && (
                    <div className="space-y-2">
                      <p className="text-rose-300">Not available for your dates.</p>
                      <button
                        type="button"
                        className="listing-btn-primary w-full rounded-lg px-4 py-3 text-sm font-semibold shadow-lg transition"
                        onClick={() => {
                          setInquiryListing(modalListing);
                          setIsInquiryOpen(true);
                          trackInquiryStart({
                            listing_id: String(getListingId(modalListing)),
                            listing_name: modalListing?.title || "",
                            city: normalizeCity(modalListing),
                            source_page: window.location.pathname + window.location.search,
                            source_location: "listing_modal",
                          });
                        }}
                      >
                        Inquire about this unit
                      </button>
                    </div>
                  )}
                  {modalAvailability?.status === "loading" && <p className="text-amber-100/80">Checking Guesty - </p>}

                  {modalAvailability?.status === "ready" && modalAvailability?.available !== false && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-semibold text-amber-200">Booking</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <input
                          placeholder="First name"
                          aria-label="First name"
                          value={bookingInfo.firstName}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, firstName: e.target.value }))}
                          className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                        <input
                          placeholder="Last name"
                          aria-label="Last name"
                          value={bookingInfo.lastName}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, lastName: e.target.value }))}
                          className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                        <input
                          type="email"
                          placeholder="Email"
                          aria-label="Email"
                          value={bookingInfo.email}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, email: e.target.value }))}
                          className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                        <input
                          placeholder="Phone"
                          aria-label="Phone"
                          value={bookingInfo.phone}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, phone: e.target.value }))}
                          className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                        <input
                          placeholder="Notes / requests"
                          aria-label="Notes / requests"
                          value={bookingInfo.notes}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, notes: e.target.value }))}
                          className="sm:col-span-2 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                      </div>
                      <button
                        onClick={handleBook}
                        disabled={bookingState.status === "loading"}
                        className="listing-btn-primary w-full rounded-lg px-4 py-3 text-sm font-semibold shadow-lg transition disabled:opacity-60"
                      >
                        {bookingState.status === "loading" ? "Sending to Guesty..." : "Book this stay"}
                      </button>
                      {bookingState.message && (
                        <p role="status" aria-live="polite" className="text-xs text-amber-200">
                          {bookingState.message}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
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
              <a
                className="la-inquiry-modal__action"
                href={inquiryEmailHref}
                onClick={() =>
                  trackInquirySubmit({
                    listing_id: String(getListingId(inquiryListing)),
                    listing_name: inquiryTitle,
                    city: normalizeCity(inquiryListing || {}),
                    source_page: window.location.pathname + window.location.search,
                    submit_type: "email",
                  })
                }
              >
                Email reservations@oneluxstay.com
              </a>
                      <a
                        className="la-inquiry-modal__action is-whatsapp"
                        data-analytics-explicit="true"
                        href={inquiryWhatsAppHref}
                        target="_blank"
                rel="noreferrer"
                onClick={() => {
                  trackInquirySubmit({
                    listing_id: String(getListingId(inquiryListing)),
                    listing_name: inquiryTitle,
                    city: normalizeCity(inquiryListing || {}),
                    source_page: window.location.pathname + window.location.search,
                    submit_type: "whatsapp",
                  });
                  trackWhatsAppClick({
                    listing: String(getListingId(inquiryListing)),
                    city: normalizeCity(inquiryListing || {}),
                    sourcePage: window.location.pathname + window.location.search,
                    buttonType: "inquiry_whatsapp",
                    location: "listing_inquiry_modal",
                  });
                }}
              >
                {inquiryWhatsAppLabel}
              </a>
              <p className="la-inquiry-modal__note">We usually respond within an hour.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ListingPage;
