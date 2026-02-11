import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState, useMemo, useId } from "react";
import lottie from "lottie-web";
import "./App.css";
import SiteFooter from "./components/SiteFooter";
import CircularGallery from "./components/CircularGallery";
import ScrollStack, { ScrollStackItem } from "./components/ScrollStack";
import Silk from "./components/Silk";
import { filterLowQualityImages } from "./utils/imageQuality";

const rawApiBase = import.meta.env.VITE_API_BASE || "/.netlify/functions";
const apiBase = rawApiBase.replace(/\/index\/?$/, "");

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

const citySlugFromName = (value) => {
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower.includes("los angeles") || lower.includes("hollywood")) return "los-angeles";
  if (lower.includes("antwerp") || lower.includes("antwerpen")) return "antwerp";
  if (lower.includes("miami")) return "miami";
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
    if (trimmed.toLowerCase() === "miami beach") return "Miami";
    return trimmed;
  }

  const tagCity =
    Array.isArray(listing?.tags) &&
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

const getListingImage = (listing) => {
  const candidates = [];
  const direct = listing?.picture;
  if (typeof direct === "string") candidates.push(direct);
  if (direct?.regular) candidates.push(direct.regular);
  if (direct?.large) candidates.push(direct.large);
  if (direct?.thumbnail) candidates.push(direct.thumbnail);
  const firstPicture = listing?.pictures?.[0];
  if (typeof firstPicture === "string") candidates.push(firstPicture);
  if (firstPicture?.original) candidates.push(firstPicture.original);
  if (firstPicture?.thumbnail) candidates.push(firstPicture.thumbnail);
  const filtered = filterLowQualityImages(candidates.filter(Boolean));
  return filtered[0] || "";
};

