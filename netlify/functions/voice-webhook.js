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

const SIP_POP_HOST = sanitizeString(getEnv("VOIPMS_POP_HOST") || "atlanta2.voip.ms", 120) || "atlanta2.voip.ms";

const buildSipTargets = () => {
  const raphUser = sanitizeString(getEnv("VOIPMS_RAPH_USERNAME") || "127056_raph", 120);
  const angelUser = sanitizeString(getEnv("VOIPMS_ANGEL_USERNAME") || "127056_angel", 120);

  const targets = [];

  if (raphUser) {
    targets.push({
      key: "raph",
      username: raphUser,
      uri: `sip:${raphUser}@${SIP_POP_HOST}`,
      redacted: `sip:${raphUser}@${SIP_POP_HOST}`,
    });
  }

  if (angelUser) {
    targets.push({
      key: "angel",
      username: angelUser,
      uri: `sip:${angelUser}@${SIP_POP_HOST}`,
      redacted: `sip:${angelUser}@${SIP_POP_HOST}`,
    });
  }

  return targets;
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

    const sipTargets = buildSipTargets();
    console.info("voice-webhook: inbound call", {
      callSid,
      from,
      to,
      country,
      sipTargets: sipTargets.map((target) => target.redacted),
    });

    if (sipTargets.length > 0) {
      console.info("voice-webhook: SIP INVITE targets", {
        callSid,
        from,
        to,
        targets: sipTargets.map((target) => target.redacted),
      });

      const sipTwiml = sipTargets
        .map((target) => `<Sip>${xmlEscape(target.uri)}</Sip>`)
        .join("");

      return xmlResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling OneLuxStay. Connecting your call now.</Say><Dial answerOnBridge="true" timeout="30"${actionAttr}${callerIdAttr}>${sipTwiml}</Dial></Response>`,
      );
    }

    console.error("voice-webhook: missing SIP targets", {
      callSid,
      from,
      to,
      country,
      configuredUsers: {
        raph: Boolean(sanitizeString(getEnv("VOIPMS_RAPH_USERNAME") || "127056_raph", 120)),
        angel: Boolean(sanitizeString(getEnv("VOIPMS_ANGEL_USERNAME") || "127056_angel", 120)),
      },
      sipPopHost: SIP_POP_HOST,
    });

    return xmlResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thank you for calling OneLuxStay. We are temporarily unable to connect your call. Please try again shortly.</Say></Response>',
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
