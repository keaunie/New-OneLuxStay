const fmt = (amount, currency = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
};

export default function ReservationPricing({ nightly = 0, nights = 0, cleaningFee = 0, currency = "USD" }) {
  if (!nightly || nights <= 0) return null;

  const subtotal = nightly * nights;
  const total = subtotal + (cleaningFee || 0);

  return (
    <div className="grp-pricing">
      <div className="grp-pricing-row">
        <span>{fmt(nightly, currency)} × {nights} night{nights !== 1 ? "s" : ""}</span>
        <span>{fmt(subtotal, currency)}</span>
      </div>
      {cleaningFee > 0 && (
        <div className="grp-pricing-row">
          <span>Cleaning fee</span>
          <span>{fmt(cleaningFee, currency)}</span>
        </div>
      )}
      <div className="grp-pricing-row grp-pricing-total">
        <span>Total estimate</span>
        <span>{fmt(total, currency)}</span>
      </div>
    </div>
  );
}
