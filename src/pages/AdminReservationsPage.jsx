import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReservationFilters from "../components/admin/reservations/ReservationFilters.jsx";
import ReservationList from "../components/admin/reservations/ReservationList.jsx";
import ReservationDetails from "../components/admin/reservations/ReservationDetails.jsx";
import "./AdminReservationsPage.css";

// ── API helpers ────────────────────────────────────────────
// All requests go through Netlify Functions via relative paths.
// NEVER hardcode localhost or a domain here.

const fetchReservations = async ({ city = "Antwerp", limit = 500, signal } = {}) => {
  const today = new Date().toISOString().slice(0, 10);
  const pastMs  = 90 * 86_400_000;
  const futureMs = 365 * 86_400_000;
  const checkIn  = new Date(Date.now() - pastMs).toISOString().slice(0, 10);
  const checkOut = new Date(Date.now() + futureMs).toISOString().slice(0, 10);

  const qs = new URLSearchParams({ city, checkIn, checkOut, limit: String(limit) });
  const res = await fetch(`/.netlify/functions/apaleo-reservations?${qs}`, {
    credentials: "omit",
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || body?.error || `Reservations request failed (${res.status})`);
  }
  return res.json();
};

const fetchFinancials = async (reservationId, signal) => {
  const qs = new URLSearchParams({ reservationId });
  const res = await fetch(`/.netlify/functions/apaleo-financials?${qs}`, {
    credentials: "omit",
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || body?.error || `Financials request failed (${res.status})`);
  }
  return res.json();
};

// ── Normalise reservation from API response ────────────────
const normalizeReservation = (item) => {
  if (!item || typeof item !== "object") return null;
  const raw = item.raw && typeof item.raw === "object" ? item.raw : item;

  const guest = raw?.primaryGuest || raw?.booker || raw?.guest || null;
  const firstName = String(item.guestName || guest?.firstName || "").trim();
  const lastName  = String(guest?.lastName || "").trim();
  const fullName  = firstName || (lastName ? `${firstName} ${lastName}`.trim() : "Unknown Guest");

  return {
    id:                 String(item.id || ""),
    guestName:          item.guestName || fullName || "Unknown Guest",
    guestEmail:         String(item.guestEmail || guest?.email || "").trim(),
    guestPhone:         String(item.guestPhone || guest?.phone || "").trim(),
    guestAddress:       item.guestAddress || guest?.address || null,
    guestProfile:       guest,
    guest:              item.guest || null,
    checkIn:            String(item.checkIn || raw?.arrival || "").slice(0, 10),
    checkOut:           String(item.checkOut || raw?.departure || "").slice(0, 10),
    propertyId:         String(item.propertyId || raw?.property?.id || "").trim(),
    propertyTitle:      String(item.propertyTitle || "").trim(),
    unitGroupId:        String(item.unitGroupId || "").trim(),
    unitGroupName:      String(item.unitGroupName || "").trim(),
    unitId:             String(item.unitId || "").trim(),
    unitName:           String(item.unitName || item.unitGroupName || "").trim(),
    adults:             item.adults ?? null,
    children:           item.children ?? null,
    confirmationNumber: String(item.confirmationNumber || "").trim(),
    channel:            String(item.channel || raw?.channelCode || "").trim(),
    status:             String(item.status || raw?.status || "unknown").trim(),
    raw,
  };
};

const DEFAULT_FILTERS = { search: "", status: "", city: "", arrival: "" };

