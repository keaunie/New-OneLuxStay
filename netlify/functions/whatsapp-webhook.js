import crypto from "node:crypto";
import { handler as chatHandler } from "./chat.js";
import { handler as chatLearningHandler } from "./chat-learning.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";
import { normalizePhoneNumber, normalizeWhatsAppAddress, resolveSender } from "./_shared/twilioSenderResolver.js";

const DEFAULT_PUBLIC_SITE_URL = "https://oneluxstayprop.netlify.app";
const DEFAULT_PAGE_CONTEXT = {
  pathname: "/executive-ols",
  search: "",
  pageType: "whatsapp",
  city: "",
  listingId: "",
  title: "OneLuxStay Messaging Concierge",
};
const MAX_HISTORY_MESSAGES = 10;
const PAUSED_AI_MODES = new Set(["human", "paused", "closed"]);

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const sanitizeString = (value = "", maxLength = 3000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeWhatsappText = (value = "", maxLength = 3000) =>
  String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);

const sanitizeId = (value = "", maxLength = 120) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
    .slice(0, maxLength);

const getHeaderValue = (event = {}, targetName = "") => {
  const target = String(targetName || "").toLowerCase();

  for (const [key, value] of Object.entries(event.headers || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }

  for (const [key, value] of Object.entries(event.multiValueHeaders || {})) {
    if (String(key).toLowerCase() !== target) continue;
    return Array.isArray(value) ? String(value[0] || "") : String(value || "");
  }

  return "";
};

const parseFormBody = (event = {}) => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : String(event.body || "");

  return new URLSearchParams(rawBody);
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

const buildTwimlMessage = (message = "") =>
  xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(message)}</Message></Response>`);

const getChannelFromAddress = (from = "") => (/^whatsapp:/i.test(String(from || "").trim()) ? "whatsapp" : "sms");

const isSmsRoute = (event = {}) => {
  const path = sanitizeString(event?.path || event?.rawUrl || "", 500).toLowerCase();
  return path.includes("/api/sms");
};

const buildSessionId = (from = "", channel = "whatsapp") => {
  const digits = String(from || "").replace(/[^\d+]/g, "");
  const prefix = channel === "sms" ? "sms" : "whatsapp";
  return sanitizeId(`${prefix}:${digits || "guest"}`, 80);
};

const getPublicSiteUrl = () =>
  sanitizeString(
    getEnv("PUBLIC_SITE_URL") || getEnv("URL") || getEnv("DEPLOY_PRIME_URL") || DEFAULT_PUBLIC_SITE_URL,
    240,
  ).replace(/\/+$/, "");

const getRequestBaseUrl = (event = {}) => {
  const proto = sanitizeString(
    getHeaderValue(event, "x-forwarded-proto") || getHeaderValue(event, "x-forwarded-protocol") || "https",
    12,
  );
  const host = sanitizeString(
    getHeaderValue(event, "x-forwarded-host") || getHeaderValue(event, "host"),
    240,
  );

  if (proto && host) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  return getPublicSiteUrl();
};

const buildSignatureCandidates = (event = {}) => {
  const baseUrl = getRequestBaseUrl(event);
  const publicSiteUrl = getPublicSiteUrl();
  const eventPath = sanitizeString(event.path || "", 240);
  const rawUrl = sanitizeString(event.rawUrl || "", 500);

  return [
    rawUrl,
    `${baseUrl}${eventPath}`,
    `${publicSiteUrl}${eventPath}`,
    `${baseUrl}/api/whatsapp`,
    `${publicSiteUrl}/api/whatsapp`,
    `${baseUrl}/api/sms`,
    `${publicSiteUrl}/api/sms`,
    `${baseUrl}/.netlify/functions/whatsapp-webhook`,
    `${publicSiteUrl}/.netlify/functions/whatsapp-webhook`,
  ]
    .map((value) => String(value || "").trim().replace(/\/+$/, ""))
    .filter(Boolean);
};

const isValidTwilioSignature = ({ event, params, authToken }) => {
  const signature = sanitizeString(getHeaderValue(event, "x-twilio-signature"), 400);
  if (!signature || !authToken) return false;

  const entries = [...params.entries()].sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  return buildSignatureCandidates(event).some((candidateUrl) => {
    const payload = entries.reduce((combined, [key, value]) => combined + key + value, candidateUrl);
    const expected = crypto.createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  });
};

const buildInternalAiEvent = (event, body, sourceOrigin = "") => ({
  httpMethod: "POST",
  headers: {
    origin: getPublicSiteUrl(),
    "x-source-origin": sanitizeString(sourceOrigin, 240),
    "user-agent": "OneLuxStayWhatsAppBridge/1.0",
    "x-forwarded-for":
      getHeaderValue(event, "x-nf-client-connection-ip") ||
      getHeaderValue(event, "x-forwarded-for") ||
      getHeaderValue(event, "x-real-ip") ||
      "127.0.0.1",
  },
  body: JSON.stringify(body),
});

const parseJsonBody = (response = {}) => {
  try {
    return response?.body ? JSON.parse(response.body) : {};
  } catch {
    return {};
  }
};

const buildAssistantReply = ({ reply = "", cards = [], quickReplies = [] } = {}) => {
  const sections = [];
  const normalizedReply = sanitizeString(reply, 2400);
  if (normalizedReply) sections.push(normalizedReply);

  const cardLines = Array.isArray(cards)
    ? cards
        .map((card) => {
          const title = sanitizeString(card?.title, 120);
          const url = sanitizeString(card?.url, 500);
          if (!url) return "";
          return title ? `- ${title}: ${url}` : `- ${url}`;
        })
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (cardLines.length) {
    sections.push(["Helpful links:", ...cardLines].join("\n"));
  }

  const quickReplyLines = Array.isArray(quickReplies)
    ? quickReplies
        .map((item) => sanitizeString(item?.message || item?.label, 200))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  if (quickReplyLines.length) {
    sections.push(["You can also reply with:", ...quickReplyLines.map((line) => `- ${line}`)].join("\n"));
  }

  return sanitizeWhatsappText(sections.join("\n\n"), 3000);
};

const buildWelcomeMessage = () =>
  "Hi, I'm Lucy from OneLuxStay. Send your travel dates and guest count for availability, or send your reservation code and I can check booking status.";

const normalizeConversationMode = (value = "") => {
  const normalized = sanitizeString(value, 20).toLowerCase();
  if (normalized === "human") return "human";
  if (normalized === "paused") return "paused";
  if (normalized === "closed") return "closed";
  return "ai";
};

const getChatSessionsTable = () =>
  sanitizeId(getEnv("SUPABASE_CHAT_SESSIONS_TABLE") || "chat_sessions", 120) || "chat_sessions";

const fetchConversationControlState = async (sessionId = "") => {
  if (!sessionId) {
    return {
      mode: "ai",
      assignedAdminId: "",
      assignedAdminName: "",
      humanTakenOverAt: "",
    };
  }

  try {
    const rows = await supabaseRestRequest(getChatSessionsTable(), {
      query: {
        select:
          "session_id,conversation_mode,assigned_admin_id,assigned_admin_name,human_taken_over_at",
        session_id: `eq.${sessionId}`,
        limit: "1",
      },
      timeout: 12_000,
    });
    const row = Array.isArray(rows) ? rows[0] : null;

    return {
      mode: normalizeConversationMode(row?.conversation_mode),
      assignedAdminId: sanitizeId(row?.assigned_admin_id, 120),
      assignedAdminName: sanitizeString(row?.assigned_admin_name, 160),
      humanTakenOverAt: sanitizeString(row?.human_taken_over_at, 80),
    };
  } catch (error) {
    console.warn("Failed to resolve conversation mode; defaulting to AI mode", {
      sessionId,
      message: error?.message || String(error),
    });
    return {
      mode: "ai",
      assignedAdminId: "",
      assignedAdminName: "",
      humanTakenOverAt: "",
    };
  }
};

const buildInboundGuestMessage = ({
  inboundMessageId = "",
  incomingMessage = "",
  profileName = "",
  channel = "whatsapp",
  resolvedSender = {},
  senderFrom = "",
  senderTo = "",
}) => ({
  id: inboundMessageId || undefined,
  role: "user",
  content: incomingMessage,
  senderType: "guest",
  senderName: profileName || (channel === "sms" ? "SMS guest" : "WhatsApp guest"),
  channel,
  senderRegion: sanitizeString(resolvedSender?.region, 20).toLowerCase() || "us",
  senderChannel: channel,
  senderFrom: senderTo,
  senderTo: senderFrom,
  inboundFrom: senderTo,
  inboundTo: senderFrom,
  twilio_to_number: senderFrom,
});

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><Response />');
  }

  if (event.httpMethod !== "POST") {
    return buildTwimlMessage("This endpoint accepts POST requests from Twilio Messaging.");
  }

  const params = parseFormBody(event);
  const channelFromPayload = getChannelFromAddress(sanitizeString(params.get("From"), 80));
  const smsRequest = isSmsRoute(event) || channelFromPayload === "sms";
  const authToken = sanitizeString(
    smsRequest
      ? getEnv("TWILIO_SMS_AUTH_TOKEN") || getEnv("TWILIO_AUTH_TOKEN")
      : getEnv("TWILIO_WHATSAPP_AUTH_TOKEN") || getEnv("TWILIO_AUTH_TOKEN"),
    200,
  );

  const signatureValid = authToken ? isValidTwilioSignature({ event, params, authToken }) : true;
  if (smsRequest) {
    console.info("Inbound SMS signature check", {
      valid: signatureValid,
      hasToken: Boolean(authToken),
      hasSignatureHeader: Boolean(getHeaderValue(event, "x-twilio-signature")),
    });
  }

  if (!signatureValid) {
    return buildTwimlMessage("The WhatsApp request could not be verified.");
  }

  const incomingMessage = sanitizeString(params.get("Body"), 1600);
  const from = sanitizeString(params.get("From"), 80);
  const to = sanitizeString(params.get("To"), 80);
  const messageSid = sanitizeString(params.get("MessageSid"), 120);
  const profileName = sanitizeString(params.get("ProfileName"), 160);
  const channel = getChannelFromAddress(from);
  const resolvedSender = resolveSender({
    channel,
    inboundNumber: to,
    getEnv,
  });
  const senderFrom =
    channel === "sms"
      ? normalizePhoneNumber(resolvedSender?.from || to)
      : normalizeWhatsAppAddress(resolvedSender?.from || to);
  const senderTo =
    channel === "sms"
      ? normalizePhoneNumber(from)
      : normalizeWhatsAppAddress(from);
  const sourceOrigin = `twilio_${channel}_${sanitizeString(resolvedSender?.region, 20).toLowerCase() || "us"}`;
  const chatSessionId = buildSessionId(from, channel);
  const inboundMessageId = messageSid ? sanitizeId(`twilio-in-${messageSid}`, 120) : "";
  const pageContext = {
    ...DEFAULT_PAGE_CONTEXT,
    pageType: channel,
    city: sanitizeString(resolvedSender?.region, 20).toLowerCase() === "be" ? "Belgium" : "",
    title: profileName
      ? `OneLuxStay ${channel === "sms" ? "SMS" : "WhatsApp"} Concierge (${profileName})`
      : `OneLuxStay ${channel === "sms" ? "SMS" : "WhatsApp"} Concierge`,
  };
  const inboundGuestMessage = buildInboundGuestMessage({
    inboundMessageId,
    incomingMessage,
    profileName,
    channel,
    resolvedSender,
    senderFrom,
    senderTo,
  });

  if (!incomingMessage) {
    return buildTwimlMessage(buildWelcomeMessage());
  }

  if (channel === "sms") {
    console.info("Inbound SMS received", {
      from,
      to,
      sessionId: chatSessionId,
      messageSid,
    });
  }

  try {
    const conversationControl = await fetchConversationControlState(chatSessionId);
    if (PAUSED_AI_MODES.has(conversationControl.mode)) {
      console.info("Inbound message captured with AI paused", {
        channel,
        from,
        to,
        sessionId: chatSessionId,
        messageSid,
        conversationMode: conversationControl.mode,
        assignedAdminId: conversationControl.assignedAdminId || null,
        assignedAdminName: conversationControl.assignedAdminName || null,
      });

      try {
        await chatLearningHandler(
          buildInternalAiEvent(
            event,
            {
              action: "turn",
              chatSessionId,
              pageContext,
              responseMode: `handoff_${conversationControl.mode}`,
              responseModel: "human_handoff",
              userMessage: inboundGuestMessage,
            },
            sourceOrigin,
          ),
        );
      } catch (storeError) {
        console.warn("Human-handoff inbound persistence failed", {
          channel,
          sessionId: chatSessionId,
          messageSid,
          message: storeError?.message || String(storeError),
        });
      }

      const assignedName = sanitizeString(conversationControl.assignedAdminName, 120);
      return buildTwimlMessage(
        assignedName
          ? `Thanks for your message. ${assignedName} from OneLuxStay is handling this conversation and will reply shortly.`
          : "Thanks for your message. A OneLuxStay specialist is handling this conversation and will reply shortly.",
      );
    }

    if (channel === "sms") {
      try {
        const preStoreResponse = await chatLearningHandler(
          buildInternalAiEvent(
            event,
            {
              action: "turn",
              chatSessionId,
              pageContext,
              responseMode: "live",
              responseModel: "twilio_inbound_pre_store",
              userMessage: inboundGuestMessage,
            },
            sourceOrigin,
          ),
        );
        const preStorePayload = parseJsonBody(preStoreResponse);
        console.info("Inbound SMS pre-store result", {
          sessionId: chatSessionId,
          messageSid,
          ok: Boolean(preStorePayload?.ok),
          statusCode: Number(preStoreResponse?.statusCode) || 0,
        });
      } catch (preStoreError) {
        console.warn("Inbound SMS pre-store failed", {
          sessionId: chatSessionId,
          messageSid,
          message: preStoreError?.message || String(preStoreError),
        });
      }
    }

    const syncResponse = await chatLearningHandler(
      buildInternalAiEvent(event, {
        action: "sync",
        chatSessionId,
        pageContext,
        limit: MAX_HISTORY_MESSAGES,
      }, sourceOrigin),
    );
    const syncedPayload = parseJsonBody(syncResponse);
    const syncedMessages = Array.isArray(syncedPayload?.messages) ? syncedPayload.messages : [];

    const messages = [
      ...syncedMessages
        .map((message) => ({
          role: message?.role === "assistant" ? "assistant" : "user",
          content: sanitizeString(message?.content, 1200),
        }))
        .filter((message) => message.content)
        .slice(-MAX_HISTORY_MESSAGES + 1),
      { role: "user", content: incomingMessage },
    ];

    const chatResponse = await chatHandler(
      buildInternalAiEvent(event, {
        chatSessionId,
        pageContext,
        messages,
      }, sourceOrigin),
    );
    const chatPayload = parseJsonBody(chatResponse);
    const assistantReply = buildAssistantReply({
      reply: chatPayload?.reply,
      cards: chatPayload?.cards,
      quickReplies: chatPayload?.quickReplies,
    });

    if (!assistantReply) {
      throw new Error(chatPayload?.error || "Empty WhatsApp assistant reply");
    }

    await chatLearningHandler(
      buildInternalAiEvent(event, {
        action: "turn",
        chatSessionId,
        pageContext,
        responseMode: sanitizeString(chatPayload?.mode, 40) || "live",
        responseModel: sanitizeString(chatPayload?.model, 120),
        userMessage: inboundGuestMessage,
        assistantMessage: {
          role: "assistant",
          content: assistantReply,
          senderType: "assistant",
          senderName: "Lucy",
          channel,
          senderRegion: sanitizeString(resolvedSender?.region, 20).toLowerCase() || "us",
          senderChannel: channel,
          senderFrom,
          senderTo,
          inboundFrom: senderTo,
          inboundTo: senderFrom,
          twilio_to_number: senderFrom,
        },
      }, sourceOrigin),
    );

    return buildTwimlMessage(assistantReply);
  } catch (error) {
    console.warn("WhatsApp webhook failed", {
      message: error?.message || String(error),
      from,
      to,
      chatSessionId,
    });
    return buildTwimlMessage(
      "I hit a temporary issue reaching Lucy right now. Please try again in a moment, or email reservations@oneluxstay.com for immediate help.",
    );
  }
}
