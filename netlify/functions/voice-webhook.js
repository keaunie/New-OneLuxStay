import { supabaseRestRequest, isSupabaseConfigured } from "./_shared/supabaseClient.js";
import { inferRegionFromNumber, normalizePhoneNumber as normalizeSenderPhoneNumber } from "./_shared/twilioSenderResolver.js";

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizePhoneNumber = (value = "") => {
  return normalizeSenderPhoneNumber(value);
};

const xmlEscape = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const xmlResponse = (body = "", statusCode = 200) => ({
  statusCode,
  headers: {
    "Content-Type": "text/xml; charset=utf-8",
    "Cache-Control": "no-store",
  },
  body,
});

const parseFormBody = (event = {}) => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : String(event.body || "");
  return new URLSearchParams(rawBody);
};

const getHeaderValue = (event = {}, name = "") => {
  const target = String(name || "").toLowerCase();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (String(key).toLowerCase() === target) return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }
  return "";
};

const getRequestBaseUrl = (event = {}) => {
  const proto = sanitizeString(getHeaderValue(event, "x-forwarded-proto") || "https", 12);
  const host = sanitizeString(getHeaderValue(event, "x-forwarded-host") || getHeaderValue(event, "host"), 240);
  if (proto && host) return `${proto}://${host}`.replace(/\/+$/, "");
  return sanitizeString(
    getEnv("PUBLIC_SITE_URL") || getEnv("URL") || getEnv("DEPLOY_PRIME_URL") || "",
    240,
  ).replace(/\/+$/, "");
};

const detectCountry = (toNumber = "") => {
  return inferRegionFromNumber(toNumber) || "us";
};

const normalizeDialTargetE164 = (value = "") => {
  const normalized = normalizePhoneNumber(sanitizeString(value, 80));
  if (!normalized) return "";
  if (normalized.startsWith("+")) return normalized;

  const digits = normalized.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
};

const getVoipMsDid = () => {
  const configuredRaw =
    sanitizeString(getEnv("TWILIO_VOICE_VOIPMS_DID") || "", 80) ||
    sanitizeString(getEnv("TWILIO_VOICE_FORWARD_TO") || "", 80) ||
    sanitizeString(getEnv("OLS_CALL_FORWARD_TO") || "", 80);
  const configured = normalizeDialTargetE164(configuredRaw);
  if (configured) return configured;
  // Default VoIP.ms DID used for routing to ARCHIE_S ring group.
  return normalizeDialTargetE164("14243543447");
};

const logCall = async ({ callSid, from, to, country }) => {
  try {
    if (!isSupabaseConfigured()) return;
    const table = sanitizeString(getEnv("SUPABASE_CALLS_TABLE") || "calls", 80) || "calls";
    const now = new Date().toISOString();
    await supabaseRestRequest(table, {
      method: "POST",
      body: [
        {
          call_sid: sanitizeString(callSid, 120),
          from_number: sanitizeString(from, 80),
          to_number: sanitizeString(to, 80),
          country,
          direction: "inbound",
          status: "initiated",
          created_at: now,
          updated_at: now,
        },
      ],
      prefer: "resolution=ignore-duplicates,return=minimal",
      timeout: 8_000,
    });
  } catch (err) {
    console.warn("voice-webhook: Supabase log failed", err?.message || String(err));
  }
};

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
      return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Method not allowed.</Say></Response>', 405);
    }

    const params =
      event.httpMethod === "POST"
        ? parseFormBody(event)
        : new URLSearchParams(event.queryStringParameters || {});

    const from = normalizePhoneNumber(sanitizeString(params.get("From") || "", 80));
    const to = normalizePhoneNumber(sanitizeString(params.get("To") || "", 80));
    const callSid = sanitizeString(params.get("CallSid") || "", 120);
    const country = detectCountry(to);

    const baseUrl = getRequestBaseUrl(event);
    const statusUrl = baseUrl ? `${baseUrl}/.netlify/functions/voice-status` : "";
    const actionAttr = statusUrl ? ` action="${xmlEscape(statusUrl)}"` : "";
    const callerIdAttr = to ? ` callerId="${xmlEscape(to)}"` : "";

    // Fire-and-forget — never block the TwiML response on DB write
    logCall({ callSid, from, to, country }).catch(() => null);

    const forwardTo = getVoipMsDid();
    console.info("voice-webhook: inbound call", {
      callSid,
      from,
      to,
      country,
      dialTarget: forwardTo || null,
    });

    if (forwardTo) {
      return xmlResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling OneLuxStay. Connecting your call now.</Say><Dial answerOnBridge="true" timeout="30"${actionAttr}${callerIdAttr}><Number>${xmlEscape(forwardTo)}</Number></Dial></Response>`,
      );
    }

    console.error("voice-webhook: missing dial target", {
      callSid,
      from,
      to,
      country,
    });

    return xmlResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling OneLuxStay. Please send us a message and our team will respond shortly.</Say></Response>',
    );
  } catch (error) {
    console.error("voice-webhook: TwiML execution error", {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return xmlResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are unable to connect your call right now. Please try again shortly.</Say></Response>',
      500,
    );
  }
}
