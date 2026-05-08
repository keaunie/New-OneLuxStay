import crypto from "node:crypto";
import dotenv from "dotenv";
import { buildAiCorsHeaders } from "./_shared/aiProtection.js";
import {
  getAdminsOlsActivityTable,
  logAdminsOlsActivity,
  sanitizeAdminsOlsActivityRow,
} from "./_shared/adminsOlsActivity.js";
import { fetchWithTimeout, getHeaderValue } from "./_shared/http.js";
import {
  buildSupabaseRestUrl,
  getSupabaseConfig,
  supabaseRestRequest,
} from "./_shared/supabaseClient.js";
import {
  updateAdminsOlsUserAccount,
  generateAdminsOlsInviteLink,
  verifyAdminsOlsAccess,
  verifyAdminsOlsPassword,
} from "./_shared/adminsOlsAuth.js";

dotenv.config();

const DEFAULT_SENTIMENT_TABLE = "chat_sentiment_lessons";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_TWILIO_WHATSAPP_FROM = "whatsapp:+16188812613";
const DEFAULT_TWILIO_SMS_FROM = "+16188812613";
const DEFAULT_TWILIO_VOICE_FROM = "+16188812613";

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

const isWhatsAppSessionId = (value = "") => sanitizeId(value, 120).toLowerCase().startsWith("whatsapp:");
const isSmsSessionId = (value = "") => sanitizeId(value, 120).toLowerCase().startsWith("sms:");

const extractWhatsAppNumberFromSessionId = (value = "") => {
  const normalized = sanitizeId(value, 120);
  if (!isWhatsAppSessionId(normalized)) return "";
  const digits = normalized.slice("whatsapp:".length).replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
};

const extractSmsNumberFromSessionId = (value = "") => {
  const normalized = sanitizeId(value, 120);
  if (!isSmsSessionId(normalized)) return "";
  const digits = normalized.slice("sms:".length).replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
};

const normalizeWhatsAppAddress = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^whatsapp:/i.test(text)) return text;
  const digits = text.replace(/[^\d+]/g, "");
  return digits ? `whatsapp:${digits.startsWith("+") ? digits : `+${digits}`}` : "";
};

const normalizePhoneNumber = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `${hasPlus ? "+" : ""}${digits}`;
};

const getTwilioSmsConfig = () => {
  const accountSid = sanitizeString(getEnv("TWILIO_ACCOUNT_SID"), 120);
  const authToken = sanitizeString(getEnv("TWILIO_SMS_AUTH_TOKEN") || getEnv("TWILIO_AUTH_TOKEN"), 240);
  const fromNumber = normalizePhoneNumber(
    sanitizeString(
      getEnv("TWILIO_SMS_FROM") || getEnv("TWILIO_PHONE_NUMBER") || getEnv("TWILIO_FROM_NUMBER") || DEFAULT_TWILIO_SMS_FROM,
      80,
    ),
  );

  return { accountSid, authToken, fromNumber };
};

const getRequestBaseUrl = (event = {}) => {
  const proto = sanitizeString(
    getHeaderValue(event, "x-forwarded-proto") || getHeaderValue(event, "x-forwarded-protocol") || "https",
    12,
  );
  const host = sanitizeString(
    getHeaderValue(event, "x-forwarded-host") || getHeaderValue(event, "host") || getEnv("URL"),
    240,
  );

  if (proto && host && !/^https?:\/\//i.test(host)) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  return sanitizeString(getEnv("PUBLIC_SITE_URL") || getEnv("URL") || "https://oneluxstayprop.netlify.app", 240).replace(
    /\/+$/,
    "",
  );
};

const parseBoolean = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parseJson = (text = "") => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

const getTwilioWhatsAppConfig = () => {
  const accountSid = sanitizeString(getEnv("TWILIO_ACCOUNT_SID"), 120);
  const authToken = sanitizeString(getEnv("TWILIO_WHATSAPP_AUTH_TOKEN") || getEnv("TWILIO_AUTH_TOKEN"), 240);
  const fromAddress = normalizeWhatsAppAddress(
    sanitizeString(
      getEnv("TWILIO_WHATSAPP_FROM") || getEnv("TWILIO_WHATSAPP_NUMBER") || DEFAULT_TWILIO_WHATSAPP_FROM,
      80,
    ),
  );

  return { accountSid, authToken, fromAddress };
};

const getTwilioVoiceConfig = () => {
  const accountSid = sanitizeString(getEnv("TWILIO_ACCOUNT_SID"), 120);
  const authToken = sanitizeString(getEnv("TWILIO_VOICE_AUTH_TOKEN") || getEnv("TWILIO_AUTH_TOKEN"), 240);
  const fromNumber = normalizePhoneNumber(
    sanitizeString(
      getEnv("TWILIO_VOICE_FROM") || getEnv("TWILIO_PHONE_NUMBER") || getEnv("TWILIO_FROM_NUMBER") || DEFAULT_TWILIO_VOICE_FROM,
      80,
    ),
  );
  const bridgeSecret = sanitizeString(getEnv("TWILIO_VOICE_BRIDGE_SECRET") || authToken, 240);

  return { accountSid, authToken, fromNumber, bridgeSecret };
};

const buildVoiceBridgeSignature = ({ guestNumber = "", fromNumber = "", secret = "" } = {}) =>
  crypto.createHmac("sha256", String(secret || "missing-secret")).update(`${guestNumber}|${fromNumber}`).digest("hex");

const startTwilioVoiceCall = async ({ event, sessionId = "", agentPhoneNumber = "" } = {}) => {
  const guestNumber = extractWhatsAppNumberFromSessionId(sessionId);
  if (!guestNumber) {
    const error = new Error("Unable to resolve the guest phone number for this WhatsApp conversation.");
    error.statusCode = 400;
    throw error;
  }

  const agentNumber = normalizePhoneNumber(agentPhoneNumber);
  if (!agentNumber) {
    const error = new Error("A valid callback phone number is required to place the call.");
    error.statusCode = 400;
    throw error;
  }

  const { accountSid, authToken, fromNumber, bridgeSecret } = getTwilioVoiceConfig();
  if (!accountSid || !authToken || !fromNumber || !bridgeSecret) {
    const error = new Error(
      "Twilio Voice is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VOICE_FROM, and optionally TWILIO_VOICE_BRIDGE_SECRET.",
    );
    error.statusCode = 500;
    throw error;
  }

  const signature = buildVoiceBridgeSignature({
    guestNumber,
    fromNumber,
    secret: bridgeSecret,
  });
  const bridgeUrl = `${getRequestBaseUrl(event)}/.netlify/functions/admins-ols-voice-bridge?guest=${encodeURIComponent(
    guestNumber,
  )}&from=${encodeURIComponent(fromNumber)}&sig=${encodeURIComponent(signature)}`;

  const body = new URLSearchParams({
    To: agentNumber,
    From: fromNumber,
    Url: bridgeUrl,
    Method: "GET",
  });

  const response = await fetchWithTimeout(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
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
      sanitizeString(payload?.message || payload?.error_message || "Twilio could not start the voice call.", 320),
    );
    error.statusCode = response.status || 502;
    throw error;
  }

  return {
    sid: sanitizeString(payload?.sid, 120),
    status: sanitizeString(payload?.status, 80),
    to: sanitizeString(payload?.to, 80),
    from: sanitizeString(payload?.from, 80),
    guestNumber,
    agentNumber,
  };
};

