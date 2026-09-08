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

// The Adyen API key is account-wide, but each property settles under one of two distinct
// merchant accounts tied to a different legal entity/bank account (OneLuxStayUSCOM for the
// US properties, OneLuxStayAntwerpenCOM for the Antwerp ones — confirmed against Apaleo's own
// per-property Payment settings). Sending the wrong merchantAccount would authorize the payment
// but settle it to the wrong entity's bank account, so this is resolved per property rather than
// defaulting to one shared value.
//
// This allow-list is an explicit opt-in so a region-limited rollout (e.g. EU-only) doesn't
// silently go live everywhere else the moment credentials are added. Empty/unset fails closed.
const adyenEnabledPropertyIds = () => new Set(
  String(process.env.ADYEN_ENABLED_PROPERTY_IDS || "")
    .split(",").map((value) => clean(value, 120)).filter(Boolean),
);

export const assertAdyenEnabledForProperty = (propertyId) => {
  const allowed = adyenEnabledPropertyIds();
  const safePropertyId = clean(propertyId, 120);
  if (!allowed.size || !safePropertyId || !allowed.has(safePropertyId)) {
    throw Object.assign(new Error("Card payments are not yet available for this property"), {
      statusCode: 403, code: "ADYEN_PROPERTY_NOT_ENABLED",
    });
  }
};

export const resolveAdyenMerchantAccount = (propertyId) => {
  const safePropertyId = clean(propertyId, 120);
  let perPropertyMap = {};
  try {
    perPropertyMap = JSON.parse(process.env.ADYEN_MERCHANT_ACCOUNT_IDS_JSON || "{}");
  } catch {
    throw Object.assign(new Error("ADYEN_MERCHANT_ACCOUNT_IDS_JSON must be valid JSON"), {
      statusCode: 503, code: "ADYEN_MERCHANT_ACCOUNT_CONFIG_INVALID",
    });
  }
  const merchantAccount = clean(
    perPropertyMap[safePropertyId] || process.env.ADYEN_MERCHANT_ACCOUNT,
    180,
  );
  if (!merchantAccount) {
    throw Object.assign(new Error(`No Adyen merchant account configured for property ${safePropertyId}`), {
      statusCode: 503, code: "ADYEN_MERCHANT_ACCOUNT_MISSING",
    });
  }
  return merchantAccount;
};

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
    const subMerchantId = clean(propertySubMerchants[safePropertyId] || process.env.APALEO_SUB_MERCHANT_ID || process.env.APALEO_SUBMERCHANT_ID, 180);
    if (!subMerchantId) {
      throw Object.assign(new Error(`Missing Apaleo Pay sub-merchant ID for property ${safePropertyId}`), { statusCode: 503, code: "APALEO_SUB_MERCHANT_MISSING" });
    }
    additionalData["metadata.flowType"] = "CaptureOnly";
    additionalData.subMerchantID = subMerchantId;
  }
  return additionalData;
};

export const adyenRequest = async (path, body, { idempotencyKey, merchantAccount: merchantAccountOverride } = {}) => {
  const apiKey = clean(process.env.ADYEN_API_KEY, 500);
  const merchantAccount = clean(merchantAccountOverride, 180) || clean(process.env.ADYEN_MERCHANT_ACCOUNT, 180);
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
