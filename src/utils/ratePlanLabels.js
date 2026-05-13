export const SIGNATURE_STAYS_RATE_LABEL = "Signature Stays Rate";

export const formatRatePlanName = (value, fallback = SIGNATURE_STAYS_RATE_LABEL) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return fallback;

  // Preserve provider payloads while normalizing legacy UI-facing labels.
  if (/^standard\s*rate(\s*plan)?$/i.test(normalized)) {
    return SIGNATURE_STAYS_RATE_LABEL;
  }
  return normalized;
};