const sendWhatsAppAdminReply = async ({ sessionId = "", content = "" } = {}) => {
  const toNumber = extractWhatsAppNumberFromSessionId(sessionId);
  if (!toNumber) {
    const error = new Error("Unable to resolve the WhatsApp guest number for this conversation.");
    error.statusCode = 400;
    throw error;
  }

  const { accountSid, authToken, fromAddress } = getTwilioWhatsAppConfig();
  if (!accountSid || !authToken || !fromAddress) {
    const error = new Error(
      "Twilio WhatsApp outbound messaging is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM.",
    );
    error.statusCode = 500;
    throw error;
  }

  const body = new URLSearchParams({
    To: normalizeWhatsAppAddress(toNumber),
    From: fromAddress,
    Body: sanitizeMultiline(content, 3000),
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
      sanitizeString(
        payload?.message || payload?.error_message || "Twilio could not send the WhatsApp reply.",
        320,
      ),
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

const sendSmsAdminReply = async ({ sessionId = "", content = "" } = {}) => {
  const toNumber = extractSmsNumberFromSessionId(sessionId);
  if (!toNumber) {
    const error = new Error("Unable to resolve the SMS guest number for this conversation.");
    error.statusCode = 400;
    throw error;
  }

  const { accountSid, authToken, fromNumber } = getTwilioSmsConfig();
  if (!accountSid || !authToken || !fromNumber) {
    const error = new Error(
      "Twilio SMS outbound messaging is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM.",
    );
    error.statusCode = 500;
    throw error;
  }

  const body = new URLSearchParams({
    To: toNumber,
    From: fromNumber,
    Body: sanitizeMultiline(content, 1600),
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
      sanitizeString(payload?.message || payload?.error_message || "Twilio could not send the SMS reply.", 320),
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

const extractOutputText = (payload) => {
  const coerceText = (value, depth = 0) => {
    if (depth > 3) return "";
    if (Array.isArray(value)) {
      return value.map((item) => coerceText(item, depth + 1)).filter(Boolean).join("\n");
    }
    if (typeof value === "string") return value;
    if (typeof value?.value === "string") return value.value;
    if (typeof value?.text === "string") return value.text;
    if (typeof value?.content === "string") return value.content;
    if (typeof value?.text === "object") {
      const nested = coerceText(value.text, depth + 1);
      if (nested) return nested;
    }
    if (typeof value?.content === "object") {
      const nested = coerceText(value.content, depth + 1);
      if (nested) return nested;
    }
    return "";
  };

  const topLevel = coerceText(payload?.output_text);
  if (topLevel && topLevel.trim()) return topLevel.trim();

  if (!Array.isArray(payload?.output)) return "";

  const parts = [];
  payload.output.forEach((item) => {
    const content = item?.content;
    if (!Array.isArray(content)) {
      const direct = coerceText(item?.text) || coerceText(content);
      if (direct) parts.push(direct);
      return;
    }

    content.forEach((contentPart) => {
      if (!contentPart) return;

      if (contentPart?.type === "refusal" && typeof contentPart.refusal === "string") {
        parts.push(contentPart.refusal);
        return;
      }

      if (contentPart?.type === "output_text" || contentPart?.type === "text") {
        const textValue = coerceText(contentPart.text);
        if (textValue) {
          parts.push(textValue);
          return;
        }
      }

      // Best-effort fallback for unexpected shapes.
      const fallbackText =
        coerceText(contentPart?.text) || coerceText(contentPart?.content) || coerceText(contentPart?.value);
      if (fallbackText) parts.push(fallbackText);
    });
  });

  return parts.join("\n").trim();
};

const truncateText = (value = "", maxLength = 900) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
};

const buildDeterministicConversationSummary = (rows = []) => {
  const items = Array.isArray(rows) ? rows : [];
  const lastUser = [...items].reverse().find((row) => String(row?.role || "").toLowerCase() === "user");
  const guestMessage = sanitizeMultiline(lastUser?.content || "", 600);
  const shortAsk = truncateText(guestMessage, 110);
  const want = shortAsk
    ? shortAsk
        .replace(/^["'“”]+|["'“”]+$/g, "")
        .split(/\s+/)
        .slice(0, 8)
        .join(" ")
    : "Help / question";

  const missing = [];
  const msgLower = guestMessage.toLowerCase();
  if (!/20\d{2}-\d{2}-\d{2}/.test(msgLower) && !/(apr|may|jun|jul|aug|sep|oct|nov|dec|jan|feb|mar)\b/i.test(msgLower)) {
    missing.push("Dates");
  }
  if (!/(guest|guests|adult|adults|room|rooms|people)\b/i.test(msgLower)) {
    missing.push("Guest count");
  }
  if (!/(reservation|confirm|booking|code)\b/i.test(msgLower)) {
    missing.push("Reservation code (if checking status)");
  }

  const missingBlock = missing.length ? missing.map((item) => `- ${item}`).slice(0, 3).join("\n") : "- None";

  return [
    "TL;DR:",
    `- Guest asked: ${shortAsk || "No guest message captured."}`,
    "",
    "What the guest wants:",
    `- ${want || "Help"}`,
    "",
    "What to do next:",
    "- Acknowledge briefly, then ask for the minimum details needed to answer.",
    "",
    "Missing info (if any):",
    missingBlock,
  ].join("\n");
};

const normalizeSentimentLabel = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["positive", "neutral", "negative"].includes(normalized)) return normalized;
  return "";
};

const normalizeGuestEventType = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["city_click", "listing_click", "page_view", "search_submit"].includes(normalized)) {
    return normalized;
  }
  return "";
};

const LESSON_SELECT_BASE =
  "id,title,sentiment_label,trigger_text,response_guidance,example_user_message,example_assistant_style,admin_notes,active,created_at,updated_at";
const LESSON_SELECT_WITH_ACTOR =
  `${LESSON_SELECT_BASE},created_by_id,created_by_email,created_by_name,updated_by_id,updated_by_email,updated_by_name`;

const getAdminHeaders = (event = {}) => ({
  ...buildAiCorsHeaders(event),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key",
});

const jsonResponse = (statusCode, body, event, extraHeaders = {}) => ({
  statusCode,
  headers: {
    ...getAdminHeaders(event),
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

const getTables = () => ({
  sessions:
    sanitizeId(getEnv("SUPABASE_CHAT_SESSIONS_TABLE") || "chat_sessions", 120) || "chat_sessions",
  messages:
    sanitizeId(getEnv("SUPABASE_CHAT_MESSAGES_TABLE") || "chat_messages", 120) || "chat_messages",
  feedback:
    sanitizeId(getEnv("SUPABASE_CHAT_FEEDBACK_TABLE") || "chat_feedback", 120) || "chat_feedback",
  guestCityClicks:
    sanitizeId(getEnv("SUPABASE_GUEST_CITY_CLICKS_TABLE") || "guest_city_click_events", 120) ||
    "guest_city_click_events",
  sentiment:
    sanitizeId(getEnv("SUPABASE_CHAT_SENTIMENT_TABLE") || DEFAULT_SENTIMENT_TABLE, 120) ||
    DEFAULT_SENTIMENT_TABLE,
  activity: getAdminsOlsActivityTable(),
});

const getServiceHeaders = () => {
  const { serviceRoleKey } = getSupabaseConfig({ requireServiceRole: true });
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/json",
  };
};

const fetchConversationSessionContext = async (tables, sessionId = "") => {
  const normalizedSessionId = sanitizeId(sessionId, 120);
  if (!normalizedSessionId) return null;

  const rows = await supabaseRestRequest(tables.sessions, {
    query: {
      select: "session_id,page_type,city,listing_id,pathname,first_seen_at,last_seen_at",
      session_id: `eq.${normalizedSessionId}`,
      limit: "1",
    },
    timeout: 12_000,
  });

  return Array.isArray(rows) ? rows[0] : null;
};

const fetchConversationMessages = async (tables, sessionId = "", limit = 220) => {
  const normalizedSessionId = sanitizeId(sessionId, 120);
  const safeLimit = Math.max(20, Math.min(260, Math.round(Number(limit) || 220)));
  if (!normalizedSessionId) return [];

  const rows = await supabaseRestRequest(tables.messages, {
    query: {
      select: "message_id,role,content,metadata,created_at",
      session_id: `eq.${normalizedSessionId}`,
      order: "created_at.asc",
      limit: String(safeLimit),
    },
    timeout: 12_000,
  });

  return Array.isArray(rows) ? rows : [];
};

const buildConversationTranscript = (rows = []) => {
  const lines = [];

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const role = sanitizeString(row?.role, 30).toLowerCase();
    const createdAt = sanitizeString(row?.created_at, 80);
    const metadata = row?.metadata || {};
    const senderType = sanitizeString(metadata?.senderType, 40).toLowerCase();
    const senderName = sanitizeString(metadata?.senderName || metadata?.senderEmail || "", 120);

    let speaker = role === "user" ? "Guest" : "Assistant";
    if (senderType === "admin") {
      speaker = senderName ? `Admin (${senderName})` : "Admin";
    }

    const content = truncateText(sanitizeString(row?.content, 4000), 700);
    if (!content) return;

    lines.push(`[${createdAt || "unknown"}] ${speaker}: ${content}`);
  });

  return lines.join("\n");
};

const redactSecrets = (value = "") => {
  let text = String(value || "");
  if (!text) return "";
  // Redact common token patterns that should never reach the client UI.
  text = text.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]");
  text = text.replace(/Bearer\\s+[A-Za-z0-9._-]{8,}/gi, "Bearer [REDACTED]");
  return text;
};

const summarizeConversationForAdmin = async (payload = {}, tables = {}, adminUser = {}) => {
  const sessionId = sanitizeId(payload?.sessionId, 120);
  if (!sessionId) {
    const error = new Error("sessionId is required.");
    error.statusCode = 400;
    throw error;
  }

  const apiKey = sanitizeString(getEnv("OPENAI_API_KEY"), 500);
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY is missing on the server.");
    error.statusCode = 500;
    throw error;
  }

  const model = sanitizeString(
    getEnv("OPENAI_ADMIN_SUMMARY_MODEL") || getEnv("OPENAI_CHAT_MODEL") || "gpt-5-mini",
    120,
  );

  const [sessionContext, messageRows] = await Promise.all([
    fetchConversationSessionContext(tables, sessionId),
    fetchConversationMessages(tables, sessionId, payload?.limit),
  ]);

  const transcript = buildConversationTranscript(messageRows);
  if (!transcript) {
    return {
      sessionId,
      summary: "No conversation messages were found for this session yet.",
      generatedAt: new Date().toISOString(),
      model,
      messageCount: 0,
    };
  }

  const ctx = sessionContext || {};
  const contextBlock = [
    "Session context:",
    `- session_id: ${sanitizeString(ctx?.session_id, 160) || sessionId}`,
    `- page_type: ${sanitizeString(ctx?.page_type, 80) || "unknown"}`,
    `- city: ${sanitizeString(ctx?.city, 120) || "unknown"}`,
    `- listing_id: ${sanitizeString(ctx?.listing_id, 160) || "unknown"}`,
    `- pathname: ${sanitizeString(ctx?.pathname, 240) || "unknown"}`,
    `- first_seen_at: ${sanitizeString(ctx?.first_seen_at, 80) || "unknown"}`,
    `- last_seen_at: ${sanitizeString(ctx?.last_seen_at, 80) || "unknown"}`,
  ].join("\n");

  const instructions = `
You are an internal OneLuxStay admin copilot.

Task: Create a very short takeover summary for an admin.

Rules:
- Use only the transcript provided. Do not guess details.
- Keep it as short as possible. Avoid repeating the transcript.
- If key info is missing (dates, guest count, listing, reservation code), mention only the missing items.
- Output ONLY the template below (no extra text).

TL;DR:
- (1 sentence)

What the guest wants:
- (max 8 words)

What to do next:
- (1 sentence)

Missing info (if any):
- (0-3 bullets, short)
`.trim();

  const input = [
    contextBlock,
    "",
    "Conversation transcript:",
    transcript,
  ].join("\n");

  const response = await fetchWithTimeout(
    OPENAI_RESPONSES_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        max_output_tokens: 180,
      }),
    },
    25_000,
  );

  const raw = await response.text();
  const data = parseJson(raw);
  if (!response.ok) {
    const status = Number(response.status || 0);
    const upstream = redactSecrets(data?.error?.message || "");
    const message =
      status === 401 || status === 403
        ? "OpenAI authentication failed while generating the summary."
        : upstream || `OpenAI request failed (${response.status})`;

    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  const extracted = extractOutputText(data);
  const summaryText =
    sanitizeMultiline(extracted, 5000) ||
    buildDeterministicConversationSummary(messageRows) ||
    "Unable to generate summary.";
  return {
    sessionId,
    summary: summaryText,
    generatedAt: new Date().toISOString(),
    model,
    messageCount: Array.isArray(messageRows) ? messageRows.length : 0,
    context: {
      pageType: sanitizeString(ctx?.page_type, 80),
      city: sanitizeString(ctx?.city, 120),
      listingId: sanitizeString(ctx?.listing_id, 160),
      pathname: sanitizeString(ctx?.pathname, 240),
    },
  };
};

