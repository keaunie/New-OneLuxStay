// Static property -> payment-account-ID mappings. These are not secrets (the
// actual credentials stay in ADYEN_API_KEY / ADYEN_CLIENT_KEY /
// APALEO_CLIENT_SECRET etc.), just routing IDs — committing them here instead
// of carrying them as JSON-blob env vars keeps the site under Netlify's
// Lambda-compatibility-mode 4KB environment variable ceiling.
// An env var of the same name still overrides this file's mapping if set,
// so this stays adjustable without a redeploy.

export const DEFAULT_ADYEN_MERCHANT_ACCOUNT_IDS = {
  LLEW: "OneLuxStayUSCOM",
  HWH: "OneLuxStayUSCOM",
  ARDENCE: "OneLuxStayUSCOM",
  REDONDO1: "OneLuxStayUSCOM",
  REDONDO3: "OneLuxStayUSCOM",
  TORRANCE: "OneLuxStayUSCOM",
  KRIBB: "OneLuxStayAntwerpenCOM",
  LANGEKIEV: "OneLuxStayAntwerpenCOM",
  LANGE5: "OneLuxStayAntwerpenCOM",
  JACOB: "OneLuxStayAntwerpenCOM",
  LANGE103: "OneLuxStayAntwerpenCOM",
};

export const DEFAULT_APALEO_SUB_MERCHANT_IDS = {
  LLEW: "2EFNCQ890WFED9O",
  HWH: "2EFNCQ890WFED9O",
  ARDENCE: "2EFNCQ890WFED9O",
  REDONDO1: "2EFNCQ890WFED9O",
  REDONDO3: "2EFNCQ890WFED9O",
  TORRANCE: "2EFNCQ890WFED9O",
  KRIBB: "UTXLME8KO21CA87",
  LANGEKIEV: "UTXLME8KO21CA87",
  LANGE5: "UTXLME8KO21CA87",
  JACOB: "UTXLME8KO21CA87",
  LANGE103: "UTXLME8KO21CA87",
};

export const getAdyenMerchantAccountIds = () => {
  if (!process.env.ADYEN_MERCHANT_ACCOUNT_IDS_JSON) return DEFAULT_ADYEN_MERCHANT_ACCOUNT_IDS;
  try {
    return JSON.parse(process.env.ADYEN_MERCHANT_ACCOUNT_IDS_JSON);
  } catch {
    throw Object.assign(new Error("ADYEN_MERCHANT_ACCOUNT_IDS_JSON must be valid JSON"), {
      statusCode: 503,
      code: "ADYEN_MERCHANT_ACCOUNT_CONFIG_INVALID",
    });
  }
};

export const getApaleoSubMerchantIds = () => {
  if (!process.env.APALEO_SUB_MERCHANT_IDS_JSON) return DEFAULT_APALEO_SUB_MERCHANT_IDS;
  try {
    return JSON.parse(process.env.APALEO_SUB_MERCHANT_IDS_JSON);
  } catch {
    throw Object.assign(new Error("APALEO_SUB_MERCHANT_IDS_JSON must be valid JSON"), {
      statusCode: 503,
      code: "APALEO_PAY_METADATA_INVALID",
    });
  }
};
