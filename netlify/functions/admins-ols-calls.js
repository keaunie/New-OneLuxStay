import { verifyAdminsOlsAccess } from "./_shared/adminsOlsAuth.js";
import { supabaseRestRequest, isSupabaseConfigured } from "./_shared/supabaseClient.js";

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeId = (value = "", maxLength = 80) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, "")
    .slice(0, maxLength);

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  },
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "GET") return jsonResponse(405, { error: "Method not allowed" });

  try {
    await verifyAdminsOlsAccess(event);

    if (!isSupabaseConfigured()) {
      return jsonResponse(200, { calls: [], limit: 50, offset: 0 });
    }

    const q = event.queryStringParameters || {};
    const limit = Math.min(Math.max(Number.parseInt(sanitizeString(q.limit || "50", 10), 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(sanitizeString(q.offset || "0", 10), 10) || 0, 0);
    const country = sanitizeId(q.country || "", 10);
    const status = sanitizeId(q.status || "", 40);

    const table = sanitizeString(getEnv("SUPABASE_CALLS_TABLE") || "calls", 80) || "calls";

    const filters = ["order=created_at.desc", `limit=${limit}`, `offset=${offset}`];
    if (country) filters.push(`country=eq.${encodeURIComponent(country)}`);
    if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);

    const rows = await supabaseRestRequest(`${table}?${filters.join("&")}`, {
      method: "GET",
      timeout: 15_000,
    });

    return jsonResponse(200, {
      calls: Array.isArray(rows) ? rows : [],
      limit,
      offset,
    });
  } catch (error) {
    return jsonResponse(Number(error?.statusCode) || 500, {
      error: sanitizeString(error?.message || "Unable to fetch call logs.", 500),
    });
  }
}