const countRows = async (table, { query = {}, select = "id" } = {}) => {
  const response = await fetchWithTimeout(
    buildSupabaseRestUrl(table, {
      select,
      ...query,
    }),
    {
      method: "HEAD",
      headers: {
        ...getServiceHeaders(),
        Prefer: "count=exact",
      },
    },
    12_000,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Unable to count ${table}`);
  }

  const contentRange = String(response.headers.get("content-range") || "");
  const total = Number(contentRange.split("/")[1] || 0);
  return Number.isFinite(total) ? total : 0;
};

const sortAndCountValues = (rows = [], selector, { max = 5 } = {}) =>
  Object.entries(
    (rows || []).reduce((acc, row) => {
      const label = sanitizeString(selector(row), 120) || "Unknown";
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {}),
  )
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, Math.min(10, Number(max) || 5)));

const sanitizeSessionRow = (row = {}) => ({
  sessionId: sanitizeId(row?.session_id, 120),
  pageType: sanitizeString(row?.page_type, 80),
  city: sanitizeString(row?.city, 120),
  listingId: sanitizeString(row?.listing_id, 120),
  pathname: sanitizeString(row?.pathname, 240),
  sourceOrigin: sanitizeString(row?.source_origin, 240),
  userAgent: sanitizeString(row?.user_agent, 220),
  firstSeenAt: sanitizeString(row?.first_seen_at, 80),
  lastSeenAt: sanitizeString(row?.last_seen_at, 80),
});

const sanitizeFeedbackRow = (row = {}) => ({
  sessionId: sanitizeId(row?.session_id, 120),
  messageId: sanitizeId(row?.message_id, 120),
  rating: sanitizeString(row?.rating, 40),
  assistantMessage: sanitizeString(row?.assistant_message, 800),
  userMessage: sanitizeString(row?.user_message, 500),
  pageContext: {
    pageType: sanitizeString(row?.page_context?.pageType, 80),
    city: sanitizeString(row?.page_context?.city, 120),
    listingId: sanitizeString(row?.page_context?.listingId, 120),
    pathname: sanitizeString(row?.page_context?.pathname, 240),
  },
  updatedAt: sanitizeString(row?.updated_at, 80),
});

const sanitizeAssistantMessageRow = (row = {}) => ({
  sessionId: sanitizeId(row?.session_id, 120),
  messageId: sanitizeId(row?.message_id, 120),
  content: sanitizeString(row?.content, 800),
  metadata: {
    pageType: sanitizeString(row?.metadata?.pageType, 80),
    city: sanitizeString(row?.metadata?.city, 120),
    listingId: sanitizeString(row?.metadata?.listingId, 120),
    responseMode: sanitizeString(row?.metadata?.responseMode, 40),
    responseModel: sanitizeString(row?.metadata?.responseModel, 120),
    senderType: sanitizeString(row?.metadata?.senderType, 40).toLowerCase(),
    senderName: sanitizeString(row?.metadata?.senderName, 160),
    senderEmail: sanitizeString(row?.metadata?.senderEmail, 160),
  },
  createdAt: sanitizeString(row?.created_at, 80),
});

const sanitizeConversationMessageRow = (row = {}) => ({
  sessionId: sanitizeId(row?.session_id, 120),
  messageId: sanitizeId(row?.message_id, 120),
  role: sanitizeString(row?.role, 20) === "user" ? "user" : "assistant",
  content: sanitizeString(row?.content, 1400),
  cardCount: Array.isArray(row?.cards) ? row.cards.length : 0,
  metadata: {
    pageType: sanitizeString(row?.metadata?.pageType, 80),
    city: sanitizeString(row?.metadata?.city, 120),
    listingId: sanitizeString(row?.metadata?.listingId, 120),
    responseMode: sanitizeString(row?.metadata?.responseMode, 40),
    responseModel: sanitizeString(row?.metadata?.responseModel, 120),
    senderType: sanitizeString(row?.metadata?.senderType, 40).toLowerCase(),
    senderName: sanitizeString(row?.metadata?.senderName, 160),
    senderEmail: sanitizeString(row?.metadata?.senderEmail, 160),
  },
  createdAt: sanitizeString(row?.created_at, 80),
});

const sanitizeLessonRow = (row = {}) => ({
  id: sanitizeId(row?.id, 120),
  title: sanitizeString(row?.title, 180),
  sentimentLabel: normalizeSentimentLabel(row?.sentiment_label),
  triggerText: sanitizeString(row?.trigger_text, 700),
  responseGuidance: sanitizeString(row?.response_guidance, 1000),
  exampleUserMessage: sanitizeString(row?.example_user_message, 500),
  exampleAssistantStyle: sanitizeString(row?.example_assistant_style, 500),
  adminNotes: sanitizeString(row?.admin_notes, 700),
  active: Boolean(row?.active),
  createdBy: {
    id: sanitizeId(row?.created_by_id, 120),
    email: sanitizeString(row?.created_by_email, 160).toLowerCase(),
    name: sanitizeString(row?.created_by_name, 160),
  },
  updatedBy: {
    id: sanitizeId(row?.updated_by_id, 120),
    email: sanitizeString(row?.updated_by_email, 160).toLowerCase(),
    name: sanitizeString(row?.updated_by_name, 160),
  },
  createdAt: sanitizeString(row?.created_at, 80),
  updatedAt: sanitizeString(row?.updated_at, 80),
});

const sanitizeGuestJourneyRow = (row = {}) => ({
  id: sanitizeId(row?.id, 120),
  sessionId: sanitizeId(row?.session_id, 120),
  eventType: normalizeGuestEventType(row?.event_type) || "city_click",
  city: sanitizeString(row?.city, 120),
  listingId: sanitizeString(row?.listing_id, 120),
  listingTitle: sanitizeString(row?.listing_title, 220),
  destinationPath: sanitizeString(row?.destination_path, 240),
  sourceSection: sanitizeString(row?.source_section, 120),
  sourceLabel: sanitizeString(row?.source_label, 160),
  pathname: sanitizeString(row?.pathname, 240),
  pageType: sanitizeString(row?.page_type, 80),
  sourceOrigin: sanitizeString(row?.source_origin, 240),
  createdAt: sanitizeString(row?.created_at, 80),
});

const buildCreatedAtFilter = ({ startAt = "", endAt = "" } = {}) => {
  const start = sanitizeString(startAt, 80);
  const end = sanitizeString(endAt, 80);

  if (start && end) {
    return {
      and: `(created_at.gte.${start},created_at.lte.${end})`,
    };
  }

  if (start) {
    return {
      created_at: `gte.${start}`,
    };
  }

  if (end) {
    return {
      created_at: `lte.${end}`,
    };
  }

  return {};
};

const buildActorNameFilter = (value = "") => {
  const normalized = sanitizeString(value, 160);
  if (!normalized) return {};

  const escaped = normalized.replace(/[%,]/g, "").trim();
  if (!escaped) return {};

  return {
    actor_name: `ilike.*${escaped}*`,
  };
};

const buildLessonActorFilter = (value = "") => {
  const normalized = sanitizeString(value, 160);
  if (!normalized) return {};

  const escaped = normalized.replace(/[%,()]/g, "").trim();
  if (!escaped) return {};

  return {
    or: `(created_by_name.ilike.*${escaped}*,updated_by_name.ilike.*${escaped}*,created_by_email.ilike.*${escaped}*,updated_by_email.ilike.*${escaped}*)`,
  };
};

const buildGuestJourneyFilters = (payload = {}) => {
  const query = {
    ...buildCreatedAtFilter({
      startAt: payload?.startAt,
      endAt: payload?.endAt,
    }),
  };

  const eventType = normalizeGuestEventType(payload?.eventType);
  if (eventType) {
    query.event_type = `eq.${eventType}`;
  }

  const pageType = sanitizeString(payload?.pageType, 80).toLowerCase();
  if (pageType) {
    query.page_type = `eq.${pageType}`;
  }

  const city = sanitizeString(payload?.city, 120).replace(/[%,]/g, "").trim();
  if (city) {
    query.city = `ilike.*${city}*`;
  }

  const pathname = sanitizeString(payload?.pathname, 240).replace(/[%,]/g, "").trim();
  if (pathname) {
    query.pathname = `ilike.*${pathname}*`;
  }

  return query;
};

const safeLogAdminsOlsActivity = async (input) => {
  try {
    await logAdminsOlsActivity(input);
  } catch {
    // Audit logging should not block admin workflows.
  }
};

const isMissingLessonActorColumnsError = (error) => {
  const message = sanitizeString(error?.message || "", 500).toLowerCase();
  const mentionsActorColumns = message.includes("created_by_") || message.includes("updated_by_");
  if (!mentionsActorColumns) return false;
  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
};

const buildLessonActorFields = (adminUser = {}) => {
  const actorId = sanitizeId(adminUser?.id, 120);
  const actorEmail = sanitizeString(adminUser?.email, 160).toLowerCase();
  const actorName = sanitizeString(
    adminUser?.fullName || adminUser?.name || adminUser?.email || "",
    160,
  );

  return {
    created_by_id: actorId || null,
    created_by_email: actorEmail || null,
    created_by_name: actorName || null,
    updated_by_id: actorId || null,
    updated_by_email: actorEmail || null,
    updated_by_name: actorName || null,
  };
};

const buildLessonUpdaterFields = (adminUser = {}) => {
  const actorId = sanitizeId(adminUser?.id, 120);
  const actorEmail = sanitizeString(adminUser?.email, 160).toLowerCase();
  const actorName = sanitizeString(
    adminUser?.fullName || adminUser?.name || adminUser?.email || "",
    160,
  );

  return {
    updated_by_id: actorId || null,
    updated_by_email: actorEmail || null,
    updated_by_name: actorName || null,
  };
};

const inferDeployContext = () => {
  const explicitContext = sanitizeString(process.env.CONTEXT || "", 120).toLowerCase();
  if (explicitContext) return explicitContext;

  const nodeEnv = sanitizeString(process.env.NODE_ENV || "", 120).toLowerCase();
  if (nodeEnv === "development" || nodeEnv === "production" || nodeEnv === "test") {
    return nodeEnv;
  }

  const branch = sanitizeString(process.env.BRANCH || "", 120).toLowerCase();
  const siteUrl = sanitizeString(
    process.env.PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_URL || "",
    240,
  );

  if (siteUrl) {
    try {
      const parsed = new URL(siteUrl);
      const hostname = String(parsed.hostname || "").toLowerCase();

      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.endsWith(".local")
      ) {
        return "development";
      }

      const deployPrimeUrl = sanitizeString(process.env.DEPLOY_PRIME_URL || "", 240);
      if (deployPrimeUrl && siteUrl === deployPrimeUrl && branch && !["main", "master", "production"].includes(branch)) {
        return "branch-deploy";
      }

      if (hostname.endsWith(".netlify.app") || hostname.endsWith(".onrender.com") || hostname.endsWith(".vercel.app")) {
        return "production";
      }

      return "production";
    } catch {
      // Ignore malformed URL and continue to fallback labels.
    }
  }

  if (branch && !["main", "master", "production"].includes(branch)) {
    return "branch-deploy";
  }

  return "development";
};

const resolveInviteRedirectUrl = (payload = {}, event = {}) => {
  const provided = sanitizeString(payload?.redirectTo, 4000);
  const fallback =
    sanitizeString(process.env.PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_URL || "", 240) ||
    sanitizeString(event?.headers?.origin || "", 240);

  const candidate = provided || (fallback ? `${fallback.replace(/\/+$/, "")}/admins-ols/accept` : "");
  if (!candidate) throw new Error("Unable to resolve invite redirect URL.");

  try {
    const parsed = new URL(candidate);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "https:" && protocol !== "http:") {
      throw new Error("Unsupported redirect URL protocol.");
    }

    // Prevent open redirects: if we have a configured site URL, require the redirect to match that origin.
    if (fallback) {
      const fallbackOrigin = new URL(fallback).origin;
      if (parsed.origin !== fallbackOrigin) {
        throw new Error("Invite redirect URL must match this site's origin.");
      }
    }

    return parsed.toString();
  } catch (error) {
    const message = sanitizeString(error?.message || "", 240) || "Invalid redirect URL.";
    const err = new Error(message);
    err.statusCode = 400;
    throw err;
  }
};

const sendAdminsOlsInviteEmail = async ({ to, invitedByName, siteOrigin, acceptUrl }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!apiKey || !from || !recipients.length) {
    return { skipped: true };
  }

  const safeAcceptUrl = sanitizeString(acceptUrl, 4000);
  if (!safeAcceptUrl) {
    throw new Error("Invite link was not generated.");
  }

  const title = "You have been invited";
  const preheader = "Set your admin password to access the Concierge Intelligence Panel.";
  const brand = "OneLuxStay";
  const inviter = sanitizeString(invitedByName, 160) || "a OneLuxStay superadmin";
  const originLabel = sanitizeString(siteOrigin, 200) || "the OneLuxStay site";

  const html = `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.45; color: #111;">
    <div style="max-width: 560px; margin: 0 auto; padding: 28px 18px;">
      <h1 style="margin: 0 0 8px; font-size: 22px;">${title}</h1>
      <div style="color: #555; margin: 0 0 18px; font-size: 14px;">${preheader}</div>
      <p style="margin: 0 0 14px; font-size: 14px;">
        ${brand} invited you to access the Concierge Intelligence Panel on <strong>${originLabel}</strong>.
      </p>
      <p style="margin: 0 0 18px; font-size: 14px;">
        Invited by: <strong>${inviter}</strong>
      </p>
      <div style="margin: 18px 0 20px;">
        <a href="${safeAcceptUrl}" style="display: inline-block; background: #0b1f3b; color: #fff; text-decoration: none; padding: 12px 16px; border-radius: 10px; font-weight: 600;">
          Accept the invite
        </a>
      </div>
      <p style="margin: 0 0 12px; font-size: 12px; color: #666;">
        This link is one-time. If it says expired, ask a superadmin to resend your invite.
      </p>
      <p style="margin: 0; font-size: 12px; color: #666; word-break: break-all;">
        If the button doesn’t work, paste this link into your browser:<br/>
        <a href="${safeAcceptUrl}" style="color: #0b1f3b;">${safeAcceptUrl}</a>
      </p>
    </div>
  </div>
  `.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `${brand}: Admin invite`,
      html,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message || "Unable to send invite email.");
  }
  return payload;
};

const fixInviteLink = (actionLink = "", redirectTo = "") => {
  const raw = sanitizeString(actionLink, 4000);
  const target = sanitizeString(redirectTo, 4000);
  if (!raw) return "";

  // If the link already points to the accept page, keep it.
  if (target && raw.toLowerCase().startsWith(target.toLowerCase())) return raw;

  // If the link carries tokens in the hash (GoTrue generate_link), rebuild it onto the accept route.
  const hashIndex = raw.indexOf("#");
  if (hashIndex > -1 && target) {
    const fragment = raw.slice(hashIndex + 1);
    if (fragment && fragment.includes("access_token=")) {
      return `${target}#${fragment}`;
    }
  }

  return raw;
};

