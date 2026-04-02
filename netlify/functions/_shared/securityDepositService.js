import { getSupabaseConfig, isSupabaseConfigured, supabaseRestRequest } from "./supabaseClient.js";

const SUPABASE_SECURITY_DEPOSITS_TABLE = process.env.SUPABASE_SECURITY_DEPOSITS_TABLE || "security_deposits";
const SUPABASE_PROPERTIES_TABLE = process.env.SUPABASE_PROPERTIES_TABLE || "properties";
const SECURITY_DEPOSIT_CACHE_TTL_MS = Math.max(
  10_000,
  Number(process.env.SECURITY_DEPOSIT_CACHE_TTL_MS || 300_000) || 300_000,
);

const FALLBACK_CURRENCY_BY_COUNTRY = {
  US: "USD",
  USA: "USD",
  EU: "EUR",
  UAE: "AED",
};

const CURRENCY_ALIASES = {
  DOLLAR: "USD",
  DOLLARS: "USD",
  USDOLLAR: "USD",
  EURO: "EUR",
  EUROS: "EUR",
  AED: "AED",
  DIRHAM: "AED",
  DIRHAMS: "AED",
  USD: "USD",
  EUR: "EUR",
};

const COUNTRY_ALIASES = {
  US: "US",
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  "U.S.": "US",
  "U.S.A.": "US",
  AMERICA: "US",
  EU: "EU",
  EUROPE: "EU",
  "EUROPEAN UNION": "EU",
  UAE: "UAE",
  "UNITED ARAB EMIRATES": "UAE",
};

const roundMoney = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
};

const normalizeString = (value) => String(value || "").trim();

const normalizeCurrency = (value) => {
  const raw = normalizeString(value).toUpperCase().replace(/[^A-Z]/g, "");
  if (!raw) return null;
  return CURRENCY_ALIASES[raw] || (raw.length === 3 ? raw : null);
};

const normalizeCountry = (value) => {
  const raw = normalizeString(value).toUpperCase().replace(/\s+/g, " ");
  if (!raw) return null;
  return COUNTRY_ALIASES[raw] || raw;
};

const toBedroomCount = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);
  return null;
};

