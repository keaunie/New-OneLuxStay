import dotenv from "dotenv";
import { verifyAdminsOlsAccess } from "./_shared/adminsOlsAuth.js";
import { fetchWithTimeout } from "./_shared/http.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

dotenv.config();

const DEFAULT_TWILIO_WHATSAPP_FROM = "whatsapp:+17159218069";

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 4000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeMultiline = (value = "", maxLength = 5000) => {
  const text = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return "";
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.join("\n").slice(0, maxLength);
};

const sanitizeId = (value = "", maxLength = 120) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, maxLength);

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(body),
});

const parseJson = (text = "") => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

const normalizeWhatsAppAddress = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^whatsapp:/i.test(text)) return text;
  const digits = text.replace(/[^\d+]/g, "");
  return digits ? `whatsapp:${digits.startsWith("+") ? digits : `+${digits}`}` : "";
};

const normalizeSmsAddress = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return "";
  const withoutPrefix = text.replace(/^sms:/i, "");
  const digits = withoutPrefix.replace(/[^\d+]/g, "");
  return digits ? `${digits.startsWith("+") ? digits : `+${digits}`}` : "";
};

const buildSessionIdFromPhone = (phoneNumber = "", channel = "whatsapp") => {
  const digits = String(phoneNumber || "").replace(/[^\d]/g, "");
  return sanitizeId(`${channel === "sms" ? "sms" : "whatsapp"}:${digits}`, 80);
};

const getTwilioConfig = () => ({
  accountSid: sanitizeString(getEnv("TWILIO_ACCOUNT_SID"), 120),
  authToken: sanitizeString(getEnv("TWILIO_WHATSAPP_AUTH_TOKEN") || getEnv("TWILIO_AUTH_TOKEN"), 240),
  fromAddress: normalizeWhatsAppAddress(
    sanitizeString(
      getEnv("TWILIO_WHATSAPP_FROM") || getEnv("TWILIO_WHATSAPP_NUMBER") || DEFAULT_TWILIO_WHATSAPP_FROM,
      80,
    ),
  ),
});

const getTwilioSmsConfig = () => ({
  accountSid: sanitizeString(getEnv("TWILIO_ACCOUNT_SID"), 120),
  authToken: sanitizeString(getEnv("TWILIO_SMS_AUTH_TOKEN") || getEnv("TWILIO_AUTH_TOKEN"), 240),
  fromAddress: normalizeSmsAddress(
    sanitizeString(getEnv("TWILIO_SMS_FROM") || getEnv("TWILIO_PHONE_NUMBER") || getEnv("TWILIO_FROM_NUMBER"), 80),
  ),
});

const getChatTables = () => ({
  sessions: sanitizeId(getEnv("SUPABASE_CHAT_SESSIONS_TABLE") || "chat_sessions", 120) || "chat_sessions",
  messages: sanitizeId(getEnv("SUPABASE_CHAT_MESSAGES_TABLE") || "chat_messages", 120) || "chat_messages",
});

const sendTwilioWhatsAppMessage = async ({ phoneNumber = "", message = "" } = {}) => {
  const { accountSid, authToken, fromAddress } = getTwilioConfig();
  if (!accountSid || !authToken || !fromAddress) {
    const error = new Error(
      "Twilio WhatsApp outbound messaging is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM.",
    );
    error.statusCode = 500;
    throw error;
  }

  const toAddress = normalizeWhatsAppAddress(phoneNumber);
  if (!toAddress) {
    const error = new Error("A valid phone number is required.");
    error.statusCode = 400;
    throw error;
  }

  const body = new URLSearchParams({
    To: toAddress,
    From: fromAddress,
    Body: sanitizeMultiline(message, 3000),
  });

  const response = await fetchWithTimeout(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
    20_000,
  );

  const rawText = await response.text();
  const payload = parseJson(rawText);

  if (!response.ok) {
    const error = new Error(
      sanitizeString(payload?.message || payload?.error_message || "Twilio could not send the message.", 320),
    );
    error.statusCode = response.status || 502;
    throw error;
  }

  return {
    sid: sanitizeString(payload?.sid, 120),
    status: sanitizeString(payload?.status, 80),
    to: sanitizeString(payload?.to, 80),
    from: sanitizeString(payload?.from, 80),
  };
};