const inviteAdminUser = async (payload = {}, adminUser = {}, event = {}) => {
  if (!adminUser?.isSuperAdmin) {
    const error = new Error("Superadmin access required.");
    error.statusCode = 403;
    throw error;
  }

  const email = sanitizeString(payload?.email, 320).toLowerCase();
  const fullName = sanitizeString(payload?.fullName, 160);
  const role = sanitizeString(payload?.role, 80) || "admins_ols";
  const redirectTo = resolveInviteRedirectUrl(payload, event);
  const forceResend = parseBoolean(payload?.forceResend, false);

  if (!fullName) throw new Error("Full name is required.");
  if (fullName.split(/\s+/).filter(Boolean).length < 2) {
    throw new Error("Full name must include first and last name.");
  }

  // Soft dedupe: if we already invited this email recently, return that info so the UI can toast it.
  // This avoids spamming multiple invite emails by accidental clicks.
  // If the activity table isn't available, ignore and proceed.
  try {
    if (forceResend) throw new Error("skip-dedupe");
    const candidate = await supabaseRestRequest(getAdminsOlsActivityTable(), {
      query: {
        select: "id,event_type,message,created_at",
        order: "created_at.desc",
        limit: "1",
        event_type: "in.(admin_invited,admin_invite_link_generated)",
        message: `ilike.*${email.replace(/[%,]/g, "")}*`,
      },
      timeout: 10_000,
    });

    const row = Array.isArray(candidate) ? candidate[0] : null;
    const lastAt = row?.created_at ? Date.parse(String(row.created_at)) : 0;
    if (Number.isFinite(lastAt) && lastAt > 0) {
      const ageMs = Date.now() - lastAt;
      const windowMs = 24 * 60 * 60 * 1000;
      if (ageMs >= 0 && ageMs < windowMs) {
        let actionLink = "";
        let linkWarning = "";
        try {
          const action = await generateAdminsOlsInviteLink({
            email,
            redirectTo,
            data: {
              full_name: fullName || email,
              admins_ols: true,
              role,
              admins_ols_superadmin: role === "admins_ols_superadmin" || role === "superadmin",
              invite_pending: true,
              invited_by_email: sanitizeString(adminUser?.email || "", 160).toLowerCase() || null,
              invited_by_name: sanitizeString(adminUser?.fullName || adminUser?.name || "", 160) || null,
              invite_sent_at: new Date().toISOString(),
            },
          });
          actionLink = fixInviteLink(action?.actionLink || "", redirectTo);
        } catch (error) {
          actionLink = "";
          linkWarning = sanitizeString(error?.message || "Unable to generate a backup invite link.", 240);
        }

        return {
          email,
          role,
          invitedAt: new Date().toISOString(),
          redirectTo,
          inviteSent: false,
          alreadyInvited: true,
          lastInvitedAt: row.created_at,
          actionLink,
          ...(linkWarning ? { warning: linkWarning } : {}),
          forced: false,
        };
      }
    }
  } catch {
    // ignore
  }

  try {
    // Prefer generate_link for invites so we can send a direct /admins-ols/accept#access_token=... URL.
    // This avoids the GoTrue /verify OTP redirect link that can show otp_expired (often due to email link scanners).
    const invitedByName = sanitizeString(adminUser?.fullName || adminUser?.name || "", 160);
    const siteOrigin = (() => {
      try {
        return new URL(redirectTo).origin;
      } catch {
        return sanitizeString(process.env.PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_URL || "", 240);
      }
    })();

    const action = await generateAdminsOlsInviteLink({
      email,
      redirectTo,
      data: {
        full_name: fullName || email,
        admins_ols: true,
        role,
        admins_ols_superadmin: role === "admins_ols_superadmin" || role === "superadmin",
        invite_pending: true,
        invited_by_email: sanitizeString(adminUser?.email || "", 160).toLowerCase() || null,
        invited_by_name: invitedByName || null,
        invite_sent_at: new Date().toISOString(),
      },
    });

    const actionLink = fixInviteLink(action?.actionLink || "", redirectTo);
    let emailPayload = { skipped: true };
    let warning = "";
    try {
      emailPayload = await sendAdminsOlsInviteEmail({
        to: email,
        invitedByName,
        siteOrigin,
        acceptUrl: actionLink,
      });
    } catch (error) {
      warning = sanitizeString(error?.message || "Invite email could not be sent.", 240);
      emailPayload = { skipped: true };
    }

    return {
      email,
      role,
      invitedAt: new Date().toISOString(),
      redirectTo,
      inviteSent: Boolean(emailPayload && !emailPayload.skipped),
      actionLink,
      ...(warning ? { warning } : {}),
      forced: forceResend,
    };
  } catch (error) {
    const rawMessage = sanitizeString(error?.message || "", 500).toLowerCase();
    if (rawMessage.includes("already") && rawMessage.includes("registered")) {
      const err = new Error("That email already has an account. Ask them to sign in at /admins-ols/login (or reset their password).");
      err.statusCode = 409;
      throw err;
    }

    // If Supabase cannot send email (SMTP disabled or redirect URL not allowed), generate a one-time invite link
    // that the superadmin can copy/share manually.
    const action = await generateAdminsOlsInviteLink({
      email,
      redirectTo,
      data: {
        full_name: fullName || email,
        admins_ols: true,
        role,
        admins_ols_superadmin: role === "admins_ols_superadmin" || role === "superadmin",
        invite_pending: true,
        invited_by_email: sanitizeString(adminUser?.email || "", 160).toLowerCase() || null,
        invited_by_name: sanitizeString(adminUser?.fullName || adminUser?.name || "", 160) || null,
        invite_sent_at: new Date().toISOString(),
      },
    });

    return {
      email: action.email,
      role,
      invitedAt: new Date().toISOString(),
      redirectTo,
      inviteSent: false,
      actionLink: fixInviteLink(action.actionLink, redirectTo),
      warning: sanitizeString(error?.message || "Invite email could not be sent.", 500),
    };
  }
};

