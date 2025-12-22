import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";

// API base: set VITE_API_BASE for Netlify (e.g., "/.netlify/functions/index"); leave empty for same-origin /api
const apiBase = import.meta.env.VITE_API_BASE ?? "";


const formatCurrency = (value, currency = "USD") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
    : "--";

const initialSearch = {
  checkIn: "",
  checkOut: "",
  adults: 1,
  children: 0,
};

const locationOptions = [
  { value: "", label: "All", image: "" },
  {
    value: "Antwerp",
    label: "Antwerpen",
    image: "https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=200&q=60",
  },
  {
    value: "Dubai",
    label: "Dubai",
    image: "https://images.unsplash.com/photo-1474623700587-1c221f7b2a1f?auto=format&fit=crop&w=200&q=60",
  },
  {
    value: "Los Angeles",
    label: "Los Angeles",
    image: "https://images.unsplash.com/photo-1507925921958-8a62f3d1a50d?auto=format&fit=crop&w=200&q=60",
  },
  {
    value: "Hollywood",
    label: "Hollywood",
    image: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=200&q=60",
  },
  {
    value: "Redondo Beach",
    label: "Redondo Beach",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=200&q=60",
  },
  {
    value: "Miami Beach",
    label: "Miami Beach",
    image: "https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=200&q=60",
  },
];

const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const deriveCity = (listing) => {
  const text = `${listing.address || ""} ${listing.location || ""} ${listing.title || ""} ${listing.timezone || ""}`.toLowerCase();
  if (text.includes("hollywood")) return "Hollywood";
  if (text.includes("los angeles")) return "Los Angeles";
  if (text.includes("redondo beach")) return "Redondo Beach";
  if (text.includes("miami beach")) return "Miami Beach";
  if (text.includes("dubai")) return "Dubai";
  if (text.includes("antwerp") || text.includes("antwerpen")) return "Antwerp";
  if (text.includes("miami")) return "Miami Beach";
  return "";
};

const formatDisplayDate = (value) => {
  if (!value) return "Add date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Add date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() =>
    value.start ? new Date(value.start) : new Date(),
  );
  const ref = useRef(null);
  const portalRef = useRef(null);
  const [portalStyle, setPortalStyle] = useState(null);
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  const startDate = value.start ? new Date(value.start) : null;
  const endDate = value.end ? new Date(value.end) : null;
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (
        !open ||
        !ref.current ||
        ref.current.contains(e.target) ||
        (portalRef.current && portalRef.current.contains(e.target))
      ) {
        return;
      }
      setOpen(false);
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const updatePosition = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      setPortalStyle({
        position: "fixed",
        top: rect.bottom + 12,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    };
    if (open) {
      updatePosition();
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const days = [];
  const firstDay = new Date(view.getFullYear(), view.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();

  for (let i = 0; i < startOffset; i += 1) days.push(null);
  for (let i = 1; i <= daysInMonth; i += 1) {
    days.push(new Date(view.getFullYear(), view.getMonth(), i));
  }

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
    if (!day) return;
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
      start: nextStart ? toISODate(nextStart) : "",
      end: nextEnd ? toISODate(nextEnd) : "",
    });
  };

  const goMonth = (delta) => {
    const next = new Date(view);
    next.setMonth(view.getMonth() + delta);
    setView(next);
  };

  return (
    <div className="relative z-30" ref={ref}>
      <div className="grid grid-cols-2 gap-3">
        {["Check-in", "Check-out"].map((label, idx) => {
          const val = idx === 0 ? value.start : value.end;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setOpen((p) => !p)}
              className="flex flex-col items-start rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-left text-sm text-white transition hover:border-emerald-400/60"
            >
              <span className="text-xs uppercase tracking-wide text-emerald-200">{label}</span>
              <span className="text-sm text-white">{formatDisplayDate(val)}</span>
            </button>
          );
        })}
      </div>

      {open && portalStyle && portalTarget &&
        createPortal(
          (
            <div
              className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-950/95 p-4 shadow-2xl backdrop-blur"
              style={portalStyle}
              ref={portalRef}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                  </p>
                  <p className="text-xs text-slate-400">Select a check-in and check-out date</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => goMonth(-1)}
                    className="rounded-lg bg-amber-400 px-2 py-1 text-slate-900 font-semibold shadow"
                  >
                    {"<"}
                  </button>
                  <button
                    type="button"
                    onClick={() => goMonth(1)}
                    className="rounded-lg bg-amber-400 px-2 py-1 text-slate-900 font-semibold shadow"
                  >
                    {">"}
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-7 text-center text-xs text-slate-400">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <span key={d} className="py-1">
                    {d}
                  </span>
                ))}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1">
                {days.map((day, idx) => {
                  const iso = day ? toISODate(day) : `empty-${idx}`;
                  const selectedStart = day && isSameDay(day, startDate);
                  const selectedEnd = day && isSameDay(day, endDate);
                  const inSelectedRange = inRange(day);
                  const isPast = day ? day < today : true;

                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={!day || isPast}
                      onClick={() => handleDayClick(day)}
                      className={[
                        "relative flex h-10 items-center justify-center rounded-lg text-sm transition",
                        !day
                          ? "cursor-default text-transparent"
                          : isPast
                            ? "cursor-not-allowed text-slate-600 border border-white/5 bg-slate-900/50"
                            : "text-white hover:border-amber-300",
                        inSelectedRange && !isPast
                          ? "bg-amber-400/20 border border-amber-300/40"
                          : "border border-white/5",
                        selectedStart || selectedEnd ? "bg-amber-400 text-slate-900 font-semibold" : "",
                      ].join(" ")}
                    >
                      {day ? day.getDate() : ""}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                <span>
                  {startDate
                    ? `Check-in: ${formatDisplayDate(value.start)}`
                    : "Pick a check-in date"}
                </span>
                <span>
                  {endDate ? `Check-out: ${formatDisplayDate(value.end)}` : "Pick a check-out date"}
                </span>
              </div>
            </div>
          ),
          portalTarget,
        )}
    </div>
  );
}

