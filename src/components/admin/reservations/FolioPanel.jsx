import { useState } from "react";
import { ChargesTable, PaymentsTable } from "./ChargesTable.jsx";

const fmtAmount = (amount, currency) => {
  const n = Number(amount?.amount ?? amount ?? 0);
  const cur = String(amount?.currency || currency || "EUR").toUpperCase();
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
  } catch {
    return `${cur} ${n.toFixed(2)}`;
  }
};

function FolioCard({ folio, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  const id       = String(folio?.id || "").trim();
  const balance  = folio?.balance ?? folio?.outstandingBalance ?? folio?.totalBalance;
  const charges  = Array.isArray(folio?.charges)  ? folio.charges  : [];
  const payments = Array.isArray(folio?.payments)  ? folio.payments : [];
  const status   = String(folio?.status || folio?.state || "").trim();
  const currency = folio?.balance?.currency || folio?.currency || "EUR";

  const totalCharges  = charges.reduce((s, c)  => s + Number(c?.amount?.amount  ?? c?.amount  ?? 0), 0);
  const totalPayments = payments.reduce((s, p) => s + Number(p?.amount?.amount ?? p?.amount ?? 0), 0);

  const balanceNum = Number(balance?.amount ?? balance ?? 0);
  const isZero     = Math.abs(balanceNum) < 0.01;

  return (
    <div className="ar-folio-card">
      <div className="ar-folio-card-top">
        <div>
          <div className="ar-folio-card-id">{id || "Folio"}</div>
          {status && (
            <span className="ar-badge neutral" style={{ fontSize: 10, marginTop: 4 }}>{status}</span>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={`ar-folio-balance${isZero ? " ar-balance-zero" : ""}`}>
            {fmtAmount(balance, currency)}
          </div>
          <div style={{ fontSize: 11, color: "rgba(205,167,108,0.45)", marginTop: 2 }}>balance</div>
        </div>
      </div>

      <div className="ar-folio-stats">
        <div className="ar-folio-stat">
          <span className="ar-folio-stat-label">Charges</span>
          <span className="ar-folio-stat-value">{charges.length} · {fmtAmount(totalCharges, currency)}</span>
        </div>
        <div className="ar-folio-stat">
          <span className="ar-folio-stat-label">Payments</span>
          <span className="ar-folio-stat-value">{payments.length} · {fmtAmount(totalPayments, currency)}</span>
        </div>
      </div>

      {(charges.length > 0 || payments.length > 0) && (
        <>
          <div className="ar-divider" />
          <button
            className="ar-btn"
            style={{ width: "100%", justifyContent: "center", fontSize: 12, padding: "6px 10px" }}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "▲ Hide details" : "▼ Show charges & payments"}
          </button>

          {open && (
            <div style={{ marginTop: 12 }}>
              {charges.length > 0 && (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: "rgba(205,167,108,0.55)" }}>
                    Charges
                  </p>
                  <ChargesTable charges={charges} />
                  <div style={{ marginBottom: 14 }} />
                </>
              )}
              {payments.length > 0 && (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: "rgba(205,167,108,0.55)" }}>
                    Payments
                  </p>
                  <PaymentsTable payments={payments} />
                </>
              )}
            </div>
          )}
        </>
      )}

      {folio?._errors && (folio._errors.charges || folio._errors.payments) && (
        <div className="ar-error-banner" style={{ marginTop: 10 }}>
          <span>⚠</span>
          <span style={{ fontSize: 11 }}>
            {[folio._errors.charges, folio._errors.payments].filter(Boolean).join(" | ")}
          </span>
        </div>
      )}
    </div>
  );
}

export default function FolioPanel({ financials, loading, error }) {
  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="ar-folio-card" style={{ marginBottom: 10 }}>
            <div className="ar-skeleton ar-skeleton-line" style={{ width: "40%", height: 12, marginBottom: 8 }} />
            <div className="ar-skeleton ar-skeleton-line" style={{ width: "30%", height: 22, marginBottom: 8 }} />
            <div className="ar-skeleton ar-skeleton-line" style={{ width: "80%", height: 10 }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <div className="ar-error-banner"><span>⚠</span><span>{error}</span></div>
      </div>
    );
  }

  const folios = Array.isArray(financials?.folios) ? financials.folios : [];

  if (!financials || folios.length === 0) {
    return (
      <div className="ar-tab-placeholder">
        <div style={{ fontSize: 32, opacity: 0.4 }}>🧾</div>
        <p style={{ margin: 0, fontSize: 13 }}>
          {!financials ? "Select a reservation to view folios" : "No folios on file"}
        </p>
        {financials?.errors?.folios && (
          <p style={{ fontSize: 12, color: "#e08080", margin: 0 }}>
            {financials.errors.folios}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="ar-section">
      <p className="ar-section-title">Folios ({folios.length})</p>
      {folios.map((folio, i) => (
        <FolioCard key={folio?.id || i} folio={folio} defaultOpen={folios.length === 1} />
      ))}
    </div>
  );
}
