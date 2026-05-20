export default function ReservationFilters({ filters, onFiltersChange, cities = [], count, total, loading }) {
  const set = (key, value) => onFiltersChange({ ...filters, [key]: value });

  return (
    <div className="grp-filters">
      <div className="grp-filter-group">
        <span className="grp-filter-label">City</span>
        <select
          className="grp-filter-select"
          value={filters.city}
          onChange={(e) => set("city", e.target.value)}
        >
          <option value="">All Cities</option>
          {cities.map((c) => (
            <option key={c} value={c.toLowerCase()}>{c}</option>
          ))}
        </select>
      </div>

      <div className="grp-filter-sep" />

      <div className="grp-filter-group">
        <span className="grp-filter-label">Min. Guests</span>
        <input
          type="number"
          className="grp-filter-input"
          style={{ width: 90 }}
          min={1}
          max={20}
          placeholder="Any"
          value={filters.guests || ""}
          onChange={(e) => set("guests", e.target.value ? Number(e.target.value) : "")}
        />
      </div>

      <div className="grp-filter-sep" />

      <div className="grp-filter-group">
        <span className="grp-filter-label">Search</span>
        <input
          type="text"
          className="grp-filter-input"
          placeholder="Property or room…"
          value={filters.search}
          onChange={(e) => set("search", e.target.value)}
        />
      </div>

      <span className="grp-filter-count">
        {loading
          ? "Loading Apaleo inventory…"
          : `${count} of ${total} ${total === 1 ? "unit" : "units"}`}
      </span>
    </div>
  );
}
