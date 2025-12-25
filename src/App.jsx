import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const apiBase = import.meta.env.VITE_API_BASE || "/.netlify/functions/index";


const formatCurrency = (value, currency = "USD") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "--";

const KNOWN_CITIES = ["hollywood", "los angeles", "antwerp", "antwerpen", "dubai", "redondo beach", "miami beach"];

const normalizeCity = (listing) => {
  const titleLower = typeof listing.title === "string" ? listing.title.toLowerCase() : "";
  if (titleLower.includes("hollywood")) return "Hollywood";

  const primary = listing.city || listing.address?.city;
  if (primary) return primary.trim();

  const tagCity =
    Array.isArray(listing.tags) &&
    listing.tags.find((t) => typeof t === "string" && KNOWN_CITIES.includes(t.toLowerCase()));
  if (tagCity) return tagCity.trim();

  if (titleLower) {
    const match = KNOWN_CITIES.find((c) => titleLower.includes(c));
    if (match) {
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

const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatDisplayDate = (value) => {
  const d = parseDate(value);
  if (!d) return "Add date";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const DateRangePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
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

  const { year, month, cells } = buildMonth(view);

  return (
    <div className="relative" ref={containerRef}>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-300">Check-in</label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {formatDisplayDate(value.checkIn)}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-300">Check-out</label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {formatDisplayDate(value.checkOut)}
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute left-0 z-50 mt-3 w-[320px] rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl">
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
          <div className="px-4 pb-4">
            <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-300 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {cells.map((day, idx) => {
                const disabled = !day || day < today;
                const selected = (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
                const between = inRange(day) && !selected;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={disabled}
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

function App() {
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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/api/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Listings failed: ${res.status}`);
        const json = await res.json();
        setListings(json.results || []);
        setActiveListingId((json.results || [])[0]?.id || "");
      } catch {
        setListingsError("Unable to load units from Guesty�");
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

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === activeListingId || l._id === activeListingId),
    [activeListingId, listings],
  );

  const cityOptions = useMemo(() => {
    const map = new Map();
    const forced = ["Hollywood", "Redondo Beach"];
    listings.forEach((l) => {
      const city = normalizeCity(l);
      if (!city) return;
      if (!map.has(city)) {
        const img =
          l.picture ||
          (Array.isArray(l.pictures) && l.pictures[0]?.thumbnail) ||
          (Array.isArray(l.pictures) && l.pictures[0]?.original) ||
          "";
        map.set(city, { city, image: img });
      }
    });
    forced.forEach((city) => {
      if (!map.has(city)) map.set(city, { city, image: "" });
    });
    return [{ city: "All", image: "" }, ...Array.from(map.values())];
  }, [listings]);

  const filteredListings = useMemo(() => {
    if (cityFilter === "All") return listings;
    const match = cityFilter.toLowerCase();
    return listings.filter((l) => normalizeCity(l).toLowerCase() === match);
  }, [cityFilter, listings]);
  const availableCount = filteredListings.length;

  useEffect(() => {
    if (!activeListingId && filteredListings[0]) {
      setActiveListingId(filteredListings[0].id);
      return;
    }
    const exists = filteredListings.some((l) => l.id === activeListingId);
    if (!exists && filteredListings[0]) {
      setActiveListingId(filteredListings[0].id);
    }
  }, [filteredListings, activeListingId]);

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
        adults: search.adults,
        children: search.children,
      }).toString();

      let availJson = null;
      try {
        const availRes = await fetchWithTimeout(
          `${apiBase}/api/listings/${listing.id}/availability?${new URLSearchParams({
            startDate: search.checkIn,
            endDate: search.checkOut,
            minOccupancy: guests,
          }).toString()}`,
        );
        if (availRes.ok) {
          availJson = await availRes.json();
        }
      } catch {
        // ignore availability failure; fall back to quote result
      }

      const quoteRes = await fetchWithTimeout(`${apiBase}/api/reservations/quotes`, {
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
      });

      if (!quoteRes.ok) {
        const errText = await quoteRes.text();
        throw new Error(errText || `Quote failed with ${quoteRes.status}`);
      }

      const quoteJson = await quoteRes.json();
      const quoteData = quoteJson?.results?.[0] || quoteJson?.results || quoteJson;

      const isAvailable =
        availJson?.isAvailable ??
        availJson?.available ??
        (typeof availJson?.status === "string" ? availJson.status === "AVAILABLE" : undefined) ??
        (Array.isArray(availJson?.availability)
          ? availJson.availability.every((d) => (d?.isAvailable ?? d?.available ?? true) !== false)
          : undefined);

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
        (quoteDays[0]?.price ?? quoteDays[0]?.manualPrice ?? quoteDays[0]?.basePrice);

      const nightly = quoteNightly ?? listing.basePrice;
      const total = quoteTotal ?? (nightly && nights ? nightly * nights + (listing.cleaningFee || 0) : null);

      const hostPayout =
        typeof quoteMoney?.hostPayout === "number"
          ? quoteMoney.hostPayout
          : typeof quoteMoney?.hostPayoutUsd === "number"
            ? quoteMoney.hostPayoutUsd
            : null;

      const breakdown = (() => {
        const items = quoteMoney?.invoiceItems;
        if (!Array.isArray(items)) return null;
        const acc = { accommodation: 0, cleaning: 0, taxes: 0, fees: 0, deposit: 0 };
        items.forEach((item) => {
          const amt = typeof item?.amount === "number" ? item.amount : null;
          if (amt === null) return;
          const t = (item?.normalType || item?.type || "").toUpperCase();
          if (t === "AF" || t === "ACCOMMODATION_FARE") acc.accommodation += amt;
          else if (t === "CF" || t === "CLEANING_FEE") acc.cleaning += amt;
          else if (t === "OCT" || t === "TAX" || t === "OCCUPANCY_TAX") acc.taxes += amt;
          else if (t === "AFE" || t === "ADDITIONAL") {
            const second = (item?.secondIdentifier || "").toUpperCase();
            if (second === "DEPOSIT") acc.deposit += amt;
            else acc.fees += amt;
          } else {
            acc.fees += amt;
          }
        });
        return acc;
      })();

      setAvailability((prev) => ({
        ...prev,
        [listing.id]: {
          status: "ready",
          available: isAvailable,
          nightly,
          total,
          hostPayout,
          breakdown,
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

      setBookingState({ status: "success", message: "Booking request sent to Guesty�" });
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
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur relative">
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
              {bookingState.status === "loading" ? "Sending to Guesty�.." : "Book this stay"}
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
          <h2 className="text-xl font-semibold text-white">
            Available units {availableCount > 0 ? `(${availableCount})` : ""}
          </h2>
          <p className="text-xs text-slate-400">Images load lazily to stay fast on slow networks.</p>
        </div>

        {cityOptions.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-3">
            {cityOptions.map(({ city, image }) => {
              const active = cityFilter === city;
              return (
                <button
                  key={city}
                  onClick={() => setCityFilter(city)}
                  className={`group inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold tracking-wide transition ${active
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-lg shadow-emerald-500/20"
                    : "border-white/10 bg-white/5 text-slate-200 hover:border-emerald-400/40 hover:text-white"
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
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            {listingsError}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {filteredListings.map((listing) => {
            const status = availability[listing.id] || {};
            const isActive = activeListingId === listing.id;
            const displayTotal = status.hostPayout ?? status.total;
            const displayNightly = status.nightly ?? listing.basePrice;

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
                      {listing.location || listing.timezone || "OneLuxStay"}
                    </p>
                    <h3 className="text-lg font-semibold text-white leading-tight">{listing.title}</h3>
                    <p className="text-sm text-slate-300">
                      From {formatCurrency(listing.basePrice, listing.currency)} / night · Cleaning{" "}
                      From {formatCurrency(listing.basePrice, listing.currency)} / night · Cleaning{" "}
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

                <div className="mt-3 flex items-center gap-2 text-sm text-slate-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {status.status === "ready" && status.available !== false && (
                    <span>
                      Available · {formatCurrency(displayNightly, status.currency)} avg/night{" "}
                      {displayTotal ? `· ${formatCurrency(displayTotal, status.currency)} total` : ""}
                      {status.hostPayout ? " (host payout)" : ""}
                    </span>
                  )}
                  {status.status === "ready" && status.available === false && <span>Not available for your dates</span>}
                  {status.status === "loading" && <span>Checking Guesty…</span>}
                  {status.status === "error" && <span className="text-rose-200">{status.message}</span>}
                  {status.status === undefined && <span>Click “Check price” to fetch live availability</span>}
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
                    {status.breakdown.deposit > 0 && (
                      <span>Deposit: {formatCurrency(status.breakdown.deposit, status.currency)}</span>
                    )}
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



