const fetchSentimentLessonsRaw = async (tables) => {
  try {
    return await supabaseRestRequest(tables.sentiment, {
      query: {
        select: LESSON_SELECT_WITH_ACTOR,
        order: "updated_at.desc",
        limit: "40",
      },
      timeout: 12_000,
    });
  } catch (error) {
    if (!isMissingLessonActorColumnsError(error)) throw error;
    return supabaseRestRequest(tables.sentiment, {
      query: {
        select: LESSON_SELECT_BASE,
        order: "updated_at.desc",
        limit: "40",
      },
      timeout: 12_000,
    });
  }
};

const buildRecentConversationThreads = ({
  conversationMessages = [],
  recentSessions = [],
  maxThreads = 8,
  maxMessagesPerThread = 12,
} = {}) => {
  const sessionMetaById = new Map(
    (recentSessions || []).map((session) => [
      session.sessionId,
      {
        pageType: session.pageType || "",
        city: session.city || "",
        listingId: session.listingId || "",
        pathname: session.pathname || "",
        lastSeenAt: session.lastSeenAt || "",
      },
    ]),
  );

  const grouped = new Map();
  (conversationMessages || []).forEach((message) => {
    if (!message?.sessionId) return;
    if (!grouped.has(message.sessionId)) {
      grouped.set(message.sessionId, []);
    }
    grouped.get(message.sessionId).push(message);
  });

  return [...grouped.entries()]
    .map(([sessionId, messages]) => {
      const orderedMessages = [...messages]
        .sort((a, b) => {
          const aTime = Date.parse(a.createdAt || "") || 0;
          const bTime = Date.parse(b.createdAt || "") || 0;
          return aTime - bTime;
        })
        .slice(-Math.max(2, Math.min(20, Number(maxMessagesPerThread) || 12)));

      const latestMessage = orderedMessages[orderedMessages.length - 1] || {};
      const meta =
        sessionMetaById.get(sessionId) || {
          pageType: latestMessage?.metadata?.pageType || "",
          city: latestMessage?.metadata?.city || "",
          listingId: latestMessage?.metadata?.listingId || "",
          pathname: "",
          lastSeenAt: latestMessage?.createdAt || "",
        };

      return {
        sessionId,
        city: meta.city || latestMessage?.metadata?.city || "",
        pageType: meta.pageType || latestMessage?.metadata?.pageType || "",
        listingId: meta.listingId || latestMessage?.metadata?.listingId || "",
        pathname: meta.pathname || "",
        lastSeenAt: meta.lastSeenAt || latestMessage?.createdAt || "",
        messageCount: orderedMessages.length,
        messages: orderedMessages,
      };
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.lastSeenAt || "") || 0;
      const bTime = Date.parse(b.lastSeenAt || "") || 0;
      return bTime - aTime;
    })
    .slice(0, Math.max(1, Math.min(12, Number(maxThreads) || 8)));
};

