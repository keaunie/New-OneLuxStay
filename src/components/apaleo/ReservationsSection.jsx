import { useEffect, useMemo, useState } from "react";
import { fetchApaleoFinancials } from "../../services/apaleoService";
import ReservationFinancialsTabs from "./ReservationFinancialsTabs";

const sanitize = (value = "", maxLength = 240) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const toIsoDate = (value = "") => {
  const raw = sanitize(value, 80);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const formatJson = (value) => {
  const visited = new WeakSet();
  try {
    return JSON.stringify(
      value ?? null,
      (_key, val) => {
        if (!val || typeof val !== "object") return val;
        if (visited.has(val)) return "[Circular]";
        visited.add(val);
        return val;
      },
      2,
    );
  } catch (error) {
    return JSON.stringify({ error: "Unable to stringify value", message: error?.message || String(error) }, null, 2);
  }
};


const nightsBetween = (arrival = "", departure = "") => {
  const start = toIsoDate(arrival);
  const end = toIsoDate(departure);
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const diff = Math.round((endMs - startMs) / 86_400_000);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
};

const normalizeStatus = (rawStatus = "") => {
  const value = sanitize(rawStatus, 80).toLowerCase();

  if (!value) return { label: "Unknown", cls: "warn", key: "unknown" };
  if (/(cancel|void)/.test(value)) return { label: "Cancelled", cls: "err", key: "cancelled" };
  if (/(check.?out|checked.?out|departed|closed)/.test(value)) return { label: "Checked-out", cls: "neutral", key: "checked_out" };
  if (/(check.?in|checked.?in|in.?house|inhouse|staying)/.test(value)) return { label: "Checked-in", cls: "info", key: "checked_in" };
  if (/(confirm|booked|definite)/.test(value)) return { label: "Confirmed", cls: "ok", key: "confirmed" };
  if (/(pending|option|tentative|request|inquiry)/.test(value)) return { label: "Pending", cls: "warn", key: "pending" };

  return { label: sanitize(rawStatus, 80) || "Unknown", cls: "neutral", key: value };
};

const buildFilter = (filterKey = "all", todayIso = "") => {
  if (!todayIso) return () => true;

  if (filterKey === "today_arrivals") {
    return (row) => toIsoDate(row.checkIn) === todayIso;
  }

  if (filterKey === "in_house") {
    return (row) => {
      const arrival = toIsoDate(row.checkIn);
      const departure = toIsoDate(row.checkOut);
      if (!arrival || !departure) return false;
      const status = normalizeStatus(row.status);
      if (status.key === "cancelled") return false;
      return arrival <= todayIso && departure > todayIso;
    };
  }

  if (filterKey === "upcoming") {
    return (row) => {
      const arrival = toIsoDate(row.checkIn);
      if (!arrival) return false;
      const status = normalizeStatus(row.status);
      if (status.key === "cancelled") return false;
      return arrival > todayIso;
    };
  }

  if (filterKey === "checked_out") {
    return (row) => {
      const departure = toIsoDate(row.checkOut);
      if (!departure) return false;
      return departure <= todayIso;
    };
  }

  return () => true;
};

const buildSearch = (query = "") => {
  const normalized = sanitize(query, 120).toLowerCase();
  if (!normalized) return () => true;
  return (row) => {
    const haystack = [
      row.guestName,
      row.guestEmail,
      row.guestPhone,
      row.confirmationNumber,
      row.id,
      row.propertyId,
      row.unitName,
      row.unitGroupName,
      row.unitId,
      row.unitGroupId,
      row.channel,
    ]
      .map((value) => sanitize(value, 240).toLowerCase())
      .filter(Boolean)
      .join(" • ");
    return haystack.includes(normalized);
  };
};

const toCount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const formatGuestAddress = (value) => {
  const address = value && typeof value === "object" ? value : null;
  if (!address) return "—";

  const parts = [
    sanitize(address?.addressLine1, 240),
    sanitize(address?.city, 160),
    sanitize(address?.postalCode, 40),
    sanitize(address?.countryCode, 12).toUpperCase(),
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "—";
};

const readGuestsLabel = (row) => {
  const adults = toCount(row.adults);
  const children = toCount(row.children);
  if (adults == null && children == null) return "—";
  const total = (adults || 0) + (children || 0);
  const parts = [];
  if (adults != null) parts.push(`${adults}A`);
  if (children != null) parts.push(`${children}C`);
  return `${total} (${parts.join(" / ")})`;
};

export default function ReservationsSection({
  reservationsPayload,
  propertiesPayload,
  unitGroupsPayload,
  loading = false,
}) {
  const [filterKey, setFilterKey] = useState("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState("arrival_asc");
  const [selectedId, setSelectedId] = useState("");

  const [financials, setFinancials] = useState(null);
  const [financialsLoading, setFinancialsLoading] = useState(false);
  const [financialsError, setFinancialsError] = useState("");

  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  const propertyTitleById = useMemo(() => {
    const map = new Map();
    for (const property of propertiesPayload?.results || []) {
      const id = sanitize(property?.id || property?.propertyId || property?.raw?.id, 120);
      if (!id) continue;
      map.set(id, sanitize(property?.title || property?.name || id, 200));
    }
    return map;
  }, [propertiesPayload]);

  const unitGroupNameById = useMemo(() => {
    const map = new Map();
    for (const unitGroup of unitGroupsPayload?.results || []) {
      const id = sanitize(unitGroup?.id || unitGroup?.unitGroupId || unitGroup?.raw?.id, 120);
      if (!id) continue;
      map.set(id, sanitize(unitGroup?.name || unitGroup?.title || id, 200));
    }
    return map;
  }, [unitGroupsPayload]);

  const normalizedRows = useMemo(() => {
    const list = Array.isArray(reservationsPayload?.results) ? reservationsPayload.results : [];
    return list
      .map((row) => {
        const reservation =
          row?.raw && typeof row.raw === "object"
            ? row.raw
            : row && typeof row === "object"
              ? row
              : {};

        const guest =
          reservation.primaryGuest ||
          reservation.booker ||
          reservation.profile ||
          reservation.guest ||
          reservation.guests?.[0] ||
          null;

        const guestName = guest
          ? [guest.firstName, guest.middleInitial, guest.lastName]
              .map((value) => sanitize(value, 160))
              .filter(Boolean)
              .join(" ")
          : "Unknown guest";

        const guestEmail = sanitize(guest?.email, 220) || "—";
        const guestPhone = sanitize(guest?.phone, 80) || "—";
        const guestAddress = guest?.address && typeof guest.address === "object" ? guest.address : null;

        const unitGroupName = sanitize(row?.unitGroupName, 220) || unitGroupNameById.get(sanitize(row?.unitGroupId, 120)) || "";
        const unitName = sanitize(row?.unitName, 220);
        const propertyTitle = propertyTitleById.get(sanitize(row?.propertyId, 120)) || "";

        return {
          id: sanitize(row?.id, 160),
          guestName,
          guestEmail,
          guestPhone,
          guestAddress,
          guestProfile: guest && typeof guest === "object" ? guest : null,
          checkIn: toIsoDate(row?.checkIn),
          checkOut: toIsoDate(row?.checkOut),
          status: sanitize(row?.status, 120) || "unknown",
          confirmationNumber: sanitize(row?.confirmationNumber, 180),
          channel: sanitize(row?.channel, 120),
          propertyId: sanitize(row?.propertyId, 120),
          propertyTitle,
          unitGroupId: sanitize(row?.unitGroupId, 120),
          unitGroupName,
          unitId: sanitize(row?.unitId, 120),
          unitName: unitName || unitGroupName || sanitize(row?.unitId, 120) || sanitize(row?.unitGroupId, 120),
          adults: row?.adults ?? null,
          children: row?.children ?? null,
          raw: row?.raw ?? null,
        };
      })
      .filter((row) => row.id);
  }, [reservationsPayload, propertyTitleById, unitGroupNameById]);

  const filteredRows = useMemo(() => {
    const predicate = buildFilter(filterKey, todayIso);
    const matches = buildSearch(search);
    const rows = normalizedRows.filter((row) => predicate(row) && matches(row));

    const factor = sortDir === "arrival_desc" ? -1 : 1;
    rows.sort((a, b) => {
      const left = a.checkIn || "9999-12-31";
      const right = b.checkIn || "9999-12-31";
      if (left === right) return factor * (a.guestName.localeCompare(b.guestName) || a.id.localeCompare(b.id));
      return factor * left.localeCompare(right);
    });

    return rows;
  }, [filterKey, todayIso, normalizedRows, search, sortDir]);

  const selectedReservation = useMemo(() => {
    if (!selectedId) return null;
    return filteredRows.find((row) => row.id === selectedId) || null;
  }, [filteredRows, selectedId]);

  useEffect(() => {
    if (!selectedReservation?.raw) return;
    // Temporary inspector: makes sandbox payload structure obvious in DevTools.
    console.log("FULL RESERVATION", selectedReservation.raw);
  }, [selectedReservation?.id, selectedReservation?.raw]);

  // Fetch financial data whenever the selected reservation changes.
  useEffect(() => {
    if (!selectedId) {
      setFinancials(null);
      setFinancialsError("");
      return;
    }
    let active = true;
    setFinancials(null);
    setFinancialsError("");
    setFinancialsLoading(true);
    fetchApaleoFinancials(selectedId)
      .then((data) => { if (active) setFinancials(data); })
      .catch((err) => { if (active) setFinancialsError(err?.message || String(err)); })
      .finally(() => { if (active) setFinancialsLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const countLabel = `${filteredRows.length}${normalizedRows.length !== filteredRows.length ? ` / ${normalizedRows.length}` : ""}`;

  return (
    <article className="apaleo-card apaleo-col-12">
      <div className="apaleo-reservations-header">
        <div>
          <h3>Reservations</h3>
          <p className="apaleo-reservations-subtitle">
            Showing <strong>{countLabel}</strong> reservations from Apaleo booking API.
          </p>
        </div>
        {reservationsPayload?._meta?.url && (
          <span className="apaleo-badge apaleo-mono" title={reservationsPayload._meta.url}>
            endpoint: {reservationsPayload._meta.endpoint}
          </span>
        )}
      </div>

      <div className="apaleo-reservations-layout">
        <div className="apaleo-reservations-left">
          <div className="apaleo-reservations-left-header">
            <div className="apaleo-reservations-controls">
              <div className="apaleo-filter-row">
                <button
                  type="button"
                  className={`apaleo-filter-chip ${filterKey === "today_arrivals" ? "active" : ""}`}
                  onClick={() => setFilterKey("today_arrivals")}
                >
                  Today arrivals
                </button>
                <button
                  type="button"
                  className={`apaleo-filter-chip ${filterKey === "in_house" ? "active" : ""}`}
                  onClick={() => setFilterKey("in_house")}
                >
                  In-house
                </button>
                <button
                  type="button"
                  className={`apaleo-filter-chip ${filterKey === "upcoming" ? "active" : ""}`}
                  onClick={() => setFilterKey("upcoming")}
                >
                  Upcoming
                </button>
                <button
                  type="button"
                  className={`apaleo-filter-chip ${filterKey === "checked_out" ? "active" : ""}`}
                  onClick={() => setFilterKey("checked_out")}
                >
                  Checked-out
                </button>
                <button
                  type="button"
                  className={`apaleo-filter-chip ${filterKey === "all" ? "active" : ""}`}
                  onClick={() => setFilterKey("all")}
                >
                  All reservations
                </button>
              </div>

              <div className="apaleo-control-row">
                <label className="apaleo-control">
                  <span className="apaleo-control-label">Search</span>
                  <input
                    className="apaleo-input"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Guest, confirmation, reservation id..."
                    inputMode="search"
                  />
                </label>

                <label className="apaleo-control">
                  <span className="apaleo-control-label">Sort</span>
                  <select className="apaleo-select" value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
                    <option value="arrival_asc">Arrival date (oldest first)</option>
                    <option value="arrival_desc">Arrival date (newest first)</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="apaleo-reservations-table-shell">
            <table className="apaleo-reservations-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Arrival → Departure</th>
                <th>Nights</th>
                <th>Guests</th>
                <th>Unit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const nights = nightsBetween(row.checkIn, row.checkOut);
                const status = normalizeStatus(row.status);
                const isSelected = row.id === selectedId;

                return (
                  <tr
                    key={row.id}
                    className={isSelected ? "selected" : ""}
                    onClick={() => setSelectedId(row.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedId(row.id);
                    }}
                    title={row.confirmationNumber ? `Confirmation: ${row.confirmationNumber}` : row.id}
                  >
                    <td>
                      <div className="apaleo-reservation-guest">{row.guestName}</div>
                      <div className="apaleo-reservation-meta">{row.id}</div>
                      {(row.guestEmail !== "—" || row.guestPhone !== "—") && (
                        <div className="apaleo-reservation-meta">
                          {[row.guestEmail !== "—" ? row.guestEmail : "", row.guestPhone !== "—" ? row.guestPhone : ""]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      )}
                      {formatGuestAddress(row.guestAddress) !== "—" && (
                        <div className="apaleo-reservation-meta apaleo-hide-sm">{formatGuestAddress(row.guestAddress)}</div>
                      )}
                    </td>
                    <td>
                      <div className="apaleo-reservation-dates">
                        {row.checkIn || "—"} <span className="apaleo-arrow">→</span> {row.checkOut || "—"}
                      </div>
                      {(row.propertyTitle || row.propertyId) && (
                        <div className="apaleo-reservation-meta">
                          {row.propertyTitle || row.propertyId}
                          {row.channel ? ` • ${row.channel}` : ""}
                        </div>
                      )}
                    </td>
                    <td>{nights == null ? "—" : nights}</td>
                    <td>{readGuestsLabel(row)}</td>
                    <td>{row.unitName || "—"}</td>
                    <td>
                      <span className={`apaleo-badge apaleo-status ${status.cls}`}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
              {!loading && !filteredRows.length && (
                <tr>
                  <td colSpan={6} className="apaleo-empty-cell">
                    No reservations matched these filters.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="apaleo-empty-cell">
                    Loading reservations...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>

        <div className="apaleo-reservations-cards">
          {filteredRows.map((row) => {
            const nights = nightsBetween(row.checkIn, row.checkOut);
            const status = normalizeStatus(row.status);
            const isSelected = row.id === selectedId;

            return (
              <details
                key={row.id}
                className={`apaleo-entry apaleo-reservation-card ${isSelected ? "selected" : ""}`}
                onToggle={(event) => {
                  if (event.currentTarget.open) setSelectedId(row.id);
                }}
              >
                <summary>
                  <span>
                    <span className="apaleo-reservation-guest">{row.guestName}</span>
                    <span className="apaleo-reservation-meta">{row.checkIn || "—"} → {row.checkOut || "—"}</span>
                  </span>
                  <span className={`apaleo-badge apaleo-status ${status.cls}`}>{status.label}</span>
                </summary>
                <div className="apaleo-entry-body">
                  <div className="apaleo-card-lines">
                    <p><strong>Reservation ID:</strong> {row.id}</p>
                    <p><strong>Nights:</strong> {nights == null ? "—" : nights}</p>
                    <p><strong>Guests:</strong> {readGuestsLabel(row)}</p>
                    <p><strong>Email:</strong> {row.guestEmail || "—"}</p>
                    <p><strong>Phone:</strong> {row.guestPhone || "—"}</p>
                    <p><strong>Address:</strong> {row.guestAddress ? formatGuestAddress(row.guestAddress) : "—"}</p>
                    <p><strong>Unit:</strong> {row.unitName || "—"}</p>
                    <p><strong>Confirmation:</strong> {row.confirmationNumber || "—"}</p>
                    <p><strong>Property:</strong> {row.propertyTitle || row.propertyId || "—"}</p>
                    <p><strong>Channel:</strong> {row.channel || "—"}</p>
                  </div>
                </div>
              </details>
            );
          })}
          {!loading && !filteredRows.length && <p className="apaleo-empty">No reservations matched these filters.</p>}
          {loading && <p className="apaleo-empty">Loading reservations...</p>}
        </div>

        <div className="apaleo-reservations-details">
          <div className="apaleo-reservations-details-card">
            {!selectedReservation && (
              <p className="apaleo-empty">Select a reservation row to preview details.</p>
            )}
            {selectedReservation && (
              <ReservationFinancialsTabs
                key={selectedReservation.id}
                reservation={selectedReservation}
                financials={financials}
                financialsLoading={financialsLoading}
                financialsError={financialsError}
              />
            )}
          </div>
        </div>
      </div>

      <details className="apaleo-entry apaleo-reservations-debug" open={!normalizedRows.length}>
        <summary>Reservations API debug</summary>
        <div className="apaleo-entry-body">
          <div className="apaleo-debug-grid">
            <div>
              <p className="apaleo-debug-label"><strong>Client request:</strong></p>
              <pre className="apaleo-json apaleo-json-compact">{formatJson(reservationsPayload?._meta || null)}</pre>
            </div>
            <div>
              <p className="apaleo-debug-label"><strong>Upstream (Apaleo):</strong></p>
              <pre className="apaleo-json apaleo-json-compact">{formatJson(reservationsPayload?.debug || null)}</pre>
            </div>
          </div>
          <p className="apaleo-debug-label"><strong>Payload:</strong></p>
          <pre className="apaleo-json apaleo-json-compact">{formatJson(reservationsPayload)}</pre>
        </div>
      </details>
    </article>
  );
}
