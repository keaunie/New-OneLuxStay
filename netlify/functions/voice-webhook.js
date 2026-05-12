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
const SUPPORT_FORWARD_NUMBER = sanitizeString(getEnv("VOICE_SUPPORT_FORWARD_TO") || "+12138663589", 40);
const BUSINESS_TIMEZONE = sanitizeString(getEnv("VOICE_BUSINESS_TIMEZONE") || "America/Los_Angeles", 120);
const BUSINESS_START_HOUR = Math.max(0, Math.min(23, Number(getEnv("VOICE_BUSINESS_START_HOUR") || 9) || 9));
const BUSINESS_END_HOUR = Math.max(1, Math.min(24, Number(getEnv("VOICE_BUSINESS_END_HOUR") || 22) || 22));
const MENU_REPLAY_LIMIT = Math.max(0, Number(getEnv("VOICE_MENU_REPLAY_LIMIT") || 1) || 1);

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

const parsePositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const normalizeToE164 = (value = "") => {
  const raw = sanitizeString(value, 80);
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (hasPlus) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
};

const isAfterHoursNow = () => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIMEZONE,
      weekday: "short",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date());

    const weekdayToken = sanitizeString(parts.find((part) => part.type === "weekday")?.value || "", 20).toLowerCase();
    const hour = Number.parseInt(sanitizeString(parts.find((part) => part.type === "hour")?.value || "", 4), 10);
    const isWeekend = weekdayToken === "sat" || weekdayToken === "sun";
    const inBusinessHours = Number.isFinite(hour) && hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
    return isWeekend || !inBusinessHours;
  } catch {
    return false;
  }
};

const buildMenuActionUrl = (baseUrl = "", replayCount = 0) => {
  const qs = new URLSearchParams({ replay: String(replayCount) });
  if (baseUrl) return `${baseUrl}/api/voice?${qs.toString()}`;
  return `/.netlify/functions/voice-webhook?${qs.toString()}`;
};

const buildStatusCallbackAttr = (statusUrl = "") => (statusUrl ? ` action="${xmlEscape(statusUrl)}"` : "");

const buildCallerIdAttr = (to = "") => (to ? ` callerId="${xmlEscape(to)}"` : "");

const buildIvrMenuTwiml = ({ actionUrl, includeRetryPrompt = false }) => {
  const retryPrompt = includeRetryPrompt
    ? "<Say>We did not receive your input.</Say>"
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?><Response>${retryPrompt}<Gather input="dtmf" numDigits="1" timeout="6" actionOnEmptyResult="true" action="${xmlEscape(actionUrl)}" method="POST"><Say>Thank you for calling OneLuxStay. For reservations and guest support, press 1. To contact us via WhatsApp, press 2. To speak with our support team, press 3.</Say></Gather></Response>`;
};

const buildAfterHoursTwiml = () =>
  '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Our support team is currently offline. Please contact us through WhatsApp using the same phone number you called. Thank you.</Say><Hangup/></Response>';

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

    const formParams = event.httpMethod === "POST"
      ? parseFormBody(event)
      : new URLSearchParams();
    const queryParams = new URLSearchParams(event.queryStringParameters || {});
    const getParam = (name = "") => sanitizeString(formParams.get(name) || queryParams.get(name) || "", 200);

    const from = normalizePhoneNumber(getParam("From"));
    const to = normalizePhoneNumber(getParam("To"));
    const callSid = sanitizeString(getParam("CallSid"), 120);
    const digits = sanitizeString(getParam("Digits"), 8);
    const replayCount = parsePositiveInt(getParam("replay"), 0);
    const country = detectCountry(to);

    const baseUrl = getRequestBaseUrl(event);
    const statusUrl = baseUrl ? `${baseUrl}/.netlify/functions/voice-status` : "";
    const dialActionAttr = buildStatusCallbackAttr(statusUrl);
    const callerIdAttr = buildCallerIdAttr(to);
    const afterHours = isAfterHoursNow();

    // Fire-and-forget — never block the TwiML response on DB write
    logCall({ callSid, from, to, country }).catch(() => null);

    const sipTargets = buildSipTargets();
    console.info("voice-webhook: inbound call", {
      callSid,
      from,
      to,
      country,
      sipTargets: sipTargets.map((target) => target.redacted),
      digits,
      replayCount,
      afterHours,
    });

    if (!digits) {
      const includeRetryPrompt = replayCount > 0;
      if (replayCount > MENU_REPLAY_LIMIT) {
        return xmlResponse(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say>No input received. Please call again soon.</Say><Hangup/></Response>',
        );
      }

      return xmlResponse(
        buildIvrMenuTwiml({
          actionUrl: buildMenuActionUrl(baseUrl, replayCount + 1),
          includeRetryPrompt,
        }),
      );
    }

    console.info("voice-webhook: IVR selection", {
      callSid,
      from,
      to,
      digits,
      afterHours,
    });

    if (digits === "1") {
      if (afterHours) {
        console.info("voice-webhook: after-hours fallback for option 1", { callSid, from, to });
        return xmlResponse(buildAfterHoursTwiml());
      }

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
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you now.</Say><Dial answerOnBridge="true" timeout="30"${dialActionAttr}${callerIdAttr}>${sipTwiml}</Dial></Response>`,
        );
      }

      console.error("voice-webhook: missing SIP targets for option 1", {
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
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are temporarily unable to connect your call. Please try again shortly.</Say><Hangup/></Response>',
      );
    }

    if (digits === "2") {
      return xmlResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Please contact us through WhatsApp using the same phone number you called.</Say><Hangup/></Response>',
      );
    }

    if (digits === "3") {
      if (afterHours) {
        console.info("voice-webhook: after-hours fallback for option 3", { callSid, from, to });
        return xmlResponse(buildAfterHoursTwiml());
      }

      const supportForwardTo = normalizeToE164(SUPPORT_FORWARD_NUMBER);
      if (!supportForwardTo) {
        console.error("voice-webhook: invalid support forward number", {
          callSid,
          from,
          to,
          configuredValue: SUPPORT_FORWARD_NUMBER,
        });
        return xmlResponse(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are temporarily unable to forward your call. Please try again shortly.</Say><Hangup/></Response>',
        );
      }

      console.info("voice-webhook: forwarding option 3", {
        callSid,
        from,
        to,
        forwardTo: supportForwardTo,
      });

      return xmlResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Connecting you to our support team now.</Say><Dial answerOnBridge="true" timeout="30"${dialActionAttr}${callerIdAttr}><Number>${xmlEscape(supportForwardTo)}</Number></Dial></Response>`,
      );
    }

    console.warn("voice-webhook: invalid IVR option", {
      callSid,
      from,
      to,
      country,
      digits,
    });

    return xmlResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Invalid option. Please try again.</Say><Redirect method="POST">${xmlEscape(buildMenuActionUrl(baseUrl, 1))}</Redirect></Response>`,
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
