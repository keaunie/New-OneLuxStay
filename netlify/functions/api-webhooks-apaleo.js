import crypto from "node:crypto";
import { jsonResponse } from "./_shared/http.js";
import { getAllowedPropertyIds } from "./_shared/apaleoBookingService.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
};

export async function handler(event) {
  if (event.httpMethod !== "POST") return jsonResponse(405, { message: "Method Not Allowed" });
  const expected = String(process.env.APALEO_WEBHOOK_SECRET || "").trim();
  const supplied = String(event.queryStringParameters?.token || "").trim();
  if (!expected || !safeEqual(expected, supplied)) return jsonResponse(401, { message: "Unauthorized" });
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return jsonResponse(400, { message: "Invalid JSON" }); }
  if (String(payload.type || "").toLowerCase() === "healthcheck") return jsonResponse(200, { received: true });
  const propertyId = String(payload.propertyId || "").trim();
  const allowedPropertyIds = await getAllowedPropertyIds().catch(() => []);
  if (propertyId && !allowedPropertyIds.includes(propertyId)) return jsonResponse(200, { received: true, ignored: true });
  const eventId = String(payload.id || "").trim();
  if (!eventId) return jsonResponse(400, { message: "Missing event id" });
  try {
    await supabaseRestRequest("apaleo_webhook_events?on_conflict=event_id", { method: "POST", body: [{
      event_id: eventId, topic: String(payload.topic || "").slice(0, 80), event_type: String(payload.type || "").slice(0, 80),
      property_id: propertyId || null, subject_id: String(payload.subjectId || payload?.data?.entityId || "").slice(0, 180) || null,
      occurred_at: Number.isFinite(Number(payload.timestamp)) ? new Date(Number(payload.timestamp)).toISOString() : null,
      payload: { id: eventId, topic: payload.topic, type: payload.type, propertyId: propertyId || null, subjectId: payload.subjectId || null, data: payload.data || null },
    }], prefer: "resolution=ignore-duplicates,return=minimal" });
    return jsonResponse(202, { received: true });
  } catch (error) {
    console.error("[apaleo-webhook] persistence failed", { eventId, propertyId, code: error?.statusCode || null });
    return jsonResponse(503, { message: "Webhook persistence failed" });
  }
}
