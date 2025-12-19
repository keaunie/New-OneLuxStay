import { useEffect, useMemo, useState } from "react";
import "./App.css";

const apiBase = import.meta.env.VITE_API_BASE || "/api";

const formatCurrency = (value, currency = "USD") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 })
    : "--";

const initialSearch = {
  checkIn: "",
  checkOut: "",
  adults: 2,
  children: 0,
};

function App() {
  const [listings, setListings] = useState([]);
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

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/listings`);
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

  const handleSearchChange = (key, value) => {
    setSearch((prev) => ({ ...prev, [key]: value }));
  };

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
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

      const [availRes, quoteRes] = await Promise.all([
        fetchWithTimeout(`${apiBase}/listings/${listing.id}/availability?${qs}`),
        fetchWithTimeout(`${apiBase}/reservations/quotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: listing.id,
            checkInDateLocalized: search.checkIn,
            checkOutDateLocalized: search.checkOut,
            // source: "manual",
            guestsCount: String(Number(search.adults) + Number(search.children || 0)),
          }),
        }),
      ]);

      const availJson = availRes.ok ? await availRes.json() : null;
      const quoteJson = quoteRes?.ok ? await quoteRes.json() : null;
      const quoteData = quoteJson?.data || quoteJson || null;

      const isAvailable =
        availJson?.isAvailable ??
        availJson?.available ??
        (typeof availJson?.status === "string" ? availJson.status === "AVAILABLE" : undefined) ??
        (Array.isArray(availJson?.availability) ? availJson.availability.every((d) => d.isAvailable) : undefined);

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

      setAvailability((prev) => ({
        ...prev,
        [listing.id]: {
          status: "ready",
          available: isAvailable,
          nightly,
          total,
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">Check-in</label>
                <input
                  type="date"
                  value={search.checkIn}
                  onChange={(e) => handleSearchChange("checkIn", e.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">Check-out</label>
                <input
                  type="date"
                  value={search.checkOut}
                  onChange={(e) => handleSearchChange("checkOut", e.target.value)}
                  className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
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
          <h2 className="text-xl font-semibold text-white">Available units</h2>
          <p className="text-xs text-slate-400">Images load lazily to stay fast on slow networks.</p>
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
          {listings.map((listing) => {
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
                      {listing.location || listing.timezone || "OneLuxStay"}
                    </p>
                    <h3 className="text-lg font-semibold text-white leading-tight">{listing.title}</h3>
                    <p className="text-sm text-slate-300">
                      From {formatCurrency(listing.basePrice, listing.currency)} / night · Cleaning{" "}
                      {formatCurrency(listing.cleaningFee, listing.currency)}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveListingId(listing.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      isActive
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
                      Available · {formatCurrency(status.nightly ?? listing.basePrice, status.currency)} avg/night{" "}
                      {status.total ? `· ${formatCurrency(status.total, status.currency)} total` : ""}
                    </span>
                  )}
                  {status.status === "ready" && status.available === false && <span>Not available for your dates</span>}
                  {status.status === "loading" && <span>Checking Guesty…</span>}
                  {status.status === "error" && <span className="text-rose-200">{status.message}</span>}
                  {status.status === undefined && <span>Click “Check price” to fetch live availability</span>}
                </div>

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
