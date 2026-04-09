import { getHeaderValue } from "./http.js";
import { supabaseRestRequest } from "./supabaseClient.js";

const DEFAULT_ACTIVITY_TABLE = "admins_ols_activity_log";

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeId = (value = "", maxLength = 120) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, maxLength);

const sanitizeDetailsObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const next = Object.entries(value).reduce((acc, [key, entryValue]) => {
    const safeKey = sanitizeId(key, 80);
    if (!safeKey) return acc;

    if (entryValue == null) return acc;
    if (typeof entryValue === "boolean") {
      acc[safeKey] = entryValue;
      return acc;
    }
    if (typeof entryValue === "number" && Number.isFinite(entryValue)) {
      acc[safeKey] = entryValue;
      return acc;
    }

    const safeValue = sanitizeString(entryValue, 400);
    if (!safeValue) return acc;
    acc[safeKey] = safeValue;
    return acc;
  }, {});

  return Object.keys(next).length ? next : null;
};

const readSourceIp = (event = {}) => {
  const forwardedFor = sanitizeString(getHeaderValue(event, "x-forwarded-for"), 240);
  if (forwardedFor) {
    return sanitizeString(forwardedFor.split(",")[0], 120);
  }

  return sanitizeString(
    getHeaderValue(event, "client-ip") || getHeaderValue(event, "x-nf-client-connection-ip"),
    120,
  );
};

export const getAdminsOlsActivityTable = () =>
  sanitizeId(getEnv("SUPABASE_ADMINS_OLS_ACTIVITY_TABLE") || DEFAULT_ACTIVITY_TABLE, 120) ||
  DEFAULT_ACTIVITY_TABLE;

export const logAdminsOlsActivity = async ({
  event = {},
  actor = {},
  authMode = "",
  eventType = "",
  message = "",
  details = null,
} = {}) => {
  const normalizedEventType = sanitizeId(String(eventType || "").toLowerCase().replace(/\s+/g, "_"), 80);
  if (!normalizedEventType) return;

  const actorName = sanitizeString(actor?.fullName || actor?.name || actor?.email || "Admin", 160);
  const actorEmail = sanitizeString(actor?.email, 160).toLowerCase();

  await supabaseRestRequest(getAdminsOlsActivityTable(), {
    method: "POST",
    body: [
      {
        event_type: normalizedEventType,
        actor_id: sanitizeId(actor?.id, 120) || null,
        actor_email: actorEmail || null,
        actor_name: actorName || null,
        auth_mode: sanitizeString(authMode, 40) || null,
        message: sanitizeString(message, 400) || null,
        details: sanitizeDetailsObject(details),
        source_ip: readSourceIp(event) || null,
        user_agent: sanitizeString(getHeaderValue(event, "user-agent"), 320) || null,
        created_at: new Date().toISOString(),
      },
    ],
    prefer: "return=minimal",
    timeout: 12_000,
  });
};

export const sanitizeAdminsOlsActivityRow = (row = {}) => ({
  id: sanitizeId(row?.id, 120),
  eventType: sanitizeId(row?.event_type, 80),
  actorId: sanitizeId(row?.actor_id, 120),
  actorEmail: sanitizeString(row?.actor_email, 160),
  actorName: sanitizeString(row?.actor_name, 160),
  authMode: sanitizeString(row?.auth_mode, 40),
  message: sanitizeString(row?.message, 400),
  details: sanitizeDetailsObject(row?.details),
  createdAt: sanitizeString(row?.created_at, 80),
});
