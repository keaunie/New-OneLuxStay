const SECURITY_DEPOSIT_BY_CURRENCY = {
  USD: 250,
  PHP: 250,
};

export const roundMoney = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
};

export const normalizeCurrency = (value) => String(value || "USD").trim().toUpperCase() || "USD";

export const calculateNights = (checkIn, checkOut) => {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  return diffMs > 0 ? Math.round(diffMs / 86_400_000) : 0;
};

export const getSecurityDepositAmount = (currency) =>
  roundMoney(SECURITY_DEPOSIT_BY_CURRENCY[normalizeCurrency(currency)] || 0);

export const calculatePrice = ({
  nightlyRate,
  numberOfNights,
  cleaningFee = 0,
  taxes = 0,
  currency = "USD",
} = {}) => {
  const normalizedCurrency = normalizeCurrency(currency);
  const nights = Math.max(0, Math.round(Number(numberOfNights) || 0));
  const nightly = roundMoney(nightlyRate);
  const cleaning = roundMoney(cleaningFee);
  const taxTotal = roundMoney(taxes);
  const roomTotal = roundMoney(nightly * nights);
  const fees = roundMoney(cleaning + taxTotal);
  const deposit = getSecurityDepositAmount(normalizedCurrency);
  const grandTotal = roundMoney(roomTotal + fees + deposit);

  return {
    currency: normalizedCurrency,
    nights,
    nightly_rate: nightly,
    cleaning_fee: cleaning,
    taxes: taxTotal,
    room_total: roomTotal,
    fees,
    deposit,
    grand_total: grandTotal,
  };
};

