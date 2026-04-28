import { supabaseRestRequest, isSupabaseConfigured } from "./_shared/supabaseClient.js";

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const xmlResponse = (body = "", statusCode = 200) => ({
  statusCode,
  headers: {
    "Content-Type": "text/xml; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body,
});

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const parseFormBody = (event = {}) => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : String(event.body || "");
  return new URLSearchParams(rawBody);
};

// Twilio sends DialCallStatus when <Dial action="..."> fires.
// Normalize to consistent values stored in Supabase.
const normalizeStatus = (value = "") => {
  const s = String(value || "").trim().toLowerCase();
  if (s === "in-progress") return "in-progress";
  if (s === "no-answer") return "no-answer";
  if (s === "completed") return "completed";
  if (s === "busy") return "busy";
  if (s === "failed") return "failed";
  if (s === "canceled" || s === "cancelled") return "canceled";
  if (s === "initiated") return "initiated";
  if (s === "ringing") return "ringing";
  return s || "unknown";
};

export async function handler(event) {
  // Always return empty TwiML — this is the Dial action callback endpoint.
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return xmlResponse(EMPTY_TWIML);
  }

  try {
    const params =
      event.httpMethod === "POST"
        ? parseFormBody(event)
        : new URLSearchParams(event.queryStringParameters || {});

    const callSid = sanitizeString(params.get("CallSid") || "", 120);
    // DialCallStatus = result of the outbound leg spun up by <Dial>
    // DialCallDuration = seconds the outbound leg was connected
    const rawStatus = params.get("DialCallStatus") || params.get("CallStatus") || "";
    const rawDuration = params.get("DialCallDuration") || params.get("CallDuration") || "";

    if (callSid && isSupabaseConfigured()) {
      const table = sanitizeString(getEnv("SUPABASE_CALLS_TABLE") || "calls", 80) || "calls";
      const status = normalizeStatus(rawStatus);
      const duration = rawDuration !== "" ? Number.parseInt(rawDuration, 10) : null;

      await supabaseRestRequest(`${table}?call_sid=eq.${encodeURIComponent(callSid)}`, {
        method: "PATCH",
        body: {
          status,
          ...(Number.isFinite(duration) && duration >= 0 ? { duration } : {}),
          updated_at: new Date().toISOString(),
        },
        prefer: "return=minimal",
        timeout: 8_000,
      });
    }
  } catch (err) {
    console.warn("voice-status: update failed", err?.message || String(err));
  }

  return xmlResponse(EMPTY_TWIML);
}
