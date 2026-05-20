const fmt = (amount, currency) => {
  const n = Number(amount?.amount ?? amount ?? 0);
  const cur = String(amount?.currency || currency || "EUR").toUpperCase();
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
  } catch {
    return `${cur} ${n.toFixed(2)}`;
  }
};

const SmallRow = ({ label, value, mono = false }) => (
  <div className="ar-field">
    <span className="ar-field-label">{label}</span>
    <span className={`ar-field-value${mono ? " ar-mono" : ""}${!value ? " ar-muted" : ""}`}
          style={{ fontSize: 12.5 }}>
      {value || "—"}
    </span>
  </div>
);

function PaymentAccountCard({ account }) {
  const method  = String(account?.paymentMethod || account?.type || account?.kind || "").trim();
  const masked  = String(account?.maskedCardNumber || account?.cardNumber || account?.maskedPan || "").trim();
  const expiry  = String(account?.expiryDate || account?.cardExpiry || account?.expiry || "").trim();
  const active  = account?.isActive ?? account?.active ?? account?.isDefault;
  const virtual = account?.isVirtual ?? account?.virtual;
  const holder  = String(account?.cardHolder || account?.holderName || account?.payerName || "").trim();
  const id      = String(account?.id || "").trim();

  return (
    <div className="ar-payment-card">
      <div className="ar-payment-card-top">
        <span className="ar-payment-card-type">{method || "Payment Account"}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {virtual !== undefined && (
            <span className={`ar-badge ${virtual ? "gold" : "neutral"}`} style={{ fontSize: 10 }}>
              {virtual ? "Virtual" : "Physical"}
            </span>
          )}
          {active !== undefined && (
            <span className={`ar-badge ${active ? "confirmed" : "neutral"}`} style={{ fontSize: 10 }}>
              {active ? "Active" : "Inactive"}
            </span>
          )}
        </div>
      </div>

      {masked && (
        <div className="ar-payment-card-number">•••• •••• •••• {masked.replace(/\D/g, "").slice(-4) || masked}</div>
      )}

      <div className="ar-payment-card-fields" style={{ marginTop: 8 }}>
        {holder  && <SmallRow label="Card Holder" value={holder} />}
        {expiry  && <SmallRow label="Expiry"      value={expiry} />}
        {id      && <SmallRow label="Account ID"  value={id}    mono />}
      </div>
    </div>
  );
}

function AuthorizationCard({ auth, index }) {
  const authorized = auth?.authorizedAmount || auth?.amount;
  const captured   = auth?.capturedAmount   || auth?.capturedAmount;
  const refunded   = auth?.refundedAmount;
  const status     = String(auth?.status || auth?.state || "").trim();
  const method     = String(auth?.paymentMethod || auth?.type || "").trim();
  const id         = String(auth?.id || "").trim();

  const statusCls = /success|captured|approved|active/i.test(status)
    ? "confirmed"
    : /fail|decline|void|cancel/i.test(status)
    ? "cancelled"
    : /pending|processing/i.test(status)
    ? "pending"
    : "neutral";

  return (
    <div className="ar-auth-card">
      <div className="ar-auth-card-top">
        <span style={{ fontSize: 13, fontWeight: 600, color: "#d6b97e" }}>
          {method || `Authorization #${index + 1}`}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {status && (
            <span className={`ar-badge ${statusCls}`} style={{ fontSize: 10 }}>{status}</span>
          )}
        </div>
      </div>

      {id && (
        <div style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(205,167,108,0.55)", marginBottom: 10 }}>
          {id}
        </div>
      )}

      <div className="ar-auth-amounts">
        <div className="ar-auth-amount-block">
          <span className="ar-auth-amount-label">Authorized</span>
          <span className="ar-auth-amount-value">{fmt(authorized)}</span>
        </div>
        {captured !== undefined && (
          <div className="ar-auth-amount-block">
            <span className="ar-auth-amount-label">Captured</span>
            <span className="ar-auth-amount-value">{fmt(captured)}</span>
          </div>
        )}
        {refunded !== undefined && (
          <div className="ar-auth-amount-block">
            <span className="ar-auth-amount-label">Refunded</span>
            <span className="ar-auth-amount-value">{fmt(refunded)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentPanel({ financials, loading, error }) {
  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="ar-payment-card">
            <div className="ar-skeleton ar-skeleton-line" style={{ width: "50%", height: 14, marginBottom: 8 }} />
            <div className="ar-skeleton ar-skeleton-line" style={{ width: "70%", height: 11 }} />
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

  const accounts       = Array.isArray(financials?.paymentAccounts) ? financials.paymentAccounts : [];
  const authorizations = Array.isArray(financials?.authorizations)  ? financials.authorizations  : [];

  const noData = accounts.length === 0 && authorizations.length === 0;

  if (!financials || noData) {
    return (
      <div className="ar-tab-placeholder">
        <div style={{ fontSize: 32, opacity: 0.4 }}>💳</div>
        <p style={{ margin: 0, fontSize: 13 }}>
          {!financials ? "Select a reservation to view payment data" : "No payment accounts or authorizations on file"}
        </p>
        {financials?.errors?.paymentAccounts && (
          <p style={{ fontSize: 12, color: "#e08080", margin: 0 }}>
            {financials.errors.paymentAccounts}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {accounts.length > 0 && (
        <div className="ar-section">
          <p className="ar-section-title">Payment Accounts ({accounts.length})</p>
          {accounts.map((acc, i) => (
            <PaymentAccountCard key={acc?.id || i} account={acc} />
          ))}
        </div>
      )}

      {authorizations.length > 0 && (
        <div className="ar-section">
          <p className="ar-section-title">Authorizations ({authorizations.length})</p>
          {authorizations.map((auth, i) => (
            <AuthorizationCard key={auth?.id || i} auth={auth} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
