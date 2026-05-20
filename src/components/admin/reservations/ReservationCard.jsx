const STATUS_MAP = {
  confirmed:   { label: "Confirmed",   cls: "confirmed" },
  definite:    { label: "Confirmed",   cls: "confirmed" },
  checked_in:  { label: "Checked-in",  cls: "checked-in" },
  inhouse:     { label: "In-house",    cls: "checked-in" },
  checked_out: { label: "Checked-out", cls: "checked-out" },
  departed:    { label: "Departed",    cls: "checked-out" },
  closed:      { label: "Closed",      cls: "checked-out" },
  cancelled:   { label: "Cancelled",   cls: "cancelled" },
  canceled:    { label: "Cancelled",   cls: "cancelled" },
  noshow:      { label: "No-show",     cls: "cancelled" },
  pending:     { label: "Pending",     cls: "pending" },
  tentative:   { label: "Tentative",   cls: "pending" },
  option:      { label: "Option",      cls: "pending" },
};

export function resolveStatus(rawStatus = "") {
  const key = String(rawStatus || "")
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  return STATUS_MAP[key] || { label: rawStatus || "Unknown", cls: "neutral" };
}

const toIso = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const formatShortDate = (iso = "") => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`;
};

const nights = (checkIn, checkOut) => {
  const a = Date.parse(`${toIso(checkIn)}T00:00:00Z`);
  const b = Date.parse(`${toIso(checkOut)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const n = Math.round((b - a) / 86_400_000);
  return n >= 0 ? n : null;
};

export default function ReservationCard({ reservation, isSelected, onSelect }) {
  const status = resolveStatus(reservation.status);
  const n = nights(reservation.checkIn, reservation.checkOut);
  const checkIn = formatShortDate(toIso(reservation.checkIn));
  const checkOut = formatShortDate(toIso(reservation.checkOut));

  return (
    <div
      className={`ar-res-card${isSelected ? " is-selected" : ""}`}
      onClick={() => onSelect(reservation.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(reservation.id);
      }}
      aria-pressed={isSelected}
    >
      <div className="ar-res-card-top">
        <span className="ar-res-guest">
          {reservation.guestName || "Unknown guest"}
        </span>
        <span className={`ar-badge ${status.cls}`}>{status.label}</span>
      </div>

      <div className="ar-res-dates">
        {checkIn} → {checkOut}
        {n !== null && (
          <span style={{ marginLeft: 6, opacity: 0.6 }}>· {n}n</span>
        )}
      </div>

      <div className="ar-res-meta">
        <span className="ar-res-id" title={reservation.id}>
          {reservation.id}
        </span>
        <span className="ar-res-unit">
          {reservation.unitName || reservation.unitGroupName || reservation.propertyId || ""}
        </span>
      </div>
    </div>
  );
}