function App() {
  const [listings, setListings] = useState([]);
  const [quote, setQuotes] = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [listingsError, setListingsError] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [locationFilter, setLocationFilter] = useState("");
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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/api/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Listings failed: ${res.status}`);
        const json = await res.json();
        setListings(json.results || []);
        setActiveListingId((json.results || [])[0]?.id || "");
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
    const start = new Date(search.checkIn);
    const end = new Date(search.checkOut);
    return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  }, [search.checkIn, search.checkOut]);

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === activeListingId || l._id === activeListingId),
    [activeListingId, listings],
  );

  const filteredListings = useMemo(() => {
    return listings
      .map((l) => ({ ...l, _city: deriveCity(l) }))
      .filter((l) => (!locationFilter ? true : l._city === locationFilter));
  }, [listings, locationFilter]);

  const handleSearchChange = (key, value) => {
    setSearch((prev) => ({ ...prev, [key]: value }));
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
      alert("Pick check-in and check-out dates first.");
      return;
    }
    const adultsNum = Number.parseInt(search.adults, 10);
    const childrenNum = Number.parseInt(search.children, 10);
    const adults = Number.isFinite(adultsNum) ? Math.max(1, adultsNum) : 1;
    const children = Number.isFinite(childrenNum) ? Math.max(0, childrenNum) : 0;
    const guests = adults + children;

    setAvailability((prev) => ({
      ...prev,
      [listing.id]: { status: "loading" },
    }));

    try {
      const qs = new URLSearchParams({
        startDate: search.checkIn,
        endDate: search.checkOut,
        guests,
        unitTypeId: listing.unitTypeId || listing.id,
      }).toString();

      const [availRes, quoteRes] = await Promise.all([
        fetchWithTimeout(`${apiBase}/api/listings/${listing.id}/availability?${qs}`),
        fetchWithTimeout(`${apiBase}/api/reservations/quotes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            listingId: listing.id,
            checkInDateLocalized: search.checkIn,
            checkOutDateLocalized: search.checkOut,
            guestsCount: guests,
          }),
        }),
      ]);

      if (!quoteRes.ok) {
        const errText = await quoteRes.text();
        throw new Error(errText || `Quote failed with ${quoteRes.status}`);
      }
      if (!availRes.ok) {
        const errText = await availRes.text();
        throw new Error(errText || `Availability failed with ${availRes.status}`);
      }

      const availJson = await availRes.json();
      const quoteJson = await quoteRes.json();
      const quoteData = quoteJson?.results?.[0] || quoteJson?.results || quoteJson;

      const isAvailable =
        availJson?.isAvailable ??
        availJson?.available ??
        (typeof availJson?.status === "string" ? availJson.status.toUpperCase() === "AVAILABLE" : undefined) ??
        (Array.isArray(availJson?.availability)
          ? availJson.availability.every((d) => {
              const flag =
                d?.isAvailable ??
                d?.available ??
                (typeof d?.status === "string"
                  ? !["BLOCKED", "UNAVAILABLE"].includes(d.status.toUpperCase())
                  : undefined);
              return flag !== false;
            })
          : undefined);

      const quoteMoney =
        quoteData?.rates?.ratePlans?.[0]?.ratePlan?.money ||
        quoteData?.rates?.ratePlans?.[0]?.money ||
        quoteData?.money ||
        null;

      const quoteDays = quoteData?.rates?.ratePlans?.[0]?.days || [];
      const quoteCurrency = quoteMoney?.currency || quoteDays[0]?.currency || listing.currency || "USD";

      const quoteTotalRaw =
        quoteMoney?.subTotalPrice ??
        quoteData?.total ??
        quoteData?.price?.total ??
        quoteData?.price?.totalAmount ??
        quoteData?.price?.totalPrice ??
        (typeof quoteData?.price?.total === "object" ? quoteData.price.total.amount : null) ??
        (typeof quoteData?.amount === "number" ? quoteData.amount : null);

      const quoteTotal = typeof quoteTotalRaw === "number" ? quoteTotalRaw : null;

      const quotedNights = Array.isArray(quoteDays) && quoteDays.length > 0 ? quoteDays.length : nights;
      const quoteNightly =
        (quoteTotal && quotedNights ? quoteTotal / quotedNights : undefined) ??
        (quoteDays[0]?.price ?? quoteDays[0]?.manualPrice ?? quoteDays[0]?.basePrice);

      const nightly = quoteNightly ?? listing.basePrice;
      const total = quoteTotal ?? (nightly && nights ? nightly * nights + (listing.cleaningFee || 0) : null);
      const quoteNights = quotedNights || nights || null;

      setAvailability((prev) => ({
        ...prev,
        [listing.id]: {
          status: "ready",
          available: isAvailable,
          nightly,
          total,
          nights: quoteNights,
          currency: quoteCurrency,
          raw: { availability: availJson, quote: quoteData },
        },
      }));
    } catch (err) {
      setAvailability((prev) => ({
        ...prev,
        [listing.id]: {
          status: "error",
          message:
            err?.name === "AbortError"
              ? "Guesty timed out. Please retry."
              : "Could not reach Guesty right now. Please retry.",
        },
      }));
    }
  };

  const handleBook = async () => {
    if (!activeListingId) {
      alert("Select a unit first.");
      return;
    }
    if (!search.checkIn || !search.checkOut) {
      alert("Pick dates before booking.");
      return;
    }
    if (!bookingInfo.firstName || !bookingInfo.lastName || !bookingInfo.email) {
      alert("Fill in guest name and email.");
      return;
    }

    setBookingState({ status: "loading", message: "" });

    try {
      const res = await fetch(`${apiBase}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: activeListingId,
          checkIn: search.checkIn,
          checkOut: search.checkOut,
          adults: Number(search.adults),
          children: Number(search.children),
          guest: {
            firstName: bookingInfo.firstName,
            lastName: bookingInfo.lastName,
            email: bookingInfo.email,
            phone: bookingInfo.phone,
            notes: bookingInfo.notes,
          },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Booking failed");
      }

      setBookingState({ status: "success", message: "Booking request sent to Guesty." });
    } catch (err) {
      setBookingState({ status: "error", message: err.message });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="absolute inset-0 -z-10 opacity-30 bg-[radial-gradient(circle_at_10%_20%,#22c55e_0,#0f172a_35%),radial-gradient(circle_at_80%_0,#38bdf8_0,#0f172a_40%),radial-gradient(circle_at_50%_80%,#8b5cf6_0,#0f172a_45%)]" />
      <header className="max-w-6xl mx-auto px-6 pt-10 pb-8">
        <div className="flex flex-col gap-4 md:gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">OneLuxStay</p>
            <h1 className="text-3xl md:text-4xl font-semibold text-white leading-tight">
              Direct booking portal connected to Guesty
            </h1>
            <p className="text-slate-300 mt-2 max-w-2xl">
              Live inventory, real-time price checks, and fast booking even on slow connections.
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-slate-200 backdrop-blur">
            <p className="font-semibold text-white">API status</p>
            <p className="text-emerald-300">Connected to Guesty Booking API</p>
            <p className="text-xs text-slate-400">Token cached to reduce bandwidth + rate limits</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[2fr,1fr]">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur">
            <p className="text-sm font-semibold text-white mb-3">Search dates</p>
            <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr,1fr] gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300 mb-1">Dates</label>
                <DateRangePicker
                  value={{ start: search.checkIn, end: search.checkOut }}
                  onChange={({ start, end }) =>
                    setSearch((prev) => ({ ...prev, checkIn: start, checkOut: end }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">Adults</label>
                <input
                  type="number"
                  min="1"
                  value={search.adults}
                  onChange={(e) => handleSearchChange("adults", Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">Children</label>
                <input
                  type="number"
                  min="0"
                  value={search.children}
                  onChange={(e) => handleSearchChange("children", Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              <p>
                {nights > 0 ? `${nights} night stay selected` : "Select dates to check availability & rates"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-lg backdrop-blur">
            <p className="text-sm font-semibold text-white">Booking</p>
            <p className="text-xs text-emerald-200 mt-1">
              Choose a unit below and submit. We send it through Guesty instantly.
            </p>
            {bookingState.status === "success" && (
              <div className="mt-3 rounded-lg bg-emerald-600/20 border border-emerald-500/50 px-3 py-2 text-xs text-emerald-100">
                {bookingState.message}
              </div>
            )}
            {bookingState.status === "error" && (
              <div className="mt-3 rounded-lg bg-rose-600/20 border border-rose-500/40 px-3 py-2 text-xs text-rose-100">
                {bookingState.message}
              </div>
            )}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <input
                placeholder="First name"
                value={bookingInfo.firstName}
                onChange={(e) => setBookingInfo((p) => ({ ...p, firstName: e.target.value }))}
                className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-emerald-400"
              />
              <input
                placeholder="Last name"
                value={bookingInfo.lastName}
                onChange={(e) => setBookingInfo((p) => ({ ...p, lastName: e.target.value }))}
                className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-emerald-400"
              />
              <input
                type="email"
                placeholder="Email"
                value={bookingInfo.email}
                onChange={(e) => setBookingInfo((p) => ({ ...p, email: e.target.value }))}
                className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-emerald-400"
              />
              <input
                placeholder="Phone"
                value={bookingInfo.phone}
                onChange={(e) => setBookingInfo((p) => ({ ...p, phone: e.target.value }))}
                className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-emerald-400"
              />
              <input
                placeholder="Notes / requests"
                value={bookingInfo.notes}
                onChange={(e) => setBookingInfo((p) => ({ ...p, notes: e.target.value }))}
                className="sm:col-span-2 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-emerald-400"
              />
            </div>
            <button
              onClick={handleBook}
              disabled={bookingState.status === "loading"}
              className="mt-3 w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {bookingState.status === "loading" ? "Sending to Guesty..." : "Book this stay"}
            </button>
            {selectedListing && (
              <p className="mt-2 text-xs text-slate-200">
                Selected unit: <span className="text-white font-semibold">{selectedListing.title}</span>
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-14">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Available units</h2>
            <p className="text-xs text-slate-400">Filter by destination or browse all listings.</p>
          </div>
        </div>

        <div
          className="mb-5 rounded-2xl border border-white/10 bg-slate-900/50 p-3 backdrop-blur"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(17,24,39,0.8), rgba(17,24,39,0.6)), url('https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=1200&q=60')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="flex flex-wrap gap-3">
            {locationOptions
              .filter((opt) => opt.value !== "")
              .map((opt) => {
                const isActive = locationFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setLocationFilter((cur) => (cur === opt.value ? "" : opt.value))}
                    className={`flex items-center gap-3 rounded-full px-3 py-2 text-sm font-semibold uppercase tracking-wide transition ${
                      isActive
                        ? "bg-emerald-400/90 text-slate-900 shadow-lg shadow-emerald-400/30"
                        : "bg-black/50 text-white hover:bg-white/20 border border-white/10"
                    }`}
                  >
                    <span className="h-8 w-8 overflow-hidden rounded-full border border-white/20 bg-white/10">
                      {opt.image ? (
                        <img src={opt.image} alt={opt.label} className="h-full w-full object-cover" />
                      ) : null}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
          </div>
        </div>

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
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            {listingsError}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {filteredListings.map((listing) => {
            const status = availability[listing.id] || {};
            const isActive = activeListingId === listing.id;

            return (
              <article
                key={listing.id}
                className="group rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg transition hover:border-emerald-400/40"
              >
                <div className="relative overflow-hidden rounded-xl bg-slate-900">
                  {listing.picture ? (
                    <img
                      src={listing.picture}
                      alt={listing.title}
                      loading="lazy"
                      className="h-48 w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-48 w-full bg-slate-800" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
                  <div className="absolute bottom-3 left-3 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 backdrop-blur">
                    Sleeps {listing.accommodates} · {listing.bedrooms} BR · {listing.bathrooms} BA
                  </div>
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-emerald-200">
                      {listing._city || listing.location || listing.timezone || "OneLuxStay"}
                    </p>
                    <h3 className="text-lg font-semibold text-white leading-tight">{listing.title}</h3>
                    <p className="text-sm text-slate-300">
                      From {formatCurrency(listing.basePrice, listing.currency)} / night · Cleaning{" "}
                      {formatCurrency(listing.cleaningFee, listing.currency)}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveListingId(listing.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${isActive
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                      : "border-white/10 bg-white/10 text-slate-200 hover:border-emerald-400/60"
                      }`}
                  >
                    {isActive ? "Selected" : "Select"}
                  </button>
                </div>

                {listing.address && (
                  <p className="mt-2 text-xs text-slate-400">Address: {listing.address}</p>
                )}

                <div className="mt-3 flex items-center gap-2 text-sm text-slate-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {status.status === "ready" && status.available !== false && (
                    <span>
                      Available · {formatCurrency(status.nightly ?? listing.basePrice, status.currency)} avg/night{" "}
                      {status.total ? `· ${formatCurrency(status.total, status.currency)} total` : ""}
                    </span>
                  )}
                  {status.status === "ready" && status.available === false && <span>Not available for your dates</span>}
                  {status.status === "loading" && <span>Checking Guesty…</span>}
                  {status.status === "error" && <span className="text-rose-200">{status.message}</span>}
                  {status.status === undefined && <span>Click “Check price” to fetch live availability</span>}
                </div>

                {status.status === "ready" && status.available !== false && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                    <div className="flex justify-between">
                      <span>Quote total</span>
                      <span className="font-semibold text-white">
                        {status.total
                          ? formatCurrency(status.total, status.currency)
                          : formatCurrency(status.nightly, status.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between mt-1 text-slate-400">
                      <span>
                        Nights: {status.nights || nights || "—"} • Nightly: {formatCurrency(status.nightly, status.currency)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => checkAvailability(listing)}
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white border border-white/10 hover:border-emerald-400/60 transition"
                  >
                    Check price & availability
                  </button>
                  <button
                    onClick={() => {
                      setActiveListingId(listing.id);
                      checkAvailability(listing);
                    }}
                    className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
                  >
                    Book this stay
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default App;
