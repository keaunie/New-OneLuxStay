import { useState } from "react";

// ─── pure helpers ────────────────────────────────────────────────────────────

const sanitize = (value = "", maxLength = 240) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const toIsoDate = (value = "") => {
  const raw = sanitize(value, 80);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const nightsBetween = (arrival = "", departure = "") => {
  const start = toIsoDate(arrival);
  const end = toIsoDate(departure);
  if (!start || !end) return null;
  const diff = Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
};

const formatGuestAddress = (value) => {
  const a = value && typeof value === "object" ? value : null;
  if (!a) return "—";
  const parts = [
    sanitize(a.addressLine1, 240),
    sanitize(a.city, 160),
    sanitize(a.postalCode, 40),
    sanitize(a.countryCode, 12).toUpperCase(),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
};

const readGuestsLabel = (row) => {
  const adults = Number.isFinite(Number(row?.adults)) && Number(row?.adults) >= 0 ? Number(row.adults) : null;
  const children = Number.isFinite(Number(row?.children)) && Number(row?.children) >= 0 ? Number(row.children) : null;
  if (adults == null && children == null) return "—";
  const total = (adults || 0) + (children || 0);
  const parts = [];
  if (adults != null) parts.push(`${adults}A`);
  if (children != null) parts.push(`${children}C`);
  return `${total} (${parts.join(" / ")})`;
};

const normalizeStatus = (rawStatus = "") => {
  const v = sanitize(rawStatus, 80).toLowerCase();
  if (!v) return { label: "Unknown", cls: "warn" };
  if (/(cancel|void)/.test(v)) return { label: "Cancelled", cls: "err" };
  if (/(check.?out|checked.?out|departed|closed)/.test(v)) return { label: "Checked-out", cls: "neutral" };
  if (/(check.?in|checked.?in|in.?house|inhouse|staying)/.test(v)) return { label: "Checked-in", cls: "info" };
  if (/(confirm|booked|definite)/.test(v)) return { label: "Confirmed", cls: "ok" };
  if (/(pending|option|tentative|request|inquiry)/.test(v)) return { label: "Pending", cls: "warn" };
  return { label: sanitize(rawStatus, 80) || "Unknown", cls: "neutral" };
};

const formatCurrency = (amount, currency) => {
  if (amount == null) return "—";
  const num = Number(amount);
  if (!Number.isFinite(num)) return "—";
  return currency ? `${currency} ${num.toFixed(2)}` : num.toFixed(2);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return sanitize(String(value), 30);
  return d.toISOString().slice(0, 16).replace("T", " ");
};

const formatJson = (value) => {
  const visited = new WeakSet();
  try {
    return JSON.stringify(
      value ?? null,
      (_k, v) => {
        if (!v || typeof v !== "object") return v;
        if (visited.has(v)) return "[Circular]";
        visited.add(v);
        return v;
      },
      2,
    );
  } catch {
    return "{}";
  }
};

// ─── shared micro-components ─────────────────────────────────────────────────

function DetailRow({ label, children }) {
  return (
    <div className="apaleo-fin-row">
      <span className="apaleo-fin-row-label">{label}</span>
      <strong className="apaleo-fin-row-value">{children || "—"}</strong>
    </div>
  );
}

function FinLoading() {
  return <p className="apaleo-fin-status">Loading financial data…</p>;
}

function FinError({ error }) {
  return (
    <p className="apaleo-fin-status apaleo-fin-status--err">
      {sanitize(error || "Unable to load financial data.", 200)}
    </p>
  );
}

function FinEmpty({ message }) {
  return <p className="apaleo-fin-empty">{message || "No data available."}</p>;
}

// ─── tab panels ──────────────────────────────────────────────────────────────

function OverviewTab({ reservation }) {
  const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
  const status = normalizeStatus(reservation.status);

  return (
    <div className="apaleo-fin-section">
      <div className="apaleo-fin-grid">
        <DetailRow label="Reservation ID">{reservation.id}</DetailRow>
        <DetailRow label="Confirmation">{reservation.confirmationNumber}</DetailRow>
        <DetailRow label="Status">
          <span className={`apaleo-badge apaleo-status ${status.cls}`}>{status.label}</span>
        </DetailRow>
        <DetailRow label="Arrival">{reservation.checkIn}</DetailRow>
        <DetailRow label="Departure">{reservation.checkOut}</DetailRow>
        <DetailRow label="Nights">{nights != null ? String(nights) : "—"}</DetailRow>
        <DetailRow label="Guests">{readGuestsLabel(reservation)}</DetailRow>
        <DetailRow label="Property">{reservation.propertyTitle || reservation.propertyId}</DetailRow>
        <DetailRow label="Unit">{reservation.unitName}</DetailRow>
        <DetailRow label="Channel">{reservation.channel}</DetailRow>
      </div>
    </div>
  );
}

function GuestTab({ reservation }) {
  const profile = reservation.guestProfile;
  return (
    <div className="apaleo-fin-section">
      <div className="apaleo-fin-grid">
        <DetailRow label="Name">{reservation.guestName}</DetailRow>
        <DetailRow label="Email">{reservation.guestEmail}</DetailRow>
        <DetailRow label="Phone">{reservation.guestPhone}</DetailRow>
        <DetailRow label="Address">{formatGuestAddress(reservation.guestAddress)}</DetailRow>
        {profile?.nationality && <DetailRow label="Nationality">{profile.nationality}</DetailRow>}
        {profile?.gender && <DetailRow label="Gender">{profile.gender}</DetailRow>}
        {profile?.birthDate && <DetailRow label="Birth date">{toIsoDate(profile.birthDate)}</DetailRow>}
        {profile?.identificationDocument?.type && (
          <DetailRow label="ID type">
            {profile.identificationDocument.type}
            {profile.identificationDocument.number
              ? ` — ${sanitize(profile.identificationDocument.number, 60)}`
              : ""}
          </DetailRow>
        )}
        {profile?.preferredLanguage && (
          <DetailRow label="Language">{profile.preferredLanguage}</DetailRow>
        )}
      </div>
    </div>
  );
}

function PaymentAccountsTab({ financials, loading, error }) {
  if (loading) return <FinLoading />;
  if (error && !financials) return <FinError error={error} />;

  const accounts = financials?.paymentAccounts || [];
  const apiErr = financials?.errors?.paymentAccounts;

  if (apiErr && !accounts.length) return <FinError error={apiErr} />;
  if (!accounts.length) return <FinEmpty message="No payment accounts on record." />;

  return (
    <div className="apaleo-fin-cards">
      {accounts.map((acct, idx) => {
        const card = acct?.paymentMethod?.cardDetails || {};
        const methodType = sanitize(
          card.type || card.brand || acct?.paymentMethod?.type || acct?.type || "",
          60,
        );
        const masked = sanitize(card.maskedCardNumber || acct?.maskedCardNumber || "", 40);
        const expiry =
          card.expiryMonth && card.expiryYear
            ? `${String(card.expiryMonth).padStart(2, "0")} / ${card.expiryYear}`
            : card.expiry
              ? sanitize(String(card.expiry), 20)
              : null;
        const email = sanitize(acct?.payerEmail || acct?.email || "", 200);
        const isDefault = Boolean(acct?.isDefault ?? acct?.isBookingDefault);
        const isActive = acct?.isActive !== false;

        return (
          <div key={acct?.id || idx} className="apaleo-payment-card">
            <div className="apaleo-payment-card-top">
              <span className="apaleo-payment-card-brand">{methodType || "Card"}</span>
              <div className="apaleo-payment-card-badges">
                {isDefault && <span className="apaleo-badge ok">Default</span>}
                {isActive && <span className="apaleo-badge info">Active</span>}
              </div>
            </div>
            <div className="apaleo-payment-card-number">
              {masked || "•••• •••• •••• ••••"}
            </div>
            <div className="apaleo-fin-grid apaleo-fin-grid--sm">
              {expiry && <DetailRow label="Expiry">{expiry}</DetailRow>}
              {email && <DetailRow label="Payer email">{email}</DetailRow>}
              {acct?.id && <DetailRow label="Account ID">{sanitize(acct.id, 100)}</DetailRow>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AuthorizationsTab({ financials, loading, error }) {
  if (loading) return <FinLoading />;
  if (error && !financials) return <FinError error={error} />;

  const auths = financials?.authorizations || [];
  const apiErr = financials?.errors?.authorizations;

  if (apiErr && !auths.length) return <FinError error={apiErr} />;
  if (!auths.length) return <FinEmpty message="No authorizations available." />;

  return (
    <div className="apaleo-fin-cards">
      {auths.map((auth, idx) => {
        const amount = auth?.amount?.amount ?? auth?.amount;
        const currency = auth?.amount?.currency || auth?.currency || "";
        const status = sanitize(auth?.status || "", 60);
        const captureStatus = sanitize(auth?.captureStatus || "", 60);
        const isOnHold = Boolean(auth?.isOnHold);
        const created = formatDateTime(auth?.created);
        const statusCls =
          status === "Authorized" ? "ok"
          : status === "Expired" || status === "Reversed" ? "err"
          : "neutral";

        return (
          <div key={auth?.id || idx} className="apaleo-payment-card">
            <div className="apaleo-payment-card-top">
              <span className="apaleo-fin-big-amount">{formatCurrency(amount, currency)}</span>
              <div className="apaleo-payment-card-badges">
                {status && <span className={`apaleo-badge ${statusCls}`}>{status}</span>}
                {isOnHold && <span className="apaleo-badge warn">On hold</span>}
              </div>
            </div>
            <div className="apaleo-fin-grid apaleo-fin-grid--sm">
              <DetailRow label="Created">{created}</DetailRow>
              {captureStatus && <DetailRow label="Capture">{captureStatus}</DetailRow>}
              {auth?.id && <DetailRow label="Auth ID">{sanitize(auth.id, 100)}</DetailRow>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FoliosTab({ financials, loading, error }) {
  if (loading) return <FinLoading />;
  if (error && !financials) return <FinError error={error} />;

  const folios = financials?.folios || [];
  const apiErr = financials?.errors?.folios;

  if (apiErr && !folios.length) return <FinError error={apiErr} />;
  if (!folios.length) return <FinEmpty message="No folios available." />;

  return (
    <div className="apaleo-fin-cards">
      {folios.map((folio, idx) => {
        const balance = folio?.balance;
        const grossAmount = balance?.grossAmount ?? balance?.amount;
        const currency = balance?.currency || "";
        const type = sanitize(folio?.type || "", 60);
        const debitorType = sanitize(folio?.debitorType || "", 60);
        const guestInfo = folio?.debitor?.guestInfo;
        const billingGuest = guestInfo
          ? [guestInfo.firstName, guestInfo.lastName].filter(Boolean).join(" ")
          : "";
        const chargesCount = (folio?.charges || []).length;
        const paymentsCount = (folio?.payments || []).length;
        const invoiceRefs = (folio?.invoiceReferences || []).length;

        return (
          <div key={folio?.id || idx} className="apaleo-payment-card">
            <div className="apaleo-payment-card-top">
              <span className="apaleo-fin-big-amount">{formatCurrency(grossAmount, currency)}</span>
              {type && <span className="apaleo-badge neutral">{type}</span>}
            </div>
            <div className="apaleo-fin-grid apaleo-fin-grid--sm">
              <DetailRow label="Folio ID">{sanitize(folio?.id || "", 100)}</DetailRow>
              {debitorType && <DetailRow label="Debitor type">{debitorType}</DetailRow>}
              {billingGuest && <DetailRow label="Billing guest">{billingGuest}</DetailRow>}
              <DetailRow label="Charges">{String(chargesCount)}</DetailRow>
              <DetailRow label="Payments">{String(paymentsCount)}</DetailRow>
              {invoiceRefs > 0 && (
                <DetailRow label="Invoice refs">{String(invoiceRefs)}</DetailRow>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChargesTab({ financials, loading, error }) {
  if (loading) return <FinLoading />;
  if (error && !financials) return <FinError error={error} />;

  const allCharges = (financials?.folios || []).flatMap((folio) =>
    (folio?.charges || []).map((charge) => ({
      ...charge,
      _folioId: sanitize(folio?.id || "", 60),
    })),
  );

  if (!allCharges.length) return <FinEmpty message="No charges available." />;

  return (
    <div className="apaleo-fin-table-shell">
      <table className="apaleo-fin-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Business date</th>
            <th>VAT</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {allCharges.map((charge, idx) => {
            const amount =
              charge?.amount?.grossAmount ??
              charge?.amount?.amount ??
              charge?.grossAmount ??
              charge?.netAmount;
            const currency = charge?.amount?.currency || charge?.currency || "";
            const name = sanitize(
              charge?.name ||
                charge?.translatedNames?.en ||
                (charge?.translatedNames
                  ? Object.values(charge.translatedNames)[0]
                  : "") ||
                "",
              120,
            );
            const vatType = sanitize(charge?.vatType || charge?.taxRate || "", 40);
            const businessDate = sanitize(charge?.businessDate || "", 12);

            return (
              <tr key={charge?.id || idx}>
                <td>
                  <div>{name || "—"}</div>
                  {charge._folioId && (
                    <div className="apaleo-fin-meta">Folio: {charge._folioId}</div>
                  )}
                </td>
                <td>{businessDate || "—"}</td>
                <td>{vatType || "—"}</td>
                <td className="apaleo-fin-amount-cell">{formatCurrency(amount, currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTab({ financials, loading, error }) {
  if (loading) return <FinLoading />;
  if (error && !financials) return <FinError error={error} />;

  const allPayments = (financials?.folios || []).flatMap((folio) =>
    (folio?.payments || []).map((payment) => ({
      ...payment,
      _folioId: sanitize(folio?.id || "", 60),
    })),
  );

  if (!allPayments.length) return <FinEmpty message="No payments available." />;

  return (
    <div className="apaleo-fin-table-shell">
      <table className="apaleo-fin-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Posted</th>
            <th>Reference</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {allPayments.map((payment, idx) => {
            const amount = payment?.amount?.amount ?? payment?.amount;
            const currency = payment?.amount?.currency || payment?.currency || "";
            const method = sanitize(
              payment?.method?.type ||
                payment?.paymentMethod?.type ||
                payment?.method ||
                payment?.type ||
                "",
              60,
            );
            const posted = formatDateTime(
              payment?.created || payment?.postedAt || payment?.date,
            );
            const reference = sanitize(
              payment?.externalReference || payment?.reference || payment?.id || "",
              60,
            );

            return (
              <tr key={payment?.id || idx}>
                <td>
                  <div>{method || "—"}</div>
                  {payment._folioId && (
                    <div className="apaleo-fin-meta">Folio: {payment._folioId}</div>
                  )}
                </td>
                <td>{posted}</td>
                <td className="apaleo-fin-meta-cell">{reference || "—"}</td>
                <td className="apaleo-fin-amount-cell">{formatCurrency(amount, currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RawTab({ reservation, financials }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <details className="apaleo-entry">
        <summary>Reservation raw payload</summary>
        <div className="apaleo-entry-body">
          <pre className="apaleo-json apaleo-json-tall">
            {formatJson({ guest: reservation.guestProfile, raw: reservation.raw })}
          </pre>
        </div>
      </details>
      {financials && (
        <details className="apaleo-entry">
          <summary>Financial raw payload</summary>
          <div className="apaleo-entry-body">
            <pre className="apaleo-json apaleo-json-tall">{formatJson(financials)}</pre>
          </div>
        </details>
      )}
      {!financials && (
        <p className="apaleo-fin-empty">Financial data not yet loaded — select the Folios, Charges, or Payments tab to trigger a fetch.</p>
      )}
    </div>
  );
}

// ─── tab bar definition ──────────────────────────────────────────────────────

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "guest", label: "Guest" },
  { key: "payment_accounts", label: "Accounts" },
  { key: "authorizations", label: "Authorizations" },
  { key: "folios", label: "Folios" },
  { key: "charges", label: "Charges" },
  { key: "payments", label: "Payments" },
  { key: "raw", label: "Raw JSON" },
];

// ─── main export ─────────────────────────────────────────────────────────────

export default function ReservationFinancialsTabs({
  reservation,
  financials,
  financialsLoading,
  financialsError,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const status = normalizeStatus(reservation.status);

  return (
    <div className="apaleo-fin-panel">
      <div className="apaleo-fin-topbar">
        <div>
          <div className="apaleo-reservation-guest">{reservation.guestName}</div>
          <div className="apaleo-reservation-meta">{reservation.id}</div>
        </div>
        <span className={`apaleo-badge apaleo-status ${status.cls}`}>{status.label}</span>
      </div>

      <div className="apaleo-detail-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`apaleo-detail-tab${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="apaleo-detail-tab-content" role="tabpanel">
        {activeTab === "overview" && <OverviewTab reservation={reservation} />}
        {activeTab === "guest" && <GuestTab reservation={reservation} />}
        {activeTab === "payment_accounts" && (
          <PaymentAccountsTab
            financials={financials}
            loading={financialsLoading}
            error={financialsError}
          />
        )}
        {activeTab === "authorizations" && (
          <AuthorizationsTab
            financials={financials}
            loading={financialsLoading}
            error={financialsError}
          />
        )}
        {activeTab === "folios" && (
          <FoliosTab
            financials={financials}
            loading={financialsLoading}
            error={financialsError}
          />
        )}
        {activeTab === "charges" && (
          <ChargesTab
            financials={financials}
            loading={financialsLoading}
            error={financialsError}
          />
        )}
        {activeTab === "payments" && (
          <PaymentsTab
            financials={financials}
            loading={financialsLoading}
            error={financialsError}
          />
        )}
        {activeTab === "raw" && (
          <RawTab reservation={reservation} financials={financials} />
        )}
      </div>
    </div>
  );
}
