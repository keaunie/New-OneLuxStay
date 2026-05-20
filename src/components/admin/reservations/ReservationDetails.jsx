import { useState } from "react";
import { resolveStatus } from "./ReservationCard.jsx";
import GuestPanel from "./GuestPanel.jsx";
import PaymentPanel from "./PaymentPanel.jsx";
import FolioPanel from "./FolioPanel.jsx";
import { ChargesTable, PaymentsTable } from "./ChargesTable.jsx";

const toIso = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const fmtDate = (iso = "") => {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
};

const fmtDateTime = (value = "") => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const nights = (checkIn, checkOut) => {
  const a = Date.parse(`${toIso(checkIn)}T00:00:00Z`);
  const b = Date.parse(`${toIso(checkOut)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const n = Math.round((b - a) / 86_400_000);
  return n >= 0 ? n : null;
};

const Row = ({ label, value, mono = false, wide = false }) => (
  <div className={`ar-field${wide ? " ar-field-wide" : ""}`}>
    <span className="ar-field-label">{label}</span>
    <span className={`ar-field-value${mono ? " ar-mono" : ""}${!value ? " ar-muted" : ""}`}>
      {value || "—"}
    </span>
  </div>
);

const TABS = [
  { key: "guest",    label: "Guest" },
  { key: "payment",  label: "Payment" },
  { key: "folios",   label: "Folios" },
  { key: "charges",  label: "Charges" },
  { key: "payments", label: "Payments" },
];

function StayInfoSection({ reservation }) {
  const raw    = reservation.raw || {};
  const n      = nights(reservation.checkIn, reservation.checkOut);
  const status = resolveStatus(reservation.status);
  const ratePlan = String(raw?.ratePlan?.name || raw?.ratePlanId || raw?.ratePlan || "").trim();
  const bookingId = String(raw?.bookingId || raw?.booking?.id || "").trim();
  const adults   = reservation.adults   != null ? String(reservation.adults)   : null;
  const children = reservation.children != null ? String(reservation.children) : null;
  const created  = fmtDateTime(raw?.created || raw?.createdAt || raw?.bookedAt);

  return (
    <>
      <div className="ar-detail-hero">
        <h2 className="ar-detail-hero-name">
          {reservation.guestName || "Unknown Guest"}
        </h2>
        <p className="ar-detail-hero-sub">
          {reservation.propertyId && <>{reservation.propertyId} · </>}
          {toIso(reservation.checkIn)} → {toIso(reservation.checkOut)}
          {n !== null && <> · <span className="ar-nights-pill">{n} nights</span></>}
        </p>
        <div className="ar-detail-hero-badges">
          <span className={`ar-badge ${status.cls}`}>{status.label}</span>
          {reservation.channel && (
            <span className="ar-badge neutral">{reservation.channel}</span>
          )}
          {reservation.confirmationNumber && (
            <span className="ar-badge gold" style={{ fontFamily: "monospace", fontSize: 11 }}>
              #{reservation.confirmationNumber}
            </span>
          )}
        </div>
      </div>

      <div className="ar-section">
        <p className="ar-section-title">Stay Info</p>
        <div className="ar-field-grid">
          <Row label="Reservation ID"   value={reservation.id}                 mono />
          {bookingId && <Row label="Booking ID" value={bookingId}              mono />}
          <Row label="Arrival"          value={fmtDate(toIso(reservation.checkIn))} />
          <Row label="Departure"        value={fmtDate(toIso(reservation.checkOut))} />
          <Row label="Property"         value={reservation.propertyId} />
          <Row label="Unit"             value={reservation.unitName || reservation.unitGroupName} />
          {ratePlan && <Row label="Rate Plan" value={ratePlan} />}
          <Row label="Status"           value={status.label} />
          <Row label="Channel"          value={reservation.channel} />
          {adults   && <Row label="Adults"   value={adults} />}
          {children && <Row label="Children" value={children} />}
          <Row label="Confirmation #"   value={reservation.confirmationNumber} mono />
          {created !== "—" && <Row label="Booked On" value={created} />}
        </div>
      </div>
    </>
  );
}

function AllChargesSection({ financials }) {
  const allCharges = (financials?.folios || []).flatMap((f) => Array.isArray(f?.charges) ? f.charges : []);
  return (
    <div className="ar-section">
      <p className="ar-section-title">All Charges ({allCharges.length})</p>
      <ChargesTable charges={allCharges} />
    </div>
  );
}

function AllPaymentsSection({ financials }) {
  const allPayments = (financials?.folios || []).flatMap((f) => Array.isArray(f?.payments) ? f.payments : []);
  return (
    <div className="ar-section">
      <p className="ar-section-title">All Payments ({allPayments.length})</p>
      <PaymentsTable payments={allPayments} />
    </div>
  );
}

export default function ReservationDetails({
  reservation,
  financials,
  financialsLoading,
  financialsError,
}) {
  const [activeTab, setActiveTab] = useState("guest");

  if (!reservation) {
    return (
      <>
        <div className="ar-detail-panel">
          <div className="ar-detail-placeholder">
            <div className="ar-detail-placeholder-icon">🏨</div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "rgba(244,237,227,0.4)" }}>
              Select a reservation
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(244,237,227,0.25)" }}>
              Choose from the list to view stay details
            </p>
          </div>
        </div>
        <div className="ar-right-panel">
          <div className="ar-tabs-bar">
            {TABS.map((t) => (
              <button key={t.key} className="ar-tab" disabled>{t.label}</button>
            ))}
          </div>
          <div className="ar-tab-placeholder">
            <p style={{ margin: 0, fontSize: 13, color: "rgba(244,237,227,0.3)" }}>
              No reservation selected
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* CENTER — stay details */}
      <div className="ar-detail-panel">
        <div className="ar-detail-scroll">
          <StayInfoSection reservation={reservation} />
        </div>
      </div>

      {/* RIGHT — tabbed panels */}
      <div className="ar-right-panel">
        <div className="ar-tabs-bar">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`ar-tab${activeTab === t.key ? " is-active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ar-tab-content">
          {activeTab === "guest" && (
            <GuestPanel reservation={reservation} />
          )}

          {activeTab === "payment" && (
            <PaymentPanel
              financials={financials}
              loading={financialsLoading}
              error={financialsError}
            />
          )}

          {activeTab === "folios" && (
            <FolioPanel
              financials={financials}
              loading={financialsLoading}
              error={financialsError}
            />
          )}

          {activeTab === "charges" && (
            financialsLoading
              ? <div style={{ padding: 16 }}><span className="ar-spinner" /> Loading charges…</div>
              : <AllChargesSection financials={financials} />
          )}

          {activeTab === "payments" && (
            financialsLoading
              ? <div style={{ padding: 16 }}><span className="ar-spinner" /> Loading payments…</div>
              : <AllPaymentsSection financials={financials} />
          )}
        </div>
      </div>
    </>
  );
}