const parseBedroomsFromText = (text) => {
  const input = normalizeString(text).toUpperCase();
  if (!input) return null;
  const bedroomMatch = input.match(/\b(\d+)\s*(?:BED(?:ROOM)?S?|BR)\b/i);
  if (bedroomMatch) {
    const parsed = Number(bedroomMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return null;
};

const parseRequired = (value) => {
  if (typeof value === "boolean") return value;
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return true;
  if (["1", "true", "yes", "on", "required"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "optional"].includes(normalized)) return false;
  return true;
};

const parseRule = (row = {}) => {
  const amount = roundMoney(row?.price ?? row?.amount ?? row?.deposit ?? row?.security_deposit);
  if (amount == null || amount < 0) return null;

  const country = normalizeCountry(row?.country || row?.region || row?.market);
  if (!country) return null;

  const bedrooms =
    toBedroomCount(row?.bedrooms) ??
    toBedroomCount(row?.bedroom_count) ??
    parseBedroomsFromText(row?.notes) ??
    parseBedroomsFromText(row?.name) ??
    null;

  const currency =
    normalizeCurrency(row?.currency) ||
    FALLBACK_CURRENCY_BY_COUNTRY[country] ||
    null;

  return {
    id: normalizeString(row?.id) || null,
    country,
    bedrooms,
    currency,
    amount,
    required: parseRequired(row?.required),
  };
};

const getSecurityDepositRules = async () => {
  const now = Date.now();
  const cache = globalThis.__olsSecurityDepositRulesCache;
  if (
    cache &&
    Array.isArray(cache.rules) &&
    Number.isFinite(cache.expiresAt) &&
    cache.expiresAt > now
  ) {
    return cache.rules;
  }

  if (!isSupabaseConfigured({ requireServiceRole: false })) {
    return [];
  }

  let useAnonKey = false;
  try {
    const config = getSupabaseConfig({ requireServiceRole: false });
    useAnonKey = !config?.serviceRoleKey && Boolean(config?.anonKey);
  } catch {
    useAnonKey = false;
  }

  const rows = await supabaseRestRequest(SUPABASE_SECURITY_DEPOSITS_TABLE, {
    query: {
      select: "*",
      limit: 1000,
      order: "created_at.desc",
    },
    useAnonKey,
  });

  const rules = (Array.isArray(rows) ? rows : [])
    .map((row) => parseRule(row))
    .filter((rule) => Boolean(rule) && rule.required !== false);

  globalThis.__olsSecurityDepositRulesCache = {
    rules,
    expiresAt: now + SECURITY_DEPOSIT_CACHE_TTL_MS,
  };

  return rules;
};

const pickBestRule = ({ rules = [], country, bedrooms }) => {
  const normalizedCountry = normalizeCountry(country);
  if (!normalizedCountry) return null;

  const byCountry = rules.filter((rule) => rule.country === normalizedCountry);
  if (!byCountry.length) return null;

  const normalizedBedrooms = toBedroomCount(bedrooms);
  if (normalizedBedrooms == null) {
    return byCountry.find((rule) => rule.bedrooms == null) || byCountry[0];
  }

  const exact = byCountry.find((rule) => rule.bedrooms === normalizedBedrooms);
  if (exact) return exact;

  const withBedrooms = byCountry
    .filter((rule) => Number.isFinite(rule.bedrooms))
    .sort((a, b) => Number(b.bedrooms || 0) - Number(a.bedrooms || 0));

  const lowerOrEqual = withBedrooms.find((rule) => Number(rule.bedrooms) <= normalizedBedrooms);
  if (lowerOrEqual) return lowerOrEqual;

  return byCountry.find((rule) => rule.bedrooms == null) || withBedrooms[0] || byCountry[0];
};

const fetchPropertyProfileByListingId = async (listingId) => {
  const normalizedId = normalizeString(listingId);
  if (!normalizedId) return null;
  if (!isSupabaseConfigured({ requireServiceRole: false })) return null;

  let useAnonKey = false;
  try {
    const config = getSupabaseConfig({ requireServiceRole: false });
    useAnonKey = !config?.serviceRoleKey && Boolean(config?.anonKey);
  } catch {
    useAnonKey = false;
  }

  const rows = await supabaseRestRequest(SUPABASE_PROPERTIES_TABLE, {
    query: {
      select: "id,guesty_id,country,bedrooms",
      or: `(id.eq.${normalizedId},guesty_id.eq.${normalizedId})`,
      limit: 1,
    },
    useAnonKey,
  });

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || typeof row !== "object") return null;

  return {
    country: normalizeCountry(row?.country),
    bedrooms: toBedroomCount(row?.bedrooms),
  };
};

export const resolveSecurityDeposit = async ({
  listingId,
  country,
  bedrooms,
  currency,
  allowListingLookup = true,
} = {}) => {
  try {
    let effectiveCountry = normalizeCountry(country);
    let effectiveBedrooms = toBedroomCount(bedrooms);

    if ((effectiveCountry == null || effectiveBedrooms == null) && allowListingLookup && listingId) {
      const profile = await fetchPropertyProfileByListingId(listingId);
      if (profile) {
        if (effectiveCountry == null) effectiveCountry = profile.country;
        if (effectiveBedrooms == null) effectiveBedrooms = profile.bedrooms;
      }
    }

    if (!effectiveCountry) return null;

    const rules = await getSecurityDepositRules();
    if (!rules.length) return null;

    const rule = pickBestRule({
      rules,
      country: effectiveCountry,
      bedrooms: effectiveBedrooms,
    });
    if (!rule) return null;

    return {
      amount: roundMoney(rule.amount) || 0,
      currency:
        normalizeCurrency(rule.currency) ||
        normalizeCurrency(currency) ||
        FALLBACK_CURRENCY_BY_COUNTRY[rule.country] ||
        "USD",
      country: rule.country,
      bedrooms: effectiveBedrooms,
      ruleId: rule.id || null,
      required: true,
      source: "supabase_security_deposits",
    };
  } catch (error) {
    console.warn("Security deposit lookup failed", {
      listingId: normalizeString(listingId) || null,
      message: error?.message || String(error),
    });
    return null;
  }
};
