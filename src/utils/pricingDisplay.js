const toPricingNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const firstPricingNumber = (...values) => {
  for (const value of values) {
    const number = toPricingNumber(value);
    if (number !== null) return number;
  }
  return null;
};

export const getPayableTotalFromBreakdown = (breakdown, fallbackTotal = null) => {
  const total = firstPricingNumber(breakdown?.total, breakdown?.subtotal, fallbackTotal);
  if (total === null) return null;
  const securityDeposit = firstPricingNumber(breakdown?.securityDeposit, 0) || 0;
  return Math.max(total - securityDeposit, 0);
};

export const getAverageNightlyFromTotal = (total, nights) => {
  const amount = toPricingNumber(total);
  const nightCount = toPricingNumber(nights);
  if (amount === null || nightCount === null || nightCount <= 0) return null;
  return Math.floor((amount / nightCount) * 100) / 100;
};