const sendTwilioSmsMessage = async ({ phoneNumber = "", message = "" } = {}) => {
  const { accountSid, authToken, fromAddress } = getTwilioSmsConfig();
  if (!accountSid || !authToken || !fromAddress) {
    const error = new Error(
      "Twilio SMS outbound messaging is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM.",
    );
    error.statusCode = 500;
    throw error;
  }

  const toAddress = normalizeSmsAddress(phoneNumber);
  if (!toAddress) {
    const error = new Error("A valid phone number is required.");
    error.statusCode = 400;
    throw error;
  }

  const body = new URLSearchParams({
    To: toAddress,
    From: fromAddress,
    Body: sanitizeMultiline(message, 1600),
  });

  const response = await fetchWithTimeout(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
    20_000,
  );

  const rawText = await response.text();
  const payload = parseJson(rawText);

  if (!response.ok) {
    const error = new Error(
      sanitizeString(payload?.message || payload?.error_message || "Twilio could not send the SMS message.", 320),
    );
    error.statusCode = response.status || 502;
    throw error;
  }

  return {
    sid: sanitizeString(payload?.sid, 120),
    status: sanitizeString(payload?.status, 80),
    to: sanitizeString(payload?.to, 80),
    from: sanitizeString(payload?.from, 80),
  };
};

const upsertSession = async ({ tables, sessionId, channel }) => {
  const nowIso = new Date().toISOString();

  await supabaseRestRequest(`${tables.sessions}?on_conflict=session_id`, {
    method: "POST",
    body: [
      {
        session_id: sessionId,
        page_type: channel,
        city: null,
        listing_id: null,
        pathname: "/executive-ols",
        source_origin: `twilio_${channel}`,
        user_agent: "manual_send_message",
        last_seen_at: nowIso,
      },
    ],
    prefer: "resolution=merge-duplicates,return=minimal",
    timeout: 12_000,
  });
};

const storeOutboundMessage = async ({ tables, sessionId, message, twilioMessage, adminUser, channel }) => {
  const nowIso = new Date().toISOString();
  const rows = await supabaseRestRequest(tables.messages, {
    method: "POST",
    body: [
      {
        session_id: sessionId,
        message_id: `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        content: sanitizeMultiline(message, 3000),
        cards: null,
        metadata: {
          pageType: channel,
          city: null,
          listingId: null,
          responseMode: "admin_reply",
          responseModel: "manual_send_message",
          senderType: "admin",
          senderName: sanitizeString(adminUser?.fullName || adminUser?.name, 160) || null,
          senderEmail: sanitizeString(adminUser?.email, 160) || null,
          channel,
          twilioMessageSid: twilioMessage?.sid || null,
          twilioStatus: twilioMessage?.status || null,
          twilioTo: twilioMessage?.to || null,
          twilioFrom: twilioMessage?.from || null,
        },
        created_at: nowIso,
      },
    ],
    prefer: "return=representation",
    timeout: 12_000,
  });

  return Array.isArray(rows) ? rows[0] : null;
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const adminAccess = await verifyAdminsOlsAccess(event);

    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    const phoneNumber = sanitizeString(payload?.phone_number || payload?.phoneNumber, 80);
    const message = sanitizeMultiline(payload?.message, 3000);
    const requestedChannel = sanitizeString(payload?.channel, 20).toLowerCase();
    const channel =
      requestedChannel === "sms" || /^sms:/i.test(phoneNumber)
        ? "sms"
        : "whatsapp";

    if (!phoneNumber) {
      return jsonResponse(400, { error: "phone_number is required" });
    }

    if (!message) {
      return jsonResponse(400, { error: "message is required" });
    }

    const twilioMessage =
      channel === "sms"
        ? await sendTwilioSmsMessage({
            phoneNumber,
            message,
          })
        : await sendTwilioWhatsAppMessage({
            phoneNumber,
            message,
          });

    const tables = getChatTables();
    const sessionId = buildSessionIdFromPhone(phoneNumber, channel);
    await upsertSession({ tables, sessionId, channel });
    const stored = await storeOutboundMessage({
      tables,
      sessionId,
      message,
      twilioMessage,
      adminUser: adminAccess.user,
      channel,
    });

    return jsonResponse(200, {
      ok: true,
      session_id: sessionId,
      channel,
      phone_number: phoneNumber,
      twilio: twilioMessage,
      stored_message_id: sanitizeString(stored?.id || stored?.message_id, 120),
    });
  } catch (error) {
    return jsonResponse(Number(error?.statusCode) || 500, {
      error: sanitizeString(error?.message || "Unable to send Twilio message.", 500),
    });
  }
}
