import { useMemo } from "react";
import ReservationCard, { resolveStatus } from "./ReservationCard.jsx";

const SkeletonCard = () => (
  <div className="ar-skeleton-card">
    <div className="ar-skeleton ar-skeleton-line" style={{ width: "70%", height: 14 }} />
    <div className="ar-skeleton ar-skeleton-line" style={{ width: "55%", height: 11 }} />
    <div className="ar-skeleton ar-skeleton-line" style={{ width: "85%", height: 10 }} />
  </div>
);

const toIso = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const matchesSearch = (row, query) => {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    row.guestName,
    row.guestEmail,
    row.guestPhone,
    row.id,
    row.confirmationNumber,
    row.propertyId,
    row.unitName,
    row.unitGroupName,
    row.channel,
  ].map((v) => String(v || "").toLowerCase()).join(" ");
  return haystack.includes(q);
};

const matchesStatus = (row, statusFilter) => {
  if (!statusFilter) return true;
  const resolved = resolveStatus(row.status);
  return (
    row.status?.toLowerCase().includes(statusFilter) ||
    resolved.label?.toLowerCase().includes(statusFilter)
  );
};

const matchesArrival = (row, arrivalFilter) => {
  if (!arrivalFilter) return true;
  const today = todayIso();
  const checkIn = toIso(row.checkIn);
  const checkOut = toIso(row.checkOut);
  if (!checkIn) return false;

  switch (arrivalFilter) {
    case "today":       return checkIn === today;
    case "this_week": {
      const d = new Date(today);
      const weekEnd = new Date(d);
      weekEnd.setDate(d.getDate() + 7);
      return checkIn >= today && checkIn <= weekEnd.toISOString().slice(0, 10);
    }
    case "this_month": {
      const [y, m] = today.split("-");
      return checkIn.startsWith(`${y}-${m}`);
    }
    case "upcoming":   return checkIn > today;
    case "past":       return checkOut && checkOut < today;
    default:           return true;
  }
};

const matchesCity = (row, cityFilter) => {
  if (!cityFilter) return true;
  const city = cityFilter.toLowerCase();
  return (
    String(row.propertyId || "").toLowerCase().includes(city) ||
    String(row.propertyTitle || "").toLowerCase().includes(city)
  );
};

const SORT_OPTIONS = [
  { value: "arrival_asc",  label: "Arrival ↑" },
  { value: "arrival_desc", label: "Arrival ↓" },
  { value: "name_asc",     label: "Guest A–Z" },
  { value: "name_desc",    label: "Guest Z–A" },
];

export default function ReservationList({
  reservations,
  loading,
  error,
  selectedId,
  onSelect,
  filters,
  sortDir,
  onSortChange,
  onRetry,
}) {
  const filtered = useMemo(() => {
    if (!Array.isArray(reservations)) return [];

    let rows = reservations.filter((row) =>
      matchesSearch(row, filters.search) &&
      matchesStatus(row, filters.status) &&
      matchesArrival(row, filters.arrival) &&
      matchesCity(row, filters.city),
    );

    rows.sort((a, b) => {
      switch (sortDir) {
        case "arrival_desc": {
          const diff = (b.checkIn || "").localeCompare(a.checkIn || "");
          return diff !== 0 ? diff : (a.guestName || "").localeCompare(b.guestName || "");
        }
        case "name_asc":
          return (a.guestName || "").localeCompare(b.guestName || "");
        case "name_desc":
          return (b.guestName || "").localeCompare(a.guestName || "");
        default: { // arrival_asc
          const diff = (a.checkIn || "").localeCompare(b.checkIn || "");
          return diff !== 0 ? diff : (a.guestName || "").localeCompare(b.guestName || "");
        }
      }
    });

    return rows;
  }, [reservations, filters, sortDir]);

  return (
    <div className="ar-list-panel">
      <div className="ar-list-header">
        <span className="ar-list-title">
          {loading ? "Loading…" : `${filtered.length} results`}
        </span>
        <select
          className="ar-sort-select"
          value={sortDir}
          onChange={(e) => onSortChange(e.target.value)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="ar-list-scroll">
        {loading && (
          <>
            {Array.from({ length: 7 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </>
        )}

        {!loading && error && (
          <div style={{ padding: "16px" }}>
            <div className="ar-error-banner">
              <span>⚠</span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Failed to load</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{error}</div>
                {onRetry && (
                  <button
                    className="ar-btn"
                    style={{ marginTop: 8, fontSize: 12, padding: "5px 10px" }}
                    onClick={onRetry}
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="ar-empty">
            <div className="ar-empty-icon">📋</div>
            <p className="ar-empty-title">No reservations found</p>
            <p className="ar-empty-sub">
              {Array.isArray(reservations) && reservations.length > 0
                ? "Try adjusting the filters."
                : "No reservations loaded yet."}
            </p>
          </div>
        )}

        {!loading && !error && filtered.map((res) => (
          <ReservationCard
            key={res.id}
            reservation={res}
            isSelected={res.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