export default function AdminReservationsPage() {
  // ── Data state ──────────────────────────────────────────
  const [reservations, setReservations] = useState([]);
  const [listLoading,  setListLoading]  = useState(true);
  const [listError,    setListError]    = useState("");

  const [selectedId,   setSelectedId]   = useState("");
  const [financials,   setFinancials]   = useState(null);
  const [finLoading,   setFinLoading]   = useState(false);
  const [finError,     setFinError]     = useState("");

  // ── UI state ────────────────────────────────────────────
  const [filters,  setFilters]  = useState(DEFAULT_FILTERS);
  const [sortDir,  setSortDir]  = useState("arrival_asc");
  const [fetching, setFetching] = useState(false);

  const abortRef    = useRef(null);
  const finAbortRef = useRef(null);

  // ── Load reservation list ────────────────────────────────
  const loadReservations = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setListLoading(true);
    setListError("");
    setFetching(true);

    try {
      const data = await fetchReservations({ signal: controller.signal });
      if (controller.signal.aborted) return;

      const raw = Array.isArray(data?.results) ? data.results : [];
      setReservations(raw.map(normalizeReservation).filter(Boolean));
    } catch (err) {
      if (err?.name === "AbortError") return;
      setListError(err?.message || "Failed to load reservations");
    } finally {
      if (!controller.signal.aborted) {
        setListLoading(false);
        setFetching(false);
      }
    }
  }, []);

  useEffect(() => {
    loadReservations();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [loadReservations]);

  // ── Load financials on selection ─────────────────────────
  useEffect(() => {
    if (finAbortRef.current) finAbortRef.current.abort();

    if (!selectedId) {
      setFinancials(null);
      setFinError("");
      return;
    }

    const controller = new AbortController();
    finAbortRef.current = controller;

    setFinancials(null);
    setFinError("");
    setFinLoading(true);

    fetchFinancials(selectedId, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setFinancials(data); })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        if (!controller.signal.aborted) setFinError(err?.message || "Failed to load financials");
      })
      .finally(() => { if (!controller.signal.aborted) setFinLoading(false); });

    return () => controller.abort();
  }, [selectedId]);

  // ── Computed values ──────────────────────────────────────
  const selectedReservation = useMemo(
    () => reservations.find((r) => r.id === selectedId) || null,
    [reservations, selectedId],
  );

  const filteredCount = useMemo(() => {
    if (!Array.isArray(reservations)) return 0;
    return reservations.filter((r) => {
      const search = (filters.search || "").toLowerCase();
      if (search) {
        const hay = [r.guestName, r.guestEmail, r.id, r.confirmationNumber, r.propertyId]
          .map((v) => String(v || "").toLowerCase()).join(" ");
        if (!hay.includes(search)) return false;
      }
      if (filters.status && !String(r.status || "").toLowerCase().includes(filters.status)) return false;
      return true;
    }).length;
  }, [reservations, filters]);

  const hideChatConcierge = true; // prevent concierge on admin pages

  return (
    <div className="ar-page">
      {fetching && <div className="ar-loading-bar" aria-hidden="true" />}

      {/* ── Header ─────────────────────────────────────── */}
      <header className="ar-header">
        <div className="ar-header-left">
          <span className="ar-kicker">OneLuxStay · Internal</span>
          <h1 className="ar-title">Reservation Manager</h1>
        </div>
        <div className="ar-header-actions">
          <button
            className="ar-btn ar-btn-primary"
            onClick={loadReservations}
            disabled={listLoading}
            title="Refresh reservation list"
          >
            {listLoading ? <span className="ar-spinner" /> : "↻"}
            <span className="ar-btn-label">{listLoading ? "Loading" : "Refresh"}</span>
          </button>
        </div>
      </header>

      {/* ── Filters ────────────────────────────────────── */}
      <ReservationFilters
        filters={filters}
        onFiltersChange={setFilters}
        total={reservations.length}
        shown={filteredCount}
        loading={listLoading}
      />

      {/* ── 3-panel layout ─────────────────────────────── */}
      <div className="ar-shell">
        <ReservationList
          reservations={reservations}
          loading={listLoading}
          error={listError}
          selectedId={selectedId}
          onSelect={setSelectedId}
          filters={filters}
          sortDir={sortDir}
          onSortChange={setSortDir}
          onRetry={loadReservations}
        />

        <ReservationDetails
          reservation={selectedReservation}
          financials={financials}
          financialsLoading={finLoading}
          financialsError={finError}
        />
      </div>
    </div>
  );
}
