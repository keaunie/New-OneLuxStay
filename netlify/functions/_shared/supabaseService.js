import { fetchWithTimeout } from "./http.js";

const BOOKINGS_TABLE = process.env.SUPABASE_BOOKINGS_TABLE || "bookings";

const getSupabaseConfig = () => {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "",
  ).trim();

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration");
  }

  return { url, serviceRoleKey };
};

const buildRestUrl = (path, query = {}) => {
  const { url } = getSupabaseConfig();
  const target = new URL(`${url}/rest/v1/${path.replace(/^\/+/, "")}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === "") return;
    target.searchParams.set(key, String(value));
  });
  return target.toString();
};

const supabaseRequest = async (path, { method = "GET", query, body, prefer } = {}) => {
  const { serviceRoleKey } = getSupabaseConfig();
  const response = await fetchWithTimeout(
    buildRestUrl(path, query),
    {
      method,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    20_000,
  );

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!response.ok) {
    throw new Error(
      typeof payload === "string" ? payload : payload?.message || `Supabase request failed (${response.status})`,
    );
  }

  return payload;
};

export const getBookingByCheckoutSessionId = async (sessionId) => {
  if (!sessionId) return null;
  const rows = await supabaseRequest(BOOKINGS_TABLE, {
    query: {
      select: "*",
      stripe_checkout_session_id: `eq.${sessionId}`,
      limit: 1,
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
};

export const upsertBooking = async (record = {}) => {
  const rows = await supabaseRequest(`${BOOKINGS_TABLE}?on_conflict=stripe_checkout_session_id`, {
    method: "POST",
    body: [record],
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return Array.isArray(rows) ? rows[0] || null : null;
};

