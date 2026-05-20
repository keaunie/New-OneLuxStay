const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked-in" },
  { value: "checked_out", label: "Checked-out" },
  { value: "cancelled", label: "Cancelled" },
  { value: "pending", label: "Pending" },
];

const CITIES = [
  { value: "", label: "All cities" },
  { value: "Antwerp", label: "Antwerp" },
  { value: "Los Angeles", label: "Los Angeles" },
  { value: "Miami", label: "Miami" },
  { value: "Dubai", label: "Dubai" },
  { value: "Redondo Beach", label: "Redondo Beach" },
];

const ARRIVAL_FILTERS = [
  { value: "", label: "Any arrival" },
  { value: "today", label: "Arriving today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

export default function ReservationFilters({ filters, onFiltersChange, total, shown, loading }) {
  const set = (key, value) => onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="ar-filters">
      <div className="ar-filter-group ar-filter-search">
        <span className="ar-filter-icon">⌕</span>
        <input
          className="ar-input"
          type="search"
          placeholder="Guest, ID, email, confirmation..."
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
        />
      </div>

      <div className="ar-filter-group">
        <select
          className="ar-select"
          value={filters.status}
          onChange={(e) => set("status", e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="ar-filter-group">
        <select
          className="ar-select"
          value={filters.city}
          onChange={(e) => set("city", e.target.value)}
        >
          {CITIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="ar-filter-group">
        <select
          className="ar-select"
          value={filters.arrival}
          onChange={(e) => set("arrival", e.target.value)}
        >
          {ARRIVAL_FILTERS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      {!loading && total > 0 && (
        <span className="ar-filter-count">
          {shown === total ? `${total} reservations` : `${shown} / ${total}`}
        </span>
      )}
    </div>
  );
}
