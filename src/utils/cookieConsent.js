// Single source of truth for the cookie/analytics consent choice. Only
// "necessary" storage (this decision itself) is written before the guest
// chooses — everything analytics-related reads hasAnalyticsConsent() first.
const CONSENT_KEY = "ols-cookie-consent-v1";
export const CONSENT_EVENT = "ols:cookie-consent-changed";

const canUseStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

export const getConsent = () => {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const hasDecided = () => getConsent() !== null;

export const hasAnalyticsConsent = () => getConsent()?.analytics === true;

export const setConsent = (analyticsAllowed) => {
  if (!canUseStorage()) return;
  const record = { analytics: Boolean(analyticsAllowed), decidedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // ignore storage failures — banner will just reappear next visit
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: record }));
  }
};
