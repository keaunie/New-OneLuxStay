import { fetchWithTimeout } from "./http.js";

const clean = (value = "", max = 240) => String(value ?? "").trim().slice(0, max);
const environment = () => clean(process.env.ADYEN_ENVIRONMENT || "test", 20).toLowerCase();

const baseUrl = () => {
  if (environment() !== "live") return "https://checkout-test.adyen.com/v70";
  const prefix = clean(process.env.ADYEN_LIVE_URL_PREFIX, 100);
  if (!prefix) throw new Error("Missing ADYEN_LIVE_URL_PREFIX for live payments");
  return `https://${prefix}-checkout-live.adyenpayments.com/checkout/v70`;
};

export const getAdyenPublicConfig = () => ({
  environment: environment(),
  clientKey: clean(process.env.ADYEN_CLIENT_KEY, 300),
});

export const getApaleoPayAdditionalData = ({ propertyId, guaranteeType } = {}) => {
  const accountId = clean(process.env.APALEO_ACCOUNT_ID, 180);
  const safePropertyId = clean(propertyId, 120);
  if (!accountId || !safePropertyId) {
    throw Object.assign(new Error("Apaleo Pay account and property metadata are not configured"), { statusCode: 503, code: "APALEO_PAY_METADATA_MISSING" });
  }
  let propertySubMerchants = {};
  try {
    propertySubMerchants = JSON.parse(process.env.APALEO_SUB_MERCHANT_IDS_JSON || "{}");
  } catch {
    throw Object.assign(new Error("APALEO_SUB_MERCHANT_IDS_JSON must be valid JSON"), { statusCode: 503, code: "APALEO_PAY_METADATA_INVALID" });
  }
  const additionalData = {
    "metadata.accountId": accountId,
    "metadata.propertyId": safePropertyId,
  };
  if (guaranteeType === "Prepayment") {
    const subMerchantId = clean(propertySubMerchants[safePropertyId] || process.env.APALEO_SUB_MERCHANT_ID, 180);
    if (!subMerchantId) {
      throw Object.assign(new Error(`Missing Apaleo Pay sub-merchant ID for property ${safePropertyId}`), { statusCode: 503, code: "APALEO_SUB_MERCHANT_MISSING" });
    }
    additionalData["metadata.flowType"] = "CaptureOnly";
    additionalData.subMerchantID = subMerchantId;
  }
  return additionalData;
};

export const adyenRequest = async (path, body, { idempotencyKey } = {}) => {
  const apiKey = clean(process.env.ADYEN_API_KEY, 500);
  const merchantAccount = clean(process.env.ADYEN_MERCHANT_ACCOUNT, 180);
  if (!apiKey || !merchantAccount) throw Object.assign(new Error("Adyen is not configured"), { statusCode: 503 });
  const response = await fetchWithTimeout(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json", "x-api-key": apiKey,
      ...(idempotencyKey ? { "Idempotency-Key": clean(idempotencyKey, 64) } : {}),
    },
    body: JSON.stringify({ merchantAccount, ...body }),
  }, 30_000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(clean(payload?.message || payload?.errorType || `Adyen request failed (${response.status})`, 500));
    error.statusCode = response.status;
    error.code = clean(payload?.errorCode || "ADYEN_REQUEST_FAILED", 80);
    throw error;
  }
  return payload;
};