const getDashboardData = async (tables, adminUser = {}) => {
  const dashboardQueries = [
    countRows(tables.sessions, { select: "session_id" }),
    countRows(tables.messages, { select: "id" }),
    countRows(tables.feedback, { select: "id" }),
    countRows(tables.feedback, { select: "id", query: { rating: "eq.good" } }),
    countRows(tables.feedback, { select: "id", query: { rating: "eq.bad" } }),
    countRows(tables.guestCityClicks, { select: "id" }),
    countRows(tables.sentiment, { select: "id" }),
    countRows(tables.sentiment, { select: "id", query: { active: "eq.true" } }),
    supabaseRestRequest(tables.sessions, {
      query: {
        select: "session_id,page_type,city,listing_id,pathname,source_origin,user_agent,first_seen_at,last_seen_at",
        order: "last_seen_at.desc",
        limit: "18",
      },
      timeout: 12_000,
    }),
    supabaseRestRequest(tables.feedback, {
      query: {
        select: "session_id,message_id,rating,assistant_message,user_message,page_context,updated_at",
        order: "updated_at.desc",
        limit: "18",
      },
      timeout: 12_000,
    }),
    supabaseRestRequest(tables.messages, {
      query: {
        select: "session_id,message_id,content,metadata,created_at",
        role: "eq.assistant",
        order: "created_at.desc",
        limit: "18",
      },
      timeout: 12_000,
    }),
    supabaseRestRequest(tables.messages, {
      query: {
        select: "session_id,message_id,role,content,cards,metadata,created_at",
        order: "created_at.desc",
        limit: "120",
      },
      timeout: 12_000,
    }),
    fetchSentimentLessonsRaw(tables),
    supabaseRestRequest(tables.guestCityClicks, {
      query: {
        select: "id,session_id,event_type,city,listing_id,listing_title,destination_path,source_section,source_label,pathname,page_type,source_origin,created_at",
        order: "created_at.desc",
        limit: "30",
      },
      timeout: 12_000,
    }),
    adminUser?.isSuperAdmin
      ? supabaseRestRequest(tables.activity, {
          query: {
            select: "id,event_type,actor_id,actor_email,actor_name,auth_mode,message,details,created_at",
            order: "created_at.desc",
            limit: "30",
          },
          timeout: 12_000,
        })
      : Promise.resolve([]),
  ];

  const [
    sessionsTotal,
    messagesTotal,
    feedbackTotal,
    goodFeedbackTotal,
    badFeedbackTotal,
    guestCityClicksTotal,
    lessonsTotal,
    activeLessonsTotal,
    recentSessionsRaw,
    recentFeedbackRaw,
    recentAssistantMessagesRaw,
    recentConversationMessagesRaw,
    sentimentLessonsRaw,
    recentGuestCityClicksRaw,
    recentAdminActivityRaw,
  ] = await Promise.all(dashboardQueries);

  const recentSessions = Array.isArray(recentSessionsRaw) ? recentSessionsRaw.map(sanitizeSessionRow) : [];
  const recentFeedback = Array.isArray(recentFeedbackRaw) ? recentFeedbackRaw.map(sanitizeFeedbackRow) : [];
  const recentAssistantMessages = Array.isArray(recentAssistantMessagesRaw)
    ? recentAssistantMessagesRaw.map(sanitizeAssistantMessageRow)
    : [];
  const recentConversationMessages = Array.isArray(recentConversationMessagesRaw)
    ? recentConversationMessagesRaw.map(sanitizeConversationMessageRow)
    : [];
  const sentimentLessons = Array.isArray(sentimentLessonsRaw) ? sentimentLessonsRaw.map(sanitizeLessonRow) : [];
  const rawGuestJourneyEvents = Array.isArray(recentGuestCityClicksRaw)
    ? recentGuestCityClicksRaw.map(sanitizeGuestJourneyRow)
    : [];
  const recentGuestJourneyEvents = adminUser?.isSuperAdmin ? rawGuestJourneyEvents : [];
  const recentConversations = buildRecentConversationThreads({
    conversationMessages: recentConversationMessages,
    recentSessions,
    maxThreads: 8,
    maxMessagesPerThread: 12,
  });
  const recentAdminActivity = Array.isArray(recentAdminActivityRaw)
    ? recentAdminActivityRaw.map(sanitizeAdminsOlsActivityRow)
    : [];

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      sessionsTotal,
      messagesTotal,
      feedbackTotal,
      goodFeedbackTotal,
      badFeedbackTotal,
      guestJourneyEventsTotal: guestCityClicksTotal,
      lessonsTotal,
      activeLessonsTotal,
    },
    system: {
      learningEnabled: parseBoolean(getEnv("SUPABASE_CHAT_LEARNING_ENABLED"), true),
      aiQueryEnabled: parseBoolean(getEnv("AI_QUERY_ENABLED"), false),
      chatModel: sanitizeString(getEnv("OPENAI_CHAT_MODEL") || "gpt-5-mini", 120),
      aiQueryModel: sanitizeString(getEnv("OPENAI_AI_QUERY_MODEL") || "gpt-5-mini", 120),
      embeddingModel: sanitizeString(getEnv("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small", 120),
      dataProvider: sanitizeString(getEnv("APP_DATA_PROVIDER") || "guesty", 120),
      deployContext: inferDeployContext(),
      siteUrl: sanitizeString(process.env.PUBLIC_SITE_URL || process.env.URL || process.env.DEPLOY_URL || "", 240),
      tables,
    },
    rollups: {
      topCities: sortAndCountValues(recentSessions, (row) => row.city || "Unknown"),
      topPageTypes: sortAndCountValues(recentSessions, (row) => row.pageType || "Unknown"),
      topGuestCities: adminUser?.isSuperAdmin
        ? sortAndCountValues(recentGuestJourneyEvents, (row) => row.city || "Unknown")
        : [],
      topGuestPages: adminUser?.isSuperAdmin
        ? sortAndCountValues(recentGuestJourneyEvents, (row) => row.pathname || row.destinationPath || "Unknown")
        : [],
      topGuestEventTypes: adminUser?.isSuperAdmin
        ? sortAndCountValues(recentGuestJourneyEvents, (row) => row.eventType || "Unknown")
        : [],
      lessonsBySentiment: sortAndCountValues(sentimentLessons, (row) => row.sentimentLabel || "Unknown"),
    },
    recentSessions,
    recentFeedback,
    recentAssistantMessages,
    recentConversations,
    recentGuestJourneyEvents,
    ...(adminUser?.isSuperAdmin ? { recentAdminActivity } : {}),
    sentimentLessons,
  };
};