const truncateLabel = (value, max = 36) => {
  if (typeof value !== "string") return "";
  return value.length > max ? `${value.slice(0, max - 1)}�` : value;
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
  const title = truncateLabel(listing?.title || "OneLuxStay", 36) || "OneLuxStay";
  const country = normalizeListingCountry(listing);
  const fallback = normalizeListingCity(listing);
  const subline = country || fallback;
  const nightly = quotePricing?.nightly ?? null;
  const currency = quotePricing?.currency || getListingCurrency(listing);
  const priceLabel = nightly
    ? `${formatCurrency(nightly, currency)} / night`
    : isLoading
      ? "Loading..."
      : "Price on request";
  return [title, subline, priceLabel].filter(Boolean).join("\n");
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

const stays = [
  {
    label: "The OneLuxStay way",
    headline: "Elevated with a rhythm that matches yours.",
    copy: "Every detail is intentional - layered lighting, tactile materials, silent climate control, and seamless tech. Your concierge orchestrates arrivals, perks, and departures.",
    image:
      "https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    label: "Seamless arrivals",
    headline: "Design-first homes",
    copy: "Warm lighting, tactile textures, and cinematic views in every address.",
    image:
      "https://assets.guesty.com/image/upload/v1730119087/production/666b3af27fc6d5653142b0af/npeczkhmy9wff4lzuyvr.jpg",
  },
  {
    label: "Hotel-grade service",
    headline: "Concierge, daily refresh",
    copy: "In-home experiences tailored to you with on-call support for every stay.",
    image:
      "https://assets.guesty.com/image/upload/v1760535614/production/666b3af27fc6d5653142b0af/t7p3cc6hqez89wsmj1gt.jpg",
  },
  {
    label: "Instant availability",
    headline: "Real-time calendars",
    copy: "Stay dates and pricing update live across every unit in our collection.",
    image:
      "https://assets.guesty.com/image/upload/v1732914973/production/666b3af27fc6d5653142b0af/jpotm8nwcbvufegnbcnx.jpg",
  },
  {
    label: "How it works",
    headline: "Reserve + Unwind",
    copy: "Live availability, transparent pricing, and concierge on standby. Arrive to a prepared home with optional chef, spa, or driver.",
    image:
      "https://assets.guesty.com/image/upload/v1729089198/production/666b3af27fc6d5653142b0af/ksjnj1kppnbajljv9csi.jpg",
  },
];

const heroSlides = [
  "https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1800&auto=format&fit=crop&ixlib=rb-4.1.0",
  "https://assets.guesty.com/image/upload/v1729880354/production/666b3af27fc6d5653142b0af/yc51idfkqenc81wnse8n.jpg",
  "https://assets.guesty.com/image/upload/v1760535614/production/666b3af27fc6d5653142b0af/t7p3cc6hqez89wsmj1gt.jpg",
];

const offers = [
  {
    kicker: "Last-minute 10%",
    headline: "Spontaneous? Save 10% instantly",
    body: "Lock in a last-minute escape and keep 10% back in your pocket.",
    cta: "See last-minute",
    tone: "dark",
  },
  {
    kicker: "Weekly 10%",
    headline: "Stay a week, save 10%",
    body: "Stretch your stay to 7 nights and enjoy an effortless 10% off.",
    cta: "Explore weekly",
    tone: "sand",
  },
  {
    kicker: "Monthly 20%",
    headline: "Live in, save 20%",
    body: "Book 30 nights and unlock a generous 20% monthly savings.",
    cta: "Explore monthly",
    tone: "clay",
  },
  {
    kicker: "Early 5% (60 days)",
    headline: "Plan ahead, save 5%",
    body: "Reserve 60+ days early and secure a smart 5% discount.",
    cta: "Plan ahead",
    tone: "sand",
  },
];

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
  }, [open, containerRef]);

  useEffect(() => {
    if (!open) return;
    const base = startDate || today;
    setView((prev) => {
      const sameMonth = prev.getFullYear() === base.getFullYear() && prev.getMonth() === base.getMonth();
      return sameMonth ? prev : base;
    });
  }, [open, startDate, today]);

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

  const { year, month, cells } = buildMonth(view);

  useLayoutEffect(() => {
    if (!open) return;
    const base = startDate || today;
    setView((prev) => {
      const sameMonth = prev.getFullYear() === base.getFullYear() && prev.getMonth() === base.getMonth();
      return sameMonth ? prev : base;
    });
  }, [open, startDate, today]);

  return (
    <div className={`landing-date-picker${open ? " is-open" : ""}`} ref={containerRef}>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label id={checkInLabelId} className="text-[11px] uppercase tracking-[0.14em] text-slate-200/80">
            Check-in
          </label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkInLabelId}
            aria-label={`Check-in date, ${startDate
              ? startDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : "no date selected"
              }`}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {startDate ? startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Add date"}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label id={checkOutLabelId} className="text-[11px] uppercase tracking-[0.14em] text-slate-200/80">
            Check-out
          </label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkOutLabelId}
            aria-label={`Check-out date, ${endDate
              ? endDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : "no date selected"
              }`}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
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
          className="absolute left-1/2 top-full z-[9999] mt-3 w-[660px] max-w-[94vw] -translate-x-1/2 rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl pointer-events-auto landing-date-dropdown"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <div className="font-semibold text-lg">
              {new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                className="h-9 w-9 rounded-md bg-amber-400 text-slate-900 font-bold"
              >
                {"<"}
              </button>
              <button
                type="button"
                onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                className="h-9 w-9 rounded-md bg-amber-400 text-slate-900 font-bold"
              >
                {">"}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[buildMonth(view), buildMonth(new Date(view.getFullYear(), view.getMonth() + 1, 1))].map((monthObj) => (
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
                      <div key={d} role="columnheader">
                        {d}
                      </div>
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
                          className={`h-10 rounded-lg border text-sm transition ${disabled
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

function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [destination, setDestination] = useState("All");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [galleryListings, setGalleryListings] = useState([]);
  const [quotePricing, setQuotePricing] = useState({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const swipeHintRef = useRef(null);
  const offersSwipeRef = useRef(null);
  const offersRef = useRef(null);
  const offersTrackRef = useRef(null);
  const [isHeroPaused, setIsHeroPaused] = useState(false);
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
        const query = params.toString();
        const citySlug = citySlugFromName(cityParam || city);
        const basePath = citySlug ? `/${citySlug}/listing/${encodeURIComponent(listingId)}` : "/listings";
        const hash = citySlug ? "" : "#listings";
        const href = `${basePath}${query ? `?${query}` : ""}${hash}`;

        return {
          image: getListingImage(listing),
          text: formatGalleryLabel(listing, quotePricing[listingId], quoteLoading),
          href,
        };
      })
      .filter((item) => item?.image && item?.href);
  }, [galleryListings, checkIn, checkOut, guests, quotePricing, quoteLoading]);

  const cityRoutes = {
    Antwerp: "/antwerp",
    "Los Angeles": "/losangeles",
    Miami: "/miami",
    "Redondo Beach": "/redondo-beach",
    Dubai: "/dubai",
  };

  const handleCityClick = (city) => {
    const route = cityRoutes[city];
    if (route) {
      setCityNotice("");
      navigate(route);
      return;
    }
    const next = (cityNoticeIndex + 1) % patienceQuotes.length;
    setCityNoticeIndex(next);
    setCityNotice(patienceQuotes[next]);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const destinationParam = params.get("city") || params.get("destination") || "";
    const checkInParam = params.get("checkIn") || "";
    const checkOutParam = params.get("checkOut") || "";
    const guestsParam = params.get("guests") || params.get("adults") || "";
    const persisted = readPersistedBooking();
    setDestination(destinationParam || persisted?.destination || "All");
    setCheckIn(checkInParam || persisted?.checkIn || "");
    setCheckOut(checkOutParam || persisted?.checkOut || "");
    setGuests(guestsParam ? Number(guestsParam) || 1 : persisted?.guests || 1);
  }, [location.search]);

  useEffect(() => {
    writePersistedBooking({
      destination,
      checkIn,
      checkOut,
      guests,
    });
  }, [destination, checkIn, checkOut, guests]);

  useEffect(() => {
    let active = true;
    const loadGalleryListings = async () => {
      try {
        const res = await fetch(`${apiBase}/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to load listings.");
        const json = await res.json();
        const results = Array.isArray(json?.results) ? json.results : [];
        const parentResults = results.filter((listing) => !isChildListing(listing));
        const seen = new Set();
        const seenCities = new Set();
        const primary = [];
        const secondary = [];
        parentResults.forEach((listing) => {
          const id = getListingId(listing);
          const image = getListingImage(listing);
          if (!id || !image) return;
          if (seen.has(id)) return;
          seen.add(id);
          const cityKey = normalizeListingCity(listing).toLowerCase();
          if (cityKey && !seenCities.has(cityKey)) {
            seenCities.add(cityKey);
            primary.push(listing);
          } else {
            secondary.push(listing);
          }
        });
        if (active) {
          const curated = primary.concat(secondary).slice(0, 12);
          setGalleryListings(curated);
        }
      } catch (err) {
        if (active) setGalleryListings([]);
      }
    };

    loadGalleryListings();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
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
  }, []);

  const normalizeOffersX = (value) => {
    const base = offersBaseWidthRef.current;
    if (!base) return value;
    let next = value;
    while (next <= -2 * base) next += base;
    while (next >= 0) next -= base;
    return next;
  };

  const applyOffersTranslate = (value) => {
    const next = normalizeOffersX(value);
    offersTrackXRef.current = next;
    if (offersTrackRef.current) {
      offersTrackRef.current.style.transform = `translate3d(${next}px, 0, 0)`;
    }
  };

  const startOffersRaf = () => {
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

  useEffect(() => {
    if (!galleryListings.length) {
      setQuotePricing({});
      setQuoteLoading(false);
      return;
    }
    const { checkIn: quoteCheckIn, checkOut: quoteCheckOut } = resolveQuoteRange(checkIn, checkOut);
    const nights = diffNights(quoteCheckIn, quoteCheckOut);
    if (!nights) {
      setQuotePricing({});
      setQuoteLoading(false);
      return;
    }
    let active = true;
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
        const res = await fetch(`${apiBase}/check-units/reservations/quotes-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        });
        if (!res.ok) throw new Error("Quote pricing failed.");
        const data = await res.json();
        const results = data?.results || {};
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
      } catch {
        if (active) setQuotePricing({});
      } finally {
        if (active) setQuoteLoading(false);
      }
    };
    loadQuotes();
    return () => {
      active = false;
      setQuoteLoading(false);
    };
  }, [galleryListings, checkIn, checkOut, guests]);

  useEffect(() => {
    const animations = [];
    const loadSwipeHint = (container) => {
      if (!container) return;
      animations.push(
        lottie.loadAnimation({
          container,
          renderer: "svg",
          loop: true,
          autoplay: true,
          path: "/Swipe.json",
        }),
      );
    };
    loadSwipeHint(swipeHintRef.current);
    loadSwipeHint(offersSwipeRef.current);
    return () => {
      animations.forEach((animation) => animation.destroy());
    };
  }, []);

  const handleGallerySelect = (index) => {
    const selected = galleryItems[index];
    if (!selected?.href) return;
    navigate(selected.href);
  };

  const handleOffersPointerDown = (event) => {
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
    const container = offersRef.current;
    if (container) {
      container.classList.remove("is-dragging");
      container.releasePointerCapture?.(event.pointerId);
    }
    isOffersDraggingRef.current = false;
    startOffersRaf();
  };

  const handleOffersClickCapture = (event) => {
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
    const query = params.toString();
    const targetRoute = (() => {
      if (cityParam === "Los Angeles") return "/losangeles";
      if (cityParam === "Antwerp") return "/antwerp";
      if (cityParam === "Miami" || cityParam === "Miami Beach") return "/miami";
      if (cityParam === "Redondo Beach") return "/redondo-beach";
      return "/listings";
    })();
    const hash = targetRoute === "/listings" ? "#listings" : "";
    navigate(`${targetRoute}${query ? `?${query}` : ""}${hash}`);
  };

  return (
    <div className="landing-page text-white has-silk">
      <div className="landing-silk" aria-hidden="true">
        <Silk speed={4.5} scale={1.1} color="#b5a291" noiseIntensity={1.2} rotation={0.15} />
      </div>
      <div className="landing-silk-overlay" aria-hidden="true" />
      <header className="landing-hero relative landing-animate">
        <div
          aria-hidden="true"
          className="hero-media hero-media__slideshow"
          style={{ "--slide-count": heroSlides.length, "--slide-duration": "6s" }}
        >
          {heroSlides.map((src, idx) => (
            <div
              key={src}
              className={`hero-slide${isHeroPaused ? " is-paused" : ""}`}
              style={{ backgroundImage: `url(${src})`, "--slide-delay": `${idx * 6}s` }}
            />
          ))}
        </div>
        <div className="hero-media__overlay" aria-hidden="true" />
        <div className="landing-hero-inner">
          <div className="landing-logo-mark">OneLuxStay</div>
          <p className="landing-kicker text-amber-300 tracking-[0.34em]">The art of luxurious stays</p>
          <h1 className="landing-display text-4xl md:text-5xl leading-tight text-center">
            Experience Timeless Elevated Living
          </h1>
          <p className="text-lg text-slate-100/90 max-w-3xl text-center">
            Curated penthouses, skyline suites, and oceanfront sanctuaries across Antwerp, Dubai, Los Angeles, Miami,
            and Redondo Beach.
          </p>
          <button
            type="button"
            className="landing-hero-control"
            aria-pressed={isHeroPaused}
            aria-label={isHeroPaused ? "Play background slideshow" : "Pause background slideshow"}
            title={isHeroPaused ? "Play slideshow" : "Pause slideshow"}
            onClick={() => setIsHeroPaused((prev) => !prev)}
          >
            <span className="landing-hero-control__icon" aria-hidden="true">
              {isHeroPaused ? (
                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                  <path d="M8 6.25v11.5a.75.75 0 0 0 1.16.62l9-5.75a.75.75 0 0 0 0-1.24l-9-5.75A.75.75 0 0 0 8 6.25z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                  <path d="M7 6.5c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v11c0 .55-.45 1-1 1H8c-.55 0-1-.45-1-1v-11zm6 0c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v11c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-11z" />
                </svg>
              )}
            </span>
          </button>

          <div className="landing-chip-row">
            {["Antwerp", "Dubai", "Los Angeles", "Redondo Beach", "Miami"].map((city) => (
              <button
                key={city}
                type="button"
                className={`landing-chip${cityRoutes[city] ? "" : " landing-chip--disabled"}`}
                onClick={() => handleCityClick(city)}
              >
                {city.toUpperCase()}
              </button>
            ))}
          </div>
          {cityNotice && (
            <div className="landing-chip-notice" role="status" aria-live="polite">
              {cityNotice}
            </div>
          )}

          <form className="landing-hero-form glass" onSubmit={handleHeroSubmit}>
            <div className="landing-form-field">
              <label htmlFor="landing-destination">Destination</label>
              <select id="landing-destination" value={destination} onChange={(e) => setDestination(e.target.value)}>
                {["All", "Redondo Beach", "Los Angeles", "Dubai", "Antwerp", "Miami"].map((c) => (
                  <option key={c} value={c}>{c}</option>
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
              <label htmlFor="landing-guests">Guests</label>
              <select id="landing-guests" value={guests} onChange={(e) => setGuests(Number(e.target.value) || 1)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="landing-cta-primary w-full md:w-auto">Book</button>
          </form>
        </div>
      </header>

      <main>
        <section id="collection" className="landing-showcase-section py-16 md:py-20 landing-animate">
          <div className="landing-circular-gallery" aria-label="Featured city stays">
            <CircularGallery
              items={galleryItems}
              bend={0}
              borderRadius={0.08}
              textColor="#5f4e45"
              font="600 22px 'Work Sans', sans-serif"
              onSelect={handleGallerySelect}
              useFallback={false}
              wave={0}
              tiltStrength={0.14}
            />
            <div className="landing-circular-gallery__hint" aria-hidden="true">
              <span className="landing-circular-gallery__hint-label">Swipe to explore</span>
              <span className="landing-circular-gallery__hint-lottie" ref={swipeHintRef} />
            </div>
          </div>
          <div className="landing-showcase-inner px-6 md:px-10 mt-10">
            <div className="landing-section-head flex items-center justify-between gap-6 flex-col md:flex-row">
              <div className="max-w-2xl">
                <p className="landing-kicker">Signature stays</p>
                <h2 className="landing-display text-3xl md:text-4xl">
                  Iconic cities, <span className="landing-title-italic">unforgettable stays</span>
                </h2>
                <p className="text-slate-300 mt-2">
                  A world of refined penthouses and skyline suites, each curated to match the rhythm of its city.
                </p>
              </div>
              <Link to="/listings" className="landing-link">Book your dates</Link>
            </div>
          </div>
        </section>

        <section className="landing-fullbleed landing-stack-scroll">
          <ScrollStack
            className="landing-stack-scroll__scroller"
            innerClassName="landing-stack-scroll__inner"
            useWindowScroll
            itemDistance={200}
            itemStackDistance={30}
            stackPosition="20%"
            baseScale={0.85}
            rotationAmount={0}
            blurAmount={0}
          >
            {stays.map((stay, idx) => (
              <ScrollStackItem
                key={`${stay.label}-full-${idx}`}
                itemClassName="landing-city-card"
                style={{
                  backgroundImage: `url(${stay.image})`,
                  zIndex: idx + 1,
                }}
              >
                <div className="landing-city-inner">
                  <div className="landing-pill">{stay.label}</div>
                  <h3 className="landing-display text-3xl md:text-4xl mt-4">{stay.headline}</h3>
                  <p className="text-lg text-slate-100/90 mt-3 max-w-2xl">{stay.copy}</p>
                  {/* Buttons hidden for now.
                  <div className="landing-actions mt-6">
                    <Link to="/listings" className="landing-cta-primary">See live availability</Link>
                    <Link to="/listings" className="landing-cta-secondary">View all {stay.label} stays</Link>
                  </div>
                  */}
                </div>
              </ScrollStackItem>
            ))}
          </ScrollStack>
        </section>

        <section id="experience" className="landing-offers-section landing-animate">
          <div className="landing-offers-inner max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20">
            <div className="landing-offers-head">
              <div className="landing-offers-copy">
                <p className="landing-kicker">Our offers</p>
                <h2 className="landing-display text-3xl md:text-4xl">
                  Make a smart stay smoother.
                </h2>
                <p className="text-slate-300 mt-2">
                  Limited-time perks and always-on benefits, curated for your next OneLuxStay.
                </p>
              </div>
            </div>
          </div>
          <div
            className="landing-offers-row"
            ref={offersRef}
            onPointerDown={handleOffersPointerDown}
            onPointerMove={handleOffersPointerMove}
            onPointerUp={handleOffersPointerUp}
            onPointerCancel={handleOffersPointerUp}
            onPointerLeave={handleOffersPointerUp}
            onClickCapture={handleOffersClickCapture}
          >
            <div className="landing-offers-track" ref={offersTrackRef}>
              {loopedOffers.map((offer, index) => (
                <article key={`${offer.headline}-${index}`} className={`landing-offer-card offer-${offer.tone}`}>
                  <p className="landing-offer-kicker">{offer.kicker}</p>
                  <h3 className="landing-offer-title">{offer.headline}</h3>
                  <p className="landing-offer-body">{offer.body}</p>
                  <Link to="/listings" className="landing-offer-cta">{offer.cta}</Link>
                </article>
              ))}
            </div>
          </div>
          <div className="landing-offers-controls landing-offers-controls--center">
            <div className="landing-offers-swipe" aria-hidden="true">
              <span className="landing-offers-swipe__label">Swipe to explore</span>
              <span className="landing-offers-swipe__lottie" ref={offersSwipeRef} />
            </div>
          </div>
        </section>

        <section id="contact" className="w-full py-16 md:py-20">
          <div className="max-w-6xl mx-auto px-6 md:px-10">
            <div className="landing-cta">
              <div className="space-y-3">
                <p className="landing-kicker">Concierge on standby</p>
                <h3 className="landing-display text-3xl md:text-4xl">Tell us your dates. We'll handle the rest.</h3>
                <p className="text-slate-200 max-w-2xl">
                  City skyline, ocean breeze, private workspace, or space for the whole crew?share your stay goals and we'll reply with tailored options.
                </p>
              </div>
              <div className="landing-actions mt-4">
              <button
                type="button"
                className="landing-cta-primary"
                onClick={() => {
                  const target = document.getElementById("collection");
                  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                See live availability
              </button>
                <a
                  href="mailto:reservation@oneluxstay.com"
                  className="landing-cta-secondary"
                >
                  Email concierge
                </a>
              </div>
            </div>
          </div>
        </section>
        <SiteFooter />
      </main>
    </div>
  );
}

export default LandingPage;

