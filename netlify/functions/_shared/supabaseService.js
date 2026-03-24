import { supabaseRestRequest } from "./supabaseClient.js";

const BOOKINGS_TABLE = process.env.SUPABASE_BOOKINGS_TABLE || "bookings";
const SITE_CONTENT_TABLE = process.env.SUPABASE_SITE_CONTENT_TABLE || "site_content";

export const getBookingByCheckoutSessionId = async (sessionId) => {
  if (!sessionId) return null;

  const rows = await supabaseRestRequest(BOOKINGS_TABLE, {
    query: {
      select: "*",
      stripe_checkout_session_id: `eq.${sessionId}`,
      limit: 1,
    },
  });

  return Array.isArray(rows) ? rows[0] || null : null;
};

export const upsertBooking = async (record = {}) => {
  const rows = await supabaseRestRequest(`${BOOKINGS_TABLE}?on_conflict=stripe_checkout_session_id`, {
    method: "POST",
    body: [record],
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return Array.isArray(rows) ? rows[0] || null : null;
};

export const getSiteContentByKey = async (key) => {
  const contentKey = String(key || "").trim();
  if (!contentKey) return null;

  const rows = await supabaseRestRequest(SITE_CONTENT_TABLE, {
    query: {
      select: "key,value,updated_at",
      key: `eq.${contentKey}`,
      limit: 1,
    },
  });

  const row = Array.isArray(rows) ? rows[0] || null : null;
  return row || null;
};

export const upsertSiteContent = async ({ key, value, metadata = null } = {}) => {
  const contentKey = String(key || "").trim();
  if (!contentKey) {
    throw new Error("Site content key is required");
  }

  const payload = {
    key: contentKey,
    value: value ?? null,
    metadata: metadata ?? null,
    updated_at: new Date().toISOString(),
  };

  const rows = await supabaseRestRequest(`${SITE_CONTENT_TABLE}?on_conflict=key`, {
    method: "POST",
    body: [payload],
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return Array.isArray(rows) ? rows[0] || null : null;
};
