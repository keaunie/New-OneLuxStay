import { getStore } from "@netlify/blobs";
import { verifyAdminsOlsAccess } from "./_shared/adminsOlsAuth.js";
import { userHasSuperAdminRole } from "../../shared/adminRoles.js";

const DEFAULT_TIERS = { weekly: 10, biWeekly: 20, monthly: 30 };
const DEFAULTS = { usa: DEFAULT_TIERS, antwerp: DEFAULT_TIERS, dubai: DEFAULT_TIERS };
const STORE_NAME = "oneluxstay-site-config";
const STORE_KEY = "booking-promos";

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key, X-Config-Password",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  },
  body: JSON.stringify(body),
});

const normalizeTiers = (value = {}, fallback = DEFAULT_TIERS) => {
  const percent = (input, fallback) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? Math.min(90, Math.max(0, Math.round(parsed))) : fallback;
  };
  return {
    weekly: percent(value.weekly, fallback.weekly),
    biWeekly: percent(value.biWeekly, fallback.biWeekly),
    monthly: percent(value.monthly, fallback.monthly),
  };
};

const normalize = (value = {}) => {
  const legacy = value?.weekly !== undefined ? normalizeTiers(value) : null;
  return {
    usa: normalizeTiers(value.usa || legacy || DEFAULT_TIERS),
    antwerp: normalizeTiers(value.antwerp || legacy || DEFAULT_TIERS),
    dubai: normalizeTiers(value.dubai || legacy || DEFAULT_TIERS),
  };
};

const getConfigStore = () => {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
  return siteID && token ? getStore(STORE_NAME, { siteID, token }) : getStore(STORE_NAME);
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(200, { ok: true });
  const store = getConfigStore();

  if (event.httpMethod === "GET") {
    const stored = await store.get(STORE_KEY, { type: "json" }).catch(() => null);
    return response(200, { promos: normalize(stored || DEFAULTS) });
  }

  if (event.httpMethod !== "PUT") return response(405, { error: "Method not allowed" });
  const expectedPassword = String(process.env.CONFIG_ADMIN_PASSWORD || "devsols123");
  const hasConfigPassword = String(event.headers?.["x-config-password"] || "") === expectedPassword;
  if (!hasConfigPassword) {
    try {
      const access = await verifyAdminsOlsAccess(event);
      if (!userHasSuperAdminRole(access?.user || {})) {
        return response(403, { error: "Superadmin access required" });
      }
    } catch (error) {
      return response(error?.statusCode || 401, { error: error?.message || "Unauthorized" });
    }
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }
  const promos = normalize(body.promos || body);
  await store.setJSON(STORE_KEY, promos);
  return response(200, { ok: true, promos });
};