const createLesson = async (payload, tables, adminUser = {}) => {
  const title = sanitizeString(payload?.title, 180);
  const sentimentLabel = normalizeSentimentLabel(payload?.sentimentLabel);
  const responseGuidance = sanitizeString(payload?.responseGuidance, 1000);
  const triggerText = sanitizeString(payload?.triggerText, 700);
  const exampleUserMessage = sanitizeString(payload?.exampleUserMessage, 500);
  const exampleAssistantStyle = sanitizeString(payload?.exampleAssistantStyle, 500);
  const adminNotes = sanitizeString(payload?.adminNotes, 700);
  const active = payload?.active == null ? true : Boolean(payload?.active);

  if (!title) throw new Error("Lesson title is required.");
  if (!sentimentLabel) throw new Error("Sentiment label must be positive, neutral, or negative.");
  if (!responseGuidance) throw new Error("Response guidance is required.");

  const nowIso = new Date().toISOString();
  const baseRow = {
    title,
    sentiment_label: sentimentLabel,
    trigger_text: triggerText || null,
    response_guidance: responseGuidance,
    example_user_message: exampleUserMessage || null,
    example_assistant_style: exampleAssistantStyle || null,
    admin_notes: adminNotes || null,
    active,
    updated_at: nowIso,
  };

  let rows;
  try {
    rows = await supabaseRestRequest(tables.sentiment, {
      method: "POST",
      body: [
        {
          ...baseRow,
          ...buildLessonActorFields(adminUser),
        },
      ],
      prefer: "return=representation",
      timeout: 12_000,
    });
  } catch (error) {
    if (!isMissingLessonActorColumnsError(error)) throw error;
    rows = await supabaseRestRequest(tables.sentiment, {
      method: "POST",
      body: [baseRow],
      prefer: "return=representation",
      timeout: 12_000,
    });
  }

  return sanitizeLessonRow(Array.isArray(rows) ? rows[0] : {});
};

const updateLessonActive = async (payload, tables, adminUser = {}) => {
  const lessonId = sanitizeId(payload?.lessonId, 120);
  if (!lessonId) throw new Error("lessonId is required.");

  const basePatch = {
    active: Boolean(payload?.active),
    updated_at: new Date().toISOString(),
  };

  let rows;
  try {
    rows = await supabaseRestRequest(`${tables.sentiment}?id=eq.${encodeURIComponent(lessonId)}`, {
      method: "PATCH",
      body: {
        ...basePatch,
        ...buildLessonUpdaterFields(adminUser),
      },
      prefer: "return=representation",
      timeout: 12_000,
    });
  } catch (error) {
    if (!isMissingLessonActorColumnsError(error)) throw error;
    rows = await supabaseRestRequest(`${tables.sentiment}?id=eq.${encodeURIComponent(lessonId)}`, {
      method: "PATCH",
      body: basePatch,
      prefer: "return=representation",
      timeout: 12_000,
    });
  }

  return sanitizeLessonRow(Array.isArray(rows) ? rows[0] : {});
};

const deleteLesson = async (payload, tables) => {
  const lessonId = sanitizeId(payload?.lessonId, 120);
  if (!lessonId) throw new Error("lessonId is required.");

  await supabaseRestRequest(`${tables.sentiment}?id=eq.${encodeURIComponent(lessonId)}`, {
    method: "DELETE",
    prefer: "return=minimal",
    timeout: 12_000,
  });

  return { lessonId };
};

const getAdminActivity = async (payload, tables, adminUser = {}) => {
  if (!adminUser?.isSuperAdmin) {
    const error = new Error("Superadmin access required.");
    error.statusCode = 403;
    throw error;
  }

  const limit = Math.max(1, Math.min(250, Number(payload?.limit) || 50));
  const rows = await supabaseRestRequest(tables.activity, {
    query: {
      select: "id,event_type,actor_id,actor_email,actor_name,auth_mode,message,details,created_at",
      order: "created_at.desc",
      limit: String(limit),
      ...buildActorNameFilter(payload?.actorName),
      ...buildCreatedAtFilter({
        startAt: payload?.startAt,
        endAt: payload?.endAt,
      }),
    },
    timeout: 12_000,
  });

  return Array.isArray(rows) ? rows.map(sanitizeAdminsOlsActivityRow) : [];
};

const getLessonEntries = async (payload, tables, adminUser = {}) => {
  if (!adminUser?.isSuperAdmin) {
    const error = new Error("Superadmin access required.");
    error.statusCode = 403;
    throw error;
  }

  const limit = Math.max(1, Math.min(250, Number(payload?.limit) || 100));
  const filteredQuery = {
    select: LESSON_SELECT_WITH_ACTOR,
    order: "created_at.desc",
    limit: String(limit),
    ...buildLessonActorFilter(payload?.actorName),
    ...buildCreatedAtFilter({
      startAt: payload?.startAt,
      endAt: payload?.endAt,
    }),
  };

  try {
    const rows = await supabaseRestRequest(tables.sentiment, {
      query: filteredQuery,
      timeout: 12_000,
    });
    return Array.isArray(rows) ? rows.map(sanitizeLessonRow) : [];
  } catch (error) {
    if (!isMissingLessonActorColumnsError(error)) throw error;

    const rows = await supabaseRestRequest(tables.sentiment, {
      query: {
        select: LESSON_SELECT_BASE,
        order: "created_at.desc",
        limit: String(limit),
        ...buildCreatedAtFilter({
          startAt: payload?.startAt,
          endAt: payload?.endAt,
        }),
      },
      timeout: 12_000,
    });
    return Array.isArray(rows) ? rows.map(sanitizeLessonRow) : [];
  }
};

const getGuestJourneyEvents = async (payload, tables) => {
  const limit = Math.max(1, Math.min(250, Number(payload?.limit) || 80));
  const rows = await supabaseRestRequest(tables.guestCityClicks, {
    query: {
      select:
        "id,session_id,event_type,city,listing_id,listing_title,destination_path,source_section,source_label,pathname,page_type,source_origin,created_at",
      order: "created_at.desc",
      limit: String(limit),
      ...buildGuestJourneyFilters(payload),
    },
    timeout: 12_000,
  });

  return Array.isArray(rows) ? rows.map(sanitizeGuestJourneyRow) : [];
};

const upsertAdminReplySession = async ({ tables, sessionId, pageContext = {} }) => {
  const nowIso = new Date().toISOString();

  await supabaseRestRequest(`${tables.sessions}?on_conflict=session_id`, {
    method: "POST",
    body: [
      {
        session_id: sessionId,
        page_type: sanitizeString(pageContext?.pageType, 80) || null,
        city: sanitizeString(pageContext?.city, 120) || null,
        listing_id: sanitizeString(pageContext?.listingId, 120) || null,
        pathname: sanitizeString(pageContext?.pathname, 240) || null,
        last_seen_at: nowIso,
      },
    ],
    prefer: "resolution=merge-duplicates,return=minimal",
    timeout: 12_000,
  });
};

