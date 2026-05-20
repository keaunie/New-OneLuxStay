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

const fmtDate = (value = "") => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const sanitize = (v, max = 80) => String(v || "").trim().slice(0, max);

export function ChargesTable({ charges = [] }) {
  if (!charges.length) {
    return (
      <p style={{ color: "rgba(244,237,227,0.35)", fontSize: 13, margin: "8px 0" }}>
        No charges recorded.
      </p>
    );
  }

  return (
    <div className="ar-table-shell">
      <table className="ar-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Service</th>
            <th style={{ textAlign: "right" }}>Amount</th>
            <th style={{ textAlign: "right" }}>Tax</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((charge, i) => {
            const date    = fmtDate(charge?.date || charge?.serviceDate || charge?.created);
            const service = sanitize(
              charge?.serviceName || charge?.name || charge?.description || charge?.serviceType || "Service",
              60,
            );
            const amount  = fmtAmount(charge?.amount || charge?.grossAmount);
            const tax     = charge?.taxAmount != null ? fmtAmount(charge.taxAmount) : null;
            const isNeg   = Number(charge?.amount?.amount ?? charge?.amount ?? 0) < 0;

            return (
              <tr key={charge?.id || i}>
                <td className="ar-mono" style={{ whiteSpace: "nowrap", fontSize: 11.5 }}>{date}</td>
                <td>{service}</td>
                <td className={`ar-amount${isNeg ? " ar-amount-negative" : ""}`}>{amount}</td>
                <td className="ar-amount" style={{ color: "rgba(244,237,227,0.5)" }}>{tax ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentsTable({ payments = [] }) {
  if (!payments.length) {
    return (
      <p style={{ color: "rgba(244,237,227,0.35)", fontSize: 13, margin: "8px 0" }}>
        No payments recorded.
      </p>
    );
  }

  return (
    <div className="ar-table-shell">
      <table className="ar-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th style={{ textAlign: "right" }}>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment, i) => {
            const date   = fmtDate(payment?.date || payment?.created || payment?.createdAt);
            const type   = sanitize(
              payment?.paymentMethod || payment?.type || payment?.method || payment?.description || "Payment",
              50,
            );
            const amount = fmtAmount(payment?.amount || payment?.grossAmount);
            const status = sanitize(payment?.status || payment?.state || "", 30);
            const isNeg  = Number(payment?.amount?.amount ?? payment?.amount ?? 0) < 0;

            const statusCls = /success|captured|approved|paid|settled/i.test(status)
              ? "confirmed"
              : /fail|decline|void|cancel|refund/i.test(status)
              ? "cancelled"
              : /pending|processing/i.test(status)
              ? "pending"
              : "neutral";

            return (
              <tr key={payment?.id || i}>
                <td className="ar-mono" style={{ whiteSpace: "nowrap", fontSize: 11.5 }}>{date}</td>
                <td>{type}</td>
                <td className={`ar-amount${isNeg ? " ar-amount-negative" : ""}`}>{amount}</td>
                <td>
                  {status
                    ? <span className={`ar-badge ${statusCls}`} style={{ fontSize: 10 }}>{status}</span>
                    : <span style={{ color: "rgba(244,237,227,0.3)" }}>—</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