const createAdminReply = async (payload, tables, adminUser = {}) => {
  const sessionId = sanitizeId(payload?.sessionId, 120);
  const content = sanitizeString(payload?.content, 3000);
  const pageContext = {
    pageType: sanitizeString(payload?.pageContext?.pageType, 80),
    city: sanitizeString(payload?.pageContext?.city, 120),
    listingId: sanitizeString(payload?.pageContext?.listingId, 120),
    pathname: sanitizeString(payload?.pageContext?.pathname, 240),
  };

  if (!sessionId) throw new Error("sessionId is required.");
  if (!content) throw new Error("Reply content is required.");

  const nowIso = new Date().toISOString();
  const adminName = sanitizeString(adminUser?.fullName || adminUser?.name, 160);
  const adminEmail = sanitizeString(adminUser?.email, 160);
  const twilioDelivery = isWhatsAppSessionId(sessionId)
    ? await sendWhatsAppAdminReply({
        sessionId,
        content,
      })
    : isSmsSessionId(sessionId)
      ? await sendSmsAdminReply({
          sessionId,
          content,
        })
    : null;
  const rows = await supabaseRestRequest(tables.messages, {
    method: "POST",
    body: [
      {
        session_id: sessionId,
        message_id: `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        content,
        cards: null,
        metadata: {
          pageType: pageContext.pageType || null,
          city: pageContext.city || null,
          listingId: pageContext.listingId || null,
          responseMode: "admin_reply",
          responseModel: "human_admin",
          senderType: "admin",
          senderName: adminName || null,
          senderEmail: adminEmail || null,
          channel: isWhatsAppSessionId(sessionId) ? "whatsapp" : isSmsSessionId(sessionId) ? "sms" : "web",
          twilioMessageSid: twilioDelivery?.sid || null,
          twilioStatus: twilioDelivery?.status || null,
          twilioTo: twilioDelivery?.to || null,
          twilioFrom: twilioDelivery?.from || null,
        },
        created_at: nowIso,
      },
    ],
    prefer: "return=representation",
    timeout: 12_000,
  });

  await upsertAdminReplySession({ tables, sessionId, pageContext });

  return sanitizeConversationMessageRow(Array.isArray(rows) ? rows[0] : {});
};

const updateAccountSettings = async (payload = {}, adminAccess = {}) => {
  if (adminAccess?.mode !== "supabase_auth") {
    const error = new Error("Account updates require signing in with email/password.");
    error.statusCode = 403;
    throw error;
  }

  const accessToken = sanitizeString(adminAccess?.accessToken, 4000);
  const fullName = sanitizeString(payload?.fullName, 160);
  const currentPassword = String(payload?.currentPassword || "");
  const newPassword = String(payload?.newPassword || "");
  const confirmPassword = String(payload?.confirmPassword || "");
  const shouldUpdatePassword = Boolean(newPassword || confirmPassword || currentPassword);
  const shouldUpdateProfile = Boolean(fullName);
  const email = sanitizeString(adminAccess?.user?.email, 320).toLowerCase();

  if (!shouldUpdateProfile && !shouldUpdatePassword) {
    throw new Error("No account changes were provided.");
  }

  if (shouldUpdatePassword) {
    if (!email) throw new Error("Unable to verify your current account email.");
    if (!currentPassword) throw new Error("Current password is required.");
    if (!newPassword) throw new Error("New password is required.");
    if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
    if (newPassword !== confirmPassword) {
      throw new Error("New password and confirmation do not match.");
    }

    await verifyAdminsOlsPassword({
      email,
      password: currentPassword,
    });
  }

  const user = await updateAdminsOlsUserAccount({
    accessToken,
    fullName: shouldUpdateProfile ? fullName : "",
    password: shouldUpdatePassword ? newPassword : "",
  });

  return {
    user,
    profileUpdated: shouldUpdateProfile,
    passwordUpdated: shouldUpdatePassword,
  };
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: getAdminHeaders(event), body: "" };
  }

  const tables = getTables();

  try {
    const adminAccess = await verifyAdminsOlsAccess(event);

    if (event.httpMethod === "GET") {
      return jsonResponse(
        200,
        { ok: true, currentAdmin: adminAccess.user, ...(await getDashboardData(tables, adminAccess.user)) },
        event,
      );
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" }, event);
    }

    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return jsonResponse(400, { error: "Invalid JSON body" }, event);
    }

    const action = sanitizeString(payload?.action, 60).toLowerCase();
    if (action === "create_lesson") {
      const lesson = await createLesson(payload, tables, adminAccess.user);
      await safeLogAdminsOlsActivity({
        event,
        actor: adminAccess.user,
        authMode: adminAccess.mode,
        eventType: "lesson_created",
        message: `Created sentiment lesson "${lesson.title}".`,
        details: {
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          sentimentLabel: lesson.sentimentLabel,
        },
      });
      return jsonResponse(200, { ok: true, lesson }, event);
    }

    if (action === "set_lesson_active") {
      const lesson = await updateLessonActive(payload, tables, adminAccess.user);
      await safeLogAdminsOlsActivity({
        event,
        actor: adminAccess.user,
        authMode: adminAccess.mode,
        eventType: lesson.active ? "lesson_activated" : "lesson_deactivated",
        message: `${lesson.active ? "Activated" : "Deactivated"} sentiment lesson "${lesson.title}".`,
        details: {
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          sentimentLabel: lesson.sentimentLabel,
        },
      });
      return jsonResponse(200, { ok: true, lesson }, event);
    }

    if (action === "delete_lesson") {
      const result = await deleteLesson(payload, tables);
      await safeLogAdminsOlsActivity({
        event,
        actor: adminAccess.user,
        authMode: adminAccess.mode,
        eventType: "lesson_deleted",
        message: "Deleted a sentiment lesson.",
        details: {
          lessonId: result.lessonId,
        },
      });
      return jsonResponse(200, { ok: true, ...result }, event);
    }

    if (action === "send_reply") {
      const message = await createAdminReply(payload, tables, adminAccess.user);
      await safeLogAdminsOlsActivity({
        event,
        actor: adminAccess.user,
        authMode: adminAccess.mode,
        eventType: "conversation_reply",
        message: "Sent an admin reply to a guest conversation.",
        details: {
          sessionId: message.sessionId,
          city: message?.metadata?.city,
          pageType: message?.metadata?.pageType,
          listingId: message?.metadata?.listingId,
        },
      });
      return jsonResponse(
        200,
        { ok: true, message },
        event,
      );
    }

    if (action === "start_voice_call") {
      const call = await startTwilioVoiceCall({
        event,
        sessionId: payload?.sessionId,
        agentPhoneNumber: payload?.agentPhoneNumber,
      });
      await safeLogAdminsOlsActivity({
        event,
        actor: adminAccess.user,
        authMode: adminAccess.mode,
        eventType: "voice_call_started",
        message: "Started a Twilio voice call from the executive WhatsApp inbox.",
        details: {
          sessionId: payload?.sessionId || "",
          guestNumber: call.guestNumber,
          agentNumber: call.agentNumber,
          twilioCallSid: call.sid,
        },
      });
      return jsonResponse(200, { ok: true, call }, event);
    }

    if (action === "summarize_conversation") {
      const summary = await summarizeConversationForAdmin(payload, tables, adminAccess.user);
      return jsonResponse(
        200,
        { ok: true, currentAdmin: adminAccess.user, ...summary },
        event,
      );
    }

    if (action === "update_account") {
      const account = await updateAccountSettings(payload, adminAccess);
      const accountEventType =
        account.profileUpdated && account.passwordUpdated
          ? "account_updated"
          : account.passwordUpdated
            ? "password_updated"
            : "profile_updated";

      await safeLogAdminsOlsActivity({
        event,
        actor: account.user,
        authMode: adminAccess.mode,
        eventType: accountEventType,
        message: account.passwordUpdated
          ? "Updated admin account profile and password."
          : "Updated admin account profile.",
        details: {
          profileUpdated: account.profileUpdated,
          passwordUpdated: account.passwordUpdated,
        },
      });

      return jsonResponse(
        200,
        {
          ok: true,
          currentAdmin: account.user,
          account,
        },
        event,
      );
    }

    if (action === "get_admin_activity") {
      return jsonResponse(
        200,
        {
          ok: true,
          currentAdmin: adminAccess.user,
          activity: await getAdminActivity(payload, tables, adminAccess.user),
          lessonEntries: await getLessonEntries(payload, tables, adminAccess.user),
        },
        event,
      );
    }

    if (action === "get_guest_journey_events") {
      if (!adminAccess?.user?.isSuperAdmin) {
        const error = new Error("Superadmin access required.");
        error.statusCode = 403;
        throw error;
      }
      return jsonResponse(
        200,
        {
          ok: true,
          currentAdmin: adminAccess.user,
          events: await getGuestJourneyEvents(payload, tables),
        },
        event,
      );
    }

    if (action === "log_activity") {
      await safeLogAdminsOlsActivity({
        event,
        actor: adminAccess.user,
        authMode: adminAccess.mode,
        eventType: sanitizeString(payload?.eventType, 80).toLowerCase() || "activity",
        message: sanitizeString(payload?.message, 400),
        details: payload?.details,
      });
      return jsonResponse(200, { ok: true }, event);
    }

    if (action === "invite_admin") {
      const invite = await inviteAdminUser(payload, adminAccess.user, event);
      await safeLogAdminsOlsActivity({
        event,
        actor: adminAccess.user,
        authMode: adminAccess.mode,
        eventType: invite.inviteSent ? "admin_invited" : "admin_invite_link_generated",
        message: invite.inviteSent
          ? `Invited ${invite.email} to join the admin panel.`
          : `Generated an admin invite link for ${invite.email}.`,
        details: {
          invitedEmail: invite.email,
          invitedRole: invite.role,
          redirectTo: invite.redirectTo,
          inviteSent: invite.inviteSent,
        },
      });
      return jsonResponse(200, { ok: true, invite }, event);
    }

    return jsonResponse(400, { error: "Unsupported action" }, event);
  } catch (error) {
    const statusCode = Number(error?.statusCode);
    return jsonResponse(
      statusCode >= 400 && statusCode < 600 ? statusCode : 500,
      { error: sanitizeString(error?.message || "Admin request failed", 500) },
      event,
    );
  }
}
